import { Server } from 'socket.io';

const PORT = 3004;

const io = new Server(PORT, {
  cors: {
    origin: '*',
    methods: ['GET', 'POST'],
  },
});

// In-memory store for user notification subscriptions
const userSockets = new Map<string, string[]>(); // userId -> socketId[]

io.on('connection', (socket) => {
  console.log(`[Notifications] Client connected: ${socket.id}`);

  // User subscribes to their notifications
  socket.on('user:subscribe', (data: { userId: string }) => {
    const userId = data.userId;
    const sockets = userSockets.get(userId) || [];
    if (!sockets.includes(socket.id)) {
      sockets.push(socket.id);
      userSockets.set(userId, sockets);
    }
    console.log(`[Notifications] User ${userId} subscribed (${sockets.length} connections)`);
  });

  // User unsubscribes
  socket.on('user:unsubscribe', (data: { userId: string }) => {
    const userId = data.userId;
    const sockets = userSockets.get(userId) || [];
    const filtered = sockets.filter(id => id !== socket.id);
    if (filtered.length === 0) {
      userSockets.delete(userId);
    } else {
      userSockets.set(userId, filtered);
    }
  });

  // Send notification to specific user
  socket.on('notification:send', async (data: {
    userId: string;
    title: string;
    message: string;
    type?: string;
    link?: string;
  }) => {
    const sockets = userSockets.get(data.userId);
    if (sockets && sockets.length > 0) {
      const notification = {
        id: `notif-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`,
        ...data,
        timestamp: new Date().toISOString(),
        read: false,
      };
      for (const socketId of sockets) {
        io.to(socketId).emit('notification:new', notification);
      }
      console.log(`[Notifications] Sent to user ${data.userId}: "${data.title}"`);
    }
  });

  // Broadcast notification to all connected users
  socket.on('notification:broadcast', async (data: {
    title: string;
    message: string;
    type?: string;
    link?: string;
  }) => {
    const notification = {
      id: `notif-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`,
      ...data,
      timestamp: new Date().toISOString(),
      read: false,
    };
    io.emit('notification:new', notification);
    console.log(`[Notifications] Broadcast: "${data.title}" to ${userSockets.size} users`);
  });

  // Mark notification as read
  socket.on('notification:read', (data: { notificationId: string }) => {
    // Acknowledge read receipt
    socket.emit('notification:read:ack', { notificationId: data.notificationId });
  });

  // Get unread count
  socket.on('notification:unread-count', (data: { userId: string }) => {
    // In a real app, this would query the database
    socket.emit('notification:unread-count', { count: 0 });
  });

  socket.on('disconnect', () => {
    console.log(`[Notifications] Client disconnected: ${socket.id}`);
    // Clean up user subscriptions for this socket
    for (const [userId, sockets] of userSockets) {
      const filtered = sockets.filter(id => id !== socket.id);
      if (filtered.length === 0) {
        userSockets.delete(userId);
      } else {
        userSockets.set(userId, filtered);
      }
    }
  });
});

console.log(`[Notification Service] Running on port ${PORT}`);
