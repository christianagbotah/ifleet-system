import { describe, expect, it } from 'vitest'

import {
  canTransition,
  canonicalTripStatus,
  getDefaultNextStatus,
  type TripStatusValue,
} from '@/lib/domain/dispatch/trip-state-machine'

const canonicalPath: TripStatusValue[] = [
  'draft',
  'scheduled',
  'assigned',
  'eligibility_check',
  'authorized_for_loading',
  'en_route_to_loading_point',
  'gate_in',
  'queued',
  'preload_weighing',
  'loading',
  'loaded',
  'postload_weighing',
  'awaiting_dispatch_clearance',
  'departed_loading_point',
  'in_transit',
  'arrived_destination',
  'offloading',
  'delivered',
  'return_journey',
  'arrived_base',
  'awaiting_reconciliation',
  'reconciled',
  'completed',
]

describe('trip state machine', () => {
  it('allows every step of the canonical Ghana haulage lifecycle', () => {
    for (let index = 0; index < canonicalPath.length - 1; index += 1) {
      expect(canTransition(canonicalPath[index], canonicalPath[index + 1]).allowed).toBe(true)
    }
  })

  it('rejects operational skips such as scheduled directly to in_transit', () => {
    const decision = canTransition('scheduled', 'in_transit')
    expect(decision.allowed).toBe(false)
    expect(decision.reason).toMatch(/not allowed/i)
  })

  it('allows cancellation before delivery but protects delivered and later states', () => {
    expect(canTransition('scheduled', 'cancelled').allowed).toBe(true)
    expect(canTransition('in_transit', 'cancelled').allowed).toBe(true)
    expect(canTransition('delivered', 'cancelled').allowed).toBe(false)
    expect(canTransition('reconciled', 'cancelled').allowed).toBe(false)
  })

  it('supports delayed and exception holds with an explicit resume state', () => {
    expect(canTransition('in_transit', 'delayed').allowed).toBe(true)
    expect(canTransition('delayed', 'in_transit').allowed).toBe(true)
    expect(canTransition('loading', 'exception_hold').allowed).toBe(true)
    expect(canTransition('exception_hold', 'loading').allowed).toBe(true)
  })

  it('protects completed and cancelled terminal states and reconciled finalization', () => {
    expect(canTransition('reconciled', 'completed').allowed).toBe(true)
    expect(canTransition('reconciled', 'in_transit').allowed).toBe(false)
    expect(canTransition('completed', 'scheduled').allowed).toBe(false)
    expect(canTransition('cancelled', 'scheduled').allowed).toBe(false)
  })

  it('maps legacy trip states into their canonical equivalents without rewriting history', () => {
    expect(canonicalTripStatus('departed_depot')).toBe('departed_loading_point')
    expect(canonicalTripStatus('offloaded')).toBe('delivered')
    expect(canonicalTripStatus('arrived_depot')).toBe('arrived_base')
    expect(canTransition('departed_depot', 'in_transit').allowed).toBe(true)
    expect(canTransition('offloaded', 'return_journey').allowed).toBe(true)
    expect(canTransition('arrived_depot', 'awaiting_reconciliation').allowed).toBe(true)
  })

  it('provides deterministic next states for the driver controller', () => {
    expect(getDefaultNextStatus('scheduled')).toBe('assigned')
    expect(getDefaultNextStatus('departed_depot')).toBe('in_transit')
    expect(getDefaultNextStatus('offloaded')).toBe('return_journey')
    expect(getDefaultNextStatus('completed')).toBeNull()
    expect(getDefaultNextStatus('delayed')).toBeNull()
  })
})
