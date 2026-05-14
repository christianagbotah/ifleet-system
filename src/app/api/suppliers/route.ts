import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { requireAuth } from '@/lib/auth-server'

// GET /api/suppliers — List all active suppliers with loadingPoints and items
export async function GET(request: NextRequest) {
  try {
    const auth = requireAuth(request)
    if (auth instanceof NextResponse) return auth

    const searchParams = request.nextUrl.searchParams
    const includeInactive = searchParams.get('includeInactive') === 'true'

    const where: Record<string, unknown> = {}
    if (!includeInactive) where.isActive = true

    const suppliers = await db.supplier.findMany({
      where,
      include: {
        loadingPoints: {
          where: { isActive: true },
          select: { id: true, name: true, loadingCityId: true },
          orderBy: { name: 'asc' },
        },
        items: {
          where: { isActive: true },
          select: { id: true, name: true, unit: true },
          orderBy: { name: 'asc' },
        },
      },
      orderBy: { name: 'asc' },
    })

    return NextResponse.json({ data: suppliers })
  } catch (error) {
    console.error('GET /api/suppliers error:', error)
    return NextResponse.json({ error: 'Failed to fetch suppliers' }, { status: 500 })
  }
}
