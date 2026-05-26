import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { requireAuth, requireWriteAccess } from '@/lib/auth-server'

// GET /api/items/[id] — Fetch single item
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const auth = requireAuth(request)
    if (auth instanceof NextResponse) return auth
    const { id } = await params

    const item = await db.item.findUnique({
      where: { id },
    })

    if (!item) {
      return NextResponse.json({ error: 'Item not found' }, { status: 404 })
    }

    return NextResponse.json(item)
  } catch (error) {
    console.error('GET /api/items/[id] error:', error)
    return NextResponse.json({ error: 'Failed to fetch item' }, { status: 500 })
  }
}

// PUT /api/items/[id] — Update item fields
export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const auth = requireAuth(request)
    if (auth instanceof NextResponse) return auth
    const writeGuard = requireWriteAccess(auth)
    if (writeGuard instanceof NextResponse) return writeGuard

    const { id } = await params
    const body = await request.json()
    const { name, description, unit, isActive } = body

    const existing = await db.item.findUnique({ where: { id } })
    if (!existing) {
      return NextResponse.json({ error: 'Item not found' }, { status: 404 })
    }

    // Check for duplicate name if changed
    if (name && name.trim() !== existing.name) {
      const duplicate = await db.item.findUnique({
        where: { name: name.trim() },
      })
      if (duplicate) {
        return NextResponse.json({ error: 'An item with this name already exists' }, { status: 409 })
      }
    }

    const updateData: Record<string, unknown> = {}
    if (name !== undefined) updateData.name = name.trim()
    if (description !== undefined) updateData.description = description?.trim() || null
    if (unit !== undefined) updateData.unit = unit?.trim() || 'bags'
    if (isActive !== undefined) updateData.isActive = isActive

    const item = await db.item.update({
      where: { id },
      data: updateData,
    })

    return NextResponse.json(item)
  } catch (error) {
    console.error('PUT /api/items/[id] error:', error)
    return NextResponse.json({ error: 'Failed to update item' }, { status: 500 })
  }
}

// DELETE /api/items/[id] — Permanently delete
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const auth = requireAuth(request)
    if (auth instanceof NextResponse) return auth
    const writeGuard = requireWriteAccess(auth)
    if (writeGuard instanceof NextResponse) return writeGuard

    const { id } = await params

    const existing = await db.item.findUnique({
      where: { id },
      include: { _count: { select: { Trip: true, TripItem: true } } },
    })
    if (!existing) {
      return NextResponse.json({ error: 'Item not found' }, { status: 404 })
    }

    const deps = existing._count
    const parts: string[] = []
    if (deps.Trip) parts.push(`${deps.Trip} trip(s)`)
    if (deps.TripItem) parts.push(`${deps.TripItem} trip item(s)`)

    if (parts.length > 0) {
      return NextResponse.json(
        { error: `Cannot delete: this item has ${parts.join(', ')}. Remove or reassign them first.` },
        { status: 400 }
      )
    }

    await db.item.delete({ where: { id } })

    return NextResponse.json({ success: true, id, message: 'Item deleted permanently' })
  } catch (error) {
    console.error('DELETE /api/items/[id] error:', error)
    return NextResponse.json({ error: 'Failed to delete item' }, { status: 500 })
  }
}
