export type OdometerReadingType =
  | "trip_start"
  | "trip_end"
  | "fuel"
  | "maintenance"
  | "inspection"
  | "manual_adjustment"
  | "import"

export type OdometerValidationInput = {
  latestVerifiedReading: number | null
  tripStartReading?: number | null
  candidateReading: number
  readingType: OdometerReadingType
  allowAdjustment?: boolean
}

export type OdometerValidationResult =
  | { valid: true }
  | { valid: false; code: string; message: string }

export function validateOdometerReading(
  input: OdometerValidationInput,
): OdometerValidationResult {
  const {
    latestVerifiedReading,
    tripStartReading,
    candidateReading,
    readingType,
    allowAdjustment = false,
  } = input

  if (!Number.isFinite(candidateReading) || candidateReading < 0) {
    return { valid: false, code: "INVALID_ODOMETER", message: "Odometer reading must be a non-negative finite number" }
  }

  if (readingType === "trip_end" && tripStartReading != null && candidateReading < tripStartReading) {
    return { valid: false, code: "END_BEFORE_START", message: "Trip end mileage cannot be below trip start mileage" }
  }

  const isAuthorizedAdjustment = readingType === "manual_adjustment" && allowAdjustment
  if (!isAuthorizedAdjustment && latestVerifiedReading != null && candidateReading < latestVerifiedReading) {
    return { valid: false, code: "ODOMETER_ROLLBACK", message: "Odometer reading cannot be below the latest verified reading" }
  }

  return { valid: true }
}
