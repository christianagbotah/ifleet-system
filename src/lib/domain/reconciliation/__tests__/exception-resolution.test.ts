import { describe, expect, it } from 'vitest'
import { planReconciliationExceptionResolution } from '../exception-resolution'

describe('reconciliation exception resolution', () => {
  it('requires explicit resolution notes', () => {
    expect(() => planReconciliationExceptionResolution({
      status: 'open',
      resolutionNotes: '   ',
      adjustmentAmount: 0,
      adjustmentReason: null,
    })).toThrow(/resolution notes/i)
  })

  it('records an explicit zero-impact decision without creating an adjustment', () => {
    expect(planReconciliationExceptionResolution({
      status: 'open',
      resolutionNotes: 'Evidence corrected but no financial impact',
      adjustmentAmount: 0,
      adjustmentReason: null,
    })).toEqual({
      closeException: true,
      adjustment: null,
    })
  })

  it('requires a reason and creates a signed adjustment when money changes', () => {
    expect(() => planReconciliationExceptionResolution({
      status: 'open',
      resolutionNotes: 'Shortage value corrected',
      adjustmentAmount: -125,
      adjustmentReason: '',
    })).toThrow(/adjustment reason/i)

    expect(planReconciliationExceptionResolution({
      status: 'open',
      resolutionNotes: 'Shortage value corrected',
      adjustmentAmount: -125,
      adjustmentReason: 'Reverse overstated shortage charge',
    })).toEqual({
      closeException: true,
      adjustment: {
        amount: -125,
        reason: 'Reverse overstated shortage charge',
      },
    })
  })

  it('rejects a second resolution of an already closed exception', () => {
    expect(() => planReconciliationExceptionResolution({
      status: 'resolved',
      resolutionNotes: 'again',
      adjustmentAmount: 0,
      adjustmentReason: null,
    })).toThrow(/already resolved/i)
  })
})
