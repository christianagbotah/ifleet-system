import { describe, expect, test } from "bun:test"
import { reconcileFuel } from "./reconciliation"

const fills = [
  { liters: 100, totalCost: 1500, eventType: "purchase" as const },
  { liters: 40, totalCost: 600, eventType: "company_issue" as const },
]

describe("reconcileFuel", () => {
  test("sums multiple legitimate fuel fills instead of keeping only the latest", () => {
    const result = reconcileFuel({ distanceKm: null, openingTankLiters: null, closingTankLiters: null, events: fills })
    expect(result.fuelAddedLiters).toBe(140)
    expect(result.fuelCost).toBe(2100)
    expect(result.consumedLiters).toBe(140)
    expect(result.consumptionBasis).toBe("fuel_added")
  })

  test("subtracts reversals from litres and cost", () => {
    const result = reconcileFuel({
      distanceKm: null,
      openingTankLiters: null,
      closingTankLiters: null,
      events: [...fills, { liters: 40, totalCost: 600, eventType: "reversal" }],
    })
    expect(result.fuelAddedLiters).toBe(100)
    expect(result.fuelCost).toBe(1500)
  })

  test("reconciles consumption from opening tank plus additions minus closing tank", () => {
    const result = reconcileFuel({ distanceKm: 800, openingTankLiters: 80, closingTankLiters: 60, events: fills })
    expect(result.consumedLiters).toBe(160)
    expect(result.consumptionBasis).toBe("tank_reconciled")
    expect(result.kmPerLiter).toBe(5)
    expect(result.litersPer100Km).toBe(20)
    expect(result.fuelCostPerKm).toBe(2.625)
  })

  test("returns null efficiency metrics for zero or negative distance", () => {
    for (const distanceKm of [0, -10]) {
      const result = reconcileFuel({ distanceKm, openingTankLiters: 80, closingTankLiters: 60, events: fills })
      expect(result.kmPerLiter).toBeNull()
      expect(result.litersPer100Km).toBeNull()
      expect(result.fuelCostPerKm).toBeNull()
    }
  })

  test("uses fuel-added basis when tank observations are unavailable", () => {
    const result = reconcileFuel({ distanceKm: 700, openingTankLiters: null, closingTankLiters: null, events: fills })
    expect(result.consumptionBasis).toBe("fuel_added")
    expect(result.consumedLiters).toBe(140)
    expect(result.kmPerLiter).toBe(5)
  })

  test("reports unavailable when there are no usable litres", () => {
    const result = reconcileFuel({ distanceKm: 100, openingTankLiters: null, closingTankLiters: null, events: [] })
    expect(result.fuelAddedLiters).toBe(0)
    expect(result.consumedLiters).toBeNull()
    expect(result.consumptionBasis).toBe("unavailable")
    expect(result.kmPerLiter).toBeNull()
    expect(result.litersPer100Km).toBeNull()
  })
})
