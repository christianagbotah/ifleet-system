// ════════════════════════════════════════════════════════════════════
// iFleetPro — Report Data Fetchers (New Report Types)
// ════════════════════════════════════════════════════════════════════

import { db } from '@/lib/db'
import {
  csvDate,
  csvDateTime,
  csvCurrency,
  csvNumber,
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
  date?: string
  depotName?: string
  country?: string
  tollType?: string
  pickupRegion?: string
  category?: string
}

// ── 1. Compliance / Expiry Report ──────────────────────────────────

export async function fetchComplianceData(params: ReportParams): Promise<ReportData> {
  const [dvlaRecords, roadworthyRecords, insuranceRecords, drivers] = await Promise.all([
    db.dvlaRegistration.findMany({
      where: params.truckId ? { truckId: params.truckId } : {},
      include: { truck: { select: { plateNumber: true } } },
      orderBy: { expiryDate: 'asc' },
    }),
    db.roadworthyInspection.findMany({
      where: params.truckId ? { truckId: params.truckId } : {},
      include: { truck: { select: { plateNumber: true } } },
      orderBy: { certificateExpiry: 'asc' },
    }),
    db.insurance.findMany({
      where: params.truckId ? { truckId: params.truckId } : {},
      include: { truck: { select: { plateNumber: true } } },
      orderBy: { endDate: 'asc' },
    }),
    params.driverId
      ? db.driver.findMany({ where: { id: params.driverId }, select: { id: true, firstName: true, lastName: true, employeeId: true, licenseNumber: true, licenseExpiry: true, ghanaCardExpiry: true } })
      : db.driver.findMany({ select: { id: true, firstName: true, lastName: true, employeeId: true, licenseNumber: true, licenseExpiry: true, ghanaCardExpiry: true } }),
  ])

  const now = new Date()
  const headers = [
    'Document Type', 'Reference', 'Truck Plate', 'Driver', 'Expiry Date',
    'Days Remaining', 'Status', 'Category',
  ]

  const rows: (string | number | null | undefined)[][] = []

  for (const d of dvlaRecords) {
    const daysRemaining = Math.ceil((d.expiryDate.getTime() - now.getTime()) / (1000 * 60 * 60 * 24))
    rows.push([
      'DVLA Registration',
      d.registrationNumber,
      d.truck.plateNumber,
      '',
      csvDate(d.expiryDate),
      daysRemaining,
      daysRemaining <= 0 ? 'Expired' : daysRemaining <= 30 ? 'Expiring Soon' : 'Valid',
      'Vehicle Registration',
    ])
  }

  for (const r of roadworthyRecords) {
    if (!r.certificateExpiry) continue
    const daysRemaining = Math.ceil((r.certificateExpiry.getTime() - now.getTime()) / (1000 * 60 * 60 * 24))
    rows.push([
      'Roadworthy Certificate',
      r.certificateNumber,
      r.truck.plateNumber,
      '',
      csvDate(r.certificateExpiry),
      daysRemaining,
      daysRemaining <= 0 ? 'Expired' : daysRemaining <= 30 ? 'Expiring Soon' : 'Valid',
      'Vehicle Inspection',
    ])
  }

  for (const ins of insuranceRecords) {
    const daysRemaining = Math.ceil((ins.endDate.getTime() - now.getTime()) / (1000 * 60 * 60 * 24))
    rows.push([
      'Insurance Policy',
      ins.policyNumber,
      ins.truck.plateNumber,
      '',
      csvDate(ins.endDate),
      daysRemaining,
      daysRemaining <= 0 ? 'Expired' : daysRemaining <= 30 ? 'Expiring Soon' : 'Valid',
      'Insurance',
    ])
  }

  for (const drv of drivers) {
    const licenseDays = Math.ceil((drv.licenseExpiry.getTime() - now.getTime()) / (1000 * 60 * 60 * 24))
    rows.push([
      'Driver License',
      drv.licenseNumber,
      '',
      `${drv.firstName} ${drv.lastName}`,
      csvDate(drv.licenseExpiry),
      licenseDays,
      licenseDays <= 0 ? 'Expired' : licenseDays <= 30 ? 'Expiring Soon' : 'Valid',
      'Driver Document',
    ])
    if (drv.ghanaCardExpiry) {
      const cardDays = Math.ceil((drv.ghanaCardExpiry.getTime() - now.getTime()) / (1000 * 60 * 60 * 24))
      rows.push([
        'Ghana Card',
        drv.employeeId,
        '',
        `${drv.firstName} ${drv.lastName}`,
        csvDate(drv.ghanaCardExpiry),
        cardDays,
        cardDays <= 0 ? 'Expired' : cardDays <= 30 ? 'Expiring Soon' : 'Valid',
        'Driver Document',
      ])
    }
  }

  return { headers, rows }
}

// ── 2. Tyre Report ─────────────────────────────────────────────────

export async function fetchTyreReportData(params: ReportParams): Promise<ReportData> {
  const where: Record<string, unknown> = {}
  if (params.truckId) where.truckId = params.truckId

  const tyres = await db.tyre.findMany({
    where,
    include: {
      truck: { select: { plateNumber: true } },
    },
    orderBy: { purchaseDate: 'desc' },
  })

  const headers = [
    'Serial Number', 'Truck', 'Brand', 'Purchase Date',
    'Purchase Price', 'Condition', 'Last Inspection', 'Status',
  ]

  const rows = tyres.map((t) => [
    t.serialNumber,
    t.truck.plateNumber,
    t.brand,
    csvDate(t.purchaseDate),
    csvCurrency(t.purchasePrice),
    t.condition,
    csvDate(t.lastInspection),
    t.retiredDate ? 'Retired' : t.condition === 'damaged' ? 'Damaged' : 'Active',
  ])

  return { headers, rows }
}

// ── 3. Insurance Claims Report ─────────────────────────────────────

export async function fetchInsuranceClaimsData(params: ReportParams): Promise<ReportData> {
  const where: Record<string, unknown> = {}
  if (params.truckId) where.truckId = params.truckId
  if (params.status) where.status = params.status
  if (params.dateFrom || params.dateTo) {
    where.incidentDate = {}
    if (params.dateFrom) (where.incidentDate as Record<string, unknown>).gte = new Date(params.dateFrom)
    if (params.dateTo) (where.incidentDate as Record<string, unknown>).lte = new Date(params.dateTo)
  }

  const claims = await db.insuranceClaim.findMany({
    where,
    include: {
      insurance: { select: { policyNumber: true, provider: true } },
      truck: { select: { plateNumber: true } },
    },
    orderBy: { incidentDate: 'desc' },
  })

  const headers = [
    'Claim Number', 'Policy Number', 'Provider', 'Truck', 'Claim Type',
    'Incident Date', 'Location', 'Claimed Amount', 'Approved Amount',
    'Status', 'Submitted Date',
  ]

  const rows = claims.map((c) => [
    c.claimNumber,
    c.insurance.policyNumber,
    c.insurance.provider,
    c.truck.plateNumber,
    c.claimType.replace(/_/g, ' '),
    csvDate(c.incidentDate),
    c.incidentLocation,
    csvCurrency(c.claimAmount),
    c.approvedAmount !== null ? csvCurrency(c.approvedAmount) : '',
    c.status.replace(/_/g, ' '),
    csvDateTime(c.submittedAt),
  ])

  return { headers, rows }
}

// ── 4. Warehouse Inventory Report ──────────────────────────────────

export async function fetchWarehouseData(params: ReportParams): Promise<ReportData> {
  const where: Record<string, unknown> = {}
  if (params.category) where.category = params.category
  if (params.status) where.status = params.status

  const items = await db.warehouseItem.findMany({
    where,
    orderBy: [{ category: 'asc' }, { name: 'asc' }],
  })

  const headers = [
    'SKU', 'Name', 'Category', 'Quantity', 'Min Stock Level', 'Unit Price',
    'Total Value', 'Unit', 'Warehouse', 'Supplier', 'Status', 'Last Restocked',
    'Expiry Date',
  ]

  const rows = items.map((item) => [
    item.sku,
    item.name,
    item.category,
    item.quantity,
    item.minStock,
    csvCurrency(item.unitPrice),
    csvCurrency(item.unitPrice * item.quantity),
    item.unit,
    item.warehouse,
    item.supplier || '',
    item.status.replace(/_/g, ' '),
    csvDate(item.lastRestocked),
    csvDate(item.expiryDate),
  ])

  return { headers, rows }
}

// ── 5. Driver Incentives Report ────────────────────────────────────

export async function fetchDriverIncentivesData(params: ReportParams): Promise<ReportData> {
  const where: Record<string, unknown> = {}
  if (params.driverId) where.driverId = params.driverId
  if (params.status) where.status = params.status
  if (params.periodStart || params.periodEnd) {
    where.createdAt = {}
    if (params.periodStart) (where.createdAt as Record<string, unknown>).gte = new Date(params.periodStart)
    if (params.periodEnd) (where.createdAt as Record<string, unknown>).lte = new Date(params.periodEnd)
  }

  const incentives = await db.driverIncentive.findMany({
    where,
    include: {
      driver: { select: { firstName: true, lastName: true, employeeId: true } },
      approver: { select: { name: true } },
    },
    orderBy: { createdAt: 'desc' },
  })

  const headers = [
    'Driver', 'Employee ID', 'Type', 'Title', 'Period', 'Amount', 'Status',
    'Approved By', 'Approved Date', 'Paid Date', 'Metric',
  ]

  const rows = incentives.map((inc) => [
    `${inc.driver.firstName} ${inc.driver.lastName}`,
    inc.driver.employeeId,
    inc.type.replace(/_/g, ' '),
    inc.title,
    inc.period,
    csvCurrency(inc.amount),
    inc.status.replace(/_/g, ' '),
    inc.approver?.name || '',
    csvDateTime(inc.approvedAt),
    csvDateTime(inc.paidAt),
    inc.metrics || '',
  ])

  return { headers, rows }
}

// ── 6. Toll Report ─────────────────────────────────────────────────

export async function fetchTollData(params: ReportParams): Promise<ReportData> {
  const where: Record<string, unknown> = {}
  if (params.truckId) where.truckId = params.truckId
  if (params.driverId) where.driverId = params.driverId
  if (params.tollType) where.tollType = params.tollType
  if (params.status) where.status = params.status
  if (params.dateFrom || params.dateTo) {
    where.tollDate = {}
    if (params.dateFrom) (where.tollDate as Record<string, unknown>).gte = new Date(params.dateFrom)
    if (params.dateTo) (where.tollDate as Record<string, unknown>).lte = new Date(params.dateTo)
  }

  const tolls = await db.tollRecord.findMany({
    where,
    include: {
      truck: { select: { plateNumber: true } },
      driver: { select: { firstName: true, lastName: true } },
      trip: { select: { tripNumber: true } },
    },
    orderBy: { tollDate: 'desc' },
  })

  const headers = [
    'Date', 'Truck', 'Driver', 'Trip #', 'Toll Point', 'Toll Type', 'Route',
    'Amount', 'Payment Method', 'Direction', 'Overloaded', 'Status',
  ]

  const rows = tolls.map((t) => [
    csvDate(t.tollDate),
    t.truck.plateNumber,
    t.driver ? `${t.driver.firstName} ${t.driver.lastName}` : '',
    t.trip?.tripNumber || '',
    t.tollPoint,
    t.tollType.replace(/_/g, ' '),
    t.route || '',
    csvCurrency(t.amount),
    t.paymentMethod.replace(/_/g, ' '),
    t.direction || '',
    t.overloaded ? 'Yes' : 'No',
    t.status,
  ])

  return { headers, rows }
}

// ── 7. Safety / Vehicle Inspections Report ─────────────────────────

export async function fetchSafetyInspectionsData(params: ReportParams): Promise<ReportData> {
  const where: Record<string, unknown> = {}
  if (params.truckId) where.truckId = params.truckId
  if (params.driverId) where.driverId = params.driverId
  if (params.status) where.result = params.status
  if (params.dateFrom || params.dateTo) {
    where.inspectionDate = {}
    if (params.dateFrom) (where.inspectionDate as Record<string, unknown>).gte = new Date(params.dateFrom)
    if (params.dateTo) (where.inspectionDate as Record<string, unknown>).lte = new Date(params.dateTo)
  }

  const inspections = await db.vehicleInspection.findMany({
    where,
    include: {
      truck: { select: { plateNumber: true } },
      driver: { select: { firstName: true, lastName: true } },
    },
    orderBy: { inspectionDate: 'desc' },
  })

  const headers = [
    'Date', 'Truck', 'Driver', 'Type', 'Odometer', 'Total Checks', 'Pass Count',
    'Warning Count', 'Fail Count', 'Result', 'Defects Found', 'Inspector',
    'Location',
  ]

  const rows = inspections.map((insp) => [
    csvDate(insp.inspectionDate),
    insp.truck.plateNumber,
    insp.driver ? `${insp.driver.firstName} ${insp.driver.lastName}` : '',
    insp.type.replace(/_/g, ' '),
    csvNumber(insp.odometerReading, 1),
    insp.totalChecks,
    insp.passCount,
    insp.warningCount,
    insp.failCount,
    insp.result.replace(/_/g, ' '),
    insp.defectsFound ? 'Yes' : 'No',
    insp.inspectorName || '',
    insp.location || '',
  ])

  return { headers, rows }
}

// ── 8. Cash Advances Report ────────────────────────────────────────

export async function fetchCashAdvancesData(params: ReportParams): Promise<ReportData> {
  const where: Record<string, unknown> = {}
  if (params.driverId) where.driverId = params.driverId
  if (params.status) where.status = params.status
  if (params.tripId) where.tripId = params.tripId
  if (params.dateFrom || params.dateTo) {
    where.requestDate = {}
    if (params.dateFrom) (where.requestDate as Record<string, unknown>).gte = new Date(params.dateFrom)
    if (params.dateTo) (where.requestDate as Record<string, unknown>).lte = new Date(params.dateTo)
  }

  const advances = await db.cashAdvance.findMany({
    where,
    include: {
      driver: { select: { firstName: true, lastName: true, employeeId: true } },
      trip: { select: { tripNumber: true } },
    },
    orderBy: { requestDate: 'desc' },
  })

  const headers = [
    'Request Date', 'Driver', 'Employee ID', 'Trip #', 'Purpose', 'Amount',
    'Payment Method', 'Status', 'Approved By', 'Approved At', 'Disbursed At',
    'Total Deducted', 'Remaining Balance',
  ]

  const rows = advances.map((adv) => [
    csvDate(adv.requestDate),
    `${adv.driver.firstName} ${adv.driver.lastName}`,
    adv.driver.employeeId,
    adv.trip?.tripNumber || '',
    adv.purpose.replace(/_/g, ' '),
    csvCurrency(adv.amount),
    adv.paymentMethod.replace(/_/g, ' '),
    adv.status.replace(/_/g, ' '),
    adv.approvedBy || '',
    csvDateTime(adv.approvedAt),
    csvDateTime(adv.disbursedAt),
    csvCurrency(adv.totalDeducted),
    csvCurrency(adv.remainingBalance),
  ])

  return { headers, rows }
}

// ── 9. Daily Summary (on-demand) ───────────────────────────────────

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
    ['Total Expenses (GHS)', csvCurrency(totalExpenses)],
    ['Fuel Logs Today', fuelLogs.length],
    ['Total Fuel Cost (GHS)', csvCurrency(totalFuelCost)],
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

// ── 10. Border Crossings Report ────────────────────────────────────

export async function fetchBorderCrossingsData(params: ReportParams): Promise<ReportData> {
  const where: Record<string, unknown> = {}
  if (params.truckId) where.truckId = params.truckId
  if (params.driverId) where.driverId = params.driverId
  if (params.status) where.status = params.status
  if (params.country) where.country = params.country
  if (params.dateFrom || params.dateTo) {
    where.queuedAt = {}
    if (params.dateFrom) (where.queuedAt as Record<string, unknown>).gte = new Date(params.dateFrom)
    if (params.dateTo) (where.queuedAt as Record<string, unknown>).lte = new Date(params.dateTo)
  }

  const crossings = await db.borderCrossing.findMany({
    where,
    include: {
      truck: { select: { plateNumber: true } },
      driver: { select: { firstName: true, lastName: true } },
      trip: { select: { tripNumber: true } },
    },
    orderBy: { queuedAt: 'desc' },
  })

  const headers = [
    'Truck', 'Driver', 'Trip #', 'Border', 'Country', 'Direction', 'Status',
    'Queued At', 'Processing At', 'Cleared At', 'Estimated Wait (min)',
    'Actual Wait (min)', 'Clearance Fee', 'Document Status', 'Notes',
  ]

  const rows = crossings.map((bc) => [
    bc.truck.plateNumber,
    `${bc.driver.firstName} ${bc.driver.lastName}`,
    bc.trip.tripNumber,
    bc.borderName,
    bc.country,
    bc.direction,
    bc.status.replace(/_/g, ' '),
    csvDateTime(bc.queuedAt),
    csvDateTime(bc.processingAt),
    csvDateTime(bc.clearedAt),
    bc.estimatedWait ?? '',
    bc.actualWait ?? '',
    bc.clearanceFee !== null ? csvCurrency(bc.clearanceFee) : '',
    bc.documentStatus || '',
    bc.notes || '',
  ])

  return { headers, rows }
}

// ── 11. Depot Queue Report ─────────────────────────────────────────

export async function fetchDepotQueueData(params: ReportParams): Promise<ReportData> {
  const where: Record<string, unknown> = {}
  if (params.truckId) where.truckId = params.truckId
  if (params.driverId) where.driverId = params.driverId
  if (params.depotName) where.depotName = params.depotName
  if (params.status) where.status = params.status
  if (params.dateFrom || params.dateTo) {
    where.joinedAt = {}
    if (params.dateFrom) (where.joinedAt as Record<string, unknown>).gte = new Date(params.dateFrom)
    if (params.dateTo) (where.joinedAt as Record<string, unknown>).lte = new Date(params.dateTo)
  }

  const queues = await db.depotQueue.findMany({
    where,
    include: {
      truck: { select: { plateNumber: true } },
      driver: { select: { firstName: true, lastName: true } },
      trip: { select: { tripNumber: true } },
    },
    orderBy: { joinedAt: 'desc' },
  })

  const headers = [
    'Truck', 'Driver', 'Trip #', 'Depot Name', 'Queue Type', 'Position',
    'Status', 'Joined At', 'Started At', 'Completed At',
    'Estimated Wait (min)', 'Actual Wait (min)', 'Notes',
  ]

  const rows = queues.map((q) => [
    q.truck.plateNumber,
    q.driver ? `${q.driver.firstName} ${q.driver.lastName}` : '',
    q.trip?.tripNumber || '',
    q.depotName,
    q.queueType,
    q.position ?? '',
    q.status.replace(/_/g, ' '),
    csvDateTime(q.joinedAt),
    csvDateTime(q.startedAt),
    csvDateTime(q.completedAt),
    q.estimatedWait ?? '',
    q.actualWait ?? '',
    q.notes || '',
  ])

  return { headers, rows }
}

// ── 12. Load Board Report ──────────────────────────────────────────

export async function fetchLoadBoardData(params: ReportParams): Promise<ReportData> {
  const where: Record<string, unknown> = {}
  if (params.clientId) where.clientId = params.clientId
  if (params.status) where.status = params.status
  if (params.pickupRegion) where.pickupRegion = params.pickupRegion
  if (params.category) where.commodityType = params.category
  if (params.dateFrom || params.dateTo) {
    where.createdAt = {}
    if (params.dateFrom) (where.createdAt as Record<string, unknown>).gte = new Date(params.dateFrom)
    if (params.dateTo) (where.createdAt as Record<string, unknown>).lte = new Date(params.dateTo)
  }

  const loads = await db.loadBoard.findMany({
    where,
    include: {
      client: { select: { companyName: true } },
      assignedTruck: { select: { plateNumber: true } },
      assignedDriver: { select: { firstName: true, lastName: true } },
    },
    orderBy: { createdAt: 'desc' },
  })

  const headers = [
    'Posted Date', 'Client', 'Pickup Location', 'Dropoff Location', 'Commodity',
    'Weight (tonnes)', 'Truck Type', 'Offered Rate', 'Budget Min', 'Budget Max',
    'Status', 'Assigned Truck', 'Assigned Driver', 'Contact Name', 'Contact Phone',
  ]

  const rows = loads.map((l) => [
    csvDate(l.createdAt),
    l.client?.companyName || '',
    l.pickupLocation,
    l.dropoffLocation,
    l.commodityType,
    csvNumber(l.weight, 1),
    l.truckType || '',
    csvCurrency(l.offeredRate),
    csvCurrency(l.budgetMin),
    csvCurrency(l.budgetMax),
    l.status.replace(/_/g, ' '),
    l.assignedTruck?.plateNumber || '',
    l.assignedDriver ? `${l.assignedDriver.firstName} ${l.assignedDriver.lastName}` : '',
    l.contactName || '',
    l.contactPhone || '',
  ])

  return { headers, rows }
}

// ── 13. Fuel Anomaly Detection Report ──────────────────────────────

export async function fetchFuelAnomalyData(params: ReportParams): Promise<ReportData> {
  const where: Record<string, unknown> = {}
  if (params.truckId) where.truckId = params.truckId
  if (params.tripId) where.tripId = params.tripId
  if (params.dateFrom || params.dateTo) {
    where.date = {}
    if (params.dateFrom) (where.date as Record<string, unknown>).gte = new Date(params.dateFrom)
    if (params.dateTo) (where.date as Record<string, unknown>).lte = new Date(params.dateTo)
  }

  const fuelLogs = await db.fuelLog.findMany({
    where,
    include: {
      truck: { select: { plateNumber: true } },
      trip: { select: { tripNumber: true, totalMileage: true } },
    },
    orderBy: { date: 'desc' },
  })

  // Calculate fuel efficiency metrics
  const processedLogs = fuelLogs.map((f, index) => {
    let odometerDelta: number | null = null
    let litersPer100km: number | null = null
    let costPerKm: number | null = null
    let flag = ''

    if (f.odometer && index < fuelLogs.length - 1) {
      const prevLog = fuelLogs[index + 1]
      if (prevLog.odometer) {
        odometerDelta = f.odometer - prevLog.odometer
        if (odometerDelta > 0 && f.litersFilled > 0) {
          litersPer100km = (f.litersFilled / odometerDelta) * 100
          costPerKm = f.totalCost / (odometerDelta / 1000)
        }
      }
    }

    // Flag anomalies: > 60 L/100km or < 15 L/100km for diesel trucks
    if (litersPer100km !== null) {
      if (litersPer100km > 60) flag = 'HIGH CONSUMPTION'
      else if (litersPer100km < 15) flag = 'LOW CONSUMPTION'
      else if (f.totalCost > 3000) flag = 'HIGH COST'
    }

    return { ...f, odometerDelta, litersPer100km, costPerKm, flag }
  })

  const headers = [
    'Date', 'Truck', 'Trip #', 'Odometer', 'Liters Filled', 'Total Cost',
    'Cost Per Liter', 'Odometer Delta', 'Liters Per 100km', 'Cost Per km',
    'Station', 'Fuel Type', 'Flag',
  ]

  const rows = processedLogs.map((f) => [
    csvDate(f.date),
    f.truck.plateNumber,
    f.trip.tripNumber,
    csvNumber(f.odometer, 1),
    csvNumber(f.litersFilled, 1),
    csvCurrency(f.totalCost),
    f.costPerLiter !== null ? csvCurrency(f.costPerLiter) : '',
    csvNumber(f.odometerDelta, 1),
    f.litersPer100km !== null ? csvNumber(f.litersPer100km, 1) : '',
    f.costPerKm !== null ? csvCurrency(f.costPerKm) : '',
    f.stationName || '',
    f.fuelType,
    f.flag,
  ])

  return { headers, rows }
}

// ── Report Titles & Lookup ─────────────────────────────────────────

// ── 14. Cost Analytics Report ──────────────────────────────────

const AVG_KM_PER_LITER = 4.0

export async function fetchCostAnalyticsData(params: ReportParams): Promise<ReportData> {
  const dateFilter: Record<string, Date> = {}
  if (params.dateFrom) dateFilter.gte = new Date(params.dateFrom)
  if (params.dateTo) dateFilter.lte = new Date(params.dateTo)

  const truckWhere: Record<string, unknown> = { status: { in: ['active', 'inactive', 'maintenance'] } }
  if (params.truckId) truckWhere.id = params.truckId

  const [trucks, fuelLogs, expenses, maintenanceRecords, trips] = await Promise.all([
    db.truck.findMany({
      where: truckWhere,
      select: { id: true, plateNumber: true, make: true, model: true, currentMileage: true },
      orderBy: { plateNumber: 'asc' },
    }),
    db.fuelLog.findMany({
      where: { truckId: { in: (await db.truck.findMany({ where: truckWhere, select: { id: true } })).map(t => t.id) } },
      select: { truckId: true, litersFilled: true, totalCost: true, date: true, odometer: true },
      orderBy: { date: 'asc' },
    }),
    db.expense.findMany({
      where: { status: 'approved' },
      select: { truckId: true, category: true, amount: true, date: true },
    }),
    db.maintenanceRecord.findMany({
      where: { status: 'completed' },
      select: { truckId: true, cost: true, performedAt: true },
    }),
    db.trip.findMany({
      where: { status: { in: ['offloaded', 'completed', 'arrived_depot'] } },
      select: { truckId: true, quantity: true, unit: true, totalMileage: true, startMileage: true, endMileage: true, fuelUsed: true, departureTime: true },
    }),
  ])

  const headers = [
    'Truck', 'Make', 'Model', 'Fuel Cost (GHS)', 'Maintenance (GHS)', 'Other Costs (GHS)',
    'Total Cost (GHS)', 'Distance (km)', 'Tonnage', 'Cost/km (GHS)', 'Cost/Tonne (GHS)',
  ]

  const rows: (string | number | null | undefined)[][] = []

  for (const truck of trucks) {
    const truckFuel = fuelLogs.filter(f => f.truckId === truck.id)
    const fuelCost = truckFuel.reduce((s, f) => s + f.totalCost, 0)
    const totalFuelLiters = truckFuel.reduce((s, f) => s + f.litersFilled, 0)
    const maintCost = maintenanceRecords.filter(m => m.truckId === truck.id).reduce((s, m) => s + (m.cost || 0), 0)
    const otherCost = expenses.filter(e => e.truckId === truck.id && !['fuel', 'maintenance'].includes(e.category)).reduce((s, e) => s + e.amount, 0)
    const totalCost = fuelCost + maintCost + otherCost

    const truckTrips = trips.filter(t => t.truckId === truck.id)
    let totalDistance = 0
    for (const trip of truckTrips) {
      if (trip.endMileage && trip.startMileage && trip.endMileage > trip.startMileage) {
        totalDistance += (trip.endMileage - trip.startMileage)
      } else if (trip.totalMileage && trip.totalMileage > 0) {
        totalDistance += trip.totalMileage
      } else if (trip.fuelUsed && trip.fuelUsed > 0) {
        totalDistance += trip.fuelUsed * AVG_KM_PER_LITER
      }
    }
    if (totalDistance === 0 && totalFuelLiters > 0) {
      totalDistance = totalFuelLiters * AVG_KM_PER_LITER
    }

    let tonnage = 0
    for (const trip of truckTrips) {
      if (trip.unit === 'bags') tonnage += trip.quantity * 0.05
      else if (trip.unit === 'tonnes' || trip.unit === 'ton') tonnage += trip.quantity
      else tonnage += trip.quantity
    }

    rows.push([
      truck.plateNumber,
      truck.make || '',
      truck.model || '',
      csvCurrency(fuelCost),
      csvCurrency(maintCost),
      csvCurrency(otherCost),
      csvCurrency(totalCost),
      csvNumber(totalDistance, 1),
      csvNumber(tonnage, 2),
      csvCurrency(totalDistance > 0 ? totalCost / totalDistance : 0),
      csvCurrency(tonnage > 0 ? totalCost / tonnage : 0),
    ])
  }

  return { headers, rows }
}

// ── 15. Trip Profitability Report ────────────────────────────────

export async function fetchTripProfitabilityData(params: ReportParams): Promise<ReportData> {
  const where: Record<string, unknown> = { status: { in: ['offloaded', 'completed', 'arrived_depot'] } }
  if (params.dateFrom || params.dateTo) {
    const depFilter: Record<string, unknown> = {}
    if (params.dateFrom) depFilter.gte = new Date(params.dateFrom)
    if (params.dateTo) depFilter.lte = new Date(params.dateTo)
    where.departureTime = depFilter
  }
  if (params.truckId) where.truckId = params.truckId
  if (params.driverId) where.driverId = params.driverId

  const trips = await db.trip.findMany({
    where,
    include: {
      truck: { select: { plateNumber: true, make: true } },
      driver: { select: { firstName: true, lastName: true } },
      client: { select: { companyName: true } },
      FuelLog: { select: { totalCost: true } },
      Expense: { select: { amount: true, category: true } },
    },
    orderBy: { departureTime: 'desc' },
  })

  const headers = [
    'Trip #', 'Date', 'Driver', 'Truck', 'Route', 'Client',
    'Revenue (GHS)', 'Fuel Cost (GHS)', 'Expenses (GHS)', 'Total Cost (GHS)',
    'Net Profit (GHS)', 'Margin (%)',
  ]

  const rows = trips.map(t => {
    const revenue = t.totalRevenue ?? 0
    const fuelCost = t.FuelLog.reduce((s, f) => s + f.totalCost, 0)
    const expCost = t.Expense.filter(e => e.category !== 'fuel').reduce((s, e) => s + e.amount, 0)
    const totalCost = fuelCost + expCost
    const profit = revenue - totalCost
    const margin = revenue > 0 ? Math.round((profit / revenue) * 10000) / 100 : 0

    return [
      t.tripNumber,
      csvDateTime(t.departureTime),
      `${t.driver.firstName} ${t.driver.lastName}`,
      `${t.truck.plateNumber} (${t.truck.make})`,
      `${t.loadingLocation} → ${t.destination}`,
      t.client?.companyName ?? t.customerName ?? '',
      csvCurrency(revenue),
      csvCurrency(fuelCost),
      csvCurrency(expCost),
      csvCurrency(totalCost),
      csvCurrency(profit),
      csvNumber(margin, 1),
    ]
  })

  return { headers, rows }
}

// ── 16. Fuel Analytics Report ────────────────────────────────────

export async function fetchFuelAnalyticsData(params: ReportParams): Promise<ReportData> {
  const where: Record<string, unknown> = {}
  if (params.truckId) where.truckId = params.truckId
  if (params.dateFrom || params.dateTo) {
    const dateFilter: Record<string, unknown> = {}
    if (params.dateFrom) dateFilter.gte = new Date(params.dateFrom)
    if (params.dateTo) dateFilter.lte = new Date(params.dateTo)
    where.date = dateFilter
  }

  const fuelLogs = await db.fuelLog.findMany({
    where,
    include: { truck: { select: { plateNumber: true, make: true, model: true } } },
    orderBy: { date: 'desc' },
  })

  // Per-truck aggregation
  const truckMap = new Map<string, { liters: number; cost: number; fillups: number; station: string }>()
  for (const f of fuelLogs) {
    const existing = truckMap.get(f.truckId) || { liters: 0, cost: 0, fillups: 0, station: '' }
    existing.liters += f.litersFilled
    existing.cost += f.totalCost
    existing.fillups += 1
    if (f.stationName) existing.station = f.stationName
    truckMap.set(f.truckId, existing)
  }

  const headers = [
    'Truck', 'Total Liters', 'Total Cost (GHS)', 'Avg Cost/Liter', 'Fill-ups',
    'Avg Fill (L)', 'L/100km', 'Efficiency Rating',
  ]

  const rows = fuelLogs.length === 0 ? [] : Array.from(truckMap.entries()).map(([truckId, data]) => {
    const truck = fuelLogs.find(f => f.truckId === truckId)?.truck
    const avgCostPerLiter = data.liters > 0 ? data.cost / data.liters : 0
    const avgFill = data.fillups > 0 ? data.liters / data.fillups : 0
    // Assume ~4 km/l average for rating
    const estimatedKm = data.liters * AVG_KM_PER_LITER
    const lPer100km = estimatedKm > 0 ? (data.liters / estimatedKm) * 100 : 0
    let rating = 'Good'
    if (lPer100km > 35) rating = 'Poor'
    else if (lPer100km > 28) rating = 'Fair'
    else if (lPer100km < 18) rating = 'Excellent'

    return [
      truck ? `${truck.plateNumber} (${truck.make})` : truckId,
      csvNumber(data.liters, 1),
      csvCurrency(data.cost),
      csvCurrency(avgCostPerLiter),
      data.fillups,
      csvNumber(avgFill, 1),
      csvNumber(lPer100km, 1),
      rating,
    ]
  })

  return { headers, rows }
}

// ── 17. Safety Scoring Report ────────────────────────────────────

export async function fetchSafetyScoringData(params: ReportParams): Promise<ReportData> {
  const driverWhere: Record<string, unknown> = { status: 'active' }
  if (params.driverId) driverWhere.id = params.driverId

  const drivers = await db.driver.findMany({
    where: driverWhere,
    select: {
      id: true, firstName: true, lastName: true, employeeId: true, phone: true,
      licenseExpiry: true, ghanaCardExpiry: true, verificationStatus: true,
    },
    orderBy: [{ firstName: 'asc' }, { lastName: 'asc' }],
  })

  const now = new Date()

  function getGrade(score: number): string {
    if (score >= 90) return 'A+'
    if (score >= 80) return 'A'
    if (score >= 70) return 'B+'
    if (score >= 60) return 'B'
    if (score >= 50) return 'C'
    if (score >= 40) return 'D'
    return 'F'
  }

  function daysBetween(a: Date, b: Date): number {
    return Math.ceil((b.getTime() - a.getTime()) / (1000 * 60 * 60 * 24))
  }

  // Get each driver's trucks and trip count
  const driverData = await Promise.all(drivers.map(async (driver) => {
    const [trucks, tripCount, driverTrips] = await Promise.all([
      db.truck.findMany({ where: { driverId: driver.id, status: 'active' }, select: { id: true } }),
      db.trip.count({ where: { driverId: driver.id, status: 'completed' } }),
      db.trip.findMany({
        where: { driverId: driver.id, status: 'completed' },
        select: { totalMileage: true },
      }),
    ])
    const totalKm = driverTrips.reduce((s, t) => s + (t.totalMileage || 0), 0)
    const truckIds = trucks.map(t => t.id)

    const alertCounts = truckIds.length > 0
      ? await db.trackingAlert.groupBy({
          by: ['type'],
          where: { truckId: { in: truckIds }, type: { in: ['speeding', 'route_deviation', 'idle'] } },
          _count: true,
        })
      : []

    const speeding = alertCounts.find(a => a.type === 'speeding')?._count || 0
    const routeDeviation = alertCounts.find(a => a.type === 'route_deviation')?._count || 0
    const idle = alertCounts.find(a => a.type === 'idle')?._count || 0

    let score = 25 // base
    if (speeding === 0) score += 25; else if (speeding <= 3) score += 20; else if (speeding <= 6) score += 15; else if (speeding <= 10) score += 10
    if (routeDeviation === 0) score += 20; else if (routeDeviation <= 2) score += 15; else if (routeDeviation <= 5) score += 10
    if (idle <= 2) score += 15; else if (idle <= 5) score += 10; else if (idle <= 10) score += 5
    score = Math.min(100, score)

    const licenseDays = driver.licenseExpiry ? daysBetween(now, new Date(driver.licenseExpiry)) : null
    const trend = score >= 80 ? 'Stable' : score >= 60 ? 'Improving' : 'Declining'

    return {
      driver, score, grade: getGrade(score), tripCount, totalKm, speeding, routeDeviation, idle, licenseDays, trend,
    }
  }))

  // Sort by score descending for ranking
  driverData.sort((a, b) => b.score - a.score)

  const headers = [
    'Rank', 'Driver', 'Employee ID', 'Phone', 'Score', 'Grade', 'Trips', 'Distance (km)',
    'Violations', 'Incidents', 'Trend', 'Last Score Date',
  ]

  const rows = driverData.map((d, i) => [
    i + 1,
    `${d.driver.firstName} ${d.driver.lastName}`,
    d.driver.employeeId,
    d.driver.phone || '',
    d.score,
    d.grade,
    d.tripCount,
    csvNumber(d.totalKm, 0),
    d.speeding + d.routeDeviation,
    d.idle,
    d.trend,
    d.licenseDays !== null ? csvNumber(d.licenseDays, 0) + ' days' : 'N/A',
  ])

  return { headers, rows }
}

// ── 18. Fleet Profit & Loss Report ──────────────────────────────

export async function fetchFleetProfitLossData(params: ReportParams): Promise<ReportData> {
  const now = new Date()
  let startDate: Date
  let endDate: Date

  if (params.dateFrom && params.dateTo) {
    startDate = new Date(params.dateFrom)
    endDate = new Date(params.dateTo)
    endDate.setHours(23, 59, 59, 999)
  } else {
    const period = params.period || 'this_month'
    switch (period) {
      case 'last_month': {
        const firstOfThisMonth = new Date(now.getFullYear(), now.getMonth(), 1)
        startDate = new Date(firstOfThisMonth.getFullYear(), firstOfThisMonth.getMonth() - 1, 1)
        endDate = new Date(firstOfThisMonth.getFullYear(), firstOfThisMonth.getMonth(), 0, 23, 59, 59, 999)
        break
      }
      case 'this_quarter': {
        const q = Math.floor(now.getMonth() / 3) * 3
        startDate = new Date(now.getFullYear(), q, 1)
        endDate = new Date(now.getFullYear(), q + 3, 0, 23, 59, 59, 999)
        break
      }
      case 'this_year': {
        startDate = new Date(now.getFullYear(), 0, 1)
        endDate = new Date(now.getFullYear(), 11, 31, 23, 59, 59, 999)
        break
      }
      default: {
        startDate = new Date(now.getFullYear(), now.getMonth(), 1)
        endDate = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59, 999)
        break
      }
    }
  }

  const truckWhere: Record<string, unknown> = { status: { in: ['active', 'maintenance'] } }
  if (params.truckId) truckWhere.id = params.truckId

  const [trucks, completedTrips, expenses, maintenanceRecords, tollRecords] = await Promise.all([
    db.truck.findMany({
      where: truckWhere,
      select: { id: true, plateNumber: true, make: true, model: true, driver: { select: { firstName: true, lastName: true } } },
      orderBy: { plateNumber: 'asc' },
    }),
    db.trip.findMany({
      where: {
        status: { in: ['offloaded', 'completed', 'arrived_depot'] },
        departureTime: { gte: startDate, lte: endDate },
        ...(params.truckId ? { truckId: params.truckId } : {}),
      },
      select: { truckId: true, totalRevenue: true, departureTime: true },
    }),
    db.expense.findMany({
      where: {
        date: { gte: startDate, lte: endDate },
        status: { in: ['approved', 'pending'] },
        ...(params.truckId ? { truckId: params.truckId } : {}),
      },
      select: { truckId: true, category: true, amount: true, date: true },
    }),
    db.maintenanceRecord.findMany({
      where: {
        performedAt: { gte: startDate, lte: endDate },
        status: { in: ['completed', 'approved', 'pending'] },
        ...(params.truckId ? { truckId: params.truckId } : {}),
      },
      select: { truckId: true, cost: true, performedAt: true },
    }),
    db.tollRecord.findMany({
      where: {
        tollDate: { gte: startDate, lte: endDate },
        status: { in: ['approved', 'completed', 'pending'] },
        ...(params.truckId ? { truckId: params.truckId } : {}),
      },
      select: { truckId: true, amount: true, overloadFine: true, tollDate: true },
    }),
  ])

  const headers = [
    'Truck', 'Make', 'Model', 'Driver', 'Trips', 'Revenue (GHS)',
    'Fuel Cost (GHS)', 'Maintenance (GHS)', 'Tolls (GHS)', 'Other Expenses (GHS)',
    'Total Expenses (GHS)', 'Net Income/Loss (GHS)', 'Margin (%)',
  ]

  const rows: (string | number | null | undefined)[][] = []
  let totalRevenue = 0
  let totalExpenses = 0
  let totalTrips = 0

  for (const truck of trucks) {
    const trips = completedTrips.filter(t => t.truckId === truck.id)
    const revenue = trips.reduce((s, t) => s + (t.totalRevenue ?? 0), 0)
    const fuelCost = expenses.filter(e => e.truckId === truck.id && e.category === 'fuel').reduce((s, e) => s + e.amount, 0)
    const maintCost = expenses.filter(e => e.truckId === truck.id && e.category === 'maintenance').reduce((s, e) => s + e.amount, 0)
      + maintenanceRecords.filter(m => m.truckId === truck.id).reduce((s, m) => s + (m.cost ?? 0), 0)
    const tollCost = expenses.filter(e => e.truckId === truck.id && e.category === 'toll').reduce((s, e) => s + e.amount, 0)
      + tollRecords.filter(t => t.truckId === truck.id).reduce((s, t) => s + t.amount + (t.overloadFine ?? 0), 0)
    const otherCost = expenses.filter(e => e.truckId === truck.id && !['fuel', 'maintenance', 'toll'].includes(e.category)).reduce((s, e) => s + e.amount, 0)
    const totExp = fuelCost + maintCost + tollCost + otherCost
    const netIncome = revenue - totExp
    const margin = revenue > 0 ? Math.round((netIncome / revenue) * 10000) / 100 : 0

    totalRevenue += revenue
    totalExpenses += totExp
    totalTrips += trips.length

    rows.push([
      truck.plateNumber,
      truck.make || '',
      truck.model || '',
      truck.driver ? `${truck.driver.firstName} ${truck.driver.lastName}` : 'Unassigned',
      trips.length,
      csvCurrency(revenue),
      csvCurrency(fuelCost),
      csvCurrency(maintCost),
      csvCurrency(tollCost),
      csvCurrency(otherCost),
      csvCurrency(totExp),
      csvCurrency(netIncome),
      csvNumber(margin, 1),
    ])
  }

  // Add fleet totals row
  rows.push([])
  rows.push([
    'FLEET TOTAL', '', '', '', totalTrips,
    csvCurrency(totalRevenue), '', '', '', '',
    csvCurrency(totalExpenses),
    csvCurrency(totalRevenue - totalExpenses),
    totalRevenue > 0 ? csvNumber(((totalRevenue - totalExpenses) / totalRevenue) * 100, 1) : '0',
  ])

  return { headers, rows }
}

// ── Report Titles & Lookup ─────────────────────────────────────────

export const REPORT_TITLES: Record<string, string> = {
  compliance_report: 'Compliance / Expiry Report',
  tyre_report: 'Tyre Management Report',
  insurance_claims_report: 'Insurance Claims Report',
  warehouse_report: 'Warehouse Inventory Report',
  driver_incentives_report: 'Driver Incentives Report',
  toll_report: 'Toll Records Report',
  safety_report: 'Vehicle Safety Inspections Report',
  cash_advances_report: 'Cash Advances Report',
  daily_summary: 'Daily Summary Report',
  border_crossings_report: 'Border Crossings Report',
  depot_queue_report: 'Depot Queue Report',
  load_board_report: 'Load Board Report',
  fuel_anomaly_report: 'Fuel Anomaly Detection Report',
  cost_analytics: 'Cost Analytics Report',
  trip_profitability: 'Trip Profitability Report',
  fuel_analytics: 'Fuel Analytics Report',
  safety_scoring: 'Safety Scoring Report',
  fleet_profit_loss: 'Fleet Profit & Loss Report',
}

export function getReportTitle(type: string): string {
  return REPORT_TITLES[type] || `${type.replace(/_/g, ' ')} Report`
}
