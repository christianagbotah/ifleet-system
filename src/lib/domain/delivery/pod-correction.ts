export interface ActivePodReference {
  id: string
  tripId: string
  deliveryStopId: string | null
  deliveryDestinationId: string | null
  activeTargetKey: string
}

export interface PlanPodCorrectionInput {
  current: ActivePodReference
  reason: string
  hasApprovedFinancialHistory: boolean
}

export interface PodCorrectionPlan {
  supersedesId: string
  activeTargetKey: string
  releasePriorActiveTarget: boolean
  requiresFinancialReview: boolean
  financialReviewType: 'pod_correction_after_financial_approval' | null
}

export function planPodCorrection(input: PlanPodCorrectionInput): PodCorrectionPlan {
  const reason = input.reason.trim()
  if (!reason) throw new Error('A correction reason is required')
  if (!input.current.activeTargetKey.trim()) throw new Error('Only the active proof of delivery can be corrected')

  return {
    supersedesId: input.current.id,
    activeTargetKey: input.current.activeTargetKey,
    releasePriorActiveTarget: true,
    requiresFinancialReview: input.hasApprovedFinancialHistory,
    financialReviewType: input.hasApprovedFinancialHistory
      ? 'pod_correction_after_financial_approval'
      : null,
  }
}
