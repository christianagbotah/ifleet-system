export interface SettlementPaymentLine {
  type: string
  sourceId: string | null
  amount: number
}

export interface SettlementAdvanceState {
  id: string
  totalDeducted: number
  remainingBalance: number
}

export interface SettlementAdvanceUpdate {
  id: string
  deduction: number
  totalDeducted: number
  remainingBalance: number
  status: 'partially_deducted' | 'fully_deducted'
}

function money(value: number, label: string): number {
  if (!Number.isFinite(value)) throw new Error(`${label} must be finite`)
  return Math.round((value + Number.EPSILON) * 100) / 100
}

export function deriveSettlementPaymentEffects(input: {
  lines: SettlementPaymentLine[]
  advances: SettlementAdvanceState[]
}): { advanceUpdates: SettlementAdvanceUpdate[]; paidIncentiveIds: string[] } {
  const advanceLineTotals = new Map<string, number>()
  const paidIncentiveIds = new Set<string>()

  for (const line of input.lines) {
    if (!line.sourceId) continue
    if (line.type === 'incentive') {
      paidIncentiveIds.add(line.sourceId)
      continue
    }
    if (line.type !== 'advance_deduction') continue
    const deduction = Math.abs(money(line.amount, `Settlement line ${line.sourceId}`))
    advanceLineTotals.set(line.sourceId, money((advanceLineTotals.get(line.sourceId) ?? 0) + deduction, 'Advance deduction'))
  }

  const byAdvance = new Map(input.advances.map((advance) => [advance.id, advance]))
  const advanceUpdates: SettlementAdvanceUpdate[] = []

  for (const [id, requested] of advanceLineTotals) {
    const advance = byAdvance.get(id)
    if (!advance) continue
    const remaining = Math.max(0, money(advance.remainingBalance, `Advance ${id} remaining balance`))
    const existingDeducted = Math.max(0, money(advance.totalDeducted, `Advance ${id} total deducted`))
    const deduction = Math.min(remaining, requested)
    if (deduction <= 0) continue
    const newRemaining = money(remaining - deduction, `Advance ${id} remaining balance`)
    advanceUpdates.push({
      id,
      deduction,
      totalDeducted: money(existingDeducted + deduction, `Advance ${id} total deducted`),
      remainingBalance: newRemaining,
      status: newRemaining === 0 ? 'fully_deducted' : 'partially_deducted',
    })
  }

  return { advanceUpdates, paidIncentiveIds: Array.from(paidIncentiveIds) }
}
