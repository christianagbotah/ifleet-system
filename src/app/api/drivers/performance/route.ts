import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { requireAuth } from '@/lib/auth-server'

// Non-terminal trip statuses (active trips)
const NON_TERMINAL_STATUSES = [
  'scheduled',
  'loading',
  'loaded',
  'waiting_at_depot',
  'departed_depot',
  'in_transit',
  'arrived_destination',
  'waiting_to_offload',
  'offloading',
  'offloaded',
  'return_journey',
  'arrived_depot',
]

export async function GET(request: NextRequest) {
  try {
    const auth = requireAuth(request)
    if (auth instanceof NextResponse) return auth

    const { searchParams } = new URL(request.url)
    const range = searchParams.get('range') || 'this_month'

    const now = new Date()

    // Determine date range based on selection
    let rangeStart: Date
    let rangeEnd = new Date(now.getFullYear(), now.getMonth() + 1, now.getDate(), 23, 59, 59, 999)

    switch (range) {
      case 'this_week': {
        const dayOfWeek = now.getDay() || 7 // Monday=1, Sunday=7
        rangeStart = new Date(now.getFullYear(), now.getMonth(), now.getDate() - dayOfWeek + 1)
        break
      }
      case 'last_3_months': {
        rangeStart = new Date(now.getFullYear(), now.getMonth() - 2, 1)
        break
      }
      case 'this_year': {
        rangeStart = new Date(now.getFullYear(), 0, 1)
        break
      }
      default: { // this_month
        rangeStart = new Date(now.getFullYear(), now.getMonth(), 1)
        break
      }
    }

    // Get all drivers with trip stats in the date range + current active trip (any date)
    const drivers = await db.driver.findMany({
      select: {
        id: true,
        firstName: true,
        lastName: true,
        phone: true,
        licenseNumber: true,
        status: true,
        // Trips in the selected date range (for stats)
        Trip: {
          where: {
            departureTime: { gte: rangeStart, lte: rangeEnd },
          },
          select: {
            id: true,
            tripNumber: true,
            status: true,
            totalRevenue: true,
            departureTime: true,
          },
          orderBy: { departureTime: 'desc' },
        },
        // Active trips (any date) for current trip detection
      },
      orderBy: [{ firstName: 'asc' }],
    })

    // Get all active trips for current trip detection (outside date range scope)
    const allActiveTrips = await db.trip.findMany({
      where: {
        status: { in: NON_TERMINAL_STATUSES },
      },
      select: {
        id: true,
        driverId: true,
        tripNumber: true,
        status: true,
        loadingLocation: true,
        destination: true,
      },
    })

    // Build a map of driverId -> current active trip
    const activeTripsByDriver = new Map<string, typeof allActiveTrips[0]>()
    for (const trip of allActiveTrips) {
      if (!activeTripsByDriver.has(trip.driverId)) {
        activeTripsByDriver.set(trip.driverId, trip)
      }
    }

    const driverPerformance = drivers.map((driver) => {
      const trips = driver.Trip
      const totalTrips = trips.length
      const completedTrips = trips.filter((t) => t.status === 'completed').length
      const activeTrips = trips.filter((t) => NON_TERMINAL_STATUSES.includes(t.status)).length
      const cancelledTrips = trips.filter((t) => t.status === 'cancelled').length

      const totalRevenue = trips
        .filter((t) => t.status === 'completed')
        .reduce((sum, t) => sum + (t.totalRevenue || 0), 0)

      const avgTripRevenue = completedTrips > 0 ? totalRevenue / completedTrips : 0

      const completionRate = totalTrips > 0 ? Math.round((completedTrips / totalTrips) * 100) : 0

      // Last active date = max departureTime across all trips in range
      const lastActiveDate = trips.length > 0 ? trips[0].departureTime.toISOString() : null

      // Current active trip (from global active trips, not limited to date range)
      const activeTrip = activeTripsByDriver.get(driver.id) || null

      return {
        id: driver.id,
        firstName: driver.firstName,
        lastName: driver.lastName,
        phone: driver.phone,
        status: driver.status,
        licenseNumber: driver.licenseNumber,
        totalTrips,
        completedTrips,
        activeTrips,
        cancelledTrips,
        totalRevenue,
        avgTripRevenue: Math.round(avgTripRevenue),
        completionRate,
        lastActiveDate,
        currentTrip: activeTrip
          ? {
              id: activeTrip.id,
              tripNumber: activeTrip.tripNumber,
              status: activeTrip.status,
              loadingLocation: activeTrip.loadingLocation,
              destination: activeTrip.destination,
            }
          : null,
      }
    })

    // Sort by completedTrips desc, then totalRevenue desc
    driverPerformance.sort((a, b) => {
      if (b.completedTrips !== a.completedTrips) {
        return b.completedTrips - a.completedTrips
      }
      return b.totalRevenue - a.totalRevenue
    })

    // Summary KPIs
    const totalDrivers = driverPerformance.length
    const totalTripsCompleted = driverPerformance.reduce((sum, d) => sum + d.completedTrips, 0)
    const avgCompletionRate =
      totalDrivers > 0
        ? Math.round(driverPerformance.reduce((sum, d) => sum + d.completionRate, 0) / totalDrivers)
        : 0
    const totalRevenueGenerated = driverPerformance.reduce((sum, d) => sum + d.totalRevenue, 0)
    const topPerformer = driverPerformance.length > 0 && driverPerformance[0].completedTrips > 0
      ? `${driverPerformance[0].firstName} ${driverPerformance[0].lastName}`
      : null

    return NextResponse.json({
      drivers: driverPerformance,
      summary: {
        totalDrivers,
        avgCompletionRate,
        totalRevenueGenerated,
        totalTripsCompleted,
        topPerformer,
      },
    })
  } catch (error) {
    console.error('Driver Performance API error:', error)
    return NextResponse.json(
      { error: 'Failed to load driver performance data' },
      { status: 500 }
    )
  }
}
