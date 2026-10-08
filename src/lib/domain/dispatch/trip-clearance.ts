import { db } from '@/lib/db'
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
    now: new Date(),
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

  const [gateIn, completedQueue, weighingEvents] = await Promise.all([
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
        clearancePassed: true,
        clearanceDetails: true,
        supersedesEventId: true,
      },
      orderBy: [{ recordedAt: 'desc' }, { createdAt: 'desc' }],
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
  const waybillRequired = Boolean(siteRule?.weighingStages || profile?.waybillFields)
  const waybillFinalized = Boolean(trip.waybillNumber)
  const sealRequired = siteRule?.sealRequired ?? profile?.sealRequired ?? false
  const sealDocument = documents.find((document) => ['cargo_seal', 'seal', 'seal_record'].includes(document.category.trim().toLowerCase()))

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
      waybillId: trip.waybillNumber ?? null,
      missingRequired,
    },
    seal: {
      required: sealRequired,
      present: !sealRequired || Boolean(sealDocument),
      sealNumber: sealDocument?.id ?? null,
    },
    compliance: {
      passed: true,
      blocking: [],
      warnings: [],
    },
    override,
  })
}
