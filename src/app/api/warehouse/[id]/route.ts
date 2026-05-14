import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { requireAuth, requireWriteAccess } from '@/lib/auth-server'
import { createAuditLog, getClientIp } from '@/lib/audit'

export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params
    const item = await db.warehouseItem.findUnique({
      where: { id },
      include: { creator: { select: { id: true, name: true } } },
    })
    if (!item) return NextResponse.json({ error: 'Warehouse item not found' }, { status: 404 })
    return NextResponse.json(item)
  } catch (error) {
    console.error('Warehouse item get error:', error)
    return NextResponse.json({ error: 'Failed to fetch item' }, { status: 500 })
  }
}

export async function PUT(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const auth = requireAuth(request)
    if (auth instanceof NextResponse) return auth
    const writeGuard = requireWriteAccess(auth)
    if (writeGuard instanceof NextResponse) return writeGuard

    const { id } = await params

    const body = await request.json()
    const {
      name, category, quantity, minStock, unitPrice, unit,
      warehouse, location, supplier, expiryDate, notes,
      restockQty,
    } = body

    const existing = await db.warehouseItem.findUnique({ where: { id } })
    if (!existing) return NextResponse.json({ error: 'Item not found' }, { status: 404 })

    const updateData: Record<string, unknown> = {}
    if (name !== undefined) updateData.name = name
    if (category !== undefined) updateData.category = category
    if (minStock !== undefined) updateData.minStock = parseInt(minStock)
    if (unitPrice !== undefined) updateData.unitPrice = parseFloat(unitPrice)
    if (unit !== undefined) updateData.unit = unit
    if (warehouse !== undefined) updateData.warehouse = warehouse
    if (location !== undefined) updateData.location = location
    if (supplier !== undefined) updateData.supplier = supplier
    if (expiryDate !== undefined) updateData.expiryDate = expiryDate ? new Date(expiryDate) : null
    if (notes !== undefined) updateData.notes = notes

    // Handle restock
    if (restockQty && parseInt(restockQty) > 0) {
      const newQty = (existing.quantity || 0) + parseInt(restockQty)
      updateData.quantity = newQty
      updateData.lastRestocked = new Date()
    } else if (quantity !== undefined) {
      updateData.quantity = parseInt(quantity)
      if (parseInt(quantity) > (existing.quantity || 0)) {
        updateData.lastRestocked = new Date()
      }
    }

    // Auto-recalculate status
    const finalQty = updateData.quantity !== undefined ? updateData.quantity : existing.quantity
    const finalMin = updateData.minStock !== undefined ? updateData.minStock : existing.minStock
    if (finalQty !== undefined) {
      updateData.status = finalQty <= 0 ? 'out_of_stock' : finalQty <= finalMin ? 'low_stock' : 'in_stock'
    }
    if (updateData.expiryDate && new Date(updateData.expiryDate) < new Date()) {
      updateData.status = 'expired'
    }

    const item = await db.warehouseItem.update({
      where: { id },
      data: updateData,
      include: { creator: { select: { id: true, name: true } } },
    })

    createAuditLog({
      userId: auth.userId, action: 'update', entity: 'WarehouseItem', entityId: item.id,
      details: { name: item.name, sku: item.sku, quantity: item.quantity, restocked: !!restockQty },
      ipAddress: getClientIp(request),
    })

    return NextResponse.json(item)
  } catch (error) {
    console.error('Warehouse item update error:', error)
    return NextResponse.json({ error: 'Failed to update warehouse item' }, { status: 500 })
  }
}

export async function DELETE(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const auth = requireAuth(request)
    if (auth instanceof NextResponse) return auth
    const writeGuard = requireWriteAccess(auth)
    if (writeGuard instanceof NextResponse) return writeGuard

    const { id } = await params

    const existing = await db.warehouseItem.findUnique({ where: { id } })
    if (!existing) return NextResponse.json({ error: 'Item not found' }, { status: 404 })

    await db.warehouseItem.delete({ where: { id } })
    createAuditLog({
      userId: auth.userId, action: 'delete', entity: 'WarehouseItem', entityId: id,
      details: { name: existing.name, sku: existing.sku }, ipAddress: getClientIp(request),
    })
    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('Warehouse item delete error:', error)
    return NextResponse.json({ error: 'Failed to delete item' }, { status: 500 })
  }
}
