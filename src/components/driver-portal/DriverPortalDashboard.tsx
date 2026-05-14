'use client'

import * as React from 'react'
import {
  Truck,
  Route,
  ArrowRight,
  Package,
  Wallet,
  Navigation,
  Clock,
  MapPin,
  CircleDot,
  ChevronRight,
  RefreshCw,
  CheckCircle2,
  Loader2,
} from 'lucide-react'
import { toast } from 'sonner'

import { apiFetch, type Trip } from '@/lib/api'
import { TRIP_STATUS_META } from '@/lib/trip-lifecycle'
import { useCurrency } from '@/lib/currency-context'
import { Card, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'

// ── Types ──────────────────────────────────────────────────────────────────

interface DriverDashboardProps {
  driver: {
    id: string
    firstName: string
    lastName: string
    employeeId?: string
    phone?: string
    status: string
    totalTrips?: number
    totalMileage?: number
    trucks?: Array<{ id: string; plateNumber: string; make?: string; model?: string }>
  } | null
  onNavigate?: (page: string, params?: Record<string, string>) => void
}

interface DriverWallet {
  id: string
  availableBalance: number
  totalAdvances: number
  totalDeducted: number
  totalSettled: number
}

// ── Helpers ────────────────────────────────────────────────────────────────

function getGreeting(): string {
  const hour = new Date().getHours()
  if (hour < 12) return 'Good morning'
  if (hour < 17) return 'Good afternoon'
  return 'Good evening'
}

function formatNumber(n: number): string {
  return new Intl.NumberFormat('en-US').format(n)
}

function formatDistance(km: number): string {
  if (km >= 1000) return `${(km / 1000).toFixed(1)}k km`
  return `${Math.round(km)} km`
}

function formatRecentDate(dateStr: string): string {
  const date = new Date(dateStr)
  const now = new Date()
  const diffMs = now.getTime() - date.getTime()
  const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24))

  if (diffDays === 0) return 'Today'
  if (diffDays === 1) return 'Yesterday'
  if (diffDays < 7) return `${diffDays}d ago`
  return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
}

function truncate(str: string, maxLen: number): string {
  if (str.length <= maxLen) return str
  return str.slice(0, maxLen) + '…'
}

/** The API returns ordered by departureTime desc — "active" statuses in this lifecycle */
const ACTIVE_STATUSES = new Set([
  'scheduled',
  'loading',
  'loaded',
  'waiting_at_depot',
  'departed_depot',
  'in_transit',
  'arrived_destination',
  'waiting_to_offload',
  'offloading',
  'offloaded',
  'return_journey',
  'arrived_depot',
])

// ── Sub-components ─────────────────────────────────────────────────────────

// ── Welcome Card ───────────────────────────────────────────────────────────

function WelcomeCard({
  firstName,
  truckPlate,
}: {
  firstName: string
  truckPlate: string | null
}) {
  return (
    <div className="rounded-xl bg-gradient-to-br from-amber-500 via-amber-500 to-orange-500 p-5 text-white shadow-lg shadow-amber-500/20">
      <div className="flex items-start justify-between">
        <div className="flex-1 min-w-0">
          <p className="text-amber-100 text-sm font-medium">
            {getGreeting()},
          </p>
          <h1 className="text-xl font-bold mt-0.5 truncate">
            {firstName}!
          </h1>
        </div>
        <div className="flex items-center justify-center w-11 h-11 rounded-xl bg-white/15 backdrop-blur-sm shrink-0 ml-3">
          <Truck className="h-5.5 w-5.5" />
        </div>
      </div>

      <div className="mt-4 flex items-center gap-2 bg-white/15 rounded-lg px-3 py-2 backdrop-blur-sm">
        {truckPlate ? (
          <>
            <div className="flex items-center justify-center w-7 h-7 rounded-md bg-white/20">
              <Truck className="h-3.5 w-3.5" />
            </div>
            <div className="min-w-0 flex-1">
              <p className="text-xs text-amber-100 leading-tight">Assigned Truck</p>
              <p className="text-sm font-semibold truncate">{truckPlate}</p>
            </div>
          </>
        ) : (
          <>
            <div className="flex items-center justify-center w-7 h-7 rounded-md bg-white/20">
              <Truck className="h-3.5 w-3.5 opacity-60" />
            </div>
            <div className="min-w-0 flex-1">
              <p className="text-xs text-amber-100 leading-tight">Assigned Truck</p>
              <p className="text-sm font-medium text-amber-100">No truck assigned</p>
            </div>
          </>
        )}
      </div>
    </div>
  )
}

// ── Active Trip Card Loading Skeleton ──────────────────────────────────────

function ActiveTripSkeleton() {
  return (
    <Card className="rounded-xl border-amber-200/60 overflow-hidden">
      <CardContent className="p-4 space-y-3">
        <div className="flex items-center justify-between">
          <Skeleton className="h-5 w-28" />
          <Skeleton className="h-5 w-20 rounded-full" />
        </div>
        <Skeleton className="h-10 w-full" />
        <div className="flex gap-4">
          <Skeleton className="h-4 w-24" />
          <Skeleton className="h-4 w-32" />
        </div>
        <Skeleton className="h-4 w-20" />
        <div className="flex gap-2 pt-1">
          <Skeleton className="h-9 flex-1" />
          <Skeleton className="h-9 flex-1" />
        </div>
      </CardContent>
    </Card>
  )
}

// ── Active Trip Card Empty State ───────────────────────────────────────────

function ActiveTripEmptyState({ onNavigate }: { onNavigate?: (page: string) => void }) {
  return (
    <Card className="rounded-xl overflow-hidden">
      <CardContent className="p-6">
        <div className="flex flex-col items-center text-center py-4">
          {/* Truck illustration */}
          <div className="relative mb-4">
            <div className="w-20 h-20 rounded-2xl bg-amber-50 flex items-center justify-center">
              <div className="relative">
                <Truck className="h-10 w-10 text-amber-400" />
                <div className="absolute -bottom-1 -right-1 flex items-center justify-center w-5 h-5 rounded-full bg-emerald-500 ring-2 ring-white">
                  <CheckCircle2 className="h-3 w-3 text-white" />
                </div>
              </div>
            </div>
          </div>

          <h3 className="text-base font-semibold text-gray-900">No Active Trip</h3>
          <p className="text-sm text-gray-500 mt-1 max-w-[240px]">
            You&apos;re all caught up! No active trips right now. Check back later or view your trip history.
          </p>

          {onNavigate && (
            <Button
              variant="outline"
              size="sm"
              className="mt-4 gap-1.5"
              onClick={() => onNavigate('trips')}
            >
              <Route className="h-3.5 w-3.5" />
              View Trip History
            </Button>
          )}
        </div>
      </CardContent>
    </Card>
  )
}

// ── Active Trip Card ───────────────────────────────────────────────────────

function ActiveTripCard({
  trip,
  onNavigate,
}: {
  trip: Trip
  onNavigate?: (page: string, params?: Record<string, string>) => void
}) {
  const [advancing, setAdvancing] = React.useState(false)
  const { formatCurrency } = useCurrency()

  const statusMeta = TRIP_STATUS_META[trip.status]

  async function handleAdvanceStatus() {
    if (advancing) return
    setAdvancing(true)

    try {
      const updated = await apiFetch<Trip>(`/api/trips/${trip.id}/advance-status`, {
        method: 'POST',
        body: JSON.stringify({}),
      })
      if (updated) {
        const newMeta = TRIP_STATUS_META[updated.status]
        toast.success(`Status updated to "${newMeta?.label ?? updated.status}"`)
        // Force a page refresh to pick up new data
        window.location.reload()
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to update status')
    } finally {
      setAdvancing(false)
    }
  }

  return (
    <Card className="rounded-xl border-amber-200/60 overflow-hidden">
      {/* Amber top accent bar */}
      <div className="h-1 bg-gradient-to-r from-amber-400 to-orange-400" />

      <CardContent className="p-4 space-y-3">
        {/* Header: Trip number + Status */}
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0">
            <p className="text-xs text-gray-500 font-medium uppercase tracking-wide">
              Active Trip
            </p>
            <h3 className="text-base font-bold text-gray-900 truncate mt-0.5">
              {trip.tripNumber}
            </h3>
          </div>
          <Badge
            className={statusMeta?.color ?? 'bg-gray-100 text-gray-600 shrink-0'}
          >
            {statusMeta?.icon && <span className="mr-0.5">{statusMeta.icon}</span>}
            {statusMeta?.label ?? trip.status}
          </Badge>
        </div>

        {/* Route */}
        <div className="flex items-center gap-2 bg-gray-50 rounded-lg px-3 py-2.5">
          <MapPin className="h-4 w-4 text-amber-500 shrink-0" />
          <div className="flex-1 min-w-0 flex items-center gap-1.5">
            <span className="text-sm font-medium text-gray-900 truncate">
              {truncate(trip.loadingLocation, 18)}
            </span>
            <ArrowRight className="h-3.5 w-3.5 text-gray-400 shrink-0" />
            <span className="text-sm font-medium text-gray-900 truncate">
              {truncate(trip.destination, 18)}
            </span>
          </div>
        </div>

        {/* Cargo + Revenue */}
        <div className="flex items-center gap-4 text-sm">
          <div className="flex items-center gap-1.5 text-gray-600">
            <Package className="h-3.5 w-3.5 text-gray-400" />
            <span className="truncate">
              {trip.itemName} &times; {trip.quantity} {trip.unit}
            </span>
          </div>
          {trip.totalRevenue != null && trip.totalRevenue > 0 && (
            <div className="flex items-center gap-1 text-emerald-600 font-semibold ml-auto">
              <Wallet className="h-3.5 w-3.5" />
              <span>{formatCurrency(trip.totalRevenue)}</span>
            </div>
          )}
        </div>

        {/* Actions */}
        <div className="flex gap-2 pt-1">
          <Button
            variant="outline"
            size="sm"
            className="flex-1 gap-1.5 text-xs"
            onClick={() => onNavigate?.('trips', { tripId: trip.id })}
          >
            View Details
            <ChevronRight className="h-3 w-3" />
          </Button>
          <Button
            size="sm"
            className="flex-1 gap-1.5 text-xs bg-amber-500 hover:bg-amber-600 text-white"
            disabled={advancing}
            onClick={handleAdvanceStatus}
          >
            {advancing ? (
              <Loader2 className="h-3 w-3 animate-spin" />
            ) : (
              <RefreshCw className="h-3 w-3" />
            )}
            {advancing ? 'Updating...' : 'Update Status'}
          </Button>
        </div>
      </CardContent>
    </Card>
  )
}

// ── Quick Stats Grid Skeleton ──────────────────────────────────────────────

function QuickStatsSkeleton() {
  return (
    <div className="grid grid-cols-2 gap-3">
      {[0, 1, 2, 3].map((i) => (
        <Card key={i} className="rounded-xl">
          <CardContent className="p-4 space-y-2">
            <Skeleton className="h-8 w-8 rounded-lg" />
            <Skeleton className="h-5 w-16" />
            <Skeleton className="h-3 w-20" />
          </CardContent>
        </Card>
      ))}
    </div>
  )
}

// ── Quick Stats Grid ───────────────────────────────────────────────────────

function QuickStatsGrid({
  totalTrips,
  monthlyTrips,
  totalDistance,
  walletBalance,
  formatCurrency,
}: {
  totalTrips: number
  monthlyTrips: number
  totalDistance: number
  walletBalance: number | null
  formatCurrency: (amount: number) => string
}) {
  const stats = [
    {
      label: 'Total Trips',
      value: formatNumber(totalTrips),
      icon: Route,
      iconBg: 'bg-sky-50 text-sky-600',
    },
    {
      label: 'This Month',
      value: formatNumber(monthlyTrips),
      sublabel: 'trips',
      icon: CalendarIcon,
      iconBg: 'bg-emerald-50 text-emerald-600',
    },
    {
      label: 'Total Distance',
      value: formatDistance(totalDistance),
      icon: Navigation,
      iconBg: 'bg-violet-50 text-violet-600',
    },
    {
      label: 'Wallet Balance',
      value: walletBalance != null ? formatCurrency(walletBalance) : '—',
      icon: Wallet,
      iconBg: 'bg-amber-50 text-amber-600',
    },
  ]

  return (
    <div className="grid grid-cols-2 gap-3">
      {stats.map((stat) => {
        const Icon = stat.icon
        return (
          <Card key={stat.label} className="rounded-xl">
            <CardContent className="p-4">
              <div className={`flex items-center justify-center w-8 h-8 rounded-lg mb-2 ${stat.iconBg}`}>
                <Icon className="h-4 w-4" />
              </div>
              <p className="text-lg font-bold text-gray-900 leading-tight">{stat.value}</p>
              <p className="text-xs text-gray-500 mt-0.5">{stat.label}</p>
            </CardContent>
          </Card>
        )
      })}
    </div>
  )
}

// ── Calendar icon helper (simple SVG to avoid importing new icon set) ──────

function CalendarIcon({ className }: { className?: string }) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      width="24"
      height="24"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
    >
      <path d="M8 2v4" />
      <path d="M16 2v4" />
      <rect width="18" height="18" x="3" y="4" rx="2" />
      <path d="M3 10h18" />
      <path d="M8 14h.01" />
      <path d="M12 14h.01" />
      <path d="M16 14h.01" />
      <path d="M8 18h.01" />
      <path d="M12 18h.01" />
      <path d="M16 18h.01" />
    </svg>
  )
}

// ── Recent Activity Skeleton ───────────────────────────────────────────────

function RecentActivitySkeleton() {
  return (
    <Card className="rounded-xl">
      <CardContent className="p-4 space-y-3">
        <div className="flex items-center justify-between">
          <Skeleton className="h-5 w-32" />
          <Skeleton className="h-4 w-16" />
        </div>
        {[0, 1, 2].map((i) => (
          <div key={i} className="flex items-center gap-3 py-2">
            <Skeleton className="h-9 w-9 rounded-lg shrink-0" />
            <div className="flex-1 min-w-0 space-y-1.5">
              <Skeleton className="h-4 w-28" />
              <Skeleton className="h-3 w-48" />
            </div>
            <Skeleton className="h-5 w-16 rounded-full shrink-0" />
          </div>
        ))}
      </CardContent>
    </Card>
  )
}

// ── Recent Trip Item ───────────────────────────────────────────────────────

function RecentTripItem({ trip }: { trip: Trip }) {
  const statusMeta = TRIP_STATUS_META[trip.status]

  return (
    <div className="flex items-center gap-3 py-2.5 group">
      {/* Trip icon */}
      <div className="flex items-center justify-center w-9 h-9 rounded-lg bg-gray-50 shrink-0">
        <CircleDot className="h-4 w-4 text-gray-400" />
      </div>

      {/* Trip info */}
      <div className="flex-1 min-w-0">
        <p className="text-sm font-semibold text-gray-900 truncate">
          {trip.tripNumber}
        </p>
        <div className="flex items-center gap-1 mt-0.5 text-xs text-gray-500 truncate">
          <span className="truncate">{truncate(trip.loadingLocation, 12)}</span>
          <ArrowRight className="h-2.5 w-2.5 shrink-0 text-gray-300" />
          <span className="truncate">{truncate(trip.destination, 12)}</span>
        </div>
      </div>

      {/* Status + Date */}
      <div className="flex flex-col items-end gap-0.5 shrink-0">
        <Badge
          className={`text-[10px] px-1.5 py-0 h-5 ${statusMeta?.color ?? 'bg-gray-100 text-gray-600'}`}
        >
          {statusMeta?.label ?? trip.status}
        </Badge>
        <span className="text-[11px] text-gray-400">
          {formatRecentDate(trip.departureTime)}
        </span>
      </div>
    </div>
  )
}

// ── Recent Activity Card ───────────────────────────────────────────────────

function RecentActivityCard({
  trips,
  onNavigate,
}: {
  trips: Trip[]
  onNavigate?: (page: string) => void
}) {
  return (
    <Card className="rounded-xl">
      <CardContent className="p-4">
        {/* Header */}
        <div className="flex items-center justify-between mb-2">
          <h3 className="text-sm font-semibold text-gray-900">Recent Activity</h3>
          {onNavigate && (
            <button
              type="button"
              className="flex items-center gap-0.5 text-xs font-medium text-amber-600 hover:text-amber-700 transition-colors"
              onClick={() => onNavigate('trips')}
            >
              View All
              <ChevronRight className="h-3 w-3" />
            </button>
          )}
        </div>

        {/* Trip list */}
        {trips.length === 0 ? (
          <div className="flex flex-col items-center text-center py-6">
            <Clock className="h-8 w-8 text-gray-300 mb-2" />
            <p className="text-sm text-gray-500">No trips yet</p>
          </div>
        ) : (
          <div className="divide-y divide-gray-100">
            {trips.map((trip) => (
              <RecentTripItem key={trip.id} trip={trip} />
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  )
}

// ── Main Component ─────────────────────────────────────────────────────────

export function DriverPortalDashboard({ driver, onNavigate }: DriverDashboardProps) {
  const { formatCurrency } = useCurrency()

  // ── Data fetching state ────────────────────────────────────────────────

  const [activeTrip, setActiveTrip] = React.useState<Trip | null>(null)
  const [recentTrips, setRecentTrips] = React.useState<Trip[]>([])
  const [allTrips, setAllTrips] = React.useState<Trip[]>([])
  const [walletBalance, setWalletBalance] = React.useState<number | null>(null)

  const [loadingActive, setLoadingActive] = React.useState(true)
  const [loadingStats, setLoadingStats] = React.useState(true)
  const [loadingRecent, setLoadingRecent] = React.useState(true)

  const driverId = driver?.id

  // ── Fetch active trip ─────────────────────────────────────────────────

  React.useEffect(() => {
    if (!driverId) {
      setLoadingActive(false)
      return
    }

    let cancelled = false

    async function fetchActive() {
      setLoadingActive(true)
      try {
        // Fetch all driver trips to find active ones (API doesn't support multi-status filter)
        const res = await apiFetch<{ data: Trip[] }>(
          `/api/trips?driverId=${driverId}&limit=100`
        )
        if (!cancelled && res?.data) {
          const active = res.data.find((t) => ACTIVE_STATUSES.has(t.status)) ?? null
          setActiveTrip(active)

          // Also store all trips for stats computation
          setAllTrips(res.data)
        }
      } catch {
        // Non-critical — degrade gracefully
      } finally {
        if (!cancelled) {
          setLoadingActive(false)
          setLoadingStats(false)
        }
      }
    }

    fetchActive()
    return () => { cancelled = true }
  }, [driverId])

  // ── Fetch recent trips ────────────────────────────────────────────────

  React.useEffect(() => {
    if (!driverId) {
      setLoadingRecent(false)
      return
    }

    let cancelled = false

    async function fetchRecent() {
      setLoadingRecent(true)
      try {
        const res = await apiFetch<{ data: Trip[] }>(
          `/api/trips?driverId=${driverId}&limit=5`
        )
        if (!cancelled && res?.data) {
          setRecentTrips(res.data)
        }
      } catch {
        // Non-critical
      } finally {
        if (!cancelled) setLoadingRecent(false)
      }
    }

    fetchRecent()
    return () => { cancelled = true }
  }, [driverId])

  // ── Fetch wallet balance ──────────────────────────────────────────────

  React.useEffect(() => {
    if (!driverId) return

    let cancelled = false

    async function fetchWallet() {
      try {
        const res = await apiFetch<{ data: DriverWallet[] }>(
          `/api/driver-wallets?driverId=${driverId}&limit=1`
        )
        if (!cancelled && res?.data?.[0]) {
          setWalletBalance(res.data[0].availableBalance)
        }
      } catch {
        // Wallet is non-critical
      }
    }

    fetchWallet()
    return () => { cancelled = true }
  }, [driverId])

  // ── Derived values ────────────────────────────────────────────────────

  const truckPlate = driver?.trucks?.[0]?.plateNumber ?? null
  const firstName = driver?.firstName ?? 'Driver'

  // Monthly trips count — filter all trips by current month/year
  const now = new Date()
  const currentMonth = now.getMonth()
  const currentYear = now.getFullYear()
  const monthlyTrips = allTrips.filter((t) => {
    const d = new Date(t.departureTime)
    return d.getMonth() === currentMonth && d.getFullYear() === currentYear
  }).length

  const totalTrips = driver?.totalTrips ?? allTrips.length
  const totalDistance = driver?.totalMileage ?? 0

  // ── Loading state: no driver yet ──────────────────────────────────────

  if (!driver) {
    return (
      <div className="p-4 space-y-4">
        <Skeleton className="h-40 w-full rounded-xl" />
        <ActiveTripSkeleton />
        <QuickStatsSkeleton />
        <RecentActivitySkeleton />
      </div>
    )
  }

  // ── Render ────────────────────────────────────────────────────────────

  return (
    <div className="p-4 space-y-4 pb-6">
      {/* ── Section 1: Welcome Card ─────────────────────────────────────── */}
      <WelcomeCard firstName={firstName} truckPlate={truckPlate} />

      {/* ── Section 2: Active Trip Card ─────────────────────────────────── */}
      {loadingActive ? (
        <ActiveTripSkeleton />
      ) : activeTrip ? (
        <ActiveTripCard trip={activeTrip} onNavigate={onNavigate} />
      ) : (
        <ActiveTripEmptyState onNavigate={onNavigate} />
      )}

      {/* ── Section 3: Quick Stats Grid ─────────────────────────────────── */}
      {loadingStats ? (
        <QuickStatsSkeleton />
      ) : (
        <QuickStatsGrid
          totalTrips={totalTrips}
          monthlyTrips={monthlyTrips}
          totalDistance={totalDistance}
          walletBalance={walletBalance}
          formatCurrency={formatCurrency}
        />
      )}

      {/* ── Section 4: Recent Activity ──────────────────────────────────── */}
      {loadingRecent ? (
        <RecentActivitySkeleton />
      ) : (
        <RecentActivityCard trips={recentTrips} onNavigate={onNavigate} />
      )}
    </div>
  )
}
