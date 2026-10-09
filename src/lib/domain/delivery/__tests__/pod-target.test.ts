import { describe, expect, it } from 'vitest'
import { buildPodTargetKey, ensurePodTargetOpen } from '../pod-target'

describe('POD target identity', () => {
  it('builds one stable target key per trip destination/stop', () => {
    expect(buildPodTargetKey('trip-1', 'destination', 'dest-1')).toBe('trip-1:destination:dest-1')
    expect(buildPodTargetKey('trip-1', 'delivery_stop', 'stop-1')).toBe('trip-1:delivery_stop:stop-1')
    expect(buildPodTargetKey('trip-1', 'trip', null)).toBe('trip-1:trip')
  })

  it('rejects a new active POD when the target is already completed', () => {
    expect(() => ensurePodTargetOpen({ id: 'pod-existing' })).toThrowError('POD_TARGET_ALREADY_COMPLETED')
    expect(() => ensurePodTargetOpen(null)).not.toThrow()
  })
})
