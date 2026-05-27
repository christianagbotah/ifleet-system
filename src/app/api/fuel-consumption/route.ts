import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { requireAuth } from '@/lib/auth-server'

// Helper: round to 2 decimal places
function round2(n: number): number {
  return Math.round((n + Number.EPSILON) * 100) / 100
}

// Helper: parse period into number of months
function getMonthsFromPeriod(period: string): number {
  switch (period) {
    case '1month': return 1
    case '3months': return 3
    case '6months': return 6
    case '12months': return 12
    case '24months': return 24
    default: return 6
  }
}

// Helper: build date filter for FuelLog queries
function buildFuelDateFilter(dateFrom?: string | null, dateTo?: string | null): Record<string, unknown> {
  if (!dateFrom && !dateTo) return {}
  const filter: Record<string, unknown> = {}
  filter.date = {}
  if (dateFrom) (filter.date as Record<string, unknown>).gte = new Date(dateFrom)
  if (dateTo) (filter.date as Record<string, unknown>).lte = new Date(dateTo)
  return filter
}

// Helper: build date filter for Trip queries (using departureTime)
function buildTripDateFilter(dateFrom?: string | null, dateTo?: string | null): Record<string, unknown> {
  if (!dateFrom && !dateTo) return {}
  const filter: Record<string, unknown> = {}
  filter.departureTime = {}
  if (dateFrom) (filter.departureTime as Record<string, unknown>).gte = new Date(dateFrom)
  if (dateTo) (filter.departureTime as Record<string, unknown>).lte = new Date(dateTo)
  return filter
}

export async function GET(request: NextRequest) {
  try {
    const auth = requireAuth(request)
    if (auth instanceof NextResponse) return auth

    const { searchParams } = new URL(request.url)
    const truckId = searchParams.get('truckId')
    const dateFrom = searchParams.get('dateFrom')
    const dateTo = searchParams.get('dateTo')
    const period = searchParams.get('period') || '6months'
    const zoneId = searchParams.get('zoneId')

    // ========== BUILD WHERE CLAUSES ==========

    // Fuel log base filter
    const fuelWhere: Record<string, unknown> = {}
    if (truckId) fuelWhere.truckId = truckId
    Object.assign(fuelWhere, buildFuelDateFilter(dateFrom, dateTo))

    // Completed trips base filter
    const completedTripWhere: Record<string, unknown> = { status: 'completed' }
    if (truckId) completedTripWhere.truckId = truckId
    if (zoneId) completedTripWhere.destinationZoneId = zoneId
    Object.assign(completedTripWhere, buildTripDateFilter(dateFrom, dateTo))

    // ========== SUMMARY ==========

    // Total fuel cost from FuelLog
    const fuelSummary = await db.fuelLog.aggregate({
      _sum: { totalCost: true },
      _count: { id: true },
      where: fuelWhere,
    })
    const totalFuelCost = fuelSummary._sum.totalCost || 0

    // Completed trip data: count, revenue, mileage
    const tripSummary = await db.trip.aggregate({
      _count: { id: true },
      _sum: { totalMileage: true, totalRevenue: true },
      where: completedTripWhere,
    })

    const totalTrips = tripSummary._count.id
    const totalRevenue = tripSummary._sum.totalRevenue || 0
    const totalDistanceFromTrips = tripSummary._sum.totalMileage || 0

    // Fallback: calculate distance from fuel log odometer readings if trip mileage is insufficient
    let totalDistance = totalDistanceFromTrips
    if (totalDistance <= 0) {
      const truckIds = truckId
        ? [truckId]
        : (await db.fuelLog.findMany({
            where: fuelWhere,
            select: { truckId: true },
            distinct: ['truckId'],
          })).map(l => l.truckId)

      if (truckIds.length > 0) {
        const allLogs = await db.fuelLog.findMany({
          where: fuelWhere,
          orderBy: [{ truckId: 'asc' }, { date: 'asc' }],
          select: { truckId: true, odometer: true, date: true },
        })

        // Group by truck and calculate distance from consecutive odometer readings
        const logsByTruck = new Map<string, typeof allLogs>()
        for (const log of allLogs) {
          const existing = logsByTruck.get(log.truckId) || []
          existing.push(log)
          logsByTruck.set(log.truckId, existing)
        }

        let odometerDist = 0
        for (const [, logs] of logsByTruck) {
          for (let i = 1; i < logs.length; i++) {
            if (logs[i - 1].odometer && logs[i].odometer) {
              const d = logs[i].odometer - logs[i - 1].odometer
              if (d > 0) odometerDist += d
            }
          }
        }
        totalDistance = odometerDist
      }
    }

    const avgFuelCostPerTrip = totalTrips > 0 ? totalFuelCost / totalTrips : 0
    const avgFuelCostPerKm = totalDistance > 0 ? totalFuelCost / totalDistance : 0
    const fuelAsPercentageOfRevenue = totalRevenue > 0 ? (totalFuelCost / totalRevenue) * 100 : 0

    // ========== BY TRUCK ==========

    // Get fuel cost per truck
    const fuelByTruck = await db.fuelLog.groupBy({
      by: ['truckId'],
      _sum: { totalCost: true },
      _count: { id: true },
      where: fuelWhere,
      orderBy: { _sum: { totalCost: 'desc' } },
    })

    // Get completed trip data per truck
    const truckIdsForTrips = fuelByTruck.map(f => f.truckId)
    const tripsByTruck = truckIdsForTrips.length > 0
      ? await db.trip.groupBy({
          by: ['truckId'],
          _count: { id: true },
          _sum: { totalMileage: true, totalRevenue: true },
          where: {
            truckId: { in: truckIdsForTrips },
            status: 'completed',
            ...buildTripDateFilter(dateFrom, dateTo),
          },
        })
      : []

    // Map trip data by truckId
    const tripByTruckMap = new Map(tripsByTruck.map(t => [t.truckId, t]))

    // Get truck details
    const truckDetails = truckIdsForTrips.length > 0
      ? await db.truck.findMany({
          where: { id: { in: truckIdsForTrips } },
          select: { id: true, plateNumber: true, make: true, model: true },
        })
      : []
    const truckMap = new Map(truckDetails.map(t => [t.id, t]))

    const byTruck = fuelByTruck.map(f => {
      const truck = truckMap.get(f.truckId)
      const tripData = tripByTruckMap.get(f.truckId)
      const tCost = f._sum.totalCost || 0
      const tCount = tripData?._count.id || 0
      const tDist = tripData?._sum.totalMileage || 0
      const tRevenue = tripData?._sum.totalRevenue || 0

      return {
        truckId: f.truckId,
        plateNumber: truck?.plateNumber || 'Unknown',
        make: truck?.make || '',
        model: truck?.model || '',
        totalFuelCost: round2(tCost),
        tripCount: tCount,
        avgCostPerTrip: round2(tCount > 0 ? tCost / tCount : 0),
        avgCostPerKm: round2(tDist > 0 ? tCost / tDist : 0),
        totalDistance: round2(tDist),
        totalRevenue: round2(tRevenue),
        fuelCostRatio: round2(tRevenue > 0 ? (tCost / tRevenue) * 100 : 0),
      }
    })

    // ========== BY ZONE ==========

    // Find completed trips with a destination zone (filtered by zoneId if provided)
    const zoneTrips = await db.trip.findMany({
      where: {
        status: 'completed',
        destinationZoneId: { not: null },
        ...(zoneId ? { destinationZoneId: zoneId } : {}),
        ...(truckId ? { truckId } : {}),
        ...buildTripDateFilter(dateFrom, dateTo),
      },
      select: {
        id: true,
        destinationZoneId: true,
        totalRevenue: true,
        totalMileage: true,
      },
    })

    let byZone: Array<{
      zoneId: string
      zoneName: string
      cityId: string
      cityName: string
      expectedFuelCost: number | null
      actualFuelCost: number
      tripCount: number
      deviation: number
      deviationPercent: number
    }> = []

    if (zoneTrips.length > 0) {
      const zoneTripIds = zoneTrips.map(t => t.id)

      // Get fuel costs for these trips
      const fuelForZoneTrips = await db.fuelLog.groupBy({
        by: ['tripId'],
        _sum: { totalCost: true },
        where: { tripId: { in: zoneTripIds } },
      })

      const fuelByTripId = new Map(fuelForZoneTrips.map(f => [f.tripId, f._sum.totalCost || 0]))

      // Group by destinationZoneId
      const zoneAggMap = new Map<string, {
        tripCount: number
        actualFuelCost: number
        totalRevenue: number
        totalDistance: number
      }>()

      for (const trip of zoneTrips) {
        const zid = trip.destinationZoneId!
        const existing = zoneAggMap.get(zid) || { tripCount: 0, actualFuelCost: 0, totalRevenue: 0, totalDistance: 0 }
        existing.tripCount += 1
        existing.actualFuelCost += fuelByTripId.get(trip.id) || 0
        existing.totalRevenue += trip.totalRevenue || 0
        existing.totalDistance += trip.totalMileage || 0
        zoneAggMap.set(zid, existing)
      }

      // Get zone details
      const zoneIds = [...zoneAggMap.keys()]
      const zoneDetails = await db.destinationZone.findMany({
        where: { id: { in: zoneIds } },
        include: { destinationCity: { select: { id: true, name: true } } },
      })
      const zoneDetailMap = new Map(zoneDetails.map(z => [z.id, z]))

      // Get active zone rates for expected fuel cost
      const zoneRates = await db.zoneRate.findMany({
        where: {
          destinationZoneId: { in: zoneIds },
          isActive: true,
        },
        orderBy: { effectiveDate: 'desc' },
      })

      // Keep the most recent rate per zone
      const zoneRateMap = new Map<string, number | null>()
      for (const rate of zoneRates) {
        if (!zoneRateMap.has(rate.destinationZoneId)) {
          zoneRateMap.set(rate.destinationZoneId, rate.expectedFuelCost)
        }
      }

      // Build byZone array
      byZone = [...zoneAggMap.entries()].map(([zid, agg]) => {
        const zone = zoneDetailMap.get(zid)
        const expectedCost = zoneRateMap.get(zid)
        const deviation = expectedCost != null ? agg.actualFuelCost - expectedCost : 0
        const deviationPercent = expectedCost != null && expectedCost > 0 ? (deviation / expectedCost) * 100 : 0

        return {
          zoneId: zid,
          zoneName: zone?.name || 'Unknown',
          cityId: zone?.destinationCity?.id || '',
          cityName: zone?.destinationCity?.name || '',
          expectedFuelCost: expectedCost != null ? round2(expectedCost) : null,
          actualFuelCost: round2(agg.actualFuelCost),
          tripCount: agg.tripCount,
          deviation: round2(deviation),
          deviationPercent: round2(deviationPercent),
        }
      }).sort((a, b) => b.actualFuelCost - a.actualFuelCost)
    }

    // ========== MONTHLY TREND ==========

    const monthsCount = getMonthsFromPeriod(period)
    const now = new Date()
    const monthlyTrend = []

    for (let i = monthsCount - 1; i >= 0; i--) {
      const mStart = new Date(now.getFullYear(), now.getMonth() - i, 1)
      const mEnd = new Date(now.getFullYear(), now.getMonth() - i + 1, 0, 23, 59, 59, 999)

      // Fuel cost for this month
      const mFuelWhere: Record<string, unknown> = { date: { gte: mStart, lte: mEnd } }
      if (truckId) mFuelWhere.truckId = truckId
      const mFuelAgg = await db.fuelLog.aggregate({
        _sum: { totalCost: true },
        _count: { id: true },
        where: mFuelWhere,
      })

      // Completed trips for this month
      const mTripWhere: Record<string, unknown> = {
        status: 'completed',
        departureTime: { gte: mStart, lte: mEnd },
      }
      if (truckId) mTripWhere.truckId = truckId
      if (zoneId) mTripWhere.destinationZoneId = zoneId
      const mTripAgg = await db.trip.aggregate({
        _count: { id: true },
        _sum: { totalRevenue: true },
        where: mTripWhere,
      })

      const mFuelCost = mFuelAgg._sum.totalCost || 0
      const mRevenue = mTripAgg._sum.totalRevenue || 0
      const mTrips = mTripAgg._count.id

      monthlyTrend.push({
        month: mStart.toLocaleString('en-US', { month: 'short', year: 'numeric' }),
        year: mStart.getFullYear(),
        monthIndex: mStart.getMonth() + 1,
        totalFuelCost: round2(mFuelCost),
        totalRevenue: round2(mRevenue),
        tripCount: mTrips,
        avgCostPerTrip: round2(mTrips > 0 ? mFuelCost / mTrips : 0),
        fuelCostRatio: round2(mRevenue > 0 ? (mFuelCost / mRevenue) * 100 : 0),
      })
    }

    // ========== RETURN RESPONSE ==========

    return NextResponse.json({
      summary: {
        totalFuelCost: round2(totalFuelCost),
        totalTrips,
        avgFuelCostPerTrip: round2(avgFuelCostPerTrip),
        avgFuelCostPerKm: round2(avgFuelCostPerKm),
        fuelAsPercentageOfRevenue: round2(fuelAsPercentageOfRevenue),
        totalRevenue: round2(totalRevenue),
      },
      byTruck,
      byZone,
      monthlyTrend,
    })
  } catch (error) {
    console.error('Fuel Consumption Analytics API error:', error)
    return NextResponse.json(
      { error: 'Failed to load fuel consumption analytics' },
      { status: 500 }
    )
  }
}
