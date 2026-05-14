import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { requireAuth, requireWriteAccess } from '@/lib/auth-server'
import { createAuditLog, getClientIp } from '@/lib/audit'

const VALID_ACTIONS = ['delete'] as const

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

    // Fetch all fuel logs for audit logging
    const fuelLogs = await db.fuelLog.findMany({
      where: { id: { in: ids } },
      select: {
        id: true,
        truckId: true,
        date: true,
        litersFilled: true,
        totalCost: true,
        truck: { select: { plateNumber: true } },
      },
    })

    let success = 0
    let failed = 0
    const errors: { id: string; message: string }[] = []

    for (const id of ids) {
      const fuelLog = fuelLogs.find(fl => fl.id === id)

      if (!fuelLog) {
        failed++
        errors.push({ id, message: 'Fuel log not found' })
        continue
      }

      if (action === 'delete') {
        await db.fuelLog.delete({ where: { id } })

        createAuditLog({
          userId: auth.userId,
          action: 'delete',
          entity: 'FuelLog',
          entityId: id,
          details: {
            truckId: fuelLog.truckId,
            truckPlateNumber: fuelLog.truck?.plateNumber,
            date: fuelLog.date.toISOString(),
            litersFilled: fuelLog.litersFilled,
            totalCost: fuelLog.totalCost,
            bulk: true,
          },
          ipAddress: getClientIp(request),
        }).catch(() => {})

        success++
      }
    }

    return NextResponse.json({ success, failed, errors })
  } catch (error) {
    console.error('Bulk fuel log action error:', error)
    return NextResponse.json({ error: 'Failed to perform bulk action on fuel logs' }, { status: 500 })
  }
}
