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

    const drivers = await db.driver.findMany({
      where: { id: { in: ids } },
      select: { id: true, firstName: true, lastName: true, status: true },
    })

    const result = await db.driver.updateMany({
      where: { id: { in: ids } },
      data: { status: 'inactive' },
    })

    // Audit log: bulk deactivate (fire-and-forget)
    drivers.forEach(driver => {
      createAuditLog({
        userId: auth.userId,
        action: 'delete',
        entity: 'Driver',
        entityId: driver.id,
        details: { name: `${driver.firstName} ${driver.lastName}`, previousStatus: driver.status, bulk: true },
        ipAddress: getClientIp(request),
      }).catch(() => {})
    })

    return NextResponse.json({ success: true, deleted: result.count })
  } catch (error) {
    console.error('Bulk driver delete error:', error)
    return NextResponse.json({ error: 'Failed to deactivate drivers' }, { status: 500 })
  }
}
