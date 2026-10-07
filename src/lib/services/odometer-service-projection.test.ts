import { expect, test } from "bun:test"
import { recordOdometerReading } from "./odometer-service"

test("verified manual adjustment does not move truck projection backward", async () => {
  const created: unknown[] = []
  const updated: unknown[] = []
  const tx = {
    trip: { findUnique: async () => null },
    odometerReading: {
      findFirst: async () => ({ reading: 100500 }),
      create: async ({ data }: { data: Record<string, unknown> }) => {
        created.push(data)
        return { id: "reading-1", ...data }
      },
    },
    truck: {
      update: async (args: unknown) => {
        updated.push(args)
        return { id: "truck-1" }
      },
    },
  }

  const row = await recordOdometerReading({
    truckId: "truck-1",
    reading: 100100,
    readingType: "manual_adjustment",
    verificationStatus: "verified",
    allowAdjustment: true,
    adjustmentReason: "Correcting a previously mis-keyed reading",
  }, tx as never)

  expect(row.id).toBe("reading-1")
  expect(created).toHaveLength(1)
  expect(updated).toHaveLength(0)
})
