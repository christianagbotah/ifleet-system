import { describe, expect, it } from 'vitest'
import { planLocationCompaction } from '../retention'

function location(id: string, minute: number, speed = 40) {
  return {
    id,
    eventType: 'location',
    assetType: 'tractor',
    assetId: 'truck-1',
    tripId: 'trip-1',
    occurredAt: new Date(`2026-09-01T00:${String(minute).padStart(2, '0')}:00Z`),
    latitude: 5.6 + minute / 1000,
    longitude: -0.18 - minute / 1000,
    speedKph: speed,
  }
}

describe('location-history compaction planning', () => {
  it('preserves first and last location in every bucket and deletes only interior points', () => {
    const plan = planLocationCompaction([
      location('p0', 0, 30),
      location('p1', 1, 40),
      location('p2', 2, 50),
      location('p3', 14, 35),
    ], { bucketMinutes: 15 })

    expect(plan.preserveIds).toEqual(['p0', 'p3'])
    expect(plan.deleteIds).toEqual(['p1', 'p2'])
    expect(plan.summaries).toHaveLength(1)
    expect(plan.summaries[0]).toMatchObject({ pointCount: 4, minSpeedKph: 30, maxSpeedKph: 50 })
  })

  it('never schedules alarm or ignition evidence for deletion', () => {
    const alarm = { ...location('alarm-1', 3), eventType: 'alarm', alarmType: 'sos' }
    const ignition = { ...location('ignition-1', 4), eventType: 'ignition' }
    const plan = planLocationCompaction([location('p0', 0), alarm, ignition, location('p5', 5)], { bucketMinutes: 15 })

    expect(plan.deleteIds).not.toContain('alarm-1')
    expect(plan.deleteIds).not.toContain('ignition-1')
    expect(plan.preserveIds).toEqual(['p0', 'p5'])
  })

  it('keeps a single-point bucket intact', () => {
    const plan = planLocationCompaction([location('only', 0)], { bucketMinutes: 15 })
    expect(plan.preserveIds).toEqual(['only'])
    expect(plan.deleteIds).toEqual([])
    expect(plan.summaries[0].pointCount).toBe(1)
  })
})
