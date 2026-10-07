import { describe, expect, test } from "bun:test"
import { readFileSync } from "node:fs"

const panel = readFileSync("src/components/trips/DispatchCopilotPanel.tsx", "utf8")
const tripForm = readFileSync("src/components/trips/TripFormDialog.tsx", "utf8")

describe("Dispatch Copilot trip-form contract", () => {
  test("mounts the copilot in the trip form and only prefills assignment fields", () => {
    expect(tripForm).toContain("DispatchCopilotPanel")
    expect(tripForm).toContain("<DispatchCopilotPanel")
    expect(tripForm).toContain("onUseRecommendation")
    expect(tripForm).toContain("form.setValue('truckId'")
    expect(tripForm).toContain("form.setValue('driverId'")

    expect(panel).not.toContain("createTrip(")
    expect(panel).not.toContain("updateTrip(")
    expect(panel).not.toContain("handleSubmit(")
  })

  test("shows deterministic evidence, confidence/data quality and stale/fallback semantics", () => {
    expect(panel).toContain("Dispatch Copilot")
    expect(panel).toContain("Score")
    expect(panel).toContain("Confidence")
    expect(panel).toContain("Data")
    expect(panel).toContain("Eligible")
    expect(panel).toContain("Evidence")
    expect(panel).toContain("stale")
    expect(panel).toContain("deterministic")
    expect(panel).toContain("Some optional evidence is missing")
  })

  test("passes only dispatch-relevant draft fields from the form", () => {
    expect(tripForm).toContain("departureTime=")
    expect(tripForm).toContain("destinationZoneId=")
    expect(tripForm).toContain("quantity=")
    expect(tripForm).toContain("cargoUnit=")
    expect(tripForm).not.toContain("availableDrivers=")
    expect(tripForm).not.toContain("availableTrucks=")
  })
})
