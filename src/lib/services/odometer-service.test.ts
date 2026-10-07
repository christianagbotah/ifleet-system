import { describe, expect, test } from "bun:test"
import { OdometerDomainError, recordOdometerReading } from "./odometer-service"

function makeTx(options: {
  tripTruckId?: string
  tripStart?: number | null
  latest?: number | null
  failProjection?: boolean
} = {}) {
  const created: unknown[] = []
  const updated: unknown[] = []
  const tripTruckId = options.tripTruckId ?? "truck-1"
  const tripStart = options.tripStart ?? 100000
  const latest = options.latest ?? 100000

  const tx = {
    trip: {
      findUnique: async () => ({ truckId: tripTruckId, startMileage: tripStart }),
    },
    odometerReading: {
      findFirst: async ({ where }: { where: { readingType?: string } }) => {
        if (where.readingType === "trip_start") return tripStart == null ? null : { reading: tripStart }
        return latest == null ? null : { reading: latest }
      },
      create: async ({ data }: { data: Record<string, unknown> }) => {
        created.push(data)
        return { id: "reading-1", ...data }
      },
    },
    truck: {
      update: async (args: unknown) => {
        updated.push(args)
        if (options.failProjection) throw new Error("projection failure")
        return { id: "truck-1" }
      },
    },
  }

  return { tx: tx as never, created, updated }
}

function expectCode(error: unknown, code: string) {
  expect(error).toBeInstanceOf(OdometerDomainError)
  expect((error as OdometerDomainError).code).toBe(code)
}

describe("recordOdometerReading", () => {
  test("rejects a reading attached to a trip assigned to another truck before writes", async () => {
    const { tx, created, updated } = makeTx({ tripTruckId: "truck-1" })
    try {
      await recordOdometerReading({
        truckId: "truck-2",
        tripId: "trip-1",
        reading: 100500,
        readingType: "fuel",
        verificationStatus: "verified",
      }, tx)
      throw new Error("expected rejection")
    } catch (error) {
      expectCode(error, "TRIP_TRUCK_MISMATCH")
    }
    expect(created).toHaveLength(0)
    expect(updated).toHaveLength(0)
  })

  test("rejects rollback without creating a ledger row or changing projection", async () => {
    const { tx, created, updated } = makeTx({ latest: 100000 })
    try {
      await recordOdometerReading({
        truckId: "truck-1",
        reading: 99999,
        readingType: "fuel",
        verificationStatus: "verified",
      }, tx)
      throw new Error("expected rejection")
    } catch (error) {
      expectCode(error, "ODOMETER_ROLLBACK")
    }
    expect(created).toHaveLength(0)
    expect(updated).toHaveLength(0)
  })

  test("creates a verified trip-end reading and updates truck mileage in the same transaction", async () => {
    const { tx, created, updated } = makeTx({ latest: 100100, tripStart: 100000 })
    const row = await recordOdometerReading({
      truckId: "truck-1",
      tripId: "trip-1",
      reading: 100500,
      readingType: "trip_end",
      verificationStatus: "verified",
      capturedBy: "user-1",
    }, tx)

    expect(row.id).toBe("reading-1")
    expect(created).toHaveLength(1)
    expect(updated).toEqual([{ where: { id: "truck-1" }, data: { currentMileage: 100500 } }])
  })

  test("requires an audit reason for an authorized manual adjustment", async () => {
    const { tx, created, updated } = makeTx({ latest: 100000 })
    try {
      await recordOdometerReading({
        truckId: "truck-1",
        reading: 99500,
        readingType: "manual_adjustment",
        verificationStatus: "verified",
        allowAdjustment: true,
      }, tx)
      throw new Error("expected rejection")
    } catch (error) {
      expectCode(error, "ADJUSTMENT_REASON_REQUIRED")
    }
    expect(created).toHaveLength(0)
    expect(updated).toHaveLength(0)
  })

  test("propagates projection update failure instead of swallowing it", async () => {
    const { tx, created, updated } = makeTx({ latest: 100000, failProjection: true })
    await expect(recordOdometerReading({
      truckId: "truck-1",
      reading: 100500,
      readingType: "fuel",
      verificationStatus: "verified",
    }, tx)).rejects.toThrow("projection failure")
    expect(created).toHaveLength(1)
    expect(updated).toHaveLength(1)
  })
})
