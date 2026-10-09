import { describe, expect, it } from 'vitest'
import { trackingSocketEndpoint } from '@/lib/tracking/socket-endpoint'

describe('tracking socket endpoint', () => {
  it('uses the same-origin tracking proxy instead of a transform-port query', () => {
    expect(trackingSocketEndpoint()).toBe('/')
  })
})
