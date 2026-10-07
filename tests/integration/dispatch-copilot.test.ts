import { afterAll, beforeAll, describe, expect, test } from "bun:test"
import { PrismaMariaDb } from "@prisma/adapter-mariadb"
import { PrismaClient } from "../../src/generated/client"
import { createTrip } from "../../src/lib/services/trip-service"
import { loadDispatchCandidateEvidence } from "../../src/lib/services/dispatch-evidence-service"
import { generateDispatchRecommendations } from "../../src/lib/ai/dispatch/recommendation-engine"
import { fixtureIdentity, integrationActor } from "../fixtures/core-integrity"

const rawUrl = process.env.TEST_DATABASE_URL?.trim()
if (!rawUrl) throw new Error("TEST_DATABASE_URL is required for integration tests")
if (process.env.NODE_ENV === "production") throw new Error("Integration tests refuse to run with NODE_ENV=production")
const parsedInput = new URL(rawUrl)
const databaseName = decodeURIComponent(parsedInput.pathname.replace(/^\/+/, ""))
if (!/(test|ci|integration)/i.test(databaseName)) throw new Error("Unsafe integration database name")
const productionName = process.env.PRODUCTION_DATABASE_NAME?.trim()
if (productionName && databaseName.toLowerCase() === productionName.toLowerCase()) {
  throw new Error("Integration tests refuse to use the configured production database")
}
const adapterUrl = rawUrl.replace(/^mysql:\/\//, "mariadb://")
const db = new PrismaClient({ adapter: new PrismaMariaDb(adapterUrl, { database: databaseName }) })

let goodDriverId = ""
let conflictedDriverId = ""
let goodTruckId = ""
let conflictedTruckId = ""
let zoneId = ""

async function clean() {
  await db.tripReconciliation.deleteMany()
  await db.fuelLog.deleteMany()
  await db.odometerReading.deleteMany()
  await db.tripItem.deleteMany()
  await db.tripDeliveryDestination.deleteMany()
  await db.tripEvent.deleteMany()
  await db.trip.deleteMany()
  await db.tripSequence.deleteMany()
  await db.maintenanceRecord.deleteMany()
  await db.insurance.deleteMany()
  await db.roadworthyInspection.deleteMany()
  await db.dvlaRegistration.deleteMany()
  await db.zoneRate.deleteMany()
  await db.destinationZone.deleteMany()
  await db.destinationCity.deleteMany()
  await db.truck.deleteMany()
  await db.driver.deleteMany()
}

beforeAll(async () => {
  await clean()
  const first = fixtureIdentity()
  const second = fixtureIdentity()

  const [goodTruck, conflictedTruck, goodDriver, conflictedDriver, city] = await Promise.all([
    db.truck.create({ data: {
      plateNumber: first.truckPlate,
      make: "MAN",
      model: "TGS",
      year: 2024,
      status: "active",
      currentMileage: 100000,
    } }),
    db.truck.create({ data: {
      plateNumber: second.truckPlate,
      make: "Volvo",
      model: "FH",
      year: 2024,
      status: "active",
      currentMileage: 90000,
    } }),
    db.driver.create({ data: {
      firstName: "Safe",
      lastName: "Driver",
      phone: first.driverPhone,
      employeeId: first.employeeId,
      licenseNumber: first.licenseNumber,
      licenseExpiry: new Date("2030-01-01T00:00:00Z"),
      licenseClass: "D",
      verificationStatus: "verified",
      rating: 5,
      status: "active",
    } }),
    db.driver.create({ data: {
      firstName: "Busy",
      lastName: "Driver",
      phone: second.driverPhone,
      employeeId: second.employeeId,
      licenseNumber: second.licenseNumber,
      licenseExpiry: new Date("2030-01-01T00:00:00Z"),
      licenseClass: "D",
      verificationStatus: "verified",
      rating: 4,
      status: "active",
    } }),
    db.destinationCity.create({ data: { name: `Dispatch City ${first.suffix}`, region: "Greater Accra" } }),
  ])

  goodDriverId = goodDriver.id
  conflictedDriverId = conflictedDriver.id
  goodTruckId = goodTruck.id
  conflictedTruckId = conflictedTruck.id

  const zone = await db.destinationZone.create({
    data: { name: `Dispatch Zone ${first.suffix}`, destinationCityId: city.id },
  })
  zoneId = zone.id

  const historical = await createTrip({
    truckId: goodTruck.id,
    driverId: goodDriver.id,
    departureTime: new Date("2026-09-01T08:00:00Z"),
    loadingLocation: "Tema Factory",
    destination: "Historical Customer",
    destinationZoneId: zone.id,
    itemName: "Cement",
    quantity: 600,
    unit: "bags",
  }, integrationActor, db as never)
  await db.trip.update({ where: { id: historical.trip.id }, data: { status: "completed" } })

  await createTrip({
    truckId: conflictedTruck.id,
    driverId: conflictedDriver.id,
    departureTime: new Date("2026-10-08T07:00:00Z"),
    loadingLocation: "Tema Factory",
    destination: "Existing Customer",
    destinationZoneId: zone.id,
    itemName: "Cement",
    quantity: 500,
    unit: "bags",
  }, integrationActor, db as never)
})

afterAll(async () => {
  await clean()
  await db.$disconnect()
})

describe("dispatch copilot evidence and deterministic ranking", () => {
  test("excludes live conflicts and ranks only the safe pair from real MariaDB evidence", async () => {
    const departureTime = new Date("2026-10-08T08:00:00Z")
    const evidence = await loadDispatchCandidateEvidence({
      departureTime,
      destinationZoneId: zoneId,
      cargoUnit: "bags",
      quantity: 600,
    }, db as never)

    const safeDriver = evidence.drivers.find((driver) => driver.id === goodDriverId)
    const busyDriver = evidence.drivers.find((driver) => driver.id === conflictedDriverId)
    const safeTruck = evidence.trucks.find((truck) => truck.id === goodTruckId)
    const busyTruck = evidence.trucks.find((truck) => truck.id === conflictedTruckId)

    expect(safeDriver?.routeExperienceScore).toBe(10)
    expect(safeDriver?.hasConflictingTrip).toBe(false)
    expect(busyDriver?.hasConflictingTrip).toBe(true)
    expect(safeTruck?.hasConflictingTrip).toBe(false)
    expect(busyTruck?.hasConflictingTrip).toBe(true)

    const result = await generateDispatchRecommendations({
      context: { departureTime },
      trip: {
        departureTime: departureTime.toISOString(),
        destinationZoneId: zoneId,
        cargoUnit: "bags",
        quantity: 600,
      },
      drivers: evidence.drivers,
      trucks: evidence.trucks,
    })

    expect(result.explanationSource).toBe("deterministic")
    expect(result.candidates).toHaveLength(1)
    expect(result.candidates[0].driverId).toBe(goodDriverId)
    expect(result.candidates[0].truckId).toBe(goodTruckId)
    expect(result.blockedDrivers.map((row) => row.id)).toContain(conflictedDriverId)
    expect(result.blockedTrucks.map((row) => row.id)).toContain(conflictedTruckId)
  })
})
