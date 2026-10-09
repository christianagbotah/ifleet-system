import { NextRequest, NextResponse } from 'next/server'
import { requireAuth, ROLES } from '@/lib/auth-server'
import { db } from '@/lib/db'
import { loadControlTowerHistory } from '@/lib/domain/telematics/control-tower-service'
import { PrismaControlTowerRepository } from '@/lib/domain/telematics/prisma-control-tower-repository'

export async function GET(request: NextRequest) {
  const auth = requireAuth(request)
  if (auth instanceof NextResponse) return auth

  const params = request.nextUrl.searchParams
  const input = {
    tripId: params.get('tripId') ?? undefined,
    from: params.get('from') ?? undefined,
    to: params.get('to') ?? undefined,
    resolution: params.get('resolution') ?? undefined,
  }

  try {
    if (auth.roleName === ROLES.DRIVER) {
      const tripId = typeof input.tripId === 'string' ? input.tripId : ''
      const trip = tripId
        ? await db.trip.findUnique({ where: { id: tripId }, select: { driverId: true } })
        : null
      if (!trip || !auth.driverId || trip.driverId !== auth.driverId) {
        return NextResponse.json({ error: 'You can only replay your own assigned trips.' }, { status: 403 })
      }
    }

    const data = await loadControlTowerHistory(new PrismaControlTowerRepository(), input)
    return NextResponse.json(data)
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Invalid history request'
    const status = /required|valid|window|resolution|after/i.test(message) ? 400 : 500
    if (status === 500) console.error('[Control Tower] Failed to load history:', error)
    return NextResponse.json({ error: status === 400 ? message : 'Failed to load route history' }, { status })
  }
}
