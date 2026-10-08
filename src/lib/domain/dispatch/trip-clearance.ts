import { db } from '@/lib/db'
import { evaluateCompliance } from '@/lib/domain/compliance/rule-engine'
import { storedComplianceRuleToDomain } from '@/lib/domain/compliance/rule-set-input'
import { evaluateAssignmentEligibility } from '@/lib/domain/dispatch/eligibility'
import {
  evaluateDispatchClearance,
  type DispatchClearanceInput,
  type DispatchClearanceResult,
} from '@/lib/domain/dispatch/clearance'

function stringList(value: string | null | undefined): string[] {
  if (!value) return []
  try {
    const parsed = JSON.parse(value)
    return Array.isArray(parsed) ? parsed.map(String).map((item) => item.trim()).filter(Boolean) : []
  } catch {
    return value.split(',').map((part) => part.trim()).filter(Boolean)
  }
}

function settings(value: string | null | undefined): Record<string, unknown> {
  if (!value) return {}
  try {
    const parsed = JSON.parse(value)
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed)
      ? parsed as Record<string, unknown>
      : {}
  } catch {
    return {}
  }
}

function parseClearanceDetails(value: string | null | undefined): { blocking: string[]; warnings: string[] } {
  if (!value) return { blocking: [], warnings: [] }
  try {
    const parsed = JSON.parse(value) as Record<string, unknown>
    const blocking = Array.isArray(parsed.blocking)
      ? parsed.blocking.map((item) => {
          if (typeof item === 'string') return item
          if (item && typeof item === 'object' && 'type' in item) return `Blocking weight rule: ${String((item as { type?: unknown }).type ?? 'unknown')}`
          return 'Blocking weight rule failed'
        })
      : []
    const reasons = Array.isArray(parsed.reasons) ? parsed.reasons.map(String) : []
    const warnings = Array.isArray(parsed.warnings)
      ? parsed.warnings.map((item) => {
          if (typeof item === 'string') return item
          if (item && typeof item === 'object' && 'type' in item) return `Weight warning: ${String((item as { type?: unknown }).type ?? 'unknown')}`
          return 'Weight warning'
        })
      : []
    return { blocking: [...reasons, ...blocking], warnings }
  } catch {
    return { blocking: [], warnings: [] }
  }
}

function isCurrent(value: Date | null | undefined, now: Date): boolean {
  return Boolean(value && value.getTime() > now.getTime())
}

export class TripClearanceError extends Error {
  constructor(public readonly code: 'NOT_FOUND', message: string) {
    super(message)
    this.name = 'TripClearanceError'
  }
}

export async function evaluateTripDispatchClearance(
  tripId: string,
  override: DispatchClearanceInput['override'] = null,
): Promise<DispatchClearanceResult> {
  const now = new Date()
  const trip = await db.trip.findUnique({
    where: { id: tripId },
    include: {
      driver: true,
      truck: {
        include: {
          Insurance: { orderBy: { endDate: 'desc' }, take: 1 },
          RoadworthyInspection: { orderBy: { inspectionDate: 'desc' }, take: 1 },
          MaintenanceRecord: { where: { status: { in: ['pending', 'in_progress'] } }, take: 1 },
        },
      },
      trailer: true,
      loadOrder: {
        include: {
          shipperProfile: { include: { ShipperSiteRule: true } },
        },
      },
    },
  })
  if (!trip) throw new TripClearanceError('NOT_FOUND', 'Trip not found')

  const profile = trip.loadOrder?.shipperProfile ?? null
  const siteRule = profile?.ShipperSiteRule.find((rule) => rule.loadingPointId === trip.loadingPointId && rule.isActive) ?? null
  const profileSettings = settings(profile?.extensibleSettings)
  const allowedLicenseClasses = Array.isArray(profileSettings.allowedLicenseClasses)
    ? profileSettings.allowedLicenseClasses.map(String)
    : []
  const allowedTrailerTypes = trip.loadOrder?.requiredTrailerType
    ? [trip.loadOrder.requiredTrailerType]
    : stringList(siteRule?.allowedTrailerTypes ?? profile?.allowedTrailerTypes)
  const requiredDocuments = stringList(siteRule?.requiredDocuments ?? profile?.requiredDocuments)

  const documents = await db.document.findMany({
    where: {
      OR: [
        { entityType: 'Trip', entityId: trip.id },
        { entityType: 'Driver', entityId: trip.driverId },
        { entityType: 'Truck', entityId: trip.truckId },
        ...(trip.trailerId ? [{ entityType: 'Trailer', entityId: trip.trailerId }] : []),
      ],
    },
    select: { id: true, category: true },
  })

  const documentValidity = new Map<string, Date | null>()
  for (const document of documents) documentValidity.set(document.category, null)
  if (trip.driver.ghanaCardNumber) documentValidity.set('ghana_card', trip.driver.ghanaCardExpiry ?? null)
  if (trip.driver.licenseNumber) documentValidity.set('driver_license', trip.driver.licenseExpiry)
  const latestInsurance = trip.truck.Insurance[0] ?? null
  const latestRoadworthy = trip.truck.RoadworthyInspection[0] ?? null
  if (latestInsurance) documentValidity.set('insurance', latestInsurance.endDate)
  if (latestRoadworthy) documentValidity.set('roadworthy', latestRoadworthy.certificateExpiry ?? null)
  if (trip.trailer?.registrationExpiry) documentValidity.set('trailer_registration', trip.trailer.registrationExpiry)
  if (trip.trailer?.roadworthyExpiry) documentValidity.set('trailer_roadworthy', trip.trailer.roadworthyExpiry)

  const assignment = evaluateAssignmentEligibility({
    now,
    driver: {
      id: trip.driver.id,
      status: trip.driver.status,
      verificationStatus: trip.driver.verificationStatus,
      licenseExpiry: trip.driver.licenseExpiry,
      licenseClass: trip.driver.licenseClass,
    },
    tractor: { id: trip.truck.id, status: trip.truck.status },
    insurance: latestInsurance ? { status: latestInsurance.status, endDate: latestInsurance.endDate } : null,
    roadworthy: latestRoadworthy ? {
      status: latestRoadworthy.status,
      result: latestRoadworthy.result,
      vehicleFitness: latestRoadworthy.vehicleFitness,
      certificateIssued: latestRoadworthy.certificateIssued,
      certificateExpiry: latestRoadworthy.certificateExpiry,
    } : null,
    maintenance: { blocking: trip.truck.MaintenanceRecord.length > 0 },
    trailer: trip.trailer ? {
      id: trip.trailer.id,
      status: trip.trailer.status,
      trailerType: trip.trailer.trailerType,
      registrationExpiry: trip.trailer.registrationExpiry,
      roadworthyExpiry: trip.trailer.roadworthyExpiry,
    } : null,
    requirements: {
      requiresTrailer: Boolean(trip.loadOrder?.requiredTrailerType),
      allowedLicenseClasses,
      allowedTrailerTypes,
      requiredDocuments,
    },
    documents: [...documentValidity].map(([category, validUntil]) => ({ category, validUntil })),
  })

  const [gateIn, completedQueue, weighingEvents, electronicWaybill, complianceRuleSets] = await Promise.all([
    db.gateEvent.findFirst({
      where: { tripId: trip.id, direction: 'in' },
      orderBy: [{ occurredAt: 'desc' }, { createdAt: 'desc' }],
      select: { id: true },
    }),
    db.factoryQueueEntry.findFirst({
      where: { tripId: trip.id, status: 'completed' },
      orderBy: [{ completedAt: 'desc' }, { updatedAt: 'desc' }],
      select: { id: true },
    }),
    db.weighingEvent.findMany({
      where: { tripId: trip.id },
      select: {
        id: true,
        stage: true,
        recordedAt: true,
        grossWeightKg: true,
        tareWeightKg: true,
        netWeightKg: true,
        clearancePassed: true,
        clearanceDetails: true,
        supersedesEventId: true,
        axleReadings: {
          select: { axleNumber: true, axleGroup: true, weightKg: true },
          orderBy: { axleNumber: 'asc' },
        },
      },
      orderBy: [{ recordedAt: 'desc' }, { createdAt: 'desc' }],
    }),
    db.electronicWaybill.findUnique({ where: { tripId: trip.id } }),
    db.complianceRuleSet.findMany({
      where: {
        isCurrent: true,
        isActive: true,
        effectiveFrom: { lte: now },
        OR: [{ effectiveTo: null }, { effectiveTo: { gte: now } }],
      },
      include: { rules: { where: { isActive: true } } },
    }),
  ])

  const supersededIds = new Set(
    weighingEvents.map((event) => event.supersedesEventId).filter((id): id is string => Boolean(id)),
  )
  const effectiveWeighing = weighingEvents.find((event) =>
    !supersededIds.has(event.id) &&
    ['AXLE', 'GROSS', 'ROAD_CHECK'].includes(event.stage) &&
    event.clearancePassed !== null,
  ) ?? null
  const weighingDetails = parseClearanceDetails(effectiveWeighing?.clearanceDetails)

  const availableDocumentCategories = new Set([
    ...documents.map((document) => document.category.trim().toLowerCase()),
    ...documentValidity.keys().map((category) => category.trim().toLowerCase()),
  ])
  const missingRequired = requiredDocuments.filter((category) => !availableDocumentCategories.has(category.trim().toLowerCase()))

  const currentWaybillVersion = electronicWaybill
    ? await db.electronicWaybillVersion.findUnique({
        where: { waybillId_version: { waybillId: electronicWaybill.id, version: electronicWaybill.currentVersion } },
        select: { id: true },
      })
    : null
  const WaybillSeal = electronicWaybill
    ? await db.waybillSeal.findFirst({
        where: {
          waybillId: electronicWaybill.id,
          version: electronicWaybill.currentVersion,
          status: 'applied',
          removedAt: null,
        },
        orderBy: { createdAt: 'asc' },
        select: { sealNumber: true },
      })
    : null

  const waybillRequired = Boolean(trip.loadOrder)
  const waybillFinalized = Boolean(electronicWaybill && currentWaybillVersion && electronicWaybill.status === 'finalized')
  const sealRequired = siteRule?.sealRequired ?? profile?.sealRequired ?? false

  const complianceValues: Record<string, unknown> = {
    assignment_eligible: assignment.passed,
    gate_in_recorded: Boolean(gateIn),
    queue_completed: Boolean(completedQueue),
    weight_clearance: Boolean(effectiveWeighing?.clearancePassed),
    waybill_finalized: waybillFinalized,
    seal_present: !sealRequired || Boolean(WaybillSeal),
    required_documents_present: missingRequired.length === 0,
    driver_active: trip.driver.status === 'active',
    driver_verified: trip.driver.verificationStatus === 'verified',
    driver_license_valid: isCurrent(trip.driver.licenseExpiry, now),
    tractor_active: trip.truck.status === 'active',
    tractor_insurance_valid: Boolean(latestInsurance && latestInsurance.status === 'active' && isCurrent(latestInsurance.endDate, now)),
    tractor_roadworthy_valid: Boolean(
      latestRoadworthy &&
      latestRoadworthy.status === 'completed' &&
      latestRoadworthy.result === 'passed' &&
      latestRoadworthy.vehicleFitness === 'fit' &&
      latestRoadworthy.certificateIssued === true &&
      isCurrent(latestRoadworthy.certificateExpiry, now),
    ),
    maintenance_clear: trip.truck.MaintenanceRecord.length === 0,
    trailer_present: Boolean(trip.trailer),
    trailer_active: !trip.trailer || trip.trailer.status === 'active',
    trailer_registration_valid: !trip.trailer || !trip.trailer.registrationExpiry || isCurrent(trip.trailer.registrationExpiry, now),
    trailer_roadworthy_valid: !trip.trailer || !trip.trailer.roadworthyExpiry || isCurrent(trip.trailer.roadworthyExpiry, now),
  }

  if (effectiveWeighing) {
    complianceValues.gross_weight = effectiveWeighing.grossWeightKg
    complianceValues.tare_weight = effectiveWeighing.tareWeightKg
    complianceValues.net_weight = effectiveWeighing.netWeightKg
    const axleGroups = new Map<string, number>()
    for (const reading of effectiveWeighing.axleReadings) {
      complianceValues[`axle:${reading.axleNumber}`] = reading.weightKg
      if (reading.axleGroup) {
        axleGroups.set(reading.axleGroup, (axleGroups.get(reading.axleGroup) ?? 0) + reading.weightKg)
      }
    }
    for (const [group, weightKg] of axleGroups) complianceValues[`axle_group:${group}`] = weightKg
  }

  const complianceRules = complianceRuleSets.flatMap((ruleSet) =>
    ruleSet.rules.map((rule) => storedComplianceRuleToDomain(rule)),
  )
  const complianceEvaluation = evaluateCompliance({
    occurredAt: now,
    country: 'GH',
    shipperId: profile?.id ?? null,
    vehicleType: 'tractor',
    trailerType: trip.trailer?.trailerType ?? null,
    commodityId: trip.itemId ?? trip.itemName,
    values: complianceValues,
  }, complianceRules)
  const complianceBlocking = [
    ...complianceEvaluation.blocking.map((rule) => `Compliance rule failed: ${rule.type}`),
    ...complianceEvaluation.ambiguities.map((ambiguity) => `Ambiguous compliance rules: ${ambiguity.type}`),
  ]
  const complianceWarnings = complianceEvaluation.warnings.map((rule) => `Compliance warning: ${rule.type}`)

  return evaluateDispatchClearance({
    assignment: {
      passed: assignment.passed,
      blocking: assignment.blocking,
      warnings: assignment.warnings,
    },
    gate: {
      gateInRecorded: Boolean(gateIn),
      queueCompleted: Boolean(completedQueue),
      gateEventId: gateIn?.id ?? null,
      queueEntryId: completedQueue?.id ?? null,
    },
    weighing: {
      passed: Boolean(effectiveWeighing?.clearancePassed),
      eventId: effectiveWeighing?.id ?? null,
      correctedFromEventId: effectiveWeighing?.supersedesEventId ?? null,
      blocking: effectiveWeighing
        ? (effectiveWeighing.clearancePassed ? [] : weighingDetails.blocking.length ? weighingDetails.blocking : ['Weight clearance failed'])
        : ['No cleared post-load weighing is recorded'],
      warnings: weighingDetails.warnings,
    },
    documents: {
      waybillRequired,
      waybillFinalized,
      waybillId: electronicWaybill?.id ?? null,
      missingRequired,
    },
    seal: {
      required: sealRequired,
      present: !sealRequired || Boolean(WaybillSeal),
      sealNumber: WaybillSeal?.sealNumber ?? null,
    },
    compliance: {
      passed: complianceEvaluation.passed,
      blocking: complianceBlocking,
      warnings: complianceWarnings,
    },
    override,
  })
}
