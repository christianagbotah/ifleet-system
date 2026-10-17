// @vitest-environment node
import { NextRequest } from 'next/server'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  loadInvoice: vi.fn(),
  buildInvoicePdf: vi.fn(),
}))

vi.mock('@/lib/jwt-secret', () => ({
  getJwtSecretKey: () => new TextEncoder().encode('portal-invoice-test-secret-at-least-32-characters'),
}))

vi.mock('@/lib/domain/client-portal/repository', () => ({
  loadClientPortalInvoice: mocks.loadInvoice,
}))

vi.mock('@/lib/reports/invoice-pdf', () => ({
  buildInvoicePdf: mocks.buildInvoicePdf,
}))

import { createPortalShareToken } from '@/lib/portal/share-token'
import { GET } from './route'

const context = { params: Promise.resolve({ invoiceId: 'invoice-b' }) }

beforeEach(() => {
  vi.clearAllMocks()
  mocks.loadInvoice.mockResolvedValue(null)
  mocks.buildInvoicePdf.mockResolvedValue({
    output: vi.fn(() => new Uint8Array([37, 80, 68, 70]).buffer),
  })
})

describe('GET /api/portal/public/invoices/[invoiceId]/pdf', () => {
  it('rejects a missing portal token before querying an invoice', async () => {
    const response = await GET(
      new NextRequest('https://ifleetpro.example/api/portal/public/invoices/invoice-b/pdf'),
      context,
    )

    expect(response.status).toBe(401)
    expect(response.headers.get('cache-control')).toBe('private, no-store')
    expect(mocks.loadInvoice).not.toHaveBeenCalled()
    expect(mocks.buildInvoicePdf).not.toHaveBeenCalled()
  })

  it('binds lookup to the client in the token so cross-client invoice ids return not found', async () => {
    const { token } = await createPortalShareToken({ clientId: 'client-a', issuedBy: 'operator-1' })
    const response = await GET(
      new NextRequest('https://ifleetpro.example/api/portal/public/invoices/invoice-b/pdf', {
        headers: { 'x-portal-token': token },
      }),
      context,
    )

    expect(mocks.loadInvoice).toHaveBeenCalledWith('client-a', 'invoice-b')
    expect(response.status).toBe(404)
    expect(mocks.buildInvoicePdf).not.toHaveBeenCalled()
  })

  it('returns a private PDF attachment only after the authorized invoice lookup succeeds', async () => {
    mocks.loadInvoice.mockResolvedValue({ id: 'invoice-b', invoiceNumber: 'INV/2026 001' })
    const { token } = await createPortalShareToken({ clientId: 'client-a', issuedBy: 'operator-1' })

    const response = await GET(
      new NextRequest('https://ifleetpro.example/api/portal/public/invoices/invoice-b/pdf', {
        headers: { 'x-portal-token': token },
      }),
      context,
    )

    expect(response.status).toBe(200)
    expect(response.headers.get('content-type')).toBe('application/pdf')
    expect(response.headers.get('cache-control')).toBe('private, no-store')
    expect(response.headers.get('referrer-policy')).toBe('no-referrer')
    expect(response.headers.get('content-disposition')).toMatch(/^attachment; filename="invoice_INV_2026_001_\d{4}-\d{2}-\d{2}\.pdf"$/)
    expect(mocks.buildInvoicePdf).toHaveBeenCalledWith('invoice-b', 'client-a')
    expect(mocks.loadInvoice.mock.invocationCallOrder[0]).toBeLessThan(mocks.buildInvoicePdf.mock.invocationCallOrder[0])
  })
})
