// ════════════════════════════════════════════════════════════════════
// ${APP_NAME} — PDF Report Builders
// ════════════════════════════════════════════════════════════════════
//
// Server-side PDF report generators using the PdfReport class.
// Each builder queries the database, assembles KPI cards, data tables,
// and produces a branded landscape PDF ready for download.
// ────────────────────────────────────────────────────────────────────

import jsPDF from 'jspdf'
import { db } from '@/lib/db'
import { PdfReport, formatGHS, formatNumber, fmtDate, buildPdfSubtitle, buildTripWhereClause } from './pdf-generator'
import type { ReportParams } from './types'
import { APP_NAME } from '@/lib/constants'

// ════════════════════════════════════════════════════════════════════
// 1. TRIP SUMMARY PDF
// ════════════════════════════════════════════════════════════════════

export async function buildTripSummaryPdf(params: ReportParams): Promise<jsPDF> {
  const where = buildTripWhereClause(params)
  const trips = await db.trip.findMany({
    where,
    include: {
      driver: { select: { firstName: true, lastName: true } },
      truck: { select: { plateNumber: true, make: true } },
      client: { select: { companyName: true } },
      Expense: { select: { amount: true } },
    },
    orderBy: { departureTime: 'desc' },
  })

  const totalTrips = trips.length
  const completedTrips = trips.filter((t) => t.status === 'completed').length
  const totalRevenue = trips.reduce((s, t) => s + (t.totalRevenue ?? 0), 0)
  const totalExpenses = trips.reduce((s, t) => s + t.Expense.reduce((se, e) => se + e.amount, 0), 0)

  const pdf = new PdfReport('landscape')
  pdf.addHeader()
  pdf.addTitle('Trip Summary Report')
  pdf.addSubtitle(buildPdfSubtitle(params))
  pdf.addKPICards([
    { label: 'Total Trips', value: String(totalTrips) },
    { label: 'Completed', value: String(completedTrips) },
    { label: 'Total Revenue', value: formatGHS(totalRevenue) },
    { label: 'Total Expenses', value: formatGHS(totalExpenses) },
    { label: 'Net Profit', value: formatGHS(totalRevenue - totalExpenses) },
    { label: 'Avg Revenue/Trip', value: formatGHS(totalTrips > 0 ? totalRevenue / totalTrips : 0) },
  ])

  const headers = ['Trip #', 'Date', 'Driver', 'Truck', 'Route', 'Cargo', 'Client', 'Status', 'Revenue', 'Expenses', 'Net']
  const rows = trips.map((t) => {
    const exp = t.Expense.reduce((s, e) => s + e.amount, 0)
    return [
      t.tripNumber,
      fmtDate(t.departureTime),
      `${t.driver.firstName} ${t.driver.lastName}`,
      `${t.truck.plateNumber}`,
      `${t.loadingLocation} \u2192 ${t.destination}`,
      `${t.quantity} ${t.unit} ${t.itemName}`,
      t.client?.companyName ?? t.customerName ?? '-',
      t.status.replace(/_/g, ' ').replace(/\b\w/g, (c: string) => c.toUpperCase()),
      formatGHS(t.totalRevenue ?? 0),
      formatGHS(exp),
      formatGHS((t.totalRevenue ?? 0) - exp),
    ]
  })

  pdf.addTable(headers, rows, {
    summaryRow: { label: 'TOTAL', values: ['', '', '', '', '', '', '', '', formatGHS(totalRevenue), formatGHS(totalExpenses), formatGHS(totalRevenue - totalExpenses)] },
    columnStyles: { 8: { halign: 'right' }, 9: { halign: 'right' }, 10: { halign: 'right' } },
  })
  pdf.addFooter()

  return pdf.pdf
}

// ════════════════════════════════════════════════════════════════════
// 2. FUEL REPORT PDF
// ════════════════════════════════════════════════════════════════════

export async function buildFuelReportPdf(params: ReportParams): Promise<jsPDF> {
  const dateFilter: Record<string, unknown> = {}
  if (params.dateFrom) dateFilter.gte = new Date(params.dateFrom)
  if (params.dateTo) dateFilter.lte = new Date(params.dateTo)

  const where: Record<string, unknown> = {}
  if (Object.keys(dateFilter).length > 0) where.date = dateFilter
  if (params.truckId) where.truckId = params.truckId

  const fuelLogs = await db.fuelLog.findMany({
    where,
    include: {
      truck: { select: { plateNumber: true, make: true } },
      trip: { select: { tripNumber: true } },
    },
    orderBy: { date: 'desc' },
  })

  const totalLiters = fuelLogs.reduce((s, f) => s + f.litersFilled, 0)
  const totalCost = fuelLogs.reduce((s, f) => s + f.totalCost, 0)
  const avgCostPerLiter = totalLiters > 0 ? totalCost / totalLiters : 0

  const pdf = new PdfReport('landscape')
  pdf.addHeader()
  pdf.addTitle('Fuel Report')
  pdf.addSubtitle(buildPdfSubtitle(params))
  pdf.addKPICards([
    { label: 'Total Fill-ups', value: String(fuelLogs.length) },
    { label: 'Total Liters', value: formatNumber(totalLiters) },
    { label: 'Total Cost', value: formatGHS(totalCost) },
    { label: 'Avg Cost/Liter', value: formatGHS(avgCostPerLiter) },
  ])

  const headers = ['Date', 'Trip #', 'Truck', 'Station', 'Odometer (km)', 'Liters', 'Cost/Liter', 'Total Cost', 'Receipt #']
  const rows = fuelLogs.map((f) => [
    fmtDate(f.date),
    f.trip?.tripNumber ?? '-',
    `${f.truck.plateNumber} (${f.truck.make})`,
    f.stationName ?? '-',
    formatNumber(f.odometer ?? 0),
    formatNumber(f.litersFilled),
    formatGHS(f.costPerLiter ?? 0),
    formatGHS(f.totalCost),
    f.receiptNumber ?? '-',
  ])

  pdf.addTable(headers, rows, {
    summaryRow: { label: 'TOTAL', values: ['', '', '', '', '', formatNumber(totalLiters), '', formatGHS(totalCost), ''] },
    columnStyles: { 5: { halign: 'right' }, 6: { halign: 'right' }, 7: { halign: 'right' } },
  })
  pdf.addFooter()

  return pdf.pdf
}

// ════════════════════════════════════════════════════════════════════
// 3. EXPENSE REPORT PDF
// ════════════════════════════════════════════════════════════════════

export async function buildExpenseReportPdf(params: ReportParams): Promise<jsPDF> {
  const dateFilter: Record<string, unknown> = {}
  if (params.dateFrom) dateFilter.gte = new Date(params.dateFrom)
  if (params.dateTo) dateFilter.lte = new Date(params.dateTo)

  const where: Record<string, unknown> = {}
  if (Object.keys(dateFilter).length > 0) where.date = dateFilter
  if (params.truckId) where.truckId = params.truckId
  if (params.status) where.status = params.status

  const expenses = await db.expense.findMany({
    where,
    include: {
      truck: { select: { plateNumber: true, make: true } },
      trip: { select: { tripNumber: true } },
    },
    orderBy: { date: 'desc' },
  })

  const totalAmount = expenses.reduce((s, e) => s + e.amount, 0)
  const categories = new Map<string, number>()
  for (const exp of expenses) categories.set(exp.category, (categories.get(exp.category) ?? 0) + exp.amount)
  const topCategory = [...categories.entries()].sort((a, b) => b[1] - a[1])[0]

  const pdf = new PdfReport('landscape')
  pdf.addHeader()
  pdf.addTitle('Expense Report')
  pdf.addSubtitle(buildPdfSubtitle(params))
  pdf.addKPICards([
    { label: 'Total Records', value: String(expenses.length) },
    { label: 'Total Amount', value: formatGHS(totalAmount) },
    { label: 'Categories', value: String(categories.size) },
    { label: 'Top Category', value: topCategory ? `${topCategory[0]} (${formatGHS(topCategory[1])})` : '-' },
  ])

  const headers = ['Date', 'Trip #', 'Truck', 'Category', 'Description', 'Amount', 'Payment', 'Status', 'Reference']
  const rows = expenses.map((e) => [
    fmtDate(e.date),
    e.trip?.tripNumber ?? '-',
    `${e.truck.plateNumber}`,
    e.category.replace(/_/g, ' ').replace(/\b\w/g, (c: string) => c.toUpperCase()),
    e.description,
    formatGHS(e.amount),
    e.paymentMethod.replace(/_/g, ' '),
    e.status.replace(/\b\w/g, (c: string) => c.toUpperCase()),
    e.reference ?? '-',
  ])

  pdf.addTable(headers, rows, {
    summaryRow: { label: 'TOTAL', values: ['', '', '', '', '', formatGHS(totalAmount), '', '', ''] },
    columnStyles: { 5: { halign: 'right' } },
  })
  pdf.addFooter()

  return pdf.pdf
}

// ════════════════════════════════════════════════════════════════════
// 4. PAYROLL REPORT PDF
// ════════════════════════════════════════════════════════════════════

const MONTH_NAMES = ['', 'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December']
const MONTH_SHORT = ['', 'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']

export async function buildPayrollReportPdf(params: ReportParams): Promise<jsPDF> {
  const where: Record<string, unknown> = {}
  if (params.periodStart && params.periodEnd) {
    where.createdAt = { gte: new Date(params.periodStart), lte: new Date(params.periodEnd) }
  }
  if (params.driverId) where.driverId = params.driverId

  const payrolls = await db.payroll.findMany({
    where,
    include: {
      driver: { select: { firstName: true, lastName: true, employeeId: true } },
    },
    orderBy: [{ year: 'desc' }, { month: 'desc' }],
  })

  const totalBase = payrolls.reduce((s, p) => s + p.baseSalary, 0)
  const totalBonus = payrolls.reduce((s, p) => s + p.tripBonus, 0)
  const totalOvertime = payrolls.reduce((s, p) => s + p.overtimePay, 0)
  const totalDeductions = payrolls.reduce((s, p) => s + p.deductions, 0)
  const totalNet = payrolls.reduce((s, p) => s + p.netPay, 0)

  const pdf = new PdfReport('landscape')
  pdf.addHeader()
  pdf.addTitle('Payroll Report')
  pdf.addSubtitle(buildPdfSubtitle(params))
  pdf.addKPICards([
    { label: 'Total Records', value: String(payrolls.length) },
    { label: 'Total Net Pay', value: formatGHS(totalNet) },
    { label: 'Total Bonuses', value: formatGHS(totalBonus) },
    { label: 'Total Deductions', value: formatGHS(totalDeductions) },
  ])

  const headers = ['Employee ID', 'Driver', 'Period', 'Base Salary', 'Trip Bonus', 'Overtime', 'Deductions', 'Net Pay', 'Status']
  const rows = payrolls.map((p) => [
    p.driver.employeeId,
    `${p.driver.firstName} ${p.driver.lastName}`,
    `${MONTH_SHORT[p.month]} ${p.year}`,
    formatGHS(p.baseSalary),
    formatGHS(p.tripBonus),
    formatGHS(p.overtimePay),
    formatGHS(p.deductions),
    formatGHS(p.netPay),
    p.status.replace(/\b\w/g, (c: string) => c.toUpperCase()),
  ])

  pdf.addTable(headers, rows, {
    summaryRow: {
      label: 'TOTAL',
      values: ['', '', '', formatGHS(totalBase), formatGHS(totalBonus), formatGHS(totalOvertime), formatGHS(totalDeductions), formatGHS(totalNet), ''],
    },
    columnStyles: { 3: { halign: 'right' }, 4: { halign: 'right' }, 5: { halign: 'right' }, 6: { halign: 'right' }, 7: { halign: 'right' } },
  })
  pdf.addFooter()

  return pdf.pdf
}

// ════════════════════════════════════════════════════════════════════
// 5. FLEET OVERVIEW PDF
// ════════════════════════════════════════════════════════════════════

export async function buildFleetOverviewPdf(): Promise<jsPDF> {
  const trucks = await db.truck.findMany({
    include: {
      driver: { select: { firstName: true, lastName: true } },
      Insurance: { where: { status: 'active' }, orderBy: { endDate: 'asc' }, take: 1 },
      _count: { select: { Trip: true, MaintenanceRecord: true } },
    },
    orderBy: { plateNumber: 'asc' },
  })

  const totalTrucks = trucks.length
  const activeTrucks = trucks.filter((t) => t.status === 'active').length
  const maintenanceTrucks = trucks.filter((t) => t.status === 'maintenance').length
  const assignedTrucks = trucks.filter((t) => t.driverId).length

  const pdf = new PdfReport('landscape')
  pdf.addHeader()
  pdf.addTitle('Fleet Overview Report')
  pdf.addSubtitle(`Generated: ${fmtDate(new Date())} | Total Fleet: ${totalTrucks} trucks`)
  pdf.addKPICards([
    { label: 'Total Trucks', value: String(totalTrucks) },
    { label: 'Active', value: String(activeTrucks) },
    { label: 'In Maintenance', value: String(maintenanceTrucks) },
    { label: 'Assigned to Driver', value: String(assignedTrucks) },
  ])

  const headers = ['Plate #', 'Make / Model', 'Year', 'Driver', 'Status', 'Mileage (km)', 'Trips', 'Insurance Expiry', 'Next Service', 'Fuel']
  const rows = trucks.map((t) => [
    t.plateNumber,
    `${t.make} ${t.model}`,
    String(t.year),
    t.driver ? `${t.driver.firstName} ${t.driver.lastName}` : 'Unassigned',
    t.status.replace(/\b\w/g, (c: string) => c.toUpperCase()),
    formatNumber(t.currentMileage),
    String(t._count.Trip),
    fmtDate(t.Insurance[0]?.endDate) || 'None',
    fmtDate(t.nextServiceDate) || '-',
    t.fuelType,
  ])

  pdf.addTable(headers, rows)
  pdf.addFooter()

  return pdf.pdf
}

// ════════════════════════════════════════════════════════════════════
// 6. DRIVER PERFORMANCE PDF
// ════════════════════════════════════════════════════════════════════

export async function buildDriverPerformancePdf(params: ReportParams): Promise<jsPDF> {
  const driverWhere: Record<string, unknown> = {}
  if (params.driverId) driverWhere.id = params.driverId

  const drivers = await db.driver.findMany({
    where: driverWhere,
    include: {
      Truck: { select: { plateNumber: true } },
      Trip: {
        where: buildTripWhereClause(params),
        select: {
          status: true,
          totalRevenue: true,
          totalMileage: true,
          Expense: { select: { amount: true } },
        },
      },
    },
    orderBy: { lastName: 'asc' },
  })

  let fleetTotalTrips = 0
  let fleetCompleted = 0
  let fleetRevenue = 0
  let fleetExpenses = 0
  let fleetMileage = 0

  const rows: (string | number)[][] = []

  for (const d of drivers) {
    const trips = d.Trip
    const totalTrips = trips.length
    const completedTrips = trips.filter((t) => t.status === 'completed').length
    const completionRate = totalTrips > 0 ? ((completedTrips / totalTrips) * 100).toFixed(1) + '%' : '-'
    const totalRevenue = trips.reduce((s, t) => s + (t.totalRevenue ?? 0), 0)
    const totalExpenses = trips.reduce((s, t) => s + t.Expense.reduce((se, e) => se + e.amount, 0), 0)
    const totalMileage = trips.reduce((s, t) => s + (t.totalMileage ?? 0), 0)

    fleetTotalTrips += totalTrips
    fleetCompleted += completedTrips
    fleetRevenue += totalRevenue
    fleetExpenses += totalExpenses
    fleetMileage += totalMileage

    rows.push([
      `${d.firstName} ${d.lastName}`,
      d.employeeId,
      d.Truck.length > 0 ? d.Truck[0].plateNumber : 'Unassigned',
      String(totalTrips),
      String(completedTrips),
      completionRate,
      formatGHS(totalRevenue),
      formatGHS(totalExpenses),
      formatGHS(totalRevenue - totalExpenses),
      formatNumber(totalMileage),
      String(d.rating),
      fmtDate(d.hireDate),
    ])
  }

  const pdf = new PdfReport('landscape')
  pdf.addHeader()
  pdf.addTitle('Driver Performance Report')
  pdf.addSubtitle(buildPdfSubtitle(params))
  pdf.addKPICards([
    { label: 'Total Drivers', value: String(drivers.length) },
    { label: 'Fleet Trips', value: String(fleetTotalTrips) },
    { label: 'Fleet Revenue', value: formatGHS(fleetRevenue) },
    { label: 'Fleet Net Profit', value: formatGHS(fleetRevenue - fleetExpenses) },
    { label: 'Avg Completion', value: fleetTotalTrips > 0 ? `${((fleetCompleted / fleetTotalTrips) * 100).toFixed(1)}%` : '-' },
    { label: 'Fleet Mileage', value: `${formatNumber(fleetMileage)} km` },
  ])

  const headers = ['Driver', 'Employee ID', 'Truck', 'Trips', 'Completed', 'Rate', 'Revenue', 'Expenses', 'Net Profit', 'Mileage (km)', 'Rating', 'Hire Date']

  pdf.addTable(headers, rows, {
    summaryRow: {
      label: 'FLEET TOTAL',
      values: ['', '', '', String(fleetTotalTrips), String(fleetCompleted), '', formatGHS(fleetRevenue), formatGHS(fleetExpenses), formatGHS(fleetRevenue - fleetExpenses), formatNumber(fleetMileage), '', ''],
    },
    columnStyles: { 6: { halign: 'right' }, 7: { halign: 'right' }, 8: { halign: 'right' }, 9: { halign: 'right' } },
  })
  pdf.addFooter()

  return pdf.pdf
}

// ════════════════════════════════════════════════════════════════════
// 7. MAINTENANCE REPORT PDF
// ════════════════════════════════════════════════════════════════════

export async function buildMaintenanceReportPdf(params: ReportParams): Promise<jsPDF> {
  const dateFilter: Record<string, unknown> = {}
  if (params.dateFrom) dateFilter.gte = new Date(params.dateFrom)
  if (params.dateTo) dateFilter.lte = new Date(params.dateTo)

  const where: Record<string, unknown> = {}
  if (Object.keys(dateFilter).length > 0) where.performedAt = dateFilter
  if (params.truckId) where.truckId = params.truckId
  if (params.status) where.status = params.status

  const records = await db.maintenanceRecord.findMany({
    where,
    include: {
      truck: { select: { plateNumber: true, make: true, model: true } },
    },
    orderBy: { performedAt: 'desc' },
  })

  const totalCost = records.reduce((s, r) => s + (r.cost ?? 0), 0)
  const completedRecords = records.filter((r) => r.status === 'completed').length
  const pendingRecords = records.filter((r) => r.status === 'pending').length
  const inProgressRecords = records.filter((r) => r.status === 'in_progress').length

  const typeBreakdown = new Map<string, number>()
  for (const r of records) typeBreakdown.set(r.type, (typeBreakdown.get(r.type) ?? 0) + (r.cost ?? 0))
  const topType = [...typeBreakdown.entries()].sort((a, b) => b[1] - a[1])[0]

  const pdf = new PdfReport('landscape')
  pdf.addHeader()
  pdf.addTitle('Maintenance Report')
  pdf.addSubtitle(buildPdfSubtitle(params))
  pdf.addKPICards([
    { label: 'Total Records', value: String(records.length) },
    { label: 'Completed', value: String(completedRecords) },
    { label: 'Pending', value: String(pendingRecords) },
    { label: 'In Progress', value: String(inProgressRecords) },
    { label: 'Total Cost', value: formatGHS(totalCost) },
    { label: 'Top Cost Type', value: topType ? `${topType[0]} (${formatGHS(topType[1])})` : '-' },
  ])

  const headers = ['Date', 'Truck', 'Type', 'Description', 'Odometer (km)', 'Cost', 'Performed By', 'Status', 'Next Due', 'Next Due (km)']
  const rows = records.map((r) => [
    fmtDate(r.performedAt),
    `${r.truck.plateNumber} (${r.truck.make})`,
    r.type.replace(/\b\w/g, (c: string) => c.toUpperCase()),
    r.title + (r.description ? ` \u2014 ${r.description}` : ''),
    formatNumber(r.odometer ?? 0),
    formatGHS(r.cost ?? 0),
    r.performedBy ?? '-',
    r.status.replace(/_/g, ' ').replace(/\b\w/g, (c: string) => c.toUpperCase()),
    fmtDate(r.nextDueDate) || '-',
    r.nextDueMileage ? formatNumber(r.nextDueMileage) : '-',
  ])

  pdf.addTable(headers, rows, {
    summaryRow: { label: 'TOTAL', values: ['', '', '', '', '', formatGHS(totalCost), '', '', '', ''] },
    columnStyles: { 5: { halign: 'right' } },
  })
  pdf.addFooter()

  return pdf.pdf
}
