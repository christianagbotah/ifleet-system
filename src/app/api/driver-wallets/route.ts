import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { requireAuth, ROLES } from '@/lib/auth-server'

export async function GET(request: NextRequest) {
  try {
    const auth = requireAuth(request)
    if (auth instanceof NextResponse) return auth

    const { searchParams } = new URL(request.url)
    const search = searchParams.get('search')
    const page = parseInt(searchParams.get('page') || '1')
    const limit = parseInt(searchParams.get('limit') || '20')

    const isDriver = auth.roleName === ROLES.DRIVER
    const where: Record<string, unknown> = {}

    // Drivers can only see their own wallet
    if (isDriver && auth.driverId) {
      where.driverId = auth.driverId
    }

    if (!isDriver && search) {
      where.OR = [
        { driver: { firstName: { contains: search } } },
        { driver: { lastName: { contains: search } } },
        { driver: { phone: { contains: search } } },
      ]
    }

    const [wallets, total] = await Promise.all([
      db.driverWallet.findMany({
        where,
        include: {
          driver: isDriver
            ? { select: { id: true, firstName: true, lastName: true, status: true } }
            : { select: { id: true, firstName: true, lastName: true, phone: true, status: true } },
        },
        orderBy: { updatedAt: 'desc' },
        skip: (page - 1) * limit,
        take: limit,
      }),
      db.driverWallet.count({ where }),
    ])

    // Only Admin/Manager see fleet-wide summary
    let summary = null
    if (!isDriver) {
      const [totalAdvancesResult, totalOutstandingResult, totalSettledResult] = await Promise.all([
        db.driverWallet.aggregate({ _sum: { totalAdvances: true } }),
        db.driverWallet.aggregate({ _sum: { totalDeducted: true, availableBalance: true } }),
        db.driverWallet.aggregate({ _sum: { totalSettled: true } }),
      ])

      summary = {
        totalWallets: total,
        totalAdvances: totalAdvancesResult._sum.totalAdvances || 0,
        totalOutstanding: totalOutstandingResult._sum.totalDeducted || 0,
        totalBalance: totalOutstandingResult._sum.availableBalance || 0,
        totalSettled: totalSettledResult._sum.totalSettled || 0,
      }
    }

    return NextResponse.json({ data: wallets, total, page, limit, summary })
  } catch (error) {
    console.error('Driver wallets list error:', error)
    return NextResponse.json({ error: 'Failed to fetch driver wallets' }, { status: 500 })
  }
}
