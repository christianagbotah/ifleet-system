import { NextRequest, NextResponse } from 'next/server'

import { createAuditLog, getClientIp } from '@/lib/audit'
import { requireAuth, requireWriteAccess } from '@/lib/auth-server'
import { db } from '@/lib/db'
import {
  createQueueService,
  FactoryOpsError,
  type FactoryOpsRepository,
  type QueueUpdateInput,
} from '@/lib/domain/factory-ops/service'

function queueRepository(): FactoryOpsRepository {
  return {
    async isVehicleAuthorized() {
      return false
    },
    async findLatestGateEvent() {
      return null
    },
    async createGateEvent() {
      throw new FactoryOpsError('unsupported_operation')
    },
    async getQueueEntry(id) {
      const entry = await db.factoryQueueEntry.findUnique({ where: { id } })
      if (!entry) return null
      return {
        ...entry,
        status: entry.status as 'waiting' | 'in_progress' | 'loading' | 'unloading' | 'completed' | 'cancelled',
      }
    },
    async updateQueueEntry(id, update: QueueUpdateInput) {
      return db.$transaction(async (tx) => {
        const existing = await tx.factoryQueueEntry.findUnique({ where: { id } })
        if (!existing) throw new FactoryOpsError('queue_not_found')

        const updated = await tx.factoryQueueEntry.update({
          where: { id },
          data: update,
        })

        if (existing.legacyQueueId) {
          await tx.depotQueue.update({
            where: { id: existing.legacyQueueId },
            data: {
              status: update.status as never,
              ...(update.startedAt ? { startedAt: update.startedAt } : {}),
              ...(update.completedAt ? { completedAt: update.completedAt } : {}),
              ...(update.actualWait !== undefined ? { actualWait: update.actualWait } : {}),
            },
          })
        }

        return updated
      }, { isolationLevel: 'Serializable' })
    },
  }
}

export async function GET(request: NextRequest) {
  const auth = requireAuth(request)
  if (auth instanceof NextResponse) return auth

  const { searchParams } = new URL(request.url)
  const siteId = searchParams.get('siteId')
  const status = searchParams.get('status')
  const rawLimit = Number(searchParams.get('limit') || 100)
  const limit = Number.isFinite(rawLimit) ? Math.min(Math.max(rawLimit, 1), 200) : 100

  const data = await db.factoryQueueEntry.findMany({
    where: {
      ...(siteId ? { siteId } : {}),
      ...(status ? { status } : {}),
    },
    orderBy: [{ position: 'asc' }, { joinedAt: 'asc' }],
    take: limit,
  })

  return NextResponse.json({ data })
}

export async function POST(request: NextRequest) {
  try {
    const auth = requireAuth(request)
    if (auth instanceof NextResponse) return auth
    const writeGuard = requireWriteAccess(auth)
    if (writeGuard instanceof NextResponse) return writeGuard

    const body = await request.json().catch(() => ({})) as Record<string, unknown>
    const siteId = typeof body.siteId === 'string' ? body.siteId.trim() : ''
    const truckId = typeof body.truckId === 'string' ? body.truckId.trim() : ''
    const tripId = typeof body.tripId === 'string' ? body.tripId.trim() : ''
    const driverId = typeof body.driverId === 'string' && body.driverId.trim() ? body.driverId.trim() : null
    const queueType = typeof body.queueType === 'string' && body.queueType.trim() ? body.queueType.trim() : 'loading'

    if (!siteId || !truckId || !tripId) {
      return NextResponse.json({ error: 'siteId, truckId and tripId are required' }, { status: 400 })
    }

    const [site, truck, trip] = await Promise.all([
      db.loadingPoint.findUnique({ where: { id: siteId }, select: { id: true, name: true, isActive: true } }),
      db.truck.findUnique({ where: { id: truckId }, select: { id: true, status: true } }),
      db.trip.findUnique({ where: { id: tripId }, select: { id: true, truckId: true, driverId: true, loadingPointId: true } }),
    ])

    if (!site?.isActive) return NextResponse.json({ error: 'Loading site is unavailable' }, { status: 409 })
    if (!truck || truck.status !== 'active') return NextResponse.json({ error: 'Truck is unavailable' }, { status: 409 })
    if (!trip || trip.truckId !== truckId || trip.loadingPointId !== siteId) {
      return NextResponse.json({ error: 'Trip is not authorized for this truck and loading site' }, { status: 409 })
    }
    if (driverId && trip.driverId !== driverId) {
      return NextResponse.json({ error: 'Driver does not match the assigned trip driver' }, { status: 409 })
    }

    const estimatedWait = typeof body.estimatedWait === 'number' ? Math.max(0, Math.round(body.estimatedWait)) : null
    const detentionFreeMinutes = typeof body.detentionFreeMinutes === 'number'
      ? Math.max(0, Math.round(body.detentionFreeMinutes))
      : null
    const notes = typeof body.notes === 'string' ? body.notes.trim() || null : null

    const created = await db.$transaction(async (tx) => {
      const maxPosition = await tx.factoryQueueEntry.aggregate({
        where: { siteId, status: 'waiting' },
        _max: { position: true },
      })
      const position = (maxPosition._max.position ?? 0) + 1

      const legacyQueue = await tx.depotQueue.create({
        data: {
          truckId,
          driverId: driverId ?? trip.driverId,
          tripId,
          depotName: site.name,
          queueType,
          position,
          estimatedWait,
          notes,
          createdBy: auth.userId,
        },
      })

      return tx.factoryQueueEntry.create({
        data: {
          legacyQueueId: legacyQueue.id,
          siteId,
          siteName: site.name,
          truckId,
          driverId: driverId ?? trip.driverId,
          tripId,
          queueType,
          position,
          estimatedWait,
          detentionFreeMinutes,
          notes,
          createdBy: auth.userId,
        },
      })
    }, { isolationLevel: 'Serializable' })

    createAuditLog({
      userId: auth.userId,
      action: 'create',
      entity: 'FactoryQueueEntry',
      entityId: created.id,
      details: { siteId, truckId, tripId, legacyQueueId: created.legacyQueueId, position: created.position },
      ipAddress: getClientIp(request),
    }).catch(() => {})

    return NextResponse.json(created, { status: 201 })
  } catch (error) {
    console.error('Factory queue create error:', error)
    return NextResponse.json({ error: 'Failed to create factory queue entry' }, { status: 500 })
  }
}

export async function PUT(request: NextRequest) {
  try {
    const auth = requireAuth(request)
    if (auth instanceof NextResponse) return auth
    const writeGuard = requireWriteAccess(auth)
    if (writeGuard instanceof NextResponse) return writeGuard

    const body = await request.json().catch(() => ({})) as Record<string, unknown>
    const queueId = typeof body.queueId === 'string' ? body.queueId.trim() : ''
    const action = typeof body.action === 'string' ? body.action : ''
    const allowedActions = ['call_to_bay', 'start_loading', 'start_unloading', 'complete', 'cancel'] as const

    if (!queueId || !allowedActions.includes(action as (typeof allowedActions)[number])) {
      return NextResponse.json({ error: 'queueId and a valid action are required' }, { status: 400 })
    }

    const service = createQueueService(queueRepository())
    const result = await service.advance({
      queueId,
      action: action as (typeof allowedActions)[number],
      occurredAt: typeof body.occurredAt === 'string' ? new Date(body.occurredAt) : new Date(),
      bayId: typeof body.bayId === 'string' ? body.bayId.trim() || null : undefined,
    })

    createAuditLog({
      userId: auth.userId,
      action: `factory_queue_${action}`,
      entity: 'FactoryQueueEntry',
      entityId: queueId,
      details: { action, status: result.status },
      ipAddress: getClientIp(request),
    }).catch(() => {})

    return NextResponse.json(result)
  } catch (error) {
    if (error instanceof FactoryOpsError) {
      return NextResponse.json({ error: error.message, code: error.code }, { status: error.code === 'queue_not_found' ? 404 : 409 })
    }
    console.error('Factory queue update error:', error)
    return NextResponse.json({ error: 'Failed to update factory queue entry' }, { status: 500 })
  }
}
