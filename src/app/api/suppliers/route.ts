import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { requireAuth } from '@/lib/auth-server'

// GET /api/suppliers — List all suppliers
export async function GET(request: NextRequest) {
  try {
    const auth = requireAuth(request)
    if (auth instanceof NextResponse) return auth

    const searchParams = request.nextUrl.searchParams
    const includeInactive = searchParams.get('includeInactive') === 'true'

    const where: Record<string, unknown> = {}
    if (!includeInactive) where.isActive = true

    const suppliers = await db.supplier.findMany({
      where,
      include: {
        LoadingPoint: {
          where: { isActive: true },
          select: { id: true, name: true, loadingCityId: true },
          orderBy: { name: 'asc' },
        },
        Item: {
          where: { isActive: true },
          select: { id: true, name: true, unit: true },
          orderBy: { name: 'asc' },
        },
        _count: {
          select: {
            Item: true,
            LoadingPoint: true,
            TripItem: true,
          },
        },
      },
      orderBy: { name: 'asc' },
    })

    return NextResponse.json({ data: suppliers })
  } catch (error) {
    console.error('GET /api/suppliers error:', error)
    return NextResponse.json({ error: 'Failed to fetch suppliers' }, { status: 500 })
  }
}

// POST /api/suppliers — Create a new supplier
export async function POST(request: NextRequest) {
  try {
    const auth = requireAuth(request)
    if (auth instanceof NextResponse) return auth

    const body = await request.json()
    const { name, contactPerson, contactPhone, email, address, notes } = body

    if (!name || !name.trim()) {
      return NextResponse.json(
        { error: 'Supplier name is required' },
        { status: 400 }
      )
    }

    // Check for duplicate name
    const existing = await db.supplier.findUnique({
      where: { name: name.trim() },
    })

    if (existing) {
      return NextResponse.json(
        { error: 'A supplier with this name already exists' },
        { status: 409 }
      )
    }

    const supplier = await db.supplier.create({
      data: {
        name: name.trim(),
        contactPerson: contactPerson?.trim() || null,
        contactPhone: contactPhone?.trim() || null,
        email: email?.trim() || null,
        address: address?.trim() || null,
        notes: notes?.trim() || null,
      },
    })

    return NextResponse.json({ data: supplier }, { status: 201 })
  } catch (error) {
    console.error('POST /api/suppliers error:', error)
    return NextResponse.json({ error: 'Failed to create supplier' }, { status: 500 })
  }
}
