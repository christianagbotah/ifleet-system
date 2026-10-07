import { describe, expect, test } from "bun:test"
import { aggregateFuelAnalytics, normalizeFuelTrip } from "./fuel-analytics"

const departure = new Date("2026-10-07T08:00:00Z")

describe("normalizeFuelTrip", () => {
  test("reconciled metrics take precedence over mutable legacy projections", () => {
    expect(normalizeFuelTrip({
      id: "trip-1",
      truckId: "truck-1",
      destinationZoneId: "zone-1",
      departureTime: departure,
      totalMileage: 999,
      fuelCost: 999,
      fuelUsed: 999,
      totalRevenue: 9999,
      reconciliation: {
        fuelCost: 2100,
        distanceKm: 800,
        revenue: 5000,
        consumedLiters: 160,
        fuelAddedLiters: 140,
      },
    })).toMatchObject({
      tripId: "trip-1",
      zoneId: "zone-1",
      fuelCost: 2100,
      distanceKm: 800,
      revenue: 5000,
      consumedLiters: 160,
      fuelAddedLiters: 140,
      source: "reconciled",
    })
  })

  test("falls back to legacy projections only when reconciliation is absent", () => {
    expect(normalizeFuelTrip({
      id: "trip-2",
      truckId: "truck-2",
      destinationZoneId: null,
      departureTime: departure,
      totalMileage: 200,
      fuelCost: 500,
      fuelUsed: 50,
      totalRevenue: 1500,
      reconciliation: null,
    })).toMatchObject({
      tripId: "trip-2",
      fuelCost: 500,
      distanceKm: 200,
      consumedLiters: 50,
      fuelAddedLiters: 50,
      source: "legacy_projection",
    })
  })
})

describe("aggregateFuelAnalytics", () => {
  const rows = [
    normalizeFuelTrip({
      id: "a", truckId: "truck-1", destinationZoneId: "zone-1", departureTime: new Date("2026-10-01T08:00:00Z"),
      totalMileage: null, fuelCost: null, fuelUsed: null, totalRevenue: null,
      reconciliation: { fuelCost: 100, distanceKm: 100, revenue: 500, consumedLiters: 10, fuelAddedLiters: 10 },
    }),
    normalizeFuelTrip({
      id: "b", truckId: "truck-1", destinationZoneId: "zone-1", departureTime: new Date("2026-10-02T08:00:00Z"),
      totalMileage: null, fuelCost: null, fuelUsed: null, totalRevenue: null,
      reconciliation: { fuelCost: 120, distanceKm: 120, revenue: 600, consumedLiters: 12, fuelAddedLiters: 10 },
    }),
    normalizeFuelTrip({
      id: "c", truckId: "truck-2", destinationZoneId: "zone-2", departureTime: new Date("2026-10-03T08:00:00Z"),
      totalMileage: 100, fuelCost: 300, fuelUsed: 30, totalRevenue: 700, reconciliation: null,
    }),
  ]

  test("applies zone and truck filters to one common trip population", () => {
    const result = aggregateFuelAnalytics(rows, { zoneId: "zone-1" })
    expect(result.summary.totalTrips).toBe(2)
    expect(result.summary.totalFuelCost).toBe(220)
    expect(result.summary.totalRevenue).toBe(1100)
    expect(result.byTruck).toHaveLength(1)
    expect(result.byZone).toHaveLength(1)
    expect(result.byZone[0].zoneId).toBe("zone-1")
  })

  test("aggregates expected zone cost per qualifying trip instead of comparing one rate to many trips", () => {
    const result = aggregateFuelAnalytics(rows, {
      zoneId: "zone-1",
      expectedFuelLitersByZone: { "zone-1": 8 },
    })
    const zone = result.byZone[0]
    expect(zone.tripCount).toBe(2)
    expect(zone.actualFuelCost).toBe(220)
    expect(zone.expectedFuelLiters).toBe(16)
    expect(zone.expectedFuelCost).toBe(176)
    expect(zone.deviation).toBe(44)
    expect(zone.deviationPercent).toBe(25)
  })

  test("reports reconciled and legacy fallback populations explicitly", () => {
    const result = aggregateFuelAnalytics(rows)
    expect(result.summary.reconciledTrips).toBe(2)
    expect(result.summary.legacyProjectionTrips).toBe(1)
  })
})
