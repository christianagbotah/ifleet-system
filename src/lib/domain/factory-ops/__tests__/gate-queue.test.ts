import { describe, expect, it } from 'vitest'

import { recordGateEvent } from '@/lib/domain/factory-ops/gate'
import { advanceQueue, calculateDetentionMinutes } from '@/lib/domain/factory-ops/queue'

const at = (iso: string) => new Date(iso)

describe('factory gate operations', () => {
  it('accepts an authorized gate-in when the previous gate event is absent', () => {
    const result = recordGateEvent({
      direction: 'in',
      occurredAt: at('2026-10-08T08:00:00Z'),
      isVehicleAuthorized: true,
      previousEvent: null,
    })

    expect(result.accepted).toBe(true)
    expect(result.duplicate).toBe(false)
  })

  it('rejects an unauthorized vehicle at the gate', () => {
    const result = recordGateEvent({
      direction: 'in',
      occurredAt: at('2026-10-08T08:00:00Z'),
      isVehicleAuthorized: false,
      previousEvent: null,
    })

    expect(result.accepted).toBe(false)
    expect(result.reason).toBe('vehicle_not_authorized')
  })

  it('treats a same-direction scan inside the idempotency window as duplicate', () => {
    const result = recordGateEvent({
      direction: 'in',
      occurredAt: at('2026-10-08T08:02:00Z'),
      isVehicleAuthorized: true,
      previousEvent: {
        direction: 'in',
        occurredAt: at('2026-10-08T08:00:00Z'),
      },
    })

    expect(result.accepted).toBe(true)
    expect(result.duplicate).toBe(true)
  })

  it('rejects gate-out when no earlier gate-in exists', () => {
    const result = recordGateEvent({
      direction: 'out',
      occurredAt: at('2026-10-08T09:00:00Z'),
      isVehicleAuthorized: true,
      previousEvent: null,
    })

    expect(result.accepted).toBe(false)
    expect(result.reason).toBe('gate_in_required')
  })
})

describe('factory queue operations', () => {
  it('advances waiting queue entry to in_progress when called to a bay', () => {
    const result = advanceQueue({
      currentStatus: 'waiting',
      action: 'call_to_bay',
      occurredAt: at('2026-10-08T08:20:00Z'),
      joinedAt: at('2026-10-08T08:00:00Z'),
    })

    expect(result.allowed).toBe(true)
    expect(result.nextStatus).toBe('in_progress')
    expect(result.startedAt?.toISOString()).toBe('2026-10-08T08:20:00.000Z')
  })

  it('advances in_progress entry to loading', () => {
    const result = advanceQueue({
      currentStatus: 'in_progress',
      action: 'start_loading',
      occurredAt: at('2026-10-08T08:30:00Z'),
      joinedAt: at('2026-10-08T08:00:00Z'),
    })

    expect(result.allowed).toBe(true)
    expect(result.nextStatus).toBe('loading')
  })

  it('completes loading and records actual wait in minutes', () => {
    const result = advanceQueue({
      currentStatus: 'loading',
      action: 'complete',
      occurredAt: at('2026-10-08T09:00:00Z'),
      joinedAt: at('2026-10-08T08:00:00Z'),
    })

    expect(result.allowed).toBe(true)
    expect(result.nextStatus).toBe('completed')
    expect(result.actualWait).toBe(60)
    expect(result.completedAt?.toISOString()).toBe('2026-10-08T09:00:00.000Z')
  })

  it('calculates detention only after the free waiting period', () => {
    expect(calculateDetentionMinutes(
      at('2026-10-08T08:00:00Z'),
      at('2026-10-08T10:45:00Z'),
      120
    )).toBe(45)
  })
})
