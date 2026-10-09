export interface ExceptionResolutionInput {
  status: string
  resolutionNotes: string
  adjustmentAmount: number
  adjustmentReason: string | null
}

export interface ExceptionResolutionPlan {
  closeException: boolean
  adjustment: { amount: number; reason: string } | null
}

export function planReconciliationExceptionResolution(input: ExceptionResolutionInput): ExceptionResolutionPlan {
  if (['resolved', 'closed'].includes(input.status.trim().toLowerCase())) {
    throw new Error('Reconciliation exception is already resolved')
  }

  const resolutionNotes = input.resolutionNotes.trim()
  if (!resolutionNotes) throw new Error('Resolution notes are required')

  const adjustmentAmount = Number(input.adjustmentAmount)
  if (!Number.isFinite(adjustmentAmount)) throw new Error('Adjustment amount must be a finite number')

  if (adjustmentAmount === 0) {
    return { closeException: true, adjustment: null }
  }

  const adjustmentReason = input.adjustmentReason?.trim() ?? ''
  if (!adjustmentReason) throw new Error('Adjustment reason is required when the financial impact is non-zero')

  return {
    closeException: true,
    adjustment: {
      amount: adjustmentAmount,
      reason: adjustmentReason,
    },
  }
}
