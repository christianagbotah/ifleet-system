import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { requireAuth, requireWriteAccess } from '@/lib/auth-server'
import { createAuditLog, getClientIp } from '@/lib/audit'

const VALID_TRANSITIONS: Record<string, string[]> = {
  pending: ['approved', 'cancelled'],
  approved: ['paid'],
  paid: [],
  cancelled: [],
}

export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params
    const incentive = await db.driverIncentive.findUnique({
      where: { id },
      include: {
        driver: { select: { id: true, firstName: true, lastName: true, phone: true, photo: true } },
        creator: { select: { id: true, name: true } },
        approver: { select: { id: true, name: true } },
      },
    })
    if (!incentive) return NextResponse.json({ error: 'Incentive not found' }, { status: 404 })
    return NextResponse.json(incentive)
  } catch (error) {
    console.error('Driver incentive get error:', error)
    return NextResponse.json({ error: 'Failed to fetch incentive' }, { status: 500 })
  }
}

export async function PUT(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const auth = requireAuth(request)
    if (auth instanceof NextResponse) return auth
    const writeGuard = requireWriteAccess(auth)
    if (writeGuard instanceof NextResponse) return writeGuard

    const { id } = await params

    const body = await request.json()
    const { status, notes } = body

    const existing = await db.driverIncentive.findUnique({ where: { id } })
    if (!existing) return NextResponse.json({ error: 'Incentive not found' }, { status: 404 })

    if (status && status !== existing.status) {
      const allowed = VALID_TRANSITIONS[existing.status] || []
      if (!allowed.includes(status)) {
        return NextResponse.json({
          error: `Cannot transition from ${existing.status} to ${status}. Allowed: ${allowed.join(', ') || 'none'}`,
        }, { status: 400 })
      }
    }

    const now = new Date()
    const updateData: Record<string, unknown> = { updatedAt: now }
    if (status) {
      updateData.status = status
      if (status === 'approved') {
        updateData.approvedBy = auth.userId
        updateData.approvedAt = now
      }
      if (status === 'paid') updateData.paidAt = now
    }
    if (notes) updateData.notes = notes

    const incentive = await db.driverIncentive.update({
      where: { id },
      data: updateData,
      include: {
        driver: { select: { id: true, firstName: true, lastName: true, phone: true, photo: true } },
        creator: { select: { id: true, name: true } },
        approver: { select: { id: true, name: true } },
      },
    })

    createAuditLog({
      userId: auth.userId, action: 'update', entity: 'DriverIncentive', entityId: incentive.id,
      details: { status: status || 'updated', title: incentive.title }, ipAddress: getClientIp(request),
    })

    return NextResponse.json(incentive)
  } catch (error) {
    console.error('Driver incentive update error:', error)
    return NextResponse.json({ error: 'Failed to update incentive' }, { status: 500 })
  }
}

export async function DELETE(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const auth = requireAuth(request)
    if (auth instanceof NextResponse) return auth
    const writeGuard = requireWriteAccess(auth)
    if (writeGuard instanceof NextResponse) return writeGuard

    const { id } = await params

    const existing = await db.driverIncentive.findUnique({ where: { id } })
    if (!existing) return NextResponse.json({ error: 'Incentive not found' }, { status: 404 })
    if (!['pending', 'cancelled'].includes(existing.status)) {
      return NextResponse.json({ error: 'Only pending or cancelled incentives can be deleted' }, { status: 400 })
    }

    await db.driverIncentive.delete({ where: { id } })
    createAuditLog({
      userId: auth.userId, action: 'delete', entity: 'DriverIncentive', entityId: id,
      details: { title: existing.title }, ipAddress: getClientIp(request),
    })
    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('Driver incentive delete error:', error)
    return NextResponse.json({ error: 'Failed to delete incentive' }, { status: 500 })
  }
}
