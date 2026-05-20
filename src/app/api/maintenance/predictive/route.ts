import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { requireAuth } from '@/lib/auth-server'

// Default maintenance intervals for component-specific predictions
const MAINTENANCE_INTERVALS = {
  oil_change: { kmInterval: 5000, dayInterval: 90, avgCost: 350, label: 'Oil Change' },
  brake_service: { kmInterval: 20000, dayInterval: 180, avgCost: 800, label: 'Brake Service' },
  tire_rotation: { kmInterval: 15000, dayInterval: 120, avgCost: 600, label: 'Tire Rotation' },
  general_service: { kmInterval: 10000, dayInterval: 90, avgCost: 500, label: 'General Service' },
} as const

type ComponentType = keyof typeof MAINTENANCE_INTERVALS

// Map maintenance record types to our component categories
function mapRecordTypeToComponent(type: string, title: string): ComponentType | null {
  const lowerTitle = title.toLowerCase()
  const lowerType = type.toLowerCase()

  if (
    lowerTitle.includes('oil') ||
    lowerTitle.includes('lubricant') ||
    lowerTitle.includes('filter') ||
    lowerType === 'oil_change'
  ) return 'oil_change'

  if (
    lowerTitle.includes('brake') ||
    lowerTitle.includes('pad') ||
    lowerTitle.includes('rotor') ||
    lowerType === 'brake_service'
  ) return 'brake_service'

  if (
    lowerTitle.includes('tire') ||
    lowerTitle.includes('tyre') ||
    lowerTitle.includes('wheel') ||
    lowerTitle.includes('rotation') ||
    lowerType === 'tire_rotation'
  ) return 'tire_rotation'

  return 'general_service'
}

// Confidence levels based on data availability
function getConfidence(totalServices: number, avgIntervalDays: number | null): 'high' | 'medium' | 'low' {
  if (totalServices >= 4 && avgIntervalDays !== null) return 'high'
  if (totalServices >= 2) return 'medium'
  return 'low'
}

// Risk level based on how close the predicted date is
function getRiskLevel(predictedDate: Date): 'critical' | 'warning' | 'info' {
  const now = new Date()
  const diffMs = predictedDate.getTime() - now.getTime()
  const diffDays = diffMs / (1000 * 60 * 60 * 24)

  if (diffDays <= 0) return 'critical'   // Overdue
  if (diffDays <= 14) return 'critical'  // Within 2 weeks
  if (diffDays <= 30) return 'warning'   // Within a month
  return 'info'
}

export async function GET(request: NextRequest) {
  try {
    const auth = requireAuth(request)
    if (auth instanceof NextResponse) return auth

    // Fetch all trucks with their maintenance records and total trip mileage
    const trucks = await db.truck.findMany({
      where: { status: { in: ['active', 'maintenance'] } },
      include: {
        maintenance: {
          where: { status: 'completed' },
          orderBy: { performedAt: 'desc' },
          select: {
            id: true,
            type: true,
            title: true,
            performedAt: true,
            odometer: true,
            cost: true,
            nextDueDate: true,
            nextDueMileage: true,
          },
        },
        trips: {
          where: { status: 'completed' },
          select: {
            totalMileage: true,
            endMileage: true,
          },
        },
      },
    })

    const predictions: Array<{
      truckId: string
      truckPlate: string
      predictedServiceDate: string
      confidence: 'high' | 'medium' | 'low'
      component: string
      estimatedCost: number
      lastServiceDate: string
      avgIntervalDays: number
      totalServices: number
      riskLevel: 'critical' | 'warning' | 'info'
    }> = []

    for (const truck of trucks) {
      const currentMileage = truck.currentMileage || 0

      // Calculate total trip mileage (sum of all trip totalMileage or endMileage)
      const totalTripMileage = truck.trips.reduce((sum, trip) => {
        return sum + (trip.totalMileage || trip.endMileage || 0)
      }, 0)

      // For each component type, generate a prediction
      for (const [componentKey, interval] of Object.entries(MAINTENANCE_INTERVALS)) {
        const component = componentKey as ComponentType

        // Filter maintenance records relevant to this component
        const componentRecords = truck.maintenance.filter((r) => {
          return mapRecordTypeToComponent(r.type, r.title) === component
        })

        // Also include any records whose nextDueDate/nextDueMileage falls in this component's range
        const relatedRecords = truck.maintenance.filter((r) => {
          // If a general service was done, it might cover oil change too
          if (component !== 'general_service') {
            return mapRecordTypeToComponent(r.type, r.title) === component
          }
          return true
        })

        // Skip if no records at all and truck has no mileage context
        if (componentRecords.length === 0 && relatedRecords.length === 0 && currentMileage === 0) {
          continue
        }

        // Calculate average interval between services for this component
        let avgIntervalDays: number | null = null
        let lastServiceDate: Date | null = null
        let lastServiceOdometer: number | null = null
        let avgCost = interval.avgCost

        if (componentRecords.length >= 2) {
          const sorted = [...componentRecords].sort(
            (a, b) => new Date(a.performedAt).getTime() - new Date(b.performedAt).getTime()
          )
          const intervals: number[] = []
          for (let i = 1; i < sorted.length; i++) {
            const diffMs = new Date(sorted[i].performedAt).getTime() - new Date(sorted[i - 1].performedAt).getTime()
            intervals.push(diffMs / (1000 * 60 * 60 * 24))
          }
          avgIntervalDays = Math.round(intervals.reduce((a, b) => a + b, 0) / intervals.length)
        }

        // Use the most recent record for this component (or any related record)
        const mostRecent = componentRecords.length > 0
          ? componentRecords[0] // Already sorted desc by performedAt
          : relatedRecords.length > 0
            ? relatedRecords[0]
            : null

        if (mostRecent) {
          lastServiceDate = new Date(mostRecent.performedAt)
          lastServiceOdometer = mostRecent.odometer
        }

        // Calculate cost from historical records
        if (componentRecords.length > 0) {
          const costs = componentRecords
            .map((r) => r.cost)
            .filter((c): c is number => c !== null)
          if (costs.length > 0) {
            avgCost = Math.round(costs.reduce((a, b) => a + b, 0) / costs.length)
          }
        }

        // Predict next service date
        let predictedDate: Date

        // Method 1: If we have average interval from history
        if (avgIntervalDays !== null && lastServiceDate) {
          predictedDate = new Date(lastServiceDate.getTime() + avgIntervalDays * 24 * 60 * 60 * 1000)
        }
        // Method 2: Use nextDueDate from last record
        else if (mostRecent?.nextDueDate) {
          predictedDate = new Date(mostRecent.nextDueDate)
        }
        // Method 3: Use default day interval from last service or truck creation
        else if (lastServiceDate) {
          predictedDate = new Date(lastServiceDate.getTime() + interval.dayInterval * 24 * 60 * 60 * 1000)
        }
        // Method 4: Use truck creation date + default interval
        else {
          predictedDate = new Date(truck.createdAt.getTime() + interval.dayInterval * 24 * 60 * 60 * 1000)
        }

        // Adjust prediction based on mileage if available
        if (lastServiceOdometer !== null && lastServiceOdometer > 0) {
          const kmSinceLastService = currentMileage - lastServiceOdometer
          const kmRatio = kmSinceLastService / interval.kmInterval

          // If mileage is ahead of schedule, move prediction earlier
          if (kmRatio > 1) {
            const daysToDeduct = Math.round((kmRatio - 1) * 30) // Rough estimate
            predictedDate = new Date(predictedDate.getTime() - daysToDeduct * 24 * 60 * 60 * 1000)
          }
          // If mileage is behind schedule, extend prediction
          else if (kmRatio < 0.5 && kmRatio > 0) {
            const daysToAdd = Math.round((0.5 - kmRatio) * 15)
            predictedDate = new Date(predictedDate.getTime() + daysToAdd * 24 * 60 * 60 * 1000)
          }
        }

        // Skip predictions far in the future (> 180 days) for new trucks with no history
        const daysUntilService = (predictedDate.getTime() - Date.now()) / (1000 * 60 * 60 * 24)
        if (daysUntilService > 180 && componentRecords.length === 0) {
          continue
        }

        const totalServices = componentRecords.length
        const confidence = getConfidence(totalServices, avgIntervalDays)
        const riskLevel = getRiskLevel(predictedDate)

        predictions.push({
          truckId: truck.id,
          truckPlate: truck.plateNumber,
          predictedServiceDate: predictedDate.toISOString().split('T')[0],
          confidence,
          component,
          estimatedCost: avgCost,
          lastServiceDate: lastServiceDate ? lastServiceDate.toISOString().split('T')[0] : 'N/A',
          avgIntervalDays: avgIntervalDays || interval.dayInterval,
          totalServices,
          riskLevel,
        })
      }
    }

    // Sort by predicted date (nearest first)
    predictions.sort((a, b) => new Date(a.predictedServiceDate).getTime() - new Date(b.predictedServiceDate).getTime())

    // Build summary
    const criticalCount = predictions.filter((p) => p.riskLevel === 'critical').length
    const warningCount = predictions.filter((p) => p.riskLevel === 'warning').length
    const infoCount = predictions.filter((p) => p.riskLevel === 'info').length
    const totalEstimatedCost = predictions.reduce((sum, p) => sum + p.estimatedCost, 0)

    return NextResponse.json({
      predictions,
      summary: {
        criticalCount,
        warningCount,
        infoCount,
        totalEstimatedCost,
      },
    })
  } catch (error) {
    console.error('Predictive maintenance error:', error)
    return NextResponse.json({ error: 'Failed to generate maintenance predictions' }, { status: 500 })
  }
}
