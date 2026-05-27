import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { requireAuth } from '@/lib/auth-server'
import { Prisma } from '@/generated/client'

export async function GET(request: NextRequest) {
  try {
    const auth = requireAuth(request)
    if (auth instanceof NextResponse) return auth

    const now = new Date()
    const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1)

    const monthWhere: Prisma.VehicleInspectionWhereInput = {
      inspectionDate: { gte: startOfMonth },
    }

    const [totalThisMonth, passThisMonth, conditionalThisMonth, failThisMonth, defectsThisMonth, failedRequiringFollowUp, recentFails] = await Promise.all([
      // Total inspections this month
      db.vehicleInspection.count({ where: monthWhere }),

      // Pass this month
      db.vehicleInspection.count({ where: { ...monthWhere, result: 'pass' } }),

      // Conditional pass this month
      db.vehicleInspection.count({ where: { ...monthWhere, result: 'conditional_pass' } }),

      // Fail this month
      db.vehicleInspection.count({ where: { ...monthWhere, result: 'fail' } }),

      // Defects found this month
      db.vehicleInspection.count({ where: { ...monthWhere, defectsFound: true } }),

      // Failed inspections requiring follow-up (not yet completed)
      db.vehicleInspection.count({
        where: {
          result: 'fail',
          requiresFollowUp: true,
          followUpCompletedAt: null,
        },
      }),

      // Recent 5 failed inspections with details
      db.vehicleInspection.findMany({
        where: { result: 'fail' },
        include: {
          truck: { select: { id: true, plateNumber: true, make: true, model: true } },
          driver: { select: { id: true, firstName: true, lastName: true } },
        },
        orderBy: { inspectionDate: 'desc' },
        take: 5,
      }),

      // Also get all-time totals for comparison
    ])

    // All-time stats
    const [allTimeTotal, allTimePass, allTimeFail] = await Promise.all([
      db.vehicleInspection.count(),
      db.vehicleInspection.count({ where: { result: 'pass' } }),
      db.vehicleInspection.count({ where: { result: 'fail' } }),
    ])

    // Defect trends by category (from checkItems JSON)
    const recentInspections = await db.vehicleInspection.findMany({
      where: { defectsFound: true },
      select: { checkItems: true, inspectionDate: true },
      orderBy: { inspectionDate: 'desc' },
      take: 50,
    })

    const categoryFailCounts: Record<string, number> = {}
    for (const insp of recentInspections) {
      try {
        const items = JSON.parse(insp.checkItems || '[]')
        for (const item of items) {
          if (item.status === 'fail' && item.category) {
            categoryFailCounts[item.category] = (categoryFailCounts[item.category] || 0) + 1
          }
        }
      } catch {
        // skip malformed JSON
      }
    }

    const totalPassRate = totalThisMonth > 0
      ? Math.round(((passThisMonth + conditionalThisMonth) / totalThisMonth) * 100)
      : 100

    return NextResponse.json({
      thisMonth: {
        total: totalThisMonth,
        pass: passThisMonth,
        conditionalPass: conditionalThisMonth,
        fail: failThisMonth,
        defects: defectsThisMonth,
        passRate: totalPassRate,
      },
      allTime: {
        total: allTimeTotal,
        pass: allTimePass,
        fail: allTimeFail,
        passRate: allTimeTotal > 0 ? Math.round((allTimePass / allTimeTotal) * 100) : 100,
      },
      failedRequiringFollowUp,
      recentFails,
      defectTrends: Object.entries(categoryFailCounts)
        .map(([category, count]) => ({ category, count }))
        .sort((a, b) => b.count - a.count),
    })
  } catch (error) {
    console.error('Inspection summary error:', error)
    return NextResponse.json({ error: 'Failed to fetch inspection summary' }, { status: 500 })
  }
}
