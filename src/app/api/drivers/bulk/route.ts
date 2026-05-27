import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { requireAuth, requireWriteAccess } from '@/lib/auth-server'
import { createAuditLog, getClientIp } from '@/lib/audit'

const VALID_ACTIONS = ['delete', 'activate', 'deactivate', 'verify'] as const

export async function POST(request: NextRequest) {
  try {
    const auth = requireAuth(request)
    if (auth instanceof NextResponse) return auth
    const writeGuard = requireWriteAccess(auth)
    if (writeGuard instanceof NextResponse) return writeGuard

    const body = await request.json()
    const { action, ids } = body as { action?: string; ids?: string[] }

    if (!VALID_ACTIONS.includes(action as typeof VALID_ACTIONS[number])) {
      return NextResponse.json(
        { error: `Invalid action. Must be one of: ${VALID_ACTIONS.join(', ')}` },
        { status: 400 }
      )
    }

    if (!Array.isArray(ids) || ids.length === 0) {
      return NextResponse.json({ error: 'ids must be a non-empty array' }, { status: 400 })
    }

    if (ids.length > 100) {
      return NextResponse.json({ error: 'Cannot process more than 100 items at once' }, { status: 400 })
    }

    // Fetch all drivers for audit logging and validation
    const drivers = await db.driver.findMany({
      where: { id: { in: ids } },
      select: {
        id: true,
        firstName: true,
        lastName: true,
        status: true,
        verificationStatus: true,
        Trip: {
          where: { status: { in: ['scheduled', 'loading', 'loaded', 'waiting_at_depot', 'departed_depot', 'in_transit', 'arrived_destination', 'waiting_to_offload', 'offloading'] } },
          select: { id: true, tripNumber: true },
        },
      },
    })

    let success = 0
    let failed = 0
    const errors: { id: string; message: string }[] = []

    for (const id of ids) {
      const driver = drivers.find(d => d.id === id)

      if (!driver) {
        failed++
        errors.push({ id, message: 'Driver not found' })
        continue
      }

      if (action === 'delete') {
        // Only allow if driver has no active trips
        if (driver.Trip.length > 0) {
          failed++
          errors.push({
            id,
            message: `Cannot delete: driver has ${driver.Trip.length} active trip(s)`,
          })
          continue
        }

        await db.driver.update({
          where: { id },
          data: { status: 'inactive' },
        })

        createAuditLog({
          userId: auth.userId,
          action: 'delete',
          entity: 'Driver',
          entityId: id,
          details: { name: `${driver.firstName} ${driver.lastName}`, previousStatus: driver.status, bulk: true },
          ipAddress: getClientIp(request),
        }).catch(() => {})

        success++
      } else if (action === 'activate') {
        await db.driver.update({
          where: { id },
          data: { status: 'active' },
        })

        createAuditLog({
          userId: auth.userId,
          action: 'update',
          entity: 'Driver',
          entityId: id,
          details: { name: `${driver.firstName} ${driver.lastName}`, previousStatus: driver.status, newStatus: 'active', bulk: true },
          ipAddress: getClientIp(request),
        }).catch(() => {})

        success++
      } else if (action === 'deactivate') {
        // Check if driver has active trips before deactivating
        if (driver.Trip.length > 0) {
          failed++
          errors.push({
            id,
            message: `Cannot deactivate: driver has ${driver.Trip.length} active trip(s)`,
          })
          continue
        }

        await db.driver.update({
          where: { id },
          data: { status: 'inactive' },
        })

        createAuditLog({
          userId: auth.userId,
          action: 'update',
          entity: 'Driver',
          entityId: id,
          details: { name: `${driver.firstName} ${driver.lastName}`, previousStatus: driver.status, newStatus: 'inactive', bulk: true },
          ipAddress: getClientIp(request),
        }).catch(() => {})

        success++
      } else if (action === 'verify') {
        const updateData: Record<string, unknown> = {
          verificationStatus: 'verified',
          verifiedAt: new Date(),
          verifiedBy: auth.userId,
        }

        await db.driver.update({
          where: { id },
          data: updateData,
        })

        createAuditLog({
          userId: auth.userId,
          action: 'update',
          entity: 'Driver',
          entityId: id,
          details: { name: `${driver.firstName} ${driver.lastName}`, previousVerificationStatus: driver.verificationStatus, newVerificationStatus: 'verified', bulk: true },
          ipAddress: getClientIp(request),
        }).catch(() => {})

        success++
      }
    }

    return NextResponse.json({ success, failed, errors })
  } catch (error) {
    console.error('Bulk driver action error:', error)
    return NextResponse.json({ error: 'Failed to perform bulk action on drivers' }, { status: 500 })
  }
}
