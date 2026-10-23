import { act, renderHook, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const socket = vi.hoisted(() => ({
  disconnect: vi.fn(),
  emit: vi.fn(),
  on: vi.fn(),
  io: { on: vi.fn() },
}))

vi.mock('socket.io-client', () => ({
  io: vi.fn(() => socket),
}))

import { usePushNotifications } from '@/lib/hooks/usePushNotifications'
import { useAuthStore, type AuthUser } from '@/lib/store/auth'

const user: AuthUser = {
  id: 'user-1',
  email: 'user@example.com',
  name: 'Fleet User',
  phone: null,
  avatar: null,
  role: 'Manager',
  permissions: [],
  isActive: true,
}

function sseResponse(): Response {
  const encoder = new TextEncoder()
  return new Response(new ReadableStream({
    start(controller) {
      controller.enqueue(encoder.encode(
        'event: connected\ndata: {"userId":"user-1","timestamp":"2026-10-23T10:00:00.000Z"}\n\n',
      ))
      controller.enqueue(encoder.encode(
        'event: notification\ndata: {"type":"trip_departed","title":"Trip departed","message":"Truck left","timestamp":"2026-10-23T10:00:01.000Z","notificationId":"notification-1"}\n\n',
      ))
    },
  }), {
    status: 200,
    headers: { 'content-type': 'text/event-stream' },
  })
}

describe('usePushNotifications SSE transport', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    useAuthStore.setState({
      user,
      token: 'signed-token',
      isAuthenticated: true,
      isHydrated: true,
    })
  })

  afterEach(() => {
    useAuthStore.setState({ user: null, token: null, isAuthenticated: false })
    vi.unstubAllGlobals()
  })

  it('uses the authenticated same-origin SSE stream and surfaces notification events', async () => {
    const fetchMock = vi.fn(async () => sseResponse())
    vi.stubGlobal('fetch', fetchMock)
    const onNotification = vi.fn()

    const { result, unmount } = renderHook(() => usePushNotifications(onNotification))

    await waitFor(() => expect(result.current.isConnected).toBe(true))
    await waitFor(() => expect(result.current.pushCount).toBe(1))

    expect(fetchMock).toHaveBeenCalledWith(
      '/api/notifications/stream?userId=user-1',
      expect.objectContaining({
        method: 'GET',
        headers: expect.objectContaining({
          Accept: 'text/event-stream',
          Authorization: 'Bearer signed-token',
        }),
        signal: expect.any(AbortSignal),
      }),
    )
    expect(result.current.lastPush).toEqual(expect.objectContaining({
      type: 'trip_departed',
      notificationId: 'notification-1',
    }))
    expect(onNotification).toHaveBeenCalledWith(expect.objectContaining({ type: 'trip_departed' }))

    act(() => unmount())
  })
})
