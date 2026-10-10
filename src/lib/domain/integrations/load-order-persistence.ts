import { randomUUID } from 'node:crypto'

import { db } from '@/lib/db'
import type { LoadOrderDraft } from '@/lib/domain/orders/load-order'

function dateOrNull(value: Date | string | null | undefined): Date | null {
  if (!value) return null
  const date = value instanceof Date ? value : new Date(value)
  return Number.isNaN(date.getTime()) ? null : date
}

export async function persistImportedLoadOrder(
  draft: LoadOrderDraft,
  context: { createdBy: string; sourceType: string },
): Promise<{ id: string }> {
  const [shipper, loadingPoint] = await Promise.all([
    db.shipperProfile.findUnique({ where: { id: draft.shipperProfileId }, select: { id: true, isActive: true } }),
    db.loadingPoint.findUnique({ where: { id: draft.loadingPointId }, select: { id: true, isActive: true } }),
  ])
  if (!shipper?.isActive) throw new Error('active_shipper_profile_not_found')
  if (!loadingPoint?.isActive) throw new Error('active_loading_point_not_found')

  return db.$transaction(async (tx) => {
    const created = await tx.loadOrder.create({
      data: {
        orderNumber: `LDO-${new Date().getFullYear()}-${randomUUID().slice(0, 8).toUpperCase()}`,
        shipperProfileId: draft.shipperProfileId,
        clientId: draft.clientId || null,
        externalReference: draft.externalReference || null,
        loadingPointId: draft.loadingPointId,
        pickupWindowStart: dateOrNull(draft.pickupWindowStart),
        pickupWindowEnd: dateOrNull(draft.pickupWindowEnd),
        deliveryWindowStart: dateOrNull(draft.deliveryWindowStart),
        deliveryWindowEnd: dateOrNull(draft.deliveryWindowEnd),
        requiredVehicleType: draft.requiredVehicleType || null,
        requiredTrailerType: draft.requiredTrailerType || null,
        offeredRate: draft.offeredRate ?? null,
        currency: draft.currency || 'GHS',
        priority: draft.priority || 'normal',
        specialHandling: draft.specialHandling || null,
        documents: draft.documents?.length ? JSON.stringify(draft.documents) : null,
        sourceType: context.sourceType,
        status: 'open',
        createdBy: context.createdBy,
      },
    })

    const destinationIds = new Map<string, string>()
    await tx.loadOrderDestination.createMany({
      data: draft.destinations.map((destination, index) => {
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
          deliveryWindowStart: dateOrNull(destination.deliveryWindowStart),
          deliveryWindowEnd: dateOrNull(destination.deliveryWindowEnd),
          contactName: destination.contactName || null,
          contactPhone: destination.contactPhone || null,
          notes: destination.notes || null,
        }
      }),
    })

    await tx.loadOrderLine.createMany({
      data: draft.lines.map((line) => ({
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

    return { id: created.id }
  }, { isolationLevel: 'Serializable' })
}
