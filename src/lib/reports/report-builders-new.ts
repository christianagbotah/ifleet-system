import { db } from '@/lib/db'
import { ExcelReport } from './excel-generator'
import type { ColumnDef } from './excel-generator'
import type { ReportParams } from './types'
import { APP_NAME, APP_TAGLINE } from '@/lib/constants'

// ============ LOCAL HELPER FUNCTIONS ============

function formatGHS(amount: number): string {
  return `GHS ${amount.toLocaleString('en-GH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
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

// ============ 1. COMPLIANCE & DOCUMENT EXPIRY REPORT ============

export async function buildComplianceReport(params: ReportParams): Promise<ExcelReport> {
  const now = new Date()

  // Gather all compliance documents with expiry dates
  const dvlaRecords = await db.dvlaRegistration.findMany({
    include: { truck: { select: { plateNumber: true, make: true } } },
  })
  const roadworthyRecords = await db.roadworthyInspection.findMany({
    include: { truck: { select: { plateNumber: true, make: true } } },
  })
  const insurances = await db.insurance.findMany({
    include: { truck: { select: { plateNumber: true, make: true } } },
  })
  const drivers = await db.driver.findMany({
    select: {
      id: true, firstName: true, lastName: true,
      licenseExpiry: true, ghanaCardExpiry: true,
    },
  })

  const documents: Record<string, unknown>[] = []

  for (const r of dvlaRecords) {
    const daysRemaining = Math.ceil((r.expiryDate.getTime() - now.getTime()) / (1000 * 60 * 60 * 24))
    documents.push({
      docType: 'DVLA Registration',
      reference: r.registrationNumber,
      entity: `${r.truck.plateNumber} (${r.truck.make})`,
      entityType: 'Truck',
      expiryDate: r.expiryDate,
      daysRemaining,
      status: daysRemaining <= 0 ? 'Expired' : daysRemaining <= 30 ? 'Expiring Soon' : 'Compliant',
      category: 'Registration',
    })
  }

  for (const r of roadworthyRecords) {
    if (!r.certificateExpiry) continue
    const daysRemaining = Math.ceil((r.certificateExpiry.getTime() - now.getTime()) / (1000 * 60 * 60 * 24))
    documents.push({
      docType: 'Roadworthy Certificate',
      reference: r.certificateNumber,
      entity: `${r.truck.plateNumber} (${r.truck.make})`,
      entityType: 'Truck',
      expiryDate: r.certificateExpiry,
      daysRemaining,
      status: daysRemaining <= 0 ? 'Expired' : daysRemaining <= 30 ? 'Expiring Soon' : 'Compliant',
      category: 'Inspection',
    })
  }

  for (const i of insurances) {
    const daysRemaining = Math.ceil((i.endDate.getTime() - now.getTime()) / (1000 * 60 * 60 * 24))
    documents.push({
      docType: `Insurance (${i.type})`,
      reference: i.policyNumber,
      entity: `${i.truck.plateNumber} (${i.truck.make})`,
      entityType: 'Truck',
      expiryDate: i.endDate,
      daysRemaining,
      status: daysRemaining <= 0 ? 'Expired' : daysRemaining <= 30 ? 'Expiring Soon' : 'Compliant',
      category: 'Insurance',
    })
  }

  for (const d of drivers) {
    const licenseDays = Math.ceil((d.licenseExpiry.getTime() - now.getTime()) / (1000 * 60 * 60 * 24))
    documents.push({
      docType: "Driver's License",
      reference: d.licenseNumber,
      entity: `${d.firstName} ${d.lastName}`,
      entityType: 'Driver',
      expiryDate: d.licenseExpiry,
      daysRemaining: licenseDays,
      status: licenseDays <= 0 ? 'Expired' : licenseDays <= 30 ? 'Expiring Soon' : 'Compliant',
      category: 'License',
    })
    if (d.ghanaCardExpiry) {
      const ghanaCardDays = Math.ceil((d.ghanaCardExpiry.getTime() - now.getTime()) / (1000 * 60 * 60 * 24))
      documents.push({
        docType: 'Ghana Card',
        reference: d.ghanaCardNumber ?? '-',
        entity: `${d.firstName} ${d.lastName}`,
        entityType: 'Driver',
        expiryDate: d.ghanaCardExpiry,
        daysRemaining: ghanaCardDays,
        status: ghanaCardDays <= 0 ? 'Expired' : ghanaCardDays <= 30 ? 'Expiring Soon' : 'Compliant',
        category: 'ID Document',
      })
    }
  }

  // Filter by date range if provided
  if (params.dateFrom || params.dateTo) {
    // Keep all documents since they're active/expiry-based, not date-range-based
  }

  const totalDocs = documents.length
  const expired = documents.filter((d) => d.status === 'Expired').length
  const expiringSoon = documents.filter((d) => d.status === 'Expiring Soon').length
  const compliant = documents.filter((d) => d.status === 'Compliant').length

  // Sort: expired first, then expiring soon, then compliant
  documents.sort((a, b) => (a.daysRemaining as number) - (b.daysRemaining as number))

  const columns: ColumnDef[] = [
    { key: 'docType', header: 'Document Type', type: 'text' },
    { key: 'reference', header: 'Reference', type: 'text' },
    { key: 'entity', header: 'Truck/Driver', type: 'text' },
    { key: 'expiryDate', header: 'Expiry Date', type: 'date' },
    { key: 'daysRemaining', header: 'Days Remaining', type: 'number' },
    { key: 'status', header: 'Status', type: 'text' },
    { key: 'category', header: 'Category', type: 'text' },
  ]

  const report = new ExcelReport(`${APP_NAME} \u2014 Compliance & Document Expiry Report`, buildSubtitle(params))
  report.addKPISection([
    { label: 'Total Docs Tracked', value: formatNumber(totalDocs) },
    { label: 'Expiring Soon', value: formatNumber(expiringSoon) },
    { label: 'Expired', value: formatNumber(expired) },
    { label: 'Compliant', value: formatNumber(compliant) },
  ])
  report.addHeadersFromDefs(columns)

  for (const doc of documents) {
    report.addTypedRow(doc, columns)
  }

  report.autoFitColumns()
  report.freezePanes()
  report.setPageSetup()
  return report
}

// ============ 2. TYRE MANAGEMENT REPORT ============

export async function buildTyreReport(params: ReportParams): Promise<ExcelReport> {
  const where: Record<string, unknown> = {}
  if (params.truckId) where.truckId = params.truckId
  if (params.status) where.condition = params.status

  const tyres = await db.tyre.findMany({
    where,
    include: { truck: { select: { plateNumber: true, make: true } } },
    orderBy: { purchaseDate: 'desc' },
  })

  const totalTyres = tyres.length
  const totalValue = tyres.reduce((s, t) => s + t.purchasePrice, 0)
  const newCount = tyres.filter((t) => t.condition === 'new').length
  const goodCount = tyres.filter((t) => t.condition === 'good').length
  const fairCount = tyres.filter((t) => t.condition === 'fair').length
  const wornCount = tyres.filter((t) => t.condition === 'worn').length
  const damagedCount = tyres.filter((t) => t.condition === 'damaged').length
  const replacedCount = tyres.filter((t) => t.condition === 'replaced').length

  const columns: ColumnDef[] = [
    { key: 'serialNumber', header: 'Serial #', type: 'text' },
    { key: 'truck', header: 'Truck', type: 'text' },
    { key: 'brand', header: 'Brand', type: 'text' },
    { key: 'purchaseDate', header: 'Purchase Date', type: 'date' },
    { key: 'purchasePrice', header: 'Purchase Price (GHS)', type: 'currency' },
    { key: 'condition', header: 'Condition', type: 'text' },
    { key: 'lastInspection', header: 'Last Inspection', type: 'date' },
    { key: 'status', header: 'Status', type: 'text' },
  ]

  const report = new ExcelReport(`${APP_NAME} \u2014 Tyre Management Report`, buildSubtitle(params))
  report.addKPISection([
    { label: 'Total Tyres', value: formatNumber(totalTyres) },
    { label: 'New', value: formatNumber(newCount) },
    { label: 'Good', value: formatNumber(goodCount) },
    { label: 'Fair', value: formatNumber(fairCount) },
    { label: 'Worn', value: formatNumber(wornCount) },
    { label: 'Damaged', value: formatNumber(damagedCount) },
    { label: 'Replaced', value: formatNumber(replacedCount) },
    { label: 'Total Value', value: formatGHS(totalValue) },
  ])
  report.addHeadersFromDefs(columns)

  for (const tyre of tyres) {
    report.addTypedRow({
      serialNumber: tyre.serialNumber,
      truck: `${tyre.truck.plateNumber} (${tyre.truck.make})`,
      brand: tyre.brand,
      purchaseDate: tyre.purchaseDate,
      purchasePrice: tyre.purchasePrice,
      condition: tyre.condition.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase()),
      lastInspection: tyre.lastInspection ?? null,
      status: tyre.retiredDate ? 'Retired' : 'Active',
    }, columns)
  }

  report.addTypedSummaryRow('TOTAL', { purchasePrice: totalValue }, columns)
  report.autoFitColumns()
  report.freezePanes()
  report.setPageSetup()
  return report
}

// ============ 3. INSURANCE CLAIMS REPORT ============

export async function buildInsuranceClaimsReport(params: ReportParams): Promise<ExcelReport> {
  const where: Record<string, unknown> = {}
  if (params.status) where.status = params.status
  if (params.truckId) where.truckId = params.truckId

  const dateFilter: Record<string, unknown> = {}
  if (params.dateFrom) dateFilter.gte = new Date(params.dateFrom)
  if (params.dateTo) dateFilter.lte = new Date(params.dateTo)
  if (Object.keys(dateFilter).length > 0) where.incidentDate = dateFilter

  const claims = await db.insuranceClaim.findMany({
    where,
    include: {
      insurance: { select: { policyNumber: true, provider: true, type: true } },
      truck: { select: { plateNumber: true, make: true } },
    },
    orderBy: { incidentDate: 'desc' },
  })

  const totalClaims = claims.length
  const totalClaimed = claims.reduce((s, c) => s + c.claimAmount, 0)
  const totalApproved = claims.reduce((s, c) => s + (c.approvedAmount ?? 0), 0)
  const draftCount = claims.filter((c) => c.status === 'draft').length
  const submittedCount = claims.filter((c) => c.status === 'submitted').length
  const approvedCount = claims.filter((c) => c.status === 'approved').length
  const paidCount = claims.filter((c) => c.status === 'paid').length
  const closedCount = claims.filter((c) => c.status === 'closed').length

  const columns: ColumnDef[] = [
    { key: 'claimNumber', header: 'Claim #', type: 'text' },
    { key: 'policyNumber', header: 'Policy #', type: 'text' },
    { key: 'provider', header: 'Provider', type: 'text' },
    { key: 'truck', header: 'Truck', type: 'text' },
    { key: 'type', header: 'Type', type: 'text' },
    { key: 'incidentDate', header: 'Incident Date', type: 'date' },
    { key: 'location', header: 'Location', type: 'text' },
    { key: 'claimedAmount', header: 'Claimed Amount (GHS)', type: 'currency' },
    { key: 'approvedAmount', header: 'Approved Amount (GHS)', type: 'currency' },
    { key: 'status', header: 'Status', type: 'text' },
    { key: 'submittedDate', header: 'Submitted Date', type: 'date' },
  ]

  const report = new ExcelReport(`${APP_NAME} \u2014 Insurance Claims Report`, buildSubtitle(params))
  report.addKPISection([
    { label: 'Total Claims', value: formatNumber(totalClaims) },
    { label: 'Total Claimed', value: formatGHS(totalClaimed) },
    { label: 'Total Approved', value: formatGHS(totalApproved) },
    { label: 'Draft', value: formatNumber(draftCount) },
    { label: 'Submitted', value: formatNumber(submittedCount) },
    { label: 'Approved', value: formatNumber(approvedCount) },
    { label: 'Paid', value: formatNumber(paidCount) },
    { label: 'Closed', value: formatNumber(closedCount) },
  ])
  report.addHeadersFromDefs(columns)

  for (const claim of claims) {
    report.addTypedRow({
      claimNumber: claim.claimNumber,
      policyNumber: claim.insurance.policyNumber,
      provider: claim.insurance.provider,
      truck: `${claim.truck.plateNumber} (${claim.truck.make})`,
      type: claim.claimType.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase()),
      incidentDate: claim.incidentDate,
      location: claim.incidentLocation,
      claimedAmount: claim.claimAmount,
      approvedAmount: claim.approvedAmount ?? 0,
      status: claim.status.replace(/\b\w/g, (c) => c.toUpperCase()),
      submittedDate: claim.submittedAt ?? null,
    }, columns)
  }

  report.addTypedSummaryRow('TOTAL', { claimedAmount: totalClaimed, approvedAmount: totalApproved }, columns)
  report.autoFitColumns()
  report.freezePanes()
  report.setPageSetup()
  return report
}

// ============ 4. WAREHOUSE INVENTORY REPORT ============

export async function buildWarehouseReport(params: ReportParams): Promise<ExcelReport> {
  const where: Record<string, unknown> = {}
  if (params.status) where.status = params.status

  const items = await db.warehouseItem.findMany({
    where,
    orderBy: [{ category: 'asc' }, { name: 'asc' }],
  })

  const totalItems = items.length
  const inStock = items.filter((i) => i.status === 'in_stock').length
  const lowStock = items.filter((i) => i.status === 'low_stock').length
  const outOfStock = items.filter((i) => i.status === 'out_of_stock').length
  const totalValue = items.reduce((s, i) => s + i.quantity * i.unitPrice, 0)
  const categories = new Set(items.map((i) => i.category)).size

  const columns: ColumnDef[] = [
    { key: 'sku', header: 'SKU', type: 'text' },
    { key: 'name', header: 'Name', type: 'text' },
    { key: 'category', header: 'Category', type: 'text' },
    { key: 'quantity', header: 'Quantity', type: 'number' },
    { key: 'minStock', header: 'Min Stock', type: 'number' },
    { key: 'unitPrice', header: 'Unit Price (GHS)', type: 'currency' },
    { key: 'totalValue', header: 'Total Value (GHS)', type: 'currency' },
    { key: 'unit', header: 'Unit', type: 'text' },
    { key: 'warehouse', header: 'Warehouse', type: 'text' },
    { key: 'supplier', header: 'Supplier', type: 'text' },
    { key: 'status', header: 'Status', type: 'text' },
    { key: 'lastRestocked', header: 'Last Restocked', type: 'date' },
    { key: 'expiryDate', header: 'Expiry Date', type: 'date' },
  ]

  const report = new ExcelReport(`${APP_NAME} \u2014 Warehouse Inventory Report`, buildSubtitle(params))
  report.addKPISection([
    { label: 'Total Items', value: formatNumber(totalItems) },
    { label: 'In Stock', value: formatNumber(inStock) },
    { label: 'Low Stock', value: formatNumber(lowStock) },
    { label: 'Out of Stock', value: formatNumber(outOfStock) },
    { label: 'Total Value', value: formatGHS(totalValue) },
    { label: 'Categories', value: formatNumber(categories) },
  ])
  report.addHeadersFromDefs(columns)

  for (const item of items) {
    report.addTypedRow({
      sku: item.sku,
      name: item.name,
      category: item.category.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase()),
      quantity: item.quantity,
      minStock: item.minStock,
      unitPrice: item.unitPrice,
      totalValue: item.quantity * item.unitPrice,
      unit: item.unit,
      warehouse: item.warehouse,
      supplier: item.supplier ?? '-',
      status: item.status.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase()),
      lastRestocked: item.lastRestocked ?? null,
      expiryDate: item.expiryDate ?? null,
    }, columns)
  }

  report.addTypedSummaryRow('TOTAL', { quantity: items.reduce((s, i) => s + i.quantity, 0), totalValue }, columns)
  report.autoFitColumns()
  report.freezePanes()
  report.setPageSetup()
  return report
}

// ============ 5. DRIVER INCENTIVES REPORT ============

export async function buildDriverIncentivesReport(params: ReportParams): Promise<ExcelReport> {
  const where: Record<string, unknown> = {}
  if (params.driverId) where.driverId = params.driverId
  if (params.status) where.status = params.status

  const incentives = await db.driverIncentive.findMany({
    where,
    include: {
      driver: { select: { firstName: true, lastName: true, employeeId: true } },
      approver: { select: { name: true } },
      creator: { select: { name: true } },
    },
    orderBy: { createdAt: 'desc' },
  })

  const totalIncentives = incentives.length
  const totalValue = incentives.reduce((s, i) => s + i.amount, 0)
  const pendingCount = incentives.filter((i) => i.status === 'pending').length
  const approvedCount = incentives.filter((i) => i.status === 'approved').length
  const paidCount = incentives.filter((i) => i.status === 'paid').length
  const avgValue = totalIncentives > 0 ? totalValue / totalIncentives : 0

  const columns: ColumnDef[] = [
    { key: 'driver', header: 'Driver', type: 'text' },
    { key: 'type', header: 'Type', type: 'text' },
    { key: 'title', header: 'Title', type: 'text' },
    { key: 'period', header: 'Period', type: 'text' },
    { key: 'amount', header: 'Amount (GHS)', type: 'currency' },
    { key: 'status', header: 'Status', type: 'text' },
    { key: 'approvedBy', header: 'Approved By', type: 'text' },
    { key: 'approvedDate', header: 'Approved Date', type: 'date' },
    { key: 'paidDate', header: 'Paid Date', type: 'date' },
    { key: 'metric', header: 'Metric', type: 'text' },
  ]

  const report = new ExcelReport(`${APP_NAME} \u2014 Driver Incentives Report`, buildSubtitle(params))
  report.addKPISection([
    { label: 'Total Incentives', value: formatNumber(totalIncentives) },
    { label: 'Total Value', value: formatGHS(totalValue) },
    { label: 'Pending', value: formatNumber(pendingCount) },
    { label: 'Approved', value: formatNumber(approvedCount) },
    { label: 'Paid', value: formatNumber(paidCount) },
    { label: 'Average', value: formatGHS(avgValue) },
  ])
  report.addHeadersFromDefs(columns)

  for (const inc of incentives) {
    report.addTypedRow({
      driver: `${inc.driver.firstName} ${inc.driver.lastName}`,
      type: inc.type.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase()),
      title: inc.title,
      period: inc.period,
      amount: inc.amount,
      status: inc.status.replace(/\b\w/g, (c) => c.toUpperCase()),
      approvedBy: inc.approver?.name ?? '-',
      approvedDate: inc.approvedAt ?? null,
      paidDate: inc.paidAt ?? null,
      metric: inc.metrics ?? '-',
    }, columns)
  }

  report.addTypedSummaryRow('TOTAL', { amount: totalValue }, columns)
  report.autoFitColumns()
  report.freezePanes()
  report.setPageSetup()
  return report
}

// ============ 6. TOLL & CHECKPOINT REPORT ============

export async function buildTollReport(params: ReportParams): Promise<ExcelReport> {
  const where: Record<string, unknown> = {}
  if (params.truckId) where.truckId = params.truckId
  if (params.driverId) where.driverId = params.driverId

  const dateFilter: Record<string, unknown> = {}
  if (params.dateFrom) dateFilter.gte = new Date(params.dateFrom)
  if (params.dateTo) dateFilter.lte = new Date(params.dateTo)
  if (Object.keys(dateFilter).length > 0) where.tollDate = dateFilter

  const tolls = await db.tollRecord.findMany({
    where,
    include: {
      truck: { select: { plateNumber: true, make: true } },
      driver: { select: { firstName: true, lastName: true } },
      trip: { select: { tripNumber: true } },
    },
    orderBy: { tollDate: 'desc' },
  })

  const totalRecords = tolls.length
  const totalAmount = tolls.reduce((s, t) => s + t.amount, 0)
  const overloadedCount = tolls.filter((t) => t.overloaded).length
  const totalFines = tolls.reduce((s, t) => s + (t.overloadFine ?? 0), 0)
  const routes = new Set(tolls.map((t) => t.route).filter(Boolean)).size
  const tollPoints = new Set(tolls.map((t) => t.tollPoint)).size

  const columns: ColumnDef[] = [
    { key: 'date', header: 'Date', type: 'date' },
    { key: 'truck', header: 'Truck', type: 'text' },
    { key: 'driver', header: 'Driver', type: 'text' },
    { key: 'tripNumber', header: 'Trip #', type: 'text' },
    { key: 'tollPoint', header: 'Toll Point', type: 'text' },
    { key: 'tollType', header: 'Type', type: 'text' },
    { key: 'route', header: 'Route', type: 'text' },
    { key: 'amount', header: 'Amount (GHS)', type: 'currency' },
    { key: 'payment', header: 'Payment', type: 'text' },
    { key: 'direction', header: 'Direction', type: 'text' },
    { key: 'overloaded', header: 'Overloaded', type: 'text' },
    { key: 'status', header: 'Status', type: 'text' },
  ]

  const report = new ExcelReport(`${APP_NAME} \u2014 Toll & Checkpoint Report`, buildSubtitle(params))
  report.addKPISection([
    { label: 'Total Records', value: formatNumber(totalRecords) },
    { label: 'Total Amount', value: formatGHS(totalAmount) },
    { label: 'Overloaded', value: formatNumber(overloadedCount) },
    { label: 'Fines', value: formatGHS(totalFines) },
    { label: 'Routes', value: formatNumber(routes) },
    { label: 'Toll Points', value: formatNumber(tollPoints) },
  ])
  report.addHeadersFromDefs(columns)

  for (const toll of tolls) {
    report.addTypedRow({
      date: toll.tollDate,
      truck: `${toll.truck.plateNumber} (${toll.truck.make})`,
      driver: toll.driver ? `${toll.driver.firstName} ${toll.driver.lastName}` : '-',
      tripNumber: toll.trip?.tripNumber ?? '-',
      tollPoint: toll.tollPoint,
      tollType: toll.tollType.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase()),
      route: toll.route ?? '-',
      amount: toll.amount,
      payment: toll.paymentMethod.replace(/_/g, ' '),
      direction: toll.direction ?? '-',
      overloaded: toll.overloaded ? 'Yes' : 'No',
      status: toll.status.replace(/\b\w/g, (c) => c.toUpperCase()),
    }, columns)
  }

  report.addTypedSummaryRow('TOTAL', { amount: totalAmount }, columns)
  report.autoFitColumns()
  report.freezePanes()
  report.setPageSetup()
  return report
}

// ============ 7. VEHICLE INSPECTION & SAFETY REPORT ============

export async function buildSafetyReport(params: ReportParams): Promise<ExcelReport> {
  const where: Record<string, unknown> = {}
  if (params.truckId) where.truckId = params.truckId
  if (params.driverId) where.driverId = params.driverId

  const dateFilter: Record<string, unknown> = {}
  if (params.dateFrom) dateFilter.gte = new Date(params.dateFrom)
  if (params.dateTo) dateFilter.lte = new Date(params.dateTo)
  if (Object.keys(dateFilter).length > 0) where.inspectionDate = dateFilter

  const inspections = await db.vehicleInspection.findMany({
    where,
    include: {
      truck: { select: { plateNumber: true, make: true } },
      driver: { select: { firstName: true, lastName: true } },
    },
    orderBy: { inspectionDate: 'desc' },
  })

  const totalInspections = inspections.length
  const passed = inspections.filter((i) => i.result === 'pass').length
  const conditional = inspections.filter((i) => i.result === 'conditional_pass').length
  const failed = inspections.filter((i) => i.result === 'fail').length
  const defectCount = inspections.filter((i) => i.defectsFound).length
  const followUpCount = inspections.filter((i) => i.requiresFollowUp).length

  const columns: ColumnDef[] = [
    { key: 'date', header: 'Date', type: 'date' },
    { key: 'truck', header: 'Truck', type: 'text' },
    { key: 'driver', header: 'Driver', type: 'text' },
    { key: 'type', header: 'Type', type: 'text' },
    { key: 'odometer', header: 'Odometer (km)', type: 'number' },
    { key: 'totalChecks', header: 'Total Checks', type: 'number' },
    { key: 'passCount', header: 'Pass', type: 'number' },
    { key: 'warningCount', header: 'Warning', type: 'number' },
    { key: 'failCount', header: 'Fail', type: 'number' },
    { key: 'result', header: 'Result', type: 'text' },
    { key: 'defectsFound', header: 'Defects Found', type: 'text' },
    { key: 'inspector', header: 'Inspector', type: 'text' },
  ]

  const report = new ExcelReport(`${APP_NAME} \u2014 Vehicle Inspection & Safety Report`, buildSubtitle(params))
  report.addKPISection([
    { label: 'Total Inspections', value: formatNumber(totalInspections) },
    { label: 'Passed', value: formatNumber(passed) },
    { label: 'Conditional', value: formatNumber(conditional) },
    { label: 'Failed', value: formatNumber(failed) },
    { label: 'Defects Found', value: formatNumber(defectCount) },
    { label: 'Follow-ups', value: formatNumber(followUpCount) },
  ])
  report.addHeadersFromDefs(columns)

  for (const insp of inspections) {
    report.addTypedRow({
      date: insp.inspectionDate,
      truck: `${insp.truck.plateNumber} (${insp.truck.make})`,
      driver: insp.driver ? `${insp.driver.firstName} ${insp.driver.lastName}` : '-',
      type: insp.type.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase()),
      odometer: insp.odometerReading ?? 0,
      totalChecks: insp.totalChecks,
      passCount: insp.passCount,
      warningCount: insp.warningCount,
      failCount: insp.failCount,
      result: insp.result === 'pass' ? 'Pass' : insp.result === 'fail' ? 'Fail' : 'Conditional Pass',
      defectsFound: insp.defectsFound ? 'Yes' : 'No',
      inspector: insp.inspectorName ?? '-',
    }, columns)
  }

  report.addTypedSummaryRow('TOTAL', { totalChecks: inspections.reduce((s, i) => s + i.totalChecks, 0), passCount: passed, warningCount: inspections.reduce((s, i) => s + i.warningCount, 0), failCount: failed }, columns)
  report.autoFitColumns()
  report.freezePanes()
  report.setPageSetup()
  return report
}

// ============ 8. CASH ADVANCES REPORT ============

export async function buildCashAdvancesReport(params: ReportParams): Promise<ExcelReport> {
  const where: Record<string, unknown> = {}
  if (params.driverId) where.driverId = params.driverId
  if (params.status) where.status = params.status

  const dateFilter: Record<string, unknown> = {}
  if (params.dateFrom) dateFilter.gte = new Date(params.dateFrom)
  if (params.dateTo) dateFilter.lte = new Date(params.dateTo)
  if (Object.keys(dateFilter).length > 0) where.requestDate = dateFilter

  const advances = await db.cashAdvance.findMany({
    where,
    include: {
      driver: { select: { firstName: true, lastName: true, employeeId: true } },
      trip: { select: { tripNumber: true } },
    },
    orderBy: { requestDate: 'desc' },
  })

  const totalAdvances = advances.length
  const totalAmount = advances.reduce((s, a) => s + a.amount, 0)
  const disbursedCount = advances.filter((a) => ['disbursed', 'partially_deducted', 'fully_deducted'].includes(a.status)).length
  const totalDeducted = advances.reduce((s, a) => s + a.totalDeducted, 0)
  const outstandingBalance = advances.reduce((s, a) => s + a.remainingBalance, 0)

  const columns: ColumnDef[] = [
    { key: 'requestDate', header: 'Request Date', type: 'date' },
    { key: 'driver', header: 'Driver', type: 'text' },
    { key: 'employeeId', header: 'Employee ID', type: 'text' },
    { key: 'tripNumber', header: 'Trip #', type: 'text' },
    { key: 'purpose', header: 'Purpose', type: 'text' },
    { key: 'amount', header: 'Amount (GHS)', type: 'currency' },
    { key: 'paymentMethod', header: 'Payment Method', type: 'text' },
    { key: 'status', header: 'Status', type: 'text' },
    { key: 'approvedBy', header: 'Approved By', type: 'text' },
    { key: 'approvedAt', header: 'Approved At', type: 'datetime' },
    { key: 'disbursedAt', header: 'Disbursed At', type: 'datetime' },
    { key: 'totalDeducted', header: 'Total Deducted (GHS)', type: 'currency' },
    { key: 'remaining', header: 'Remaining (GHS)', type: 'currency' },
  ]

  const report = new ExcelReport(`${APP_NAME} \u2014 Cash Advances Report`, buildSubtitle(params))
  report.addKPISection([
    { label: 'Total Advances', value: formatNumber(totalAdvances) },
    { label: 'Total Amount', value: formatGHS(totalAmount) },
    { label: 'Disbursed', value: formatNumber(disbursedCount) },
    { label: 'Total Deducted', value: formatGHS(totalDeducted) },
    { label: 'Outstanding Balance', value: formatGHS(outstandingBalance) },
  ])
  report.addHeadersFromDefs(columns)

  for (const adv of advances) {
    report.addTypedRow({
      requestDate: adv.requestDate,
      driver: `${adv.driver.firstName} ${adv.driver.lastName}`,
      employeeId: adv.driver.employeeId,
      tripNumber: adv.trip?.tripNumber ?? '-',
      purpose: adv.purpose.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase()),
      amount: adv.amount,
      paymentMethod: adv.paymentMethod.replace(/_/g, ' '),
      status: adv.status.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase()),
      approvedBy: adv.approvedBy ?? '-',
      approvedAt: adv.approvedAt ?? null,
      disbursedAt: adv.disbursedAt ?? null,
      totalDeducted: adv.totalDeducted,
      remaining: adv.remainingBalance,
    }, columns)
  }

  report.addTypedSummaryRow('TOTAL', { amount: totalAmount, totalDeducted: totalDeducted, remaining: outstandingBalance }, columns)
  report.autoFitColumns()
  report.freezePanes()
  report.setPageSetup()
  return report
}

// ============ 9. DAILY OPERATIONS SUMMARY ============

export async function buildDailySummaryReport(params: ReportParams): Promise<ExcelReport> {
  const today = params.dateFrom ? new Date(params.dateFrom) : new Date()
  const startOfDay = new Date(today.getFullYear(), today.getMonth(), today.getDate())
  const endOfDay = new Date(today.getFullYear(), today.getMonth(), today.getDate(), 23, 59, 59, 999)

  const activeTrucks = await db.truck.count({ where: { status: 'active' } })
  const activeTrips = await db.trip.count({ where: { status: { in: ['loading', 'loaded', 'in_transit', 'offloading', 'waiting_to_offload', 'arrived_destination'] } } })

  const todayTrips = await db.trip.findMany({
    where: { departureTime: { gte: startOfDay, lte: endOfDay } },
    include: {
      driver: { select: { firstName: true, lastName: true } },
      truck: { select: { plateNumber: true, make: true } },
      client: { select: { companyName: true } },
    },
    orderBy: { departureTime: 'desc' },
  })

  const todayExpenses = await db.expense.findMany({
    where: { date: { gte: startOfDay, lte: endOfDay } },
    include: { truck: { select: { plateNumber: true } } },
    orderBy: { date: 'desc' },
  })

  const todayFuel = await db.fuelLog.findMany({
    where: { date: { gte: startOfDay, lte: endOfDay } },
    include: { truck: { select: { plateNumber: true } } },
    orderBy: { date: 'desc' },
  })

  const todayRevenue = todayTrips.reduce((s, t) => s + (t.totalRevenue ?? 0), 0)
  const todayExpensesTotal = todayExpenses.reduce((s, e) => s + e.amount, 0)
  const todayFuelCost = todayFuel.reduce((s, f) => s + f.totalCost, 0)
  const todayFuelLiters = todayFuel.reduce((s, f) => s + f.litersFilled, 0)
  const avgCostPerLiter = todayFuelLiters > 0 ? todayFuelCost / todayFuelLiters : 0

  const subtitle = `Report Date: ${fmtDate(today)} | Generated: ${fmtDateTime(new Date())}`

  // --- Section 1: KPIs ---
  const report = new ExcelReport(`${APP_NAME} \u2014 Daily Operations Summary`, subtitle)
  report.addKPISection([
    { label: 'Active Trucks', value: formatNumber(activeTrucks) },
    { label: 'Active Trips', value: formatNumber(activeTrips) },
    { label: "Today's Revenue", value: formatGHS(todayRevenue) },
    { label: "Today's Expenses", value: formatGHS(todayExpensesTotal) },
    { label: 'Fuel Cost', value: formatGHS(todayFuelCost) },
    { label: 'Avg Cost/Liter', value: formatGHS(avgCostPerLiter) },
  ])

  // --- Section 2: Trip List ---
  report.addSectionTitle('Today\'s Trips')
  const tripColumns: ColumnDef[] = [
    { key: 'tripNumber', header: 'Trip #', type: 'text' },
    { key: 'date', header: 'Departure', type: 'datetime' },
    { key: 'driver', header: 'Driver', type: 'text' },
    { key: 'truck', header: 'Truck', type: 'text' },
    { key: 'route', header: 'Route', type: 'text' },
    { key: 'client', header: 'Client', type: 'text' },
    { key: 'revenue', header: 'Revenue (GHS)', type: 'currency' },
    { key: 'status', header: 'Status', type: 'text' },
  ]
  report.addHeadersFromDefs(tripColumns)

  for (const trip of todayTrips) {
    report.addTypedRow({
      tripNumber: trip.tripNumber,
      date: trip.departureTime,
      driver: `${trip.driver.firstName} ${trip.driver.lastName}`,
      truck: `${trip.truck.plateNumber} (${trip.truck.make})`,
      route: `${trip.loadingLocation} \u2192 ${trip.destination}`,
      client: trip.client?.companyName ?? trip.customerName ?? '-',
      revenue: trip.totalRevenue ?? 0,
      status: trip.status.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase()),
    }, tripColumns)
  }
  report.addTypedSummaryRow('TRIPS TOTAL', { revenue: todayRevenue }, tripColumns)

  // --- Section 3: Expense List ---
  report.addSectionTitle('Today\'s Expenses')
  const expenseColumns: ColumnDef[] = [
    { key: 'date', header: 'Date', type: 'date' },
    { key: 'truck', header: 'Truck', type: 'text' },
    { key: 'category', header: 'Category', type: 'text' },
    { key: 'description', header: 'Description', type: 'text' },
    { key: 'amount', header: 'Amount (GHS)', type: 'currency' },
    { key: 'status', header: 'Status', type: 'text' },
  ]
  report.addHeadersFromDefs(expenseColumns)

  for (const exp of todayExpenses) {
    report.addTypedRow({
      date: exp.date,
      truck: exp.truck.plateNumber,
      category: exp.category.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase()),
      description: exp.description,
      amount: exp.amount,
      status: exp.status.replace(/\b\w/g, (c) => c.toUpperCase()),
    }, expenseColumns)
  }
  report.addTypedSummaryRow('EXPENSES TOTAL', { amount: todayExpensesTotal }, expenseColumns)

  // --- Section 4: Fuel Log ---
  report.addSectionTitle('Today\'s Fuel Log')
  const fuelColumns: ColumnDef[] = [
    { key: 'date', header: 'Date', type: 'datetime' },
    { key: 'truck', header: 'Truck', type: 'text' },
    { key: 'station', header: 'Station', type: 'text' },
    { key: 'liters', header: 'Liters', type: 'number' },
    { key: 'costPerLiter', header: 'Cost/Liter (GHS)', type: 'currency' },
    { key: 'totalCost', header: 'Total Cost (GHS)', type: 'currency' },
  ]
  report.addHeadersFromDefs(fuelColumns)

  for (const log of todayFuel) {
    report.addTypedRow({
      date: log.date,
      truck: log.truck.plateNumber,
      station: log.stationName ?? '-',
      liters: log.litersFilled,
      costPerLiter: log.costPerLiter ?? 0,
      totalCost: log.totalCost,
    }, fuelColumns)
  }
  report.addTypedSummaryRow('FUEL TOTAL', { liters: todayFuelLiters, totalCost: todayFuelCost }, fuelColumns)

  report.autoFitColumns()
  report.freezePanes()
  report.setPageSetup()
  return report
}

// ============ 10. BORDER CROSSINGS REPORT ============

export async function buildBorderCrossingsReport(params: ReportParams): Promise<ExcelReport> {
  const where: Record<string, unknown> = {}
  if (params.truckId) where.truckId = params.truckId
  if (params.driverId) where.driverId = params.driverId
  if (params.status) where.status = params.status

  const dateFilter: Record<string, unknown> = {}
  if (params.dateFrom) dateFilter.gte = new Date(params.dateFrom)
  if (params.dateTo) dateFilter.lte = new Date(params.dateTo)
  if (Object.keys(dateFilter).length > 0) where.queuedAt = dateFilter

  const crossings = await db.borderCrossing.findMany({
    where,
    include: {
      truck: { select: { plateNumber: true, make: true } },
      driver: { select: { firstName: true, lastName: true } },
      trip: { select: { tripNumber: true } },
    },
    orderBy: { queuedAt: 'desc' },
  })

  const totalCrossings = crossings.length
  const queued = crossings.filter((c) => c.status === 'queued').length
  const processing = crossings.filter((c) => c.status === 'processing').length
  const cleared = crossings.filter((c) => c.status === 'cleared').length
  const completedCrossings = crossings.filter((c) => c.actualWait != null)
  const avgWait = completedCrossings.length > 0
    ? completedCrossings.reduce((s, c) => s + (c.actualWait ?? 0), 0) / completedCrossings.length
    : 0
  const totalFees = crossings.reduce((s, c) => s + (c.clearanceFee ?? 0), 0)

  const columns: ColumnDef[] = [
    { key: 'truck', header: 'Truck', type: 'text' },
    { key: 'driver', header: 'Driver', type: 'text' },
    { key: 'tripNumber', header: 'Trip #', type: 'text' },
    { key: 'border', header: 'Border', type: 'text' },
    { key: 'country', header: 'Country', type: 'text' },
    { key: 'direction', header: 'Direction', type: 'text' },
    { key: 'status', header: 'Status', type: 'text' },
    { key: 'queuedAt', header: 'Queued At', type: 'datetime' },
    { key: 'clearedAt', header: 'Cleared At', type: 'datetime' },
    { key: 'waitMinutes', header: 'Wait (min)', type: 'number' },
    { key: 'fee', header: 'Fee (GHS)', type: 'currency' },
    { key: 'docStatus', header: 'Doc Status', type: 'text' },
  ]

  const report = new ExcelReport(`${APP_NAME} \u2014 Border Crossings Report`, buildSubtitle(params))
  report.addKPISection([
    { label: 'Total Crossings', value: formatNumber(totalCrossings) },
    { label: 'Queued', value: formatNumber(queued) },
    { label: 'Processing', value: formatNumber(processing) },
    { label: 'Cleared', value: formatNumber(cleared) },
    { label: 'Avg Wait', value: `${avgWait.toFixed(0)} min` },
    { label: 'Total Fees', value: formatGHS(totalFees) },
  ])
  report.addHeadersFromDefs(columns)

  for (const c of crossings) {
    report.addTypedRow({
      truck: `${c.truck.plateNumber} (${c.truck.make})`,
      driver: `${c.driver.firstName} ${c.driver.lastName}`,
      tripNumber: c.trip?.tripNumber ?? '-',
      border: c.borderName,
      country: c.country,
      direction: c.direction.replace(/\b\w/g, (ch) => ch.toUpperCase()),
      status: c.status.replace(/\b\w/g, (ch) => ch.toUpperCase()),
      queuedAt: c.queuedAt,
      clearedAt: c.clearedAt ?? null,
      waitMinutes: c.actualWait ?? 0,
      fee: c.clearanceFee ?? 0,
      docStatus: c.documentStatus ?? '-',
    }, columns)
  }

  report.addTypedSummaryRow('TOTAL', { fee: totalFees, waitMinutes: Math.round(avgWait) }, columns)
  report.autoFitColumns()
  report.freezePanes()
  report.setPageSetup()
  return report
}

// ============ 11. DEPOT QUEUE REPORT ============

export async function buildDepotQueueReport(params: ReportParams): Promise<ExcelReport> {
  const where: Record<string, unknown> = {}
  if (params.truckId) where.truckId = params.truckId
  if (params.status) where.status = params.status

  const dateFilter: Record<string, unknown> = {}
  if (params.dateFrom) dateFilter.gte = new Date(params.dateFrom)
  if (params.dateTo) dateFilter.lte = new Date(params.dateTo)
  if (Object.keys(dateFilter).length > 0) where.joinedAt = dateFilter

  const queues = await db.depotQueue.findMany({
    where,
    include: {
      truck: { select: { plateNumber: true, make: true } },
      driver: { select: { firstName: true, lastName: true } },
      trip: { select: { tripNumber: true } },
    },
    orderBy: { joinedAt: 'desc' },
  })

  const totalInQueue = queues.length
  const waiting = queues.filter((q) => q.status === 'waiting').length
  const processing = queues.filter((q) => q.status === 'processing').length
  const completed = queues.filter((q) => q.status === 'completed').length
  const completedQueues = queues.filter((q) => q.actualWait != null)
  const avgWait = completedQueues.length > 0
    ? completedQueues.reduce((s, q) => s + (q.actualWait ?? 0), 0) / completedQueues.length
    : 0
  const longestWait = completedQueues.length > 0
    ? Math.max(...completedQueues.map((q) => q.actualWait ?? 0))
    : 0

  const columns: ColumnDef[] = [
    { key: 'truck', header: 'Truck', type: 'text' },
    { key: 'driver', header: 'Driver', type: 'text' },
    { key: 'tripNumber', header: 'Trip #', type: 'text' },
    { key: 'depot', header: 'Depot', type: 'text' },
    { key: 'queueType', header: 'Queue Type', type: 'text' },
    { key: 'position', header: 'Position', type: 'number' },
    { key: 'status', header: 'Status', type: 'text' },
    { key: 'joinedAt', header: 'Joined At', type: 'datetime' },
    { key: 'startedAt', header: 'Started At', type: 'datetime' },
    { key: 'completedAt', header: 'Completed At', type: 'datetime' },
    { key: 'waitMinutes', header: 'Wait (min)', type: 'number' },
    { key: 'estWait', header: 'Est Wait (min)', type: 'number' },
  ]

  const report = new ExcelReport(`${APP_NAME} \u2014 Depot Queue Report`, buildSubtitle(params))
  report.addKPISection([
    { label: 'Total in Queue', value: formatNumber(totalInQueue) },
    { label: 'Waiting', value: formatNumber(waiting) },
    { label: 'Processing', value: formatNumber(processing) },
    { label: 'Completed', value: formatNumber(completed) },
    { label: 'Avg Wait', value: `${avgWait.toFixed(0)} min` },
    { label: 'Longest Wait', value: `${longestWait} min` },
  ])
  report.addHeadersFromDefs(columns)

  for (const q of queues) {
    report.addTypedRow({
      truck: `${q.truck.plateNumber} (${q.truck.make})`,
      driver: q.driver ? `${q.driver.firstName} ${q.driver.lastName}` : '-',
      tripNumber: q.trip?.tripNumber ?? '-',
      depot: q.depotName,
      queueType: q.queueType.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase()),
      position: q.position ?? 0,
      status: q.status.replace(/\b\w/g, (c) => c.toUpperCase()),
      joinedAt: q.joinedAt,
      startedAt: q.startedAt ?? null,
      completedAt: q.completedAt ?? null,
      waitMinutes: q.actualWait ?? 0,
      estWait: q.estimatedWait ?? 0,
    }, columns)
  }

  report.addTypedSummaryRow('TOTAL', { waitMinutes: Math.round(avgWait) }, columns)
  report.autoFitColumns()
  report.freezePanes()
  report.setPageSetup()
  return report
}

// ============ 12. LOAD BOARD / FREIGHT MATCHING REPORT ============

export async function buildLoadBoardReport(params: ReportParams): Promise<ExcelReport> {
  const where: Record<string, unknown> = {}
  if (params.status) where.status = params.status
  if (params.clientId) where.clientId = params.clientId

  const dateFilter: Record<string, unknown> = {}
  if (params.dateFrom) dateFilter.gte = new Date(params.dateFrom)
  if (params.dateTo) dateFilter.lte = new Date(params.dateTo)
  if (Object.keys(dateFilter).length > 0) where.createdAt = dateFilter

  const loads = await db.loadBoard.findMany({
    where,
    include: {
      client: { select: { companyName: true } },
      assignedTruck: { select: { plateNumber: true } },
      assignedDriver: { select: { firstName: true, lastName: true } },
    },
    orderBy: { createdAt: 'desc' },
  })

  const totalPosts = loads.length
  const open = loads.filter((l) => l.status === 'open').length
  const assigned = loads.filter((l) => l.status === 'assigned').length
  const completedLoads = loads.filter((l) => l.status === 'completed').length
  const loadsWithRate = loads.filter((l) => l.offeredRate != null)
  const avgRate = loadsWithRate.length > 0
    ? loadsWithRate.reduce((s, l) => s + (l.offeredRate ?? 0), 0) / loadsWithRate.length
    : 0
  const totalValue = loads.reduce((s, l) => s + (l.offeredRate ?? 0), 0)

  const columns: ColumnDef[] = [
    { key: 'date', header: 'Date', type: 'date' },
    { key: 'client', header: 'Client', type: 'text' },
    { key: 'pickup', header: 'Pickup', type: 'text' },
    { key: 'dropoff', header: 'Dropoff', type: 'text' },
    { key: 'commodity', header: 'Commodity', type: 'text' },
    { key: 'weight', header: 'Weight', type: 'number' },
    { key: 'truckType', header: 'Truck Type', type: 'text' },
    { key: 'rate', header: 'Rate (GHS)', type: 'currency' },
    { key: 'budget', header: 'Budget (GHS)', type: 'currency' },
    { key: 'status', header: 'Status', type: 'text' },
    { key: 'assignedTruck', header: 'Assigned Truck', type: 'text' },
    { key: 'assignedDriver', header: 'Assigned Driver', type: 'text' },
    { key: 'contact', header: 'Contact', type: 'text' },
  ]

  const report = new ExcelReport(`${APP_NAME} \u2014 Load Board / Freight Matching Report`, buildSubtitle(params))
  report.addKPISection([
    { label: 'Total Posts', value: formatNumber(totalPosts) },
    { label: 'Open', value: formatNumber(open) },
    { label: 'Assigned', value: formatNumber(assigned) },
    { label: 'Completed', value: formatNumber(completedLoads) },
    { label: 'Avg Rate', value: formatGHS(avgRate) },
    { label: 'Total Value', value: formatGHS(totalValue) },
  ])
  report.addHeadersFromDefs(columns)

  for (const load of loads) {
    const budget = load.budgetMax ?? load.budgetMin ?? 0
    report.addTypedRow({
      date: load.createdAt,
      client: load.client?.companyName ?? '-',
      pickup: load.pickupLocation,
      dropoff: load.dropoffLocation,
      commodity: load.commodityType,
      weight: load.weight ?? 0,
      truckType: load.truckType ?? '-',
      rate: load.offeredRate ?? 0,
      budget,
      status: load.status.replace(/\b\w/g, (c) => c.toUpperCase()),
      assignedTruck: load.assignedTruck?.plateNumber ?? '-',
      assignedDriver: load.assignedDriver ? `${load.assignedDriver.firstName} ${load.assignedDriver.lastName}` : '-',
      contact: load.contactName ?? '-',
    }, columns)
  }

  report.addTypedSummaryRow('TOTAL', { rate: totalValue, budget: loads.reduce((s, l) => s + (l.budgetMax ?? l.budgetMin ?? 0), 0) }, columns)
  report.autoFitColumns()
  report.freezePanes()
  report.setPageSetup()
  return report
}

// ============ 13. FUEL ANOMALY DETECTION REPORT ============

export async function buildFuelAnomalyReport(params: ReportParams): Promise<ExcelReport> {
  const where: Record<string, unknown> = {}
  if (params.truckId) where.truckId = params.truckId

  const dateFilter: Record<string, unknown> = {}
  if (params.dateFrom) dateFilter.gte = new Date(params.dateFrom)
  if (params.dateTo) dateFilter.lte = new Date(params.dateTo)
  if (Object.keys(dateFilter).length > 0) where.date = dateFilter

  const fuelLogs = await db.fuelLog.findMany({
    where,
    include: {
      truck: { select: { plateNumber: true, make: true } },
      trip: { select: { tripNumber: true } },
    },
    orderBy: { date: 'desc' },
  })

  // Calculate fleet-wide averages for anomaly detection
  const totalLiters = fuelLogs.reduce((s, f) => s + f.litersFilled, 0)
  const totalCost = fuelLogs.reduce((s, f) => s + f.totalCost, 0)
  const totalOdometerDelta = fuelLogs.reduce((s, f) => s + (f.odometer ?? 0), 0)

  // Calculate per-fill metrics
  const avgCostPerLiter = totalLiters > 0 ? totalCost / totalLiters : 0
  const recordsWithOdometer = fuelLogs.filter((f) => f.odometer != null && f.odometer > 0)

  // Calculate fleet-wide average consumption (liters/100km)
  let avgConsumptionRate = 35 // default fallback: 35 L/100km
  const consumptionRates: number[] = []
  for (let i = 1; i < recordsWithOdometer.length; i++) {
    const prev = recordsWithOdometer[i - 1]
    const curr = recordsWithOdometer[i]
    const odometerDelta = (curr.odometer ?? 0) - (prev.odometer ?? 0)
    if (odometerDelta > 0 && curr.litersFilled > 0) {
      consumptionRates.push((curr.litersFilled / odometerDelta) * 100)
    }
  }
  if (consumptionRates.length > 0) {
    avgConsumptionRate = consumptionRates.reduce((s, r) => s + r, 0) / consumptionRates.length
  }

  // Anomaly thresholds: >50% above average consumption
  const anomalyThreshold = avgConsumptionRate * 1.5
  const warningThreshold = avgConsumptionRate * 1.25

  const reportData: Record<string, unknown>[] = []
  let anomalyCount = 0
  let warningCount = 0
  let totalExcessCost = 0

  for (const log of fuelLogs) {
    const costPerLiter = log.costPerLiter ?? (log.litersFilled > 0 ? log.totalCost / log.litersFilled : 0)
    const litersPer100km = log.odometer && log.odometer > 0 ? (log.litersFilled / log.odometer) * 100 : 0
    const costPerKm = log.odometer && log.odometer > 0 ? log.totalCost / log.odometer : 0

    // Determine status
    let status = 'Normal'
    if (litersPer100km > anomalyThreshold) {
      status = 'Anomaly'
      anomalyCount++
      const excessLiters = litersPer100km - avgConsumptionRate
      const excessKm = log.odometer ?? 1
      totalExcessCost += (excessLiters / 100) * excessKm * costPerLiter
    } else if (litersPer100km > warningThreshold) {
      status = 'Warning'
      warningCount++
    }

    reportData.push({
      date: log.date,
      truck: `${log.truck.plateNumber} (${log.truck.make})`,
      tripNumber: log.trip?.tripNumber ?? '-',
      odometer: log.odometer ?? 0,
      liters: log.litersFilled,
      cost: log.totalCost,
      costPerLiter,
      litersPer100km: Math.round(litersPer100km * 10) / 10,
      costPerKm: Math.round(costPerKm * 100) / 100,
      station: log.stationName ?? '-',
      status,
    })
  }

  const avgCostPerKm = fuelLogs.reduce((s, f) => s + (f.odometer && f.odometer > 0 ? f.totalCost / f.odometer : 0), 0) / (fuelLogs.filter((f) => f.odometer && f.odometer > 0).length || 1)

  const columns: ColumnDef[] = [
    { key: 'date', header: 'Date', type: 'date' },
    { key: 'truck', header: 'Truck', type: 'text' },
    { key: 'tripNumber', header: 'Trip #', type: 'text' },
    { key: 'odometer', header: 'Odometer', type: 'number' },
    { key: 'liters', header: 'Liters', type: 'number' },
    { key: 'cost', header: 'Cost (GHS)', type: 'currency' },
    { key: 'costPerLiter', header: 'Cost/Liter (GHS)', type: 'currency' },
    { key: 'litersPer100km', header: 'Liters/100km', type: 'number' },
    { key: 'costPerKm', header: 'Cost/km (GHS)', type: 'currency' },
    { key: 'station', header: 'Station', type: 'text' },
    { key: 'status', header: 'Status', type: 'text' },
  ]

  const report = new ExcelReport(`${APP_NAME} \u2014 Fuel Anomaly Detection Report`, buildSubtitle(params))
  report.addKPISection([
    { label: 'Total Records', value: formatNumber(fuelLogs.length) },
    { label: 'Anomalies', value: formatNumber(anomalyCount) },
    { label: 'Over-consumption Incidents', value: formatNumber(anomalyCount) },
    { label: 'Total Excess Cost', value: formatGHS(totalExcessCost) },
    { label: 'Avg Cost/km', value: formatGHS(avgCostPerKm) },
    { label: 'Fleet Avg L/100km', value: `${avgConsumptionRate.toFixed(1)}` },
  ])
  report.addHeadersFromDefs(columns)

  for (const data of reportData) {
    report.addTypedRow(data, columns)
  }

  report.addTypedSummaryRow('TOTAL', {
    liters: totalLiters,
    cost: totalCost,
    litersPer100km: Math.round(avgConsumptionRate * 10) / 10,
  }, columns)
  report.autoFitColumns()
  report.freezePanes()
  report.setPageSetup()
  return report
}

// ============ 14. COST ANALYTICS REPORT ============

export async function buildCostAnalyticsReport(params: ReportParams): Promise<ExcelReport> {
  const AVG_KM_PER_LITER = 4.0

  const dateFilter: Record<string, unknown> = {}
  if (params.dateFrom) dateFilter.gte = new Date(params.dateFrom)
  if (params.dateTo) dateFilter.lte = new Date(params.dateTo)

  const tripWhere: Record<string, unknown> = { status: 'completed' }
  if (Object.keys(dateFilter).length > 0) tripWhere.departureTime = dateFilter
  if (params.truckId) tripWhere.truckId = params.truckId
  if (params.driverId) tripWhere.driverId = params.driverId

  const trucks = await db.truck.findMany({
    where: params.truckId ? { id: params.truckId } : undefined,
    include: {
      FuelLog: { where: Object.keys(dateFilter).length > 0 ? { date: dateFilter } : undefined },
      Expense: { where: Object.keys(dateFilter).length > 0 ? { date: dateFilter } : undefined },
      MaintenanceRecord: { where: Object.keys(dateFilter).length > 0 ? { performedAt: dateFilter } : undefined },
      Trip: {
        where: tripWhere,
        select: { totalMileage: true, quantity: true, unit: true },
      },
    },
    orderBy: { plateNumber: 'asc' },
  })

  const truckData: Record<string, unknown>[] = []
  let grandFuelCost = 0
  let grandMaintCost = 0
  let grandOtherCost = 0
  let grandTotalCost = 0
  let grandDistance = 0
  let grandTonnage = 0

  for (const truck of trucks) {
    const fuelCost = truck.FuelLog.reduce((s, f) => s + f.totalCost, 0)
    const maintCost = truck.MaintenanceRecord.reduce((s, m) => s + (m.cost ?? 0), 0)
    const otherCost = truck.Expense
      .filter((e) => e.category !== 'fuel' && e.category !== 'maintenance')
      .reduce((s, e) => s + e.amount, 0)
    const totalCost = fuelCost + maintCost + otherCost
    const distance = truck.Trip.reduce((s, t) => s + (t.totalMileage ?? 0), 0)
    const tonnage = truck.Trip
      .filter((t) => t.unit === 'tonnes')
      .reduce((s, t) => s + t.quantity, 0)
    const costPerKm = distance > 0 ? totalCost / distance : 0
    const costPerTon = tonnage > 0 ? totalCost / tonnage : 0

    grandFuelCost += fuelCost
    grandMaintCost += maintCost
    grandOtherCost += otherCost
    grandTotalCost += totalCost
    grandDistance += distance
    grandTonnage += tonnage

    truckData.push({
      truck: `${truck.plateNumber} (${truck.make})`,
      make: truck.make,
      fuelCost,
      maintCost,
      otherCost,
      totalCost,
      distance,
      tonnage,
      costPerKm,
      costPerTon,
    })
  }

  const columns: ColumnDef[] = [
    { key: 'truck', header: 'Truck', type: 'text' },
    { key: 'make', header: 'Make', type: 'text' },
    { key: 'fuelCost', header: 'Fuel Cost (GHS)', type: 'currency' },
    { key: 'maintCost', header: 'Maintenance (GHS)', type: 'currency' },
    { key: 'otherCost', header: 'Other Costs (GHS)', type: 'currency' },
    { key: 'totalCost', header: 'Total Cost (GHS)', type: 'currency' },
    { key: 'distance', header: 'Distance (km)', type: 'number' },
    { key: 'tonnage', header: 'Tonnage', type: 'number' },
    { key: 'costPerKm', header: 'Cost/km (GHS)', type: 'currency' },
    { key: 'costPerTon', header: 'Cost/Tonne (GHS)', type: 'currency' },
  ]

  const avgCostPerKm = grandDistance > 0 ? grandTotalCost / grandDistance : 0
  const avgCostPerTon = grandTonnage > 0 ? grandTotalCost / grandTonnage : 0

  const report = new ExcelReport(`${APP_NAME} \u2014 Cost Analytics Report`, buildSubtitle(params))
  report.addKPISection([
    { label: 'Total Trucks', value: formatNumber(trucks.length) },
    { label: 'Total Cost', value: formatGHS(grandTotalCost) },
    { label: 'Fuel Cost', value: formatGHS(grandFuelCost) },
    { label: 'Maintenance', value: formatGHS(grandMaintCost) },
    { label: 'Avg Cost/km', value: formatGHS(avgCostPerKm) },
    { label: 'Avg Cost/Tonne', value: formatGHS(avgCostPerTon) },
  ])
  report.addHeadersFromDefs(columns)

  for (const row of truckData) {
    report.addTypedRow(row, columns)
  }

  report.addTypedSummaryRow('TOTAL', { fuelCost: grandFuelCost, maintCost: grandMaintCost, otherCost: grandOtherCost, totalCost: grandTotalCost, distance: grandDistance, tonnage: grandTonnage, costPerKm: avgCostPerKm, costPerTon: avgCostPerTon }, columns)
  report.autoFitColumns()
  report.freezePanes()
  report.setPageSetup()
  return report
}

// ============ 15. TRIP PROFITABILITY REPORT ============

export async function buildTripProfitabilityReport(params: ReportParams): Promise<ExcelReport> {
  const where: Record<string, unknown> = { status: 'completed' }

  const dateFilter: Record<string, unknown> = {}
  if (params.dateFrom) dateFilter.gte = new Date(params.dateFrom)
  if (params.dateTo) dateFilter.lte = new Date(params.dateTo)
  if (Object.keys(dateFilter).length > 0) where.departureTime = dateFilter
  if (params.truckId) where.truckId = params.truckId
  if (params.driverId) where.driverId = params.driverId
  if (params.clientId) where.clientId = params.clientId

  const trips = await db.trip.findMany({
    where,
    include: {
      driver: { select: { firstName: true, lastName: true } },
      truck: { select: { plateNumber: true, make: true } },
      client: { select: { companyName: true } },
      FuelLog: { select: { totalCost: true } },
      Expense: { select: { amount: true, category: true } },
    },
    orderBy: { departureTime: 'desc' },
  })

  let totalRevenue = 0
  let totalFuelCost = 0
  let totalExpenses = 0
  let totalNetProfit = 0
  let profitableCount = 0

  const tripData: Record<string, unknown>[] = []

  for (const trip of trips) {
    const revenue = trip.totalRevenue ?? 0
    const fuelCost = trip.FuelLog.reduce((s, f) => s + f.totalCost, 0) + (trip.fuelCost ?? 0)
    const expenses = trip.Expense.reduce((s, e) => s + e.amount, 0)
    const totalCost = fuelCost + expenses
    const netProfit = revenue - totalCost
    const margin = revenue > 0 ? (netProfit / revenue) * 100 : 0

    totalRevenue += revenue
    totalFuelCost += fuelCost
    totalExpenses += expenses
    totalNetProfit += netProfit
    if (netProfit > 0) profitableCount++

    tripData.push({
      tripNumber: trip.tripNumber,
      date: trip.departureTime,
      driver: `${trip.driver.firstName} ${trip.driver.lastName}`,
      truck: `${trip.truck.plateNumber} (${trip.truck.make})`,
      route: `${trip.loadingLocation} \u2192 ${trip.destination}`,
      client: trip.client?.companyName ?? trip.customerName ?? '-',
      revenue,
      fuelCost,
      expenses,
      totalCost,
      netProfit,
      margin: Math.round(margin * 100) / 100,
    })
  }

  const avgMargin = trips.length > 0 ? (totalNetProfit / totalRevenue) * 100 : 0

  const columns: ColumnDef[] = [
    { key: 'tripNumber', header: 'Trip #', type: 'text' },
    { key: 'date', header: 'Date', type: 'datetime' },
    { key: 'driver', header: 'Driver', type: 'text' },
    { key: 'truck', header: 'Truck', type: 'text' },
    { key: 'route', header: 'Route', type: 'text' },
    { key: 'client', header: 'Client', type: 'text' },
    { key: 'revenue', header: 'Revenue (GHS)', type: 'currency' },
    { key: 'fuelCost', header: 'Fuel Cost (GHS)', type: 'currency' },
    { key: 'expenses', header: 'Expenses (GHS)', type: 'currency' },
    { key: 'totalCost', header: 'Total Cost (GHS)', type: 'currency' },
    { key: 'netProfit', header: 'Net Profit (GHS)', type: 'currency' },
    { key: 'margin', header: 'Margin (%)', type: 'number' },
  ]

  const report = new ExcelReport(`${APP_NAME} \u2014 Trip Profitability Report`, buildSubtitle(params))
  report.addKPISection([
    { label: 'Total Trips', value: formatNumber(trips.length) },
    { label: 'Total Revenue', value: formatGHS(totalRevenue) },
    { label: 'Total Costs', value: formatGHS(totalFuelCost + totalExpenses) },
    { label: 'Net Profit', value: formatGHS(totalNetProfit) },
    { label: 'Profitable Trips', value: formatNumber(profitableCount) },
    { label: 'Avg Margin', value: `${avgMargin.toFixed(1)}%` },
  ])
  report.addHeadersFromDefs(columns)

  for (const row of tripData) {
    report.addTypedRow(row, columns)
  }

  report.addTypedSummaryRow('TOTAL', { revenue: totalRevenue, fuelCost: totalFuelCost, expenses: totalExpenses, totalCost: totalFuelCost + totalExpenses, netProfit: totalNetProfit }, columns)
  report.autoFitColumns()
  report.freezePanes()
  report.setPageSetup()
  return report
}

// ============ 16. FUEL ANALYTICS REPORT ============

export async function buildFuelAnalyticsReport(params: ReportParams): Promise<ExcelReport> {
  const AVG_KM_PER_LITER = 4.0

  const dateFilter: Record<string, unknown> = {}
  if (params.dateFrom) dateFilter.gte = new Date(params.dateFrom)
  if (params.dateTo) dateFilter.lte = new Date(params.dateTo)

  const trucks = await db.truck.findMany({
    where: params.truckId ? { id: params.truckId } : undefined,
    include: {
      FuelLog: {
        where: Object.keys(dateFilter).length > 0 ? { date: dateFilter } : undefined,
      },
      Trip: {
        where: { status: 'completed', ...(Object.keys(dateFilter).length > 0 ? { departureTime: dateFilter } : {}) },
        select: { totalMileage: true },
      },
    },
    orderBy: { plateNumber: 'asc' },
  })

  const truckData: Record<string, unknown>[] = []
  let grandLiters = 0
  let grandTotalCost = 0
  let grandFillups = 0

  for (const truck of trucks) {
    const logs = truck.FuelLog
    const liters = logs.reduce((s, f) => s + f.litersFilled, 0)
    const totalCost = logs.reduce((s, f) => s + f.totalCost, 0)
    const avgCostPerLiter = liters > 0 ? totalCost / liters : 0
    const fillups = logs.length
    const avgFill = fillups > 0 ? liters / fillups : 0
    const distance = truck.Trip.reduce((s, t) => s + (t.totalMileage ?? 0), 0)
    const efficiency = distance > 0 ? (liters / distance) * 100 : 0

    let rating = 'N/A'
    if (efficiency > 0) {
      if (efficiency <= 30) rating = 'Excellent'
      else if (efficiency <= 38) rating = 'Good'
      else if (efficiency <= 45) rating = 'Fair'
      else rating = 'Poor'
    }

    grandLiters += liters
    grandTotalCost += totalCost
    grandFillups += fillups

    truckData.push({
      truck: `${truck.plateNumber} (${truck.make})`,
      liters,
      totalCost,
      avgCostPerLiter,
      fillups,
      avgFill,
      efficiency,
      rating,
    })
  }

  const grandAvgCostPerLiter = grandLiters > 0 ? grandTotalCost / grandLiters : 0

  const columns: ColumnDef[] = [
    { key: 'truck', header: 'Truck', type: 'text' },
    { key: 'liters', header: 'Liters', type: 'number' },
    { key: 'totalCost', header: 'Total Cost (GHS)', type: 'currency' },
    { key: 'avgCostPerLiter', header: 'Avg Cost/Liter (GHS)', type: 'currency' },
    { key: 'fillups', header: 'Fill-ups', type: 'number' },
    { key: 'avgFill', header: 'Avg Fill (L)', type: 'number' },
    { key: 'efficiency', header: 'L/100km', type: 'number' },
    { key: 'rating', header: 'Rating', type: 'text' },
  ]

  const report = new ExcelReport(`${APP_NAME} \u2014 Fuel Analytics Report`, buildSubtitle(params))
  report.addKPISection([
    { label: 'Total Trucks', value: formatNumber(trucks.length) },
    { label: 'Total Liters', value: formatNumber(Math.round(grandLiters)) },
    { label: 'Total Cost', value: formatGHS(grandTotalCost) },
    { label: 'Avg Cost/Liter', value: formatGHS(grandAvgCostPerLiter) },
    { label: 'Total Fill-ups', value: formatNumber(grandFillups) },
  ])
  report.addHeadersFromDefs(columns)

  for (const row of truckData) {
    report.addTypedRow(row, columns)
  }

  report.addTypedSummaryRow('TOTAL', { liters: grandLiters, totalCost: grandTotalCost, fillups: grandFillups }, columns)
  report.autoFitColumns()
  report.freezePanes()
  report.setPageSetup()
  return report
}

// ============ 17. SAFETY SCORING REPORT ============

export async function buildSafetyScoringReport(params: ReportParams): Promise<ExcelReport> {
  const dateFilter: Record<string, unknown> = {}
  if (params.dateFrom) dateFilter.gte = new Date(params.dateFrom)
  if (params.dateTo) dateFilter.lte = new Date(params.dateTo)

  const drivers = await db.driver.findMany({
    where: params.driverId ? { id: params.driverId } : { status: 'active' },
    include: {
      inspections: {
        where: Object.keys(dateFilter).length > 0 ? { inspectionDate: dateFilter } : undefined,
      },
      Trip: {
        where: { status: 'completed', ...(Object.keys(dateFilter).length > 0 ? { departureTime: dateFilter } : {}) },
        select: { totalMileage: true },
      },
    },
    orderBy: { firstName: 'asc' },
  })

  const scoredDrivers: { name: string; employeeId: string; phone: string; score: number; trips: number; distance: number; violations: number }[] = []

  for (const driver of drivers) {
    const insps = driver.inspections
    const trips = driver.Trip
    const totalInspections = insps.length
    const passedInspections = insps.filter((i) => i.result === 'pass').length
    const failedInspections = insps.filter((i) => i.result === 'fail').length
    const warningInspections = insps.filter((i) => i.result === 'conditional_pass').length
    const defectsFound = insps.filter((i) => i.defectsFound).length

    const tripCount = trips.length
    const totalDistance = trips.reduce((s, t) => s + (t.totalMileage ?? 0), 0)

    // Scoring: base 100, deductions for failures and defects
    let score = 100
    score -= failedInspections * 15
    score -= warningInspections * 5
    score -= defectsFound * 3
    if (score < 0) score = 0

    scoredDrivers.push({
      name: `${driver.firstName} ${driver.lastName}`,
      employeeId: driver.employeeId,
      phone: driver.phone,
      score,
      trips: tripCount,
      distance: totalDistance,
      violations: failedInspections + defectsFound,
    })
  }

  // Sort by score descending
  scoredDrivers.sort((a, b) => b.score - a.score)

  // Assign grades and trends
  const driverData: Record<string, unknown>[] = []
  for (let i = 0; i < scoredDrivers.length; i++) {
    const d = scoredDrivers[i]
    let grade = 'F'
    if (d.score >= 90) grade = 'A'
    else if (d.score >= 80) grade = 'B'
    else if (d.score >= 70) grade = 'C'
    else if (d.score >= 60) grade = 'D'
    else if (d.score >= 50) grade = 'E'

    let trend = '-'
    if (i < scoredDrivers.length - 1) {
      const nextScore = scoredDrivers[i + 1].score
      if (d.score > nextScore + 5) trend = '\u2191'
      else if (d.score < nextScore - 5) trend = '\u2193'
      else trend = '\u2192'
    }

    driverData.push({
      rank: i + 1,
      driver: d.name,
      employeeId: d.employeeId,
      phone: d.phone,
      score: d.score,
      grade,
      trips: d.Trip,
      distance: d.distance,
      violations: d.violations,
      trend,
    })
  }

  const avgScore = scoredDrivers.length > 0
    ? scoredDrivers.reduce((s, d) => s + d.score, 0) / scoredDrivers.length
    : 0
  const gradeACount = scoredDrivers.filter((d) => d.score >= 90).length
  const gradeFCount = scoredDrivers.filter((d) => d.score < 50).length

  const columns: ColumnDef[] = [
    { key: 'rank', header: '#', type: 'number' },
    { key: 'driver', header: 'Driver', type: 'text' },
    { key: 'employeeId', header: 'Employee ID', type: 'text' },
    { key: 'phone', header: 'Phone', type: 'text' },
    { key: 'score', header: 'Safety Score', type: 'number' },
    { key: 'grade', header: 'Grade', type: 'text' },
    { key: 'trips', header: 'Trips', type: 'number' },
    { key: 'distance', header: 'Distance (km)', type: 'number' },
    { key: 'violations', header: 'Violations', type: 'number' },
    { key: 'trend', header: 'Trend', type: 'text' },
  ]

  const report = new ExcelReport(`${APP_NAME} \u2014 Safety Scoring Report`, buildSubtitle(params))
  report.addKPISection([
    { label: 'Total Drivers', value: formatNumber(scoredDrivers.length) },
    { label: 'Avg Score', value: avgScore.toFixed(1) },
    { label: 'Grade A Drivers', value: formatNumber(gradeACount) },
    { label: 'At-Risk (F)', value: formatNumber(gradeFCount) },
    { label: 'Total Violations', value: formatNumber(scoredDrivers.reduce((s, d) => s + d.violations, 0)) },
  ])
  report.addHeadersFromDefs(columns)

  for (const row of driverData) {
    report.addTypedRow(row, columns)
  }

  report.autoFitColumns()
  report.freezePanes()
  report.setPageSetup()
  return report
}
