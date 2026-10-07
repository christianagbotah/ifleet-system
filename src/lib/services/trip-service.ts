import type { Prisma, Trip, TripDeliveryDestinationStatus } from "@/generated/client"
import type { AuthContext } from "@/lib/auth-server"
import { recordOdometerReading } from "@/lib/services/odometer-service"
import { reserveTripNumber } from "@/lib/services/trip-number-service"

export class TripDomainError extends Error {
  constructor(public readonly code: string, message: string) {
    super(message)
    this.name = "TripDomainError"
  }
}

export type TripItemCreateInput = {
  supplierId?: string
  loadingPointId?: string
  itemId?: string
  itemName?: string
  unit?: string
  quantity?: string | number
  rate?: string | number
  total?: string | number
  deliveryDestinationId?: string
}

export type TripDestinationCreateInput = {
  _tempId?: string
  id?: string
  stopOrder?: string | number
  sortOrder?: string | number
  clientId?: string
  customerName?: string
  customerPhone?: string
  destinationZoneId?: string
  zoneRate?: string | number
  address?: string
  notes?: string
  status?: string
  actualQty?: string | number
}

export type ValidatedTripCreateInput = {
  truckId: string
  driverId: string
  departureTime: Date
  waybillNumber?: string
  loadingLocation?: string
  loadingAddress?: string
  destination?: string
  destinationAddress?: string
  itemName?: string
  quantity?: string | number
  unit?: string
  unitPrice?: string | number
  totalRevenue?: string | number
  customerName?: string
  customerPhone?: string
  customerRef?: string
  notes?: string
  startMileage?: string | number
  fuelLevelBefore?: string | number
  destinationZoneId?: string
  loadingPointId?: string
  loadingCityId?: string
  destinationCityId?: string
  deliveryType?: string
  startMileageImage?: string
  markCompleted?: boolean
  tripItems?: TripItemCreateInput[]
  deliveryDestinations?: TripDestinationCreateInput[]
}

export type TripCreationPolicy = {
  allowLegacyCompletedOnCreate?: boolean
}

export type TripTransactionRunner = {
  $transaction<T>(fn: (tx: Prisma.TransactionClient) => Promise<T>): Promise<T>
}

export type TripCreateResult = {
  trip: Trip
  truck: { id: string; plateNumber: string; make: string; model: string }
  driver: { id: string; firstName: string; lastName: string; phone: string; userId: string | null }
  loadingLocation: string
  destination: string
}

function numberOrNull(value: string | number | undefined): number | null {
  if (value === undefined || value === null || value === "") return null
  const parsed = typeof value === "number" ? value : Number(value)
  return Number.isFinite(parsed) ? parsed : null
}

function integerOr(value: string | number | undefined, fallback: number): number {
  const parsed = numberOrNull(value)
  return parsed == null ? fallback : Math.trunc(parsed)
}

const destinationStatuses = new Set<TripDeliveryDestinationStatus>([
  "pending", "in_transit", "arrived", "offloading", "completed", "cancelled",
])

function destinationStatus(value: string | undefined): TripDeliveryDestinationStatus {
  return value && destinationStatuses.has(value as TripDeliveryDestinationStatus)
    ? (value as TripDeliveryDestinationStatus)
    : "pending"
}

async function createTripInTransaction(
  input: ValidatedTripCreateInput,
  actor: AuthContext,
  tx: Prisma.TransactionClient,
  policy: TripCreationPolicy,
): Promise<TripCreateResult> {
  const markCompleted = input.markCompleted === true
  if (markCompleted && !policy.allowLegacyCompletedOnCreate) {
    throw new TripDomainError(
      "MARK_COMPLETED_NOT_ALLOWED",
      "Trips must progress through the operational lifecycle instead of being completed on creation",
    )
  }

  const [truck, driver] = await Promise.all([
    tx.truck.findUnique({
      where: { id: input.truckId },
      select: { id: true, plateNumber: true, make: true, model: true },
    }),
    tx.driver.findUnique({
      where: { id: input.driverId },
      select: { id: true, firstName: true, lastName: true, phone: true, userId: true },
    }),
  ])
  if (!truck) throw new TripDomainError("TRUCK_NOT_FOUND", "Truck not found")
  if (!driver) throw new TripDomainError("DRIVER_NOT_FOUND", "Driver not found")

  let loadingLocation = input.loadingLocation?.trim() || ""
  let destination = input.destination?.trim() || ""

  if (input.loadingPointId) {
    const loadingPoint = await tx.loadingPoint.findUnique({
      where: { id: input.loadingPointId },
      select: { name: true },
    })
    if (loadingPoint) loadingLocation = loadingPoint.name
  }

  let automaticRate: number | null = null
  if (input.destinationZoneId) {
    const [zone, zoneRate] = await Promise.all([
      tx.destinationZone.findUnique({
        where: { id: input.destinationZoneId },
        select: { name: true, destinationCity: { select: { name: true } } },
      }),
      tx.zoneRate.findFirst({
        where: { destinationZoneId: input.destinationZoneId, isActive: true },
        orderBy: { effectiveDate: "desc" },
      }),
    ])
    if (zone) destination = `${zone.name}, ${zone.destinationCity.name}`
    if (zoneRate) automaticRate = Number(zoneRate.rateAmount)
  }

  if (!loadingLocation || !destination) {
    throw new TripDomainError(
      "ROUTE_REQUIRED",
      "loadingLocation (or loadingPointId) and destination (or destinationZoneId) are required",
    )
  }

  const tripNumber = await reserveTripNumber(tx, input.departureTime)
  const now = new Date()
  const startMileage = numberOrNull(input.startMileage)
  const explicitRevenue = numberOrNull(input.totalRevenue)

  const trip = await tx.trip.create({
    data: {
      tripNumber,
      truckId: input.truckId,
      driverId: input.driverId,
      waybillNumber: input.waybillNumber || null,
      loadingLocation,
      loadingAddress: input.loadingAddress || null,
      destination,
      destinationAddress: input.destinationAddress || null,
      itemName: input.itemName?.trim() || "Goods",
      quantity: numberOrNull(input.quantity) ?? 0,
      unit: input.unit || "bags",
      unitPrice: numberOrNull(input.unitPrice),
      totalRevenue: explicitRevenue ?? automaticRate,
      departureTime: input.departureTime,
      destinationZoneId: input.destinationZoneId || null,
      loadingCityId: input.loadingCityId || null,
      loadingPointId: input.loadingPointId || null,
      destinationCityId: input.destinationCityId || null,
      deliveryType: input.deliveryType || "SINGLE",
      startMileageImage: input.startMileageImage || null,
      customerName: input.customerName || null,
      customerPhone: input.customerPhone || null,
      customerRef: input.customerRef || null,
      notes: input.notes || null,
      startMileage,
      fuelLevelBefore: numberOrNull(input.fuelLevelBefore),
      ...(markCompleted
        ? {
            status: "completed" as const,
            loadingStartedAt: input.departureTime,
            loadingCompletedAt: input.departureTime,
            offloadingStartedAt: now,
            offloadingCompletedAt: now,
            arrivalTime: now,
          }
        : { status: "scheduled" as const }),
    },
  })

  const destinationInputs = input.deliveryDestinations ?? []
  const destinationIdMap = new Map<string, string>()
  for (const destinationInput of destinationInputs) {
    const key = destinationInput._tempId || destinationInput.id
    if (key) destinationIdMap.set(key, crypto.randomUUID())
  }

  const zoneIds = [...new Set(destinationInputs.map((row) => row.destinationZoneId).filter((value): value is string => Boolean(value)))]
  const zoneRates = new Map<string, number>()
  if (zoneIds.length > 0) {
    const rows = await tx.zoneRate.findMany({
      where: { destinationZoneId: { in: zoneIds }, isActive: true },
      orderBy: { effectiveDate: "desc" },
    })
    for (const row of rows) {
      if (!zoneRates.has(row.destinationZoneId)) zoneRates.set(row.destinationZoneId, Number(row.rateAmount))
    }
  }

  if (destinationInputs.length > 0) {
    await tx.tripDeliveryDestination.createMany({
      data: destinationInputs.map((row, index) => {
        const key = row._tempId || row.id
        const zoneRate = row.destinationZoneId ? zoneRates.get(row.destinationZoneId) : undefined
        return {
          id: (key && destinationIdMap.get(key)) || crypto.randomUUID(),
          tripId: trip.id,
          stopOrder: integerOr(row.stopOrder ?? row.sortOrder, index),
          clientId: row.clientId || null,
          customerName: row.customerName || "",
          customerPhone: row.customerPhone || null,
          destinationZoneId: row.destinationZoneId || null,
          zoneRate: zoneRate ?? numberOrNull(row.zoneRate),
          address: row.address || null,
          notes: row.notes || null,
          status: "pending" as const,
          actualQty: numberOrNull(row.actualQty),
        }
      }),
    })
  }

  const tripItems = input.tripItems ?? []
  if (tripItems.length > 0) {
    await tx.tripItem.createMany({
      data: tripItems.map((row, index) => ({
        tripId: trip.id,
        supplierId: row.supplierId || null,
        loadingPointId: row.loadingPointId || null,
        itemId: row.itemId || null,
        itemName: row.itemName || "Unknown",
        unit: row.unit || "bags",
        quantity: numberOrNull(row.quantity) ?? 0,
        rate: numberOrNull(row.rate),
        total: numberOrNull(row.total),
        sortOrder: index,
        deliveryDestinationId: row.deliveryDestinationId
          ? destinationIdMap.get(row.deliveryDestinationId) ?? null
          : null,
      })),
    })
  }

  await tx.tripEvent.create({
    data: {
      tripId: trip.id,
      fromStatus: null,
      toStatus: markCompleted ? "completed" : "scheduled",
      userId: actor.userId,
      notes: markCompleted ? "Trip created through legacy completed policy" : "Trip created",
    },
  })

  if (startMileage != null) {
    await recordOdometerReading({
      truckId: input.truckId,
      tripId: trip.id,
      reading: startMileage,
      recordedAt: input.departureTime,
      readingType: "trip_start",
      source: "admin",
      verificationStatus: "verified",
      capturedBy: actor.userId,
      evidence: input.startMileageImage || null,
    }, tx)
  }

  if (markCompleted) {
    await tx.driver.update({
      where: { id: input.driverId },
      data: { totalTrips: { increment: 1 } },
    })
  }

  return { trip: trip as Trip, truck, driver, loadingLocation, destination }
}

export async function createTrip(
  input: ValidatedTripCreateInput,
  actor: AuthContext,
  runner?: TripTransactionRunner,
  policy: TripCreationPolicy = {},
): Promise<TripCreateResult> {
  if (runner) return runner.$transaction((tx) => createTripInTransaction(input, actor, tx, policy))
  const { db } = await import("@/lib/db")
  return db.$transaction((tx) => createTripInTransaction(input, actor, tx, policy))
}
