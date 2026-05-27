import { NextRequest, NextResponse } from 'next/server'
import { requireAuth, requireWriteAccess } from '@/lib/auth-server'
import { db } from '@/lib/db'
import { Prisma } from '@/generated/client'

// ============ GET: Get single invoice ============
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = requireAuth(request)
  if (auth instanceof NextResponse) return auth

  const { id } = await params

  try {
    const invoice = await db.invoice.findUnique({
      where: { id },
      include: {
        client: { select: { id: true, companyName: true, contactPerson: true, phone: true, email: true, address: true, city: true, region: true } },
        trip: { select: { id: true, tripNumber: true } },
        items: { orderBy: { order: 'asc' } },
      },
    })

    if (!invoice) {
      return NextResponse.json({ error: 'Invoice not found' }, { status: 404 })
    }

    // Drivers can only see invoices for their trips
    if (auth.roleName === 'Driver' && invoice.tripId) {
      const trip = await db.trip.findUnique({ where: { id: invoice.tripId } })
      if (!trip || trip.driverId !== auth.driverId) {
        return NextResponse.json({ error: 'Access denied' }, { status: 403 })
      }
    }

    return NextResponse.json(invoice)
  } catch (error) {
    console.error('[Invoices] Get failed:', error)
    return NextResponse.json({ error: 'Failed to fetch invoice' }, { status: 500 })
  }
}

// ============ PUT: Update invoice ============
export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = requireAuth(request)
  if (auth instanceof NextResponse) return auth
  const writeGuard = requireWriteAccess(auth)
  if (writeGuard instanceof NextResponse) return writeGuard

  const { id } = await params

  try {
    const body = await request.json()
    const { clientId, tripId, issueDate, dueDate, taxRate, status, notes, terms, items } = body

    const invoice = await db.invoice.findUnique({ where: { id } })
    if (!invoice) {
      return NextResponse.json({ error: 'Invoice not found' }, { status: 404 })
    }

    // Recalculate totals if items provided
    let subtotal = invoice.subtotal
    let taxAmount = invoice.taxAmount
    let totalAmount = invoice.totalAmount

    if (items && Array.isArray(items)) {
      subtotal = items.reduce((sum: number, item: { quantity: number; unitPrice: number }) => {
        return sum + (item.quantity * item.unitPrice)
      }, 0)
      const rate = taxRate ?? invoice.taxRate
      taxAmount = subtotal * (rate / 100)
      totalAmount = subtotal + taxAmount
    } else if (taxRate !== undefined) {
      taxAmount = invoice.subtotal * (taxRate / 100)
      totalAmount = invoice.subtotal + taxAmount
    }

    const updateData: Partial<Prisma.InvoiceUpdateArgs> = {
      data: {
        subtotal,
        taxAmount,
        totalAmount,
        updatedAt: new Date(),
      },
    }

    if (clientId !== undefined) updateData.data.clientId = clientId
    if (tripId !== undefined) updateData.data.tripId = tripId || null
    if (issueDate) updateData.data.issueDate = new Date(issueDate)
    if (dueDate) updateData.data.dueDate = new Date(dueDate)
    if (taxRate !== undefined) updateData.data.taxRate = taxRate
    if (status !== undefined) updateData.data.status = status
    if (notes !== undefined) updateData.data.notes = notes
    if (terms !== undefined) updateData.data.terms = terms

    const updated = await db.invoice.update({
      where: { id },
      ...updateData,
    })

    // Handle item updates (replace all items)
    if (items && Array.isArray(items)) {
      // Delete existing items
      await db.invoiceItem.deleteMany({ where: { invoiceId: id } })
      // Create new items
      if (items.length > 0) {
        await db.invoiceItem.createMany({
          data: items.map((item: { description: string; quantity: number; unitPrice: number; total: number; order: number }, index: number) => ({
            invoiceId: id,
            description: item.description,
            quantity: item.quantity,
            unitPrice: item.unitPrice,
            total: item.quantity * item.unitPrice,
            order: item.order ?? index,
          })),
        })
      }
    }

    // Re-fetch with relations
    const result = await db.invoice.findUnique({
      where: { id },
      include: {
        client: { select: { id: true, companyName: true, contactPerson: true, phone: true, email: true, address: true, city: true, region: true } },
        trip: { select: { id: true, tripNumber: true } },
        items: { orderBy: { order: 'asc' } },
      },
    })

    return NextResponse.json(result)
  } catch (error) {
    console.error('[Invoices] Update failed:', error)
    return NextResponse.json({ error: 'Failed to update invoice' }, { status: 500 })
  }
}

// ============ DELETE: Delete invoice ============
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = requireAuth(request)
  if (auth instanceof NextResponse) return auth
  const writeGuard = requireWriteAccess(auth)
  if (writeGuard instanceof NextResponse) return writeGuard

  const { id } = await params

  try {
    const invoice = await db.invoice.findUnique({ where: { id } })
    if (!invoice) {
      return NextResponse.json({ error: 'Invoice not found' }, { status: 404 })
    }

    // Only allow deleting draft invoices
    if (invoice.status !== 'draft' && invoice.status !== 'cancelled') {
      return NextResponse.json(
        { error: `Cannot delete invoice with status "${invoice.status}". Only draft/cancelled invoices can be deleted.` },
        { status: 400 },
      )
    }

    await db.invoice.delete({ where: { id } })

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('[Invoices] Delete failed:', error)
    return NextResponse.json({ error: 'Failed to delete invoice' }, { status: 500 })
  }
}
