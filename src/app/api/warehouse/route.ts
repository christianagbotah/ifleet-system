import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { requireAuth, requireWriteAccess } from '@/lib/auth-server'
import { createAuditLog, getClientIp } from '@/lib/audit'

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const category = searchParams.get('category')
    const status = searchParams.get('status')
    const warehouse = searchParams.get('warehouse')
    const search = searchParams.get('search')
    const page = parseInt(searchParams.get('page') || '1')
    const limit = parseInt(searchParams.get('limit') || '50')

    const where: Record<string, unknown> = {}
    if (category) where.category = category
    if (status) where.status = status
    if (warehouse) where.warehouse = warehouse
    if (search) {
      where.OR = [
        { name: { contains: search } },
        { sku: { contains: search } },
        { supplier: { contains: search } },
      ]
    }

    const [items, total] = await Promise.all([
      db.warehouseItem.findMany({
        where,
        include: {
          creator: { select: { id: true, name: true } },
        },
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * limit,
        take: limit,
      }),
      db.warehouseItem.count({ where }),
    ])

    return NextResponse.json({ data: items, total, page, limit })
  } catch (error) {
    console.error('Warehouse list error:', error)
    return NextResponse.json({ error: 'Failed to fetch warehouse items' }, { status: 500 })
  }
}

export async function POST(request: NextRequest) {
  try {
    const auth = requireAuth(request)
    if (auth instanceof NextResponse) return auth
    const writeGuard = requireWriteAccess(auth)
    if (writeGuard instanceof NextResponse) return writeGuard

    const body = await request.json()
    const {
      name, category, sku, quantity, minStock, unitPrice, unit,
      warehouse, location, supplier, expiryDate, notes,
    } = body

    if (!name || !category || !quantity || !unitPrice) {
      return NextResponse.json(
        { error: 'name, category, quantity, and unitPrice are required' },
        { status: 400 }
      )
    }

    const finalSku = sku || `${category.toUpperCase().replace(/[^A-Z0-9]/g, '')}-${Date.now().toString(36).toUpperCase().slice(-4)}`

    // Auto-calculate status
    const qty = parseInt(quantity)
    const min = parseInt(minStock) || 5
    const autoStatus = qty <= 0 ? 'out_of_stock' : qty <= min ? 'low_stock' : 'in_stock'

    const item = await db.warehouseItem.create({
      data: {
        name, category, sku: finalSku,
        quantity: qty,
        minStock: min,
        unitPrice: parseFloat(unitPrice),
        unit: unit || 'pcs',
        warehouse: warehouse || 'Main Depot',
        location: location || null,
        supplier: supplier || null,
        expiryDate: expiryDate ? new Date(expiryDate) : null,
        lastRestocked: qty > 0 ? new Date() : null,
        status: autoStatus,
        notes: notes || null,
        createdBy: auth.userId,
      },
      include: {
        creator: { select: { id: true, name: true } },
      },
    })

    createAuditLog({
      userId: auth.userId, action: 'create', entity: 'WarehouseItem', entityId: item.id,
      details: { name, sku: finalSku, quantity: qty, category }, ipAddress: getClientIp(request),
    })

    return NextResponse.json(item, { status: 201 })
  } catch (error) {
    console.error('Warehouse create error:', error)
    return NextResponse.json({ error: 'Failed to create warehouse item' }, { status: 500 })
  }
}
