export interface DriverSettlementTripFact {
  id: string
  reconciliationId: string | null
  reconciliationApproved: boolean
  tripBonus: number
  allowance: number
}

export interface DriverSettlementIncentiveFact {
  id: string
  amount: number
  status: string
}

export interface DriverSettlementDeductionFact {
  id: string
  amount: number
  status: string
  reason: string
}

export interface DriverSettlementAdvanceFact {
  id: string
  amount: number
  remainingBalance: number
  status: string
}

export interface DriverSettlementInput {
  trips: DriverSettlementTripFact[]
  incentives: DriverSettlementIncentiveFact[]
  deductions: DriverSettlementDeductionFact[]
  advances: DriverSettlementAdvanceFact[]
  settledTripIds: string[]
}

export type DriverSettlementLineType = 'trip_earning' | 'incentive' | 'deduction' | 'advance_deduction'

export interface DriverSettlementLineFact {
  sourceType: DriverSettlementLineType
  sourceId: string
  tripId?: string
  amount: number
  description: string
}

export interface DriverSettlementCalculation {
  includedTripIds: string[]
  excludedTrips: Array<{ tripId: string; reason: 'unreconciled' | 'already_settled' | 'duplicate' }>
  lines: DriverSettlementLineFact[]
  totals: {
    tripEarnings: number
    bonusAmount: number
    expenseDeductions: number
    advanceDeductions: number
    netPay: number
  }
}

function money(value: number, label: string): number {
  if (!Number.isFinite(value)) throw new Error(`${label} must be finite`)
  return Math.round((value + Number.EPSILON) * 100) / 100
}

function positiveMoney(value: number, label: string): number {
  const normalized = money(value, label)
  if (normalized < 0) throw new Error(`${label} cannot be negative`)
  return normalized
}

export function calculateDriverSettlement(input: DriverSettlementInput): DriverSettlementCalculation {
  const settled = new Set(input.settledTripIds)
  const seen = new Set<string>()
  const includedTripIds: string[] = []
  const excludedTrips: DriverSettlementCalculation['excludedTrips'] = []
  const lines: DriverSettlementLineFact[] = []

  let tripEarnings = 0
  let bonusAmount = 0
  let expenseDeductions = 0
  let advanceDeductions = 0

  for (const trip of input.trips) {
    if (!trip.reconciliationApproved || !trip.reconciliationId) {
      excludedTrips.push({ tripId: trip.id, reason: 'unreconciled' })
      continue
    }
    if (settled.has(trip.id)) {
      excludedTrips.push({ tripId: trip.id, reason: 'already_settled' })
      continue
    }
    if (seen.has(trip.id)) {
      excludedTrips.push({ tripId: trip.id, reason: 'duplicate' })
      continue
    }
    seen.add(trip.id)

    const tripBonus = positiveMoney(trip.tripBonus, `Trip ${trip.id} bonus`)
    const allowance = positiveMoney(trip.allowance, `Trip ${trip.id} allowance`)
    const amount = money(tripBonus + allowance, `Trip ${trip.id} earnings`)

    includedTripIds.push(trip.id)
    tripEarnings = money(tripEarnings + amount, 'Trip earnings')
    if (amount > 0) {
      lines.push({
        sourceType: 'trip_earning',
        sourceId: trip.reconciliationId,
        tripId: trip.id,
        amount,
        description: 'Reconciled trip bonus and allowance',
      })
    }
  }

  for (const incentive of input.incentives) {
    if (incentive.status !== 'approved') continue
    const amount = positiveMoney(incentive.amount, `Incentive ${incentive.id}`)
    bonusAmount = money(bonusAmount + amount, 'Bonus amount')
    if (amount > 0) {
      lines.push({ sourceType: 'incentive', sourceId: incentive.id, amount, description: 'Approved driver incentive' })
    }
  }

  for (const deduction of input.deductions) {
    if (deduction.status !== 'approved') continue
    const amount = positiveMoney(deduction.amount, `Deduction ${deduction.id}`)
    expenseDeductions = money(expenseDeductions + amount, 'Expense deductions')
    if (amount > 0) {
      lines.push({ sourceType: 'deduction', sourceId: deduction.id, amount: -amount, description: deduction.reason })
    }
  }

  for (const advance of input.advances) {
    if (!['disbursed', 'partially_deducted'].includes(advance.status)) continue
    const remaining = positiveMoney(advance.remainingBalance, `Advance ${advance.id} remaining balance`)
    if (remaining === 0) continue
    advanceDeductions = money(advanceDeductions + remaining, 'Advance deductions')
    lines.push({ sourceType: 'advance_deduction', sourceId: advance.id, amount: -remaining, description: 'Outstanding cash advance deduction' })
  }

  return {
    includedTripIds,
    excludedTrips,
    lines,
    totals: {
      tripEarnings,
      bonusAmount,
      expenseDeductions,
      advanceDeductions,
      netPay: money(tripEarnings + bonusAmount - expenseDeductions - advanceDeductions, 'Net pay'),
    },
  }
}
