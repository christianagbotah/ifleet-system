import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { requireAuth, requireWriteAccess } from '@/lib/auth-server'

// GET /api/insurance/[id]/renewals — List renewal history
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const auth = requireAuth(request)
    if (auth instanceof NextResponse) return auth

    const { id } = await params

    const insurance = await db.insurance.findUnique({ where: { id } })
    if (!insurance) {
      return NextResponse.json({ error: 'Insurance policy not found' }, { status: 404 })
    }

    const history = await db.insuranceRenewalHistory.findMany({
      where: { insuranceId: id },
      orderBy: { createdAt: 'desc' },
    })

    return NextResponse.json({ data: history })
  } catch (error) {
    console.error('Insurance renewal history error:', error)
    return NextResponse.json({ error: 'Failed to fetch renewal history' }, { status: 500 })
  }
}

// POST /api/insurance/[id]/renewals — Create renewal (snapshot + update)
export async function POST(
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

    const insurance = await db.insurance.findUnique({
      where: { id },
      include: {
        truck: { select: { id: true, plateNumber: true, make: true, model: true } },
      },
    })
    if (!insurance) {
      return NextResponse.json({ error: 'Insurance policy not found' }, { status: 404 })
    }

    const {
      policyNumber,
      provider,
      type,
      coverAmount,
      premium,
      startDate,
      endDate,
      notes,
    } = body

    if (!endDate) {
      return NextResponse.json({ error: 'New end date is required' }, { status: 400 })
    }

    // If policy number is changing, check uniqueness
    if (policyNumber && policyNumber !== insurance.policyNumber) {
      const existing = await db.insurance.findUnique({ where: { policyNumber } })
      if (existing) {
        return NextResponse.json({ error: 'Policy number already in use' }, { status: 400 })
      }
    }

    // 1. Snapshot the current state as JSON
    const previousData = JSON.stringify({
      policyNumber: insurance.policyNumber,
      provider: insurance.provider,
      type: insurance.type,
      coverAmount: insurance.coverAmount,
      premium: insurance.premium,
      startDate: insurance.startDate,
      endDate: insurance.endDate,
      status: insurance.status,
      notes: insurance.notes,
      truck: insurance.truck,
    })

    // 2. Create history entry
    await db.insuranceRenewalHistory.create({
      data: {
        insuranceId: id,
        previousData,
        renewalFee: premium ? parseFloat(premium) : null,
        renewedByName: auth.user?.name || null,
        notes: notes || null,
      },
    })

    // 3. Update the insurance policy
    const updatedInsurance = await db.insurance.update({
      where: { id },
      data: {
        ...(policyNumber && policyNumber !== insurance.policyNumber && { policyNumber }),
        ...(provider && { provider }),
        ...(type && { type }),
        ...(coverAmount !== undefined && { coverAmount: coverAmount ? parseFloat(coverAmount) : null }),
        ...(premium !== undefined && { premium: parseFloat(premium) }),
        ...(startDate && { startDate: new Date(startDate) }),
        endDate: new Date(endDate),
        ...(notes !== undefined && { notes }),
        status: 'active',
        renewalReminderSent: false,
      },
      include: {
        truck: { select: { id: true, plateNumber: true, make: true, model: true } },
      },
    })

    return NextResponse.json(updatedInsurance)
  } catch (error) {
    console.error('Insurance renewal error:', error)
    return NextResponse.json({ error: 'Failed to renew insurance policy' }, { status: 500 })
  }
}
