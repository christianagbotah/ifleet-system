'use client'

import * as React from 'react'
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
} from '@/components/ui/sheet'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Button } from '@/components/ui/button'
import { Separator } from '@/components/ui/separator'
import {
  Bell,
  CheckCircle2,
  AlertTriangle,
  Info,
  XCircle,
  Clock,
} from 'lucide-react'

interface NotificationsSheetProps {
  open: boolean
  onOpenChange: (open: boolean) => void
}

interface Notification {
  id: string
  type: 'success' | 'warning' | 'error' | 'info'
  title: string
  description: string
  timestamp: Date
  read: boolean
}

// Placeholder notifications for demo purposes
const PLACEHOLDER_NOTIFICATIONS: Notification[] = []

function getNotificationIcon(type: Notification['type']) {
  switch (type) {
    case 'success':
      return <CheckCircle2 className="size-4 text-emerald-500" />
    case 'warning':
      return <AlertTriangle className="size-4 text-amber-500" />
    case 'error':
      return <XCircle className="size-4 text-red-500" />
    case 'info':
    default:
      return <Info className="size-4 text-sky-500" />
  }
}

function formatTimestamp(date: Date): string {
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

export function NotificationsSheet({
  open,
  onOpenChange,
}: NotificationsSheetProps) {
  const [notifications] = React.useState<Notification[]>(PLACEHOLDER_NOTIFICATIONS)

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="w-full sm:max-w-md">
        <SheetHeader>
          <SheetTitle className="flex items-center gap-2">
            <Bell className="h-5 w-5 text-amber-500" />
            Notifications
          </SheetTitle>
          <SheetDescription>
            Stay up to date with your fleet activity
          </SheetDescription>
        </SheetHeader>

        <Separator />

        {notifications.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 text-center">
            <div className="flex size-12 items-center justify-center rounded-full bg-muted mb-4">
              <Bell className="size-6 text-muted-foreground" />
            </div>
            <h3 className="text-sm font-medium mb-1">No notifications</h3>
            <p className="text-xs text-muted-foreground max-w-[200px]">
              You&apos;re all caught up. New notifications will appear here.
            </p>
          </div>
        ) : (
          <ScrollArea className="h-[calc(100vh-12rem)] -mx-4 px-4">
            <div className="space-y-3">
              {notifications.map((notification) => (
                <div
                  key={notification.id}
                  className={`flex gap-3 rounded-lg border p-3 transition-colors hover:bg-muted/50 ${
                    notification.read ? 'opacity-60' : ''
                  }`}
                >
                  <div className="mt-0.5 shrink-0">
                    {getNotificationIcon(notification.type)}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium leading-tight">
                      {notification.title}
                    </p>
                    <p className="text-xs text-muted-foreground mt-0.5 line-clamp-2">
                      {notification.description}
                    </p>
                    <div className="flex items-center gap-1 mt-1.5">
                      <Clock className="size-3 text-muted-foreground" />
                      <span className="text-[11px] text-muted-foreground">
                        {formatTimestamp(notification.timestamp)}
                      </span>
                    </div>
                  </div>
                  {!notification.read && (
                    <div className="size-2 rounded-full bg-amber-500 shrink-0 mt-1.5" />
                  )}
                </div>
              ))}
            </div>
          </ScrollArea>
        )}
      </SheetContent>
    </Sheet>
  )
}
