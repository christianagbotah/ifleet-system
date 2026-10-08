import { NextRequest, NextResponse } from 'next/server'
import { requireAuth } from '@/lib/auth-server'

export async function POST(request: NextRequest) {
  const auth = requireAuth(request)
  if (auth instanceof NextResponse) return auth
  return NextResponse.json(
    { error: 'Direct completion is retired. Transition through reconciliation and then POST /api/trips/[id]/transition.' },
    { status: 410 }
  )
}
