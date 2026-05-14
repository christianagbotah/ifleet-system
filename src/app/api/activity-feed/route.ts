import { NextResponse } from 'next/server'
import { db } from '@/lib/db'

export async function GET() {
  try {
    // Get recent trips (last 10)
    const trips = await db.trip.findMany({
      take: 10,
      orderBy: { updatedAt: 'desc' },
      include: { driver: { select: { driverName: true } } },
    })
    // Get recent cash advances (last 5)
    const cashAdvances = await db.cashAdvance.findMany({
      take: 5,
      orderBy: { updatedAt: 'desc' },
      include: { driver: { select: { driverName: true } } },
    })
    // Get recent incentives (last 5)
    const incentives = await db.driverIncentive.findMany({
      take: 5,
      orderBy: { updatedAt: 'desc' },
      include: { driver: { select: { driverName: true } } },
    })

    // Merge and sort by date
    const activities = [
      ...trips.map((t) => ({
        id: t.id,
        type: 'trip' as const,
        action: t.status,
        entity: t.tripNumber,
        driver: t.driver?.driverName,
        date: t.updatedAt.toISOString(),
        amount: t.totalAmount,
      })),
      ...cashAdvances.map((ca) => ({
        id: ca.id,
        type: 'cash_advance' as const,
        action: ca.status,
        entity: `GHS ${ca.amount}`,
        driver: ca.driver?.driverName,
        date: ca.updatedAt.toISOString(),
        amount: ca.amount,
      })),
      ...incentives.map((inc) => ({
        id: inc.id,
        type: 'incentive' as const,
        action: inc.status,
        entity: `${inc.incentiveType} - GHS ${inc.amount}`,
        driver: inc.driver?.driverName,
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
