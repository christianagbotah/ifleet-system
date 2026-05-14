import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { requireAuth } from '@/lib/auth-server'

/**
 * Performance Dashboard — compares completed trips against benchmarks.
 *
 * Query params:
 *   zoneId   — filter to a specific destination zone
 *   driverId — filter to a specific driver
 *   dateFrom — ISO date string (inclusive)
 *   dateTo   — ISO date string (inclusive)
 */
export async function GET(request: NextRequest) {
  try {
    const auth = requireAuth(request)
    if (auth instanceof NextResponse) return auth

    const { searchParams } = new URL(request.url)
    const zoneId = searchParams.get('zoneId')
    const driverId = searchParams.get('driverId')
    const dateFrom = searchParams.get('dateFrom')
    const dateTo = searchParams.get('dateTo')

    // Build trip query — only completed trips that have a destinationZoneId
    const where: Record<string, unknown> = {
      status: 'completed',
      destinationZoneId: { not: null },
    }

    if (zoneId) where.destinationZoneId = zoneId
    if (driverId) where.driverId = driverId
    if (dateFrom || dateTo) {
      const departureFilter: Record<string, unknown> = {}
      if (dateFrom) departureFilter.gte = new Date(dateFrom)
      if (dateTo) {
        // End of the day for dateTo
        const toDate = new Date(dateTo)
        toDate.setHours(23, 59, 59, 999)
        departureFilter.lte = toDate
      }
      where.departureTime = departureFilter
    }

    // Fetch completed trips with driver, zone, and benchmark info
    const trips = await db.trip.findMany({
      where,
      include: {
        driver: { select: { id: true, firstName: true, lastName: true, employeeId: true } },
        truck: { select: { id: true, plateNumber: true, make: true, model: true } },
        destinationZone: { select: { id: true, name: true } },
      },
      orderBy: { departureTime: 'desc' },
    })

    // If no trips, return empty dashboard
    if (trips.length === 0) {
      return NextResponse.json({
        period: { dateFrom, dateTo },
        filters: { zoneId, driverId },
        totalTrips: 0,
        drivers: [],
        zoneSummary: [],
        fleetSummary: {
          totalTrips: 0,
          greenCount: 0,
          yellowCount: 0,
          redCount: 0,
          mileageGreenPct: 0,
          mileageYellowPct: 0,
          mileageRedPct: 0,
          fuelGreenPct: 0,
          fuelYellowPct: 0,
          fuelRedPct: 0,
        },
      })
    }

    // Gather all unique zone IDs for batch benchmark lookup
    const zoneIds = [...new Set(trips.map((t) => t.destinationZoneId).filter(Boolean))] as string[]

    // Fetch latest active benchmark per zone
    const benchmarks = await db.performanceBenchmark.findMany({
      where: {
        destinationZoneId: { in: zoneIds },
        isActive: true,
      },
      orderBy: { createdAt: 'desc' },
    })

    // Build a map: zoneId -> latest benchmark (first one per zone since ordered desc)
    const benchmarkMap = new Map<string, (typeof benchmarks)[0]>()
    for (const b of benchmarks) {
      if (!benchmarkMap.has(b.destinationZoneId)) {
        benchmarkMap.set(b.destinationZoneId, b)
      }
    }

    // Classify function
    type Status = 'GREEN' | 'YELLOW' | 'RED'
    function classifyValue(
      value: number | null | undefined,
      expectedMin: number | null,
      expectedMax: number | null,
      warnMin: number | null | undefined,
      warnMax: number | null | undefined
    ): Status {
      if (value === null || value === undefined) return 'RED'
      if (expectedMin !== null && expectedMax !== null) {
        if (value >= expectedMin && value <= expectedMax) return 'GREEN'
      }
      const effWarnMin = warnMin !== null && warnMin !== undefined ? warnMin : expectedMin !== null ? expectedMin * 0.9 : null
      const effWarnMax = warnMax !== null && warnMax !== undefined ? warnMax : expectedMax !== null ? expectedMax * 1.1 : null
      if (effWarnMin !== null && effWarnMax !== null) {
        if (value >= effWarnMin && value <= effWarnMax) return 'YELLOW'
      }
      return 'RED'
    }

    // Process trips
    interface TripPerformance {
      tripId: string
      tripNumber: string
      driverId: string
      driverName: string
      truckPlate: string
      zoneId: string | null
      zoneName: string | null
      totalMileage: number | null
      fuelUsed: number | null
      mileageStatus: Status
      fuelStatus: Status
      departureTime: Date
    }

    const tripPerformances: TripPerformance[] = trips.map((trip) => {
      const benchmark = trip.destinationZoneId ? benchmarkMap.get(trip.destinationZoneId) : null

      const mileageStatus = classifyValue(
        trip.totalMileage,
        benchmark?.expectedMinMileage ?? null,
        benchmark?.expectedMaxMileage ?? null,
        benchmark?.warningMinMileage,
        benchmark?.warningMaxMileage
      )
      const fuelStatus = classifyValue(
        trip.fuelUsed,
        benchmark?.expectedMinFuel ?? null,
        benchmark?.expectedMaxFuel ?? null,
        benchmark?.warningMinFuel,
        benchmark?.warningMaxFuel
      )

      return {
        tripId: trip.id,
        tripNumber: trip.tripNumber,
        driverId: trip.driverId,
        driverName: `${trip.driver.firstName} ${trip.driver.lastName}`,
        truckPlate: trip.truck.plateNumber,
        zoneId: trip.destinationZoneId,
        zoneName: trip.destinationZone?.name ?? null,
        totalMileage: trip.totalMileage,
        fuelUsed: trip.fuelUsed,
        mileageStatus,
        fuelStatus,
        departureTime: trip.departureTime,
      }
    })

    // Driver summary
    const driverMap = new Map<string, {
      driverId: string
      driverName: string
      employeeId: string
      totalTrips: number
      mileageGreen: number
      mileageYellow: number
      mileageRed: number
      fuelGreen: number
      fuelYellow: number
      fuelRed: number
      avgMileage: number
      avgFuel: number
      trips: TripPerformance[]
    }>()

    for (const tp of tripPerformances) {
      if (!driverMap.has(tp.driverId)) {
        const driver = trips.find((t) => t.driverId === tp.driverId)?.driver
        driverMap.set(tp.driverId, {
          driverId: tp.driverId,
          driverName: tp.driverName,
          employeeId: driver?.employeeId ?? '',
          totalTrips: 0,
          mileageGreen: 0,
          mileageYellow: 0,
          mileageRed: 0,
          fuelGreen: 0,
          fuelYellow: 0,
          fuelRed: 0,
          avgMileage: 0,
          avgFuel: 0,
          trips: [],
        })
      }
      const entry = driverMap.get(tp.driverId)!
      entry.totalTrips++
      entry.trips.push(tp)
      if (tp.mileageStatus === 'GREEN') entry.mileageGreen++
      else if (tp.mileageStatus === 'YELLOW') entry.mileageYellow++
      else entry.mileageRed++
      if (tp.fuelStatus === 'GREEN') entry.fuelGreen++
      else if (tp.fuelStatus === 'YELLOW') entry.fuelYellow++
      else entry.fuelRed++
    }

    // Calculate averages for each driver
    for (const entry of driverMap.values()) {
      const mileages = entry.trips.map((t) => t.totalMileage).filter((m): m is number => m !== null)
      const fuels = entry.trips.map((t) => t.fuelUsed).filter((f): f is number => f !== null)
      entry.avgMileage = mileages.length > 0 ? mileages.reduce((a, b) => a + b, 0) / mileages.length : 0
      entry.avgFuel = fuels.length > 0 ? fuels.reduce((a, b) => a + b, 0) / fuels.length : 0
    }

    // Zone summary
    const zoneSummaryMap = new Map<string, {
      zoneId: string
      zoneName: string
      totalTrips: number
      avgMileage: number
      avgFuel: number
      mileageGreen: number
      mileageYellow: number
      mileageRed: number
      fuelGreen: number
      fuelYellow: number
      fuelRed: number
    }>()

    for (const tp of tripPerformances) {
      const zid = tp.zoneId ?? 'unknown'
      if (!zoneSummaryMap.has(zid)) {
        zoneSummaryMap.set(zid, {
          zoneId: zid,
          zoneName: tp.zoneName ?? 'Unknown',
          totalTrips: 0,
          avgMileage: 0,
          avgFuel: 0,
          mileageGreen: 0,
          mileageYellow: 0,
          mileageRed: 0,
          fuelGreen: 0,
          fuelYellow: 0,
          fuelRed: 0,
        })
      }
      const entry = zoneSummaryMap.get(zid)!
      entry.totalTrips++
      if (tp.mileageStatus === 'GREEN') entry.mileageGreen++
      else if (tp.mileageStatus === 'YELLOW') entry.mileageYellow++
      else entry.mileageRed++
      if (tp.fuelStatus === 'GREEN') entry.fuelGreen++
      else if (tp.fuelStatus === 'YELLOW') entry.fuelYellow++
      else entry.fuelRed++
    }

    // Calculate zone averages
    for (const [zid, entry] of zoneSummaryMap) {
      const zoneTrips = tripPerformances.filter((tp) => (tp.zoneId ?? 'unknown') === zid)
      const mileages = zoneTrips.map((t) => t.totalMileage).filter((m): m is number => m !== null)
      const fuels = zoneTrips.map((t) => t.fuelUsed).filter((f): f is number => f !== null)
      entry.avgMileage = mileages.length > 0 ? Math.round((mileages.reduce((a, b) => a + b, 0) / mileages.length) * 100) / 100 : 0
      entry.avgFuel = fuels.length > 0 ? Math.round((fuels.reduce((a, b) => a + b, 0) / fuels.length) * 100) / 100 : 0
    }

    // Fleet summary
    const totalTrips = tripPerformances.length
    const mileageGreen = tripPerformances.filter((t) => t.mileageStatus === 'GREEN').length
    const mileageYellow = tripPerformances.filter((t) => t.mileageStatus === 'YELLOW').length
    const mileageRed = tripPerformances.filter((t) => t.mileageStatus === 'RED').length
    const fuelGreen = tripPerformances.filter((t) => t.fuelStatus === 'GREEN').length
    const fuelYellow = tripPerformances.filter((t) => t.fuelStatus === 'YELLOW').length
    const fuelRed = tripPerformances.filter((t) => t.fuelStatus === 'RED').length

    const fleetSummary = {
      totalTrips,
      greenCount: tripPerformances.filter((t) => t.mileageStatus === 'GREEN' && t.fuelStatus === 'GREEN').length,
      yellowCount: tripPerformances.filter((t) => t.mileageStatus === 'YELLOW' || t.fuelStatus === 'YELLOW').length,
      redCount: tripPerformances.filter((t) => t.mileageStatus === 'RED' || t.fuelStatus === 'RED').length,
      mileageGreenPct: totalTrips > 0 ? Math.round((mileageGreen / totalTrips) * 100) : 0,
      mileageYellowPct: totalTrips > 0 ? Math.round((mileageYellow / totalTrips) * 100) : 0,
      mileageRedPct: totalTrips > 0 ? Math.round((mileageRed / totalTrips) * 100) : 0,
      fuelGreenPct: totalTrips > 0 ? Math.round((fuelGreen / totalTrips) * 100) : 0,
      fuelYellowPct: totalTrips > 0 ? Math.round((fuelYellow / totalTrips) * 100) : 0,
      fuelRedPct: totalTrips > 0 ? Math.round((fuelRed / totalTrips) * 100) : 0,
    }

    return NextResponse.json({
      period: { dateFrom, dateTo },
      filters: { zoneId, driverId },
      totalTrips,
      drivers: [...driverMap.values()],
      zoneSummary: [...zoneSummaryMap.values()],
      fleetSummary,
    })
  } catch (error) {
    console.error('Performance dashboard error:', error)
    return NextResponse.json({ error: 'Failed to fetch performance dashboard' }, { status: 500 })
  }
}
