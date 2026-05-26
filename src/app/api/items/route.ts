import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { requireAuth, requireWriteAccess } from '@/lib/auth-server'

// GET /api/items — List items with search, filters, pagination
export async function GET(request: NextRequest) {
  try {
    const auth = requireAuth(request)
    if (auth instanceof NextResponse) return auth

    const searchParams = request.nextUrl.searchParams
    const search = searchParams.get('search') || ''
    const includeInactive = searchParams.get('includeInactive') === 'true'
    const page = parseInt(searchParams.get('page') || '1', 10)
    const limit = parseInt(searchParams.get('limit') || '50', 10)

    const where: Record<string, unknown> = {}

    if (!includeInactive) {
      where.isActive = true
    }

    if (search) {
      where.name = { contains: search, mode: 'insensitive' }
    }

    const supplierId = searchParams.get('supplierId')
    if (supplierId) {
      where.supplierId = supplierId
    }

    const [items, total] = await Promise.all([
      db.item.findMany({
        where,
        include: {
          supplier: {
            select: { id: true, name: true },
          },
        },
        skip: (page - 1) * limit,
        take: limit,
        orderBy: { createdAt: 'desc' },
      }),
      db.item.count({ where }),
    ])

    return NextResponse.json({ data: items, total, page, limit })
  } catch (error) {
    console.error('GET /api/items error:', error)
    return NextResponse.json({ error: 'Failed to fetch items' }, { status: 500 })
  }
}

// POST /api/items — Create a new item
export async function POST(request: NextRequest) {
  try {
    const auth = requireAuth(request)
    if (auth instanceof NextResponse) return auth
    const writeGuard = requireWriteAccess(auth)
    if (writeGuard instanceof NextResponse) return writeGuard

    const body = await request.json()
    const { name, description, unit, supplierId } = body

    // Validation
    if (!name || !name.trim()) {
      return NextResponse.json({ error: 'Item name is required' }, { status: 400 })
    }

    // Check for duplicate name
    const existing = await db.item.findUnique({
      where: { name: name.trim() },
    })
    if (existing) {
      return NextResponse.json({ error: 'An item with this name already exists' }, { status: 409 })
    }

    // Validate supplier if provided
    if (supplierId) {
      const supplier = await db.supplier.findUnique({ where: { id: supplierId } })
      if (!supplier) {
        return NextResponse.json({ error: 'Supplier not found' }, { status: 400 })
      }
    }

    const item = await db.item.create({
      data: {
        name: name.trim(),
        description: description?.trim() || null,
        unit: unit?.trim() || 'bags',
        isActive: true,
        ...(supplierId ? { supplierId } : {}),
      },
      include: {
        supplier: { select: { id: true, name: true } },
      },
    })

    return NextResponse.json(item, { status: 201 })
  } catch (error) {
    console.error('POST /api/items error:', error)
    return NextResponse.json({ error: 'Failed to create item' }, { status: 500 })
  }
}
