import type {
  FuelEventType,
  FuelLog,
  ObservationSource,
  Prisma,
} from "@/generated/client"
import type { AuthContext } from "@/lib/auth-server"
import { reconcileFuel, type FuelEventInput } from "@/lib/domain/fuel/reconciliation"
import { recordOdometerReading } from "@/lib/services/odometer-service"

export class FuelDomainError extends Error {
  constructor(public readonly code: string, message: string) {
    super(message)
    this.name = "FuelDomainError"
  }
}

export type CreateFuelEventInput = {
  truckId: string
  tripId: string
  date: Date
  litersFilled: number
  totalCost: number
  eventType?: FuelEventType
  source?: ObservationSource
  latitude?: number
  longitude?: number
  paymentSource?: string
  reversalOfId?: string
  odometer?: number
  fuelLevelBefore?: number
  fuelLevelAfter?: number
  costPerLiter?: number
  stationName?: string
  fuelType?: string
  receiptNumber?: string
  endMileage?: number
  endMileageImage?: string
  images?: string
  distanceCovered?: number
  notes?: string
}

export type FuelTransactionRunner = {
  $transaction<T>(fn: (tx: Prisma.TransactionClient) => Promise<T>): Promise<T>
}

export type FuelServiceDependencies = {
  tx?: Prisma.TransactionClient
  database?: FuelTransactionRunner
  recordOdometer?: typeof recordOdometerReading
}

const reconciledEventTypes = new Set<FuelEventType>([
  "purchase",
  "company_issue",
  "external_issue",
  "emergency",
  "reversal",
])

function asNumber(value: unknown): number {
  return typeof value === "number" ? value : Number(value)
}

export async function recomputeTripFuelProjection(
  tripId: string,
  tx: Prisma.TransactionClient,
): Promise<{ fuelUsed: number | null; fuelCost: number }> {
  const [trip, rows] = await Promise.all([
    tx.trip.findUnique({ where: { id: tripId }, select: { totalMileage: true } }),
    tx.fuelLog.findMany({
      where: {
        tripId,
        verificationStatus: "verified",
      },
      orderBy: [{ date: "asc" }, { createdAt: "asc" }],
      select: {
        litersFilled: true,
        totalCost: true,
        eventType: true,
      },
    }),
  ])

  if (!trip) throw new FuelDomainError("TRIP_NOT_FOUND", "Trip not found")

  const events: FuelEventInput[] = rows
    .filter((row) => reconciledEventTypes.has(row.eventType))
    .map((row) => ({
      liters: row.litersFilled,
      totalCost: asNumber(row.totalCost),
      eventType: row.eventType as FuelEventInput["eventType"],
    }))

  const result = reconcileFuel({
    distanceKm: trip.totalMileage,
    openingTankLiters: null,
    closingTankLiters: null,
    events,
  })

  const projection = {
    fuelUsed: result.consumedLiters,
    fuelCost: result.fuelCost,
  }

  await tx.trip.update({
    where: { id: tripId },
    data: projection,
  })

  return projection
}

async function createFuelEventInTransaction(
  input: CreateFuelEventInput,
  actor: AuthContext,
  tx: Prisma.TransactionClient,
  recordOdometer: typeof recordOdometerReading,
): Promise<FuelLog> {
  const trip = await tx.trip.findUnique({
    where: { id: input.tripId },
    select: { id: true, truckId: true, startMileage: true, totalMileage: true },
  })
  if (!trip) throw new FuelDomainError("TRIP_NOT_FOUND", "Trip not found")
  if (trip.truckId !== input.truckId) {
    throw new FuelDomainError("TRIP_TRUCK_MISMATCH", "Fuel event truck does not match the trip truck")
  }

  const eventType = input.eventType ?? "purchase"

  if (eventType === "reversal") {
    if (!input.reversalOfId) {
      throw new FuelDomainError("REVERSAL_REFERENCE_REQUIRED", "Fuel reversals require a referenced fuel event")
    }
    const original = await tx.fuelLog.findUnique({ where: { id: input.reversalOfId } })
    if (!original) throw new FuelDomainError("REVERSAL_TARGET_NOT_FOUND", "Referenced fuel event was not found")
    if (original.tripId !== input.tripId || original.truckId !== input.truckId) {
      throw new FuelDomainError("REVERSAL_TARGET_MISMATCH", "Referenced fuel event belongs to another trip or truck")
    }
  }

  const duplicate = await tx.fuelLog.findFirst({
    where: {
      truckId: input.truckId,
      date: input.date,
      litersFilled: input.litersFilled,
      totalCost: input.totalCost,
      stationName: input.stationName ?? null,
      receiptNumber: input.receiptNumber ?? null,
      eventType,
    },
  })
  if (duplicate) {
    throw new FuelDomainError("DUPLICATE_FUEL_EVENT", "An identical fuel event has already been recorded")
  }

  const verificationStatus = actor.roleName === "Admin" || actor.roleName === "Manager"
    ? "verified"
    : "pending"
  const costPerLiter = input.costPerLiter ?? (input.litersFilled > 0 ? input.totalCost / input.litersFilled : null)

  const fuelLog = await tx.fuelLog.create({
    data: {
      truckId: input.truckId,
      tripId: input.tripId,
      date: input.date,
      litersFilled: input.litersFilled,
      totalCost: input.totalCost,
      costPerLiter,
      odometer: input.odometer ?? null,
      fuelLevelBefore: input.fuelLevelBefore ?? null,
      fuelLevelAfter: input.fuelLevelAfter ?? null,
      stationName: input.stationName ?? null,
      fuelType: input.fuelType ?? "Diesel",
      receiptNumber: input.receiptNumber ?? null,
      endMileage: input.endMileage ?? null,
      endMileageImage: input.endMileageImage || null,
      images: input.images ?? null,
      distanceCovered: input.distanceCovered ?? null,
      notes: input.notes ?? null,
      eventType,
      source: input.source ?? "manual",
      verificationStatus,
      capturedBy: actor.userId,
      latitude: input.latitude ?? null,
      longitude: input.longitude ?? null,
      paymentSource: input.paymentSource ?? null,
      reversalOfId: input.reversalOfId ?? null,
    },
    include: {
      truck: { select: { id: true, plateNumber: true, make: true, model: true } },
      trip: { select: { id: true, tripNumber: true } },
    },
  })

  if (input.odometer != null) {
    await recordOdometer({
      truckId: input.truckId,
      tripId: input.tripId,
      reading: input.odometer,
      recordedAt: input.date,
      readingType: "fuel",
      source: input.source ?? "manual",
      verificationStatus,
      capturedBy: actor.userId,
      evidence: input.images ?? input.endMileageImage ?? null,
    }, tx)
  }

  if (input.endMileage != null) {
    await recordOdometer({
      truckId: input.truckId,
      tripId: input.tripId,
      reading: input.endMileage,
      recordedAt: input.date,
      readingType: "trip_end",
      source: input.source ?? "manual",
      verificationStatus,
      capturedBy: actor.userId,
      evidence: input.endMileageImage ?? input.images ?? null,
    }, tx)
  }

  await recomputeTripFuelProjection(input.tripId, tx)
  return fuelLog
}

export async function createFuelEvent(
  input: CreateFuelEventInput,
  actor: AuthContext,
  execution: FuelServiceDependencies | FuelTransactionRunner = {},
): Promise<FuelLog> {
  if ("$transaction" in execution) {
    return execution.$transaction((tx) => createFuelEventInTransaction(input, actor, tx, recordOdometerReading))
  }

  const recordOdometer = execution.recordOdometer ?? recordOdometerReading
  if (execution.tx) {
    return createFuelEventInTransaction(input, actor, execution.tx, recordOdometer)
  }
  if (execution.database) {
    return execution.database.$transaction((tx) => createFuelEventInTransaction(input, actor, tx, recordOdometer))
  }
  const { db } = await import("@/lib/db")
  return db.$transaction((tx) => createFuelEventInTransaction(input, actor, tx, recordOdometer))
}
