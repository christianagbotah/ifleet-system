import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { requireAuth, requireWriteAccess } from '@/lib/auth-server'
import { createAuditLog, getClientIp } from '@/lib/audit'

export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const auth = requireAuth(request)
    if (auth instanceof NextResponse) return auth

    const { id } = await params
    const approval = await db.expenseApproval.findUnique({
      where: { id },
      include: {
        expense: {
          select: {
            id: true, category: true, description: true, amount: true, date: true,
            paymentMethod: true, reference: true, receiptUrl: true,
            truck: { select: { id: true, plateNumber: true, make: true, model: true } },
            trip: { select: { id: true, tripNumber: true, loadingLocation: true, destination: true } },
          },
        },
        requestedBy: { select: { id: true, name: true, email: true, phone: true } },
        approvedBy: { select: { id: true, name: true, email: true, phone: true } },
      },
    })

    if (!approval) {
      return NextResponse.json({ error: 'Expense approval not found' }, { status: 404 })
    }

    return NextResponse.json(approval)
  } catch (error) {
    console.error('Expense approval detail error:', error)
    return NextResponse.json({ error: 'Failed to fetch expense approval' }, { status: 500 })
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
    const { status, approvedAmount, notes, rejectionReason } = body

    if (!status || !['approved', 'rejected', 'partial'].includes(status)) {
      return NextResponse.json(
        { error: 'Status must be one of: approved, rejected, partial' },
        { status: 400 }
      )
    }

    const existing = await db.expenseApproval.findUnique({
      where: { id },
      include: { expense: { select: { id: true } } },
    })

    if (!existing) {
      return NextResponse.json({ error: 'Expense approval not found' }, { status: 404 })
    }

    if (existing.status !== 'pending') {
      return NextResponse.json({ error: `Cannot update approval with status '${existing.status}'` }, { status: 400 })
    }

    // Validate partial approval has approvedAmount
    if (status === 'partial' && (!approvedAmount || approvedAmount <= 0)) {
      return NextResponse.json(
        { error: 'Partial approval requires an approvedAmount greater than zero' },
        { status: 400 }
      )
    }

    if (status === 'partial' && approvedAmount > existing.amount) {
      return NextResponse.json(
        { error: 'Approved amount cannot exceed the requested amount' },
        { status: 400 }
      )
    }

    // Validate rejection has reason
    if (status === 'rejected' && !rejectionReason) {
      return NextResponse.json(
        { error: 'Rejection reason is required' },
        { status: 400 }
      )
    }

    const finalApprovedAmount = status === 'approved'
      ? existing.amount
      : status === 'partial'
        ? approvedAmount
        : 0

    const approval = await db.expenseApproval.update({
      where: { id },
      data: {
        status,
        approvedById: auth.userId,
        approvedAmount: finalApprovedAmount,
        rejectionReason: rejectionReason || null,
        notes: notes || existing.notes,
        reviewedAt: new Date(),
      },
      include: {
        expense: {
          select: {
            id: true, category: true, description: true, amount: true, date: true,
            truck: { select: { id: true, plateNumber: true, make: true, model: true } },
            trip: { select: { id: true, tripNumber: true, loadingLocation: true, destination: true } },
          },
        },
        requestedBy: { select: { id: true, name: true, email: true } },
        approvedBy: { select: { id: true, name: true, email: true } },
      },
    })

    // Update expense status accordingly
    const expenseStatus = status === 'rejected' ? 'rejected' : 'approved'
    const expenseAmount = status === 'partial' ? approvedAmount : existing.amount

    await db.expense.update({
      where: { id: existing.expense.id },
      data: {
        status: expenseStatus,
        approvedBy: auth.userId,
        amount: expenseAmount,
      },
    })

    createAuditLog({
      userId: auth.userId,
      action: 'update',
      entity: 'ExpenseApproval',
      entityId: id,
      details: {
        expenseId: existing.expense.id,
        status,
        originalAmount: existing.amount,
        approvedAmount: finalApprovedAmount,
        rejectionReason: rejectionReason || null,
      },
      ipAddress: getClientIp(request),
    }).catch(() => {})

    return NextResponse.json(approval)
  } catch (error) {
    console.error('Expense approval update error:', error)
    return NextResponse.json({ error: 'Failed to update expense approval' }, { status: 500 })
  }
}

export async function DELETE(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const auth = requireAuth(request)
    if (auth instanceof NextResponse) return auth
    const writeGuard = requireWriteAccess(auth)
    if (writeGuard instanceof NextResponse) return writeGuard

    const { id } = await params

    const existing = await db.expenseApproval.findUnique({
      where: { id },
    })

    if (!existing) {
      return NextResponse.json({ error: 'Expense approval not found' }, { status: 404 })
    }

    if (existing.status !== 'pending') {
      return NextResponse.json({ error: 'Cannot delete a non-pending approval' }, { status: 400 })
    }

    await db.expenseApproval.delete({ where: { id } })

    createAuditLog({
      userId: auth.userId,
      action: 'delete',
      entity: 'ExpenseApproval',
      entityId: id,
      details: { expenseId: existing.expenseId },
      ipAddress: getClientIp(request),
    }).catch(() => {})

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('Expense approval delete error:', error)
    return NextResponse.json({ error: 'Failed to delete expense approval' }, { status: 500 })
  }
}
