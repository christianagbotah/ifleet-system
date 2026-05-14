import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { requireRole, ROLES } from '@/lib/auth-server'

export async function GET(request: NextRequest) {
  try {
    const auth = requireRole(request, [ROLES.ADMIN, ROLES.MANAGER])
    if (auth instanceof NextResponse) return auth
    const { searchParams } = new URL(request.url)
    const itemName = searchParams.get('itemName')
    const destination = searchParams.get('destination')
    const activeOnly = searchParams.get('activeOnly')
    const page = parseInt(searchParams.get('page') || '1')
    const limit = parseInt(searchParams.get('limit') || '20')

    const where: Record<string, unknown> = {}

    if (itemName) where.itemName = { contains: itemName }
    if (destination) where.destination = { contains: destination }
    if (activeOnly === 'true') where.isActive = true

    const [records, total] = await Promise.all([
      db.pricing.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * limit,
        take: limit,
      }),
      db.pricing.count({ where }),
    ])

    return NextResponse.json({ data: records, total, page, limit })
  } catch (error) {
    console.error('Pricing list error:', error)
    return NextResponse.json({ error: 'Failed to fetch pricing entries' }, { status: 500 })
  }
}

export async function POST(request: NextRequest) {
  try {
    const auth = requireRole(request, [ROLES.ADMIN, ROLES.MANAGER])
    if (auth instanceof NextResponse) return auth
    const body = await request.json()

    const { itemName, destination, transportRate } = body

    if (!itemName || !destination || transportRate === undefined) {
      return NextResponse.json(
        { error: 'itemName, destination, and transportRate are required' },
        { status: 400 }
      )
    }

    const parsedTransportRate = parseFloat(transportRate)

    if (isNaN(parsedTransportRate) || parsedTransportRate < 0) {
      return NextResponse.json(
        { error: 'transportRate must be a valid non-negative number' },
        { status: 400 }
      )
    }

    const pricing = await db.pricing.create({
      data: {
        itemName,
        destination,
        transportRate: parsedTransportRate,
      },
    })

    return NextResponse.json(pricing, { status: 201 })
  } catch (error) {
    console.error('Pricing create error:', error)
    return NextResponse.json({ error: 'Failed to create pricing entry' }, { status: 500 })
  }
}
