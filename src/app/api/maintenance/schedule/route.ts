import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { requireAuth, requireWriteAccess } from '@/lib/auth-server'

// ============ Types ============

interface ScheduleItem {
  truckId: string
  plateNumber: string
  make: string
  model: string
  currentMileage: number
  lastServiceDate: string | null
  lastServiceMileage: number | null
  nextDueDate: string | null
  nextDueMileage: number | null
  daysUntilDue: number | null
  kmUntilDue: number | null
  status: 'upcoming' | 'due_soon' | 'overdue' | 'no_history'
  healthScore: number
  lastCost: number | null
  estimatedNextCost: number | null
  lastServiceType: string | null
}

interface ScheduleSummary {
  totalTrucks: number
  servicedRecently: number
  dueSoon: number
  overdue: number
  noHistory: number
  avgHealthScore: number
  totalEstimatedCost: number
}

// ============ GET: Maintenance Schedule ============

export async function GET(request: NextRequest) {
  try {
    const auth = requireAuth(request)
    if (auth instanceof NextResponse) return auth

    const { searchParams } = new URL(request.url)
    const truckId = searchParams.get('truckId')
    const daysAhead = parseInt(searchParams.get('daysAhead') || '30')
    const statusFilter = searchParams.get('status') // upcoming, due_soon, overdue, all

    const now = new Date()
    const cutoffDate = new Date(now.getTime() + daysAhead * 24 * 60 * 60 * 1000)

    // Fetch all trucks with their latest maintenance records
    const trucks = await db.truck.findMany({
      where: truckId ? { id: truckId } : undefined,
      include: {
        maintenance: {
          where: { status: 'completed' },
          orderBy: { performedAt: 'desc' },
          take: 1,
        },
      },
    })

    const schedule: ScheduleItem[] = []
    const MILEAGE_BUFFER = 500 // km buffer for odometer-based due calculation

    for (const truck of trucks) {
      const latestRecord = truck.maintenance[0] || null

      if (!latestRecord) {
        // No maintenance history
        schedule.push({
          truckId: truck.id,
          plateNumber: truck.plateNumber,
          make: truck.make,
          model: truck.model,
          currentMileage: truck.currentMileage,
          lastServiceDate: null,
          lastServiceMileage: null,
          nextDueDate: null,
          nextDueMileage: null,
          daysUntilDue: null,
          kmUntilDue: null,
          status: 'no_history',
          healthScore: 0,
          lastCost: null,
          estimatedNextCost: null,
          lastServiceType: null,
        })
        continue
      }

      const nextDueDate = latestRecord.nextDueDate ? new Date(latestRecord.nextDueDate) : null
      const nextDueMileage = latestRecord.nextDueMileage
      const currentMileage = truck.currentMileage

      // Determine if maintenance is due
      let isOverdue = false
      let isDueSoon = false
      let isUpcoming = true

      // Check time-based
      if (nextDueDate) {
        if (now > nextDueDate) {
          isOverdue = true
        } else if (cutoffDate >= nextDueDate) {
          isDueSoon = true
        }
      }

      // Check odometer-based
      if (nextDueMileage && currentMileage >= (nextDueMileage - MILEAGE_BUFFER)) {
        if (currentMileage > nextDueMileage) {
          isOverdue = true
        } else {
          isDueSoon = true
        }
      }

      // Determine final status
      let status: ScheduleItem['status']
      if (isOverdue) {
        status = 'overdue'
      } else if (isDueSoon) {
        status = 'due_soon'
      } else {
        status = 'upcoming'
      }

      // Calculate days/km until due
      let daysUntilDue: number | null = null
      if (nextDueDate) {
        daysUntilDue = Math.ceil((nextDueDate.getTime() - now.getTime()) / (1000 * 60 * 60 * 24))
        if (daysUntilDue < 0) daysUntilDue = 0
      }

      let kmUntilDue: number | null = null
      if (nextDueMileage) {
        kmUntilDue = Math.round(nextDueMileage - currentMileage)
        if (kmUntilDue < 0) kmUntilDue = 0
      }

      // Calculate health score
      // 100 = just serviced, 50 = due soon, 0 = overdue
      let healthScore: number
      if (status === 'overdue') {
        // 0-25 based on how far overdue
        if (nextDueDate) {
          const daysOverdue = Math.ceil((now.getTime() - nextDueDate.getTime()) / (1000 * 60 * 60 * 24))
          healthScore = Math.max(0, 25 - daysOverdue)
        } else if (nextDueMileage) {
          const kmOverdue = currentMileage - nextDueMileage
          healthScore = Math.max(0, 25 - Math.floor(kmOverdue / 200))
        } else {
          healthScore = 0
        }
      } else if (status === 'due_soon') {
        // 25-50 based on how close to due
        if (daysUntilDue !== null && daysUntilDue <= daysAhead) {
          healthScore = 25 + Math.round((daysUntilDue / daysAhead) * 25)
        } else if (kmUntilDue !== null && nextDueMileage) {
          const totalKmRange = Math.max(1, nextDueMileage - (latestRecord.odometer || 0))
          const remaining = kmUntilDue / totalKmRange
          healthScore = 25 + Math.round(remaining * 25)
        } else {
          healthScore = 40
        }
      } else {
        // 50-100 based on how recently serviced
        const performedAt = new Date(latestRecord.performedAt)
        const daysSinceService = Math.ceil((now.getTime() - performedAt.getTime()) / (1000 * 60 * 60 * 24))
        const serviceInterval = nextDueDate
          ? Math.ceil((nextDueDate.getTime() - performedAt.getTime()) / (1000 * 60 * 60 * 24))
          : 90 // default 90 day interval
        const remainingFraction = Math.max(0, 1 - daysSinceService / serviceInterval)
        healthScore = 50 + Math.round(remainingFraction * 50)
      }

      // Estimate next cost based on last cost + 10% inflation
      const estimatedNextCost = latestRecord.cost ? Math.round(latestRecord.cost * 1.1) : null

      schedule.push({
        truckId: truck.id,
        plateNumber: truck.plateNumber,
        make: truck.make,
        model: truck.model,
        currentMileage: truck.currentMileage,
        lastServiceDate: latestRecord.performedAt,
        lastServiceMileage: latestRecord.odometer,
        nextDueDate: latestRecord.nextDueDate,
        nextDueMileage: latestRecord.nextDueMileage,
        daysUntilDue,
        kmUntilDue,
        status,
        healthScore: Math.min(100, Math.max(0, healthScore)),
        lastCost: latestRecord.cost,
        estimatedNextCost,
        lastServiceType: latestRecord.type,
      })
    }

    // Apply status filter if provided
    let filteredSchedule = schedule
    if (statusFilter && statusFilter !== 'all') {
      filteredSchedule = schedule.filter(item => item.status === statusFilter)
    }

    // Build summary from the full schedule (before filter)
    const summary: ScheduleSummary = {
      totalTrucks: schedule.length,
      servicedRecently: schedule.filter(s => s.status === 'upcoming').length,
      dueSoon: schedule.filter(s => s.status === 'due_soon').length,
      overdue: schedule.filter(s => s.status === 'overdue').length,
      noHistory: schedule.filter(s => s.status === 'no_history').length,
      avgHealthScore: schedule.length > 0
        ? Math.round(schedule.reduce((sum, s) => sum + s.healthScore, 0) / schedule.length)
        : 0,
      totalEstimatedCost: schedule
        .filter(s => s.status === 'due_soon' || s.status === 'overdue')
        .reduce((sum, s) => sum + (s.estimatedNextCost || 0), 0),
    }

    // Sort: overdue first, then due_soon, then upcoming, then no_history
    // Within each group, sort by health score ascending (most urgent first)
    const statusOrder = { overdue: 0, due_soon: 1, upcoming: 2, no_history: 3 }
    filteredSchedule.sort((a, b) => {
      const orderDiff = statusOrder[a.status] - statusOrder[b.status]
      if (orderDiff !== 0) return orderDiff
      return a.healthScore - b.healthScore
    })

    return NextResponse.json({ summary, schedule: filteredSchedule })
  } catch (error) {
    console.error('Maintenance schedule error:', error)
    return NextResponse.json({ error: 'Failed to fetch maintenance schedule' }, { status: 500 })
  }
}

// ============ POST: Schedule Maintenance ============

export async function POST(request: NextRequest) {
  try {
    const auth = requireAuth(request)
    if (auth instanceof NextResponse) return auth
    const writeGuard = requireWriteAccess(auth)
    if (writeGuard instanceof NextResponse) return writeGuard

    const body = await request.json()

    const {
      truckId,
      type,
      title,
      description,
      scheduledDate,
      scheduledMileage,
    } = body

    if (!truckId || !type || !title) {
      return NextResponse.json(
        { error: 'truckId, type, and title are required' },
        { status: 400 }
      )
    }

    if (!['routine', 'repair', 'emergency', 'inspection'].includes(type)) {
      return NextResponse.json(
        { error: 'type must be one of: routine, repair, emergency, inspection' },
        { status: 400 }
      )
    }

    // Verify truck exists
    const truck = await db.truck.findUnique({ where: { id: truckId } })
    if (!truck) {
      return NextResponse.json({ error: 'Truck not found' }, { status: 404 })
    }

    // Create the maintenance record with "pending" status
    const record = await db.maintenanceRecord.create({
      data: {
        truckId,
        type,
        title,
        description: description || null,
        status: 'pending',
        nextDueDate: scheduledDate ? new Date(scheduledDate) : null,
        nextDueMileage: scheduledMileage ? parseFloat(scheduledMileage) : null,
      },
      include: {
        truck: { select: { id: true, plateNumber: true, make: true, model: true } },
      },
    })

    // Update truck's nextServiceDate if a scheduled date was provided
    if (scheduledDate) {
      await db.truck.update({
        where: { id: truckId },
        data: { nextServiceDate: new Date(scheduledDate) },
      })
    }

    return NextResponse.json(record, { status: 201 })
  } catch (error) {
    console.error('Schedule maintenance error:', error)
    return NextResponse.json({ error: 'Failed to schedule maintenance' }, { status: 500 })
  }
}
