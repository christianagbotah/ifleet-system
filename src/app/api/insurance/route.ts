import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { requireAuth, requireWriteAccess } from '@/lib/auth-server'

export async function GET(request: NextRequest) {
  try {
    const auth = requireAuth(request)
    if (auth instanceof NextResponse) return auth

    const { searchParams } = new URL(request.url)
    const truckId = searchParams.get('truckId')
    const status = searchParams.get('status')
    const provider = searchParams.get('provider')
    const page = parseInt(searchParams.get('page') || '1')
    const limit = parseInt(searchParams.get('limit') || '20')

    const where: Record<string, unknown> = {}

    if (truckId) where.truckId = truckId
    if (status) where.status = status
    if (provider) where.provider = { contains: provider }

    const [policies, total] = await Promise.all([
      db.insurance.findMany({
        where,
        include: {
          truck: { select: { id: true, plateNumber: true, make: true, model: true } },
        },
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * limit,
        take: limit,
      }),
      db.insurance.count({ where }),
    ])

    return NextResponse.json({ data: policies, total, page, limit })
  } catch (error) {
    console.error('Insurance list error:', error)
    return NextResponse.json({ error: 'Failed to fetch insurance policies' }, { status: 500 })
  }
}

export async function POST(request: NextRequest) {
  try {
    const auth = requireAuth(request)
    if (auth instanceof NextResponse) return auth
    const writeGuard = requireWriteAccess(auth)
    if (writeGuard instanceof NextResponse) return writeGuard

    const body = await request.json()

    const {
      truckId,
      provider,
      policyNumber,
      type,
      coverAmount,
      premium,
      startDate,
      endDate,
      notes,
    } = body

    if (!truckId || !provider || !policyNumber || !type || !premium || !startDate || !endDate) {
      return NextResponse.json(
        { error: 'truckId, provider, policyNumber, type, premium, startDate, and endDate are required' },
        { status: 400 }
      )
    }

    // Verify truck exists
    const truck = await db.truck.findUnique({ where: { id: truckId } })
    if (!truck) {
      return NextResponse.json({ error: 'Truck not found' }, { status: 404 })
    }

    // Check for duplicate policy number
    const existing = await db.insurance.findUnique({ where: { policyNumber } })
    if (existing) {
      return NextResponse.json({ error: 'Insurance with this policy number already exists' }, { status: 400 })
    }

    const insurance = await db.insurance.create({
      data: {
        truckId,
        provider,
        policyNumber,
        type,
        coverAmount: coverAmount ? parseFloat(coverAmount) : null,
        premium: parseFloat(premium),
        startDate: new Date(startDate),
        endDate: new Date(endDate),
        notes,
      },
      include: {
        truck: { select: { id: true, plateNumber: true, make: true, model: true } },
      },
    })

    return NextResponse.json(insurance, { status: 201 })
  } catch (error) {
    console.error('Insurance create error:', error)
    return NextResponse.json({ error: 'Failed to create insurance policy' }, { status: 500 })
  }
}
