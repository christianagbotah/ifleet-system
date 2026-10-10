import { NextRequest, NextResponse } from 'next/server'

import { requireAuth, ROLES } from '@/lib/auth-server'
import { db } from '@/lib/db'
import { buildTripAdvisory } from '@/lib/domain/ai-ops/trip-advisory'
import { PrismaTripAdvisoryRepository } from '@/lib/domain/ai-ops/prisma-trip-advisory-repository'

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const auth = requireAuth(request)
    if (auth instanceof NextResponse) return auth

    const { id } = await params
    const access = await db.trip.findUnique({
      where: { id },
      select: { driverId: true },
    })
    if (!access) return NextResponse.json({ error: 'Trip not found' }, { status: 404 })

    if (auth.roleName === ROLES.DRIVER && auth.driverId !== access.driverId) {
      return NextResponse.json({ error: 'Access denied' }, { status: 403 })
    }

    const advisory = await buildTripAdvisory(id, {
      repository: new PrismaTripAdvisoryRepository(),
    })
    if (!advisory) return NextResponse.json({ error: 'Trip not found' }, { status: 404 })

    return NextResponse.json({ advisory })
  } catch (error) {
    console.error('[AI Ops Advisory] Failed to build trip advisory:', error)
    return NextResponse.json({ error: 'Failed to build trip advisory' }, { status: 500 })
  }
}
