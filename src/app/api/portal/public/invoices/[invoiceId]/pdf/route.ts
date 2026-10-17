import { NextRequest, NextResponse } from 'next/server'

import { readPortalTokenHeader, verifyPortalShareToken } from '@/lib/portal/share-token'
import { loadClientPortalInvoice } from '@/lib/domain/client-portal/repository'
import * as invoicePdf from '@/lib/reports/invoice-pdf'

const PRIVATE_HEADERS = {
  'Cache-Control': 'private, no-store',
  'Referrer-Policy': 'no-referrer',
}

function privateJson(error: string, status: number) {
  return NextResponse.json({ error }, { status, headers: PRIVATE_HEADERS })
}

function safeFilenamePart(value: string): string {
  return value
    .trim()
    .replace(/[^A-Za-z0-9._-]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .slice(0, 80) || 'invoice'
}

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ invoiceId: string }> },
) {
  const token = readPortalTokenHeader(request.headers)
  if (!token) return privateJson('Portal access token is required.', 401)

  let clientId: string
  try {
    const claims = await verifyPortalShareToken(token)
    clientId = claims.clientId
  } catch {
    return privateJson('Portal link is invalid or expired.', 401)
  }

  const { invoiceId } = await params
  const invoice = await loadClientPortalInvoice(clientId, invoiceId)
  if (!invoice) return privateJson('Invoice not found.', 404)

  try {
    const doc = await invoicePdf.buildInvoicePdf(invoice.id, clientId)
    const buffer = Buffer.from(doc.output('arraybuffer'))
    const date = new Date().toISOString().split('T')[0]
    const filename = `invoice_${safeFilenamePart(invoice.invoiceNumber)}_${date}.pdf`

    return new NextResponse(buffer, {
      status: 200,
      headers: {
        'Content-Type': 'application/pdf',
        'Content-Disposition': `attachment; filename="${filename}"`,
        'Content-Length': String(buffer.length),
        'Cache-Control': 'private, no-store',
        'Referrer-Policy': 'no-referrer',
      },
    })
  } catch (error) {
    console.error('[Portal] Failed to generate invoice PDF:', error)
    return privateJson('Failed to generate invoice PDF.', 500)
  }
}
