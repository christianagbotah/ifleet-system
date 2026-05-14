import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { requireAuth } from '@/lib/auth-server'

export async function GET(request: NextRequest) {
  try {
    const auth = requireAuth(request)
    if (auth instanceof NextResponse) return auth

    // Fetch all fuel logs for the last 60 days, ordered by date
    const sixtyDaysAgo = new Date()
    sixtyDaysAgo.setDate(sixtyDaysAgo.getDate() - 60)

    const fuelLogs = await db.fuelLog.findMany({
      where: { date: { gte: sixtyDaysAgo } },
      include: {
        truck: { select: { id: true, plateNumber: true, make: true, model: true, tankCapacity: true } },
      },
      orderBy: [{ truckId: 'asc' }, { date: 'asc' }],
    })

    // Group by truck
    const truckMap = new Map<string, typeof fuelLogs>()
    for (const log of fuelLogs) {
      const key = log.truckId
      if (!key) continue
      if (!truckMap.has(key)) truckMap.set(key, [])
      truckMap.get(key)!.push(log)
    }

    const flaggedTrucks: {
      truckId: string
      plateNumber: string
      make: string
      model: string
      anomalyCount: number
      riskLevel: 'low' | 'medium' | 'high'
      anomalies: {
        type: 'excessive_consumption' | 'unexpected_drop' | 'rapid_refuel' | 'odometer_rollback'
        fuelLogId: string
        date: string
        description: string
        severity: 'warning' | 'critical'
        details: Record<string, number | string>
      }[]
    }[] = []

    for (const [truckId, logs] of truckMap) {
      if (logs.length < 2) continue // Need at least 2 logs for comparison

      const anomalies: typeof flaggedTrucks[0]['anomalies'] = []
      const truckInfo = logs[0].truck

      // 1. Compute avg km/L for this truck using consecutive odometer readings
      const efficiencies: number[] = []
      for (let i = 1; i < logs.length; i++) {
        const prev = logs[i - 1]
        const curr = logs[i]
        if (prev.odometer && curr.odometer && curr.litersFilled > 0) {
          const distance = curr.odometer - prev.odometer
          if (distance > 0) {
            efficiencies.push(distance / curr.litersFilled)
          }
        }
      }

      const avgEfficiency = efficiencies.length > 0
        ? efficiencies.reduce((a, b) => a + b, 0) / efficiencies.length
        : 0

      // 2. Check each log for anomalies
      for (let i = 1; i < logs.length; i++) {
        const prev = logs[i - 1]
        const curr = logs[i]

        // A. Odometer rollback
        if (prev.odometer && curr.odometer && curr.odometer < prev.odometer) {
          anomalies.push({
            type: 'odometer_rollback',
            fuelLogId: curr.id,
            date: curr.date.toISOString(),
            description: `Odometer decreased from ${prev.odometer} km to ${curr.odometer} km`,
            severity: 'critical',
            details: {
              previousOdometer: prev.odometer,
              currentOdometer: curr.odometer,
              difference: curr.odometer - prev.odometer,
            },
          })
        }

        // B. Excessive consumption (km/L below 50% of average)
        if (prev.odometer && curr.odometer && curr.litersFilled > 0 && avgEfficiency > 0) {
          const distance = curr.odometer - prev.odometer
          if (distance > 0) {
            const currentEfficiency = distance / curr.litersFilled
            if (currentEfficiency < avgEfficiency * 0.5) {
              anomalies.push({
                type: 'excessive_consumption',
                fuelLogId: curr.id,
                date: curr.date.toISOString(),
                description: `Fuel efficiency ${currentEfficiency.toFixed(1)} km/L is below 50% of truck average ${avgEfficiency.toFixed(1)} km/L`,
                severity: currentEfficiency < avgEfficiency * 0.3 ? 'critical' : 'warning',
                details: {
                  currentKmPerLiter: Number(currentEfficiency.toFixed(2)),
                  avgKmPerLiter: Number(avgEfficiency.toFixed(2)),
                  threshold: Number((avgEfficiency * 0.5).toFixed(2)),
                  distance: distance,
                  liters: curr.litersFilled,
                },
              })
            }
          }
        }

        // C. Rapid refueling (multiple fills within 24 hours exceeding tank capacity)
        const hoursDiff = (curr.date.getTime() - prev.date.getTime()) / (1000 * 60 * 60)
        if (hoursDiff < 24 && hoursDiff > 0) {
          const combinedLiters = (prev.litersFilled || 0) + (curr.litersFilled || 0)
          const tankCapacity = truckInfo?.tankCapacity
          if (tankCapacity && combinedLiters > tankCapacity) {
            anomalies.push({
              type: 'rapid_refuel',
              fuelLogId: curr.id,
              date: curr.date.toISOString(),
              description: `Combined ${combinedLiters.toFixed(0)}L filled within ${hoursDiff.toFixed(1)}h exceeds tank capacity of ${tankCapacity}L`,
              severity: 'warning',
              details: {
                combinedLiters: Number(combinedLiters.toFixed(1)),
                tankCapacity,
                hoursBetween: Number(hoursDiff.toFixed(1)),
              },
            })
          }
        }

        // D. Unexpected fuel level drop
        if (
          prev.fuelLevelAfter !== null && prev.fuelLevelAfter !== undefined &&
          curr.fuelLevelBefore !== null && curr.fuelLevelBefore !== undefined &&
          prev.odometer && curr.odometer && avgEfficiency > 0
        ) {
          const distance = curr.odometer - prev.odometer
          if (distance > 0) {
            const expectedDropPercent = (distance / avgEfficiency / (truckInfo?.tankCapacity || 200)) * 100
            const actualDropPercent = (prev.fuelLevelAfter || 0) - (curr.fuelLevelBefore || 0)
            // If actual drop is 2x more than expected (accounting for margin)
            if (actualDropPercent > expectedDropPercent * 2 && actualDropPercent > 20) {
              anomalies.push({
                type: 'unexpected_drop',
                fuelLogId: curr.id,
                date: curr.date.toISOString(),
                description: `Fuel level dropped ${actualDropPercent.toFixed(0)}%, expected ~${expectedDropPercent.toFixed(0)}% for ${distance} km`,
                severity: actualDropPercent > expectedDropPercent * 3 ? 'critical' : 'warning',
                details: {
                  actualDrop: Number(actualDropPercent.toFixed(1)),
                  expectedDrop: Number(expectedDropPercent.toFixed(1)),
                  distance,
                  tankCapacity: truckInfo?.tankCapacity || 0,
                },
              })
            }
          }
        }
      }

      if (anomalies.length > 0) {
        const criticalCount = anomalies.filter(a => a.severity === 'critical').length
        const riskLevel = criticalCount >= 2 ? 'high' : criticalCount >= 1 ? 'medium' : anomalies.length >= 3 ? 'medium' : 'low'

        flaggedTrucks.push({
          truckId,
          plateNumber: truckInfo?.plateNumber || 'Unknown',
          make: truckInfo?.make || '',
          model: truckInfo?.model || '',
          anomalyCount: anomalies.length,
          riskLevel,
          anomalies: anomalies.sort((a, b) => {
            const sevOrder = { critical: 0, warning: 1 }
            return sevOrder[a.severity] - sevOrder[b.severity]
          }),
        })
      }
    }

    // Sort by risk level and anomaly count
    const riskOrder = { high: 0, medium: 1, low: 2 }
    flaggedTrucks.sort((a, b) => {
      if (riskOrder[a.riskLevel] !== riskOrder[b.riskLevel]) return riskOrder[a.riskLevel] - riskOrder[b.riskLevel]
      return b.anomalyCount - a.anomalyCount
    })

    return NextResponse.json({
      flaggedTrucks,
      summary: {
        totalTrucks: truckMap.size,
        trucksAnalyzed: fuelLogs.length > 0 ? truckMap.size : 0,
        trucksFlagged: flaggedTrucks.length,
        highRiskCount: flaggedTrucks.filter(t => t.riskLevel === 'high').length,
        mediumRiskCount: flaggedTrucks.filter(t => t.riskLevel === 'medium').length,
      },
    })
  } catch (error) {
    console.error('Fuel anomaly detection error:', error)
    return NextResponse.json({ error: 'Failed to analyze fuel anomalies' }, { status: 500 })
  }
}
