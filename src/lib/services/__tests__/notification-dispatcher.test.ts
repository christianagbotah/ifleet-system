import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  notificationCreate: vi.fn(),
  systemSettingsFindFirst: vi.fn(),
  driverFindUnique: vi.fn(),
  userFindUnique: vi.fn(),
  sendSMS: vi.fn(),
  sendEmail: vi.fn(),
  pushFetch: vi.fn(),
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
vi.mock('@/lib/services/email', () => ({ sendEmail: mocks.sendEmail }))

import { dispatchNotification } from '@/lib/services/notification-dispatcher'

describe('dispatchNotification driver channel preferences', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.systemSettingsFindFirst.mockResolvedValue(null)
    mocks.notificationCreate.mockResolvedValue({ id: 'notification-1' })
    mocks.driverFindUnique.mockResolvedValue({
      phone: '0240000000',
      email: 'driver@example.com',
      notifySMS: true,
      notifyEmail: true,
      notifyPush: true,
    })
    mocks.userFindUnique.mockResolvedValue({ phone: '0240000000', email: 'driver@example.com' })
    mocks.sendSMS.mockResolvedValue({ success: true })
    mocks.sendEmail.mockResolvedValue({ success: true })
    mocks.pushFetch.mockResolvedValue({
      json: async () => ({ success: true, count: 1, total: 1 }),
    })
    vi.stubGlobal('fetch', mocks.pushFetch)
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

  it('suppresses SMS when the target driver disabled SMS notifications', async () => {
    mocks.driverFindUnique.mockResolvedValue({
      phone: '0240000000',
      email: 'driver@example.com',
      notifySMS: false,
      notifyEmail: true,
      notifyPush: true,
    })

    const result = await dispatchNotification({
      driverId: 'driver-1',
      type: 'trip_departed',
      title: 'Trip departed',
      message: 'Trip departed',
      channels: ['sms'],
    })

    expect(result.sms).toBe(false)
    expect(result.errors).toEqual([])
    expect(mocks.sendSMS).not.toHaveBeenCalled()
  })

  it('suppresses email when the target driver disabled email notifications', async () => {
    mocks.driverFindUnique.mockResolvedValue({
      phone: '0240000000',
      email: 'driver@example.com',
      notifySMS: true,
      notifyEmail: false,
      notifyPush: true,
    })

    const result = await dispatchNotification({
      driverId: 'driver-1',
      type: 'trip_departed',
      title: 'Trip departed',
      message: 'Trip departed',
      channels: ['email'],
    })

    expect(result.email).toBe(false)
    expect(result.errors).toEqual([])
    expect(mocks.sendEmail).not.toHaveBeenCalled()
  })

  it('keeps in-app delivery while suppressing push when the driver disabled push notifications', async () => {
    mocks.driverFindUnique.mockResolvedValue({
      phone: '0240000000',
      email: 'driver@example.com',
      notifySMS: true,
      notifyEmail: true,
      notifyPush: false,
    })

    const result = await dispatchNotification({
      userId: 'user-1',
      driverId: 'driver-1',
      type: 'trip_departed',
      title: 'Trip departed',
      message: 'Trip departed',
      channels: ['in_app', 'push'],
    })

    expect(result.inApp).toBe(true)
    expect(result.push).toBe(false)
    expect(mocks.notificationCreate).toHaveBeenCalledOnce()
    expect(mocks.pushFetch).not.toHaveBeenCalled()
  })
})
