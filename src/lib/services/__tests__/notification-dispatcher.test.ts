import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  notificationCreate: vi.fn(),
  systemSettingsFindFirst: vi.fn(),
  driverFindUnique: vi.fn(),
  userFindUnique: vi.fn(),
  sendSMS: vi.fn(),
}))

vi.mock('@/lib/db', () => ({
  db: {
    systemSettings: { findFirst: mocks.systemSettingsFindFirst },
    notification: { create: mocks.notificationCreate, update: vi.fn() },
    driver: { findUnique: mocks.driverFindUnique },
    user: { findUnique: mocks.userFindUnique },
  },
}))
vi.mock('@/lib/services/sms', () => ({ sendSMS: mocks.sendSMS }))
vi.mock('@/lib/services/email', () => ({ sendEmail: vi.fn() }))

import { dispatchNotification } from '@/lib/services/notification-dispatcher'

describe('dispatchNotification for unlinked drivers', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.systemSettingsFindFirst.mockResolvedValue(null)
    mocks.driverFindUnique.mockResolvedValue({ phone: '0240000000' })
    mocks.sendSMS.mockResolvedValue({ success: true })
  })

  it('sends SMS without attempting an in-app row when userId is absent', async () => {
    const result = await dispatchNotification({
      userId: undefined as never,
      driverId: 'driver-1',
      type: 'trip_departed',
      title: 'Trip departed',
      message: 'Trip departed',
      channels: ['sms'],
    })

    expect(result.sms).toBe(true)
    expect(mocks.notificationCreate).not.toHaveBeenCalled()
    expect(mocks.sendSMS).toHaveBeenCalledOnce()
  })
})
