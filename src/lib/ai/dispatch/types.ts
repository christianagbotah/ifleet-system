export type DriverOperationalStatus = "active" | "inactive" | "suspended" | "resigned"
export type DriverVerificationState = "pending" | "verified" | "rejected" | "expired"
export type TruckOperationalStatus = "active" | "inactive" | "maintenance" | "out_of_service" | "retired" | "decommissioned"
export type ComplianceEvidenceState = "valid" | "expired" | "failed" | "missing" | "unknown"

export type DispatchEligibilityPolicy = {
  requireVerifiedDriver?: boolean
  requireCompleteTruckCompliance?: boolean
}

export type DispatchEligibilityContext = {
  departureTime: Date | string
  policy?: DispatchEligibilityPolicy
}

export type DriverEligibilityCandidate = {
  id: string
  name: string
  status: DriverOperationalStatus
  verificationStatus: DriverVerificationState
  licenseExpiry: Date | string
  hasConflictingTrip: boolean
}

export type TruckComplianceEvidence = {
  insurance: ComplianceEvidenceState
  roadworthy: ComplianceEvidenceState
  dvla: ComplianceEvidenceState
}

export type TruckEligibilityCandidate = {
  id: string
  plateNumber: string
  status: TruckOperationalStatus
  hasConflictingTrip: boolean
  maintenanceBlocking: boolean
  compliance: TruckComplianceEvidence
}

export type EligibilityReason = {
  code: string
  message: string
  field?: string
}

export type EligibilityResult = {
  eligible: boolean
  hardBlocks: EligibilityReason[]
  warnings: EligibilityReason[]
  missingData: string[]
}
