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
    const { ids } = body as { ids?: string[] }

    if (!Array.isArray(ids) || ids.length === 0) {
      return NextResponse.json({ error: 'ids must be a non-empty array' }, { status: 400 })
    }

    if (ids.length > 100) {
      return NextResponse.json({ error: 'Cannot delete more than 100 items at once' }, { status: 400 })
    }

    const trucks = await db.truck.findMany({
      where: { id: { in: ids } },
      select: { id: true, plateNumber: true, status: true },
    })

    const result = await db.truck.updateMany({
      where: { id: { in: ids } },
      data: { status: 'decommissioned' },
    })

    // Audit log: bulk decommission (fire-and-forget)
    trucks.forEach(truck => {
      createAuditLog({
        userId: auth.userId,
        action: 'delete',
        entity: 'Truck',
        entityId: truck.id,
        details: { plateNumber: truck.plateNumber, previousStatus: truck.status, bulk: true },
        ipAddress: getClientIp(request),
      }).catch(() => {})
    })

    return NextResponse.json({ success: true, deleted: result.count })
  } catch (error) {
    console.error('Bulk truck delete error:', error)
    return NextResponse.json({ error: 'Failed to decommission trucks' }, { status: 500 })
  }
}
