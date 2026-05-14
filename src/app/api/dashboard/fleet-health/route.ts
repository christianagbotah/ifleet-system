import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { requireAuth } from '@/lib/auth-server'

export async function GET(request: NextRequest) {
  try {
    const auth = requireAuth(request)
    if (auth instanceof NextResponse) return auth

    const now = new Date()
    const thirtyDaysFromNow = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000)
    const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1)
    const startOfLastMonth = new Date(now.getFullYear(), now.getMonth() - 1, 1)
    const endOfLastMonth = new Date(now.getFullYear(), now.getMonth(), 0, 23, 59, 59, 999)

    // ============ TRUCK STATS ============
    const totalTrucks = await db.truck.count()
    const activeTrucks = await db.truck.count({ where: { status: 'active' } })
    const idleTrucks = await db.truck.count({ where: { status: 'inactive' } })
    const maintenanceTrucks = await db.truck.count({ where: { status: 'maintenance' } })

    // ============ DRIVER STATS ============
    const totalDrivers = await db.driver.count()

    // Drivers on active trips (trips in progress)
    const driversOnTrip = await db.trip.groupBy({
      by: ['driverId'],
      where: { status: { in: ['loading', 'loaded', 'in_transit', 'departed_depot', 'arrived_destination', 'offloading', 'return_journey'] } },
    })
    const onTripCount = driversOnTrip.length

    // Available drivers = total active drivers minus those on trips
    const activeDrivers = await db.driver.count({ where: { status: 'active' } })
    const availableDrivers = Math.max(0, activeDrivers - onTripCount)

    // ============ COMPLIANCE ALERTS ============
    // DVLA registrations expiring within 30 days
    const dvlaAlerts = await db.dvlaRegistration.count({
      where: {
        expiryDate: { lte: thirtyDaysFromNow, gte: now },
        status: 'active',
      },
    })

    // Roadworthy certificates expiring within 30 days
    const roadworthyAlerts = await db.roadworthyInspection.count({
      where: {
        certificateExpiry: { lte: thirtyDaysFromNow, gte: now },
        status: 'completed',
      },
    })

    // Insurance policies expiring within 30 days
    const insuranceAlerts = await db.insurance.count({
      where: {
        endDate: { lte: thirtyDaysFromNow, gte: now },
        status: 'active',
      },
    })

    // Driver licenses expiring within 30 days
    const licenseAlerts = await db.driver.count({
      where: {
        licenseExpiry: { lte: thirtyDaysFromNow, gte: now },
        status: 'active',
      },
    })

    const complianceAlerts = dvlaAlerts + roadworthyAlerts + insuranceAlerts + licenseAlerts

    // ============ OVERDUE MAINTENANCE ============
    const overdueMaintenance = await db.maintenanceRecord.count({
      where: {
        status: { in: ['pending', 'in_progress'] },
        nextDueDate: { lt: now },
      },
    })

    // ============ FUEL EFFICIENCY TREND ============
    // This month: total km from completed trips / total liters from fuel logs
    const thisMonthTrips = await db.trip.findMany({
      where: {
        status: { in: ['completed', 'offloaded', 'arrived_depot'] },
        departureTime: { gte: startOfMonth, lte: now },
        totalMileage: { gt: 0 },
      },
      select: { totalMileage: true },
    })
    const thisMonthKm = thisMonthTrips.reduce((sum, t) => sum + (t.totalMileage || 0), 0)

    const thisMonthFuel = await db.fuelLog.aggregate({
      _sum: { litersFilled: true },
      where: { date: { gte: startOfMonth, lte: now } },
    })
    const thisMonthLiters = thisMonthFuel._sum.litersFilled || 0
    const thisMonthEfficiency = thisMonthLiters > 0 ? thisMonthKm / thisMonthLiters : 0

    // Last month: same calculation
    const lastMonthTrips = await db.trip.findMany({
      where: {
        status: { in: ['completed', 'offloaded', 'arrived_depot'] },
        departureTime: { gte: startOfLastMonth, lte: endOfLastMonth },
        totalMileage: { gt: 0 },
      },
      select: { totalMileage: true },
    })
    const lastMonthKm = lastMonthTrips.reduce((sum, t) => sum + (t.totalMileage || 0), 0)

    const lastMonthFuel = await db.fuelLog.aggregate({
      _sum: { litersFilled: true },
      where: { date: { gte: startOfLastMonth, lte: endOfLastMonth } },
    })
    const lastMonthLiters = lastMonthFuel._sum.litersFilled || 0
    const lastMonthEfficiency = lastMonthLiters > 0 ? lastMonthKm / lastMonthLiters : 0

    // Determine trend
    let fuelEfficiencyTrend: 'up' | 'down' | 'stable' = 'stable'
    const efficiencyDiff = thisMonthEfficiency - lastMonthEfficiency
    if (efficiencyDiff > 0.2) {
      fuelEfficiencyTrend = 'up'
    } else if (efficiencyDiff < -0.2) {
      fuelEfficiencyTrend = 'down'
    }

    // ============ TOP ISSUES (up to 3) ============
    const topIssues: { type: string; title: string; count: number; page: string; severity: 'high' | 'medium' | 'low' }[] = []

    if (overdueMaintenance > 0) {
      topIssues.push({
        type: 'overdue_maintenance',
        title: `${overdueMaintenance} overdue maintenance item${overdueMaintenance > 1 ? 's' : ''}`,
        count: overdueMaintenance,
        page: 'maintenance',
        severity: 'high',
      })
    }

    if (complianceAlerts > 0) {
      topIssues.push({
        type: 'compliance',
        title: `${complianceAlerts} document${complianceAlerts > 1 ? 's' : ''} expiring soon`,
        count: complianceAlerts,
        page: 'compliance-center',
        severity: complianceAlerts > 3 ? 'high' : 'medium',
      })
    }

    if (maintenanceTrucks > 0) {
      topIssues.push({
        type: 'trucks_maintenance',
        title: `${maintenanceTrucks} truck${maintenanceTrucks > 1 ? 's' : ''} in maintenance`,
        count: maintenanceTrucks,
        page: 'maintenance',
        severity: maintenanceTrucks > 2 ? 'high' : 'medium',
      })
    }

    if (availableDrivers === 0 && totalDrivers > 0) {
      topIssues.push({
        type: 'no_drivers',
        title: 'No drivers currently available',
        count: 0,
        page: 'drivers',
        severity: 'high',
      })
    }

    // Truncate to top 3
    topIssues.splice(3)

    // ============ OVERALL HEALTH SCORE ============
    // Score is 0-100, calculated from multiple weighted factors
    let score = 100

    // Deduct for overdue maintenance (up to -20)
    score -= Math.min(20, overdueMaintenance * 5)

    // Deduct for compliance alerts (up to -20)
    score -= Math.min(20, complianceAlerts * 4)

    // Deduct for trucks in maintenance (up to -15)
    if (totalTrucks > 0) {
      const maintenanceRatio = maintenanceTrucks / totalTrucks
      score -= Math.round(maintenanceRatio * 30) // up to -30 if all trucks in maintenance
    }

    // Deduct for idle trucks (up to -10)
    if (totalTrucks > 0) {
      const idleRatio = idleTrucks / totalTrucks
      score -= Math.round(idleRatio * 20) // up to -20 if all trucks idle
    }

    // Deduct for driver availability (up to -15)
    if (totalDrivers > 0 && activeDrivers > 0) {
      const availRatio = availableDrivers / activeDrivers
      if (availRatio < 0.2) score -= 15
      else if (availRatio < 0.4) score -= 10
      else if (availRatio < 0.6) score -= 5
    }

    // Deduct for declining fuel efficiency (up to -10)
    if (fuelEfficiencyTrend === 'down') score -= 10
    else if (fuelEfficiencyTrend === 'stable' && thisMonthEfficiency > 0) score -= 2

    // Clamp to 0-100
    score = Math.max(0, Math.min(100, score))

    return NextResponse.json({
      overallScore: score,
      trucks: {
        total: totalTrucks,
        active: activeTrucks,
        idle: idleTrucks,
        maintenance: maintenanceTrucks,
      },
      drivers: {
        total: totalDrivers,
        onTrip: onTripCount,
        available: availableDrivers,
      },
      complianceAlerts,
      overdueMaintenance,
      fuelEfficiencyTrend,
      fuelEfficiency: {
        thisMonth: Math.round(thisMonthEfficiency * 10) / 10,
        lastMonth: Math.round(lastMonthEfficiency * 10) / 10,
      },
      topIssues,
    })
  } catch (error) {
    console.error('Fleet Health API error:', error)
    return NextResponse.json(
      { error: 'Failed to load fleet health data' },
      { status: 500 }
    )
  }
}
