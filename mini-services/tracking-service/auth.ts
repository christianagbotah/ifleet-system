interface TrackingAuthResponse {
  ok: boolean
  json(): Promise<unknown>
}

export type TrackingFetch = (
  input: string,
  init?: RequestInit,
) => Promise<TrackingAuthResponse>

export interface TrackingSession {
  userId: string
  roleName: string
  permissions: string[]
  driverId: string | null
}

export function canViewFleetTracking(session: TrackingSession): boolean {
  return session.roleName === 'Admin' || session.roleName === 'Manager' || session.permissions.includes('trucks.view')
}

export async function loadTrackingSession(
  appBaseUrl: string,
  token: string,
  fetchImpl: TrackingFetch = fetch,
): Promise<TrackingSession | null> {
  const normalizedToken = token.trim()
  if (!normalizedToken) return null

  const baseUrl = appBaseUrl.replace(/\/$/, '')
  try {
    const response = await fetchImpl(`${baseUrl}/api/auth/me`, {
      method: 'POST',
      headers: {
        authorization: `Bearer ${normalizedToken}`,
        'content-type': 'application/json',
      },
    })
    if (!response.ok) return null

    const payload = await response.json() as {
      user?: {
        id?: unknown
        role?: unknown
        permissions?: unknown
        driverId?: unknown
        isActive?: unknown
      } | null
    }
    const user = payload.user
    if (!user || typeof user.id !== 'string' || !user.id || typeof user.role !== 'string' || user.isActive === false) {
      return null
    }

    return {
      userId: user.id,
      roleName: user.role,
      permissions: Array.isArray(user.permissions)
        ? user.permissions.filter((permission): permission is string => typeof permission === 'string')
        : [],
      driverId: typeof user.driverId === 'string' && user.driverId ? user.driverId : null,
    }
  } catch {
    return null
  }
}

export async function validateTrackingSession(
  appBaseUrl: string,
  token: string,
  fetchImpl: TrackingFetch = fetch,
): Promise<boolean> {
  return (await loadTrackingSession(appBaseUrl, token, fetchImpl)) !== null
}
