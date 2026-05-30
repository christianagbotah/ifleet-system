import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { requireAuth } from '@/lib/auth-server'

// Completed trip statuses that generate revenue
const COMPLETED_STATUSES = [
  'offloaded',
  'completed',
  'arrived_depot',
]

function getStartOfDay(date: Date): Date {
  const d = new Date(date)
  d.setHours(0, 0, 0, 0)
  return d
}

function getEndOfDay(date: Date): Date {
  const d = new Date(date)
  d.setHours(23, 59, 59, 999)
  return d
}

function buildDateRange(period: string, dateFrom?: string, dateTo?: string) {
  const now = new Date()
  let startDate: Date
  let endDate: Date

  if (dateFrom && dateTo) {
    startDate = getStartOfDay(new Date(dateFrom))
    endDate = getEndOfDay(new Date(dateTo))
  } else {
    switch (period) {
      case 'today':
        startDate = getStartOfDay(now)
        endDate = getEndOfDay(now)
        break
      case 'this_week': {
        const dayOfWeek = now.getDay()
        const diff = dayOfWeek === 0 ? 6 : dayOfWeek - 1 // Monday = 0
        startDate = getStartOfDay(new Date(now.getFullYear(), now.getMonth(), now.getDate() - diff))
        endDate = getEndOfDay(now)
        break
      }
      case 'last_month': {
        const firstOfThisMonth = new Date(now.getFullYear(), now.getMonth(), 1)
        startDate = new Date(firstOfThisMonth.getFullYear(), firstOfThisMonth.getMonth() - 1, 1)
        endDate = new Date(firstOfThisMonth.getFullYear(), firstOfThisMonth.getMonth(), 0, 23, 59, 59, 999)
        break
      }
      case 'this_quarter': {
        const quarterStart = Math.floor(now.getMonth() / 3) * 3
        startDate = new Date(now.getFullYear(), quarterStart, 1)
        endDate = new Date(now.getFullYear(), quarterStart + 3, 0, 23, 59, 59, 999)
        break
      }
      case 'this_year': {
        startDate = new Date(now.getFullYear(), 0, 1)
        endDate = new Date(now.getFullYear(), 11, 31, 23, 59, 59, 999)
        break
      }
      default: { // this_month
        startDate = new Date(now.getFullYear(), now.getMonth(), 1)
        endDate = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59, 999)
        break
      }
    }
  }

  return { startDate, endDate }
}

function round2(n: number): number {
  return Math.round(n * 100) / 100
}

export async function GET(request: NextRequest) {
  const auth = requireAuth(request)
  if (auth instanceof NextResponse) return auth

  const { searchParams } = new URL(request.url)
  const period = searchParams.get('period') || 'this_month'
  const dateFrom = searchParams.get('dateFrom') || undefined
  const dateTo = searchParams.get('dateTo') || undefined
  const truckId = searchParams.get('truckId') || undefined

  try {
    const { startDate, endDate } = buildDateRange(period, dateFrom, dateTo)

    // ─── Fetch all trucks (for list + data) ───
    const truckWhere: Record<string, unknown> = {
      status: { in: ['active', 'maintenance'] },
    }

    const allTrucks = await db.truck.findMany({
      where: truckWhere,
      select: {
        id: true,
        plateNumber: true,
        make: true,
        model: true,
        driver: { select: { firstName: true, lastName: true } },
      },
      orderBy: { plateNumber: 'asc' },
    })

    // ─── Fetch completed trips in date range ───
    const tripWhere: Record<string, unknown> = {
      status: { in: COMPLETED_STATUSES },
      departureTime: { gte: startDate, lte: endDate },
    }
    if (truckId) tripWhere.truckId = truckId

    const completedTrips = await db.trip.findMany({
      where: tripWhere,
      select: {
        id: true,
        truckId: true,
        totalRevenue: true,
        departureTime: true,
      },
    })

    // ─── Fetch expenses in date range ───
    const expenseWhere: Record<string, unknown> = {
      date: { gte: startDate, lte: endDate },
      status: { in: ['approved', 'pending'] },
    }
    if (truckId) expenseWhere.truckId = truckId

    const expenses = await db.expense.findMany({
      where: expenseWhere,
      select: {
        id: true,
        truckId: true,
        category: true,
        amount: true,
        date: true,
      },
    })

    // ─── Fetch maintenance records in date range ───
    const maintWhere: Record<string, unknown> = {
      performedAt: { gte: startDate, lte: endDate },
      status: { in: ['completed', 'approved', 'pending'] },
    }
    if (truckId) maintWhere.truckId = truckId

    const maintenanceRecords = await db.maintenanceRecord.findMany({
      where: maintWhere,
      select: {
        id: true,
        truckId: true,
        cost: true,
        performedAt: true,
      },
    })

    // ─── Fetch fuel logs in date range ───
    const fuelLogWhere: Record<string, unknown> = {
      date: { gte: startDate, lte: endDate },
    }
    if (truckId) fuelLogWhere.truckId = truckId

    const fuelLogs = await db.fuelLog.findMany({
      where: fuelLogWhere,
      select: {
        id: true,
        truckId: true,
        totalCost: true,
        date: true,
      },
    })

    // ─── Fetch toll records in date range ───
    const tollWhere: Record<string, unknown> = {
      tollDate: { gte: startDate, lte: endDate },
      status: { in: ['approved', 'completed', 'pending'] },
    }
    if (truckId) tollWhere.truckId = truckId

    const tollRecords = await db.tollRecord.findMany({
      where: tollWhere,
      select: {
        id: true,
        truckId: true,
        amount: true,
        overloadFine: true,
        tollDate: true,
      },
    })

    // ─── Build per-truck aggregations ───
    const truckMap = new Map<string, {
      truckId: string
      plateNumber: string
      make: string
      model: string
      driverName: string
      trips: number
      revenue: number
      fuelCost: number
      maintenanceCost: number
      tollCost: number
      otherExpenses: number
    }>()

    // Initialize truck map
    const trucksToProcess = truckId
      ? allTrucks.filter(t => t.id === truckId)
      : allTrucks

    for (const truck of trucksToProcess) {
      truckMap.set(truck.id, {
        truckId: truck.id,
        plateNumber: truck.plateNumber,
        make: truck.make,
        model: truck.model,
        driverName: truck.driver
          ? `${truck.driver.firstName} ${truck.driver.lastName}`
          : 'Unassigned',
        trips: 0,
        revenue: 0,
        fuelCost: 0,
        maintenanceCost: 0,
        tollCost: 0,
        otherExpenses: 0,
      })
    }

    // Aggregate trips (revenue)
    for (const trip of completedTrips) {
      const entry = truckMap.get(trip.truckId)
      if (!entry) continue
      entry.trips += 1
      entry.revenue += trip.totalRevenue ?? 0
    }

    // Aggregate expenses
    for (const expense of expenses) {
      const entry = truckMap.get(expense.truckId)
      if (!entry) continue
      switch (expense.category) {
        case 'fuel':
          entry.fuelCost += expense.amount
          break
        case 'maintenance':
          entry.maintenanceCost += expense.amount
          break
        case 'toll':
          entry.tollCost += expense.amount
          break
        default:
          entry.otherExpenses += expense.amount
          break
      }
    }

    // Aggregate fuel logs (primary fuel cost source — FuelLog table)
    for (const fuelLog of fuelLogs) {
      const entry = truckMap.get(fuelLog.truckId)
      if (!entry) continue
      entry.fuelCost += fuelLog.totalCost
    }

    // Aggregate maintenance records (separate from expenses)
    for (const maint of maintenanceRecords) {
      const entry = truckMap.get(maint.truckId)
      if (!entry) continue
      entry.maintenanceCost += maint.cost ?? 0
    }

    // Aggregate toll records (separate from expenses)
    for (const toll of tollRecords) {
      const entry = truckMap.get(toll.truckId)
      if (!entry) continue
      entry.tollCost += toll.amount + (toll.overloadFine ?? 0)
    }

    // Build truck rows with net P&L
    const trucks = Array.from(truckMap.values()).map(t => {
      const totalExpenses = t.fuelCost + t.maintenanceCost + t.tollCost + t.otherExpenses
      const netIncome = t.revenue - totalExpenses
      const margin = t.revenue > 0 ? round2((netIncome / t.revenue) * 100) : 0
      return {
        truckId: t.truckId,
        plateNumber: t.plateNumber,
        make: t.make,
        model: t.model,
        driverName: t.driverName,
        trips: t.trips,
        revenue: round2(t.revenue),
        fuelCost: round2(t.fuelCost),
        maintenanceCost: round2(t.maintenanceCost),
        tollCost: round2(t.tollCost),
        otherExpenses: round2(t.otherExpenses),
        totalExpenses: round2(totalExpenses),
        netIncome: round2(netIncome),
        margin,
      }
    })

    // ─── Build daily breakdown ───
    const dailyMap = new Map<string, {
      date: string
      revenue: number
      fuelCost: number
      maintenanceCost: number
      tollCost: number
      otherExpenses: number
      trips: number
    }>()

    // Initialize all days in the range
    const current = new Date(startDate)
    while (current <= endDate) {
      const key = current.toISOString().split('T')[0]
      dailyMap.set(key, {
        date: key,
        revenue: 0,
        fuelCost: 0,
        maintenanceCost: 0,
        tollCost: 0,
        otherExpenses: 0,
        trips: 0,
      })
      current.setDate(current.getDate() + 1)
    }

    // Aggregate trips by date
    for (const trip of completedTrips) {
      const tripDate = new Date(trip.departureTime)
      const key = tripDate.toISOString().split('T')[0]
      const entry = dailyMap.get(key)
      if (entry) {
        entry.trips += 1
        entry.revenue += trip.totalRevenue ?? 0
      }
    }

    // Aggregate fuel logs by date (primary fuel cost source)
    for (const fuelLog of fuelLogs) {
      const fDate = new Date(fuelLog.date)
      const key = fDate.toISOString().split('T')[0]
      const entry = dailyMap.get(key)
      if (!entry) continue
      entry.fuelCost += fuelLog.totalCost
    }

    // Aggregate expenses by date
    for (const expense of expenses) {
      const expDate = new Date(expense.date)
      const key = expDate.toISOString().split('T')[0]
      const entry = dailyMap.get(key)
      if (!entry) continue
      switch (expense.category) {
        case 'fuel':
          entry.fuelCost += expense.amount
          break
        case 'maintenance':
          entry.maintenanceCost += expense.amount
          break
        case 'toll':
          entry.tollCost += expense.amount
          break
        default:
          entry.otherExpenses += expense.amount
          break
      }
    }

    // Aggregate maintenance by date
    for (const maint of maintenanceRecords) {
      const mDate = new Date(maint.performedAt)
      const key = mDate.toISOString().split('T')[0]
      const entry = dailyMap.get(key)
      if (!entry) continue
      entry.maintenanceCost += maint.cost ?? 0
    }

    // Aggregate tolls by date
    for (const toll of tollRecords) {
      const tDate = new Date(toll.tollDate)
      const key = tDate.toISOString().split('T')[0]
      const entry = dailyMap.get(key)
      if (!entry) continue
      entry.tollCost += toll.amount + (toll.overloadFine ?? 0)
    }

    const daily = Array.from(dailyMap.values()).map(d => {
      const totalExpenses = d.fuelCost + d.maintenanceCost + d.tollCost + d.otherExpenses
      return {
        date: d.date,
        revenue: round2(d.revenue),
        fuelCost: round2(d.fuelCost),
        maintenanceCost: round2(d.maintenanceCost),
        tollCost: round2(d.tollCost),
        otherExpenses: round2(d.otherExpenses),
        totalExpenses: round2(totalExpenses),
        netIncome: round2(d.revenue - totalExpenses),
        trips: d.trips,
      }
    }).filter(d => d.trips > 0 || d.revenue > 0 || d.totalExpenses > 0)

    // ─── Summary ───
    const totalRevenue = trucks.reduce((s, t) => s + t.revenue, 0)
    const totalExpenses = trucks.reduce((s, t) => s + t.totalExpenses, 0)
    const netIncome = totalRevenue - totalExpenses
    const totalTrips = trucks.reduce((s, t) => s + t.trips, 0)
    const profitableTrucks = trucks.filter(t => t.netIncome > 0).length
    const lossTrucks = trucks.filter(t => t.netIncome < 0).length
    const trucksWithRevenue = trucks.filter(t => t.revenue > 0)
    const avgMargin = trucksWithRevenue.length > 0
      ? round2(trucksWithRevenue.reduce((s, t) => s + t.margin, 0) / trucksWithRevenue.length)
      : 0

    const fuelTotal = trucks.reduce((s, t) => s + t.fuelCost, 0)
    const maintenanceTotal = trucks.reduce((s, t) => s + t.maintenanceCost, 0)
    const tollsTotal = trucks.reduce((s, t) => s + t.tollCost, 0)

    return NextResponse.json({
      summary: {
        totalRevenue: round2(totalRevenue),
        totalExpenses: round2(totalExpenses),
        netIncome: round2(netIncome),
        totalTrips,
        profitableTrucks,
        lossTrucks,
        avgMargin,
        fuelTotal: round2(fuelTotal),
        maintenanceTotal: round2(maintenanceTotal),
        tollsTotal: round2(tollsTotal),
      },
      trucks: trucks.sort((a, b) => b.netIncome - a.netIncome),
      daily: daily.sort((a, b) => b.date.localeCompare(a.date)),
      trucksList: allTrucks.map(t => ({ id: t.id, plateNumber: t.plateNumber })),
    })
  } catch (error) {
    console.error('Truck P&L error:', error)
    return NextResponse.json(
      { error: 'Failed to load truck financial data' },
      { status: 500 }
    )
  }
}
