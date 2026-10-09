export interface TripFinancialFacts {
  tripId: string
  revenue: number
  haulierCost: number
  fuelCost: number
  driverCost: number
  tollAndFeesCost: number
  maintenanceAllocation: number
  otherDirectCost: number
  shortageDamageImpact: number
  adjustmentAmount: number
  includeMaintenanceAllocation?: boolean
}

export interface TripProfitability {
  tripId: string
  revenue: number
  haulierCost: number
  fuelCost: number
  driverCost: number
  tollAndFeesCost: number
  maintenanceCost: number
  otherDirectCost: number
  shortageDamageImpact: number
  adjustmentAmount: number
  totalDirectCost: number
  contribution: number
  marginPercent: number
}

function money(value: number, label: string): number {
  if (!Number.isFinite(value)) throw new Error(`${label} must be finite`)
  return Math.round((value + Number.EPSILON) * 100) / 100
}

function nonNegative(value: number, label: string): number {
  const rounded = money(value, label)
  if (rounded < 0) throw new Error(`${label} must not be negative`)
  return rounded
}

export function calculateTripProfitability(input: TripFinancialFacts): TripProfitability {
  const revenue = nonNegative(input.revenue, 'Revenue')
  const haulierCost = nonNegative(input.haulierCost, 'Haulier cost')
  const fuelCost = nonNegative(input.fuelCost, 'Fuel cost')
  const driverCost = nonNegative(input.driverCost, 'Driver cost')
  const tollAndFeesCost = nonNegative(input.tollAndFeesCost, 'Toll and fees cost')
  const maintenanceAllocation = nonNegative(input.maintenanceAllocation, 'Maintenance allocation')
  const maintenanceCost = input.includeMaintenanceAllocation === false ? 0 : maintenanceAllocation
  const otherDirectCost = nonNegative(input.otherDirectCost, 'Other direct cost')
  const shortageDamageImpact = nonNegative(input.shortageDamageImpact, 'Shortage/damage impact')
  const adjustmentAmount = money(input.adjustmentAmount, 'Adjustment amount')

  const totalDirectCost = money(
    haulierCost + fuelCost + driverCost + tollAndFeesCost + maintenanceCost +
      otherDirectCost + shortageDamageImpact + adjustmentAmount,
    'Total direct cost',
  )
  const contribution = money(revenue - totalDirectCost, 'Contribution')
  const marginPercent = revenue > 0
    ? Math.round(((contribution / revenue) * 100 + Number.EPSILON) * 100) / 100
    : 0

  return {
    tripId: input.tripId,
    revenue,
    haulierCost,
    fuelCost,
    driverCost,
    tollAndFeesCost,
    maintenanceCost,
    otherDirectCost,
    shortageDamageImpact,
    adjustmentAmount,
    totalDirectCost,
    contribution,
    marginPercent,
  }
}

export interface ReconciliationCostLine {
  sourceType: string
  category: string | null
  amount: number
}

const DRIVER_COMPENSATION_CATEGORIES = new Set([
  'allowance',
  'driver_allowance',
  'trip_allowance',
  'overnight_allowance',
  'driver_bonus',
  'trip_bonus',
])

const HAULIER_SETTLEMENT_CATEGORIES = new Set([
  'haulier_extra',
  'transporter_extra',
  'vehicle_owner_extra',
  'haulier_advance',
  'transporter_advance',
  'vehicle_owner_advance',
])

const MAINTENANCE_CATEGORIES = new Set([
  'maintenance',
  'repair',
  'repairs',
  'workshop',
  'service',
  'tyre',
  'tyres',
])

const SHORTAGE_DAMAGE_CATEGORIES = new Set([
  'shortage',
  'delivery_shortage',
  'damage',
  'delivery_damage',
  'cargo_damage',
  'damaged_goods',
])

function normalizedCategory(value: string | null): string {
  return value?.trim().toLowerCase().replace(/[\s-]+/g, '_') ?? ''
}

export function classifyReconciliationCosts(lines: ReconciliationCostLine[]): {
  maintenance: number
  shortageDamage: number
  otherDirect: number
} {
  let maintenance = 0
  let shortageDamage = 0
  let otherDirect = 0

  for (const line of lines) {
    if (line.sourceType !== 'expense') continue
    const amount = nonNegative(line.amount, 'Expense amount')
    const category = normalizedCategory(line.category)
    if (DRIVER_COMPENSATION_CATEGORIES.has(category)) continue
    if (HAULIER_SETTLEMENT_CATEGORIES.has(category)) continue
    if (MAINTENANCE_CATEGORIES.has(category)) {
      maintenance = money(maintenance + amount, 'Maintenance cost')
      continue
    }
    if (SHORTAGE_DAMAGE_CATEGORIES.has(category)) {
      shortageDamage = money(shortageDamage + amount, 'Shortage/damage impact')
      continue
    }
    otherDirect = money(otherDirect + amount, 'Other direct cost')
  }

  return { maintenance, shortageDamage, otherDirect }
}

export function resolveConfirmedRevenue(input: {
  tripRevenue: number
  invoice?: { status: string; subtotal: number } | null
}): number {
  const tripRevenue = nonNegative(input.tripRevenue, 'Trip revenue')
  const invoice = input.invoice
  if (!invoice || ['draft', 'cancelled', 'void'].includes(invoice.status.trim().toLowerCase())) return tripRevenue
  return nonNegative(invoice.subtotal, 'Invoice subtotal')
}

export function calculateMaintenanceAllocation(input: {
  enabled: boolean
  costPerKm: number
  distanceKm: number
}): number {
  const rate = nonNegative(input.costPerKm, 'Maintenance cost per kilometre')
  const distance = nonNegative(input.distanceKm, 'Distance')
  return input.enabled ? money(rate * distance, 'Maintenance allocation') : 0
}
