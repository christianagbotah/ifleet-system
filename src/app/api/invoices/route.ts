import { NextRequest, NextResponse } from 'next/server'
import { requireAuth, requireWriteAccess } from '@/lib/auth-server'
import { db } from '@/lib/db'
import { Prisma } from '@/generated/client'

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
    const body = await request.json()
    const { clientId, tripId, issueDate, dueDate, taxRate, notes, terms, items } = body

    if (!clientId || !dueDate || !items || !items.length) {
      return NextResponse.json(
        { error: 'clientId, dueDate, and at least one item are required' },
        { status: 400 }
      )
    }

    // Validate client exists
    const client = await db.client.findUnique({ where: { id: clientId } })
    if (!client) {
      return NextResponse.json({ error: 'Client not found' }, { status: 404 })
    }

    // Validate optional trip
    if (tripId) {
      const trip = await db.trip.findUnique({ where: { id: tripId } })
      if (!trip) {
        return NextResponse.json({ error: 'Trip not found' }, { status: 404 })
      }
    }

    // Calculate subtotal
    const subtotal = items.reduce((sum: number, item: { quantity: number; unitPrice: number }) => {
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
          create: items.map((item: { description: string; quantity: number; unitPrice: number; total: number; order: number }, index: number) => ({
            description: item.description,
            quantity: item.quantity,
            unitPrice: item.unitPrice,
            total: item.quantity * item.unitPrice,
            order: item.order ?? index,
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
