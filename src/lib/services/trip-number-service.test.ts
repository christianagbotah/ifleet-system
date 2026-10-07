import { describe, expect, test } from "bun:test"
import { reserveTripNumber } from "./trip-number-service"

function makeTx(initialValue = 0) {
  let lastValue = initialValue
  const tx = {
    tripSequence: {
      upsert: async ({ create }: { create: { lastValue: number } }) => {
        if (lastValue === 0) lastValue = create.lastValue
        else lastValue += 1
        return { lastValue }
      },
    },
  }
  return { tx: tx as never, value: () => lastValue }
}

describe("reserveTripNumber", () => {
  test("formats the first trip of 2026", async () => {
    const { tx } = makeTx()
    expect(await reserveTripNumber(tx, new Date("2026-01-15T10:00:00Z"))).toBe("TRP-2026-001")
  })

  test("pads values through 999", async () => {
    const { tx } = makeTx(998)
    expect(await reserveTripNumber(tx, new Date("2026-10-07T08:00:00Z"))).toBe("TRP-2026-999")
  })

  test("does not truncate values above 999", async () => {
    const { tx } = makeTx(999)
    expect(await reserveTripNumber(tx, new Date("2026-10-07T08:00:00Z"))).toBe("TRP-2026-1000")
  })

  test("concurrent reservations receive distinct sequence values", async () => {
    let value = 0
    const tx = {
      tripSequence: {
        upsert: async ({ create }: { create: { lastValue: number } }) => {
          await Promise.resolve()
          value = value === 0 ? create.lastValue : value + 1
          return { lastValue: value }
        },
      },
    } as never

    const [first, second] = await Promise.all([
      reserveTripNumber(tx, new Date("2026-10-07T08:00:00Z")),
      reserveTripNumber(tx, new Date("2026-10-07T08:00:01Z")),
    ])

    expect(new Set([first, second])).toEqual(new Set(["TRP-2026-001", "TRP-2026-002"]))
  })
})
