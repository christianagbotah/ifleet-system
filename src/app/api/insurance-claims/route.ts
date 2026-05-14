import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { requireAuth, requireWriteAccess } from '@/lib/auth-server'

// GET /api/insurance-claims — list with filters + pagination
export async function GET(request: NextRequest) {
  const auth = requireAuth(request)
  if (auth instanceof NextResponse) return auth

  const { searchParams } = new URL(request.url)
  const status = searchParams.get('status') || undefined
  const claimType = searchParams.get('claimType') || undefined
  const insuranceId = searchParams.get('insuranceId') || undefined
  const truckId = searchParams.get('truckId') || undefined
  const search = searchParams.get('search') || undefined
  const page = parseInt(searchParams.get('page') || '1')
  const limit = parseInt(searchParams.get('limit') || '20')

  const where: Record<string, unknown> = {}
  if (status) where.status = status
  if (claimType) where.claimType = claimType
  if (insuranceId) where.insuranceId = insuranceId
  if (truckId) where.truckId = truckId
  if (search) {
    where.OR = [
      { claimNumber: { contains: search } },
      { description: { contains: search } },
      { incidentLocation: { contains: search } },
    ]
  }

  const [claims, total] = await Promise.all([
    db.insuranceClaim.findMany({
      where,
      include: {
        truck: { select: { id: true, plateNumber: true, make: true, model: true } },
        insurance: { select: { id: true, provider: true, policyNumber: true, type: true } },
        creator: { select: { id: true, name: true } },
      },
      orderBy: { incidentDate: 'desc' },
      skip: (page - 1) * limit,
      take: limit,
    }),
    db.insuranceClaim.count({ where }),
  ])

  // Compute summary stats
  const [openCount, reviewCount, totalClaimed, totalApproved] = await Promise.all([
    db.insuranceClaim.count({ where: { status: { in: ['draft', 'submitted'] } } }),
    db.insuranceClaim.count({ where: { status: 'under_review' } }),
    db.insuranceClaim.aggregate({ _sum: { claimAmount: true }, where: { status: { not: 'draft' } } }),
    db.insuranceClaim.aggregate({ _sum: { approvedAmount: true }, where: { status: { in: ['approved', 'paid'] } } }),
  ])

  const summary = {
    openCount,
    reviewCount,
    totalClaimed: totalClaimed._sum.claimAmount || 0,
    totalApproved: totalApproved._sum.approvedAmount || 0,
  }

  return NextResponse.json({ data: claims, total, page, limit, summary })
}

// POST /api/insurance-claims — create
export async function POST(request: NextRequest) {
  const auth = requireAuth(request)
  if (auth instanceof NextResponse) return auth
  const writeGuard = requireWriteAccess(auth)
  if (writeGuard instanceof NextResponse) return writeGuard

  const body = await request.json()
  const {
    insuranceId, truckId, claimType, incidentDate, incidentLocation,
    description, claimAmount, deductible, policeReport, thirdPartyDetails,
    repairEstimate, assignedAdjuster, notes,
  } = body

  if (!insuranceId || !truckId || !claimType || !incidentDate || !incidentLocation || !claimAmount) {
    return NextResponse.json(
      { error: 'Insurance, truck, claim type, incident date, location, and claim amount are required.' },
      { status: 400 }
    )
  }

  // Auto-generate claim number
  const count = await db.insuranceClaim.count()
  const claimNumber = `ICL-2025-${String(count + 1).padStart(4, '0')}`

  const claim = await db.insuranceClaim.create({
    data: {
      insuranceId, truckId, claimType, claimNumber,
      incidentDate: new Date(incidentDate),
      incidentLocation, description: description || '',
      claimAmount: parseFloat(claimAmount),
      deductible: deductible ? parseFloat(deductible) : null,
      policeReport: policeReport || null,
      thirdPartyDetails: thirdPartyDetails || null,
      repairEstimate: repairEstimate ? parseFloat(repairEstimate) : null,
      assignedAdjuster: assignedAdjuster || null,
      notes: notes || null,
      createdBy: auth.userId,
      status: 'draft',
    },
    include: {
      truck: { select: { id: true, plateNumber: true, make: true, model: true } },
      insurance: { select: { id: true, provider: true, policyNumber: true, type: true } },
      creator: { select: { id: true, name: true } },
    },
  })

  return NextResponse.json(claim, { status: 201 })
}
