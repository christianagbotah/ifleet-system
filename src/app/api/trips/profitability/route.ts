import { NextRequest, NextResponse } from 'next/server'

import { requireAuth, ROLES, type AuthContext } from '@/lib/auth-server'
import { loadAuthoritativeTripProfitability } from '@/lib/domain/billing/profitability-service'

function requireFinanceAccess(auth: AuthContext): true | NextResponse {
  if (auth.roleName === ROLES.ADMIN || auth.roleName === ROLES.MANAGER || auth.permissions.includes('financial.view')) return true
  return NextResponse.json({ error: 'Financial profitability access is required.' }, { status: 403 })
}

/**
 * Compatibility endpoint for older clients. The canonical implementation lives at
 * /api/analytics/trip-profitability and both routes delegate to the same service.
 */
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
    console.error('Trip profitability compatibility endpoint error:', error)
    return NextResponse.json({ error: 'Failed to load profitability data' }, { status: 500 })
  }
}
