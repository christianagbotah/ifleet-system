import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { requireRole, ROLES } from '@/lib/auth-server'

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const auth = requireRole(request, [ROLES.ADMIN, ROLES.MANAGER])
    if (auth instanceof NextResponse) return auth
    const { id } = await params

    const pricing = await db.pricing.findUnique({ where: { id } })

    if (!pricing) {
      return NextResponse.json({ error: 'Pricing entry not found' }, { status: 404 })
    }

    return NextResponse.json(pricing)
  } catch (error) {
    console.error('Pricing detail error:', error)
    return NextResponse.json({ error: 'Failed to fetch pricing entry' }, { status: 500 })
  }
}

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const auth = requireRole(request, [ROLES.ADMIN, ROLES.MANAGER])
    if (auth instanceof NextResponse) return auth
    const { id } = await params
    const body = await request.json()

    const pricing = await db.pricing.findUnique({ where: { id } })
    if (!pricing) {
      return NextResponse.json({ error: 'Pricing entry not found' }, { status: 404 })
    }

    const { itemName, destination, transportRate, isActive } = body

    const parsedTransportRate = transportRate !== undefined ? parseFloat(transportRate) : pricing.transportRate

    if (transportRate !== undefined && (isNaN(parsedTransportRate) || parsedTransportRate < 0)) {
      return NextResponse.json(
        { error: 'transportRate must be a valid non-negative number' },
        { status: 400 }
      )
    }

    const updatedPricing = await db.pricing.update({
      where: { id },
      data: {
        ...(itemName !== undefined && { itemName }),
        ...(destination !== undefined && { destination }),
        transportRate: parsedTransportRate,
        ...(isActive !== undefined && { isActive }),
      },
    })

    return NextResponse.json(updatedPricing)
  } catch (error) {
    console.error('Pricing update error:', error)
    return NextResponse.json({ error: 'Failed to update pricing entry' }, { status: 500 })
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const auth = requireRole(request, [ROLES.ADMIN, ROLES.MANAGER])
    if (auth instanceof NextResponse) return auth
    const { id } = await params

    const pricing = await db.pricing.findUnique({ where: { id } })
    if (!pricing) {
      return NextResponse.json({ error: 'Pricing entry not found' }, { status: 404 })
    }

    // Soft delete
    const updatedPricing = await db.pricing.update({
      where: { id },
      data: { isActive: false },
    })

    return NextResponse.json(updatedPricing)
  } catch (error) {
    console.error('Pricing delete error:', error)
    return NextResponse.json({ error: 'Failed to deactivate pricing entry' }, { status: 500 })
  }
}
