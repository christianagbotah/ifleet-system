import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { requireRole, ROLES } from '@/lib/auth-server'

export async function PUT(request: NextRequest) {
  try {
    const auth = requireRole(request, [ROLES.ADMIN, ROLES.MANAGER])
    if (auth instanceof NextResponse) return auth
    const body = await request.json()
    const { ids, status } = body

    if (!ids || !Array.isArray(ids) || ids.length === 0) {
      return NextResponse.json(
        { error: 'ids must be a non-empty array of payroll record IDs' },
        { status: 400 }
      )
    }

    if (!status || !['approved', 'paid'].includes(status)) {
      return NextResponse.json(
        { error: 'status must be either "approved" or "paid"' },
        { status: 400 }
      )
    }

    // Build the update data object
    const updateData: Record<string, unknown> = { status }

    // Only allow valid transitions: pending → approved, approved → paid
    if (status === 'approved') {
      // Only update pending records
      updateData.approvedAt = new Date()
    }

    if (status === 'paid') {
      // Only update approved records (non-paid)
      updateData.paidAt = new Date()
    }

    // Build the where clause based on status transition
    const whereClause =
      status === 'approved'
        ? { id: { in: ids }, status: 'pending' }
        : { id: { in: ids }, status: 'approved' }

    const result = await db.payroll.updateMany({
      where: whereClause,
      data: updateData,
    })

    return NextResponse.json({
      updated: result.count,
      requested: ids.length,
      status,
    })
  } catch (error) {
    console.error('Bulk payroll update error:', error)
    return NextResponse.json(
      { error: 'Failed to update payroll records' },
      { status: 500 }
    )
  }
}
