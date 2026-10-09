import { NextRequest, NextResponse } from 'next/server'

import { requireAuth, ROLES, type AuthContext } from '@/lib/auth-server'
import { loadAuthoritativeTripProfitability } from '@/lib/domain/billing/profitability-service'

function requireFinanceAccess(auth: AuthContext): true | NextResponse {
  if (auth.roleName === ROLES.ADMIN || auth.roleName === ROLES.MANAGER || auth.permissions.includes('financial.view')) return true
  return NextResponse.json({ error: 'Financial analytics access is required.' }, { status: 403 })
}

export async function GET(request: NextRequest) {
  try {
    const auth = requireAuth(request)
    if (auth instanceof NextResponse) return auth
    const financeAccess = requireFinanceAccess(auth)
    if (financeAccess instanceof NextResponse) return financeAccess

    const { searchParams } = new URL(request.url)
    return NextResponse.json(await loadAuthoritativeTripProfitability({
      period: searchParams.get('period') ?? undefined,
      dateFrom: searchParams.get('dateFrom') ?? undefined,
      dateTo: searchParams.get('dateTo') ?? undefined,
      truckId: searchParams.get('truckId') ?? undefined,
      driverId: searchParams.get('driverId') ?? undefined,
      route: searchParams.get('route') ?? undefined,
      clientId: searchParams.get('clientId') ?? undefined,
      page: Number(searchParams.get('page') || 1),
      limit: Number(searchParams.get('limit') || 20),
    }))
  } catch (error) {
    console.error('Authoritative trip profitability error:', error)
    return NextResponse.json({ error: 'Failed to load authoritative profitability data' }, { status: 500 })
  }
}
