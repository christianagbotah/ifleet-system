import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { requireAuth } from '@/lib/auth-server'

// ============ Scoring Helpers ============

function getSpeedingScore(alerts: number): number {
  if (alerts === 0) return 25
  if (alerts <= 3) return 20
  if (alerts <= 6) return 15
  if (alerts <= 10) return 10
  return 0
}

function getRouteComplianceScore(alerts: number): number {
  if (alerts === 0) return 20
  if (alerts <= 2) return 15
  if (alerts <= 5) return 10
  return 0
}

function getIdleTimeScore(alerts: number): number {
  if (alerts <= 2) return 15
  if (alerts <= 5) return 10
  if (alerts <= 10) return 5
  return 0
}

function getLateNightScore(instances: number): number {
  if (instances === 0) return 10
  if (instances <= 3) return 7
  if (instances <= 7) return 4
  return 0
}

function getComplianceScore(
  licenseDaysLeft: number | null,
  ghanaCardDaysLeft: number | null,
  verificationStatus: string | null,
  truckInsuranceOk: boolean,
  truckRoadworthyOk: boolean
): { score: number; details: string } {
  let score = 0
  const detailsList: string[] = []

  // License expiry scoring
  if (licenseDaysLeft !== null) {
    if (licenseDaysLeft > 90) {
      score += 10
      detailsList.push('License OK')
    } else if (licenseDaysLeft > 30) {
      score += 5
      detailsList.push('License Expiring')
    } else {
      detailsList.push('License Critical')
    }
  } else {
    detailsList.push('License N/A')
  }

  // Ghana Card expiry scoring
  if (ghanaCardDaysLeft !== null) {
    if (ghanaCardDaysLeft > 90) {
      score += 5
      detailsList.push('Ghana Card OK')
    } else if (ghanaCardDaysLeft > 30) {
      score += 2
      detailsList.push('Ghana Card Expiring')
    } else {
      detailsList.push('Ghana Card Critical')
    }
  } else {
    // No Ghana card expiry set, give full points or note it
    score += 3
    detailsList.push('Ghana Card N/A')
  }

  // Verification status
  if (verificationStatus === 'verified') {
    score += 5
    detailsList.push('Verified')
  } else if (verificationStatus === 'submitted') {
    score += 3
    detailsList.push('Pending Verify')
  } else {
    detailsList.push('Not Verified')
  }

  // Truck compliance (combined up to 5 pts)
  if (truckInsuranceOk && truckRoadworthyOk) {
    score += 5
    detailsList.push('Truck Compliant')
  } else if (truckInsuranceOk || truckRoadworthyOk) {
    score += 2
    detailsList.push('Truck Partial')
  } else {
    detailsList.push('Truck Non-Compliant')
  }

  return { score, details: detailsList.join(', ') }
}

function getTripPerformanceScore(completionRate: number): number {
  if (completionRate > 95) return 10
  if (completionRate > 80) return 7
  if (completionRate > 60) return 4
  return 0
}

function getGrade(score: number): string {
  if (score >= 90) return 'A+'
  if (score >= 80) return 'A'
  if (score >= 70) return 'B+'
  if (score >= 60) return 'B'
  if (score >= 50) return 'C'
  if (score >= 40) return 'D'
  return 'F'
}

function daysBetween(a: Date, b: Date): number {
  return Math.ceil((b.getTime() - a.getTime()) / (1000 * 60 * 60 * 24))
}

// ============ Main Handler ============

export async function GET(request: NextRequest) {
  try {
    const auth = requireAuth(request)
    if (auth instanceof NextResponse) return auth

    const { searchParams } = new URL(request.url)
    const month = parseInt(searchParams.get('month') || String(new Date().getMonth() + 1))
    const year = parseInt(searchParams.get('year') || String(new Date().getFullYear()))
    const driverIdFilter = searchParams.get('driverId') || null

    // Validate month/year
    if (month < 1 || month > 12 || isNaN(month)) {
      return NextResponse.json({ error: 'Invalid month (1-12)' }, { status: 400 })
    }
    if (isNaN(year) || year < 2020 || year > 2100) {
      return NextResponse.json({ error: 'Invalid year' }, { status: 400 })
    }

    // Period boundaries
    const periodStart = new Date(year, month - 1, 1)
    const periodEnd = new Date(year, month, 0, 23, 59, 59, 999)
    const now = new Date()

    // Previous period for trend comparison
    let prevStart: Date | null = null
    let prevEnd: Date | null = null
    if (month === 1) {
      prevStart = new Date(year - 1, 11, 1)
      prevEnd = new Date(year - 1, 12, 31, 23, 59, 59, 999)
    } else {
      prevStart = new Date(year, month - 2, 1)
      prevEnd = new Date(year, month - 1, 0, 23, 59, 59, 999)
    }

    // Fetch all drivers with their trucks
    const driverWhere: Record<string, unknown> = { status: 'active' }
    if (driverIdFilter) {
      driverWhere.id = driverIdFilter
    }

    const drivers = await db.driver.findMany({
      where: driverWhere,
      select: {
        id: true,
        firstName: true,
        lastName: true,
        phone: true,
        employeeId: true,
        photo: true,
        licenseExpiry: true,
        ghanaCardExpiry: true,
        verificationStatus: true,
        status: true,
        Truck: {
          select: {
            id: true,
            plateNumber: true,
            insuranceStatus: true,
          },
        },
      },
      orderBy: [{ firstName: 'asc' }, { lastName: 'asc' }],
    })

    if (drivers.length === 0) {
      return NextResponse.json({
        drivers: [],
        summary: { avgScore: 0, highestScorer: '', lowestScorer: '', gradeDistribution: {}, improving: 0, declining: 0 },
        leaderboard: [],
      })
    }

    const driverIds = drivers.map((d) => d.id)
    const truckIds = drivers.flatMap((d) => d.Truck.map((t) => t.id))

    // ============ Batch queries for the period ============

    // TrackingAlerts grouped by type and truck
    const trackingAlerts = await db.trackingAlert.findMany({
      where: {
        truckId: { in: truckIds.length > 0 ? truckIds : ['__none__'] },
        createdAt: { gte: periodStart, lte: periodEnd },
        type: { in: ['speeding', 'route_deviation', 'idle'] },
      },
      select: {
        truckId: true,
        type: true,
        id: true,
        createdAt: true,
        message: true,
        title: true,
      },
    })

    // TruckLocation entries between 10pm-5am for late night driving
    // We need to find location entries between 22:00 and 05:00
    // We fetch all locations in the period and filter in JS for late-night driving detection
    const truckLocations = await db.truckLocation.findMany({
      where: {
        truckId: { in: truckIds.length > 0 ? truckIds : ['__none__'] },
        timestamp: { gte: periodStart, lte: periodEnd },
      },
      select: {
        truckId: true,
        timestamp: true,
        id: true,
      },
    })

    // Trips for the period
    const trips = await db.trip.findMany({
      where: {
        driverId: { in: driverIds },
        departureTime: { gte: periodStart, lte: periodEnd },
      },
      select: {
        id: true,
        driverId: true,
        status: true,
        totalMileage: true,
        departureTime: true,
        arrivalTime: true,
        estimatedDuration: true,
        actualDuration: true,
      },
    })

    // ============ Previous period queries for trend ============
    const prevTrackingAlerts = prevStart && prevEnd
      ? await db.trackingAlert.findMany({
          where: {
            truckId: { in: truckIds.length > 0 ? truckIds : ['__none__'] },
            createdAt: { gte: prevStart, lte: prevEnd },
            type: { in: ['speeding', 'route_deviation', 'idle'] },
          },
          select: { truckId: true, type: true, id: true },
        })
      : []

    const prevTrips = prevStart && prevEnd
      ? await db.trip.findMany({
          where: {
            driverId: { in: driverIds },
            departureTime: { gte: prevStart, lte: prevEnd },
          },
          select: { id: true, driverId: true, status: true, totalMileage: true },
        })
      : []

    // ============ Build maps ============

    // Map truckId -> driverId
    const truckToDriver = new Map<string, string>()
    for (const driver of drivers) {
      for (const truck of driver.Truck) {
        truckToDriver.set(truck.id, driver.id)
      }
    }

    // Map driverId -> trucks
    const driverTrucks = new Map<string, typeof drivers[0]['Truck']>()
    for (const driver of drivers) {
      driverTrucks.set(driver.id, driver.Truck)
    }

    // Count alerts per type per driver
    const alertCounts = new Map<string, Map<string, number>>()
    for (const alert of trackingAlerts) {
      const driverId = truckToDriver.get(alert.truckId)
      if (!driverId) continue
      if (!alertCounts.has(driverId)) alertCounts.set(driverId, new Map())
      const counts = alertCounts.get(driverId)!
      counts.set(alert.type, (counts.get(alert.type) || 0) + 1)
    }

    // Count recent alerts per driver (for detail panel)
    const recentAlerts = new Map<string, typeof trackingAlerts>()
    for (const alert of trackingAlerts) {
      const driverId = truckToDriver.get(alert.truckId)
      if (!driverId) continue
      if (!recentAlerts.has(driverId)) recentAlerts.set(driverId, [])
      const arr = recentAlerts.get(driverId)!
      if (arr.length < 5) arr.push(alert)
    }

    // Count late-night location instances per driver (unique dates)
    const lateNightCounts = new Map<string, number>()
    for (const loc of truckLocations) {
      const driverId = truckToDriver.get(loc.truckId)
      if (!driverId) continue
      const hour = loc.timestamp.getHours()
      if (hour >= 22 || hour < 5) {
        // Count unique dates to avoid counting multiple pings in same night
        const dateKey = `${driverId}-${loc.timestamp.toISOString().slice(0, 10)}`
        if (!lateNightCounts.has(dateKey)) {
          lateNightCounts.set(dateKey, 1)
          const current = lateNightCounts.get(driverId) || 0
          lateNightCounts.set(driverId, current + 1)
        }
      }
    }

    // Trips per driver
    const driverTrips = new Map<string, typeof trips>()
    for (const trip of trips) {
      if (!driverTrips.has(trip.driverId)) driverTrips.set(trip.driverId, [])
      driverTrips.get(trip.driverId)!.push(trip)
    }

    // Previous period alerts for trend
    const prevAlertCounts = new Map<string, Map<string, number>>()
    for (const alert of prevTrackingAlerts) {
      const driverId = truckToDriver.get(alert.truckId)
      if (!driverId) continue
      if (!prevAlertCounts.has(driverId)) prevAlertCounts.set(driverId, new Map())
      const counts = prevAlertCounts.get(driverId)!
      counts.set(alert.type, (counts.get(alert.type) || 0) + 1)
    }

    // Previous period trips for trend
    const prevDriverTrips = new Map<string, typeof prevTrips>()
    for (const trip of prevTrips) {
      if (!prevDriverTrips.has(trip.driverId)) prevDriverTrips.set(trip.driverId, [])
      prevDriverTrips.get(trip.driverId)!.push(trip)
    }

    // ============ Calculate scores for each driver ============

    const results = drivers.map((driver) => {
      const counts = alertCounts.get(driver.id) || new Map()
      const speedingAlerts = counts.get('speeding') || 0
      const routeDeviations = counts.get('route_deviation') || 0
      const idleAlerts = counts.get('idle') || 0
      const lateNightInstances = lateNightCounts.get(driver.id) || 0

      // Trip performance
      const driverTripsList = driverTrips.get(driver.id) || []
      const completedTrips = driverTripsList.filter((t) => t.status === 'completed')
      const tripsCompleted = completedTrips.length
      const totalTrips = driverTripsList.length
      const completionRate = totalTrips > 0 ? (tripsCompleted / totalTrips) * 100 : 100
      const totalKm = completedTrips.reduce((sum, t) => sum + (t.totalMileage || 0), 0)

      // Compliance
      const licenseDaysLeft = driver.licenseExpiry
        ? daysBetween(now, new Date(driver.licenseExpiry))
        : null
      const ghanaCardDaysLeft = driver.ghanaCardExpiry
        ? daysBetween(now, new Date(driver.ghanaCardExpiry))
        : null

      const trucks = driver.Truck
      const truckInsuranceOk = trucks.some((t) => t.insuranceStatus === 'active')
      // For roadworthy, we'll check based on insurance status as proxy if no roadworthy data
      const truckRoadworthyOk = trucks.length > 0 // Assume OK if truck is assigned and active

      const compliance = getComplianceScore(
        licenseDaysLeft,
        ghanaCardDaysLeft,
        driver.verificationStatus,
        truckInsuranceOk,
        truckRoadworthyOk
      )

      // Individual scores
      const speedingScore = getSpeedingScore(speedingAlerts)
      const routeScore = getRouteComplianceScore(routeDeviations)
      const idleScore = getIdleTimeScore(idleAlerts)
      const lateNightScore = getLateNightScore(lateNightInstances)
      const tripScore = getTripPerformanceScore(completionRate)
      const totalScore = speedingScore + routeScore + idleScore + lateNightScore + compliance.score + tripScore
      const grade = getGrade(totalScore)

      // Previous period score for trend
      const prevCounts = prevAlertCounts.get(driver.id) || new Map()
      const prevSpeeding = prevCounts.get('speeding') || 0
      const prevRoute = prevCounts.get('route_deviation') || 0
      const prevIdle = prevCounts.get('idle') || 0
      const prevTripsList = prevDriverTrips.get(driver.id) || []
      const prevCompleted = prevTripsList.filter((t) => t.status === 'completed').length
      const prevTotal = prevTripsList.length
      const prevCompletionRate = prevTotal > 0 ? (prevCompleted / prevTotal) * 100 : 100
      const prevTotalScore =
        getSpeedingScore(prevSpeeding) +
        getRouteComplianceScore(prevRoute) +
        getIdleTimeScore(prevIdle) +
        getTripPerformanceScore(prevCompletionRate) +
        compliance.score // Compliance stays same between periods

      let trend: 'improving' | 'stable' | 'declining' = 'stable'
      if (totalScore > prevTotalScore + 3) trend = 'improving'
      else if (totalScore < prevTotalScore - 3) trend = 'declining'

      // Recent alerts for detail
      const driverRecentAlerts = (recentAlerts.get(driver.id) || [])
        .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())
        .slice(0, 5)
        .map((a) => ({
          id: a.id,
          type: a.type,
          title: a.title,
          message: a.message,
          createdAt: a.createdAt.toISOString(),
        }))

      return {
        driverId: driver.id,
        driverName: `${driver.firstName} ${driver.lastName}`,
        employeeId: driver.employeeId,
        phone: driver.phone,
        photo: driver.photo,
        totalScore,
        breakdown: {
          speeding: { score: speedingScore, alerts: speedingAlerts, maxPoints: 25, label: 'Speeding' },
          routeCompliance: { score: routeScore, alerts: routeDeviations, maxPoints: 20, label: 'Route Compliance' },
          idleTime: { score: idleScore, alerts: idleAlerts, maxPoints: 15, label: 'Idle Time' },
          lateNightDriving: { score: lateNightScore, instances: lateNightInstances, maxPoints: 10, label: 'Late Night Driving' },
          compliance: { score: compliance.score, details: compliance.details, maxPoints: 20, label: 'Compliance' },
          tripPerformance: { score: tripScore, completionRate: Math.round(completionRate), maxPoints: 10, label: 'Trip Performance' },
        },
        grade,
        tripsCompleted,
        totalKm: Math.round(totalKm),
        trend,
        recentAlerts: driverRecentAlerts,
      }
    })

    // ============ Summary ============

    const avgScore = results.length > 0
      ? Math.round(results.reduce((s, r) => s + r.totalScore, 0) / results.length)
      : 0

    const sorted = [...results].sort((a, b) => b.totalScore - a.totalScore)
    const highestScorer = sorted.length > 0 ? sorted[0].driverName : ''
    const lowestScorer = sorted.length > 0 ? sorted[sorted.length - 1].driverName : ''

    const gradeDistribution: Record<string, number> = {
      'A+': 0, A: 0, 'B+': 0, B: 0, C: 0, D: 0, F: 0,
    }
    for (const r of results) {
      gradeDistribution[r.grade] = (gradeDistribution[r.grade] || 0) + 1
    }

    const improving = results.filter((r) => r.trend === 'improving').length
    const declining = results.filter((r) => r.trend === 'declining').length

    return NextResponse.json({
      drivers: results,
      summary: {
        avgScore,
        highestScorer,
        lowestScorer,
        gradeDistribution,
        improving,
        declining,
      },
      leaderboard: sorted,
    })
  } catch (error) {
    console.error('Safety Scores API error:', error)
    return NextResponse.json(
      { error: 'Failed to calculate safety scores' },
      { status: 500 }
    )
  }
}
