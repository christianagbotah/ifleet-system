import { NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { startOfMonth, endOfMonth } from 'date-fns'

export async function GET() {
  try {
    const now = new Date()
    const monthStart = startOfMonth(now)
    const monthEnd = endOfMonth(now)

    const [
      completedTripsData,
      allTripsData,
      totalTripsCount,
      completedTripsCount,
      activeDriverCount,
      activeTruckCount,
      pendingCashAdvanceResult,
      pendingIncentiveResult,
      thisMonthTripsResult,
      thisMonthCompletedTripsResult,
    ] = await Promise.all([
      // Average trip revenue and distance (completed trips only)
      db.trip.aggregate({
        where: { status: 'completed' },
        _avg: { totalAmount: true, distance: true },
        _sum: { totalAmount: true, distance: true, fuelUsed: true },
        _count: true,
      }),

      // Total distance across ALL trips
      db.trip.aggregate({
        _sum: { distance: true, totalAmount: true },
      }),

      // Total trips count
      db.trip.count(),

      // Completed trips count
      db.trip.count({ where: { status: 'completed' } }),

      // Active drivers
      db.driver.count({ where: { status: 'active' } }),

      // Active trucks
      db.truck.count({ where: { status: 'active' } }),

      // Pending cash advance total
      db.cashAdvance.aggregate({
        where: { status: 'pending' },
        _sum: { amount: true },
      }),

      // Pending incentive total
      db.driverIncentive.aggregate({
        where: { status: 'pending' },
        _sum: { amount: true },
      }),

      // Trips created this month
      db.trip.count({
        where: {
          createdAt: { gte: monthStart, lte: monthEnd },
        },
      }),

      // Revenue from this month's completed trips
      db.trip.aggregate({
        where: {
          status: 'completed',
          createdAt: { gte: monthStart, lte: monthEnd },
        },
        _sum: { totalAmount: true },
      }),
    ])

    const completedTrips = completedTripsData._count || 0
    const avgTripRevenue = completedTripsData._avg.totalAmount || 0
    const avgTripDistance = completedTripsData._avg.distance || 0
    const totalDistance = allTripsData._sum.distance || 0
    const totalFuelUsed = completedTripsData._sum.fuelUsed || 0
    const totalRevenue = allTripsData._sum.totalAmount || 0
    const pendingCashAdvanceTotal = pendingCashAdvanceResult._sum.amount || 0
    const pendingIncentiveTotal = pendingIncentiveResult._sum.amount || 0
    const thisMonthTrips = thisMonthTripsResult
    const thisMonthRevenue = thisMonthCompletedTripsResult._sum.totalAmount || 0

    const completionRate = totalTripsCount > 0
      ? (completedTripsCount / totalTripsCount) * 100
      : 0

    const fuelEfficiency = totalFuelUsed > 0
      ? totalDistance / totalFuelUsed
      : 0

    const costPerKm = totalDistance > 0
      ? totalRevenue / totalDistance
      : 0

    return NextResponse.json({
      avgTripRevenue,
      avgTripDistance,
      totalDistance,
      fuelEfficiency,
      costPerKm,
      revenuePerTrip: avgTripRevenue,
      completionRate: Math.round(completionRate * 10) / 10,
      activeDriverCount,
      activeTruckCount,
      pendingCashAdvanceTotal,
      pendingIncentiveTotal,
      thisMonthTrips,
      thisMonthRevenue,
      totalTrips: totalTripsCount,
      completedTrips: completedTripsCount,
    })
  } catch (error) {
    console.error('Error fetching dashboard KPIs:', error)
    return NextResponse.json(
      { error: 'Failed to fetch dashboard KPIs' },
      { status: 500 }
    )
  }
}
