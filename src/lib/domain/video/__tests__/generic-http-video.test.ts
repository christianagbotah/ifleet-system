import { describe, expect, it } from 'vitest'

import { GenericHttpVideoProvider } from '../providers/generic-http-video'

describe('generic HTTP video provider gateway', () => {
  it('requests a live session from the server-side gateway using only a credential reference', async () => {
    const requests: Array<{ url: string; init?: RequestInit }> = []
    const provider = new GenericHttpVideoProvider(
      { baseUrl: 'https://gateway.example/video/', apiKey: 'server-only-key' },
      async (input, init) => {
        requests.push({ url: String(input), init })
        return new Response(JSON.stringify({
          url: 'https://stream.example/session/1.m3u8',
          token: 'ephemeral',
          expiresAt: '2026-10-10T10:03:00.000Z',
        }), { status: 200, headers: { 'content-type': 'application/json' } })
      },
    )

    const result = await provider.requestLiveVideo!({
      deviceId: 'device-1',
      channelKey: 'front',
      credentialRef: 'vault:camera/device-1',
    })

    expect(result).toMatchObject({
      provider: 'generic-http',
      channelKey: 'front',
      url: 'https://stream.example/session/1.m3u8',
      token: 'ephemeral',
    })
    expect(requests).toHaveLength(1)
    expect(requests[0].url).toBe('https://gateway.example/video/live')
    expect(new Headers(requests[0].init?.headers).get('authorization')).toBe('Bearer server-only-key')
    const sent = JSON.parse(String(requests[0].init?.body))
    expect(sent).toEqual({ deviceId: 'device-1', channelKey: 'front', credentialRef: 'vault:camera/device-1' })
    expect(JSON.stringify(sent)).not.toContain('server-only-key')
  })

  it('requests incident playback with an explicit bounded time range', async () => {
    let sent: Record<string, unknown> | null = null
    const provider = new GenericHttpVideoProvider(
      { baseUrl: 'https://gateway.example/video', apiKey: null },
      async (_input, init) => {
        sent = JSON.parse(String(init?.body))
        return new Response(JSON.stringify({
          url: 'https://stream.example/playback/clip.mp4',
          expiresAt: '2026-10-10T10:04:00.000Z',
        }), { status: 200 })
      },
    )

    await provider.requestPlaybackClip!({
      deviceId: 'device-1',
      channelKey: 'front',
      credentialRef: null,
      from: new Date('2026-10-10T09:59:30Z'),
      to: new Date('2026-10-10T10:01:30Z'),
    })

    expect(sent).toMatchObject({
      deviceId: 'device-1',
      channelKey: 'front',
      from: '2026-10-10T09:59:30.000Z',
      to: '2026-10-10T10:01:30.000Z',
    })
  })

  it('fails closed when the video gateway is not configured', async () => {
    const provider = new GenericHttpVideoProvider({ baseUrl: null, apiKey: null })

    await expect(provider.requestLiveVideo!({ deviceId: 'device-1', channelKey: 'front' }))
      .rejects.toThrow('Video gateway is not configured')
  })
})
