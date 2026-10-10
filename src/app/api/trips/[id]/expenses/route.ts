import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { requireAuth, requireWriteAccess, ROLES } from '@/lib/auth-server'
import { initialTripExpenseStatus } from '@/lib/domain/reconciliation/trip-expense-policy'
import { validateDriverEvidenceRefs } from '@/lib/domain/evidence/driver-evidence-server'
import { isTripFinancialSourceLocked, RECONCILED_FINANCIAL_SOURCE_LOCKED } from '@/lib/domain/reconciliation/expense-source-lock'

const DRIVER_MUTATION_ID_PATTERN = /^[A-Za-z0-9-]{8,191}$/

function sameOptionalString(left: string | null | undefined, right: string | null): boolean {
  return (left ?? null) === right
}

function expenseReplayMatches(
  existing: {
    tripId: string | null
    category: string
    description: string
    amount: unknown
    paymentMethod: string
    reference: string | null
    receiptUrl: string | null
  },
  input: {
    tripId: string
    category: string
    description: string
    amount: number
    paymentMethod: string
    reference: string | null
    receiptUrl: string | null
  },
): boolean {
  return existing.tripId === input.tripId
    && existing.category === input.category
    && existing.description === input.description
    && Number(existing.amount) === input.amount
    && existing.paymentMethod === input.paymentMethod
    && sameOptionalString(existing.reference, input.reference)
    && sameOptionalString(existing.receiptUrl, input.receiptUrl)
}

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const auth = requireAuth(request)
    if (auth instanceof NextResponse) return auth

    const { id } = await params
    const { searchParams } = new URL(request.url)
    const category = searchParams.get('category')

    const trip = await db.trip.findUnique({ where: { id } })
    if (!trip) {
      return NextResponse.json({ error: 'Trip not found' }, { status: 404 })
    }

    // Drivers can only view expenses for their own trips
    if (auth.roleName === ROLES.DRIVER && trip.driverId !== auth.driverId) {
      return NextResponse.json({ error: 'Access denied' }, { status: 403 })
    }

    const where: Record<string, unknown> = { tripId: id }
    if (category) where.category = category

    const expenses = await db.expense.findMany({
      where,
      orderBy: { date: 'desc' },
    })

    const total = await db.expense.count({ where })

    return NextResponse.json({ data: expenses, total })
  } catch (error) {
    console.error('Trip expenses fetch error:', error)
    return NextResponse.json({ error: 'Failed to fetch trip expenses' }, { status: 500 })
  }
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const auth = requireAuth(request)
    if (auth instanceof NextResponse) return auth

    const { id } = await params

    const body = await request.json() as Record<string, unknown>
    const normalizedCategory = typeof body.category === 'string' ? body.category.trim() : ''
    const normalizedDescription = typeof body.description === 'string' ? body.description.trim() : ''
    const normalizedAmount = Number(body.amount)
    const normalizedPaymentMethod = typeof body.paymentMethod === 'string' && body.paymentMethod.trim()
      ? body.paymentMethod.trim()
      : 'cash'
    const normalizedReference = typeof body.reference === 'string' && body.reference.trim()
      ? body.reference.trim()
      : null
    const normalizedReceiptUrl = typeof body.receiptUrl === 'string' && body.receiptUrl.trim()
      ? body.receiptUrl.trim()
      : null
    const mutationId = typeof body.clientMutationId === 'string' ? body.clientMutationId.trim() : ''

    if (auth.roleName === ROLES.DRIVER && !mutationId) {
      return NextResponse.json({ error: 'clientMutationId is required for driver expenses' }, { status: 400 })
    }
    if (mutationId && !DRIVER_MUTATION_ID_PATTERN.test(mutationId)) {
      return NextResponse.json({ error: 'clientMutationId is invalid' }, { status: 400 })
    }

    if (!normalizedCategory || !normalizedDescription || !Number.isFinite(normalizedAmount) || normalizedAmount <= 0) {
      return NextResponse.json(
        { error: 'category, description, and amount are required' },
        { status: 400 }
      )
    }

    const trip = await db.trip.findUnique({ where: { id } })
    if (!trip) {
      return NextResponse.json({ error: 'Trip not found' }, { status: 404 })
    }

    // Drivers can only add expenses to their own trips
    if (auth.roleName === ROLES.DRIVER && trip.driverId !== auth.driverId) {
      return NextResponse.json({ error: 'Access denied' }, { status: 403 })
    }

    // Non-drivers still need write access
    if (auth.roleName !== ROLES.DRIVER) {
      const writeGuard = requireWriteAccess(auth)
      if (writeGuard instanceof NextResponse) return writeGuard
    }

    if (mutationId) {
      const existing = await db.expense.findUnique({ where: { clientMutationId: mutationId } })
      if (existing) {
        if (existing.tripId !== id) {
          return NextResponse.json({ error: 'clientMutationId was already used for another trip' }, { status: 409 })
        }
        if (!expenseReplayMatches(existing, {
          tripId: id,
          category: normalizedCategory,
          description: normalizedDescription,
          amount: normalizedAmount,
          paymentMethod: normalizedPaymentMethod,
          reference: normalizedReference,
          receiptUrl: normalizedReceiptUrl,
        })) {
          return NextResponse.json({ error: 'clientMutationId has already been used for a different expense' }, { status: 409 })
        }
        return NextResponse.json({ ...existing, replayed: true })
      }
    }

    if (auth.roleName === ROLES.DRIVER && normalizedReceiptUrl) {
      if (!auth.driverId || !(await validateDriverEvidenceRefs(
        { userId: auth.userId, driverId: auth.driverId },
        id,
        [normalizedReceiptUrl],
      ))) {
        return NextResponse.json({ error: 'Expense receipt is invalid or does not belong to this driver/trip' }, { status: 409 })
      }
    }

    if (await isTripFinancialSourceLocked(db, id)) {
      return NextResponse.json({
        error: 'This trip has an approved reconciliation. Create a reconciliation adjustment instead of changing historical source data.',
        code: RECONCILED_FINANCIAL_SOURCE_LOCKED,
      }, { status: 409 })
    }

    const expense = await db.expense.create({
      data: {
        clientMutationId: mutationId || null,
        truckId: trip.truckId,
        category: normalizedCategory,
        description: normalizedDescription,
        amount: normalizedAmount,
        date: new Date(),
        paymentMethod: normalizedPaymentMethod,
        reference: normalizedReference,
        receiptUrl: normalizedReceiptUrl,
        status: initialTripExpenseStatus(auth.roleName),
        tripId: id,
      },
    })

    return NextResponse.json(expense, { status: 201 })
  } catch (error) {
    console.error('Trip expense create error:', error)
    return NextResponse.json({ error: 'Failed to create trip expense' }, { status: 500 })
  }
}
