import { describe, expect, it } from 'vitest'

import { planDriverNotification } from '@/lib/domain/dispatch/notification-target'

describe('planDriverNotification', () => {
  it('uses only SMS for a driver without a linked user account', () => {
    expect(planDriverNotification({ userId: null, driverId: 'driver-1', hasPhone: true, userAlreadyNotified: false })).toEqual({
      userId: null,
      driverId: 'driver-1',
      channels: ['sms'],
    })
  })

  it('uses in-app, SMS and push when the driver has a linked user account', () => {
    expect(planDriverNotification({ userId: 'user-1', driverId: 'driver-1', hasPhone: true, userAlreadyNotified: false })).toEqual({
      userId: 'user-1',
      driverId: 'driver-1',
      channels: ['in_app', 'sms', 'push'],
    })
  })

  it('does not send a duplicate driver notification when the linked user was already notified as admin', () => {
    expect(planDriverNotification({ userId: 'user-1', driverId: 'driver-1', hasPhone: true, userAlreadyNotified: true })).toBeNull()
  })
})
