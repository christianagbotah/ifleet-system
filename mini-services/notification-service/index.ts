// ════════════════════════════════════════════════════════════════════
// iFleetPro — Notification Service (Socket.IO + HTTP API)
// ════════════════════════════════════════════════════════════════════
//
// Real-time notification delivery via Socket.IO (port 3004).
//
// Socket.IO events (client ↔ service):
//   - client emits  'join-user'       → subscribe to user notifications
//   - client emits  'user:subscribe'   → subscribe to user notifications (alias)
//   - client emits  'user:unsubscribe' → unsubscribe
//   - service emits 'notification'      → push notification to subscribed user
//
// HTTP API (backend → service):
//   - POST /api/notify       → send to specific userIds
//   - POST /api/notify-role  → send to all users with a given role (requires DB)
//   - POST /api/notify-all   → broadcast to all connected clients
//
// Health check:
//   - GET /api/health        → { status: 'ok' }
// ────────────────────────────────────────────────────────────────────

import { Server } from 'socket.io'
import http from 'http'

const PORT = 3004

// API key for authenticating backend requests to the notification service
const INTERNAL_API_KEY = process.env.INTERNAL_API_KEY || 'ifleetpro-internal-key-change-me'

// ── Create HTTP server + Socket.IO ──
const httpServer = http.createServer()

const io = new Server(httpServer, {
  cors: {
    origin: process.env.CORS_ORIGIN || ['http://localhost:3000', 'https://ifleetpro.lightworldtech.com'],
    methods: ['GET', 'POST'],
    credentials: true,
  },
  // Allow polling and websocket
  transports: ['polling', 'websocket'],
})

// ── In-memory stores ──
const userSockets = new Map<string, Set<string>>() // userId -> Set<socketId>
const socketUserMap = new Map<string, string>()    // socketId -> userId

// ════════════════════════════════════════════════════════════════════
// SOCKET.IO EVENT HANDLERS
// ════════════════════════════════════════════════════════════════════

io.on('connection', (socket) => {
  console.log(`[Notifications] Client connected: ${socket.id}`)

  // ── User subscribes to their notifications (primary event) ──
  socket.on('join-user', (data: { userId: string }, ack?: (data: unknown) => void) => {
    subscribeUser(socket.id, data.userId)
    if (ack) ack({ status: 'ok' })
  })

  // ── Alias: user:subscribe ──
  socket.on('user:subscribe', (data: { userId: string }, ack?: (data: unknown) => void) => {
    subscribeUser(socket.id, data.userId)
    if (ack) ack({ status: 'ok' })
  })

  // ── User unsubscribes ──
  socket.on('user:unsubscribe', (data: { userId: string }) => {
    unsubscribeUser(socket.id, data.userId)
  })

  // ── Disconnect ──
  socket.on('disconnect', () => {
    console.log(`[Notifications] Client disconnected: ${socket.id}`)
    cleanupSocket(socket.id)
  })
})

function subscribeUser(socketId: string, userId: string) {
  const sockets = userSockets.get(userId) || new Set()
  sockets.add(socketId)
  userSockets.set(userId, sockets)
  socketUserMap.set(socketId, userId)
  console.log(`[Notifications] User ${userId} subscribed (${sockets.size} connection(s))`)
}

function unsubscribeUser(socketId: string, userId: string) {
  const sockets = userSockets.get(userId)
  if (sockets) {
    sockets.delete(socketId)
    if (sockets.size === 0) {
      userSockets.delete(userId)
    } else {
      userSockets.set(userId, sockets)
    }
  }
  socketUserMap.delete(socketId)
}

function cleanupSocket(socketId: string) {
  const userId = socketUserMap.get(socketId)
  if (userId) {
    unsubscribeUser(socketId, userId)
  } else {
    socketUserMap.delete(socketId)
  }
}

// ════════════════════════════════════════════════════════════════════
// HTTP API (for backend dispatcher)
// ════════════════════════════════════════════════════════════════════

httpServer.on('request', (req, res) => {
  const url = new URL(req.url || '/', `http://localhost:${PORT}`)

  // ── Health check ──
  if (url.pathname === '/api/health' && req.method === 'GET') {
    res.writeHead(200, { 'Content-Type': 'application/json' })
    res.end(JSON.stringify({ status: 'ok', connectedUsers: userSockets.size }))
    return
  }

  // ── Notify specific users ──
  if (url.pathname === '/api/notify' && req.method === 'POST') {
    handleNotify(req, res)
    return
  }

  // ── Notify all users with a role ──
  if (url.pathname === '/api/notify-role' && req.method === 'POST') {
    handleNotifyRole(req, res)
    return
  }

  // ── Broadcast to all ──
  if (url.pathname === '/api/notify-all' && req.method === 'POST') {
    handleNotifyAll(req, res)
    return
  }

  // 404 for unmatched routes
  res.writeHead(404, { 'Content-Type': 'application/json' })
  res.end(JSON.stringify({ error: 'Not found' }))
})

// Verify internal API key from request headers
function verifyApiKey(req: http.IncomingMessage): boolean {
  const apiKey = req.headers['x-internal-api-key']
  return apiKey === INTERNAL_API_KEY
}

function readBody(req: http.IncomingMessage): Promise<string> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = []
    req.on('data', (chunk: Buffer) => chunks.push(chunk))
    req.on('end', () => resolve(Buffer.concat(chunks).toString()))
    req.on('error', reject)
  })
}

async function handleNotify(req: http.IncomingMessage, res: http.ServerResponse) {
  try {
    if (!verifyApiKey(req)) {
      res.writeHead(401, { 'Content-Type': 'application/json' })
      res.end(JSON.stringify({ error: 'Unauthorized: Invalid or missing API key' }))
      return
    }
    const body = JSON.parse(await readBody(req))
    const userIds: string[] = body.userIds || []
    const notification = body.notification || {}

    let delivered = 0
    for (const userId of userIds) {
      const sockets = userSockets.get(userId)
      if (sockets && sockets.size > 0) {
        for (const socketId of sockets) {
          io.to(socketId).emit('notification', notification)
        }
        delivered += sockets.size
      }
    }

    res.writeHead(200, { 'Content-Type': 'application/json' })
    res.end(JSON.stringify({ success: true, count: delivered, total: userIds.length }))
  } catch (err) {
    console.error('[Notifications] /api/notify error:', err)
    res.writeHead(500, { 'Content-Type': 'application/json' })
    res.end(JSON.stringify({ success: false, error: 'Internal server error' }))
  }
}

async function handleNotifyRole(req: http.IncomingMessage, res: http.ServerResponse) {
  try {
    if (!verifyApiKey(req)) {
      res.writeHead(401, { 'Content-Type': 'application/json' })
      res.end(JSON.stringify({ error: 'Unauthorized: Invalid or missing API key' }))
      return
    }
    const body = JSON.parse(await readBody(req))
    const role: string = body.role || ''
    const notification = body.notification || {}

    // Find all sockets belonging to users with the specified role.
    // Since this service is stateless (no DB), it broadcasts to all
    // connected clients and lets them filter by role on the client side.
    // For a production setup, this would query the database for userIds
    // with the given role, then target specific sockets.
    const totalConnected = userSockets.size

    // Emit to all connected sockets (role filtering would need DB access)
    if (totalConnected > 0) {
      io.emit('notification', { ...notification, _role: role })
    }

    res.writeHead(200, { 'Content-Type': 'application/json' })
    res.end(JSON.stringify({ success: true, count: totalConnected, role }))
  } catch (err) {
    console.error('[Notifications] /api/notify-role error:', err)
    res.writeHead(500, { 'Content-Type': 'application/json' })
    res.end(JSON.stringify({ success: false, error: 'Internal server error' }))
  }
}

async function handleNotifyAll(req: http.IncomingMessage, res: http.ServerResponse) {
  try {
    if (!verifyApiKey(req)) {
      res.writeHead(401, { 'Content-Type': 'application/json' })
      res.end(JSON.stringify({ error: 'Unauthorized: Invalid or missing API key' }))
      return
    }
    const body = JSON.parse(await readBody(req))
    const notification = body.notification || {}

    const totalConnected = io.sockets.sockets.size

    if (totalConnected > 0) {
      io.emit('notification', notification)
    }

    res.writeHead(200, { 'Content-Type': 'application/json' })
    res.end(JSON.stringify({ success: true, count: totalConnected }))
  } catch (err) {
    console.error('[Notifications] /api/notify-all error:', err)
    res.writeHead(500, { 'Content-Type': 'application/json' })
    res.end(JSON.stringify({ success: false, error: 'Internal server error' }))
  }
}

// ════════════════════════════════════════════════════════════════════
// START
// ════════════════════════════════════════════════════════════════════

httpServer.listen(PORT, () => {
  console.log(`[Notification Service] Running on port ${PORT}`)
  console.log(`[Notification Service] HTTP API: http://localhost:${PORT}/api/notify`)
  console.log(`[Notification Service] Health:    http://localhost:${PORT}/api/health`)
})
