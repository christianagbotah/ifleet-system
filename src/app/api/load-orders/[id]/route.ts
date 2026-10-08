import { NextRequest, NextResponse } from 'next/server'

import { createAuditLog, getClientIp } from '@/lib/audit'
import { requireAuth, requireWriteAccess, ROLES } from '@/lib/auth-server'
import { db } from '@/lib/db'
import {
  allocateLoadOrderQuantity,
  canTransitionLoadOrderStatus,
  type LoadOrderStatusValue,
} from '@/lib/domain/orders/load-order'

const statuses = new Set<LoadOrderStatusValue>([
  'draft', 'open', 'partially_allocated', 'allocated', 'in_progress', 'on_hold', 'completed', 'cancelled',
])

const include = {
  shipperProfile: { select: { id: true, code: true, name: true, profileType: true } },
  client: { select: { id: true, companyName: true } },
  loadingPoint: { select: { id: true, name: true, loadingCity: { select: { id: true, name: true, region: true } } } },
  LoadOrderDestination: { orderBy: { stopOrder: 'asc' as const } },
  LoadOrderLine: { orderBy: { createdAt: 'asc' as const } },
  Trip: {
    select: {
      id: true,
      tripNumber: true,
      status: true,
      truckId: true,
      driverId: true,
      trailerId: true,
      TripItem: { select: { loadOrderLineId: true, quantity: true } },
    },
  },
} as const

function resultWithAllocation<T extends { LoadOrderLine: Array<{ id: string; orderedQuantity: number }>; Trip: Array<{ status: string; TripItem: Array<{ loadOrderLineId: string | null; quantity: number }> }> }>(order: T) {
  const allocation = allocateLoadOrderQuantity(
    { lines: order.LoadOrderLine.map((line) => ({ id: line.id, quantity: line.orderedQuantity })) },
    order.Trip.map((trip) => ({ status: trip.status, items: trip.TripItem }))
  )
  return { ...order, allocation }
}

function driverSafe(order: Record<string, unknown>) {
  const safe = { ...order }
  delete safe.offeredRate
  delete safe.rateType
  delete safe.externalReference
  delete safe.clientId
  delete safe.client
  return safe
}

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const auth = requireAuth(request)
    if (auth instanceof NextResponse) return auth
    const { id } = await params
    const order = await db.loadOrder.findUnique({ where: { id }, include })
    if (!order) return NextResponse.json({ error: 'Load order not found' }, { status: 404 })
    const result = resultWithAllocation(order)
    return NextResponse.json(auth.roleName === ROLES.DRIVER ? driverSafe(result as unknown as Record<string, unknown>) : result)
  } catch (error) {
    console.error('Load order detail error:', error)
    return NextResponse.json({ error: 'Failed to fetch load order' }, { status: 500 })
  }
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const auth = requireAuth(request)
    if (auth instanceof NextResponse) return auth
    const writeGuard = requireWriteAccess(auth)
    if (writeGuard instanceof NextResponse) return writeGuard

    const { id } = await params
    const body = await request.json() as Record<string, unknown>
    const current = await db.loadOrder.findUnique({ where: { id }, include })
    if (!current) return NextResponse.json({ error: 'Load order not found' }, { status: 404 })

    const data: Record<string, unknown> = {}
    let statusChanged = false
    if (body.status != null) {
      const target = String(body.status) as LoadOrderStatusValue
      const from = current.status as LoadOrderStatusValue
      if (!statuses.has(target)) return NextResponse.json({ error: 'Invalid load order status' }, { status: 400 })
      if (target !== from) {
        if (!canTransitionLoadOrderStatus(from, target)) {
          return NextResponse.json({ error: `Load order cannot transition from ${from} to ${target}` }, { status: 409 })
        }
        if (target === 'completed') {
          const allocation = resultWithAllocation(current).allocation
          if (!allocation.valid || allocation.lines.some((line) => line.remaining > 0)) {
            return NextResponse.json({ error: 'Load order cannot be completed until all line quantities are allocated without excess' }, { status: 409 })
          }
        }
        data.status = target
        statusChanged = true
      }
    }

    for (const key of ['priority', 'specialHandling', 'requiredVehicleType', 'requiredTrailerType'] as const) {
      if (key in body) data[key] = typeof body[key] === 'string' && body[key]!.trim() ? body[key]!.trim() : null
    }
    for (const key of ['pickupWindowStart', 'pickupWindowEnd', 'deliveryWindowStart', 'deliveryWindowEnd'] as const) {
      if (key in body) {
        const value = body[key]
        const date = value ? new Date(String(value)) : null
        if (date && Number.isNaN(date.getTime())) return NextResponse.json({ error: `${key} is not a valid date` }, { status: 400 })
        data[key] = date
      }
    }
    if (Object.keys(data).length === 0) return NextResponse.json({ error: 'No supported fields supplied' }, { status: 400 })

    const updated = await db.loadOrder.update({ where: { id }, data, include })
    createAuditLog({
      userId: auth.userId,
      action: 'update',
      entity: 'LoadOrder',
      entityId: id,
      details: {
        fields: Object.keys(data),
        ...(statusChanged ? { fromStatus: current.status, toStatus: updated.status } : {}),
      },
      ipAddress: getClientIp(request),
    }).catch(() => {})

    return NextResponse.json(resultWithAllocation(updated))
  } catch (error) {
    console.error('Load order update error:', error)
    return NextResponse.json({ error: 'Failed to update load order' }, { status: 500 })
  }
}
