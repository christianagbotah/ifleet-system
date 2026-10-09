import { describe, expect, it } from 'vitest'
import { planPodCorrection } from '../pod-correction'

const current = {
  id: 'pod-1',
  tripId: 'trip-1',
  deliveryStopId: 'stop-1',
  deliveryDestinationId: null,
  activeTargetKey: 'trip-1:delivery_stop:stop-1',
}

describe('POD correction planning', () => {
  it('requires an explicit correction reason', () => {
    expect(() => planPodCorrection({ current, reason: '  ', hasApprovedFinancialHistory: false }))
      .toThrow(/reason/i)
  })

  it('creates an append-only superseding correction for the same delivery target', () => {
    const result = planPodCorrection({ current, reason: 'Receiver corrected accepted quantity', hasApprovedFinancialHistory: false })

    expect(result).toMatchObject({
      supersedesId: 'pod-1',
      activeTargetKey: 'trip-1:delivery_stop:stop-1',
      releasePriorActiveTarget: true,
      requiresFinancialReview: false,
    })
  })

  it('opens financial review when approved reconciliation or settlement history exists', () => {
    const result = planPodCorrection({ current, reason: 'Correct shortage evidence', hasApprovedFinancialHistory: true })

    expect(result.requiresFinancialReview).toBe(true)
    expect(result.financialReviewType).toBe('pod_correction_after_financial_approval')
  })
})
