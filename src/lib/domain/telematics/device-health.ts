export interface DeviceHealthEvent {
  eventType: string
  occurredAt: Date
  alarmType?: string | null
}

export interface DeviceHealthInput {
  status: string
  lastSeenAt: Date | null
  latestEvents: DeviceHealthEvent[]
}

export type DeviceHealthState = 'online' | 'stale' | 'offline' | 'power_loss' | 'disabled'

export interface DeviceHealth {
  state: DeviceHealthState
  lastSeenAt: Date | null
  reason: string | null
}

const ONLINE_MS = 2 * 60 * 1000
const STALE_MS = 30 * 60 * 1000

export function computeDeviceHealth(input: DeviceHealthInput, now: Date): DeviceHealth {
  if (input.status !== 'active') {
    return { state: 'disabled', lastSeenAt: input.lastSeenAt, reason: 'Device is not active' }
  }

  const events = [...input.latestEvents].sort((a, b) => b.occurredAt.getTime() - a.occurredAt.getTime())
  const latest = events[0] ?? null
  if (latest?.eventType === 'alarm' && latest.alarmType === 'power_loss') {
    return { state: 'power_loss', lastSeenAt: input.lastSeenAt, reason: 'Recent power loss alarm' }
  }

  const latestTimestamp = Math.max(
    input.lastSeenAt?.getTime() ?? Number.NEGATIVE_INFINITY,
    latest?.occurredAt.getTime() ?? Number.NEGATIVE_INFINITY,
  )
  if (!Number.isFinite(latestTimestamp)) {
    return { state: 'offline', lastSeenAt: null, reason: 'Device has never reported telemetry' }
  }

  const lastSeenAt = new Date(latestTimestamp)
  const age = Math.max(0, now.getTime() - latestTimestamp)
  if (age <= ONLINE_MS) return { state: 'online', lastSeenAt, reason: null }
  if (age <= STALE_MS) return { state: 'stale', lastSeenAt, reason: 'Telemetry is delayed' }
  return { state: 'offline', lastSeenAt, reason: 'No recent telemetry' }
}
