import { describe, expect, it } from 'vitest'
import { resolveTrackingSocketPort, trackingSocketEndpoint } from '@/lib/tracking/socket-endpoint'

describe('tracking socket endpoint', () => {
  it('uses iFleetPro dedicated port 3033 by default', () => {
    expect(resolveTrackingSocketPort(undefined)).toBe(3033)
    expect(trackingSocketEndpoint(undefined)).toBe('/?XTransformPort=3033')
  })

  it('accepts a valid configured port', () => {
    expect(resolveTrackingSocketPort('3103')).toBe(3103)
    expect(trackingSocketEndpoint('3103')).toBe('/?XTransformPort=3103')
  })

  it('falls back safely for invalid or privileged ports', () => {
    expect(resolveTrackingSocketPort('abc')).toBe(3033)
    expect(resolveTrackingSocketPort('80')).toBe(3033)
    expect(resolveTrackingSocketPort('70000')).toBe(3033)
  })
})
