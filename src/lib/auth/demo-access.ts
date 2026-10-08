const DEMO_BLOCKED_NAV_ITEMS = new Set([
  'clients',
  'safety-scoring',
  'driver-performance',
  'drivers',
  'driver-tracking',
  'tracking',
  'analytics',
  'cost-analytics',
  'truck-financials',
  'trip-profitability',
  'fuel-analytics',
  'fuel-anomaly',
  'fuel-budgets',
  'pricing',
  'invoices',
  'payroll',
  'settlements',
  'expenses',
  'cash-advances',
  'expense-approvals',
  'driver-incentives',
  'documents',
  'users',
  'audit-log',
])

export function canDemoAccessApi(_pathname: string, _method: string): boolean {
  // Public demo sessions render synthetic client-side data only. They never
  // reach protected production APIs, even for read-only requests.
  return false
}

export function canDemoAccessNav(itemId: string): boolean {
  return !DEMO_BLOCKED_NAV_ITEMS.has(itemId)
}
