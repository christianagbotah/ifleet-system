// ─── Report Types & Interfaces ──────────────────────────────────────────

export type ReportType =
  // Financial
  | 'trip_summary'
  | 'expense_report'
  | 'fleet_profit_loss'
  | 'payroll_report'
  | 'cash_advances_report'
  | 'toll_report'
  // Operations
  | 'daily_summary'
  | 'driver_performance'
  | 'driver_incentives_report'
  | 'waybill_report'
  | 'load_board_report'
  | 'border_crossings_report'
  | 'depot_queue_report'
  // Fleet
  | 'fleet_overview'
  | 'maintenance_report'
  | 'tyre_report'
  | 'compliance_report'
  | 'insurance_claims_report'
  | 'safety_report'
  // Analytics
  | 'cost_analytics'
  | 'trip_profitability'
  | 'fuel_report'
  | 'fuel_anomaly_report'
  | 'fuel_analytics'
  | 'safety_scoring'
  // Other
  | 'warehouse_report'

export type ExportFormat = 'pdf' | 'xlsx' | 'csv'

export interface ReportParams {
  dateFrom?: string
  dateTo?: string
  truckId?: string
  driverId?: string
  tripId?: string
  zoneId?: string
  [key: string]: string | undefined
}

export interface GenerateReportRequest {
  type: ReportType
  format: ExportFormat
  params: ReportParams
}
