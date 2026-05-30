import { Server } from 'socket.io';

const PORT = 3003;

// ─── CORS Configuration ───────────────────────────────────────────────────
const allowedOrigins = process.env.CORS_ORIGIN
  ? (process.env.CORS_ORIGIN.startsWith('[')
      ? JSON.parse(process.env.CORS_ORIGIN)
      : [process.env.CORS_ORIGIN])
  : ['http://localhost:3000', 'https://ifleetpro.lightworldtech.com'];

const io = new Server(PORT, {
  cors: {
    origin: (origin, callback) => {
      // Allow connections with no origin (mobile apps, server-to-server)
      if (!origin) return callback(null, true);
      if (allowedOrigins.includes(origin)) return callback(null, true);
      console.warn(`[Tracking] Blocked connection from disallowed origin: ${origin}`);
      callback(new Error('Not allowed by CORS'));
    },
    methods: ['GET', 'POST'],
    credentials: true,
  },
});

// ─── In-memory stores ─────────────────────────────────────────────────────

const driverLocations = new Map<string, {
  lat: number;
  lng: number;
  heading?: number;
  speed?: number;
  timestamp: number;
  truckId?: string;
  driverName?: string;
}>();

const activeDrivers = new Map<string, { socketId: string; lastSeen: number }>();
const activeViewers = new Map<string, { socketId: string; watching: string[] }>();

// ─── Lightweight validation (no Zod dep needed in mini-service) ───────────

function isValidLocation(data: unknown): data is {
  driverId: string;
  lat: number;
  lng: number;
  heading?: number;
  speed?: number;
  truckId?: string;
  driverName?: string;
} {
  if (typeof data !== 'object' || data === null) return false;
  const d = data as Record<string, unknown>;
  return (
    typeof d.driverId === 'string' && d.driverId.length > 0 &&
    typeof d.lat === 'number' && d.lat >= -90 && d.lat <= 90 &&
    typeof d.lng === 'number' && d.lng >= -180 && d.lng <= 180 &&
    (d.heading === undefined || (typeof d.heading === 'number' && d.heading >= 0 && d.heading < 360)) &&
    (d.speed === undefined || (typeof d.speed === 'number' && d.speed >= 0 && d.speed <= 300)) &&
    (d.truckId === undefined || typeof d.truckId === 'string') &&
    (d.driverName === undefined || typeof d.driverName === 'string')
  );
}

function isValidSubscribe(data: unknown): data is string[] {
  if (!Array.isArray(data)) return false;
  if (data.length > 50) return false; // Max 50 drivers per subscription
  return data.every((id) => typeof id === 'string' && id.length > 0);
}

// ─── Event Handlers ────────────────────────────────────────────────────────

io.on('connection', (socket) => {
  console.log(`[Tracking] Client connected: ${socket.id}`);

  // Driver sends location update
  socket.on('driver:location', (data: unknown) => {
    if (!isValidLocation(data)) {
      socket.emit('error', { message: 'Invalid location data format' });
      return;
    }

    const location = {
      lat: data.lat,
      lng: data.lng,
      heading: data.heading,
      speed: data.speed,
      timestamp: Date.now(),
      truckId: data.truckId,
      driverName: data.driverName,
    };

    driverLocations.set(data.driverId, location);
    activeDrivers.set(data.driverId, { socketId: socket.id, lastSeen: Date.now() });

    // Broadcast to all viewers watching this driver
    socket.emit('location:updated', { driverId: data.driverId, ...location });
    socket.broadcast.emit('location:updated', { driverId: data.driverId, ...location });
  });

  // Viewer subscribes to specific drivers
  socket.on('viewer:subscribe', (data: unknown) => {
    if (!isValidSubscribe(data)) {
      socket.emit('error', { message: 'Invalid subscription — must be an array of up to 50 driver IDs' });
      return;
    }

    activeViewers.set(socket.id, { socketId: socket.id, watching: data });
    // Send current locations for subscribed drivers
    for (const driverId of data) {
      const location = driverLocations.get(driverId);
      if (location) {
        socket.emit('location:updated', { driverId, ...location });
      }
    }
  });

  // Get all active driver locations
  socket.on('get:all-locations', () => {
    const locations: Record<string, typeof driverLocations extends Map<string, infer V> ? V : never> = {};
    for (const [driverId, location] of driverLocations) {
      // Only return locations less than 5 minutes old
      if (Date.now() - location.timestamp < 5 * 60 * 1000) {
        locations[driverId] = location;
      }
    }
    socket.emit('all-locations', locations);
  });

  // Get active drivers list
  socket.on('get:active-drivers', () => {
    const now = Date.now();
    const active: string[] = [];
    for (const [driverId, info] of activeDrivers) {
      if (now - info.lastSeen < 5 * 60 * 1000) {
        active.push(driverId);
      }
    }
    socket.emit('active-drivers', active);
  });

  socket.on('disconnect', () => {
    console.log(`[Tracking] Client disconnected: ${socket.id}`);
    // Remove from active viewers
    activeViewers.delete(socket.id);
    // Remove from active drivers
    for (const [driverId, info] of activeDrivers) {
      if (info.socketId === socket.id) {
        activeDrivers.delete(driverId);
        break;
      }
    }
  });
});

// ─── Periodic cleanup ────────────────────────────────────────────────────

setInterval(() => {
  const now = Date.now();
  const staleThreshold = 10 * 60 * 1000; // 10 minutes
  for (const [driverId, location] of driverLocations) {
    if (now - location.timestamp > staleThreshold) {
      driverLocations.delete(driverId);
    }
  }
  for (const [driverId, info] of activeDrivers) {
    if (now - info.lastSeen > staleThreshold) {
      activeDrivers.delete(driverId);
    }
  }
}, 10 * 60 * 1000);

console.log(`[Tracking Service] Running on port ${PORT}`);
console.log(`[Tracking Service] CORS origins: ${allowedOrigins.join(', ')}`);
