import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { requireAuth, requireWriteAccess } from '@/lib/auth-server'

// GET /api/settlements/[id]
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params
    const settlement = await db.driverSettlement.findUnique({
      where: { id },
      include: {
        driver: {
          select: { id: true, firstName: true, lastName: true, employeeId: true, photo: true, phone: true },
        },
        lines: {
          include: {
            trip: {
              select: {
                tripNumber: true, loadingLocation: true, destination: true,
                itemName: true, quantity: true, unit: true,
              },
            },
          },
          orderBy: { createdAt: 'asc' },
        },
      },
    })

    if (!settlement) {
      return NextResponse.json({ error: 'Settlement not found' }, { status: 404 })
    }

    return NextResponse.json({ data: settlement })
  } catch (error) {
    console.error('GET /api/settlements/[id] error:', error)
    return NextResponse.json({ error: 'Failed to fetch settlement' }, { status: 500 })
  }
}

// PUT /api/settlements/[id]
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
    const { status, notes, bonusAmount, approvedBy } = body

    const existing = await db.driverSettlement.findUnique({ where: { id } })
    if (!existing) {
      return NextResponse.json({ error: 'Settlement not found' }, { status: 404 })
    }

    // Validate status transitions
    if (status) {
      const validTransitions: Record<string, string[]> = {
        pending: ['approved'],
        approved: ['paid'],
        paid: [],
      }
      const allowed = validTransitions[existing.status]
      if (!allowed || !allowed.includes(status)) {
        return NextResponse.json(
          { error: `Cannot transition from ${existing.status} to ${status}` },
          { status: 400 }
        )
      }
    }

    const updateData: Record<string, unknown> = {}
    if (notes !== undefined) updateData.notes = notes
    if (bonusAmount !== undefined) updateData.bonusAmount = bonusAmount
    if (status === 'approved') {
      updateData.status = 'approved'
      updateData.approvedBy = approvedBy || null
      updateData.approvedAt = new Date()
    }
    if (status === 'paid') {
      updateData.status = 'paid'
      updateData.paidAt = new Date()
    }

    // Recalculate netPay if bonusAmount changed
    if (bonusAmount !== undefined) {
      updateData.netPay = existing.grossEarnings - existing.fuelDeductions - existing.expenseDeductions + bonusAmount
    }

    const settlement = await db.driverSettlement.update({
      where: { id },
      data: updateData,
      include: {
        driver: {
          select: { id: true, firstName: true, lastName: true, employeeId: true, photo: true },
        },
        lines: true,
      },
    })

    return NextResponse.json({ data: settlement })
  } catch (error) {
    console.error('PUT /api/settlements/[id] error:', error)
    return NextResponse.json({ error: 'Failed to update settlement' }, { status: 500 })
  }
}

// DELETE /api/settlements/[id] — only if pending
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
    const existing = await db.driverSettlement.findUnique({ where: { id } })
    if (!existing) {
      return NextResponse.json({ error: 'Settlement not found' }, { status: 404 })
    }
    if (existing.status !== 'pending') {
      return NextResponse.json({ error: 'Only pending settlements can be deleted' }, { status: 400 })
    }

    await db.driverSettlement.delete({ where: { id } })
    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('DELETE /api/settlements/[id] error:', error)
    return NextResponse.json({ error: 'Failed to delete settlement' }, { status: 500 })
  }
}
