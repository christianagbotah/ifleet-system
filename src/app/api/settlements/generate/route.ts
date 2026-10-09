import { NextRequest, NextResponse } from 'next/server'

import { requireAuth, requireWriteAccess } from '@/lib/auth-server'
import { db } from '@/lib/db'
import { calculateDriverSettlement } from '@/lib/domain/settlements/driver-settlement'

const ALLOWANCE_CATEGORIES = new Set(['allowance', 'driver_allowance', 'trip_allowance', 'overnight_allowance'])
const TRIP_BONUS_CATEGORIES = new Set(['driver_bonus', 'trip_bonus'])
const DRIVER_DEDUCTION_CATEGORIES = new Set(['driver_deduction', 'driver_charge', 'driver_fine'])
const RESERVED_SOURCE_TYPES = ['incentive', 'deduction', 'advance_deduction']

function normalizedCategory(value: string): string {
  return value.trim().toLowerCase().replace(/[\s-]+/g, '_')
}

function sumAmounts(items: Array<{ amount: unknown }>): number {
  return Math.round(items.reduce((total, item) => total + Number(item.amount), 0) * 100) / 100
}

function periodKey(start: Date): string {
  return `${start.getFullYear()}-${String(start.getMonth() + 1).padStart(2, '0')}`
}

function validRange(start: Date, end: Date): boolean {
  return Number.isFinite(start.getTime()) && Number.isFinite(end.getTime()) && start <= end
}

// POST /api/settlements/generate — generate a driver settlement from approved reconciled trips.
export async function POST(request: NextRequest) {
  try {
    const auth = requireAuth(request)
    if (auth instanceof NextResponse) return auth
    const writeGuard = requireWriteAccess(auth)
    if (writeGuard instanceof NextResponse) return writeGuard

    const body = await request.json().catch(() => ({})) as Record<string, unknown>
    const driverId = typeof body.driverId === 'string' ? body.driverId : ''
    const start = new Date(String(body.periodStart ?? ''))
    const end = new Date(String(body.periodEnd ?? ''))

    if (!driverId || !validRange(start, end)) {
      return NextResponse.json(
        { error: 'driverId and a valid periodStart/periodEnd range are required.' },
        { status: 400 },
      )
    }

    const period = periodKey(start)

    const settlement = await db.$transaction(async (tx) => {
      const existing = await tx.driverSettlement.findFirst({ where: { driverId, period }, select: { id: true } })
      if (existing) throw new Error('SETTLEMENT_EXISTS')

      const reconciliations = await tx.tripReconciliation.findMany({
        where: {
          status: 'approved',
          approvedAt: { gte: start, lte: end },
        },
        select: { id: true, tripId: true, version: true, approvedAt: true },
        orderBy: [{ tripId: 'asc' }, { version: 'desc' }],
      })

      const latestByTrip = new Map<string, (typeof reconciliations)[number]>()
      for (const reconciliation of reconciliations) {
        if (!latestByTrip.has(reconciliation.tripId)) latestByTrip.set(reconciliation.tripId, reconciliation)
      }

      const reconciliationTripIds = Array.from(latestByTrip.keys())
      const trips = reconciliationTripIds.length > 0
        ? await tx.trip.findMany({
            where: { id: { in: reconciliationTripIds }, driverId },
            select: { id: true, tripNumber: true, loadingLocation: true, destination: true },
          })
        : []

      if (trips.length === 0) throw new Error('NO_RECONCILED_TRIPS')

      const tripIds = trips.map((trip) => trip.id)
      const existingTripLines = await tx.settlementLine.findMany({
        where: {
          tripId: { not: null },
          driverSettlement: { driverId },
        },
        select: { tripId: true },
      })
      const settledTripIds = existingTripLines.flatMap((line) => line.tripId ? [line.tripId] : [])

      const reservedSourceLines = await tx.settlementLine.findMany({
        where: {
          driverSettlement: { driverId },
          type: { in: RESERVED_SOURCE_TYPES },
          sourceId: { not: null },
        },
        select: { sourceId: true },
      })
      const reservedSourceIds = new Set(reservedSourceLines.flatMap((line) => line.sourceId ? [line.sourceId] : []))

      const expenses = await tx.expense.findMany({
        where: { tripId: { in: tripIds }, status: 'approved' },
        select: { id: true, tripId: true, category: true, description: true, amount: true, status: true },
      })

      const incentives = await tx.driverIncentive.findMany({
        where: {
          driverId,
          status: 'approved',
          OR: [
            { periodStart: { lte: end }, periodEnd: { gte: start } },
            { createdAt: { gte: start, lte: end } },
          ],
        },
        select: { id: true, amount: true, status: true, title: true },
      })

      const advances = await tx.cashAdvance.findMany({
        where: {
          driverId,
          status: { in: ['disbursed', 'partially_deducted'] },
          remainingBalance: { gt: 0 },
        },
        select: { id: true, amount: true, remainingBalance: true, status: true },
      })

      const tripFacts = trips.map((trip) => {
        const tripExpenses = expenses.filter((expense) => expense.tripId === trip.id)
        const allowance = sumAmounts(tripExpenses.filter((expense) => ALLOWANCE_CATEGORIES.has(normalizedCategory(expense.category))))
        const tripBonus = sumAmounts(tripExpenses.filter((expense) => TRIP_BONUS_CATEGORIES.has(normalizedCategory(expense.category))))
        const reconciliation = latestByTrip.get(trip.id)!
        return {
          id: trip.id,
          reconciliationId: reconciliation.id,
          reconciliationApproved: true,
          tripBonus,
          allowance,
        }
      })

      const calculation = calculateDriverSettlement({
        trips: tripFacts,
        incentives: incentives
          .filter((item) => !reservedSourceIds.has(item.id))
          .map((item) => ({ id: item.id, amount: Number(item.amount), status: item.status })),
        deductions: expenses
          .filter((expense) => DRIVER_DEDUCTION_CATEGORIES.has(normalizedCategory(expense.category)))
          .filter((expense) => !reservedSourceIds.has(expense.id))
          .map((expense) => ({
            id: expense.id,
            amount: Number(expense.amount),
            status: expense.status,
            reason: expense.description,
          })),
        advances: advances
          .filter((advance) => !reservedSourceIds.has(advance.id))
          .map((advance) => ({
            id: advance.id,
            amount: Number(advance.amount),
            remainingBalance: Number(advance.remainingBalance),
            status: advance.status,
          })),
        settledTripIds,
      })

      if (calculation.includedTripIds.length === 0) throw new Error('NO_UNSETTLED_RECONCILED_TRIPS')

      const snapshot = {
        version: 1,
        generatedAt: new Date().toISOString(),
        driverId,
        period,
        periodStart: start.toISOString(),
        periodEnd: end.toISOString(),
        reconciliationIds: calculation.includedTripIds.map((tripId) => latestByTrip.get(tripId)?.id).filter(Boolean),
        calculation,
      }

      return tx.driverSettlement.create({
        data: {
          driverId,
          period,
          periodStart: start,
          periodEnd: end,
          grossEarnings: calculation.totals.tripEarnings,
          fuelDeductions: 0,
          expenseDeductions: calculation.totals.expenseDeductions,
          advanceDeductions: calculation.totals.advanceDeductions,
          bonusAmount: calculation.totals.bonusAmount,
          netPay: calculation.totals.netPay,
          snapshotVersion: 1,
          snapshotJson: JSON.stringify(snapshot),
          SettlementLine: {
            create: calculation.lines.map((line) => ({
              tripId: line.tripId ?? null,
              description: line.description,
              type: line.sourceType,
              sourceId: line.sourceId,
              amount: line.amount,
            })),
          },
        },
        include: {
          driver: { select: { id: true, firstName: true, lastName: true, employeeId: true, photo: true } },
          SettlementLine: {
            include: {
              trip: { select: { tripNumber: true, loadingLocation: true, destination: true, itemName: true, quantity: true, unit: true } },
            },
          },
        },
      })
    }, { isolationLevel: 'Serializable' })

    return NextResponse.json({ data: settlement }, { status: 201 })
  } catch (error) {
    if (error instanceof Error) {
      if (error.message === 'SETTLEMENT_EXISTS') {
        return NextResponse.json({ error: 'Settlement already exists for this driver and period.' }, { status: 409 })
      }
      if (error.message === 'NO_RECONCILED_TRIPS') {
        return NextResponse.json({ error: 'No approved reconciled trips are available in this period.' }, { status: 409 })
      }
      if (error.message === 'NO_UNSETTLED_RECONCILED_TRIPS') {
        return NextResponse.json({ error: 'All reconciled trips in this period are already represented by a driver settlement.' }, { status: 409 })
      }
    }
    console.error('POST /api/settlements/generate error:', error)
    return NextResponse.json({ error: 'Failed to generate settlement' }, { status: 500 })
  }
}
