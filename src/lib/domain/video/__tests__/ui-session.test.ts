import { describe, expect, it } from 'vitest'

import { ensureFreshVideoSession, requestUiVideoSession, type UiVideoSession } from '../ui-session'

function jsonResponse(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  })
}

describe('video UI session service', () => {
  it('maps a permission denial to a non-playable denied state', async () => {
    const result = await requestUiVideoSession(
      async () => jsonResponse(403, { error: 'Video access is not permitted.' }),
      '/api/video/devices/device-1/live',
      { channelKey: 'front' },
    )

    expect(result).toEqual({ state: 'denied', message: 'Video access is not permitted.' })
  })

  it('maps unavailable video to a non-playable unavailable state', async () => {
    const result = await requestUiVideoSession(
      async () => jsonResponse(503, { error: 'Video is unavailable.' }),
      '/api/video/devices/device-1/live',
      { channelKey: 'front' },
    )

    expect(result).toEqual({ state: 'unavailable', message: 'Video is unavailable.' })
  })

  it('returns a playable short-lived session on success', async () => {
    const result = await requestUiVideoSession(
      async () => jsonResponse(200, {
        provider: 'generic-http',
        url: 'https://stream.example/live.m3u8',
        token: null,
        expiresAt: '2026-10-10T10:03:00.000Z',
      }),
      '/api/video/devices/device-1/live',
      { channelKey: 'front' },
    )

    expect(result).toEqual({
      state: 'ready',
      session: {
        provider: 'generic-http',
        url: 'https://stream.example/live.m3u8',
        token: null,
        expiresAt: '2026-10-10T10:03:00.000Z',
      },
    })
  })

  it('refreshes an expired playback session instead of reusing it', async () => {
    const stale: UiVideoSession = {
      provider: 'generic-http',
      url: 'https://stream.example/old.mp4',
      token: null,
      expiresAt: '2026-10-10T09:59:59.000Z',
    }
    let calls = 0

    const result = await ensureFreshVideoSession({
      current: stale,
      now: new Date('2026-10-10T10:00:00Z'),
      request: async () => {
        calls += 1
        return {
          state: 'ready' as const,
          session: {
            ...stale,
            url: 'https://stream.example/fresh.mp4',
            expiresAt: '2026-10-10T10:04:00.000Z',
          },
        }
      },
    })

    expect(calls).toBe(1)
    expect(result).toMatchObject({ state: 'ready', session: { url: 'https://stream.example/fresh.mp4' } })
  })

  it('reuses a still-valid session without issuing another request', async () => {
    const current: UiVideoSession = {
      provider: 'generic-http',
      url: 'https://stream.example/current.mp4',
      token: null,
      expiresAt: '2026-10-10T10:04:00.000Z',
    }
    let calls = 0

    const result = await ensureFreshVideoSession({
      current,
      now: new Date('2026-10-10T10:00:00Z'),
      request: async () => {
        calls += 1
        return { state: 'unavailable' as const, message: 'should not run' }
      },
    })

    expect(calls).toBe(0)
    expect(result).toEqual({ state: 'ready', session: current })
  })
})
