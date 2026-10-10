import { NextRequest, NextResponse } from 'next/server'

import { requireAuth, ROLES } from '@/lib/auth-server'
import {
  buildHaulageReport,
  HAULAGE_REPORT_FAMILIES,
  type HaulageReportFamily,
  type HaulageReportFilters,
} from '@/lib/domain/reports/haulage-reports'
import { fetchHaulageReportFacts } from '@/lib/reports/haulage-report-data'

function filtersFrom(request: NextRequest): HaulageReportFilters {
  const q = request.nextUrl.searchParams
  const value = (key: string) => q.get(key)?.trim() || undefined
  return {
    dateFrom: value('dateFrom'),
    dateTo: value('dateTo'),
    shipperId: value('shipperId'),
    transporterId: value('transporterId'),
    vehicleId: value('vehicleId'),
    driverId: value('driverId'),
    route: value('route'),
  }
}

export async function GET(request: NextRequest) {
  try {
    const auth = requireAuth(request)
    if (auth instanceof NextResponse) return auth

    const family = request.nextUrl.searchParams.get('family') as HaulageReportFamily | null
    if (!family || !HAULAGE_REPORT_FAMILIES.includes(family)) {
      return NextResponse.json({ error: 'Invalid haulage report family.' }, { status: 400 })
    }

    const filters = filtersFrom(request)
    if (auth.roleName === ROLES.DRIVER) {
      if (!auth.driverId) return NextResponse.json({ error: 'Driver profile is not linked.' }, { status: 403 })
      filters.driverId = auth.driverId
    }

    const facts = await fetchHaulageReportFacts(family, filters)
    const report = buildHaulageReport({
      family,
      facts,
      filters,
      canViewFinancials: auth.roleName === ROLES.ADMIN || auth.roleName === ROLES.MANAGER,
    })
    return NextResponse.json(report)
  } catch (error) {
    console.error('[Haulage Reports] Failed to load report:', error)
    return NextResponse.json({ error: 'Failed to load haulage report.' }, { status: 500 })
  }
}
