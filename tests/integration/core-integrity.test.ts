import { afterAll, beforeAll, describe, expect, test } from "bun:test"
import { PrismaMariaDb } from "@prisma/adapter-mariadb"
import { PrismaClient } from "../../src/generated/client"
import { createTrip } from "../../src/lib/services/trip-service"
import { createFuelEvent } from "../../src/lib/services/fuel-service"
import { recordOdometerReading } from "../../src/lib/services/odometer-service"
import { saveTripReconciliation } from "../../src/lib/services/trip-reconciliation-service"
import { calculateWeightVariance } from "../../src/lib/domain/weight/variance"
import { fixtureIdentity, integrationActor } from "../fixtures/core-integrity"

const rawUrl = process.env.TEST_DATABASE_URL?.trim()
if (!rawUrl) throw new Error("TEST_DATABASE_URL is required for integration tests")
if (process.env.NODE_ENV === "production") throw new Error("Integration tests refuse to run with NODE_ENV=production")
const parsedInput = new URL(rawUrl)
const databaseName = decodeURIComponent(parsedInput.pathname.replace(/^\/+/, ""))
if (!/(test|ci|integration)/i.test(databaseName)) {
  throw new Error("Integration database name must contain test, ci, or integration")
}
const productionName = process.env.PRODUCTION_DATABASE_NAME?.trim()
if (productionName && databaseName === productionName) {
  throw new Error("Integration tests refuse to use the configured production database")
}
const adapterUrl = rawUrl.replace(/^mysql:\/\//, "mariadb://")
const db = new PrismaClient({ adapter: new PrismaMariaDb(adapterUrl, { database: databaseName }) })

let truckId = ""
let otherTruckId = ""
let driverId = ""
let zoneId = ""

async function clean() {
  await db.tripReconciliation.deleteMany()
  await db.weightVerification.deleteMany()
  await db.fuelLog.deleteMany()
  await db.odometerReading.deleteMany()
  await db.tripItem.deleteMany()
  await db.tripDeliveryDestination.deleteMany()
  await db.tripEvent.deleteMany()
  await db.trip.deleteMany()
  await db.tripSequence.deleteMany()
  await db.zoneRate.deleteMany()
  await db.destinationZone.deleteMany()
  await db.destinationCity.deleteMany()
  await db.truck.deleteMany()
  await db.driver.deleteMany()
}

beforeAll(async () => {
  await clean()
  const id = fixtureIdentity()
  const [truck, otherTruck, driver, city] = await Promise.all([
    db.truck.create({ data: { plateNumber: id.truckPlate, make: "MAN", model: "TGS", year: 2024, tankCapacity: 300 } }),
    db.truck.create({ data: { plateNumber: id.otherTruckPlate, make: "Volvo", model: "FH", year: 2024, tankCapacity: 300 } }),
    db.driver.create({ data: { firstName: "Integration", lastName: "Driver", phone: id.driverPhone, employeeId: id.employeeId, licenseNumber: id.licenseNumber, licenseExpiry: new Date("2030-01-01"), licenseClass: "D" } }),
    db.destinationCity.create({ data: { name: `Integration City ${id.suffix}`, region: "Greater Accra" } }),
  ])
  truckId = truck.id
  otherTruckId = otherTruck.id
  driverId = driver.id
  const zone = await db.destinationZone.create({ data: { name: `Integration Zone ${id.suffix}`, destinationCityId: city.id } })
  zoneId = zone.id
  await db.zoneRate.create({ data: { destinationZoneId: zone.id, rateAmount: 5000, expectedFuelConsumption: 140, isActive: true } })
})

afterAll(async () => {
  await clean()
  await db.$disconnect()
})

describe("core integrity foundation", () => {
  test("runs the authoritative trip, fuel, weight, odometer and reconciliation workflow", async () => {
    const created = await createTrip({
      truckId,
      driverId,
      departureTime: new Date("2026-10-07T08:00:00Z"),
      loadingLocation: "Tema Cement Factory",
      destination: "Integration Customer",
      destinationZoneId: zoneId,
      itemName: "Cement",
      quantity: 600,
      unit: "bags",
      totalRevenue: 5000,
      startMileage: 100000,
    }, integrationActor, db as never)
    expect(created.trip.tripNumber).toBe("TRP-2026-001")

    await createFuelEvent({
      truckId, tripId: created.trip.id, date: new Date("2026-10-07T09:00:00Z"), litersFilled: 100, totalCost: 1500,
      eventType: "purchase", source: "admin", fuelLevelBefore: 80, stationName: "Integration Station A", receiptNumber: "INT-A",
    }, integrationActor, db as never)
    await createFuelEvent({
      truckId, tripId: created.trip.id, date: new Date("2026-10-07T15:00:00Z"), litersFilled: 40, totalCost: 600,
      eventType: "purchase", source: "admin", fuelLevelAfter: 60, stationName: "Integration Station B", receiptNumber: "INT-B",
    }, integrationActor, db as never)

    const weight = calculateWeightVariance(105.1, 100)
    const weighbridge = await db.weightVerification.create({
      data: {
        tripId: created.trip.id,
        checkpointType: "origin_loading",
        verifiedWeight: 105.1,
        declaredWeight: 100,
        variance: weight.variance,
        variancePercent: weight.variancePercent,
        status: weight.status,
        varianceClass: weight.varianceClass,
      },
    })
    expect(weighbridge.status).toBe("variance_detected")
    expect(weighbridge.varianceClass).toBe("over")

    await db.$transaction((tx) => recordOdometerReading({
      truckId,
      tripId: created.trip.id,
      reading: 100800,
      recordedAt: new Date("2026-10-07T18:00:00Z"),
      readingType: "trip_end",
      source: "admin",
      verificationStatus: "verified",
      capturedBy: integrationActor.userId,
    }, tx))

    const snapshot = await saveTripReconciliation(created.trip.id, integrationActor, db as never)
    expect(snapshot.distanceKm).toBe(800)
    expect(snapshot.fuelAddedLiters).toBe(140)
    expect(snapshot.consumedLiters).toBe(160)
    expect(Number(snapshot.fuelCost)).toBe(2100)
    expect(snapshot.kmPerLiter).toBe(5)
    expect(snapshot.litersPer100Km).toBe(20)
    expect(Number(snapshot.fuelCostPerKm)).toBe(2.625)

    const projected = await db.trip.findUniqueOrThrow({ where: { id: created.trip.id } })
    expect(projected.totalMileage).toBe(800)
    expect(projected.fuelUsed).toBe(160)
    expect(Number(projected.fuelCost)).toBe(2100)

    const odometerCount = await db.odometerReading.count({ where: { tripId: created.trip.id } })
    await expect(db.$transaction((tx) => recordOdometerReading({
      truckId,
      tripId: created.trip.id,
      reading: 99999,
      readingType: "inspection",
      source: "admin",
      verificationStatus: "verified",
    }, tx))).rejects.toThrow()
    expect(await db.odometerReading.count({ where: { tripId: created.trip.id } })).toBe(odometerCount)

    const fuelCount = await db.fuelLog.count({ where: { tripId: created.trip.id } })
    await expect(createFuelEvent({
      truckId: otherTruckId,
      tripId: created.trip.id,
      date: new Date("2026-10-07T16:00:00Z"),
      litersFilled: 20,
      totalCost: 300,
      eventType: "purchase",
      source: "admin",
      stationName: "Wrong Truck Station",
      receiptNumber: "WRONG-TRUCK",
    }, integrationActor, db as never)).rejects.toThrow()
    expect(await db.fuelLog.count({ where: { tripId: created.trip.id } })).toBe(fuelCount)
  })

  test("rolls back trip and yearly sequence when a nested destination write fails", async () => {
    const sequenceBefore = await db.tripSequence.findUniqueOrThrow({ where: { year: 2026 } })
    const tripCountBefore = await db.trip.count()
    await expect(createTrip({
      truckId,
      driverId,
      departureTime: new Date("2026-10-08T08:00:00Z"),
      loadingLocation: "Tema Cement Factory",
      destination: "Rollback Customer",
      destinationZoneId: zoneId,
      itemName: "Cement",
      quantity: 500,
      unit: "bags",
      deliveryDestinations: [{ customerName: "Invalid FK", stopOrder: 1, clientId: "missing-client-id", destinationZoneId: zoneId }],
    }, integrationActor, db as never)).rejects.toThrow()
    expect(await db.trip.count()).toBe(tripCountBefore)
    const sequenceAfter = await db.tripSequence.findUniqueOrThrow({ where: { year: 2026 } })
    expect(sequenceAfter.lastValue).toBe(sequenceBefore.lastValue)
  })
})
