import type { AuthContext } from "@/lib/auth-server"
import type { Prisma, TripReconciliation } from "@/generated/client"
import { reconcileFuel, type FuelEventInput } from "@/lib/domain/fuel/reconciliation"

export class TripReconciliationError extends Error {
  constructor(public readonly code: string, message: string) {
    super(message)
    this.name = "TripReconciliationError"
  }
}

export type TripReconciliationDraft = {
  tripId: string
  startMileage: number | null
  endMileage: number | null
  distanceKm: number | null
  fuelAddedLiters: number
  consumedLiters: number | null
  consumptionBasis: "tank_reconciled" | "fuel_added" | "unavailable"
  fuelCost: number
  kmPerLiter: number | null
  litersPer100Km: number | null
  fuelCostPerKm: number | null
  expenseCost: number
  revenue: number | null
  exceptionCount: number
  exceptions: string[]
}

export type ReconciliationTransactionRunner = {
  $transaction<T>(fn: (tx: Prisma.TransactionClient) => Promise<T>): Promise<T>
}

const eligibleFuelTypes = new Set(["purchase", "company_issue", "external_issue", "emergency", "reversal"])
const asNumber = (value: unknown): number => typeof value === "number" ? value : Number(value)

async function resolveTx(tx?: Prisma.TransactionClient): Promise<Prisma.TransactionClient> {
  if (tx) return tx
  const { db } = await import("@/lib/db")
  return db as unknown as Prisma.TransactionClient
}

export async function calculateTripReconciliation(
  tripId: string,
  suppliedTx?: Prisma.TransactionClient,
): Promise<TripReconciliationDraft> {
  const tx = await resolveTx(suppliedTx)
  const [trip, odometerRows, fuelRows, expenses] = await Promise.all([
    tx.trip.findUnique({ where: { id: tripId }, select: { id: true, totalRevenue: true } }),
    tx.odometerReading.findMany({
      where: { tripId, verificationStatus: "verified", readingType: { in: ["trip_start", "trip_end"] } },
      orderBy: [{ recordedAt: "asc" }, { createdAt: "asc" }],
      select: { reading: true, readingType: true, recordedAt: true },
    }),
    tx.fuelLog.findMany({
      where: { tripId, verificationStatus: "verified" },
      orderBy: [{ date: "asc" }, { createdAt: "asc" }],
      select: { litersFilled: true, totalCost: true, eventType: true, fuelLevelBefore: true, fuelLevelAfter: true, date: true },
    }),
    tx.expense.aggregate({ where: { tripId, status: "approved" }, _sum: { amount: true } }),
  ])

  if (!trip) throw new TripReconciliationError("TRIP_NOT_FOUND", "Trip not found")

  const starts = odometerRows.filter((row) => row.readingType === "trip_start")
  const ends = odometerRows.filter((row) => row.readingType === "trip_end")
  const startMileage = starts[0]?.reading ?? null
  const endMileage = ends.at(-1)?.reading ?? null
  const exceptions: string[] = []
  if (startMileage == null) exceptions.push("MISSING_START_ODOMETER")
  if (endMileage == null) exceptions.push("MISSING_END_ODOMETER")

  let distanceKm: number | null = null
  if (startMileage != null && endMileage != null) {
    if (endMileage >= startMileage) distanceKm = endMileage - startMileage
    else exceptions.push("INVALID_ODOMETER_DISTANCE")
  }

  const eligibleRows = fuelRows.filter((row) => eligibleFuelTypes.has(row.eventType))
  if (eligibleRows.length === 0) exceptions.push("MISSING_VERIFIED_FUEL_EVENTS")
  const events: FuelEventInput[] = eligibleRows.map((row) => ({
    liters: row.litersFilled,
    totalCost: asNumber(row.totalCost),
    eventType: row.eventType as FuelEventInput["eventType"],
  }))

  const openingTankLiters = fuelRows.find((row) => row.fuelLevelBefore != null)?.fuelLevelBefore ?? null
  const closingTankLiters = [...fuelRows].reverse().find((row) => row.fuelLevelAfter != null)?.fuelLevelAfter ?? null
  if ((openingTankLiters == null) !== (closingTankLiters == null)) exceptions.push("INCOMPLETE_TANK_OBSERVATION")

  const fuel = reconcileFuel({ distanceKm, openingTankLiters, closingTankLiters, events })
  if (fuel.consumedLiters == null) exceptions.push("FUEL_CONSUMPTION_UNAVAILABLE")

  return {
    tripId,
    startMileage,
    endMileage,
    distanceKm,
    fuelAddedLiters: fuel.fuelAddedLiters,
    consumedLiters: fuel.consumedLiters,
    consumptionBasis: fuel.consumptionBasis,
    fuelCost: fuel.fuelCost,
    kmPerLiter: fuel.kmPerLiter,
    litersPer100Km: fuel.litersPer100Km,
    fuelCostPerKm: fuel.fuelCostPerKm,
    expenseCost: asNumber(expenses._sum.amount ?? 0),
    revenue: trip.totalRevenue == null ? null : asNumber(trip.totalRevenue),
    exceptionCount: exceptions.length,
    exceptions,
  }
}

async function saveInTransaction(
  tripId: string,
  actor: AuthContext,
  tx: Prisma.TransactionClient,
): Promise<TripReconciliation> {
  const draft = await calculateTripReconciliation(tripId, tx)
  const snapshotData = {
    distanceKm: draft.distanceKm,
    fuelAddedLiters: draft.fuelAddedLiters,
    consumedLiters: draft.consumedLiters,
    consumptionBasis: draft.consumptionBasis,
    fuelCost: draft.fuelCost,
    kmPerLiter: draft.kmPerLiter,
    litersPer100Km: draft.litersPer100Km,
    fuelCostPerKm: draft.fuelCostPerKm,
    expenseCost: draft.expenseCost,
    revenue: draft.revenue,
    exceptionCount: draft.exceptionCount,
    exceptions: JSON.stringify(draft.exceptions),
    reconciledAt: new Date(),
    reconciledBy: actor.userId,
  }
  const snapshot = await tx.tripReconciliation.upsert({
    where: { tripId },
    create: { tripId, ...snapshotData },
    update: snapshotData,
  })

  await tx.trip.update({
    where: { id: tripId },
    data: {
      startMileage: draft.startMileage,
      endMileage: draft.endMileage,
      totalMileage: draft.distanceKm,
      fuelUsed: draft.consumedLiters,
      fuelCost: draft.fuelCost,
    },
  })
  return snapshot
}

export async function saveTripReconciliation(
  tripId: string,
  actor: AuthContext,
  runner?: ReconciliationTransactionRunner,
): Promise<TripReconciliation> {
  if (runner) return runner.$transaction((tx) => saveInTransaction(tripId, actor, tx))
  const { db } = await import("@/lib/db")
  return db.$transaction((tx) => saveInTransaction(tripId, actor, tx))
}
