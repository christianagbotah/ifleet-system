import { db } from '@/lib/db'
import { ExcelReport } from './excel-generator'
import type { ColumnDef } from './excel-generator'
import type { ReportParams } from './types'
import { APP_NAME, APP_TAGLINE } from '@/lib/constants'

function formatGHS(amount: number): string {
  return `₵${amount.toLocaleString('en-GH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
}

function formatNumber(n: number): string {
  return n.toLocaleString('en-GH')
}

function fmtDate(d?: Date | null): string {
  if (!d) return ''
  const date = new Date(d)
  return date.toISOString().split('T')[0]
}

function fmtDateTime(d?: Date | null): string {
  if (!d) return ''
  const date = new Date(d)
  return date.toISOString().replace('T', ' ').slice(0, 16)
}

function buildSubtitle(params: ReportParams): string {
  const parts: string[] = []
  parts.push(`Generated: ${fmtDate(new Date())}`)
  if (params.dateFrom || params.dateTo) {
    const range = `${params.dateFrom || '...'} to ${params.dateTo || '...'}`
    parts.push(`Period: ${range}`)
  }
  if (params.truckId) parts.push(`Truck Filter: ${params.truckId}`)
  if (params.driverId) parts.push(`Driver Filter: ${params.driverId}`)
  if (params.clientId) parts.push(`Client Filter: ${params.clientId}`)
  if (params.status) parts.push(`Status: ${params.status}`)
  return parts.join(' | ')
}

function buildWhereClause(params: ReportParams): Record<string, unknown> {
  const where: Record<string, unknown> = {}
  if (params.dateFrom || params.dateTo) {
    const departureFilter: Record<string, unknown> = {}
    if (params.dateFrom) departureFilter.gte = new Date(params.dateFrom)
    if (params.dateTo) departureFilter.lte = new Date(params.dateTo)
    where.departureTime = departureFilter
  }
  if (params.truckId) where.truckId = params.truckId
  if (params.driverId) where.driverId = params.driverId
  if (params.clientId) where.clientId = params.clientId
  if (params.status) where.status = params.status
  return where
}

export async function buildTripSummaryReport(params: ReportParams): Promise<ExcelReport> {
  const where = buildWhereClause(params)
  const trips = await db.trip.findMany({
    where,
    include: {
      driver: { select: { firstName: true, lastName: true } },
      truck: { select: { plateNumber: true, make: true, model: true } },
      client: { select: { companyName: true } },
      Expense: { select: { amount: true } },
    },
    orderBy: { departureTime: 'desc' },
  })

  const totalTrips = trips.length
  const completedTrips = trips.filter((t) => t.status === 'completed').length
  const totalRevenue = trips.reduce((sum, t) => sum + (t.totalRevenue ?? 0), 0)
  const totalExpenses = trips.reduce((sum, t) => sum + t.Expense.reduce((s, e) => s + e.amount, 0), 0)
  const avgRevenue = totalTrips > 0 ? totalRevenue / totalTrips : 0

  const columns: ColumnDef[] = [
    { key: 'tripNumber', header: 'Trip #', type: 'text' },
    { key: 'date', header: 'Date', type: 'date' },
    { key: 'driver', header: 'Driver', type: 'text' },
    { key: 'truck', header: 'Truck', type: 'text' },
    { key: 'route', header: 'Route (From \u2192 To)', type: 'text' },
    { key: 'cargo', header: 'Cargo', type: 'text' },
    { key: 'client', header: 'Client', type: 'text' },
    { key: 'status', header: 'Status', type: 'text' },
    { key: 'revenue', header: 'Revenue (₵)', type: 'currency' },
    { key: 'expenses', header: 'Expenses (₵)', type: 'currency' },
    { key: 'net', header: 'Net (₵)', type: 'currency' },
  ]

  const report = new ExcelReport(`${APP_NAME} \u2014 Trip Summary Report`, buildSubtitle(params))
  report.addKPISection([
    { label: 'Total Trips', value: formatNumber(totalTrips) },
    { label: 'Completed', value: formatNumber(completedTrips) },
    { label: 'Total Revenue', value: formatGHS(totalRevenue) },
    { label: 'Avg Revenue', value: formatGHS(avgRevenue) },
    { label: 'Total Expenses', value: formatGHS(totalExpenses) },
    { label: 'Net Profit', value: formatGHS(totalRevenue - totalExpenses) },
  ])
  report.addHeadersFromDefs(columns)

  for (const trip of trips) {
    const tripExpenses = trip.Expense.reduce((s, e) => s + e.amount, 0)
    report.addTypedRow({
      tripNumber: trip.tripNumber,
      date: trip.departureTime,
      driver: `${trip.driver.firstName} ${trip.driver.lastName}`,
      truck: `${trip.truck.plateNumber} (${trip.truck.make})`,
      route: `${trip.loadingLocation} \u2192 ${trip.destination}`,
      cargo: `${trip.quantity} ${trip.unit} ${trip.itemName}`,
      client: trip.client?.companyName ?? trip.customerName ?? '-',
      status: trip.status.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase()),
      revenue: trip.totalRevenue ?? 0,
      expenses: tripExpenses,
      net: (trip.totalRevenue ?? 0) - tripExpenses,
    }, columns)
  }

  report.addTypedSummaryRow('TOTAL', { revenue: totalRevenue, expenses: totalExpenses, net: totalRevenue - totalExpenses }, columns)
  report.autoFitColumns()
  report.freezePanes()
  report.setPageSetup()
  return report
}

export async function buildFuelReport(params: ReportParams): Promise<ExcelReport> {
  const dateFilter: Record<string, unknown> = {}
  if (params.dateFrom) dateFilter.gte = new Date(params.dateFrom)
  if (params.dateTo) dateFilter.lte = new Date(params.dateTo)

  const where: Record<string, unknown> = {}
  if (Object.keys(dateFilter).length > 0) where.date = dateFilter
  if (params.truckId) where.truckId = params.truckId

  const fuelLogs = await db.fuelLog.findMany({
    where,
    include: { truck: { select: { plateNumber: true, make: true } }, trip: { select: { tripNumber: true } } },
    orderBy: { date: 'desc' },
  })

  const totalLiters = fuelLogs.reduce((s, f) => s + f.litersFilled, 0)
  const totalCost = fuelLogs.reduce((s, f) => s + f.totalCost, 0)
  const avgCostPerLiter = totalLiters > 0 ? totalCost / totalLiters : 0

  const columns: ColumnDef[] = [
    { key: 'date', header: 'Date', type: 'date' },
    { key: 'tripNumber', header: 'Trip #', type: 'text' },
    { key: 'truck', header: 'Truck', type: 'text' },
    { key: 'station', header: 'Station', type: 'text' },
    { key: 'odometer', header: 'Odometer (km)', type: 'number' },
    { key: 'liters', header: 'Liters', type: 'number' },
    { key: 'costPerLiter', header: 'Cost/Liter (₵)', type: 'currency' },
    { key: 'totalCost', header: 'Total Cost (₵)', type: 'currency' },
    { key: 'receiptNumber', header: 'Receipt #', type: 'text' },
  ]

  const report = new ExcelReport(`${APP_NAME} \u2014 Fuel Report`, buildSubtitle(params))
  report.addKPISection([
    { label: 'Total Fill-ups', value: formatNumber(fuelLogs.length) },
    { label: 'Total Liters', value: formatNumber(totalLiters) },
    { label: 'Total Cost', value: formatGHS(totalCost) },
    { label: 'Avg Cost/Liter', value: formatGHS(avgCostPerLiter) },
  ])
  report.addHeadersFromDefs(columns)

  for (const log of fuelLogs) {
    report.addTypedRow({
      date: log.date, tripNumber: log.trip?.tripNumber ?? '-',
      truck: `${log.truck.plateNumber} (${log.truck.make})`, station: log.stationName ?? '-',
      odometer: log.odometer ?? 0, liters: log.litersFilled,
      costPerLiter: log.costPerLiter ?? 0, totalCost: log.totalCost,
      receiptNumber: log.receiptNumber ?? '-',
    }, columns)
  }

  report.addTypedSummaryRow('TOTAL', { liters: totalLiters, totalCost: totalCost }, columns)
  report.autoFitColumns()
  report.freezePanes()
  report.setPageSetup()
  return report
}

export async function buildExpenseReport(params: ReportParams): Promise<ExcelReport> {
  const dateFilter: Record<string, unknown> = {}
  if (params.dateFrom) dateFilter.gte = new Date(params.dateFrom)
  if (params.dateTo) dateFilter.lte = new Date(params.dateTo)
  const where: Record<string, unknown> = {}
  if (Object.keys(dateFilter).length > 0) where.date = dateFilter
  if (params.truckId) where.truckId = params.truckId
  if (params.status) where.status = params.status

  const expenses = await db.expense.findMany({
    where,
    include: { truck: { select: { plateNumber: true, make: true } }, trip: { select: { tripNumber: true } } },
    orderBy: { date: 'desc' },
  })

  const totalAmount = expenses.reduce((s, e) => s + e.amount, 0)
  const categories = new Map<string, number>()
  for (const exp of expenses) categories.set(exp.category, (categories.get(exp.category) ?? 0) + exp.amount)
  const topCategory = [...categories.entries()].sort((a, b) => b[1] - a[1])[0]

  const columns: ColumnDef[] = [
    { key: 'date', header: 'Date', type: 'date' },
    { key: 'tripNumber', header: 'Trip #', type: 'text' },
    { key: 'truck', header: 'Truck', type: 'text' },
    { key: 'category', header: 'Category', type: 'text' },
    { key: 'description', header: 'Description', type: 'text' },
    { key: 'amount', header: 'Amount (₵)', type: 'currency' },
    { key: 'paymentMethod', header: 'Payment Method', type: 'text' },
    { key: 'status', header: 'Status', type: 'text' },
    { key: 'reference', header: 'Reference', type: 'text' },
  ]

  const report = new ExcelReport(`${APP_NAME} \u2014 Expense Report`, buildSubtitle(params))
  report.addKPISection([
    { label: 'Total Expenses', value: formatNumber(expenses.length) },
    { label: 'Total Amount', value: formatGHS(totalAmount) },
    { label: 'Categories', value: String(categories.size) },
    { label: 'Top Category', value: topCategory ? `${topCategory[0]} (${formatGHS(topCategory[1])})` : '-' },
  ])
  report.addHeadersFromDefs(columns)

  for (const exp of expenses) {
    report.addTypedRow({
      date: exp.date, tripNumber: exp.trip?.tripNumber ?? '-',
      truck: `${exp.truck.plateNumber} (${exp.truck.make})`,
      category: exp.category.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase()),
      description: exp.description, amount: exp.amount,
      paymentMethod: exp.paymentMethod.replace(/_/g, ' '),
      status: exp.status.replace(/\b\w/g, (c) => c.toUpperCase()),
      reference: exp.reference ?? '-',
    }, columns)
  }

  report.addTypedSummaryRow('TOTAL', { amount: totalAmount }, columns)
  report.autoFitColumns()
  report.freezePanes()
  report.setPageSetup()
  return report
}

export async function buildPayrollReport(params: ReportParams): Promise<ExcelReport> {
  const where: Record<string, unknown> = {}
  if (params.periodStart && params.periodEnd) {
    where.createdAt = { gte: new Date(params.periodStart), lte: new Date(params.periodEnd) }
  }
  if (params.driverId) where.driverId = params.driverId

  const payrolls = await db.payroll.findMany({
    where,
    include: { driver: { select: { firstName: true, lastName: true, employeeId: true, phone: true } } },
    orderBy: [{ year: 'desc' }, { month: 'desc' }],
  })

  const monthNames = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
  const totalBase = payrolls.reduce((s, p) => s + p.baseSalary, 0)
  const totalBonus = payrolls.reduce((s, p) => s + p.tripBonus, 0)
  const totalOvertime = payrolls.reduce((s, p) => s + p.overtimePay, 0)
  const totalDeductions = payrolls.reduce((s, p) => s + p.deductions, 0)
  const totalNet = payrolls.reduce((s, p) => s + p.netPay, 0)

  const columns: ColumnDef[] = [
    { key: 'employeeId', header: 'Employee ID', type: 'text' },
    { key: 'driver', header: 'Driver', type: 'text' },
    { key: 'period', header: 'Period', type: 'text' },
    { key: 'baseSalary', header: 'Base Salary (₵)', type: 'currency' },
    { key: 'tripBonus', header: 'Trip Bonus (₵)', type: 'currency' },
    { key: 'overtime', header: 'Overtime (₵)', type: 'currency' },
    { key: 'deductions', header: 'Deductions (₵)', type: 'currency' },
    { key: 'netPay', header: 'Net Pay (₵)', type: 'currency' },
    { key: 'status', header: 'Status', type: 'text' },
    { key: 'paidAt', header: 'Paid At', type: 'date' },
  ]

  const report = new ExcelReport(`${APP_NAME} \u2014 Payroll Report`, buildSubtitle(params))
  report.addKPISection([
    { label: 'Total Records', value: formatNumber(payrolls.length) },
    { label: 'Total Net Pay', value: formatGHS(totalNet) },
    { label: 'Total Bonuses', value: formatGHS(totalBonus) },
    { label: 'Total Deductions', value: formatGHS(totalDeductions) },
  ])
  report.addHeadersFromDefs(columns)

  for (const p of payrolls) {
    report.addTypedRow({
      employeeId: p.driver.employeeId,
      driver: `${p.driver.firstName} ${p.driver.lastName}`,
      period: `${monthNames[p.month - 1]} ${p.year}`,
      baseSalary: p.baseSalary, tripBonus: p.tripBonus, overtime: p.overtimePay,
      deductions: p.deductions, netPay: p.netPay,
      status: p.status.replace(/\b\w/g, (c) => c.toUpperCase()),
      paidAt: p.paidAt ?? null,
    }, columns)
  }

  report.addTypedSummaryRow('TOTAL', { baseSalary: totalBase, tripBonus: totalBonus, overtime: totalOvertime, deductions: totalDeductions, netPay: totalNet }, columns)
  report.autoFitColumns()
  report.freezePanes()
  report.setPageSetup()
  return report
}

export async function buildFleetOverviewReport(): Promise<ExcelReport> {
  const trucks = await db.truck.findMany({
    include: {
      driver: { select: { firstName: true, lastName: true } },
      MaintenanceRecord: { where: { status: { in: ['pending', 'in_progress'] } }, orderBy: { createdAt: 'desc' }, take: 1 },
      Insurance: { where: { status: 'active' }, orderBy: { endDate: 'asc' }, take: 1 },
      _count: { select: { Trip: true, FuelLog: true, Expense: true, MaintenanceRecord: true } },
    },
    orderBy: { plateNumber: 'asc' },
  })

  const totalTrucks = trucks.length
  const activeTrucks = trucks.filter((t) => t.status === 'active').length
  const maintenanceTrucks = trucks.filter((t) => t.status === 'maintenance').length
  const assignedTrucks = trucks.filter((t) => t.driverId).length

  const columns: ColumnDef[] = [
    { key: 'plateNumber', header: 'Plate Number', type: 'text' },
    { key: 'makeModel', header: 'Make / Model', type: 'text' },
    { key: 'year', header: 'Year', type: 'number' },
    { key: 'driver', header: 'Assigned Driver', type: 'text' },
    { key: 'status', header: 'Status', type: 'text' },
    { key: 'mileage', header: 'Mileage (km)', type: 'number' },
    { key: 'totalTrips', header: 'Total Trips', type: 'number' },
    { key: 'insuranceExpiry', header: 'Insurance Expiry', type: 'date' },
    { key: 'nextService', header: 'Next Service', type: 'date' },
    { key: 'fuelType', header: 'Fuel Type', type: 'text' },
    { key: 'tankCapacity', header: 'Tank (L)', type: 'number' },
  ]

  const report = new ExcelReport(`${APP_NAME} \u2014 Fleet Overview Report`, `Generated: ${fmtDate(new Date())} | Total Fleet: ${totalTrucks} trucks`)
  report.addKPISection([
    { label: 'Total Trucks', value: formatNumber(totalTrucks) },
    { label: 'Active', value: formatNumber(activeTrucks) },
    { label: 'In Maintenance', value: formatNumber(maintenanceTrucks) },
    { label: 'Assigned to Driver', value: formatNumber(assignedTrucks) },
  ])
  report.addHeadersFromDefs(columns)

  for (const truck of trucks) {
    report.addTypedRow({
      plateNumber: truck.plateNumber, makeModel: `${truck.make} ${truck.model}`, year: truck.year,
      driver: truck.driver ? `${truck.driver.firstName} ${truck.driver.lastName}` : 'Unassigned',
      status: truck.status.replace(/\b\w/g, (c) => c.toUpperCase()),
      mileage: truck.currentMileage, totalTrips: truck._count.Trip,
      insuranceExpiry: truck.Insurance[0]?.endDate ?? null,
      nextService: truck.nextServiceDate ?? null, fuelType: truck.fuelType,
      tankCapacity: truck.tankCapacity ?? 0,
    }, columns)
  }

  report.autoFitColumns()
  report.freezePanes()
  report.setPageSetup()
  return report
}

export async function buildDriverPerformanceReport(params: ReportParams): Promise<ExcelReport> {
  const driverWhere: Record<string, unknown> = {}
  if (params.driverId) driverWhere.id = params.driverId

  const drivers = await db.driver.findMany({
    where: driverWhere,
    include: {
      Truck: { select: { plateNumber: true } },
      _count: { select: { Trip: true } },
      Trip: {
        where: buildWhereClause(params),
        select: { status: true, totalRevenue: true, totalMileage: true, departureTime: true, arrivalTime: true, Expense: { select: { amount: true } } },
      },
    },
    orderBy: { lastName: 'asc' },
  })

  const columns: ColumnDef[] = [
    { key: 'driver', header: 'Driver', type: 'text' },
    { key: 'employeeId', header: 'Employee ID', type: 'text' },
    { key: 'truck', header: 'Assigned Truck', type: 'text' },
    { key: 'totalTrips', header: 'Total Trips', type: 'number' },
    { key: 'completedTrips', header: 'Completed', type: 'number' },
    { key: 'completionRate', header: 'Completion Rate', type: 'percent' },
    { key: 'totalRevenue', header: 'Revenue (₵)', type: 'currency' },
    { key: 'totalExpenses', header: 'Expenses (₵)', type: 'currency' },
    { key: 'netProfit', header: 'Net Profit (₵)', type: 'currency' },
    { key: 'totalMileage', header: 'Mileage (km)', type: 'number' },
    { key: 'rating', header: 'Rating', type: 'number' },
    { key: 'hireDate', header: 'Hire Date', type: 'date' },
  ]

  const report = new ExcelReport(`${APP_NAME} \u2014 Driver Performance Report`, buildSubtitle(params))

  let fleetTotalTrips = 0
  let fleetCompleted = 0
  let fleetRevenue = 0
  let fleetExpenses = 0
  let fleetMileage = 0
  const reportData: Record<string, unknown>[] = []

  for (const driver of drivers) {
    const trips = driver.Trip
    const totalTrips = trips.length
    const completedTrips = trips.filter((t) => t.status === 'completed').length
    const completionRate = totalTrips > 0 ? completedTrips / totalTrips : 0
    const totalRevenue = trips.reduce((s, t) => s + (t.totalRevenue ?? 0), 0)
    const totalExpenses = trips.reduce((s, t) => s + t.Expense.reduce((se, e) => se + e.amount, 0), 0)
    const totalMileage = trips.reduce((s, t) => s + (t.totalMileage ?? 0), 0)

    fleetTotalTrips += totalTrips
    fleetCompleted += completedTrips
    fleetRevenue += totalRevenue
    fleetExpenses += totalExpenses
    fleetMileage += totalMileage

    reportData.push({
      driver: `${driver.firstName} ${driver.lastName}`, employeeId: driver.employeeId,
      truck: driver.Truck.length > 0 ? driver.Truck[0].plateNumber : 'Unassigned',
      totalTrips, completedTrips, completionRate, totalRevenue, totalExpenses,
      netProfit: totalRevenue - totalExpenses, totalMileage, rating: driver.rating, hireDate: driver.hireDate,
    })
  }

  report.addKPISection([
    { label: 'Total Drivers', value: formatNumber(drivers.length) },
    { label: 'Fleet Trips', value: formatNumber(fleetTotalTrips) },
    { label: 'Fleet Revenue', value: formatGHS(fleetRevenue) },
    { label: 'Fleet Net Profit', value: formatGHS(fleetRevenue - fleetExpenses) },
    { label: 'Avg Completion', value: fleetTotalTrips > 0 ? `${((fleetCompleted / fleetTotalTrips) * 100).toFixed(1)}%` : '-' },
    { label: 'Fleet Mileage', value: `${formatNumber(fleetMileage)} km` },
  ])
  report.addHeadersFromDefs(columns)

  for (const data of reportData) report.addTypedRow(data, columns)

  report.addTypedSummaryRow('FLEET TOTAL', { totalTrips: fleetTotalTrips, completedTrips: fleetCompleted, totalRevenue: fleetRevenue, totalExpenses: fleetExpenses, netProfit: fleetRevenue - fleetExpenses, totalMileage: fleetMileage }, columns)
  report.autoFitColumns()
  report.freezePanes()
  report.setPageSetup()
  return report
}

export async function buildMaintenanceReport(params: ReportParams): Promise<ExcelReport> {
  const dateFilter: Record<string, unknown> = {}
  if (params.dateFrom) dateFilter.gte = new Date(params.dateFrom)
  if (params.dateTo) dateFilter.lte = new Date(params.dateTo)
  const where: Record<string, unknown> = {}
  if (Object.keys(dateFilter).length > 0) where.performedAt = dateFilter
  if (params.truckId) where.truckId = params.truckId
  if (params.status) where.status = params.status

  const records = await db.maintenanceRecord.findMany({
    where,
    include: { truck: { select: { plateNumber: true, make: true, model: true } } },
    orderBy: { performedAt: 'desc' },
  })

  const totalCost = records.reduce((s, r) => s + (r.cost ?? 0), 0)
  const completedRecords = records.filter((r) => r.status === 'completed').length
  const pendingRecords = records.filter((r) => r.status === 'pending').length
  const inProgressRecords = records.filter((r) => r.status === 'in_progress').length

  const typeBreakdown = new Map<string, number>()
  for (const r of records) typeBreakdown.set(r.type, (typeBreakdown.get(r.type) ?? 0) + (r.cost ?? 0))
  const topType = [...typeBreakdown.entries()].sort((a, b) => b[1] - a[1])[0]

  const columns: ColumnDef[] = [
    { key: 'date', header: 'Date', type: 'date' },
    { key: 'truck', header: 'Truck', type: 'text' },
    { key: 'type', header: 'Type', type: 'text' },
    { key: 'title', header: 'Description', type: 'text' },
    { key: 'odometer', header: 'Odometer (km)', type: 'number' },
    { key: 'cost', header: 'Cost (₵)', type: 'currency' },
    { key: 'performedBy', header: 'Performed By', type: 'text' },
    { key: 'status', header: 'Status', type: 'text' },
    { key: 'nextDueDate', header: 'Next Due', type: 'date' },
    { key: 'nextDueMileage', header: 'Next Due (km)', type: 'number' },
  ]

  const report = new ExcelReport(`${APP_NAME} \u2014 Maintenance Report`, buildSubtitle(params))
  report.addKPISection([
    { label: 'Total Records', value: formatNumber(records.length) },
    { label: 'Completed', value: formatNumber(completedRecords) },
    { label: 'Pending', value: formatNumber(pendingRecords) },
    { label: 'In Progress', value: formatNumber(inProgressRecords) },
    { label: 'Total Cost', value: formatGHS(totalCost) },
    { label: 'Top Cost Type', value: topType ? `${topType[0]} (${formatGHS(topType[1])})` : '-' },
  ])
  report.addHeadersFromDefs(columns)

  for (const record of records) {
    report.addTypedRow({
      date: record.performedAt,
      truck: `${record.truck.plateNumber} (${record.truck.make} ${record.truck.model})`,
      type: record.type.replace(/\b\w/g, (c) => c.toUpperCase()),
      title: record.title + (record.description ? ` \u2014 ${record.description}` : ''),
      odometer: record.odometer ?? 0, cost: record.cost ?? 0,
      performedBy: record.performedBy ?? '-',
      status: record.status.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase()),
      nextDueDate: record.nextDueDate ?? null, nextDueMileage: record.nextDueMileage ?? 0,
    }, columns)
  }

  report.addTypedSummaryRow('TOTAL', { cost: totalCost }, columns)
  report.autoFitColumns()
  report.freezePanes()
  report.setPageSetup()
  return report
}
