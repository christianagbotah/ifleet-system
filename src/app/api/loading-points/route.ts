import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { requireAuth, requireWriteAccess } from '@/lib/auth-server'
import { createAuditLog, getClientIp } from '@/lib/audit'

export async function GET(request: NextRequest) {
  try {
    const auth = requireAuth(request)
    if (auth instanceof NextResponse) return auth

    const { searchParams } = new URL(request.url)
    const loadingCityId = searchParams.get('loadingCityId')
    const search = searchParams.get('search')
    const isActive = searchParams.get('isActive')
    const page = parseInt(searchParams.get('page') || '1')
    const limit = parseInt(searchParams.get('limit') || '50')

    const where: Record<string, unknown> = {}

    if (loadingCityId) where.loadingCityId = loadingCityId
    if (search) where.name = { contains: search }
    if (isActive === 'true') where.isActive = true
    else if (isActive === 'false') where.isActive = false
    const supplierId = searchParams.get('supplierId')
    if (supplierId) where.supplierId = supplierId

    const [records, total] = await Promise.all([
      db.loadingPoint.findMany({
        where,
        orderBy: { name: 'asc' },
        skip: (page - 1) * limit,
        take: limit,
        include: {
          loadingCity: { select: { id: true, name: true, region: true } },
          supplier: { select: { id: true, name: true } },
        },
      }),
      db.loadingPoint.count({ where }),
    ])

    return NextResponse.json({ data: records, total, page, limit })
  } catch (error) {
    console.error('Loading points list error:', error)
    return NextResponse.json({ error: 'Failed to fetch loading points' }, { status: 500 })
  }
}

export async function POST(request: NextRequest) {
  try {
    const auth = requireAuth(request)
    if (auth instanceof NextResponse) return auth
    const writeGuard = requireWriteAccess(auth)
    if (writeGuard instanceof NextResponse) return writeGuard

    const body = await request.json()
    const { name, loadingCityId, address, contactPerson, contactPhone, supplierId } = body

    if (!name?.trim() || !loadingCityId) {
      return NextResponse.json({ error: 'name and loadingCityId are required' }, { status: 400 })
    }

    const city = await db.loadingCity.findUnique({ where: { id: loadingCityId } })
    if (!city) {
      return NextResponse.json({ error: 'Loading city not found' }, { status: 400 })
    }

    if (supplierId) {
      const supplier = await db.supplier.findUnique({ where: { id: supplierId } })
      if (!supplier) {
        return NextResponse.json({ error: 'Supplier not found' }, { status: 400 })
      }
    }

    const existing = await db.loadingPoint.findUnique({
      where: { name_loadingCityId: { name: name.trim(), loadingCityId } },
    })
    if (existing) {
      return NextResponse.json(
        { error: 'Loading point with this name already exists in this city' },
        { status: 400 }
      )
    }

    const record = await db.loadingPoint.create({
      data: {
        name: name.trim(),
        loadingCityId,
        address: address?.trim() || null,
        contactPerson: contactPerson?.trim() || null,
        contactPhone: contactPhone?.trim() || null,
        ...(supplierId ? { supplierId } : {}),
      },
      include: {
        loadingCity: { select: { id: true, name: true, region: true } },
        supplier: { select: { id: true, name: true } },
      },
    })

    createAuditLog({
      userId: auth.userId,
      action: 'create',
      entity: 'LoadingPoint',
      entityId: record.id,
      details: { name: record.name, loadingCityId, cityName: city.name, supplierId: supplierId || undefined },
      ipAddress: getClientIp(request),
    }).catch(() => {})

    return NextResponse.json(record, { status: 201 })
  } catch (error) {
    console.error('Loading point create error:', error)
    return NextResponse.json({ error: 'Failed to create loading point' }, { status: 500 })
  }
}
