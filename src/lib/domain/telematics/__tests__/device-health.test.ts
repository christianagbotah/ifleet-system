import { describe, expect, it } from 'vitest'
import { computeDeviceHealth } from '../device-health'

const NOW = new Date('2026-10-09T03:00:00Z')
const ago = (minutes: number) => new Date(NOW.getTime() - minutes * 60 * 1000)

describe('computeDeviceHealth', () => {
  it('classifies fresh, stale and offline devices by latest evidence', () => {
    expect(computeDeviceHealth({ status: 'active', lastSeenAt: ago(1), latestEvents: [] }, NOW).state).toBe('online')
    expect(computeDeviceHealth({ status: 'active', lastSeenAt: ago(10), latestEvents: [] }, NOW).state).toBe('stale')
    expect(computeDeviceHealth({ status: 'active', lastSeenAt: ago(45), latestEvents: [] }, NOW).state).toBe('offline')
  })

  it('marks an active device offline when it has never been seen', () => {
    const result = computeDeviceHealth({ status: 'active', lastSeenAt: null, latestEvents: [] }, NOW)
    expect(result.state).toBe('offline')
    expect(result.lastSeenAt).toBeNull()
  })

  it('surfaces a recent power-loss alarm ahead of generic online state', () => {
    const result = computeDeviceHealth({
      status: 'active',
      lastSeenAt: ago(1),
      latestEvents: [
        { eventType: 'location', occurredAt: ago(1), alarmType: null },
        { eventType: 'alarm', occurredAt: ago(0.5), alarmType: 'power_loss' },
      ],
    }, NOW)
    expect(result.state).toBe('power_loss')
    expect(result.reason).toMatch(/power/i)
  })

  it('does not let an old power-loss alarm override newer healthy telemetry', () => {
    const result = computeDeviceHealth({
      status: 'active',
      lastSeenAt: ago(1),
      latestEvents: [
        { eventType: 'alarm', occurredAt: ago(8), alarmType: 'power_loss' },
        { eventType: 'location', occurredAt: ago(1), alarmType: null },
      ],
    }, NOW)
    expect(result.state).toBe('online')
  })

  it('classifies non-active devices as disabled regardless of telemetry age', () => {
    expect(computeDeviceHealth({ status: 'decommissioned', lastSeenAt: ago(1), latestEvents: [] }, NOW).state).toBe('disabled')
  })
})
