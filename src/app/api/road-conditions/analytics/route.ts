import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { requireAuth } from '@/lib/auth-server'

export async function GET(request: NextRequest) {
  try {
    const auth = requireAuth(request)
    if (auth instanceof NextResponse) return auth

    // Run all analytics queries in parallel
    const [
      allReports,
      activeReports,
      resolvedReports,
      reportsByRegion,
      reportsByCondition,
      reportsByHazardType,
      reportsBySeverity,
    ] = await Promise.all([
      // Total reports
      db.roadConditionReport.count(),
      // Active reports
      db.roadConditionReport.count({ where: { status: 'active' } }),
      // Resolved reports
      db.roadConditionReport.count({ where: { status: 'resolved' } }),
      // Reports by region
      db.roadConditionReport.groupBy({
        by: ['region'],
        _count: { id: true },
        orderBy: { _count: { id: 'desc' } },
      }),
      // Reports by condition
      db.roadConditionReport.groupBy({
        by: ['condition'],
        _count: { id: true },
      }),
      // Reports by hazard type
      db.roadConditionReport.groupBy({
        by: ['hazardType'],
        _count: { id: true },
        orderBy: { _count: { id: 'desc' } },
      }),
      // Reports by severity
      db.roadConditionReport.groupBy({
        by: ['severity'],
        _count: { id: true },
      }),
    ])

    // Reports this week
    const oneWeekAgo = new Date()
    oneWeekAgo.setDate(oneWeekAgo.getDate() - 7)
    const reportsThisWeek = await db.roadConditionReport.count({
      where: { reportedAt: { gte: oneWeekAgo } },
    })

    // Critical/High active reports
    const criticalActive = await db.roadConditionReport.count({
      where: { status: 'active', severity: 'critical' },
    })
    const highActive = await db.roadConditionReport.count({
      where: { status: 'active', severity: 'high' },
    })

    // Average resolution time (for resolved reports)
    const resolvedRecords = await db.roadConditionReport.findMany({
      where: {
        status: 'resolved',
        resolvedAt: { not: null },
      },
      select: {
        reportedAt: true,
        resolvedAt: true,
      },
    })

    let avgResolutionHours: number | null = null
    if (resolvedRecords.length > 0) {
      const totalHours = resolvedRecords.reduce((sum, r) => {
        if (r.resolvedAt) {
          const diffMs = r.resolvedAt.getTime() - r.reportedAt.getTime()
          return sum + diffMs / (1000 * 60 * 60)
        }
        return sum
      }, 0)
      avgResolutionHours = Math.round(totalHours / resolvedRecords.length)
    }

    // Recent reports (last 7 days, for trend)
    const recentReports = await db.roadConditionReport.findMany({
      where: { reportedAt: { gte: oneWeekAgo } },
      select: { reportedAt: true, condition: true, severity: true },
      orderBy: { reportedAt: 'asc' },
    })

    return NextResponse.json({
      totalReports: allReports,
      activeReports,
      resolvedReports,
      reportsThisWeek,
      criticalActive,
      highActive,
      avgResolutionHours,
      byRegion: reportsByRegion.map((r) => ({ region: r.region, count: r._count.id })),
      byCondition: reportsByCondition.map((r) => ({ condition: r.condition, count: r._count.id })),
      byHazardType: reportsByHazardType.map((r) => ({ hazardType: r.hazardType, count: r._count.id })),
      bySeverity: reportsBySeverity.map((r) => ({ severity: r.severity, count: r._count.id })),
      recentReports,
    })
  } catch (error) {
    console.error('Road conditions analytics error:', error)
    return NextResponse.json({ error: 'Failed to fetch road condition analytics' }, { status: 500 })
  }
}
