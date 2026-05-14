import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { requireAuth } from '@/lib/auth-server'

// ============ Types ============

interface AnomalyItem {
  id: string
  type: 'consumption_anomaly' | 'fill_without_travel' | 'overfilling' | 'cost_anomaly' | 'frequency_anomaly' | 'station_pattern'
  severity: 'low' | 'medium' | 'high'
  truckId: string
  plateNumber: string
  driverName: string
  description: string
  fuelLogId: string
  details: Record<string, unknown>
  estimatedLoss: number
  detectedAt: string
}

interface ByTruckItem {
  truckId: string
  plateNumber: string
  anomalyCount: number
  totalEstimatedLoss: number
  avgConsumption: number
  fleetAvgConsumption: number
  deviation: number
  riskLevel: 'low' | 'medium' | 'high'
}

// ============ Helpers ============

function getDateRange(period: string): { start: Date; end: Date } {
  const now = new Date()
  const end = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59, 999)
  let start: Date

  switch (period) {
    case 'this_month':
      start = new Date(now.getFullYear(), now.getMonth(), 1)
      break
    case 'last_month': {
      const m = now.getMonth() - 1
      start = new Date(now.getFullYear(), m, 1)
      break
    }
    case 'last_3_months': {
      const m3 = now.getMonth() - 2
      start = new Date(now.getFullYear(), m3, 1)
      break
    }
    case 'this_year':
      start = new Date(now.getFullYear(), 0, 1)
      break
    default:
      start = new Date(now.getFullYear(), now.getMonth() - 2, 1)
  }

  return { start, end }
}

function generateId(): string {
  return `ano_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`
}

// ============ Route Handler ============

export async function GET(request: NextRequest) {
  try {
    const auth = requireAuth(request)
    if (auth instanceof NextResponse) return auth

    const { searchParams } = new URL(request.url)
    const truckId = searchParams.get('truckId') || undefined
    const period = searchParams.get('period') || 'this_year'
    const severity = searchParams.get('severity') || 'all'

    const { start, end } = getDateRange(period)

    // ========== Fetch Data ==========

    const fuelLogs = await db.fuelLog.findMany({
      where: {
        date: { gte: start, lte: end },
        ...(truckId ? { truckId } : {}),
      },
      include: {
        trip: {
          select: {
            id: true,
            tripNumber: true,
            loadingLocation: true,
            destination: true,
            startMileage: true,
            endMileage: true,
            totalMileage: true,
            status: true,
            departureTime: true,
          },
        },
        truck: {
          select: {
            id: true,
            plateNumber: true,
            tankCapacity: true,
            make: true,
            model: true,
            driver: {
              select: { id: true, firstName: true, lastName: true },
            },
          },
        },
      },
      orderBy: { date: 'desc' },
    })

    // Fetch all active trips in the period for fill-without-travel detection
    const activeTrips = await db.trip.findMany({
      where: {
        departureTime: { lte: end },
        status: { notIn: ['cancelled'] },
      },
      select: {
        id: true,
        truckId: true,
        departureTime: true,
        status: true,
      },
    })

    // Group active trips by truck for quick lookup
    const tripsByTruck = new Map<string, typeof activeTrips>()
    for (const trip of activeTrips) {
      const existing = tripsByTruck.get(trip.truckId) || []
      existing.push(trip)
      tripsByTruck.set(trip.truckId, existing)
    }

    // ========== Compute Fleet Average Consumption ==========

    // Calculate L/100km for each fuel log with trip data
    const consumptionData: { truckId: string; route: string; litersPer100km: number }[] = []

    for (const log of fuelLogs) {
      const trip = log.trip
      if (!trip) continue
      const mileage = trip.totalMileage || ((trip.endMileage || 0) - (trip.startMileage || 0))
      if (mileage <= 0 || log.litersFilled <= 0) continue

      const route = `${trip.loadingLocation} → ${trip.destination}`
      const litersPer100km = (log.litersFilled / mileage) * 100

      // Clamp unrealistic values (likely data errors)
      if (litersPer100km > 0 && litersPer100km < 200) {
        consumptionData.push({ truckId: log.truckId, route, litersPer100km })
      }
    }

    // Fleet-wide average L/100km
    const fleetAvgConsumption = consumptionData.length > 0
      ? consumptionData.reduce((sum, d) => sum + d.litersPer100km, 0) / consumptionData.length
      : 32.5 // Default fallback

    // Average cost per liter in the period
    const costPerLiterValues = fuelLogs
      .map(l => l.costPerLiter)
      .filter((v): v is number => v !== null && v > 0)
    const avgCostPerLiter = costPerLiterValues.length > 0
      ? costPerLiterValues.reduce((a, b) => a + b, 0) / costPerLiterValues.length
      : 0

    // ========== Detect Anomalies ==========

    const anomalies: AnomalyItem[] = []
    const SEVERITY_ORDER: Record<string, number> = { high: 0, medium: 1, low: 2 }

    // --- 1. Consumption Anomalies ---
    for (const log of fuelLogs) {
      const trip = log.trip
      if (!trip) continue

      const mileage = trip.totalMileage || ((trip.endMileage || 0) - (trip.startMileage || 0))
      if (mileage <= 0 || log.litersFilled <= 0) continue

      const actualConsumption = (log.litersFilled / mileage) * 100
      if (actualConsumption <= 0 || actualConsumption >= 200) continue

      const deviation = ((actualConsumption - fleetAvgConsumption) / fleetAvgConsumption) * 100

      let sev: 'low' | 'medium' | 'high' | null = null
      if (deviation >= 50) sev = 'high'
      else if (deviation >= 30) sev = 'medium'
      else if (deviation >= 10) sev = 'low'

      if (sev) {
        const route = `${trip.loadingLocation} → ${trip.destination}`
        const estimatedLoss = Math.max(0, (actualConsumption - fleetAvgConsumption) / 100 * mileage * (log.costPerLiter || avgCostPerLiter || 15))

        anomalies.push({
          id: generateId(),
          type: 'consumption_anomaly',
          severity: sev,
          truckId: log.truckId,
          plateNumber: log.truck.plateNumber,
          driverName: log.truck.driver ? `${log.truck.driver.firstName} ${log.truck.driver.lastName}` : 'Unassigned',
          description: `Fuel consumption ${actualConsumption.toFixed(1)}L/100km is ${Math.abs(deviation).toFixed(0)}% ${deviation > 0 ? 'above' : 'below'} fleet average for ${route}`,
          fuelLogId: log.id,
          details: {
            actualConsumption: Number(actualConsumption.toFixed(1)),
            expectedConsumption: Number(fleetAvgConsumption.toFixed(1)),
            deviation: Number(deviation.toFixed(1)),
            tripId: trip.id,
            route,
            date: log.date.toISOString().split('T')[0],
          },
          estimatedLoss: Math.round(estimatedLoss),
          detectedAt: log.date.toISOString(),
        })
      }
    }

    // --- 2. Fill Without Travel ---
    // Group fuel logs by truck and day
    const logsByTruckDay = new Map<string, typeof fuelLogs>()
    for (const log of fuelLogs) {
      const dayKey = `${log.truckId}_${log.date.toISOString().split('T')[0]}`
      const existing = logsByTruckDay.get(dayKey) || []
      existing.push(log)
      logsByTruckDay.set(dayKey, existing)
    }

    for (const [dayKey, dayLogs] of logsByTruckDay) {
      const [tid] = dayKey.split('_')
      const truckTrips = tripsByTruck.get(tid) || []

      for (const log of dayLogs) {
        if (log.litersFilled <= 20) continue

        // Check if any trip was active within ±2 hours of this fuel log
        const fuelTime = log.date.getTime()
        const twoHours = 2 * 60 * 60 * 1000

        const hasActiveTrip = truckTrips.some(trip => {
          const depTime = new Date(trip.departureTime).getTime()
          // Trip is "active" if departure is within ±2h of fuel time
          return Math.abs(fuelTime - depTime) <= twoHours && trip.status !== 'cancelled'
        })

        // Also check if fuel log has a linked trip
        if (log.tripId || hasActiveTrip) continue

        const estimatedLoss = log.litersFilled * (log.costPerLiter || avgCostPerLiter || 15) * 0.8 // Assume 80% suspicious

        anomalies.push({
          id: generateId(),
          type: 'fill_without_travel',
          severity: 'medium',
          truckId: log.truckId,
          plateNumber: log.truck.plateNumber,
          driverName: log.truck.driver ? `${log.truck.driver.firstName} ${log.truck.driver.lastName}` : 'Unassigned',
          description: `${log.litersFilled.toFixed(0)}L fill without active trip on ${log.date.toISOString().split('T')[0]}`,
          fuelLogId: log.id,
          details: {
            litersFilled: log.litersFilled,
            totalCost: log.totalCost,
            station: log.stationName || 'Unknown',
            date: log.date.toISOString().split('T')[0],
          },
          estimatedLoss: Math.round(estimatedLoss),
          detectedAt: log.date.toISOString(),
        })
      }
    }

    // --- 3. Overfilling ---
    for (const log of fuelLogs) {
      const tankCapacity = log.truck.tankCapacity
      if (!tankCapacity || log.litersFilled <= tankCapacity) continue

      const overfill = log.litersFilled - tankCapacity
      const estimatedLoss = overfill * (log.costPerLiter || avgCostPerLiter || 15)

      anomalies.push({
        id: generateId(),
        type: 'overfilling',
        severity: 'high',
        truckId: log.truckId,
        plateNumber: log.truck.plateNumber,
        driverName: log.truck.driver ? `${log.truck.driver.firstName} ${log.truck.driver.lastName}` : 'Unassigned',
        description: `Filled ${log.litersFilled.toFixed(0)}L exceeds tank capacity of ${tankCapacity}L by ${overfill.toFixed(0)}L`,
        fuelLogId: log.id,
        details: {
          litersFilled: log.litersFilled,
          tankCapacity,
          overfill: Number(overfill.toFixed(1)),
          station: log.stationName || 'Unknown',
          date: log.date.toISOString().split('T')[0],
        },
        estimatedLoss: Math.round(estimatedLoss),
        detectedAt: log.date.toISOString(),
      })
    }

    // --- 4. Cost Anomalies ---
    if (avgCostPerLiter > 0) {
      for (const log of fuelLogs) {
        if (!log.costPerLiter || log.costPerLiter <= 0) continue

        const costDeviation = Math.abs(log.costPerLiter - avgCostPerLiter) / avgCostPerLiter
        if (costDeviation <= 0.3) continue

        anomalies.push({
          id: generateId(),
          type: 'cost_anomaly',
          severity: 'medium',
          truckId: log.truckId,
          plateNumber: log.truck.plateNumber,
          driverName: log.truck.driver ? `${log.truck.driver.firstName} ${log.truck.driver.lastName}` : 'Unassigned',
          description: `Cost per liter ₵${log.costPerLiter.toFixed(2)} is ${(costDeviation * 100).toFixed(0)}% different from period average ₵${avgCostPerLiter.toFixed(2)}`,
          fuelLogId: log.id,
          details: {
            costPerLiter: log.costPerLiter,
            avgCostPerLiter: Number(avgCostPerLiter.toFixed(2)),
            deviation: Number((costDeviation * 100).toFixed(1)),
            station: log.stationName || 'Unknown',
            date: log.date.toISOString().split('T')[0],
          },
          estimatedLoss: Math.round(Math.abs(log.costPerLiter - avgCostPerLiter) * log.litersFilled),
          detectedAt: log.date.toISOString(),
        })
      }
    }

    // --- 5. Frequency Anomalies (more than 3 fills in a day) ---
    for (const [dayKey, dayLogs] of logsByTruckDay) {
      if (dayLogs.length <= 3) continue

      const firstLog = dayLogs[0]
      anomalies.push({
        id: generateId(),
        type: 'frequency_anomaly',
        severity: 'medium',
        truckId: firstLog.truckId,
        plateNumber: firstLog.truck.plateNumber,
        driverName: firstLog.truck.driver ? `${firstLog.truck.driver.firstName} ${firstLog.truck.driver.lastName}` : 'Unassigned',
        description: `${dayLogs.length} fuel fills in a single day on ${firstLog.date.toISOString().split('T')[0]}`,
        fuelLogId: firstLog.id,
        details: {
          fillCount: dayLogs.length,
          totalLiters: dayLogs.reduce((s, l) => s + l.litersFilled, 0),
          totalCost: dayLogs.reduce((s, l) => s + l.totalCost, 0),
          date: firstLog.date.toISOString().split('T')[0],
        },
        estimatedLoss: Math.round(dayLogs.reduce((s, l) => s + l.totalCost, 0) * 0.2),
        detectedAt: firstLog.date.toISOString(),
      })
    }

    // --- 6. Station Patterns ---
    // Count fills by station
    const stationCounts = new Map<string, { count: number; truckIds: Set<string>; liters: number }>()
    for (const log of fuelLogs) {
      if (!log.stationName) continue
      const existing = stationCounts.get(log.stationName) || { count: 0, truckIds: new Set(), liters: 0 }
      existing.count++
      existing.truckIds.add(log.truckId)
      existing.liters += log.litersFilled
      stationCounts.set(log.stationName, existing)
    }

    // Flag stations used only once (unusual pattern)
    for (const [station, data] of stationCounts) {
      if (data.count === 1 && data.liters > 50) {
        const log = fuelLogs.find(l => l.stationName === station)
        if (log) {
          anomalies.push({
            id: generateId(),
            type: 'station_pattern',
            severity: 'low',
            truckId: log.truckId,
            plateNumber: log.truck.plateNumber,
            driverName: log.truck.driver ? `${log.truck.driver.firstName} ${log.truck.driver.lastName}` : 'Unassigned',
            description: `One-time use of unusual station "${station}" with ${log.litersFilled.toFixed(0)}L fill`,
            fuelLogId: log.id,
            details: {
              station,
              litersFilled: log.litersFilled,
              date: log.date.toISOString().split('T')[0],
            },
            estimatedLoss: 0,
            detectedAt: log.date.toISOString(),
          })
        }
      }
    }

    // ========== Sort and Filter Anomalies ==========

    // Sort by severity (HIGH first), then by date (most recent)
    anomalies.sort((a, b) => {
      const sevDiff = SEVERITY_ORDER[a.severity] - SEVERITY_ORDER[b.severity]
      if (sevDiff !== 0) return sevDiff
      return new Date(b.detectedAt).getTime() - new Date(a.detectedAt).getTime()
    })

    // Filter by severity if requested
    const filteredAnomalies = severity === 'all'
      ? anomalies
      : anomalies.filter(a => a.severity === severity)

    // ========== Build Summary ==========

    const highCount = anomalies.filter(a => a.severity === 'high').length
    const mediumCount = anomalies.filter(a => a.severity === 'medium').length
    const lowCount = anomalies.filter(a => a.severity === 'low').length
    const totalEstimatedLoss = anomalies.reduce((sum, a) => sum + a.estimatedLoss, 0)
    const flaggedTruckIds = new Set(anomalies.map(a => a.truckId))

    const summary = {
      totalAnomalies: anomalies.length,
      highSeverity: highCount,
      mediumSeverity: mediumCount,
      lowSeverity: lowCount,
      estimatedLoss: Math.round(totalEstimatedLoss),
      trucksFlagged: flaggedTruckIds.size,
      fleetAvgConsumption: Number(fleetAvgConsumption.toFixed(1)),
    }

    // ========== Build ByTruck ==========

    const truckAnomalyMap = new Map<string, { count: number; loss: number; consumptions: number[] }>()
    for (const a of anomalies) {
      const existing = truckAnomalyMap.get(a.truckId) || { count: 0, loss: 0, consumptions: [] }
      existing.count++
      existing.loss += a.estimatedLoss
      if (a.details.actualConsumption) {
        existing.consumptions.push(a.details.actualConsumption as number)
      }
      truckAnomalyMap.set(a.truckId, existing)
    }

    const byTruck: ByTruckItem[] = []

    for (const [tid, data] of truckAnomalyMap) {
      const log = fuelLogs.find(l => l.truckId === tid)
      if (!log) continue

      const avgConsumption = data.consumptions.length > 0
        ? data.consumptions.reduce((a, b) => a + b, 0) / data.consumptions.length
        : fleetAvgConsumption

      const deviation = fleetAvgConsumption > 0
        ? ((avgConsumption - fleetAvgConsumption) / fleetAvgConsumption) * 100
        : 0

      let riskLevel: 'low' | 'medium' | 'high' = 'low'
      if (data.count >= 5 || data.loss >= 2000) riskLevel = 'high'
      else if (data.count >= 3 || data.loss >= 500) riskLevel = 'medium'

      byTruck.push({
        truckId: tid,
        plateNumber: log.truck.plateNumber,
        anomalyCount: data.count,
        totalEstimatedLoss: Math.round(data.loss),
        avgConsumption: Number(avgConsumption.toFixed(1)),
        fleetAvgConsumption: Number(fleetAvgConsumption.toFixed(1)),
        deviation: Number(Math.abs(deviation).toFixed(1)),
        riskLevel,
      })
    }

    byTruck.sort((a, b) => b.totalEstimatedLoss - a.totalEstimatedLoss)

    // ========== Consumption Trends ==========

    const consumptionTrends: { month: string; avgConsumption: number; expectedConsumption: number }[] = []
    const now = new Date()

    // Determine how many months to show based on period
    const monthsToShow = period === 'this_month' || period === 'last_month' ? 3
      : period === 'last_3_months' ? 6
      : 12

    for (let i = monthsToShow - 1; i >= 0; i--) {
      const mDate = new Date(now.getFullYear(), now.getMonth() - i, 1)
      const mEnd = new Date(now.getFullYear(), now.getMonth() - i + 1, 0, 23, 59, 59, 999)
      const mStart = new Date(mDate.getFullYear(), mDate.getMonth(), 1)

      const monthLogs = fuelLogs.filter(l => l.date >= mStart && l.date <= mEnd)

      const monthConsumptions: number[] = []
      for (const log of monthLogs) {
        const trip = log.trip
        if (!trip) continue
        const mileage = trip.totalMileage || ((trip.endMileage || 0) - (trip.startMileage || 0))
        if (mileage <= 0 || log.litersFilled <= 0) continue
        const lp100 = (log.litersFilled / mileage) * 100
        if (lp100 > 0 && lp100 < 200) monthConsumptions.push(lp100)
      }

      const avgC = monthConsumptions.length > 0
        ? monthConsumptions.reduce((a, b) => a + b, 0) / monthConsumptions.length
        : fleetAvgConsumption

      consumptionTrends.push({
        month: mDate.toLocaleString('en-US', { month: 'short' }),
        avgConsumption: Number(avgC.toFixed(1)),
        expectedConsumption: Number(fleetAvgConsumption.toFixed(1)),
      })
    }

    // ========== Investigation Recommendations ==========

    const recommendations: string[] = []

    // Find high-anomaly trucks
    for (const truck of byTruck) {
      if (truck.anomalyCount >= 5) {
        const months = period === 'this_year' ? 'this year' : period === 'last_3_months' ? '3 months' : 'this period'
        recommendations.push(`Truck ${truck.plateNumber} has ${truck.anomalyCount} anomalies in ${months} — recommend audit`)
      }
    }

    // Find drivers with fill-without-travel
    const fillWithoutTravelByDriver = new Map<string, number>()
    for (const a of anomalies) {
      if (a.type === 'fill_without_travel') {
        fillWithoutTravelByDriver.set(a.driverName, (fillWithoutTravelByDriver.get(a.driverName) || 0) + 1)
      }
    }
    for (const [driver, count] of fillWithoutTravelByDriver) {
      if (count >= 2) {
        recommendations.push(`Driver ${driver} flagged for ${count} fill-without-travel incidents`)
      }
    }

    // Fleet consumption trend
    if (consumptionTrends.length >= 2) {
      const latest = consumptionTrends[consumptionTrends.length - 1]
      const earliest = consumptionTrends[0]
      if (earliest.avgConsumption > 0) {
        const trendPct = ((latest.avgConsumption - earliest.avgConsumption) / earliest.avgConsumption) * 100
        if (Math.abs(trendPct) >= 5) {
          const direction = trendPct > 0 ? 'up' : 'down'
          recommendations.push(`Fleet consumption ${direction} ${Math.abs(trendPct).toFixed(0)}% across the period — investigate common factor`)
        }
      }
    }

    // Total estimated loss warning
    if (totalEstimatedLoss >= 5000) {
      recommendations.push(`Estimated fuel loss of ₵${totalEstimatedLoss.toLocaleString()} detected — immediate investigation recommended`)
    }

    return NextResponse.json({
      summary,
      anomalies: filteredAnomalies,
      byTruck,
      consumptionTrends,
      recommendations,
    })
  } catch (error) {
    console.error('Anomaly Dashboard API error:', error)
    return NextResponse.json(
      { error: 'Failed to load anomaly dashboard data' },
      { status: 500 }
    )
  }
}
