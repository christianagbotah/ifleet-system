import { describe, expect, it } from 'vitest'

import { buildTripAdvisory, type TripAdvisoryRepository } from '../trip-advisory'

const NOW = new Date('2026-10-10T12:00:00.000Z')

function repository(overrides: Partial<TripAdvisoryRepository> = {}): TripAdvisoryRepository {
  return {
    loadFacts: async () => ({
      tripId: 'trip-1',
      driverId: 'driver-1',
      status: 'in_transit',
      estimatedDurationMinutes: 300,
      destination: { latitude: 6.69, longitude: -1.62 },
      loading: { latitude: 5.67, longitude: -0.02 },
      liveState: {
        source: 'hardwired',
        observedAt: new Date('2026-10-10T11:59:00.000Z'),
        latitude: 6.10,
        longitude: -0.90,
        speedKph: 60,
      },
      routeHistory: { averageTripMinutes: 315, sampleCount: 14 },
      queue: null,
      weight: { grossKg: 39_500, tareKg: 15_100, observedAt: new Date('2026-10-10T10:30:00.000Z') },
      fuel: null,
      manualOdometerKm: null,
      documents: [
        { type: 'driver_license', expiresAt: new Date('2027-01-01T00:00:00.000Z') },
        { type: 'insurance', expiresAt: new Date('2027-02-01T00:00:00.000Z') },
      ],
      activeComplianceHold: false,
      blockingComplianceRules: 0,
      warningComplianceRules: 0,
    }),
    ...overrides,
  }
}

describe('buildTripAdvisory', () => {
  it('returns explainable versioned advisory metadata with confidence capped by fact quality', async () => {
    const result = await buildTripAdvisory('trip-1', { repository: repository(), now: NOW })

    expect(result).not.toBeNull()
    expect(result?.tripId).toBe('trip-1')
    expect(result?.model).toEqual({ key: 'deterministic-trip-advisory', version: '1.0.0' })
    expect(result?.inputSnapshotRef).toMatch(/^sha256:/)
    expect(result?.eta.basis).toBe('live_progress')
    expect(result?.eta.confidence).toBeLessThanOrEqual(result!.dataQuality.confidenceCeiling)
    expect(result?.complianceRisk.blocking).toBe(false)
    expect(result?.explanation.length).toBeGreaterThan(0)
    expect(result).not.toHaveProperty('revenue')
    expect(result).not.toHaveProperty('fuelCost')
  })

  it('uses active factory queue evidence for dwell intelligence', async () => {
    const repo = repository({
      loadFacts: async () => ({
        ...(await repository().loadFacts('trip-1'))!,
        status: 'queued',
        queue: {
          joinedAt: new Date('2026-10-10T09:30:00.000Z'),
          estimatedWaitMinutes: 45,
          historicalP90Minutes: 80,
          detentionFreeMinutes: 90,
        },
      }),
    })

    const result = await buildTripAdvisory('trip-1', { repository: repo, now: NOW })

    expect(result?.dwell).not.toBeNull()
    expect(result?.dwell?.severity).toBe('critical')
    expect(result?.dwell?.reasons).toContain('detention_threshold_exceeded')
  })

  it('returns null for an unknown trip instead of fabricating an advisory', async () => {
    const repo = repository({ loadFacts: async () => null })

    await expect(buildTripAdvisory('missing', { repository: repo, now: NOW })).resolves.toBeNull()
  })
})
