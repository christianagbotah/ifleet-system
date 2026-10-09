interface TrackingAuthResponse {
  ok: boolean
  json(): Promise<unknown>
}

export type TrackingFetch = (
  input: string,
  init?: RequestInit,
) => Promise<TrackingAuthResponse>

export async function validateTrackingSession(
  appBaseUrl: string,
  token: string,
  fetchImpl: TrackingFetch = fetch,
): Promise<boolean> {
  const normalizedToken = token.trim()
  if (!normalizedToken) return false

  const baseUrl = appBaseUrl.replace(/\/$/, '')
  try {
    const response = await fetchImpl(`${baseUrl}/api/auth/me`, {
      method: 'POST',
      headers: {
        authorization: `Bearer ${normalizedToken}`,
        'content-type': 'application/json',
      },
    })
    if (!response.ok) return false

    const payload = await response.json() as { user?: { id?: unknown; isActive?: unknown } | null }
    return Boolean(
      payload.user &&
      typeof payload.user.id === 'string' &&
      payload.user.id.length > 0 &&
      payload.user.isActive !== false
    )
  } catch {
    return false
  }
}
