import { describe, expect, it } from 'vitest'

import { normalizeVideoCapabilities } from '../capabilities'

describe('normalizeVideoCapabilities', () => {
  it('normalizes front, cabin, rear and side channel orientation with privacy classes', () => {
    const result = normalizeVideoCapabilities({
      videoEnabled: true,
      supportsLive: true,
      supportsPlayback: true,
      supportsSnapshot: true,
      channels: [
        { key: '1', label: 'Road camera', orientation: 'front-road' },
        { key: '2', label: 'Driver camera', orientation: 'driver' },
        { key: '3', label: 'Rear camera', orientation: 'rear' },
        { key: '4', label: 'Kerb side', orientation: 'side-left' },
      ],
    })

    expect(result.supported).toBe(true)
    expect(result.channels).toEqual([
      expect.objectContaining({ key: '1', orientation: 'front', privacyClass: 'road', enabled: true }),
      expect.objectContaining({ key: '2', orientation: 'cabin', privacyClass: 'driver', enabled: true }),
      expect.objectContaining({ key: '3', orientation: 'rear', privacyClass: 'exterior', enabled: true }),
      expect.objectContaining({ key: '4', orientation: 'left', privacyClass: 'exterior', enabled: true }),
    ])
  })

  it('returns a clean unsupported capability for a non-video device', () => {
    expect(normalizeVideoCapabilities({ videoEnabled: false })).toEqual({
      supported: false,
      liveView: false,
      playback: false,
      snapshot: false,
      channels: [],
      availableChannels: [],
    })
  })

  it('preserves mixed feature capability without promoting unsupported operations', () => {
    const result = normalizeVideoCapabilities({
      videoEnabled: true,
      supportsLive: false,
      supportsPlayback: true,
      supportsSnapshot: true,
      channels: [{ key: 'front', orientation: 'front' }],
    })

    expect(result).toMatchObject({
      supported: true,
      liveView: false,
      playback: true,
      snapshot: true,
    })
    expect(result.availableChannels).toEqual(['front'])
  })

  it('keeps a disabled camera configurable but removes it from available channels', () => {
    const result = normalizeVideoCapabilities({
      videoEnabled: true,
      supportsLive: true,
      channels: [
        { key: 'front', orientation: 'front', enabled: true },
        { key: 'cabin', orientation: 'cabin', enabled: false, privacyClass: 'driver' },
      ],
    })

    expect(result.channels).toEqual([
      expect.objectContaining({ key: 'front', enabled: true }),
      expect.objectContaining({ key: 'cabin', enabled: false, privacyClass: 'driver' }),
    ])
    expect(result.availableChannels).toEqual(['front'])
  })
})
