import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { requireAuth, requireWriteAccess } from '@/lib/auth-server'
import { createAuditLog, getClientIp } from '@/lib/audit'

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const auth = requireAuth(request)
    if (auth instanceof NextResponse) return auth

    const { id } = await params
    const { searchParams } = new URL(request.url)
    const isActive = searchParams.get('isActive')

    const whereClause = isActive === 'true' ? { id, isActive: true } : { id }

    const record = await db.loadingCity.findFirst({
      where: whereClause,
      include: {
        loadingPoints: {
          orderBy: { name: 'asc' },
          where: isActive === 'true' ? { isActive: true } : undefined,
        },
        _count: { select: { trips: true } },
      },
    })

    if (!record) {
      return NextResponse.json({ error: 'Loading city not found' }, { status: 404 })
    }

    return NextResponse.json(record)
  } catch (error) {
    console.error('Loading city detail error:', error)
    return NextResponse.json({ error: 'Failed to fetch loading city' }, { status: 500 })
  }
}

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
    const { name, region, isActive } = body

    const existing = await db.loadingCity.findUnique({ where: { id } })
    if (!existing) {
      return NextResponse.json({ error: 'Loading city not found' }, { status: 404 })
    }

    if (name && name.trim() && name.trim() !== existing.name) {
      const duplicate = await db.loadingCity.findUnique({ where: { name: name.trim() } })
      if (duplicate) {
        return NextResponse.json({ error: 'Loading city with this name already exists' }, { status: 400 })
      }
    }

    const changes: Record<string, unknown> = {}
    if (name !== undefined && name !== existing.name) changes.name = name
    if (region !== undefined && region !== existing.region) changes.region = region
    if (isActive !== undefined && isActive !== existing.isActive) changes.isActive = isActive

    const updated = await db.loadingCity.update({
      where: { id },
      data: {
        ...(name !== undefined && { name: name.trim() }),
        ...(region !== undefined && { region: region?.trim() || null }),
        ...(isActive !== undefined && { isActive: Boolean(isActive) }),
      },
    })

    if (Object.keys(changes).length > 0) {
      createAuditLog({
        userId: auth.userId,
        action: 'update',
        entity: 'LoadingCity',
        entityId: id,
        details: changes,
        ipAddress: getClientIp(request),
      }).catch(() => {})
    }

    return NextResponse.json(updated)
  } catch (error) {
    console.error('Loading city update error:', error)
    return NextResponse.json({ error: 'Failed to update loading city' }, { status: 500 })
  }
}

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

    const existing = await db.loadingCity.findUnique({ where: { id } })
    if (!existing) {
      return NextResponse.json({ error: 'Loading city not found' }, { status: 404 })
    }

    const updated = await db.loadingCity.update({
      where: { id },
      data: { isActive: false },
    })

    createAuditLog({
      userId: auth.userId,
      action: 'delete',
      entity: 'LoadingCity',
      entityId: id,
      details: { name: existing.name, softDeleted: true },
      ipAddress: getClientIp(request),
    }).catch(() => {})

    return NextResponse.json(updated)
  } catch (error) {
    console.error('Loading city delete error:', error)
    return NextResponse.json({ error: 'Failed to delete loading city' }, { status: 500 })
  }
}
