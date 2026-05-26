// ════════════════════════════════════════════════════════════════════
// iFleetPro — Push Notification Hook (Socket.IO)
// ════════════════════════════════════════════════════════════════════
//
// usePushNotifications — connects to the notification Socket.IO service
// on port 3004 and provides real-time notification updates.
//
// Features:
//   - Pre-flight health check before connecting (avoids 502 console spam)
//   - Auto-connects when user is authenticated
//   - Auto-reconnects on disconnect (built into socket.io-client)
//   - Falls back to polling if Socket.IO fails
//   - Increments unread count on each push event
//   - Shows browser notification (if permitted)
// ────────────────────────────────────────────────────────────────────

'use client'

import { useEffect, useRef, useState, useCallback } from 'react'
import { io, Socket } from 'socket.io-client'
import { useAuthStore } from '@/lib/store/auth'
import { APP_NAME } from '@/lib/constants'

export interface PushNotification {
  type: string
  title: string
  message: string
  timestamp: string
  notificationId?: string
  metadata?: Record<string, unknown>
}

interface UsePushNotificationsReturn {
  isConnected: boolean
  lastPush: PushNotification | null
  pushCount: number
}

/** Check if the push notification service is reachable (non-throwing).
 *  Result is cached for the session to avoid repeated 404 console spam. */
let _pushAvailableCache: boolean | null = null
let _pushAvailablePromise: Promise<boolean> | null = null

async function isPushServiceAvailable(): Promise<boolean> {
  // Return cached result if we already checked
  if (_pushAvailableCache !== null) return _pushAvailableCache

  // Deduplicate concurrent checks
  if (_pushAvailablePromise) return _pushAvailablePromise

  _pushAvailablePromise = (async () => {
    try {
      const controller = new AbortController()
      const timer = setTimeout(() => controller.abort(), 3000)
      const res = await fetch('/socket.io/?XTransformPort=3004&EIO=4&transport=polling', {
        method: 'GET',
        signal: controller.signal,
      })
      clearTimeout(timer)
      // Socket.IO handshake returns 200 with a numeric payload
      _pushAvailableCache = res.ok
    } catch {
      _pushAvailableCache = false
    }
    return _pushAvailableCache
  })()

  return _pushAvailablePromise
}

export function usePushNotifications(
  onNotification?: (notification: PushNotification) => void
): UsePushNotificationsReturn {
  const [isConnected, setIsConnected] = useState(false)
  const [lastPush, setLastPush] = useState<PushNotification | null>(null)
  const [pushCount, setPushCount] = useState(0)
  const socketRef = useRef<Socket | null>(null)
  const userId = useAuthStore((state) => state.user?.id || null)

  // Use refs for callbacks to avoid re-connecting on callback change
  const onNotificationRef = useRef(onNotification)
  useEffect(() => {
    onNotificationRef.current = onNotification
  }, [onNotification])

  const connectSocket = useCallback(() => {
    if (!userId) return

    // Close existing connection
    if (socketRef.current) {
      socketRef.current.disconnect()
      socketRef.current = null
    }

    // Pre-flight check: only connect if the push service is actually reachable.
    // This prevents the 502 Bad Gateway console spam when the service is down.
    isPushServiceAvailable().then((available) => {
      if (!available) {
        // Only warn once per session to avoid console spam
        if (!sessionStorage.getItem('_pushWarned')) {
          console.warn('[Push] Notification service not available — push notifications disabled')
          sessionStorage.setItem('_pushWarned', '1')
        }
        setIsConnected(false)
        return
      }

      try {
        // Connect to Socket.IO notification service through Caddy gateway.
        // query.XTransformPort tells Caddy to route to port 3004.
        const socket = io({
          query: { XTransformPort: '3004' },
          transports: ['polling', 'websocket'],
          reconnection: true,
          reconnectionAttempts: 5,
          reconnectionDelay: 5000,
          reconnectionDelayMax: 30000,
          timeout: 10000,
        })

        socketRef.current = socket

        socket.on('connect', () => {
          console.log('[Push] Socket.IO connected:', socket.id, 'userId:', userId)
          setIsConnected(true)

          // Join the user's notification room
          socket.emit('join-user', { userId }, (ack: unknown) => {
            console.log('[Push] join-user acknowledged:', ack)
          })
        })

        socket.on('notification', (data: {
          id: string
          type: string
          title: string
          message: string
          link?: string | null
          createdAt: string
          tripId?: string
        }) => {
          const pushNotification: PushNotification = {
            type: data.type,
            title: data.title,
            message: data.message,
            timestamp: data.createdAt,
            notificationId: data.id,
            metadata: data.tripId ? { tripId: data.tripId } : undefined,
          }

          console.log('[Push] Received:', data.type, data.title)

          setLastPush(pushNotification)
          setPushCount((prev) => prev + 1)

          // Call the callback
          if (onNotificationRef.current) {
            onNotificationRef.current(pushNotification)
          }

          // Show browser notification (if permitted)
          showBrowserNotification(pushNotification)

          // Play notification sound
          playNotificationSound()
        })

        socket.on('disconnect', (reason) => {
          console.log('[Push] Socket.IO disconnected:', reason)
          setIsConnected(false)
        })

        socket.io.on('reconnect_failed', () => {
          console.warn('[Push] Notification service unavailable after all retries — push notifications disabled')
        })

        socket.on('connect_error', () => {
          setIsConnected(false)
        })
      } catch (err) {
        console.error('[Push] Failed to create Socket.IO connection:', err)
      }
    })
  }, [userId])

  // Connect / reconnect when userId changes
  useEffect(() => {
    connectSocket()

    return () => {
      if (socketRef.current) {
        socketRef.current.disconnect()
        socketRef.current = null
        setIsConnected(false)
      }
    }
  }, [connectSocket])

  return { isConnected, lastPush, pushCount }
}

// ── Browser Notification Helper ──

function showBrowserNotification(data: PushNotification) {
  if (typeof window === 'undefined' || !('Notification' in window)) return

  // Request permission on first push
  if (Notification.permission === 'default') {
    Notification.requestPermission().then((perm) => {
      if (perm === 'granted') {
        doShowNotification(data)
      }
    })
    return
  }

  if (Notification.permission === 'granted') {
    doShowNotification(data)
  }
}

function doShowNotification(data: PushNotification) {
  const plainMessage = data.message.replace(/<[^>]+>/g, '')
  try {
    new window.Notification(`${APP_NAME}: ${data.title}`, {
      body: plainMessage.length > 200 ? plainMessage.slice(0, 200) + '...' : plainMessage,
      icon: '/icons/icon-192.png',
      tag: data.notificationId || data.type,
      timestamp: new Date(data.timestamp).getTime(),
    })
  } catch {
    // Browser notification failed silently
  }
}

// ── Notification Sound Helper ──

let audioInstance: HTMLAudioElement | null = null

function playNotificationSound() {
  if (typeof window === 'undefined') return
  try {
    // Reuse the audio instance if possible
    if (!audioInstance) {
      audioInstance = new Audio('/sounds/notification.wav')
      audioInstance.volume = 0.3 // Subtle volume
    }
    // Reset to beginning and play
    audioInstance.currentTime = 0
    audioInstance.play().catch(() => {
      // Autoplay blocked by browser — ignore silently
    })
  } catch {
    // Audio not supported — ignore silently
  }
}
