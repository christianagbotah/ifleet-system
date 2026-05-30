import { Server } from 'socket.io';

const PORT = 3003;

const io = new Server(PORT, {
  cors: {
    origin: process.env.CORS_ORIGIN || ['http://localhost:3000', 'https://ifleetpro.lightworldtech.com'],
    methods: ['GET', 'POST'],
    credentials: true,
  },
});

// In-memory store for driver locations
const driverLocations = new Map<string, {
  lat: number;
  lng: number;
  heading?: number;
  speed?: number;
  timestamp: number;
  truckId?: string;
  driverName?: string;
}>();

// In-memory store for active connections
const activeDrivers = new Map<string, { socketId: string; lastSeen: number }>();
const activeViewers = new Map<string, { socketId: string; watching: string[] }>();

io.on('connection', (socket) => {
  console.log(`[Tracking] Client connected: ${socket.id}`);

  // Driver sends location update
  socket.on('driver:location', (data: {
    driverId: string;
    lat: number;
    lng: number;
    heading?: number;
    speed?: number;
    truckId?: string;
    driverName?: string;
  }) => {
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
  socket.on('viewer:subscribe', (driverIds: string[]) => {
    activeViewers.set(socket.id, { socketId: socket.id, watching: driverIds });
    // Send current locations for subscribed drivers
    for (const driverId of driverIds) {
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

// Cleanup stale locations every 10 minutes
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
