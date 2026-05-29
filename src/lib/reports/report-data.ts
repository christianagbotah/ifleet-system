// ════════════════════════════════════════════════════════════════════
// ${APP_NAME} — Report Data Fetchers
// ════════════════════════════════════════════════════════════════════

import { APP_NAME } from '@/lib/constants'
import { db } from '@/lib/db'
import {
  csvDate,
  csvDateTime,
  csvCurrency,
  csvNumber,
  csvPercent,
  CEDI,
  type ReportData,
} from './csv-generator'

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
}

export async function fetchTripSummaryData(params: ReportParams): Promise<ReportData> {
  const where: Record<string, unknown> = {}
  if (params.dateFrom || params.dateTo) {
    where.departureTime = {}
    if (params.dateFrom) (where.departureTime as Record<string, unknown>).gte = new Date(params.dateFrom)
    if (params.dateTo) (where.departureTime as Record<string, unknown>).lte = new Date(params.dateTo)
  }
  if (params.truckId) where.truckId = params.truckId
  if (params.driverId) where.driverId = params.driverId
  if (params.clientId) where.clientId = params.clientId
  if (params.status) where.status = params.status

  const trips = await db.trip.findMany({
    where,
    include: {
      truck: { select: { plateNumber: true, make: true, model: true } },
      driver: { select: { firstName: true, lastName: true, employeeId: true } },
      client: { select: { companyName: true } },
    },
    orderBy: { departureTime: 'desc' },
  })

  const headers = [
    'Trip Number', 'Status', 'Driver', 'Employee ID', 'Truck', 'Route',
    'Cargo', 'Quantity', 'Unit', 'Departure Time', 'Arrival Time',
    'Actual Duration (hrs)', 'Distance (km)', 'Revenue', 'Fuel Cost',
    'Customer', 'Created At',
  ]

  const rows = trips.map((t) => [
    t.tripNumber,
    t.status.replace(/_/g, ' '),
    `${t.driver.firstName} ${t.driver.lastName}`,
    t.driver.employeeId,
    t.truck.plateNumber,
    `${t.loadingLocation} \u2192 ${t.destination}`,
    t.itemName,
    csvNumber(t.quantity, 0),
    t.unit,
    csvDateTime(t.departureTime),
    csvDateTime(t.arrivalTime),
    csvNumber(t.actualDuration, 1),
    csvNumber(t.totalMileage, 1),
    csvCurrency(t.totalRevenue),
    csvCurrency(t.fuelCost),
    t.customer?.companyName || t.customerName || '',
    csvDateTime(t.createdAt),
  ])

  return { headers, rows }
}

export async function fetchFuelReportData(params: ReportParams): Promise<ReportData> {
  const where: Record<string, unknown> = {}
  if (params.dateFrom || params.dateTo) {
    where.date = {}
    if (params.dateFrom) (where.date as Record<string, unknown>).gte = new Date(params.dateFrom)
    if (params.dateTo) (where.date as Record<string, unknown>).lte = new Date(params.dateTo)
  }
  if (params.truckId) where.truckId = params.truckId
  if (params.tripId) where.tripId = params.tripId

  const fuelLogs = await db.fuelLog.findMany({
    where,
    include: {
      truck: { select: { plateNumber: true, make: true, model: true } },
      trip: { select: { tripNumber: true, driver: { select: { firstName: true, lastName: true } } } },
    },
    orderBy: { date: 'desc' },
  })

  const headers = [
    'Date', 'Truck', 'Trip Number', 'Driver', 'Odometer (km)',
    'Fuel Level Before (%)', 'Fuel Level After (%)', 'Liters Filled',
    'Cost Per Liter', 'Total Cost', 'Station', 'Fuel Type',
  ]

  const rows = fuelLogs.map((f) => [
    csvDate(f.date),
    f.truck.plateNumber,
    f.trip.tripNumber,
    `${f.trip.driver.firstName} ${f.trip.driver.lastName}`,
    csvNumber(f.odometer, 1),
    csvNumber(f.fuelLevelBefore, 0),
    csvNumber(f.fuelLevelAfter, 0),
    csvNumber(f.litersFilled, 1),
    csvCurrency(f.costPerLiter),
    csvCurrency(f.totalCost),
    f.stationName || '',
    f.fuelType,
  ])

  return { headers, rows }
}

export async function fetchExpenseReportData(params: ReportParams): Promise<ReportData> {
  const where: Record<string, unknown> = {}
  if (params.dateFrom || params.dateTo) {
    where.date = {}
    if (params.dateFrom) (where.date as Record<string, unknown>).gte = new Date(params.dateFrom)
    if (params.dateTo) (where.date as Record<string, unknown>).lte = new Date(params.dateTo)
  }
  if (params.truckId) where.truckId = params.truckId
  if (params.status) where.status = params.status

  const expenses = await db.expense.findMany({
    where,
    include: {
      truck: { select: { plateNumber: true, make: true, model: true } },
      trip: { select: { tripNumber: true } },
    },
    orderBy: { date: 'desc' },
  })

  const headers = [
    'Date', 'Truck', 'Trip Number', 'Category', 'Description', 'Amount',
    'Payment Method', 'Reference', 'Status', 'Approved By', 'Receipt',
  ]

  const rows = expenses.map((e) => [
    csvDate(e.date),
    e.truck.plateNumber,
    e.trip?.tripNumber || '',
    e.category,
    e.description,
    csvCurrency(e.amount),
    e.paymentMethod.replace(/_/g, ' '),
    e.reference || '',
    e.status,
    e.approvedBy || '',
    e.receiptUrl ? 'Yes' : 'No',
  ])

  return { headers, rows }
}

export async function fetchPayrollReportData(params: ReportParams): Promise<ReportData> {
  const where: Record<string, unknown> = {}
  if (params.driverId) where.driverId = params.driverId
  if (params.status) where.status = params.status
  if (params.periodStart || params.periodEnd || params.period) {
    if (params.periodStart || params.periodEnd) {
      where.createdAt = {}
      if (params.periodStart) (where.createdAt as Record<string, unknown>).gte = new Date(params.periodStart)
      if (params.periodEnd) (where.createdAt as Record<string, unknown>).lte = new Date(params.periodEnd)
    } else if (params.period === 'monthly') {
      const now = new Date()
      where.month = now.getMonth() + 1
      where.year = now.getFullYear()
    } else if (params.period === 'weekly') {
      const now = new Date()
      const weekStart = new Date(now)
      weekStart.setDate(weekStart.getDate() - weekStart.getDay() + 1)
      weekStart.setHours(0, 0, 0, 0)
      const weekEnd = new Date(weekStart)
      weekEnd.setDate(weekEnd.getDate() + 6)
      weekEnd.setHours(23, 59, 59, 999)
      where.createdAt = { gte: weekStart, lte: weekEnd }
    }
  }

  const payrolls = await db.payroll.findMany({
    where,
    include: {
      driver: { select: { firstName: true, lastName: true, employeeId: true, phone: true } },
    },
    orderBy: [{ year: 'desc' }, { month: 'desc' }],
  })

  const monthNames = ['', 'January', 'February', 'March', 'April', 'May', 'June',
    'July', 'August', 'September', 'October', 'November', 'December']

  const headers = [
    'Employee ID', 'Driver Name', 'Phone', 'Month', 'Year', 'Base Salary',
    'Trip Bonus', 'Overtime Pay', 'Deductions', 'Net Pay', 'Status',
    'Paid At', 'Approved By', 'Notes',
  ]

  const rows = payrolls.map((p) => [
    p.driver.employeeId,
    `${p.driver.firstName} ${p.driver.lastName}`,
    p.driver.phone,
    monthNames[p.month] || '',
    p.year,
    csvCurrency(p.baseSalary),
    csvCurrency(p.tripBonus),
    csvCurrency(p.overtimePay),
    csvCurrency(p.deductions),
    csvCurrency(p.netPay),
    p.status,
    csvDateTime(p.paidAt),
    p.approvedBy || '',
    p.notes || '',
  ])

  return { headers, rows }
}

export async function fetchFleetOverviewData(): Promise<ReportData> {
  const trucks = await db.truck.findMany({
    include: {
      driver: { select: { firstName: true, lastName: true, phone: true, employeeId: true } },
      Insurance: {
        where: { status: 'active' },
        select: { provider: true, policyNumber: true, endDate: true, type: true },
        take: 1,
        orderBy: { endDate: 'asc' },
      },
      MaintenanceRecord: {
        where: { status: 'pending' },
        select: { type: true, title: true, nextDueDate: true },
        take: 1,
        orderBy: { nextDueDate: 'asc' },
      },
      _count: {
        select: {
          Trip: { where: { status: { not: 'completed' } } },
          MaintenanceRecord: true,
        },
      },
    },
    orderBy: { plateNumber: 'asc' },
  })

  const headers = [
    'Plate Number', 'Make/Model', 'Year', 'Status', 'Assigned Driver',
    'Driver Phone', 'Current Mileage (km)', 'Fuel Type', 'Tank Capacity (L)',
    'Insurance Status', 'Insurance Expiry', 'Active Trips',
    'Total Maintenance Records', 'Next Maintenance Due', 'Next Service Date',
  ]

  const rows = trucks.map((t) => [
    t.plateNumber,
    `${t.make} ${t.model}`,
    t.year,
    t.status,
    t.driver ? `${t.driver.firstName} ${t.driver.lastName}` : 'Unassigned',
    t.driver?.phone || '',
    csvNumber(t.currentMileage, 1),
    t.fuelType,
    csvNumber(t.tankCapacity, 0),
    t.insuranceStatus,
    t.Insurance.length > 0 ? csvDate(t.Insurance[0].endDate) : 'None',
    t._count.Trip,
    t._count.MaintenanceRecord,
    t.MaintenanceRecord.length > 0 ? `${t.MaintenanceRecord[0].type}: ${t.MaintenanceRecord[0].title}` : 'None',
    csvDate(t.nextServiceDate),
  ])

  return { headers, rows }
}

export async function fetchDailySummaryData(date?: string): Promise<ReportData> {
  const targetDate = date ? new Date(date) : new Date()
  const startOfDay = new Date(targetDate)
  startOfDay.setHours(0, 0, 0, 0)
  const endOfDay = new Date(targetDate)
  endOfDay.setHours(23, 59, 59, 999)

  const [trips, expenses, fuelLogs, truckCount, activeTripCount] = await Promise.all([
    db.trip.findMany({
      where: { departureTime: { gte: startOfDay, lte: endOfDay } },
      include: {
        truck: { select: { plateNumber: true } },
        driver: { select: { firstName: true, lastName: true } },
      },
      orderBy: { departureTime: 'desc' },
    }),
    db.expense.findMany({
      where: { date: { gte: startOfDay, lte: endOfDay } },
      include: { truck: { select: { plateNumber: true } } },
      orderBy: { date: 'desc' },
    }),
    db.fuelLog.findMany({
      where: { date: { gte: startOfDay, lte: endOfDay } },
      include: { truck: { select: { plateNumber: true } } },
      orderBy: { date: 'desc' },
    }),
    db.truck.count({ where: { status: 'active' } }),
    db.trip.count({ where: { status: { not: 'completed' } } }),
  ])

  const totalExpenses = expenses.reduce((sum, e) => sum + e.amount, 0)
  const totalFuelCost = fuelLogs.reduce((sum, f) => sum + f.totalCost, 0)
  const totalFuelLiters = fuelLogs.reduce((sum, f) => sum + f.litersFilled, 0)
  const totalTripRevenue = trips.reduce((sum, t) => sum + (t.totalRevenue || 0), 0)

  const summaryDate = targetDate.toLocaleDateString('en-GB', {
    weekday: 'long', year: 'numeric', month: 'long', day: 'numeric',
    timeZone: 'Africa/Accra',
  })

  const rows: (string | number | null | undefined)[][] = [
    ['Report Date', summaryDate],
    ['Total Active Trucks', truckCount],
    ['Active Trips (In Progress)', activeTripCount],
    ['Trips Departed Today', trips.length],
    ['Total Revenue (Trips Today)', csvCurrency(totalTripRevenue)],
    ['Expenses Recorded Today', expenses.length],
    ['Total Expenses (${CEDI})', csvCurrency(totalExpenses)],
    ['Fuel Logs Today', fuelLogs.length],
    ['Total Fuel Cost (${CEDI})', csvCurrency(totalFuelCost)],
    ['Total Fuel (Liters)', csvNumber(totalFuelLiters, 1)],
  ]

  rows.push([])
  rows.push(['\u2500\u2500 Trips Departed \u2500\u2500', ''])
  if (trips.length === 0) {
    rows.push(['No trips departed on this day', ''])
  } else {
    rows.push(['Trip #', 'Driver', 'Truck', 'Route', 'Cargo', 'Revenue', 'Status'])
    for (const t of trips) {
      rows.push([
        t.tripNumber,
        `${t.driver.firstName} ${t.driver.lastName}`,
        t.truck.plateNumber,
        `${t.loadingLocation} \u2192 ${t.destination}`,
        `${t.itemName} (${t.quantity} ${t.unit})`,
        csvCurrency(t.totalRevenue),
        t.status.replace(/_/g, ' '),
      ])
    }
  }

  rows.push([])
  rows.push(['\u2500\u2500 Expenses \u2500\u2500', ''])
  if (expenses.length === 0) {
    rows.push(['No expenses recorded on this day', ''])
  } else {
    rows.push(['Truck', 'Category', 'Description', 'Amount', 'Payment Method'])
    for (const e of expenses) {
      rows.push([e.truck.plateNumber, e.category, e.description, csvCurrency(e.amount), e.paymentMethod.replace(/_/g, ' ')])
    }
  }

  return { headers: ['Daily Summary', ''], rows }
}

export async function fetchWaybillData(tripId: string): Promise<ReportData> {
  const trip = await db.trip.findUnique({
    where: { id: tripId },
    include: {
      truck: { select: { plateNumber: true, make: true, model: true, driverId: true } },
      driver: { select: { firstName: true, lastName: true, phone: true, employeeId: true, licenseNumber: true } },
      client: { select: { companyName: true, contactPerson: true, phone: true, address: true } },
      deliveryStops: { orderBy: { stopOrder: 'asc' } },
    },
  })

  if (!trip) return { headers: ['Error'], rows: [['Trip not found']] }

  const rows: (string | number | null | undefined)[][] = [
    ['Trip Number', trip.tripNumber],
    ['Waybill Number', trip.waybillNumber || 'N/A'],
    ['Order Number', trip.orderNumber || 'N/A'],
    ['Status', trip.status.replace(/_/g, ' ')],
    ['', ''],
    ['\u2500\u2500 Consignee (Customer) \u2500\u2500', ''],
    ['Company', trip.client?.companyName || trip.customerName || 'N/A'],
    ['Contact Person', trip.client?.contactPerson || 'N/A'],
    ['Phone', trip.client?.phone || trip.customerPhone || 'N/A'],
    ['Address', trip.client?.address || 'N/A'],
    ['', ''],
    ['\u2500\u2500 Carrier Details \u2500\u2500', ''],
    ['Truck', `${trip.truck.plateNumber} (${trip.truck.make} ${trip.truck.model})`],
    ['Driver', `${trip.driver.firstName} ${trip.driver.lastName}`],
    ['Employee ID', trip.driver.employeeId],
    ['Driver License', trip.driver.licenseNumber],
    ['Driver Phone', trip.driver.phone],
    ['', ''],
    ['\u2500\u2500 Cargo Details \u2500\u2500', ''],
    ['Item', trip.itemName],
    ['Quantity', `${trip.quantity} ${trip.unit}`],
    ['Unit Price', csvCurrency(trip.unitPrice)],
    ['Total Revenue', csvCurrency(trip.totalRevenue)],
    ['', ''],
    ['\u2500\u2500 Route Details \u2500\u2500', ''],
    ['Loading Location', trip.loadingLocation],
    ['Loading Address', trip.loadingAddress || 'N/A'],
    ['Destination', trip.destination],
    ['Destination Address', trip.destinationAddress || 'N/A'],
    ['Departure Time', csvDateTime(trip.departureTime)],
    ['Arrival Time', csvDateTime(trip.arrivalTime)],
    ['Actual Duration', trip.actualDuration ? `${trip.actualDuration.toFixed(1)} hours` : 'N/A'],
    ['Distance', trip.totalMileage ? `${trip.totalMileage.toFixed(1)} km` : 'N/A'],
    ['Customer Reference', trip.customerRef || 'N/A'],
    ['Notes', trip.notes || 'None'],
  ]

  if (trip.deliveryStops.length > 0) {
    rows.push(['', ''])
    rows.push(['\u2500\u2500 Delivery Stops \u2500\u2500', ''])
    rows.push(['Stop #', 'Destination', 'Customer', 'Expected Qty', 'Actual Qty', 'Status'])
    for (const stop of trip.deliveryStops) {
      rows.push([
        `Stop ${stop.stopOrder}`,
        stop.destination,
        stop.customerName || 'N/A',
        `${stop.expectedQty} ${stop.unit}`,
        stop.actualQty ? `${stop.actualQty} ${stop.unit}` : '-',
        stop.status,
      ])
    }
  }

  return { headers: ['Waybill Details', ''], rows }
}

export async function fetchDriverPerformanceData(params: ReportParams): Promise<ReportData> {
  const where: Record<string, unknown> = {}
  if (params.driverId) where.id = params.driverId
  where.status = 'active'

  const drivers = await db.driver.findMany({
    where,
    include: {
      Truck: { select: { plateNumber: true, make: true, model: true } },
      Trip: {
        select: {
          id: true, status: true, totalRevenue: true, totalMileage: true,
          actualDuration: true, fuelUsed: true, fuelCost: true,
          departureTime: true, createdAt: true,
        },
        orderBy: { departureTime: 'desc' },
      },
      payroll: {
        select: { baseSalary: true, tripBonus: true, overtimePay: true, deductions: true, netPay: true },
        orderBy: { createdAt: 'desc' },
        take: 3,
      },
    },
  })

  const headers = [
    'Employee ID', 'Driver Name', 'Phone', 'Status', 'Assigned Truck',
    'Hire Date', 'License Class', 'Rating', 'Total Trips (All Time)',
    'Total Mileage (km)', 'Revenue (Completed Trips)', 'Avg Revenue/Trip',
    'Last Trip Date', 'Latest Net Pay',
  ]

  const rows = drivers.map((d) => {
    const completedTrips = d.Trip.filter((t: { status: string }) => t.status === 'completed')
    const totalRevenue = completedTrips.reduce((sum: number, t: { totalRevenue?: number }) => sum + (t.totalRevenue || 0), 0)
    const avgRevenue = completedTrips.length > 0 ? totalRevenue / completedTrips.length : 0
    const totalMileage = completedTrips.reduce((sum: number, t: { totalMileage?: number }) => sum + (t.totalMileage || 0), 0)
    const lastTrip = d.Trip[0]
    const latestPay = d.payroll[0]

    return [
      d.employeeId,
      `${d.firstName} ${d.lastName}`,
      d.phone,
      d.status,
      d.trucks.length > 0 ? `${d.trucks[0].plateNumber} (${d.trucks[0].make} ${d.trucks[0].model})` : 'Unassigned',
      csvDate(d.hireDate),
      d.licenseClass,
      csvPercent(d.rating * 20),
      d.Trip.length,
      csvNumber(totalMileage, 1),
      csvCurrency(totalRevenue),
      csvCurrency(avgRevenue),
      csvDate(lastTrip?.departureTime),
      latestPay ? csvCurrency(latestPay.netPay) : '',
    ]
  })

  return { headers, rows }
}

export async function fetchMaintenanceReportData(params: ReportParams): Promise<ReportData> {
  const where: Record<string, unknown> = {}
  if (params.truckId) where.truckId = params.truckId
  if (params.status) where.status = params.status
  if (params.dateFrom || params.dateTo) {
    where.performedAt = {}
    if (params.dateFrom) (where.performedAt as Record<string, unknown>).gte = new Date(params.dateFrom)
    if (params.dateTo) (where.performedAt as Record<string, unknown>).lte = new Date(params.dateTo)
  }

  const records = await db.maintenanceRecord.findMany({
    where,
    include: {
      truck: { select: { plateNumber: true, make: true, model: true } },
    },
    orderBy: { performedAt: 'desc' },
  })

  const headers = [
    'Date Performed', 'Truck', 'Type', 'Title', 'Description',
    'Odometer (km)', 'Cost', 'Performed By', 'Status',
    'Next Due Date', 'Next Due Mileage (km)', 'Parts Used', 'Invoice', 'Created At',
  ]

  const rows = records.map((r) => [
    csvDate(r.performedAt),
    r.truck.plateNumber,
    r.type,
    r.title,
    r.description || '',
    csvNumber(r.odometer, 1),
    csvCurrency(r.cost),
    r.performedBy || '',
    r.status,
    csvDate(r.nextDueDate),
    csvNumber(r.nextDueMileage, 0),
    r.partsUsed || '',
    r.invoiceUrl ? 'Yes' : 'No',
    csvDateTime(r.createdAt),
  ])

  return { headers, rows }
}

const REPORT_TITLES: Record<string, string> = {
  trip_summary: 'Trip Summary Report',
  fuel_report: 'Fuel Report',
  expense_report: 'Expense Report',
  payroll_report: 'Payroll Report',
  fleet_overview: 'Fleet Overview Report',
  daily_summary: 'Daily Summary Report',
  waybill_report: 'Waybill Report',
  driver_performance: 'Driver Performance Report',
  maintenance_report: 'Maintenance Report',
}

export function getReportTitle(type: string): string {
  return REPORT_TITLES[type] || `${type.replace(/_/g, ' ')} Report`
}
