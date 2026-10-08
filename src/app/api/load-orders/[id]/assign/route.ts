import { randomUUID } from 'node:crypto'
import { NextRequest, NextResponse } from 'next/server'

import { createAuditLog, getClientIp } from '@/lib/audit'
import { requireAuth, requireWriteAccess } from '@/lib/auth-server'
import { db } from '@/lib/db'
import { evaluateAssignmentEligibility } from '@/lib/domain/dispatch/eligibility'
import { validateCoupling } from '@/lib/domain/fleet-assets/coupling'
import { allocateLoadOrderQuantity } from '@/lib/domain/orders/load-order'
import { dispatchTripStatusNotification } from '@/lib/services/trip-status-notifier'

function stringList(value: string | null | undefined): string[] {
  if (!value) return []
  try {
    const parsed = JSON.parse(value)
    return Array.isArray(parsed) ? parsed.map(String).filter(Boolean) : []
  } catch {
    return value.split(',').map((part) => part.trim()).filter(Boolean)
  }
}

function settings(value: string | null | undefined): Record<string, unknown> {
  if (!value) return {}
  try {
    const parsed = JSON.parse(value)
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : {}
  } catch {
    return {}
  }
}

class AssignmentConflictError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'AssignmentConflictError'
  }
}

function isSerializableWriteConflict(error: unknown): boolean {
  return typeof error === 'object' && error !== null && 'code' in error && (error as { code?: unknown }).code === 'P2034'
}

export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const auth = requireAuth(request)
    if (auth instanceof NextResponse) return auth
    const writeGuard = requireWriteAccess(auth)
    if (writeGuard instanceof NextResponse) return writeGuard

    const { id } = await params
    const body = await request.json() as Record<string, unknown>
    const driverId = typeof body.driverId === 'string' ? body.driverId.trim() : ''
    const tractorId = typeof body.tractorId === 'string' ? body.tractorId.trim() : ''
    const trailerId = typeof body.trailerId === 'string' && body.trailerId.trim() ? body.trailerId.trim() : null
    const existingTripId = typeof body.tripId === 'string' && body.tripId.trim() ? body.tripId.trim() : null
    const overrideReason = typeof body.overrideReason === 'string' ? body.overrideReason.trim() : ''
    if (!driverId || !tractorId) {
      return NextResponse.json({ error: 'driverId and tractorId are required' }, { status: 400 })
    }

    const order = await db.loadOrder.findUnique({
      where: { id },
      include: {
        shipperProfile: { include: { ShipperSiteRule: true } },
        loadingPoint: { include: { loadingCity: true } },
        LoadOrderLine: true,
        LoadOrderDestination: { orderBy: { stopOrder: 'asc' } },
        Trip: { include: { TripItem: true } },
      },
    })
    if (!order) return NextResponse.json({ error: 'Load order not found' }, { status: 404 })
    if (order.status === 'completed' || order.status === 'cancelled') {
      return NextResponse.json({ error: `Load order is ${order.status} and cannot be assigned` }, { status: 409 })
    }

    const [driver, tractor, trailer, documents, driverConflict, tractorConflict, activeCouplings] = await Promise.all([
      db.driver.findUnique({ where: { id: driverId } }),
      db.truck.findUnique({
        where: { id: tractorId },
        include: {
          Insurance: { orderBy: { endDate: 'desc' }, take: 1 },
          RoadworthyInspection: { orderBy: { inspectionDate: 'desc' }, take: 1 },
          MaintenanceRecord: { where: { status: { in: ['pending', 'in_progress'] } }, take: 1 },
        },
      }),
      trailerId ? db.trailer.findUnique({ where: { id: trailerId } }) : Promise.resolve(null),
      db.document.findMany({
        where: {
          OR: [
            { entityType: 'Driver', entityId: driverId },
            { entityType: 'Truck', entityId: tractorId },
            ...(trailerId ? [{ entityType: 'Trailer', entityId: trailerId }] : []),
          ],
        },
        select: { category: true },
      }),
      db.trip.findFirst({
        where: { driverId, id: existingTripId ? { not: existingTripId } : undefined, status: { notIn: ['completed', 'cancelled'] } },
        select: { id: true, tripNumber: true },
      }),
      db.trip.findFirst({
        where: { truckId: tractorId, id: existingTripId ? { not: existingTripId } : undefined, status: { notIn: ['completed', 'cancelled'] } },
        select: { id: true, tripNumber: true },
      }),
      trailerId
        ? db.trailerCoupling.findMany({
            where: { decoupledAt: null, OR: [{ trailerId }, { tractorId }] },
            select: { id: true, tractorId: true, trailerId: true, coupledAt: true, decoupledAt: true },
          })
        : Promise.resolve([]),
    ])

    if (!driver) return NextResponse.json({ error: 'Driver not found' }, { status: 404 })
    if (!tractor) return NextResponse.json({ error: 'Tractor not found' }, { status: 404 })
    if (trailerId && !trailer) return NextResponse.json({ error: 'Trailer not found' }, { status: 404 })
    if (driverConflict) return NextResponse.json({ error: `Driver already has active trip ${driverConflict.tripNumber}` }, { status: 409 })
    if (tractorConflict) return NextResponse.json({ error: `Tractor already has active trip ${tractorConflict.tripNumber}` }, { status: 409 })

    if (trailer) {
      const coupling = validateCoupling(
        { tractorId, trailer: { id: trailer.id, status: trailer.status }, requiresTrailer: true },
        activeCouplings
      )
      if (!coupling.valid) {
        return NextResponse.json({ error: 'Trailer coupling conflict', blocking: coupling.blocking }, { status: 409 })
      }
    }

    const siteRule = order.shipperProfile.ShipperSiteRule.find((rule) => rule.loadingPointId === order.loadingPointId && rule.isActive)
    const profileSettings = settings(order.shipperProfile.extensibleSettings)
    const allowedLicenseClasses = Array.isArray(profileSettings.allowedLicenseClasses)
      ? profileSettings.allowedLicenseClasses.map(String)
      : []
    const allowedTrailerTypes = order.requiredTrailerType
      ? [order.requiredTrailerType]
      : stringList(siteRule?.allowedTrailerTypes ?? order.shipperProfile.allowedTrailerTypes)
    const requiredDocuments = stringList(siteRule?.requiredDocuments ?? order.shipperProfile.requiredDocuments)
    const latestInsurance = tractor.Insurance[0] ?? null
    const latestRoadworthy = tractor.RoadworthyInspection[0] ?? null
    const documentValidity = new Map<string, Date | null>()
    for (const document of documents) documentValidity.set(document.category, null)
    if (driver.ghanaCardNumber) documentValidity.set('ghana_card', driver.ghanaCardExpiry ?? null)
    if (driver.licenseNumber) documentValidity.set('driver_license', driver.licenseExpiry)
    if (latestInsurance) documentValidity.set('insurance', latestInsurance.endDate)
    if (latestRoadworthy) documentValidity.set('roadworthy', latestRoadworthy.certificateExpiry ?? null)
    if (trailer?.registrationExpiry) documentValidity.set('trailer_registration', trailer.registrationExpiry)
    if (trailer?.roadworthyExpiry) documentValidity.set('trailer_roadworthy', trailer.roadworthyExpiry)

    const eligibility = evaluateAssignmentEligibility({
      now: new Date(),
      driver: {
        id: driver.id,
        status: driver.status,
        verificationStatus: driver.verificationStatus,
        licenseExpiry: driver.licenseExpiry,
        licenseClass: driver.licenseClass,
      },
      tractor: { id: tractor.id, status: tractor.status },
      insurance: latestInsurance ? { status: latestInsurance.status, endDate: latestInsurance.endDate } : null,
      roadworthy: latestRoadworthy ? {
        status: latestRoadworthy.status,
        result: latestRoadworthy.result,
        vehicleFitness: latestRoadworthy.vehicleFitness,
        certificateIssued: latestRoadworthy.certificateIssued,
        certificateExpiry: latestRoadworthy.certificateExpiry,
      } : null,
      maintenance: { blocking: tractor.MaintenanceRecord.length > 0 },
      trailer: trailer ? {
        id: trailer.id,
        status: trailer.status,
        trailerType: trailer.trailerType,
        registrationExpiry: trailer.registrationExpiry,
        roadworthyExpiry: trailer.roadworthyExpiry,
      } : null,
      requirements: {
        requiresTrailer: Boolean(order.requiredTrailerType),
        allowedLicenseClasses,
        allowedTrailerTypes,
        requiredDocuments,
      },
      documents: [...documentValidity].map(([category, validUntil]) => ({ category, validUntil })),
      override: body.override === true ? {
        authorized: true,
        actorRole: auth.roleName,
        reason: overrideReason,
      } : null,
    })
    if (body.preview === true) {
      return NextResponse.json({ eligibility })
    }
    if (!eligibility.passed) {
      return NextResponse.json(
        { error: `Assignment blocked: ${eligibility.blocking.join(', ')}`, eligibility },
        { status: 409 }
      )
    }

    const currentAllocation = allocateLoadOrderQuantity(
      { lines: order.LoadOrderLine.map((line) => ({ id: line.id, quantity: line.orderedQuantity })) },
      order.Trip.filter((trip) => trip.id !== existingTripId).map((trip) => ({ status: trip.status, items: trip.TripItem.map((item) => ({ loadOrderLineId: item.loadOrderLineId, quantity: item.quantity })) }))
    )
    const remainingByLine = new Map(currentAllocation.lines.map((line) => [line.lineId, line.remaining]))
    const requested = Array.isArray(body.allocations) ? body.allocations as Array<Record<string, unknown>> : []
    const allocations = requested.length
      ? requested.map((item) => ({ lineId: String(item.lineId || ''), quantity: Number(item.quantity) }))
      : order.LoadOrderLine.map((line) => ({ lineId: line.id, quantity: Math.max(0, remainingByLine.get(line.id) ?? 0) })).filter((item) => item.quantity > 0)

    if (!allocations.length) return NextResponse.json({ error: 'Load order has no remaining quantity to allocate' }, { status: 409 })
    const lineById = new Map(order.LoadOrderLine.map((line) => [line.id, line]))
    for (const allocation of allocations) {
      const line = lineById.get(allocation.lineId)
      const remaining = remainingByLine.get(allocation.lineId)
      if (!line || remaining == null || !Number.isFinite(allocation.quantity) || allocation.quantity <= 0) {
        return NextResponse.json({ error: `Invalid allocation for line ${allocation.lineId}` }, { status: 400 })
      }
      if (allocation.quantity > remaining + 0.000001) {
        return NextResponse.json({ error: `Allocation exceeds remaining quantity for ${line.itemName}` }, { status: 409 })
      }
    }

    const firstDestination = order.LoadOrderDestination[0]
    const firstAllocationLine = lineById.get(allocations[0].lineId)!
    const departureTime = body.departureTime ? new Date(String(body.departureTime)) : order.pickupWindowStart ?? new Date()
    if (Number.isNaN(departureTime.getTime())) return NextResponse.json({ error: 'Invalid departureTime' }, { status: 400 })

    const trip = await db.$transaction(async (tx) => {
      const [liveOrder, liveDriverConflict, liveTractorConflict, liveCouplings] = await Promise.all([
        tx.loadOrder.findUnique({
          where: { id: order.id },
          include: { LoadOrderLine: true, Trip: { include: { TripItem: true } } },
        }),
        tx.trip.findFirst({
          where: { driverId, id: existingTripId ? { not: existingTripId } : undefined, status: { notIn: ['completed', 'cancelled'] } },
          select: { id: true, tripNumber: true },
        }),
        tx.trip.findFirst({
          where: { truckId: tractorId, id: existingTripId ? { not: existingTripId } : undefined, status: { notIn: ['completed', 'cancelled'] } },
          select: { id: true, tripNumber: true },
        }),
        trailerId
          ? tx.trailerCoupling.findMany({
              where: { decoupledAt: null, OR: [{ trailerId }, { tractorId }] },
              select: { id: true, tractorId: true, trailerId: true, coupledAt: true, decoupledAt: true },
            })
          : Promise.resolve([]),
      ])

      if (!liveOrder) throw new AssignmentConflictError('Load order no longer exists')
      if (['completed', 'cancelled'].includes(liveOrder.status)) {
        throw new AssignmentConflictError(`Load order is ${liveOrder.status} and cannot be assigned`)
      }
      if (liveDriverConflict) throw new AssignmentConflictError(`Driver already has active trip ${liveDriverConflict.tripNumber}`)
      if (liveTractorConflict) throw new AssignmentConflictError(`Tractor already has active trip ${liveTractorConflict.tripNumber}`)

      if (trailer) {
        const liveCoupling = validateCoupling(
          { tractorId, trailer: { id: trailer.id, status: trailer.status }, requiresTrailer: true },
          liveCouplings
        )
        if (!liveCoupling.valid) {
          throw new AssignmentConflictError(`Trailer coupling conflict: ${liveCoupling.blocking.join(', ')}`)
        }
      }

      const liveAllocation = allocateLoadOrderQuantity(
        { lines: liveOrder.LoadOrderLine.map((line) => ({ id: line.id, quantity: line.orderedQuantity })) },
        liveOrder.Trip
          .filter((candidate) => candidate.id !== existingTripId)
          .map((candidate) => ({
            status: candidate.status,
            items: candidate.TripItem.map((item) => ({ loadOrderLineId: item.loadOrderLineId, quantity: item.quantity })),
          }))
      )
      const liveRemainingByLine = new Map(liveAllocation.lines.map((line) => [line.lineId, line.remaining]))
      const liveLineById = new Map(liveOrder.LoadOrderLine.map((line) => [line.id, line]))
      for (const allocation of allocations) {
        const line = liveLineById.get(allocation.lineId)
        const remaining = liveRemainingByLine.get(allocation.lineId)
        if (!line || remaining == null || allocation.quantity > remaining + 0.000001) {
          throw new AssignmentConflictError(`Load allocation changed for ${line?.itemName ?? allocation.lineId}; refresh and retry`)
        }
      }

      let tripId = existingTripId
      const existing = existingTripId ? liveOrder.Trip.find((candidate) => candidate.id === existingTripId) : null
      const tripNumber = existingTripId
        ? existing?.tripNumber
        : `TRP-${new Date().getFullYear()}-${randomUUID().slice(0, 8).toUpperCase()}`
      if (!tripNumber) throw new AssignmentConflictError('Existing trip is not part of this load order')
      if (existing && existing.status !== 'scheduled') {
        throw new AssignmentConflictError('Existing trip must be scheduled before assignment')
      }

      const firstLiveAllocationLine = liveLineById.get(allocations[0].lineId)
      if (!firstLiveAllocationLine) throw new AssignmentConflictError('Selected load line no longer exists')
      const baseData = {
        truckId: tractorId,
        driverId,
        trailerId,
        loadOrderId: order.id,
        loadingLocation: order.loadingPoint.name,
        loadingAddress: null,
        destination: firstDestination?.name ?? 'Destination pending',
        destinationAddress: firstDestination?.address ?? null,
        itemId: firstLiveAllocationLine.itemId,
        itemName: allocations.length === 1 ? firstLiveAllocationLine.itemName : `Multi-line load (${allocations.length} items)`,
        quantity: allocations[0].quantity,
        unit: firstLiveAllocationLine.unit,
        totalRevenue: order.offeredRate,
        departureTime,
        deliveryType: order.LoadOrderDestination.length > 1 ? 'MULTI' : 'SINGLE',
        loadingPointId: order.loadingPointId,
        destinationZoneId: firstDestination?.destinationZoneId ?? null,
        customerName: firstDestination?.contactName ?? null,
        customerPhone: firstDestination?.contactPhone ?? null,
        clientId: order.clientId,
        status: 'assigned' as const,
      }

      if (tripId) {
        await tx.tripItem.deleteMany({ where: { tripId } })
        await tx.tripDeliveryDestination.deleteMany({ where: { tripId } })
        await tx.trip.update({ where: { id: tripId }, data: baseData })
      } else {
        const created = await tx.trip.create({ data: { ...baseData, tripNumber } })
        tripId = created.id
      }

      const destinationMap = new Map<string, string>()
      for (const destination of order.LoadOrderDestination) {
        const destinationId = randomUUID()
        destinationMap.set(destination.id, destinationId)
        await tx.tripDeliveryDestination.create({
          data: {
            id: destinationId,
            tripId: tripId!,
            destinationZoneId: destination.destinationZoneId,
            clientId: destination.clientId,
            customerName: destination.name,
            customerPhone: destination.contactPhone,
            stopOrder: destination.stopOrder,
            address: destination.address,
            notes: destination.notes,
          },
        })
      }

      for (const allocation of allocations) {
        const line = liveLineById.get(allocation.lineId)!
        await tx.tripItem.create({
          data: {
            tripId: tripId!,
            loadingPointId: order.loadingPointId,
            itemId: line.itemId,
            itemName: line.itemName,
            unit: line.unit,
            quantity: allocation.quantity,
            deliveryDestinationId: line.destinationId ? destinationMap.get(line.destinationId) ?? null : null,
            loadOrderLineId: line.id,
          },
        })
      }

      const sameCoupling = trailerId
        ? liveCouplings.find((coupling) => coupling.tractorId === tractorId && coupling.trailerId === trailerId)
        : null
      if (trailerId && !sameCoupling) {
        await tx.trailerCoupling.create({
          data: { tractorId, trailerId, driverId, tripId: tripId!, actorId: auth.userId, notes: `Assigned from ${order.orderNumber}` },
        })
      }

      await tx.tripEvent.create({
        data: {
          tripId: tripId!,
          fromStatus: existing?.status ?? 'scheduled',
          toStatus: 'assigned',
          userId: auth.userId,
          notes: eligibility.overrideApplied ? `Assignment approved with override: ${overrideReason}` : 'Eligibility-approved assignment',
          metadata: JSON.stringify({ loadOrderId: order.id, eligibility, overrideReason: eligibility.overrideApplied ? overrideReason : null }),
        },
      })

      const selected = new Map(allocations.map((allocation) => [allocation.lineId, allocation.quantity]))
      const fullyAllocated = liveAllocation.lines.every((line) => line.remaining - (selected.get(line.lineId) ?? 0) <= 0.000001)
      await tx.loadOrder.update({ where: { id: order.id }, data: { status: fullyAllocated ? 'allocated' : 'partially_allocated' } })

      return tx.trip.findUniqueOrThrow({
        where: { id: tripId! },
        include: {
          truck: { select: { id: true, plateNumber: true } },
          driver: { select: { id: true, firstName: true, lastName: true } },
          trailer: { select: { id: true, plateNumber: true, trailerType: true } },
          TripItem: true,
          TripDeliveryDestination: { orderBy: { stopOrder: 'asc' } },
        },
      })
    }, { isolationLevel: 'Serializable' })

    createAuditLog({
      userId: auth.userId,
      action: 'create',
      entity: 'DispatchAssignment',
      entityId: trip.id,
      details: {
        loadOrderId: order.id,
        tripNumber: trip.tripNumber,
        driverId,
        tractorId,
        trailerId,
        eligibility,
        overrideReason: eligibility.overrideApplied ? overrideReason : undefined,
      },
      ipAddress: getClientIp(request),
    }).catch(() => {})
    dispatchTripStatusNotification(trip.id, 'assigned').catch((error) => {
      console.error('Dispatch assignment notification error:', error)
    })

    return NextResponse.json({ trip, eligibility }, { status: existingTripId ? 200 : 201 })
  } catch (error) {
    if (error instanceof AssignmentConflictError || isSerializableWriteConflict(error)) {
      return NextResponse.json(
        { error: error instanceof Error ? error.message : 'Dispatch state changed; refresh and retry' },
        { status: 409 }
      )
    }
    console.error('Load order assignment error:', error)
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Failed to assign load order' }, { status: 500 })
  }
}
