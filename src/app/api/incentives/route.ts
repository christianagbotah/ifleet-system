import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { requireAuth, requireWriteAccess } from '@/lib/auth-server'

export async function GET(request: NextRequest) {
  try {
    const auth = requireAuth(request)
    if (auth instanceof NextResponse) return auth

    const { searchParams } = new URL(request.url)
    const driverId = searchParams.get('driverId') || ''
    const status = searchParams.get('status') || ''

    const incentives = await db.driverIncentive.findMany({
      where: {
        ...(driverId && { driverId }),
        ...(status && { status }),
      },
      include: {
        driver: { select: { id: true, firstName: true, lastName: true, phone: true } },
      },
      orderBy: { createdAt: 'desc' },
    })

    return NextResponse.json(incentives)
  } catch (error) {
    console.error('Error fetching incentives:', error)
    return NextResponse.json(
      { error: 'Failed to fetch incentives' },
      { status: 500 }
    )
  }
}

export async function POST(request: NextRequest) {
  try {
    const auth = requireAuth(request)
    if (auth instanceof NextResponse) return auth
    const writeGuard = requireWriteAccess(auth)
    if (writeGuard instanceof NextResponse) return writeGuard

    const body = await request.json()
    const { driverId, amount, incentiveType, description, period, notes } = body

    if (!driverId || amount == null || !incentiveType || !description) {
      return NextResponse.json(
        { error: 'Missing required fields: driverId, amount, incentiveType, description' },
        { status: 400 }
      )
    }

    const parsedAmount = parseFloat(amount)
    if (isNaN(parsedAmount) || parsedAmount <= 0) {
      return NextResponse.json(
        { error: 'Amount must be a positive number' },
        { status: 400 }
      )
    }

    const validTypes = ['performance', 'safety', 'bonus', 'overtime']
    if (!validTypes.includes(incentiveType)) {
      return NextResponse.json(
        { error: `Invalid incentiveType. Must be one of: ${validTypes.join(', ')}` },
        { status: 400 }
      )
    }

    // Validate driver exists
    const driver = await db.driver.findUnique({ where: { id: driverId } })
    if (!driver) {
      return NextResponse.json({ error: 'Driver not found' }, { status: 400 })
    }

    const incentive = await db.driverIncentive.create({
      data: {
        driverId,
        amount: parsedAmount,
        type: incentiveType,
        title: description,
        description,
        period: period || '',
        status: 'pending',
        createdBy: auth.userId,
      },
    })

    return NextResponse.json(incentive, { status: 201 })
  } catch (error) {
    console.error('Error creating incentive:', error)
    return NextResponse.json(
      { error: 'Failed to create incentive', details: String(error) },
      { status: 500 }
    )
  }
}
