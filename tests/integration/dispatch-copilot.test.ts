import { afterAll, beforeAll, describe, expect, test } from "bun:test"
import { PrismaMariaDb } from "@prisma/adapter-mariadb"
import { PrismaClient } from "../../src/generated/client"
import { createTrip } from "../../src/lib/services/trip-service"
import { loadDispatchCandidateEvidence } from "../../src/lib/services/dispatch-evidence-service"
import { generateDispatchRecommendations } from "../../src/lib/ai/dispatch/recommendation-engine"
import {
  getDispatchRecommendations,
  recordDispatchDecision,
} from "../../src/lib/services/dispatch-copilot-service"
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

const dispatchActor = {
  userId: integrationActor.userId,
  role: integrationActor.roleName,
}

let goodDriverId = ""
let conflictedDriverId = ""
let expiredDriverId = ""
let alternativeDriverId = ""
let goodTruckId = ""
let conflictedTruckId = ""
let maintenanceTruckId = ""
let alternativeTruckId = ""
let zoneId = ""
let goodDriverPhone = ""
let goodDriverLicense = ""

async function clean() {
  await db.dispatchRecommendation.deleteMany()
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
  const goodIdentity = fixtureIdentity()
  const conflictIdentity = fixtureIdentity()
  const expiredIdentity = fixtureIdentity()
  const maintenanceIdentity = fixtureIdentity()
  const alternativeIdentity = fixtureIdentity()

  goodDriverPhone = goodIdentity.driverPhone
  goodDriverLicense = goodIdentity.licenseNumber

  const [
    goodTruck,
    conflictedTruck,
    maintenanceTruck,
    alternativeTruck,
    goodDriver,
    conflictedDriver,
    expiredDriver,
    alternativeDriver,
    city,
  ] = await Promise.all([
    db.truck.create({ data: {
      plateNumber: goodIdentity.truckPlate,
      make: "MAN",
      model: "TGS",
      year: 2024,
      status: "active",
      currentMileage: 100000,
      nextServiceDate: new Date("2030-01-01T00:00:00Z"),
    } }),
    db.truck.create({ data: {
      plateNumber: conflictIdentity.truckPlate,
      make: "Volvo",
      model: "FH",
      year: 2024,
      status: "active",
      currentMileage: 90000,
    } }),
    db.truck.create({ data: {
      plateNumber: maintenanceIdentity.truckPlate,
      make: "DAF",
      model: "XF",
      year: 2023,
      status: "active",
      currentMileage: 80000,
    } }),
    db.truck.create({ data: {
      plateNumber: alternativeIdentity.truckPlate,
      make: "Scania",
      model: "R450",
      year: 2024,
      status: "active",
      currentMileage: 70000,
    } }),
    db.driver.create({ data: {
      firstName: "Safe",
      lastName: "Driver",
      phone: goodIdentity.driverPhone,
      employeeId: goodIdentity.employeeId,
      licenseNumber: goodIdentity.licenseNumber,
      licenseExpiry: new Date("2030-01-01T00:00:00Z"),
      licenseClass: "D",
      verificationStatus: "verified",
      rating: 5,
      status: "active",
    } }),
    db.driver.create({ data: {
      firstName: "Busy",
      lastName: "Driver",
      phone: conflictIdentity.driverPhone,
      employeeId: conflictIdentity.employeeId,
      licenseNumber: conflictIdentity.licenseNumber,
      licenseExpiry: new Date("2030-01-01T00:00:00Z"),
      licenseClass: "D",
      verificationStatus: "verified",
      rating: 4,
      status: "active",
    } }),
    db.driver.create({ data: {
      firstName: "Expired",
      lastName: "Licence",
      phone: expiredIdentity.driverPhone,
      employeeId: expiredIdentity.employeeId,
      licenseNumber: expiredIdentity.licenseNumber,
      licenseExpiry: new Date("2026-01-01T00:00:00Z"),
      licenseClass: "D",
      verificationStatus: "verified",
      rating: 5,
      status: "active",
    } }),
    db.driver.create({ data: {
      firstName: "Alternative",
      lastName: "Driver",
      phone: alternativeIdentity.driverPhone,
      employeeId: alternativeIdentity.employeeId,
      licenseNumber: alternativeIdentity.licenseNumber,
      licenseExpiry: new Date("2030-01-01T00:00:00Z"),
      licenseClass: "D",
      verificationStatus: "verified",
      rating: 3,
      status: "active",
    } }),
    db.destinationCity.create({ data: {
      name: `Dispatch City ${goodIdentity.suffix}`,
      region: "Greater Accra",
    } }),
  ])

  goodDriverId = goodDriver.id
  conflictedDriverId = conflictedDriver.id
  expiredDriverId = expiredDriver.id
  alternativeDriverId = alternativeDriver.id
  goodTruckId = goodTruck.id
  conflictedTruckId = conflictedTruck.id
  maintenanceTruckId = maintenanceTruck.id
  alternativeTruckId = alternativeTruck.id

  const zone = await db.destinationZone.create({
    data: { name: `Dispatch Zone ${goodIdentity.suffix}`, destinationCityId: city.id },
  })
  zoneId = zone.id

  await Promise.all([
    db.insurance.create({ data: {
      truckId: goodTruck.id,
      provider: "Integration Assurance",
      policyNumber: `POL-${goodIdentity.suffix}`,
      type: "comprehensive",
      premium: 1000,
      startDate: new Date("2026-01-01T00:00:00Z"),
      endDate: new Date("2030-01-01T00:00:00Z"),
      status: "active",
    } }),
    db.roadworthyInspection.create({ data: {
      truckId: goodTruck.id,
      certificateNumber: `RW-${goodIdentity.suffix}`,
      inspectionType: "annual",
      inspectionDate: new Date("2026-01-01T00:00:00Z"),
      result: "pass",
      certificateIssued: true,
      certificateExpiry: new Date("2030-01-01T00:00:00Z"),
      status: "completed",
    } }),
    db.dvlaRegistration.create({ data: {
      truckId: goodTruck.id,
      registrationNumber: `REG-${goodIdentity.suffix}`,
      certificateNumber: `DVLA-${goodIdentity.suffix}`,
      vehicleClass: "Heavy Goods",
      registeredOwner: "Integration Fleet",
      registrationDate: new Date("2025-01-01T00:00:00Z"),
      expiryDate: new Date("2030-01-01T00:00:00Z"),
      status: "active",
    } }),
    db.maintenanceRecord.create({ data: {
      truckId: maintenanceTruck.id,
      type: "corrective",
      title: "Brake repair in progress",
      status: "in_progress",
    } }),
  ])

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
  test("excludes conflicts, expired licences and maintenance while ranking eligible pairs deterministically", async () => {
    const departureTime = new Date("2026-10-08T08:00:00Z")
    const request = {
      departureTime,
      destinationZoneId: zoneId,
      cargoUnit: "bags",
      quantity: 600,
    }
    const evidence = await loadDispatchCandidateEvidence(request, db as never)

    const safeDriver = evidence.drivers.find((driver) => driver.id === goodDriverId)
    const busyDriver = evidence.drivers.find((driver) => driver.id === conflictedDriverId)
    const safeTruck = evidence.trucks.find((truck) => truck.id === goodTruckId)
    const busyTruck = evidence.trucks.find((truck) => truck.id === conflictedTruckId)
    const maintenanceTruck = evidence.trucks.find((truck) => truck.id === maintenanceTruckId)
    const alternativeTruck = evidence.trucks.find((truck) => truck.id === alternativeTruckId)

    expect(safeDriver?.routeExperienceScore).toBe(10)
    expect(safeDriver?.hasConflictingTrip).toBe(false)
    expect(busyDriver?.hasConflictingTrip).toBe(true)
    expect(safeTruck?.hasConflictingTrip).toBe(false)
    expect(safeTruck?.compliance).toEqual({ insurance: "valid", roadworthy: "valid", dvla: "valid" })
    expect(busyTruck?.hasConflictingTrip).toBe(true)
    expect(maintenanceTruck?.maintenanceBlocking).toBe(true)
    expect(alternativeTruck?.compliance).toEqual({ insurance: "missing", roadworthy: "missing", dvla: "missing" })

    const first = await generateDispatchRecommendations({
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
    const second = await generateDispatchRecommendations({
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

    expect(first.explanationSource).toBe("deterministic")
    expect(first.candidates.map((row) => `${row.driverId}:${row.truckId}`)).toEqual(
      second.candidates.map((row) => `${row.driverId}:${row.truckId}`),
    )
    expect(first.blockedDrivers.map((row) => row.id)).toEqual(
      expect.arrayContaining([conflictedDriverId, expiredDriverId]),
    )
    expect(first.blockedTrucks.map((row) => row.id)).toEqual(
      expect.arrayContaining([conflictedTruckId, maintenanceTruckId]),
    )

    const blockedIds = new Set([
      conflictedDriverId,
      expiredDriverId,
      conflictedTruckId,
      maintenanceTruckId,
    ])
    for (const candidate of first.candidates) {
      expect(blockedIds.has(candidate.driverId)).toBe(false)
      expect(blockedIds.has(candidate.truckId)).toBe(false)
    }

    const fullyEvidenced = first.candidates.find((row) => row.driverId === goodDriverId && row.truckId === goodTruckId)
    const advisoryEvidence = first.candidates.find((row) => row.driverId === alternativeDriverId && row.truckId === alternativeTruckId)
    expect(fullyEvidenced).toBeDefined()
    expect(advisoryEvidence).toBeDefined()
    expect((fullyEvidenced?.dataQuality ?? 0)).toBeGreaterThan(advisoryEvidence?.dataQuality ?? 0)
  })

  test("persists provenance and records stale acceptance without creating or mutating a trip assignment", async () => {
    const departureTime = new Date("2026-10-09T08:00:00Z")
    const tripsBeforeRecommendation = await db.trip.count()

    const recommendation = await getDispatchRecommendations({
      tripDraft: {
        departureTime,
        destinationZoneId: zoneId,
        quantity: 600,
        cargoUnit: "bags",
      },
    }, dispatchActor)

    expect(recommendation.ranked.length).toBeGreaterThan(0)
    expect(await db.trip.count()).toBe(tripsBeforeRecommendation)

    const persisted = await db.dispatchRecommendation.findUnique({
      where: { id: recommendation.recommendationId },
    })
    expect(persisted).not.toBeNull()
    expect(persisted?.requestedBy).toBe(dispatchActor.userId)
    expect(persisted?.rulesetVersion).toBeTruthy()
    expect(persisted?.inputHash).toHaveLength(64)
    expect(persisted?.status).toBe("pending")
    expect(persisted?.inputSnapshot).not.toContain(goodDriverPhone)
    expect(persisted?.inputSnapshot).not.toContain(goodDriverLicense)

    const selected = recommendation.ranked[0]
    await createTrip({
      truckId: selected.truckId,
      driverId: selected.driverId,
      departureTime: new Date("2026-10-09T07:30:00Z"),
      loadingLocation: "Tema Factory",
      destination: "Late conflict customer",
      destinationZoneId: zoneId,
      itemName: "Cement",
      quantity: 600,
      unit: "bags",
    }, integrationActor, db as never)
    const tripsAfterConflict = await db.trip.count()

    const decision = await recordDispatchDecision(recommendation.recommendationId, {
      decision: "accepted",
      selectedDriverId: selected.driverId,
      selectedTruckId: selected.truckId,
      reason: "Dispatcher selected top recommendation",
    }, dispatchActor)

    expect(decision.stale).toBe(true)
    expect(decision.status).toBe("stale")
    expect(decision.selectedDriverId).toBe(selected.driverId)
    expect(decision.selectedTruckId).toBe(selected.truckId)
    expect(await db.trip.count()).toBe(tripsAfterConflict)

    const savedDecision = await db.dispatchRecommendation.findUnique({
      where: { id: recommendation.recommendationId },
    })
    expect(savedDecision?.decision).toBe("accepted")
    expect(savedDecision?.decisionBy).toBe(dispatchActor.userId)
    expect(savedDecision?.status).toBe("stale")
  })
})
