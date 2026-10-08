export interface TransportRateCandidate {
  id: string
  contractId?: string | null
  transporterId?: string | null
  shipperProfileId?: string | null
  loadingPointId?: string | null
  destinationZoneId?: string | null
  itemId?: string | null
  unit?: string | null
  rateAmount: number
  currency: string
  effectiveFrom: Date
  effectiveTo?: Date | null
  isActive: boolean
  priority?: number
}

export interface RateResolutionInput {
  shipperProfileId?: string | null
  loadingPointId?: string | null
  destinationZoneId?: string | null
  itemId?: string | null
  unit?: string | null
  at: Date
  candidates: readonly TransportRateCandidate[]
}

export interface ResolvedTransportRate {
  rateCardId: string
  contractId: string | null
  transporterId: string | null
  rateAmount: number
  currency: string
  specificity: number
  effectiveFrom: Date
  effectiveTo: Date | null
}
