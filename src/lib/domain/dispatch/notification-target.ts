import type { NotificationChannel } from '@/lib/services/notification-dispatcher'

export interface DriverNotificationPlanInput {
  userId: string | null
  driverId: string
  hasPhone: boolean
  userAlreadyNotified: boolean
}

export interface DriverNotificationPlan {
  userId: string | null
  driverId: string
  channels: NotificationChannel[]
}

export function planDriverNotification(input: DriverNotificationPlanInput): DriverNotificationPlan | null {
  if (input.userId && input.userAlreadyNotified) return null
  if (!input.userId && !input.hasPhone) return null

  return {
    userId: input.userId,
    driverId: input.driverId,
    channels: input.userId
      ? input.hasPhone ? ['in_app', 'sms', 'push'] : ['in_app', 'push']
      : ['sms'],
  }
}
