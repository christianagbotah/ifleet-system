export interface ReportParams {
  dateFrom?: string
  dateTo?: string
  truckId?: string
  driverId?: string
  clientId?: string
  status?: string
  tripId?: string
  period?: string
  periodStart?: string
  periodEnd?: string
  date?: string
  depotName?: string
  country?: string
  tollType?: string
  pickupRegion?: string
  category?: string
}

export type ReportType =
  | 'trip_summary'
  | 'fuel_report'
  | 'expense_report'
  | 'payroll_report'
  | 'fleet_overview'
  | 'daily_summary'
  | 'waybill_report'
  | 'driver_performance'
  | 'maintenance_report'
  | 'compliance_report'
  | 'tyre_report'
  | 'insurance_claims_report'
  | 'warehouse_report'
  | 'driver_incentives_report'
  | 'toll_report'
  | 'safety_report'
  | 'cash_advances_report'
  | 'border_crossings_report'
  | 'depot_queue_report'
  | 'load_board_report'
  | 'fuel_anomaly_report'
  | 'fleet_profit_loss'
  | 'cost_analytics'
  | 'trip_profitability'
  | 'fuel_analytics'
  | 'safety_scoring'

export type ExportFormat = 'pdf' | 'xlsx' | 'csv'
