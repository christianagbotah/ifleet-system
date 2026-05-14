import { db } from '@/lib/db'
import { NextRequest, NextResponse } from 'next/server'
import { requireAuth } from '@/lib/auth-server'

// GET /api/trips/[id]/events — Fetch all trip lifecycle events
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const auth = requireAuth(request)
    if (auth instanceof NextResponse) return auth

    const { id } = await params

    const events = await db.tripEvent.findMany({
      where: { tripId: id },
      orderBy: { createdAt: 'asc' },
    })

    return NextResponse.json({ data: events })
  } catch (error: unknown) {
    console.error('Error fetching trip events:', error)
    return NextResponse.json({ error: 'Failed to fetch trip events' }, { status: 500 })
  }
}
