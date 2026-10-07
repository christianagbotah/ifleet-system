import type {
  DispatchEligibilityContext,
  DriverEligibilityCandidate,
  EligibilityReason,
  EligibilityResult,
  TruckEligibilityCandidate,
} from "./types"

function reason(code: string, message: string, field?: string): EligibilityReason {
  return { code, message, ...(field ? { field } : {}) }
}

function asDate(value: Date | string): Date | null {
  const date = value instanceof Date ? value : new Date(value)
  return Number.isFinite(date.getTime()) ? date : null
}

export function evaluateDriverEligibility(
  candidate: DriverEligibilityCandidate,
  context: DispatchEligibilityContext,
): EligibilityResult {
  const hardBlocks: EligibilityReason[] = []
  const warnings: EligibilityReason[] = []
  const missingData: string[] = []
  const requireVerifiedDriver = context.policy?.requireVerifiedDriver ?? true

  if (candidate.status !== "active") {
    hardBlocks.push(reason("DRIVER_NOT_ACTIVE", "Driver is not active", "status"))
  }

  if (candidate.verificationStatus === "rejected" || candidate.verificationStatus === "expired") {
    hardBlocks.push(reason(
      "DRIVER_VERIFICATION_INVALID",
      "Driver verification is rejected or expired",
      "verificationStatus",
    ))
  } else if (candidate.verificationStatus !== "verified") {
    if (requireVerifiedDriver) {
      hardBlocks.push(reason("DRIVER_NOT_VERIFIED", "Driver verification is not complete", "verificationStatus"))
    } else {
      warnings.push(reason(
        "DRIVER_VERIFICATION_PENDING",
        "Driver verification is incomplete and requires dispatcher review",
        "verificationStatus",
      ))
    }
  }

  const departure = asDate(context.departureTime)
  const licenseExpiry = asDate(candidate.licenseExpiry)
  if (!departure) {
    hardBlocks.push(reason("INVALID_DEPARTURE_TIME", "Planned departure time is invalid", "departureTime"))
  }
  if (!licenseExpiry) {
    hardBlocks.push(reason("DRIVER_LICENCE_DATE_INVALID", "Driver licence expiry is invalid", "licenseExpiry"))
  } else if (departure && licenseExpiry.getTime() <= departure.getTime()) {
    hardBlocks.push(reason("DRIVER_LICENCE_EXPIRED", "Driver licence is expired at planned departure", "licenseExpiry"))
  }

  if (candidate.hasConflictingTrip) {
    hardBlocks.push(reason("DRIVER_TRIP_CONFLICT", "Driver is already committed to another active trip"))
  }

  return {
    eligible: hardBlocks.length === 0,
    hardBlocks,
    warnings,
    missingData,
  }
}

export function evaluateTruckEligibility(
  candidate: TruckEligibilityCandidate,
  context: DispatchEligibilityContext,
): EligibilityResult {
  const hardBlocks: EligibilityReason[] = []
  const warnings: EligibilityReason[] = []
  const missingData: string[] = []
  const requireCompleteCompliance = context.policy?.requireCompleteTruckCompliance ?? false

  if (candidate.status !== "active") {
    hardBlocks.push(reason("TRUCK_NOT_ACTIVE", "Truck is not active", "status"))
  }

  if (candidate.maintenanceBlocking) {
    hardBlocks.push(reason("TRUCK_MAINTENANCE_BLOCK", "Truck has a blocking maintenance condition"))
  }

  if (candidate.capacitySufficient === false) {
    hardBlocks.push(reason(
      "TRUCK_CAPACITY_INSUFFICIENT",
      "Authoritative vehicle capacity is below the planned load",
      "capacity",
    ))
  }

  if (candidate.hasConflictingTrip) {
    hardBlocks.push(reason("TRUCK_TRIP_CONFLICT", "Truck is already committed to another active trip"))
  }

  const complianceEntries = [
    ["insurance", candidate.compliance.insurance, "TRUCK_INSURANCE_EXPIRED", "Truck insurance is expired or failed"],
    ["roadworthy", candidate.compliance.roadworthy, "TRUCK_ROADWORTHY_EXPIRED", "Truck roadworthiness is expired or failed"],
    ["dvla", candidate.compliance.dvla, "TRUCK_DVLA_EXPIRED", "Truck registration is expired, suspended, cancelled, or failed"],
  ] as const

  for (const [field, state, expiredCode, expiredMessage] of complianceEntries) {
    if (state === "expired" || state === "failed") {
      hardBlocks.push(reason(expiredCode, expiredMessage, field))
    } else if (state === "missing" || state === "unknown") {
      missingData.push(field)
    }
  }

  if (missingData.length > 0) {
    const incomplete = reason(
      "TRUCK_COMPLIANCE_INCOMPLETE",
      `Truck compliance data is incomplete: ${missingData.join(", ")}`,
      "compliance",
    )
    if (requireCompleteCompliance) hardBlocks.push(incomplete)
    else warnings.push(incomplete)
  }

  return {
    eligible: hardBlocks.length === 0,
    hardBlocks,
    warnings,
    missingData,
  }
}
