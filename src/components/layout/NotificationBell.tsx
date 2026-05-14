'use client'

import { Bell } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import { useNotificationStore } from '@/lib/notification-store'
import { NotificationsSheet } from '@/components/ui/notifications-sheet'

export function NotificationBell() {
  const { unreadCount, toggleSheet } = useNotificationStore()

  return (
    <>
      <Button
        variant="ghost"
        size="icon"
        className="relative size-9 rounded-lg hover:bg-muted flex items-center justify-center transition-colors"
        aria-label="Notifications"
        onClick={toggleSheet}
        data-tour="notifications"
      >
        <Bell className="size-4 text-muted-foreground" />
        {unreadCount > 0 && (
          <span
            className={cn(
              'absolute -top-0.5 -right-0.5 min-w-[18px] h-[18px] rounded-full text-[10px] font-bold flex items-center justify-center text-white px-1',
              unreadCount > 0 ? 'bg-amber-500' : 'bg-amber-500',
              'animate-pulse'
            )}
          >
            {unreadCount > 99 ? '99+' : unreadCount}
          </span>
        )}
      </Button>
      <NotificationsSheet />
    </>
  )
}
