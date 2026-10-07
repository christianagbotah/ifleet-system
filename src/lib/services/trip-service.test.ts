import { describe, expect, test } from "bun:test"
import { createTrip, TripDomainError } from "./trip-service"

const actor = { userId: "user-1", email: "admin@example.test", roleName: "Admin", permissions: [], driverId: null }
const baseInput = {
  truckId: "truck-1",
  driverId: "driver-1",
  departureTime: new Date("2026-10-07T09:00:00Z"),
  loadingLocation: "Tema Factory",
  destination: "Accra Central",
  itemName: "Cement",
  quantity: 600,
  unit: "bags",
}

type State = {
  sequence: number
  trips: Record<string, unknown>[]
  items: Record<string, unknown>[]
  destinations: Record<string, unknown>[]
  events: Record<string, unknown>[]
  odometers: Record<string, unknown>[]
}

function makeTx(state: State, failItems = false) {
  const tx = {
    tripSequence: {
      upsert: async ({ create }: { create: { lastValue: number } }) => {
        state.sequence = state.sequence === 0 ? create.lastValue : state.sequence + 1
        return { lastValue: state.sequence }
      },
    },
    truck: {
      findUnique: async () => ({ id: "truck-1", plateNumber: "GT-100-26", make: "MAN", model: "TGS" }),
      update: async () => ({ id: "truck-1" }),
    },
    driver: {
      findUnique: async () => ({ id: "driver-1", firstName: "Kofi", lastName: "Mensah", phone: "0200000000", userId: "driver-user" }),
    },
    zoneRate: {
      findFirst: async () => null,
      findMany: async () => [],
    },
    loadingPoint: { findUnique: async () => null },
    destinationZone: { findUnique: async () => null },
    trip: {
      create: async ({ data }: { data: Record<string, unknown> }) => {
        const row = { id: `trip-${state.trips.length + 1}`, ...data }
        state.trips.push(row)
        return row
      },
      findUnique: async ({ where }: { where: { id: string } }) => state.trips.find((row) => row.id === where.id) ?? null,
    },
    tripItem: {
      createMany: async ({ data }: { data: Record<string, unknown>[] }) => {
        if (failItems) throw new Error("nested item failure")
        state.items.push(...data)
        return { count: data.length }
      },
      findMany: async () => state.items.map((row, index) => ({ id: `item-${index + 1}`, itemName: row.itemName, sortOrder: row.sortOrder })),
      update: async () => ({ id: "item-1" }),
    },
    tripDeliveryDestination: {
      createMany: async ({ data }: { data: Record<string, unknown>[] }) => {
        state.destinations.push(...data)
        return { count: data.length }
      },
    },
    tripEvent: {
      create: async ({ data }: { data: Record<string, unknown> }) => {
        state.events.push(data)
        return { id: "event-1", ...data }
      },
    },
    odometerReading: {
      findFirst: async () => null,
      create: async ({ data }: { data: Record<string, unknown> }) => {
        state.odometers.push(data)
        return { id: "odo-1", ...data }
      },
    },
  }
  return tx as never
}

function makeRunner(persistent: State, failItems = false) {
  return {
    $transaction: async (callback: (tx: never) => Promise<unknown>) => {
      const working: State = {
        sequence: persistent.sequence,
        trips: [...persistent.trips],
        items: [...persistent.items],
        destinations: [...persistent.destinations],
        events: [...persistent.events],
        odometers: [...persistent.odometers],
      }
      const result = await callback(makeTx(working, failItems))
      Object.assign(persistent, working)
      return result
    },
  } as never
}

const freshState = (): State => ({ sequence: 0, trips: [], items: [], destinations: [], events: [], odometers: [] })

function expectCode(error: unknown, code: string) {
  expect(error).toBeInstanceOf(TripDomainError)
  expect((error as TripDomainError).code).toBe(code)
}

describe("createTrip", () => {
  test("creates trip, nested records and initial lifecycle event in one transaction", async () => {
    const state = freshState()
    const result = await createTrip({
      ...baseInput,
      tripItems: [{ itemName: "Cement", quantity: 600, unit: "bags" }],
      deliveryDestinations: [{ _tempId: "stop-1", customerName: "Client A", stopOrder: 1 }],
    }, actor, makeRunner(state))

    expect(result.trip.tripNumber).toBe("TRP-2026-001")
    expect(state.trips).toHaveLength(1)
    expect(state.items).toHaveLength(1)
    expect(state.destinations).toHaveLength(1)
    expect(state.events).toEqual([{ tripId: result.trip.id, fromStatus: null, toStatus: "scheduled", userId: "user-1", notes: "Trip created" }])
  })

  test("records verified start mileage through the odometer ledger", async () => {
    const state = freshState()
    await createTrip({ ...baseInput, startMileage: 100000 }, actor, makeRunner(state))
    expect(state.odometers).toHaveLength(1)
    expect(state.odometers[0]).toMatchObject({ truckId: "truck-1", tripId: "trip-1", reading: 100000, readingType: "trip_start", capturedBy: "user-1" })
  })

  test("rolls back trip, nested data and sequence when a nested write fails", async () => {
    const state = freshState()
    await expect(createTrip({ ...baseInput, tripItems: [{ itemName: "Cement", quantity: 600 }] }, actor, makeRunner(state, true))).rejects.toThrow("nested item failure")
    expect(state.sequence).toBe(0)
    expect(state.trips).toHaveLength(0)
    expect(state.items).toHaveLength(0)
    expect(state.events).toHaveLength(0)
  })

  test("rejects legacy mark-completed creation unless explicitly allowed by policy", async () => {
    const state = freshState()
    try {
      await createTrip({ ...baseInput, markCompleted: true }, actor, makeRunner(state))
      throw new Error("expected rejection")
    } catch (error) { expectCode(error, "MARK_COMPLETED_NOT_ALLOWED") }
    expect(state.trips).toHaveLength(0)
  })
})
