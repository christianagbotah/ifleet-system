import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'

export async function POST(request: NextRequest) {
  try {
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
    const validTrucks: Array<{
      plateNumber: string
      truckName: string
      truckType: string
      capacity: string
      year: number | null
      fuelType: string
      status: string
      mileage: number
      insuranceExpiry: Date | null
      notes: string
    }> = []

    const validTruckTypes = ['flatbed', 'tanker', 'container', 'refrigerated', 'other']
    const validFuelTypes = ['diesel', 'petrol', 'gas']
    const validStatuses = ['active', 'maintenance', 'out_of_service']

    for (let i = 0; i < rows.length; i++) {
      const row = rows[i]

      // Validate required fields
      if (!row.truckName || row.truckName.trim() === '') {
        errors.push({ row: i + 1, message: 'truckName is required' })
        continue
      }
      if (!row.plateNumber || row.plateNumber.trim() === '') {
        errors.push({ row: i + 1, message: 'plateNumber is required' })
        continue
      }

      const truckType = row.truckType?.trim().toLowerCase()
      const fuelType = row.fuelType?.trim().toLowerCase()
      const status = row.status?.trim().toLowerCase().replace(' ', '_')

      validTrucks.push({
        plateNumber: row.plateNumber.trim(),
        truckName: row.truckName.trim(),
        truckType: validTruckTypes.includes(truckType) ? truckType : 'flatbed',
        capacity: row.capacity?.trim() || '',
        year: row.year ? parseInt(row.year, 10) || null : null,
        fuelType: validFuelTypes.includes(fuelType) ? fuelType : 'diesel',
        status: validStatuses.includes(status) ? status : 'active',
        mileage: row.mileage ? parseInt(row.mileage, 10) || 0 : 0,
        insuranceExpiry: row.insuranceExpiry ? new Date(row.insuranceExpiry) : null,
        notes: row.notes?.trim() || '',
      })
    }

    let created = 0

    // Use createMany for batch insert
    if (validTrucks.length > 0) {
      try {
        const result = await db.truck.createMany({
          data: validTrucks,
          skipDuplicates: true,
        })
        created = result.count
      } catch (error) {
        // If createMany fails, fall back to individual creates
        for (const truck of validTrucks) {
          try {
            await db.truck.create({ data: truck })
            created++
          } catch {
            // Skip duplicates silently — unique on plateNumber
          }
        }
      }
    }

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
