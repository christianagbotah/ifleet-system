import { createHash } from 'node:crypto'
import { NextRequest, NextResponse } from 'next/server'

import { requirePermission } from '@/lib/auth-server'
import { db } from '@/lib/db'
import { ASSIGNMENT_RECOMMENDATION_CONFIG } from '@/lib/domain/ai-ops/assignment-config'
import { buildTrailerAssignmentOptions, hasTrailerCouplingConflict, rankAssignmentCandidates, type AssignmentCandidate } from '@/lib/domain/ai-ops/assignment'
import { evaluateAssignmentEligibility } from '@/lib/domain/dispatch/eligibility'

function stringList(value: string | null | undefined): string[] {
  if (!value) return []
  try {
    const parsed = JSON.parse(value)
    return Array.isArray(parsed) ? parsed.map(String).filter(Boolean) : []
  } catch {
    return value.split(',').map((part) => part.trim()).filter(Boolean)
  }
}

function settings(value: string | null | undefined): Record<string, unknown> {
  if (!value) return {}
  try {
    const parsed = JSON.parse(value)
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : {}
  } catch {
    return {}
  }
}

function token(value: string | null | undefined): string {
  return (value ?? '').trim().toLowerCase()
}

function haversineKm(a: { latitude: number; longitude: number }, b: { latitude: number; longitude: number }): number {
  const rad = (value: number) => value * Math.PI / 180
  const dLat = rad(b.latitude - a.latitude)
  const dLon = rad(b.longitude - a.longitude)
  const lat1 = rad(a.latitude)
  const lat2 = rad(b.latitude)
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLon / 2) ** 2
  return 6371 * 2 * Math.atan2(Math.sqrt(h), Math.sqrt(1 - h))
}

function maintenanceHealth(nextServiceDate: Date | null): number {
  if (!nextServiceDate) return 0.82
  const days = (nextServiceDate.getTime() - Date.now()) / 86_400_000
  if (days <= 0) return 0.45
  if (days <= 14) return 0.65
  if (days <= 30) return 0.78
  return 0.95
}

function vehicleMatches(required: string, vehicleClass?: string | null, bodyType?: string | null): boolean {
  const wanted = token(required)
  return [vehicleClass, bodyType].some((value) => {
    const actual = token(value)
    return Boolean(actual) && (actual === wanted || actual.includes(wanted) || wanted.includes(actual))
  })
}

export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = requirePermission(request, 'trips.create')
  if (auth instanceof NextResponse) return auth

  const { id } = await params
  const config = ASSIGNMENT_RECOMMENDATION_CONFIG
  const order = await db.loadOrder.findUnique({
    where: { id },
    include: {
      shipperProfile: { include: { ShipperSiteRule: true } },
      loadingPoint: true,
      LoadOrderDestination: { orderBy: { stopOrder: 'asc' } },
    },
  })
  if (!order) return NextResponse.json({ error: 'Load order not found' }, { status: 404 })
  if (['completed', 'cancelled'].includes(order.status)) {
    return NextResponse.json({ error: `Load order is ${order.status}` }, { status: 409 })
  }

  const oneYearAgo = new Date(Date.now() - 365 * 86_400_000)
  const [drivers, tractors, trailers, activeTrips, activeCouplings, history, loadingAnchor] = await Promise.all([
    db.driver.findMany({ where: { status: 'active' }, orderBy: [{ rating: 'desc' }, { employeeId: 'asc' }], take: config.maxDrivers }),
    db.truck.findMany({
      where: { status: 'active' }, orderBy: { plateNumber: 'asc' }, take: config.maxTractors,
      include: {
        Insurance: { orderBy: { endDate: 'desc' }, take: 1 },
        RoadworthyInspection: { orderBy: { inspectionDate: 'desc' }, take: 1 },
        MaintenanceRecord: { where: { status: { in: ['pending', 'in_progress'] } }, take: 1 },
        DvlaRegistration: { orderBy: { expiryDate: 'desc' }, take: 1 },
        TruckLocation: { orderBy: { timestamp: 'desc' }, take: 1 },
      },
    }),
    db.trailer.findMany({ where: { status: 'active' }, orderBy: { plateNumber: 'asc' }, take: 30 }),
    db.trip.findMany({ where: { status: { notIn: ['completed', 'cancelled'] } }, select: { driverId: true, truckId: true, trailerId: true } }),
    db.trailerCoupling.findMany({ where: { decoupledAt: null }, select: { tractorId: true, trailerId: true } }),
    db.trip.findMany({
      where: { status: 'completed', arrivalTime: { gte: oneYearAgo } },
      select: {
        driverId: true, truckId: true, destination: true, destinationZoneId: true,
        totalMileage: true, fuelUsed: true, actualDuration: true, estimatedDuration: true,
      },
      take: 2500,
    }),
    db.trip.findFirst({
      where: { loadingPointId: order.loadingPointId, loadingLat: { not: null }, loadingLng: { not: null } },
      orderBy: { createdAt: 'desc' }, select: { loadingLat: true, loadingLng: true },
    }),
  ])

  const driverIds = drivers.map((driver) => driver.id)
  const tractorIds = tractors.map((tractor) => tractor.id)
  const trailerIds = trailers.map((trailer) => trailer.id)
  const documents = await db.document.findMany({
    where: {
      OR: [
        ...driverIds.map((entityId) => ({ entityType: 'Driver', entityId })),
        ...tractorIds.map((entityId) => ({ entityType: 'Truck', entityId })),
        ...trailerIds.map((entityId) => ({ entityType: 'Trailer', entityId })),
      ],
    },
    select: { entityType: true, entityId: true, category: true },
  })

  const busyDrivers = new Set(activeTrips.map((trip) => trip.driverId).filter(Boolean))
  const busyTractors = new Set(activeTrips.map((trip) => trip.truckId).filter(Boolean))
  const busyTrailers = new Set(activeTrips.map((trip) => trip.trailerId).filter(Boolean))

  const siteRule = order.shipperProfile.ShipperSiteRule.find((rule) => rule.loadingPointId === order.loadingPointId && rule.isActive)
  const profileSettings = settings(order.shipperProfile.extensibleSettings)
  const allowedLicenseClasses = Array.isArray(profileSettings.allowedLicenseClasses) ? profileSettings.allowedLicenseClasses.map(String) : []
  const allowedTrailerTypes = order.requiredTrailerType
    ? [order.requiredTrailerType]
    : stringList(siteRule?.allowedTrailerTypes ?? order.shipperProfile.allowedTrailerTypes)
  const allowedVehicleTypes = order.requiredVehicleType
    ? [order.requiredVehicleType]
    : stringList(siteRule?.allowedVehicleTypes ?? order.shipperProfile.allowedVehicleTypes)
  const requiredDocuments = stringList(siteRule?.requiredDocuments ?? order.shipperProfile.requiredDocuments)
  const firstDestination = order.LoadOrderDestination[0]

  const availableTrailers = trailers.filter((trailer) => {
    if (busyTrailers.has(trailer.id)) return false
    if (!order.requiredTrailerType) return true
    return token(trailer.trailerType) === token(order.requiredTrailerType)
  })
  const trailerOptions = buildTrailerAssignmentOptions(Boolean(order.requiredTrailerType), availableTrailers)

  const fleetEfficiencySamples = history.flatMap((trip) => trip.totalMileage && trip.totalMileage > 0 && trip.fuelUsed && trip.fuelUsed > 0
    ? [trip.totalMileage / trip.fuelUsed]
    : [])
  const fleetEfficiency = fleetEfficiencySamples.length
    ? fleetEfficiencySamples.reduce((sum, value) => sum + value, 0) / fleetEfficiencySamples.length
    : null

  const candidates: AssignmentCandidate[] = []
  for (const driver of drivers) {
    const driverHistory = history.filter((trip) => trip.driverId === driver.id)
    const routeHistory = driverHistory.filter((trip) => firstDestination?.destinationZoneId
      ? trip.destinationZoneId === firstDestination.destinationZoneId
      : token(trip.destination) === token(firstDestination?.name))
    const timedTrips = driverHistory.filter((trip) => trip.actualDuration && trip.estimatedDuration && trip.estimatedDuration > 0)
    const onTimeRate = timedTrips.length
      ? timedTrips.filter((trip) => trip.actualDuration! <= trip.estimatedDuration! * 1.1).length / timedTrips.length
      : null

    for (const tractor of tractors) {
      for (const trailer of trailerOptions) {
      const genericDocs = documents.filter((doc) =>
        (doc.entityType === 'Driver' && doc.entityId === driver.id)
        || (doc.entityType === 'Truck' && doc.entityId === tractor.id)
        || (trailer && doc.entityType === 'Trailer' && doc.entityId === trailer.id))
      const latestInsurance = tractor.Insurance[0] ?? null
      const latestRoadworthy = tractor.RoadworthyInspection[0] ?? null
      const documentValidity = new Map(genericDocs.map((doc) => [doc.category, null as Date | null]))
      if (driver.ghanaCardNumber) documentValidity.set('ghana_card', driver.ghanaCardExpiry ?? null)
      if (driver.licenseNumber) documentValidity.set('driver_license', driver.licenseExpiry)
      if (latestInsurance) documentValidity.set('insurance', latestInsurance.endDate)
      if (latestRoadworthy) documentValidity.set('roadworthy', latestRoadworthy.certificateExpiry ?? null)
      if (trailer?.registrationExpiry) documentValidity.set('trailer_registration', trailer.registrationExpiry)
      if (trailer?.roadworthyExpiry) documentValidity.set('trailer_roadworthy', trailer.roadworthyExpiry)

      const eligibility = evaluateAssignmentEligibility({
        now: new Date(),
        driver: { id: driver.id, status: driver.status, verificationStatus: driver.verificationStatus, licenseExpiry: driver.licenseExpiry, licenseClass: driver.licenseClass },
        tractor: { id: tractor.id, status: tractor.status },
        insurance: latestInsurance ? { status: latestInsurance.status, endDate: latestInsurance.endDate } : null,
        roadworthy: latestRoadworthy ? {
          status: latestRoadworthy.status, result: latestRoadworthy.result, vehicleFitness: latestRoadworthy.vehicleFitness,
          certificateIssued: latestRoadworthy.certificateIssued, certificateExpiry: latestRoadworthy.certificateExpiry,
        } : null,
        maintenance: { blocking: tractor.MaintenanceRecord.length > 0 },
        trailer: trailer ? {
          id: trailer.id, status: trailer.status, trailerType: trailer.trailerType,
          registrationExpiry: trailer.registrationExpiry, roadworthyExpiry: trailer.roadworthyExpiry,
        } : null,
        requirements: { requiresTrailer: Boolean(order.requiredTrailerType), allowedLicenseClasses, allowedTrailerTypes, requiredDocuments },
        documents: [...documentValidity].map(([category, validUntil]) => ({ category, validUntil })),
      })

      const blocking = [...eligibility.blocking]
      if (busyDrivers.has(driver.id)) blocking.push('driver_active_trip')
      if (busyTractors.has(tractor.id)) blocking.push('tractor_active_trip')
      if (order.requiredTrailerType && !trailer) blocking.push('trailer_unavailable')
      if (trailer && hasTrailerCouplingConflict(tractor.id, trailer.id, activeCouplings)) blocking.push('trailer_coupled_to_other_tractor')
      const registration = tractor.DvlaRegistration[0]
      if (allowedVehicleTypes.length > 0 && !allowedVehicleTypes.some((required) => vehicleMatches(required, registration?.vehicleClass, registration?.bodyType))) {
        blocking.push('vehicle_type_restricted')
      }

      const location = tractor.TruckLocation[0]
      const deadheadKm = location && loadingAnchor?.loadingLat != null && loadingAnchor.loadingLng != null
        ? haversineKm(
            { latitude: location.latitude, longitude: location.longitude },
            { latitude: loadingAnchor.loadingLat, longitude: loadingAnchor.loadingLng },
          )
        : null
      const suitability = allowedVehicleTypes.length === 0
        ? 0.9
        : allowedVehicleTypes.some((required) => vehicleMatches(required, registration?.vehicleClass, registration?.bodyType)) ? 1 : 0.2
      const truckHistory = history.filter((trip) => trip.truckId === tractor.id)
      const truckEfficiency = truckHistory.flatMap((trip) => trip.totalMileage && trip.totalMileage > 0 && trip.fuelUsed && trip.fuelUsed > 0
        ? [trip.totalMileage / trip.fuelUsed]
        : [])
      const averageTruckEfficiency = truckEfficiency.length
        ? truckEfficiency.reduce((sum, value) => sum + value, 0) / truckEfficiency.length
        : null
      const fuelEfficiencyRatio = averageTruckEfficiency && fleetEfficiency ? averageTruckEfficiency / fleetEfficiency : null
      const evidenceCount = driverHistory.length + truckHistory.length
      const missingEvidence = [deadheadKm, onTimeRate, fuelEfficiencyRatio].filter((value) => value == null).length + 2
      const dataQualityScore = Math.max(0.45, 0.95 - missingEvidence * 0.09)

      candidates.push({
        candidateId: `${driver.id}:${tractor.id}:${trailer?.id ?? 'none'}`,
        driverId: driver.id,
        tractorId: tractor.id,
        trailerId: trailer?.id ?? null,
        eligible: eligibility.passed && blocking.length === 0,
        blocking,
        warnings: eligibility.warnings,
        deadheadKm,
        suitability,
        maintenanceHealth: maintenanceHealth(tractor.nextServiceDate),
        driverHoursAvailable: null,
        routeExperienceTrips: routeHistory.length,
        fuelEfficiencyRatio,
        onTimeRate,
        projectedMargin: null,
        marginReference: order.offeredRate ? Number(order.offeredRate) : null,
        evidenceCount,
        dataQualityScore,
      })
      }
    }
  }

  const recommendations = rankAssignmentCandidates({
    modelKey: config.modelKey, modelVersion: config.modelVersion, configVersion: config.configVersion,
    weights: config.weights, candidates,
  }).slice(0, config.maxRecommendations)

  const snapshot = JSON.stringify({ orderId: order.id, configVersion: config.configVersion, candidates })
  const inputSnapshotRef = `sha256:${createHash('sha256').update(snapshot).digest('hex')}`
  const averageQuality = candidates.length ? candidates.reduce((sum, candidate) => sum + candidate.dataQualityScore, 0) / candidates.length : 0
  const record = await db.aiRecommendation.create({
    data: {
      recommendationType: 'assignment_ranking', subjectType: 'LoadOrder', subjectId: order.id,
      modelKey: config.modelKey, modelVersion: config.modelVersion,
      confidence: recommendations[0]?.confidence ?? 0,
      dataQualityScore: averageQuality,
      dataQualityGrade: averageQuality >= 0.85 ? 'trusted' : averageQuality >= 0.65 ? 'usable' : 'limited',
      inputSnapshotRef,
      explanation: JSON.stringify({
        summary: recommendations.length ? 'Eligible assignment candidates ranked for dispatcher review.' : 'No eligible assignment candidate is currently available.',
        configVersion: config.configVersion,
        excludedCandidates: candidates.length - recommendations.length,
      }),
      payload: JSON.stringify({ recommendations, configVersion: config.configVersion }),
      createdBy: auth.userId,
    },
  })

  return NextResponse.json({ recommendationId: record.id, recommendations, configVersion: config.configVersion, modelVersion: config.modelVersion })
}
