import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { requireAuth, requireWriteAccess } from '@/lib/auth-server'
import { createAuditLog, getClientIp } from '@/lib/audit'

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const auth = requireAuth(request)
    if (auth instanceof NextResponse) return auth

    const { id } = await params

    const expense = await db.expense.findUnique({
      where: { id },
      include: {
        truck: { select: { id: true, plateNumber: true, make: true, model: true } },
      },
    })

    if (!expense) {
      return NextResponse.json({ error: 'Expense not found' }, { status: 404 })
    }

    return NextResponse.json(expense)
  } catch (error) {
    console.error('Expense detail error:', error)
    return NextResponse.json({ error: 'Failed to fetch expense' }, { status: 500 })
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

    const expense = await db.expense.findUnique({ where: { id } })
    if (!expense) {
      return NextResponse.json({ error: 'Expense not found' }, { status: 404 })
    }

    const {
      category,
      description,
      amount,
      date,
      paymentMethod,
      reference,
      status,
      approvedBy,
    } = body

    // Collect changed fields for audit log
    const changes: Record<string, unknown> = {}
    if (category !== undefined && category !== expense.category) changes.category = category
    if (description !== undefined && description !== expense.description) changes.description = description
    if (amount !== undefined && parseFloat(amount) !== expense.amount) changes.amount = parseFloat(amount)
    if (paymentMethod !== undefined && paymentMethod !== expense.paymentMethod) changes.paymentMethod = paymentMethod
    if (status !== undefined && status !== expense.status) changes.status = status

    const updatedExpense = await db.expense.update({
      where: { id },
      data: {
        ...(category !== undefined && { category }),
        ...(description !== undefined && { description }),
        ...(amount !== undefined && { amount: parseFloat(amount) }),
        ...(date !== undefined && { date: new Date(date) }),
        ...(paymentMethod !== undefined && { paymentMethod }),
        ...(reference !== undefined && { reference }),
        ...(status !== undefined && { status }),
        ...(approvedBy !== undefined && { approvedBy }),
      },
      include: {
        truck: { select: { id: true, plateNumber: true, make: true, model: true } },
      },
    })

    // Audit log: expense updated (fire-and-forget)
    if (Object.keys(changes).length > 0) {
      createAuditLog({
        userId: auth.userId,
        action: 'update',
        entity: 'Expense',
        entityId: id,
        details: changes,
        ipAddress: getClientIp(request),
      }).catch(() => {})
    }

    return NextResponse.json(updatedExpense)
  } catch (error) {
    console.error('Expense update error:', error)
    return NextResponse.json({ error: 'Failed to update expense' }, { status: 500 })
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

    const expense = await db.expense.findUnique({ where: { id } })
    if (!expense) {
      return NextResponse.json({ error: 'Expense not found' }, { status: 404 })
    }

    await db.expense.delete({ where: { id } })

    // Audit log: expense deleted (fire-and-forget)
    createAuditLog({
      userId: auth.userId,
      action: 'delete',
      entity: 'Expense',
      entityId: id,
      details: { category: expense.category, description: expense.description, amount: expense.amount },
      ipAddress: getClientIp(request),
    }).catch(() => {})

    return NextResponse.json({ message: 'Expense deleted successfully' })
  } catch (error) {
    console.error('Expense delete error:', error)
    return NextResponse.json({ error: 'Failed to delete expense' }, { status: 500 })
  }
}
