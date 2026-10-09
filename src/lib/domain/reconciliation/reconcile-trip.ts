export type ReconciliationSourceType = 'fuel' | 'toll' | 'expense' | 'advance' | 'adjustment'

export interface ReconciliationLine {
  sourceType: ReconciliationSourceType
  sourceId: string
  amount: number
  reference: string | null
  category?: string | null
  reason?: string | null
}

export interface ReconciliationDuplicate {
  sourceId: string
  duplicateOf: string
}

export interface ReconciliationBlocker {
  code: 'DELIVERY_EXCEPTION_OPEN' | 'ADJUSTMENT_PENDING' | 'RECONCILIATION_EXCEPTION_OPEN'
  sourceId: string
  message: string
}

interface NativeCost {
  id: string
  amount: number
  reference?: string | null
}

interface TollCost extends NativeCost {
  status: string
}

interface ExpenseCost extends NativeCost {
  category: string
  status: string
}

interface AdvanceFact {
  id: string
  amount: number
  status: string
}

interface DeliveryExceptionFact {
  id: string
  type: string
  status: string
  quantity?: number | null
}

interface ReconciliationExceptionFact {
  id: string
  type: string
  status: string
}

interface AdjustmentFact {
  id: string
  amount: number
  status: string
  reason: string
}

export interface ReconciliationInput {
  tripId: string
  fuel: NativeCost[]
  tolls: TollCost[]
  expenses: ExpenseCost[]
  advances: AdvanceFact[]
  deliveryExceptions: DeliveryExceptionFact[]
  adjustments: AdjustmentFact[]
  reconciliationExceptions?: ReconciliationExceptionFact[]
}

export interface ReconciliationSnapshot {
  tripId: string
  lines: ReconciliationLine[]
  duplicates: ReconciliationDuplicate[]
  blockers: ReconciliationBlocker[]
  totals: {
    fuel: number
    tolls: number
    expenses: number
    adjustments: number
    operationalCost: number
    advances: number
  }
}

function money(value: number): number {
  if (!Number.isFinite(value)) throw new Error('Reconciliation amount must be finite')
  return Math.round((value + Number.EPSILON) * 100) / 100
}

function normalizedReference(value: string | null | undefined): string | null {
  const normalized = value?.trim().toLowerCase()
  return normalized || null
}

function sum(lines: ReconciliationLine[], type: ReconciliationSourceType): number {
  return money(lines.filter((line) => line.sourceType === type).reduce((total, line) => total + line.amount, 0))
}

export function buildReconciliationSnapshot(input: ReconciliationInput): ReconciliationSnapshot {
  const lines: ReconciliationLine[] = []
  const duplicates: ReconciliationDuplicate[] = []
  const blockers: ReconciliationBlocker[] = []
  const nativeReferences = new Map<string, string>()

  for (const fuel of input.fuel) {
    const amount = money(fuel.amount)
    lines.push({ sourceType: 'fuel', sourceId: fuel.id, amount, reference: fuel.reference ?? null })
    const reference = normalizedReference(fuel.reference)
    if (reference) nativeReferences.set(`fuel:${reference}`, `fuel:${fuel.id}`)
  }

  for (const toll of input.tolls) {
    if (!['verified', 'resolved'].includes(toll.status)) continue
    const amount = money(toll.amount)
    lines.push({ sourceType: 'toll', sourceId: toll.id, amount, reference: toll.reference ?? null })
    const reference = normalizedReference(toll.reference)
    if (reference) nativeReferences.set(`toll:${reference}`, `toll:${toll.id}`)
  }

  for (const expense of input.expenses) {
    if (expense.status !== 'approved') continue
    const category = expense.category.trim().toLowerCase()
    const reference = normalizedReference(expense.reference)
    const nativeKey = reference && (category === 'fuel' || category === 'toll')
      ? nativeReferences.get(`${category}:${reference}`)
      : null
    if (nativeKey) {
      duplicates.push({ sourceId: expense.id, duplicateOf: nativeKey })
      continue
    }
    lines.push({
      sourceType: 'expense',
      sourceId: expense.id,
      amount: money(expense.amount),
      reference: expense.reference ?? null,
      category,
    })
  }

  for (const advance of input.advances) {
    if (!['disbursed', 'partially_deducted', 'fully_deducted'].includes(advance.status)) continue
    lines.push({ sourceType: 'advance', sourceId: advance.id, amount: money(advance.amount), reference: null })
  }

  for (const adjustment of input.adjustments) {
    if (adjustment.status === 'approved') {
      lines.push({
        sourceType: 'adjustment',
        sourceId: adjustment.id,
        amount: money(adjustment.amount),
        reference: null,
        reason: adjustment.reason,
      })
    } else if (adjustment.status === 'pending') {
      blockers.push({
        code: 'ADJUSTMENT_PENDING',
        sourceId: adjustment.id,
        message: adjustment.reason || 'Financial adjustment requires a decision',
      })
    }
  }

  for (const exception of input.deliveryExceptions) {
    if (!['resolved', 'closed'].includes(exception.status)) {
      blockers.push({
        code: 'DELIVERY_EXCEPTION_OPEN',
        sourceId: exception.id,
        message: `${exception.type} delivery exception is unresolved`,
      })
    }
  }

  for (const exception of input.reconciliationExceptions ?? []) {
    if (!['resolved', 'closed'].includes(exception.status)) {
      blockers.push({
        code: 'RECONCILIATION_EXCEPTION_OPEN',
        sourceId: exception.id,
        message: `${exception.type} reconciliation exception is unresolved`,
      })
    }
  }

  const fuel = sum(lines, 'fuel')
  const tolls = sum(lines, 'toll')
  const expenses = sum(lines, 'expense')
  const adjustments = sum(lines, 'adjustment')
  const advances = sum(lines, 'advance')

  return {
    tripId: input.tripId,
    lines,
    duplicates,
    blockers,
    totals: {
      fuel,
      tolls,
      expenses,
      adjustments,
      operationalCost: money(fuel + tolls + expenses + adjustments),
      advances,
    },
  }
}

export function canFinalizeReconciliation(snapshot: ReconciliationSnapshot) {
  return { allowed: snapshot.blockers.length === 0, blockers: snapshot.blockers }
}
