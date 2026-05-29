import { NextRequest, NextResponse } from 'next/server'
import { requireAuth } from '@/lib/auth-server'
import { db } from '@/lib/db'
import { fetchTripSummaryData, fetchFuelReportData, fetchExpenseReportData, fetchPayrollReportData, fetchFleetOverviewData, fetchWaybillData, fetchDriverPerformanceData, fetchMaintenanceReportData } from '@/lib/reports/report-data'
import { fetchComplianceData, fetchTyreReportData, fetchInsuranceClaimsData, fetchWarehouseData, fetchDriverIncentivesData, fetchTollData, fetchSafetyInspectionsData, fetchCashAdvancesData, fetchDailySummaryData, fetchBorderCrossingsData, fetchDepotQueueData, fetchLoadBoardData, fetchFuelAnomalyData, fetchCostAnalyticsData, fetchTripProfitabilityData, fetchFuelAnalyticsData, fetchSafetyScoringData, fetchFleetProfitLossData } from '@/lib/reports/report-data-new'
import { buildCsv, generateReportFilename } from '@/lib/reports/csv-generator'
import type { ReportType, ExportFormat, ReportParams } from '@/lib/reports/types'

const VALID_REPORT_TYPES: ReportType[] = [
  // Original 7
  'trip_summary', 'fuel_report', 'expense_report', 'payroll_report',
  'fleet_overview', 'daily_summary', 'waybill_report', 'driver_performance', 'maintenance_report',
  // New 13
  'compliance_report', 'tyre_report', 'insurance_claims_report', 'warehouse_report',
  'driver_incentives_report', 'toll_report', 'safety_report', 'cash_advances_report',
  'border_crossings_report', 'depot_queue_report', 'load_board_report', 'fuel_anomaly_report',
  // Analytics 4
  'cost_analytics', 'trip_profitability', 'fuel_analytics', 'safety_scoring',
  'fleet_profit_loss',
]

const VALID_FORMATS: ExportFormat[] = ['csv', 'xlsx', 'pdf']

const CONTENT_TYPES: Record<string, string> = {
  csv: 'text/csv',
  xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  pdf: 'application/pdf',
}

async function generateCsvReport(type: string, params: ReportParams): Promise<{ content: string; headers: string[]; rows: (string | number | null | undefined)[][] }> {
  const fetchers: Record<string, (params: ReportParams) => Promise<{ headers: string[]; rows: (string | number | null | undefined)[][] }>> = {
    // Original 7
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
  if (!fetcher) throw new Error(`Unsupported report type for CSV: ${type}`)

  const data = await fetcher(params)
  return { content: buildCsv(data.headers, data.rows), headers: data.headers, rows: data.rows }
}

async function generateExcelReport(type: string, params: ReportParams): Promise<Buffer> {
  // Dynamic import to keep bundle size manageable
  const [
    { buildTripSummaryReport, buildFuelReport, buildExpenseReport, buildPayrollReport, buildFleetOverviewReport, buildDriverPerformanceReport, buildMaintenanceReport },
    { buildComplianceReport, buildTyreReport, buildInsuranceClaimsReport, buildWarehouseReport, buildDriverIncentivesReport, buildTollReport, buildSafetyReport, buildCashAdvancesReport, buildDailySummaryReport, buildBorderCrossingsReport, buildDepotQueueReport, buildLoadBoardReport, buildFuelAnomalyReport, buildCostAnalyticsReport, buildTripProfitabilityReport, buildFuelAnalyticsReport, buildSafetyScoringReport },
  ] = await Promise.all([
    import('@/lib/reports/report-builders'),
    import('@/lib/reports/report-builders-new'),
  ])

  const builders: Record<string, (params: ReportParams) => Promise<{ toBuffer: () => Promise<Buffer> }>> = {
    trip_summary: (p) => buildTripSummaryReport(p),
    fuel_report: (p) => buildFuelReport(p),
    expense_report: (p) => buildExpenseReport(p),
    payroll_report: (p) => buildPayrollReport(p),
    fleet_overview: () => buildFleetOverviewReport(),
    driver_performance: (p) => buildDriverPerformanceReport(p),
    maintenance_report: (p) => buildMaintenanceReport(p),
    compliance_report: (p) => buildComplianceReport(p),
    tyre_report: (p) => buildTyreReport(p),
    insurance_claims_report: (p) => buildInsuranceClaimsReport(p),
    warehouse_report: (p) => buildWarehouseReport(p),
    driver_incentives_report: (p) => buildDriverIncentivesReport(p),
    toll_report: (p) => buildTollReport(p),
    safety_report: (p) => buildSafetyReport(p),
    cash_advances_report: (p) => buildCashAdvancesReport(p),
    daily_summary: (p) => buildDailySummaryReport(p),
    border_crossings_report: (p) => buildBorderCrossingsReport(p),
    depot_queue_report: (p) => buildDepotQueueReport(p),
    load_board_report: (p) => buildLoadBoardReport(p),
    fuel_anomaly_report: (p) => buildFuelAnomalyReport(p),
    // Analytics 4
    cost_analytics: (p) => buildCostAnalyticsReport(p),
    trip_profitability: (p) => buildTripProfitabilityReport(p),
    fuel_analytics: (p) => buildFuelAnalyticsReport(p),
    safety_scoring: (p) => buildSafetyScoringReport(p),
    fleet_profit_loss: (p) => buildFleetProfitLossFromCsv(p),
  }

  const builder = builders[type]
  if (!builder) throw new Error(`Unsupported report type for Excel: ${type}`)

  const report = await builder(params)
  return report.toBuffer()
}

async function generatePdfReport(type: string, params: ReportParams): Promise<Buffer> {
  const [
    { buildTripSummaryPdf, buildFuelReportPdf, buildExpenseReportPdf, buildPayrollReportPdf, buildFleetOverviewPdf, buildDriverPerformancePdf, buildMaintenanceReportPdf },
    { buildComplianceReportPdf, buildTyreReportPdf, buildInsuranceClaimsReportPdf, buildWarehouseReportPdf, buildDriverIncentivesReportPdf, buildTollReportPdf, buildSafetyReportPdf, buildCashAdvancesReportPdf, buildDailySummaryPdf, buildBorderCrossingsReportPdf, buildDepotQueueReportPdf, buildLoadBoardReportPdf, buildFuelAnomalyReportPdf, buildCostAnalyticsReportPdf, buildTripProfitabilityReportPdf, buildFuelAnalyticsReportPdf, buildSafetyScoringReportPdf },
  ] = await Promise.all([
    import('@/lib/reports/pdf-builders'),
    import('@/lib/reports/pdf-builders-new'),
  ])

  const builders: Record<string, (params: ReportParams) => Promise<{ output: (type: string) => ArrayBuffer }>> = {
    trip_summary: (p) => buildTripSummaryPdf(p),
    fuel_report: (p) => buildFuelReportPdf(p),
    expense_report: (p) => buildExpenseReportPdf(p),
    payroll_report: (p) => buildPayrollReportPdf(p),
    fleet_overview: () => buildFleetOverviewPdf(),
    driver_performance: (p) => buildDriverPerformancePdf(p),
    maintenance_report: (p) => buildMaintenanceReportPdf(p),
    compliance_report: (p) => buildComplianceReportPdf(p),
    tyre_report: (p) => buildTyreReportPdf(p),
    insurance_claims_report: (p) => buildInsuranceClaimsReportPdf(p),
    warehouse_report: (p) => buildWarehouseReportPdf(p),
    driver_incentives_report: (p) => buildDriverIncentivesReportPdf(p),
    toll_report: (p) => buildTollReportPdf(p),
    safety_report: (p) => buildSafetyReportPdf(p),
    cash_advances_report: (p) => buildCashAdvancesReportPdf(p),
    daily_summary: (p) => buildDailySummaryPdf(p),
    border_crossings_report: (p) => buildBorderCrossingsReportPdf(p),
    depot_queue_report: (p) => buildDepotQueueReportPdf(p),
    load_board_report: (p) => buildLoadBoardReportPdf(p),
    fuel_anomaly_report: (p) => buildFuelAnomalyReportPdf(p),
    // Analytics 4
    cost_analytics: (p) => buildCostAnalyticsReportPdf(p),
    trip_profitability: (p) => buildTripProfitabilityReportPdf(p),
    fuel_analytics: (p) => buildFuelAnalyticsReportPdf(p),
    safety_scoring: (p) => buildSafetyScoringReportPdf(p),
    fleet_profit_loss: (p) => buildFleetProfitLossPdfFromCsv(p),
  }

  const builder = builders[type]
  if (!builder) throw new Error(`Unsupported report type for PDF: ${type}`)

  const pdf = await builder(params)
  return Buffer.from(pdf.output('arraybuffer'))
}

// ─── Generic CSV-to-Excel builder for fleet_profit_loss ─────────────────
async function buildFleetProfitLossFromCsv(params: ReportParams): Promise<{ toBuffer: () => Promise<Buffer> }> {
  const ExcelJS = (await import('exceljs')).default
  const { fetchFleetProfitLossData } = await import('@/lib/reports/report-data-new')
  const data = await fetchFleetProfitLossData(params)

  const workbook = new ExcelJS.Workbook()
  workbook.creator = 'iFleet Pro'
  const sheet = workbook.addWorksheet('Fleet Profit & Loss')

  // Style the header row
  const headerRow = sheet.addRow(data.headers)
  headerRow.eachCell((cell) => {
    cell.font = { bold: true, size: 11 }
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFE8F5E9' } }
    cell.alignment = { horizontal: 'center' }
    cell.border = {
      bottom: { style: 'thin', color: { argb: 'FFCCCCCC' } },
    }
  })

  // Add data rows
  for (const row of data.rows) {
    sheet.addRow(row.map((v) => v ?? ''))
  }

  // Auto-fit columns (approximate)
  data.headers.forEach((h, i) => {
    const col = sheet.getColumn(i + 1)
    col.width = Math.max(h.length + 2, 14)
  })

  const buffer = await workbook.xlsx.writeBuffer()
  return { toBuffer: () => Promise.resolve(Buffer.from(buffer)) }
}

// ─── Generic CSV-to-PDF builder for fleet_profit_loss ──────────────────
async function buildFleetProfitLossPdfFromCsv(params: ReportParams): Promise<{ output: (type: string) => ArrayBuffer }> {
  const jsPDF = (await import('jspdf')).default
  const autoTable = (await import('jspdf-autotable')).default
  const { fetchFleetProfitLossData } = await import('@/lib/reports/report-data-new')
  const data = await fetchFleetProfitLossData(params)

  const doc = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a4' })

  // Title
  doc.setFontSize(18)
  doc.setTextColor(30, 30, 30)
  doc.text('Fleet Profit & Loss Report', 14, 20)

  // Date range subtitle
  doc.setFontSize(10)
  doc.setTextColor(100, 100, 100)
  const dateRange = params.dateFrom && params.dateTo
    ? `${params.dateFrom} to ${params.dateTo}`
    : new Date().toLocaleDateString('en-US', { month: 'long', year: 'numeric' })
  doc.text(`Period: ${dateRange}`, 14, 28)

  // Generated timestamp
  doc.text(`Generated: ${new Date().toLocaleString()}`, 14, 34)

  // Draw table
  autoTable(doc, {
    startY: 40,
    head: [data.headers],
    body: data.rows.map((row) => row.map((v) => v ?? '')),
    styles: { fontSize: 8, cellPadding: 3 },
    headStyles: { fillColor: [16, 185, 129], textColor: 255, fontStyle: 'bold', fontSize: 8 },
    alternateRowStyles: { fillColor: [245, 245, 245] },
    margin: { left: 14, right: 14 },
  })

  // Footer
  const pageCount = doc.getNumberOfPages()
  for (let i = 1; i <= pageCount; i++) {
    doc.setPage(i)
    doc.setFontSize(8)
    doc.setTextColor(150, 150, 150)
    doc.text(
      `iFleet Pro — Fleet Management System | Page ${i} of ${pageCount}`,
      doc.internal.pageSize.getWidth() / 2,
      doc.internal.pageSize.getHeight() - 10,
      { align: 'center' }
    )
  }

  return { output: (type: string) => doc.output(type) as ArrayBuffer }
}

export async function POST(request: NextRequest) {
  const auth = requireAuth(request)
  if (auth instanceof NextResponse) return auth

  let reportType = 'unknown'
  let reportFormat = 'unknown'
  let reportParams: ReportParams = {}

  try {
    const body = await request.json()
    const { type, format, params = {} } = body as { type: string; format: string; params: ReportParams }
    reportType = type || 'unknown'
    reportFormat = format || 'unknown'
    reportParams = params

    if (!type || !format) {
      return NextResponse.json({ error: 'Missing required fields: type, format' }, { status: 400 })
    }

    if (!VALID_REPORT_TYPES.includes(type as ReportType)) {
      return NextResponse.json({ error: `Invalid report type. Must be one of: ${VALID_REPORT_TYPES.join(', ')}` }, { status: 400 })
    }

    if (!VALID_FORMATS.includes(format as ExportFormat)) {
      return NextResponse.json({ error: `Invalid format. Must be one of: ${VALID_FORMATS.join(', ')}` }, { status: 400 })
    }

    // Waybill requires a specific tripId
    if (type === 'waybill_report' && !params.tripId) {
      return NextResponse.json({ error: 'waybill_report requires a tripId parameter' }, { status: 400 })
    }

    let content: string | Buffer
    let fileSize = 0

    // Handle waybill specially — uses dedicated PDF builder
    if (type === 'waybill_report' && format === 'pdf') {
      try {
        const { buildWaybillPdf } = await import('@/lib/reports/waybill-pdf')
        const pdf = await buildWaybillPdf(params.tripId!)
        const buffer = Buffer.from(pdf.output('arraybuffer'))
        content = buffer
        fileSize = buffer.length
      } catch (err) {
        throw new Error(`Waybill PDF generation failed: ${err instanceof Error ? err.message : String(err)}`)
      }
    } else if (format === 'csv') {
      try {
        const result = await generateCsvReport(type, params)
        content = result.content
        fileSize = Buffer.byteLength(content, 'utf-8')
      } catch (err) {
        throw new Error(`CSV data fetch failed for ${type}: ${err instanceof Error ? err.message : String(err)}`)
      }
    } else if (format === 'xlsx') {
      try {
        content = await generateExcelReport(type, params)
        fileSize = (content as Buffer).length
      } catch (err) {
        throw new Error(`Excel generation failed for ${type}: ${err instanceof Error ? err.message : String(err)}`)
      }
    } else if (format === 'pdf') {
      try {
        content = await generatePdfReport(type, params)
        fileSize = (content as Buffer).length
      } catch (err) {
        throw new Error(`PDF generation failed for ${type}: ${err instanceof Error ? err.message : String(err)}`)
      }
    } else {
      return NextResponse.json({ error: 'Unsupported format' }, { status: 400 })
    }

    // Save report history (non-blocking — don't fail the whole request if history save fails)
    const titleMap: Record<string, string> = {
      trip_summary: 'Trip Summary Report',
      fuel_report: 'Fuel Report',
      expense_report: 'Expense Report',
      payroll_report: 'Payroll Report',
      fleet_overview: 'Fleet Overview Report',
      daily_summary: 'Daily Summary Report',
      waybill_report: `Waybill Report - ${params.tripId}`,
      driver_performance: 'Driver Performance Report',
      maintenance_report: 'Maintenance Report',
      // New 13
      compliance_report: 'Compliance & Document Expiry Report',
      tyre_report: 'Tyre Management Report',
      insurance_claims_report: 'Insurance Claims Report',
      warehouse_report: 'Warehouse Inventory Report',
      driver_incentives_report: 'Driver Incentives Report',
      toll_report: 'Toll & Checkpoint Report',
      safety_report: 'Vehicle Inspection & Safety Report',
      cash_advances_report: 'Cash Advances Report',
      border_crossings_report: 'Border Crossings Report',
      depot_queue_report: 'Depot Queue Report',
      load_board_report: 'Load Board / Freight Matching Report',
      fuel_anomaly_report: 'Fuel Anomaly Detection Report',
      // Analytics 4
      cost_analytics: 'Cost Analytics Report',
      trip_profitability: 'Trip Profitability Report',
      fuel_analytics: 'Fuel Analytics Report',
      safety_scoring: 'Safety Scoring Report',
      fleet_profit_loss: 'Fleet Profit & Loss Report',
    }

    try {
      await db.reportHistory.create({
        data: {
          type,
          title: titleMap[type] || type,
          format,
          parameters: JSON.stringify(params),
          generatedBy: auth.email,
          fileSize,
          status: 'completed',
        },
      })
    } catch (historyErr) {
      console.error('[Reports] Failed to save report history:', historyErr instanceof Error ? historyErr.message : String(historyErr))
      // Don't fail the request — the report was generated successfully
    }

    const filename = generateReportFilename(type, format)
    const contentType = CONTENT_TYPES[format] || 'application/octet-stream'

    return new NextResponse(content, {
      headers: {
        'Content-Type': contentType,
        'Content-Disposition': `attachment; filename="${filename}"`,
        'Content-Length': String(fileSize),
      },
    })
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error'
    const errorName = error instanceof Error ? error.constructor.name : 'Error'
    const errorStack = error instanceof Error ? error.stack : ''
    console.error(`[Reports] Generation failed for type=${reportType} format=${reportFormat}:`)
    console.error('  Error:', errorName, '-', errorMessage)
    if (errorStack) console.error('  Stack:', errorStack)

    // Save failed report history
    try {
      await db.reportHistory.create({
        data: {
          type: reportType,
          title: `Failed: ${reportType}`,
          format: reportFormat,
          parameters: JSON.stringify(reportParams),
          generatedBy: auth.email,
          status: 'failed',
          error: errorMessage,
        },
      })
    } catch {
      // ignore history save failure
    }

    // Return a descriptive error to help the user understand what went wrong
    return NextResponse.json(
      { error: `Report generation failed: ${errorMessage}` },
      { status: 500 }
    )
  }
}
