import { describe, expect, test } from "bun:test"
import { createFuelEvent, FuelDomainError } from "./fuel-service"

const actor = { userId: "user-1", email: "admin@example.test", roleName: "Admin", permissions: [], driverId: null }
const baseInput = {
  truckId: "truck-1",
  tripId: "trip-1",
  date: new Date("2026-10-07T08:00:00Z"),
  litersFilled: 40,
  totalCost: 600,
  eventType: "purchase" as const,
  source: "manual" as const,
  fuelType: "Diesel",
}

type FuelRow = { id: string; tripId: string; truckId: string; date: Date; litersFilled: number; totalCost: number; eventType: string; verificationStatus: string; receiptNumber?: string | null; stationName?: string | null }
type State = { fuelRows: FuelRow[]; tripUpdates: unknown[]; odometerRows: unknown[]; truckUpdates: unknown[] }

function makeTx(options: { trip?: { id: string; truckId: string; startMileage: number | null; totalMileage?: number | null } | null; duplicate?: boolean; failTripUpdate?: boolean; state?: State } = {}) {
  const state = options.state ?? { fuelRows: [], tripUpdates: [], odometerRows: [], truckUpdates: [] }
  const trip = options.trip === undefined ? { id: "trip-1", truckId: "truck-1", startMileage: 100000, totalMileage: 500 } : options.trip
  const tx = {
    trip: {
      findUnique: async () => trip,
      update: async (args: unknown) => {
        if (options.failTripUpdate) throw new Error("projection failure")
        state.tripUpdates.push(args)
        return trip
      },
    },
    fuelLog: {
      findFirst: async () => options.duplicate ? state.fuelRows[0] ?? { id: "duplicate" } : null,
      findUnique: async ({ where }: { where: { id: string } }) => state.fuelRows.find((row) => row.id === where.id) ?? null,
      findMany: async () => state.fuelRows,
      create: async ({ data }: { data: Record<string, unknown> }) => {
        const row = { id: `fuel-${state.fuelRows.length + 1}`, ...data } as unknown as FuelRow
        state.fuelRows.push(row)
        return row
      },
    },
    odometerReading: {
      findFirst: async () => null,
      create: async ({ data }: { data: Record<string, unknown> }) => {
        const row = { id: `odo-${state.odometerRows.length + 1}`, ...data }
        state.odometerRows.push(row)
        return row
      },
    },
    truck: {
      update: async (args: unknown) => {
        state.truckUpdates.push(args)
        return { id: "truck-1" }
      },
    },
  }
  return { tx: tx as never, state }
}

const runnerFor = (tx: never) => ({ $transaction: async (callback: (transaction: never) => Promise<unknown>) => callback(tx) }) as never

function expectCode(error: unknown, code: string) {
  expect(error).toBeInstanceOf(FuelDomainError)
  expect((error as FuelDomainError).code).toBe(code)
}

describe("createFuelEvent", () => {
  test("rejects missing trip", async () => {
    const { tx, state } = makeTx({ trip: null })
    try {
      await createFuelEvent(baseInput, actor, runnerFor(tx))
      throw new Error("expected rejection")
    } catch (error) { expectCode(error, "TRIP_NOT_FOUND") }
    expect(state.fuelRows).toHaveLength(0)
  })

  test("rejects a fuel event for a different truck than the trip", async () => {
    const { tx, state } = makeTx({ trip: { id: "trip-1", truckId: "truck-other", startMileage: 100000 } })
    try {
      await createFuelEvent(baseInput, actor, runnerFor(tx))
      throw new Error("expected rejection")
    } catch (error) { expectCode(error, "TRIP_TRUCK_MISMATCH") }
    expect(state.fuelRows).toHaveLength(0)
  })

  test("aggregates a second fill into trip totals instead of overwriting the first", async () => {
    const existing: FuelRow = { id: "fuel-1", tripId: "trip-1", truckId: "truck-1", date: new Date("2026-10-07T06:00:00Z"), litersFilled: 100, totalCost: 1500, eventType: "purchase", verificationStatus: "verified" }
    const state: State = { fuelRows: [existing], tripUpdates: [], odometerRows: [], truckUpdates: [] }
    const { tx } = makeTx({ state })
    await createFuelEvent(baseInput, actor, runnerFor(tx))
    expect(state.fuelRows).toHaveLength(2)
    expect(state.tripUpdates.at(-1)).toEqual({ where: { id: "trip-1" }, data: { fuelUsed: 140, fuelCost: 2100 } })
  })

  test("records supplied odometer evidence through the odometer service", async () => {
    const { tx, state } = makeTx()
    await createFuelEvent({ ...baseInput, odometer: 100500 }, actor, runnerFor(tx))
    expect(state.odometerRows).toHaveLength(1)
    expect(state.odometerRows[0]).toMatchObject({ truckId: "truck-1", tripId: "trip-1", reading: 100500, readingType: "fuel", capturedBy: "user-1" })
    expect(state.truckUpdates).toEqual([{ where: { id: "truck-1" }, data: { currentMileage: 100500 } }])
  })

  test("rejects an exact duplicate event before insert", async () => {
    const state: State = { fuelRows: [{ id: "fuel-1", tripId: "trip-1", truckId: "truck-1", date: baseInput.date, litersFilled: 40, totalCost: 600, eventType: "purchase", verificationStatus: "verified" }], tripUpdates: [], odometerRows: [], truckUpdates: [] }
    const { tx } = makeTx({ state, duplicate: true })
    try {
      await createFuelEvent(baseInput, actor, runnerFor(tx))
      throw new Error("expected rejection")
    } catch (error) { expectCode(error, "DUPLICATE_FUEL_EVENT") }
    expect(state.fuelRows).toHaveLength(1)
  })

  test("rolls back the insert when trip projection update fails", async () => {
    const persistent: State = { fuelRows: [], tripUpdates: [], odometerRows: [], truckUpdates: [] }
    const runner = {
      $transaction: async (callback: (tx: never) => Promise<unknown>) => {
        const working: State = { fuelRows: [...persistent.fuelRows], tripUpdates: [], odometerRows: [], truckUpdates: [] }
        const { tx } = makeTx({ state: working, failTripUpdate: true })
        const result = await callback(tx)
        Object.assign(persistent, working)
        return result
      },
    }
    await expect(createFuelEvent(baseInput, actor, runner as never)).rejects.toThrow("projection failure")
    expect(persistent.fuelRows).toHaveLength(0)
    expect(persistent.tripUpdates).toHaveLength(0)
  })
})
