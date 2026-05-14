import { NextRequest, NextResponse } from 'next/server'
import { requireAuth } from '@/lib/auth-server'
import { db } from '@/lib/db'
import { getRoute, estimateRouteCost, calculateMultiStopRoute, findAlternativeRoutes, GHANA_CITIES } from '@/lib/ghana-routes'

export async function GET(request: NextRequest) {
  // Auth check
  const auth = requireAuth(request)
  if (auth instanceof NextResponse) return auth

  const { searchParams } = new URL(request.url)
  const from = searchParams.get('from')
  const to = searchParams.get('to')
  const stopsParam = searchParams.get('stops')
  const weightParam = searchParams.get('weight')
  const fuelPriceParam = searchParams.get('fuelPrice')

  // Validate required params
  if (!from || !to) {
    return NextResponse.json(
      { error: 'Missing required parameters: from and to are required' },
      { status: 400 }
    )
  }

  // Validate city names
  const validCities = GHANA_CITIES.map(c => c.name)
  if (!validCities.includes(from)) {
    return NextResponse.json(
      { error: `Invalid origin city: "${from}". Valid cities: ${validCities.join(', ')}` },
      { status: 400 }
    )
  }
  if (!validCities.includes(to)) {
    return NextResponse.json(
      { error: `Invalid destination city: "${to}". Valid cities: ${validCities.join(', ')}` },
      { status: 400 }
    )
  }

  const fuelPrice = fuelPriceParam ? parseFloat(fuelPriceParam) : 15
  const weight = weightParam ? parseFloat(weightParam) : 0 // tonnes

  // Parse stops
  let stops: string[] = []
  if (stopsParam) {
    stops = stopsParam.split(',').map(s => s.trim()).filter(Boolean)
    for (const stop of stops) {
      if (!validCities.includes(stop)) {
        return NextResponse.json(
          { error: `Invalid stop city: "${stop}". Valid cities: ${validCities.join(', ')}` },
          { status: 400 }
        )
      }
    }
  }

  // Calculate route
  const allStops = [from, ...stops, to]
  const routeResult = calculateMultiStopRoute(allStops, fuelPrice)

  if (stops.length === 0) {
    // Direct route — check if exists
    const directRoute = getRoute(from, to)
    if (!directRoute) {
      return NextResponse.json(
        { error: `No direct route found from ${from} to ${to}` },
        { status: 404 }
      )
    }
  } else if (!routeResult.valid) {
    return NextResponse.json(
      { error: `No route data for legs: ${routeResult.missingRoutes.join(', ')}` },
      { status: 404 }
    )
  }

  // Find alternative routes (only for direct A→B)
  let alternatives: Array<{ from: string; via: string; to: string; totalDistance: number; totalCost: number }> = []
  if (stops.length === 0) {
    const alts = findAlternativeRoutes(from, to, fuelPrice)
    alternatives = alts.map(a => ({
      from,
      via: a.via,
      to,
      totalDistance: a.totalDistance,
      totalCost: a.totalCost,
    }))
  }

  // Fetch available trucks (status = 'active') with driver info
  const activeTrucks = await db.truck.findMany({
    where: { status: 'active' },
    include: {
      driver: {
        select: {
          id: true,
          firstName: true,
          lastName: true,
          phone: true,
        },
      },
    },
    orderBy: { currentMileage: 'desc' },
    take: 20,
  })

  // Get fuel logs for each truck to determine current location and fuel level
  const truckData: Array<{
    truckId: string
    plateNumber: string
    make: string
    model: string
    tankCapacity: number | null
    driver: { id: string; firstName: string; lastName: string; phone: string } | null
    currentLocation: string | null
    distanceToPickup: number | null
    estimatedFuelLevel: number | null
    lastFuelDate: string | null
  }> = []

  for (const truck of activeTrucks) {
    // Determine truck location from latest trip or fuel log
    let currentLocation: string | null = null
    let estimatedFuelLevel: number | null = null
    let lastFuelDate: string | null = null

    // Try to get location from latest trip
    const latestTrip = await db.trip.findFirst({
      where: { truckId: truck.id },
      orderBy: { departureTime: 'desc' },
      select: {
        destination: true,
        loadingLocation: true,
        status: true,
      },
    })

    if (latestTrip) {
      // If trip is in transit or earlier, truck might be at destination or en route
      if (latestTrip.status === 'completed' || latestTrip.status === 'arrived_depot') {
        currentLocation = latestTrip.loadingLocation // returned to depot
      } else {
        currentLocation = latestTrip.destination
      }
    }

    // Get latest fuel log for fuel level estimation
    const latestFuelLog = await db.fuelLog.findFirst({
      where: { truckId: truck.id },
      orderBy: { date: 'desc' },
      select: {
        fuelLevelAfter: true,
        date: true,
      },
    })

    if (latestFuelLog) {
      estimatedFuelLevel = latestFuelLog.fuelLevelAfter
      lastFuelDate = latestFuelLog.date.toISOString()
    }

    // Calculate distance to pickup (from origin city)
    let distanceToPickup: number | null = null
    if (currentLocation && validCities.includes(currentLocation) && currentLocation !== from) {
      const pickupRoute = getRoute(currentLocation, from)
      if (pickupRoute) {
        distanceToPickup = pickupRoute.distanceKm
      }
    } else if (currentLocation === from) {
      distanceToPickup = 0
    }

    truckData.push({
      truckId: truck.id,
      plateNumber: truck.plateNumber,
      make: truck.make,
      model: truck.model,
      tankCapacity: truck.tankCapacity,
      driver: truck.driver,
      currentLocation,
      distanceToPickup,
      estimatedFuelLevel,
      lastFuelDate,
    })
  }

  // Sort trucks: nearest first, then by fuel level
  truckData.sort((a, b) => {
    // Trucks with known location near the origin come first
    const aDist = a.distanceToPickup ?? 9999
    const bDist = b.distanceToPickup ?? 9999
    if (aDist !== bDist) return aDist - bDist
    // Then by fuel level (higher is better)
    const aFuel = a.estimatedFuelLevel ?? 0
    const bFuel = b.estimatedFuelLevel ?? 0
    return bFuel - aFuel
  })

  // Build recommended trucks list
  const recommendedTrucks = truckData.slice(0, 5).map(t => ({
    truckId: t.truckId,
    plateNumber: t.plateNumber,
    make: t.make,
    model: t.model,
    driver: t.driver ? `${t.driver.firstName} ${t.driver.lastName}` : 'Unassigned',
    currentLocation: t.currentLocation || 'Unknown',
    distanceToPickup: t.distanceToPickup,
    fuelLevel: t.estimatedFuelLevel,
    tankCapacity: t.tankCapacity,
  }))

  // Calculate fuel estimate adjusted for weight
  // Base: 32L/100km empty. Add 2L per tonne for loaded trucks
  const baseFuelPer100km = 32
  const weightPenalty = weight * 2 // extra L/100km per tonne
  const adjustedFuelPer100km = baseFuelPer100km + weightPenalty
  const totalFuelLiters = (routeResult.totalDistance * adjustedFuelPer100km) / 100
  const fuelCostAtCurrentPrice = totalFuelLiters * fuelPrice

  return NextResponse.json({
    route: {
      from,
      to,
      stops,
      totalDistance: routeResult.totalDistance,
      totalHours: routeResult.totalHours,
      fuelCost: Math.round(routeResult.totalFuelCost * 100) / 100,
      tollCost: routeResult.totalTolls,
      totalCost: routeResult.totalCost,
      legs: routeResult.legs.length > 1 ? routeResult.legs : undefined,
    },
    alternatives,
    recommendedTrucks,
    fuelEstimate: {
      liters: Math.round(totalFuelLiters * 10) / 10,
      costAtCurrentPrice: Math.round(fuelCostAtCurrentPrice * 100) / 100,
      recommendedPricePerLiter: 15,
      fuelPer100km: adjustedFuelPer100km,
      weightAdjustment: weightPenalty,
    },
  })
}
