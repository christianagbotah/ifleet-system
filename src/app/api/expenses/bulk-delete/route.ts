import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { requireAuth, requireWriteAccess } from '@/lib/auth-server'
import { createAuditLog, getClientIp } from '@/lib/audit'
import { isTripFinancialSourceLocked, RECONCILED_FINANCIAL_SOURCE_LOCKED } from '@/lib/domain/reconciliation/expense-source-lock'

export async function POST(request: NextRequest) {
  try {
    const auth = requireAuth(request)
    if (auth instanceof NextResponse) return auth
    const writeGuard = requireWriteAccess(auth)
    if (writeGuard instanceof NextResponse) return writeGuard

    const body = await request.json()
    const { ids } = body as { ids?: string[] }

    if (!Array.isArray(ids) || ids.length === 0) {
      return NextResponse.json({ error: 'ids must be a non-empty array' }, { status: 400 })
    }

    if (ids.length > 100) {
      return NextResponse.json({ error: 'Cannot delete more than 100 items at once' }, { status: 400 })
    }

    const expenses = await db.expense.findMany({
      where: { id: { in: ids } },
      select: { id: true, category: true, description: true, amount: true, tripId: true },
    })

    for (const tripId of new Set(expenses.map((expense) => expense.tripId).filter((value): value is string => Boolean(value)))) {
      if (await isTripFinancialSourceLocked(db, tripId)) {
        return NextResponse.json({
        error: 'This expense belongs to an approved reconciliation. Create a reconciliation adjustment instead of changing historical source data.',
        code: RECONCILED_FINANCIAL_SOURCE_LOCKED,
      }, { status: 409 })
      }
    }

    const result = await db.expense.deleteMany({
      where: { id: { in: ids } },
    })

    // Audit log: bulk delete expenses (fire-and-forget)
    expenses.forEach(expense => {
      createAuditLog({
        userId: auth.userId,
        action: 'delete',
        entity: 'Expense',
        entityId: expense.id,
        details: { category: expense.category, description: expense.description, amount: expense.amount, bulk: true },
        ipAddress: getClientIp(request),
      }).catch(() => {})
    })

    return NextResponse.json({ success: true, deleted: result.count })
  } catch (error) {
    console.error('Bulk expense delete error:', error)
    return NextResponse.json({ error: 'Failed to delete expenses' }, { status: 500 })
  }
}
