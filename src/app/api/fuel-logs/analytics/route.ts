import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { requireAuth } from '@/lib/auth-server'

export async function GET(request: NextRequest) {
  try {
    const auth = requireAuth(request)
    if (auth instanceof NextResponse) return auth

    const { searchParams } = new URL(request.url)
    const truckId = searchParams.get('truckId')
    const dateFrom = searchParams.get('dateFrom')
    const dateTo = searchParams.get('dateTo')

    // Build base where clause
    const baseWhere: Record<string, unknown> = {}
    if (truckId) baseWhere.truckId = truckId
    if (dateFrom || dateTo) {
      baseWhere.date = {}
      if (dateFrom) (baseWhere.date as Record<string, unknown>).gte = new Date(dateFrom)
      if (dateTo) (baseWhere.date as Record<string, unknown>).lte = new Date(dateTo)
    }

    // ========== SUMMARY ==========
    const summaryAgg = await db.fuelLog.aggregate({
      _sum: { totalCost: true, litersFilled: true },
      _count: { id: true },
      _avg: { costPerLiter: true },
      where: baseWhere,
    })

    const totalLiters = summaryAgg._sum.litersFilled || 0
    const totalCost = summaryAgg._sum.totalCost || 0
    const totalFillUps = summaryAgg._count.id

    // ========== KM/L EFFICIENCY CALCULATION ==========
    // For each truck, calculate efficiency from consecutive odometer readings
    const truckIds = truckId
      ? [truckId]
      : (await db.fuelLog.findMany({ where: baseWhere, select: { truckId: true }, distinct: ['truckId'] })).map(l => l.truckId)

    // Fetch all fuel logs with odometer for these trucks, ordered by date
    const allFuelLogs = truckId
      ? await db.fuelLog.findMany({
          where: { ...baseWhere, truckId },
          orderBy: [{ truckId: 'asc' }, { date: 'asc' }],
          select: { truckId: true, odometer: true, litersFilled: true, date: true },
        })
      : truckIds.length > 0
        ? await db.fuelLog.findMany({
            where: baseWhere,
            orderBy: [{ truckId: 'asc' }, { date: 'asc' }],
            select: { truckId: true, odometer: true, litersFilled: true, date: true },
          })
        : []

    // Calculate per-truck efficiency using consecutive odometer readings
    const truckEfficiencies = new Map<string, { totalDistance: number; totalLiters: number; count: number }>()

    // Group logs by truck
    const logsByTruck = new Map<string, typeof allFuelLogs>()
    for (const log of allFuelLogs) {
      const existing = logsByTruck.get(log.truckId) || []
      existing.push(log)
      logsByTruck.set(log.truckId, existing)
    }

    for (const [tid, logs] of logsByTruck) {
      let totalDist = 0
      let totalLtrs = 0
      let count = 0
      for (let i = 1; i < logs.length; i++) {
        const prev = logs[i - 1]
        const curr = logs[i]
        if (prev.odometer && curr.odometer && curr.litersFilled > 0) {
          const dist = curr.odometer - prev.odometer
          if (dist > 0) { // Only count forward mileage
            totalDist += dist
            totalLtrs += curr.litersFilled
            count++
          }
        }
      }
      if (count > 0) {
        truckEfficiencies.set(tid, { totalDistance: totalDist, totalLiters: totalLtrs, count })
      }
    }

    // Fallback: use trip data for trucks without odometer-based efficiency
    const trucksNeedingFallback = truckIds.filter(id => !truckEfficiencies.has(id))
    if (trucksNeedingFallback.length > 0) {
      const tripAgg = await db.trip.groupBy({
        by: ['truckId'],
        _sum: { totalMileage: true, fuelUsed: true },
        where: {
          truckId: { in: trucksNeedingFallback },
          status: { in: ['completed', 'in_transit'] },
        },
      })
      for (const t of tripAgg) {
        const mileage = t._sum.totalMileage || 0
        const fuel = t._sum.fuelUsed || 0
        if (mileage > 0 && fuel > 0) {
          truckEfficiencies.set(t.truckId, { totalDistance: mileage, totalLiters: fuel, count: 1 })
        }
      }
    }

    // Calculate overall average efficiency
    let globalTotalDist = 0
    let globalTotalLtrs = 0
    for (const eff of truckEfficiencies.values()) {
      globalTotalDist += eff.totalDistance
      globalTotalLtrs += eff.totalLiters
    }
    const avgEfficiency = globalTotalLtrs > 0 ? globalTotalDist / globalTotalLtrs : 0

    // ========== BY TRUCK ==========
    const truckAgg = await db.fuelLog.groupBy({
      by: ['truckId'],
      _sum: { totalCost: true, litersFilled: true },
      _count: { id: true },
      _avg: { costPerLiter: true },
      where: baseWhere,
      orderBy: { _sum: { totalCost: 'desc' } },
    })

    const truckDetails = truckAgg.length > 0
      ? await db.truck.findMany({
          where: { id: { in: truckAgg.map(t => t.truckId) } },
          select: { id: true, plateNumber: true, make: true, model: true },
        })
      : []

    const truckMap = new Map(truckDetails.map(t => [t.id, t]))

    const byTruck = truckAgg.map(t => {
      const truck = truckMap.get(t.truckId)
      const eff = truckEfficiencies.get(t.truckId)
      return {
        truckId: t.truckId,
        plateNumber: truck?.plateNumber || 'Unknown',
        make: truck?.make || '',
        model: truck?.model || '',
        totalLiters: t._sum.litersFilled || 0,
        totalCost: t._sum.totalCost || 0,
        avgCostPerLiter: t._avg.costPerLiter || 0,
        fillCount: t._count.id,
        avgEfficiency: eff && eff.totalLiters > 0 ? eff.totalDistance / eff.totalLiters : 0,
        totalDistance: eff?.totalDistance || 0,
      }
    })

    // ========== MONTHLY TREND (last 6 months) ==========
    const now = new Date()
    const monthlyTrend = []

    for (let i = 5; i >= 0; i--) {
      const mStart = new Date(now.getFullYear(), now.getMonth() - i, 1)
      const mEnd = new Date(now.getFullYear(), now.getMonth() - i + 1, 0, 23, 59, 59, 999)

      const monthWhere: Record<string, unknown> = {
        date: { gte: mStart, lte: mEnd },
      }
      if (truckId) monthWhere.truckId = truckId

      const agg = await db.fuelLog.aggregate({
        _sum: { totalCost: true, litersFilled: true },
        _count: { id: true },
        _avg: { costPerLiter: true },
        where: monthWhere,
      })

      // Calculate monthly efficiency using odometer readings for this month
      const monthLogs = truckId
        ? await db.fuelLog.findMany({
            where: { ...monthWhere, truckId },
            orderBy: [{ truckId: 'asc' }, { date: 'asc' }],
            select: { truckId: true, odometer: true, litersFilled: true },
          })
        : await db.fuelLog.findMany({
            where: monthWhere,
            orderBy: [{ truckId: 'asc' }, { date: 'asc' }],
            select: { truckId: true, odometer: true, litersFilled: true },
          })

      let mDist = 0
      let mLtrs = 0
      const mByTruck = new Map<string, typeof monthLogs>()
      for (const l of monthLogs) {
        mByTruck.set(l.truckId, [...(mByTruck.get(l.truckId) || []), l])
      }
      for (const [, mLogs] of mByTruck) {
        for (let j = 1; j < mLogs.length; j++) {
          if (mLogs[j - 1].odometer && mLogs[j].odometer && mLogs[j].litersFilled > 0) {
            const d = mLogs[j].odometer - mLogs[j - 1].odometer
            if (d > 0) { mDist += d; mLtrs += mLogs[j].litersFilled }
          }
        }
      }

      const mLiters = agg._sum.litersFilled || 0
      monthlyTrend.push({
        month: mStart.toLocaleString('en-US', { month: 'short', year: '2-digit' }),
        year: mStart.getFullYear(),
        monthIndex: mStart.getMonth() + 1,
        totalLiters: mLiters,
        totalCost: agg._sum.totalCost || 0,
        avgCostPerLiter: mLiters > 0 ? (agg._sum.totalCost || 0) / mLiters : 0,
        avgEfficiency: mLtrs > 0 ? mDist / mLtrs : 0,
        fillCount: agg._count.id,
      })
    }

    // ========== BY FUEL TYPE ==========
    const fuelTypeAgg = await db.fuelLog.groupBy({
      by: ['fuelType'],
      _sum: { totalCost: true, litersFilled: true },
      _count: { id: true },
      _avg: { costPerLiter: true },
      where: baseWhere,
    })

    const byFuelType = fuelTypeAgg.map(f => ({
      fuelType: f.fuelType,
      totalLiters: f._sum.litersFilled || 0,
      totalCost: f._sum.totalCost || 0,
      avgCostPerLiter: f._avg.costPerLiter || 0,
      fillCount: f._count.id,
    }))

    // ========== BY STATION ==========
    const stationWhere: Record<string, unknown> = { ...baseWhere, stationName: { not: null } }
    const stationAgg = await db.fuelLog.groupBy({
      by: ['stationName'],
      _sum: { totalCost: true, litersFilled: true },
      _count: { id: true },
      _avg: { costPerLiter: true },
      where: stationWhere,
      orderBy: { _sum: { totalCost: 'desc' } },
    })

    const byStation = stationAgg.map(s => ({
      stationName: s.stationName || 'Unknown',
      totalCost: s._sum.totalCost || 0,
      totalLiters: s._sum.litersFilled || 0,
      fillCount: s._count.id,
      avgCostPerLiter: s._avg.costPerLiter || 0,
    }))

    // ========== TOP CONSUMERS (by total cost) ==========
    const topConsumers = byTruck.slice(0, 10).map(t => ({
      truckId: t.truckId,
      plateNumber: t.plateNumber,
      totalCost: t.totalCost,
      totalLiters: t.totalLiters,
      fillCount: t.fillCount,
    }))

    // ========== PRICE TREND (avg cost per liter per month) ==========
    const priceTrend = monthlyTrend.map(m => ({
      month: m.month,
      avgCostPerLiter: m.avgCostPerLiter,
    }))

    return NextResponse.json({
      summary: {
        totalLiters,
        totalCost,
        avgCostPerLiter: totalLiters > 0 ? totalCost / totalLiters : 0,
        avgEfficiency,
        totalFillUps,
      },
      byTruck,
      monthlyTrend,
      byFuelType,
      byStation,
      topConsumers,
      priceTrend,
    })
  } catch (error) {
    console.error('Fuel Analytics API error:', error)
    return NextResponse.json(
      { error: 'Failed to load fuel analytics' },
      { status: 500 }
    )
  }
}
