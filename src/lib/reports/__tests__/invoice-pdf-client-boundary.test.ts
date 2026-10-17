import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

const source = readFileSync(join(process.cwd(), 'src/lib/reports/invoice-pdf.ts'), 'utf8')

describe('invoice PDF client boundary', () => {
  it('revalidates the expected portal client inside the PDF generator before rendering', () => {
    const signatureIndex = source.indexOf('buildInvoicePdf(invoiceId: string, expectedClientId?: string)')
    const invoiceLookupIndex = source.indexOf('db.invoice.findUnique')
    const clientBoundaryIndex = source.indexOf('invoice.clientId !== expectedClientId')
    const clientActiveIndex = source.indexOf('!invoice.client.isActive')
    const renderIndex = source.indexOf('const doc = new jsPDF')

    expect(signatureIndex).toBeGreaterThanOrEqual(0)
    expect(invoiceLookupIndex).toBeGreaterThan(signatureIndex)
    expect(clientBoundaryIndex).toBeGreaterThan(invoiceLookupIndex)
    expect(clientActiveIndex).toBeGreaterThan(invoiceLookupIndex)
    expect(renderIndex).toBeGreaterThan(clientBoundaryIndex)
    expect(renderIndex).toBeGreaterThan(clientActiveIndex)
    expect(source).toContain('isActive: true')
  })
})
