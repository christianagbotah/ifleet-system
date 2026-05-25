// ════════════════════════════════════════════════════════════════════
// iFleetPro — Additional PDF Report Builders (New)
// ════════════════════════════════════════════════════════════════════
//
// Server-side PDF report generators using the PdfReport class.
// Each builder queries the database, assembles KPI cards, data tables,
// and produces a branded landscape PDF ready for download.
// ────────────────────────────────────────────────────────────────────

import jsPDF from 'jspdf'
import { db } from '@/lib/db'
import { PdfReport, formatGHS, formatNumber, fmtDate, fmtDateTime, buildPdfSubtitle } from './pdf-generator'
import type { ReportParams } from './types'

// ════════════════════════════════════════════════════════════════════
// 1. COMPLIANCE & DOCUMENT EXPIRY REPORT
// ════════════════════════════════════════════════════════════════════

export async function buildComplianceReportPdf(params: ReportParams): Promise<jsPDF> {
  const now = new Date()
  const thirtyDaysFromNow = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000)

  // Fetch all compliance documents in parallel
  const [dvlaRegs, roadworthyInspections, insurances, drivers] = await Promise.all([
    db.dvlaRegistration.findMany({
      include: { truck: { select: { plateNumber: true } } },
    }),
    db.roadworthyInspection.findMany({
      where: { certificateExpiry: { not: null } },
      include: { truck: { select: { plateNumber: true } } },
    }),
    db.insurance.findMany({
      include: { truck: { select: { plateNumber: true } } },
    }),
    db.driver.findMany({
      select: { id: true, firstName: true, lastName: true, licenseExpiry: true, ghanaCardExpiry: true },
    }),
  ])

  // Build unified document rows
  const rows: (string | number)[][] = []

  for (const r of dvlaRegs) {
    const expiry = new Date(r.expiryDate)
    const daysRemaining = Math.ceil((expiry.getTime() - now.getTime()) / (1000 * 60 * 60 * 24))
    const status = daysRemaining <= 0 ? 'Expired' : daysRemaining <= 30 ? 'Expiring Soon' : 'Active'
    rows.push([
      'DVLA Registration',
      r.certificateNumber,
      r.truck.plateNumber,
      fmtDate(r.expiryDate),
      String(daysRemaining),
      status,
      'DVLA',
    ])
  }

  for (const r of roadworthyInspections) {
    if (!r.certificateExpiry) continue
    const expiry = new Date(r.certificateExpiry)
    const daysRemaining = Math.ceil((expiry.getTime() - now.getTime()) / (1000 * 60 * 60 * 24))
    const status = daysRemaining <= 0 ? 'Expired' : daysRemaining <= 30 ? 'Expiring Soon' : 'Active'
    rows.push([
      'Roadworthy Cert.',
      r.certificateNumber,
      r.truck.plateNumber,
      fmtDate(r.certificateExpiry),
      String(daysRemaining),
      status,
      'Roadworthy',
    ])
  }

  for (const r of insurances) {
    const expiry = new Date(r.endDate)
    const daysRemaining = Math.ceil((expiry.getTime() - now.getTime()) / (1000 * 60 * 60 * 24))
    const status = daysRemaining <= 0 ? 'Expired' : daysRemaining <= 30 ? 'Expiring Soon' : 'Active'
    rows.push([
      'Insurance Policy',
      r.policyNumber,
      r.truck.plateNumber,
      fmtDate(r.endDate),
      String(daysRemaining),
      status,
      'Insurance',
    ])
  }

  for (const d of drivers) {
    const licExpiry = new Date(d.licenseExpiry)
    const licDays = Math.ceil((licExpiry.getTime() - now.getTime()) / (1000 * 60 * 60 * 24))
    const licStatus = licDays <= 0 ? 'Expired' : licDays <= 30 ? 'Expiring Soon' : 'Active'
    rows.push([
      'Driver License',
      d.licenseNumber,
      `${d.firstName} ${d.lastName}`,
      fmtDate(d.licenseExpiry),
      String(licDays),
      licStatus,
      'License',
    ])

    if (d.ghanaCardExpiry) {
      const gcExpiry = new Date(d.ghanaCardExpiry)
      const gcDays = Math.ceil((gcExpiry.getTime() - now.getTime()) / (1000 * 60 * 60 * 24))
      const gcStatus = gcDays <= 0 ? 'Expired' : gcDays <= 30 ? 'Expiring Soon' : 'Active'
      rows.push([
        'Ghana Card',
        d.ghanaCardNumber ?? '-',
        `${d.firstName} ${d.lastName}`,
        fmtDate(d.ghanaCardExpiry),
        String(gcDays),
        gcStatus,
        'Ghana Card',
      ])
    }
  }

  const totalDocs = rows.length
  const expiringSoon = rows.filter((r) => r[5] === 'Expiring Soon').length
  const expired = rows.filter((r) => r[5] === 'Expired').length
  const compliant = rows.filter((r) => r[5] === 'Active').length

  const pdf = new PdfReport('landscape')
  pdf.addHeader()
  pdf.addTitle('Compliance & Document Expiry Report')
  pdf.addSubtitle(buildPdfSubtitle(params))
  pdf.addKPICards([
    { label: 'Total Documents', value: String(totalDocs) },
    { label: 'Expiring Soon (30d)', value: String(expiringSoon) },
    { label: 'Expired', value: String(expired) },
    { label: 'Compliant', value: String(compliant) },
  ])

  const headers = ['Document Type', 'Reference', 'Truck/Driver', 'Expiry Date', 'Days Remaining', 'Status', 'Category']

  pdf.addTable(headers, rows, {
    summaryRow: { label: 'TOTAL', values: ['', '', '', '', '', `${expired + expiringSoon} items need attention`, ''] },
  })
  pdf.addFooter()

  return pdf.pdf
}

// ════════════════════════════════════════════════════════════════════
// 2. TYRE MANAGEMENT REPORT
// ════════════════════════════════════════════════════════════════════

export async function buildTyreReportPdf(params: ReportParams): Promise<jsPDF> {
  const where: Record<string, unknown> = {}
  if (params.truckId) where.truckId = params.truckId

  const tyres = await db.tyre.findMany({
    where,
    include: {
      truck: { select: { plateNumber: true, make: true } },
    },
    orderBy: { serialNumber: 'asc' },
  })

  const totalTyres = tyres.length
  const newCount = tyres.filter((t) => t.condition === 'new').length
  const goodCount = tyres.filter((t) => t.condition === 'good').length
  const fairCount = tyres.filter((t) => t.condition === 'fair').length
  const wornDamaged = tyres.filter((t) => t.condition === 'worn' || t.condition === 'damaged').length
  const replacedCount = tyres.filter((t) => t.condition === 'replaced').length
  const totalValue = tyres.reduce((s, t) => s + t.purchasePrice, 0)

  const pdf = new PdfReport('landscape')
  pdf.addHeader()
  pdf.addTitle('Tyre Management Report')
  pdf.addSubtitle(buildPdfSubtitle(params))
  pdf.addKPICards([
    { label: 'Total Tyres', value: String(totalTyres) },
    { label: 'New', value: String(newCount) },
    { label: 'Good', value: String(goodCount) },
    { label: 'Fair', value: String(fairCount) },
    { label: 'Worn/Damaged', value: String(wornDamaged) },
    { label: 'Replaced', value: String(replacedCount) },
    { label: 'Total Value', value: formatGHS(totalValue) },
    { label: 'Avg Value', value: formatGHS(totalTyres > 0 ? totalValue / totalTyres : 0) },
  ])

  const headers = ['Serial #', 'Truck', 'Brand', 'Purchase Date', 'Price (GHS)', 'Condition', 'Last Inspection', 'Status']
  const rows = tyres.map((t) => [
    t.serialNumber,
    `${t.truck.plateNumber} (${t.truck.make})`,
    t.brand,
    fmtDate(t.purchaseDate),
    formatGHS(t.purchasePrice),
    t.condition.replace(/\b\w/g, (c: string) => c.toUpperCase()),
    fmtDate(t.lastInspection) || '-',
    t.retiredDate ? `Retired: ${fmtDate(t.retiredDate)}` : 'Active',
  ])

  pdf.addTable(headers, rows, {
    summaryRow: {
      label: 'TOTAL',
      values: ['', '', '', '', formatGHS(totalValue), '', '', ''],
    },
    columnStyles: { 4: { halign: 'right' } },
  })
  pdf.addFooter()

  return pdf.pdf
}

// ════════════════════════════════════════════════════════════════════
// 3. INSURANCE CLAIMS REPORT
// ════════════════════════════════════════════════════════════════════

export async function buildInsuranceClaimsReportPdf(params: ReportParams): Promise<jsPDF> {
  const dateFilter: Record<string, unknown> = {}
  if (params.dateFrom) dateFilter.gte = new Date(params.dateFrom)
  if (params.dateTo) dateFilter.lte = new Date(params.dateTo)

  const where: Record<string, unknown> = {}
  if (Object.keys(dateFilter).length > 0) where.incidentDate = dateFilter
  if (params.status) where.status = params.status

  const claims = await db.insuranceClaim.findMany({
    where,
    include: {
      insurance: { select: { provider: true, policyNumber: true } },
      truck: { select: { plateNumber: true } },
    },
    orderBy: { incidentDate: 'desc' },
  })

  const totalClaims = claims.length
  const totalClaimed = claims.reduce((s, c) => s + c.claimAmount, 0)
  const totalApproved = claims.reduce((s, c) => s + (c.approvedAmount ?? 0), 0)
  const draftCount = claims.filter((c) => c.status === 'draft').length
  const underReview = claims.filter((c) => c.status === 'submitted' || c.status === 'under_review').length
  const closedCount = claims.filter((c) => c.status === 'closed' || c.status === 'paid').length

  const pdf = new PdfReport('landscape')
  pdf.addHeader()
  pdf.addTitle('Insurance Claims Report')
  pdf.addSubtitle(buildPdfSubtitle(params))
  pdf.addKPICards([
    { label: 'Total Claims', value: String(totalClaims) },
    { label: 'Total Claimed', value: formatGHS(totalClaimed) },
    { label: 'Total Approved', value: formatGHS(totalApproved) },
    { label: 'Draft', value: String(draftCount) },
    { label: 'Under Review', value: String(underReview) },
    { label: 'Closed', value: String(closedCount) },
  ])

  const headers = ['Claim #', 'Policy #', 'Provider', 'Truck', 'Type', 'Incident Date', 'Location', 'Claimed (GHS)', 'Approved (GHS)', 'Status', 'Submitted']
  const rows = claims.map((c) => [
    c.claimNumber,
    c.insurance.policyNumber,
    c.insurance.provider,
    c.truck.plateNumber,
    c.claimType.replace(/_/g, ' ').replace(/\b\w/g, (ch: string) => ch.toUpperCase()),
    fmtDate(c.incidentDate),
    c.incidentLocation,
    formatGHS(c.claimAmount),
    formatGHS(c.approvedAmount ?? 0),
    c.status.replace(/_/g, ' ').replace(/\b\w/g, (ch: string) => ch.toUpperCase()),
    fmtDate(c.submittedAt) || '-',
  ])

  pdf.addTable(headers, rows, {
    summaryRow: {
      label: 'TOTAL',
      values: ['', '', '', '', '', '', '', formatGHS(totalClaimed), formatGHS(totalApproved), '', ''],
    },
    columnStyles: { 7: { halign: 'right' }, 8: { halign: 'right' } },
  })
  pdf.addFooter()

  return pdf.pdf
}

// ════════════════════════════════════════════════════════════════════
// 4. WAREHOUSE INVENTORY REPORT
// ════════════════════════════════════════════════════════════════════

export async function buildWarehouseReportPdf(params: ReportParams): Promise<jsPDF> {
  const where: Record<string, unknown> = {}
  if (params.status) where.status = params.status
  if (params.category) where.category = params.category

  const items = await db.warehouseItem.findMany({
    where,
    orderBy: { name: 'asc' },
  })

  const totalItems = items.length
  const inStock = items.filter((i) => i.status === 'in_stock').length
  const lowStock = items.filter((i) => i.status === 'low_stock').length
  const outOfStock = items.filter((i) => i.status === 'out_of_stock').length
  const totalValue = items.reduce((s, i) => s + i.quantity * i.unitPrice, 0)
  const categories = new Set(items.map((i) => i.category))

  const pdf = new PdfReport('landscape')
  pdf.addHeader()
  pdf.addTitle('Warehouse Inventory Report')
  pdf.addSubtitle(buildPdfSubtitle(params))
  pdf.addKPICards([
    { label: 'Total Items', value: String(totalItems) },
    { label: 'In Stock', value: String(inStock) },
    { label: 'Low Stock', value: String(lowStock) },
    { label: 'Out of Stock', value: String(outOfStock) },
    { label: 'Total Value', value: formatGHS(totalValue) },
    { label: 'Categories', value: String(categories.size) },
  ])

  const headers = ['SKU', 'Name', 'Category', 'Quantity', 'Min Stock', 'Unit Price (GHS)', 'Total Value (GHS)', 'Unit', 'Warehouse', 'Supplier', 'Status', 'Last Restocked', 'Expiry Date']
  const rows = items.map((i) => [
    i.sku,
    i.name,
    i.category,
    String(i.quantity),
    String(i.minStock),
    formatGHS(i.unitPrice),
    formatGHS(i.quantity * i.unitPrice),
    i.unit,
    i.warehouse,
    i.supplier ?? '-',
    i.status.replace(/_/g, ' ').replace(/\b\w/g, (c: string) => c.toUpperCase()),
    fmtDate(i.lastRestocked) || '-',
    fmtDate(i.expiryDate) || '-',
  ])

  pdf.addTable(headers, rows, {
    summaryRow: {
      label: 'TOTAL',
      values: ['', '', '', String(items.reduce((s, i) => s + i.quantity, 0)), '', '', formatGHS(totalValue), '', '', '', '', '', ''],
    },
    columnStyles: { 3: { halign: 'right' }, 5: { halign: 'right' }, 6: { halign: 'right' } },
  })
  pdf.addFooter()

  return pdf.pdf
}

// ════════════════════════════════════════════════════════════════════
// 5. DRIVER INCENTIVES REPORT
// ════════════════════════════════════════════════════════════════════

export async function buildDriverIncentivesReportPdf(params: ReportParams): Promise<jsPDF> {
  const dateFilter: Record<string, unknown> = {}
  if (params.dateFrom) dateFilter.gte = new Date(params.dateFrom)
  if (params.dateTo) dateFilter.lte = new Date(params.dateTo)

  const where: Record<string, unknown> = {}
  if (params.driverId) where.driverId = params.driverId
  if (params.status) where.status = params.status
  if (Object.keys(dateFilter).length > 0) where.createdAt = dateFilter

  const incentives = await db.driverIncentive.findMany({
    where,
    include: {
      driver: { select: { firstName: true, lastName: true } },
    },
    orderBy: { createdAt: 'desc' },
  })

  const totalIncentives = incentives.length
  const totalValue = incentives.reduce((s, i) => s + i.amount, 0)
  const pendingCount = incentives.filter((i) => i.status === 'pending').length
  const approvedCount = incentives.filter((i) => i.status === 'approved').length
  const paidCount = incentives.filter((i) => i.status === 'paid').length
  const avgAmount = totalIncentives > 0 ? totalValue / totalIncentives : 0

  const pdf = new PdfReport('landscape')
  pdf.addHeader()
  pdf.addTitle('Driver Incentives Report')
  pdf.addSubtitle(buildPdfSubtitle(params))
  pdf.addKPICards([
    { label: 'Total Incentives', value: String(totalIncentives) },
    { label: 'Total Value', value: formatGHS(totalValue) },
    { label: 'Pending', value: String(pendingCount) },
    { label: 'Approved', value: String(approvedCount) },
    { label: 'Paid', value: String(paidCount) },
    { label: 'Average Amount', value: formatGHS(avgAmount) },
  ])

  const headers = ['Driver', 'Type', 'Title', 'Period', 'Amount (GHS)', 'Status', 'Approved By', 'Approved Date', 'Paid Date', 'Metric']
  const rows = incentives.map((i) => [
    `${i.driver.firstName} ${i.driver.lastName}`,
    i.type.replace(/_/g, ' ').replace(/\b\w/g, (c: string) => c.toUpperCase()),
    i.title,
    i.period,
    formatGHS(i.amount),
    i.status.replace(/_/g, ' ').replace(/\b\w/g, (c: string) => c.toUpperCase()),
    i.approvedBy ?? '-',
    fmtDate(i.approvedAt) || '-',
    fmtDate(i.paidAt) || '-',
    i.metrics ?? '-',
  ])

  pdf.addTable(headers, rows, {
    summaryRow: {
      label: 'TOTAL',
      values: ['', '', '', '', formatGHS(totalValue), '', '', '', '', ''],
    },
    columnStyles: { 4: { halign: 'right' } },
  })
  pdf.addFooter()

  return pdf.pdf
}

// ════════════════════════════════════════════════════════════════════
// 6. TOLL & CHECKPOINT REPORT
// ════════════════════════════════════════════════════════════════════

export async function buildTollReportPdf(params: ReportParams): Promise<jsPDF> {
  const dateFilter: Record<string, unknown> = {}
  if (params.dateFrom) dateFilter.gte = new Date(params.dateFrom)
  if (params.dateTo) dateFilter.lte = new Date(params.dateTo)

  const where: Record<string, unknown> = {}
  if (Object.keys(dateFilter).length > 0) where.tollDate = dateFilter
  if (params.truckId) where.truckId = params.truckId
  if (params.status) where.status = params.status

  // Map tollType filter — handle possible param naming
  if ((params as Record<string, string | undefined>).tollType) {
    where.tollType = (params as Record<string, string | undefined>).tollType
  }

  const records = await db.tollRecord.findMany({
    where,
    include: {
      truck: { select: { plateNumber: true } },
      driver: { select: { firstName: true, lastName: true } },
      trip: { select: { tripNumber: true } },
    },
    orderBy: { tollDate: 'desc' },
  })

  const totalRecords = records.length
  const totalAmount = records.reduce((s, r) => s + r.amount, 0)
  const overloadedIncidents = records.filter((r) => r.overloaded).length
  const totalFines = records.reduce((s, r) => s + (r.overloadFine ?? 0), 0)
  const uniqueRoutes = new Set(records.map((r) => r.route).filter(Boolean))
  const uniqueTollPoints = new Set(records.map((r) => r.tollPoint))

  const pdf = new PdfReport('landscape')
  pdf.addHeader()
  pdf.addTitle('Toll & Checkpoint Report')
  pdf.addSubtitle(buildPdfSubtitle(params))
  pdf.addKPICards([
    { label: 'Total Records', value: String(totalRecords) },
    { label: 'Total Amount', value: formatGHS(totalAmount) },
    { label: 'Overloaded', value: String(overloadedIncidents) },
    { label: 'Total Fines', value: formatGHS(totalFines) },
    { label: 'Unique Routes', value: String(uniqueRoutes.size) },
    { label: 'Toll Points', value: String(uniqueTollPoints.size) },
  ])

  const headers = ['Date', 'Truck', 'Driver', 'Trip #', 'Toll Point', 'Toll Type', 'Route', 'Amount (GHS)', 'Payment', 'Direction', 'Overloaded', 'Status']
  const rows = records.map((r) => [
    fmtDate(r.tollDate),
    r.truck.plateNumber,
    r.driver ? `${r.driver.firstName} ${r.driver.lastName}` : '-',
    r.trip?.tripNumber ?? '-',
    r.tollPoint,
    r.tollType.replace(/_/g, ' ').replace(/\b\w/g, (c: string) => c.toUpperCase()),
    r.route ?? '-',
    formatGHS(r.amount),
    r.paymentMethod.replace(/_/g, ' '),
    r.direction ?? '-',
    r.overloaded ? 'Yes' : 'No',
    r.status.replace(/_/g, ' ').replace(/\b\w/g, (c: string) => c.toUpperCase()),
  ])

  pdf.addTable(headers, rows, {
    summaryRow: {
      label: 'TOTAL',
      values: ['', '', '', '', '', '', '', formatGHS(totalAmount), '', '', `${overloadedIncidents} incidents`, ''],
    },
    columnStyles: { 7: { halign: 'right' } },
  })
  pdf.addFooter()

  return pdf.pdf
}

// ════════════════════════════════════════════════════════════════════
// 7. VEHICLE INSPECTION & SAFETY REPORT
// ════════════════════════════════════════════════════════════════════

export async function buildSafetyReportPdf(params: ReportParams): Promise<jsPDF> {
  const dateFilter: Record<string, unknown> = {}
  if (params.dateFrom) dateFilter.gte = new Date(params.dateFrom)
  if (params.dateTo) dateFilter.lte = new Date(params.dateTo)

  const where: Record<string, unknown> = {}
  if (Object.keys(dateFilter).length > 0) where.inspectionDate = dateFilter
  if (params.truckId) where.truckId = params.truckId
  if (params.status) where.result = params.status

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
  const conditionalPass = inspections.filter((i) => i.result === 'conditional_pass').length
  const failed = inspections.filter((i) => i.result === 'fail').length
  const defectsFound = inspections.filter((i) => i.defectsFound).length
  const requiresFollowUp = inspections.filter((i) => i.requiresFollowUp).length

  const pdf = new PdfReport('landscape')
  pdf.addHeader()
  pdf.addTitle('Vehicle Inspection & Safety Report')
  pdf.addSubtitle(buildPdfSubtitle(params))
  pdf.addKPICards([
    { label: 'Total Inspections', value: String(totalInspections) },
    { label: 'Passed', value: String(passed) },
    { label: 'Conditional Pass', value: String(conditionalPass) },
    { label: 'Failed', value: String(failed) },
    { label: 'Defects Found', value: String(defectsFound) },
    { label: 'Requires Follow-up', value: String(requiresFollowUp) },
  ])

  const headers = ['Date', 'Truck', 'Driver', 'Type', 'Odometer', 'Total Checks', 'Pass', 'Warning', 'Fail', 'Result', 'Defects', 'Inspector', 'Location']
  const rows = inspections.map((i) => [
    fmtDate(i.inspectionDate),
    `${i.truck.plateNumber} (${i.truck.make})`,
    i.driver ? `${i.driver.firstName} ${i.driver.lastName}` : '-',
    i.type.replace(/_/g, ' ').replace(/\b\w/g, (c: string) => c.toUpperCase()),
    formatNumber(i.odometerReading ?? 0),
    String(i.totalChecks),
    String(i.passCount),
    String(i.warningCount),
    String(i.failCount),
    i.result.replace(/_/g, ' ').replace(/\b\w/g, (c: string) => c.toUpperCase()),
    i.defectsFound ? 'Yes' : 'No',
    i.inspectorName ?? '-',
    i.location ?? '-',
  ])

  pdf.addTable(headers, rows, {
    summaryRow: {
      label: 'TOTAL',
      values: ['', '', '', '', '', String(inspections.reduce((s, i) => s + i.totalChecks, 0)), String(inspections.reduce((s, i) => s + i.passCount, 0)), String(inspections.reduce((s, i) => s + i.warningCount, 0)), String(inspections.reduce((s, i) => s + i.failCount, 0)), `${passed} pass / ${failed} fail`, `${defectsFound} defects`, '', ''],
    },
    columnStyles: { 4: { halign: 'right' }, 5: { halign: 'right' }, 6: { halign: 'right' }, 7: { halign: 'right' }, 8: { halign: 'right' } },
  })
  pdf.addFooter()

  return pdf.pdf
}

// ════════════════════════════════════════════════════════════════════
// 8. CASH ADVANCES REPORT
// ════════════════════════════════════════════════════════════════════

export async function buildCashAdvancesReportPdf(params: ReportParams): Promise<jsPDF> {
  const dateFilter: Record<string, unknown> = {}
  if (params.dateFrom) dateFilter.gte = new Date(params.dateFrom)
  if (params.dateTo) dateFilter.lte = new Date(params.dateTo)

  const where: Record<string, unknown> = {}
  if (Object.keys(dateFilter).length > 0) where.requestDate = dateFilter
  if (params.driverId) where.driverId = params.driverId
  if (params.status) where.status = params.status

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
  const totalDisbursed = advances.filter((a) => a.status === 'disbursed' || a.status === 'partially_deducted' || a.status === 'fully_deducted').reduce((s, a) => s + a.amount, 0)
  const totalDeducted = advances.reduce((s, a) => s + a.totalDeducted, 0)
  const pendingCount = advances.filter((a) => a.status === 'pending').length
  const approvedCount = advances.filter((a) => a.status === 'approved' || a.status === 'disbursed').length
  const rejectedCount = advances.filter((a) => a.status === 'rejected').length
  const outstandingBalance = advances.reduce((s, a) => s + a.remainingBalance, 0)

  const pdf = new PdfReport('landscape')
  pdf.addHeader()
  pdf.addTitle('Cash Advances Report')
  pdf.addSubtitle(buildPdfSubtitle(params))
  pdf.addKPICards([
    { label: 'Total Advances', value: String(totalAdvances) },
    { label: 'Total Amount', value: formatGHS(totalAmount) },
    { label: 'Total Disbursed', value: formatGHS(totalDisbursed) },
    { label: 'Total Deducted', value: formatGHS(totalDeducted) },
    { label: 'Pending', value: String(pendingCount) },
    { label: 'Approved', value: String(approvedCount) },
    { label: 'Rejected', value: String(rejectedCount) },
    { label: 'Outstanding', value: formatGHS(outstandingBalance) },
  ])

  const headers = ['Request Date', 'Driver', 'Employee ID', 'Trip #', 'Purpose', 'Amount (GHS)', 'Payment', 'Status', 'Approved By', 'Approved At', 'Disbursed At', 'Deducted', 'Remaining']
  const rows = advances.map((a) => [
    fmtDate(a.requestDate),
    `${a.driver.firstName} ${a.driver.lastName}`,
    a.driver.employeeId,
    a.trip?.tripNumber ?? '-',
    a.purpose.replace(/_/g, ' ').replace(/\b\w/g, (c: string) => c.toUpperCase()),
    formatGHS(a.amount),
    a.paymentMethod.replace(/_/g, ' '),
    a.status.replace(/_/g, ' ').replace(/\b\w/g, (c: string) => c.toUpperCase()),
    a.approvedBy ?? '-',
    fmtDateTime(a.approvedAt) || '-',
    fmtDateTime(a.disbursedAt) || '-',
    formatGHS(a.totalDeducted),
    formatGHS(a.remainingBalance),
  ])

  pdf.addTable(headers, rows, {
    summaryRow: {
      label: 'TOTAL',
      values: ['', '', '', '', '', formatGHS(totalAmount), '', '', '', '', '', formatGHS(totalDeducted), formatGHS(outstandingBalance)],
    },
    columnStyles: { 5: { halign: 'right' }, 11: { halign: 'right' }, 12: { halign: 'right' } },
  })
  pdf.addFooter()

  return pdf.pdf
}

// ════════════════════════════════════════════════════════════════════
// 9. DAILY OPERATIONS SUMMARY
// ════════════════════════════════════════════════════════════════════

export async function buildDailySummaryPdf(params: ReportParams): Promise<jsPDF> {
  // Use specific date or default to today
  const reportDate = params.dateFrom ? new Date(params.dateFrom) : new Date()
  const startOfDay = new Date(reportDate.getFullYear(), reportDate.getMonth(), reportDate.getDate())
  const endOfDay = new Date(startOfDay.getTime() + 24 * 60 * 60 * 1000 - 1)

  // Fetch daily data in parallel
  const [todayTrips, todayExpenses, todayFuelLogs, activeTrucks, activeTrips] = await Promise.all([
    db.trip.findMany({
      where: {
        departureTime: { gte: startOfDay, lte: endOfDay },
      },
      include: {
        driver: { select: { firstName: true, lastName: true } },
        truck: { select: { plateNumber: true } },
        client: { select: { companyName: true } },
      },
      orderBy: { departureTime: 'desc' },
    }),
    db.expense.findMany({
      where: { date: { gte: startOfDay, lte: endOfDay } },
      include: {
        truck: { select: { plateNumber: true } },
      },
      orderBy: { date: 'desc' },
    }),
    db.fuelLog.findMany({
      where: { date: { gte: startOfDay, lte: endOfDay } },
      include: {
        truck: { select: { plateNumber: true } },
      },
      orderBy: { date: 'desc' },
    }),
    db.truck.count({ where: { status: 'active' } }),
    db.trip.count({
      where: {
        status: { in: ['in_transit', 'loading', 'loaded', 'waiting_at_depot', 'departed_depot', 'arrived_destination', 'waiting_to_offload', 'offloading'] },
      },
    }),
  ])

  const totalRevenue = todayTrips.reduce((s, t) => s + (t.totalRevenue ?? 0), 0)
  const totalExpenses = todayExpenses.reduce((s, e) => s + e.amount, 0)
  const totalFuelCost = todayFuelLogs.reduce((s, f) => s + f.totalCost, 0)
  const totalLiters = todayFuelLogs.reduce((s, f) => s + f.litersFilled, 0)
  const avgCostPerLiter = totalLiters > 0 ? totalFuelCost / totalLiters : 0

  const pdf = new PdfReport('landscape')
  pdf.addHeader()
  pdf.addTitle('Daily Operations Summary')
  pdf.addSubtitle(`Date: ${fmtDate(reportDate)} | Generated: ${fmtDate(new Date())}`)
  pdf.addKPICards([
    { label: 'Active Trucks', value: String(activeTrucks) },
    { label: 'Active Trips', value: String(activeTrips) },
    { label: 'Trips Departed', value: String(todayTrips.length) },
    { label: 'Total Revenue', value: formatGHS(totalRevenue) },
    { label: 'Total Expenses', value: formatGHS(totalExpenses) },
    { label: 'Total Fuel Cost', value: formatGHS(totalFuelCost) },
    { label: 'Avg Cost/Liter', value: formatGHS(avgCostPerLiter) },
    { label: 'Net Profit', value: formatGHS(totalRevenue - totalExpenses - totalFuelCost) },
  ])

  // Trips table
  const tripHeaders = ['Trip #', 'Time', 'Driver', 'Truck', 'Route', 'Cargo', 'Client', 'Status', 'Revenue']
  const tripRows = todayTrips.map((t) => [
    t.tripNumber,
    fmtDateTime(t.departureTime),
    `${t.driver.firstName} ${t.driver.lastName}`,
    t.truck.plateNumber,
    `${t.loadingLocation} \u2192 ${t.destination}`,
    `${t.quantity} ${t.unit} ${t.itemName}`,
    t.client?.companyName ?? t.customerName ?? '-',
    t.status.replace(/_/g, ' ').replace(/\b\w/g, (c: string) => c.toUpperCase()),
    formatGHS(t.totalRevenue ?? 0),
  ])

  pdf.addTable(tripHeaders, tripRows, {
    summaryRow: { label: 'TOTAL', values: ['', '', '', '', '', '', '', '', formatGHS(totalRevenue)] },
    columnStyles: { 8: { halign: 'right' } },
  })

  // Expenses table
  const expHeaders = ['Date', 'Truck', 'Category', 'Description', 'Amount (GHS)', 'Payment', 'Reference']
  const expRows = todayExpenses.map((e) => [
    fmtDate(e.date),
    e.truck.plateNumber,
    e.category.replace(/_/g, ' ').replace(/\b\w/g, (c: string) => c.toUpperCase()),
    e.description,
    formatGHS(e.amount),
    e.paymentMethod.replace(/_/g, ' '),
    e.reference ?? '-',
  ])

  if (expRows.length > 0) {
    pdf.addTable(expHeaders, expRows, {
      summaryRow: { label: 'TOTAL', values: ['', '', '', '', formatGHS(totalExpenses), '', ''] },
      columnStyles: { 4: { halign: 'right' } },
    })
  }

  pdf.addFooter()

  return pdf.pdf
}

// ════════════════════════════════════════════════════════════════════
// 10. BORDER CROSSINGS REPORT
// ════════════════════════════════════════════════════════════════════

export async function buildBorderCrossingsReportPdf(params: ReportParams): Promise<jsPDF> {
  const dateFilter: Record<string, unknown> = {}
  if (params.dateFrom) dateFilter.gte = new Date(params.dateFrom)
  if (params.dateTo) dateFilter.lte = new Date(params.dateTo)

  const where: Record<string, unknown> = {}
  if (Object.keys(dateFilter).length > 0) where.queuedAt = dateFilter
  if (params.status) where.status = params.status
  if ((params as Record<string, string | undefined>).country) {
    where.country = (params as Record<string, string | undefined>).country
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

  const totalCrossings = crossings.length
  const queued = crossings.filter((c) => c.status === 'queued').length
  const processing = crossings.filter((c) => c.status === 'processing').length
  const cleared = crossings.filter((c) => c.status === 'cleared').length
  const avgWait = crossings.filter((c) => c.actualWait != null).length > 0
    ? Math.round(crossings.filter((c) => c.actualWait != null).reduce((s, c) => s + (c.actualWait ?? 0), 0) / crossings.filter((c) => c.actualWait != null).length)
    : 0
  const totalFees = crossings.reduce((s, c) => s + (c.clearanceFee ?? 0), 0)
  const overdue = crossings.filter((c) => {
    if (c.status !== 'queued') return false
    const waitHours = (Date.now() - new Date(c.queuedAt).getTime()) / (1000 * 60 * 60)
    return waitHours > (c.estimatedWait ?? 120) / 60
  }).length

  const pdf = new PdfReport('landscape')
  pdf.addHeader()
  pdf.addTitle('Border Crossings Report')
  pdf.addSubtitle(buildPdfSubtitle(params))
  pdf.addKPICards([
    { label: 'Total Crossings', value: String(totalCrossings) },
    { label: 'Queued', value: String(queued) },
    { label: 'Processing', value: String(processing) },
    { label: 'Cleared', value: String(cleared) },
    { label: 'Avg Wait (min)', value: String(avgWait) },
    { label: 'Total Fees', value: formatGHS(totalFees) },
    { label: 'Overdue', value: String(overdue) },
  ])

  const headers = ['Truck', 'Driver', 'Trip #', 'Border', 'Country', 'Direction', 'Status', 'Queued At', 'Cleared At', 'Wait (min)', 'Fee (GHS)', 'Doc Status', 'Notes']
  const rows = crossings.map((c) => [
    c.truck.plateNumber,
    `${c.driver.firstName} ${c.driver.lastName}`,
    c.trip.tripNumber,
    c.borderName,
    c.country,
    c.direction.replace(/_/g, ' ').replace(/\b\w/g, (ch: string) => ch.toUpperCase()),
    c.status.replace(/_/g, ' ').replace(/\b\w/g, (ch: string) => ch.toUpperCase()),
    fmtDateTime(c.queuedAt),
    fmtDateTime(c.clearedAt) || '-',
    String(c.actualWait ?? '-'),
    formatGHS(c.clearanceFee ?? 0),
    c.documentStatus ?? '-',
    c.notes ?? '-',
  ])

  pdf.addTable(headers, rows, {
    summaryRow: {
      label: 'TOTAL',
      values: ['', '', '', '', '', '', '', '', '', String(avgWait), formatGHS(totalFees), '', ''],
    },
    columnStyles: { 9: { halign: 'right' }, 10: { halign: 'right' } },
  })
  pdf.addFooter()

  return pdf.pdf
}

// ════════════════════════════════════════════════════════════════════
// 11. DEPOT QUEUE REPORT
// ════════════════════════════════════════════════════════════════════

export async function buildDepotQueueReportPdf(params: ReportParams): Promise<jsPDF> {
  const dateFilter: Record<string, unknown> = {}
  if (params.dateFrom) dateFilter.gte = new Date(params.dateFrom)
  if (params.dateTo) dateFilter.lte = new Date(params.dateTo)

  const where: Record<string, unknown> = {}
  if (Object.keys(dateFilter).length > 0) where.joinedAt = dateFilter
  if (params.status) where.status = params.status
  if ((params as Record<string, string | undefined>).depotName) {
    where.depotName = (params as Record<string, string | undefined>).depotName
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

  const totalInQueue = queues.length
  const waiting = queues.filter((q) => q.status === 'waiting').length
  const processing = queues.filter((q) => q.status === 'processing').length
  const completed = queues.filter((q) => q.status === 'completed').length
  const waits = queues.filter((q) => q.actualWait != null).map((q) => q.actualWait as number)
  const avgWait = waits.length > 0 ? Math.round(waits.reduce((s, w) => s + w, 0) / waits.length) : 0
  const longestWait = waits.length > 0 ? Math.max(...waits) : 0

  const pdf = new PdfReport('landscape')
  pdf.addHeader()
  pdf.addTitle('Depot Queue Report')
  pdf.addSubtitle(buildPdfSubtitle(params))
  pdf.addKPICards([
    { label: 'Total in Queue', value: String(totalInQueue) },
    { label: 'Waiting', value: String(waiting) },
    { label: 'Processing', value: String(processing) },
    { label: 'Completed', value: String(completed) },
    { label: 'Avg Wait (min)', value: String(avgWait) },
    { label: 'Longest Wait', value: `${longestWait} min` },
  ])

  const headers = ['Truck', 'Driver', 'Trip #', 'Depot Name', 'Queue Type', 'Position', 'Status', 'Joined At', 'Started At', 'Completed At', 'Wait (min)', 'Est Wait (min)', 'Notes']
  const rows = queues.map((q) => [
    q.truck.plateNumber,
    q.driver ? `${q.driver.firstName} ${q.driver.lastName}` : '-',
    q.trip?.tripNumber ?? '-',
    q.depotName,
    q.queueType.replace(/_/g, ' ').replace(/\b\w/g, (c: string) => c.toUpperCase()),
    q.position != null ? String(q.position) : '-',
    q.status.replace(/_/g, ' ').replace(/\b\w/g, (c: string) => c.toUpperCase()),
    fmtDateTime(q.joinedAt),
    fmtDateTime(q.startedAt) || '-',
    fmtDateTime(q.completedAt) || '-',
    q.actualWait != null ? String(q.actualWait) : '-',
    q.estimatedWait != null ? String(q.estimatedWait) : '-',
    q.notes ?? '-',
  ])

  pdf.addTable(headers, rows, {
    summaryRow: {
      label: 'TOTAL',
      values: ['', '', '', '', '', '', `${waiting} waiting / ${processing} active / ${completed} done`, '', '', '', String(avgWait), '', ''],
    },
    columnStyles: { 10: { halign: 'right' }, 11: { halign: 'right' } },
  })
  pdf.addFooter()

  return pdf.pdf
}

// ════════════════════════════════════════════════════════════════════
// 12. LOAD BOARD / FREIGHT MATCHING REPORT
// ════════════════════════════════════════════════════════════════════

export async function buildLoadBoardReportPdf(params: ReportParams): Promise<jsPDF> {
  const dateFilter: Record<string, unknown> = {}
  if (params.dateFrom) dateFilter.gte = new Date(params.dateFrom)
  if (params.dateTo) dateFilter.lte = new Date(params.dateTo)

  const where: Record<string, unknown> = {}
  if (Object.keys(dateFilter).length > 0) where.createdAt = dateFilter
  if (params.status) where.status = params.status
  if ((params as Record<string, string | undefined>).pickupRegion) {
    where.pickupRegion = (params as Record<string, string | undefined>).pickupRegion
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

  const totalPosts = loads.length
  const open = loads.filter((l) => l.status === 'open').length
  const assigned = loads.filter((l) => l.status === 'assigned').length
  const completed = loads.filter((l) => l.status === 'completed').length
  const cancelled = loads.filter((l) => l.status === 'cancelled').length
  const ratedLoads = loads.filter((l) => l.offeredRate != null)
  const avgRate = ratedLoads.length > 0 ? ratedLoads.reduce((s, l) => s + (l.offeredRate ?? 0), 0) / ratedLoads.length : 0
  const totalValue = ratedLoads.reduce((s, l) => s + (l.offeredRate ?? 0), 0)

  const pdf = new PdfReport('landscape')
  pdf.addHeader()
  pdf.addTitle('Load Board / Freight Matching Report')
  pdf.addSubtitle(buildPdfSubtitle(params))
  pdf.addKPICards([
    { label: 'Total Posts', value: String(totalPosts) },
    { label: 'Open', value: String(open) },
    { label: 'Assigned', value: String(assigned) },
    { label: 'Completed', value: String(completed) },
    { label: 'Cancelled', value: String(cancelled) },
    { label: 'Avg Rate', value: formatGHS(avgRate) },
    { label: 'Total Value', value: formatGHS(totalValue) },
  ])

  const headers = ['Date', 'Client', 'Pickup', 'Dropoff', 'Commodity', 'Weight', 'Truck Type', 'Rate (GHS)', 'Budget', 'Status', 'Assigned Truck', 'Assigned Driver', 'Contact']
  const rows = loads.map((l) => [
    fmtDate(l.createdAt),
    l.client?.companyName ?? '-',
    l.pickupLocation,
    l.dropoffLocation,
    l.commodityType,
    l.weight ? `${l.weight} kg` : '-',
    l.truckType ?? '-',
    formatGHS(l.offeredRate ?? 0),
    l.budgetMin != null ? `${formatGHS(l.budgetMin)} - ${formatGHS(l.budgetMax ?? 0)}` : '-',
    l.status.replace(/_/g, ' ').replace(/\b\w/g, (c: string) => c.toUpperCase()),
    l.assignedTruck?.plateNumber ?? '-',
    l.assignedDriver ? `${l.assignedDriver.firstName} ${l.assignedDriver.lastName}` : '-',
    l.contactName ? `${l.contactName} (${l.contactPhone ?? ''})` : '-',
  ])

  pdf.addTable(headers, rows, {
    summaryRow: {
      label: 'TOTAL',
      values: ['', '', '', '', '', '', '', formatGHS(totalValue), '', `${open} open / ${assigned} assigned / ${completed} done`, '', '', ''],
    },
    columnStyles: { 7: { halign: 'right' } },
  })
  pdf.addFooter()

  return pdf.pdf
}

// ════════════════════════════════════════════════════════════════════
// 13. FUEL ANOMALY DETECTION REPORT
// ════════════════════════════════════════════════════════════════════

export async function buildFuelAnomalyReportPdf(params: ReportParams): Promise<jsPDF> {
  const dateFilter: Record<string, unknown> = {}
  if (params.dateFrom) dateFilter.gte = new Date(params.dateFrom)
  if (params.dateTo) dateFilter.lte = new Date(params.dateTo)

  const where: Record<string, unknown> = {}
  if (Object.keys(dateFilter).length > 0) where.date = dateFilter
  if (params.truckId) where.truckId = params.truckId

  const fuelLogs = await db.fuelLog.findMany({
    where,
    include: {
      truck: { select: { plateNumber: true, tankCapacity: true } },
      trip: { select: { tripNumber: true, startMileage: true, endMileage: true, totalMileage: true } },
    },
    orderBy: { date: 'desc' },
  })

  // Calculate fleet averages for anomaly detection
  const allCostPerKm: number[] = []
  const allLitersPer100km: number[] = []

  // Process each fuel log to calculate derived metrics
  const enrichedLogs = fuelLogs.map((f) => {
    const costPerLiter = f.costPerLiter ?? (f.litersFilled > 0 ? f.totalCost / f.litersFilled : 0)
    const odometer = f.odometer ?? 0
    const mileage = f.trip?.totalMileage ?? 0

    // Calculate cost per km if we have trip mileage
    const costPerKm = mileage > 0 ? f.totalCost / mileage : 0

    // Estimate liters per 100km
    const litersPer100km = mileage > 0 ? (f.litersFilled / mileage) * 100 : 0

    if (costPerKm > 0) allCostPerKm.push(costPerKm)
    if (litersPer100km > 0) allLitersPer100km.push(litersPer100km)

    return {
      ...f,
      costPerLiter,
      costPerKm,
      litersPer100km,
    }
  })

  // Fleet averages
  const fleetAvgCostPerKm = allCostPerKm.length > 0
    ? allCostPerKm.reduce((s, v) => s + v, 0) / allCostPerKm.length
    : 0
  const fleetAvgLitersPer100km = allLitersPer100km.length > 0
    ? allLitersPer100km.reduce((s, v) => s + v, 0) / allLitersPer100km.length
    : 0

  // Anomaly thresholds (1.5x fleet average)
  const costPerKmThreshold = fleetAvgCostPerKm * 1.5
  const litersPer100kmThreshold = fleetAvgLitersPer100km * 1.5

  // Determine anomaly status for each log
  const classifiedLogs = enrichedLogs.map((log) => {
    let status = 'Normal'
    const warnings: string[] = []

    if (log.costPerKm > 0 && log.costPerKm > costPerKmThreshold) {
      warnings.push('High cost/km')
    }
    if (log.litersPer100km > 0 && log.litersPer100km > litersPer100kmThreshold) {
      warnings.push('High consumption')
    }
    // Check if fuel fill exceeds 90% of tank capacity (possible theft indicator)
    if (log.truck.tankCapacity && log.litersFilled > log.truck.tankCapacity * 0.95) {
      warnings.push('Over-fill')
    }

    if (warnings.length >= 2) {
      status = 'Anomaly'
    } else if (warnings.length === 1) {
      status = 'Warning'
    }

    return { ...log, anomalyStatus: status, warnings }
  })

  const totalRecords = classifiedLogs.length
  const anomaliesDetected = classifiedLogs.filter((l) => l.anomalyStatus === 'Anomaly').length
  const overConsumption = classifiedLogs.filter((l) => l.litersPer100km > litersPer100kmThreshold).length
  const totalExcessCost = classifiedLogs
    .filter((l) => l.costPerKm > costPerKmThreshold && l.costPerKm > 0)
    .reduce((s, l) => s + (l.costPerKm - fleetAvgCostPerKm) * (l.trip?.totalMileage ?? 0), 0)
  const avgCostKm = allCostPerKm.length > 0
    ? allCostPerKm.reduce((s, v) => s + v, 0) / allCostPerKm.length
    : 0
  const avgLiters100km = allLitersPer100km.length > 0
    ? allLitersPer100km.reduce((s, v) => s + v, 0) / allLitersPer100km.length
    : 0

  const pdf = new PdfReport('landscape')
  pdf.addHeader()
  pdf.addTitle('Fuel Anomaly Detection Report')
  pdf.addSubtitle(buildPdfSubtitle(params))
  pdf.addKPICards([
    { label: 'Total Records', value: String(totalRecords) },
    { label: 'Anomalies', value: String(anomaliesDetected) },
    { label: 'Over-consumption', value: String(overConsumption) },
    { label: 'Excess Cost', value: formatGHS(totalExcessCost) },
    { label: 'Avg Cost/km', value: formatGHS(avgCostKm) },
    { label: 'Avg L/100km', value: avgLiters100km.toFixed(1) },
  ])

  // Apply filter for anomalyStatus if provided
  let filteredLogs = classifiedLogs
  const anomalyParam = (params as Record<string, string | undefined>).anomalyStatus
  if (anomalyParam) {
    filteredLogs = classifiedLogs.filter((l) => l.anomalyStatus === anomalyParam)
  }

  const headers = ['Date', 'Truck', 'Trip #', 'Odometer', 'Liters', 'Cost (GHS)', 'Cost/Liter', 'L/100km', 'Cost/km', 'Station', 'Status']
  const rows = filteredLogs.map((f) => [
    fmtDate(f.date),
    f.truck.plateNumber,
    f.trip?.tripNumber ?? '-',
    formatNumber(f.odometer ?? 0),
    formatNumber(f.litersFilled),
    formatGHS(f.totalCost),
    formatGHS(f.costPerLiter),
    f.litersPer100km > 0 ? f.litersPer100km.toFixed(1) : '-',
    f.costPerKm > 0 ? formatGHS(f.costPerKm) : '-',
    f.stationName ?? '-',
    f.anomalyStatus,
  ])

  const totalLiters = fuelLogs.reduce((s, f) => s + f.litersFilled, 0)
  const totalCost = fuelLogs.reduce((s, f) => s + f.totalCost, 0)

  pdf.addTable(headers, rows, {
    summaryRow: {
      label: 'TOTAL',
      values: ['', '', '', '', formatNumber(totalLiters), formatGHS(totalCost), '', `${avgLiters100km.toFixed(1)} avg`, formatGHS(avgCostKm), '', `${anomaliesDetected} anomalies`],
    },
    columnStyles: { 4: { halign: 'right' }, 5: { halign: 'right' }, 6: { halign: 'right' }, 8: { halign: 'right' } },
  })
  pdf.addFooter()

  return pdf.pdf
}

// ════════════════════════════════════════════════════════════════════
// 14. COST ANALYTICS REPORT
// ════════════════════════════════════════════════════════════════════

export async function buildCostAnalyticsReportPdf(params: ReportParams): Promise<jsPDF> {
  const dateFilter: Record<string, unknown> = {}
  if (params.dateFrom) dateFilter.gte = new Date(params.dateFrom)
  if (params.dateTo) dateFilter.lte = new Date(params.dateTo)

  const truckWhere: Record<string, unknown> = {}
  if (params.truckId) truckWhere.id = params.truckId

  const trucks = await db.truck.findMany({
    where: truckWhere,
    include: {
      FuelLog: {
        where: Object.keys(dateFilter).length > 0 ? { date: dateFilter } : undefined,
        select: { totalCost: true, litersFilled: true },
      },
      MaintenanceRecord: {
        where: Object.keys(dateFilter).length > 0 ? { performedAt: dateFilter } : undefined,
        select: { cost: true },
      },
      Expense: {
        where: {
          ...(Object.keys(dateFilter).length > 0 ? { date: dateFilter } : {}),
          category: { not: 'fuel' },
        },
        select: { amount: true },
      },
      trips: {
        where: {
          status: 'completed',
          ...(Object.keys(dateFilter).length > 0 ? { departureTime: dateFilter } : {}),
        },
        select: { totalMileage: true, quantity: true, unit: true },
      },
    },
    orderBy: { plateNumber: 'asc' },
  })

  const AVG_KM_PER_LITER = 4.0

  const truckRows: (string | number)[][] = []
  let grandTotalCost = 0
  let grandTotalDistance = 0
  let grandTotalTonnage = 0

  for (const t of trucks) {
    const fuelCost = t.FuelLog.reduce((s, f) => s + f.totalCost, 0)
    const totalLiters = t.FuelLog.reduce((s, f) => s + f.litersFilled, 0)
    const maintCost = t.MaintenanceRecord.reduce((s, m) => s + (m.cost ?? 0), 0)
    const otherCost = t.Expense.reduce((s, e) => s + e.amount, 0)
    const totalCost = fuelCost + maintCost + otherCost

    const distance = t.Trip.reduce((s, tr) => s + (tr.totalMileage ?? 0), 0)
    // Fallback: estimate distance from fuel if no trips
    const estimatedDistance = totalLiters > 0 && distance === 0 ? totalLiters * AVG_KM_PER_LITER : distance
    const tonnage = t.Trip.reduce((s, tr) => s + (tr.unit === 'tonnes' ? tr.quantity : tr.quantity / 1000), 0)

    const costPerKm = estimatedDistance > 0 ? totalCost / estimatedDistance : 0
    const costPerTonne = tonnage > 0 ? totalCost / tonnage : 0

    grandTotalCost += totalCost
    grandTotalDistance += estimatedDistance
    grandTotalTonnage += tonnage

    truckRows.push([
      t.plateNumber,
      t.make,
      formatGHS(fuelCost),
      formatGHS(maintCost),
      formatGHS(otherCost),
      formatGHS(totalCost),
      formatNumber(estimatedDistance),
      formatNumber(tonnage),
      formatGHS(costPerKm),
      formatGHS(costPerTonne),
    ])
  }

  const truckCount = trucks.length
  const avgCostPerKm = grandTotalDistance > 0 ? grandTotalCost / grandTotalDistance : 0
  const avgCostPerTonne = grandTotalTonnage > 0 ? grandTotalCost / grandTotalTonnage : 0

  const pdf = new PdfReport('landscape')
  pdf.addHeader()
  pdf.addTitle('Cost Analytics Report')
  pdf.addSubtitle(buildPdfSubtitle(params))
  pdf.addKPICards([
    { label: 'Truck Count', value: String(truckCount) },
    { label: 'Total Costs', value: formatGHS(grandTotalCost) },
    { label: 'Total Distance', value: formatNumber(grandTotalDistance) + ' km' },
    { label: 'Avg Cost/km', value: formatGHS(avgCostPerKm) },
    { label: 'Total Tonnage', value: formatNumber(grandTotalTonnage) + ' t' },
    { label: 'Avg Cost/Tonne', value: formatGHS(avgCostPerTonne) },
  ])

  const headers = ['Truck', 'Make', 'Fuel (GHS)', 'Maint (GHS)', 'Other (GHS)', 'Total (GHS)', 'Distance (km)', 'Tonnes', 'Cost/km', 'Cost/Ton']

  pdf.addTable(headers, truckRows, {
    summaryRow: {
      label: 'TOTAL',
      values: ['', '', formatGHS(grandTotalCost), '', '', formatGHS(grandTotalCost), formatNumber(grandTotalDistance), formatNumber(grandTotalTonnage), formatGHS(avgCostPerKm), formatGHS(avgCostPerTonne)],
    },
    columnStyles: { 2: { halign: 'right' }, 3: { halign: 'right' }, 4: { halign: 'right' }, 5: { halign: 'right' }, 6: { halign: 'right' }, 7: { halign: 'right' }, 8: { halign: 'right' }, 9: { halign: 'right' } },
  })
  pdf.addFooter()

  return pdf.pdf
}

// ════════════════════════════════════════════════════════════════════
// 15. TRIP PROFITABILITY REPORT
// ════════════════════════════════════════════════════════════════════

export async function buildTripProfitabilityReportPdf(params: ReportParams): Promise<jsPDF> {
  const dateFilter: Record<string, unknown> = {}
  if (params.dateFrom) dateFilter.gte = new Date(params.dateFrom)
  if (params.dateTo) dateFilter.lte = new Date(params.dateTo)

  const where: Record<string, unknown> = {
    status: 'completed',
  }
  if (Object.keys(dateFilter).length > 0) where.departureTime = dateFilter
  if (params.truckId) where.truckId = params.truckId
  if (params.driverId) where.driverId = params.driverId

  const trips = await db.trip.findMany({
    where,
    include: {
      driver: { select: { firstName: true, lastName: true } },
      truck: { select: { plateNumber: true } },
      fuelLogs: { select: { totalCost: true } },
      expenses: { select: { amount: true } },
    },
    orderBy: { departureTime: 'desc' },
  })

  const rows: (string | number)[][] = []
  let totalRevenue = 0
  let totalProfit = 0
  let totalFuelCost = 0
  let totalExpensesCost = 0
  let profitableCount = 0
  let lossCount = 0

  for (const t of trips) {
    const revenue = t.totalRevenue ?? 0
    const fuelCost = t.FuelLog.reduce((s, f) => s + f.totalCost, 0) + (t.fuelCost ?? 0)
    const expCost = t.Expense.reduce((s, e) => s + e.amount, 0)
    const totalCost = fuelCost + expCost
    const profit = revenue - totalCost
    const margin = revenue > 0 ? (profit / revenue) * 100 : 0

    totalRevenue += revenue
    totalFuelCost += fuelCost
    totalExpensesCost += expCost
    totalProfit += profit

    if (profit > 0) profitableCount++
    else if (profit < 0) lossCount++

    rows.push([
      t.tripNumber,
      fmtDate(t.departureTime),
      `${t.driver.firstName} ${t.driver.lastName}`,
      t.truck.plateNumber,
      `${t.loadingLocation} → ${t.destination}`,
      formatGHS(revenue),
      formatGHS(fuelCost),
      formatGHS(expCost),
      formatGHS(totalCost),
      formatGHS(profit),
      `${margin.toFixed(1)}%`,
    ])
  }

  const avgMargin = totalRevenue > 0 ? (totalProfit / totalRevenue) * 100 : 0

  const pdf = new PdfReport('landscape')
  pdf.addHeader()
  pdf.addTitle('Trip Profitability Report')
  pdf.addSubtitle(buildPdfSubtitle(params))
  pdf.addKPICards([
    { label: 'Total Trips', value: String(trips.length) },
    { label: 'Total Revenue', value: formatGHS(totalRevenue) },
    { label: 'Total Profit', value: formatGHS(totalProfit) },
    { label: 'Avg Margin', value: `${avgMargin.toFixed(1)}%` },
    { label: 'Profitable Trips', value: String(profitableCount) },
    { label: 'Loss Trips', value: String(lossCount) },
  ])

  const headers = ['Trip #', 'Date', 'Driver', 'Truck', 'Route', 'Revenue', 'Fuel', 'Expenses', 'Total Cost', 'Profit', 'Margin']

  pdf.addTable(headers, rows, {
    summaryRow: {
      label: 'TOTAL',
      values: ['', '', '', '', '', formatGHS(totalRevenue), formatGHS(totalFuelCost), formatGHS(totalExpensesCost), formatGHS(totalFuelCost + totalExpensesCost), formatGHS(totalProfit), `${avgMargin.toFixed(1)}%`],
    },
    columnStyles: { 5: { halign: 'right' }, 6: { halign: 'right' }, 7: { halign: 'right' }, 8: { halign: 'right' }, 9: { halign: 'right' } },
  })
  pdf.addFooter()

  return pdf.pdf
}

// ════════════════════════════════════════════════════════════════════
// 16. FUEL ANALYTICS REPORT
// ════════════════════════════════════════════════════════════════════

export async function buildFuelAnalyticsReportPdf(params: ReportParams): Promise<jsPDF> {
  const dateFilter: Record<string, unknown> = {}
  if (params.dateFrom) dateFilter.gte = new Date(params.dateFrom)
  if (params.dateTo) dateFilter.lte = new Date(params.dateTo)

  const where: Record<string, unknown> = {}
  if (Object.keys(dateFilter).length > 0) where.date = dateFilter
  if (params.truckId) where.truckId = params.truckId

  const fuelLogs = await db.fuelLog.findMany({
    where,
    include: {
      truck: { select: { plateNumber: true } },
    },
    orderBy: { date: 'desc' },
  })

  // Group by truck
  const truckMap = new Map<string, { plateNumber: string; liters: number; cost: number; count: number }>()
  for (const f of fuelLogs) {
    const existing = truckMap.get(f.truckId) ?? { plateNumber: f.truck.plateNumber, liters: 0, cost: 0, count: 0 }
    existing.liters += f.litersFilled
    existing.cost += f.totalCost
    existing.count += 1
    truckMap.set(f.truckId, existing)
  }

  const truckRows: (string | number)[][] = []
  let grandTotalLiters = 0
  let grandTotalCost = 0

  const sortedTrucks = [...truckMap.values()].sort((a, b) => a.plateNumber.localeCompare(b.plateNumber))
  for (const t of sortedTrucks) {
    const avgCostPerLiter = t.liters > 0 ? t.cost / t.liters : 0
    const avgFill = t.count > 0 ? t.liters / t.count : 0
    grandTotalLiters += t.liters
    grandTotalCost += t.cost

    truckRows.push([
      t.plateNumber,
      formatNumber(t.liters),
      formatGHS(t.cost),
      formatGHS(avgCostPerLiter),
      String(t.count),
      formatNumber(avgFill),
    ])
  }

  // Group by station
  const stationMap = new Map<string, { liters: number; cost: number; count: number }>()
  for (const f of fuelLogs) {
    const station = f.stationName ?? 'Unknown'
    const existing = stationMap.get(station) ?? { liters: 0, cost: 0, count: 0 }
    existing.liters += f.litersFilled
    existing.cost += f.totalCost
    existing.count += 1
    stationMap.set(station, existing)
  }

  const stationRows: (string | number)[][] = []
  const sortedStations = [...stationMap.entries()].sort((a, b) => b[1].cost - a[1].cost)
  for (const [station, data] of sortedStations) {
    const avgCostPerLiter = data.liters > 0 ? data.cost / data.liters : 0
    stationRows.push([
      station,
      formatNumber(data.liters),
      formatGHS(data.cost),
      formatGHS(avgCostPerLiter),
      String(data.count),
    ])
  }

  const uniqueTrucks = truckMap.size
  const avgCostPerLiter = grandTotalLiters > 0 ? grandTotalCost / grandTotalLiters : 0

  const pdf = new PdfReport('landscape')
  pdf.addHeader()
  pdf.addTitle('Fuel Analytics Report')
  pdf.addSubtitle(buildPdfSubtitle(params))
  pdf.addKPICards([
    { label: 'Total Records', value: String(fuelLogs.length) },
    { label: 'Total Liters', value: formatNumber(grandTotalLiters) },
    { label: 'Total Cost', value: formatGHS(grandTotalCost) },
    { label: 'Avg Cost/Liter', value: formatGHS(avgCostPerLiter) },
    { label: 'Unique Trucks', value: String(uniqueTrucks) },
  ])

  const truckHeaders = ['Truck', 'Liters', 'Cost (GHS)', 'Avg Cost/L', 'Fill-ups', 'Avg Fill (L)']

  pdf.addTable(truckHeaders, truckRows, {
    summaryRow: {
      label: 'TOTAL',
      values: ['', formatNumber(grandTotalLiters), formatGHS(grandTotalCost), formatGHS(avgCostPerLiter), String(fuelLogs.length), ''],
    },
    columnStyles: { 1: { halign: 'right' }, 2: { halign: 'right' }, 3: { halign: 'right' }, 5: { halign: 'right' } },
  })

  // Station breakdown table
  if (stationRows.length > 0) {
    const stationHeaders = ['Station', 'Liters', 'Cost (GHS)', 'Avg Cost/L', 'Transactions']
    pdf.addTable(stationHeaders, stationRows, {
      summaryRow: {
        label: 'TOTAL',
        values: ['', formatNumber(grandTotalLiters), formatGHS(grandTotalCost), formatGHS(avgCostPerLiter), String(fuelLogs.length)],
      },
      columnStyles: { 1: { halign: 'right' }, 2: { halign: 'right' }, 3: { halign: 'right' } },
    })
  }

  pdf.addFooter()

  return pdf.pdf
}

// ════════════════════════════════════════════════════════════════════
// 17. SAFETY SCORING REPORT
// ════════════════════════════════════════════════════════════════════

export async function buildSafetyScoringReportPdf(params: ReportParams): Promise<jsPDF> {
  const dateFilter: Record<string, unknown> = {}
  if (params.dateFrom) dateFilter.gte = new Date(params.dateFrom)
  if (params.dateTo) dateFilter.lte = new Date(params.dateTo)

  const driverWhere: Record<string, unknown> = {}
  if (params.driverId) driverWhere.id = params.driverId

  const drivers = await db.driver.findMany({
    where: driverWhere,
    include: {
      Trip: {
        where: Object.keys(dateFilter).length > 0 ? { departureTime: dateFilter } : undefined,
        select: { id: true, totalMileage: true, status: true },
      },
      trackingAlerts: {
        where: {
          type: { in: ['speeding', 'route_deviation', 'idle'] },
          ...(Object.keys(dateFilter).length > 0 ? { createdAt: dateFilter } : {}),
        },
        select: { id: true, type: true, createdAt: true },
      },
    },
    orderBy: { firstName: 'asc' },
  })

  function getGrade(score: number): string {
    if (score >= 97) return 'A+'
    if (score >= 93) return 'A'
    if (score >= 90) return 'A-'
    if (score >= 87) return 'B+'
    if (score >= 83) return 'B'
    if (score >= 80) return 'B-'
    if (score >= 77) return 'C+'
    if (score >= 73) return 'C'
    if (score >= 70) return 'C-'
    if (score >= 67) return 'D+'
    if (score >= 63) return 'D'
    if (score >= 60) return 'D-'
    return 'F'
  }

  function getTrend(alerts: { createdAt: Date }[]): string {
    if (alerts.length < 2) return '-'
    const recent = alerts.filter((a) => a.createdAt > new Date(Date.now() - 14 * 24 * 60 * 60 * 1000)).length
    const older = alerts.length - recent
    if (recent > older) return '↑ Worsening'
    if (recent < older) return '↓ Improving'
    return '→ Stable'
  }

  interface DriverScore {
    driverId: string
    firstName: string
    lastName: string
    employeeId: string
    phone: string
    score: number
    grade: string
    trips: number
    distance: number
    violations: number
    incidents: number
    trend: string
  }

  const scoredDrivers: DriverScore[] = []
  let highestScore = 0
  let lowestScore = 100
  let apPlusCount = 0
  let atRiskCount = 0

  for (const d of drivers) {
    const completedTrips = d.Trip.filter((t) => t.status === 'completed')
    const tripCount = completedTrips.length
    const distance = completedTrips.reduce((s, t) => s + (t.totalMileage ?? 0), 0)

    const violations = d.trackingAlerts.filter((a) => a.type === 'speeding' || a.type === 'route_deviation').length
    const incidents = d.trackingAlerts.filter((a) => a.type === 'idle').length

    // Safety score: start at 100, deduct for violations and incidents
    let score = 100
    score -= Math.min(violations * 5, 50)  // Each violation -5, max -50
    score -= Math.min(incidents * 3, 30)   // Each incident -3, max -30
    score = Math.max(0, Math.min(100, score))

    const grade = getGrade(score)
    const trend = getTrend(d.trackingAlerts)

    if (score > highestScore) highestScore = score
    if (score < lowestScore) lowestScore = score
    if (score >= 97) apPlusCount++
    if (score < 50) atRiskCount++

    scoredDrivers.push({
      driverId: d.id,
      firstName: d.firstName,
      lastName: d.lastName,
      employeeId: d.employeeId,
      phone: d.phone,
      score,
      grade,
      trips: tripCount,
      distance,
      violations,
      incidents,
      trend,
    })
  }

  // Sort by score descending
  scoredDrivers.sort((a, b) => b.score - a.score)

  const rows: (string | number)[][] = scoredDrivers.map((d, i) => [
    String(i + 1),
    `${d.firstName} ${d.lastName}`,
    d.employeeId,
    d.phone,
    String(d.score),
    d.grade,
    String(d.Trip),
    formatNumber(d.distance),
    String(d.violations),
    d.trend,
  ])

  const avgScore = scoredDrivers.length > 0
    ? scoredDrivers.reduce((s, d) => s + d.score, 0) / scoredDrivers.length
    : 0

  const pdf = new PdfReport('landscape')
  pdf.addHeader()
  pdf.addTitle('Safety Scoring Report')
  pdf.addSubtitle(buildPdfSubtitle(params))
  pdf.addKPICards([
    { label: 'Total Drivers', value: String(scoredDrivers.length) },
    { label: 'Avg Score', value: String(avgScore.toFixed(1)) },
    { label: 'Highest Score', value: String(highestScore) },
    { label: 'Lowest Score', value: String(lowestScore) },
    { label: 'A+ Drivers', value: String(apPlusCount) },
    { label: 'At-Risk (<50)', value: String(atRiskCount) },
  ])

  const headers = ['Rank', 'Driver', 'Employee ID', 'Phone', 'Score', 'Grade', 'Trips', 'Distance (km)', 'Violations', 'Trend']

  pdf.addTable(headers, rows, {
    summaryRow: {
      label: 'AVERAGE',
      values: ['', '', '', '', String(avgScore.toFixed(1)), '', '', '', '', ''],
    },
    columnStyles: { 4: { halign: 'right' }, 6: { halign: 'right' }, 7: { halign: 'right' }, 8: { halign: 'right' } },
  })
  pdf.addFooter()

  return pdf.pdf
}
