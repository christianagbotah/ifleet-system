import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { requireAuth } from '@/lib/auth-server'

// Completed statuses we consider for profitability
const COMPLETED_STATUSES = [
  'offloaded',
  'completed',
  'arrived_depot',
]

export async function GET(request: NextRequest) {
  const auth = requireAuth(request)
  if (auth instanceof NextResponse) return auth

  const { searchParams } = new URL(request.url)
  const period = searchParams.get('period') || 'this_month'
  const dateFrom = searchParams.get('dateFrom') || undefined
  const dateTo = searchParams.get('dateTo') || undefined
  const truckId = searchParams.get('truckId') || undefined
  const driverId = searchParams.get('driverId') || undefined
  const route = searchParams.get('route') || undefined
  const clientId = searchParams.get('clientId') || undefined
  const page = parseInt(searchParams.get('page') || '1', 10)
  const limit = parseInt(searchParams.get('limit') || '20', 10)

  try {
    // ─── Build date range from period ───
    const now = new Date()
    let startDate: Date
    let endDate: Date

    if (dateFrom && dateTo) {
      startDate = new Date(dateFrom)
      endDate = new Date(dateTo)
      endDate.setHours(23, 59, 59, 999)
    } else {
      switch (period) {
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

    // ─── Build where clause ───
    const where: Record<string, unknown> = {
      status: { in: COMPLETED_STATUSES },
      departureTime: { gte: startDate, lte: endDate },
    }

    if (truckId) where.truckId = truckId
    if (driverId) where.driverId = driverId
    if (clientId) where.clientId = clientId
    if (route) {
      const parts = route.split('-').map(s => s.trim())
      if (parts.length === 2) {
        where.loadingLocation = { contains: parts[0] }
        where.destination = { contains: parts[1] }
      }
    }

    // ─── Fetch trips with related data ───
    const totalTrips = await db.trip.count({ where })

    const trips = await db.trip.findMany({
      where,
      include: {
        truck: { select: { id: true, plateNumber: true, make: true, model: true } },
        driver: { select: { id: true, firstName: true, lastName: true } },
        client: { select: { id: true, companyName: true } },
        FuelLog: { select: { totalCost: true } },
        Expense: { select: { amount: true, category: true } },
      },
      orderBy: { departureTime: 'desc' },
      skip: (page - 1) * limit,
      take: limit,
    })

    // ─── Calculate per-trip profitability ───
    const tripProfitability = trips.map(trip => {
      const revenue = trip.totalRevenue ?? 0
      const fuelCost = trip.FuelLog.reduce((sum, fl) => sum + fl.totalCost, 0)
      const otherExpenses = trip.Expense
        .filter(e => e.category !== 'fuel')
        .reduce((sum, e) => sum + e.amount, 0)
      const totalCost = fuelCost + otherExpenses
      const netProfit = revenue - totalCost
      const margin = revenue > 0 ? Math.round((netProfit / revenue) * 10000) / 100 : 0

      return {
        id: trip.id,
        tripNumber: trip.tripNumber,
        departureTime: trip.departureTime.toISOString(),
        truck: trip.truck,
        driver: trip.driver,
        loadingLocation: trip.loadingLocation,
        destination: trip.destination,
        clientName: trip.client?.companyName ?? trip.customerName ?? null,
        revenue: Math.round(revenue * 100) / 100,
        fuelCost: Math.round(fuelCost * 100) / 100,
        expenses: Math.round(otherExpenses * 100) / 100,
        totalCost: Math.round(totalCost * 100) / 100,
        netProfit: Math.round(netProfit * 100) / 100,
        margin,
      }
    })

    // ─── Fetch ALL trips for consistent aggregations (summary, charts, best/worst route) ───
    const allTrips = await db.trip.findMany({
      where,
      include: {
        truck: { select: { id: true, plateNumber: true, make: true, model: true } },
        driver: { select: { id: true, firstName: true, lastName: true } },
        client: { select: { id: true, companyName: true } },
        FuelLog: { select: { totalCost: true } },
        Expense: { select: { amount: true, category: true } },
      },
    })

    // By Route aggregation
    const routeAggMap = new Map<string, {
      route: string; trips: number; revenue: number; cost: number; profit: number
    }>()
    for (const trip of allTrips) {
      const rev = trip.totalRevenue ?? 0
      const fuel = trip.FuelLog.reduce((s, fl) => s + fl.totalCost, 0)
      const other = trip.Expense.filter(e => e.category !== 'fuel').reduce((s, e) => s + e.amount, 0)
      const cost = fuel + other
      const key = `${trip.loadingLocation} → ${trip.destination}`
      const existing = routeAggMap.get(key) || { route: key, trips: 0, revenue: 0, cost: 0, profit: 0 }
      existing.trips += 1
      existing.revenue += rev
      existing.cost += cost
      existing.profit += rev - cost
      routeAggMap.set(key, existing)
    }
    const byRoute = Array.from(routeAggMap.values()).map(r => ({
      ...r,
      revenue: Math.round(r.revenue * 100) / 100,
      cost: Math.round(r.cost * 100) / 100,
      profit: Math.round(r.profit * 100) / 100,
      margin: r.revenue > 0 ? Math.round((r.profit / r.revenue) * 10000) / 100 : 0,
    })).sort((a, b) => b.revenue - a.revenue)

    // By Truck aggregation
    const truckAggMap = new Map<string, {
      truckId: string; plateNumber: string; trips: number; revenue: number; cost: number; profit: number
    }>()
    for (const trip of allTrips) {
      const rev = trip.totalRevenue ?? 0
      const fuel = trip.FuelLog.reduce((s, fl) => s + fl.totalCost, 0)
      const other = trip.Expense.filter(e => e.category !== 'fuel').reduce((s, e) => s + e.amount, 0)
      const cost = fuel + other
      const key = trip.truckId
      const existing = truckAggMap.get(key) || {
        truckId: key, plateNumber: trip.truck.plateNumber, trips: 0, revenue: 0, cost: 0, profit: 0,
      }
      existing.trips += 1
      existing.revenue += rev
      existing.cost += cost
      existing.profit += rev - cost
      truckAggMap.set(key, existing)
    }
    const byTruck = Array.from(truckAggMap.values()).map(t => ({
      ...t,
      revenue: Math.round(t.revenue * 100) / 100,
      cost: Math.round(t.cost * 100) / 100,
      profit: Math.round(t.profit * 100) / 100,
      margin: t.revenue > 0 ? Math.round((t.profit / t.revenue) * 10000) / 100 : 0,
    })).sort((a, b) => b.profit - a.profit)

    // By Client aggregation
    const clientAggMap = new Map<string, {
      clientName: string; trips: number; revenue: number; cost: number; profit: number
    }>()
    for (const trip of allTrips) {
      const clientName = trip.client?.companyName ?? trip.customerName ?? 'Unassigned'
      const rev = trip.totalRevenue ?? 0
      const fuel = trip.FuelLog.reduce((s, fl) => s + fl.totalCost, 0)
      const other = trip.Expense.filter(e => e.category !== 'fuel').reduce((s, e) => s + e.amount, 0)
      const cost = fuel + other
      const key = clientName
      const existing = clientAggMap.get(key) || { clientName: key, trips: 0, revenue: 0, cost: 0, profit: 0 }
      existing.trips += 1
      existing.revenue += rev
      existing.cost += cost
      existing.profit += rev - cost
      clientAggMap.set(key, existing)
    }
    const byClient = Array.from(clientAggMap.values()).map(c => ({
      ...c,
      revenue: Math.round(c.revenue * 100) / 100,
      cost: Math.round(c.cost * 100) / 100,
      profit: Math.round(c.profit * 100) / 100,
      margin: c.revenue > 0 ? Math.round((c.profit / c.revenue) * 10000) / 100 : 0,
    })).sort((a, b) => b.revenue - a.revenue)

    // ─── Monthly Trend ───
    const monthlyTrendMap = new Map<string, { month: string; revenue: number; cost: number; profit: number }>()
    for (const trip of allTrips) {
      const d = new Date(trip.departureTime)
      const monthKey = d.toLocaleString('en-US', { month: 'short', year: 'numeric' })
      const rev = trip.totalRevenue ?? 0
      const fuel = trip.FuelLog.reduce((s, fl) => s + fl.totalCost, 0)
      const other = trip.Expense.filter(e => e.category !== 'fuel').reduce((s, e) => s + e.amount, 0)
      const cost = fuel + other
      const existing = monthlyTrendMap.get(monthKey) || { month: monthKey, revenue: 0, cost: 0, profit: 0 }
      existing.revenue += rev
      existing.cost += cost
      existing.profit += rev - cost
      monthlyTrendMap.set(monthKey, existing)
    }
    const monthlyTrend = Array.from(monthlyTrendMap.values()).map(m => ({
      ...m,
      revenue: Math.round(m.revenue * 100) / 100,
      cost: Math.round(m.cost * 100) / 100,
      profit: Math.round(m.profit * 100) / 100,
    }))

    // ─── Summary (computed from ALL trips for consistency with charts) ───
    const allTripProfits = allTrips.map(trip => {
      const rev = trip.totalRevenue ?? 0
      const fuel = trip.FuelLog.reduce((s, fl) => s + fl.totalCost, 0)
      const other = trip.Expense.filter(e => e.category !== 'fuel').reduce((s, e) => s + e.amount, 0)
      const cost = fuel + other
      return { revenue: rev, cost, profit: rev - cost }
    })

    const totalRevenue = allTripProfits.reduce((s, t) => s + t.revenue, 0)
    const totalCost = allTripProfits.reduce((s, t) => s + t.cost, 0)
    const totalProfit = totalRevenue - totalCost
    const profitableTrips = allTripProfits.filter(t => t.profit > 0).length
    const lossTrips = allTripProfits.filter(t => t.profit < 0).length
    const tripsWithRevenue = allTripProfits.filter(t => t.revenue > 0)
    const avgMargin = tripsWithRevenue.length > 0
      ? Math.round((tripsWithRevenue.reduce((s, t) => s + (t.revenue > 0 ? Math.round((t.profit / t.revenue) * 10000) / 100 : 0), 0) / tripsWithRevenue.length) * 100) / 100
      : 0

    // Best/worst route (from ALL trips)
    let bestRoute = '--'
    let worstRoute = '--'
    if (byRoute.length > 0) {
      let bestProfit = -Infinity
      let worstProfit = Infinity
      for (const r of byRoute) {
        if (r.profit > bestProfit) { bestProfit = r.profit; bestRoute = r.route }
        if (r.profit < worstProfit) { worstProfit = r.profit; worstRoute = r.route }
      }
    }

    // ─── Response ───
    return NextResponse.json({
      trips: tripProfitability,
      pagination: {
        page,
        limit,
        total: totalTrips,
        totalPages: Math.ceil(totalTrips / limit),
      },
      summary: {
        totalRevenue: Math.round(totalRevenue * 100) / 100,
        totalCost: Math.round(totalCost * 100) / 100,
        totalProfit: Math.round(totalProfit * 100) / 100,
        avgMargin,
        profitableTrips,
        lossTrips,
        bestRoute,
        worstRoute,
      },
      byRoute,
      byTruck,
      byClient,
      monthlyTrend,
    })
  } catch (error) {
    console.error('Trip profitability error:', error)
    return NextResponse.json(
      { error: 'Failed to load profitability data' },
      { status: 500 }
    )
  }
}
