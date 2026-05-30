import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { requireAuth } from '@/lib/auth-server'

const MAX_PERFORMANCE_TRIPS = 5000

/**
 * Performance Reports — returns tabular data for different report types.
 *
 * Query params:
 *   type     — driver | truck | zone | comparative (required)
 *   dateFrom — ISO date string (inclusive)
 *   dateTo   — ISO date string (inclusive)
 *   zoneId   — filter to a specific destination zone
 *   driverId — filter to a specific driver
 *   truckId  — filter to a specific truck
 */
export async function GET(request: NextRequest) {
  try {
    const auth = requireAuth(request)
    if (auth instanceof NextResponse) return auth

    const { searchParams } = new URL(request.url)
    const type = searchParams.get('type')
    const dateFrom = searchParams.get('dateFrom')
    const dateTo = searchParams.get('dateTo')
    const zoneId = searchParams.get('zoneId')
    const driverId = searchParams.get('driverId')
    const truckId = searchParams.get('truckId')

    if (!type || !['driver', 'truck', 'zone', 'comparative'].includes(type)) {
      return NextResponse.json(
        { error: 'type is required and must be one of: driver, truck, zone, comparative' },
        { status: 400 }
      )
    }

    // Build base trip filter — completed trips only
    const where: Record<string, unknown> = { status: 'completed' }
    if (driverId) where.driverId = driverId
    if (truckId) where.truckId = truckId
    if (zoneId) where.destinationZoneId = zoneId

    if (dateFrom || dateTo) {
      const departureFilter: Record<string, unknown> = {}
      if (dateFrom) departureFilter.gte = new Date(dateFrom)
      if (dateTo) {
        const toDate = new Date(dateTo)
        toDate.setHours(23, 59, 59, 999)
        departureFilter.lte = toDate
      }
      where.departureTime = departureFilter
    }

    switch (type) {
      case 'driver':
        return generateDriverReport(where, dateFrom, dateTo)
      case 'truck':
        return generateTruckReport(where, dateFrom, dateTo)
      case 'zone':
        return generateZoneReport(where, dateFrom, dateTo)
      case 'comparative':
        return generateComparativeReport(where, dateFrom, dateTo, driverId, zoneId)
      default:
        return NextResponse.json({ error: 'Invalid report type' }, { status: 400 })
    }
  } catch (error) {
    console.error('Performance reports error:', error)
    return NextResponse.json({ error: 'Failed to fetch performance report' }, { status: 500 })
  }
}

// ============ DRIVER REPORT ============
async function generateDriverReport(
  where: Record<string, unknown>,
  dateFrom: string | null,
  dateTo: string | null
) {
  const trips = await db.trip.findMany({
    where,
    include: {
      driver: { select: { id: true, firstName: true, lastName: true, employeeId: true, status: true } },
      destinationZone: { select: { id: true, name: true, destinationCity: { select: { id: true, name: true } } } },
      truck: { select: { id: true, plateNumber: true } },
    },
    orderBy: { departureTime: 'desc' },
    take: MAX_PERFORMANCE_TRIPS,
  })

  // Group by driver
  const driverMap = new Map<string, {
    driverId: string
    driverName: string
    employeeId: string
    totalTrips: number
    totalDistance: number
    totalFuel: number
    totalRevenue: number
    avgDistance: number
    avgFuel: number
    fuelEfficiency: number // km per liter
    performanceScore: number // percentage of trips with mileage in expected range
    zoneBreakdown: { zoneName: string; trips: number; avgDistance: number; avgFuel: number }[]
  }>()

  // Load benchmarks for zones
  const zoneIds = [...new Set(trips.map((t) => t.destinationZoneId).filter(Boolean))] as string[]
  const benchmarks = await db.performanceBenchmark.findMany({
    where: { destinationZoneId: { in: zoneIds }, isActive: true },
    orderBy: { createdAt: 'desc' },
  })
  const benchmarkMap = new Map<string, (typeof benchmarks)[0]>()
  for (const b of benchmarks) {
    if (!benchmarkMap.has(b.destinationZoneId)) benchmarkMap.set(b.destinationZoneId, b)
  }

  for (const trip of trips) {
    const did = trip.driverId
    if (!driverMap.has(did)) {
      driverMap.set(did, {
        driverId: did,
        driverName: `${trip.driver.firstName} ${trip.driver.lastName}`,
        employeeId: trip.driver.employeeId,
        totalTrips: 0,
        totalDistance: 0,
        totalFuel: 0,
        totalRevenue: 0,
        avgDistance: 0,
        avgFuel: 0,
        fuelEfficiency: 0,
        performanceScore: 0,
        zoneBreakdown: [],
      })
    }
    const entry = driverMap.get(did)!
    entry.totalTrips++
    if (trip.totalMileage) entry.totalDistance += trip.totalMileage
    if (trip.fuelUsed) entry.totalFuel += trip.fuelUsed
    if (trip.totalRevenue) entry.totalRevenue += trip.totalRevenue
  }

  // Calculate averages and per-zone breakdown
  for (const [did, entry] of driverMap) {
    entry.avgDistance = entry.totalTrips > 0 ? Math.round((entry.totalDistance / entry.totalTrips) * 100) / 100 : 0
    entry.avgFuel = entry.totalTrips > 0 ? Math.round((entry.totalFuel / entry.totalTrips) * 100) / 100 : 0
    entry.fuelEfficiency = entry.totalFuel > 0 ? Math.round((entry.totalDistance / entry.totalFuel) * 100) / 100 : 0

    // Performance score: % of trips within expected mileage range
    const driverTrips = trips.filter((t) => t.driverId === did)
    let inRange = 0
    const zoneBreakdownMap = new Map<string, { zoneName: string; trips: number; distSum: number; fuelSum: number }>()

    for (const trip of driverTrips) {
      const zid = trip.destinationZoneId
      const zName = trip.destinationZone?.name ?? 'Unknown'

      if (!zoneBreakdownMap.has(zid ?? 'unknown')) {
        zoneBreakdownMap.set(zid ?? 'unknown', { zoneName: zName, trips: 0, distSum: 0, fuelSum: 0 })
      }
      const zb = zoneBreakdownMap.get(zid ?? 'unknown')!
      zb.trips++
      if (trip.totalMileage) zb.distSum += trip.totalMileage
      if (trip.fuelUsed) zb.fuelSum += trip.fuelUsed

      if (zid) {
        const bench = benchmarkMap.get(zid)
        if (bench && trip.totalMileage) {
          if (trip.totalMileage >= bench.expectedMinMileage && trip.totalMileage <= bench.expectedMaxMileage) {
            inRange++
          }
        }
      }
    }

    entry.performanceScore = driverTrips.length > 0 ? Math.round((inRange / driverTrips.length) * 100) : 0
    entry.zoneBreakdown = [...zoneBreakdownMap.values()].map((zb) => ({
      zoneName: zb.zoneName,
      trips: zb.trips,
      avgDistance: zb.trips > 0 ? Math.round((zb.distSum / zb.trips) * 100) / 100 : 0,
      avgFuel: zb.trips > 0 ? Math.round((zb.fuelSum / zb.trips) * 100) / 100 : 0,
    }))
  }

  return NextResponse.json({
    reportType: 'driver',
    period: { dateFrom, dateTo },
    generatedAt: new Date().toISOString(),
    data: [...driverMap.values()],
  })
}

// ============ TRUCK REPORT ============
async function generateTruckReport(
  where: Record<string, unknown>,
  dateFrom: string | null,
  dateTo: string | null
) {
  const trips = await db.trip.findMany({
    where,
    include: {
      truck: { select: { id: true, plateNumber: true, make: true, model: true, status: true, fuelType: true } },
      driver: { select: { id: true, firstName: true, lastName: true } },
    },
    orderBy: { departureTime: 'desc' },
    take: MAX_PERFORMANCE_TRIPS,
  })

  // Get trip IDs for expense aggregation
  const tripIds = trips.map((t) => t.id)

  // Aggregate expenses per trip
  const expenseAgg = await db.expense.groupBy({
    by: ['tripId'],
    where: { tripId: { in: tripIds } },
    _sum: { amount: true },
  })
  const expenseMap = new Map(expenseAgg.map((e) => [e.tripId, e._sum.amount ?? 0]))

  // Aggregate fuel expenses per trip
  const fuelExpenseAgg = await db.expense.groupBy({
    by: ['tripId'],
    where: { tripId: { in: tripIds }, category: 'fuel' },
    _sum: { amount: true },
  })
  const fuelExpenseMap = new Map(fuelExpenseAgg.map((e) => [e.tripId, e._sum.amount ?? 0]))

  // Group by truck
  const truckMap = new Map<string, {
    truckId: string
    plateNumber: string
    make: string
    model: string
    fuelType: string
    totalTrips: number
    totalRevenue: number
    totalExpenses: number
    totalFuelCost: number
    netProfit: number
    avgRevenuePerTrip: number
  }>()

  for (const trip of trips) {
    const tid = trip.truckId
    if (!truckMap.has(tid)) {
      truckMap.set(tid, {
        truckId: tid,
        plateNumber: trip.truck.plateNumber,
        make: trip.truck.make,
        model: trip.truck.model,
        fuelType: trip.truck.fuelType,
        totalTrips: 0,
        totalRevenue: 0,
        totalExpenses: 0,
        totalFuelCost: 0,
        netProfit: 0,
        avgRevenuePerTrip: 0,
      })
    }
    const entry = truckMap.get(tid)!
    entry.totalTrips++
    if (trip.totalRevenue) entry.totalRevenue += trip.totalRevenue
    entry.totalExpenses += expenseMap.get(trip.id) ?? 0
    entry.totalFuelCost += fuelExpenseMap.get(trip.id) ?? 0
  }

  for (const entry of truckMap.values()) {
    entry.netProfit = Math.round((entry.totalRevenue - entry.totalExpenses) * 100) / 100
    entry.avgRevenuePerTrip = entry.totalTrips > 0 ? Math.round((entry.totalRevenue / entry.totalTrips) * 100) / 100 : 0
  }

  return NextResponse.json({
    reportType: 'truck',
    period: { dateFrom, dateTo },
    generatedAt: new Date().toISOString(),
    data: [...truckMap.values()],
  })
}

// ============ ZONE REPORT ============
async function generateZoneReport(
  where: Record<string, unknown>,
  dateFrom: string | null,
  dateTo: string | null
) {
  const trips = await db.trip.findMany({
    where: {
      ...where,
      destinationZoneId: { not: null },
    },
    include: {
      destinationZone: {
        select: { id: true, name: true, destinationCity: { select: { id: true, name: true, region: true } } },
      },
    },
    orderBy: { departureTime: 'desc' },
    take: MAX_PERFORMANCE_TRIPS,
  })

  // Group by zone
  const zoneMap = new Map<string, {
    zoneId: string
    zoneName: string
    cityName: string | null
    region: string | null
    totalTrips: number
    totalDistance: number
    totalFuel: number
    avgDistance: number
    avgFuel: number
    fuelEfficiency: number
    totalRevenue: number
  }>()

  for (const trip of trips) {
    const zid = trip.destinationZoneId!
    if (!zoneMap.has(zid)) {
      zoneMap.set(zid, {
        zoneId: zid,
        zoneName: trip.destinationZone?.name ?? 'Unknown',
        cityName: trip.destinationZone?.destinationCity?.name ?? null,
        region: trip.destinationZone?.destinationCity?.region ?? null,
        totalTrips: 0,
        totalDistance: 0,
        totalFuel: 0,
        avgDistance: 0,
        avgFuel: 0,
        fuelEfficiency: 0,
        totalRevenue: 0,
      })
    }
    const entry = zoneMap.get(zid)!
    entry.totalTrips++
    if (trip.totalMileage) entry.totalDistance += trip.totalMileage
    if (trip.fuelUsed) entry.totalFuel += trip.fuelUsed
    if (trip.totalRevenue) entry.totalRevenue += trip.totalRevenue
  }

  for (const entry of zoneMap.values()) {
    entry.avgDistance = entry.totalTrips > 0 ? Math.round((entry.totalDistance / entry.totalTrips) * 100) / 100 : 0
    entry.avgFuel = entry.totalTrips > 0 ? Math.round((entry.totalFuel / entry.totalTrips) * 100) / 100 : 0
    entry.fuelEfficiency = entry.totalFuel > 0 ? Math.round((entry.totalDistance / entry.totalFuel) * 100) / 100 : 0
    entry.totalRevenue = Math.round(entry.totalRevenue * 100) / 100
  }

  return NextResponse.json({
    reportType: 'zone',
    period: { dateFrom, dateTo },
    generatedAt: new Date().toISOString(),
    data: [...zoneMap.values()],
  })
}

// ============ COMPARATIVE REPORT ============
async function generateComparativeReport(
  where: Record<string, unknown>,
  dateFrom: string | null,
  dateTo: string | null,
  driverIdFilter: string | null,
  zoneIdFilter: string | null
) {
  // For comparative, we need trips with driver + zone info
  const trips = await db.trip.findMany({
    where: {
      ...where,
      destinationZoneId: { not: null },
    },
    include: {
      driver: { select: { id: true, firstName: true, lastName: true, employeeId: true } },
      destinationZone: { select: { id: true, name: true, destinationCity: { select: { id: true, name: true } } } },
      truck: { select: { id: true, plateNumber: true } },
    },
    orderBy: { departureTime: 'desc' },
    take: MAX_PERFORMANCE_TRIPS,
  })

  // Group by driver -> zone
  const driverZoneMap = new Map<string, Map<string, {
    zoneId: string
    zoneName: string
    trips: number
    avgDistance: number
    avgFuel: number
    totalDistance: number
    totalFuel: number
    totalRevenue: number
  }>>()

  for (const trip of trips) {
    const did = trip.driverId
    const zid = trip.destinationZoneId!

    if (!driverZoneMap.has(did)) driverZoneMap.set(did, new Map())
    const zoneMap = driverZoneMap.get(did)!

    if (!zoneMap.has(zid)) {
      zoneMap.set(zid, {
        zoneId: zid,
        zoneName: trip.destinationZone?.name ?? 'Unknown',
        trips: 0,
        avgDistance: 0,
        avgFuel: 0,
        totalDistance: 0,
        totalFuel: 0,
        totalRevenue: 0,
      })
    }
    const entry = zoneMap.get(zid)!
    entry.trips++
    if (trip.totalMileage) entry.totalDistance += trip.totalMileage
    if (trip.fuelUsed) entry.totalFuel += trip.fuelUsed
    if (trip.totalRevenue) entry.totalRevenue += trip.totalRevenue
  }

  // Build flat comparison table
  const comparisons: {
    driverId: string
    driverName: string
    employeeId: string
    zoneId: string
    zoneName: string
    trips: number
    avgDistance: number
    avgFuel: number
    totalRevenue: number
    fuelEfficiency: number
  }[] = []

  for (const [did, zoneMap] of driverZoneMap) {
    const driver = trips.find((t) => t.driverId === did)?.driver
    for (const entry of zoneMap.values()) {
      entry.avgDistance = entry.trips > 0 ? Math.round((entry.totalDistance / entry.trips) * 100) / 100 : 0
      entry.avgFuel = entry.trips > 0 ? Math.round((entry.totalFuel / entry.trips) * 100) / 100 : 0
      comparisons.push({
        driverId: did,
        driverName: driver ? `${driver.firstName} ${driver.lastName}` : 'Unknown',
        employeeId: driver?.employeeId ?? '',
        zoneId: entry.zoneId,
        zoneName: entry.zoneName,
        trips: entry.trips,
        avgDistance: entry.avgDistance,
        avgFuel: entry.avgFuel,
        totalRevenue: Math.round(entry.totalRevenue * 100) / 100,
        fuelEfficiency: entry.totalFuel > 0 ? Math.round((entry.totalDistance / entry.totalFuel) * 100) / 100 : 0,
      })
    }
  }

  // Sort by zone name then by avgDistance
  comparisons.sort((a, b) => {
    if (a.zoneName !== b.zoneName) return a.zoneName.localeCompare(b.zoneName)
    return b.avgDistance - a.avgDistance
  })

  // If filtered by zone, also compute zone average for comparison
  let zoneAverages: Record<string, { avgDistance: number; avgFuel: number; avgRevenue: number; fuelEfficiency: number }> | null = null
  if (zoneIdFilter) {
    const zoneEntries = comparisons.filter((c) => c.zoneId === zoneIdFilter)
    if (zoneEntries.length > 0) {
      const totalTrips = zoneEntries.reduce((s, e) => s + e.trips, 0)
      zoneAverages = {
        [zoneIdFilter]: {
          avgDistance: Math.round(zoneEntries.reduce((s, e) => s + e.avgDistance * e.trips, 0) / totalTrips * 100) / 100,
          avgFuel: Math.round(zoneEntries.reduce((s, e) => s + e.avgFuel * e.trips, 0) / totalTrips * 100) / 100,
          avgRevenue: Math.round(zoneEntries.reduce((s, e) => s + e.totalRevenue, 0) / zoneEntries.length * 100) / 100,
          fuelEfficiency: zoneEntries.reduce((s, e) => s + e.fuelEfficiency, 0) / zoneEntries.length > 0
            ? Math.round(zoneEntries.reduce((s, e) => s + e.fuelEfficiency, 0) / zoneEntries.length * 100) / 100
            : 0,
        },
      }
    }
  }

  return NextResponse.json({
    reportType: 'comparative',
    period: { dateFrom, dateTo },
    generatedAt: new Date().toISOString(),
    zoneAverages,
    data: comparisons,
  })
}
