import { db } from '@/lib/db'
import type { PaymentData } from '@/lib/services/paystack'

type ProcessingSource = 'verify' | 'webhook'
type ApplicationStatus = 'applied' | 'review_required' | 'processing'

export interface PaystackChargeApplicationResult {
  status: ApplicationStatus
  alreadyProcessed: boolean
  appliedAmount: number
  unappliedAmount: number
  reason?: string
}

function money(value: unknown): number {
  const amount = Number(value ?? 0)
  return Number.isFinite(amount) ? Math.round(amount * 100) / 100 : 0
}

function toPesewas(value: unknown): number {
  return Math.round(money(value) * 100)
}

function providerAmountGhs(paymentData: PaymentData): number {
  return Math.round(Number(paymentData.amount || 0)) / 100
}

function resultFromTransaction(transaction: {
  status: string
  appliedAmount: unknown
  unappliedAmount: unknown
  lastError?: string | null
}, alreadyProcessed: boolean): PaystackChargeApplicationResult {
  const status: ApplicationStatus = transaction.status === 'applied'
    ? 'applied'
    : transaction.status === 'review_required'
      ? 'review_required'
      : 'processing'
  return {
    status,
    alreadyProcessed,
    appliedAmount: money(transaction.appliedAmount),
    unappliedAmount: money(transaction.unappliedAmount),
    ...(transaction.lastError ? { reason: transaction.lastError } : {}),
  }
}

async function recordUnknownSuccessfulReference(paymentData: PaymentData, source: ProcessingSource) {
  const receivedAmount = providerAmountGhs(paymentData)
  const reason = 'Successful Paystack reference was not initialized by Fleetivo.'
  try {
    const created = await db.paymentTransaction.create({
      data: {
        provider: 'paystack',
        reference: paymentData.reference,
        providerTransactionId: paymentData.id ? String(paymentData.id) : null,
        status: 'review_required',
        requestedAmount: 0,
        receivedAmount,
        appliedAmount: 0,
        unappliedAmount: receivedAmount,
        currency: paymentData.currency || 'GHS',
        channel: paymentData.channel || null,
        customerEmail: paymentData.customer?.email || null,
        source,
        paidAt: paymentData.paid_at ? new Date(paymentData.paid_at) : null,
        processedAt: new Date(),
        gatewayResponse: paymentData.gateway_response || null,
        lastError: reason,
        providerMetadata: JSON.stringify(paymentData.metadata || {}),
      },
    })
    return resultFromTransaction(created, false)
  } catch {
    const raced = await db.paymentTransaction.findUnique({
      where: { provider_reference: { provider: 'paystack', reference: paymentData.reference } },
    })
    if (raced) return resultFromTransaction(raced, true)
    throw new Error('Unable to record unknown Paystack reference.')
  }
}

export async function processSuccessfulPaystackCharge(
  paymentData: PaymentData,
  source: ProcessingSource,
): Promise<PaystackChargeApplicationResult> {
  if (!paymentData.reference) throw new Error('Paystack payment reference is required.')
  if (paymentData.status !== 'success') throw new Error('Only successful Paystack charges can be applied.')

  const existing = await db.paymentTransaction.findUnique({
    where: { provider_reference: { provider: 'paystack', reference: paymentData.reference } },
  })

  if (!existing) return recordUnknownSuccessfulReference(paymentData, source)
  if (existing.status === 'applied' || existing.status === 'review_required') {
    return resultFromTransaction(existing, true)
  }

  return db.$transaction(async (tx) => {
    const transaction = await tx.paymentTransaction.findUnique({ where: { id: existing.id } })
    if (!transaction) throw new Error('Payment transaction disappeared during processing.')
    if (transaction.status === 'applied' || transaction.status === 'review_required') {
      return resultFromTransaction(transaction, true)
    }
    if (transaction.status === 'processing') {
      return resultFromTransaction(transaction, true)
    }

    const claimed = await tx.paymentTransaction.updateMany({
      where: { id: transaction.id, status: { in: ['pending', 'failed'] } },
      data: { status: 'processing', source },
    })
    if (claimed.count !== 1) {
      const current = await tx.paymentTransaction.findUnique({ where: { id: transaction.id } })
      if (!current) throw new Error('Payment transaction could not be claimed.')
      return resultFromTransaction(current, true)
    }

    const receivedAmount = providerAmountGhs(paymentData)
    const requestedAmount = money(transaction.requestedAmount)
    const mismatchReasons: string[] = []
    if ((paymentData.currency || '').toUpperCase() !== transaction.currency.toUpperCase()) {
      mismatchReasons.push(`currency mismatch: expected ${transaction.currency}, received ${paymentData.currency || 'unknown'}`)
    }
    if (toPesewas(receivedAmount) !== toPesewas(requestedAmount)) {
      mismatchReasons.push(`amount mismatch: expected ${requestedAmount.toFixed(2)}, received ${receivedAmount.toFixed(2)}`)
    }

    const providerInvoiceId = typeof paymentData.metadata?.invoiceId === 'string' ? paymentData.metadata.invoiceId : null
    if (providerInvoiceId && providerInvoiceId !== transaction.invoiceId) {
      mismatchReasons.push('invoice metadata does not match the Fleetivo payment record')
    }
    if (paymentData.metadata?.settlementId) {
      mismatchReasons.push('settlement metadata is not valid for a customer charge')
    }

    const commonData = {
      providerTransactionId: paymentData.id ? String(paymentData.id) : null,
      receivedAmount,
      channel: paymentData.channel || null,
      customerEmail: paymentData.customer?.email || transaction.customerEmail,
      source,
      paidAt: paymentData.paid_at ? new Date(paymentData.paid_at) : new Date(),
      processedAt: new Date(),
      gatewayResponse: paymentData.gateway_response || null,
      providerMetadata: JSON.stringify(paymentData.metadata || {}),
    }

    if (mismatchReasons.length > 0) {
      const reason = mismatchReasons.join('; ')
      await tx.paymentTransaction.update({
        where: { id: transaction.id },
        data: {
          ...commonData,
          status: 'review_required',
          appliedAmount: 0,
          unappliedAmount: receivedAmount,
          lastError: reason,
        },
      })
      return { status: 'review_required', alreadyProcessed: false, appliedAmount: 0, unappliedAmount: receivedAmount, reason }
    }

    if (!transaction.invoiceId) {
      const reason = 'Payment transaction is not linked to an invoice.'
      await tx.paymentTransaction.update({
        where: { id: transaction.id },
        data: { ...commonData, status: 'review_required', appliedAmount: 0, unappliedAmount: receivedAmount, lastError: reason },
      })
      return { status: 'review_required', alreadyProcessed: false, appliedAmount: 0, unappliedAmount: receivedAmount, reason }
    }

    const invoice = await tx.invoice.findUnique({ where: { id: transaction.invoiceId } })
    if (!invoice) {
      const reason = 'Linked invoice no longer exists.'
      await tx.paymentTransaction.update({
        where: { id: transaction.id },
        data: { ...commonData, status: 'review_required', appliedAmount: 0, unappliedAmount: receivedAmount, lastError: reason },
      })
      return { status: 'review_required', alreadyProcessed: false, appliedAmount: 0, unappliedAmount: receivedAmount, reason }
    }

    const payableInvoiceStatuses = new Set(['pending', 'sent', 'partially_paid', 'overdue'])
    if (!payableInvoiceStatuses.has(invoice.status)) {
      const reason = `Linked invoice status \"${invoice.status}\" cannot accept this payment.`
      await tx.paymentTransaction.update({
        where: { id: transaction.id },
        data: { ...commonData, status: 'review_required', appliedAmount: 0, unappliedAmount: receivedAmount, lastError: reason },
      })
      return { status: 'review_required', alreadyProcessed: false, appliedAmount: 0, unappliedAmount: receivedAmount, reason }
    }

    const totalAmount = money(invoice.totalAmount)
    const paidAmount = money(invoice.paidAmount)
    const outstandingAmount = Math.max(0, Math.round((totalAmount - paidAmount) * 100) / 100)
    if (outstandingAmount <= 0 || invoice.status === 'paid') {
      const reason = 'Linked invoice is already fully paid.'
      await tx.paymentTransaction.update({
        where: { id: transaction.id },
        data: { ...commonData, status: 'review_required', appliedAmount: 0, unappliedAmount: receivedAmount, lastError: reason },
      })
      return { status: 'review_required', alreadyProcessed: false, appliedAmount: 0, unappliedAmount: receivedAmount, reason }
    }

    const appliedAmount = Math.min(receivedAmount, outstandingAmount)
    const unappliedAmount = Math.max(0, Math.round((receivedAmount - appliedAmount) * 100) / 100)
    const newPaidAmount = Math.min(totalAmount, Math.round((paidAmount + appliedAmount) * 100) / 100)
    const invoiceStatus = newPaidAmount >= totalAmount ? 'paid' : 'partially_paid'

    await tx.invoice.update({
      where: { id: invoice.id },
      data: { paidAmount: newPaidAmount, status: invoiceStatus },
    })

    const status = unappliedAmount > 0 ? 'review_required' : 'applied'
    await tx.paymentTransaction.update({
      where: { id: transaction.id },
      data: {
        ...commonData,
        status,
        appliedAmount,
        unappliedAmount,
        lastError: unappliedAmount > 0 ? 'Payment exceeded the invoice outstanding balance; excess requires review.' : null,
      },
    })
    return {
      status: status as ApplicationStatus,
      alreadyProcessed: false,
      appliedAmount,
      unappliedAmount,
      ...(unappliedAmount > 0 ? { reason: 'Payment exceeded the invoice outstanding balance; excess requires review.' } : {}),
    }
  }, { isolationLevel: 'Serializable' })
}
