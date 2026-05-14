import { create } from 'zustand'

export interface NotificationItem {
  id: string
  type: 'info' | 'warning' | 'success' | 'error'
  title: string
  message: string
  timestamp: string
  read: boolean
  link?: string
  iconName?: string
}

interface NotificationState {
  notifications: NotificationItem[]
  unreadCount: number
  isSheetOpen: boolean
  setNotifications: (notifications: NotificationItem[]) => void
  addNotification: (notification: Omit<NotificationItem, 'id' | 'read'>) => void
  markAsRead: (id: string) => void
  markAllAsRead: () => void
  clearAll: () => void
  setSheetOpen: (open: boolean) => void
  toggleSheet: () => void
}

export const useNotificationStore = create<NotificationState>((set, get) => ({
  notifications: [],
  unreadCount: 0,
  isSheetOpen: false,

  setNotifications: (notifications) =>
    set({
      notifications,
      unreadCount: notifications.filter((n) => !n.read).length,
    }),

  addNotification: (notification) => {
    const id = `notif-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`
    const newNotification: NotificationItem = {
      ...notification,
      id,
      read: false,
    }
    const notifications = [newNotification, ...get().notifications]
    set({
      notifications,
      unreadCount: notifications.filter((n) => !n.read).length,
    })
  },

  markAsRead: (id) => {
    const notifications = get().notifications.map((n) =>
      n.id === id ? { ...n, read: true } : n
    )
    set({
      notifications,
      unreadCount: notifications.filter((n) => !n.read).length,
    })
  },

  markAllAsRead: () => {
    const notifications = get().notifications.map((n) => ({
      ...n,
      read: true,
    }))
    set({
      notifications,
      unreadCount: 0,
    })
  },

  clearAll: () => set({ notifications: [], unreadCount: 0 }),

  setSheetOpen: (open) => set({ isSheetOpen: open }),

  toggleSheet: () => set((state) => ({ isSheetOpen: !state.isSheetOpen })),
}))
