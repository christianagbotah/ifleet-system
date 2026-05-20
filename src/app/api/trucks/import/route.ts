import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { requireAuth, requireWriteAccess } from '@/lib/auth-server'
import { createAuditLog, getClientIp } from '@/lib/audit'

export async function POST(request: NextRequest) {
  try {
    const auth = requireAuth(request)
    if (auth instanceof NextResponse) return auth
    const writeGuard = requireWriteAccess(auth)
    if (writeGuard instanceof NextResponse) return writeGuard

    const body = await request.json()
    const { rows } = body as { rows: Record<string, string>[] }

    if (!rows || !Array.isArray(rows) || rows.length === 0) {
      return NextResponse.json(
        { error: 'No rows provided for import' },
        { status: 400 }
      )
    }

    if (rows.length > 100) {
      return NextResponse.json(
        { error: 'Maximum 100 rows per import' },
        { status: 400 }
      )
    }

    const errors: Array<{ row: number; message: string }> = []
    const validFuelTypes = ['Diesel', 'Petrol', 'Gas', 'Electric', 'Hybrid']
    const validStatuses = ['active', 'inactive', 'maintenance', 'out_of_service']
    const validInsuranceStatuses = ['none', 'active', 'expired']

    for (let i = 0; i < rows.length; i++) {
      const row = rows[i]

      // Validate required fields
      if (!row.plateNumber || row.plateNumber.trim() === '') {
        errors.push({ row: i + 1, message: 'plateNumber is required' })
        continue
      }
      if (!row.make || row.make.trim() === '') {
        errors.push({ row: i + 1, message: 'make is required (e.g. Mercedes-Benz)' })
        continue
      }
      if (!row.model || row.model.trim() === '') {
        errors.push({ row: i + 1, message: 'model is required (e.g. Actros)' })
        continue
      }

      const year = row.year ? parseInt(row.year, 10) : null
      if (!year || year < 1990 || year > 2035) {
        errors.push({ row: i + 1, message: 'year is required and must be between 1990-2035' })
        continue
      }

      const fuelType = row.fuelType?.trim()
      const normalizedFuel = validFuelTypes.find(
        (f) => f.toLowerCase() === fuelType?.toLowerCase()
      ) || 'Diesel'

      const status = row.status?.trim().toLowerCase().replace(/ /g, '_')
      const normalizedStatus = validStatuses.includes(status || '') ? status! : 'active'

      const insuranceStatus = row.insuranceStatus?.trim().toLowerCase()
      const normalizedInsurance = validInsuranceStatuses.includes(insuranceStatus || '')
        ? insuranceStatus!
        : 'none'

      try {
        const truck = await db.truck.create({
          data: {
            plateNumber: row.plateNumber.trim(),
            make: row.make.trim(),
            model: row.model.trim(),
            year,
            vinNumber: row.vinNumber?.trim() || undefined,
            engineNumber: row.engineNumber?.trim() || undefined,
            chassisNumber: row.chassisNumber?.trim() || undefined,
            color: row.color?.trim() || undefined,
            fuelType: normalizedFuel,
            tankCapacity: row.tankCapacity ? parseFloat(row.tankCapacity) || undefined : undefined,
            status: normalizedStatus,
            currentMileage: row.currentMileage ? parseFloat(row.currentMileage) || 0 : 0,
            insuranceStatus: normalizedInsurance,
            nextServiceDate: row.nextServiceDate ? new Date(row.nextServiceDate) : undefined,
            notes: row.notes?.trim() || undefined,
          },
        })

        createAuditLog({
          userId: auth.userId,
          action: 'create',
          entity: 'Truck',
          entityId: truck.id,
          details: { plateNumber: truck.plateNumber, make: truck.make, model: truck.model, imported: true },
          ipAddress: getClientIp(request),
        }).catch(() => {})
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : String(err)
        // Skip duplicate plate numbers
        if (msg.includes('Unique constraint')) {
          errors.push({ row: i + 1, message: `Plate number "${row.plateNumber.trim()}" already exists — skipped` })
        } else {
          errors.push({ row: i + 1, message: msg })
        }
      }
    }

    const created = rows.length - errors.length

    return NextResponse.json({
      created,
      errors,
    })
  } catch (error) {
    console.error('Error importing trucks:', error)
    return NextResponse.json(
      { error: 'Failed to import trucks', details: String(error) },
      { status: 500 }
    )
  }
}
