import { describe, expect, it } from 'vitest'
import { getTripNotificationSpec } from '@/lib/domain/dispatch/trip-notification'

describe('getTripNotificationSpec', () => {
  it('preserves high-signal lifecycle notification types', () => {
    expect(getTripNotificationSpec('assigned')?.type).toBe('trip_assigned')
    expect(getTripNotificationSpec('loading')?.type).toBe('trip_loading')
    expect(getTripNotificationSpec('departed_loading_point')?.type).toBe('trip_departed')
    expect(getTripNotificationSpec('delivered')?.type).toBe('trip_offloaded')
    expect(getTripNotificationSpec('completed')?.type).toBe('trip_completed')
  })

  it('does not spam compliance-only intermediate states', () => {
    expect(getTripNotificationSpec('eligibility_check')).toBeNull()
    expect(getTripNotificationSpec('preload_weighing')).toBeNull()
    expect(getTripNotificationSpec('awaiting_reconciliation')).toBeNull()
  })
})
