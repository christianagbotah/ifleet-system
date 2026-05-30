// ════════════════════════════════════════════════════════════════════
// iFleetPro — Unified Data Export API  (brand: see src/lib/constants.ts APP_NAME)
// ════════════════════════════════════════════════════════════════════
//
// GET /api/export?type=trucks&format=csv&status=active
// GET /api/export?type=drivers&format=csv
// GET /api/export?type=trips&format=csv&status=completed
// GET /api/export?type=fuel-logs&format=csv&truckId=xxx
// GET /api/export?type=expenses&format=csv&startDate=2026-01-01
// GET /api/export?type=payroll&format=csv&month=4&year=2026
// GET /api/export?type=insurance&format=csv
// GET /api/export?type=maintenance&format=csv
//
// Returns CSV file with Content-Disposition for download.
// ────────────────────────────────────────────────────────────────────

import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { requireAuth, requireWriteAccess, type AuthContext } from '@/lib/auth-server'
import {
  generateCSV,
  formatDate,
  formatDateTime,
  formatCurrency,
} from '@/lib/export'
import { APP_NAME } from '@/lib/constants'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

const MAX_EXPORT_RECORDS = 10000

type ExportType =
  | 'trucks'
  | 'drivers'
  | 'trips'
  | 'fuel-logs'
  | 'expenses'
  | 'payroll'
  | 'insurance'
  | 'maintenance'

function csvResponse(csv: string, filename: string): NextResponse {
  return new NextResponse(csv, {
    headers: {
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': `attachment; filename="${filename}"`,
      'Cache-Control': 'no-cache',
    },
  })
}

// ────────────────────────────────────────────────────────────────────
// Export handlers per entity type
// ────────────────────────────────────────────────────────────────────

async function exportTrucks(params: URLSearchParams, auth: Awaited<ReturnType<typeof requireAuth>>) {
  const status = params.get('status')
  const search = params.get('search')

  const where: Record<string, unknown> = {}
  if (status) where.status = status
  if (search) {
    where.OR = [
      { plateNumber: { contains: search } },
      { make: { contains: search } },
      { vinNumber: { contains: search } },
    ]
  }

  const trucks = await db.truck.findMany({
    where,
    take: MAX_EXPORT_RECORDS,
    include: {
      driver: { select: { firstName: true, lastName: true } },
    },
    orderBy: { createdAt: 'desc' },
  })

  const headers = [
    'Plate Number',
    'Make',
    'Model',
    'Year',
    'Status',
    'Fuel Type',
    'Mileage (km)',
    'Assigned Driver',
    'Next Service Date',
    'Tank Capacity (L)',
    'Notes',
  ]

  const rows = trucks.map((t) => [
    t.plateNumber,
    t.make,
    t.model,
    String(t.year),
    t.status,
    t.fuelType,
    formatCurrency(t.currentMileage),
    t.driver ? `${t.driver.firstName} ${t.driver.lastName}` : 'Unassigned',
    formatDate(t.nextServiceDate),
    t.tankCapacity ? String(t.tankCapacity) : '',
    t.notes || '',
  ])

  return csvResponse(generateCSV(headers, rows), `fleetpro-trucks-${Date.now()}.csv`)
}

async function exportDrivers(params: URLSearchParams, auth: AuthContext) {
  const status = params.get('status')
  const search = params.get('search')

  const where: Record<string, unknown> = {}
  if (status) where.status = status
  if (search) {
    where.OR = [
      { firstName: { contains: search } },
      { lastName: { contains: search } },
      { phone: { contains: search } },
    ]
  }

  const drivers = await db.driver.findMany({
    where,
    take: MAX_EXPORT_RECORDS,
    orderBy: { createdAt: 'desc' },
  })

  const headers = [
    'First Name',
    'Last Name',
    'Phone',
    'Email',
    'License Number',
    'License Expiry',
    'License Class',
    'Verification Status',
    'Status',
    'Total Trips',
    'Total Mileage (km)',
    'Rating',
    'Hire Date',
  ]

  const rows = drivers.map((d) => [
    d.firstName,
    d.lastName,
    d.phone,
    d.email || '',
    d.licenseNumber,
    formatDate(d.licenseExpiry),
    d.licenseClass,
    d.verificationStatus,
    d.status,
    String(d.totalTrips),
    formatCurrency(d.totalMileage),
    String(d.rating),
    formatDate(d.hireDate),
  ])

  return csvResponse(generateCSV(headers, rows), `fleetpro-drivers-${Date.now()}.csv`)
}

async function exportTrips(params: URLSearchParams, auth: AuthContext) {
  const status = params.get('status')
  const startDate = params.get('startDate')
  const endDate = params.get('endDate')

  const where: Record<string, unknown> = {}
  if (status) where.status = status
  if (startDate || endDate) {
    const departureFilter: Record<string, unknown> = {}
    if (startDate) departureFilter.gte = new Date(startDate)
    if (endDate) departureFilter.lte = new Date(endDate)
    where.departureTime = departureFilter
  }

  const trips = await db.trip.findMany({
    where,
    take: MAX_EXPORT_RECORDS,
    include: {
      truck: { select: { plateNumber: true } },
      driver: { select: { firstName: true, lastName: true } },
    },
    orderBy: { departureTime: 'desc' },
  })

  const headers = [
    'Trip Number',
    'Truck',
    'Driver',
    'Loading Location',
    'Destination',
    'Cargo',
    'Quantity',
    'Unit',
    'Status',
    'Departure Time',
    'Revenue (\u20B5)',
    'Total Mileage (km)',
    'Customer',
  ]

  const rows = trips.map((t) => [
    t.tripNumber,
    t.truck.plateNumber,
    `${t.driver.firstName} ${t.driver.lastName}`,
    t.loadingLocation,
    t.destination,
    t.itemName,
    String(t.quantity),
    t.unit,
    t.status,
    formatDateTime(t.departureTime),
    formatCurrency(t.totalRevenue),
    formatCurrency(t.totalMileage),
    t.customerName || '',
  ])

  return csvResponse(generateCSV(headers, rows), `fleetpro-trips-${Date.now()}.csv`)
}

async function exportFuelLogs(params: URLSearchParams, auth: AuthContext) {
  const truckId = params.get('truckId')
  const startDate = params.get('startDate')
  const endDate = params.get('endDate')
  const fuelType = params.get('fuelType')

  const where: Record<string, unknown> = {}
  if (truckId) where.truckId = truckId
  if (fuelType) where.fuelType = fuelType
  if (startDate || endDate) {
    const dateFilter: Record<string, unknown> = {}
    if (startDate) dateFilter.gte = new Date(startDate)
    if (endDate) dateFilter.lte = new Date(endDate)
    where.date = dateFilter
  }

  const logs = await db.fuelLog.findMany({
    where,
    take: MAX_EXPORT_RECORDS,
    include: {
      truck: { select: { plateNumber: true } },
      trip: { select: { tripNumber: true } },
    },
    orderBy: { date: 'desc' },
  })

  const headers = [
    'Date',
    'Truck',
    'Trip',
    'Station Name',
    'Fuel Type',
    'Liters Filled',
    'Cost/Liter (\u20B5)',
    'Total Cost (\u20B5)',
    'Odometer (km)',
    'Receipt Number',
  ]

  const rows = logs.map((l) => [
    formatDate(l.date),
    l.truck.plateNumber,
    l.trip?.tripNumber || '',
    l.stationName || '',
    l.fuelType,
    formatCurrency(l.litersFilled),
    formatCurrency(l.costPerLiter),
    formatCurrency(l.totalCost),
    l.odometer ? String(l.odometer) : '',
    l.receiptNumber || '',
  ])

  return csvResponse(generateCSV(headers, rows), `fleetpro-fuel-logs-${Date.now()}.csv`)
}

async function exportExpenses(params: URLSearchParams, auth: AuthContext) {
  const truckId = params.get('truckId')
  const category = params.get('category')
  const startDate = params.get('startDate')
  const endDate = params.get('endDate')
  const status = params.get('status')

  const where: Record<string, unknown> = {}
  if (truckId) where.truckId = truckId
  if (category) where.category = category
  if (status) where.status = status
  if (startDate || endDate) {
    const dateFilter: Record<string, unknown> = {}
    if (startDate) dateFilter.gte = new Date(startDate)
    if (endDate) dateFilter.lte = new Date(endDate)
    where.date = dateFilter
  }

  const expenses = await db.expense.findMany({
    where,
    take: MAX_EXPORT_RECORDS,
    include: {
      truck: { select: { plateNumber: true } },
    },
    orderBy: { date: 'desc' },
  })

  const headers = [
    'Date',
    'Truck',
    'Category',
    'Description',
    'Amount (\u20B5)',
    'Payment Method',
    'Status',
    'Reference',
    'Approved By',
  ]

  const rows = expenses.map((e) => [
    formatDate(e.date),
    e.truck.plateNumber,
    e.category,
    e.description,
    formatCurrency(e.amount),
    e.paymentMethod,
    e.status,
    e.reference || '',
    e.approvedBy || '',
  ])

  return csvResponse(generateCSV(headers, rows), `fleetpro-expenses-${Date.now()}.csv`)
}

async function exportPayroll(params: URLSearchParams, auth: AuthContext) {
  const driverId = params.get('driverId')
  const month = params.get('month')
  const year = params.get('year')
  const status = params.get('status')

  const where: Record<string, unknown> = {}
  if (driverId) where.driverId = driverId
  if (month) where.month = parseInt(month)
  if (year) where.year = parseInt(year)
  if (status) where.status = status

  const records = await db.payroll.findMany({
    where,
    take: MAX_EXPORT_RECORDS,
    include: {
      driver: { select: { firstName: true, lastName: true } },
    },
    orderBy: [{ year: 'desc' }, { month: 'desc' }],
  })

  const headers = [
    'Driver',
    'Month',
    'Year',
    'Base Salary (\u20B5)',
    'Trip Bonus (\u20B5)',
    'Overtime Pay (\u20B5)',
    'Deductions (\u20B5)',
    'Net Pay (\u20B5)',
    'Status',
    'Paid At',
    'Notes',
  ]

  const rows = records.map((p) => [
    `${p.driver.firstName} ${p.driver.lastName}`,
    String(p.month),
    String(p.year),
    formatCurrency(p.baseSalary),
    formatCurrency(p.tripBonus),
    formatCurrency(p.overtimePay),
    formatCurrency(p.deductions),
    formatCurrency(p.netPay),
    p.status,
    formatDate(p.paidAt),
    p.notes || '',
  ])

  return csvResponse(generateCSV(headers, rows), `fleetpro-payroll-${Date.now()}.csv`)
}

async function exportInsurance(params: URLSearchParams, auth: AuthContext) {
  const truckId = params.get('truckId')
  const status = params.get('status')

  const where: Record<string, unknown> = {}
  if (truckId) where.truckId = truckId
  if (status) where.status = status

  const records = await db.insurance.findMany({
    where,
    take: MAX_EXPORT_RECORDS,
    include: {
      truck: { select: { plateNumber: true } },
    },
    orderBy: { createdAt: 'desc' },
  })

  const headers = [
    'Truck',
    'Provider',
    'Policy Number',
    'Type',
    'Cover Amount (\u20B5)',
    'Premium (\u20B5)',
    'Start Date',
    'End Date',
    'Status',
    'Renewal Reminder Sent',
    'Notes',
  ]

  const rows = records.map((i) => [
    i.truck.plateNumber,
    i.provider,
    i.policyNumber,
    i.type,
    formatCurrency(i.coverAmount),
    formatCurrency(i.premium),
    formatDate(i.startDate),
    formatDate(i.endDate),
    i.status,
    i.renewalReminderSent ? 'Yes' : 'No',
    i.notes || '',
  ])

  return csvResponse(generateCSV(headers, rows), `fleetpro-insurance-${Date.now()}.csv`)
}

async function exportMaintenance(params: URLSearchParams, auth: AuthContext) {
  const truckId = params.get('truckId')
  const type = params.get('type')
  const status = params.get('status')

  const where: Record<string, unknown> = {}
  if (truckId) where.truckId = truckId
  if (type) where.type = type
  if (status) where.status = status

  const records = await db.maintenanceRecord.findMany({
    where,
    take: MAX_EXPORT_RECORDS,
    include: {
      truck: { select: { plateNumber: true } },
    },
    orderBy: { performedAt: 'desc' },
  })

  const headers = [
    'Truck',
    'Type',
    'Title',
    'Description',
    'Cost (\u20B5)',
    'Performed By',
    'Performed At',
    'Odometer (km)',
    'Next Due Date',
    'Next Due Mileage (km)',
    'Status',
    'Notes',
  ]

  const rows = records.map((m) => [
    m.truck.plateNumber,
    m.type,
    m.title,
    m.description || '',
    formatCurrency(m.cost),
    m.performedBy || '',
    formatDate(m.performedAt),
    m.odometer ? String(m.odometer) : '',
    formatDate(m.nextDueDate),
    m.nextDueMileage ? String(m.nextDueMileage) : '',
    m.status,
    m.notes || '',
  ])

  return csvResponse(generateCSV(headers, rows), `fleetpro-maintenance-${Date.now()}.csv`)
}

// ────────────────────────────────────────────────────────────────────
// Main GET handler
// ────────────────────────────────────────────────────────────────────

const EXPORT_HANDLERS: Record<
  ExportType,
  (params: URLSearchParams, auth: AuthContext) => Promise<NextResponse>
> = {
  trucks: exportTrucks,
  drivers: exportDrivers,
  trips: exportTrips,
  'fuel-logs': exportFuelLogs,
  expenses: exportExpenses,
  payroll: exportPayroll,
  insurance: exportInsurance,
  maintenance: exportMaintenance,
}

const VALID_EXPORT_TYPES = Object.keys(EXPORT_HANDLERS)

export async function GET(request: NextRequest) {
  try {
    const auth = requireAuth(request)
    if (auth instanceof NextResponse) return auth

    const { searchParams } = new URL(request.url)
    const type = searchParams.get('type') as ExportType | null
    const format = searchParams.get('format') || 'csv'

    if (!type || !VALID_EXPORT_TYPES.includes(type)) {
      return NextResponse.json(
        {
          error: `Invalid export type. Supported: ${VALID_EXPORT_TYPES.join(', ')}`,
        },
        { status: 400 }
      )
    }

    if (format !== 'csv') {
      return NextResponse.json(
        { error: 'Only CSV format is currently supported' },
        { status: 400 }
      )
    }

    const handler = EXPORT_HANDLERS[type]
    return await handler(searchParams, auth)
  } catch (error) {
    console.error('Export error:', error)
    return NextResponse.json(
      { error: 'Failed to generate export' },
      { status: 500 }
    )
  }
}
