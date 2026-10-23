// ════════════════════════════════════════════════════════════════════
// ${APP_NAME} — Notification Dispatcher
// ════════════════════════════════════════════════════════════════════
//
// Central orchestrator for all notification channels:
//   - in_app  → Database Notification records (always)
//   - sms     → Hubtel SMS API
//   - email   → Nodemailer SMTP
//   - push    → Authenticated in-process SSE stream
//
// The dispatcher:
//   1. Respects SystemSettings notification preferences
//   2. Respects per-driver SMS/email/push preferences
//   3. Looks up user/driver contact info from database
//   4. Saves in_app notification to DB when requested
//   5. Fans out to SMS, email, and push channels as requested
//   6. Returns a summary of what was sent / failed
//   7. Supports role-based dispatch via dispatchRoleNotification()
// ────────────────────────────────────────────────────────────────────

import { APP_NAME } from '@/lib/constants'
import { db } from '@/lib/db'
import { broadcastPush, createPushEvent, emitPush } from './push'
import { sendSMS } from './sms'
import { sendEmail } from './email'

export type NotificationChannel = 'in_app' | 'sms' | 'email' | 'push'

interface DispatchParams {
  /** The user to notify (for in_app + push). Optional for SMS-only driver delivery. */
  userId?: string
  /** The driver to notify (for driver channel preferences + contact resolution). */
  driverId?: string
  /** Notification type key (e.g., trip_started, maintenance_due) */
  type: string
  /** Notification title */
  title: string
  /** Full notification message (for in_app and email body) */
  message: string
  /** Which channels to use (defaults to ['in_app']) */
  channels?: NotificationChannel[]
  /** Link to related page (e.g., /trips/TRP-xxx) */
  link?: string
  /** Additional structured data stored as JSON in metadata */
  metadata?: Record<string, unknown>
  /** Related trip ID (stored in metadata and used for lookup) */
  tripId?: string
  /** Short SMS-friendly message (under 160 chars preferred). Falls back to `message`. */
  smsMessage?: string
  /** Email subject line. Falls back to `title`. */
  emailSubject?: string
  /** HTML content for email body. If not provided, `message` is used. */
  emailHtml?: string
}

interface DispatchResult {
  inApp: boolean
  sms: boolean
  email: boolean
  push: boolean
  errors: string[]
}

interface DriverChannelPreferences {
  notifySMS: boolean
  notifyEmail: boolean
  notifyPush: boolean
}

const DEFAULT_DRIVER_CHANNEL_PREFERENCES: DriverChannelPreferences = {
  notifySMS: true,
  notifyEmail: true,
  notifyPush: true,
}

type SystemSettingsRecord = Awaited<ReturnType<typeof db.systemSettings.findFirst>>

async function loadSystemSettings(): Promise<SystemSettingsRecord> {
  try {
    return await db.systemSettings.findFirst()
  } catch (error) {
    console.warn('[Notification] Could not load SystemSettings; preserving default enabled behavior:', error)
    return null
  }
}

/**
 * Check if a notification type is enabled in SystemSettings.
 * Maps notification types to SystemSettings boolean fields.
 */
function isNotificationEnabled(type: string, settings: SystemSettingsRecord): boolean {
  if (!settings) return true

  const typeMap: Record<string, string> = {
    trip_assigned: 'notifyTripStarted',
    trip_loading: 'notifyTripStarted',
    trip_loaded: 'notifyTripStarted',
    trip_waiting: 'notifyTripStarted',
    trip_departed: 'notifyTripStarted',
    trip_in_transit: 'notifyTripStarted',
    trip_arrived: 'notifyTripStarted',
    trip_offloading: 'notifyTripStarted',
    trip_offloaded: 'notifyTripStarted',
    trip_return: 'notifyTripStarted',
    trip_started: 'notifyTripStarted',
    trip_completed: 'notifyTripCompleted',
    maintenance_due: 'notifyMaintenanceDue',
    maintenance_scheduled: 'notifyMaintenanceDue',
    insurance_expiring: 'notifyInsuranceExpiring',
    insurance_expired: 'notifyInsuranceExpiring',
    speeding_alert: 'notifySpeedingAlert',
    geofence_alert: 'notifyGeofenceAlert',
    driver_offline: 'notifyDriverOffline',
    daily_report: 'notifyDailyReport',
  }

  const settingKey = typeMap[type]
  if (!settingKey) return true
  return (settings as unknown as Record<string, unknown>)[settingKey] === true
}

async function resolveDriverChannelPreferences(driverId?: string): Promise<DriverChannelPreferences> {
  if (!driverId) return DEFAULT_DRIVER_CHANNEL_PREFERENCES

  try {
    const driver = await db.driver.findUnique({
      where: { id: driverId },
      select: {
        notifySMS: true,
        notifyEmail: true,
        notifyPush: true,
      },
    })

    if (!driver) return DEFAULT_DRIVER_CHANNEL_PREFERENCES
    return {
      notifySMS: driver.notifySMS !== false,
      notifyEmail: driver.notifyEmail !== false,
      notifyPush: driver.notifyPush !== false,
    }
  } catch (error) {
    // Preference lookup must not turn a transient DB problem into silent loss of
    // an operational notification. Preserve the historical enabled behavior.
    console.warn(`[Notification] Could not resolve channel preferences for driver ${driverId}:`, error)
    return DEFAULT_DRIVER_CHANNEL_PREFERENCES
  }
}

/**
 * Dispatch a notification across multiple channels.
 *
 * SystemSettings are the global gate. For a driver-targeted notification,
 * per-driver preferences then suppress SMS/email/push only. In-app delivery is
 * intentionally independent so operational notices remain visible in the app.
 */
export async function dispatchNotification(params: DispatchParams): Promise<DispatchResult> {
  const {
    userId,
    driverId,
    type,
    title,
    message,
    channels = ['in_app'],
    link,
    metadata,
    tripId,
    smsMessage,
    emailSubject,
    emailHtml,
  } = params

  const result: DispatchResult = {
    inApp: false,
    sms: false,
    email: false,
    push: false,
    errors: [],
  }

  console.log(`[Notification] Dispatching "${type}" for ${userId ? `user ${userId}` : 'unlinked user'}${driverId ? ` / driver ${driverId}` : ''}`)

  // System-wide preference is the highest-level gate.
  const settings = await loadSystemSettings()
  const enabled = isNotificationEnabled(type, settings)
  if (!enabled) {
    console.log(`[Notification] Type "${type}" is disabled in SystemSettings. Skipping.`)
    // Still save an in-app suppression marker when a real user account exists.
    if (userId) {
      await saveInAppNotification({
        userId,
        type,
        title: `[Suppressed] ${title}`,
        message,
        link,
        metadata: { ...metadata, suppressed: true, reason: 'disabled_in_settings' },
      })
      result.inApp = true
    }
    return result
  }

  const driverPreferences = await resolveDriverChannelPreferences(driverId)
  const systemSuppressedChannels: NotificationChannel[] = []
  const driverPreferenceSuppressedChannels: NotificationChannel[] = []
  const effectiveChannels = channels.filter((channel) => {
    if (channel === 'sms' && settings?.smsEnabled === false) {
      systemSuppressedChannels.push(channel)
      return false
    }
    if (channel === 'email' && settings?.emailEnabled === false) {
      systemSuppressedChannels.push(channel)
      return false
    }
    if (channel === 'sms' && !driverPreferences.notifySMS) {
      driverPreferenceSuppressedChannels.push(channel)
      return false
    }
    if (channel === 'email' && !driverPreferences.notifyEmail) {
      driverPreferenceSuppressedChannels.push(channel)
      return false
    }
    if (channel === 'push' && !driverPreferences.notifyPush) {
      driverPreferenceSuppressedChannels.push(channel)
      return false
    }
    return true
  })

  if (systemSuppressedChannels.length > 0) {
    console.log(`[Notification] System channel switches suppressed: ${systemSuppressedChannels.join(', ')}`)
  }
  if (driverPreferenceSuppressedChannels.length > 0) {
    console.log(
      `[Notification] Driver preferences suppressed channels: ${driverPreferenceSuppressedChannels.join(', ')}`,
    )
  }

  // Build metadata with trip info and enough delivery evidence for support/audit.
  const fullMetadata = {
    ...metadata,
    ...(tripId ? { tripId } : {}),
    dispatchedAt: new Date().toISOString(),
    channels: effectiveChannels,
    ...(systemSuppressedChannels.length > 0 || driverPreferenceSuppressedChannels.length > 0
      ? {
          requestedChannels: channels,
          ...(systemSuppressedChannels.length > 0 ? { systemSuppressedChannels } : {}),
          ...(driverPreferenceSuppressedChannels.length > 0 ? { driverPreferenceSuppressedChannels } : {}),
        }
      : {}),
  }

  // ── 1. Save in_app notification only when a real user account exists ──
  let savedNotificationId: string | null = null
  if (userId && effectiveChannels.includes('in_app')) {
    try {
      savedNotificationId = await saveInAppNotification({
        userId,
        type,
        title,
        message,
        link,
        metadata: fullMetadata,
      })
      result.inApp = true
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : 'Unknown error'
      console.error(`[Notification] Failed to save in_app notification: ${errorMsg}`)
      result.errors.push(`in_app: ${errorMsg}`)
    }
  }

  // ── 2. SMS channel ──
  if (effectiveChannels.includes('sms')) {
    try {
      const phone = await resolvePhone(userId, driverId)
      if (!phone) {
        const msg = `No phone number found for user ${userId} / driver ${driverId}`
        console.warn(`[Notification] SMS skipped: ${msg}`)
        result.errors.push(`sms: ${msg}`)
        await persistDeliveryEvidence(savedNotificationId, { smsSent: false, smsError: msg })
      } else {
        const smsText = smsMessage || message
        const smsResult = await sendSMS({
          to: phone,
          message: smsText,
          tripId,
        })
        result.sms = smsResult.success
        if (smsResult.success) {
          await persistDeliveryEvidence(savedNotificationId, {
            smsSent: true,
            smsSentAt: new Date(),
            smsError: null,
          })
        } else {
          const msg = smsResult.error || 'Failed'
          result.errors.push(`sms: ${msg}`)
          await persistDeliveryEvidence(savedNotificationId, { smsSent: false, smsError: msg })
        }
      }
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : 'Unknown error'
      console.error(`[Notification] SMS dispatch error: ${errorMsg}`)
      result.errors.push(`sms: ${errorMsg}`)
      await persistDeliveryEvidence(savedNotificationId, { smsSent: false, smsError: errorMsg })
    }
  }

  // ── 3. Email channel ──
  if (effectiveChannels.includes('email')) {
    try {
      const email = await resolveEmail(userId, driverId)
      if (!email) {
        const msg = `No email found for user ${userId} / driver ${driverId}`
        console.warn(`[Notification] Email skipped: ${msg}`)
        result.errors.push(`email: ${msg}`)
        await persistDeliveryEvidence(savedNotificationId, { emailSent: false, emailError: msg })
      } else {
        const subject = emailSubject || title
        const html = emailHtml || `<p>${message.replace(/\n/g, '<br/>')}</p>`
        const emailResult = await sendEmail({
          to: email,
          subject: `[${APP_NAME}] ${subject}`,
          html,
        })
        result.email = emailResult.success
        if (emailResult.success) {
          await persistDeliveryEvidence(savedNotificationId, {
            emailSent: true,
            emailSentAt: new Date(),
            emailError: null,
          })
        } else {
          const msg = emailResult.error || 'Failed'
          result.errors.push(`email: ${msg}`)
          await persistDeliveryEvidence(savedNotificationId, { emailSent: false, emailError: msg })
        }
      }
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : 'Unknown error'
      console.error(`[Notification] Email dispatch error: ${errorMsg}`)
      result.errors.push(`email: ${errorMsg}`)
      await persistDeliveryEvidence(savedNotificationId, { emailSent: false, emailError: errorMsg })
    }
  }

  // ── 4. Push channel (SSE real-time) ──
  if (effectiveChannels.includes('push') && userId) {
    const delivered = emitPush(userId, createPushEvent({
      type,
      title,
      message,
      notificationId: savedNotificationId || undefined,
      metadata: {
        ...fullMetadata,
        ...(link ? { link } : {}),
      },
    }))
    result.push = delivered > 0
    console.log(`[Notification] SSE push delivered to ${delivered} active listener(s) for user ${userId}`)

    if (result.push) {
      await persistDeliveryEvidence(savedNotificationId, { pushSent: true, pushSentAt: new Date() })
    }
  }

  // Log summary. Preference-suppressed channels are intentionally not failures.
  const successCount = [result.inApp, result.sms, result.email, result.push].filter(Boolean).length
  console.log(
    `[Notification] Dispatch complete for "${type}": ` +
    `${successCount}/${effectiveChannels.length} effective channels succeeded.` +
    (result.errors.length > 0 ? ` Errors: ${result.errors.join('; ')}` : '')
  )

  return result
}

// ════════════════════════════════════════════════════════════════════
// HELPER FUNCTIONS
// ════════════════════════════════════════════════════════════════════

/**
 * Save an in-app notification to the database.
 */
async function saveInAppNotification(params: {
  userId: string
  type: string
  title: string
  message: string
  link?: string
  metadata?: Record<string, unknown>
}): Promise<string> {
  const record = await db.notification.create({
    data: {
      userId: params.userId,
      type: params.type,
      title: params.title,
      message: params.message,
      channel: 'in_app',
      link: params.link,
      metadata: params.metadata ? JSON.stringify(params.metadata) : null,
    },
  })
  return record.id
}

type DeliveryEvidence = {
  smsSent?: boolean
  smsSentAt?: Date
  smsError?: string | null
  emailSent?: boolean
  emailSentAt?: Date
  emailError?: string | null
  pushSent?: boolean
  pushSentAt?: Date
}

async function persistDeliveryEvidence(notificationId: string | null, data: DeliveryEvidence): Promise<void> {
  if (!notificationId) return

  try {
    await db.notification.update({ where: { id: notificationId }, data })
  } catch (error) {
    console.warn(
      `[Notification] Failed to persist delivery evidence for ${notificationId}: ${error instanceof Error ? error.message : error}`,
    )
  }
}

/**
 * Resolve a phone number for SMS delivery.
 * Checks the user's phone first, then the driver's phone if driverId is provided.
 */
async function resolvePhone(userId?: string, driverId?: string): Promise<string | null> {
  // If we have a driverId, try the driver's phone first (more reliable for SMS)
  if (driverId) {
    const driver = await db.driver.findUnique({
      where: { id: driverId },
      select: { phone: true },
    })
    if (driver?.phone) return driver.phone
  }

  // Fall back to user's phone when a linked user exists.
  if (!userId) return null
  const user = await db.user.findUnique({
    where: { id: userId },
    select: { phone: true },
  })
  return user?.phone || null
}

/**
 * Resolve an email address for email delivery.
 * Checks the user's email first, then the driver's email if driverId is provided.
 */
async function resolveEmail(userId?: string, driverId?: string): Promise<string | null> {
  // User email is usually the primary contact when a linked user exists.
  if (userId) {
    const user = await db.user.findUnique({
      where: { id: userId },
      select: { email: true },
    })
    if (user?.email) return user.email
  }

  // Fall back to driver's email
  if (driverId) {
    const driver = await db.driver.findUnique({
      where: { id: driverId },
      select: { email: true },
    })
    if (driver?.email) return driver.email
  }

  return null
}

// ════════════════════════════════════════════════════════════════════
// ROLE-BASED NOTIFICATION DISPATCH
// ════════════════════════════════════════════════════════════════════

/**
 * Dispatch a real-time push notification to currently connected users with a specific role.
 */
export async function dispatchRoleNotification(params: {
  role: string
  type: string
  title: string
  message: string
  link?: string
}): Promise<boolean> {
  const { role, type, title, message, link } = params

  try {
    const users = await db.user.findMany({
      where: { role: { name: role } },
      select: { id: true },
    })
    const event = createPushEvent({
      type,
      title,
      message,
      metadata: link ? { link } : undefined,
    })
    const delivered = users.reduce((count, user) => count + emitPush(user.id, event), 0)
    console.log(`[Notification] Role push "${type}" delivered to ${delivered} active listener(s) with role "${role}"`)
    return delivered > 0
  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : 'Unknown error'
    console.error(`[Notification] Role push dispatch error: ${errorMsg}`)
    return false
  }
}

/**
 * Broadcast a real-time push notification to all currently connected clients.
 */
export async function dispatchBroadcastNotification(params: {
  type: string
  title: string
  message: string
  link?: string
}): Promise<boolean> {
  const { type, title, message, link } = params

  try {
    const delivered = broadcastPush(createPushEvent({
      type,
      title,
      message,
      metadata: link ? { link } : undefined,
    }))
    console.log(`[Notification] Broadcast push "${type}" delivered to ${delivered} active listener(s)`)
    return delivered > 0
  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : 'Unknown error'
    console.error(`[Notification] Broadcast push dispatch error: ${errorMsg}`)
    return false
  }
}
