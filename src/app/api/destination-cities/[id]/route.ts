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

    const record = await db.destinationCity.findUnique({
      where: { id },
      include: {
        DestinationZone: {
          orderBy: { name: 'asc' },
          include: {
            _count: { select: { Trip: true, ZoneRate: true, PerformanceBenchmark: true } },
          },
        },
        _count: { select: { Trip: true } },
      },
    })

    if (!record) {
      return NextResponse.json({ error: 'Destination city not found' }, { status: 404 })
    }

    return NextResponse.json(record)
  } catch (error) {
    console.error('Destination city detail error:', error)
    return NextResponse.json({ error: 'Failed to fetch destination city' }, { status: 500 })
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

    const existing = await db.destinationCity.findUnique({ where: { id } })
    if (!existing) {
      return NextResponse.json({ error: 'Destination city not found' }, { status: 404 })
    }

    if (name && name.trim() && name.trim() !== existing.name) {
      const duplicate = await db.destinationCity.findUnique({ where: { name: name.trim() } })
      if (duplicate) {
        return NextResponse.json({ error: 'Destination city with this name already exists' }, { status: 400 })
      }
    }

    const changes: Record<string, unknown> = {}
    if (name !== undefined && name !== existing.name) changes.name = name
    if (region !== undefined && region !== existing.region) changes.region = region
    if (isActive !== undefined && isActive !== existing.isActive) changes.isActive = isActive

    const updated = await db.destinationCity.update({
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
        entity: 'DestinationCity',
        entityId: id,
        details: changes,
        ipAddress: getClientIp(request),
      }).catch(() => {})
    }

    return NextResponse.json(updated)
  } catch (error) {
    console.error('Destination city update error:', error)
    return NextResponse.json({ error: 'Failed to update destination city' }, { status: 500 })
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

    const existing = await db.destinationCity.findUnique({
      where: { id },
      include: { _count: { select: { DestinationZone: true, Trip: true } } },
    })
    if (!existing) {
      return NextResponse.json({ error: 'Destination city not found' }, { status: 404 })
    }

    const depCount = (existing._count.DestinationZone || 0) + (existing._count.Trip || 0)
    if (depCount > 0) {
      return NextResponse.json(
        { error: `Cannot delete: this destination city has ${existing._count.DestinationZone} zone(s) and ${existing._count.Trip} trip(s). Remove or reassign them first.` },
        { status: 400 }
      )
    }

    await db.destinationCity.delete({ where: { id } })

    createAuditLog({
      userId: auth.userId,
      action: 'delete',
      entity: 'DestinationCity',
      entityId: id,
      details: { name: existing.name },
      ipAddress: getClientIp(request),
    }).catch(() => {})

    return NextResponse.json({ success: true, id, message: 'Destination city deleted permanently' })
  } catch (error) {
    console.error('Destination city delete error:', error)
    return NextResponse.json({ error: 'Failed to delete destination city' }, { status: 500 })
  }
}
