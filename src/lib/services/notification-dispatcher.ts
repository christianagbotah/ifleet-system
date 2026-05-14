// ════════════════════════════════════════════════════════════════════
// ${APP_NAME} — Notification Dispatcher
// ════════════════════════════════════════════════════════════════════
//
// Central orchestrator for all notification channels:
//   - in_app  → Database Notification records (always)
//   - sms     → Hubtel SMS API
//   - email   → Nodemailer SMTP
//   - push    → Socket.IO real-time WebSocket
//
// The dispatcher:
//   1. Respects SystemSettings notification preferences
//   2. Looks up user/driver contact info from database
//   3. Saves in_app notification to DB (always)
//   4. Fan-out to SMS, email, and push channels as requested
//   5. Returns a summary of what was sent / failed
//   6. Supports role-based dispatch via dispatchRoleNotification()
// ────────────────────────────────────────────────────────────────────

import { APP_NAME } from '@/lib/constants'
import { db } from '@/lib/db'
import { sendSMS } from './sms'
import { sendEmail } from './email'

// ── Socket.IO Notification Service Config ──
const NOTIFICATION_SERVICE_URL = 'http://localhost:3004'

export type NotificationChannel = 'in_app' | 'sms' | 'email' | 'push'

interface DispatchParams {
  /** The user to notify (for in_app + email) */
  userId: string
  /** The driver to notify (for SMS — driver's phone is used) */
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

/**
 * Check if a notification type is enabled in SystemSettings.
 * Maps notification types to SystemSettings boolean fields.
 */
async function isNotificationEnabled(type: string): Promise<boolean> {
  try {
    const settings = await db.systemSettings.findFirst()
    if (!settings) return true // Default to enabled if no settings exist

    const typeMap: Record<string, keyof typeof settings> = {
      // All trip lifecycle events → Trip Started toggle
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
      // Trip completion → Trip Completed toggle
      trip_completed: 'notifyTripCompleted',
      // Other types
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
    if (settingKey) {
      return settings[settingKey] === true
    }

    // Unknown types are enabled by default
    return true
  } catch (error) {
    console.warn(`[Notification] Could not check SystemSettings for type "${type}":`, error)
    return true
  }
}

/**
 * Dispatch a notification across multiple channels.
 *
 * This is the main entry point for all notifications in the system.
 * It always saves an in_app notification, and optionally fans out
 * to SMS and email based on the `channels` parameter and SystemSettings.
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

  console.log(`[Notification] Dispatching "${type}" for user ${userId}${driverId ? ` / driver ${driverId}` : ''}`)

  // Check SystemSettings before dispatching
  const enabled = await isNotificationEnabled(type)
  if (!enabled) {
    console.log(`[Notification] Type "${type}" is disabled in SystemSettings. Skipping.`)
    // Still save in_app but mark as suppressed
    await saveInAppNotification({
      userId,
      type,
      title: `[Suppressed] ${title}`,
      message,
      link,
      metadata: { ...metadata, suppressed: true, reason: 'disabled_in_settings' },
    })
    result.inApp = true
    return result
  }

  // Build metadata with trip info
  const fullMetadata = {
    ...metadata,
    ...(tripId ? { tripId } : {}),
    dispatchedAt: new Date().toISOString(),
    channels: channels,
  }

  // ── 1. Always save in_app notification ──
  let savedNotificationId: string | null = null
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

  // ── 2. SMS channel ──
  if (channels.includes('sms')) {
    try {
      const phone = await resolvePhone(userId, driverId)
      if (!phone) {
        const msg = `No phone number found for user ${userId} / driver ${driverId}`
        console.warn(`[Notification] SMS skipped: ${msg}`)
        result.errors.push(`sms: ${msg}`)
      } else {
        const smsText = smsMessage || message
        const smsResult = await sendSMS({
          to: phone,
          message: smsText,
          tripId,
        })
        result.sms = smsResult.success
        if (!smsResult.success) {
          result.errors.push(`sms: ${smsResult.error || 'Failed'}`)
        }
      }
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : 'Unknown error'
      console.error(`[Notification] SMS dispatch error: ${errorMsg}`)
      result.errors.push(`sms: ${errorMsg}`)
    }
  }

  // ── 3. Email channel ──
  if (channels.includes('email')) {
    try {
      const email = await resolveEmail(userId, driverId)
      if (!email) {
        const msg = `No email found for user ${userId} / driver ${driverId}`
        console.warn(`[Notification] Email skipped: ${msg}`)
        result.errors.push(`email: ${msg}`)
      } else {
        const subject = emailSubject || title
        const html = emailHtml || `<p>${message.replace(/\n/g, '<br/>')}</p>`
        const emailResult = await sendEmail({
          to: email,
          subject: `[${APP_NAME}] ${subject}`,
          html,
        })
        result.email = emailResult.success
        if (!emailResult.success) {
          result.errors.push(`email: ${emailResult.error || 'Failed'}`)
        }
      }
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : 'Unknown error'
      console.error(`[Notification] Email dispatch error: ${errorMsg}`)
      result.errors.push(`email: ${errorMsg}`)
    }
  }

  // ── 4. Push channel (Socket.IO real-time) ──
  if (channels.includes('push')) {
    try {
      const res = await fetch(`${NOTIFICATION_SERVICE_URL}/api/notify`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          userIds: [userId],
          notification: {
            id: `push-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
            type,
            title,
            message,
            link: link || null,
            createdAt: new Date().toISOString(),
            ...(tripId ? { tripId } : {}),
          },
        }),
      })
      const data = await res.json() as { success?: boolean; count?: number; total?: number }
      const pushOk = data.success === true || (data.count ?? 0) > 0
      result.push = pushOk
      console.log(`[Notification] Socket.IO push sent to user ${userId}: ${data.count ?? 0}/${data.total ?? 1} delivered, success=${pushOk}`)

      // Update pushSent on the DB notification record for observability
      if (pushOk && savedNotificationId) {
        db.notification.update({
          where: { id: savedNotificationId },
          data: { pushSent: true, pushSentAt: new Date() },
        }).catch((err) => {
          console.warn(`[Notification] Failed to update pushSent: ${err instanceof Error ? err.message : err}`)
        })
      }
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : 'Unknown error'
      console.error(`[Notification] Push dispatch error: ${errorMsg}`)
      result.errors.push(`push: ${errorMsg}`)
    }
  }

  // Log summary
  const successCount = [result.inApp, result.sms, result.email, result.push].filter(Boolean).length
  console.log(
    `[Notification] Dispatch complete for "${type}": ` +
    `${successCount}/${channels.length} channels succeeded.` +
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

/**
 * Resolve a phone number for SMS delivery.
 * Checks the user's phone first, then the driver's phone if driverId is provided.
 */
async function resolvePhone(userId: string, driverId?: string): Promise<string | null> {
  // If we have a driverId, try the driver's phone first (more reliable for SMS)
  if (driverId) {
    const driver = await db.driver.findUnique({
      where: { id: driverId },
      select: { phone: true },
    })
    if (driver?.phone) return driver.phone
  }

  // Fall back to user's phone
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
async function resolveEmail(userId: string, driverId?: string): Promise<string | null> {
  // User email is usually the primary contact
  const user = await db.user.findUnique({
    where: { id: userId },
    select: { email: true },
  })
  if (user?.email) return user.email

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
 * Dispatch a real-time push notification to all users with a specific role
 * via the Socket.IO notification service.
 *
 * This is a lightweight alternative to dispatchNotification() when you only
 * need push delivery (not in_app DB record, SMS, or email).
 * The Socket.IO service queries the DB for users with the given role.
 *
 * Use this for broadcasting to Admin/Manager users without saving
 * individual in_app records for each.
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
    const res = await fetch(`${NOTIFICATION_SERVICE_URL}/api/notify-role`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        role,
        notification: {
          id: `role-push-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
          type,
          title,
          message,
          link: link || null,
          createdAt: new Date().toISOString(),
        },
      }),
    })
    const data = await res.json() as { success?: boolean; count?: number; role?: string }
    console.log(`[Notification] Role push "${type}" sent to ${data.count ?? 0} user(s) with role "${role}"`)
    return data.success === true
  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : 'Unknown error'
    console.error(`[Notification] Role push dispatch error: ${errorMsg}`)
    return false
  }
}

/**
 * Broadcast a real-time push notification to ALL connected clients
 * via the Socket.IO notification service.
 */
export async function dispatchBroadcastNotification(params: {
  type: string
  title: string
  message: string
  link?: string
}): Promise<boolean> {
  const { type, title, message, link } = params

  try {
    const res = await fetch(`${NOTIFICATION_SERVICE_URL}/api/notify-all`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        notification: {
          id: `broadcast-push-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
          type,
          title,
          message,
          link: link || null,
          createdAt: new Date().toISOString(),
        },
      }),
    })
    const data = await res.json() as { success?: boolean; count?: number }
    console.log(`[Notification] Broadcast push "${type}" sent to ${data.count ?? 0} client(s)`)
    return data.success === true
  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : 'Unknown error'
    console.error(`[Notification] Broadcast push dispatch error: ${errorMsg}`)
    return false
  }
}
