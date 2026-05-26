import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { requireAuth } from '@/lib/auth-server'

// GET /api/suppliers/[id] — Get a single supplier
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const auth = requireAuth(request)
    if (auth instanceof NextResponse) return auth

    const { id } = await params

    const supplier = await db.supplier.findUnique({
      where: { id },
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
    })

    if (!supplier) {
      return NextResponse.json({ error: 'Supplier not found' }, { status: 404 })
    }

    return NextResponse.json({ data: supplier })
  } catch (error) {
    console.error('GET /api/suppliers/[id] error:', error)
    return NextResponse.json({ error: 'Failed to fetch supplier' }, { status: 500 })
  }
}

// PUT /api/suppliers/[id] — Update a supplier
export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const auth = requireAuth(request)
    if (auth instanceof NextResponse) return auth

    const { id } = await params
    const body = await request.json()
    const { name, contactPerson, contactPhone, email, address, notes } = body

    const existing = await db.supplier.findUnique({ where: { id } })
    if (!existing) {
      return NextResponse.json({ error: 'Supplier not found' }, { status: 404 })
    }

    // Check for duplicate name if name is being changed
    if (name && name.trim() && name.trim() !== existing.name) {
      const duplicate = await db.supplier.findUnique({
        where: { name: name.trim() },
      })
      if (duplicate) {
        return NextResponse.json(
          { error: 'A supplier with this name already exists' },
          { status: 409 }
        )
      }
    }

    const supplier = await db.supplier.update({
      where: { id },
      data: {
        ...(name?.trim() ? { name: name.trim() } : {}),
        contactPerson: contactPerson !== undefined ? (contactPerson?.trim() || null) : undefined,
        contactPhone: contactPhone !== undefined ? (contactPhone?.trim() || null) : undefined,
        email: email !== undefined ? (email?.trim() || null) : undefined,
        address: address !== undefined ? (address?.trim() || null) : undefined,
        notes: notes !== undefined ? (notes?.trim() || null) : undefined,
      },
    })

    return NextResponse.json({ data: supplier })
  } catch (error) {
    console.error('PUT /api/suppliers/[id] error:', error)
    return NextResponse.json({ error: 'Failed to update supplier' }, { status: 500 })
  }
}

// DELETE /api/suppliers/[id] — Delete a supplier (hard delete)
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const auth = requireAuth(request)
    if (auth instanceof NextResponse) return auth

    const { id } = await params

    const existing = await db.supplier.findUnique({
      where: { id },
      include: {
        _count: {
          select: {
            Item: true,
            LoadingPoint: true,
            TripItem: true,
          },
        },
      },
    })

    if (!existing) {
      return NextResponse.json({ error: 'Supplier not found' }, { status: 404 })
    }

    // Check for dependencies
    const deps = []
    if (existing._count.Item > 0) deps.push(`${existing._count.Item} item(s)`)
    if (existing._count.LoadingPoint > 0) deps.push(`${existing._count.LoadingPoint} loading point(s)`)
    if (existing._count.TripItem > 0) deps.push(`${existing._count.TripItem} trip item(s)`)

    if (deps.length > 0) {
      return NextResponse.json(
        {
          error: `Cannot delete supplier "${existing.name}" — it has linked records: ${deps.join(', ')}. Remove these links first.`,
        },
        { status: 409 }
      )
    }

    await db.supplier.delete({ where: { id } })

    return NextResponse.json({ data: { id }, message: 'Supplier deleted successfully' })
  } catch (error) {
    console.error('DELETE /api/suppliers/[id] error:', error)
    return NextResponse.json({ error: 'Failed to delete supplier' }, { status: 500 })
  }
}
