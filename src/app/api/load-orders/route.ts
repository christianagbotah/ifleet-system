import { randomUUID } from 'node:crypto'
import { NextRequest, NextResponse } from 'next/server'

import { createAuditLog, getClientIp } from '@/lib/audit'
import { requireAuth, requireWriteAccess, ROLES } from '@/lib/auth-server'
import { db } from '@/lib/db'
import {
  allocateLoadOrderQuantity,
  validateLoadOrder,
  type LoadOrderDraft,
} from '@/lib/domain/orders/load-order'

function nullableString(value: unknown): string | null {
  return typeof value === 'string' && value.trim() ? value.trim() : null
}

function nullableDate(value: unknown): Date | null {
  if (!value) return null
  const date = new Date(String(value))
  return Number.isNaN(date.getTime()) ? null : date
}

function draftFromBody(body: Record<string, unknown>): LoadOrderDraft {
  const destinations = Array.isArray(body.destinations) ? body.destinations as Record<string, unknown>[] : []
  const lines = Array.isArray(body.lines) ? body.lines as Record<string, unknown>[] : []
  return {
    shipperProfileId: String(body.shipperProfileId || ''),
    clientId: nullableString(body.clientId),
    externalReference: nullableString(body.externalReference),
    loadingPointId: String(body.loadingPointId || ''),
    pickupWindowStart: nullableString(body.pickupWindowStart),
    pickupWindowEnd: nullableString(body.pickupWindowEnd),
    deliveryWindowStart: nullableString(body.deliveryWindowStart),
    deliveryWindowEnd: nullableString(body.deliveryWindowEnd),
    requiredVehicleType: nullableString(body.requiredVehicleType),
    requiredTrailerType: nullableString(body.requiredTrailerType),
    offeredRate: body.offeredRate == null || body.offeredRate === '' ? null : Number(body.offeredRate),
    currency: nullableString(body.currency) || 'GHS',
    priority: nullableString(body.priority) || 'normal',
    specialHandling: nullableString(body.specialHandling),
    documents: Array.isArray(body.documents) ? body.documents.map(String) : [],
    destinations: destinations.map((destination, index) => ({
      ref: String(destination.ref || `stop-${index + 1}`),
      name: String(destination.name || ''),
      clientId: nullableString(destination.clientId),
      destinationZoneId: nullableString(destination.destinationZoneId),
      address: nullableString(destination.address),
      latitude: destination.latitude == null || destination.latitude === '' ? null : Number(destination.latitude),
      longitude: destination.longitude == null || destination.longitude === '' ? null : Number(destination.longitude),
      deliveryWindowStart: nullableString(destination.deliveryWindowStart),
      deliveryWindowEnd: nullableString(destination.deliveryWindowEnd),
      contactName: nullableString(destination.contactName),
      contactPhone: nullableString(destination.contactPhone),
      notes: nullableString(destination.notes),
    })),
    lines: lines.map((line, index) => ({
      ref: String(line.ref || `line-${index + 1}`),
      itemId: nullableString(line.itemId),
      itemName: String(line.itemName || ''),
      externalProductCode: nullableString(line.externalProductCode),
      quantity: Number(line.quantity),
      unit: String(line.unit || ''),
      destinationRef: nullableString(line.destinationRef),
      notes: nullableString(line.notes),
    })),
  }
}

const orderInclude = {
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
      TripItem: { select: { loadOrderLineId: true, quantity: true } },
    },
  },
} as const

function withAllocation<T extends { LoadOrderLine: Array<{ id: string; orderedQuantity: number }>; Trip: Array<{ status: string; TripItem: Array<{ loadOrderLineId: string | null; quantity: number }> }> }>(order: T) {
  return {
    ...order,
    allocation: allocateLoadOrderQuantity(
      { lines: order.LoadOrderLine.map((line) => ({ id: line.id, quantity: line.orderedQuantity })) },
      order.Trip.map((trip) => ({ status: trip.status, items: trip.TripItem }))
    ),
  }
}

export async function GET(request: NextRequest) {
  try {
    const auth = requireAuth(request)
    if (auth instanceof NextResponse) return auth
    const { searchParams } = new URL(request.url)
    const status = searchParams.get('status')?.trim()
    const shipperProfileId = searchParams.get('shipperProfileId')?.trim()
    const search = searchParams.get('search')?.trim()
    const page = Math.max(1, Number.parseInt(searchParams.get('page') || '1', 10) || 1)
    const limit = Math.min(100, Math.max(1, Number.parseInt(searchParams.get('limit') || '20', 10) || 20))
    const where = {
      ...(status && status !== 'all' ? { status: status as never } : {}),
      ...(shipperProfileId ? { shipperProfileId } : {}),
      ...(search ? { OR: [{ orderNumber: { contains: search } }, { externalReference: { contains: search } }] } : {}),
    }

    const [orders, total] = await Promise.all([
      db.loadOrder.findMany({ where, include: orderInclude, orderBy: { createdAt: 'desc' }, skip: (page - 1) * limit, take: limit }),
      db.loadOrder.count({ where }),
    ])
    const driverSafe = auth.roleName === ROLES.DRIVER
    const data = orders.map((record) => {
      const order = withAllocation(record)
      if (!driverSafe) return order
      const safe = { ...order } as Record<string, unknown>
      delete safe.offeredRate
      delete safe.rateType
      delete safe.externalReference
      delete safe.clientId
      delete safe.client
      return safe
    })
    return NextResponse.json({ data, total, page, limit })
  } catch (error) {
    console.error('Load order list error:', error)
    return NextResponse.json({ error: 'Failed to fetch load orders' }, { status: 500 })
  }
}

export async function POST(request: NextRequest) {
  try {
    const auth = requireAuth(request)
    if (auth instanceof NextResponse) return auth
    const writeGuard = requireWriteAccess(auth)
    if (writeGuard instanceof NextResponse) return writeGuard

    const body = await request.json() as Record<string, unknown>
    const draft = draftFromBody(body)
    const existingOrders = draft.externalReference
      ? await db.loadOrder.findMany({ where: { shipperProfileId: draft.shipperProfileId, externalReference: { not: null } }, select: { shipperProfileId: true, externalReference: true } })
      : []
    const validation = validateLoadOrder(draft, existingOrders)
    if (!validation.valid || !validation.normalized) {
      return NextResponse.json({ error: 'Invalid load order', blocking: validation.blocking }, { status: 400 })
    }
    const normalized = validation.normalized

    const [shipper, loadingPoint] = await Promise.all([
      db.shipperProfile.findUnique({ where: { id: normalized.shipperProfileId }, select: { id: true, isActive: true } }),
      db.loadingPoint.findUnique({ where: { id: normalized.loadingPointId }, select: { id: true, isActive: true } }),
    ])
    if (!shipper?.isActive) return NextResponse.json({ error: 'Active shipper profile not found' }, { status: 400 })
    if (!loadingPoint?.isActive) return NextResponse.json({ error: 'Active loading point not found' }, { status: 400 })

    const requestedStatus = String(body.status || 'open')
    const initialStatus = requestedStatus === 'draft' ? 'draft' : 'open'
    const orderNumber = `LDO-${new Date().getFullYear()}-${randomUUID().slice(0, 8).toUpperCase()}`

    const order = await db.$transaction(async (tx) => {
      const created = await tx.loadOrder.create({
        data: {
          orderNumber,
          shipperProfileId: normalized.shipperProfileId,
          clientId: normalized.clientId || null,
          externalReference: normalized.externalReference || null,
          loadingPointId: normalized.loadingPointId,
          pickupWindowStart: nullableDate(normalized.pickupWindowStart),
          pickupWindowEnd: nullableDate(normalized.pickupWindowEnd),
          deliveryWindowStart: nullableDate(normalized.deliveryWindowStart),
          deliveryWindowEnd: nullableDate(normalized.deliveryWindowEnd),
          requiredVehicleType: normalized.requiredVehicleType || null,
          requiredTrailerType: normalized.requiredTrailerType || null,
          offeredRate: normalized.offeredRate ?? null,
          currency: normalized.currency || 'GHS',
          rateType: nullableString(body.rateType),
          priority: normalized.priority || 'normal',
          specialHandling: normalized.specialHandling || null,
          documents: normalized.documents?.length ? JSON.stringify(normalized.documents) : null,
          sourceType: 'manual',
          status: initialStatus,
          createdBy: auth.userId,
        },
      })

      const destinationIds = new Map<string, string>()
      const destinationData = normalized.destinations.map((destination, index) => {
        const id = randomUUID()
        destinationIds.set(destination.ref, id)
        return {
          id,
          loadOrderId: created.id,
          ref: destination.ref,
          stopOrder: index,
          clientId: destination.clientId || null,
          destinationZoneId: destination.destinationZoneId || null,
          name: destination.name,
          address: destination.address || null,
          latitude: destination.latitude ?? null,
          longitude: destination.longitude ?? null,
          deliveryWindowStart: nullableDate(destination.deliveryWindowStart),
          deliveryWindowEnd: nullableDate(destination.deliveryWindowEnd),
          contactName: destination.contactName || null,
          contactPhone: destination.contactPhone || null,
          notes: destination.notes || null,
        }
      })
      await tx.loadOrderDestination.createMany({ data: destinationData })
      await tx.loadOrderLine.createMany({
        data: normalized.lines.map((line) => ({
          loadOrderId: created.id,
          destinationId: line.destinationRef ? destinationIds.get(line.destinationRef) || null : null,
          ref: line.ref,
          itemId: line.itemId || null,
          itemName: line.itemName,
          externalProductCode: line.externalProductCode || null,
          orderedQuantity: line.quantity,
          unit: line.unit,
          notes: line.notes || null,
        })),
      })
      return tx.loadOrder.findUniqueOrThrow({ where: { id: created.id }, include: orderInclude })
    }, { isolationLevel: 'Serializable' })

    createAuditLog({ userId: auth.userId, action: 'create', entity: 'LoadOrder', entityId: order.id, details: { orderNumber: order.orderNumber, externalReference: order.externalReference, lines: order.LoadOrderLine.length, destinations: order.LoadOrderDestination.length }, ipAddress: getClientIp(request) }).catch(() => {})
    return NextResponse.json(withAllocation(order), { status: 201 })
  } catch (error) {
    console.error('Load order create error:', error)
    return NextResponse.json({ error: 'Failed to create load order' }, { status: 500 })
  }
}
