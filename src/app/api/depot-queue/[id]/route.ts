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

    const record = await db.depotQueue.findUnique({
      where: { id },
      include: {
        truck: { select: { id: true, plateNumber: true, make: true, model: true } },
        driver: { select: { id: true, firstName: true, lastName: true, phone: true } },
        trip: { select: { id: true, tripNumber: true, loadingLocation: true, destination: true, status: true } },
        creator: { select: { id: true, name: true } },
      },
    })

    if (!record) {
      return NextResponse.json({ error: 'Depot queue entry not found' }, { status: 404 })
    }

    return NextResponse.json(record)
  } catch (error) {
    console.error('Depot queue detail error:', error)
    return NextResponse.json({ error: 'Failed to fetch depot queue entry' }, { status: 500 })
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

    const existing = await db.depotQueue.findUnique({ where: { id } })
    if (!existing) {
      return NextResponse.json({ error: 'Depot queue entry not found' }, { status: 404 })
    }

    const updateData: Record<string, unknown> = {}

    const allowedFields = [
      'depotName', 'queueType', 'status', 'position',
      'estimatedWait', 'actualWait', 'notes',
    ]

    for (const field of allowedFields) {
      if (body[field] !== undefined) {
        updateData[field] = body[field]
      }
    }

    // Handle status transitions with timestamps
    if (body.status === 'in_progress' && existing.status === 'waiting') {
      updateData.startedAt = new Date()
    }
    if (body.status === 'completed' && (existing.status === 'in_progress' || existing.status === 'waiting')) {
      updateData.completedAt = new Date()
      if (existing.joinedAt) {
        const waitMinutes = Math.round((Date.now() - new Date(existing.joinedAt).getTime()) / 60000)
        updateData.actualWait = waitMinutes
      }
    }

    // Handle position swap
    if (body.position !== undefined && body.position !== existing.position) {
      // Swap positions with the entry at the target position
      const targetEntry = await db.depotQueue.findFirst({
        where: { depotName: existing.depotName, status: 'waiting', position: body.position },
      })
      if (targetEntry) {
        await db.depotQueue.update({
          where: { id: targetEntry.id },
          data: { position: existing.position },
        })
      }
    }

    const record = await db.depotQueue.update({
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
      action: body.status ? 'status_change' : 'update',
      entity: 'DepotQueue',
      entityId: id,
      details: { fromStatus: existing.status, toStatus: body.status, depotName: existing.depotName, position: record.position },
      ipAddress: getClientIp(request),
    }).catch(() => {})

    return NextResponse.json(record)
  } catch (error) {
    console.error('Depot queue update error:', error)
    return NextResponse.json({ error: 'Failed to update depot queue entry' }, { status: 500 })
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

    const existing = await db.depotQueue.findUnique({ where: { id } })
    if (!existing) {
      return NextResponse.json({ error: 'Depot queue entry not found' }, { status: 404 })
    }

    await db.depotQueue.delete({ where: { id } })

    // Re-index remaining entries for this depot
    const remaining = await db.depotQueue.findMany({
      where: { depotName: existing.depotName, status: 'waiting' },
      orderBy: { joinedAt: 'asc' },
    })
    for (let i = 0; i < remaining.length; i++) {
      await db.depotQueue.update({
        where: { id: remaining[i].id },
        data: { position: i + 1 },
      })
    }

    createAuditLog({
      userId: auth.userId,
      action: 'delete',
      entity: 'DepotQueue',
      entityId: id,
      details: { depotName: existing.depotName, queueType: existing.queueType },
      ipAddress: getClientIp(request),
    }).catch(() => {})

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('Depot queue delete error:', error)
    return NextResponse.json({ error: 'Failed to delete depot queue entry' }, { status: 500 })
  }
}
