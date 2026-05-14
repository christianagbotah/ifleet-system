'use client'

import * as React from 'react'
import { motion } from 'framer-motion'
import { Bell, Route, Wrench, ShieldCheck, DollarSign, FileText, Check, AlertCircle, RefreshCw, MessageSquare, Mail, Smartphone, ChevronRight, Trash2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from '@/components/ui/alert-dialog'
import { Card, CardContent } from '@/components/ui/card'
import {
  NOTIFICATION_TYPES,
} from '@/lib/constants'
import { fetchNotifications, markNotificationRead, bulkMarkNotificationsRead, clearAllNotifications, type Notification } from '@/lib/api'
import { toast } from 'sonner'
import { Skeleton } from '@/components/ui/skeleton'
import { useAuthStore } from '@/lib/store/auth'
import { NotificationDetailDialog } from './NotificationDetailDialog'
import { useEntityHighlight } from '@/lib/hooks/useEntityHighlight'

const containerVariants = {
  show: { transition: { staggerChildren: 0.04 } },
}

const itemVariants = {
  show: { opacity: 1, y: 0 },
}

const typeFilters = [
  { value: 'all', label: 'All' },
  { value: 'trip', label: 'Trip' },
  { value: 'maintenance', label: 'Maintenance' },
  { value: 'insurance', label: 'Insurance' },
  { value: 'payment', label: 'Payment' },
  { value: 'alert', label: 'Alert' },
]

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
  return config?.color || 'bg-gray-100 text-gray-600'
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

export function NotificationsView() {
  const { user } = useAuthStore()
  const [typeFilter, setTypeFilter] = React.useState('all')
  const [notifications, setNotifications] = React.useState<Notification[]>([])
  const [unreadCount, setUnreadCount] = React.useState(0)
  const [loading, setLoading] = React.useState(true)
  const [error, setError] = React.useState<string | null>(null)
  const [clearing, setClearing] = React.useState(false)

  // Detail dialog state
  const [detailNotification, setDetailNotification] = React.useState<Notification | null>(null)
  const [detailOpen, setDetailOpen] = React.useState(false)

  const { highlightEntityId, highlightClassName, scrollIntoView } = useEntityHighlight('notification')
  const rowRefs = React.useRef<Record<string, HTMLElement | null>>({})

  const loadNotifications = React.useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const params: Parameters<typeof fetchNotifications>[0] = { limit: 50 }
      if (user?.role === 'Driver' && user?.id) {
        params.userId = user.id
      }
      const result = await fetchNotifications(params)
      setNotifications(result.data)
      setUnreadCount(result.unreadCount)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to fetch notifications')
    } finally {
      setLoading(false)
    }
  }, [])

  React.useEffect(() => {
    loadNotifications()
  }, [loadNotifications])

  const filteredNotifications = React.useMemo(() => {
    if (typeFilter === 'all') return notifications

    const typeMap: Record<string, string[]> = {
      trip: ['trip_assigned', 'trip_started', 'trip_loading', 'trip_loaded', 'trip_departed', 'trip_in_transit', 'trip_arrived', 'trip_offloading', 'trip_offloaded', 'trip_return', 'trip_waiting', 'trip_completed'],
      maintenance: ['maintenance_due'],
      insurance: ['insurance_expiring'],
      payment: ['payment_received'],
      alert: ['alert'],
    }

    const types = typeMap[typeFilter] || []
    return notifications.filter(n => types.includes(n.type))
  }, [notifications, typeFilter])

  // Scroll to highlighted row after data loads
  React.useEffect(() => {
    if (highlightEntityId && rowRefs.current[highlightEntityId]) {
      scrollIntoView(rowRefs.current[highlightEntityId])
    }
  }, [highlightEntityId, filteredNotifications, scrollIntoView])

  const handleMarkAsRead = async (id: string) => {
    try {
      await markNotificationRead(id)
      setNotifications(prev =>
        prev.map(n => n.id === id ? { ...n, isRead: true } : n)
      )
      setUnreadCount(prev => Math.max(0, prev - 1))
      toast.success('Notification marked as read')
    } catch {
      toast.error('Failed to mark as read')
    }
  }

  const handleMarkAllAsRead = async () => {
    const unread = notifications.filter(n => !n.isRead)
    try {
      await bulkMarkNotificationsRead(unread.map(n => n.id))
      setNotifications(prev => prev.map(n => ({ ...n, isRead: true })))
      setUnreadCount(0)
      toast.success(`Marked ${unread.length} notification${unread.length > 1 ? 's' : ''} as read`)
    } catch {
      toast.error('Failed to mark all as read')
    }
  }

  const handleOpenDetail = (notification: Notification) => {
    if (!notification.isRead) {
      handleMarkAsRead(notification.id)
    }
    setDetailNotification(notification)
    setDetailOpen(true)
  }

  const handleClearAll = async () => {
    setClearing(true)
    try {
      const result = await clearAllNotifications()
      setNotifications([])
      setUnreadCount(0)
      toast.success(`Cleared ${result.deleted} notification${result.deleted !== 1 ? 's' : ''}`)
    } catch {
      toast.error('Failed to clear notifications')
    } finally {
      setClearing(false)
    }
  }

  return (
    <>
      <motion.div
        variants={containerVariants}
        animate="show"
        className="space-y-4 sm:space-y-6"
      >
        {/* Header */}
        <motion.div variants={itemVariants} className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold tracking-tight">Notifications</h1>
            <p className="text-muted-foreground">
              {loading ? 'Loading...' : unreadCount > 0 ? `You have ${unreadCount} unread notification${unreadCount > 1 ? 's' : ''}` : 'All caught up!'}
            </p>
          </div>
          {unreadCount > 0 && (
            <div className="flex items-center gap-2">
              <Button
                variant="outline"
                onClick={handleMarkAllAsRead}
                className="text-amber-600 border-amber-200 hover:bg-amber-50"
              >
                <Check className="mr-2 h-4 w-4" />
                Mark all as read
              </Button>
              {notifications.length > 0 && (
                <AlertDialog>
                  <AlertDialogTrigger asChild>
                    <Button
                      variant="outline"
                      disabled={clearing}
                      className="text-red-600 border-red-200 hover:bg-red-50"
                    >
                      <Trash2 className={`mr-2 h-4 w-4 ${clearing ? 'animate-pulse' : ''}`} />
                      {clearing ? 'Clearing...' : 'Clear All'}
                    </Button>
                  </AlertDialogTrigger>
                  <AlertDialogContent>
                    <AlertDialogHeader>
                      <AlertDialogTitle>Clear All Notifications</AlertDialogTitle>
                      <AlertDialogDescription>
                        This will permanently delete all {notifications.length} notification{notifications.length !== 1 ? 's' : ''}. This action cannot be undone.
                      </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                      <AlertDialogCancel>Cancel</AlertDialogCancel>
                      <AlertDialogAction
                        onClick={handleClearAll}
                        className="bg-red-600 hover:bg-red-700"
                      >
                        Delete All
                      </AlertDialogAction>
                    </AlertDialogFooter>
                  </AlertDialogContent>
                </AlertDialog>
              )}
            </div>
          )}
        </motion.div>

        {/* Type Filters */}
        <motion.div variants={itemVariants} className="flex flex-wrap gap-2">
          {typeFilters.map((filter) => (
            <Button
              key={filter.value}
              variant={typeFilter === filter.value ? 'default' : 'outline'}
              size="sm"
              onClick={() => setTypeFilter(filter.value)}
              className={typeFilter === filter.value ? 'bg-amber-500 hover:bg-amber-600 text-white' : ''}
            >
              {filter.label}
            </Button>
          ))}
        </motion.div>

        {/* Notification List */}
        <motion.div variants={itemVariants} className="space-y-2">
          {error ? (
            <div className="flex flex-col items-center justify-center py-12 text-center">
              <AlertCircle className="h-8 w-8 text-red-500 mb-3" />
              <p className="text-sm text-muted-foreground mb-3">{error}</p>
              <Button variant="outline" size="sm" onClick={loadNotifications}>
                <RefreshCw className="mr-2 h-3 w-3" /> Retry
              </Button>
            </div>
          ) : loading ? (
            <div className="space-y-3">
              {[1, 2, 3, 4].map(i => (
                <Card key={i}>
                  <CardContent className="p-4">
                    <div className="flex items-start gap-3">
                      <Skeleton className="h-8 w-8 rounded-full shrink-0" />
                      <div className="flex-1">
                        <Skeleton className="h-4 w-40 mb-2" />
                        <Skeleton className="h-3 w-full mb-1" />
                        <Skeleton className="h-3 w-24" />
                      </div>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          ) : filteredNotifications.length === 0 ? (
            <Card>
              <CardContent className="flex flex-col items-center justify-center py-12">
                <div className="rounded-full bg-muted p-4 mb-4">
                  <Bell className="h-8 w-8 text-muted-foreground" />
                </div>
                <h3 className="text-lg font-semibold mb-1">No notifications</h3>
                <p className="text-sm text-muted-foreground">No notifications match the selected filter</p>
              </CardContent>
            </Card>
          ) : (
            filteredNotifications.map((notification) => {
              const IconComp = getNotificationIcon(notification.type)
              const colorClass = getNotificationColor(notification.type)

              return (
                <motion.div
                  key={notification.id}
                  whileHover={{ scale: 1.005 }}
                  whileTap={{ scale: 0.998 }}
                >
                  <Card
                    ref={(el) => { rowRefs.current[notification.id] = el }}
                    className={`group transition-all cursor-pointer hover:shadow-md ${!notification.isRead ? 'border-l-4 border-l-amber-500' : ''} ${notification.id === highlightEntityId ? highlightClassName : ''}`}
                    onClick={() => handleOpenDetail(notification)}
                  >
                    <CardContent className="p-4">
                      <div className="flex items-start gap-3">
                        <div className={`rounded-full p-2 shrink-0 ${colorClass}`}>
                          <IconComp className="h-4 w-4" />
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-start justify-between gap-2">
                            <h4 className={`text-sm ${!notification.isRead ? 'font-semibold' : 'font-medium'}`}>
                              {notification.title}
                            </h4>
                            <span className="text-xs text-muted-foreground whitespace-nowrap shrink-0">
                              {formatTimeAgo(notification.createdAt)}
                            </span>
                          </div>
                          <p className="text-sm text-muted-foreground mt-0.5">{notification.message}</p>
                          {/* Delivery channel badges */}
                          <div className="flex items-center justify-between mt-2">
                            <div className="flex items-center gap-1.5">
                              <span className="inline-flex items-center gap-0.5 text-[10px] text-muted-foreground bg-muted px-1.5 py-0.5 rounded">
                                <Bell className="h-2.5 w-2.5" /> App
                              </span>
                              {notification.smsSent && (
                                <span className="inline-flex items-center gap-0.5 text-[10px] text-emerald-600 bg-emerald-50 px-1.5 py-0.5 rounded">
                                  <MessageSquare className="h-2.5 w-2.5" /> SMS
                                </span>
                              )}
                              {notification.emailSent && (
                                <span className="inline-flex items-center gap-0.5 text-[10px] text-violet-600 bg-violet-50 px-1.5 py-0.5 rounded">
                                  <Mail className="h-2.5 w-2.5" /> Email
                                </span>
                              )}
                            </div>
                            {!notification.isRead && (
                              <Button
                                variant="ghost"
                                size="sm"
                                className="shrink-0 h-6 text-[11px] text-amber-600 hover:text-amber-700 hover:bg-amber-50 dark:hover:bg-amber-900/20 px-2"
                                onClick={(e) => {
                                  e.stopPropagation()
                                  handleMarkAsRead(notification.id)
                                }}
                              >
                                <Check className="mr-1 h-3 w-3" />
                                Read
                              </Button>
                            )}
                          </div>
                          {/* Read more indicator */}
                          <div className="flex items-center mt-1.5 opacity-0 group-hover:opacity-100 transition-opacity">
                            <span className="text-[10px] font-medium text-amber-600 dark:text-amber-400">
                              Click to view details
                            </span>
                            <ChevronRight className="h-3 w-3 text-amber-600 dark:text-amber-400 ml-0.5" />
                          </div>
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                </motion.div>
              )
            })
          )}
        </motion.div>
      </motion.div>

      {/* Notification Detail Dialog */}
      <NotificationDetailDialog
        notification={detailNotification}
        open={detailOpen}
        onOpenChange={setDetailOpen}
        onMarkAsRead={(id) => {
          handleMarkAsRead(id)
        }}
      />
    </>
  )
}
