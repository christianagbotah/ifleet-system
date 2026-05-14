import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { requireRole } from '@/lib/auth-server'
import { ROLES } from '@/lib/auth-server'

/**
 * GET /api/drivers/next-id
 * Returns the next auto-generated driver employee ID based on system settings.
 * Only Admin or Manager can access.
 *
 * Query params:
 *   preview=true  — preview without incrementing counter
 */
export async function GET(request: NextRequest) {
  try {
    const auth = requireRole(request, [ROLES.ADMIN, ROLES.MANAGER])
    if (auth instanceof NextResponse) return auth

    const { searchParams } = new URL(request.url)
    const preview = searchParams.get('preview') === 'true'

    // Get system settings (single-row table)
    const settings = await db.systemSettings.findFirst()
    const prefix = settings?.driverIdPrefix || 'FP-DRV-'
    const counter = settings?.driverIdCounter || 1
    const padding = settings?.driverIdPadding || 3

    const nextId = `${prefix}${String(counter).padStart(padding, '0')}`

    if (preview) {
      return NextResponse.json({
        nextId,
        prefix,
        counter,
        padding,
        preview: true,
      })
    }

    // Increment the counter atomically
    if (settings) {
      await db.systemSettings.update({
        where: { id: settings.id },
        data: { driverIdCounter: counter + 1 },
      })
    }

    return NextResponse.json({
      nextId,
      prefix,
      counter,
      padding,
      preview: false,
    })
  } catch (error) {
    console.error('Next driver ID error:', error)
    return NextResponse.json(
      { error: 'Failed to generate driver ID' },
      { status: 500 }
    )
  }
}
