import type { TripFinancialFacts } from './trip-profitability'

interface ReconciliationLineFact {
  sourceType: string
  sourceId: string
  category?: string | null
  amount: number
  includedInCost?: boolean
}

interface DriverSettlementLineFact {
  status: string
  type: string
  amount: number
}

interface HaulierSettlementFact {
  status: string
  baseFreight: number
  detentionAmount: number
  extrasAmount: number
  shortageDeduction: number
  fuelAdjustment: number
  taxAmount: number
  withholdingAmount: number
  advanceDeduction: number
}

interface ReconciliationExceptionFact {
  type: string
  status: string
  amount?: number | null
}

interface AdjustmentFact {
  id: string
  status: string
  amount: number
}

export interface TripFinancialLedgerInput {
  tripId: string
  revenue: number
  reconciliation: { status: string; lines: ReconciliationLineFact[] } | null
  driverSettlementLines: DriverSettlementLineFact[]
  haulierSettlement: HaulierSettlementFact | null
  reconciliationExceptions: ReconciliationExceptionFact[]
  postAdjustments: AdjustmentFact[]
  maintenanceAllocation: number
  includeMaintenanceAllocation?: boolean
}

const DRIVER_SETTLEMENT_CATEGORIES = new Set([
  'allowance', 'driver_allowance', 'trip_allowance', 'overnight_allowance',
  'driver_bonus', 'trip_bonus', 'driver_deduction', 'driver_charge', 'driver_fine',
])

const HAULIER_SETTLEMENT_CATEGORIES = new Set([
  'haulier_extra', 'transporter_extra', 'vehicle_owner_extra',
  'haulier_advance', 'transporter_advance', 'vehicle_owner_advance',
])

const TOLL_AND_FEE_CATEGORIES = new Set([
  'toll', 'permit', 'fine', 'border_fee', 'checkpoint_fee', 'weighbridge_fee',
  'loading_fee', 'offloading_fee', 'handling_fee',
])

const MAINTENANCE_CATEGORIES = new Set([
  'maintenance', 'repair', 'repairs', 'workshop', 'service', 'tyre', 'tyres',
])

const SHORTAGE_DAMAGE_CATEGORIES = new Set([
  'shortage', 'delivery_shortage', 'damage', 'delivery_damage', 'cargo_damage', 'damaged_goods',
])

function category(value: string | null | undefined): string {
  return value?.trim().toLowerCase().replace(/[\s-]+/g, '_') ?? ''
}

function finite(value: number, label: string): number {
  if (!Number.isFinite(value)) throw new Error(`${label} must be finite`)
  return Math.round((value + Number.EPSILON) * 100) / 100
}

function cost(value: number, label: string): number {
  const amount = finite(value, label)
  if (amount < 0) throw new Error(`${label} must not be negative`)
  return amount
}

function sum(values: number[]): number {
  return finite(values.reduce((total, value) => total + value, 0), 'Financial fact total')
}

export function buildTripFinancialFacts(input: TripFinancialLedgerInput): TripFinancialFacts {
  if (!input.reconciliation || input.reconciliation.status !== 'approved') {
    throw new Error('Approved reconciliation is required for trip profitability')
  }

  let fuelCost = 0
  let tollAndFeesCost = 0
  let maintenanceCost = 0
  let otherDirectCost = 0
  let shortageDamageExpense = 0
  let adjustmentAmount = 0
  const capturedAdjustmentIds = new Set<string>()

  for (const line of input.reconciliation.lines) {
    if (line.includedInCost === false) continue
    if (line.sourceType === 'advance') continue

    if (line.sourceType === 'adjustment') {
      adjustmentAmount = finite(adjustmentAmount + finite(line.amount, `Adjustment ${line.sourceId}`), 'Adjustment total')
      capturedAdjustmentIds.add(line.sourceId)
      continue
    }

    const amount = cost(line.amount, `Reconciliation line ${line.sourceId}`)
    const normalizedCategory = category(line.category)

    if (line.sourceType === 'fuel' || normalizedCategory === 'fuel') {
      fuelCost = finite(fuelCost + amount, 'Fuel cost')
      continue
    }
    if (line.sourceType === 'toll' || TOLL_AND_FEE_CATEGORIES.has(normalizedCategory)) {
      tollAndFeesCost = finite(tollAndFeesCost + amount, 'Toll and fees cost')
      continue
    }
    if (line.sourceType === 'expense') {
      if (DRIVER_SETTLEMENT_CATEGORIES.has(normalizedCategory)) continue
      if (HAULIER_SETTLEMENT_CATEGORIES.has(normalizedCategory)) continue
      if (MAINTENANCE_CATEGORIES.has(normalizedCategory)) {
        maintenanceCost = finite(maintenanceCost + amount, 'Maintenance cost')
        continue
      }
      if (SHORTAGE_DAMAGE_CATEGORIES.has(normalizedCategory)) {
        shortageDamageExpense = finite(shortageDamageExpense + amount, 'Shortage/damage expense')
        continue
      }
      otherDirectCost = finite(otherDirectCost + amount, 'Other direct cost')
    }
  }

  const driverCost = sum(input.driverSettlementLines
    .filter((line) => ['approved', 'paid'].includes(line.status))
    .filter((line) => line.type === 'trip_earning')
    .map((line, index) => cost(line.amount, `Driver settlement line ${index + 1}`)))

  let haulierCost = 0
  if (input.haulierSettlement && ['approved', 'paid'].includes(input.haulierSettlement.status)) {
    const h = input.haulierSettlement
    haulierCost = finite(
      cost(h.baseFreight, 'Haulier base freight') +
      cost(h.detentionAmount, 'Haulier detention') +
      cost(h.extrasAmount, 'Haulier extras') -
      cost(h.shortageDeduction, 'Haulier shortage deduction') +
      finite(h.fuelAdjustment, 'Haulier fuel adjustment') +
      cost(h.taxAmount, 'Haulier tax'),
      'Haulier economic cost',
    )
    if (haulierCost < 0) haulierCost = 0
  }

  for (const adjustment of input.postAdjustments) {
    if (adjustment.status !== 'approved' || capturedAdjustmentIds.has(adjustment.id)) continue
    adjustmentAmount = finite(adjustmentAmount + finite(adjustment.amount, `Adjustment ${adjustment.id}`), 'Adjustment total')
  }

  const shortageDamageExceptionImpact = sum(input.reconciliationExceptions
    .filter((exception) => ['resolved', 'closed'].includes(exception.status))
    .filter((exception) => /shortage|damage/i.test(exception.type))
    .map((exception, index) => cost(Number(exception.amount ?? 0), `Delivery impact ${index + 1}`)))
  const shortageDamageImpact = finite(shortageDamageExpense + shortageDamageExceptionImpact, 'Shortage/damage impact')
  const maintenanceAllocation = finite(
    maintenanceCost + cost(input.maintenanceAllocation, 'Maintenance allocation'),
    'Maintenance allocation total',
  )

  return {
    tripId: input.tripId,
    revenue: cost(input.revenue, 'Revenue'),
    haulierCost,
    fuelCost,
    driverCost,
    tollAndFeesCost,
    maintenanceAllocation,
    otherDirectCost,
    shortageDamageImpact,
    adjustmentAmount,
    includeMaintenanceAllocation: input.includeMaintenanceAllocation,
  }
}
