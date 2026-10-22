export type TelemetryFreshness = 'online' | 'stale' | 'offline'

export const ONLINE_TELEMETRY_MAX_AGE_MS = 2 * 60 * 1000
export const STALE_TELEMETRY_MAX_AGE_MS = 30 * 60 * 1000

type TimestampLike = Date | string | number | null | undefined

function timestampMilliseconds(value: TimestampLike): number | null {
  if (value instanceof Date) {
    const milliseconds = value.getTime()
    return Number.isFinite(milliseconds) ? milliseconds : null
  }
  if (typeof value === 'number') return Number.isFinite(value) ? value : null
  if (typeof value === 'string' && value.trim()) {
    const milliseconds = new Date(value).getTime()
    return Number.isFinite(milliseconds) ? milliseconds : null
  }
  return null
}

export function classifyTelemetryFreshness(
  lastSeenAt: TimestampLike,
  now: Date = new Date(),
): TelemetryFreshness {
  const lastSeenMilliseconds = timestampMilliseconds(lastSeenAt)
  const nowMilliseconds = timestampMilliseconds(now)
  if (lastSeenMilliseconds == null || nowMilliseconds == null) return 'offline'

  const ageMilliseconds = Math.max(0, nowMilliseconds - lastSeenMilliseconds)
  if (ageMilliseconds <= ONLINE_TELEMETRY_MAX_AGE_MS) return 'online'
  if (ageMilliseconds <= STALE_TELEMETRY_MAX_AGE_MS) return 'stale'
  return 'offline'
}

export function activeTruckIdsFromLocations<
  T extends { truckId: string; receivedAt?: TimestampLike; timestamp?: TimestampLike },
>(locations: T[], now: Date = new Date()): string[] {
  return locations
    .filter((location) => classifyTelemetryFreshness(location.receivedAt ?? location.timestamp, now) === 'online')
    .map((location) => location.truckId)
}
