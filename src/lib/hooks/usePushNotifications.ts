// ════════════════════════════════════════════════════════════════════
// Fleetivo — Push Notification Hook (authenticated SSE)
// ════════════════════════════════════════════════════════════════════

'use client'

import { useEffect, useRef, useState } from 'react'
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

interface ParsedSseEvent {
  event: string
  data: string
}

const RECONNECT_DELAY_MS = 5000

function parseSseBlock(block: string): ParsedSseEvent | null {
  let event = 'message'
  const dataLines: string[] = []

  for (const line of block.split(/\r?\n/)) {
    if (!line || line.startsWith(':')) continue
    if (line.startsWith('event:')) event = line.slice(6).trim()
    if (line.startsWith('data:')) dataLines.push(line.slice(5).trimStart())
  }

  if (dataLines.length === 0) return null
  return { event, data: dataLines.join('\n') }
}

export function usePushNotifications(
  onNotification?: (notification: PushNotification) => void,
): UsePushNotificationsReturn {
  const [isConnected, setIsConnected] = useState(false)
  const [lastPush, setLastPush] = useState<PushNotification | null>(null)
  const [pushCount, setPushCount] = useState(0)
  const userId = useAuthStore((state) => state.user?.id || null)
  const token = useAuthStore((state) => state.token)
  const onNotificationRef = useRef(onNotification)
  const reconnectTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const abortRef = useRef<AbortController | null>(null)

  useEffect(() => {
    onNotificationRef.current = onNotification
  }, [onNotification])

  useEffect(() => {
    if (!userId || !token) {
      setIsConnected(false)
      return
    }

    let disposed = false

    const scheduleReconnect = (connect: () => void) => {
      if (disposed) return
      reconnectTimerRef.current = setTimeout(connect, RECONNECT_DELAY_MS)
    }

    const connect = async () => {
      if (disposed) return

      abortRef.current?.abort()
      const controller = new AbortController()
      abortRef.current = controller
      setIsConnected(false)

      try {
        const response = await fetch(
          `/api/notifications/stream?userId=${encodeURIComponent(userId)}`,
          {
            method: 'GET',
            headers: {
              Accept: 'text/event-stream',
              Authorization: `Bearer ${token}`,
            },
            cache: 'no-store',
            signal: controller.signal,
          },
        )

        if (!response.ok || !response.body) {
          throw new Error(`Push stream unavailable (${response.status})`)
        }

        const reader = response.body.getReader()
        const decoder = new TextDecoder()
        let buffer = ''

        while (!disposed && !controller.signal.aborted) {
          const { done, value } = await reader.read()
          if (done) break

          buffer += decoder.decode(value, { stream: true })
          let boundary = buffer.indexOf('\n\n')
          while (boundary >= 0) {
            const block = buffer.slice(0, boundary)
            buffer = buffer.slice(boundary + 2)
            const parsed = parseSseBlock(block)

            if (parsed?.event === 'connected') {
              setIsConnected(true)
            } else if (parsed?.event === 'notification') {
              try {
                const notification = JSON.parse(parsed.data) as PushNotification
                setLastPush(notification)
                setPushCount((previous) => previous + 1)
                onNotificationRef.current?.(notification)
                showBrowserNotification(notification)
                playNotificationSound()
              } catch (error) {
                console.warn('[Push] Ignoring malformed SSE notification:', error)
              }
            }

            boundary = buffer.indexOf('\n\n')
          }
        }
      } catch (error) {
        if (!disposed && !controller.signal.aborted) {
          console.warn('[Push] SSE connection failed:', error)
        }
      } finally {
        if (abortRef.current === controller) abortRef.current = null
        if (!disposed && !controller.signal.aborted) {
          setIsConnected(false)
          scheduleReconnect(() => { void connect() })
        }
      }
    }

    void connect()

    return () => {
      disposed = true
      if (reconnectTimerRef.current) {
        clearTimeout(reconnectTimerRef.current)
        reconnectTimerRef.current = null
      }
      abortRef.current?.abort()
      abortRef.current = null
      setIsConnected(false)
    }
  }, [token, userId])

  return { isConnected, lastPush, pushCount }
}

function showBrowserNotification(data: PushNotification) {
  if (typeof window === 'undefined' || !('Notification' in window)) return

  if (Notification.permission === 'default') {
    Notification.requestPermission().then((permission) => {
      if (permission === 'granted') doShowNotification(data)
    })
    return
  }

  if (Notification.permission === 'granted') doShowNotification(data)
}

function doShowNotification(data: PushNotification) {
  const plainMessage = data.message.replace(/<[^>]+>/g, '')
  try {
    new window.Notification(`${APP_NAME}: ${data.title}`, {
      body: plainMessage.length > 200 ? `${plainMessage.slice(0, 200)}...` : plainMessage,
      icon: '/icons/icon-192.png',
      tag: data.notificationId || data.type,
      timestamp: new Date(data.timestamp).getTime(),
    })
  } catch {
    // Browser notifications are optional.
  }
}

let audioInstance: HTMLAudioElement | null = null

function playNotificationSound() {
  if (typeof window === 'undefined') return
  try {
    if (!audioInstance) {
      audioInstance = new Audio('/sounds/notification.wav')
      audioInstance.volume = 0.3
    }
    audioInstance.currentTime = 0
    audioInstance.play().catch(() => {})
  } catch {
    // Audio feedback is optional.
  }
}
