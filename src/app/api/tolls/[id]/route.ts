import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { requireAuth, requireWriteAccess } from '@/lib/auth-server'
import { createAuditLog, getClientIp } from '@/lib/audit'

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params

    const record = await db.tollRecord.findUnique({
      where: { id },
      include: {
        truck: { select: { id: true, plateNumber: true, make: true, model: true } },
        driver: { select: { id: true, firstName: true, lastName: true, phone: true } },
        trip: { select: { id: true, tripNumber: true, loadingLocation: true, destination: true, status: true } },
      },
    })

    if (!record) {
      return NextResponse.json({ error: 'Toll record not found' }, { status: 404 })
    }

    return NextResponse.json(record)
  } catch (error) {
    console.error('Toll record detail error:', error)
    return NextResponse.json({ error: 'Failed to fetch toll record' }, { status: 500 })
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

    const existing = await db.tollRecord.findUnique({ where: { id } })
    if (!existing) {
      return NextResponse.json({ error: 'Toll record not found' }, { status: 404 })
    }

    const updateData: Record<string, unknown> = {}
    const allowedFields = [
      'truckId', 'driverId', 'tripId', 'tollPoint', 'tollType', 'location',
      'route', 'latitude', 'longitude', 'amount', 'paymentMethod', 'referenceNumber',
      'tollDate', 'direction', 'status', 'disputeReason', 'resolvedBy', 'resolvedAt',
      'vehicleWeight', 'overloaded', 'overloadFine', 'notes',
    ]

    for (const field of allowedFields) {
      if (body[field] !== undefined) {
        updateData[field] = field === 'tollDate' ? new Date(body[field]) : body[field]
      }
    }

    // If resolving a dispute, set resolved metadata
    if (body.status && body.status !== 'disputed' && existing.status === 'disputed') {
      updateData.resolvedBy = auth.userId
      updateData.resolvedAt = new Date()
    }

    const record = await db.tollRecord.update({
      where: { id },
      data: updateData,
      include: {
        truck: { select: { id: true, plateNumber: true, make: true, model: true } },
        driver: { select: { id: true, firstName: true, lastName: true } },
      },
    })

    // Audit log
    createAuditLog({
      userId: auth.userId,
      action: 'update',
      entity: 'TollRecord',
      entityId: id,
      details: { changes: updateData },
      ipAddress: getClientIp(request),
    }).catch(() => {})

    return NextResponse.json(record)
  } catch (error) {
    console.error('Toll record update error:', error)
    return NextResponse.json({ error: 'Failed to update toll record' }, { status: 500 })
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

    const existing = await db.tollRecord.findUnique({ where: { id } })
    if (!existing) {
      return NextResponse.json({ error: 'Toll record not found' }, { status: 404 })
    }

    await db.tollRecord.delete({ where: { id } })

    // Audit log
    createAuditLog({
      userId: auth.userId,
      action: 'delete',
      entity: 'TollRecord',
      entityId: id,
      details: { tollPoint: existing.tollPoint, amount: existing.amount },
      ipAddress: getClientIp(request),
    }).catch(() => {})

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('Toll record delete error:', error)
    return NextResponse.json({ error: 'Failed to delete toll record' }, { status: 500 })
  }
}
