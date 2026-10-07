import { afterAll, beforeEach, describe, expect, test } from "bun:test"
import { PrismaMariaDb } from "@prisma/adapter-mariadb"
import { PrismaClient } from "../../src/generated/client"
import { assessFuelAnomaly, recordFuelAnomalyExplanation, recordFuelAnomalyReview } from "../../src/lib/services/fuel-anomaly-assessment-service"
import { createFuelEvent } from "../../src/lib/services/fuel-service"
import type { AuthContext } from "../../src/lib/auth-server"

const rawUrl = process.env.TEST_DATABASE_URL?.trim()
if (!rawUrl) throw new Error("TEST_DATABASE_URL is required for integration tests")
if (process.env.NODE_ENV === "production") throw new Error("Integration tests refuse to run with NODE_ENV=production")
const parsedInput = new URL(rawUrl)
const databaseName = decodeURIComponent(parsedInput.pathname.replace(/^\/+/, ""))
if (!/(test|ci|integration)/i.test(databaseName)) throw new Error("Integration database name must contain test, ci, or integration")
const productionName = process.env.PRODUCTION_DATABASE_NAME?.trim()
if (productionName && databaseName.toLowerCase() === productionName.toLowerCase()) throw new Error("Integration tests refuse to use the configured production database")

const db = new PrismaClient({ adapter: new PrismaMariaDb(rawUrl.replace(/^mysql:\/\//, "mariadb://"), { database: databaseName }) })
const actor: AuthContext = { userId: "fuel-intelligence-manager", roleName: "Manager" } as AuthContext
let sequence = 0

async function clean() {
  await db.fuelAnomalyReviewEvent.deleteMany()
  await db.fuelAnomalyFinding.deleteMany()
  await db.fuelAnomalyAssessment.deleteMany()
  await db.tripReconciliation.deleteMany()
  await db.fuelLog.deleteMany()
  await db.odometerReading.deleteMany()
  await db.tripDeliveryDestination.deleteMany()
  await db.tripEvent.deleteMany()
  await db.tripItem.deleteMany()
  await db.trip.deleteMany()
  await db.destinationZone.deleteMany()
  await db.destinationCity.deleteMany()
  await db.truck.deleteMany()
  await db.driver.deleteMany()
}

beforeEach(async () => { await clean(); sequence += 1 })
afterAll(async () => { await clean(); await db.$disconnect() })

async function baseFixture(options: { tankCapacity?: number | null; withZone?: boolean } = {}) {
  const suffix = `${Date.now()}-${sequence}`
  const driver = await db.driver.create({ data: {
    firstName: "Fuel", lastName: "Reviewer", phone: `020${suffix.replace(/\D/g, "").slice(-7)}`,
    employeeId: `FI-${suffix}`, licenseNumber: `LIC-${suffix}`, licenseExpiry: new Date("2030-01-01"), licenseClass: "D",
  } })
  const truck = await db.truck.create({ data: {
    plateNumber: `FI-${sequence}-${suffix.slice(-5)}`, make: "MAN", model: "TGS", year: 2024,
    tankCapacity: options.tankCapacity === undefined ? 300 : options.tankCapacity,
  } })
  let zoneId: string | null = null
  if (options.withZone !== false) {
    const city = await db.destinationCity.create({ data: { name: `Fuel City ${suffix}`, region: "Greater Accra" } })
    zoneId = (await db.destinationZone.create({ data: { name: `Fuel Zone ${suffix}`, destinationCityId: city.id } })).id
  }
  return { driver, truck, zoneId }
}

async function tripFixture(input: {
  truckId: string; driverId: string; zoneId?: string | null; departureTime?: Date; distanceKm?: number | null;
  consumedLiters?: number | null; fuelAddedLiters?: number; fuelCost?: number; kmPerLiter?: number | null;
  exceptionCount?: number; tripNumber?: string;
}) {
  const departureTime = input.departureTime ?? new Date("2026-10-07T08:00:00Z")
  const trip = await db.trip.create({ data: {
    tripNumber: input.tripNumber ?? `FI-TRIP-${sequence}-${Math.random().toString(36).slice(2, 8)}`,
    truckId: input.truckId, driverId: input.driverId, loadingLocation: "Tema Factory", destination: "Accra Customer",
    destinationZoneId: input.zoneId ?? null, itemName: "Cement", quantity: 600, unit: "bags", departureTime,
  } })
  if (input.distanceKm !== undefined || input.consumedLiters !== undefined) {
    const distance = input.distanceKm ?? null
    const consumed = input.consumedLiters ?? null
    await db.tripReconciliation.create({ data: {
      tripId: trip.id, distanceKm: distance, consumedLiters: consumed,
      fuelAddedLiters: input.fuelAddedLiters ?? 0, fuelCost: input.fuelCost ?? 0,
      kmPerLiter: input.kmPerLiter ?? (distance != null && consumed != null && consumed > 0 ? distance / consumed : null),
      litersPer100Km: distance != null && consumed != null && distance > 0 ? consumed / distance * 100 : null,
      exceptionCount: input.exceptionCount ?? 0,
    } })
  }
  return trip
}

async function verifiedFuel(input: {
  tripId: string; truckId: string; date?: Date; liters: number; totalCost?: number; station?: string;
  receipt?: string; before?: number; after?: number; eventType?: "purchase" | "company_issue" | "external_issue" | "emergency" | "tank_observation" | "reversal";
  reversalOfId?: string; source?: "manual" | "admin" | "driver_app"; latitude?: number; longitude?: number;
}) {
  return db.fuelLog.create({ data: {
    tripId: input.tripId, truckId: input.truckId, date: input.date ?? new Date("2026-10-07T09:00:00Z"),
    litersFilled: input.liters, totalCost: input.totalCost ?? input.liters * 12,
    costPerLiter: input.liters > 0 ? (input.totalCost ?? input.liters * 12) / input.liters : null,
    stationName: input.station ?? "Integration Fuel Station", receiptNumber: input.receipt ?? null,
    fuelLevelBefore: input.before ?? null, fuelLevelAfter: input.after ?? null,
    eventType: input.eventType ?? "purchase", source: input.source ?? "admin", verificationStatus: "verified",
    reversalOfId: input.reversalOfId ?? null, latitude: input.latitude ?? null, longitude: input.longitude ?? null,
  } })
}

function codes(assessment: Awaited<ReturnType<typeof assessFuelAnomaly>>) {
  return assessment.findings.map((finding) => finding.code)
}

async function sourceSnapshot(tripId: string) {
  return {
    trip: await db.trip.findUniqueOrThrow({ where: { id: tripId }, select: { id: true, status: true, fuelUsed: true, fuelCost: true, totalMileage: true, updatedAt: true } }),
    fuel: await db.fuelLog.findMany({ where: { tripId }, select: { id: true, verificationStatus: true, eventType: true, litersFilled: true, totalCost: true, updatedAt: true }, orderBy: { id: "asc" } }),
    odometer: await db.odometerReading.findMany({ where: { tripId }, select: { id: true, reading: true, verificationStatus: true, updatedAt: true }, orderBy: { id: "asc" } }),
    reconciliation: await db.tripReconciliation.findUnique({ where: { tripId }, select: { id: true, distanceKm: true, consumedLiters: true, fuelAddedLiters: true, fuelCost: true, updatedAt: true } }),
  }
}

describe("fuel anomaly intelligence on disposable MariaDB", () => {
  test("normal evidence stays clear, reruns idempotently, persists explanation/review audit, and never mutates source records", async () => {
    const { driver, truck, zoneId } = await baseFixture()
    const trip = await tripFixture({ truckId: truck.id, driverId: driver.id, zoneId, distanceKm: 200, consumedLiters: 40, fuelAddedLiters: 40, fuelCost: 480 })
    await verifiedFuel({ tripId: trip.id, truckId: truck.id, liters: 40, totalCost: 480, before: 100, after: 140, receipt: "NORMAL-1" })
    const before = await sourceSnapshot(trip.id)

    const first = await assessFuelAnomaly({ tripId: trip.id }, actor)
    const second = await assessFuelAnomaly({ tripId: trip.id }, actor)
    expect(codes(first)).toEqual([])
    expect(second.id).toBe(first.id)
    expect(await db.fuelAnomalyAssessment.count({ where: { tripId: trip.id } })).toBe(1)

    const explained = await recordFuelAnomalyExplanation(first.id, {
      source: "ai", provider: "integration-provider", model: "integration-model", output: '{"summary":"Review evidence only"}',
    })
    expect(explained.explanationProvider).toBe("integration-provider")
    expect(explained.explanationModel).toBe("integration-model")
    await recordFuelAnomalyReview(first.id, { toStatus: "acknowledged", notes: "opened" }, actor)
    await recordFuelAnomalyReview(first.id, { toStatus: "investigating", notes: "checking" }, actor)
    const resolved = await recordFuelAnomalyReview(first.id, { toStatus: "resolved", outcomeCode: "verified_legitimate", notes: "evidence matched" }, actor)
    expect(resolved.reviewEvents).toHaveLength(3)
    expect(resolved.outcomeCode).toBe("verified_legitimate")
    expect(await sourceSnapshot(trip.id)).toEqual(before)
  })

  test("tank-capacity tolerance boundary is allowed while a fill above tolerance is flagged", async () => {
    const { driver, truck, zoneId } = await baseFixture({ tankCapacity: 300 })
    const boundary = await tripFixture({ truckId: truck.id, driverId: driver.id, zoneId, distanceKm: 100, consumedLiters: 50, fuelAddedLiters: 306, fuelCost: 3672, tripNumber: `BOUNDARY-${sequence}` })
    await verifiedFuel({ tripId: boundary.id, truckId: truck.id, liters: 306, totalCost: 3672, receipt: "BOUNDARY" })
    expect(codes(await assessFuelAnomaly({ tripId: boundary.id }, actor))).not.toContain("FUEL_TANK_CAPACITY_EXCEEDED")

    const exceeded = await tripFixture({ truckId: truck.id, driverId: driver.id, zoneId, departureTime: new Date("2026-10-07T12:00:00Z"), distanceKm: 100, consumedLiters: 50, fuelAddedLiters: 306.1, fuelCost: 3673.2, tripNumber: `EXCEEDED-${sequence}` })
    await verifiedFuel({ tripId: exceeded.id, truckId: truck.id, date: new Date("2026-10-07T13:00:00Z"), liters: 306.1, totalCost: 3673.2, receipt: "EXCEEDED" })
    expect(codes(await assessFuelAnomaly({ tripId: exceeded.id }, actor))).toContain("FUEL_TANK_CAPACITY_EXCEEDED")
  })

  test("unexplained tank loss is surfaced from verified tank observations", async () => {
    const { driver, truck, zoneId } = await baseFixture()
    const trip = await tripFixture({ truckId: truck.id, driverId: driver.id, zoneId, distanceKm: 200, consumedLiters: 50, fuelAddedLiters: 50, fuelCost: 600 })
    await verifiedFuel({ tripId: trip.id, truckId: truck.id, liters: 50, totalCost: 600, before: 100, after: 80, receipt: "LOSS" })
    expect(codes(await assessFuelAnomaly({ tripId: trip.id }, actor))).toContain("FUEL_TANK_LOSS_UNEXPLAINED")
  })

  test("exact duplicates remain blocked by fuel service while near duplicates become review findings", async () => {
    const { driver, truck, zoneId } = await baseFixture()
    const trip = await tripFixture({ truckId: truck.id, driverId: driver.id, zoneId, distanceKm: 100, consumedLiters: 50, fuelAddedLiters: 100, fuelCost: 1202 })
    const date = new Date("2026-10-07T09:00:00Z")
    const input = { truckId: truck.id, tripId: trip.id, date, litersFilled: 50, totalCost: 600, stationName: "Duplicate Station", receiptNumber: "DUP-1", eventType: "purchase" as const, source: "admin" as const }
    await createFuelEvent(input, actor, db as never)
    await expect(createFuelEvent(input, actor, db as never)).rejects.toMatchObject({ code: "DUPLICATE_FUEL_EVENT" })
    await createFuelEvent({ ...input, date: new Date(date.getTime() + 10 * 60_000), litersFilled: 50.2, totalCost: 602, receiptNumber: "DUP-2" }, actor, db as never)
    expect(codes(await assessFuelAnomaly({ tripId: trip.id }, actor))).toContain("FUEL_NEAR_DUPLICATE_EVENT")
  })

  test("reversal clusters remain review indicators rather than source mutations", async () => {
    const { driver, truck, zoneId } = await baseFixture()
    const trip = await tripFixture({ truckId: truck.id, driverId: driver.id, zoneId, distanceKm: 100, consumedLiters: 30, fuelAddedLiters: 30, fuelCost: 360 })
    const originals: Array<Awaited<ReturnType<typeof verifiedFuel>>> = []
    for (let i = 0; i < 3; i += 1) originals.push(await verifiedFuel({ tripId: trip.id, truckId: truck.id, date: new Date(Date.UTC(2026, 9, 7, 8 + i)), liters: 20 + i, receipt: `REV-O-${i}` }))
    for (let i = 0; i < 3; i += 1) await verifiedFuel({ tripId: trip.id, truckId: truck.id, date: new Date(Date.UTC(2026, 9, 7, 12 + i)), liters: originals[i].litersFilled, eventType: "reversal", reversalOfId: originals[i].id, receipt: `REV-R-${i}` })
    const assessment = await assessFuelAnomaly({ tripId: trip.id }, actor)
    expect(codes(assessment)).toContain("FUEL_REVERSAL_PATTERN")
    expect(codes(assessment)).toContain("FUEL_POST_VERIFICATION_REVERSAL_CLUSTER")
  })

  test("robust truck-route baseline activates at 12 samples and is suppressed below 6", async () => {
    const { driver, truck, zoneId } = await baseFixture()
    for (let i = 0; i < 12; i += 1) {
      const historical = await tripFixture({
        truckId: truck.id, driverId: driver.id, zoneId,
        departureTime: new Date(Date.UTC(2026, 8, 1 + i, 8)), distanceKm: 200, consumedLiters: 40,
        fuelAddedLiters: 40, fuelCost: 480, kmPerLiter: 5, tripNumber: `HIST-${sequence}-${i}`,
      })
      await verifiedFuel({ tripId: historical.id, truckId: truck.id, date: new Date(Date.UTC(2026, 8, 1 + i, 9)), liters: 40, totalCost: 480, station: "Baseline Station", receipt: `HIST-R-${i}` })
    }
    const current = await tripFixture({ truckId: truck.id, driverId: driver.id, zoneId, departureTime: new Date("2026-10-07T08:00:00Z"), distanceKm: 200, consumedLiters: 100, fuelAddedLiters: 100, fuelCost: 1200, kmPerLiter: 2, tripNumber: `OUTLIER-${sequence}` })
    await verifiedFuel({ tripId: current.id, truckId: truck.id, liters: 100, totalCost: 1200, station: "Baseline Station", receipt: "OUTLIER" })
    const preferred = await assessFuelAnomaly({ tripId: current.id }, actor)
    expect(codes(preferred)).toContain("FUEL_EFFICIENCY_SINGLE_OUTLIER")
    const efficiencyFinding = preferred.findings.find((finding) => finding.code === "FUEL_EFFICIENCY_SINGLE_OUTLIER")
    expect(JSON.parse(efficiencyFinding!.evidence)).toMatchObject({ cohortType: "truck_route", sampleSize: 12, confidenceTier: "preferred" })

    await clean()
    const sparse = await baseFixture()
    for (let i = 0; i < 5; i += 1) {
      const historical = await tripFixture({ truckId: sparse.truck.id, driverId: sparse.driver.id, zoneId: sparse.zoneId, departureTime: new Date(Date.UTC(2026, 8, 1 + i, 8)), distanceKm: 200, consumedLiters: 40, fuelAddedLiters: 40, fuelCost: 480, kmPerLiter: 5, tripNumber: `SPARSE-${sequence}-${i}` })
      await verifiedFuel({ tripId: historical.id, truckId: sparse.truck.id, date: new Date(Date.UTC(2026, 8, 1 + i, 9)), liters: 40, totalCost: 480, receipt: `SPARSE-R-${i}` })
    }
    const sparseCurrent = await tripFixture({ truckId: sparse.truck.id, driverId: sparse.driver.id, zoneId: sparse.zoneId, departureTime: new Date("2026-10-07T08:00:00Z"), distanceKm: 200, consumedLiters: 100, fuelAddedLiters: 100, fuelCost: 1200, kmPerLiter: 2, tripNumber: `SPARSE-OUTLIER-${sequence}` })
    await verifiedFuel({ tripId: sparseCurrent.id, truckId: sparse.truck.id, liters: 100, totalCost: 1200, receipt: "SPARSE-OUTLIER" })
    const suppressed = await assessFuelAnomaly({ tripId: sparseCurrent.id }, actor)
    expect(codes(suppressed)).not.toContain("FUEL_EFFICIENCY_SINGLE_OUTLIER")
    expect(codes(suppressed)).not.toContain("FUEL_EFFICIENCY_DEGRADATION")
  })

  test("missing tank and GPS evidence lowers data quality without fabricating values", async () => {
    const { driver, truck } = await baseFixture({ tankCapacity: null, withZone: false })
    const trip = await tripFixture({ truckId: truck.id, driverId: driver.id, zoneId: null, distanceKm: 100, consumedLiters: 25, fuelAddedLiters: 25, fuelCost: 300 })
    await verifiedFuel({ tripId: trip.id, truckId: truck.id, liters: 25, totalCost: 300, source: "admin", receipt: "MISSING-EVIDENCE" })
    const assessment = await assessFuelAnomaly({ tripId: trip.id }, actor)
    const snapshot = JSON.parse(assessment.inputSnapshot)
    expect(snapshot.truckTankCapacityLiters).toBeNull()
    expect(snapshot.openingTankLiters).toBeNull()
    expect(snapshot.closingTankLiters).toBeNull()
    expect(snapshot.evidenceAvailability.tankCapacity).toBe("unavailable")
    expect(snapshot.evidenceAvailability.gps).toBe("unavailable")
    expect(snapshot.evidenceAvailability.routeGeofence).toBe("unavailable")
    expect(assessment.dataQuality).toBeLessThan(0.5)
  })
})
