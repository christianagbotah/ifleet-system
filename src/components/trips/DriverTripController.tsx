'use client'

import * as React from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import {
  Package, MapPin, Truck, Clock, Fuel, ChevronRight,
  Plus, X, Loader2, Route, CheckCircle2, Circle,
  ArrowRightLeft, AlertCircle, TrendingDown, Receipt,
  Phone, CalendarDays, Weight, DollarSign, PlayCircle,
  PauseCircle, RotateCcw, Navigation, Send, Wallet,
  CircleDollarSign, Info, ArrowDownUp, Activity,
  BarChart3, Users, Filter, RefreshCw, Eye,
  ArrowRight, Timer, MapPinned, TrendingUp,
  PackageCheck, TruckIcon, Radio, Shield, Hourglass,
  Ban, ClipboardList, Undo2, Warehouse,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
} from '@/components/ui/sheet'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Progress } from '@/components/ui/progress'
import { Input } from '@/components/ui/input'
import { Separator } from '@/components/ui/separator'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { ScrollArea } from '@/components/ui/scroll-area'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Skeleton } from '@/components/ui/skeleton'
import { EmptyState } from '@/components/ui/empty-state'
import { CURRENCY_SYMBOL, APP_NAME, APP_TAGLINE } from '@/lib/constants'
import { useDriverTruck } from '@/hooks/useDriverTruck'
import { useAuthStore } from '@/lib/store/auth'
import {
  TRIP_STATUS_META,
  TRIP_PHASES,
  ALL_TRIP_STATUSES,
  TRIP_EXPENSE_CATEGORIES,
  getNextStatus,
  getTripProgress,
  getExpenseCategoryMeta,
  isTerminalStatus,
  isWaitingStatus,
  getAdvanceAction,
  getWaitingReason,
  isAtDestination,
  getTripPhase,
  getStatusTimeline,
  getStatusColor,
} from '@/lib/trip-lifecycle'
import { apiFetch, fetchTrips, type Trip, type DeliveryStop, fetchTripEvents, type TripEvent } from '@/lib/api'
import { usePushNotifications, type PushNotification } from '@/lib/hooks/usePushNotifications'
import { toast } from 'sonner'

// ════════════════════════════════════════════════════════════════════
// MAIN COMPONENT — dual mode: fleet dashboard (admin/manager) or driver view
// ════════════════════════════════════════════════════════════════════

export function DriverTripController() {
  const isDriver = useAuthStore((s) => s.user?.role === 'Driver')

  if (isDriver) {
    return <DriverView />
  }
  return <FleetActiveTripsDashboard />
}

// ════════════════════════════════════════════════════════════════════
// FLEET ACTIVE TRIPS DASHBOARD (Admin/Manager)
// ════════════════════════════════════════════════════════════════════

function FleetActiveTripsDashboard() {
  const [allTrips, setAllTrips] = React.useState<Trip[]>([])
  const [loading, setLoading] = React.useState(true)
  const [statusFilter, setStatusFilter] = React.useState<string>('all')
  const [phaseFilter, setPhaseFilter] = React.useState<string>('all')
  const [searchQuery, setSearchQuery] = React.useState('')
  const [advancingId, setAdvancingId] = React.useState<string | null>(null)
  const [selectedTrip, setSelectedTrip] = React.useState<Trip | null>(null)
  const [autoRefresh, setAutoRefresh] = React.useState(true)
  const [lastRefreshed, setLastRefreshed] = React.useState<Date | null>(null)
  const [refreshing, setRefreshing] = React.useState(false)
  const initialLoadDone = React.useRef(false)
  const lastFetchTimestamp = React.useRef(0)
  const canSeeFinancialData = useAuthStore((s) => s.canSeeFinancialData())

  const loadAllActiveTrips = React.useCallback(async (isManual = false) => {
    // Only show loading skeleton on the very first load — silent refresh afterwards
    if (!initialLoadDone.current) {
      setLoading(true)
    }
    if (isManual) setRefreshing(true)
    try {
      // Include lastFetchTimestamp in the request for absolute cache-busting
      const ts = Date.now()
      lastFetchTimestamp.current = ts
      const result = await apiFetch<{ data: Trip[]; total: number }>(`/api/trips?limit=100&_ts=${ts}`)
      const nonTerminal = result.data.filter((t) => !isTerminalStatus(t.status))
      nonTerminal.sort((a, b) => new Date(b.departureTime).getTime() - new Date(a.departureTime).getTime())
      setAllTrips(nonTerminal)
      setLastRefreshed(new Date())
      console.log('[Fleet] Refreshed trips at', new Date().toISOString(), '- got', nonTerminal.length, 'active trips')

      // If a trip is selected and still active, update it with fresh data
      setSelectedTrip((prev) => {
        if (!prev) return null
        const updated = nonTerminal.find((t) => t.id === prev.id)
        // If trip became terminal (completed/cancelled), close the dialog
        if (!updated) return null
        return updated
      })
    } catch (err) {
      console.error('Failed to load fleet trips:', err)
      toast.error('Failed to load active trips')
    } finally {
      initialLoadDone.current = true
      setLoading(false)
      setRefreshing(false)
    }
  }, [])

  React.useEffect(() => {
    loadAllActiveTrips()
  }, [loadAllActiveTrips])

  // Auto-refresh every 15s for more responsive updates
  React.useEffect(() => {
    if (!autoRefresh) return
    const interval = setInterval(() => loadAllActiveTrips(false), 15000)
    return () => clearInterval(interval)
  }, [autoRefresh, loadAllActiveTrips])

  // Listen for real-time push notifications to auto-refresh on trip changes
  const handlePushNotification = React.useCallback((_notification: PushNotification) => {
    loadAllActiveTrips(false)
  }, [loadAllActiveTrips])
  usePushNotifications(handlePushNotification)

  const handleAdvanceStatus = React.useCallback(async (tripId: string) => {
    setAdvancingId(tripId)
    try {
      const updated = await apiFetch<Trip>(`/api/trips/${tripId}/advance-status`, {
        method: 'POST',
        body: JSON.stringify({}),
      })
      toast.success('Status updated', {
        description: `Trip is now ${TRIP_STATUS_META[updated.status]?.label || updated.status}`,
      })
      // Keep sheet open with updated data if trip is still active
      if (isTerminalStatus(updated.status)) {
        setSelectedTrip(null)
      }
      loadAllActiveTrips()
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to advance status')
    } finally {
      setAdvancingId(null)
    }
  }, [loadAllActiveTrips])

  // Filtered trips
  const filteredTrips = React.useMemo(() => {
    let trips = allTrips
    if (statusFilter !== 'all') {
      trips = trips.filter((t) => t.status === statusFilter)
    }
    if (phaseFilter !== 'all') {
      const phase = TRIP_PHASES[phaseFilter as keyof typeof TRIP_PHASES]
      if (phase) {
        trips = trips.filter((t) => phase.statuses.includes(t.status as (typeof phase.statuses)[number]))
      }
    }
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase()
      trips = trips.filter((t) =>
        t.tripNumber.toLowerCase().includes(q) ||
        t.loadingLocation.toLowerCase().includes(q) ||
        t.destination.toLowerCase().includes(q) ||
        t.itemName.toLowerCase().includes(q) ||
        `${t.driver.firstName} ${t.driver.lastName}`.toLowerCase().includes(q) ||
        t.truck.plateNumber.toLowerCase().includes(q)
      )
    }
    return trips
  }, [allTrips, statusFilter, phaseFilter, searchQuery])

  // Stats by phase
  const stats = React.useMemo(() => {
    const countByPhase: Record<string, number> = {}
    const revenue = allTrips.reduce((s, t) => s + (t.totalRevenue || 0), 0)
    const waitingCount = allTrips.filter((t) => isWaitingStatus(t.status)).length
    let offloadingCount = 0
    let totalOffloadedQty = 0

    allTrips.forEach((t) => {
      if (t.status === 'offloading') offloadingCount++
      totalOffloadedQty += t.totalOffloaded || 0
      const phase = getTripPhase(t.status)
      countByPhase[phase] = (countByPhase[phase] || 0) + 1
    })

    return {
      total: allTrips.length,
      revenue,
      waiting: waitingCount,
      offloading: offloadingCount,
      preDeparture: countByPhase['pre_departure'] || 0,
      transit: countByPhase['transit'] || 0,
      delivery: countByPhase['delivery'] || 0,
      return: countByPhase['return'] || 0,
    }
  }, [allTrips])

  // Status distribution
  const statusDistribution = React.useMemo(() => {
    const dist: Record<string, number> = {}
    allTrips.forEach((t) => {
      dist[t.status] = (dist[t.status] || 0) + 1
    })
    return dist
  }, [allTrips])

  if (loading) {
    return <FleetLoadingSkeleton />
  }

  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.35 }}
      className="space-y-6"
    >
      {/* ── Page Header ── */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <div className="flex items-center gap-3">
            <div className="h-10 w-10 rounded-xl bg-gradient-to-br from-amber-500 to-amber-600 flex items-center justify-center shadow-sm">
              <Activity className="h-5 w-5 text-white" />
            </div>
            <div>
              <h1 className="text-2xl font-bold tracking-tight">Active Trips</h1>
              <p className="text-sm text-muted-foreground">
                Real-time fleet operations &middot; {stats.total} trip{stats.total !== 1 ? 's' : ''} in progress
              </p>
            </div>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {lastRefreshed && (
            <span className="hidden sm:inline-flex text-[11px] text-muted-foreground items-center gap-1">
              <Clock className="h-3 w-3" />
              {lastRefreshed.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })}
            </span>
          )}
          <Button
            variant="outline"
            size="sm"
            className="h-9 gap-1.5 text-xs"
            onClick={() => setAutoRefresh(!autoRefresh)}
          >
            <RefreshCw className={`h-3.5 w-3.5 ${autoRefresh ? 'animate-spin' : ''} ${autoRefresh ? 'text-emerald-600' : ''}`} />
            {autoRefresh ? 'Live' : 'Paused'}
          </Button>
          <Button
            variant="outline"
            size="sm"
            className="h-9 gap-1.5 text-xs"
            disabled={refreshing}
            onClick={() => loadAllActiveTrips(true)}
          >
            <RefreshCw className={`h-3.5 w-3.5 ${refreshing ? 'animate-spin' : ''}`} />
            {refreshing ? 'Refreshing...' : 'Refresh'}
          </Button>
        </div>
      </div>

      {/* ── KPI Stats ── */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <KPICard
          icon={TruckIcon}
          label="Total Active"
          value={String(stats.total)}
          subtext="All non-terminal trips"
          iconBg="bg-amber-100 dark:bg-amber-900/30"
          iconColor="text-amber-600 dark:text-amber-400"
        />
        <KPICard
          icon={Radio}
          label="In Transit"
          value={String(stats.transit)}
          subtext="Currently on the road"
          iconBg="bg-emerald-100 dark:bg-emerald-900/30"
          iconColor="text-emerald-600 dark:text-emerald-400"
        />
        <KPICard
          icon={PackageCheck}
          label="At Delivery"
          value={String(stats.delivery)}
          subtext={stats.offloading > 0 ? `${stats.offloading} offloading now` : 'Arrived & offloading'}
          iconBg="bg-violet-100 dark:bg-violet-900/30"
          iconColor="text-violet-600 dark:text-violet-400"
        />
        {canSeeFinancialData && (
        <KPICard
          icon={TrendingUp}
          label="Revenue Pipeline"
          value={`${CURRENCY_SYMBOL}${stats.revenue.toLocaleString()}`}
          subtext="Expected from active trips"
          iconBg="bg-rose-100 dark:bg-rose-900/30"
          iconColor="text-rose-600 dark:text-rose-400"
        />
        )}
      </div>

      {/* ── Phase-Grouped Pipeline Bar ── */}
      {allTrips.length > 0 && (
        <Card className="overflow-hidden">
          <CardContent className="p-4">
            <div className="flex items-center justify-between mb-3">
              <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                Trip Pipeline by Phase
              </span>
              <span className="text-[11px] text-muted-foreground">{stats.total} trips across {Object.keys(statusDistribution).length} stages</span>
            </div>
            {/* Phase segments */}
            <div className="flex h-3 rounded-full overflow-hidden bg-muted/50 gap-0.5">
              {Object.entries(TRIP_PHASES).map(([key, phase]) => {
                const count = allTrips.filter((t) => phase.statuses.includes(t.status as (typeof phase.statuses)[number])).length
                if (count === 0) return null
                const pct = (count / stats.total) * 100
                return (
                  <motion.div
                    key={key}
                    className="h-full rounded-full cursor-pointer hover:opacity-80 transition-opacity relative"
                    style={{ width: `${pct}%`, backgroundColor: phase.color }}
                    initial={{ width: 0 }}
                    animate={{ width: `${pct}%` }}
                    transition={{ duration: 0.8, ease: 'easeOut' }}
                    onClick={() => setPhaseFilter(phaseFilter === key ? 'all' : key)}
                    title={`${phase.label}: ${count} trip${count !== 1 ? 's' : ''}`}
                  >
                    {pct > 10 && (
                      <span className="absolute inset-0 flex items-center justify-center text-[9px] font-bold text-white">
                        {count}
                      </span>
                    )}
                  </motion.div>
                )
              })}
            </div>
            {/* Legend: phases */}
            <div className="flex flex-wrap gap-4 mt-3">
              {Object.entries(TRIP_PHASES).map(([key, phase]) => {
                const count = allTrips.filter((t) => phase.statuses.includes(t.status as (typeof phase.statuses)[number])).length
                return (
                  <button
                    key={key}
                    className={`flex items-center gap-1.5 text-[11px] font-medium transition-colors ${
                      phaseFilter === key ? 'text-foreground' : 'text-muted-foreground hover:text-foreground'
                    }`}
                    onClick={() => setPhaseFilter(phaseFilter === key ? 'all' : key)}
                  >
                    <span className="h-2.5 w-2.5 rounded-full shrink-0" style={{ backgroundColor: phase.color }} />
                    {phase.label} ({count})
                  </button>
                )
              })}
            </div>
            {/* Status legend for active stages */}
            <div className="flex flex-wrap gap-x-4 gap-y-1.5 mt-2 pt-2 border-t">
              {Object.entries(statusDistribution).map(([stage, count]) => (
                <button
                  key={stage}
                  className={`flex items-center gap-1.5 text-[10px] font-medium transition-colors ${
                    statusFilter === stage ? 'text-foreground' : 'text-muted-foreground hover:text-foreground'
                  }`}
                  onClick={() => setStatusFilter(statusFilter === stage ? 'all' : stage)}
                >
                  <span className="h-2 w-2 rounded-full shrink-0" style={{ backgroundColor: getStatusColor(stage) }} />
                  {TRIP_STATUS_META[stage]?.icon} {TRIP_STATUS_META[stage]?.label} ({count})
                </button>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* ── Search & Filter Bar ── */}
      <div className="flex flex-col sm:flex-row gap-3">
        <div className="relative flex-1">
          <svg className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" /></svg>
          <Input
            placeholder="Search by trip number, driver, truck, route, cargo..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="pl-10 h-10"
          />
        </div>
        <Select value={phaseFilter} onValueChange={(v) => { setPhaseFilter(v); setStatusFilter('all') }}>
          <SelectTrigger className="h-10 w-full sm:w-44">
            <Filter className="h-4 w-4 mr-2 text-muted-foreground" />
            <SelectValue placeholder="Filter by phase" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Phases</SelectItem>
            {Object.entries(TRIP_PHASES).map(([key, phase]) => (
              <SelectItem key={key} value={key}>
                {phase.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select value={statusFilter} onValueChange={(v) => { setStatusFilter(v); setPhaseFilter('all') }}>
          <SelectTrigger className="h-10 w-full sm:w-48">
            <SelectValue placeholder="Filter by status" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Statuses</SelectItem>
            {ALL_TRIP_STATUSES.map((s) => (
              <SelectItem key={s} value={s}>
                {TRIP_STATUS_META[s]?.icon} {TRIP_STATUS_META[s]?.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {/* ── Trip Cards ── */}
      {filteredTrips.length === 0 ? (
        <Card className="border-dashed">
          <CardContent className="py-16">
            <div className="flex flex-col items-center gap-3 text-center">
              <div className="h-14 w-14 rounded-2xl bg-muted flex items-center justify-center">
                <PackageCheck className="h-7 w-7 text-muted-foreground" />
              </div>
              <div>
                <h3 className="font-semibold text-lg">
                  {searchQuery || statusFilter !== 'all' || phaseFilter !== 'all' ? 'No matching trips' : 'No active trips'}
                </h3>
                <p className="text-sm text-muted-foreground mt-1">
                  {searchQuery || statusFilter !== 'all' || phaseFilter !== 'all'
                    ? 'Try adjusting your search or filter criteria.'
                    : 'All trips are completed or cancelled. Create a new trip to get started.'}
                </p>
              </div>
              {(searchQuery || statusFilter !== 'all' || phaseFilter !== 'all') && (
                <Button
                  variant="outline"
                  size="sm"
                  className="mt-2"
                  onClick={() => { setSearchQuery(''); setStatusFilter('all'); setPhaseFilter('all') }}
                >
                  <RotateCcw className="h-4 w-4 mr-2" />
                  Clear filters
                </Button>
              )}
            </div>
          </CardContent>
        </Card>
      ) : (
        <>
          <div className="flex items-center justify-between">
            <p className="text-sm text-muted-foreground">
              Showing {filteredTrips.length} of {allTrips.length} trip{allTrips.length !== 1 ? 's' : ''}
            </p>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 xl:grid-cols-3 gap-4">
            <AnimatePresence mode="popLayout">
              {filteredTrips.map((trip) => (
                <FleetTripCard
                  key={trip.id}
                  trip={trip}
                  advancing={advancingId === trip.id}
                  isSelected={selectedTrip?.id === trip.id}
                  onSelect={() => setSelectedTrip(selectedTrip?.id === trip.id ? null : trip)}
                  onAdvance={() => handleAdvanceStatus(trip.id)}
                />
              ))}
            </AnimatePresence>
          </div>
        </>
      )}

      {/* ── Selected Trip Detail Sheet ── */}
      <Sheet open={!!selectedTrip} onOpenChange={(open) => { if (!open) setSelectedTrip(null) }}>
        <SheetContent side="bottom" className="p-0 gap-0">
          <SheetHeader className="sr-only">
            <SheetTitle>{selectedTrip?.tripNumber || 'Trip Details'}</SheetTitle>
            <SheetDescription>Trip details and management panel</SheetDescription>
          </SheetHeader>
          {/* Scrollable body — contains the full detail panel */}
          <div className="flex-1 overflow-y-auto min-h-0">
            {selectedTrip && (
              <FleetTripDetailPanel
                trip={selectedTrip}
                advancing={advancingId === selectedTrip.id}
                onAdvance={() => handleAdvanceStatus(selectedTrip.id)}
                onClose={() => setSelectedTrip(null)}
              />
            )}
          </div>
        </SheetContent>
      </Sheet>

      {/* ── Sticky Footer ── */}
      <footer className="mt-8 pt-4 border-t">
        <div className="flex items-center justify-between text-xs text-muted-foreground">
          <span>{APP_NAME} &middot; Fleet Operations</span>
          <span>{new Date().toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })}</span>
        </div>
      </footer>
    </motion.div>
  )
}

// ════════════════════════════════════════════════════════════════════
// KPI CARD
// ════════════════════════════════════════════════════════════════════

function KPICard({
  icon: Icon, label, value, subtext, iconBg, iconColor,
}: {
  icon: React.ElementType
  label: string
  value: string
  subtext: string
  iconBg: string
  iconColor: string
}) {
  return (
    <Card className="relative overflow-hidden">
      <CardContent className="p-4">
        <div className="flex items-start gap-3">
          <div className={`h-10 w-10 rounded-xl ${iconBg} flex items-center justify-center shrink-0`}>
            <Icon className={`h-5 w-5 ${iconColor}`} />
          </div>
          <div className="min-w-0">
            <p className="text-[11px] font-medium text-muted-foreground uppercase tracking-wider">{label}</p>
            <p className="text-xl font-bold tracking-tight mt-0.5 truncate">{value}</p>
            <p className="text-[11px] text-muted-foreground mt-0.5 truncate">{subtext}</p>
          </div>
        </div>
      </CardContent>
    </Card>
  )
}

// ════════════════════════════════════════════════════════════════════
// FLEET TRIP CARD
// ════════════════════════════════════════════════════════════════════

function FleetTripCard({
  trip, advancing, isSelected, onSelect, onAdvance,
}: {
  trip: Trip
  advancing: boolean
  isSelected: boolean
  onSelect: () => void
  onAdvance: () => void
}) {
  const progress = getTripProgress(trip.status)
  const statusMeta = TRIP_STATUS_META[trip.status]
  const phase = getTripPhase(trip.status)
  const phaseData = TRIP_PHASES[phase]
  const hasMoreStops = (trip.deliveryStops?.length ?? 0) > 1
  const actionLabel = getAdvanceAction(trip.status, { hasMoreStops })
  const waitingReason = getWaitingReason(trip.status)
  const canSeeFinancialData = useAuthStore((s) => s.canSeeFinancialData())

  return (
    <motion.div
      layout
      initial={{ opacity: 0, scale: 0.95 }}
      animate={{ opacity: 1, scale: 1 }}
      exit={{ opacity: 0, scale: 0.95 }}
      transition={{ duration: 0.2 }}
    >
      <Card
        className={`cursor-pointer transition-all hover:shadow-md ${
          isSelected ? 'ring-2 ring-amber-500 shadow-md' : ''
        }`}
        onClick={onSelect}
      >
        <CardContent className="p-4">
          {/* Header */}
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-2 min-w-0">
              <h3 className="text-sm font-bold truncate">{trip.tripNumber}</h3>
              <Badge className={`text-[10px] font-semibold shrink-0 ${statusMeta?.color || ''}`}>
                {statusMeta?.label}
              </Badge>
            </div>
            <span className="text-xs font-bold text-muted-foreground shrink-0">{progress}%</span>
          </div>

          {/* Waiting banner */}
          {waitingReason && (
            <motion.div
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: 'auto' }}
              className="mb-3 rounded-lg bg-orange-50 dark:bg-orange-900/15 border border-orange-200 dark:border-orange-800/40 px-3 py-2 flex items-start gap-2"
            >
              <Hourglass className="h-3.5 w-3.5 text-orange-500 shrink-0 mt-0.5" />
              <div className="min-w-0">
                <p className="text-[11px] font-semibold text-orange-700 dark:text-orange-400">Waiting</p>
                <p className="text-[10px] text-orange-600/80 dark:text-orange-400/70">
                  {trip.waitingReason || waitingReason}
                  {trip.waitingSince && (
                    <span className="ml-1">
                      &middot; Since {formatTimeShort(trip.waitingSince)}
                    </span>
                  )}
                </p>
              </div>
            </motion.div>
          )}

          {/* Route */}
          <div className="flex items-center gap-2 mb-3">
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-1.5">
                <div className="h-2 w-2 rounded-full bg-emerald-500 shrink-0" />
                <span className="text-xs font-medium truncate">{trip.loadingLocation}</span>
              </div>
            </div>
            <div className="flex items-center gap-1 shrink-0">
              <div className="w-8 h-px bg-gradient-to-r from-emerald-400 to-amber-400" />
              <ArrowRight className="h-3 w-3 text-amber-500" />
            </div>
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-1.5">
                <div className="h-2 w-2 rounded-full bg-slate-400 shrink-0" />
                <span className="text-xs font-medium truncate">{trip.destination}</span>
              </div>
            </div>
          </div>

          {/* Progress bar */}
          <div className="h-1.5 bg-muted rounded-full overflow-hidden mb-3">
            <motion.div
              className="h-full rounded-full"
              style={{ backgroundColor: getStatusColor(trip.status) }}
              initial={{ width: 0 }}
              animate={{ width: `${progress}%` }}
              transition={{ duration: 0.8, ease: 'easeOut' }}
            />
          </div>

          {/* Driver & Truck row */}
          <div className="flex items-center gap-3 mb-3 text-xs">
            <div className="flex items-center gap-1.5 min-w-0">
              <Users className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
              <span className="font-medium truncate">{trip.driver.firstName} {trip.driver.lastName}</span>
            </div>
            <Separator orientation="vertical" className="h-3" />
            <div className="flex items-center gap-1.5 min-w-0">
              <Truck className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
              <span className="font-medium truncate">{trip.truck.plateNumber}</span>
            </div>
            <Separator orientation="vertical" className="h-3" />
            <Badge variant="outline" className="text-[9px] h-5 px-1.5 shrink-0" style={{ borderColor: phaseData.color, color: phaseData.color }}>
              {phaseData.label}
            </Badge>
          </div>

          {/* Cargo & Revenue */}
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
              <Package className="h-3.5 w-3.5" />
              <span className="truncate">{trip.quantity} {trip.unit} &middot; {trip.itemName}</span>
            </div>
            {canSeeFinancialData && trip.totalRevenue ? (
              <span className="text-xs font-bold text-emerald-600 dark:text-emerald-400">
                {CURRENCY_SYMBOL}{trip.totalRevenue.toLocaleString()}
              </span>
            ) : null}
          </div>

          {/* Offloading progress */}
          {trip.status === 'offloading' && (
            <div className="mt-3 pt-3 border-t">
              <div className="flex items-center justify-between mb-1.5">
                <span className="text-[11px] font-semibold text-violet-700 dark:text-violet-400 flex items-center gap-1">
                  <PackageCheck className="h-3 w-3" />
                  Offloading Progress
                </span>
                <span className="text-[11px] font-bold text-violet-700 dark:text-violet-400">
                  {trip.totalOffloaded || 0} / {trip.quantity} {trip.unit} ({trip.quantity > 0 ? Math.round(((trip.totalOffloaded || 0) / trip.quantity) * 100) : 0}%)
                </span>
              </div>
              <div className="h-2 bg-violet-100 dark:bg-violet-900/30 rounded-full overflow-hidden">
                <motion.div
                  className="h-full bg-violet-500 rounded-full"
                  initial={{ width: 0 }}
                  animate={{ width: `${trip.quantity > 0 ? Math.round(((trip.totalOffloaded || 0) / trip.quantity) * 100) : 0}%` }}
                  transition={{ duration: 0.8, ease: 'easeOut' }}
                />
              </div>
            </div>
          )}

          {/* Multi-destination stops indicator */}
          {trip.deliveryStops && trip.deliveryStops.length > 1 && (
            <div className="mt-3 pt-3 border-t">
              <div className="flex items-center gap-1.5 text-xs">
                <MapPinned className="h-3.5 w-3.5 text-amber-500" />
                <span className="font-medium">{trip.deliveryStops.length} delivery stops</span>
                <span className="text-muted-foreground">
                  &middot; {trip.deliveryStops.filter((s) => s.status === 'completed').length} completed
                </span>
              </div>
            </div>
          )}

          {/* Actions */}
          {actionLabel && (
            <div className="mt-3 pt-3 border-t">
              <Button
                size="sm"
                className="w-full h-8 text-xs gap-1.5 bg-gradient-to-r from-amber-500 to-amber-600 hover:from-amber-600 hover:to-amber-700 text-white font-semibold"
                disabled={advancing}
                onClick={(e) => { e.stopPropagation(); onAdvance() }}
              >
                {advancing ? (
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                ) : (
                  <ChevronRight className="h-3.5 w-3.5" />
                )}
                {advancing ? 'Updating...' : actionLabel}
              </Button>
            </div>
          )}
        </CardContent>
      </Card>
    </motion.div>
  )
}

// ════════════════════════════════════════════════════════════════════
// FLEET TRIP DETAIL PANEL
// ════════════════════════════════════════════════════════════════════

function FleetTripDetailPanel({
  trip, advancing, onAdvance, onClose,
}: {
  trip: Trip
  advancing: boolean
  onAdvance: () => void
  onClose: () => void
}) {
  const progress = getTripProgress(trip.status)
  const statusMeta = TRIP_STATUS_META[trip.status]
  const phase = getTripPhase(trip.status)
  const phaseData = TRIP_PHASES[phase]
  const hasMoreStops = (trip.deliveryStops?.length ?? 0) > 1
  const actionLabel = getAdvanceAction(trip.status, { hasMoreStops })
  const waitingReason = getWaitingReason(trip.status)
  const timeline = getStatusTimeline(trip.status)
  const [expenses, setExpenses] = React.useState<Array<{ id: string; category: string; description: string; amount: number; date: string }>>([])
  const [loadingExpenses, setLoadingExpenses] = React.useState(true)
  const [events, setEvents] = React.useState<TripEvent[]>([])
  const [loadingEvents, setLoadingEvents] = React.useState(true)
  const canSeeFinancialData = useAuthStore((s) => s.canSeeFinancialData())

  React.useEffect(() => {
    setLoadingExpenses(true)
    apiFetch<{ data: typeof expenses }>(`/api/trips/${trip.id}/expenses`)
      .then((data) => setExpenses(data.data || []))
      .catch(() => setExpenses([]))
      .finally(() => setLoadingExpenses(false))
  }, [trip.id])

  React.useEffect(() => {
    setLoadingEvents(true)
    fetchTripEvents(trip.id)
      .then((data) => setEvents(data.data || []))
      .catch(() => setEvents([]))
      .finally(() => setLoadingEvents(false))
  }, [trip.id])

  const totalExpenses = expenses.reduce((s, e) => s + parseFloat(String(e.amount)), 0)
  const profit = (trip.totalRevenue || 0) - totalExpenses

  return (
    <Card className="overflow-hidden">
      {/* Dark header */}
      <div className="relative bg-gradient-to-br from-slate-800 via-slate-900 to-slate-950 dark:from-slate-800 dark:via-slate-900 dark:to-black p-5 text-white">
        <div className="absolute inset-0 opacity-5" style={{
          backgroundImage: 'radial-gradient(circle at 1px 1px, white 1px, transparent 0)',
          backgroundSize: '24px 24px',
        }} />
        <div className="absolute -top-16 -right-16 w-48 h-48 bg-amber-500/10 rounded-full blur-3xl" />
        <div className="absolute -bottom-8 -left-8 w-32 h-32 bg-emerald-500/10 rounded-full blur-3xl" />

        <div className="relative z-10">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-3 flex-wrap">
              <h2 className="text-xl font-bold">{trip.tripNumber}</h2>
              <Badge className={`text-[11px] font-semibold ${statusMeta?.color || ''}`}>
                {statusMeta?.icon} {statusMeta?.label}
              </Badge>
              <Badge variant="outline" className="text-[10px] border-white/20 text-white/70">
                {phaseData.label}
              </Badge>
            </div>
            <Button
              variant="ghost"
              size="sm"
              className="h-8 w-8 p-0 text-slate-400 hover:text-white hover:bg-white/10"
              onClick={onClose}
            >
              <X className="h-4 w-4" />
            </Button>
          </div>

          {/* Progress */}
          <div className="space-y-2">
            <div className="flex items-center justify-between text-xs">
              <span className="text-slate-400">Trip progress</span>
              <span className="font-semibold text-amber-400">{progress}%</span>
            </div>
            <div className="h-2 bg-white/10 rounded-full overflow-hidden">
              <motion.div
                className="h-full bg-gradient-to-r from-amber-400 to-emerald-400 rounded-full"
                initial={{ width: 0 }}
                animate={{ width: `${progress}%` }}
                transition={{ duration: 1, ease: 'easeOut' }}
              />
            </div>
          </div>

          {/* Horizontal mini lifecycle */}
          <div className="flex items-center gap-0 mt-4 overflow-x-auto pb-1">
            {ALL_TRIP_STATUSES.map((stage, idx) => {
              const currentIdx = ALL_TRIP_STATUSES.indexOf(trip.status as typeof ALL_TRIP_STATUSES[number])
              const isCompleted = idx < currentIdx
              const isActive = stage === trip.status
              return (
                <React.Fragment key={stage}>
                  <div className="flex flex-col items-center gap-1">
                    <div className={`w-3 h-3 rounded-full transition-colors ${
                      isCompleted ? 'bg-emerald-400' : isActive ? 'bg-amber-400 ring-2 ring-amber-400/30' : 'bg-white/20'
                    }`} />
                    <span className={`text-[9px] whitespace-nowrap ${isActive ? 'text-amber-400 font-semibold' : isCompleted ? 'text-slate-300' : 'text-slate-500'}`}>
                      {TRIP_STATUS_META[stage]?.label}
                    </span>
                  </div>
                  {idx < ALL_TRIP_STATUSES.length - 1 && (
                    <div className={`w-4 sm:w-8 h-px flex-shrink-0 ${idx < currentIdx ? 'bg-emerald-400/60' : 'bg-white/10'}`} />
                  )}
                </React.Fragment>
              )
            })}
          </div>
        </div>
      </div>

      <CardContent className="p-5">
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
          {/* Left - Trip Info */}
          <div className="lg:col-span-2 space-y-5">
            {/* Waiting banner */}
            {waitingReason && (
              <motion.div
                initial={{ opacity: 0, y: -4 }}
                animate={{ opacity: 1, y: 0 }}
                className="rounded-xl bg-orange-50 dark:bg-orange-900/15 border border-orange-200 dark:border-orange-800/40 p-4 flex items-start gap-3"
              >
                <div className="h-9 w-9 rounded-lg bg-orange-100 dark:bg-orange-900/30 flex items-center justify-center shrink-0">
                  <Hourglass className="h-4 w-4 text-orange-500" />
                </div>
                <div className="min-w-0">
                  <p className="text-xs font-bold text-orange-700 dark:text-orange-400">Waiting State</p>
                  <p className="text-[11px] text-orange-600/80 dark:text-orange-400/70 mt-0.5">
                    {trip.waitingReason || waitingReason}
                  </p>
                  {trip.waitingSince && (
                    <p className="text-[10px] text-orange-500/60 dark:text-orange-400/50 mt-1 flex items-center gap-1">
                      <Clock className="h-3 w-3" />
                      Waiting since {formatDateTime(trip.waitingSince)}
                    </p>
                  )}
                </div>
              </motion.div>
            )}

            {/* Offloading progress */}
            {trip.status === 'offloading' && (
              <Card className="border-violet-200 dark:border-violet-800/40 bg-violet-50/50 dark:bg-violet-900/10">
                <CardContent className="p-4">
                  <div className="flex items-center justify-between mb-3">
                    <div className="flex items-center gap-2">
                      <div className="h-8 w-8 rounded-lg bg-violet-100 dark:bg-violet-900/30 flex items-center justify-center">
                        <PackageCheck className="h-4 w-4 text-violet-600 dark:text-violet-400" />
                      </div>
                      <div>
                        <p className="text-xs font-bold text-violet-700 dark:text-violet-400">Offloading in Progress</p>
                        <p className="text-[10px] text-muted-foreground">Unloading {trip.itemName}</p>
                      </div>
                    </div>
                    <span className="text-lg font-bold text-violet-700 dark:text-violet-400">
                      {trip.totalOffloaded || 0} / {trip.quantity} {trip.unit}
                    </span>
                  </div>
                  <div className="h-3 bg-violet-100 dark:bg-violet-900/30 rounded-full overflow-hidden">
                    <motion.div
                      className="h-full bg-gradient-to-r from-violet-500 to-violet-400 rounded-full"
                      initial={{ width: 0 }}
                      animate={{ width: `${trip.quantity > 0 ? Math.round(((trip.totalOffloaded || 0) / trip.quantity) * 100) : 0}%` }}
                      transition={{ duration: 0.8, ease: 'easeOut' }}
                    />
                  </div>
                  <div className="flex items-center justify-between mt-2">
                    <span className="text-[10px] text-muted-foreground">
                      {trip.quantity > 0 ? Math.round(((trip.totalOffloaded || 0) / trip.quantity) * 100) : 0}% complete
                    </span>
                    {trip.offloadingStartedAt && (
                      <span className="text-[10px] text-muted-foreground flex items-center gap-1">
                        <Clock className="h-3 w-3" />
                        Started {formatTimeShort(trip.offloadingStartedAt)}
                      </span>
                    )}
                  </div>
                </CardContent>
              </Card>
            )}

            {/* Route card */}
            <div className="flex items-stretch gap-4">
              <div className="flex flex-col items-center gap-2 pt-0.5">
                <div className="h-3 w-3 rounded-full bg-emerald-500 ring-4 ring-emerald-100 dark:ring-emerald-900/40" />
                <div className="w-px flex-1 bg-gradient-to-b from-emerald-300 via-amber-300 to-slate-300 dark:from-emerald-700 dark:via-amber-700 dark:to-slate-700 relative">
                  <motion.div
                    className="absolute -left-[3px] h-2 w-2 rounded-full bg-amber-500 ring-2 ring-amber-200 dark:ring-amber-800 shadow-md"
                    animate={{ top: `${Math.min(progress, 95)}%` }}
                    transition={{ duration: 1.5, ease: 'easeInOut', delay: 0.5 }}
                  />
                </div>
                <div className="h-3 w-3 rounded-full bg-slate-400 ring-4 ring-slate-100 dark:ring-slate-800" />
              </div>
              <div className="flex-1 flex flex-col justify-between py-0">
                <div>
                  <p className="text-[10px] uppercase tracking-widest text-muted-foreground font-semibold mb-0.5">Pickup</p>
                  <p className="text-sm font-semibold">{trip.loadingLocation}</p>
                </div>
                <div className="flex items-center gap-2 py-3">
                  <ArrowDownUp className="h-3.5 w-3.5 text-muted-foreground" />
                  <span className="text-[11px] text-muted-foreground font-medium">
                    {progress < 30 ? 'Preparing to depart' : progress < 70 ? 'En route to destination' : progress < 100 ? 'Approaching destination' : 'Delivered'}
                  </span>
                </div>
                <div>
                  <p className="text-[10px] uppercase tracking-widest text-muted-foreground font-semibold mb-0.5">Delivery</p>
                  <p className="text-sm font-semibold">{trip.destination}</p>
                </div>
              </div>
            </div>

            {/* Delivery Stops */}
            {trip.deliveryStops && trip.deliveryStops.length > 1 && (
              <Card>
                <CardHeader className="pb-3">
                  <div className="flex items-center gap-2">
                    <div className="rounded-lg bg-teal-100 dark:bg-teal-900/30 p-2">
                      <MapPinned className="h-4 w-4 text-teal-600 dark:text-teal-400" />
                    </div>
                    <div>
                      <CardTitle className="text-sm font-semibold">Delivery Stops</CardTitle>
                      <CardDescription className="text-xs">{trip.deliveryStops.length} stops on this route</CardDescription>
                    </div>
                  </div>
                </CardHeader>
                <CardContent>
                  <div className="space-y-2">
                    {trip.deliveryStops
                      .sort((a, b) => a.stopOrder - b.stopOrder)
                      .map((stop, idx) => (
                        <div key={stop.id} className="flex items-center gap-3 p-2 rounded-lg bg-muted/50">
                          <div className={`h-7 w-7 rounded-full flex items-center justify-center text-xs font-bold shrink-0 ${
                            stop.status === 'completed'
                              ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400'
                              : stop.status === 'arrived' || stop.status === 'offloading'
                                ? 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400'
                                : 'bg-muted text-muted-foreground'
                          }`}>
                            {stop.status === 'completed' ? <CheckCircle2 className="h-3.5 w-3.5" /> : idx + 1}
                          </div>
                          <div className="flex-1 min-w-0">
                            <p className="text-xs font-semibold truncate">{stop.destination}</p>
                            <p className="text-[10px] text-muted-foreground">
                              {stop.expectedQty} {stop.unit}
                              {stop.actualQty != null && (
                                <span className="ml-1 text-emerald-600 dark:text-emerald-400">
                                  &middot; {stop.actualQty} offloaded
                                </span>
                              )}
                            </p>
                          </div>
                          <Badge className={`text-[9px] ${TRIP_STATUS_META[stop.status]?.color || 'bg-muted text-muted-foreground'}`}>
                            {stop.status}
                          </Badge>
                        </div>
                      ))}
                  </div>
                </CardContent>
              </Card>
            )}

            {/* Details grid */}
            <div className="grid grid-cols-2 gap-3">
              <DetailPill icon={Truck} label="Vehicle" value={`${trip.truck.plateNumber}`} sub={`${trip.truck.make} ${trip.truck.model}`} />
              <DetailPill icon={Users} label="Driver" value={`${trip.driver.firstName} ${trip.driver.lastName}`} />
              <DetailPill icon={Package} label="Cargo" value={`${trip.quantity} ${trip.unit}`} sub={trip.itemName} />
              <DetailPill icon={CalendarDays} label="Departure" value={formatDate(trip.departureTime)} sub={formatTimeShort(trip.departureTime)} />
              {canSeeFinancialData && trip.totalRevenue && (
                <DetailPill icon={DollarSign} label="Revenue" value={`${CURRENCY_SYMBOL}${trip.totalRevenue.toLocaleString()}`} />
              )}
              {trip.waybillNumber && (
                <DetailPill icon={Route} label="Waybill" value={trip.waybillNumber} />
              )}
              {trip.customerName && (
                <DetailPill icon={Phone} label="Customer" value={trip.customerName} sub={trip.customerPhone || undefined} />
              )}
            </div>

            {/* Expenses */}
            <div>
              <div className="flex items-center justify-between mb-3">
                <h4 className="text-sm font-semibold flex items-center gap-2">
                  <CircleDollarSign className="h-4 w-4 text-red-500" />
                  Trip Expenses
                </h4>
                <span className="text-xs text-muted-foreground">
                  {expenses.length} entr{expenses.length !== 1 ? 'ies' : 'y'} &middot; {CURRENCY_SYMBOL}{totalExpenses.toLocaleString()}
                </span>
              </div>
              {loadingExpenses ? (
                <div className="space-y-2">
                  {[1, 2].map((i) => (
                    <Skeleton key={i} className="h-8 w-full rounded-md" />
                  ))}
                </div>
              ) : expenses.length === 0 ? (
                <p className="text-xs text-muted-foreground py-2">No expenses logged for this trip.</p>
              ) : (
                <div className="space-y-1.5">
                  {expenses.map((exp) => (
                    <div key={exp.id} className="flex items-center justify-between py-1.5 px-2 rounded-md hover:bg-muted/50 transition-colors">
                      <div className="flex items-center gap-2 min-w-0">
                        <span className="text-sm">{getExpenseCategoryMeta(exp.category).icon}</span>
                        <span className="text-xs font-medium truncate">{exp.description}</span>
                      </div>
                      <span className="text-xs font-bold text-red-600 dark:text-red-400 shrink-0 ml-2">
                        -{CURRENCY_SYMBOL}{parseFloat(String(exp.amount)).toLocaleString()}
                      </span>
                    </div>
                  ))}
                  {canSeeFinancialData && (
                  <>
                  <Separator />
                  <div className="flex items-center justify-between py-1">
                    <div className="text-xs space-y-0.5">
                      <div className="flex items-center gap-3">
                        <span className="text-muted-foreground">Revenue:</span>
                        <span className="font-semibold text-emerald-600">{CURRENCY_SYMBOL}{(trip.totalRevenue || 0).toLocaleString()}</span>
                      </div>
                      <div className="flex items-center gap-3">
                        <span className="text-muted-foreground">Expenses:</span>
                        <span className="font-semibold text-red-600">-{CURRENCY_SYMBOL}{totalExpenses.toLocaleString()}</span>
                      </div>
                    </div>
                    <div className="text-right">
                      <p className="text-[10px] text-muted-foreground uppercase tracking-wider">Net Profit</p>
                      <p className={`text-sm font-bold ${profit >= 0 ? 'text-emerald-600 dark:text-emerald-400' : 'text-red-600 dark:text-red-400'}`}>
                        {CURRENCY_SYMBOL}{profit.toLocaleString()}
                      </p>
                    </div>
                  </div>
                  </>
                  )}
                </div>
              )}
            </div>

            {/* Trip Events Audit Trail */}
            <Card>
              <CardHeader className="pb-3">
                <div className="flex items-center gap-2">
                  <div className="rounded-lg bg-sky-100 dark:bg-sky-900/30 p-2">
                    <ClipboardList className="h-4 w-4 text-sky-600 dark:text-sky-400" />
                  </div>
                  <div>
                    <CardTitle className="text-sm font-semibold">Activity Log</CardTitle>
                    <CardDescription className="text-xs">{events.length} event{events.length !== 1 ? 's' : ''}</CardDescription>
                  </div>
                </div>
              </CardHeader>
              <CardContent>
                {loadingEvents ? (
                  <div className="space-y-2">
                    {[1, 2, 3].map((i) => <Skeleton key={i} className="h-7 w-full rounded-md" />)}
                  </div>
                ) : events.length === 0 ? (
                  <p className="text-xs text-muted-foreground py-2">No events recorded yet.</p>
                ) : (
                  <ScrollArea className="max-h-64">
                    <div className="space-y-1">
                      {events.slice().reverse().map((evt) => (
                        <div key={evt.id} className="flex items-start gap-2 py-1.5 text-xs">
                          <div className="h-1.5 w-1.5 rounded-full bg-sky-400 shrink-0 mt-1.5" />
                          <div className="min-w-0 flex-1">
                            <div className="flex items-center gap-2 flex-wrap">
                              <span className="font-semibold text-muted-foreground">
                                {evt.oldStatus || evt.fromStatus || '--'} → {evt.newStatus || evt.toStatus}
                              </span>
                              {evt.triggerType && (
                                <Badge variant="outline" className="text-[9px] h-4 px-1">{evt.triggerType}</Badge>
                              )}
                            </div>
                            {evt.driverNotes && <p className="text-[10px] text-muted-foreground mt-0.5">{evt.driverNotes}</p>}
                            <p className="text-[10px] text-muted-foreground/60">{formatDateTime(evt.createdAt)}</p>
                          </div>
                        </div>
                      ))}
                    </div>
                  </ScrollArea>
                )}
              </CardContent>
            </Card>
          </div>

          {/* Right - Actions & Phase Lifecycle */}
          <div className="space-y-4">
            {/* Advance Action */}
            <Card>
              <CardHeader className="pb-3">
                <div className="flex items-center gap-2">
                  <div className="rounded-lg bg-amber-100 dark:bg-amber-900/30 p-2">
                    <Send className="h-4 w-4 text-amber-600 dark:text-amber-400" />
                  </div>
                  <CardTitle className="text-sm font-semibold">Trip Actions</CardTitle>
                </div>
              </CardHeader>
              <CardContent className="space-y-3">
                <Button
                  variant="outline"
                  onClick={async () => {
                    try {
                      const waybillData = await (await import('@/lib/api')).fetchTripWaybill(trip.id)
                      const { generateWaybill } = await import('@/lib/utils/waybill')
                      generateWaybill(waybillData)
                    } catch {
                      toast.error('Failed to generate waybill')
                    }
                  }}
                  className="w-full h-10 gap-2 border-amber-200 dark:border-amber-800/40 text-amber-700 dark:text-amber-400 hover:bg-amber-50 dark:hover:bg-amber-900/20"
                >
                  <ClipboardList className="h-4 w-4" />
                  Generate Waybill
                </Button>
                {actionLabel ? (
                  <Button
                    onClick={onAdvance}
                    disabled={advancing}
                    className="w-full h-11 bg-gradient-to-r from-amber-500 to-amber-600 hover:from-amber-600 hover:to-amber-700 text-white font-semibold shadow-sm"
                  >
                    {advancing ? (
                      <>
                        <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                        Updating...
                      </>
                    ) : (
                      <>
                        <ChevronRight className="h-4 w-4 mr-2" />
                        {actionLabel}
                      </>
                    )}
                  </Button>
                ) : (
                  <div className="text-center py-2">
                    <div className="inline-flex items-center gap-2 rounded-full px-4 py-2 text-sm font-medium bg-emerald-50 text-emerald-700 dark:bg-emerald-900/20 dark:text-emerald-400">
                      <CheckCircle2 className="h-4 w-4" />
                      Trip Complete
                    </div>
                  </div>
                )}
              </CardContent>
            </Card>

            {/* Phase-Grouped Lifecycle Stepper */}
            <Card>
              <CardHeader className="pb-3">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <div className="rounded-lg bg-emerald-100 dark:bg-emerald-900/30 p-2">
                      <PlayCircle className="h-4 w-4 text-emerald-600 dark:text-emerald-400" />
                    </div>
                    <div>
                      <CardTitle className="text-sm font-semibold">Lifecycle</CardTitle>
                      <CardDescription className="text-xs">
                        {phaseData.label} &middot; {progress}%
                      </CardDescription>
                    </div>
                  </div>
                  <Badge className={`text-[10px] font-semibold ${statusMeta?.color || ''}`}>
                    {statusMeta?.icon} {statusMeta?.label}
                  </Badge>
                </div>
              </CardHeader>
              <CardContent className="max-h-96 overflow-y-auto">
                <div className="space-y-4">
                  {timeline.map((phaseGroup) => {
                    const hasActiveInPhase = phaseGroup.statuses.some((s) => s.isActive)
                    const allCompletedInPhase = phaseGroup.statuses.every((s) => s.isCompleted)

                    return (
                      <div key={phaseGroup.phase}>
                        {/* Phase header */}
                        <div className="flex items-center gap-2 mb-2">
                          <div className={`h-2 w-2 rounded-full ${allCompletedInPhase ? 'bg-emerald-500' : hasActiveInPhase ? 'bg-amber-500 animate-pulse' : 'bg-muted'}`} />
                          <span className={`text-[11px] font-bold uppercase tracking-wider ${hasActiveInPhase ? 'text-amber-700 dark:text-amber-400' : allCompletedInPhase ? 'text-emerald-600 dark:text-emerald-400' : 'text-muted-foreground'}`}>
                            {phaseGroup.phaseLabel}
                          </span>
                        </div>
                        {/* Statuses in this phase */}
                        <div className="space-y-0 ml-1">
                          {phaseGroup.statuses.map((step, idx) => {
                            const isLast = idx === phaseGroup.statuses.length - 1
                            return (
                              <div key={step.status} className="flex items-start gap-3">
                                <div className="flex flex-col items-center">
                                  <div className={`relative flex items-center justify-center h-6 w-6 rounded-full shrink-0 transition-all ${
                                    step.isCompleted
                                      ? 'bg-emerald-500 text-white shadow-sm'
                                      : step.isActive
                                        ? 'bg-amber-500 text-white shadow-md ring-2 ring-amber-200 dark:ring-amber-800'
                                        : 'bg-muted text-muted-foreground'
                                  }`}>
                                    {step.isCompleted ? (
                                      <CheckCircle2 className="h-3 w-3" />
                                    ) : (
                                      <span className="text-[10px]">{step.icon}</span>
                                    )}
                                    {step.isActive && (
                                      <span className="absolute inset-0 rounded-full animate-ping opacity-20 bg-amber-500" />
                                    )}
                                  </div>
                                  {!isLast && (
                                    <div className={`w-0.5 h-4 transition-colors ${step.isCompleted ? 'bg-emerald-500' : 'bg-border'}`} />
                                  )}
                                </div>
                                <div className={`flex-1 pt-0.5 pb-2 ${step.isPending ? 'opacity-40' : ''}`}>
                                  <p className={`text-[11px] font-semibold ${step.isActive ? 'text-amber-700 dark:text-amber-400' : ''}`}>
                                    {step.label}
                                  </p>
                                  {step.isActive && (
                                    <p className="text-[9px] text-amber-600 dark:text-amber-500 font-medium mt-0.5">
                                      Current stage
                                    </p>
                                  )}
                                </div>
                              </div>
                            )
                          })}
                        </div>
                        {/* Phase separator line */}
                        {phaseGroup.phase !== 'return' && (
                          <div className="border-b border-dashed mb-4 mt-1" />
                        )}
                      </div>
                    )
                  })}
                </div>
              </CardContent>
            </Card>
          </div>
        </div>
      </CardContent>
    </Card>
  )
}

// ════════════════════════════════════════════════════════════════════
// DETAIL PILL
// ════════════════════════════════════════════════════════════════════

function DetailPill({
  icon: Icon, label, value, sub,
}: {
  icon: React.ElementType
  label: string
  value: string
  sub?: string
}) {
  return (
    <div className="rounded-lg bg-muted/50 p-3">
      <p className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider flex items-center gap-1">
        <Icon className="h-3 w-3" />
        {label}
      </p>
      <p className="text-sm font-semibold mt-1 truncate">{value}</p>
      {sub && <p className="text-[11px] text-muted-foreground truncate">{sub}</p>}
    </div>
  )
}

// ════════════════════════════════════════════════════════════════════
// DRIVER VIEW (single driver's active trip)
// ════════════════════════════════════════════════════════════════════

function DriverView() {
  const { isDriver, driverId, truck, loading: hookLoading } = useDriverTruck()
  const user = useAuthStore((s) => s.user)
  const [activeTrips, setActiveTrips] = React.useState<Trip[]>([])
  const [loading, setLoading] = React.useState(true)
  const [advancing, setAdvancing] = React.useState(false)
  const [showExpenseForm, setShowExpenseForm] = React.useState(false)
  const [activeTab, setActiveTab] = React.useState('overview')
  const [expenses, setExpenses] = React.useState<Array<{
    id: string; category: string; description: string; amount: number; date: string
  }>>([])
  const [submittingExpense, setSubmittingExpense] = React.useState(false)

  // Expense form state
  const [expCategory, setExpCategory] = React.useState('')
  const [expDescription, setExpDescription] = React.useState('')
  const [expAmount, setExpAmount] = React.useState('')

  // ALL hooks before conditional returns
  const loadTrips = React.useCallback(async () => {
    if (!driverId) return
    setLoading(true)
    try {
      const result = await fetchTrips({ driverId, limit: 50 })
      const nonTerminal = result.data.filter((t) => !isTerminalStatus(t.status))
      nonTerminal.sort((a, b) => new Date(b.departureTime).getTime() - new Date(a.departureTime).getTime())
      setActiveTrips(nonTerminal)

      if (nonTerminal.length > 0) {
        const expData = await apiFetch<{ data: typeof expenses }>(`/api/trips/${nonTerminal[0].id}/expenses`)
        setExpenses(expData.data || [])
      }
    } catch (err) {
      console.error('Failed to load driver trips:', err)
    } finally {
      setLoading(false)
    }
  }, [driverId])

  React.useEffect(() => {
    loadTrips()
  }, [loadTrips])

  // Auto-refresh every 30s
  React.useEffect(() => {
    const interval = setInterval(loadTrips, 30000)
    return () => clearInterval(interval)
  }, [loadTrips])

  // Listen for real-time push notifications to auto-refresh
  const handlePushNotification = React.useCallback((_notification: PushNotification) => {
    loadTrips()
  }, [loadTrips])
  usePushNotifications(handlePushNotification)

  const handleAdvanceStatus = React.useCallback(async (tripId: string) => {
    setAdvancing(true)
    try {
      const updated = await apiFetch<Trip>(`/api/trips/${tripId}/advance-status`, {
        method: 'POST',
        body: JSON.stringify({}),
      })
      toast.success('Status updated', {
        description: `Trip is now ${TRIP_STATUS_META[updated.status]?.label || updated.status}`,
      })
      loadTrips()
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to advance status')
    } finally {
      setAdvancing(false)
    }
  }, [loadTrips])

  const handleLogExpense = React.useCallback(async () => {
    if (!activeTrips.length || !expCategory || !expDescription || !expAmount) {
      toast.error('Please fill in all expense fields')
      return
    }
    setSubmittingExpense(true)
    try {
      await apiFetch(`/api/trips/${activeTrips[0].id}/expenses`, {
        method: 'POST',
        body: JSON.stringify({
          category: expCategory,
          description: expDescription,
          amount: parseFloat(expAmount),
          paymentMethod: 'cash',
        }),
      })
      toast.success('Expense logged successfully')
      setExpCategory('')
      setExpDescription('')
      setExpAmount('')
      setShowExpenseForm(false)
      // Reload expenses
      const expData = await apiFetch<{ data: typeof expenses }>(`/api/trips/${activeTrips[0].id}/expenses`)
      setExpenses(expData.data || [])
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to log expense')
    } finally {
      setSubmittingExpense(false)
    }
  }, [activeTrips, expCategory, expDescription, expAmount])

  const currentTrip = activeTrips[0] || null

  // Conditional returns AFTER all hooks
  if (!isDriver) return null

  if (hookLoading || loading) {
    return <LoadingSkeleton />
  }

  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3 }}
      className="space-y-6"
    >
      {!truck ? (
        <NoTruckAssigned />
      ) : !currentTrip ? (
        <NoActiveTrips truck={truck} />
      ) : (
        <DriverActiveTripContent
          trip={currentTrip}
          truck={truck}
          expenses={expenses}
          advancing={advancing}
          activeTab={activeTab}
          setActiveTab={setActiveTab}
          showExpenseForm={showExpenseForm}
          setShowExpenseForm={setShowExpenseForm}
          expCategory={expCategory}
          setExpCategory={setExpCategory}
          expDescription={expDescription}
          setExpDescription={setExpDescription}
          expAmount={expAmount}
          setExpAmount={setExpAmount}
          submittingExpense={submittingExpense}
          onAdvanceStatus={handleAdvanceStatus}
          onLogExpense={handleLogExpense}
        />
      )}

      {/* Sticky Footer */}
      <footer className="mt-auto pt-4 border-t">
        <div className="flex items-center justify-between text-xs text-muted-foreground">
          <span>{APP_NAME} &middot; Driver Portal</span>
          <span>{new Date().toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })}</span>
        </div>
      </footer>
    </motion.div>
  )
}

// ════════════════════════════════════════════════════════════════════
// DRIVER ACTIVE TRIP CONTENT (tabbed interface)
// ════════════════════════════════════════════════════════════════════

interface DriverActiveTripContentProps {
  trip: Trip
  truck: { id: string; plateNumber: string; make: string; model: string }
  expenses: Array<{ id: string; category: string; description: string; amount: number; date: string }>
  advancing: boolean
  activeTab: string
  setActiveTab: (v: string) => void
  showExpenseForm: boolean
  setShowExpenseForm: (v: boolean) => void
  expCategory: string
  setExpCategory: (v: string) => void
  expDescription: string
  setExpDescription: (v: string) => void
  expAmount: string
  setExpAmount: (v: string) => void
  submittingExpense: boolean
  onAdvanceStatus: (tripId: string) => void
  onLogExpense: () => void
}

function DriverActiveTripContent({
  trip,
  truck,
  expenses,
  advancing,
  activeTab,
  setActiveTab,
  showExpenseForm,
  setShowExpenseForm,
  expCategory,
  setExpCategory,
  expDescription,
  setExpDescription,
  expAmount,
  setExpAmount,
  submittingExpense,
  onAdvanceStatus,
  onLogExpense,
}: DriverActiveTripContentProps) {
  const canSeeFinancialData = useAuthStore((s) => s.canSeeFinancialData())
  const progress = getTripProgress(trip.status)
  const totalExpenses = expenses.reduce((sum, e) => sum + parseFloat(String(e.amount)), 0)
  const isTerminal = isTerminalStatus(trip.status)
  const phase = getTripPhase(trip.status)
  const phaseData = TRIP_PHASES[phase]
  const hasMoreStops = (trip.deliveryStops?.length ?? 0) > 1
  const actionLabel = getAdvanceAction(trip.status, { hasMoreStops })
  const waitingReason = getWaitingReason(trip.status)
  const atDestination = isAtDestination(trip.status)
  const offloadPct = trip.quantity > 0 ? Math.round(((trip.totalOffloaded || 0) / trip.quantity) * 100) : 0

  return (
    <>
      {/* ── Hero Header with Phase Indicator ── */}
      <TripHeroHeader trip={trip} truck={truck} progress={progress} phase={phase} phaseData={phaseData} />

      {/* ── Waiting Banner ── */}
      {waitingReason && (
        <motion.div
          initial={{ opacity: 0, y: -8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.4 }}
          className="rounded-xl bg-gradient-to-r from-orange-50 to-amber-50 dark:from-orange-900/15 dark:to-amber-900/15 border border-orange-200 dark:border-orange-800/40 p-4 flex items-start gap-4"
        >
          <div className="h-10 w-10 rounded-xl bg-orange-100 dark:bg-orange-900/30 flex items-center justify-center shrink-0">
            <Hourglass className="h-5 w-5 text-orange-500" />
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 mb-1">
              <p className="text-sm font-bold text-orange-700 dark:text-orange-400">Waiting</p>
              <Badge className="bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-400 text-[10px]">
                {TRIP_STATUS_META[trip.status]?.label}
              </Badge>
            </div>
            <p className="text-xs text-orange-600/80 dark:text-orange-400/70">
              {trip.waitingReason || waitingReason}
            </p>
            {trip.waitingSince && (
              <p className="text-[11px] text-orange-500/60 dark:text-orange-400/50 mt-1.5 flex items-center gap-1.5">
                <Clock className="h-3.5 w-3.5" />
                Waiting since {formatDateTime(trip.waitingSince)}
                {(() => {
                  try {
                    const diff = Date.now() - new Date(trip.waitingSince).getTime()
                    const hours = Math.floor(diff / 3600000)
                    const mins = Math.floor((diff % 3600000) / 60000)
                    if (hours > 0) return ` (${hours}h ${mins}m ago)`
                    return ` (${mins}m ago)`
                  } catch { return '' }
                })()}
              </p>
            )}
          </div>
        </motion.div>
      )}

      {/* ── Quick Stats Row ── */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
        {canSeeFinancialData && (
        <QuickStatCard
          icon={DollarSign}
          label="Trip Revenue"
          value={trip.totalRevenue ? `${CURRENCY_SYMBOL}${trip.totalRevenue.toLocaleString()}` : '--'}
          colorClass="text-emerald-600 dark:text-emerald-400"
          bgClass="bg-emerald-50 dark:bg-emerald-900/20"
        />
        )}
        <QuickStatCard
          icon={Receipt}
          label="Expenses"
          value={`${CURRENCY_SYMBOL}${totalExpenses.toLocaleString()}`}
          subtext={expenses.length > 0 ? `${expenses.length} entries` : undefined}
          colorClass="text-red-600 dark:text-red-400"
          bgClass="bg-red-50 dark:bg-red-900/20"
        />
        <QuickStatCard
          icon={Package}
          label="Cargo"
          value={`${trip.quantity} ${trip.unit}`}
          subtext={trip.itemName}
          colorClass="text-amber-600 dark:text-amber-400"
          bgClass="bg-amber-50 dark:bg-amber-900/20"
        />
        <QuickStatCard
          icon={Clock}
          label="Departure"
          value={formatTimeShort(trip.departureTime)}
          subtext={formatDate(trip.departureTime)}
          colorClass="text-sky-600 dark:text-sky-400"
          bgClass="bg-sky-50 dark:bg-sky-900/20"
        />
      </div>

      {/* ── Tabs ── */}
      <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-4">
        <TabsList className="h-10 bg-muted/60">
          <TabsTrigger value="overview" className="text-xs sm:text-sm gap-1.5">
            <Route className="h-3.5 w-3.5" />
            <span className="hidden sm:inline">Overview</span>
          </TabsTrigger>
          <TabsTrigger value="stops" className="text-xs sm:text-sm gap-1.5 relative">
            <MapPinned className="h-3.5 w-3.5" />
            <span className="hidden sm:inline">Stops</span>
            {trip.deliveryStops && trip.deliveryStops.length > 1 && (
              <span className="absolute -top-1 -right-1 h-4 w-4 rounded-full bg-amber-500 text-white text-[10px] font-bold flex items-center justify-center">
                {trip.deliveryStops.length}
              </span>
            )}
          </TabsTrigger>
          <TabsTrigger value="expenses" className="text-xs sm:text-sm gap-1.5 relative">
            <Wallet className="h-3.5 w-3.5" />
            <span className="hidden sm:inline">Expenses</span>
            {expenses.length > 0 && (
              <span className="absolute -top-1 -right-1 h-4 w-4 rounded-full bg-red-500 text-white text-[10px] font-bold flex items-center justify-center">
                {expenses.length}
              </span>
            )}
          </TabsTrigger>
        </TabsList>

        {/* ── Overview Tab ── */}
        <TabsContent value="overview" className="space-y-4 mt-0">
          <div className="grid grid-cols-1 lg:grid-cols-5 gap-4">
            {/* Left Column - Route & Lifecycle */}
            <div className="lg:col-span-3 space-y-4">
              {/* Route Card */}
              <Card className="overflow-hidden">
                <CardHeader className="pb-3">
                  <div className="flex items-center gap-2">
                    <div className="rounded-lg bg-amber-100 dark:bg-amber-900/30 p-2">
                      <Navigation className="h-4 w-4 text-amber-600 dark:text-amber-400" />
                    </div>
                    <div>
                      <CardTitle className="text-sm font-semibold">Route Information</CardTitle>
                      <CardDescription className="text-xs">Loading point to destination</CardDescription>
                    </div>
                  </div>
                </CardHeader>
                <CardContent className="pb-4">
                  <RouteVisualization
                    from={trip.loadingLocation}
                    to={trip.destination}
                    progress={progress}
                  />
                </CardContent>
              </Card>

              {/* Offloading Progress Section */}
              {(trip.status === 'offloading' || trip.status === 'offloaded') && (
                <Card className="overflow-hidden border-violet-200 dark:border-violet-800/40 bg-gradient-to-br from-violet-50/50 to-purple-50/50 dark:from-violet-900/10 dark:to-purple-900/10">
                  <CardContent className="p-4">
                    <div className="flex items-center justify-between mb-4">
                      <div className="flex items-center gap-3">
                        <div className="h-10 w-10 rounded-xl bg-violet-100 dark:bg-violet-900/30 flex items-center justify-center">
                          <PackageCheck className="h-5 w-5 text-violet-600 dark:text-violet-400" />
                        </div>
                        <div>
                          <p className="text-sm font-bold text-violet-700 dark:text-violet-400">
                            {trip.status === 'offloading' ? 'Offloading in Progress' : 'Offloading Complete'}
                          </p>
                          <p className="text-[11px] text-muted-foreground">
                            {trip.itemName}
                          </p>
                        </div>
                      </div>
                      <div className="text-right">
                        <p className="text-2xl font-bold text-violet-700 dark:text-violet-400">
                          {trip.totalOffloaded || 0}
                        </p>
                        <p className="text-[10px] text-muted-foreground">of {trip.quantity} {trip.unit}</p>
                      </div>
                    </div>

                    <div className="space-y-2">
                      <div className="flex items-center justify-between text-xs">
                        <span className="font-medium text-violet-600 dark:text-violet-400">{offloadPct}%</span>
                        <span className="text-muted-foreground">{trip.quantity - (trip.totalOffloaded || 0)} {trip.unit} remaining</span>
                      </div>
                      <div className="h-3 bg-violet-100 dark:bg-violet-900/30 rounded-full overflow-hidden">
                        <motion.div
                          className="h-full bg-gradient-to-r from-violet-500 to-purple-500 rounded-full"
                          initial={{ width: 0 }}
                          animate={{ width: `${offloadPct}%` }}
                          transition={{ duration: 1, ease: 'easeOut' }}
                        />
                      </div>
                    </div>

                    {trip.offloadingStartedAt && (
                      <p className="text-[10px] text-muted-foreground mt-3 flex items-center gap-1">
                        <Clock className="h-3 w-3" />
                        Started {formatDateTime(trip.offloadingStartedAt)}
                        {trip.offloadingCompletedAt && (
                          <span className="ml-2">&middot; Completed {formatTimeShort(trip.offloadingCompletedAt)}</span>
                        )}
                      </p>
                    )}
                  </CardContent>
                </Card>
              )}

              {/* Phase-Grouped Lifecycle Stepper */}
              <Card>
                <CardHeader className="pb-3">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <div className="rounded-lg bg-emerald-100 dark:bg-emerald-900/30 p-2">
                        <PlayCircle className="h-4 w-4 text-emerald-600 dark:text-emerald-400" />
                      </div>
                      <div>
                        <CardTitle className="text-sm font-semibold">Trip Lifecycle</CardTitle>
                        <CardDescription className="text-xs">
                          {phaseData.label} &middot; Stage {progress}%
                        </CardDescription>
                      </div>
                    </div>
                    <Badge className={`text-[11px] font-semibold ${TRIP_STATUS_META[trip.status]?.color || ''}`}>
                      {TRIP_STATUS_META[trip.status]?.icon} {TRIP_STATUS_META[trip.status]?.label}
                    </Badge>
                  </div>
                </CardHeader>
                <CardContent className="pb-4">
                  <PhaseLifecycleStepper currentStatus={trip.status} />
                </CardContent>
              </Card>
            </div>

            {/* Right Column - Actions & Info */}
            <div className="lg:col-span-2 space-y-4">
              {/* Quick Actions */}
              <Card>
                <CardHeader className="pb-3">
                  <div className="flex items-center gap-2">
                    <div className="rounded-lg bg-violet-100 dark:bg-violet-900/30 p-2">
                      <Send className="h-4 w-4 text-violet-600 dark:text-violet-400" />
                    </div>
                    <CardTitle className="text-sm font-semibold">Actions</CardTitle>
                  </div>
                </CardHeader>
                <CardContent className="pb-4 space-y-3">
                  {!isTerminal ? (
                    <>
                      <p className="text-xs text-muted-foreground mb-2">
                        Advance the trip to the next stage to keep everyone updated.
                      </p>
                      <Button
                        onClick={() => onAdvanceStatus(trip.id)}
                        disabled={advancing}
                        className="w-full h-11 bg-gradient-to-r from-amber-500 to-amber-600 hover:from-amber-600 hover:to-amber-700 text-white font-semibold shadow-sm"
                      >
                        {advancing ? (
                          <>
                            <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                            Updating...
                          </>
                        ) : actionLabel ? (
                          <>
                            <ChevronRight className="h-4 w-4 mr-2" />
                            {actionLabel}
                          </>
                        ) : (
                          <>
                            <CheckCircle2 className="h-4 w-4 mr-2" />
                            Complete Trip
                          </>
                        )}
                      </Button>
                    </>
                  ) : (
                    <div className="text-center py-2">
                      <div className={`inline-flex items-center gap-2 rounded-full px-4 py-2 text-sm font-medium ${
                        trip.status === 'completed'
                          ? 'bg-emerald-50 text-emerald-700 dark:bg-emerald-900/20 dark:text-emerald-400'
                          : 'bg-red-50 text-red-700 dark:bg-red-900/20 dark:text-red-400'
                      }`}>
                        <CheckCircle2 className="h-4 w-4" />
                        {trip.status === 'completed' ? 'Trip Completed' : 'Trip Cancelled'}
                      </div>
                    </div>
                  )}

                  {!isTerminal && (
                    <Button
                      variant="outline"
                      className="w-full h-10 text-sm"
                      onClick={() => { setActiveTab('expenses'); setShowExpenseForm(true) }}
                    >
                      <Plus className="h-4 w-4 mr-2" />
                      Log Quick Expense
                    </Button>
                  )}
                </CardContent>
              </Card>

              {/* Truck Assignment */}
              <Card>
                <CardHeader className="pb-3">
                  <div className="flex items-center gap-2">
                    <div className="rounded-lg bg-sky-100 dark:bg-sky-900/30 p-2">
                      <Truck className="h-4 w-4 text-sky-600 dark:text-sky-400" />
                    </div>
                    <CardTitle className="text-sm font-semibold">Assigned Vehicle</CardTitle>
                  </div>
                </CardHeader>
                <CardContent className="pb-4">
                  <div className="flex items-center gap-3">
                    <div className="h-12 w-12 rounded-xl bg-gradient-to-br from-slate-700 to-slate-900 dark:from-slate-600 dark:to-slate-800 flex items-center justify-center text-white font-bold text-sm shadow-sm">
                      {truck.plateNumber.split('-').pop()}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="font-semibold text-sm">{truck.plateNumber}</p>
                      <p className="text-xs text-muted-foreground">{truck.make} {truck.model}</p>
                    </div>
                    <Badge variant="outline" className="bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-900/20 dark:text-emerald-400 dark:border-emerald-800 text-[10px]">
                      Active
                    </Badge>
                  </div>
                </CardContent>
              </Card>

              {/* Recent Expenses Summary */}
              {expenses.length > 0 && (
                <Card>
                  <CardHeader className="pb-3">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <div className="rounded-lg bg-red-100 dark:bg-red-900/30 p-2">
                          <CircleDollarSign className="h-4 w-4 text-red-600 dark:text-red-400" />
                        </div>
                        <CardTitle className="text-sm font-semibold">Recent Expenses</CardTitle>
                      </div>
                      <button
                        className="text-xs text-primary hover:underline font-medium"
                        onClick={() => setActiveTab('expenses')}
                      >
                        View all
                      </button>
                    </div>
                  </CardHeader>
                  <CardContent className="pb-4">
                    <div className="space-y-2">
                      {expenses.slice(0, 3).map((exp) => (
                        <div key={exp.id} className="flex items-center justify-between">
                          <div className="flex items-center gap-2 min-w-0">
                            <span className="text-sm">{getExpenseCategoryMeta(exp.category).icon}</span>
                            <span className="text-xs font-medium truncate">{exp.description}</span>
                          </div>
                          <span className="text-xs font-bold text-red-600 dark:text-red-400 shrink-0 ml-2">
                            -{CURRENCY_SYMBOL}{parseFloat(String(exp.amount)).toLocaleString()}
                          </span>
                        </div>
                      ))}
                      <Separator />
                      <div className="flex justify-between text-xs font-semibold pt-0.5">
                        <span className="text-muted-foreground">Total</span>
                        <span className="text-red-600 dark:text-red-400">
                          -{CURRENCY_SYMBOL}{totalExpenses.toLocaleString()}
                        </span>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              )}
            </div>
          </div>
        </TabsContent>

        {/* ── Stops Tab (Multi-Destination) ── */}
        <TabsContent value="stops" className="mt-0">
          {trip.deliveryStops && trip.deliveryStops.length > 1 ? (
            <div className="space-y-4">
              <Card>
                <CardHeader className="pb-3">
                  <div className="flex items-center gap-2">
                    <div className="rounded-lg bg-teal-100 dark:bg-teal-900/30 p-2">
                      <MapPinned className="h-4 w-4 text-teal-600 dark:text-teal-400" />
                    </div>
                    <div>
                      <CardTitle className="text-sm font-semibold">Delivery Stops</CardTitle>
                      <CardDescription className="text-xs">{trip.deliveryStops.length} stops on this route</CardDescription>
                    </div>
                  </div>
                </CardHeader>
                <CardContent>
                  <div className="space-y-3">
                    {trip.deliveryStops
                      .sort((a, b) => a.stopOrder - b.stopOrder)
                      .map((stop, idx) => {
                        const isCompleted = stop.status === 'completed'
                        const isActive = ['arrived', 'offloading'].includes(stop.status)
                        const isPending = stop.status === 'pending'
                        const isLast = idx === trip.deliveryStops!.length - 1

                        return (
                          <motion.div
                            key={stop.id}
                            initial={{ opacity: 0, x: -10 }}
                            animate={{ opacity: 1, x: 0 }}
                            transition={{ delay: idx * 0.08 }}
                          >
                            <div className="flex items-start gap-4">
                              {/* Timeline connector */}
                              <div className="flex flex-col items-center">
                                <div className={`h-8 w-8 rounded-full flex items-center justify-center shrink-0 text-sm font-bold transition-all ${
                                  isCompleted
                                    ? 'bg-emerald-500 text-white'
                                    : isActive
                                      ? 'bg-amber-500 text-white ring-2 ring-amber-200 dark:ring-amber-800'
                                      : 'bg-muted text-muted-foreground'
                                }`}>
                                  {isCompleted ? <CheckCircle2 className="h-4 w-4" /> : idx + 1}
                                </div>
                                {!isLast && (
                                  <div className={`w-0.5 h-8 my-1 ${isCompleted ? 'bg-emerald-300 dark:bg-emerald-700' : 'bg-border'}`} />
                                )}
                              </div>

                              {/* Stop content */}
                              <div className={`flex-1 rounded-xl p-4 border transition-colors ${
                                isActive
                                  ? 'bg-amber-50 dark:bg-amber-900/10 border-amber-200 dark:border-amber-800/40'
                                  : isCompleted
                                    ? 'bg-emerald-50/50 dark:bg-emerald-900/10 border-emerald-200 dark:border-emerald-800/40'
                                    : 'bg-muted/30 border-border'
                              }`}>
                                <div className="flex items-center justify-between mb-2">
                                  <p className="text-sm font-bold">{stop.destination}</p>
                                  <Badge className={`text-[10px] ${isCompleted ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400' : isActive ? 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400' : 'bg-muted text-muted-foreground'}`}>
                                    {stop.status}
                                  </Badge>
                                </div>
                                <div className="grid grid-cols-2 gap-2 text-xs">
                                  <div>
                                    <span className="text-muted-foreground">Expected: </span>
                                    <span className="font-semibold">{stop.expectedQty} {stop.unit}</span>
                                  </div>
                                  {stop.actualQty != null && (
                                    <div>
                                      <span className="text-muted-foreground">Actual: </span>
                                      <span className={`font-semibold ${isCompleted ? 'text-emerald-600 dark:text-emerald-400' : ''}`}>{stop.actualQty} {stop.unit}</span>
                                    </div>
                                  )}
                                  {stop.customerName && (
                                    <div>
                                      <span className="text-muted-foreground">Customer: </span>
                                      <span className="font-semibold">{stop.customerName}</span>
                                    </div>
                                  )}
                                  {stop.arrivalTime && (
                                    <div>
                                      <span className="text-muted-foreground">Arrived: </span>
                                      <span className="font-semibold">{formatTimeShort(stop.arrivalTime)}</span>
                                    </div>
                                  )}
                                </div>
                                {stop.notes && (
                                  <p className="text-[10px] text-muted-foreground mt-2 pt-2 border-t">{stop.notes}</p>
                                )}
                              </div>
                            </div>
                          </motion.div>
                        )
                      })}
                  </div>
                </CardContent>
              </Card>
            </div>
          ) : (
            <Card>
              <CardContent className="py-16">
                <div className="flex flex-col items-center gap-3 text-center">
                  <div className="h-14 w-14 rounded-2xl bg-muted flex items-center justify-center">
                    <MapPinned className="h-7 w-7 text-muted-foreground" />
                  </div>
                  <div>
                    <h3 className="font-semibold text-lg">Single Destination</h3>
                    <p className="text-sm text-muted-foreground mt-1">
                      This trip has a single delivery destination.
                      {trip.destination && ` Delivering to ${trip.destination}.`}
                    </p>
                  </div>
                </div>
              </CardContent>
            </Card>
          )}
        </TabsContent>

        {/* ── Expenses Tab ── */}
        <TabsContent value="expenses" className="mt-0">
          <ExpensesPanel
            trip={trip}
            expenses={expenses}
            showExpenseForm={showExpenseForm}
            setShowExpenseForm={setShowExpenseForm}
            expCategory={expCategory}
            setExpCategory={setExpCategory}
            expDescription={expDescription}
            setExpDescription={setExpDescription}
            expAmount={expAmount}
            setExpAmount={setExpAmount}
            submittingExpense={submittingExpense}
            onLogExpense={onLogExpense}
            disabled={isTerminal}
          />
        </TabsContent>
      </Tabs>
    </>
  )
}

// ════════════════════════════════════════════════════════════════════
// PHASE-GROUPED LIFECYCLE STEPPER (for driver view)
// ════════════════════════════════════════════════════════════════════

function PhaseLifecycleStepper({ currentStatus }: { currentStatus: string }) {
  const timeline = getStatusTimeline(currentStatus)

  return (
    <div className="space-y-5">
      {timeline.map((phaseGroup) => {
        const hasActiveInPhase = phaseGroup.statuses.some((s) => s.isActive)
        const allCompletedInPhase = phaseGroup.statuses.every((s) => s.isCompleted)
        const isLastPhase = phaseGroup.phase === 'return'

        return (
          <div key={phaseGroup.phase}>
            {/* Phase header */}
            <div className="flex items-center gap-2 mb-3">
              <div className={`h-2.5 w-2.5 rounded-full transition-all ${
                allCompletedInPhase
                  ? 'bg-emerald-500'
                  : hasActiveInPhase
                    ? 'bg-amber-500'
                    : 'bg-muted'
              } ${hasActiveInPhase ? 'animate-pulse' : ''}`} />
              <span className={`text-[11px] font-bold uppercase tracking-wider transition-colors ${
                hasActiveInPhase
                  ? 'text-amber-700 dark:text-amber-400'
                  : allCompletedInPhase
                    ? 'text-emerald-600 dark:text-emerald-400'
                    : 'text-muted-foreground'
              }`}>
                {phaseGroup.phaseLabel}
              </span>
              <span className="text-[10px] text-muted-foreground">
                &middot; {phaseGroup.phaseDescription}
              </span>
              {allCompletedInPhase && (
                <CheckCircle2 className="h-3.5 w-3.5 text-emerald-500" />
              )}
            </div>

            {/* Statuses in this phase */}
            <div className="space-y-0 ml-0.5">
              {phaseGroup.statuses.map((step, idx) => {
                const isLast = idx === phaseGroup.statuses.length - 1

                return (
                  <div key={step.status} className="flex items-start gap-3">
                    {/* Connector line + dot */}
                    <div className="flex flex-col items-center">
                      <div className={`relative flex items-center justify-center h-7 w-7 rounded-full shrink-0 transition-all ${
                        step.isCompleted
                          ? 'bg-emerald-500 text-white shadow-sm'
                          : step.isActive
                            ? 'bg-amber-500 text-white shadow-md ring-2 ring-amber-200 dark:ring-amber-800'
                            : 'bg-muted text-muted-foreground'
                      }`}>
                        {step.isCompleted ? (
                          <CheckCircle2 className="h-3.5 w-3.5" />
                        ) : (
                          <span className="text-xs">{step.icon}</span>
                        )}
                        {step.isActive && (
                          <span className="absolute inset-0 rounded-full animate-ping opacity-20 bg-amber-500" />
                        )}
                      </div>
                      {!isLast && (
                        <div className={`w-0.5 h-6 transition-colors ${
                          step.isCompleted ? 'bg-emerald-500' : 'bg-border'
                        }`} />
                      )}
                    </div>

                    {/* Label */}
                    <div className={`flex-1 pt-1 pb-2 ${step.isPending ? 'opacity-40' : ''}`}>
                      <p className={`text-xs font-semibold ${step.isActive ? 'text-amber-700 dark:text-amber-400' : ''}`}>
                        {step.label}
                      </p>
                      {step.isActive && (
                        <p className="text-[10px] text-amber-600 dark:text-amber-500 font-medium mt-0.5">
                          Current stage &middot; {step.description}
                        </p>
                      )}
                    </div>
                  </div>
                )
              })}
            </div>

            {/* Phase separator */}
            {!isLastPhase && (
              <div className="border-b border-dashed mt-4" />
            )}
          </div>
        )
      })}
    </div>
  )
}

// ════════════════════════════════════════════════════════════════════
// HERO HEADER (with phase indicator)
// ════════════════════════════════════════════════════════════════════

function TripHeroHeader({
  trip, truck, progress, phase, phaseData,
}: {
  trip: Trip
  truck: { plateNumber: string; make: string; model: string }
  progress: number
  phase: string
  phaseData: { label: string; color: string }
}) {
  const statusMeta = TRIP_STATUS_META[trip.status]
  const offloadPct = trip.quantity > 0 ? Math.round(((trip.totalOffloaded || 0) / trip.quantity) * 100) : 0
  const canSeeFinancialData = useAuthStore((s) => s.canSeeFinancialData())

  return (
    <div className="relative overflow-hidden rounded-xl bg-gradient-to-br from-slate-800 via-slate-900 to-slate-950 dark:from-slate-800 dark:via-slate-900 dark:to-black p-5 sm:p-6 text-white shadow-lg">
      {/* Background pattern */}
      <div className="absolute inset-0 opacity-5">
        <div className="absolute inset-0" style={{
          backgroundImage: 'radial-gradient(circle at 1px 1px, white 1px, transparent 0)',
          backgroundSize: '24px 24px',
        }} />
      </div>
      {/* Accent glow */}
      <div className="absolute -top-20 -right-20 w-60 h-60 bg-amber-500/10 rounded-full blur-3xl" />
      <div className="absolute -bottom-10 -left-10 w-40 h-40 bg-emerald-500/10 rounded-full blur-3xl" />

      <div className="relative z-10">
        {/* Top row */}
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 mb-4">
          <div className="space-y-1">
            <div className="flex items-center gap-2 flex-wrap">
              <h1 className="text-xl sm:text-2xl font-bold tracking-tight">{trip.tripNumber}</h1>
              <StatusPill status={trip.status} />
            </div>
            <div className="flex items-center gap-2 flex-wrap">
              <p className="text-sm text-slate-300 flex items-center gap-1.5">
                <Truck className="h-3.5 w-3.5" />
                {truck.plateNumber} &middot; {truck.make} {truck.model}
              </p>
              {/* Phase badge */}
              <span
                className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold text-white/90"
                style={{ backgroundColor: phaseData.color + '33', border: `1px solid ${phaseData.color}66` }}
              >
                <span className="h-1.5 w-1.5 rounded-full" style={{ backgroundColor: phaseData.color }} />
                {phaseData.label}
              </span>
            </div>
          </div>
          <div className="flex items-center gap-4">
            {/* Offloading indicator */}
            {trip.status === 'offloading' && (
              <div className="text-right">
                <p className="text-[10px] uppercase tracking-widest text-slate-400 font-medium">Offloaded</p>
                <p className="text-lg font-bold text-violet-400">
                  {trip.totalOffloaded || 0} / {trip.quantity} {trip.unit}
                  <span className="text-xs font-normal ml-1">({offloadPct}%)</span>
                </p>
              </div>
            )}
            {canSeeFinancialData && trip.totalRevenue && (
              <div className="text-right">
                <p className="text-[10px] uppercase tracking-widest text-slate-400 font-medium">Revenue</p>
                <p className="text-2xl sm:text-3xl font-bold text-emerald-400">{CURRENCY_SYMBOL}{trip.totalRevenue.toLocaleString()}</p>
              </div>
            )}
          </div>
        </div>

        {/* Progress bar */}
        <div className="space-y-2">
          <div className="flex items-center justify-between text-xs">
            <span className="text-slate-400">
              {phaseData.label} &middot; {statusMeta?.label}
            </span>
            <span className="font-semibold text-amber-400">{progress}%</span>
          </div>
          <div className="h-2 bg-white/10 rounded-full overflow-hidden">
            <motion.div
              className="h-full rounded-full"
              style={{ backgroundColor: phaseData.color }}
              initial={{ width: 0 }}
              animate={{ width: `${progress}%` }}
              transition={{ duration: 1, ease: 'easeOut', delay: 0.3 }}
            />
          </div>
          {/* Horizontal mini lifecycle */}
          <div className="flex items-center gap-0 mt-3 overflow-x-auto pb-1">
            {ALL_TRIP_STATUSES.map((stage, idx) => {
              const currentIdx = ALL_TRIP_STATUSES.indexOf(trip.status as typeof ALL_TRIP_STATUSES[number])
              const isCompleted = idx < currentIdx
              const isActive = stage === trip.status

              return (
                <div key={stage} className="flex items-center flex-shrink-0">
                  <div className="flex flex-col items-center gap-1">
                    <div className={`w-2 h-2 rounded-full transition-colors ${
                      isCompleted ? 'bg-emerald-400' : isActive ? 'bg-amber-400 ring-2 ring-amber-400/30' : 'bg-white/20'
                    }`} />
                  </div>
                  {idx < ALL_TRIP_STATUSES.length - 1 && (
                    <div className={`w-3 sm:w-5 h-px ${idx < currentIdx ? 'bg-emerald-400/60' : 'bg-white/10'}`} />
                  )}
                </div>
              )
            })}
          </div>
        </div>
      </div>
    </div>
  )
}

// ════════════════════════════════════════════════════════════════════
// ROUTE VISUALIZATION
// ════════════════════════════════════════════════════════════════════

function RouteVisualization({ from, to, progress }: { from: string; to: string; progress: number }) {
  return (
    <div className="flex items-stretch gap-3 sm:gap-4">
      {/* Left: From */}
      <div className="flex flex-col items-center gap-2 pt-0.5">
        <div className="h-3 w-3 rounded-full bg-emerald-500 ring-4 ring-emerald-100 dark:ring-emerald-900/40" />
        <div className="w-px flex-1 bg-gradient-to-b from-emerald-300 via-amber-300 to-slate-300 dark:from-emerald-700 dark:via-amber-700 dark:to-slate-700 relative">
          {/* Moving dot */}
          <motion.div
            className="absolute -left-[3px] h-2 w-2 rounded-full bg-amber-500 ring-2 ring-amber-200 dark:ring-amber-800 shadow-md"
            initial={{ top: `${Math.min(progress, 95)}%` }}
            animate={{ top: `${Math.min(progress, 95)}%` }}
            transition={{ duration: 1.5, ease: 'easeInOut', delay: 0.5 }}
          />
        </div>
        <div className="h-3 w-3 rounded-full bg-slate-400 ring-4 ring-slate-100 dark:ring-slate-800" />
      </div>

      {/* Right: Labels */}
      <div className="flex-1 flex flex-col justify-between py-0">
        <div>
          <p className="text-[10px] uppercase tracking-widest text-muted-foreground font-semibold mb-0.5">Pickup</p>
          <p className="text-sm font-semibold">{from}</p>
        </div>

        <div className="flex items-center gap-2 py-3">
          <ArrowDownUp className="h-3.5 w-3.5 text-muted-foreground" />
          <span className="text-[11px] text-muted-foreground font-medium">
            {progress < 30 ? 'Preparing to depart' : progress < 70 ? 'En route to destination' : progress < 100 ? 'Approaching destination' : 'Delivered'}
          </span>
        </div>

        <div>
          <p className="text-[10px] uppercase tracking-widest text-muted-foreground font-semibold mb-0.5">Delivery</p>
          <p className="text-sm font-semibold">{to}</p>
        </div>
      </div>
    </div>
  )
}

// ════════════════════════════════════════════════════════════════════
// EXPENSES PANEL
// ════════════════════════════════════════════════════════════════════

interface ExpensesPanelProps {
  trip: Trip
  expenses: Array<{ id: string; category: string; description: string; amount: number; date: string }>
  showExpenseForm: boolean
  setShowExpenseForm: (v: boolean) => void
  expCategory: string
  setExpCategory: (v: string) => void
  expDescription: string
  setExpDescription: (v: string) => void
  expAmount: string
  setExpAmount: (v: string) => void
  submittingExpense: boolean
  onLogExpense: () => void
  disabled: boolean
}

function ExpensesPanel({
  expenses,
  showExpenseForm,
  setShowExpenseForm,
  expCategory,
  setExpCategory,
  expDescription,
  setExpDescription,
  expAmount,
  setExpAmount,
  submittingExpense,
  onLogExpense,
  disabled,
}: ExpensesPanelProps) {
  const totalExpenses = expenses.reduce((sum, e) => sum + parseFloat(String(e.amount)), 0)

  return (
    <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
      {/* Expense Form */}
      <div className="lg:col-span-1">
        <Card className="h-full">
          <CardHeader className="pb-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <div className="rounded-lg bg-amber-100 dark:bg-amber-900/30 p-2">
                  <Plus className="h-4 w-4 text-amber-600 dark:text-amber-400" />
                </div>
                <CardTitle className="text-sm font-semibold">Log Expense</CardTitle>
              </div>
            </div>
          </CardHeader>
          <CardContent className="space-y-3">
            {disabled ? (
              <div className="flex flex-col items-center gap-2 py-8 text-center">
                <PauseCircle className="h-8 w-8 text-muted-foreground/50" />
                <p className="text-xs text-muted-foreground">Cannot log expenses for completed trips</p>
              </div>
            ) : (
              <>
                <div className="space-y-1.5">
                  <label className="text-[11px] font-medium text-muted-foreground uppercase tracking-wider">Category</label>
                  <Select value={expCategory} onValueChange={setExpCategory}>
                    <SelectTrigger className="h-10 text-sm">
                      <SelectValue placeholder="Select category" />
                    </SelectTrigger>
                    <SelectContent>
                      {TRIP_EXPENSE_CATEGORIES.map((cat) => (
                        <SelectItem key={cat.value} value={cat.value}>
                          {cat.icon} {cat.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-1.5">
                  <label className="text-[11px] font-medium text-muted-foreground uppercase tracking-wider">Description</label>
                  <Input
                    placeholder="What was the expense for?"
                    value={expDescription}
                    onChange={(e) => setExpDescription(e.target.value)}
                    className="h-10 text-sm"
                  />
                </div>

                <div className="space-y-1.5">
                  <label className="text-[11px] font-medium text-muted-foreground uppercase tracking-wider">Amount</label>
                  <div className="relative">
                    <span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm font-semibold text-muted-foreground">
                      {CURRENCY_SYMBOL}
                    </span>
                    <Input
                      type="number"
                      placeholder="0.00"
                      value={expAmount}
                      onChange={(e) => setExpAmount(e.target.value)}
                      className="h-10 text-sm pl-8"
                    />
                  </div>
                </div>

                <Button
                  onClick={onLogExpense}
                  disabled={submittingExpense || !expCategory || !expDescription || !expAmount}
                  className="w-full h-10 bg-gradient-to-r from-amber-500 to-amber-600 hover:from-amber-600 hover:to-amber-700 text-white font-semibold text-sm"
                >
                  {submittingExpense ? (
                    <Loader2 className="h-4 w-4 animate-spin mr-2" />
                  ) : (
                    <Plus className="h-4 w-4 mr-2" />
                  )}
                  Log Expense
                </Button>
              </>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Expense List */}
      <div className="lg:col-span-2">
        <Card className="h-full">
          <CardHeader className="pb-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <div className="rounded-lg bg-red-100 dark:bg-red-900/30 p-2">
                  <Receipt className="h-4 w-4 text-red-600 dark:text-red-400" />
                </div>
                <div>
                  <CardTitle className="text-sm font-semibold">Expense History</CardTitle>
                  <CardDescription className="text-xs">{expenses.length} total entries</CardDescription>
                </div>
              </div>
              <div className="text-right">
                <p className="text-[10px] uppercase tracking-wider text-muted-foreground font-medium">Total</p>
                <p className="text-sm font-bold text-red-600 dark:text-red-400">-{CURRENCY_SYMBOL}{totalExpenses.toLocaleString()}</p>
              </div>
            </div>
          </CardHeader>
          <CardContent>
            {expenses.length === 0 ? (
              <div className="flex flex-col items-center gap-2 py-8 text-center">
                <Receipt className="h-8 w-8 text-muted-foreground/30" />
                <p className="text-xs text-muted-foreground">No expenses logged yet</p>
              </div>
            ) : (
              <div className="space-y-1">
                {expenses.map((exp) => (
                  <div key={exp.id} className="flex items-center justify-between py-2.5 px-3 rounded-lg hover:bg-muted/50 transition-colors">
                    <div className="flex items-center gap-3 min-w-0">
                      <div className="h-8 w-8 rounded-lg bg-muted flex items-center justify-center shrink-0">
                        <span className="text-sm">{getExpenseCategoryMeta(exp.category).icon}</span>
                      </div>
                      <div className="min-w-0">
                        <p className="text-xs font-semibold truncate">{exp.description}</p>
                        <p className="text-[10px] text-muted-foreground">{getExpenseCategoryMeta(exp.category).label} &middot; {formatDate(exp.date)}</p>
                      </div>
                    </div>
                    <span className="text-xs font-bold text-red-600 dark:text-red-400 shrink-0 ml-3">
                      -{CURRENCY_SYMBOL}{parseFloat(String(exp.amount)).toLocaleString()}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  )
}

// ════════════════════════════════════════════════════════════════════
// EMPTY STATES
// ════════════════════════════════════════════════════════════════════

function NoTruckAssigned() {
  return (
    <EmptyState
      icon={Truck}
      title="No Truck Assigned"
      description="You don't have a vehicle assigned yet. Please contact your fleet manager to get assigned a truck before you can manage trips."
      action={
        <Button variant="outline" className="mt-2" onClick={() => window.dispatchEvent(new CustomEvent('navigate-page', { detail: 'dashboard' }))}>
          <ArrowRightLeft className="h-4 w-4 mr-2" />
          Back to Dashboard
        </Button>
      }
    />
  )
}

function NoActiveTrips({ truck }: { truck: { plateNumber: string } }) {
  return (
    <EmptyState
      icon={CheckCircle2}
      title="No Active Trips"
      description={`You have no active trips assigned to your vehicle (${truck.plateNumber}). You'll see trip details here when a dispatcher assigns you a new trip.`}
      action={
        <Button variant="outline" className="mt-2" onClick={() => window.dispatchEvent(new CustomEvent('navigate-page', { detail: 'dashboard' }))}>
          <ArrowRightLeft className="h-4 w-4 mr-2" />
          Back to Dashboard
        </Button>
      }
    />
  )
}

// ════════════════════════════════════════════════════════════════════
// STATUS PILL
// ════════════════════════════════════════════════════════════════════

function StatusPill({ status }: { status: string }) {
  const meta = TRIP_STATUS_META[status]
  if (!meta) return null
  return (
    <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold ${meta.color}`}>
      <span className="text-[9px]">{meta.icon}</span>
      {meta.label}
    </span>
  )
}

// ════════════════════════════════════════════════════════════════════
// QUICK STAT CARD
// ════════════════════════════════════════════════════════════════════

function QuickStatCard({
  icon: Icon, label, value, subtext, colorClass, bgClass,
}: {
  icon: React.ElementType
  label: string
  value: string
  subtext?: string
  colorClass: string
  bgClass: string
}) {
  return (
    <Card>
      <CardContent className="p-4">
        <div className="flex items-center gap-3">
          <div className={`h-10 w-10 rounded-xl ${bgClass} flex items-center justify-center shrink-0`}>
            <Icon className={`h-5 w-5 ${colorClass}`} />
          </div>
          <div className="min-w-0">
            <p className="text-[11px] font-medium text-muted-foreground">{label}</p>
            <p className={`text-lg font-bold ${colorClass} truncate`}>{value}</p>
            {subtext && <p className="text-[10px] text-muted-foreground truncate">{subtext}</p>}
          </div>
        </div>
      </CardContent>
    </Card>
  )
}

// ════════════════════════════════════════════════════════════════════
// LOADING SKELETONS
// ════════════════════════════════════════════════════════════════════

function LoadingSkeleton() {
  return (
    <div className="space-y-4">
      <Skeleton className="h-32 w-full rounded-xl" />
      <div className="grid grid-cols-4 gap-3">
        {[1, 2, 3, 4].map((i) => (
          <Skeleton key={i} className="h-20 rounded-lg" />
        ))}
      </div>
      <Skeleton className="h-64 rounded-lg" />
      <Skeleton className="h-48 rounded-lg" />
    </div>
  )
}

function FleetLoadingSkeleton() {
  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <Skeleton className="h-10 w-10 rounded-xl" />
        <div className="space-y-1">
          <Skeleton className="h-6 w-40" />
          <Skeleton className="h-4 w-56" />
        </div>
      </div>
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        {[1, 2, 3, 4].map((i) => (
          <Skeleton key={i} className="h-20 rounded-lg" />
        ))}
      </div>
      <Skeleton className="h-16 rounded-lg" />
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        {[1, 2, 3].map((i) => (
          <Skeleton key={i} className="h-48 rounded-lg" />
        ))}
      </div>
    </div>
  )
}

// ════════════════════════════════════════════════════════════════════
// HELPERS
// ════════════════════════════════════════════════════════════════════

function formatTimeShort(dateStr: string): string {
  try {
    const d = new Date(dateStr)
    return d.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })
  } catch {
    return '--'
  }
}

function formatDate(dateStr: string): string {
  try {
    const d = new Date(dateStr)
    return d.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })
  } catch {
    return '--'
  }
}

function formatDateTime(dateStr: string): string {
  try {
    const d = new Date(dateStr)
    return d.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' })
  } catch {
    return '--'
  }
}
