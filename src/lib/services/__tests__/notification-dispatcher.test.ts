import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  notificationCreate: vi.fn(),
  notificationUpdate: vi.fn(),
  systemSettingsFindFirst: vi.fn(),
  driverFindUnique: vi.fn(),
  userFindUnique: vi.fn(),
  userFindMany: vi.fn(),
  sendSMS: vi.fn(),
  sendEmail: vi.fn(),
  pushFetch: vi.fn(),
}))

vi.mock('@/lib/db', () => ({
  db: {
    systemSettings: { findFirst: mocks.systemSettingsFindFirst },
    notification: { create: mocks.notificationCreate, update: mocks.notificationUpdate },
    driver: { findUnique: mocks.driverFindUnique },
    user: { findUnique: mocks.userFindUnique, findMany: mocks.userFindMany },
  },
}))
vi.mock('@/lib/services/sms', () => ({ sendSMS: mocks.sendSMS }))
vi.mock('@/lib/services/email', () => ({ sendEmail: mocks.sendEmail }))

import {
  dispatchBroadcastNotification,
  dispatchNotification,
  dispatchRoleNotification,
} from '@/lib/services/notification-dispatcher'
import { registerPushListener } from '@/lib/services/push'

describe('dispatchNotification driver channel preferences', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.systemSettingsFindFirst.mockResolvedValue(null)
    mocks.notificationCreate.mockResolvedValue({ id: 'notification-1' })
    mocks.notificationUpdate.mockResolvedValue({ id: 'notification-1' })
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

describe('dispatchNotification channel delivery evidence', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.systemSettingsFindFirst.mockResolvedValue(null)
    mocks.notificationCreate.mockResolvedValue({ id: 'notification-1' })
    mocks.notificationUpdate.mockResolvedValue({ id: 'notification-1' })
    mocks.driverFindUnique.mockResolvedValue({
      phone: '0240000000',
      email: 'driver@example.com',
      notifySMS: true,
      notifyEmail: true,
      notifyPush: true,
    })
    mocks.userFindUnique.mockResolvedValue({ phone: '0240000000', email: 'driver@example.com' })
    mocks.sendSMS.mockResolvedValue({ success: true, messageId: 'sms-1' })
    mocks.sendEmail.mockResolvedValue({ success: true, messageId: 'email-1' })
    mocks.pushFetch.mockResolvedValue({ json: async () => ({ success: true, count: 1, total: 1 }) })
    vi.stubGlobal('fetch', mocks.pushFetch)
  })

  it('suppresses SMS globally when the saved SMS channel is disabled', async () => {
    mocks.systemSettingsFindFirst.mockResolvedValue({
      notifyTripStarted: true,
      smsEnabled: false,
      emailEnabled: true,
    })

    const result = await dispatchNotification({
      userId: 'user-1',
      driverId: 'driver-1',
      type: 'trip_departed',
      title: 'Trip departed',
      message: 'Trip departed',
      channels: ['in_app', 'sms'],
    })

    expect(result.inApp).toBe(true)
    expect(result.sms).toBe(false)
    expect(result.errors).toEqual([])
    expect(mocks.sendSMS).not.toHaveBeenCalled()
  })

  it('suppresses email globally when the saved email channel is disabled', async () => {
    mocks.systemSettingsFindFirst.mockResolvedValue({
      notifyTripStarted: true,
      smsEnabled: true,
      emailEnabled: false,
    })

    const result = await dispatchNotification({
      userId: 'user-1',
      driverId: 'driver-1',
      type: 'trip_departed',
      title: 'Trip departed',
      message: 'Trip departed',
      channels: ['in_app', 'email'],
    })

    expect(result.inApp).toBe(true)
    expect(result.email).toBe(false)
    expect(result.errors).toEqual([])
    expect(mocks.sendEmail).not.toHaveBeenCalled()
  })

  it('persists SMS provider acceptance on the existing in-app notification', async () => {
    await dispatchNotification({
      userId: 'user-1',
      driverId: 'driver-1',
      type: 'trip_departed',
      title: 'Trip departed',
      message: 'Trip departed',
      channels: ['in_app', 'sms'],
    })

    expect(mocks.notificationUpdate).toHaveBeenCalledWith({
      where: { id: 'notification-1' },
      data: {
        smsSent: true,
        smsSentAt: expect.any(Date),
        smsError: null,
      },
    })
  })

  it('persists SMS provider failure without marking it sent', async () => {
    mocks.sendSMS.mockResolvedValue({ success: false, error: 'provider rejected' })

    const result = await dispatchNotification({
      userId: 'user-1',
      driverId: 'driver-1',
      type: 'trip_departed',
      title: 'Trip departed',
      message: 'Trip departed',
      channels: ['in_app', 'sms'],
    })

    expect(result.sms).toBe(false)
    expect(mocks.notificationUpdate).toHaveBeenCalledWith({
      where: { id: 'notification-1' },
      data: { smsSent: false, smsError: 'provider rejected' },
    })
  })

  it('persists a missing SMS recipient as a failed attempt', async () => {
    mocks.driverFindUnique
      .mockResolvedValueOnce({ notifySMS: true, notifyEmail: true, notifyPush: true })
      .mockResolvedValueOnce({ phone: null })
    mocks.userFindUnique.mockResolvedValue({ phone: null, email: 'driver@example.com' })

    await dispatchNotification({
      userId: 'user-1',
      driverId: 'driver-1',
      type: 'trip_departed',
      title: 'Trip departed',
      message: 'Trip departed',
      channels: ['in_app', 'sms'],
    })

    expect(mocks.notificationUpdate).toHaveBeenCalledWith({
      where: { id: 'notification-1' },
      data: { smsSent: false, smsError: expect.stringContaining('No phone number found') },
    })
  })

  it('persists SMTP acceptance and SMTP failure distinctly', async () => {
    await dispatchNotification({
      userId: 'user-1',
      driverId: 'driver-1',
      type: 'trip_departed',
      title: 'Trip departed',
      message: 'Trip departed',
      channels: ['in_app', 'email'],
    })

    expect(mocks.notificationUpdate).toHaveBeenCalledWith({
      where: { id: 'notification-1' },
      data: {
        emailSent: true,
        emailSentAt: expect.any(Date),
        emailError: null,
      },
    })

    vi.clearAllMocks()
    mocks.systemSettingsFindFirst.mockResolvedValue(null)
    mocks.notificationCreate.mockResolvedValue({ id: 'notification-1' })
    mocks.notificationUpdate.mockResolvedValue({ id: 'notification-1' })
    mocks.driverFindUnique.mockResolvedValue({
      phone: '0240000000',
      email: 'driver@example.com',
      notifySMS: true,
      notifyEmail: true,
      notifyPush: true,
    })
    mocks.userFindUnique.mockResolvedValue({ phone: '0240000000', email: 'driver@example.com' })
    mocks.sendEmail.mockResolvedValue({ success: false, error: 'smtp rejected' })

    await dispatchNotification({
      userId: 'user-1',
      driverId: 'driver-1',
      type: 'trip_departed',
      title: 'Trip departed',
      message: 'Trip departed',
      channels: ['in_app', 'email'],
    })

    expect(mocks.notificationUpdate).toHaveBeenCalledWith({
      where: { id: 'notification-1' },
      data: { emailSent: false, emailError: 'smtp rejected' },
    })
  })

  it('does not mark push sent when no active SSE listener exists', async () => {
    const result = await dispatchNotification({
      userId: 'user-without-listener',
      type: 'trip_departed',
      title: 'Trip departed',
      message: 'Trip departed',
      channels: ['in_app', 'push'],
    })

    expect(result.push).toBe(false)
    expect(mocks.notificationUpdate).not.toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ pushSent: true }),
    }))
  })

  it('marks push sent only when an active SSE listener receives the event', async () => {
    mocks.pushFetch.mockRejectedValue(new Error('obsolete port unavailable'))
    const received: string[] = []
    const unsubscribe = registerPushListener('user-1', (event) => received.push(event.type))

    try {
      const result = await dispatchNotification({
        userId: 'user-1',
        type: 'trip_departed',
        title: 'Trip departed',
        message: 'Trip departed',
        channels: ['in_app', 'push'],
      })

      expect(result.push).toBe(true)
      expect(received).toEqual(['trip_departed'])
      expect(mocks.notificationUpdate).toHaveBeenCalledWith({
        where: { id: 'notification-1' },
        data: { pushSent: true, pushSentAt: expect.any(Date) },
      })
    } finally {
      unsubscribe()
    }
  })
})

describe('role and broadcast push delivery', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.userFindMany.mockResolvedValue([])
    mocks.pushFetch.mockRejectedValue(new Error('obsolete port unavailable'))
    vi.stubGlobal('fetch', mocks.pushFetch)
  })

  it('delivers a role notification through active in-process listeners instead of port 3004', async () => {
    mocks.userFindMany.mockResolvedValue([{ id: 'admin-1' }, { id: 'admin-2' }])
    const received: string[] = []
    const unsubscribe = registerPushListener('admin-1', (event) => received.push(event.type))

    try {
      const delivered = await dispatchRoleNotification({
        role: 'Admin',
        type: 'maintenance_due',
        title: 'Maintenance due',
        message: 'Truck service is due',
      })

      expect(delivered).toBe(true)
      expect(received).toEqual(['maintenance_due'])
      expect(mocks.userFindMany).toHaveBeenCalledWith({
        where: { role: { name: 'Admin' } },
        select: { id: true },
      })
      expect(mocks.pushFetch).not.toHaveBeenCalled()
    } finally {
      unsubscribe()
    }
  })

  it('returns false for a role notification when no matching user has an active listener', async () => {
    mocks.userFindMany.mockResolvedValue([{ id: 'admin-1' }])

    await expect(dispatchRoleNotification({
      role: 'Admin',
      type: 'maintenance_due',
      title: 'Maintenance due',
      message: 'Truck service is due',
    })).resolves.toBe(false)

    expect(mocks.pushFetch).not.toHaveBeenCalled()
  })

  it('broadcasts through active in-process listeners instead of port 3004', async () => {
    const received: string[] = []
    const unsubscribe = registerPushListener('manager-1', (event) => received.push(event.type))

    try {
      const delivered = await dispatchBroadcastNotification({
        type: 'system_notice',
        title: 'System notice',
        message: 'Fleetivo update',
      })

      expect(delivered).toBe(true)
      expect(received).toEqual(['system_notice'])
      expect(mocks.pushFetch).not.toHaveBeenCalled()
    } finally {
      unsubscribe()
    }
  })
})
