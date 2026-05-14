import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const driverId = searchParams.get('driverId') || ''
    const status = searchParams.get('status') || ''

    const incentives = await db.driverIncentive.findMany({
      where: {
        ...(driverId && { driverId }),
        ...(status && { status }),
      },
      include: {
        driver: { select: { id: true, driverName: true, phone: true } },
        trip: { select: { id: true, tripNumber: true } },
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
    const body = await request.json()
    const { driverId, amount, incentiveType, description, tripId, period, notes } = body

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

    // If tripId provided, validate trip exists
    if (tripId) {
      const trip = await db.trip.findUnique({ where: { id: tripId } })
      if (!trip) {
        return NextResponse.json({ error: 'Trip not found' }, { status: 400 })
      }
    }

    const incentive = await db.driverIncentive.create({
      data: {
        driverId,
        amount: parsedAmount,
        incentiveType,
        description,
        tripId: tripId || null,
        period: period || '',
        status: 'pending',
        notes: notes || '',
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
