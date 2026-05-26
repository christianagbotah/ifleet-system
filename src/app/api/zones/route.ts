import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const cityId = searchParams.get('cityId')

    const zones = await db.zone.findMany({
      where: {
        isActive: true,
        ...(cityId ? { cityId } : {}),
      },
      include: {
        city: true,
      },
      orderBy: { name: 'asc' },
    })

    return NextResponse.json({ data: zones })
  } catch (error) {
    console.error('Error fetching zones:', error)
    return NextResponse.json(
      { error: 'Failed to fetch zones' },
      { status: 500 }
    )
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const { name, cityId, rate } = body

    if (!name || typeof name !== 'string' || name.trim().length === 0) {
      return NextResponse.json(
        { error: 'Zone name is required' },
        { status: 400 }
      )
    }

    if (!cityId || typeof cityId !== 'string') {
      return NextResponse.json(
        { error: 'City ID is required' },
        { status: 400 }
      )
    }

    const zone = await db.zone.create({
      data: {
        name: name.trim(),
        cityId,
        rate: rate ?? 0,
      },
      include: { city: true },
    })

    return NextResponse.json({ data: zone }, { status: 201 })
  } catch (error) {
    console.error('Error creating zone:', error)
    return NextResponse.json(
      { error: 'Failed to create zone' },
      { status: 500 }
    )
  }
}
