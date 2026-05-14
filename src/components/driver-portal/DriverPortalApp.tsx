'use client'

import * as React from 'react'
import { useRouter } from 'next/navigation'
import { useCallback } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import {
  Home,
  Route,
  Wallet,
  User,
  Bell,
  Truck,
  LogOut,
} from 'lucide-react'
import { toast } from 'sonner'

import { useAuthStore } from '@/lib/store/auth'
import { apiFetch } from '@/lib/api'
import type { Driver } from '@/lib/api'
import { APP_NAME } from '@/lib/constants'
import { Badge } from '@/components/ui/badge'

// ── Lazy-loaded page components ────────────────────────────────────────────

const DriverPortalDashboard = React.lazy(
  () => import('./DriverPortalDashboard').then((m) => ({ default: m.DriverPortalDashboard }))
)
const DriverPortalTripList = React.lazy(
  () => import('./DriverPortalTripList').then((m) => ({ default: m.DriverPortalTripList }))
)
const DriverPortalWallet = React.lazy(
  () => import('./DriverPortalWallet').then((m) => ({ default: m.DriverPortalWallet }))
)
const DriverPortalProfile = React.lazy(
  () => import('./DriverPortalProfile').then((m) => ({ default: m.DriverPortalProfile }))
)

// ── Types ──────────────────────────────────────────────────────────────────

type DriverPage = 'dashboard' | 'trips' | 'wallet' | 'profile'

interface TabConfig {
  id: DriverPage
  label: string
  icon: React.ElementType
}

// ── Constants ──────────────────────────────────────────────────────────────

const TABS: TabConfig[] = [
  { id: 'dashboard', label: 'Dashboard', icon: Home },
  { id: 'trips', label: 'My Trips', icon: Route },
  { id: 'wallet', label: 'Wallet', icon: Wallet },
  { id: 'profile', label: 'Profile', icon: User },
]

/** Tailwind classes per tab: active (amber) vs inactive (gray) */
const tabActiveClasses = 'text-amber-500'
const tabInactiveClasses = 'text-gray-400'

// ── Page transition variants ───────────────────────────────────────────────

const pageVariants = {
  initial: { opacity: 0, x: 12 },
  animate: { opacity: 1, x: 0 },
  exit: { opacity: 0, x: -12 },
}

const pageTransition = {
  type: 'tween',
  ease: 'easeInOut',
  duration: 0.2,
}

// ── Fallback spinner for lazy-loaded pages ─────────────────────────────────

function PageFallback() {
  return (
    <div className="flex items-center justify-center py-20">
      <div className="h-8 w-8 animate-spin rounded-full border-4 border-amber-500 border-t-transparent" />
    </div>
  )
}

// ── DriverNotificationBadge ────────────────────────────────────────────────

function DriverNotificationBadge() {
  const [unreadCount, setUnreadCount] = React.useState(0)

  React.useEffect(() => {
    let cancelled = false

    async function fetchUnreadCount() {
      try {
        const res = await apiFetch<{ total?: number; unreadCount?: number }>(
          '/api/notifications?unreadOnly=true&limit=1'
        )
        if (!cancelled) {
          // The notifications API returns either `total` (paginated count) or `unreadCount`
          setUnreadCount(res?.unreadCount ?? res?.total ?? 0)
        }
      } catch {
        // Silently ignore — notification count is non-critical
      }
    }

    fetchUnreadCount()

    // Poll every 30 seconds for fresh unread count
    const interval = setInterval(fetchUnreadCount, 30_000)
    return () => {
      cancelled = true
      clearInterval(interval)
    }
  }, [])

  return (
    <button
      type="button"
      className="relative p-2 rounded-full hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors"
      aria-label={`Notifications${unreadCount > 0 ? ` (${unreadCount} unread)` : ''}`}
    >
      <Bell className="h-5 w-5 text-gray-600 dark:text-gray-400" />
      {unreadCount > 0 && (
        <span className="absolute -top-0.5 -right-0.5 flex items-center justify-center min-w-[18px] h-[18px] px-1 rounded-full bg-red-500 text-[10px] font-bold text-white leading-none">
          {unreadCount > 99 ? '99+' : unreadCount}
        </span>
      )}
    </button>
  )
}

// ── Main Component ─────────────────────────────────────────────────────────

export function DriverPortalApp() {
  const router = useRouter()
  const { user, logout } = useAuthStore()
  const driverId = user?.driverId ?? null

  // Current active tab
  const [activePage, setActivePage] = React.useState<DriverPage>('dashboard')

  // Navigation params (e.g. tripId when navigating from dashboard to a specific trip)
  const [navParams, setNavParams] = React.useState<Record<string, string>>({})

  // Driver data (fetched from /api/drivers/{driverId})
  const [driverData, setDriverData] = React.useState<Driver | null>(null)
  const [driverLoading, setDriverLoading] = React.useState(true)

  // Fetch driver details on mount
  React.useEffect(() => {
    if (!driverId) {
      setDriverLoading(false)
      return
    }

    let cancelled = false

    async function loadDriver() {
      setDriverLoading(true)
      try {
        const data = await apiFetch<Driver>(`/api/drivers/${driverId}`)
        if (!cancelled && data) {
          setDriverData(data)
        }
      } catch {
        // Non-critical — UI degrades gracefully
      } finally {
        if (!cancelled) setDriverLoading(false)
      }
    }

    loadDriver()
    return () => {
      cancelled = true
    }
  }, [driverId])

  // Derive display values
  const driverName = user?.name ?? 'Driver'
  const truckPlate =
    driverData?.trucks?.[0]?.plateNumber ?? null

  // ── Navigation handler ──────────────────────────────────────────────

  const handleNavigate = useCallback(
    (page: string, params?: Record<string, string>) => {
      setActivePage(page as DriverPage)
      setNavParams(params ?? {})
    },
    [],
  )

  // ── Logout handler ──────────────────────────────────────────────────

  function handleLogout() {
    logout()
    router.push('/driver')
    toast.success('Signed out successfully')
  }

  // ── Render the active page ─────────────────────────────────────────────

  function renderPage() {
    switch (activePage) {
      case 'dashboard':
        return <DriverPortalDashboard driver={driverData} onNavigate={handleNavigate} />
      case 'trips':
        return (
          <DriverPortalTripList
            driver={driverData}
            onNavigate={handleNavigate}
            tripId={navParams.tripId ?? null}
          />
        )
      case 'wallet':
        return <DriverPortalWallet driver={driverData} />
      case 'profile':
        return <DriverPortalProfile driver={driverData} />
      default:
        return <DriverPortalDashboard driver={driverData} onNavigate={handleNavigate} />
    }
  }

  return (
    <div className="min-h-screen flex flex-col bg-gray-50">
      {/* ── Container (mobile-first, centered on desktop) ──────────────── */}
      <div className="flex flex-col min-h-screen w-full max-w-lg mx-auto bg-white shadow-sm">
        {/* ── Top Header ──────────────────────────────────────────────── */}
        <header className="sticky top-0 z-30 bg-white">
          {/* Main header row */}
          <div className="flex items-center justify-between px-4 h-14">
            {/* Left: Logo + text */}
            <div className="flex items-center gap-2.5">
              <div className="flex items-center justify-center w-8 h-8 rounded-lg bg-amber-500 text-white">
                <Truck className="h-4.5 w-4.5" />
              </div>
              <span className="text-base font-bold text-gray-900 tracking-tight">
                Driver Portal
              </span>
            </div>

            {/* Right: Actions */}
            <div className="flex items-center gap-1">
              <DriverNotificationBadge />
              <button
                type="button"
                onClick={handleLogout}
                className="p-2 rounded-full hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors"
                aria-label="Sign out"
              >
                <LogOut className="h-5 w-5 text-gray-600 dark:text-gray-400" />
              </button>
            </div>
          </div>

          {/* Status bar: driver name + truck plate */}
          <div className="flex items-center gap-2 px-4 pb-3">
            <div className="flex items-center gap-1.5 text-sm text-gray-700 dark:text-gray-300">
              <User className="h-3.5 w-3.5 text-gray-400" />
              <span className="font-medium truncate max-w-[140px]">{driverName}</span>
            </div>

            {driverLoading ? (
              <div className="h-5 w-20 animate-pulse rounded bg-gray-200 dark:bg-gray-700" />
            ) : truckPlate ? (
              <Badge
                variant="secondary"
                className="gap-1 bg-amber-50 text-amber-700 border-amber-200 dark:bg-amber-900/20 dark:text-amber-400 dark:border-amber-800 text-xs font-semibold"
              >
                <Truck className="h-3 w-3" />
                {truckPlate}
              </Badge>
            ) : (
              <span className="text-xs text-gray-400">No truck assigned</span>
            )}
          </div>

          {/* Bottom shadow */}
          <div className="h-px bg-gradient-to-r from-transparent via-gray-200 to-transparent" />
        </header>

        {/* ── Content Area ─────────────────────────────────────────────── */}
        <main className="flex-1 overflow-y-auto">
          <React.Suspense fallback={<PageFallback />}>
            <AnimatePresence mode="wait">
              <motion.div
                key={activePage}
                variants={pageVariants}
                initial="initial"
                animate="animate"
                exit="exit"
                transition={pageTransition}
                className="min-h-full"
              >
                {renderPage()}
              </motion.div>
            </AnimatePresence>
          </React.Suspense>
        </main>

        {/* ── Bottom Navigation Bar ────────────────────────────────────── */}
        <nav className="sticky bottom-0 z-30 bg-white border-t border-gray-200 dark:border-gray-800">
          <div className="flex items-stretch">
            {TABS.map((tab) => {
              const isActive = activePage === tab.id
              const Icon = tab.icon

              return (
                <button
                  key={tab.id}
                  type="button"
                  onClick={() => {
                    setActivePage(tab.id)
                    setNavParams({})
                  }}
                  className={`
                    flex-1 flex flex-col items-center justify-center gap-0.5 py-2.5
                    transition-colors duration-200 min-h-[56px] relative
                    ${isActive ? tabActiveClasses : tabInactiveClasses}
                  `}
                  aria-label={tab.label}
                  aria-current={isActive ? 'page' : undefined}
                >
                  {/* Active indicator line */}
                  {isActive && (
                    <motion.div
                      layoutId="driver-tab-indicator"
                      className="absolute top-0 left-1/2 -translate-x-1/2 w-8 h-0.5 rounded-full bg-amber-500"
                      transition={{ type: 'spring', stiffness: 350, damping: 30 }}
                    />
                  )}
                  <Icon className={`h-5 w-5 ${isActive ? 'stroke-[2.2]' : ''}`} />
                  <span
                    className={`text-[11px] leading-tight font-medium ${
                      isActive ? 'font-semibold' : ''
                    }`}
                  >
                    {tab.label}
                  </span>
                </button>
              )
            })}
          </div>

          {/* Safe area padding for notched phones */}
          <div
            className="bg-white"
            style={{
              paddingBottom: 'env(safe-area-inset-bottom, 0px)',
            }}
          />
        </nav>
      </div>
    </div>
  )
}
