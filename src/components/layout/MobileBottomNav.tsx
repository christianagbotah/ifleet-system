'use client'

import * as React from 'react'
import { motion } from 'framer-motion'
import {
  LayoutDashboard,
  Route,
  Bell,
  CreditCard,
  MoreHorizontal,
} from 'lucide-react'
import { Popover, PopoverTrigger, PopoverContent } from '@/components/ui/popover'
import { useAuthStore, canAccessNav } from '@/lib/store/auth'
import { navigationGroups, GROUP_COLORS, type NavGroup, type NavItem } from '@/lib/constants'
import { fetchNotifications } from '@/lib/api'
import { usePushNotifications, type PushNotification } from '@/lib/hooks/usePushNotifications'

interface MobileBottomNavProps {
  currentPage: string
  onNavigate: (page: string) => void
}

// The 4 fixed bottom tabs (the "More" menu handles the rest)
const FIXED_TABS: NavItem[] = [
  { id: 'dashboard', label: 'Dashboard', icon: LayoutDashboard },
  { id: 'trips', label: 'Trips', icon: Route },
  { id: 'payroll', label: 'Payroll', icon: CreditCard },
  { id: 'notifications', label: 'Alerts', icon: Bell },
]

// Collect IDs of items shown as fixed tabs so we can exclude them from "More"
const FIXED_TAB_IDS = new Set(FIXED_TABS.map((t) => t.id))

// Compute "More" items from navigation groups, filtering out fixed tabs and inaccessible items
function getMoreGroups(): NavGroup[] {
  return navigationGroups
    .map((group) => ({
      label: group.label,
      items: group.items.filter(
        (item) => !FIXED_TAB_IDS.has(item.id) && canAccessNav(item.id)
      ),
    }))
    .filter((group) => group.items.length > 0)
}

export function MobileBottomNav({ currentPage, onNavigate }: MobileBottomNavProps) {
  const { user, isAuthenticated } = useAuthStore()
  const [moreOpen, setMoreOpen] = React.useState(false)

  // Self-manage unread notification count
  const [unreadCount, setUnreadCount] = React.useState(0)

  const loadUnreadCount = React.useCallback(async () => {
    // Read token fresh from store at call time to avoid stale closure values
    const { token } = useAuthStore.getState()
    if (!isAuthenticated || !token) return
    try {
      const params: Parameters<typeof fetchNotifications>[0] = { limit: 1 }
      if (user?.id) params.userId = user.id
      params.unreadOnly = true
      const result = await fetchNotifications(params)
      setUnreadCount(result.unreadCount)
    } catch {
      // Silently fail
    }
  }, [user, isAuthenticated])

  // Listen for push notifications to update badge in real-time
  const handlePush = React.useCallback((_push: PushNotification) => {
    setUnreadCount((c) => c + 1)
  }, [])
  usePushNotifications(handlePush)

  React.useEffect(() => {
    if (!isAuthenticated) return
    loadUnreadCount()
    const interval = setInterval(loadUnreadCount, 30000)
    return () => clearInterval(interval)
  }, [loadUnreadCount, isAuthenticated])

  // Filter fixed tabs by user permissions
  const visibleFixedTabs = React.useMemo(
    () => FIXED_TABS.filter((tab) => canAccessNav(tab.id)),
    [user]
  )

  // Get "More" items grouped by their original nav groups
  const moreGroups = React.useMemo(() => getMoreGroups(), [user])

  // Check if any "More" item is currently active (to highlight the More button)
  const isMoreActive = React.useMemo(
    () => moreGroups.some((g) => g.items.some((item) => item.id === currentPage)),
    [moreGroups, currentPage]
  )

  // Close popover on navigation
  const handleNavigate = React.useCallback(
    (page: string) => {
      onNavigate(page)
      setMoreOpen(false)
    },
    [onNavigate]
  )

  return (
    <nav
      className="fixed bottom-0 left-0 right-0 z-50 md:hidden bg-background/95 backdrop-blur-xl supports-[backdrop-filter]:bg-background/80 border-t border-border/50"
      style={{
        paddingBottom: 'env(safe-area-inset-bottom, 0px)',
      }}
    >
      <div className="flex items-center h-[60px] px-0.5">
        {visibleFixedTabs.map((tab) => {
          const isActive = currentPage === tab.id
          const isNotification = tab.id === 'notifications'
          const Icon = tab.icon

          return (
            <button
              key={tab.id}
              onClick={() => handleNavigate(tab.id)}
              className={`
                relative flex flex-col items-center justify-center gap-0.5
                flex-1 min-h-[48px] rounded-xl
                transition-all duration-200 ease-out
                active:scale-[0.92]
                ${isActive ? '' : 'active:bg-muted/50'}
              `}
              aria-label={tab.label}
              aria-current={isActive ? 'page' : undefined}
            >
              {/* Active background pill */}
              {isActive && (
                <motion.div
                  layoutId="mobile-tab-pill"
                  className="absolute inset-x-1 -top-0.5 bottom-1 rounded-xl bg-amber-50 dark:bg-amber-900/15"
                  transition={{ type: 'spring', stiffness: 400, damping: 30 }}
                />
              )}
              <div className="relative z-10 flex flex-col items-center justify-center gap-0.5">
                <div className="relative">
                  <Icon
                    className={`h-[22px] w-[22px] transition-colors duration-200 ${
                      isActive
                        ? 'text-amber-600 dark:text-amber-400'
                        : 'text-muted-foreground/70'
                    }`}
                  />
                  {isNotification && unreadCount > 0 && (
                    <motion.span
                      initial={{ scale: 0 }}
                      animate={{ scale: 1 }}
                      className="absolute -top-1.5 -right-2.5 flex h-[18px] min-w-[18px] items-center justify-center rounded-full bg-red-500 px-1 text-[9px] font-bold text-white shadow-sm"
                    >
                      {unreadCount > 99 ? '99+' : unreadCount}
                    </motion.span>
                  )}
                </div>
                <span
                  className={`text-[10px] font-semibold transition-colors duration-200 leading-none ${
                    isActive
                      ? 'text-amber-600 dark:text-amber-400'
                      : 'text-muted-foreground/60'
                  }`}
                >
                  {tab.label}
                </span>
              </div>
            </button>
          )
        })}

        {/* "More" Tab with Popover */}
        <Popover open={moreOpen} onOpenChange={setMoreOpen}>
          <PopoverTrigger asChild>
            <button
              className={`
                relative flex flex-col items-center justify-center gap-0.5
                flex-1 min-h-[48px] rounded-xl
                transition-all duration-200 ease-out
                active:scale-[0.92]
                ${isMoreActive ? '' : 'active:bg-muted/50'}
              `}
              aria-label="More navigation options"
              aria-current={isMoreActive ? 'page' : undefined}
            >
              {isMoreActive && (
                <motion.div
                  layoutId="mobile-tab-pill"
                  className="absolute inset-x-1 -top-0.5 bottom-1 rounded-xl bg-amber-50 dark:bg-amber-900/15"
                  transition={{ type: 'spring', stiffness: 400, damping: 30 }}
                />
              )}
              <div className="relative z-10 flex flex-col items-center justify-center gap-0.5">
                <MoreHorizontal
                  className={`h-[22px] w-[22px] transition-colors duration-200 ${
                    isMoreActive
                      ? 'text-amber-600 dark:text-amber-400'
                      : 'text-muted-foreground/70'
                  }`}
                />
                <span
                  className={`text-[10px] font-semibold transition-colors duration-200 leading-none ${
                    isMoreActive
                      ? 'text-amber-600 dark:text-amber-400'
                      : 'text-muted-foreground/60'
                  }`}
                >
                  More
                </span>
              </div>
            </button>
          </PopoverTrigger>
          <PopoverContent
            align="end"
            side="top"
            sideOffset={8}
            className="w-72 max-h-[70vh] overflow-y-auto overscroll-contain p-3"
          >
            <div className="space-y-3">
              {moreGroups.map((group) => {
                const groupColor = GROUP_COLORS[group.label]
                return (
                  <div key={group.label}>
                    <p
                      className={`text-[10px] font-bold uppercase tracking-wider mb-1.5 px-2 ${
                        groupColor?.text || 'text-muted-foreground'
                      }`}
                    >
                      {group.label}
                    </p>
                    <div className="space-y-0.5">
                      {group.items.map((item) => {
                        const Icon = item.icon
                        const isActive = currentPage === item.id
                        return (
                          <button
                            key={item.id}
                            onClick={() => handleNavigate(item.id)}
                            className={`
                              w-full flex items-center gap-3 px-3 py-2 rounded-lg text-sm
                              transition-colors duration-150
                              ${
                                isActive
                                  ? 'bg-amber-50 dark:bg-amber-900/15 text-amber-700 dark:text-amber-300 font-medium'
                                  : 'hover:bg-muted/50 text-foreground'
                              }
                            `}
                          >
                            <Icon
                              className={`h-4 w-4 shrink-0 ${
                                isActive
                                  ? 'text-amber-600 dark:text-amber-400'
                                  : groupColor?.icon || 'text-muted-foreground'
                              }`}
                            />
                            <span>{item.label}</span>
                          </button>
                        )
                      })}
                    </div>
                  </div>
                )
              })}
            </div>
          </PopoverContent>
        </Popover>
      </div>
    </nav>
  )
}
