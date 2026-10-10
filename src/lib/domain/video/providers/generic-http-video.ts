import { GenericHttpTelematicsProvider } from '@/lib/domain/telematics/providers/generic-http'
import type { VideoPlaybackRequest, VideoSessionDescriptor, VideoSessionRequest } from '@/lib/domain/telematics/provider'

export interface GenericHttpVideoProviderConfig {
  baseUrl: string | null
  apiKey: string | null
}

type FetchLike = (input: string | URL | Request, init?: RequestInit) => Promise<Response>

function gatewayConfigFromEnv(): GenericHttpVideoProviderConfig {
  return {
    baseUrl: process.env.VIDEO_PROVIDER_GATEWAY_URL?.trim() || null,
    apiKey: process.env.VIDEO_PROVIDER_GATEWAY_API_KEY?.trim() || null,
  }
}

function gatewayEndpoint(baseUrl: string | null, action: 'live' | 'playback'): URL {
  if (!baseUrl) throw new Error('Video gateway is not configured')
  const parsed = new URL(baseUrl.endsWith('/') ? baseUrl : `${baseUrl}/`)
  if (parsed.protocol !== 'https:') throw new Error('Video gateway must use HTTPS')
  return new URL(action, parsed)
}

function parseDescriptor(
  data: unknown,
  provider: string,
  channelKey: string,
): VideoSessionDescriptor {
  if (!data || typeof data !== 'object' || Array.isArray(data)) {
    throw new Error('Video gateway returned an invalid response')
  }
  const record = data as Record<string, unknown>
  const url = typeof record.url === 'string' ? record.url.trim() : ''
  const token = typeof record.token === 'string' && record.token.trim() ? record.token.trim() : undefined
  const expiresAt = new Date(String(record.expiresAt ?? ''))
  if (!url || Number.isNaN(expiresAt.getTime())) {
    throw new Error('Video gateway returned an invalid session')
  }
  return { provider, channelKey, url, ...(token ? { token } : {}), expiresAt }
}

export class GenericHttpVideoProvider extends GenericHttpTelematicsProvider {
  constructor(
    private readonly config: GenericHttpVideoProviderConfig = gatewayConfigFromEnv(),
    private readonly fetchImpl: FetchLike = fetch,
  ) {
    super()
  }

  private async requestSession(
    action: 'live' | 'playback',
    payload: Record<string, unknown>,
    channelKey: string,
  ): Promise<VideoSessionDescriptor> {
    const endpoint = gatewayEndpoint(this.config.baseUrl, action)
    const headers = new Headers({ 'content-type': 'application/json' })
    if (this.config.apiKey) headers.set('authorization', `Bearer ${this.config.apiKey}`)

    const response = await this.fetchImpl(endpoint, {
      method: 'POST',
      headers,
      body: JSON.stringify(payload),
      cache: 'no-store',
    })
    if (!response.ok) throw new Error(`Video gateway request failed with status ${response.status}`)

    return parseDescriptor(await response.json(), this.providerId, channelKey)
  }

  async requestLiveVideo(request: VideoSessionRequest): Promise<VideoSessionDescriptor> {
    return this.requestSession('live', {
      deviceId: request.deviceId,
      channelKey: request.channelKey,
      credentialRef: request.credentialRef ?? null,
    }, request.channelKey)
  }

  async requestPlaybackClip(request: VideoPlaybackRequest): Promise<VideoSessionDescriptor> {
    if (request.to.getTime() <= request.from.getTime()) throw new Error('Playback time range is invalid')
    return this.requestSession('playback', {
      deviceId: request.deviceId,
      channelKey: request.channelKey,
      credentialRef: request.credentialRef ?? null,
      from: request.from.toISOString(),
      to: request.to.toISOString(),
    }, request.channelKey)
  }
}
