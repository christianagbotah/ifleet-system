// ${APP_NAME} - Inter-city Route Database
// Distance matrix for major Ghana cities based on actual road network distances

import { APP_NAME } from '@/lib/constants'

export interface GhanaRoute {
  from: string
  to: string
  distanceKm: number
  estimatedHours: number  // average drive time
  tollCost: number        // estimated toll in GHS
  fuelEstimate: number    // estimated fuel cost in GHS (at 15 GHS/liter, 32L/100km)
}

export interface GhanaCity {
  name: string
  lat: number
  lng: number
  region: string
}

export const GHANA_CITIES: GhanaCity[] = [
  { name: "Accra", lat: 5.6037, lng: -0.1870, region: "Greater Accra" },
  { name: "Kumasi", lat: 6.6884, lng: -1.6244, region: "Ashanti" },
  { name: "Tamale", lat: 9.4034, lng: -0.8393, region: "Northern" },
  { name: "Takoradi", lat: 4.8983, lng: -1.7607, region: "Western" },
  { name: "Tema", lat: 5.6692, lng: -0.0166, region: "Greater Accra" },
  { name: "Cape Coast", lat: 5.1036, lng: -1.2466, region: "Central" },
  { name: "Sunyani", lat: 7.3349, lng: -2.3266, region: "Bono" },
  { name: "Ho", lat: 6.6100, lng: 0.4700, region: "Volta" },
  { name: "Koforidua", lat: 6.0941, lng: -0.2610, region: "Eastern" },
  { name: "Wa", lat: 10.0600, lng: -2.5098, region: "Upper West" },
  { name: "Bolgatanga", lat: 10.7873, lng: -0.8713, region: "Upper East" },
  { name: "Sekondi", lat: 4.9343, lng: -1.7607, region: "Western" },
  { name: "Obuasi", lat: 6.8594, lng: -1.6717, region: "Ashanti" },
  { name: "Techiman", lat: 7.5833, lng: -1.9333, region: "Bono East" },
  { name: "Winneba", lat: 5.3500, lng: -0.6233, region: "Central" },
  { name: "Nkawkaw", lat: 6.9422, lng: -0.7624, region: "Eastern" },
  { name: "Aflao", lat: 6.1150, lng: 1.1874, region: "Volta" },
  { name: "Dunkwa", lat: 5.9611, lng: -1.7669, region: "Central" },
]

// All route pairs with realistic road distances (not straight-line)
// Includes both directions for each route
export const GHANA_ROUTES: GhanaRoute[] = [
  // === Major trunk routes ===
  { from: "Accra", to: "Kumasi", distanceKm: 254, estimatedHours: 3.5, tollCost: 15, fuelEstimate: 122 },
  { from: "Kumasi", to: "Accra", distanceKm: 254, estimatedHours: 3.5, tollCost: 15, fuelEstimate: 122 },
  { from: "Accra", to: "Tamale", distanceKm: 670, estimatedHours: 9, tollCost: 25, fuelEstimate: 322 },
  { from: "Tamale", to: "Accra", distanceKm: 670, estimatedHours: 9, tollCost: 25, fuelEstimate: 322 },
  { from: "Accra", to: "Takoradi", distanceKm: 220, estimatedHours: 3, tollCost: 10, fuelEstimate: 106 },
  { from: "Takoradi", to: "Accra", distanceKm: 220, estimatedHours: 3, tollCost: 10, fuelEstimate: 106 },
  { from: "Accra", to: "Tema", distanceKm: 30, estimatedHours: 0.5, tollCost: 0, fuelEstimate: 14 },
  { from: "Tema", to: "Accra", distanceKm: 30, estimatedHours: 0.5, tollCost: 0, fuelEstimate: 14 },
  { from: "Accra", to: "Cape Coast", distanceKm: 150, estimatedHours: 2, tollCost: 8, fuelEstimate: 72 },
  { from: "Cape Coast", to: "Accra", distanceKm: 150, estimatedHours: 2, tollCost: 8, fuelEstimate: 72 },
  { from: "Accra", to: "Ho", distanceKm: 170, estimatedHours: 2.5, tollCost: 5, fuelEstimate: 82 },
  { from: "Ho", to: "Accra", distanceKm: 170, estimatedHours: 2.5, tollCost: 5, fuelEstimate: 82 },

  // === Kumasi hub routes ===
  { from: "Kumasi", to: "Tamale", distanceKm: 420, estimatedHours: 5.5, tollCost: 15, fuelEstimate: 202 },
  { from: "Tamale", to: "Kumasi", distanceKm: 420, estimatedHours: 5.5, tollCost: 15, fuelEstimate: 202 },
  { from: "Kumasi", to: "Takoradi", distanceKm: 220, estimatedHours: 3, tollCost: 8, fuelEstimate: 106 },
  { from: "Takoradi", to: "Kumasi", distanceKm: 220, estimatedHours: 3, tollCost: 8, fuelEstimate: 106 },
  { from: "Kumasi", to: "Sunyani", distanceKm: 130, estimatedHours: 2, tollCost: 5, fuelEstimate: 62 },
  { from: "Sunyani", to: "Kumasi", distanceKm: 130, estimatedHours: 2, tollCost: 5, fuelEstimate: 62 },
  { from: "Kumasi", to: "Techiman", distanceKm: 105, estimatedHours: 1.5, tollCost: 3, fuelEstimate: 50 },
  { from: "Techiman", to: "Kumasi", distanceKm: 105, estimatedHours: 1.5, tollCost: 3, fuelEstimate: 50 },
  { from: "Kumasi", to: "Obuasi", distanceKm: 52, estimatedHours: 0.8, tollCost: 2, fuelEstimate: 25 },
  { from: "Obuasi", to: "Kumasi", distanceKm: 52, estimatedHours: 0.8, tollCost: 2, fuelEstimate: 25 },

  // === Northern routes ===
  { from: "Tamale", to: "Bolgatanga", distanceKm: 170, estimatedHours: 2.5, tollCost: 5, fuelEstimate: 82 },
  { from: "Bolgatanga", to: "Tamale", distanceKm: 170, estimatedHours: 2.5, tollCost: 5, fuelEstimate: 82 },
  { from: "Tamale", to: "Wa", distanceKm: 310, estimatedHours: 4.5, tollCost: 8, fuelEstimate: 149 },
  { from: "Wa", to: "Tamale", distanceKm: 310, estimatedHours: 4.5, tollCost: 8, fuelEstimate: 149 },

  // === Coastal routes ===
  { from: "Takoradi", to: "Cape Coast", distanceKm: 75, estimatedHours: 1, tollCost: 3, fuelEstimate: 36 },
  { from: "Cape Coast", to: "Takoradi", distanceKm: 75, estimatedHours: 1, tollCost: 3, fuelEstimate: 36 },
  { from: "Winneba", to: "Cape Coast", distanceKm: 85, estimatedHours: 1.2, tollCost: 3, fuelEstimate: 41 },
  { from: "Cape Coast", to: "Winneba", distanceKm: 85, estimatedHours: 1.2, tollCost: 3, fuelEstimate: 41 },

  // === Volta Region routes ===
  { from: "Ho", to: "Aflao", distanceKm: 130, estimatedHours: 2, tollCost: 3, fuelEstimate: 62 },
  { from: "Aflao", to: "Ho", distanceKm: 130, estimatedHours: 2, tollCost: 3, fuelEstimate: 62 },

  // === Eastern Region routes ===
  { from: "Koforidua", to: "Nkawkaw", distanceKm: 95, estimatedHours: 1.3, tollCost: 3, fuelEstimate: 46 },
  { from: "Nkawkaw", to: "Koforidua", distanceKm: 95, estimatedHours: 1.3, tollCost: 3, fuelEstimate: 46 },
  { from: "Koforidua", to: "Kumasi", distanceKm: 180, estimatedHours: 2.5, tollCost: 8, fuelEstimate: 86 },
  { from: "Kumasi", to: "Koforidua", distanceKm: 180, estimatedHours: 2.5, tollCost: 8, fuelEstimate: 86 },

  // === Tema hub routes ===
  { from: "Tema", to: "Kumasi", distanceKm: 225, estimatedHours: 3, tollCost: 12, fuelEstimate: 108 },
  { from: "Kumasi", to: "Tema", distanceKm: 225, estimatedHours: 3, tollCost: 12, fuelEstimate: 108 },
  { from: "Tema", to: "Aflao", distanceKm: 200, estimatedHours: 3, tollCost: 5, fuelEstimate: 96 },
  { from: "Aflao", to: "Tema", distanceKm: 200, estimatedHours: 3, tollCost: 5, fuelEstimate: 96 },

  // === Accra connector routes ===
  { from: "Accra", to: "Koforidua", distanceKm: 90, estimatedHours: 1.3, tollCost: 3, fuelEstimate: 43 },
  { from: "Koforidua", to: "Accra", distanceKm: 90, estimatedHours: 1.3, tollCost: 3, fuelEstimate: 43 },
  { from: "Accra", to: "Winneba", distanceKm: 65, estimatedHours: 1, tollCost: 2, fuelEstimate: 31 },
  { from: "Winneba", to: "Accra", distanceKm: 65, estimatedHours: 1, tollCost: 2, fuelEstimate: 31 },
  { from: "Accra", to: "Obuasi", distanceKm: 200, estimatedHours: 2.8, tollCost: 10, fuelEstimate: 96 },
  { from: "Obuasi", to: "Accra", distanceKm: 200, estimatedHours: 2.8, tollCost: 10, fuelEstimate: 96 },
  { from: "Accra", to: "Nkawkaw", distanceKm: 180, estimatedHours: 2.5, tollCost: 8, fuelEstimate: 86 },
  { from: "Nkawkaw", to: "Accra", distanceKm: 180, estimatedHours: 2.5, tollCost: 8, fuelEstimate: 86 },
  { from: "Accra", to: "Dunkwa", distanceKm: 240, estimatedHours: 3.3, tollCost: 10, fuelEstimate: 115 },
  { from: "Dunkwa", to: "Accra", distanceKm: 240, estimatedHours: 3.3, tollCost: 10, fuelEstimate: 115 },
  { from: "Accra", to: "Sunyani", distanceKm: 400, estimatedHours: 5.5, tollCost: 15, fuelEstimate: 192 },
  { from: "Sunyani", to: "Accra", distanceKm: 400, estimatedHours: 5.5, tollCost: 15, fuelEstimate: 192 },

  // === Bono / Bono East routes ===
  { from: "Sunyani", to: "Techiman", distanceKm: 80, estimatedHours: 1.2, tollCost: 2, fuelEstimate: 38 },
  { from: "Techiman", to: "Sunyani", distanceKm: 80, estimatedHours: 1.2, tollCost: 2, fuelEstimate: 38 },

  // === Central / Ashanti connector routes ===
  { from: "Dunkwa", to: "Kumasi", distanceKm: 100, estimatedHours: 1.5, tollCost: 3, fuelEstimate: 48 },
  { from: "Kumasi", to: "Dunkwa", distanceKm: 100, estimatedHours: 1.5, tollCost: 3, fuelEstimate: 48 },

  // === Cross-regional routes ===
  { from: "Bolgatanga", to: "Wa", distanceKm: 440, estimatedHours: 6, tollCost: 12, fuelEstimate: 212 },
  { from: "Wa", to: "Bolgatanga", distanceKm: 440, estimatedHours: 6, tollCost: 12, fuelEstimate: 212 },
  { from: "Koforidua", to: "Ho", distanceKm: 120, estimatedHours: 1.8, tollCost: 4, fuelEstimate: 58 },
  { from: "Ho", to: "Koforidua", distanceKm: 120, estimatedHours: 1.8, tollCost: 4, fuelEstimate: 58 },
  { from: "Tamale", to: "Sunyani", distanceKm: 400, estimatedHours: 5.5, tollCost: 12, fuelEstimate: 192 },
  { from: "Sunyani", to: "Tamale", distanceKm: 400, estimatedHours: 5.5, tollCost: 12, fuelEstimate: 192 },
  { from: "Takoradi", to: "Sunyani", distanceKm: 290, estimatedHours: 4, tollCost: 10, fuelEstimate: 139 },
  { from: "Sunyani", to: "Takoradi", distanceKm: 290, estimatedHours: 4, tollCost: 10, fuelEstimate: 139 },
  { from: "Cape Coast", to: "Kumasi", distanceKm: 200, estimatedHours: 2.8, tollCost: 8, fuelEstimate: 96 },
  { from: "Kumasi", to: "Cape Coast", distanceKm: 200, estimatedHours: 2.8, tollCost: 8, fuelEstimate: 96 },
  { from: "Tema", to: "Ho", distanceKm: 190, estimatedHours: 2.8, tollCost: 5, fuelEstimate: 91 },
  { from: "Ho", to: "Tema", distanceKm: 190, estimatedHours: 2.8, tollCost: 5, fuelEstimate: 91 },
  { from: "Nkawkaw", to: "Kumasi", distanceKm: 170, estimatedHours: 2.3, tollCost: 7, fuelEstimate: 82 },
  { from: "Kumasi", to: "Nkawkaw", distanceKm: 170, estimatedHours: 2.3, tollCost: 7, fuelEstimate: 82 },
]

/** Get a direct route between two cities */
export function getRoute(from: string, to: string): GhanaRoute | null {
  return GHANA_ROUTES.find(r => r.from === from && r.to === to) || null
}

/** Estimate trip cost with configurable fuel price */
export function estimateRouteCost(
  from: string,
  to: string,
  fuelPricePerLiter?: number
): {
  distanceKm: number | null
  estimatedHours: number | null
  tollCost: number | null
  fuelCost: number | null
  totalCost: number | null
  fuelLiters: number | null
} | null {
  const route = getRoute(from, to)
  if (!route) return null
  const pricePerLiter = fuelPricePerLiter || 15
  const fuelLiters = (route.distanceKm * 32) / 100
  const fuelCost = fuelLiters * pricePerLiter
  return {
    distanceKm: route.distanceKm,
    estimatedHours: route.estimatedHours,
    tollCost: route.tollCost,
    fuelCost: Math.round(fuelCost * 100) / 100,
    totalCost: Math.round((fuelCost + route.tollCost) * 100) / 100,
    fuelLiters: Math.round(fuelLiters * 10) / 10,
  }
}

/** Calculate multi-stop route cost (legs array) */
export function calculateMultiStopRoute(
  stops: string[],
  fuelPricePerLiter?: number
): {
  legs: Array<{
    from: string
    to: string
    distanceKm: number
    estimatedHours: number
    tollCost: number
    fuelCost: number
    totalCost: number
  }>
  totalDistance: number
  totalHours: number
  totalTolls: number
  totalFuelCost: number
  totalCost: number
  fuelLiters: number
  valid: boolean
  missingRoutes: string[]
} {
  const pricePerLiter = fuelPricePerLiter || 15
  const legs: Array<{
    from: string
    to: string
    distanceKm: number
    estimatedHours: number
    tollCost: number
    fuelCost: number
    totalCost: number
  }> = []
  const missingRoutes: string[] = []
  let totalDistance = 0
  let totalHours = 0
  let totalTolls = 0
  let totalFuelCost = 0
  let totalFuelLiters = 0

  for (let i = 0; i < stops.length - 1; i++) {
    const from = stops[i]
    const to = stops[i + 1]
    const route = getRoute(from, to)
    if (!route) {
      missingRoutes.push(`${from} → ${to}`)
      continue
    }
    const fuelLiters = (route.distanceKm * 32) / 100
    const fuelCost = fuelLiters * pricePerLiter
    const legCost = fuelCost + route.tollCost

    legs.push({
      from,
      to,
      distanceKm: route.distanceKm,
      estimatedHours: route.estimatedHours,
      tollCost: route.tollCost,
      fuelCost: Math.round(fuelCost * 100) / 100,
      totalCost: Math.round(legCost * 100) / 100,
    })

    totalDistance += route.distanceKm
    totalHours += route.estimatedHours
    totalTolls += route.tollCost
    totalFuelCost += fuelCost
    totalFuelLiters += fuelLiters
  }

  return {
    legs,
    totalDistance,
    totalHours: Math.round(totalHours * 10) / 10,
    totalTolls,
    totalFuelCost: Math.round(totalFuelCost * 100) / 100,
    totalCost: Math.round((totalFuelCost + totalTolls) * 100) / 100,
    fuelLiters: Math.round(totalFuelLiters * 10) / 10,
    valid: missingRoutes.length === 0,
    missingRoutes,
  }
}

/** Find alternative routes between two cities (via intermediate cities) */
export function findAlternativeRoutes(
  from: string,
  to: string,
  fuelPricePerLiter?: number
): Array<{
  via: string
  totalDistance: number
  totalHours: number
  totalCost: number
  tollCost: number
}> {
  const pricePerLiter = fuelPricePerLiter || 15
  const directRoute = getRoute(from, to)
  if (!directRoute) return []

  const alternatives: Array<{
    via: string
    totalDistance: number
    totalHours: number
    totalCost: number
    tollCost: number
  }> = []

  // Try all intermediate cities as possible via points
  const cityNames = GHANA_CITIES.map(c => c.name)
  for (const city of cityNames) {
    if (city === from || city === to) continue

    const leg1 = getRoute(from, city)
    const leg2 = getRoute(city, to)
    if (!leg1 || !leg2) continue

    // Only include if the alternative is at most 50% longer (practical alternatives)
    const altDistance = leg1.distanceKm + leg2.distanceKm
    if (altDistance > directRoute.distanceKm * 1.5) continue

    const totalFuelLiters = (altDistance * 32) / 100
    const fuelCost = totalFuelLiters * pricePerLiter
    const tollCost = leg1.tollCost + leg2.tollCost

    alternatives.push({
      via: city,
      totalDistance: altDistance,
      totalHours: Math.round((leg1.estimatedHours + leg2.estimatedHours) * 10) / 10,
      totalCost: Math.round((fuelCost + tollCost) * 100) / 100,
      tollCost,
    })
  }

  // Sort by cost (cheapest first) and return top 3
  alternatives.sort((a, b) => a.totalCost - b.totalCost)
  return alternatives.slice(0, 3)
}
