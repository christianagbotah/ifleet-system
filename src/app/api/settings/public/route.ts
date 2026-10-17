import { NextResponse } from 'next/server'
import { db } from '@/lib/db'

// GET /api/settings/public — minimal unauthenticated runtime settings.
export async function GET() {
  try {
    const settings = await db.systemSettings.findFirst({
      select: { currency: true },
    })

    return NextResponse.json({
      currency: settings?.currency ?? 'GHS',
    })
  } catch (error) {
    console.error('Public settings GET error:', error)
    return NextResponse.json(
      { error: 'Failed to load public settings.' },
      { status: 500 },
    )
  }
}
