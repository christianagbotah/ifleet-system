import { afterAll, beforeAll, describe, expect, test } from "bun:test"
import { PrismaMariaDb } from "@prisma/adapter-mariadb"
import { PrismaClient } from "../../src/generated/client"
import {
  getDispatchRecommendations,
  recordDispatchDecision,
} from "../../src/lib/services/dispatch-copilot-service"
import { fixtureIdentity } from "../fixtures/core-integrity"

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
const actor = { userId: "dispatch-maintenance-integration", role: "Manager" }

let driverId = ""
let truckId = ""

beforeAll(async () => {
  await db.dispatchRecommendation.deleteMany()
  await db.maintenanceRecord.deleteMany()

  const identity = fixtureIdentity()
  const [driver, truck] = await Promise.all([
    db.driver.create({ data: {
      firstName: "Maintenance",
      lastName: "Recheck",
      phone: identity.driverPhone,
      employeeId: identity.employeeId,
      licenseNumber: identity.licenseNumber,
      licenseExpiry: new Date("2030-01-01T00:00:00Z"),
      licenseClass: "D",
      verificationStatus: "verified",
      rating: 5,
      status: "active",
    } }),
    db.truck.create({ data: {
      plateNumber: identity.truckPlate,
      make: "MAN",
      model: "TGS",
      year: 2024,
      status: "active",
      currentMileage: 50000,
      nextServiceDate: new Date("2030-01-01T00:00:00Z"),
    } }),
  ])

  driverId = driver.id
  truckId = truck.id
})

afterAll(async () => {
  await db.dispatchRecommendation.deleteMany()
  await db.maintenanceRecord.deleteMany({ where: { truckId } })
  await db.truck.deleteMany({ where: { id: truckId } })
  await db.driver.deleteMany({ where: { id: driverId } })
  await db.$disconnect()
})

describe("dispatch decision-time safety revalidation", () => {
  test("marks acceptance stale when maintenance becomes blocking after recommendation", async () => {
    const departureTime = new Date("2026-10-10T08:00:00Z")
    const tripsBefore = await db.trip.count()

    const recommendation = await getDispatchRecommendations({
      tripDraft: {
        departureTime,
        quantity: 600,
        cargoUnit: "bags",
      },
    }, actor)

    expect(recommendation.ranked[0]).toMatchObject({ driverId, truckId })

    const persisted = await db.dispatchRecommendation.findUnique({
      where: { id: recommendation.recommendationId },
    })
    expect(persisted?.status).toBe("pending")
    expect(persisted?.requestedBy).toBe(actor.userId)

    await db.maintenanceRecord.create({
      data: {
        truckId,
        type: "safety_inspection",
        title: "Post-recommendation safety hold",
        status: "in_progress",
      },
    })

    const decision = await recordDispatchDecision(
      recommendation.recommendationId,
      {
        decision: "accepted",
        selectedDriverId: driverId,
        selectedTruckId: truckId,
        reason: "Dispatcher selected recommendation before maintenance hold",
      },
      actor,
    )

    expect(decision.stale).toBe(true)
    expect(decision.status).toBe("stale")
    expect(decision.decision).toBe("accepted")
    expect(decision.selectedDriverId).toBe(driverId)
    expect(decision.selectedTruckId).toBe(truckId)
    expect(await db.trip.count()).toBe(tripsBefore)

    const stored = await db.dispatchRecommendation.findUnique({
      where: { id: recommendation.recommendationId },
    })
    expect(stored?.status).toBe("stale")
    expect(stored?.decisionBy).toBe(actor.userId)
  })
})
