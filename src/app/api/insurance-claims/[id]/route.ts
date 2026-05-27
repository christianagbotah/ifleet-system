import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { requireAuth, requireWriteAccess } from '@/lib/auth-server'

// GET /api/insurance-claims/[id] — detail
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = requireAuth(request)
  if (auth instanceof NextResponse) return auth

  const { id } = await params

  const claim = await db.insuranceClaim.findUnique({
    where: { id },
    include: {
      truck: { select: { id: true, plateNumber: true, make: true, model: true } },
      insurance: { select: { id: true, provider: true, policyNumber: true, type: true, coverAmount: true } },
      user: { select: { id: true, name: true } },
    },
  })

  if (!claim) {
    return NextResponse.json({ error: 'Insurance claim not found.' }, { status: 404 })
  }

  return NextResponse.json(claim)
}

// PUT /api/insurance-claims/[id] — update fields or status transition
export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = requireAuth(request)
  if (auth instanceof NextResponse) return auth
  const writeGuard = requireWriteAccess(auth)
  if (writeGuard instanceof NextResponse) return writeGuard

  const { id } = await params
  const body = await request.json()

  const existing = await db.insuranceClaim.findUnique({ where: { id } })
  if (!existing) {
    return NextResponse.json({ error: 'Insurance claim not found.' }, { status: 404 })
  }

  // Status transitions
  const ALLOWED_TRANSITIONS: Record<string, string[]> = {
    draft: ['submitted'],
    submitted: ['under_review', 'rejected'],
    under_review: ['approved', 'rejected'],
    approved: ['paid'],
    rejected: ['draft'], // allow re-submission
    paid: ['closed'],
  }

  const statusAction = body.status || body.action
  if (statusAction && statusAction !== existing.status) {
    const allowed = ALLOWED_TRANSITIONS[existing.status]
    if (!allowed || !allowed.includes(statusAction)) {
      return NextResponse.json(
        { error: `Cannot transition from '${existing.status}' to '${statusAction}'.` },
        { status: 400 }
      )
    }

    const updateData: Record<string, unknown> = { status: statusAction }

    if (statusAction === 'submitted') updateData.submittedAt = new Date()
    if (statusAction === 'under_review') updateData.reviewedAt = new Date()
    if (statusAction === 'approved') {
      updateData.approvedAt = new Date()
      updateData.approvedAmount = body.approvedAmount !== undefined
        ? parseFloat(body.approvedAmount)
        : existing.claimAmount
    }
    if (statusAction === 'rejected') updateData.reviewedAt = new Date()
    if (statusAction === 'paid') updateData.paidAt = new Date()
    if (statusAction === 'closed') updateData.closedAt = new Date()
    if (statusAction === 'draft') {
      // Re-draft clears review timestamps
      updateData.submittedAt = null
      updateData.reviewedAt = null
      updateData.approvedAt = null
      updateData.paidAt = null
    }

    const updated = await db.insuranceClaim.update({
      where: { id },
      data: updateData,
      include: {
        truck: { select: { id: true, plateNumber: true, make: true, model: true } },
        insurance: { select: { id: true, provider: true, policyNumber: true, type: true } },
        user: { select: { id: true, name: true } },
      },
    })

    return NextResponse.json(updated)
  }

  // Field updates (no status change)
  const { claimType, incidentDate, incidentLocation, description, claimAmount,
    deductible, policeReport, thirdPartyDetails, repairEstimate, assignedAdjuster,
    notes, assessorNotes } = body

  const updated = await db.insuranceClaim.update({
    where: { id },
    data: {
      ...(claimType ? { claimType } : {}),
      ...(incidentDate ? { incidentDate: new Date(incidentDate) } : {}),
      ...(incidentLocation ? { incidentLocation } : {}),
      ...(description !== undefined ? { description } : {}),
      ...(claimAmount !== undefined ? { claimAmount: parseFloat(claimAmount) } : {}),
      ...(deductible !== undefined ? { deductible: deductible ? parseFloat(deductible) : null } : {}),
      ...(policeReport !== undefined ? { policeReport: policeReport || null } : {}),
      ...(thirdPartyDetails !== undefined ? { thirdPartyDetails: thirdPartyDetails || null } : {}),
      ...(repairEstimate !== undefined ? { repairEstimate: repairEstimate ? parseFloat(repairEstimate) : null } : {}),
      ...(assignedAdjuster !== undefined ? { assignedAdjuster: assignedAdjuster || null } : {}),
      ...(notes !== undefined ? { notes: notes || null } : {}),
      ...(assessorNotes !== undefined ? { assessorNotes: assessorNotes || null } : {}),
    },
    include: {
      truck: { select: { id: true, plateNumber: true, make: true, model: true } },
      insurance: { select: { id: true, provider: true, policyNumber: true, type: true } },
      user: { select: { id: true, name: true } },
    },
  })

  return NextResponse.json(updated)
}

// DELETE /api/insurance-claims/[id]
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = requireAuth(request)
  if (auth instanceof NextResponse) return auth
  const writeGuard = requireWriteAccess(auth)
  if (writeGuard instanceof NextResponse) return writeGuard

  const { id } = await params

  const existing = await db.insuranceClaim.findUnique({ where: { id } })
  if (!existing) {
    return NextResponse.json({ error: 'Insurance claim not found.' }, { status: 404 })
  }

  if (existing.status !== 'draft') {
    return NextResponse.json(
      { error: 'Only draft claims can be deleted.' },
      { status: 400 }
    )
  }

  await db.insuranceClaim.delete({ where: { id } })
  return NextResponse.json({ success: true })
}
