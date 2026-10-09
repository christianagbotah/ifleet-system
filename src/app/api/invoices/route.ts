import { NextRequest, NextResponse } from 'next/server'
import { requireAuth, requireWriteAccess } from '@/lib/auth-server'
import { db } from '@/lib/db'
import { Prisma } from '@/generated/client'
import { invoiceSchema, parseBody } from '@/lib/schemas'
import { deriveTripInvoiceLine } from '@/lib/domain/billing/trip-invoice'

// ============ GET: List invoices ============
export async function GET(request: NextRequest) {
  const auth = requireAuth(request)
  if (auth instanceof NextResponse) return auth

  const { searchParams } = new URL(request.url)
  const clientId = searchParams.get('clientId')
  const status = searchParams.get('status')
  const dateFrom = searchParams.get('dateFrom')
  const dateTo = searchParams.get('dateTo')
  const search = searchParams.get('search')
  const page = parseInt(searchParams.get('page') || '1', 10)
  const limit = parseInt(searchParams.get('limit') || '20', 10)

  const where: Prisma.InvoiceWhereInput = {}

  if (clientId) where.clientId = clientId
  if (status) where.status = status
  if (dateFrom || dateTo) {
    where.issueDate = {}
    if (dateFrom) where.issueDate.gte = new Date(dateFrom)
    if (dateTo) where.issueDate.lte = new Date(dateTo)
  }
  if (search) {
    where.OR = [
      { invoiceNumber: { contains: search } },
      { client: { companyName: { contains: search } } },
      { client: { contactPerson: { contains: search } } },
      { notes: { contains: search } },
    ]
  }

  // Drivers only see invoices for their assigned trips
  if (auth.roleName === 'Driver') {
    where.trip = { driverId: auth.driverId || undefined }
  }

  try {
    const [invoices, total] = await Promise.all([
      db.invoice.findMany({
        where,
        include: {
          client: { select: { id: true, companyName: true, contactPerson: true, phone: true, email: true, address: true } },
          trip: { select: { id: true, tripNumber: true } },
          InvoiceItem: { orderBy: { order: 'asc' } },
        },
        orderBy: { issueDate: 'desc' },
        skip: (page - 1) * limit,
        take: limit,
      }),
      db.invoice.count({ where }),
    ])

    // Compute summary stats
    const summary = await db.invoice.aggregate({
      _count: true,
      _sum: { totalAmount: true, paidAmount: true },
      where: { ...where, status: { in: ['draft', 'sent', 'overdue'] } },
    })

    const overdueCount = await db.invoice.count({
      where: {
        ...where,
        status: 'overdue',
      },
    })

    const thisMonth = new Date()
    thisMonth.setDate(1)
    thisMonth.setHours(0, 0, 0, 0)

    const paidThisMonth = await db.invoice.aggregate({
      _sum: { paidAmount: true },
      where: {
        status: 'paid',
        updatedAt: { gte: thisMonth },
      },
    })

    const mappedInvoices = invoices.map((invoice: Record<string, unknown>) => ({
      ...invoice,
      items: invoice.InvoiceItem,
    }))

    return NextResponse.json({
      data: mappedInvoices,
      total,
      page,
      limit,
      summary: {
        totalInvoices: total,
        outstandingAmount: (summary._sum.totalAmount || 0) - (summary._sum.paidAmount || 0),
        overdueCount,
        thisMonthRevenue: paidThisMonth._sum.paidAmount || 0,
      },
    })
  } catch (error) {
    console.error('[Invoices] List failed:', error)
    return NextResponse.json({ error: 'Failed to fetch invoices' }, { status: 500 })
  }
}

// ============ POST: Create invoice ============
export async function POST(request: NextRequest) {
  const auth = requireAuth(request)
  if (auth instanceof NextResponse) return auth
  const writeGuard = requireWriteAccess(auth)
  if (writeGuard instanceof NextResponse) return writeGuard

  try {
    const raw = await request.json()
    const parsed = parseBody(invoiceSchema.omit({ invoiceNumber: true }).passthrough(), raw)
    if (!parsed.success) {
      return NextResponse.json({ error: parsed.errors.join(', ') }, { status: 400 })
    }
    const { clientId, tripId, issueDate, dueDate, taxRate, notes, terms, items } = parsed.data

    if (!dueDate) {
      return NextResponse.json({ error: 'Due date is required' }, { status: 400 })
    }

    // Validate client exists
    const client = await db.client.findUnique({ where: { id: clientId } })
    if (!client) {
      return NextResponse.json({ error: 'Client not found' }, { status: 404 })
    }

    if (!tripId && items.length === 0) {
      return NextResponse.json({ error: 'Manual invoices require at least one line item' }, { status: 400 })
    }

    let derivedItems = items
    if (tripId) {
      const trip = await db.trip.findUnique({
        where: { id: tripId },
        select: {
          id: true,
          clientId: true,
          tripNumber: true,
          status: true,
          itemName: true,
          unit: true,
          quantity: true,
          unitPrice: true,
          totalRevenue: true,
        },
      })
      if (!trip) return NextResponse.json({ error: 'Trip not found' }, { status: 404 })
      if (trip.clientId && trip.clientId !== clientId) {
        return NextResponse.json({ error: 'Invoice client does not match the trip client' }, { status: 409 })
      }

      const proofs = await db.proofOfDelivery.findMany({
        where: { tripId },
        select: { id: true, acceptedQty: true, unit: true, supersedesId: true },
        orderBy: { createdAt: 'asc' },
      })

      try {
        const line = deriveTripInvoiceLine({
          tripId: trip.id,
          tripNumber: trip.tripNumber,
          status: trip.status,
          itemName: trip.itemName,
          unit: trip.unit,
          dispatchedQuantity: trip.quantity,
          unitPrice: trip.unitPrice == null ? null : Number(trip.unitPrice),
          totalRevenue: trip.totalRevenue == null ? null : Number(trip.totalRevenue),
          proofs: proofs.map((proof) => ({
            id: proof.id,
            acceptedQty: proof.acceptedQty,
            unit: proof.unit,
            supersedesId: proof.supersedesId,
          })),
        })
        derivedItems = [{ description: line.description, quantity: line.quantity, unitPrice: line.unitPrice }]
      } catch (error) {
        return NextResponse.json(
          { error: error instanceof Error ? error.message : 'Trip is not ready for customer invoicing' },
          { status: 409 },
        )
      }
    }

    const effectiveItems = tripId ? derivedItems : items
    const subtotal = effectiveItems.reduce((sum: number, item: { quantity: number; unitPrice: number }) => {
      return sum + (item.quantity * item.unitPrice)
    }, 0)

    const rate = taxRate || 0
    const taxAmount = subtotal * (rate / 100)
    const totalAmount = subtotal + taxAmount

    // Generate invoice number: INV-YYYYMMDD-XXXX
    const now = new Date()
    const dateStr = now.getFullYear().toString() +
      String(now.getMonth() + 1).padStart(2, '0') +
      String(now.getDate()).padStart(2, '0')

    // Find the next counter for today
    const prefix = `INV-${dateStr}-`
    const lastInvoice = await db.invoice.findFirst({
      where: { invoiceNumber: { startsWith: prefix } },
      orderBy: { invoiceNumber: 'desc' },
    })

    let counter = 1
    if (lastInvoice) {
      const lastNum = lastInvoice.invoiceNumber.slice(prefix.length)
      counter = parseInt(lastNum, 10) + 1
    }

    const invoiceNumber = `${prefix}${String(counter).padStart(4, '0')}`

    // Create invoice with items
    const invoice = await db.invoice.create({
      data: {
        invoiceNumber,
        clientId,
        tripId: tripId || null,
        issueDate: issueDate ? new Date(issueDate) : now,
        dueDate: new Date(dueDate),
        status: 'draft',
        subtotal,
        taxAmount,
        taxRate: rate,
        totalAmount,
        paidAmount: 0,
        notes: notes || null,
        terms: terms || null,
        InvoiceItem: {
          create: effectiveItems.map((item, index) => ({
            description: item.description,
            quantity: item.quantity,
            unitPrice: item.unitPrice,
            total: item.quantity * item.unitPrice,
            order: index,
          })),
        },
      },
      include: {
        client: { select: { id: true, companyName: true, contactPerson: true, phone: true, email: true, address: true } },
        trip: { select: { id: true, tripNumber: true } },
        InvoiceItem: { orderBy: { order: 'asc' } },
      },
    })

    const mapped = {
      ...(invoice as Record<string, unknown>),
      items: (invoice as Record<string, unknown>).InvoiceItem,
    }
    return NextResponse.json(mapped, { status: 201 })
  } catch (error) {
    console.error('[Invoices] Create failed:', error)
    return NextResponse.json({ error: 'Failed to create invoice' }, { status: 500 })
  }
}
