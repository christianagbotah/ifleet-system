import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { requireAuth, requireWriteAccess } from '@/lib/auth-server'
import { createAuditLog, getClientIp } from '@/lib/audit'

const VALID_ACTIONS = ['delete', 'activate', 'deactivate'] as const

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

    // Fetch all trucks for audit logging and validation
    const trucks = await db.truck.findMany({
      where: { id: { in: ids } },
      select: {
        id: true,
        plateNumber: true,
        status: true,
        Trip: {
          where: { status: { in: ['scheduled', 'loading', 'loaded', 'waiting_at_depot', 'departed_depot', 'in_transit', 'arrived_destination', 'waiting_to_offload', 'offloading'] } },
          select: { id: true, tripNumber: true },
        },
      },
    })

    const foundIds = new Set(trucks.map(t => t.id))
    let success = 0
    let failed = 0
    const errors: { id: string; message: string }[] = []

    for (const id of ids) {
      const truck = trucks.find(t => t.id === id)

      if (!truck) {
        failed++
        errors.push({ id, message: 'Truck not found' })
        continue
      }

      if (action === 'delete') {
        // Check if truck has active trips
        if (truck.Trip.length > 0) {
          failed++
          errors.push({
            id,
            message: `Cannot delete: truck has ${truck.Trip.length} active trip(s)`,
          })
          continue
        }

        await db.truck.update({
          where: { id },
          data: { status: 'decommissioned' },
        })

        createAuditLog({
          userId: auth.userId,
          action: 'delete',
          entity: 'Truck',
          entityId: id,
          details: { plateNumber: truck.plateNumber, previousStatus: truck.status, bulk: true },
          ipAddress: getClientIp(request),
        }).catch(() => {})

        success++
      } else if (action === 'activate') {
        await db.truck.update({
          where: { id },
          data: { status: 'active' },
        })

        createAuditLog({
          userId: auth.userId,
          action: 'update',
          entity: 'Truck',
          entityId: id,
          details: { plateNumber: truck.plateNumber, previousStatus: truck.status, newStatus: 'active', bulk: true },
          ipAddress: getClientIp(request),
        }).catch(() => {})

        success++
      } else if (action === 'deactivate') {
        // Check if truck has active trips before deactivating
        if (truck.Trip.length > 0) {
          failed++
          errors.push({
            id,
            message: `Cannot deactivate: truck has ${truck.Trip.length} active trip(s)`,
          })
          continue
        }

        await db.truck.update({
          where: { id },
          data: { status: 'inactive' },
        })

        createAuditLog({
          userId: auth.userId,
          action: 'update',
          entity: 'Truck',
          entityId: id,
          details: { plateNumber: truck.plateNumber, previousStatus: truck.status, newStatus: 'inactive', bulk: true },
          ipAddress: getClientIp(request),
        }).catch(() => {})

        success++
      }
    }

    return NextResponse.json({ success, failed, errors })
  } catch (error) {
    console.error('Bulk truck action error:', error)
    return NextResponse.json({ error: 'Failed to perform bulk action on trucks' }, { status: 500 })
  }
}
