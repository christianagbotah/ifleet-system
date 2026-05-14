// ════════════════════════════════════════════════════════════════════
// ${APP_NAME} — Push Notification Service (SSE-based)
// ════════════════════════════════════════════════════════════════════

import { APP_NAME } from '@/lib/constants'
//
// In-memory pub/sub for real-time push notifications.
// Works with Server-Sent Events (SSE) via /api/notifications/stream.
//
// How it works:
//   1. Clients open an SSE connection to /api/notifications/stream?userId=xxx
//   2. The service keeps a map of userId → Set<callback>
//   3. When a notification is dispatched, emitPush() sends to all connected
//      clients for that userId
//   4. The SSE route calls registerPushListener() and cleanup on disconnect
//
// This runs in-process with the Next.js server. In a multi-instance
// deployment, you would replace this with Redis Pub/Sub or similar.
// ────────────────────────────────────────────────────────────────────

export interface PushEvent {
  type: string           // Notification type (trip_started, etc.)
  title: string
  message: string
  notificationId?: string
  timestamp: string      // ISO 8601
  metadata?: Record<string, unknown>
}

type PushCallback = (event: PushEvent) => void

// userId → Set of callback functions
const listeners = new Map<string, Set<PushCallback>>()

/**
 * Register a push listener for a given user.
 * Returns an unsubscribe function.
 */
export function registerPushListener(userId: string, callback: PushCallback): () => void {
  if (!listeners.has(userId)) {
    listeners.set(userId, new Set())
  }
  listeners.get(userId)!.add(callback)

  console.log(`[Push] Registered listener for user ${userId}. Total listeners: ${getTotalListenerCount()}`)

  // Return unsubscribe function
  return () => {
    const userListeners = listeners.get(userId)
    if (userListeners) {
      userListeners.delete(callback)
      if (userListeners.size === 0) {
        listeners.delete(userId)
      }
    }
    console.log(`[Push] Unregistered listener for user ${userId}. Total listeners: ${getTotalListenerCount()}`)
  }
}

/**
 * Emit a push event to all connected clients for a given user.
 */
export function emitPush(userId: string, event: PushEvent): void {
  const userListeners = listeners.get(userId)
  if (!userListeners || userListeners.size === 0) {
    console.log(`[Push] No active listeners for user ${userId}. Event "${event.type}" not delivered via push.`)
    return
  }

  console.log(`[Push] Emitting "${event.type}" to ${userListeners.size} listener(s) for user ${userId}`)

  for (const callback of userListeners) {
    try {
      callback(event)
    } catch (error) {
      console.error(`[Push] Error in listener callback for user ${userId}:`, error)
    }
  }
}

/**
 * Emit a push event to ALL connected clients (broadcast).
 * Useful for system-wide notifications.
 */
export function broadcastPush(event: PushEvent): void {
  console.log(`[Push] Broadcasting "${event.type}" to all ${getTotalListenerCount()} listener(s)`)

  for (const [userId, userListeners] of listeners.entries()) {
    for (const callback of userListeners) {
      try {
        callback(event)
      } catch (error) {
        console.error(`[Push] Error in broadcast callback for user ${userId}:`, error)
      }
    }
  }
}

/**
 * Get the total number of active push listeners.
 */
export function getTotalListenerCount(): number {
  let total = 0
  for (const userListeners of listeners.values()) {
    total += userListeners.size
  }
  return total
}

/**
 * Get the number of unique users with active push listeners.
 */
export function getConnectedUserCount(): number {
  return listeners.size
}

/**
 * Create a PushEvent from notification dispatch params.
 * Convenience function for the notification dispatcher.
 */
export function createPushEvent(params: {
  type: string
  title: string
  message: string
  notificationId?: string
  metadata?: Record<string, unknown>
}): PushEvent {
  return {
    type: params.type,
    title: params.title,
    message: params.message,
    notificationId: params.notificationId,
    timestamp: new Date().toISOString(),
    metadata: params.metadata,
  }
}
