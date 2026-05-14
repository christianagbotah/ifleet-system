import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { requireRole, ROLES } from '@/lib/auth-server'

export async function GET(request: NextRequest) {
  try {
    const auth = requireRole(request, [ROLES.ADMIN, ROLES.MANAGER])
    if (auth instanceof NextResponse) return auth
    const { searchParams } = new URL(request.url)
    const range = searchParams.get('range') || 'this_month'

    const now = new Date()
    const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1)
    const endOfMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59, 999)
    const thirtyDaysFromNow = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000)

    // Determine date range based on selection
    let rangeStart: Date
    let rangeEnd = new Date(now.getFullYear(), now.getMonth() + 1, now.getDate(), 23, 59, 59, 999)
    let prevRangeStart: Date
    let prevRangeEnd: Date

    switch (range) {
      case 'this_week': {
        const dayOfWeek = now.getDay() || 7 // Monday=1, Sunday=7
        rangeStart = new Date(now.getFullYear(), now.getMonth(), now.getDate() - dayOfWeek + 1)
        prevRangeStart = new Date(rangeStart.getTime() - 7 * 24 * 60 * 60 * 1000)
        prevRangeEnd = new Date(prevRangeStart.getTime() + 7 * 24 * 60 * 60 * 1000 - 1)
        break
      }
      case 'last_3_months': {
        rangeStart = new Date(now.getFullYear(), now.getMonth() - 2, 1)
        prevRangeStart = new Date(rangeStart.getTime() - 90 * 24 * 60 * 60 * 1000)
        prevRangeEnd = new Date(prevRangeStart.getTime() + 90 * 24 * 60 * 60 * 1000 - 1)
        break
      }
      case 'this_year': {
        rangeStart = new Date(now.getFullYear(), 0, 1)
        prevRangeStart = new Date(now.getFullYear() - 1, 0, 1)
        prevRangeEnd = new Date(now.getFullYear() - 1, now.getMonth(), now.getDate(), 23, 59, 59, 999)
        break
      }
      default: { // this_month
        rangeStart = new Date(now.getFullYear(), now.getMonth(), 1)
        prevRangeStart = new Date(now.getFullYear(), now.getMonth() - 1, 1)
        prevRangeEnd = new Date(now.getFullYear(), now.getMonth(), 0, 23, 59, 59, 999)
        break
      }
    }

    // Total trucks
    const totalTrucks = await db.truck.count()
    const activeTrucks = await db.truck.count({ where: { status: 'active' } })

    // Total drivers
    const totalDrivers = await db.driver.count()

    // Active trips
    const activeTripsCount = await db.trip.count({
      where: { status: 'in_transit' },
    })

    // Monthly revenue
    const monthlyRevenue = await db.trip.aggregate({
      _sum: { totalRevenue: true },
      where: {
        status: 'completed',
        departureTime: { gte: startOfMonth, lte: endOfMonth },
      },
    })

    // Monthly expenses
    const monthlyExpenses = await db.expense.aggregate({
      _sum: { amount: true },
      where: {
        date: { gte: startOfMonth, lte: endOfMonth },
      },
    })

    // Monthly fuel cost (from FuelLog model)
    const monthlyFuelStats = await db.fuelLog.aggregate({
      _sum: { totalCost: true, litersFilled: true },
      _count: true,
      where: {
        date: { gte: startOfMonth, lte: endOfMonth },
      },
    })
    const monthlyFuelCost = monthlyFuelStats._sum.totalCost || 0
    const monthlyFuelLiters = monthlyFuelStats._sum.litersFilled || 0
    const monthlyFuelEntries = monthlyFuelStats._count
    const monthlyAvgCostPerLiter = monthlyFuelLiters > 0 ? monthlyFuelCost / monthlyFuelLiters : 0

    // Recent trips (latest 5)
    const recentTrips = await db.trip.findMany({
      take: 5,
      orderBy: { departureTime: 'desc' },
      include: {
        truck: { select: { id: true, plateNumber: true, make: true, model: true } },
        driver: { select: { id: true, firstName: true, lastName: true } },
      },
    })

    // Upcoming maintenance (within 30 days)
    const upcomingMaintenance = await db.maintenanceRecord.findMany({
      where: {
        nextDueDate: { lte: thirtyDaysFromNow, gte: now },
      },
      include: {
        truck: { select: { id: true, plateNumber: true, make: true, model: true } },
      },
      orderBy: { nextDueDate: 'asc' },
      take: 10,
    })

    // Active trips (in_transit or loading)
    const activeTrips = await db.trip.findMany({
      where: { status: { in: ['in_transit', 'loading'] } },
      include: {
        truck: { select: { id: true, plateNumber: true, make: true, model: true } },
        driver: { select: { id: true, firstName: true, lastName: true } },
      },
      orderBy: { departureTime: 'desc' },
    })

    // Trip status distribution
    const tripStatusDistribution = await db.trip.groupBy({
      by: ['status'],
      _count: { status: true },
    })

    // Revenue/Expense data for last 6 months (for charts)
    const monthlyData = []

    for (let i = 5; i >= 0; i--) {
      const monthStart = new Date(now.getFullYear(), now.getMonth() - i, 1)
      const monthEnd = new Date(now.getFullYear(), now.getMonth() - i + 1, 0, 23, 59, 59, 999)

      const revenue = await db.trip.aggregate({
        _sum: { totalRevenue: true },
        where: {
          status: 'completed',
          departureTime: { gte: monthStart, lte: monthEnd },
        },
      })

      const expenses = await db.expense.aggregate({
        _sum: { amount: true },
        where: {
          date: { gte: monthStart, lte: monthEnd },
        },
      })

      const fuelMonth = await db.fuelLog.aggregate({
        _sum: { totalCost: true, litersFilled: true },
        _count: true,
        where: { date: { gte: monthStart, lte: monthEnd } },
      })

      monthlyData.push({
        month: monthStart.toLocaleString('en-US', { month: 'short', year: '2-digit' }),
        year: monthStart.getFullYear(),
        monthIndex: monthStart.getMonth() + 1,
        revenue: revenue._sum.totalRevenue || 0,
        expenses: expenses._sum.amount || 0,
        fuelCost: fuelMonth._sum.totalCost || 0,
        fuelLiters: fuelMonth._sum.litersFilled || 0,
        fuelEntries: fuelMonth._count,
      })
    }

    // ============ ANALYTICS DATA ============

    // Revenue by month (last 6 months, terminal statuses)
    const revenueByMonth = monthlyData.map(m => ({
      month: m.month,
      revenue: m.revenue,
    }))

    // Trips by status
    const tripsByStatus = tripStatusDistribution.map(s => ({
      status: s.status,
      count: s._count.status,
    }))

    // Top 5 routes by trip count
    const topRoutesRaw = await db.trip.groupBy({
      by: ['loadingLocation', 'destination'],
      _count: { id: true },
      orderBy: { _count: { id: 'desc' } },
      take: 5,
    })
    const topRoutes = topRoutesRaw.map(r => ({
      route: `${r.loadingLocation} → ${r.destination}`,
      count: r._count.id,
    }))

    // Top 5 drivers by completed trips
    const topDriversRaw = await db.trip.groupBy({
      by: ['driverId'],
      _count: { id: true },
      where: { status: 'completed' },
      orderBy: { _count: { id: 'desc' } },
      take: 5,
    })
    const topDriversIds = topDriversRaw.map(d => d.driverId)
    const topDriversData = topDriversIds.length > 0
      ? await db.driver.findMany({
          where: { id: { in: topDriversIds } },
          select: { id: true, firstName: true, lastName: true },
        })
      : []
    const driverMap = new Map(topDriversData.map(d => [d.id, `${d.firstName} ${d.lastName}`]))
    const topDrivers = topDriversRaw.map(d => ({
      driver: driverMap.get(d.driverId) || 'Unknown',
      trips: d._count.id,
    }))

    // Revenue by destination (top 5)
    const revenueByDestRaw = await db.trip.groupBy({
      by: ['destination'],
      _sum: { totalRevenue: true },
      orderBy: { _sum: { totalRevenue: 'desc' } },
      take: 5,
    })
    const revenueByDestination = revenueByDestRaw.map(d => ({
      destination: d.destination,
      revenue: d._sum.totalRevenue || 0,
    }))

    // Trips over time (daily, last 30 days)
    const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000)
    const tripsLast30 = await db.trip.findMany({
      where: {
        departureTime: { gte: thirtyDaysAgo, lte: now },
      },
      select: {
        departureTime: true,
      },
    })
    const dailyTripMap = new Map<string, number>()
    for (let i = 0; i < 30; i++) {
      const day = new Date(now.getTime() - (29 - i) * 24 * 60 * 60 * 1000)
      const dayStr = day.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
      dailyTripMap.set(dayStr, 0)
    }
    for (const trip of tripsLast30) {
      const dayStr = trip.departureTime.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
      dailyTripMap.set(dayStr, (dailyTripMap.get(dayStr) || 0) + 1)
    }
    const tripsOverTime = Array.from(dailyTripMap, ([date, count]) => ({ date, count }))

    // Expense summary by category
    const expenseSummaryRaw = await db.expense.groupBy({
      by: ['category'],
      _sum: { amount: true },
      orderBy: { _sum: { amount: 'desc' } },
    })
    const expenseSummary = expenseSummaryRaw.map(e => ({
      category: e.category,
      amount: e._sum.amount || 0,
    }))

    // Fleet utilization
    const fleetUtilization = {
      active: activeTrucks,
      inactive: totalTrucks - activeTrucks,
      total: totalTrucks,
    }

    // ============ KPI DATA FOR SELECTED RANGE ============

    // Revenue for current range (terminal statuses)
    const currentRangeRevenue = await db.trip.aggregate({
      _sum: { totalRevenue: true },
      where: {
        status: { in: ['completed', 'cancelled'] },
        departureTime: { gte: rangeStart, lte: rangeEnd },
      },
    })
    const totalRevenuePeriod = currentRangeRevenue._sum.totalRevenue || 0

    // Revenue for previous range
    const prevRangeRevenue = await db.trip.aggregate({
      _sum: { totalRevenue: true },
      where: {
        status: { in: ['completed', 'cancelled'] },
        departureTime: { gte: prevRangeStart, lte: prevRangeEnd },
      },
    })
    const prevRevenuePeriod = prevRangeRevenue._sum.totalRevenue || 0

    // Trip count for current range
    const currentRangeTrips = await db.trip.count({
      where: {
        departureTime: { gte: rangeStart, lte: rangeEnd },
      },
    })
    const prevRangeTrips = await db.trip.count({
      where: {
        departureTime: { gte: prevRangeStart, lte: prevRangeEnd },
      },
    })

    // Average trip revenue for current range
    const avgTripRevenue = currentRangeTrips > 0 ? totalRevenuePeriod / currentRangeTrips : 0
    const prevAvgTripRevenue = prevRangeTrips > 0 ? prevRevenuePeriod / prevRangeTrips : 0

    return NextResponse.json({
      // Existing dashboard data
      totalTrucks,
      activeTrucks,
      totalDrivers,
      activeTripsCount,
      monthlyRevenue: monthlyRevenue._sum.totalRevenue || 0,
      monthlyExpenses: monthlyExpenses._sum.amount || 0,
      monthlyFuelCost,
      monthlyFuelLiters,
      monthlyFuelEntries,
      monthlyAvgCostPerLiter,
      recentTrips,
      upcomingMaintenance,
      activeTrips,
      tripStatusDistribution: tripStatusDistribution.map((s) => ({
        status: s.status,
        count: s._count.status,
      })),
      monthlyData,

      // Analytics data
      revenueByMonth,
      tripsByStatus,
      topRoutes,
      topDrivers,
      revenueByDestination,
      tripsOverTime,
      expenseSummary,
      fleetUtilization,

      // KPI data for range
      kpis: {
        totalRevenuePeriod,
        totalTripsPeriod: currentRangeTrips,
        avgTripRevenue,
        fleetUtilizationPercent: totalTrucks > 0 ? Math.round((activeTrucks / totalTrucks) * 100) : 0,
        revenueTrend: prevRevenuePeriod > 0
          ? Math.round(((totalRevenuePeriod - prevRevenuePeriod) / prevRevenuePeriod) * 100)
          : totalRevenuePeriod > 0 ? 100 : 0,
        tripsTrend: prevRangeTrips > 0
          ? Math.round(((currentRangeTrips - prevRangeTrips) / prevRangeTrips) * 100)
          : currentRangeTrips > 0 ? 100 : 0,
        avgRevenueTrend: prevAvgTripRevenue > 0
          ? Math.round(((avgTripRevenue - prevAvgTripRevenue) / prevAvgTripRevenue) * 100)
          : avgTripRevenue > 0 ? 100 : 0,
      },
    })
  } catch (error) {
    console.error('Dashboard API error:', error)
    return NextResponse.json(
      { error: 'Failed to load dashboard data' },
      { status: 500 }
    )
  }
}
