import { describe, expect, it } from 'vitest'
import { existsSync, readFileSync } from 'node:fs'
import path from 'node:path'

import {
  assertWaybillFinalizableStatus,
  isWaybillWriteConflict,
} from '@/lib/domain/waybills/write-safety'

function read(relativePath: string) {
  const absolute = path.join(process.cwd(), relativePath)
  expect(existsSync(absolute), `${relativePath} should exist`).toBe(true)
  return readFileSync(absolute, 'utf8')
}

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

  it('enforces the finalizable-status guard inside the trip waybill write route', () => {
    const route = read('src/app/api/trips/[id]/waybill/route.ts')

    expect(route).toContain("from '@/lib/domain/waybills/write-safety'")
    expect(route).toContain('assertWaybillFinalizableStatus(trip.status)')
  })
})
