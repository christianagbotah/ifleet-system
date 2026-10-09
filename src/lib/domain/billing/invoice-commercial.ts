export interface FinalizedTripCommercialFact {
  tripNumber: string
  loadingLocation: string
  destination: string
  quantity: number
  unit: string
  unitPrice: number | null
  totalRevenue: number | null
}

export interface DerivedInvoiceLine {
  description: string
  quantity: number
  unitPrice: number
  total: number
}

function finiteNonNegative(value: number, label: string): number {
  if (!Number.isFinite(value) || value < 0) throw new Error(`${label} must be a finite non-negative value`)
  return Math.round((value + Number.EPSILON) * 100) / 100
}

export function deriveTripInvoiceCommercialLine(input: {
  trip: FinalizedTripCommercialFact
  acceptedPodQuantities: number[]
}): DerivedInvoiceLine {
  const tripQuantity = finiteNonNegative(input.trip.quantity, 'Trip quantity')
  const accepted = input.acceptedPodQuantities.map((value) => finiteNonNegative(value, 'POD accepted quantity'))
  const acceptedTotal = accepted.length > 0
    ? Math.round((accepted.reduce((sum, value) => sum + value, 0) + Number.EPSILON) * 100) / 100
    : tripQuantity
  const route = `${input.trip.loadingLocation} → ${input.trip.destination}`

  if (input.trip.unitPrice !== null) {
    const unitPrice = finiteNonNegative(input.trip.unitPrice, 'Trip rate')
    return {
      description: `Freight ${input.trip.tripNumber} · ${route} · ${input.trip.unit}`,
      quantity: acceptedTotal,
      unitPrice,
      total: Math.round((acceptedTotal * unitPrice + Number.EPSILON) * 100) / 100,
    }
  }

  if (input.trip.totalRevenue === null) throw new Error('Finalized commercial value is required for trip-linked invoice')
  const totalRevenue = finiteNonNegative(input.trip.totalRevenue, 'Finalized commercial value')
  return {
    description: `Freight ${input.trip.tripNumber} · ${route}`,
    quantity: 1,
    unitPrice: totalRevenue,
    total: totalRevenue,
  }
}
