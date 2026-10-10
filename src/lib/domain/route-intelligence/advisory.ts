import { calculateMultiStopRoute } from '@/lib/ghana-routes'

export const ROUTE_ADVISORY_VERSION = 'route-advisory-v1'

export type RouteDataQualityGrade = 'trusted' | 'usable' | 'limited'
export type FuelEvidenceSource = 'truck_history' | 'fleet_history' | 'configured_default'

export interface FuelEfficiencySample {
  distanceKm: number
  fuelLiters: number
}

export interface FuelEfficiencyEvidence {
  source: FuelEvidenceSource
  kmPerLiter: number
  sampleCount: number
  dataQuality: number
  assumptions: string[]
}

export interface RouteAdvisoryInput {
  from: string
  to: string
  stops?: string[]
  weightTonnes?: number
  fuelPricePerLiter?: number
  truckFuelSamples?: FuelEfficiencySample[]
  fleetFuelSamples?: FuelEfficiencySample[]
}

export interface RouteAdvisoryValidationInput {
  stops?: string[]
  weightTonnes?: number
  fuelPricePerLiter?: number
}

export interface RouteAdvisoryLeg {
  from: string
  to: string
  distanceKm: number
  estimatedHours: number
  tollCost: number
}

export interface RouteAdvisorySuccess {
  ok: true
  advisoryVersion: string
  route: {
    from: string
    to: string
    stops: string[]
    source: 'static_fallback'
    totalDistance: number
    totalHours: number
    tollCost: number
    legs: RouteAdvisoryLeg[]
    dataQuality: number
    dataQualityGrade: RouteDataQualityGrade
  }
  fuelEstimate: {
    liters: number
    cost: number
    pricePerLiter: number
    priceSource: 'request' | 'configured_default'
    source: FuelEvidenceSource
    baseKmPerLiter: number
    cargoAdjustmentFactor: number
    sampleCount: number
    dataQuality: number
    assumptions: string[]
  }
  dataQuality: number
  dataQualityGrade: RouteDataQualityGrade
  confidence: number
  notices: string[]
}

export interface RouteAdvisoryFailure {
  ok: false
  error: 'invalid_input' | 'route_data_missing'
  validationErrors?: string[]
  missingRoutes: string[]
}

export type RouteAdvisoryResult = RouteAdvisorySuccess | RouteAdvisoryFailure

const MAX_WEIGHT_TONNES = 100
const MAX_FUEL_PRICE_PER_LITER = 100
const DEFAULT_FUEL_PRICE_PER_LITER = 15
const DEFAULT_KM_PER_LITER = 2.5
const STATIC_ROUTE_QUALITY = 0.78

function round(value: number, digits = 2): number {
  const multiplier = 10 ** digits
  return Math.round(value * multiplier) / multiplier
}

function clamp(value: number, min = 0, max = 1): number {
  return Math.min(max, Math.max(min, Number.isFinite(value) ? value : min))
}

export function routeDataQualityGrade(score: number): RouteDataQualityGrade {
  if (score >= 0.85) return 'trusted'
  if (score >= 0.65) return 'usable'
  return 'limited'
}

export function validateRouteAdvisoryInput(input: RouteAdvisoryValidationInput): string[] {
  const errors: string[] = []

  if (input.stops && input.stops.length > 5) errors.push('too_many_stops')

  if (input.weightTonnes !== undefined) {
    if (!Number.isFinite(input.weightTonnes) || input.weightTonnes < 0 || input.weightTonnes > MAX_WEIGHT_TONNES) {
      errors.push('weight_invalid')
    }
  }

  if (input.fuelPricePerLiter !== undefined) {
    if (!Number.isFinite(input.fuelPricePerLiter) || input.fuelPricePerLiter <= 0 || input.fuelPricePerLiter > MAX_FUEL_PRICE_PER_LITER) {
      errors.push('fuel_price_invalid')
    }
  }

  return errors
}

function validSamples(samples: FuelEfficiencySample[]): FuelEfficiencySample[] {
  return samples.filter((sample) =>
    Number.isFinite(sample.distanceKm)
    && Number.isFinite(sample.fuelLiters)
    && sample.distanceKm > 0
    && sample.fuelLiters > 0,
  )
}

function aggregateKmPerLiter(samples: FuelEfficiencySample[]): number {
  const totalDistance = samples.reduce((sum, sample) => sum + sample.distanceKm, 0)
  const totalFuel = samples.reduce((sum, sample) => sum + sample.fuelLiters, 0)
  return totalDistance / totalFuel
}

export function selectFuelEfficiencyEvidence(
  truckSamples: FuelEfficiencySample[] = [],
  fleetSamples: FuelEfficiencySample[] = [],
): FuelEfficiencyEvidence {
  const truck = validSamples(truckSamples)
  if (truck.length >= 3) {
    return {
      source: 'truck_history',
      kmPerLiter: aggregateKmPerLiter(truck),
      sampleCount: truck.length,
      dataQuality: clamp(0.86 + Math.min(truck.length, 10) * 0.01),
      assumptions: [],
    }
  }

  const fleet = validSamples(fleetSamples)
  if (fleet.length >= 5) {
    return {
      source: 'fleet_history',
      kmPerLiter: aggregateKmPerLiter(fleet),
      sampleCount: fleet.length,
      dataQuality: clamp(0.72 + Math.min(fleet.length, 20) * 0.005),
      assumptions: ['truck_efficiency_history_insufficient', 'fleet_efficiency_used'],
    }
  }

  return {
    source: 'configured_default',
    kmPerLiter: DEFAULT_KM_PER_LITER,
    sampleCount: 0,
    dataQuality: 0.55,
    assumptions: ['truck_efficiency_history_insufficient', 'fleet_efficiency_history_insufficient', 'configured_efficiency_default_used'],
  }
}

function cargoAdjustmentFactor(weightTonnes: number | undefined): number {
  if (weightTonnes === undefined || weightTonnes <= 0) return 1
  // Bound payload impact to +15%; this is deliberately conservative until calibrated data exists.
  return 1 + Math.min(0.15, (weightTonnes / 40) * 0.15)
}

export function buildRouteAdvisory(input: RouteAdvisoryInput): RouteAdvisoryResult {
  const stops = input.stops ?? []
  const validationErrors = validateRouteAdvisoryInput({
    stops,
    weightTonnes: input.weightTonnes,
    fuelPricePerLiter: input.fuelPricePerLiter,
  })
  if (validationErrors.length > 0) {
    return { ok: false, error: 'invalid_input', validationErrors, missingRoutes: [] }
  }

  const routePath = [input.from, ...stops, input.to]
  const pricePerLiter = input.fuelPricePerLiter ?? DEFAULT_FUEL_PRICE_PER_LITER
  const route = calculateMultiStopRoute(routePath, pricePerLiter)
  if (!route.valid) {
    return { ok: false, error: 'route_data_missing', missingRoutes: route.missingRoutes }
  }

  const fuelEvidence = selectFuelEfficiencyEvidence(input.truckFuelSamples, input.fleetFuelSamples)
  const adjustment = cargoAdjustmentFactor(input.weightTonnes)
  const liters = (route.totalDistance / fuelEvidence.kmPerLiter) * adjustment
  const fuelCost = liters * pricePerLiter
  const quality = clamp(Math.min(STATIC_ROUTE_QUALITY, fuelEvidence.dataQuality))
  const confidence = clamp(Math.min(quality, quality * 0.92))
  const priceSource = input.fuelPricePerLiter === undefined ? 'configured_default' as const : 'request' as const
  const notices = ['route_uses_static_ghana_graph']
  if (priceSource === 'configured_default') notices.push('fuel_price_default_used')
  notices.push(...fuelEvidence.assumptions)

  return {
    ok: true,
    advisoryVersion: ROUTE_ADVISORY_VERSION,
    route: {
      from: input.from,
      to: input.to,
      stops,
      source: 'static_fallback',
      totalDistance: route.totalDistance,
      totalHours: route.totalHours,
      tollCost: route.totalTolls,
      legs: route.legs.map((leg) => ({
        from: leg.from,
        to: leg.to,
        distanceKm: leg.distanceKm,
        estimatedHours: leg.estimatedHours,
        tollCost: leg.tollCost,
      })),
      dataQuality: STATIC_ROUTE_QUALITY,
      dataQualityGrade: routeDataQualityGrade(STATIC_ROUTE_QUALITY),
    },
    fuelEstimate: {
      liters: round(liters, 1),
      cost: round(fuelCost),
      pricePerLiter,
      priceSource,
      source: fuelEvidence.source,
      baseKmPerLiter: round(fuelEvidence.kmPerLiter, 3),
      cargoAdjustmentFactor: round(adjustment, 3),
      sampleCount: fuelEvidence.sampleCount,
      dataQuality: fuelEvidence.dataQuality,
      assumptions: fuelEvidence.assumptions,
    },
    dataQuality: quality,
    dataQualityGrade: routeDataQualityGrade(quality),
    confidence,
    notices,
  }
}
