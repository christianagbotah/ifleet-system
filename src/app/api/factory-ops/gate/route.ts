import { NextRequest, NextResponse } from 'next/server'

import { createAuditLog, getClientIp } from '@/lib/audit'
import { requireAuth, requireWriteAccess } from '@/lib/auth-server'
import { db } from '@/lib/db'
import {
  createGateService,
  FactoryOpsError,
  type FactoryOpsRepository,
  type QueueUpdateInput,
} from '@/lib/domain/factory-ops/service'

function repository(): FactoryOpsRepository {
  return {
    async isVehicleAuthorized({ siteId, truckId, tripId }) {
      if (!tripId) return false
      const [truck, trip] = await Promise.all([
        db.truck.findUnique({
          where: { id: truckId },
          select: { id: true, status: true },
        }),
        db.trip.findUnique({
          where: { id: tripId },
          select: { truckId: true, loadingPointId: true, status: true },
        }),
      ])

      if (!truck || truck.status !== 'active' || !trip) return false
      if (trip.truckId !== truckId || trip.loadingPointId !== siteId) return false
      return !['completed', 'cancelled'].includes(trip.status)
    },

    async findLatestGateEvent({ siteId, truckId }) {
      return db.gateEvent.findFirst({
        where: { siteId, truckId },
        orderBy: [{ occurredAt: 'desc' }, { createdAt: 'desc' }],
      })
    },

    async createGateEvent(input) {
      const site = await db.loadingPoint.findUnique({
        where: { id: input.siteId },
        select: { name: true },
      })
      return db.gateEvent.create({
        data: {
          siteId: input.siteId,
          siteName: site?.name ?? null,
          truckId: input.truckId,
          tripId: input.tripId,
          direction: input.direction,
          occurredAt: input.occurredAt,
          actorId: input.actorId,
          latitude: input.latitude ?? null,
          longitude: input.longitude ?? null,
          evidence: input.evidence ? JSON.stringify(input.evidence) : null,
        },
      })
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
      return db.factoryQueueEntry.update({
        where: { id },
        data: update,
      })
    },
  }
}

export async function GET(request: NextRequest) {
  const auth = requireAuth(request)
  if (auth instanceof NextResponse) return auth

  const { searchParams } = new URL(request.url)
  const siteId = searchParams.get('siteId')
  const truckId = searchParams.get('truckId')
  const tripId = searchParams.get('tripId')
  const rawLimit = Number(searchParams.get('limit') || 100)
  const limit = Number.isFinite(rawLimit) ? Math.min(Math.max(rawLimit, 1), 200) : 100

  const events = await db.gateEvent.findMany({
    where: {
      ...(siteId ? { siteId } : {}),
      ...(truckId ? { truckId } : {}),
      ...(tripId ? { tripId } : {}),
    },
    orderBy: [{ occurredAt: 'desc' }, { createdAt: 'desc' }],
    take: limit,
  })

  return NextResponse.json({ data: events })
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
    const direction = body.direction === 'in' || body.direction === 'out' ? body.direction : null

    if (!siteId || !truckId || !tripId || !direction) {
      return NextResponse.json(
        { error: 'siteId, truckId, tripId and direction (in/out) are required' },
        { status: 400 }
      )
    }

    const site = await db.loadingPoint.findUnique({
      where: { id: siteId },
      select: { id: true, isActive: true },
    })
    if (!site?.isActive) {
      return NextResponse.json({ error: 'Loading site is unavailable' }, { status: 409 })
    }

    const occurredAt = typeof body.occurredAt === 'string' ? new Date(body.occurredAt) : new Date()
    const service = createGateService(repository())
    const result = await service.record({
      siteId,
      truckId,
      tripId,
      direction,
      occurredAt,
      actorId: auth.userId,
      latitude: typeof body.latitude === 'number' ? body.latitude : null,
      longitude: typeof body.longitude === 'number' ? body.longitude : null,
      evidence: body.evidence && typeof body.evidence === 'object'
        ? body.evidence as Record<string, unknown>
        : null,
    })

    createAuditLog({
      userId: auth.userId,
      action: result.duplicate ? 'gate_scan_duplicate' : `gate_${direction}`,
      entity: 'GateEvent',
      entityId: result.event.id,
      details: { siteId, truckId, tripId, direction, duplicate: result.duplicate },
      ipAddress: getClientIp(request),
    }).catch(() => {})

    return NextResponse.json(result, { status: result.duplicate ? 200 : 201 })
  } catch (error) {
    if (error instanceof FactoryOpsError) {
      const status = error.code === 'invalid_timestamp' ? 400 : 409
      return NextResponse.json({ error: error.message, code: error.code }, { status })
    }
    console.error('Factory gate event error:', error)
    return NextResponse.json({ error: 'Failed to record gate event' }, { status: 500 })
  }
}
