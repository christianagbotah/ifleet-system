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

    const record = await db.zoneRate.findUnique({
      where: { id },
      include: {
        destinationZone: {
          select: { id: true, name: true, destinationCity: { select: { id: true, name: true, region: true } } },
        },
      },
    })

    if (!record) {
      return NextResponse.json({ error: 'Zone rate not found' }, { status: 404 })
    }

    return NextResponse.json(record)
  } catch (error) {
    console.error('Zone rate detail error:', error)
    return NextResponse.json({ error: 'Failed to fetch zone rate' }, { status: 500 })
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
    const { rateAmount, minMileage, maxMileage, expectedFuelConsumption, effectiveDate, isActive } = body

    const existing = await db.zoneRate.findUnique({ where: { id } })
    if (!existing) {
      return NextResponse.json({ error: 'Zone rate not found' }, { status: 404 })
    }

    const changes: Record<string, unknown> = {}
    if (rateAmount !== undefined && rateAmount !== existing.rateAmount) changes.rateAmount = rateAmount
    if (minMileage !== undefined && minMileage !== existing.minMileage) changes.minMileage = minMileage
    if (maxMileage !== undefined && maxMileage !== existing.maxMileage) changes.maxMileage = maxMileage
    if (expectedFuelConsumption !== undefined && expectedFuelConsumption !== existing.expectedFuelConsumption) changes.expectedFuelConsumption = expectedFuelConsumption
    if (effectiveDate !== undefined) changes.effectiveDate = effectiveDate
    if (isActive !== undefined && isActive !== existing.isActive) changes.isActive = isActive

    const updated = await db.zoneRate.update({
      where: { id },
      data: {
        ...(rateAmount !== undefined && { rateAmount: parseFloat(rateAmount) }),
        ...(minMileage !== undefined && { minMileage: minMileage !== null ? parseFloat(minMileage) : null }),
        ...(maxMileage !== undefined && { maxMileage: maxMileage !== null ? parseFloat(maxMileage) : null }),
        ...(expectedFuelConsumption !== undefined && { expectedFuelConsumption: expectedFuelConsumption !== null ? parseFloat(expectedFuelConsumption) : null }),
        ...(effectiveDate !== undefined && { effectiveDate: effectiveDate ? new Date(effectiveDate) : new Date() }),
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
        entity: 'ZoneRate',
        entityId: id,
        details: changes,
        ipAddress: getClientIp(request),
      }).catch(() => {})
    }

    return NextResponse.json(updated)
  } catch (error) {
    console.error('Zone rate update error:', error)
    return NextResponse.json({ error: 'Failed to update zone rate' }, { status: 500 })
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

    const existing = await db.zoneRate.findUnique({ where: { id } })
    if (!existing) {
      return NextResponse.json({ error: 'Zone rate not found' }, { status: 404 })
    }

    await db.zoneRate.delete({ where: { id } })

    createAuditLog({
      userId: auth.userId,
      action: 'delete',
      entity: 'ZoneRate',
      entityId: id,
      details: { rateAmount: existing.rateAmount, destinationZoneId: existing.destinationZoneId },
      ipAddress: getClientIp(request),
    }).catch(() => {})

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('Zone rate delete error:', error)
    return NextResponse.json({ error: 'Failed to delete zone rate' }, { status: 500 })
  }
}
