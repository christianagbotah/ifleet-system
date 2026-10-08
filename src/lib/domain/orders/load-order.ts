export interface LoadOrderDestinationDraft {
  ref: string
  name: string
  clientId?: string | null
  destinationZoneId?: string | null
  address?: string | null
  latitude?: number | null
  longitude?: number | null
  deliveryWindowStart?: Date | string | null
  deliveryWindowEnd?: Date | string | null
  contactName?: string | null
  contactPhone?: string | null
  notes?: string | null
}

export interface LoadOrderLineDraft {
  ref: string
  itemId?: string | null
  itemName: string
  externalProductCode?: string | null
  quantity: number
  unit: string
  destinationRef?: string | null
  notes?: string | null
}

export interface LoadOrderDraft {
  shipperProfileId: string
  clientId?: string | null
  externalReference?: string | null
  loadingPointId: string
  pickupWindowStart?: Date | string | null
  pickupWindowEnd?: Date | string | null
  deliveryWindowStart?: Date | string | null
  deliveryWindowEnd?: Date | string | null
  requiredVehicleType?: string | null
  requiredTrailerType?: string | null
  offeredRate?: number | null
  currency?: string
  priority?: string
  specialHandling?: string | null
  documents?: string[]
  destinations: LoadOrderDestinationDraft[]
  lines: LoadOrderLineDraft[]
}

export interface ExistingLoadOrderReference {
  shipperProfileId: string
  externalReference: string | null
}

export interface LoadOrderValidationResult {
  valid: boolean
  blocking: string[]
  normalized?: LoadOrderDraft
}

export interface AllocationOrder {
  lines: Array<{ id: string; quantity: number }>
}

export interface AllocationTrip {
  status: string
  items: Array<{ loadOrderLineId: string | null; quantity: number }>
}

export interface AllocationSummary {
  valid: boolean
  overAllocatedLineIds: string[]
  lines: Array<{
    lineId: string
    ordered: number
    allocated: number
    remaining: number
    overAllocated: number
  }>
}

function cleaned(value: string | null | undefined): string | null {
  const trimmed = value?.trim()
  return trimmed ? trimmed : null
}

function comparable(value: string | null | undefined): string {
  return cleaned(value)?.toLocaleLowerCase() ?? ''
}

export function validateLoadOrder(
  input: LoadOrderDraft,
  existingOrders: ExistingLoadOrderReference[] = []
): LoadOrderValidationResult {
  const blocking: string[] = []
  const shipperProfileId = cleaned(input.shipperProfileId) ?? ''
  const loadingPointId = cleaned(input.loadingPointId) ?? ''
  const externalReference = cleaned(input.externalReference)

  if (!shipperProfileId) blocking.push('shipper_profile_required')
  if (!loadingPointId) blocking.push('loading_point_required')
  if (input.destinations.length === 0) blocking.push('destination_required')
  if (input.lines.length === 0) blocking.push('line_required')

  const destinationRefs = new Set<string>()
  for (const destination of input.destinations) {
    const ref = cleaned(destination.ref)
    if (!ref || !cleaned(destination.name)) {
      blocking.push('invalid_destination')
      continue
    }
    if (destinationRefs.has(ref)) blocking.push('duplicate_destination_ref')
    destinationRefs.add(ref)
  }

  const lineRefs = new Set<string>()
  const singleDestinationRef = input.destinations.length === 1
    ? cleaned(input.destinations[0]?.ref)
    : null

  const normalizedLines = input.lines.map((line) => {
    const ref = cleaned(line.ref) ?? ''
    const itemName = cleaned(line.itemName) ?? ''
    const unit = cleaned(line.unit) ?? ''
    const destinationRef = cleaned(line.destinationRef) ?? singleDestinationRef

    if (!ref || !itemName) blocking.push('invalid_line')
    if (lineRefs.has(ref)) blocking.push('duplicate_line_ref')
    lineRefs.add(ref)
    if (!Number.isFinite(line.quantity) || line.quantity <= 0) blocking.push('invalid_quantity')
    if (!unit) blocking.push('invalid_unit')
    if (input.destinations.length > 1 && !destinationRef) blocking.push('line_destination_required')
    if (destinationRef && !destinationRefs.has(destinationRef)) blocking.push('unknown_destination')

    return {
      ...line,
      ref,
      itemName,
      unit,
      destinationRef,
    }
  })

  if (externalReference) {
    const duplicate = existingOrders.some(
      (order) =>
        order.shipperProfileId === shipperProfileId &&
        comparable(order.externalReference) === comparable(externalReference)
    )
    if (duplicate) blocking.push('duplicate_external_reference')
  }

  const normalized: LoadOrderDraft = {
    ...input,
    shipperProfileId,
    loadingPointId,
    externalReference,
    currency: cleaned(input.currency) ?? 'GHS',
    priority: cleaned(input.priority) ?? 'normal',
    destinations: input.destinations.map((destination) => ({
      ...destination,
      ref: cleaned(destination.ref) ?? '',
      name: cleaned(destination.name) ?? '',
    })),
    lines: normalizedLines,
  }

  return {
    valid: blocking.length === 0,
    blocking: [...new Set(blocking)],
    normalized,
  }
}

export function allocateLoadOrderQuantity(
  order: AllocationOrder,
  existingTrips: AllocationTrip[]
): AllocationSummary {
  const allocatedByLine = new Map<string, number>()

  for (const trip of existingTrips) {
    if (trip.status === 'cancelled') continue
    for (const item of trip.items) {
      if (!item.loadOrderLineId || !Number.isFinite(item.quantity) || item.quantity <= 0) continue
      allocatedByLine.set(
        item.loadOrderLineId,
        (allocatedByLine.get(item.loadOrderLineId) ?? 0) + item.quantity
      )
    }
  }

  const lines = order.lines.map((line) => {
    const allocated = allocatedByLine.get(line.id) ?? 0
    const overAllocated = Math.max(0, allocated - line.quantity)
    return {
      lineId: line.id,
      ordered: line.quantity,
      allocated,
      remaining: Math.max(0, line.quantity - allocated),
      overAllocated,
    }
  })
  const overAllocatedLineIds = lines
    .filter((line) => line.overAllocated > 0)
    .map((line) => line.lineId)

  return {
    valid: overAllocatedLineIds.length === 0,
    overAllocatedLineIds,
    lines,
  }
}

export type LoadOrderStatusValue =
  | 'draft'
  | 'open'
  | 'partially_allocated'
  | 'allocated'
  | 'in_progress'
  | 'on_hold'
  | 'completed'
  | 'cancelled'

const LOAD_ORDER_TRANSITIONS: Record<LoadOrderStatusValue, readonly LoadOrderStatusValue[]> = {
  draft: ['open', 'on_hold', 'cancelled'],
  open: ['partially_allocated', 'allocated', 'on_hold', 'cancelled'],
  partially_allocated: ['allocated', 'on_hold', 'cancelled'],
  allocated: ['in_progress', 'on_hold', 'cancelled'],
  in_progress: ['completed', 'on_hold', 'cancelled'],
  on_hold: ['open', 'partially_allocated', 'allocated', 'in_progress', 'cancelled'],
  completed: [],
  cancelled: [],
}

export function canTransitionLoadOrderStatus(
  from: LoadOrderStatusValue,
  to: LoadOrderStatusValue
): boolean {
  return LOAD_ORDER_TRANSITIONS[from].includes(to)
}
