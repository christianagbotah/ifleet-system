import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  paymentFindUnique: vi.fn(),
  paymentCreate: vi.fn(),
  txPaymentFindUnique: vi.fn(),
  txPaymentUpdateMany: vi.fn(),
  txPaymentUpdate: vi.fn(),
  txInvoiceFindUnique: vi.fn(),
  txInvoiceUpdate: vi.fn(),
  transaction: vi.fn(),
}))

vi.mock('@/lib/db', () => ({
  db: {
    paymentTransaction: {
      findUnique: mocks.paymentFindUnique,
      create: mocks.paymentCreate,
    },
    $transaction: mocks.transaction,
  },
}))

import { processSuccessfulPaystackCharge } from '@/lib/domain/payments/process-paystack-charge'

const paymentData = (overrides: Record<string, unknown> = {}) => ({
  reference: 'PSK-REF-1',
  amount: 10000,
  status: 'success',
  gateway_response: 'Approved',
  paid_at: '2026-10-23T08:00:00.000Z',
  channel: 'mobile_money',
  currency: 'GHS',
  customer: { email: 'payer@example.com' },
  metadata: { invoiceId: 'invoice-1' },
  ...overrides,
})

const pendingTransaction = (overrides: Record<string, unknown> = {}) => ({
  id: 'payment-1',
  provider: 'paystack',
  reference: 'PSK-REF-1',
  status: 'pending',
  requestedAmount: 100,
  receivedAmount: null,
  appliedAmount: 0,
  unappliedAmount: 0,
  currency: 'GHS',
  invoiceId: 'invoice-1',
  channel: null,
  customerEmail: 'payer@example.com',
  paidAt: null,
  processedAt: null,
  gatewayResponse: null,
  lastError: null,
  ...overrides,
})

describe('processSuccessfulPaystackCharge', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.transaction.mockImplementation(async (callback: (tx: unknown) => unknown) => callback({
      paymentTransaction: {
        findUnique: mocks.txPaymentFindUnique,
        updateMany: mocks.txPaymentUpdateMany,
        update: mocks.txPaymentUpdate,
      },
      invoice: {
        findUnique: mocks.txInvoiceFindUnique,
        update: mocks.txInvoiceUpdate,
      },
    }))
    mocks.txPaymentUpdateMany.mockResolvedValue({ count: 1 })
  })

  it('applies a registered successful charge exactly once and marks a remaining balance partially paid', async () => {
    mocks.paymentFindUnique.mockResolvedValue(pendingTransaction())
    mocks.txPaymentFindUnique.mockResolvedValue(pendingTransaction())
    mocks.txInvoiceFindUnique.mockResolvedValue({ id: 'invoice-1', totalAmount: 200, paidAmount: 50, status: 'sent' })
    mocks.txInvoiceUpdate.mockResolvedValue({})
    mocks.txPaymentUpdate.mockResolvedValue({})

    const result = await processSuccessfulPaystackCharge(paymentData(), 'webhook')

    expect(mocks.txInvoiceUpdate).toHaveBeenCalledWith({
      where: { id: 'invoice-1' },
      data: { paidAmount: 150, status: 'partially_paid' },
    })
    expect(mocks.txPaymentUpdate).toHaveBeenCalledWith(expect.objectContaining({
      where: { id: 'payment-1' },
      data: expect.objectContaining({ status: 'applied', receivedAmount: 100, appliedAmount: 100, unappliedAmount: 0 }),
    }))
    expect(result).toMatchObject({ status: 'applied', alreadyProcessed: false, appliedAmount: 100, unappliedAmount: 0 })
  })

  it('returns an already-processed result without mutating the invoice on a duplicate callback', async () => {
    mocks.paymentFindUnique.mockResolvedValue(pendingTransaction({
      status: 'applied', receivedAmount: 100, appliedAmount: 100, unappliedAmount: 0,
    }))

    const result = await processSuccessfulPaystackCharge(paymentData(), 'verify')

    expect(mocks.transaction).not.toHaveBeenCalled()
    expect(result).toMatchObject({ status: 'applied', alreadyProcessed: true, appliedAmount: 100 })
  })

  it('quarantines a provider amount mismatch without touching the invoice', async () => {
    mocks.paymentFindUnique.mockResolvedValue(pendingTransaction())
    mocks.txPaymentFindUnique.mockResolvedValue(pendingTransaction())
    mocks.txPaymentUpdate.mockResolvedValue({})

    const result = await processSuccessfulPaystackCharge(paymentData({ amount: 9000 }), 'webhook')

    expect(mocks.txInvoiceUpdate).not.toHaveBeenCalled()
    expect(mocks.txPaymentUpdate).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ status: 'review_required', receivedAmount: 90, appliedAmount: 0, unappliedAmount: 90 }),
    }))
    expect(result).toMatchObject({ status: 'review_required', appliedAmount: 0, unappliedAmount: 90 })
  })


  it('records an unknown successful provider reference for review without changing an invoice', async () => {
    mocks.paymentFindUnique.mockResolvedValue(null)
    mocks.paymentCreate.mockResolvedValue(pendingTransaction({
      status: 'review_required',
      requestedAmount: 0,
      receivedAmount: 100,
      appliedAmount: 0,
      unappliedAmount: 100,
      lastError: 'Successful Paystack reference was not initialized by Fleetivo.',
    }))

    const result = await processSuccessfulPaystackCharge(paymentData(), 'webhook')

    expect(mocks.paymentCreate).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ provider: 'paystack', reference: 'PSK-REF-1', status: 'review_required' }),
    }))
    expect(mocks.transaction).not.toHaveBeenCalled()
    expect(result).toMatchObject({ status: 'review_required', appliedAmount: 0, unappliedAmount: 100 })
  })

  it('applies only the current outstanding balance and quarantines any excess for review', async () => {
    mocks.paymentFindUnique.mockResolvedValue(pendingTransaction())
    mocks.txPaymentFindUnique.mockResolvedValue(pendingTransaction())
    mocks.txInvoiceFindUnique.mockResolvedValue({ id: 'invoice-1', totalAmount: 100, paidAmount: 50, status: 'partially_paid' })
    mocks.txInvoiceUpdate.mockResolvedValue({})
    mocks.txPaymentUpdate.mockResolvedValue({})

    const result = await processSuccessfulPaystackCharge(paymentData(), 'webhook')

    expect(mocks.txInvoiceUpdate).toHaveBeenCalledWith({
      where: { id: 'invoice-1' },
      data: { paidAmount: 100, status: 'paid' },
    })
    expect(mocks.txPaymentUpdate).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ status: 'review_required', appliedAmount: 50, unappliedAmount: 50 }),
    }))
    expect(result).toMatchObject({ status: 'review_required', appliedAmount: 50, unappliedAmount: 50 })
  })


  it('quarantines a charge if the linked invoice becomes cancelled before payment application', async () => {
    mocks.paymentFindUnique.mockResolvedValue(pendingTransaction())
    mocks.txPaymentFindUnique.mockResolvedValue(pendingTransaction())
    mocks.txInvoiceFindUnique.mockResolvedValue({ id: 'invoice-1', totalAmount: 100, paidAmount: 0, status: 'cancelled' })
    mocks.txPaymentUpdate.mockResolvedValue({})

    const result = await processSuccessfulPaystackCharge(paymentData(), 'webhook')

    expect(mocks.txInvoiceUpdate).not.toHaveBeenCalled()
    expect(mocks.txPaymentUpdate).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ status: 'review_required', appliedAmount: 0, unappliedAmount: 100 }),
    }))
    expect(result).toMatchObject({ status: 'review_required', appliedAmount: 0, unappliedAmount: 100 })
  })

  it('quarantines a successful charge when the linked invoice is already fully paid', async () => {
    mocks.paymentFindUnique.mockResolvedValue(pendingTransaction())
    mocks.txPaymentFindUnique.mockResolvedValue(pendingTransaction())
    mocks.txInvoiceFindUnique.mockResolvedValue({ id: 'invoice-1', totalAmount: 100, paidAmount: 100, status: 'paid' })
    mocks.txPaymentUpdate.mockResolvedValue({})

    const result = await processSuccessfulPaystackCharge(paymentData(), 'verify')

    expect(mocks.txInvoiceUpdate).not.toHaveBeenCalled()
    expect(result).toMatchObject({ status: 'review_required', appliedAmount: 0, unappliedAmount: 100 })
  })
})
