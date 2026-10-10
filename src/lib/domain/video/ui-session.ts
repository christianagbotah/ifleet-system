export interface UiVideoSession {
  provider: string
  url: string
  token: string | null
  expiresAt: string
}

export type UiVideoSessionState =
  | { state: 'ready'; session: UiVideoSession }
  | { state: 'denied'; message: string }
  | { state: 'unavailable'; message: string }
  | { state: 'error'; message: string }

export type VideoFetch = (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>

function messageFromBody(body: unknown, fallback: string): string {
  if (body && typeof body === 'object' && !Array.isArray(body)) {
    const message = (body as Record<string, unknown>).error
    if (typeof message === 'string' && message.trim()) return message.trim()
  }
  return fallback
}

function parseReadySession(body: unknown): UiVideoSession | null {
  if (!body || typeof body !== 'object' || Array.isArray(body)) return null
  const record = body as Record<string, unknown>
  const provider = typeof record.provider === 'string' ? record.provider.trim() : ''
  const url = typeof record.url === 'string' ? record.url.trim() : ''
  const expiresAt = typeof record.expiresAt === 'string' ? record.expiresAt.trim() : ''
  const token = record.token == null ? null : typeof record.token === 'string' ? record.token : null
  if (!provider || !url || !expiresAt || Number.isNaN(Date.parse(expiresAt))) return null
  return { provider, url, token, expiresAt }
}

export async function requestUiVideoSession(
  fetcher: VideoFetch,
  endpoint: string,
  body: Record<string, unknown>,
  token?: string | null,
): Promise<UiVideoSessionState> {
  try {
    const response = await fetcher(endpoint, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      body: JSON.stringify(body),
    })
    const payload = await response.json().catch(() => null)

    if (response.status === 401 || response.status === 403) {
      return { state: 'denied', message: messageFromBody(payload, 'Video access is not permitted.') }
    }
    if (response.status === 404 || response.status === 503) {
      return { state: 'unavailable', message: messageFromBody(payload, 'Video is unavailable.') }
    }
    if (!response.ok) {
      return { state: 'error', message: messageFromBody(payload, 'Unable to start video session.') }
    }

    const session = parseReadySession(payload)
    if (!session) return { state: 'error', message: 'Video provider returned an invalid session.' }
    return { state: 'ready', session }
  } catch {
    return { state: 'error', message: 'Unable to reach the video service.' }
  }
}

export async function ensureFreshVideoSession(input: {
  current: UiVideoSession | null
  now?: Date
  request: () => Promise<UiVideoSessionState>
}): Promise<UiVideoSessionState> {
  const now = input.now ?? new Date()
  if (input.current) {
    const expiresAt = Date.parse(input.current.expiresAt)
    if (Number.isFinite(expiresAt) && expiresAt > now.getTime()) {
      return { state: 'ready', session: input.current }
    }
  }
  return input.request()
}
