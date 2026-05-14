import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { requireAuth, requireWriteAccess } from '@/lib/auth-server'

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params

    const insurance = await db.insurance.findUnique({
      where: { id },
      include: {
        truck: { select: { id: true, plateNumber: true, make: true, model: true } },
      },
    })

    if (!insurance) {
      return NextResponse.json({ error: 'Insurance policy not found' }, { status: 404 })
    }

    return NextResponse.json(insurance)
  } catch (error) {
    console.error('Insurance detail error:', error)
    return NextResponse.json({ error: 'Failed to fetch insurance policy' }, { status: 500 })
  }
}

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const auth = requireAuth(request)
    if (auth instanceof NextResponse) return auth
    const writeGuard = requireWriteAccess(auth)
    if (writeGuard instanceof NextResponse) return writeGuard

    const { id } = await params
    const body = await request.json()

    const insurance = await db.insurance.findUnique({ where: { id } })
    if (!insurance) {
      return NextResponse.json({ error: 'Insurance policy not found' }, { status: 404 })
    }

    const {
      provider,
      policyNumber,
      type,
      coverAmount,
      premium,
      startDate,
      endDate,
      status,
      notes,
    } = body

    // Check policy number uniqueness if changing
    if (policyNumber && policyNumber !== insurance.policyNumber) {
      const existing = await db.insurance.findUnique({ where: { policyNumber } })
      if (existing) {
        return NextResponse.json({ error: 'Insurance with this policy number already exists' }, { status: 400 })
      }
    }

    const updatedInsurance = await db.insurance.update({
      where: { id },
      data: {
        ...(provider !== undefined && { provider }),
        ...(policyNumber !== undefined && { policyNumber }),
        ...(type !== undefined && { type }),
        ...(coverAmount !== undefined && { coverAmount: coverAmount ? parseFloat(coverAmount) : null }),
        ...(premium !== undefined && { premium: parseFloat(premium) }),
        ...(startDate !== undefined && { startDate: new Date(startDate) }),
        ...(endDate !== undefined && { endDate: new Date(endDate) }),
        ...(status !== undefined && { status }),
        ...(notes !== undefined && { notes }),
      },
      include: {
        truck: { select: { id: true, plateNumber: true, make: true, model: true } },
      },
    })

    return NextResponse.json(updatedInsurance)
  } catch (error) {
    console.error('Insurance update error:', error)
    return NextResponse.json({ error: 'Failed to update insurance policy' }, { status: 500 })
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const auth = requireAuth(request)
    if (auth instanceof NextResponse) return auth
    const writeGuard = requireWriteAccess(auth)
    if (writeGuard instanceof NextResponse) return writeGuard

    const { id } = await params

    const insurance = await db.insurance.findUnique({ where: { id } })
    if (!insurance) {
      return NextResponse.json({ error: 'Insurance policy not found' }, { status: 404 })
    }

    await db.insurance.delete({ where: { id } })

    return NextResponse.json({ message: 'Insurance policy deleted successfully' })
  } catch (error) {
    console.error('Insurance delete error:', error)
    return NextResponse.json({ error: 'Failed to delete insurance policy' }, { status: 500 })
  }
}
