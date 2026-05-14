import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { requireAuth } from '@/lib/auth-server'

// Average fuel efficiency for heavy trucks in Ghana (km per liter)
const AVG_KM_PER_LITER = 4.0

export async function GET(request: NextRequest) {
  const auth = requireAuth(request)
  if (auth instanceof NextResponse) return auth

  const { searchParams } = new URL(request.url)
  const truckId = searchParams.get('truckId') || undefined
  const dateFrom = searchParams.get('dateFrom') || undefined
  const dateTo = searchParams.get('dateTo') || undefined

  try {
    // Build date filters
    const dateFilter: Record<string, Date> = {}
    if (dateFrom) dateFilter.gte = new Date(dateFrom)
    if (dateTo) dateFilter.lte = new Date(dateTo)

    // ─── Fetch all trucks ───
    const truckWhere: Record<string, unknown> = { status: { in: ['active', 'inactive', 'maintenance'] } }
    if (truckId) truckWhere.id = truckId

    const trucks = await db.truck.findMany({
      where: truckWhere as Record<string, string | object>,
      select: {
        id: true,
        plateNumber: true,
        make: true,
        model: true,
        currentMileage: true,
      },
      orderBy: { plateNumber: 'asc' },
    })

    if (trucks.length === 0) {
      return NextResponse.json({
        fleetAvg: {
          costPerKm: 0,
          costPerTon: 0,
          totalCosts: 0,
          totalDistance: 0,
          totalTonnage: 0,
          truckCount: 0,
        },
        byTruck: [],
        monthlyTrend: [],
      })
    }

    const truckIds = trucks.map(t => t.id)

    // ─── Fetch fuel logs ───
    const fuelLogs = await db.fuelLog.findMany({
      where: {
        truckId: { in: truckIds },
        ...(dateFrom || dateTo ? { date: dateFilter } : {}),
      },
      select: {
        truckId: true,
        litersFilled: true,
        totalCost: true,
        date: true,
        odometer: true,
      },
      orderBy: { date: 'asc' },
    })

    // ─── Fetch expenses (non-fuel) ───
    const expenses = await db.expense.findMany({
      where: {
        truckId: { in: truckIds },
        status: 'approved',
        ...(dateFrom || dateTo ? { date: dateFilter } : {}),
      },
      select: {
        truckId: true,
        category: true,
        amount: true,
        date: true,
      },
    })

    // ─── Fetch maintenance records ───
    const maintenanceRecords = await db.maintenanceRecord.findMany({
      where: {
        truckId: { in: truckIds },
        status: 'completed',
        ...(dateFrom || dateTo ? { performedAt: dateFilter } : {}),
      },
      select: {
        truckId: true,
        cost: true,
        performedAt: true,
      },
    })

    // ─── Fetch completed trips (for tonnage and mileage) ───
    const completedStatuses = [
      'offloaded', 'completed', 'arrived_depot',
    ]
    const trips = await db.trip.findMany({
      where: {
        truckId: { in: truckIds },
        status: { in: completedStatuses },
        ...(dateFrom || dateTo ? { departureTime: dateFilter } : {}),
      },
      select: {
        truckId: true,
        quantity: true,
        unit: true,
        totalMileage: true,
        startMileage: true,
        endMileage: true,
        fuelUsed: true,
        departureTime: true,
      },
    })

    // ─── Process per-truck data ───
    const byTruck = trucks.map(truck => {
      const truckFuelLogs = fuelLogs.filter(fl => fl.truckId === truck.id)
      const truckExpenses = expenses.filter(e => e.truckId === truck.id)
      const truckMaintenance = maintenanceRecords.filter(m => m.truckId === truck.id)
      const truckTrips = trips.filter(t => t.truckId === truck.id)

      // Fuel costs
      const fuelCost = truckFuelLogs.reduce((sum, fl) => sum + fl.totalCost, 0)
      const totalFuelLiters = truckFuelLogs.reduce((sum, fl) => sum + fl.litersFilled, 0)

      // Maintenance costs
      const maintenanceCost = truckMaintenance.reduce((sum, m) => sum + (m.cost || 0), 0)

      // Other expenses (exclude fuel and maintenance categories since we track them separately)
      const otherCost = truckExpenses
        .filter(e => !['fuel', 'maintenance'].includes(e.category))
        .reduce((sum, e) => sum + e.amount, 0)

      // Total costs
      const totalCosts = fuelCost + maintenanceCost + otherCost

      // Distance calculation:
      // 1. Try Trip.endMileage - Trip.startMileage
      // 2. Try Trip.totalMileage
      // 3. Fall back to fuel consumed * average km/L
      let totalDistance = 0
      for (const trip of truckTrips) {
        if (trip.endMileage && trip.startMileage && trip.endMileage > trip.startMileage) {
          totalDistance += (trip.endMileage - trip.startMileage)
        } else if (trip.totalMileage && trip.totalMileage > 0) {
          totalDistance += trip.totalMileage
        } else if (trip.fuelUsed && trip.fuelUsed > 0) {
          totalDistance += trip.fuelUsed * AVG_KM_PER_LITER
        }
      }

      // If no trip distance found, use fuel logs to estimate
      if (totalDistance === 0 && totalFuelLiters > 0) {
        totalDistance = totalFuelLiters * AVG_KM_PER_LITER
      }

      // Tonnage: sum of quantity for completed trips
      // Convert to tonnes: bags = 0.05t each (50kg bags), tonnes = 1t each
      let totalTonnage = 0
      for (const trip of truckTrips) {
        if (trip.unit === 'bags') {
          totalTonnage += trip.quantity * 0.05
        } else if (trip.unit === 'tonnes' || trip.unit === 'ton') {
          totalTonnage += trip.quantity
        } else if (trip.unit === 'pallets') {
          totalTonnage += trip.quantity * 1.0 // ~1 tonne per pallet
        } else {
          // Default: assume metric tonnes
          totalTonnage += trip.quantity
        }
      }

      const costPerKm = totalDistance > 0 ? totalCosts / totalDistance : 0
      const costPerTon = totalTonnage > 0 ? totalCosts / totalTonnage : 0

      return {
        truckId: truck.id,
        plateNumber: truck.plateNumber,
        make: truck.make,
        model: truck.model,
        totalDistance: Math.round(totalDistance * 100) / 100,
        totalTonnage: Math.round(totalTonnage * 100) / 100,
        totalCosts: Math.round(totalCosts * 100) / 100,
        costPerKm: Math.round(costPerKm * 100) / 100,
        costPerTon: Math.round(costPerTon * 100) / 100,
        fuelCost: Math.round(fuelCost * 100) / 100,
        maintenanceCost: Math.round(maintenanceCost * 100) / 100,
        otherCost: Math.round(otherCost * 100) / 100,
      }
    })

    // ─── Fleet averages ───
    const totalCosts = byTruck.reduce((sum, t) => sum + t.totalCosts, 0)
    const totalDistance = byTruck.reduce((sum, t) => sum + t.totalDistance, 0)
    const totalTonnage = byTruck.reduce((sum, t) => sum + t.totalTonnage, 0)

    const fleetAvg = {
      costPerKm: totalDistance > 0 ? Math.round((totalCosts / totalDistance) * 100) / 100 : 0,
      costPerTon: totalTonnage > 0 ? Math.round((totalCosts / totalTonnage) * 100) / 100 : 0,
      totalCosts: Math.round(totalCosts * 100) / 100,
      totalDistance: Math.round(totalDistance * 100) / 100,
      totalTonnage: Math.round(totalTonnage * 100) / 100,
      truckCount: byTruck.length,
    }

    // ─── Monthly trend (last 6 months) ───
    const now = new Date()
    const monthlyTrend: {
      month: string
      year: number
      totalCosts: number
      totalDistance: number
      avgCostPerKm: number
      avgCostPerTon: number
      tripCount: number
    }[] = []

    for (let i = 5; i >= 0; i--) {
      const monthDate = new Date(now.getFullYear(), now.getMonth() - i, 1)
      const monthStart = new Date(monthDate.getFullYear(), monthDate.getMonth(), 1)
      const monthEnd = new Date(monthDate.getFullYear(), monthDate.getMonth() + 1, 0, 23, 59, 59, 999)

      const monthName = monthDate.toLocaleString('en-US', { month: 'short' })

      // Fuel logs for this month
      const monthFuelLogs = fuelLogs.filter(fl => {
        const d = new Date(fl.date)
        return d >= monthStart && d <= monthEnd
      })
      const monthFuelCost = monthFuelLogs.reduce((s, fl) => s + fl.totalCost, 0)
      const monthFuelLiters = monthFuelLogs.reduce((s, fl) => s + fl.litersFilled, 0)

      // Expenses for this month
      const monthExpenses = expenses.filter(e => {
        const d = new Date(e.date)
        return d >= monthStart && d <= monthEnd
      })
      const monthExpenseCost = monthExpenses
        .filter(e => !['fuel', 'maintenance'].includes(e.category))
        .reduce((s, e) => s + e.amount, 0)

      // Maintenance for this month
      const monthMaintenance = maintenanceRecords.filter(m => {
        const d = new Date(m.performedAt)
        return d >= monthStart && d <= monthEnd
      })
      const monthMaintCost = monthMaintenance.reduce((s, m) => s + (m.cost || 0), 0)

      // Trips for this month
      const monthTrips = trips.filter(t => {
        const d = new Date(t.departureTime)
        return d >= monthStart && d <= monthEnd
      })

      // Distance for this month
      let monthDistance = 0
      let monthTonnage = 0
      for (const trip of monthTrips) {
        if (trip.endMileage && trip.startMileage && trip.endMileage > trip.startMileage) {
          monthDistance += (trip.endMileage - trip.startMileage)
        } else if (trip.totalMileage && trip.totalMileage > 0) {
          monthDistance += trip.totalMileage
        } else if (trip.fuelUsed && trip.fuelUsed > 0) {
          monthDistance += trip.fuelUsed * AVG_KM_PER_LITER
        }
        if (trip.unit === 'bags') {
          monthTonnage += trip.quantity * 0.05
        } else if (trip.unit === 'tonnes' || trip.unit === 'ton') {
          monthTonnage += trip.quantity
        } else {
          monthTonnage += trip.quantity
        }
      }
      if (monthDistance === 0 && monthFuelLiters > 0) {
        monthDistance = monthFuelLiters * AVG_KM_PER_LITER
      }

      const monthTotalCosts = monthFuelCost + monthMaintCost + monthExpenseCost
      monthlyTrend.push({
        month: monthName,
        year: monthDate.getFullYear(),
        totalCosts: Math.round(monthTotalCosts * 100) / 100,
        totalDistance: Math.round(monthDistance * 100) / 100,
        avgCostPerKm: monthDistance > 0 ? Math.round((monthTotalCosts / monthDistance) * 100) / 100 : 0,
        avgCostPerTon: monthTonnage > 0 ? Math.round((monthTotalCosts / monthTonnage) * 100) / 100 : 0,
        tripCount: monthTrips.length,
      })
    }

    return NextResponse.json({ fleetAvg, byTruck, monthlyTrend })
  } catch (error) {
    console.error('Cost analytics error:', error)
    return NextResponse.json(
      { error: 'Failed to load cost analytics' },
      { status: 500 }
    )
  }
}
