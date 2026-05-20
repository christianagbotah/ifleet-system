import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { format } from 'date-fns'
import { requireAuth } from '@/lib/auth-server'

export async function GET(request: NextRequest) {
  try {
    const auth = requireAuth(request)
    if (auth instanceof NextResponse) return auth

    // Run all independent queries in parallel
    const [
      allTrips,
      allCashAdvances,
      allIncentives,
      completedRevenueResult,
      pendingTripsRevenueResult,
      pendingCashAdvancesResult,
      pendingIncentivesResult,
    ] = await Promise.all([
      db.trip.findMany({
        include: {
          driver: { select: { id: true, firstName: true, lastName: true } },
          truck: { select: { id: true, plateNumber: true, truckName: true } },
        },
      }),
      db.cashAdvance.findMany({
        where: { status: 'pending' },
      }),
      db.driverIncentive.findMany({
        where: { status: 'pending' },
      }),
      // Completed trips revenue
      db.trip.aggregate({
        where: { status: 'completed' },
        _sum: { totalAmount: true },
      }),
      // Pending trips revenue
      db.trip.aggregate({
        where: { status: 'pending' },
        _sum: { totalAmount: true },
      }),
      // Pending cash advances amount
      db.cashAdvance.aggregate({
        where: { status: 'pending' },
        _sum: { amount: true },
      }),
      // Pending incentives amount
      db.driverIncentive.aggregate({
        where: { status: 'pending' },
        _sum: { amount: true },
      }),
    ])

    // All cash advances total
    const totalCashAdvancesResult = await db.cashAdvance.aggregate({
      _sum: { amount: true },
    })

    // All incentives total
    const totalIncentivesResult = await db.driverIncentive.aggregate({
      _sum: { amount: true },
    })

    const completedRevenue = completedRevenueResult._sum.totalAmount || 0
    const pendingRevenue = pendingTripsRevenueResult._sum.totalAmount || 0
    const totalCashAdvances = totalCashAdvancesResult._sum.amount || 0
    const totalIncentives = totalIncentivesResult._sum.amount || 0
    const pendingCashAdvances = pendingCashAdvancesResult._sum.amount || 0
    const pendingIncentives = pendingIncentivesResult._sum.amount || 0

    const totalRevenue = allTrips.reduce((sum, t) => sum + t.totalAmount, 0)
    const netIncome = totalRevenue - totalCashAdvances - totalIncentives

    const getDriverName = (driver: { firstName: string; lastName: string } | null) =>
      driver ? `${driver.firstName} ${driver.lastName}` : 'Unknown'

    // ── Financial Summary ──
    const financialSummary = {
      totalRevenue: Math.round(totalRevenue * 100) / 100,
      totalCashAdvances: Math.round(totalCashAdvances * 100) / 100,
      totalIncentives: Math.round(totalIncentives * 100) / 100,
      netIncome: Math.round(netIncome * 100) / 100,
      completedTripsRevenue: Math.round(completedRevenue * 100) / 100,
      pendingTripsRevenue: Math.round(pendingRevenue * 100) / 100,
      pendingCashAdvances: Math.round(pendingCashAdvances * 100) / 100,
      pendingIncentives: Math.round(pendingIncentives * 100) / 100,
    }

    // ── Driver Performance ──
    const driverMap = new Map<string, {
      driverId: string
      driverName: string
      totalTrips: number
      completedTrips: number
      totalDistance: number
      totalRevenue: number
      totalFuelUsed: number
    }>()

    for (const trip of allTrips) {
      const driverId = trip.driverId
      if (!driverMap.has(driverId)) {
        driverMap.set(driverId, {
          driverId,
          driverName: getDriverName(trip.driver),
          totalTrips: 0,
          completedTrips: 0,
          totalDistance: 0,
          totalRevenue: 0,
          totalFuelUsed: 0,
        })
      }
      const d = driverMap.get(driverId)!
      d.totalTrips += 1
      if (trip.status === 'completed') d.completedTrips += 1
      d.totalDistance += trip.distance
      d.totalRevenue += trip.totalAmount
      d.totalFuelUsed += trip.fuelUsed
    }

    const driverPerformance = Array.from(driverMap.values()).map((d) => ({
      driverId: d.driverId,
      driverName: d.driverName,
      totalTrips: d.totalTrips,
      completedTrips: d.completedTrips,
      totalDistance: Math.round(d.totalDistance * 10) / 10,
      totalRevenue: Math.round(d.totalRevenue * 100) / 100,
      totalFuelUsed: Math.round(d.totalFuelUsed * 10) / 10,
      avgRevenuePerTrip: d.totalTrips > 0
        ? Math.round((d.totalRevenue / d.totalTrips) * 100) / 100
        : 0,
      avgDistancePerTrip: d.totalTrips > 0
        ? Math.round((d.totalDistance / d.totalTrips) * 10) / 10
        : 0,
      fuelEfficiency: d.totalFuelUsed > 0
        ? Math.round((d.totalDistance / d.totalFuelUsed) * 10) / 10
        : 0,
    }))

    // ── Truck Utilization ──
    const truckMap = new Map<string, {
      truckId: string
      plateNumber: string
      truckName: string
      totalTrips: number
      totalDistance: number
      totalRevenue: number
      activeDays: Set<string>
    }>()

    for (const trip of allTrips) {
      const truckId = trip.truckId
      if (!truckMap.has(truckId)) {
        truckMap.set(truckId, {
          truckId,
          plateNumber: trip.truck?.plateNumber || 'Unknown',
          truckName: trip.truck?.truckName || 'Unknown',
          totalTrips: 0,
          totalDistance: 0,
          totalRevenue: 0,
          activeDays: new Set(),
        })
      }
      const t = truckMap.get(truckId)!
      t.totalTrips += 1
      t.totalDistance += trip.distance
      t.totalRevenue += trip.totalAmount
      if (trip.departureDate) {
        t.activeDays.add(format(new Date(trip.departureDate), 'yyyy-MM-dd'))
      }
    }

    const truckUtilization = Array.from(truckMap.values()).map((t) => ({
      truckId: t.truckId,
      plateNumber: t.plateNumber,
      truckName: t.truckName,
      totalTrips: t.totalTrips,
      totalDistance: Math.round(t.totalDistance * 10) / 10,
      totalRevenue: Math.round(t.totalRevenue * 100) / 100,
      activeDays: t.activeDays.size,
    }))

    // ── Monthly Revenue ──
    const monthlyMap = new Map<string, { revenue: number; trips: number; expenses: number }>()

    for (const trip of allTrips) {
      const month = format(new Date(trip.createdAt), 'yyyy-MM')
      if (!monthlyMap.has(month)) {
        monthlyMap.set(month, { revenue: 0, trips: 0, expenses: 0 })
      }
      const m = monthlyMap.get(month)!
      m.revenue += trip.totalAmount
      m.trips += 1
    }

    // Add cash advances and incentives expenses per month
    const allCashAdvancesAll = await db.cashAdvance.findMany()
    const allIncentivesAll = await db.driverIncentive.findMany()

    for (const ca of allCashAdvancesAll) {
      const month = format(new Date(ca.createdAt), 'yyyy-MM')
      if (!monthlyMap.has(month)) {
        monthlyMap.set(month, { revenue: 0, trips: 0, expenses: 0 })
      }
      monthlyMap.get(month)!.expenses += ca.amount
    }

    for (const inc of allIncentivesAll) {
      const month = format(new Date(inc.createdAt), 'yyyy-MM')
      if (!monthlyMap.has(month)) {
        monthlyMap.set(month, { revenue: 0, trips: 0, expenses: 0 })
      }
      monthlyMap.get(month)!.expenses += inc.amount
    }

    const monthlyRevenue = Array.from(monthlyMap.entries())
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([month, data]) => ({
        month,
        revenue: Math.round(data.revenue * 100) / 100,
        trips: data.trips,
        expenses: Math.round(data.expenses * 100) / 100,
      }))

    // ── Trip Status Breakdown ──
    const tripStatusBreakdown = {
      pending: allTrips.filter((t) => t.status === 'pending').length,
      in_progress: allTrips.filter((t) => t.status === 'in_progress').length,
      completed: allTrips.filter((t) => t.status === 'completed').length,
      cancelled: allTrips.filter((t) => t.status === 'cancelled').length,
    }

    // ── Cargo Stats ──
    const tripsWithCargo = allTrips.filter((t) => t.cargoWeight > 0)
    const cargoWeightMap = new Map<string, number>()
    for (const trip of allTrips) {
      if (trip.cargoDescription) {
        const desc = trip.cargoDescription.trim()
        if (desc) {
          cargoWeightMap.set(desc, (cargoWeightMap.get(desc) || 0) + 1)
        }
      }
    }

    let mostCommonCargo = 'N/A'
    let maxCount = 0
    for (const [cargo, count] of cargoWeightMap.entries()) {
      if (count > maxCount) {
        maxCount = count
        mostCommonCargo = cargo
      }
    }

    const totalWeight = tripsWithCargo.reduce((sum, t) => sum + t.cargoWeight, 0)
    const cargoStats = {
      totalWeight: Math.round(totalWeight * 100) / 100,
      avgWeightPerTrip: tripsWithCargo.length > 0
        ? Math.round((totalWeight / tripsWithCargo.length) * 100) / 100
        : 0,
      mostCommonCargo,
    }

    return NextResponse.json({
      financialSummary,
      driverPerformance,
      truckUtilization,
      monthlyRevenue,
      tripStatusBreakdown,
      cargoStats,
      generatedAt: format(new Date(), "yyyy-MM-dd'T'HH:mm:ss"),
    })
  } catch (error) {
    console.error('Error fetching reports data:', error)
    return NextResponse.json(
      { error: 'Failed to fetch reports data' },
      { status: 500 }
    )
  }
}
