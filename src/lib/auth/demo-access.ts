const DEMO_SENSITIVE_API_PREFIXES = [
  '/api/users',
  '/api/roles',
  '/api/audit-logs',
  '/api/payroll',
  '/api/settlements',
  '/api/expenses',
  '/api/expense-approvals',
  '/api/cash-advances',
  '/api/driver-wallets',
  '/api/driver-incentives',
  '/api/incentives',
  '/api/invoices',
  '/api/financials',
  '/api/analytics/costs',
  '/api/export/financial',
  '/api/reports/payslip',
  '/api/payments',
  '/api/documents',
] as const

const DEMO_BLOCKED_NAV_ITEMS = new Set([
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

export function canDemoAccessApi(pathname: string, method: string): boolean {
  const normalizedMethod = method.toUpperCase()
  if (['POST', 'PUT', 'PATCH', 'DELETE'].includes(normalizedMethod)) return false
  if (normalizedMethod !== 'GET' && normalizedMethod !== 'HEAD' && normalizedMethod !== 'OPTIONS') return false
  return !DEMO_SENSITIVE_API_PREFIXES.some((prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`))
}

export function canDemoAccessNav(itemId: string): boolean {
  return !DEMO_BLOCKED_NAV_ITEMS.has(itemId)
}
