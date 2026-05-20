import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { requireAuth, requireWriteAccess } from '@/lib/auth-server'

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
    const validDrivers: Array<{
      firstName: string
      lastName: string
      phone: string
      employeeId: string
      licenseNumber: string
      licenseExpiry: Date
      licenseClass: string
      emergencyName: string | null
      emergencyPhone: string | null
      address: string
      status: string
      notes: string
    }> = []

    // Get current counter for generating employee IDs
    const settings = await db.systemSettings.findFirst()
    let counter = settings?.driverIdCounter || 1
    const prefix = settings?.driverIdPrefix || 'FP-DRV-'
    const padding = settings?.driverIdPadding || 3

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
      if (!row.licenseNo && !row.licenseNumber) {
        errors.push({ row: i + 1, message: 'licenseNo (licenseNumber) is required' })
        continue
      }

      // Split driverName into firstName + lastName
      const nameParts = row.driverName.trim().split(/\s+/)
      const firstName = nameParts[0] || 'Unknown'
      const lastName = nameParts.length > 1 ? nameParts.slice(1).join(' ') : ''

      // Generate employee ID if not provided
      const employeeId = row.employeeId?.trim() || `${prefix}${String(counter++).padStart(padding, '0')}`

      const licenseNumber = (row.licenseNo || row.licenseNumber || '').trim()
      const licenseClass = row.licenseClass?.trim() || 'C'

      validDrivers.push({
        firstName,
        lastName,
        phone: row.phone.trim(),
        employeeId,
        licenseNumber,
        licenseExpiry: row.licenseExpiry ? new Date(row.licenseExpiry) : new Date(Date.now() + 365 * 24 * 60 * 60 * 1000),
        licenseClass,
        emergencyName: (row.emergencyContact || row.emergencyName)?.trim() || null,
        emergencyPhone: row.emergencyPhone?.trim() || null,
        address: row.address?.trim() || '',
        status: row.status?.trim() === 'inactive' || row.status?.trim() === 'suspended' ? row.status.trim() : 'active',
        notes: row.notes?.trim() || '',
      })
    }

    let created = 0

    // Create drivers one by one (skip duplicates)
    if (validDrivers.length > 0) {
      for (const driver of validDrivers) {
        try {
          await db.driver.create({ data: driver })
          created++
        } catch {
          // Skip duplicates silently — unique on phone, licenseNumber, employeeId
        }
      }
    }

    // Update counter in settings if we generated IDs
    if (validDrivers.length > 0) {
      await db.systemSettings.update({
        where: { id: settings?.id || 'default' },
        data: { driverIdCounter: counter },
      }).catch(() => {
        // Settings may not exist yet, ignore
      })
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
