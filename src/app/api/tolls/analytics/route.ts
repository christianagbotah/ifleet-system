import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { requireAuth } from '@/lib/auth-server'

export async function GET(request: NextRequest) {
  try {
    const auth = requireAuth(request)
    if (auth instanceof NextResponse) return auth

    const { searchParams } = new URL(request.url)
    const dateFrom = searchParams.get('dateFrom')
    const dateTo = searchParams.get('dateTo')

    // Default to current year if no dates provided
    const now = new Date()
    const startOfYear = new Date(now.getFullYear(), 0, 1)
    const endOfYear = new Date(now.getFullYear(), 11, 31, 23, 59, 59)

    const startDate = dateFrom ? new Date(dateFrom) : startOfYear
    const endDate = dateTo ? new Date(dateTo) : endOfYear

    const where = {
      tollDate: { gte: startDate, lte: endDate },
    }

    // 1. Summary stats
    const [totalSpend, totalFines, recordCount, uniqueRoutes, uniqueTrips] = await Promise.all([
      db.tollRecord.aggregate({
        where,
        _sum: { amount: true, overloadFine: true },
      }),
      db.tollRecord.aggregate({
        where: { ...where, tollType: 'weighbridge', overloaded: true },
        _sum: { overloadFine: true },
        _count: true,
      }),
      db.tollRecord.count({ where }),
      // Unique routes
      db.tollRecord.groupBy({
        where,
        by: ['route'],
        _sum: { amount: true },
        _count: true,
        orderBy: { _sum: { amount: 'desc' } },
        take: 10,
      }),
      // Trips with tolls
      db.tollRecord.groupBy({
        where,
        by: ['tripId'],
        _sum: { amount: true },
        _count: true,
      }),
    ])

    const avgPerTrip = uniqueTrips.length > 0
      ? uniqueTrips.reduce((s, t) => s + (t._sum.amount || 0), 0) / uniqueTrips.length
      : 0

    const mostUsedRoute = uniqueRoutes.length > 0 ? uniqueRoutes[0] : null

    // 2. Monthly trend (last 12 months)
    const monthlyTrend = await db.$queryRaw<Array<{ month: string; year: number; total: number; count: number }>>`
      SELECT 
        DATE_FORMAT(tollDate, '%Y-%m') as month,
        YEAR(tollDate) as year,
        SUM(amount) as total,
        COUNT(*) as count
      FROM TollRecord
      WHERE tollDate >= ${startDate} AND tollDate <= ${endDate}
      GROUP BY month, year
      ORDER BY month
    `

    // 3. Spend by route
    const spendByRoute = await db.tollRecord.groupBy({
      where,
      by: ['route'],
      _sum: { amount: true },
      _count: true,
      orderBy: { _sum: { amount: 'desc' } },
      take: 20,
    })

    // 4. Spend by truck
    const spendByTruck = await db.tollRecord.groupBy({
      where,
      by: ['truckId'],
      _sum: { amount: true, overloadFine: true },
      _count: true,
      orderBy: { _sum: { amount: 'desc' } },
      take: 20,
    })

    // Get truck plate numbers for the spend-by-truck data
    const truckIds = spendByTruck.map(t => t.truckId)
    const trucks = truckIds.length > 0
      ? await db.truck.findMany({
          where: { id: { in: truckIds } },
          select: { id: true, plateNumber: true },
        })
      : []

    const truckMap = Object.fromEntries(trucks.map(t => [t.id, t.plateNumber]))

    // 5. Top toll points by cost
    const topTollPoints = await db.tollRecord.groupBy({
      where,
      by: ['tollPoint'],
      _sum: { amount: true },
      _count: true,
      orderBy: { _sum: { amount: 'desc' } },
      take: 15,
    })

    // 6. Spend by toll type
    const spendByType = await db.tollRecord.groupBy({
      where,
      by: ['tollType'],
      _sum: { amount: true },
      _count: true,
      orderBy: { _count: { id: 'desc' } },
    })

    return NextResponse.json({
      summary: {
        totalSpend: totalSpend._sum.amount || 0,
        totalFines: totalFines._sum.overloadFine || 0,
        overloadCount: totalFines._count,
        recordCount,
        avgPerTrip,
        mostUsedRoute: mostUsedRoute?.route || 'N/A',
        mostUsedRouteSpend: mostUsedRoute?._sum.amount || 0,
      },
      monthlyTrend,
      spendByRoute: spendByRoute.filter(r => r.route !== null),
      spendByTruck: spendByTruck.map(t => ({
        truckId: t.truckId,
        plateNumber: truckMap[t.truckId] || 'Unknown',
        totalSpend: t._sum.amount || 0,
        totalFines: t._sum.overloadFine || 0,
        recordCount: t._count,
      })),
      topTollPoints: topTollPoints.map(p => ({
        tollPoint: p.tollPoint,
        totalSpend: p._sum.amount || 0,
        recordCount: p._count,
      })),
      spendByType: spendByType.map(t => ({
        type: t.tollType,
        totalSpend: t._sum.amount || 0,
        recordCount: t._count,
      })),
    })
  } catch (error) {
    console.error('Toll analytics error:', error)
    return NextResponse.json({ error: 'Failed to fetch toll analytics' }, { status: 500 })
  }
}
