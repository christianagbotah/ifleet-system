import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

const routePath = join(
  process.cwd(),
  'src/app/api/portal/public/invoices/[invoiceId]/pdf/route.ts',
)
const routeExists = existsSync(routePath)
const source = routeExists ? readFileSync(routePath, 'utf8') : ''

describe('public portal invoice PDF route contract', () => {
  it('provides a dedicated token-bound invoice PDF route', () => {
    expect(routeExists).toBe(true)
  })

  it('verifies the portal token and client-bound invoice before PDF generation', () => {
    const readTokenIndex = source.indexOf('readPortalTokenHeader(request.headers)')
    const verifyTokenIndex = source.indexOf('verifyActivePortalShareToken(token)')
    const loadInvoiceIndex = source.indexOf('loadClientPortalInvoice(clientId, invoiceId)')
    const buildPdfIndex = source.indexOf('invoicePdf.buildInvoicePdf(invoice.id, clientId)')

    expect(readTokenIndex).toBeGreaterThanOrEqual(0)
    expect(verifyTokenIndex).toBeGreaterThan(readTokenIndex)
    expect(loadInvoiceIndex).toBeGreaterThan(verifyTokenIndex)
    expect(buildPdfIndex).toBeGreaterThan(loadInvoiceIndex)
  })

  it('returns a private no-store PDF attachment rather than redirecting to staff APIs', () => {
    expect(source).toContain("'Content-Type': 'application/pdf'")
    expect(source).toContain("'Cache-Control': 'private, no-store'")
    expect(source).toContain("'Referrer-Policy': 'no-referrer'")
    expect(source).toContain('Content-Disposition')
    expect(source).not.toContain('/api/invoices/')
    expect(source).not.toContain('requireAuth')
  })
})
