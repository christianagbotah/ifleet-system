import { randomBytes } from 'node:crypto'
import { NextRequest, NextResponse } from 'next/server'

import { createAuditLog, getClientIp } from '@/lib/audit'
import { requireAuth, requireWriteAccess } from '@/lib/auth-server'
import { db } from '@/lib/db'
import {
  finalizeWaybill,
  supersedeWaybill,
  type FinalizedWaybill,
  type WaybillSealInput,
  type WaybillSnapshot,
} from '@/lib/domain/waybills/electronic-waybill'

class WaybillConflictError extends Error {}

function parseSeals(value: unknown): WaybillSealInput[] {
  if (value == null) return []
  if (!Array.isArray(value)) throw new Error('seals must be an array')
  const seen = new Set<string>()
  return value.map((item, index) => {
    if (!item || typeof item !== 'object' || Array.isArray(item)) {
      throw new Error(`seals[${index}] must be an object`)
    }
    const source = item as Record<string, unknown>
    const sealNumber = String(source.sealNumber ?? '').trim()
    if (!sealNumber) throw new Error(`seals[${index}].sealNumber is required`)
    const key = sealNumber.toLowerCase()
    if (seen.has(key)) throw new Error(`Duplicate seal number ${sealNumber}`)
    seen.add(key)
    return {
      sealNumber,
      type: source.type == null ? null : String(source.type).trim() || null,
    }
  })
}

function parseSnapshot(value: string): WaybillSnapshot {
  const parsed = JSON.parse(value) as WaybillSnapshot
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) throw new Error('Stored waybill snapshot is invalid')
  return parsed
}

function correctionSnapshot(value: unknown): Partial<WaybillSnapshot> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {}
  const source = value as Record<string, unknown>
  const allowed = [
    'origin', 'destination', 'product', 'quantity', 'unit',
    'tractorPlate', 'trailerPlate', 'driverName', 'driverPhone', 'driverLicense',
    'customerName', 'customerPhone', 'offeredRate', 'seals',
  ] as const
  const result: Record<string, unknown> = {}
  for (const key of allowed) {
    if (source[key] !== undefined) result[key] = source[key]
  }
  if (result.seals !== undefined) result.seals = parseSeals(result.seals)
  return result as Partial<WaybillSnapshot>
}

async function legacyTripWaybillData(id: string) {
  const trip = await db.trip.findUnique({
    where: { id },
    include: {
      truck: {
        select: { id: true, plateNumber: true, make: true, model: true, year: true, color: true },
      },
      driver: {
        select: { id: true, firstName: true, lastName: true, phone: true, licenseNumber: true, licenseClass: true },
      },
      deliveryStops: { orderBy: { stopOrder: 'asc' } },
    },
  })
  if (!trip) return null

  const electronicWaybill = await db.electronicWaybill.findUnique({ where: { tripId: id } })
  const currentVersion = electronicWaybill
    ? await db.electronicWaybillVersion.findUnique({
        where: { waybillId_version: { waybillId: electronicWaybill.id, version: electronicWaybill.currentVersion } },
      })
    : null
  const seals = electronicWaybill
    ? await db.waybillSeal.findMany({
        where: { waybillId: electronicWaybill.id, version: electronicWaybill.currentVersion },
        orderBy: { createdAt: 'asc' },
      })
    : []

  return {
    trip: {
      tripNumber: trip.tripNumber,
      waybillNumber: electronicWaybill?.waybillNumber ?? trip.waybillNumber,
      status: trip.status,
      itemName: trip.itemName,
      quantity: trip.quantity,
      unit: trip.unit,
      totalRevenue: trip.totalRevenue,
      departureTime: trip.departureTime,
      estimatedArrival: trip.arrivalTime,
      createdAt: trip.createdAt,
      loadingLocation: trip.loadingLocation,
      loadingAddress: trip.loadingAddress,
      destination: trip.destination,
      destinationAddress: trip.destinationAddress,
      customerName: trip.customerName,
      customerPhone: trip.customerPhone,
      notes: trip.notes,
    },
    driver: {
      firstName: trip.driver.firstName,
      lastName: trip.driver.lastName,
      phone: trip.driver.phone,
      licenseNumber: trip.driver.licenseNumber,
      licenseClass: trip.driver.licenseClass,
    },
    truck: {
      plateNumber: trip.truck.plateNumber,
      make: trip.truck.make,
      model: trip.truck.model,
      year: trip.truck.year,
      color: trip.truck.color,
    },
    deliveryStops: trip.deliveryStops.map((stop) => ({
      destination: stop.destination,
      expectedQty: stop.expectedQty,
      actualQty: stop.actualQty,
      unit: stop.unit,
      status: stop.status,
      customerName: stop.customerName,
    })),
    electronicWaybill: electronicWaybill && currentVersion
      ? {
          id: electronicWaybill.id,
          waybillNumber: electronicWaybill.waybillNumber,
          verificationToken: electronicWaybill.verificationToken,
          status: electronicWaybill.status,
          currentVersion: electronicWaybill.currentVersion,
          version: currentVersion,
          seals,
        }
      : null,
  }
}

export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const auth = requireAuth(request)
    if (auth instanceof NextResponse) return auth
    const { id } = await params
    const data = await legacyTripWaybillData(id)
    if (!data) return NextResponse.json({ error: 'Trip not found' }, { status: 404 })
    return NextResponse.json(data)
  } catch (error) {
    console.error('Waybill fetch error:', error)
    return NextResponse.json({ error: 'Failed to fetch waybill data' }, { status: 500 })
  }
}

export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const auth = requireAuth(request)
    if (auth instanceof NextResponse) return auth
    const writeGuard = requireWriteAccess(auth)
    if (writeGuard instanceof NextResponse) return writeGuard

    const { id } = await params
    const body = await request.json().catch(() => ({})) as Record<string, unknown>
    const seals = parseSeals(body.seals)

    const finalized = await db.$transaction(async (tx) => {
      const existing = await tx.electronicWaybill.findUnique({ where: { tripId: id } })
      if (existing) throw new WaybillConflictError('Electronic waybill is already finalized; create a correction instead')

      const trip = await tx.trip.findUnique({
        where: { id },
        include: {
          truck: { select: { id: true, plateNumber: true } },
          trailer: { select: { id: true, plateNumber: true } },
          driver: { select: { firstName: true, lastName: true, phone: true, licenseNumber: true } },
          loadOrder: { include: { shipperProfile: { include: { ShipperSiteRule: true } } } },
        },
      })
      if (!trip) throw new WaybillConflictError('Trip not found')

      const weighingEvents = await tx.weighingEvent.findMany({
        where: { tripId: id },
        select: {
          id: true,
          stage: true,
          recordedAt: true,
          tractorId: true,
          trailerId: true,
          tareWeightKg: true,
          grossWeightKg: true,
          netWeightKg: true,
          clearancePassed: true,
          supersedesEventId: true,
        },
        orderBy: [{ recordedAt: 'desc' }, { createdAt: 'desc' }],
      })
      const superseded = new Set(weighingEvents.map((event) => event.supersedesEventId).filter((value): value is string => Boolean(value)))
      const weighing = weighingEvents.find((event) =>
        !superseded.has(event.id) &&
        ['AXLE', 'GROSS', 'ROAD_CHECK'].includes(event.stage) &&
        event.clearancePassed === true &&
        event.tareWeightKg != null && event.grossWeightKg != null && event.netWeightKg != null,
      )
      if (!weighing) throw new WaybillConflictError('A passed post-load weighing is required before waybill finalization')

      const profile = trip.loadOrder?.shipperProfile ?? null
      const siteRule = profile?.ShipperSiteRule.find((rule) => rule.loadingPointId === trip.loadingPointId && rule.isActive) ?? null
      const sealRequired = siteRule?.sealRequired ?? profile?.sealRequired ?? false
      if (sealRequired && seals.length === 0) throw new WaybillConflictError('A cargo seal is required before waybill finalization')

      const domain = finalizeWaybill({
        trip: {
          id: trip.id,
          tripNumber: trip.tripNumber,
          tractorId: trip.truckId,
          tractorPlate: trip.truck.plateNumber,
          trailerId: trip.trailerId,
          trailerPlate: trip.trailer?.plateNumber ?? null,
          origin: trip.loadingLocation,
          destination: trip.destination,
          product: trip.itemName,
          quantity: trip.quantity,
          unit: trip.unit,
          driverName: `${trip.driver.firstName} ${trip.driver.lastName}`.trim(),
          driverPhone: trip.driver.phone,
          driverLicense: trip.driver.licenseNumber,
          customerName: trip.customerName,
          customerPhone: trip.customerPhone,
          offeredRate: trip.unitPrice == null ? null : Number(trip.unitPrice),
        },
        weighing: {
          id: weighing.id,
          tripId: trip.id,
          tractorId: weighing.tractorId,
          trailerId: weighing.trailerId,
          tareWeightKg: weighing.tareWeightKg!,
          grossWeightKg: weighing.grossWeightKg!,
          netWeightKg: weighing.netWeightKg!,
          clearancePassed: weighing.clearancePassed === true,
        },
        seals,
        finalizedBy: auth.userId,
        finalizedAt: new Date(),
        entropy: randomBytes(5).toString('hex'),
      })

      const root = await tx.electronicWaybill.create({
        data: {
          tripId: trip.id,
          waybillNumber: domain.waybillNumber,
          verificationToken: domain.verificationToken,
          currentVersion: domain.version,
          status: domain.status,
          finalizedAt: new Date(domain.finalizedAt),
          versions: {
            create: {
              version: domain.version,
              snapshot: JSON.stringify(domain.snapshot),
              contentHash: domain.contentHash,
              supersedesVersion: domain.supersedesVersion,
              correctionReason: domain.correctionReason,
              finalizedBy: domain.finalizedBy,
              finalizedAt: new Date(domain.finalizedAt),
            },
          },
          seals: {
            create: domain.snapshot.seals.map((seal) => ({
              version: domain.version,
              sealNumber: seal.sealNumber,
              sealType: seal.type ?? null,
              appliedBy: auth.userId,
            })),
          },
        },
      })
      await tx.trip.update({ where: { id: trip.id }, data: { waybillNumber: domain.waybillNumber } })
      return { root, domain }
    }, { isolationLevel: 'Serializable' })

    createAuditLog({
      userId: auth.userId,
      action: 'finalize',
      entity: 'ElectronicWaybill',
      entityId: finalized.root.id,
      details: { tripId: id, waybillNumber: finalized.domain.waybillNumber, version: finalized.domain.version },
      ipAddress: getClientIp(request),
    }).catch(() => {})

    return NextResponse.json({ electronicWaybill: finalized.root, version: finalized.domain }, { status: 201 })
  } catch (error) {
    if (error instanceof WaybillConflictError || error instanceof Error && /waybill|weighing|seal|weight/i.test(error.message)) {
      return NextResponse.json({ error: error.message }, { status: 409 })
    }
    console.error('Waybill finalize error:', error)
    return NextResponse.json({ error: 'Failed to finalize electronic waybill' }, { status: 500 })
  }
}

export async function PUT(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const auth = requireAuth(request)
    if (auth instanceof NextResponse) return auth
    const writeGuard = requireWriteAccess(auth)
    if (writeGuard instanceof NextResponse) return writeGuard

    const { id } = await params
    const body = await request.json().catch(() => ({})) as Record<string, unknown>
    const correctionReason = typeof body.correctionReason === 'string' ? body.correctionReason.trim() : ''
    const patch = correctionSnapshot(body.snapshot)

    const corrected = await db.$transaction(async (tx) => {
      const root = await tx.electronicWaybill.findUnique({ where: { tripId: id } })
      if (!root) throw new WaybillConflictError('Electronic waybill has not been finalized')
      const current = await tx.electronicWaybillVersion.findUnique({
        where: { waybillId_version: { waybillId: root.id, version: root.currentVersion } },
      })
      if (!current) throw new WaybillConflictError('Current waybill version is missing')

      const previous: FinalizedWaybill = {
        waybillNumber: root.waybillNumber,
        verificationToken: root.verificationToken,
        version: current.version,
        supersedesVersion: current.supersedesVersion,
        status: 'finalized',
        snapshot: Object.freeze(parseSnapshot(current.snapshot)),
        contentHash: current.contentHash,
        finalizedBy: current.finalizedBy,
        finalizedAt: current.finalizedAt.toISOString(),
        correctionReason: current.correctionReason,
      }
      const domain = supersedeWaybill(previous, {
        correctionReason,
        correctedBy: auth.userId,
        correctedAt: new Date(),
        snapshot: patch,
      })

      const version = await tx.electronicWaybillVersion.create({
        data: {
          waybillId: root.id,
          version: domain.version,
          snapshot: JSON.stringify(domain.snapshot),
          contentHash: domain.contentHash,
          supersedesVersion: domain.supersedesVersion,
          correctionReason: domain.correctionReason,
          finalizedBy: domain.finalizedBy,
          finalizedAt: new Date(domain.finalizedAt),
        },
      })
      if (domain.snapshot.seals.length > 0) {
        await tx.waybillSeal.createMany({
          data: domain.snapshot.seals.map((seal) => ({
            waybillId: root.id,
            version: domain.version,
            sealNumber: seal.sealNumber,
            sealType: seal.type ?? null,
            appliedBy: auth.userId,
          })),
        })
      }
      const updated = await tx.electronicWaybill.update({
        where: { id: root.id },
        data: { currentVersion: domain.version, finalizedAt: new Date(domain.finalizedAt) },
      })
      return { root: updated, version, domain }
    }, { isolationLevel: 'Serializable' })

    createAuditLog({
      userId: auth.userId,
      action: 'correct',
      entity: 'ElectronicWaybill',
      entityId: corrected.root.id,
      details: { tripId: id, version: corrected.domain.version, correctionReason },
      ipAddress: getClientIp(request),
    }).catch(() => {})

    return NextResponse.json({ electronicWaybill: corrected.root, version: corrected.version })
  } catch (error) {
    if (error instanceof WaybillConflictError || error instanceof Error && /waybill|correction/i.test(error.message)) {
      return NextResponse.json({ error: error.message }, { status: 409 })
    }
    console.error('Waybill correction error:', error)
    return NextResponse.json({ error: 'Failed to correct electronic waybill' }, { status: 500 })
  }
}
