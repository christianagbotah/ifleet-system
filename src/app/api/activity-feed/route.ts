import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { requireAuth } from '@/lib/auth-server'

export async function GET(request: NextRequest) {
  try {
    const auth = requireAuth(request)
    if (auth instanceof NextResponse) return auth

    // Get recent trips (last 10)
    const trips = await db.trip.findMany({
      take: 10,
      orderBy: { updatedAt: 'desc' },
      include: { driver: { select: { firstName: true, lastName: true } } },
    })
    // Get recent cash advances (last 5)
    const cashAdvances = await db.cashAdvance.findMany({
      take: 5,
      orderBy: { updatedAt: 'desc' },
      include: { driver: { select: { firstName: true, lastName: true } } },
    })
    // Get recent incentives (last 5)
    const incentives = await db.driverIncentive.findMany({
      take: 5,
      orderBy: { updatedAt: 'desc' },
      include: { driver: { select: { firstName: true, lastName: true } } },
    })

    const getDriverName = (driver: { firstName: string; lastName: string } | null) =>
      driver ? `${driver.firstName} ${driver.lastName}` : 'Unknown'

    // Merge and sort by date
    const activities = [
      ...trips.map((t) => ({
        id: t.id,
        type: 'trip' as const,
        action: t.status,
        entity: t.tripNumber,
        driver: getDriverName(t.driver),
        date: t.updatedAt.toISOString(),
        amount: t.totalAmount,
      })),
      ...cashAdvances.map((ca) => ({
        id: ca.id,
        type: 'cash_advance' as const,
        action: ca.status,
        entity: `₵${ca.amount.toLocaleString()}`,
        driver: getDriverName(ca.driver),
        date: ca.updatedAt.toISOString(),
        amount: ca.amount,
      })),
      ...incentives.map((inc) => ({
        id: inc.id,
        type: 'incentive' as const,
        action: inc.status,
        entity: `${inc.type} - ₵${inc.amount.toLocaleString()}`,
        driver: getDriverName(inc.driver),
        date: inc.updatedAt.toISOString(),
        amount: inc.amount,
      })),
    ]
      .sort(
        (a, b) => new Date(b.date).getTime() - new Date(a.date).getTime()
      )
      .slice(0, 15)

    return NextResponse.json(activities)
  } catch (error) {
    console.error('Activity feed error:', error)
    return NextResponse.json([], { status: 500 })
  }
}
