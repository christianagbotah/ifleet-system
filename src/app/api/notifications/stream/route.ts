// ════════════════════════════════════════════════════════════════════
// iFleetPro — Push Notification SSE Stream  (brand: see src/lib/constants.ts APP_NAME)
// ════════════════════════════════════════════════════════════════════
//
// GET /api/notifications/stream?userId=xxx
//
// Server-Sent Events endpoint for real-time push notifications.
// Clients connect and receive events as they are dispatched.
//
// Authentication: Requires a valid JWT in the Authorization header
// (Bearer token) or a next-auth session cookie. The userId query
// parameter must match the authenticated user's ID.
//
// Reconnection: Clients should use EventSource which auto-reconnects.
// Heartbeat: A keep-alive comment is sent every 30 seconds.
// ────────────────────────────────────────────────────────────────────

import { NextRequest } from 'next/server'
import { jwtVerify } from 'jose'
import { registerPushListener, type PushEvent } from '@/lib/services/push'
import { APP_NAME } from '@/lib/constants'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

const JWT_SECRET = process.env.NEXTAUTH_SECRET || 'fleetpro-fallback-secret'

function getSecretKey(): Uint8Array {
  return new TextEncoder().encode(JWT_SECRET)
}

async function verifyRequest(request: NextRequest): Promise<{ userId: string } | null> {
  // 1. Try Authorization: Bearer <token>
  const authHeader = request.headers.get('authorization')
  if (authHeader && authHeader.startsWith('Bearer ')) {
    const token = authHeader.substring(7)
    try {
      const { payload } = await jwtVerify(token, getSecretKey())
      const userId = payload.userId as string | undefined
      if (userId) return { userId }
    } catch {
      // Token invalid or expired — fall through to cookie check
    }
  }

  // 2. Try next-auth session cookie (JWT stored in cookie)
  const cookieToken =
    request.cookies.get('next-auth.session-token')?.value ??
    request.cookies.get('__Secure-next-auth.session-token')?.value ??
    request.cookies.get('authjs.session-token')?.value

  if (cookieToken) {
    try {
      const { payload } = await jwtVerify(cookieToken, getSecretKey())
      const userId = payload.userId as string | undefined
      const sub = payload.sub as string | undefined
      // next-auth JWT stores user ID in `sub` field; our custom JWT uses `userId`
      if (userId) return { userId }
      if (sub) return { userId: sub }
    } catch {
      // Cookie token invalid or expired
    }
  }

  return null
}

export async function GET(request: NextRequest) {
  // ── Authentication ──
  const authed = await verifyRequest(request)
  if (!authed) {
    return new Response(JSON.stringify({ error: 'Authentication required' }), {
      status: 401,
      headers: { 'Content-Type': 'application/json' },
    })
  }

  const { searchParams } = new URL(request.url)
  const requestedUserId = searchParams.get('userId')

  if (!requestedUserId) {
    return new Response(JSON.stringify({ error: 'Missing userId parameter' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json' },
    })
  }

  // The requested userId must match the authenticated user's ID
  if (requestedUserId !== authed.userId) {
    return new Response(JSON.stringify({ error: 'Unauthorized: userId mismatch' }), {
      status: 403,
      headers: { 'Content-Type': 'application/json' },
    })
  }

  const userId = authed.userId
  console.log(`[SSE] New authenticated connection from user ${userId}`)

  // Create a readable stream for SSE
  const encoder = new TextEncoder()
  let keepAliveTimer: ReturnType<typeof setInterval> | null = null

  const stream = new ReadableStream({
    start(controller) {
      // Send initial connection message
      controller.enqueue(encoder.encode(`event: connected\ndata: {"userId":"${userId}","timestamp":"${new Date().toISOString()}"}\n\n`))

      // Register the push listener — when notifications are dispatched, this callback fires
      const unsubscribe = registerPushListener(userId, (event: PushEvent) => {
        try {
          const data = JSON.stringify(event)
          controller.enqueue(encoder.encode(`event: notification\ndata: ${data}\n\n`))
        } catch {
          // Stream may have been closed
        }
      })

      // Keep-alive: send a comment every 30 seconds to prevent connection timeout
      keepAliveTimer = setInterval(() => {
        try {
          controller.enqueue(encoder.encode(`: keepalive ${new Date().toISOString()}\n\n`))
        } catch {
          // Stream closed, clean up
          if (keepAliveTimer) clearInterval(keepAliveTimer)
          unsubscribe()
        }
      }, 30000)

      // Clean up on close/abort
      const cleanup = () => {
        if (keepAliveTimer) clearInterval(keepAliveTimer)
        unsubscribe()
        console.log(`[SSE] Connection closed for user ${userId}`)
      }

      // Handle abort signal
      request.signal.addEventListener('abort', cleanup, { once: true })
    },
    cancel() {
      if (keepAliveTimer) clearInterval(keepAliveTimer)
      console.log(`[SSE] Stream cancelled for user ${userId}`)
    },
  })

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache, no-transform',
      'Connection': 'keep-alive',
      'X-Accel-Buffering': 'no', // Disable nginx buffering
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Headers': 'Cache-Control',
    },
  })
}
