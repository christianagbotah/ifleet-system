import http from 'http'
import { Server, type Socket } from 'socket.io'
import { validateTrackingSession } from './auth'

const PORT = Number(process.env.PORT || 3003)
const APP_BASE_URL = (process.env.APP_BASE_URL || 'http://127.0.0.1:3000').replace(/\/$/, '')
const FRESH_LOCATION_MS = 5 * 60 * 1000
const STALE_LOCATION_MS = 10 * 60 * 1000

const allowedOrigins: string[] = process.env.CORS_ORIGIN
  ? (process.env.CORS_ORIGIN.startsWith('[')
      ? JSON.parse(process.env.CORS_ORIGIN)
      : [process.env.CORS_ORIGIN])
  : ['http://localhost:3000', 'https://ifleetpro.lightworldtech.com']

interface PersistedLocation {
  truckId: string
  plateNumber?: string
  driverName?: string
  latitude: number
  longitude: number
  speed: number | null
  heading: number | null
  accuracy: number | null
  source: string
  timestamp: string
  receivedAt?: string
  tripId?: string | null
}

interface PhoneLocationInput {
  truckId: string
  latitude: number
  longitude: number
  accuracy?: number | null
  speed?: number | null
  heading?: number | null
  timestamp?: string
  eventId?: string
}

interface LegacyDriverLocationInput {
  driverId: string
  lat: number
  lng: number
  heading?: number
  speed?: number
  truckId?: string
  driverName?: string
}

const locationCache = new Map<string, PersistedLocation>()
const activeSenders = new Map<string, { socketId: string; lastSeen: number }>()
const viewerSubscriptions = new Map<string, string[]>()

const httpServer = http.createServer((req, res) => {
  const url = new URL(req.url || '/', `http://localhost:${PORT}`)

  if (url.pathname === '/api/health' && req.method === 'GET') {
    res.writeHead(200, { 'Content-Type': 'application/json' })
    res.end(JSON.stringify({
      status: 'ok',
      connectedUsers: io.sockets.sockets.size,
      activeSenders: activeSenders.size,
      cachedAssets: locationCache.size,
      sourceOfTruth: 'durable-next-api',
      service: 'tracking',
    }))
    return
  }

  res.writeHead(404, { 'Content-Type': 'application/json' })
  res.end(JSON.stringify({ error: 'Not found' }))
})

const io = new Server(httpServer, {
  cors: {
    origin: (origin, callback) => {
      if (!origin) return callback(null, true)
      if (allowedOrigins.includes(origin)) return callback(null, true)
      console.warn(`[Tracking] Blocked connection from disallowed origin: ${origin}`)
      callback(new Error('Not allowed by CORS'))
    },
    methods: ['GET', 'POST'],
    credentials: true,
  },
  transports: ['polling', 'websocket'],
})

io.use(async (socket, next) => {
  const token = authToken(socket)
  if (!token) return next(new Error('Authentication required for live tracking'))

  const valid = await validateTrackingSession(APP_BASE_URL, token)
  if (!valid) return next(new Error('Invalid or inactive authentication session'))

  socket.data.authToken = token
  next()
})

function authToken(socket: Socket): string | null {
  const value = socket.handshake.auth?.token
  return typeof value === 'string' && value.trim() ? value.trim() : null
}

function isValidPhoneLocation(data: unknown): data is PhoneLocationInput {
  if (!data || typeof data !== 'object' || Array.isArray(data)) return false
  const value = data as Record<string, unknown>
  return (
    typeof value.truckId === 'string' && value.truckId.length > 0 &&
    typeof value.latitude === 'number' && value.latitude >= -90 && value.latitude <= 90 &&
    typeof value.longitude === 'number' && value.longitude >= -180 && value.longitude <= 180 &&
    (value.accuracy === undefined || value.accuracy === null || (typeof value.accuracy === 'number' && value.accuracy >= 0)) &&
    (value.speed === undefined || value.speed === null || (typeof value.speed === 'number' && value.speed >= 0)) &&
    (value.heading === undefined || value.heading === null || (typeof value.heading === 'number' && value.heading >= 0 && value.heading <= 360))
  )
}

function isValidLegacyLocation(data: unknown): data is LegacyDriverLocationInput {
  if (!data || typeof data !== 'object' || Array.isArray(data)) return false
  const value = data as Record<string, unknown>
  return (
    typeof value.driverId === 'string' && value.driverId.length > 0 &&
    typeof value.truckId === 'string' && value.truckId.length > 0 &&
    typeof value.lat === 'number' && value.lat >= -90 && value.lat <= 90 &&
    typeof value.lng === 'number' && value.lng >= -180 && value.lng <= 180 &&
    (value.heading === undefined || (typeof value.heading === 'number' && value.heading >= 0 && value.heading <= 360)) &&
    (value.speed === undefined || (typeof value.speed === 'number' && value.speed >= 0))
  )
}

function isValidSubscribe(data: unknown): data is string[] {
  return Array.isArray(data) && data.length <= 50 && data.every((value) => typeof value === 'string' && value.length > 0)
}

async function persistPhoneLocation(token: string, data: PhoneLocationInput): Promise<PersistedLocation> {
  const response = await fetch(`${APP_BASE_URL}/api/tracking/location`, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({ ...data, source: 'phone' }),
  })
  const payload = await response.json().catch(() => ({})) as { data?: PersistedLocation; error?: string }
  if (!response.ok || !payload.data) {
    throw new Error(payload.error || `Location persistence failed (${response.status})`)
  }
  return payload.data
}

async function hydrateDurableLocations(token: string): Promise<PersistedLocation[]> {
  const response = await fetch(`${APP_BASE_URL}/api/tracking/location`, {
    method: 'GET',
    headers: { authorization: `Bearer ${token}` },
  })
  if (!response.ok) throw new Error(`Location hydration failed (${response.status})`)
  const payload = await response.json()
  return Array.isArray(payload) ? payload as PersistedLocation[] : []
}

function normalizedSocketLocation(location: PersistedLocation) {
  return {
    truckId: location.truckId,
    lat: location.latitude,
    lng: location.longitude,
    latitude: location.latitude,
    longitude: location.longitude,
    speed: location.speed,
    heading: location.heading,
    accuracy: location.accuracy,
    source: location.source,
    timestamp: location.timestamp,
    receivedAt: location.receivedAt,
    tripId: location.tripId ?? null,
    plateNumber: location.plateNumber,
    driverName: location.driverName,
  }
}

function cacheLocation(location: PersistedLocation) {
  locationCache.set(location.truckId, location)
}

function broadcastPersistedLocation(socket: Socket, location: PersistedLocation) {
  cacheLocation(location)
  activeSenders.set(location.truckId, { socketId: socket.id, lastSeen: Date.now() })
  const normalized = normalizedSocketLocation(location)

  socket.emit('location:updated', normalized)
  socket.broadcast.emit('location:updated', normalized)
  socket.to(`truck:${location.truckId}`).emit('location:updated', normalized)

  // Preserve the existing live-map contract while new consumers move to normalized events.
  socket.emit('truck-location', location)
  socket.broadcast.to('all-trucks').emit('truck-location', location)
}

async function refreshCache(token: string): Promise<PersistedLocation[]> {
  const locations = await hydrateDurableLocations(token)
  for (const location of locations) cacheLocation(location)
  return locations
}

function emitError(socket: Socket, message: string) {
  socket.emit('error', { message })
}

io.on('connection', (socket) => {
  console.log(`[Tracking] Client connected: ${socket.id}`)
  const token = typeof socket.data.authToken === 'string' ? socket.data.authToken : null

  socket.on('join-truck', (data: unknown) => {
    const truckId = data && typeof data === 'object' && typeof (data as Record<string, unknown>).truckId === 'string'
      ? String((data as Record<string, unknown>).truckId)
      : ''
    if (truckId) socket.join(`truck:${truckId}`)
  })

  socket.on('leave-truck', (data: unknown) => {
    const truckId = data && typeof data === 'object' && typeof (data as Record<string, unknown>).truckId === 'string'
      ? String((data as Record<string, unknown>).truckId)
      : ''
    if (truckId) socket.leave(`truck:${truckId}`)
  })

  socket.on('join-all-trucks', async () => {
    socket.join('all-trucks')
    if (!token) return emitError(socket, 'Authentication required for live tracking')
    try {
      const locations = await refreshCache(token)
      for (const location of locations) socket.emit('truck-location', location)
    } catch (error) {
      emitError(socket, error instanceof Error ? error.message : 'Failed to hydrate tracking state')
    }
  })

  // Browser/driver contract: persist durably before any broadcast.
  socket.on('location-update', async (data: unknown, acknowledge?: (result: unknown) => void) => {
    if (!token) {
      const error = 'Authentication required for location sharing'
      emitError(socket, error)
      acknowledge?.({ ok: false, error })
      return
    }
    if (!isValidPhoneLocation(data)) {
      const error = 'Invalid location data format'
      emitError(socket, error)
      acknowledge?.({ ok: false, error })
      return
    }

    try {
      const location = await persistPhoneLocation(token, data)
      broadcastPersistedLocation(socket, location)
      acknowledge?.({ ok: true, timestamp: location.timestamp })
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Location persistence failed'
      emitError(socket, message)
      acknowledge?.({ ok: false, error: message })
    }
  })

  // Backward-compatible legacy sender, routed through the same durable HTTP pipeline.
  socket.on('driver:location', async (data: unknown) => {
    if (!token) return emitError(socket, 'Authentication required for location sharing')
    if (!isValidLegacyLocation(data)) return emitError(socket, 'Invalid legacy location data format')

    try {
      const location = await persistPhoneLocation(token, {
        truckId: data.truckId!,
        latitude: data.lat,
        longitude: data.lng,
        heading: data.heading ?? null,
        speed: data.speed ?? null,
      })
      broadcastPersistedLocation(socket, location)
    } catch (error) {
      emitError(socket, error instanceof Error ? error.message : 'Location persistence failed')
    }
  })

  socket.on('viewer:subscribe', async (data: unknown) => {
    if (!isValidSubscribe(data)) return emitError(socket, 'Invalid subscription — must contain up to 50 truck IDs')
    viewerSubscriptions.set(socket.id, data)
    if (!token) return emitError(socket, 'Authentication required for live tracking')

    try {
      await refreshCache(token)
      for (const truckId of data) {
        const location = locationCache.get(truckId)
        if (location) socket.emit('location:updated', normalizedSocketLocation(location))
      }
    } catch (error) {
      emitError(socket, error instanceof Error ? error.message : 'Failed to hydrate tracking state')
    }
  })

  socket.on('get:all-locations', async () => {
    if (!token) return emitError(socket, 'Authentication required for live tracking')
    try {
      const locations = await refreshCache(token)
      const payload: Record<string, ReturnType<typeof normalizedSocketLocation>> = {}
      for (const location of locations) payload[location.truckId] = normalizedSocketLocation(location)
      socket.emit('all-locations', payload)
    } catch (error) {
      emitError(socket, error instanceof Error ? error.message : 'Failed to hydrate tracking state')
    }
  })

  socket.on('get-active-trucks', async () => {
    if (!token) return emitError(socket, 'Authentication required for live tracking')
    try {
      const locations = await refreshCache(token)
      socket.emit('active-trucks', locations.map((location) => location.truckId))
    } catch (error) {
      emitError(socket, error instanceof Error ? error.message : 'Failed to hydrate tracking state')
    }
  })

  socket.on('get:active-drivers', () => {
    const now = Date.now()
    const active = [...activeSenders.entries()]
      .filter(([, info]) => now - info.lastSeen < FRESH_LOCATION_MS)
      .map(([truckId]) => truckId)
    socket.emit('active-drivers', active)
  })

  socket.on('disconnect', () => {
    console.log(`[Tracking] Client disconnected: ${socket.id}`)
    viewerSubscriptions.delete(socket.id)
    for (const [truckId, info] of activeSenders) {
      if (info.socketId === socket.id) activeSenders.delete(truckId)
    }
  })
})

setInterval(() => {
  const now = Date.now()
  for (const [truckId, location] of locationCache) {
    const timestamp = new Date(location.receivedAt ?? location.timestamp).getTime()
    if (!Number.isFinite(timestamp) || now - timestamp > STALE_LOCATION_MS) locationCache.delete(truckId)
  }
  for (const [truckId, info] of activeSenders) {
    if (now - info.lastSeen > STALE_LOCATION_MS) activeSenders.delete(truckId)
  }
}, STALE_LOCATION_MS)

httpServer.listen(PORT, () => {
  console.log(`[Tracking Service] Running on port ${PORT}`)
  console.log(`[Tracking Service] Health: http://localhost:${PORT}/api/health`)
  console.log(`[Tracking Service] Durable API: ${APP_BASE_URL}`)
  console.log(`[Tracking Service] CORS origins: ${allowedOrigins.join(', ')}`)
})
