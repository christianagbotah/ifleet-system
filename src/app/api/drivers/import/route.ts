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
    const validDrivers: Array<{
      driverName: string
      phone: string
      licenseNo: string
      licenseExpiry: Date
      emergencyContact: string | null
      emergencyPhone: string | null
      address: string
      status: string
      notes: string
    }> = []

    for (let i = 0; i < rows.length; i++) {
      const row = rows[i]

      // Validate required fields
      if (!row.driverName || row.driverName.trim() === '') {
        errors.push({ row: i + 1, message: 'driverName is required' })
        continue
      }
      if (!row.phone || row.phone.trim() === '') {
        errors.push({ row: i + 1, message: 'phone is required' })
        continue
      }
      if (!row.licenseNo || row.licenseNo.trim() === '') {
        errors.push({ row: i + 1, message: 'licenseNo is required' })
        continue
      }

      validDrivers.push({
        driverName: row.driverName.trim(),
        phone: row.phone.trim(),
        licenseNo: row.licenseNo.trim(),
        licenseExpiry: row.licenseExpiry ? new Date(row.licenseExpiry) : new Date(),
        emergencyContact: row.emergencyContact?.trim() || null,
        emergencyPhone: row.emergencyPhone?.trim() || null,
        address: row.address?.trim() || '',
        status: row.status?.trim() === 'inactive' || row.status?.trim() === 'suspended' ? row.status.trim() : 'active',
        notes: row.notes?.trim() || '',
      })
    }

    let created = 0

    // Use createMany for batch insert (skipDuplicates for unique constraint violations)
    if (validDrivers.length > 0) {
      try {
        const result = await db.driver.createMany({
          data: validDrivers,
          skipDuplicates: true,
        })
        created = result.count
      } catch (error) {
        // If createMany fails (e.g., unique constraint), fall back to individual creates
        for (const driver of validDrivers) {
          try {
            await db.driver.create({ data: driver })
            created++
          } catch {
            // Skip duplicates silently — unique on phone and licenseNo
          }
        }
      }
    }

    return NextResponse.json({
      created,
      errors,
    })
  } catch (error) {
    console.error('Error importing drivers:', error)
    return NextResponse.json(
      { error: 'Failed to import drivers', details: String(error) },
      { status: 500 }
    )
  }
}
