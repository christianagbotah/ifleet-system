import { NextRequest, NextResponse } from 'next/server'

import { requirePermission, ROLES } from '@/lib/auth-server'
import {
  buildRouteAdvisory,
  rankRouteCandidates,
  ROUTE_ADVISORY_VERSION,
  validateRouteAdvisoryInput,
} from '@/lib/domain/route-intelligence/advisory'
import { PrismaRouteAdvisoryRepository } from '@/lib/domain/route-intelligence/prisma-route-advisory-repository'
import { GHANA_CITIES } from '@/lib/ghana-routes'

const VALID_CITIES = new Set(GHANA_CITIES.map((city) => city.name))
const MAX_RECOMMENDATIONS = 5

function parseOptionalNumber(raw: string | null): number | undefined {
  if (raw === null || raw.trim() === '') return undefined
  return Number(raw)
}

function round(value: number, digits = 2): number {
  const multiplier = 10 ** digits
  return Math.round(value * multiplier) / multiplier
}

function canViewFleetRecommendations(auth: {
  roleName: string
  permissions: string[]
}): boolean {
  if (auth.roleName === ROLES.DRIVER) return false
  if (auth.roleName === ROLES.ADMIN) return true
  return auth.permissions.includes('trips.create')
}

export async function GET(request: NextRequest) {
  const auth = requirePermission(request, 'trips.view')
  if (auth instanceof NextResponse) return auth

  const { searchParams } = new URL(request.url)
  const from = searchParams.get('from')?.trim() ?? ''
  const to = searchParams.get('to')?.trim() ?? ''
  const stops = (searchParams.get('stops') ?? '')
    .split(',')
    .map((value) => value.trim())
    .filter(Boolean)
  const weightTonnes = parseOptionalNumber(searchParams.get('weight'))
  const fuelPricePerLiter = parseOptionalNumber(searchParams.get('fuelPrice'))

  if (!from || !to) {
    return NextResponse.json(
      { error: 'Missing required parameters: from and to are required' },
      { status: 400 },
    )
  }

  if (!VALID_CITIES.has(from)) {
    return NextResponse.json({ error: `Invalid origin city: "${from}"` }, { status: 400 })
  }
  if (!VALID_CITIES.has(to)) {
    return NextResponse.json({ error: `Invalid destination city: "${to}"` }, { status: 400 })
  }
  if (from === to) {
    return NextResponse.json({ error: 'Origin and destination must be different' }, { status: 400 })
  }
  if (stops.some((stop) => !VALID_CITIES.has(stop))) {
    const invalid = stops.find((stop) => !VALID_CITIES.has(stop))
    return NextResponse.json({ error: `Invalid stop city: "${invalid}"` }, { status: 400 })
  }

  const validationErrors = validateRouteAdvisoryInput({
    stops,
    weightTonnes,
    fuelPricePerLiter,
  })
  if (validationErrors.length > 0) {
    return NextResponse.json(
      { error: 'Invalid route advisory input', validationErrors },
      { status: 400 },
    )
  }

  const recommendationsAvailable = canViewFleetRecommendations(auth)
  const repository = recommendationsAvailable ? new PrismaRouteAdvisoryRepository() : null
  const evidence = repository
    ? await repository.loadFleetEvidence({ origin: from, now: new Date() })
    : { candidates: [], fleetFuelSamples: [] }

  const advisory = buildRouteAdvisory({
    from,
    to,
    stops,
    weightTonnes,
    fuelPricePerLiter,
    fleetFuelSamples: evidence.fleetFuelSamples,
  })

  if (!advisory.ok) {
    if (advisory.error === 'invalid_input') {
      return NextResponse.json(
        { error: 'Invalid route advisory input', validationErrors: advisory.validationErrors ?? [] },
        { status: 400 },
      )
    }

    return NextResponse.json(
      {
        error: 'Route data unavailable for one or more legs',
        missingRoutes: advisory.missingRoutes,
      },
      { status: 422 },
    )
  }

  const recommendations = recommendationsAvailable
    ? rankRouteCandidates(evidence.candidates, evidence.fleetFuelSamples).slice(0, MAX_RECOMMENDATIONS)
    : []

  const routeFuelCost = advisory.fuelEstimate.cost
  const routeDistance = advisory.route.totalDistance
  const fuelPer100km = routeDistance > 0
    ? (advisory.fuelEstimate.liters / routeDistance) * 100
    : 0
  const unadjustedFuelPer100km = advisory.fuelEstimate.cargoAdjustmentFactor > 0
    ? fuelPer100km / advisory.fuelEstimate.cargoAdjustmentFactor
    : fuelPer100km
  const weightAdjustment = Math.max(0, fuelPer100km - unadjustedFuelPer100km)

  const legs = advisory.route.legs.map((leg) => {
    const distanceShare = routeDistance > 0 ? leg.distanceKm / routeDistance : 0
    const fuelCost = routeFuelCost * distanceShare
    return {
      ...leg,
      fuelCost: round(fuelCost),
      totalCost: round(fuelCost + leg.tollCost),
    }
  })

  return NextResponse.json({
    advisoryVersion: ROUTE_ADVISORY_VERSION,
    generatedAt: new Date().toISOString(),
    recommendationsAvailable,
    route: {
      from,
      to,
      stops,
      totalDistance: advisory.route.totalDistance,
      totalHours: advisory.route.totalHours,
      fuelCost: routeFuelCost,
      tollCost: advisory.route.tollCost,
      totalCost: round(routeFuelCost + advisory.route.tollCost),
      legs: legs.length > 1 ? legs : undefined,
      source: advisory.route.source,
      dataQuality: advisory.route.dataQuality,
      dataQualityGrade: advisory.route.dataQualityGrade,
    },
    // Alternative-route costing remains disabled until it can use the same evidence
    // hierarchy. Returning a static legacy comparison would overstate precision.
    alternatives: [],
    recommendedTrucks: recommendations.map((recommendation) => {
      const { location } = recommendation
      const hasCoordinates = location.latitude != null && location.longitude != null
      return {
        truckId: recommendation.tractorId,
        plateNumber: recommendation.plateNumber,
        make: recommendation.make,
        model: recommendation.model,
        driver: recommendation.driverName ?? 'Unassigned',
        currentLocation: hasCoordinates
          ? `${location.latitude!.toFixed(4)}, ${location.longitude!.toFixed(4)}`
          : 'Location unavailable',
        distanceToPickup: recommendation.deadheadKm,
        // The old endpoint treated a last fuel fill as current tank level. That is
        // not safe after subsequent travel, so these legacy fields remain unknown.
        fuelLevel: null,
        tankCapacity: null,
        locationSource: location.source,
        locationFreshness: location.freshness,
        locationReceivedAt: location.receivedAt?.toISOString() ?? null,
        confidence: recommendation.confidence,
        dataQuality: recommendation.dataQuality,
        dataQualityGrade: recommendation.dataQualityGrade,
        reasons: recommendation.reasons,
        warnings: recommendation.warnings,
        fuelEvidenceSource: recommendation.fuelEvidence.source,
      }
    }),
    fuelEstimate: {
      liters: advisory.fuelEstimate.liters,
      costAtCurrentPrice: advisory.fuelEstimate.cost,
      // Kept temporarily for backwards-compatible UI parsing. The UI must label
      // this as the supplied/default assumption, never a live market recommendation.
      recommendedPricePerLiter: advisory.fuelEstimate.pricePerLiter,
      pricePerLiter: advisory.fuelEstimate.pricePerLiter,
      priceSource: advisory.fuelEstimate.priceSource,
      source: advisory.fuelEstimate.source,
      fuelPer100km: round(fuelPer100km, 1),
      weightAdjustment: round(weightAdjustment, 1),
      cargoAdjustmentFactor: advisory.fuelEstimate.cargoAdjustmentFactor,
      dataQuality: advisory.fuelEstimate.dataQuality,
      assumptions: advisory.fuelEstimate.assumptions,
    },
    dataQuality: advisory.dataQuality,
    dataQualityGrade: advisory.dataQualityGrade,
    confidence: advisory.confidence,
    notices: advisory.notices,
  })
}
