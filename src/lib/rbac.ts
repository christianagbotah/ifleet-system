// ════════════════════════════════════════════════════════════════════
// iFleetPro — Role-Based Access Control (RBAC)
// ════════════════════════════════════════════════════════════════════
//
// Centralized access control for financial data visibility.
// Only Admin and Manager roles can see financial information.
// Drivers see operational data only (their own trips, expenses, compliance).
//
// SECURITY RULES:
// ───────────────────
// Drivers CANNOT see:
//   - Revenue, margins, profitability, net profit
//   - Fleet-wide cost analytics, trip profitability analysis
//   - Fuel cost analytics, fuel anomaly cost detection
//   - Invoices, payroll, settlements, expense approvals
//   - Pricing & margins, fuel budgets
//   - Revenue vs Expense charts, financial KPI cards
//   - Financial reports (cost, profitability, fuel analytics, etc.)
//
// Drivers CAN see:
//   - Their own trips (status, route, cargo) — NO revenue
//   - Their own expenses incurred during transit/delivery
//   - Their own cash advances
//   - Trip status progress, waybills (without revenue)
//   - Compliance docs (license, Ghana card, DVLA, roadworthy)
//   - Vehicle inspections, maintenance records
//   - Safety scoring (their own score)
//   - Their own fuel logs (consumption data)
//   - Toll records (their own)
//   - Notifications, profile, settings
// ════════════════════════════════════════════════════════════════════

/** Navigation page IDs that are purely financial — require `financial.view` permission */
export const FINANCIAL_PAGE_IDS: readonly string[] = [
  'truck-financials',      // Truck P&L Tracker — daily revenue/expense tracking
  'cost-analytics',        // Cost Analytics — per-truck cost breakdown
  'trip-profitability',    // Trip Profitability — revenue vs costs, margins
  'fuel-analytics',        // Fuel Analytics — fuel cost trends
  'fuel-anomaly',          // Fuel Anomaly Detection — cost-based anomaly flags
  'fuel-budgets',          // Fuel Budgets — budget vs actual costs
  'pricing',               // Pricing & Margins — pricing tables, margins
  'invoices',              // Invoices — billing, revenue
  'payroll',               // Payroll — all driver pay details
  'settlements',           // Settlements — payment settlements
  'expense-approvals',     // Expense Approvals — approval workflows
  'analytics',             // Analytics — has revenue/expenses charts
  'fuel-prices',           // Fuel Prices — cost per liter trends
  'driver-incentives',     // Driver Incentives — bonus amounts
]

/** Report type IDs that contain financial data — hidden from drivers */
export const FINANCIAL_REPORT_IDS: readonly string[] = [
  'trip_summary',          // Contains revenue, expenses, margins
  'fuel_report',           // Contains fuel costs
  'expense_report',        // Contains expense amounts
  'payroll_report',        // Contains salary details
  'driver_performance',    // Contains revenue metrics
  'maintenance_report',     // Contains maintenance costs
  'daily_summary',         // Contains revenue, expenses, profit
  'fuel_anomaly_report',   // Contains cost-based anomaly detection
  'cost_analytics',        // Cost breakdown
  'trip_profitability',    // Revenue vs costs, margins
  'fuel_analytics',        // Fuel cost analysis
  'cash_advances_report',  // Advance amounts, balances
  'toll_report',           // Toll amounts, fines
  'insurance_claims_report', // Claim amounts, approved amounts
  'fleet_profit_loss',     // Fleet P&L report — truck revenue/expense/net
  'warehouse_report',      // Inventory values
  'driver_incentives_report', // Bonus amounts
]

/** Report types that are safe for drivers to see (operational only) */
export const DRIVER_SAFE_REPORT_IDS: readonly string[] = [
  'fleet_overview',        // Truck status, mileage — no financials
  'compliance_report',     // Document expiry tracking
  'safety_report',         // Vehicle inspection results
  'tyre_report',           // Tyre condition tracking
  'border_crossings_report', // Border wait times, status
  'depot_queue_report',    // Queue management, wait times
  'load_board_report',     // Freight matching status
  'safety_scoring',        // Driver safety scores
]

/**
 * Check if a page requires financial access permission.
 * Used by the navigation permission system.
 */
export function isFinancialPage(pageId: string): boolean {
  return FINANCIAL_PAGE_IDS.includes(pageId)
}

/**
 * Check if a report type contains financial data.
 * Used to filter the Reports page for drivers.
 */
export function isFinancialReport(reportId: string): boolean {
  return FINANCIAL_REPORT_IDS.includes(reportId)
}
