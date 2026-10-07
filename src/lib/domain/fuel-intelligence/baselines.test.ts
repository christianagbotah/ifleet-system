import { describe, expect, test } from "bun:test"
import { evaluateFuelBaselineFindings, selectFuelBaseline } from "./baselines"
import { DEFAULT_FUEL_ANOMALY_POLICY } from "./policy"
import { interquartileRange, median, medianAbsoluteDeviation } from "./statistics"
import type { FuelAssessmentEvidence, FuelBaselineObservation, FuelEvidenceEvent } from "./types"

function observation(index: number, overrides: Partial<FuelBaselineObservation> = {}): FuelBaselineObservation {
  return {
    id: `obs-${index}`,
    truckId: "truck-1",
    routeKey: "route-a",
    driverId: "driver-1",
    stationName: "Station A",
    fuelType: "Diesel",
    occurredAt: new Date(Date.UTC(2026, 8, index + 1)),
    distanceKm: 200,
    consumedLiters: 40,
    fuelAddedLiters: 40,
    fuelCost: 600,
    costPerLiter: 15,
    kmPerLiter: 5,
    litersPer100Km: 20,
    fillFrequencyPer100Km: 0.5,
    ...overrides,
  }
}

function fuelEvent(overrides: Partial<FuelEvidenceEvent> = {}): FuelEvidenceEvent {
  return {
    id: "fuel-current",
    tripId: "trip-current",
    truckId: "truck-1",
    driverId: "driver-1",
    occurredAt: new Date("2026-10-07T08:00:00Z"),
    eventType: "purchase",
    verificationStatus: "verified",
    source: "driver_app",
    liters: 40,
    totalCost: 600,
    costPerLiter: 15,
    stationName: "Station A",
    receiptNumber: "CURRENT",
    fuelLevelBeforeLiters: null,
    fuelLevelAfterLiters: null,
    latitude: null,
    longitude: null,
    gpsRequiredByCapturePolicy: false,
    insideExpectedFuelingArea: null,
    reversalOfId: null,
    reversalTargetWasVerified: false,
    ...overrides,
  }
}

function evidence(overrides: Partial<FuelAssessmentEvidence> = {}): FuelAssessmentEvidence {
  const history = Array.from({ length: 12 }, (_, index) => observation(index))
  return {
    subject: { tripId: "trip-current" },
    subjectType: "trip",
    subjectKey: "trip-current",
    fuelLogId: null,
    tripId: "trip-current",
    truckId: "truck-1",
    driverId: "driver-1",
    routeKey: "route-a",
    truckClass: "articulated",
    truckTankCapacityLiters: 200,
    physicalEfficiencyBounds: null,
    distanceKm: 200,
    reconciledConsumedLiters: 40,
    reconciliationExceptionCount: 0,
    openingTankLiters: null,
    closingTankLiters: null,
    netFuelAddedLiters: 40,
    fuelEvents: [fuelEvent()],
    comparableCohorts: { truckRoute: history, truck: history, route: history, fleet: history },
    evidenceAvailability: {
      tankCapacity: "known",
      tankLevels: "unavailable",
      distance: "known",
      reconciliation: "known",
      gps: "unavailable",
      routeGeofence: "unavailable",
      physicalEfficiencyBounds: "unavailable",
      comparableHistory: "known",
    },
    ...overrides,
  }
}

function metricHistory(metric: keyof FuelBaselineObservation, values: number[]): FuelBaselineObservation[] {
  return values.map((value, index) => observation(index, { [metric]: value }))
}

describe("robust fuel baseline statistics", () => {
  test("median and MAD ignore non-finite values deterministically", () => {
    expect(median([1, 5, 3, Number.NaN, Number.POSITIVE_INFINITY])).toBe(3)
    expect(medianAbsoluteDeviation([1, 3, 5], 3)).toBe(2)
    expect(median([])).toBeNull()
  })

  test("IQR uses deterministic percentile interpolation", () => {
    expect(interquartileRange([1, 2, 3, 4, 5, 6, 7, 8])).toEqual({ q1: 2.75, q3: 6.25, iqr: 3.5 })
  })

  test("selects the most specific cohort with enough usable metric samples", () => {
    const selected = selectFuelBaseline({
      cohorts: {
        truckRoute: metricHistory("kmPerLiter", [5, 5, 5, 5, 5]),
        truck: metricHistory("kmPerLiter", [5, 5, 5, 5, 5, 5]),
        route: metricHistory("kmPerLiter", Array(12).fill(5)),
        fleet: metricHistory("kmPerLiter", Array(20).fill(5)),
      },
      metric: "kmPerLiter",
    })
    expect(selected?.cohortType).toBe("truck")
    expect(selected?.sampleSize).toBe(6)
    expect(selected?.confidenceTier).toBe("advisory")
  })

  test("marks 12+ samples preferred, 6-11 advisory, and suppresses below 6", () => {
    const cohorts = { truckRoute: [], truck: [], route: [], fleet: [] }
    const preferred = selectFuelBaseline({ cohorts: { ...cohorts, truckRoute: metricHistory("kmPerLiter", Array(12).fill(5)) }, metric: "kmPerLiter" })
    const advisory = selectFuelBaseline({ cohorts: { ...cohorts, truckRoute: metricHistory("kmPerLiter", Array(6).fill(5)) }, metric: "kmPerLiter" })
    const sparse = selectFuelBaseline({ cohorts: { ...cohorts, truckRoute: metricHistory("kmPerLiter", Array(5).fill(5)) }, metric: "kmPerLiter" })
    expect(preferred?.confidenceTier).toBe("preferred")
    expect(advisory?.confidenceTier).toBe("advisory")
    expect(sparse).toBeNull()
  })

  test("uses IQR fallback when MAD is zero but the distribution still has spread", () => {
    const values = [10, 10, 10, 10, 10, 11, 12, 13]
    const input = evidence({
      fuelEvents: [fuelEvent({ costPerLiter: 20, totalCost: 800 })],
      comparableCohorts: {
        truckRoute: metricHistory("costPerLiter", values),
        truck: [], route: [], fleet: [],
      },
    })
    const finding = evaluateFuelBaselineFindings({ evidence: input }).find((item) => item.code === "FUEL_PRICE_OUTLIER")
    expect(finding?.evidence.method).toBe("iqr")
  })

  test("flags one reconciled efficiency outlier without calling it sustained", () => {
    const input = evidence({ distanceKm: 200, reconciledConsumedLiters: 80 })
    const result = evaluateFuelBaselineFindings({ evidence: input })
    expect(result.map((item) => item.code)).toContain("FUEL_EFFICIENCY_SINGLE_OUTLIER")
    expect(result.map((item) => item.code)).not.toContain("FUEL_EFFICIENCY_DEGRADATION")
  })

  test("upgrades repeated recent low-efficiency outliers to sustained degradation", () => {
    const normal = Array.from({ length: 12 }, (_, index) => observation(index, { kmPerLiter: 5 }))
    const degraded = [
      observation(20, { occurredAt: new Date("2026-10-05T00:00:00Z"), kmPerLiter: 2 }),
      observation(21, { occurredAt: new Date("2026-10-06T00:00:00Z"), kmPerLiter: 2.1 }),
    ]
    const input = evidence({
      distanceKm: 200,
      reconciledConsumedLiters: 100,
      comparableCohorts: { truckRoute: [...normal, ...degraded], truck: [], route: [], fleet: [] },
    })
    const result = evaluateFuelBaselineFindings({ evidence: input })
    expect(result.map((item) => item.code)).toContain("FUEL_EFFICIENCY_DEGRADATION")
    expect(result.map((item) => item.code)).not.toContain("FUEL_EFFICIENCY_SINGLE_OUTLIER")
  })

  test("flags robust price, volume, frequency and cost outliers", () => {
    const input = evidence({
      distanceKm: 100,
      netFuelAddedLiters: 120,
      fuelEvents: [
        fuelEvent({ id: "a", liters: 60, totalCost: 1800, costPerLiter: 30 }),
        fuelEvent({ id: "b", liters: 60, totalCost: 1800, costPerLiter: 30, occurredAt: new Date("2026-10-07T12:00:00Z") }),
      ],
    })
    const result = evaluateFuelBaselineFindings({ evidence: input }).map((item) => item.code)
    expect(result).toContain("FUEL_PRICE_OUTLIER")
    expect(result).toContain("FUEL_VOLUME_OUTLIER")
    expect(result).toContain("FUEL_FILL_FREQUENCY_OUTLIER")
    expect(result).toContain("FUEL_COST_OUTLIER")
  })

  test("does not emit statistical findings when every relevant baseline is below six samples", () => {
    const sparse = Array.from({ length: 5 }, (_, index) => observation(index))
    const result = evaluateFuelBaselineFindings({ evidence: evidence({ comparableCohorts: { truckRoute: sparse, truck: sparse, route: sparse, fleet: sparse }, distanceKm: 200, reconciledConsumedLiters: 100 }) })
    expect(result).toEqual([])
  })

  test("remains deterministic and robust when history contains extreme contamination", () => {
    const history = [
      ...Array.from({ length: 12 }, (_, index) => observation(index, { kmPerLiter: 5 + (index % 2) * 0.1 })),
      observation(30, { kmPerLiter: 1000 }),
      observation(31, { kmPerLiter: 0.01 }),
    ]
    const input = evidence({ distanceKm: 200, reconciledConsumedLiters: 80, comparableCohorts: { truckRoute: history, truck: [], route: [], fleet: [] } })
    const first = evaluateFuelBaselineFindings({ evidence: input })
    const second = evaluateFuelBaselineFindings({ evidence: input })
    expect(first).toEqual(second)
    expect(first.map((item) => item.code)).toContain("FUEL_EFFICIENCY_SINGLE_OUTLIER")
  })
})
