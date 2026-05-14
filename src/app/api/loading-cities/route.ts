import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { requireAuth, requireWriteAccess } from '@/lib/auth-server'
import { createAuditLog, getClientIp } from '@/lib/audit'

export async function GET(request: NextRequest) {
  try {
    const auth = requireAuth(request)
    if (auth instanceof NextResponse) return auth

    const { searchParams } = new URL(request.url)
    const search = searchParams.get('search')
    const isActive = searchParams.get('isActive')
    const page = parseInt(searchParams.get('page') || '1')
    const limit = parseInt(searchParams.get('limit') || '50')

    const where: Record<string, unknown> = {}

    if (search) where.name = { contains: search }
    if (isActive === 'true') where.isActive = true
    else if (isActive === 'false') where.isActive = false

    const [records, total] = await Promise.all([
      db.loadingCity.findMany({
        where,
        orderBy: { name: 'asc' },
        skip: (page - 1) * limit,
        take: limit,
        include: {
          _count: { select: { loadingPoints: true } },
        },
      }),
      db.loadingCity.count({ where }),
    ])

    return NextResponse.json({ data: records, total, page, limit })
  } catch (error) {
    console.error('Loading cities list error:', error)
    return NextResponse.json({ error: 'Failed to fetch loading cities' }, { status: 500 })
  }
}

export async function POST(request: NextRequest) {
  try {
    const auth = requireAuth(request)
    if (auth instanceof NextResponse) return auth
    const writeGuard = requireWriteAccess(auth)
    if (writeGuard instanceof NextResponse) return writeGuard

    const body = await request.json()
    const { name, region, isActive } = body

    if (!name || !name.trim()) {
      return NextResponse.json({ error: 'name is required' }, { status: 400 })
    }

    const existing = await db.loadingCity.findUnique({ where: { name: name.trim() } })
    if (existing) {
      return NextResponse.json({ error: 'Loading city with this name already exists' }, { status: 400 })
    }

    const record = await db.loadingCity.create({
      data: {
        name: name.trim(),
        region: region?.trim() || null,
        isActive: isActive !== undefined ? Boolean(isActive) : true,
      },
    })

    createAuditLog({
      userId: auth.userId,
      action: 'create',
      entity: 'LoadingCity',
      entityId: record.id,
      details: { name: record.name, region: record.region },
      ipAddress: getClientIp(request),
    }).catch(() => {})

    return NextResponse.json(record, { status: 201 })
  } catch (error) {
    console.error('Loading city create error:', error)
    return NextResponse.json({ error: 'Failed to create loading city' }, { status: 500 })
  }
}
