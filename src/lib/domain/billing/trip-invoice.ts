export interface FinalizedPodFact {
  id: string
  acceptedQty: number
  unit: string
  supersedesId: string | null
}

export interface TripInvoiceInput {
  tripId: string
  tripNumber: string
  status: string
  itemName: string
  unit: string
  dispatchedQuantity: number
  unitPrice: number | null
  totalRevenue: number | null
  proofs: FinalizedPodFact[]
}

export interface TripInvoiceLine {
  description: string
  quantity: number
  unitPrice: number
  total: number
}

function money(value: number, label: string): number {
  if (!Number.isFinite(value)) throw new Error(`${label} must be finite`)
  return Math.round((value + Number.EPSILON) * 100) / 100
}

function normalizeUnit(value: string): string {
  return value.trim().toLowerCase().replace(/\s+/g, '_')
}

export function deriveTripInvoiceLine(input: TripInvoiceInput): TripInvoiceLine {
  if (!['reconciled', 'completed'].includes(input.status)) {
    throw new Error('Trip must be reconciled before customer invoicing')
  }
  if (input.proofs.length === 0) throw new Error('Final proof of delivery is required before customer invoicing')
  if (!Number.isFinite(input.dispatchedQuantity) || input.dispatchedQuantity <= 0) {
    throw new Error('Dispatched quantity must be positive')
  }

  const superseded = new Set(input.proofs.flatMap((proof) => proof.supersedesId ? [proof.supersedesId] : []))
  const effective = input.proofs.filter((proof) => !superseded.has(proof.id))
  const tripUnit = normalizeUnit(input.unit)

  let quantity = 0
  for (const proof of effective) {
    if (normalizeUnit(proof.unit) !== tripUnit) throw new Error('Proof of delivery unit does not match trip commercial unit')
    if (!Number.isFinite(proof.acceptedQty) || proof.acceptedQty < 0) throw new Error('Accepted quantity must not be negative')
    quantity += proof.acceptedQty
  }
  quantity = money(quantity, 'Delivered quantity')
  if (quantity <= 0) throw new Error('Final proof of delivery has no accepted quantity to invoice')

  let unitPrice = input.unitPrice == null ? Number.NaN : Number(input.unitPrice)
  if (!Number.isFinite(unitPrice) || unitPrice < 0) {
    const revenue = Number(input.totalRevenue ?? Number.NaN)
    if (!Number.isFinite(revenue) || revenue < 0) throw new Error('Trip commercial rate is unavailable')
    unitPrice = revenue / input.dispatchedQuantity
  }
  unitPrice = money(unitPrice, 'Commercial unit rate')

  return {
    description: `${input.itemName} · ${input.tripNumber} · finalized delivery`,
    quantity,
    unitPrice,
    total: money(quantity * unitPrice, 'Invoice line total'),
  }
}
