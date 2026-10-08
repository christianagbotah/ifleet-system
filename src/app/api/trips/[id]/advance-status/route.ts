import { NextRequest, NextResponse } from 'next/server'
import { requireAuth } from '@/lib/auth-server'

export async function POST(request: NextRequest) {
  const auth = requireAuth(request)
  if (auth instanceof NextResponse) return auth
  return NextResponse.json(
    { error: 'This endpoint is retired. Use POST /api/trips/[id]/transition.' },
    { status: 410 }
  )
}
