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

    const record = await db.performanceBenchmark.findUnique({
      where: { id },
      include: {
        destinationZone: {
          select: { id: true, name: true, destinationCity: { select: { id: true, name: true, region: true } } },
        },
      },
    })

    if (!record) {
      return NextResponse.json({ error: 'Performance benchmark not found' }, { status: 404 })
    }

    return NextResponse.json(record)
  } catch (error) {
    console.error('Performance benchmark detail error:', error)
    return NextResponse.json({ error: 'Failed to fetch performance benchmark' }, { status: 500 })
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
    const {
      expectedMinMileage,
      expectedMaxMileage,
      warningMinMileage,
      warningMaxMileage,
      expectedMinFuel,
      expectedMaxFuel,
      warningMinFuel,
      warningMaxFuel,
      isActive,
    } = body

    const existing = await db.performanceBenchmark.findUnique({ where: { id } })
    if (!existing) {
      return NextResponse.json({ error: 'Performance benchmark not found' }, { status: 404 })
    }

    const changes: Record<string, unknown> = {}
    if (expectedMinMileage !== undefined && expectedMinMileage !== existing.expectedMinMileage) changes.expectedMinMileage = expectedMinMileage
    if (expectedMaxMileage !== undefined && expectedMaxMileage !== existing.expectedMaxMileage) changes.expectedMaxMileage = expectedMaxMileage
    if (warningMinMileage !== undefined && warningMinMileage !== existing.warningMinMileage) changes.warningMinMileage = warningMinMileage
    if (warningMaxMileage !== undefined && warningMaxMileage !== existing.warningMaxMileage) changes.warningMaxMileage = warningMaxMileage
    if (expectedMinFuel !== undefined && expectedMinFuel !== existing.expectedMinFuel) changes.expectedMinFuel = expectedMinFuel
    if (expectedMaxFuel !== undefined && expectedMaxFuel !== existing.expectedMaxFuel) changes.expectedMaxFuel = expectedMaxFuel
    if (warningMinFuel !== undefined && warningMinFuel !== existing.warningMinFuel) changes.warningMinFuel = warningMinFuel
    if (warningMaxFuel !== undefined && warningMaxFuel !== existing.warningMaxFuel) changes.warningMaxFuel = warningMaxFuel
    if (isActive !== undefined && isActive !== existing.isActive) changes.isActive = isActive

    const updated = await db.performanceBenchmark.update({
      where: { id },
      data: {
        ...(expectedMinMileage !== undefined && { expectedMinMileage: parseFloat(expectedMinMileage) }),
        ...(expectedMaxMileage !== undefined && { expectedMaxMileage: parseFloat(expectedMaxMileage) }),
        ...(warningMinMileage !== undefined && { warningMinMileage: warningMinMileage !== null ? parseFloat(warningMinMileage) : null }),
        ...(warningMaxMileage !== undefined && { warningMaxMileage: warningMaxMileage !== null ? parseFloat(warningMaxMileage) : null }),
        ...(expectedMinFuel !== undefined && { expectedMinFuel: expectedMinFuel !== null ? parseFloat(expectedMinFuel) : null }),
        ...(expectedMaxFuel !== undefined && { expectedMaxFuel: expectedMaxFuel !== null ? parseFloat(expectedMaxFuel) : null }),
        ...(warningMinFuel !== undefined && { warningMinFuel: warningMinFuel !== null ? parseFloat(warningMinFuel) : null }),
        ...(warningMaxFuel !== undefined && { warningMaxFuel: warningMaxFuel !== null ? parseFloat(warningMaxFuel) : null }),
        ...(isActive !== undefined && { isActive: Boolean(isActive) }),
      },
      include: {
        destinationZone: { select: { id: true, name: true } },
      },
    })

    if (Object.keys(changes).length > 0) {
      createAuditLog({
        userId: auth.userId,
        action: 'update',
        entity: 'PerformanceBenchmark',
        entityId: id,
        details: changes,
        ipAddress: getClientIp(request),
      }).catch(() => {})
    }

    return NextResponse.json(updated)
  } catch (error) {
    console.error('Performance benchmark update error:', error)
    return NextResponse.json({ error: 'Failed to update performance benchmark' }, { status: 500 })
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

    const existing = await db.performanceBenchmark.findUnique({ where: { id } })
    if (!existing) {
      return NextResponse.json({ error: 'Performance benchmark not found' }, { status: 404 })
    }

    await db.performanceBenchmark.delete({ where: { id } })

    createAuditLog({
      userId: auth.userId,
      action: 'delete',
      entity: 'PerformanceBenchmark',
      entityId: id,
      details: { destinationZoneId: existing.destinationZoneId },
      ipAddress: getClientIp(request),
    }).catch(() => {})

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('Performance benchmark delete error:', error)
    return NextResponse.json({ error: 'Failed to delete performance benchmark' }, { status: 500 })
  }
}
