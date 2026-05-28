import { NextRequest, NextResponse } from 'next/server'
import { requireAuth, requireWriteAccess } from '@/lib/auth-server'
import { generateInvoiceForTrip } from '@/lib/services/invoice-generator'
import { db } from '@/lib/db'

// ============ POST: Generate invoice from trip ============
export async function POST(request: NextRequest) {
  const auth = requireAuth(request)
  if (auth instanceof NextResponse) return auth
  const writeGuard = requireWriteAccess(auth)
  if (writeGuard instanceof NextResponse) return writeGuard

  try {
    const body = await request.json()
    const { tripId } = body

    if (!tripId) {
      return NextResponse.json({ error: 'tripId is required' }, { status: 400 })
    }

    // Verify trip exists
    const trip = await db.trip.findUnique({
      where: { id: tripId },
      select: { id: true, tripNumber: true },
    })

    if (!trip) {
      return NextResponse.json({ error: 'Trip not found' }, { status: 404 })
    }

    // Check if invoice already exists for this trip
    const existingInvoice = await db.invoice.findUnique({
      where: { tripId },
    })

    if (existingInvoice) {
      return NextResponse.json(
        { error: `Invoice ${existingInvoice.invoiceNumber} already exists for this trip` },
        { status: 409 }
      )
    }

    // Generate the invoice
    const invoice = await generateInvoiceForTrip(tripId, auth.userId)

    if (!invoice) {
      return NextResponse.json(
        { error: 'Could not generate invoice. The trip may have no revenue data or items.' },
        { status: 422 }
      )
    }

    // Fetch the full invoice with relations for the response
    const fullInvoice = await db.invoice.findUnique({
      where: { id: invoice.id },
      include: {
        client: { select: { id: true, companyName: true, contactPerson: true, phone: true, email: true, address: true } },
        trip: { select: { id: true, tripNumber: true } },
        InvoiceItem: { orderBy: { order: 'asc' } },
      },
    })

    const mapped = {
      ...(fullInvoice as Record<string, unknown>),
      items: (fullInvoice as Record<string, unknown>).InvoiceItem,
    }

    return NextResponse.json(mapped, { status: 201 })
  } catch (error) {
    console.error('[Invoices] Generate from trip failed:', error)
    return NextResponse.json({ error: 'Failed to generate invoice from trip' }, { status: 500 })
  }
}
