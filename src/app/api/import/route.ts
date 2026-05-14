// ════════════════════════════════════════════════════════════════════
// iFleetPro — Unified Data Import API  (brand: see src/lib/constants.ts APP_NAME)
// ════════════════════════════════════════════════════════════════════
//
// POST /api/import
// Body: FormData { type: string, data: string (JSON of parsed CSV rows) }
//
// Supported types: drivers, trucks, expenses, fuel-logs, maintenance
//
// Returns: { importedCount, errorCount, errors? }
// ────────────────────────────────────────────────────────────────────

import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { requireAuth } from '@/lib/auth-server'
import { APP_NAME } from '@/lib/constants'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

type ImportType = 'drivers' | 'trucks' | 'expenses' | 'fuel-logs' | 'maintenance'

interface ImportRow {
  [key: string]: string
}

interface RowError {
  row: number
  column?: string
  message: string
}

function trim(val: string | undefined | null): string {
  return (val || '').trim()
}

// ────────────────────────────────────────────────────────────────────
// Import: Drivers
// ────────────────────────────────────────────────────────────────────

async function importDrivers(rows: ImportRow[]) {
  const errors: RowError[] = []
  let importedCount = 0

  for (let i = 0; i < rows.length; i++) {
    const r = rows[i]
    const row = i + 1
    try {
      const firstName = trim(r['First Name'])
      const lastName = trim(r['Last Name'])
      const phone = trim(r['Phone'])
      const licenseNumber = trim(r['License Number'])
      const licenseExpiry = trim(r['License Expiry'])
      const licenseClass = trim(r['License Class'])

      // Required fields
      if (!firstName) { errors.push({ row, column: 'First Name', message: 'First Name is required' }); continue }
      if (!lastName) { errors.push({ row, column: 'Last Name', message: 'Last Name is required' }); continue }
      if (!phone) { errors.push({ row, column: 'Phone', message: 'Phone is required' }); continue }
      if (!licenseNumber) { errors.push({ row, column: 'License Number', message: 'License Number is required' }); continue }
      if (!licenseClass) { errors.push({ row, column: 'License Class', message: 'License Class is required' }); continue }

      // Check unique phone
      const existingPhone = await db.driver.findUnique({ where: { phone } })
      if (existingPhone) { errors.push({ row, column: 'Phone', message: `Driver with phone "${phone}" already exists` }); continue }

      // Check unique license number
      const existingLicense = await db.driver.findUnique({ where: { licenseNumber } })
      if (existingLicense) { errors.push({ row, column: 'License Number', message: `Driver with license "${licenseNumber}" already exists` }); continue }

      // Parse optional fields
      const email = trim(r['Email']) || null
      const status = trim(r['Status']) || 'active'
      const hireDate = trim(r['Hire Date'])

      const driverData: Record<string, unknown> = {
        firstName,
        lastName,
        phone,
        email: email || undefined,
        licenseNumber,
        licenseClass,
        licenseExpiry: licenseExpiry ? new Date(licenseExpiry) : new Date(),
        status: ['active', 'inactive', 'suspended'].includes(status) ? status : 'active',
        hireDate: hireDate ? new Date(hireDate) : new Date(),
      }

      await db.driver.create({ data: driverData as never })
      importedCount++
    } catch (err: unknown) {
      errors.push({ row, message: err instanceof Error ? err.message : 'Unknown error' })
    }
  }

  return { importedCount, errorCount: errors.length, errors }
}

// ────────────────────────────────────────────────────────────────────
// Import: Trucks
// ────────────────────────────────────────────────────────────────────

async function importTrucks(rows: ImportRow[]) {
  const errors: RowError[] = []
  let importedCount = 0

  for (let i = 0; i < rows.length; i++) {
    const r = rows[i]
    const row = i + 1
    try {
      const plateNumber = trim(r['Plate Number'])
      const make = trim(r['Make'])
      const model = trim(r['Model'])
      const yearStr = trim(r['Year'])
      const fuelType = trim(r['Fuel Type'])

      // Required fields
      if (!plateNumber) { errors.push({ row, column: 'Plate Number', message: 'Plate Number is required' }); continue }
      if (!make) { errors.push({ row, column: 'Make', message: 'Make is required' }); continue }
      if (!model) { errors.push({ row, column: 'Model', message: 'Model is required' }); continue }
      if (!yearStr || isNaN(Number(yearStr))) { errors.push({ row, column: 'Year', message: 'Year must be a valid number' }); continue }
      if (!fuelType) { errors.push({ row, column: 'Fuel Type', message: 'Fuel Type is required' }); continue }

      // Check unique plate
      const existingPlate = await db.truck.findUnique({ where: { plateNumber } })
      if (existingPlate) { errors.push({ row, column: 'Plate Number', message: `Truck with plate "${plateNumber}" already exists` }); continue }

      // Parse optional fields
      const status = trim(r['Status'])
      const tankCapacityStr = trim(r['Tank Capacity (L)'])
      const mileageStr = trim(r['Mileage (km)'])
      const nextServiceStr = trim(r['Next Service Date'])
      const notes = trim(r['Notes'])
      const assignedDriverStr = trim(r['Assigned Driver'])

      // Look up driver by name if provided
      let driverId: string | undefined
      if (assignedDriverStr && assignedDriverStr !== 'Unassigned') {
        const parts = assignedDriverStr.split(' ')
        const whereClause = parts.length >= 2
          ? { firstName: parts[0], lastName: parts.slice(1).join(' ') }
          : { firstName: parts[0] }
        const driver = await db.driver.findFirst({ where: whereClause })
        if (driver) driverId = driver.id
      }

      const truckData: Record<string, unknown> = {
        plateNumber,
        make,
        model,
        year: parseInt(yearStr),
        fuelType,
        status: ['active', 'inactive', 'maintenance', 'decommissioned'].includes(status) ? status : 'active',
        tankCapacity: tankCapacityStr ? parseFloat(tankCapacityStr) : null,
        currentMileage: mileageStr ? parseFloat(mileageStr) : 0,
        nextServiceDate: nextServiceStr ? new Date(nextServiceStr) : null,
        notes: notes || null,
        driverId: driverId || null,
      }

      await db.truck.create({ data: truckData as never })
      importedCount++
    } catch (err: unknown) {
      errors.push({ row, message: err instanceof Error ? err.message : 'Unknown error' })
    }
  }

  return { importedCount, errorCount: errors.length, errors }
}

// ────────────────────────────────────────────────────────────────────
// Import: Expenses
// ────────────────────────────────────────────────────────────────────

async function importExpenses(rows: ImportRow[]) {
  const errors: RowError[] = []
  let importedCount = 0

  for (let i = 0; i < rows.length; i++) {
    const r = rows[i]
    const row = i + 1
    try {
      const date = trim(r['Date'])
      const truckPlate = trim(r['Truck'])
      const category = trim(r['Category'])
      const description = trim(r['Description'])
      const amountStr = trim(r['Amount (GHS)'])

      // Required fields
      if (!date) { errors.push({ row, column: 'Date', message: 'Date is required' }); continue }
      if (!truckPlate) { errors.push({ row, column: 'Truck', message: 'Truck plate number is required' }); continue }
      if (!category) { errors.push({ row, column: 'Category', message: 'Category is required' }); continue }
      if (!description) { errors.push({ row, column: 'Description', message: 'Description is required' }); continue }
      if (!amountStr || isNaN(Number(amountStr))) { errors.push({ row, column: 'Amount (GHS)', message: 'Amount must be a valid number' }); continue }

      // Look up truck
      const truck = await db.truck.findUnique({ where: { plateNumber: truckPlate } })
      if (!truck) { errors.push({ row, column: 'Truck', message: `Truck "${truckPlate}" not found` }); continue }

      const paymentMethod = trim(r['Payment Method'])
      const reference = trim(r['Reference'])

      await db.expense.create({
        data: {
          truckId: truck.id,
          date: new Date(date),
          category,
          description,
          amount: parseFloat(amountStr),
          paymentMethod: ['cash', 'mobile_money', 'bank_transfer'].includes(paymentMethod) ? paymentMethod : 'cash',
          reference: reference || null,
          status: 'approved',
        },
      })
      importedCount++
    } catch (err: unknown) {
      errors.push({ row, message: err instanceof Error ? err.message : 'Unknown error' })
    }
  }

  return { importedCount, errorCount: errors.length, errors }
}

// ────────────────────────────────────────────────────────────────────
// Import: Fuel Logs
// ────────────────────────────────────────────────────────────────────

async function importFuelLogs(rows: ImportRow[]) {
  const errors: RowError[] = []
  let importedCount = 0

  for (let i = 0; i < rows.length; i++) {
    const r = rows[i]
    const row = i + 1
    try {
      const date = trim(r['Date'])
      const truckPlate = trim(r['Truck'])
      const litersStr = trim(r['Liters Filled'])
      const totalCostStr = trim(r['Total Cost (GHS)'])

      // Required fields
      if (!date) { errors.push({ row, column: 'Date', message: 'Date is required' }); continue }
      if (!truckPlate) { errors.push({ row, column: 'Truck', message: 'Truck plate number is required' }); continue }
      if (!litersStr || isNaN(Number(litersStr))) { errors.push({ row, column: 'Liters Filled', message: 'Liters Filled must be a valid number' }); continue }
      if (!totalCostStr || isNaN(Number(totalCostStr))) { errors.push({ row, column: 'Total Cost (GHS)', message: 'Total Cost must be a valid number' }); continue }

      // Look up truck
      const truck = await db.truck.findUnique({ where: { plateNumber: truckPlate } })
      if (!truck) { errors.push({ row, column: 'Truck', message: `Truck "${truckPlate}" not found` }); continue }

      // Create a dummy trip if none provided (FuelLog requires tripId)
      const tripNumber = trim(r['Trip'])
      let tripId: string | undefined
      if (tripNumber) {
        const trip = await db.trip.findUnique({ where: { tripNumber } })
        if (trip) tripId = trip.id
      }
      if (!tripId) {
        // Create a minimal trip record for the fuel log
        const trip = await db.trip.create({
          data: {
            tripNumber: `TRP-IMP-${Date.now()}-${i}`,
            truckId: truck.id,
            status: 'completed',
            departureTime: new Date(date),
            arrivalTime: new Date(date),
            loadingLocation: 'Imported',
            destination: 'Imported',
            itemName: 'General',
            quantity: 0,
            unit: 'trip',
            totalRevenue: 0,
            totalMileage: 0,
          },
        })
        tripId = trip.id
      }

      const costPerLiterStr = trim(r['Cost/Liter (GHS)'])
      const odometerStr = trim(r['Odometer (km)'])
      const fuelType = trim(r['Fuel Type'])
      const stationName = trim(r['Station Name'])
      const receiptNumber = trim(r['Receipt Number'])

      await db.fuelLog.create({
        data: {
          tripId,
          truckId: truck.id,
          date: new Date(date),
          litersFilled: parseFloat(litersStr),
          totalCost: parseFloat(totalCostStr),
          costPerLiter: costPerLiterStr ? parseFloat(costPerLiterStr) : null,
          odometer: odometerStr ? parseFloat(odometerStr) : null,
          fuelType: fuelType || 'Diesel',
          stationName: stationName || null,
          receiptNumber: receiptNumber || null,
        },
      })
      importedCount++
    } catch (err: unknown) {
      errors.push({ row, message: err instanceof Error ? err.message : 'Unknown error' })
    }
  }

  return { importedCount, errorCount: errors.length, errors }
}

// ────────────────────────────────────────────────────────────────────
// Import: Maintenance
// ────────────────────────────────────────────────────────────────────

async function importMaintenance(rows: ImportRow[]) {
  const errors: RowError[] = []
  let importedCount = 0

  for (let i = 0; i < rows.length; i++) {
    const r = rows[i]
    const row = i + 1
    try {
      const truckPlate = trim(r['Truck'])
      const type = trim(r['Type'])
      const title = trim(r['Title'])
      const performedAt = trim(r['Performed At'])

      // Required fields
      if (!truckPlate) { errors.push({ row, column: 'Truck', message: 'Truck plate number is required' }); continue }
      if (!type) { errors.push({ row, column: 'Type', message: 'Type is required' }); continue }
      if (!title) { errors.push({ row, column: 'Title', message: 'Title is required' }); continue }

      // Look up truck
      const truck = await db.truck.findUnique({ where: { plateNumber: truckPlate } })
      if (!truck) { errors.push({ row, column: 'Truck', message: `Truck "${truckPlate}" not found` }); continue }

      const description = trim(r['Description'])
      const costStr = trim(r['Cost (GHS)'])
      const performedBy = trim(r['Performed By'])
      const odometerStr = trim(r['Odometer (km)'])
      const nextDueDateStr = trim(r['Next Due Date'])
      const nextDueMileageStr = trim(r['Next Due Mileage (km)'])
      const status = trim(r['Status'])
      const notes = trim(r['Notes'])

      await db.maintenanceRecord.create({
        data: {
          truckId: truck.id,
          type: ['routine', 'repair', 'emergency', 'inspection'].includes(type) ? type : 'routine',
          title,
          description: description || null,
          cost: costStr ? parseFloat(costStr) : null,
          performedBy: performedBy || null,
          performedAt: performedAt ? new Date(performedAt) : new Date(),
          odometer: odometerStr ? parseFloat(odometerStr) : null,
          nextDueDate: nextDueDateStr ? new Date(nextDueDateStr) : null,
          nextDueMileage: nextDueMileageStr ? parseFloat(nextDueMileageStr) : null,
          status: ['pending', 'in_progress', 'completed'].includes(status) ? status : 'completed',
          notes: notes || null,
        },
      })
      importedCount++
    } catch (err: unknown) {
      errors.push({ row, message: err instanceof Error ? err.message : 'Unknown error' })
    }
  }

  return { importedCount, errorCount: errors.length, errors }
}

// ────────────────────────────────────────────────────────────────────
// Main POST handler
// ────────────────────────────────────────────────────────────────────

const IMPORT_HANDLERS: Record<
  ImportType,
  (rows: ImportRow[]) => Promise<{ importedCount: number; errorCount: number; errors: RowError[] }>
> = {
  drivers: importDrivers,
  trucks: importTrucks,
  expenses: importExpenses,
  'fuel-logs': importFuelLogs,
  maintenance: importMaintenance,
}

const VALID_IMPORT_TYPES = Object.keys(IMPORT_HANDLERS)

export async function POST(request: NextRequest) {
  try {
    const auth = requireAuth(request)
    if (auth instanceof NextResponse) return auth

    let body: { type?: string; rows?: ImportRow[] }
    try {
      body = await request.json()
    } catch {
      return NextResponse.json(
        { error: 'Invalid request body. Expected JSON.' },
        { status: 400 }
      )
    }

    const { type, rows } = body

    if (!type || !VALID_IMPORT_TYPES.includes(type)) {
      return NextResponse.json(
        { error: `Invalid import type. Supported: ${VALID_IMPORT_TYPES.join(', ')}` },
        { status: 400 }
      )
    }

    if (!Array.isArray(rows) || rows.length === 0) {
      return NextResponse.json(
        { error: 'Data must be a non-empty array of rows' },
        { status: 400 }
      )
    }

    // Limit to 500 rows per import
    if (rows.length > 500) {
      return NextResponse.json(
        { error: 'Maximum 500 rows per import' },
        { status: 400 }
      )
    }

    const handler = IMPORT_HANDLERS[type as ImportType]
    const result = await handler(rows)

    // Return in the format expected by ImportCSVDialog
    return NextResponse.json({
      success: result.importedCount,
      failed: result.errorCount,
      errors: result.errors.map((e) => ({ row: e.row, message: e.message })),
    })
  } catch (error) {
    console.error('Import error:', error)
    return NextResponse.json(
      { error: 'Import failed due to server error' },
      { status: 500 }
    )
  }
}
