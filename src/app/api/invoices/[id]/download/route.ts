import { NextRequest, NextResponse } from 'next/server'
import { requireAuth } from '@/lib/auth-server'
import { db } from '@/lib/db'
import { buildInvoicePdf } from '@/lib/reports/invoice-pdf'

// ============ GET: Generate & download invoice PDF ============
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = requireAuth(request)
  if (auth instanceof NextResponse) return auth

  const { id } = await params

  try {
    // Verify invoice exists
    const invoice = await db.invoice.findUnique({
      where: { id },
      include: { client: true },
    })

    if (!invoice) {
      return NextResponse.json({ error: 'Invoice not found' }, { status: 404 })
    }

    // Drivers can only access invoices for their trips
    if (auth.roleName === 'Driver' && invoice.tripId) {
      const trip = await db.trip.findUnique({ where: { id: invoice.tripId } })
      if (!trip || trip.driverId !== auth.driverId) {
        return NextResponse.json({ error: 'Access denied' }, { status: 403 })
      }
    }

    const pdf = await buildInvoicePdf(id)
    const buffer = pdf.toBuffer()

    // Save report history
    await db.reportHistory.create({
      data: {
        type: 'invoice_report',
        title: `Invoice - ${invoice.invoiceNumber}`,
        format: 'pdf',
        parameters: JSON.stringify({ invoiceId: id }),
        generatedBy: auth.email,
        fileSize: buffer.length,
        status: 'completed',
      },
    })

    const dateStr = new Date().toISOString().split('T')[0]
    const filename = `invoice_${invoice.invoiceNumber}_${dateStr}.pdf`

    return new NextResponse(buffer, {
      headers: {
        'Content-Type': 'application/pdf',
        'Content-Disposition': `attachment; filename="${filename}"`,
        'Content-Length': String(buffer.length),
      },
    })
  } catch (error) {
    console.error('[Invoices] PDF generation failed:', error)
    return NextResponse.json({ error: 'Failed to generate invoice PDF' }, { status: 500 })
  }
}
