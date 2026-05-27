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

    const record = await db.borderCrossing.findUnique({
      where: { id },
      include: {
        truck: { select: { id: true, plateNumber: true, make: true, model: true } },
        driver: { select: { id: true, firstName: true, lastName: true, phone: true } },
        trip: { select: { id: true, tripNumber: true, loadingLocation: true, destination: true, status: true } },
        user: { select: { id: true, name: true } },
      },
    })

    if (!record) {
      return NextResponse.json({ error: 'Border crossing not found' }, { status: 404 })
    }

    return NextResponse.json(record)
  } catch (error) {
    console.error('Border crossing detail error:', error)
    return NextResponse.json({ error: 'Failed to fetch border crossing' }, { status: 500 })
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

    const existing = await db.borderCrossing.findUnique({ where: { id } })
    if (!existing) {
      return NextResponse.json({ error: 'Border crossing not found' }, { status: 404 })
    }

    const updateData: Record<string, unknown> = {}

    const allowedFields = [
      'borderName', 'country', 'direction', 'status',
      'estimatedWait', 'actualWait', 'clearanceFee',
      'documentStatus', 'notes',
    ]

    for (const field of allowedFields) {
      if (body[field] !== undefined) {
        updateData[field] = body[field]
      }
    }

    // Handle status transitions with timestamps
    if (body.status === 'processing' && existing.status === 'queued') {
      updateData.processingAt = new Date()
    }
    if (body.status === 'cleared' && (existing.status === 'processing' || existing.status === 'queued')) {
      updateData.clearedAt = new Date()
      if (existing.queuedAt) {
        const waitMinutes = Math.round((Date.now() - new Date(existing.queuedAt).getTime()) / 60000)
        updateData.actualWait = waitMinutes
      }
    }
    if (body.status === 'denied' && (existing.status === 'processing' || existing.status === 'queued')) {
      updateData.clearedAt = new Date()
      if (existing.queuedAt) {
        const waitMinutes = Math.round((Date.now() - new Date(existing.queuedAt).getTime()) / 60000)
        updateData.actualWait = waitMinutes
      }
    }

    const record = await db.borderCrossing.update({
      where: { id },
      data: updateData,
      include: {
        truck: { select: { id: true, plateNumber: true, make: true, model: true } },
        driver: { select: { id: true, firstName: true, lastName: true } },
        trip: { select: { id: true, tripNumber: true, destination: true, status: true } },
      },
    })

    createAuditLog({
      userId: auth.userId,
      action: 'status_change',
      entity: 'BorderCrossing',
      entityId: id,
      details: { fromStatus: existing.status, toStatus: body.status, borderName: existing.borderName },
      ipAddress: getClientIp(request),
    }).catch(() => {})

    return NextResponse.json(record)
  } catch (error) {
    console.error('Border crossing update error:', error)
    return NextResponse.json({ error: 'Failed to update border crossing' }, { status: 500 })
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

    const existing = await db.borderCrossing.findUnique({ where: { id } })
    if (!existing) {
      return NextResponse.json({ error: 'Border crossing not found' }, { status: 404 })
    }

    await db.borderCrossing.delete({ where: { id } })

    createAuditLog({
      userId: auth.userId,
      action: 'delete',
      entity: 'BorderCrossing',
      entityId: id,
      details: { borderName: existing.borderName, country: existing.country },
      ipAddress: getClientIp(request),
    }).catch(() => {})

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('Border crossing delete error:', error)
    return NextResponse.json({ error: 'Failed to delete border crossing' }, { status: 500 })
  }
}
