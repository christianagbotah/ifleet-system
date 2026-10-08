import { NextRequest, NextResponse } from 'next/server'

import { createAuditLog, getClientIp } from '@/lib/audit'
import { requireAuth, requireWriteAccess } from '@/lib/auth-server'
import { db } from '@/lib/db'
import { validateCoupling } from '@/lib/domain/fleet-assets/coupling'

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params
    const trailer = await db.trailer.findUnique({ where: { id }, select: { id: true } })
    if (!trailer) return NextResponse.json({ error: 'Trailer not found' }, { status: 404 })

    const data = await db.trailerCoupling.findMany({
      where: { trailerId: id },
      orderBy: { coupledAt: 'desc' },
      include: {
        tractor: { select: { id: true, plateNumber: true, status: true } },
        driver: { select: { id: true, firstName: true, lastName: true, status: true } },
        trip: { select: { id: true, tripNumber: true, status: true, destination: true } },
      },
    })

    return NextResponse.json({ data })
  } catch (error) {
    console.error('Trailer coupling history error:', error)
    return NextResponse.json({ error: 'Failed to fetch coupling history' }, { status: 500 })
  }
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const auth = requireAuth(request)
    if (auth instanceof NextResponse) return auth
    const writeGuard = requireWriteAccess(auth)
    if (writeGuard instanceof NextResponse) return writeGuard

    const { id: trailerId } = await params
    const body = await request.json()
    const action = body.action === 'decouple' ? 'decouple' : body.action === 'couple' ? 'couple' : null
    if (!action) return NextResponse.json({ error: 'action must be couple or decouple' }, { status: 400 })

    if (action === 'decouple') {
      const result = await db.$transaction(async (tx) => {
        const active = await tx.trailerCoupling.findFirst({
          where: { trailerId, decoupledAt: null },
          orderBy: { coupledAt: 'desc' },
        })
        if (!active) return { kind: 'not_found' as const }

        const coupling = await tx.trailerCoupling.update({
          where: { id: active.id },
          data: {
            decoupledAt: new Date(),
            decoupledLocation: typeof body.location === 'string' ? body.location.trim() || null : null,
            decoupledById: auth.userId,
          },
          include: {
            tractor: { select: { id: true, plateNumber: true } },
            driver: { select: { id: true, firstName: true, lastName: true } },
            trip: { select: { id: true, tripNumber: true, status: true } },
          },
        })
        return { kind: 'decoupled' as const, coupling }
      }, { isolationLevel: 'Serializable' })

      if (result.kind === 'not_found') {
        return NextResponse.json({ error: 'Trailer is not currently coupled' }, { status: 409 })
      }

      createAuditLog({
        userId: auth.userId,
        action: 'update',
        entity: 'TrailerCoupling',
        entityId: result.coupling.id,
        details: { action: 'decouple', trailerId, tractorId: result.coupling.tractorId },
        ipAddress: getClientIp(request),
      }).catch(() => {})

      return NextResponse.json(result.coupling)
    }

    const tractorId = typeof body.tractorId === 'string' ? body.tractorId.trim() : ''
    if (!tractorId) return NextResponse.json({ error: 'tractorId is required' }, { status: 400 })

    const outcome = await db.$transaction(async (tx) => {
      const [trailer, tractor, trip] = await Promise.all([
        tx.trailer.findUnique({ where: { id: trailerId } }),
        tx.truck.findUnique({ where: { id: tractorId }, select: { id: true, plateNumber: true, status: true } }),
        body.tripId
          ? tx.trip.findUnique({ where: { id: String(body.tripId) }, select: { id: true, truckId: true, driverId: true, trailerId: true } })
          : Promise.resolve(null),
      ])

      if (!trailer) return { kind: 'trailer_missing' as const }
      if (!tractor) return { kind: 'tractor_missing' as const }
      if (trip && trip.truckId !== tractorId) return { kind: 'trip_tractor_mismatch' as const }
      if (trip?.trailerId && trip.trailerId !== trailerId) return { kind: 'trip_trailer_conflict' as const }

      const activeCouplings = await tx.trailerCoupling.findMany({
        where: {
          decoupledAt: null,
          OR: [{ trailerId }, { tractorId }],
        },
        select: { id: true, tractorId: true, trailerId: true, coupledAt: true, decoupledAt: true },
      })

      const validation = validateCoupling(
        { tractorId, trailer: { id: trailer.id, status: trailer.status }, requiresTrailer: true },
        activeCouplings
      )
      if (!validation.valid) return { kind: 'conflict' as const, blocking: validation.blocking }

      const samePair = activeCouplings.find(
        (coupling) => coupling.tractorId === tractorId && coupling.trailerId === trailerId
      )
      if (samePair) {
        const coupling = await tx.trailerCoupling.findUnique({
          where: { id: samePair.id },
          include: {
            tractor: { select: { id: true, plateNumber: true } },
            driver: { select: { id: true, firstName: true, lastName: true } },
            trip: { select: { id: true, tripNumber: true, status: true } },
          },
        })
        return { kind: 'coupled' as const, coupling, existing: true }
      }

      const driverId = typeof body.driverId === 'string' && body.driverId.trim()
        ? body.driverId.trim()
        : trip?.driverId ?? null
      const coupling = await tx.trailerCoupling.create({
        data: {
          tractorId,
          trailerId,
          driverId,
          tripId: trip?.id ?? null,
          location: typeof body.location === 'string' ? body.location.trim() || null : null,
          latitude: typeof body.latitude === 'number' ? body.latitude : null,
          longitude: typeof body.longitude === 'number' ? body.longitude : null,
          odometer: typeof body.odometer === 'number' ? body.odometer : null,
          actorId: auth.userId,
          notes: typeof body.notes === 'string' ? body.notes.trim() || null : null,
        },
        include: {
          tractor: { select: { id: true, plateNumber: true } },
          driver: { select: { id: true, firstName: true, lastName: true } },
          trip: { select: { id: true, tripNumber: true, status: true } },
        },
      })

      if (trip && trip.trailerId !== trailerId) {
        await tx.trip.update({ where: { id: trip.id }, data: { trailerId } })
      }

      return { kind: 'coupled' as const, coupling, existing: false }
    }, { isolationLevel: 'Serializable' })

    if (outcome.kind === 'trailer_missing') return NextResponse.json({ error: 'Trailer not found' }, { status: 404 })
    if (outcome.kind === 'tractor_missing') return NextResponse.json({ error: 'Tractor not found' }, { status: 404 })
    if (outcome.kind === 'trip_tractor_mismatch') return NextResponse.json({ error: 'Trip is assigned to a different tractor' }, { status: 409 })
    if (outcome.kind === 'trip_trailer_conflict') return NextResponse.json({ error: 'Trip already records a different trailer' }, { status: 409 })
    if (outcome.kind === 'conflict') {
      return NextResponse.json(
        { error: 'Trailer coupling conflict', blocking: outcome.blocking },
        { status: 409 }
      )
    }

    if (!outcome.existing && outcome.coupling) {
      createAuditLog({
        userId: auth.userId,
        action: 'create',
        entity: 'TrailerCoupling',
        entityId: outcome.coupling.id,
        details: { action: 'couple', trailerId, tractorId, tripId: outcome.coupling.tripId },
        ipAddress: getClientIp(request),
      }).catch(() => {})
    }

    return NextResponse.json(outcome.coupling, { status: outcome.existing ? 200 : 201 })
  } catch (error) {
    console.error('Trailer coupling mutation error:', error)
    return NextResponse.json({ error: 'Failed to update trailer coupling' }, { status: 500 })
  }
}
