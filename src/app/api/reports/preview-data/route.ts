import { NextRequest, NextResponse } from 'next/server'
import { requireAuth } from '@/lib/auth-server'
import { fetchTripSummaryData, fetchFuelReportData, fetchExpenseReportData, fetchPayrollReportData, fetchFleetOverviewData, fetchDriverPerformanceData, fetchMaintenanceReportData } from '@/lib/reports/report-data'
import { fetchComplianceData, fetchTyreReportData, fetchInsuranceClaimsData, fetchWarehouseData, fetchDriverIncentivesData, fetchTollData, fetchSafetyInspectionsData, fetchCashAdvancesData, fetchDailySummaryData, fetchBorderCrossingsData, fetchDepotQueueData, fetchLoadBoardData, fetchFuelAnomalyData, fetchCostAnalyticsData, fetchTripProfitabilityData, fetchFuelAnalyticsData, fetchSafetyScoringData, fetchFleetProfitLossData } from '@/lib/reports/report-data-new'
import type { ReportParams } from '@/lib/reports/types'

const VALID_REPORT_TYPES = [
  'trip_summary', 'fuel_report', 'expense_report', 'payroll_report',
  'fleet_overview', 'daily_summary', 'driver_performance', 'maintenance_report',
  'compliance_report', 'tyre_report', 'insurance_claims_report', 'warehouse_report',
  'driver_incentives_report', 'toll_report', 'safety_report', 'cash_advances_report',
  'border_crossings_report', 'depot_queue_report', 'load_board_report', 'fuel_anomaly_report',
  'cost_analytics', 'trip_profitability', 'fuel_analytics', 'safety_scoring',
  'fleet_profit_loss',
]

export async function POST(request: NextRequest) {
  const auth = requireAuth(request)
  if (auth instanceof NextResponse) return auth

  try {
    const body = await request.json()
    const { type, params = {} } = body as { type: string; params: ReportParams }

    if (!type || !VALID_REPORT_TYPES.includes(type)) {
      return NextResponse.json({ error: `Invalid report type: ${type}` }, { status: 400 })
    }

    const fetchers: Record<string, (params: ReportParams) => Promise<{ headers: string[]; rows: (string | number | null | undefined)[][] }>> = {
      // Original 7 (minus waybill which needs tripId)
      trip_summary: (p) => fetchTripSummaryData(p),
      fuel_report: (p) => fetchFuelReportData(p),
      expense_report: (p) => fetchExpenseReportData(p),
      payroll_report: (p) => fetchPayrollReportData(p),
      fleet_overview: () => fetchFleetOverviewData(),
      driver_performance: (p) => fetchDriverPerformanceData(p),
      maintenance_report: (p) => fetchMaintenanceReportData(p),
      // New 13
      compliance_report: (p) => fetchComplianceData(p),
      tyre_report: (p) => fetchTyreReportData(p),
      insurance_claims_report: (p) => fetchInsuranceClaimsData(p),
      warehouse_report: (p) => fetchWarehouseData(p),
      driver_incentives_report: (p) => fetchDriverIncentivesData(p),
      toll_report: (p) => fetchTollData(p),
      safety_report: (p) => fetchSafetyInspectionsData(p),
      cash_advances_report: (p) => fetchCashAdvancesData(p),
      daily_summary: (p) => fetchDailySummaryData(p.date),
      border_crossings_report: (p) => fetchBorderCrossingsData(p),
      depot_queue_report: (p) => fetchDepotQueueData(p),
      load_board_report: (p) => fetchLoadBoardData(p),
      fuel_anomaly_report: (p) => fetchFuelAnomalyData(p),
      // Analytics 4
      cost_analytics: (p) => fetchCostAnalyticsData(p),
      trip_profitability: (p) => fetchTripProfitabilityData(p),
      fuel_analytics: (p) => fetchFuelAnalyticsData(p),
      safety_scoring: (p) => fetchSafetyScoringData(p),
      fleet_profit_loss: (p) => fetchFleetProfitLossData(p),
    }

    const fetcher = fetchers[type]
    if (!fetcher) {
      return NextResponse.json({ error: `No data fetcher for: ${type}` }, { status: 400 })
    }

    const data = await fetcher(params)

    return NextResponse.json({
      type,
      headers: data.headers,
      rows: data.rows,
      rowCount: data.rows.length,
      generatedAt: new Date().toISOString(),
    })
  } catch (error) {
    console.error('[Reports Preview] Data fetch failed:', error)
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to fetch report data' },
      { status: 500 }
    )
  }
}
