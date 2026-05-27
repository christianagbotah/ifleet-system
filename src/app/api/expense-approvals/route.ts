import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { requireAuth, requireWriteAccess } from '@/lib/auth-server'
import { createAuditLog, getClientIp } from '@/lib/audit'

export async function GET(request: NextRequest) {
  try {
    const auth = requireAuth(request)
    if (auth instanceof NextResponse) return auth

    const { searchParams } = new URL(request.url)
    const status = searchParams.get('status')
    const expenseId = searchParams.get('expenseId')
    const requestedById = searchParams.get('requestedById')
    const page = parseInt(searchParams.get('page') || '1')
    const limit = parseInt(searchParams.get('limit') || '20')

    const where: Record<string, unknown> = {}

    if (status) where.status = status
    if (expenseId) where.expenseId = expenseId
    if (requestedById) where.requestedById = requestedById

    const [approvals, total] = await Promise.all([
      db.expenseApproval.findMany({
        where,
        include: {
          expense: {
            select: {
              id: true, category: true, description: true, amount: true, date: true,
              truck: { select: { id: true, plateNumber: true, make: true, model: true } },
              trip: { select: { id: true, tripNumber: true, loadingLocation: true, destination: true } },
            },
          },
          user_ExpenseApproval_requestedByIdToUser: { select: { id: true, name: true, email: true } },
          user_ExpenseApproval_approvedByIdToUser: { select: { id: true, name: true, email: true } },
        },
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * limit,
        take: limit,
      }),
      db.expenseApproval.count({ where }),
    ])

    // Summary stats
    const now = new Date()
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1)

    const [pendingResult, approvedThisMonthResult, allApprovalsResult] = await Promise.all([
      db.expenseApproval.aggregate({
        _sum: { amount: true },
        _count: true,
        where: { status: 'pending' },
      }),
      db.expenseApproval.aggregate({
        _sum: { approvedAmount: true },
        _count: true,
        where: { status: 'approved', reviewedAt: { gte: monthStart } },
      }),
      db.expenseApproval.aggregate({
        _avg: { createdAt: true },
        _count: true,
        where: { status: { in: ['approved', 'rejected', 'partial'] }, reviewedAt: { not: null } },
      }),
    ])

    const avgApprovalMs = (allApprovalsResult._count ?? 0) > 0
      ? allApprovalsResult._avg.createdAt ? 0 : 0
      : 0

    // Calculate average approval time (from createdAt to reviewedAt)
    const recentReviewed = await db.expenseApproval.findMany({
      where: { status: { in: ['approved', 'rejected', 'partial'] }, reviewedAt: { not: null } },
      select: { createdAt: true, reviewedAt: true },
      take: 100,
      orderBy: { reviewedAt: 'desc' },
    })

    let avgApprovalHours = 0
    if (recentReviewed.length > 0) {
      const totalMs = recentReviewed.reduce((sum, a) => {
        return sum + (a.reviewedAt!.getTime() - a.createdAt.getTime())
      }, 0)
      avgApprovalHours = totalMs / recentReviewed.length / (1000 * 60 * 60)
    }

    const summary = {
      pendingCount: pendingResult._count ?? 0,
      pendingAmount: pendingResult._sum.amount ?? 0,
      approvedThisMonthCount: approvedThisMonthResult._count ?? 0,
      approvedThisMonthAmount: approvedThisMonthResult._sum.approvedAmount ?? 0,
      avgApprovalHours: Math.round(avgApprovalHours * 10) / 10,
      totalCount: allApprovalsResult._count ?? 0,
    }

    const mappedData = approvals.map((record: Record<string, unknown>) => ({
      ...record,
      requestedBy: record.user_ExpenseApproval_requestedByIdToUser,
      approvedBy: record.user_ExpenseApproval_approvedByIdToUser,
    }))
    return NextResponse.json({ data: mappedData, total, page, limit, summary })
  } catch (error) {
    console.error('Expense approvals list error:', error)
    return NextResponse.json({ error: 'Failed to fetch expense approvals' }, { status: 500 })
  }
}

export async function POST(request: NextRequest) {
  try {
    const auth = requireAuth(request)
    if (auth instanceof NextResponse) return auth
    const writeGuard = requireWriteAccess(auth)
    if (writeGuard instanceof NextResponse) return writeGuard

    const body = await request.json()
    const { expenseId, approvalLevel, notes } = body

    if (!expenseId) {
      return NextResponse.json({ error: 'expenseId is required' }, { status: 400 })
    }

    // Verify expense exists
    const expense = await db.expense.findUnique({
      where: { id: expenseId },
      include: {
        truck: { select: { plateNumber: true } },
        trip: { select: { tripNumber: true } },
      },
    })
    if (!expense) {
      return NextResponse.json({ error: 'Expense not found' }, { status: 404 })
    }

    // Check for existing approval
    const existing = await db.expenseApproval.findUnique({
      where: { expenseId },
    })
    if (existing) {
      return NextResponse.json({ error: 'Expense already has an approval record' }, { status: 409 })
    }

    const approval = await db.expenseApproval.create({
      data: {
        expenseId,
        requestedById: auth.userId,
        approvalLevel: approvalLevel || 1,
        amount: expense.amount,
        notes: notes || null,
      },
      include: {
        expense: {
          select: {
            id: true, category: true, description: true, amount: true, date: true,
            truck: { select: { id: true, plateNumber: true, make: true, model: true } },
            trip: { select: { id: true, tripNumber: true, loadingLocation: true, destination: true } },
          },
        },
        user_ExpenseApproval_requestedByIdToUser: { select: { id: true, name: true, email: true } },
      },
    })

    // Update expense status to pending
    await db.expense.update({
      where: { id: expenseId },
      data: { status: 'pending', approvedBy: null },
    })

    createAuditLog({
      userId: auth.userId,
      action: 'create',
      entity: 'ExpenseApproval',
      entityId: approval.id,
      details: { expenseId, amount: expense.amount, category: expense.category, truckPlate: expense.truck.plateNumber },
      ipAddress: getClientIp(request),
    }).catch(() => {})

    const mapped = {
      ...(approval as Record<string, unknown>),
      requestedBy: (approval as Record<string, unknown>).user_ExpenseApproval_requestedByIdToUser,
    }
    return NextResponse.json(mapped, { status: 201 })
  } catch (error) {
    console.error('Expense approval create error:', error)
    return NextResponse.json({ error: 'Failed to create expense approval' }, { status: 500 })
  }
}
