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

    const record = await db.destinationZone.findUnique({
      where: { id },
      include: {
        destinationCity: { select: { id: true, name: true, region: true } },
        ZoneRate: {
          orderBy: { effectiveDate: 'desc' },
        },
        PerformanceBenchmark: {
          orderBy: { createdAt: 'desc' },
        },
        _count: { select: { Trip: true } },
      },
    })

    if (!record) {
      return NextResponse.json({ error: 'Destination zone not found' }, { status: 404 })
    }

    return NextResponse.json(record)
  } catch (error) {
    console.error('Destination zone detail error:', error)
    return NextResponse.json({ error: 'Failed to fetch destination zone' }, { status: 500 })
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
    const { name, destinationCityId, isActive } = body

    const existing = await db.destinationZone.findUnique({ where: { id } })
    if (!existing) {
      return NextResponse.json({ error: 'Destination zone not found' }, { status: 404 })
    }

    // Check uniqueness if changing name or city
    if ((name && name.trim() !== existing.name) || (destinationCityId && destinationCityId !== existing.destinationCityId)) {
      const checkName = (name?.trim() || existing.name)
      const checkCityId = destinationCityId || existing.destinationCityId
      const duplicate = await db.destinationZone.findUnique({
        where: { name_destinationCityId: { name: checkName, destinationCityId: checkCityId } },
      })
      if (duplicate) {
        return NextResponse.json(
          { error: 'Destination zone with this name already exists in this city' },
          { status: 400 }
        )
      }
    }

    if (destinationCityId) {
      const city = await db.destinationCity.findUnique({ where: { id: destinationCityId } })
      if (!city) {
        return NextResponse.json({ error: 'Destination city not found' }, { status: 400 })
      }
    }

    const changes: Record<string, unknown> = {}
    if (name !== undefined && name !== existing.name) changes.name = name
    if (destinationCityId !== undefined && destinationCityId !== existing.destinationCityId) changes.destinationCityId = destinationCityId
    if (isActive !== undefined && isActive !== existing.isActive) changes.isActive = isActive

    const updated = await db.destinationZone.update({
      where: { id },
      data: {
        ...(name !== undefined && { name: name.trim() }),
        ...(destinationCityId !== undefined && { destinationCityId }),
        ...(isActive !== undefined && { isActive: Boolean(isActive) }),
      },
      include: {
        destinationCity: { select: { id: true, name: true, region: true } },
      },
    })

    if (Object.keys(changes).length > 0) {
      createAuditLog({
        userId: auth.userId,
        action: 'update',
        entity: 'DestinationZone',
        entityId: id,
        details: changes,
        ipAddress: getClientIp(request),
      }).catch(() => {})
    }

    return NextResponse.json(updated)
  } catch (error) {
    console.error('Destination zone update error:', error)
    return NextResponse.json({ error: 'Failed to update destination zone' }, { status: 500 })
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

    const existing = await db.destinationZone.findUnique({
      where: { id },
      include: { _count: { select: { ClientZone: true, PerformanceBenchmark: true, Trip: true, TripDeliveryDestination: true, ZoneRate: true } } },
    })
    if (!existing) {
      return NextResponse.json({ error: 'Destination zone not found' }, { status: 404 })
    }

    const deps = existing._count
    const parts: string[] = []
    if (deps.ClientZone) parts.push(`${deps.ClientZone} client zone(s)`)
    if (deps.PerformanceBenchmark) parts.push(`${deps.PerformanceBenchmark} benchmark(s)`)
    if (deps.Trip) parts.push(`${deps.Trip} trip(s)`)
    if (deps.TripDeliveryDestination) parts.push(`${deps.TripDeliveryDestination} delivery destination(s)`)
    if (deps.ZoneRate) parts.push(`${deps.ZoneRate} rate(s)`)

    if (parts.length > 0) {
      return NextResponse.json(
        { error: `Cannot delete: this zone has ${parts.join(', ')}. Remove or reassign them first.` },
        { status: 400 }
      )
    }

    await db.destinationZone.delete({ where: { id } })

    createAuditLog({
      userId: auth.userId,
      action: 'delete',
      entity: 'DestinationZone',
      entityId: id,
      details: { name: existing.name },
      ipAddress: getClientIp(request),
    }).catch(() => {})

    return NextResponse.json({ success: true, id, message: 'Destination zone deleted permanently' })
  } catch (error) {
    console.error('Destination zone delete error:', error)
    return NextResponse.json({ error: 'Failed to delete destination zone' }, { status: 500 })
  }
}
