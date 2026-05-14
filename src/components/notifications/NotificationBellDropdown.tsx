'use client'

import * as React from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import {
  Bell,
  Route,
  Wrench,
  ShieldCheck,
  DollarSign,
  FileText,
  Check,
  ExternalLink,
  Smartphone,
  Volume2,
  VolumeX,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Skeleton } from '@/components/ui/skeleton'
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover'
import { Separator } from '@/components/ui/separator'
import { NOTIFICATION_TYPES } from '@/lib/constants'
import {
  fetchNotifications,
  markNotificationRead,
  bulkMarkNotificationsRead,
  clearAllNotifications,
  type Notification,
} from '@/lib/api'
import { usePushNotifications, type PushNotification } from '@/lib/hooks/usePushNotifications'
import { useAuthStore } from '@/lib/store/auth'
import { NotificationDetailDialog } from './NotificationDetailDialog'
import { toast } from 'sonner'

interface NotificationBellDropdownProps {
  onNavigate?: (page: string) => void
}

// --- Utility functions ---

function getNotificationIcon(type: string) {
  switch (type) {
    case 'trip_assigned':
      return Smartphone
    case 'trip_loading':
    case 'trip_loaded':
    case 'trip_offloaded':
    case 'trip_return':
    case 'trip_started':
    case 'trip_departed':
    case 'trip_in_transit':
    case 'trip_arrived':
    case 'trip_offloading':
    case 'trip_waiting':
    case 'trip_completed':
      return Route
    case 'maintenance_due':
      return Wrench
    case 'insurance_expiring':
      return ShieldCheck
    case 'payment_received':
      return DollarSign
    case 'alert':
      return Bell
    default:
      return FileText
  }
}

function getNotificationColor(type: string) {
  const config = NOTIFICATION_TYPES[type as keyof typeof NOTIFICATION_TYPES]
  return config?.color || 'bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-400'
}

function formatTimeAgo(dateStr: string): string {
  const date = new Date(dateStr)
  const now = new Date()
  const diffMs = now.getTime() - date.getTime()
  const diffMins = Math.floor(diffMs / 60000)
  const diffHours = Math.floor(diffMs / 3600000)
  const diffDays = Math.floor(diffMs / 86400000)

  if (diffMins < 1) return 'Just now'
  if (diffMins < 60) return `${diffMins}m ago`
  if (diffHours < 24) return `${diffHours}h ago`
  if (diffDays < 7) return `${diffDays}d ago`
  return date.toLocaleDateString()
}

// --- Skeleton loader ---

function NotificationSkeleton() {
  return (
    <div className="flex items-start gap-3 px-4 py-3">
      <Skeleton className="h-8 w-8 rounded-full shrink-0" />
      <div className="flex-1 min-w-0">
        <Skeleton className="h-3.5 w-36 mb-1.5" />
        <Skeleton className="h-3 w-full mb-1" />
        <Skeleton className="h-3 w-16" />
      </div>
    </div>
  )
}

// --- Empty state ---

function EmptyState() {
  return (
    <div className="flex flex-col items-center justify-center py-8 px-4">
      <div className="rounded-full bg-muted p-3 mb-3">
        <Bell className="h-6 w-6 text-muted-foreground" />
      </div>
      <p className="text-sm font-medium text-muted-foreground">
        No new notifications
      </p>
    </div>
  )
}

// --- Main component ---

export function NotificationBellDropdown({ onNavigate }: NotificationBellDropdownProps) {
  const [open, setOpen] = React.useState(false)
  const [notifications, setNotifications] = React.useState<Notification[]>([])
  const [unreadCount, setUnreadCount] = React.useState(0)
  const [loading, setLoading] = React.useState(true)
  const [markingAll, setMarkingAll] = React.useState(false)
  const [clearing, setClearing] = React.useState(false)

  // Detail dialog state
  const [detailNotification, setDetailNotification] = React.useState<Notification | null>(null)
  const [detailOpen, setDetailOpen] = React.useState(false)

  // Sound toggle state
  const [soundEnabled, setSoundEnabled] = React.useState(() => {
    if (typeof window === 'undefined') return true
    return localStorage.getItem('fleetpro-notification-sound') !== 'false'
  })

  const { user, isAuthenticated } = useAuthStore()

  // Fetch notifications for the authenticated user (only unread for tray)
  // Guard: skip fetch when not authenticated
  const loadNotifications = React.useCallback(async () => {
    // Read token fresh from store at call time to avoid stale closure values
    const { token } = useAuthStore.getState()
    if (!isAuthenticated || !token) {
      setLoading(false)
      return
    }
    try {
      const params: Parameters<typeof fetchNotifications>[0] = { limit: 50 }
      if (user?.id) {
        params.userId = user.id
      }
      params.unreadOnly = true
      const result = await fetchNotifications(params)
      setNotifications(result.data)
      setUnreadCount(result.unreadCount)
    } catch (err) {
      // Suppress expected errors — network glitches, auth races, etc.
      // These are non-critical background polls; silently ignore them.
      const message = err instanceof Error ? err.message : ''
      // Only log unexpected server errors (5xx), not auth/network issues
      if (message.includes('500') || message.includes('Internal Server')) {
        console.error('[NotificationBell] Failed to load notifications:', err)
      }
    } finally {
      setLoading(false)
    }
  }, [user?.id, isAuthenticated]) // token read fresh inside callback

  // Handle real-time push notifications via Socket.IO
  const handlePushNotification = React.useCallback((push: PushNotification) => {
    // Always show a toast for trip-related push notifications (even if deduped)
    if (push.type.startsWith('trip_')) {
      toast(push.title, {
        description: push.message,
        icon: <Route className="h-4 w-4 text-amber-500" />,
        duration: 6000,
      })
    }

    setNotifications(prev => {
      // Deduplicate: don't add push if same type+tripId already in list (from DB or earlier push)
      const tripId = push.metadata?.tripId as string | undefined
      const alreadyExists = prev.some(
        n => n.type === push.type &&
             (!tripId || (n.link === `trips/${tripId}`)) &&
             !n.isRead
      )
      if (alreadyExists) return prev

      // Increment unread only for new push
      setUnreadCount(cnt => cnt + 1)

      const newNotification: Notification = {
        id: push.notificationId || `push-${Date.now()}`,
        userId: '',
        type: push.type,
        title: push.title,
        message: push.message,
        channel: 'push',
        isRead: false,
        readAt: null,
        link: tripId ? `trips/${tripId}` : null,
        createdAt: push.timestamp,
        metadata: push.metadata ? JSON.stringify(push.metadata) : null,
        smsSent: false,
        emailSent: false,
      }
      return [newNotification, ...prev].slice(0, 10)
    })
  }, [])

  const { isConnected: pushConnected } = usePushNotifications(handlePushNotification)

  // Initial load + periodic refresh — only when authenticated
  React.useEffect(() => {
    if (!isAuthenticated) {
      setLoading(false)
      return
    }
    loadNotifications()
    const interval = setInterval(loadNotifications, 30000)
    return () => clearInterval(interval)
  }, [loadNotifications, isAuthenticated])

  // Lock page scroll when popover is open
  React.useEffect(() => {
    if (!open) return
    const scrollContainer = document.querySelector(
      'main[data-slot="sidebar-inset"] > main'
    ) as HTMLElement | null
    if (scrollContainer) {
      const originalOverflow = scrollContainer.style.overflow
      scrollContainer.style.overflow = 'hidden'
      return () => {
        scrollContainer.style.overflow = originalOverflow
      }
    }
  }, [open])

  // Refresh when popover opens — only when authenticated
  React.useEffect(() => {
    if (open && isAuthenticated) {
      setLoading(true)
      loadNotifications()
    }
  }, [open, loadNotifications, isAuthenticated])

  // Mark a single notification as read — removes it from tray
  const handleMarkAsRead = React.useCallback(async (id: string) => {
    try {
      await markNotificationRead(id)
      setNotifications(prev => prev.filter(n => n.id !== id))
      setUnreadCount(prev => Math.max(0, prev - 1))
    } catch {
      // Silently fail
    }
  }, [])

  // Open notification detail dialog
  const handleOpenDetail = React.useCallback((notification: Notification) => {
    // Mark as read when opening
    if (!notification.isRead) {
      handleMarkAsRead(notification.id)
    }
    setDetailNotification(notification)
    setDetailOpen(true)
    setOpen(false) // close popover when opening dialog
  }, [handleMarkAsRead])

  // Toggle notification sound on/off
  const handleToggleSound = React.useCallback(() => {
    const current = localStorage.getItem('fleetpro-notification-sound')
    const newValue = current === 'false'
    localStorage.setItem('fleetpro-notification-sound', newValue ? 'true' : 'false')
    setSoundEnabled(newValue)
  }, [])

  const handleClearAll = React.useCallback(async () => {
    if (!user?.id) return
    setClearing(true)
    try {
      await clearAllNotifications()
      setNotifications([])
      setUnreadCount(0)
      setOpen(false)
    } catch {
      // Silently fail
    } finally {
      setClearing(false)
    }
  }, [user?.id])

  const handleMarkAllAsRead = React.useCallback(async () => {
    const unreadIds = notifications.filter(n => !n.isRead).map(n => n.id)
    if (unreadIds.length === 0) return

    setMarkingAll(true)
    try {
      await bulkMarkNotificationsRead(unreadIds)
      setNotifications(prev => prev.map(n => ({ ...n, isRead: true })))
      setUnreadCount(0)
      setOpen(false) // close tray after marking all read
    } catch {
      // Silently fail
    } finally {
      setMarkingAll(false)
    }
  }, [notifications])

  return (
    <>
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <Button
            variant="ghost"
            size="icon"
            className="relative"
            aria-label={`Notifications${unreadCount > 0 ? ` (${unreadCount} unread)` : ''}`}
          >
            <Bell className={`h-4 w-4 ${!pushConnected ? 'text-muted-foreground' : ''}`} />
            {unreadCount > 0 && (
              <Badge className="absolute -top-1 -right-1 h-5 min-w-5 flex items-center justify-center p-0 bg-amber-500 text-white border-0 text-[10px] font-bold animate-pulse">
                {unreadCount > 99 ? '99+' : unreadCount}
              </Badge>
            )}
          </Button>
        </PopoverTrigger>

        <PopoverContent
          className="w-80 sm:w-96 p-0 flex flex-col max-h-[70vh] max-w-[calc(100vw-2rem)] bg-background dark:bg-gray-950 shadow-2xl border-border/80"
          align="end"
          sideOffset={8}
          onOpenAutoFocus={(e) => e.preventDefault()}
        >
          {/* Header */}
          <div className="shrink-0 flex items-center justify-between px-4 py-3">
            <div className="flex items-center gap-2">
              <h3 className="text-sm font-semibold">Notifications</h3>
              {unreadCount > 0 && (
                <Badge
                  variant="secondary"
                  className="h-5 min-w-5 flex items-center justify-center p-0 bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400 text-[10px] font-bold border-0"
                >
                  {unreadCount}
                </Badge>
              )}
            </div>
            <div className="flex items-center gap-1">
              <Button
                variant="ghost"
                size="icon"
                className="h-7 w-7 text-muted-foreground hover:text-foreground"
                onClick={handleToggleSound}
                aria-label={soundEnabled ? 'Mute notifications' : 'Unmute notifications'}
              >
                {soundEnabled ? <Volume2 className="h-3.5 w-3.5" /> : <VolumeX className="h-3.5 w-3.5" />}
              </Button>
              {unreadCount > 0 && (
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-7 px-2 text-xs text-amber-600 hover:text-amber-700 hover:bg-amber-50 dark:hover:bg-amber-900/20"
                  onClick={handleMarkAllAsRead}
                  disabled={markingAll}
                >
                  <Check className={`mr-1 h-3 w-3 ${markingAll ? 'animate-spin' : ''}`} />
                  {markingAll ? 'Marking...' : 'Mark all read'}
                </Button>
              )}
              {notifications.length > 0 && (
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-7 px-2 text-xs text-red-500 hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-900/20"
                  onClick={handleClearAll}
                  disabled={clearing}
                >
                  {clearing ? 'Clearing...' : 'Clear all'}
                </Button>
              )}
              <Button
                variant="ghost"
                size="sm"
                className="h-7 px-2 text-xs text-muted-foreground hover:text-foreground"
                onClick={() => {
                  if (onNavigate) {
                    onNavigate('notifications')
                    setOpen(false)
                  }
                }}
              >
                View all
                <ExternalLink className="ml-1 h-3 w-3" />
              </Button>
            </div>
          </div>

          <Separator className="shrink-0" />

          {/* Notification list */}
          <div className="flex-1 min-h-0 overflow-y-auto overscroll-contain">
            {loading ? (
              <div className="divide-y">
                {[1, 2, 3, 4].map(i => (
                  <NotificationSkeleton key={i} />
                ))}
              </div>
            ) : notifications.length === 0 ? (
              <EmptyState />
            ) : (
              <AnimatePresence initial={false}>
                <div className="divide-y">
                  {notifications.map((notification) => {
                    const IconComp = getNotificationIcon(notification.type)
                    const colorClass = getNotificationColor(notification.type)

                    return (
                      <motion.div
                        key={notification.id}
                        initial={{ opacity: 0, height: 0 }}
                        animate={{ opacity: 1, height: 'auto' }}
                        exit={{ opacity: 0, height: 0 }}
                        transition={{ duration: 0.15 }}
                        className={`transition-colors hover:bg-muted/50 ${!notification.isRead ? 'border-l-[3px] border-l-amber-500' : 'border-l-[3px] border-l-transparent'}`}
                      >
                        <button
                          className="w-full text-left flex items-start gap-3 px-4 py-3 cursor-pointer"
                          onClick={() => handleOpenDetail(notification)}
                          aria-label={`View details: ${notification.title}`}
                        >
                          <div className={`rounded-full p-1.5 shrink-0 mt-0.5 ${colorClass}`}>
                            <IconComp className="h-3.5 w-3.5" />
                          </div>
                          <div className="flex-1 min-w-0">
                            <div className="flex items-start justify-between gap-2">
                              <p className={`text-sm leading-tight ${!notification.isRead ? 'font-semibold' : 'font-medium text-muted-foreground'}`}>
                                {notification.title}
                              </p>
                              {!notification.isRead && (
                                <span className="h-2 w-2 rounded-full bg-amber-500 shrink-0 mt-1.5" />
                              )}
                            </div>
                            <p className="text-xs text-muted-foreground mt-0.5 line-clamp-2 leading-relaxed">
                              {notification.message}
                            </p>
                            <div className="flex items-center justify-between mt-1">
                              <p className="text-[10px] text-muted-foreground/70">
                                {formatTimeAgo(notification.createdAt)}
                              </p>
                              <span className="text-[10px] font-medium text-amber-600 dark:text-amber-400 hover:text-amber-700 dark:hover:text-amber-300 transition-colors">
                                Read more
                              </span>
                            </div>
                          </div>
                        </button>
                      </motion.div>
                    )
                  })}
                </div>
              </AnimatePresence>
            )}
          </div>

          {/* Footer */}
          {!loading && notifications.length > 0 && (
            <div className="shrink-0 border-t">
              <div className="px-4 py-2">
                <Button
                  variant="ghost"
                  size="sm"
                  className="w-full h-8 text-xs text-amber-600 hover:text-amber-700 hover:bg-amber-50 dark:hover:bg-amber-900/20"
                  onClick={() => {
                    if (onNavigate) {
                      onNavigate('notifications')
                      setOpen(false)
                    }
                  }}
                >
                  <Bell className="mr-1.5 h-3.5 w-3.5" />
                  View all notifications
                </Button>
              </div>
            </div>
          )}
        </PopoverContent>
      </Popover>

      {/* Notification Detail Dialog */}
      <NotificationDetailDialog
        notification={detailNotification}
        open={detailOpen}
        onOpenChange={setDetailOpen}
        onMarkAsRead={handleMarkAsRead}
      />
    </>
  )
}
