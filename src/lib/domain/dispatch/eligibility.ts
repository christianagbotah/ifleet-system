export interface EligibilityDriver {
  id: string
  status: string
  verificationStatus: string
  licenseExpiry: Date | string
  licenseClass: string
}

export interface EligibilityTractor { id: string; status: string }

export interface EligibilityTrailer {
  id: string
  status: string
  trailerType?: string | null
  registrationExpiry?: Date | string | null
  roadworthyExpiry?: Date | string | null
}

export interface EligibilityInsurance { status: string; endDate: Date | string }

export interface EligibilityRoadworthy {
  status: string
  result: string
  vehicleFitness: string
  certificateIssued?: boolean | null
  certificateExpiry?: Date | string | null
}

export interface EligibilityDocument { category: string; validUntil?: Date | string | null }

export interface EligibilityRequirements {
  requiresTrailer: boolean
  allowedLicenseClasses: string[]
  allowedTrailerTypes: string[]
  requiredDocuments: string[]
}

export interface EligibilityOverride { authorized: boolean; actorRole: string; reason: string }

export interface EligibilityInput {
  now: Date | string
  driver: EligibilityDriver
  tractor: EligibilityTractor
  insurance: EligibilityInsurance | null
  roadworthy: EligibilityRoadworthy | null
  maintenance: { blocking: boolean }
  trailer: EligibilityTrailer | null
  requirements: EligibilityRequirements
  documents: EligibilityDocument[]
  override?: EligibilityOverride | null
}

export interface EligibilityResult {
  passed: boolean
  blocking: string[]
  warnings: string[]
  overrideApplied: boolean
}

const WARNING_WINDOW_MS = 30 * 24 * 60 * 60 * 1000
const STATUTORY_DOCUMENT_CATEGORIES = new Set([
  'ghana_card',
  'driver_license',
  'insurance',
  'roadworthy',
  'trailer_registration',
  'trailer_roadworthy',
])

function token(value: string): string {
  return value.trim().toLowerCase()
}

function isOverrideableBlocker(code: string): boolean {
  if (code === 'trailer_type') return true
  if (code.startsWith('missing_document:') || code.startsWith('document_expired:')) {
    const category = token(code.slice(code.indexOf(':') + 1))
    return !STATUTORY_DOCUMENT_CATEGORIES.has(category)
  }
  return false
}

function dateValue(value: Date | string | null | undefined): number | null {
  if (!value) return null
  const time = value instanceof Date ? value.getTime() : new Date(value).getTime()
  return Number.isFinite(time) ? time : null
}

function inspectExpiry(
  value: Date | string | null | undefined,
  now: number,
  expiredCode: string,
  warningCode: string,
  blocking: string[],
  warnings: string[]
) {
  const expiry = dateValue(value)
  if (expiry == null || expiry <= now) {
    blocking.push(expiredCode)
  } else if (expiry - now <= WARNING_WINDOW_MS) {
    warnings.push(warningCode)
  }
}

export function evaluateAssignmentEligibility(input: EligibilityInput): EligibilityResult {
  const blocking: string[] = []
  const warnings: string[] = []
  const now = dateValue(input.now) ?? Date.now()

  if (input.driver.status !== 'active') blocking.push('driver_status')
  if (input.driver.verificationStatus !== 'verified') blocking.push('driver_unverified')
  inspectExpiry(input.driver.licenseExpiry, now, 'driver_license_expired', 'driver_license_expiring_soon', blocking, warnings)
  if (
    input.requirements.allowedLicenseClasses.length > 0 &&
    !input.requirements.allowedLicenseClasses.some((licenseClass) => token(licenseClass) === token(input.driver.licenseClass))
  ) blocking.push('driver_license_class')

  if (input.tractor.status !== 'active') blocking.push('tractor_unavailable')
  if (!input.insurance || input.insurance.status !== 'active') {
    blocking.push('tractor_insurance_expired')
  } else {
    inspectExpiry(input.insurance.endDate, now, 'tractor_insurance_expired', 'tractor_insurance_expiring_soon', blocking, warnings)
  }

  if (!input.roadworthy || input.roadworthy.status !== 'completed' || input.roadworthy.result !== 'passed' || input.roadworthy.vehicleFitness !== 'fit' || input.roadworthy.certificateIssued !== true) {
    blocking.push('tractor_roadworthy_invalid')
  } else {
    inspectExpiry(input.roadworthy.certificateExpiry, now, 'tractor_roadworthy_expired', 'tractor_roadworthy_expiring_soon', blocking, warnings)
  }

  if (input.maintenance.blocking) blocking.push('tractor_maintenance_block')

  if (input.requirements.requiresTrailer && !input.trailer) blocking.push('trailer_required')
  if (input.trailer) {
    if (input.trailer.status !== 'active') blocking.push('trailer_unavailable')
    if (
      input.requirements.allowedTrailerTypes.length > 0 &&
      (!input.trailer.trailerType || !input.requirements.allowedTrailerTypes.some((trailerType) => token(trailerType) === token(input.trailer!.trailerType!)))
    ) blocking.push('trailer_type')
    if (input.trailer.registrationExpiry) {
      inspectExpiry(input.trailer.registrationExpiry, now, 'trailer_registration_expired', 'trailer_registration_expiring_soon', blocking, warnings)
    }
    if (input.trailer.roadworthyExpiry) {
      inspectExpiry(input.trailer.roadworthyExpiry, now, 'trailer_roadworthy_expired', 'trailer_roadworthy_expiring_soon', blocking, warnings)
    }
  }

  for (const category of input.requirements.requiredDocuments) {
    const document = input.documents.find((candidate) => token(candidate.category) === token(category))
    if (!document) {
      blocking.push(`missing_document:${category}`)
      continue
    }
    if (document.validUntil) {
      inspectExpiry(document.validUntil, now, `document_expired:${category}`, `document_expiring_soon:${category}`, blocking, warnings)
    }
  }

  const override = input.override
  const privileged = override?.actorRole === 'Admin' || override?.actorRole === 'Manager'
  const overrideApplied = Boolean(
    blocking.length > 0 &&
    blocking.every(isOverrideableBlocker) &&
    override?.authorized &&
    privileged &&
    override.reason.trim().length >= 8
  )
  if (overrideApplied) warnings.push('override_applied')

  return {
    passed: blocking.length === 0 || overrideApplied,
    blocking,
    warnings,
    overrideApplied,
  }
}
