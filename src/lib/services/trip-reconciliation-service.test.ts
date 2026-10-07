import { describe, expect, test } from "bun:test"
import { calculateTripReconciliation, saveTripReconciliation } from "./trip-reconciliation-service"

const actor = { userId: "admin-1", email: "admin@example.test", roleName: "Admin", permissions: [], driverId: null }

function fixture(options: { missingEnd?: boolean; projectionFailure?: boolean } = {}) {
  const reconciliations: unknown[] = []
  const tripUpdates: unknown[] = []
  const tx = {
    trip: {
      findUnique: async () => ({ id: "trip-1", truckId: "truck-1", totalRevenue: 5000 }),
      update: async (args: unknown) => {
        if (options.projectionFailure) throw new Error("projection failure")
        tripUpdates.push(args)
        return { id: "trip-1" }
      },
    },
    odometerReading: {
      findMany: async () => [
        { reading: 100000, readingType: "trip_start", recordedAt: new Date("2026-10-07T08:00:00Z") },
        ...(options.missingEnd ? [] : [{ reading: 100800, readingType: "trip_end", recordedAt: new Date("2026-10-07T18:00:00Z") }]),
      ],
    },
    fuelLog: {
      findMany: async () => [
        { litersFilled: 100, totalCost: 1500, eventType: "purchase", fuelLevelBefore: 80, fuelLevelAfter: null, date: new Date("2026-10-07T09:00:00Z") },
        { litersFilled: 40, totalCost: 600, eventType: "purchase", fuelLevelBefore: null, fuelLevelAfter: 60, date: new Date("2026-10-07T15:00:00Z") },
      ],
    },
    expense: {
      aggregate: async () => ({ _sum: { amount: 300 } }),
    },
    tripReconciliation: {
      upsert: async ({ create }: { create: Record<string, unknown> }) => {
        const row = { id: "recon-1", ...create }
        reconciliations.push(row)
        return row
      },
    },
  }
  return { tx: tx as never, reconciliations, tripUpdates }
}

describe("trip reconciliation", () => {
  test("derives deterministic mileage, fuel efficiency and costs from ledger data", async () => {
    const { tx } = fixture()
    const result = await calculateTripReconciliation("trip-1", tx)
    expect(result.distanceKm).toBe(800)
    expect(result.fuelAddedLiters).toBe(140)
    expect(result.consumedLiters).toBe(160)
    expect(result.consumptionBasis).toBe("tank_reconciled")
    expect(result.fuelCost).toBe(2100)
    expect(result.kmPerLiter).toBe(5)
    expect(result.litersPer100Km).toBe(20)
    expect(result.fuelCostPerKm).toBe(2.625)
    expect(result.expenseCost).toBe(300)
    expect(result.revenue).toBe(5000)
    expect(result.exceptionCount).toBe(0)
  })

  test("is deterministic from the same ledger fixture", async () => {
    const { tx } = fixture()
    expect(await calculateTripReconciliation("trip-1", tx)).toEqual(await calculateTripReconciliation("trip-1", tx))
  })

  test("records an exception when verified trip-end mileage is missing", async () => {
    const { tx } = fixture({ missingEnd: true })
    const result = await calculateTripReconciliation("trip-1", tx)
    expect(result.distanceKm).toBeNull()
    expect(result.exceptionCount).toBeGreaterThan(0)
    expect(result.exceptions).toContain("MISSING_END_ODOMETER")
  })

  test("saves snapshot and compatibility projections in one transaction", async () => {
    const { tx, reconciliations, tripUpdates } = fixture()
    const database = { $transaction: async (callback: (inner: never) => Promise<unknown>) => callback(tx) }
    const row = await saveTripReconciliation("trip-1", actor, database as never)
    expect((row as { id: string }).id).toBe("recon-1")
    expect(reconciliations).toHaveLength(1)
    expect(tripUpdates.at(-1)).toEqual({
      where: { id: "trip-1" },
      data: { startMileage: 100000, endMileage: 100800, totalMileage: 800, fuelUsed: 160, fuelCost: 2100 },
    })
  })

  test("propagates projection failure so transaction runner can roll back snapshot", async () => {
    const { tx } = fixture({ projectionFailure: true })
    const database = { $transaction: async (callback: (inner: never) => Promise<unknown>) => callback(tx) }
    await expect(saveTripReconciliation("trip-1", actor, database as never)).rejects.toThrow("projection failure")
  })
})
