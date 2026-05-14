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

    // Fetch all clients with relevant data for validation
    const clients = await db.client.findMany({
      where: { id: { in: ids } },
      select: {
        id: true,
        companyName: true,
        isActive: true,
        trips: {
          where: { status: { in: ['scheduled', 'loading', 'loaded', 'waiting_at_depot', 'departed_depot', 'in_transit', 'arrived_destination', 'waiting_to_offload', 'offloading'] } },
          select: { id: true, tripNumber: true },
        },
        invoices: {
          where: { status: { in: ['draft', 'sent', 'overdue'] } },
          select: { id: true, invoiceNumber: true },
        },
      },
    })

    let success = 0
    let failed = 0
    const errors: { id: string; message: string }[] = []

    for (const id of ids) {
      const client = clients.find(c => c.id === id)

      if (!client) {
        failed++
        errors.push({ id, message: 'Client not found' })
        continue
      }

      if (action === 'delete') {
        // Check if client has active trips
        if (client.trips.length > 0) {
          failed++
          errors.push({
            id,
            message: `Cannot delete client "${client.companyName}": has ${client.trips.length} active trip(s)`,
          })
          continue
        }

        // Check if client has unpaid invoices
        if (client.invoices.length > 0) {
          failed++
          errors.push({
            id,
            message: `Cannot delete client "${client.companyName}": has ${client.invoices.length} unpaid invoice(s)`,
          })
          continue
        }

        await db.client.delete({ where: { id } })

        createAuditLog({
          userId: auth.userId,
          action: 'delete',
          entity: 'Client',
          entityId: id,
          details: { companyName: client.companyName, bulk: true },
          ipAddress: getClientIp(request),
        }).catch(() => {})

        success++
      } else if (action === 'activate') {
        await db.client.update({
          where: { id },
          data: { isActive: true },
        })

        createAuditLog({
          userId: auth.userId,
          action: 'update',
          entity: 'Client',
          entityId: id,
          details: { companyName: client.companyName, previousStatus: client.isActive ? 'active' : 'inactive', newStatus: 'active', bulk: true },
          ipAddress: getClientIp(request),
        }).catch(() => {})

        success++
      } else if (action === 'deactivate') {
        // Check if client has active trips before deactivating
        if (client.trips.length > 0) {
          failed++
          errors.push({
            id,
            message: `Cannot deactivate client "${client.companyName}": has ${client.trips.length} active trip(s)`,
          })
          continue
        }

        await db.client.update({
          where: { id },
          data: { isActive: false },
        })

        createAuditLog({
          userId: auth.userId,
          action: 'update',
          entity: 'Client',
          entityId: id,
          details: { companyName: client.companyName, previousStatus: client.isActive ? 'active' : 'inactive', newStatus: 'inactive', bulk: true },
          ipAddress: getClientIp(request),
        }).catch(() => {})

        success++
      }
    }

    return NextResponse.json({ success, failed, errors })
  } catch (error) {
    console.error('Bulk client action error:', error)
    return NextResponse.json({ error: 'Failed to perform bulk action on clients' }, { status: 500 })
  }
}
