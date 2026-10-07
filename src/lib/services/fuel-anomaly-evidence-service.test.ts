import { describe, expect, test } from "bun:test"
import type { FuelAnomalyEvidenceDependencies } from "./fuel-anomaly-evidence-service"
import {
  FUEL_EVENT_SELECT,
  COMPARABLE_TRIP_SELECT,
  comparableHistoryBounds,
  TRIP_CONTEXT_SELECT,
  TRUCK_CONTEXT_SELECT,
  loadFuelAnomalyEvidence,
} from "./fuel-anomaly-evidence-service"

const date = new Date("2026-10-01T08:00:00.000Z")

function deps(overrides: Partial<FuelAnomalyEvidenceDependencies> = {}): FuelAnomalyEvidenceDependencies {
  return {
    loadFuelEvent: async (id) => id === "fuel-1" ? ({
      id: "fuel-1", tripId: "trip-1", truckId: "truck-1", date,
      litersFilled: 60, totalCost: 720, costPerLiter: 12,
      stationName: "Station A", fuelType: "Diesel", receiptNumber: "R-001",
      fuelLevelBefore: 20, fuelLevelAfter: 80, eventType: "purchase",
      source: "driver_app", verificationStatus: "verified",
      latitude: 5.6, longitude: -0.2, paymentSource: "company", reversalOfId: null,
      reversalOf: null,
    }) : null,
    loadTripContext: async (id) => id === "trip-1" ? ({
      id: "trip-1", truckId: "truck-1", driverId: "driver-1",
      departureTime: date, arrivalTime: new Date("2026-10-01T12:00:00.000Z"),
      loadingLocation: "Tema", destination: "Accra", loadingCityId: "lc-1",
      loadingPointId: "lp-1", destinationCityId: "dc-1", destinationZoneId: "zone-1",
      loadingLat: 5.67, loadingLng: 0.01, destLat: 5.56, destLng: -0.20,
      totalMileage: 120,
      TripReconciliation: { distanceKm: 120, fuelAddedLiters: 60, consumedLiters: 30, fuelCost: 360, kmPerLiter: 4, litersPer100Km: 25, exceptionCount: 0 },
    }) : null,
    loadTruckContext: async (id) => id === "truck-1" ? ({
      id: "truck-1", make: "MAN", model: "TGS", year: 2022, fuelType: "Diesel", tankCapacity: 400,
    }) : null,
    loadFuelEvents: async () => [
      { id: "fuel-1", tripId: "trip-1", truckId: "truck-1", date, litersFilled: 60, totalCost: 720, costPerLiter: 12, stationName: "Station A", fuelType: "Diesel", receiptNumber: "R-001", fuelLevelBefore: 20, fuelLevelAfter: 80, eventType: "purchase", source: "driver_app", verificationStatus: "verified", latitude: 5.6, longitude: -0.2, paymentSource: "company", reversalOfId: null, reversalOf: null },
      { id: "fuel-2", tripId: "trip-1", truckId: "truck-1", date: new Date("2026-10-01T09:00:00.000Z"), litersFilled: 10, totalCost: 120, costPerLiter: 12, stationName: "Station A", fuelType: "Diesel", receiptNumber: "R-002", fuelLevelBefore: null, fuelLevelAfter: null, eventType: "emergency", source: "manual", verificationStatus: "pending", latitude: null, longitude: null, paymentSource: null, reversalOfId: null, reversalOf: null },
    ],
    loadOdometerReadings: async () => [
      { id: "odo-1", truckId: "truck-1", tripId: "trip-1", reading: 1000, recordedAt: date, readingType: "trip_start", source: "driver_app", verificationStatus: "verified" },
      { id: "odo-2", truckId: "truck-1", tripId: "trip-1", reading: 1120, recordedAt: new Date("2026-10-01T12:00:00.000Z"), readingType: "trip_end", source: "driver_app", verificationStatus: "verified" },
    ],
    loadComparableObservations: async () => ({ truckRoute: [], truck: [], route: [], fleet: [] }),
    isInsideExpectedFuelingArea: async ({ latitude, longitude }) => latitude === 5.6 && longitude === -0.2,
    ...overrides,
  }
}

describe("fuel anomaly authoritative evidence", () => {
  test("uses explicit allow-list selects that exclude driver/customer secrets", () => {
    const serialized = JSON.stringify({ FUEL_EVENT_SELECT, TRIP_CONTEXT_SELECT, TRUCK_CONTEXT_SELECT, COMPARABLE_TRIP_SELECT })
    for (const forbidden of ["phone", "licenseNumber", "address", "customerPhone", "ghanaCardNumber", "emergencyPhone", "capturedBy"]) {
      expect(serialized).not.toContain(forbidden)
    }
    expect(FUEL_EVENT_SELECT.verificationStatus).toBe(true)
    expect(COMPARABLE_TRIP_SELECT.FuelLog.select.eventType).toBe(true)
    expect(TRIP_CONTEXT_SELECT.driverId).toBe(true)
    expect(TRIP_CONTEXT_SELECT.destinationZoneId).toBe(true)
    expect(TRUCK_CONTEXT_SELECT.tankCapacity).toBe(true)
  })

  test("resolves a fuel-event subject from server-owned trip and truck evidence", async () => {
    const evidence = await loadFuelAnomalyEvidence({ fuelLogId: "fuel-1" }, deps())
    expect(evidence.subjectType).toBe("fuel_event")
    expect(evidence.subjectKey).toBe("fuel-1")
    expect(evidence.tripId).toBe("trip-1")
    expect(evidence.truckId).toBe("truck-1")
    expect(evidence.driverId).toBe("driver-1")
    expect(evidence.routeKey).toBe("zone:zone-1")
    expect(evidence.truckTankCapacityLiters).toBe(400)
    expect(evidence.distanceKm).toBe(120)
    expect(evidence.reconciledConsumedLiters).toBe(30)
  })

  test("preserves verified and pending fuel evidence without promoting pending events", async () => {
    const evidence = await loadFuelAnomalyEvidence({ tripId: "trip-1" }, deps())
    expect(evidence.fuelEvents.map((event) => [event.id, event.verificationStatus])).toEqual([
      ["fuel-1", "verified"],
      ["fuel-2", "pending"],
    ])
    expect(evidence.netFuelAddedLiters).toBe(60)
  })

  test("marks GPS and route-geofence evidence known only when both actually exist", async () => {
    const evidence = await loadFuelAnomalyEvidence({ tripId: "trip-1" }, deps())
    expect(evidence.evidenceAvailability.gps).toBe("partial")
    expect(evidence.evidenceAvailability.routeGeofence).toBe("partial")
    expect(evidence.fuelEvents[0]?.insideExpectedFuelingArea).toBe(true)
    expect(evidence.fuelEvents[1]?.insideExpectedFuelingArea).toBeNull()
  })

  test("does not fabricate missing tank, GPS or route evidence", async () => {
    const evidence = await loadFuelAnomalyEvidence({ tripId: "trip-1" }, deps({
      loadTruckContext: async () => ({ id: "truck-1", make: "MAN", model: "TGS", year: 2022, fuelType: "Diesel", tankCapacity: null }),
      loadTripContext: async () => ({
        id: "trip-1", truckId: "truck-1", driverId: "driver-1", departureTime: date, arrivalTime: null,
        loadingLocation: "Tema", destination: "Unknown", loadingCityId: null, loadingPointId: null,
        destinationCityId: null, destinationZoneId: null, loadingLat: null, loadingLng: null, destLat: null, destLng: null,
        totalMileage: null, TripReconciliation: null,
      }),
      loadFuelEvents: async () => [],
      loadOdometerReadings: async () => [],
      isInsideExpectedFuelingArea: async () => null,
    }))
    expect(evidence.routeKey).toBeNull()
    expect(evidence.truckTankCapacityLiters).toBeNull()
    expect(evidence.distanceKm).toBeNull()
    expect(evidence.openingTankLiters).toBeNull()
    expect(evidence.closingTankLiters).toBeNull()
    expect(evidence.evidenceAvailability.tankCapacity).toBe("unavailable")
    expect(evidence.evidenceAvailability.gps).toBe("unavailable")
    expect(evidence.evidenceAvailability.routeGeofence).toBe("unavailable")
    expect(evidence.evidenceAvailability.distance).toBe("unavailable")
  })

  test("loads truck-window subjects within the requested bounded window and comparable cohorts", async () => {
    let seen: unknown = null
    const evidence = await loadFuelAnomalyEvidence({ truckId: "truck-1", startDate: date, endDate: new Date("2026-10-03T00:00:00Z") }, deps({
      loadFuelEvents: async (input) => { seen = input; return [] },
      loadComparableObservations: async () => ({ truckRoute: [], truck: [{ id: "obs-1", truckId: "truck-1", routeKey: null, driverId: null, stationName: null, fuelType: "Diesel", occurredAt: date, distanceKm: 100, consumedLiters: 25, fuelAddedLiters: 25, fuelCost: 300, costPerLiter: 12, kmPerLiter: 4, litersPer100Km: 25 }], route: [], fleet: [] }),
    }))
    expect(seen).toEqual({ truckId: "truck-1", startDate: date, endDate: new Date("2026-10-03T00:00:00.000Z") })
    expect(evidence.subjectType).toBe("truck_window")
    expect(evidence.comparableCohorts.truck).toHaveLength(1)
    expect(evidence.evidenceAvailability.comparableHistory).toBe("partial")
  })

  test("prefers verified odometer distance over mutable trip mileage when reconciliation is absent", async () => {
    const evidence = await loadFuelAnomalyEvidence({ tripId: "trip-1" }, deps({
      loadTripContext: async () => ({
        id: "trip-1", truckId: "truck-1", driverId: "driver-1", departureTime: date, arrivalTime: null,
        loadingLocation: "Tema", destination: "Accra", loadingCityId: "lc-1", loadingPointId: "lp-1",
        destinationCityId: "dc-1", destinationZoneId: "zone-1", loadingLat: null, loadingLng: null,
        destLat: null, destLng: null, totalMileage: 999, TripReconciliation: null,
      }),
    }))
    expect(evidence.distanceKm).toBe(120)
  })

  test("does not invent a truck class when no explicit physical-efficiency resolver is configured", async () => {
    const result = await loadFuelAnomalyEvidence({ tripId: "trip-1" }, deps())
    expect(result.truckClass).toBeNull()
    expect(result.physicalEfficiencyBounds).toBeNull()
    expect(result.evidenceAvailability.physicalEfficiencyBounds).toBe("unavailable")
  })

  test("uses unique fleet history rather than overlapping cohort membership for comparable-history quality", async () => {
    const four = Array.from({ length: 4 }, (_, index) => ({
      id: `obs-${index}`, truckId: "truck-1", routeKey: "zone:zone-1", driverId: null,
      stationName: null, fuelType: "Diesel", occurredAt: date, distanceKm: 100,
      consumedLiters: 25, fuelAddedLiters: 25, fuelCost: 300, costPerLiter: 12,
      kmPerLiter: 4, litersPer100Km: 25,
    }))
    const result = await loadFuelAnomalyEvidence({ tripId: "trip-1" }, deps({
      loadComparableObservations: async () => ({ truckRoute: four, truck: four, route: four, fleet: four }),
    }))
    expect(result.evidenceAvailability.comparableHistory).toBe("partial")
  })

  test("does not mark tank-level evidence available from pending-only observations", async () => {
    const result = await loadFuelAnomalyEvidence({ tripId: "trip-1" }, deps({
      loadFuelEvents: async () => [{
        id: "pending", tripId: "trip-1", truckId: "truck-1", date, litersFilled: 40,
        totalCost: 480, costPerLiter: 12, stationName: "Station A", fuelType: "Diesel",
        receiptNumber: "P1", fuelLevelBefore: 10, fuelLevelAfter: 50, eventType: "purchase",
        source: "manual", verificationStatus: "pending", latitude: null,
        longitude: null, paymentSource: null, reversalOfId: null, reversalOf: null,
      }],
    }))
    expect(result.openingTankLiters).toBeNull()
    expect(result.closingTankLiters).toBeNull()
    expect(result.evidenceAvailability.tankLevels).toBe("unavailable")
  })


  test("bounds comparable history strictly before the subject start", () => {
    const bounds = comparableHistoryBounds(new Date("2026-10-07T06:00:00Z"))
    expect(bounds.lt).toEqual(new Date("2026-10-07T06:00:00Z"))
    expect(bounds.gte).toEqual(new Date("2026-04-10T06:00:00Z"))
  })

})
