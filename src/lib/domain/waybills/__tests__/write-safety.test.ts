import { describe, expect, it } from 'vitest'

import {
  assertWaybillFinalizableStatus,
  isWaybillWriteConflict,
} from '@/lib/domain/waybills/write-safety'

describe('electronic waybill write safety', () => {
  it('allows finalization only after post-load weighing has reached a dispatch-preparation state', () => {
    expect(() => assertWaybillFinalizableStatus('postload_weighing')).not.toThrow()
    expect(() => assertWaybillFinalizableStatus('awaiting_dispatch_clearance')).not.toThrow()
    expect(() => assertWaybillFinalizableStatus('exception_hold')).not.toThrow()

    expect(() => assertWaybillFinalizableStatus('loading')).toThrow(/cannot be finalized/i)
    expect(() => assertWaybillFinalizableStatus('in_transit')).toThrow(/cannot be finalized/i)
    expect(() => assertWaybillFinalizableStatus('completed')).toThrow(/cannot be finalized/i)
  })

  it('recognizes unique and serializable transaction conflicts as retryable write conflicts', () => {
    expect(isWaybillWriteConflict({ code: 'P2002' })).toBe(true)
    expect(isWaybillWriteConflict({ code: 'P2034' })).toBe(true)
    expect(isWaybillWriteConflict({ code: 'P2025' })).toBe(false)
    expect(isWaybillWriteConflict(new Error('other'))).toBe(false)
  })
})
