export const HAULAGE_REPORT_FAMILIES = [
  'trip_operations',
  'utilization',
  'route',
  'shipper_customer',
  'loading_wait',
  'driver_safety',
  'fuel',
  'maintenance',
  'compliance',
  'weight_overload',
  'pod_exceptions',
  'revenue_cost_margin',
  'haulier_settlement',
  'driver_settlement',
  'device_health',
] as const

export type HaulageReportFamily = (typeof HAULAGE_REPORT_FAMILIES)[number]
export type HaulageReportCell = string | number | boolean | null | undefined
export type HaulageReportRow = Record<string, HaulageReportCell>

export interface HaulageReportFilters {
  dateFrom?: string
  dateTo?: string
  shipperId?: string
  transporterId?: string
  vehicleId?: string
  driverId?: string
  route?: string
}

export interface HaulageReportFact {
  id: string
  family: HaulageReportFamily
  occurredAt: Date | string
  shipperId?: string | null
  transporterId?: string | null
  vehicleId?: string | null
  driverId?: string | null
  route?: string | null
  values: HaulageReportRow
}

export interface HaulageReportResult {
  family: HaulageReportFamily
  filters: HaulageReportFilters
  columns: string[]
  rows: HaulageReportRow[]
  totals: Record<string, number>
  generatedAt: string
}

const FINANCIAL_FIELDS = new Set([
  'revenue', 'cost', 'margin', 'profit', 'netProfit', 'totalRevenue', 'totalCost',
  'fuelCost', 'maintenanceCost', 'expenseAmount', 'settlementAmount', 'netPay',
  'grossEarnings', 'deductions', 'rateAmount', 'offeredRate', 'amount',
  'baseFreight', 'detentionAmount', 'extrasAmount', 'shortageDeduction', 'netPayable',
  'fuelDeductions', 'expenseDeductions', 'bonusAmount',
])

function normalized(value: string | null | undefined) {
  return value?.trim().toLocaleLowerCase('en') ?? ''
}

function dayStart(value: string | undefined): number | null {
  if (!value) return null
  const parsed = Date.parse(`${value}T00:00:00.000Z`)
  return Number.isFinite(parsed) ? parsed : null
}

function dayEnd(value: string | undefined): number | null {
  if (!value) return null
  const parsed = Date.parse(`${value}T23:59:59.999Z`)
  return Number.isFinite(parsed) ? parsed : null
}

function matchesFilters(fact: HaulageReportFact, filters: HaulageReportFilters) {
  const occurredAt = new Date(fact.occurredAt).getTime()
  const from = dayStart(filters.dateFrom)
  const to = dayEnd(filters.dateTo)
  if (from != null && occurredAt < from) return false
  if (to != null && occurredAt > to) return false

  const exactFilters: Array<[string | undefined, string | null | undefined]> = [
    [filters.shipperId, fact.shipperId],
    [filters.transporterId, fact.transporterId],
    [filters.vehicleId, fact.vehicleId],
    [filters.driverId, fact.driverId],
  ]
  for (const [filter, actual] of exactFilters) {
    if (filter && normalized(filter) !== normalized(actual)) return false
  }
  if (filters.route && normalized(filters.route) !== normalized(fact.route)) return false
  return true
}

export function isFinancialReportField(field: string) {
  return FINANCIAL_FIELDS.has(field)
}

export function buildHaulageReport(input: {
  family: HaulageReportFamily
  facts: HaulageReportFact[]
  filters: HaulageReportFilters
  canViewFinancials: boolean
}): HaulageReportResult {
  const matching = input.facts.filter((fact) => fact.family === input.family && matchesFilters(fact, input.filters))
  const rows = matching.map((fact) => {
    const row: HaulageReportRow = {}
    for (const [key, value] of Object.entries(fact.values)) {
      if (!input.canViewFinancials && isFinancialReportField(key)) continue
      row[key] = value
    }
    return row
  })

  const columns: string[] = []
  const seen = new Set<string>()
  for (const row of rows) {
    for (const key of Object.keys(row)) {
      if (!seen.has(key)) {
        seen.add(key)
        columns.push(key)
      }
    }
  }

  const totals: Record<string, number> = {}
  for (const column of columns) {
    const values = rows.map((row) => row[column]).filter((value): value is number => typeof value === 'number' && Number.isFinite(value))
    if (values.length > 0) totals[column] = values.reduce((sum, value) => sum + value, 0)
  }

  return {
    family: input.family,
    filters: { ...input.filters },
    columns,
    rows,
    totals,
    generatedAt: new Date().toISOString(),
  }
}

export function toHaulageExportTable(result: HaulageReportResult) {
  return {
    headers: [...result.columns],
    rows: result.rows.map((row) => result.columns.map((column) => row[column] ?? null)),
    totals: { ...result.totals },
  }
}
