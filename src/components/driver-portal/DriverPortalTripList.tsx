'use client'

import * as React from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import {
  ArrowLeft,
  MapPin,
  Package,
  DollarSign,
  Clock,
  Filter,
  Plus,
  ChevronRight,
  ArrowRight,
  RefreshCw,
  Route,
  Loader2,
  X,
  CheckCircle2,
  CircleDot,
  Circle,
} from 'lucide-react'
import { toast } from 'sonner'

import { apiFetch, type Trip } from '@/lib/api'
import {
  TRIP_STATUS_META,
  ALL_TRIP_STATUSES,
  TRIP_EXPENSE_CATEGORIES,
  getAdvanceAction,
  getStatusTimeline,
  isTerminalStatus,
  getExpenseCategoryMeta,
} from '@/lib/trip-lifecycle'
import { useCurrency } from '@/lib/currency-context'
import { Card, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Skeleton } from '@/components/ui/skeleton'

// ── Types ──────────────────────────────────────────────────────────────────

interface DriverPortalTripListProps {
  driver: {
    id: string
    firstName: string
    lastName: string
    employeeId?: string
    phone?: string
    status: string
    totalTrips?: number
    trucks?: Array<{ id: string; plateNumber: string; make?: string; model?: string }>
  } | null
  onNavigate?: (page: string, params?: Record<string, string>) => void
  /** When the parent navigates here with a tripId (e.g. from Dashboard), show its detail */
  tripId?: string | null
}

type FilterTab = 'all' | 'active' | 'completed' | 'cancelled'

interface TripExpense {
  id: string
  tripId?: string
  category: string
  description: string
  amount: number
  date: string
  createdAt?: string
}

// ── Constants ──────────────────────────────────────────────────────────────

const FILTER_TABS: { key: FilterTab; label: string }[] = [
  { key: 'all', label: 'All' },
  { key: 'active', label: 'Active' },
  { key: 'completed', label: 'Completed' },
  { key: 'cancelled', label: 'Cancelled' },
]

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

const PAGE_SIZE = 20

// ── Animation Variants ─────────────────────────────────────────────────────

const listVariants = {
  initial: { opacity: 0, x: 20 },
  animate: { opacity: 1, x: 0 },
  exit: { opacity: 0, x: -20 },
}

const detailVariants = {
  initial: { opacity: 0, x: 20 },
  animate: { opacity: 1, x: 0 },
  exit: { opacity: 0, x: -20 },
}

const sharedTransition = {
  type: 'tween' as const,
  ease: 'easeInOut' as const,
  duration: 0.2,
}

const itemStagger = {
  animate: { transition: { staggerChildren: 0.04 } },
}

const itemFadeIn = {
  initial: { opacity: 0, y: 8 },
  animate: { opacity: 1, y: 0 },
}

// ── Helpers ────────────────────────────────────────────────────────────────

function formatNumber(n: number): string {
  return new Intl.NumberFormat('en-US').format(n)
}

function formatDate(dateStr: string): string {
  return new Date(dateStr).toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  })
}

function formatDateTime(dateStr: string): string {
  return new Date(dateStr).toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  })
}

function truncate(str: string, maxLen: number): string {
  if (str.length <= maxLen) return str
  return str.slice(0, maxLen) + '…'
}

function applyFilter(trips: Trip[], filter: FilterTab): Trip[] {
  if (filter === 'all') return trips
  if (filter === 'active') return trips.filter((t) => ACTIVE_STATUSES.has(t.status))
  if (filter === 'completed') return trips.filter((t) => t.status === 'completed')
  if (filter === 'cancelled') return trips.filter((t) => t.status === 'cancelled')
  return trips
}

// ── Trip Card Skeleton ─────────────────────────────────────────────────────

function TripCardSkeleton() {
  return (
    <Card className="rounded-xl">
      <CardContent className="p-4 space-y-3">
        <div className="flex items-center justify-between">
          <div className="space-y-1.5">
            <Skeleton className="h-4.5 w-28" />
            <Skeleton className="h-3 w-24" />
          </div>
          <Skeleton className="h-5 w-20 rounded-full" />
        </div>
        <div className="flex items-center gap-2 bg-gray-50 rounded-lg px-3 py-2.5">
          <Skeleton className="h-4 w-4 rounded" />
          <Skeleton className="h-4 flex-1" />
        </div>
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-1.5">
            <Skeleton className="h-3.5 w-3.5" />
            <Skeleton className="h-3.5 w-32" />
          </div>
          <Skeleton className="h-4 w-20" />
        </div>
      </CardContent>
    </Card>
  )
}

// ── Empty State ────────────────────────────────────────────────────────────

function TripsEmptyState({ filter }: { filter: FilterTab }) {
  const filterLabel = FILTER_TABS.find((t) => t.key === filter)?.label ?? filter
  return (
    <div className="flex flex-col items-center justify-center py-16 px-4 text-center">
      <div className="rounded-full bg-gray-50 p-4 mb-4">
        <Route className="h-8 w-8 text-gray-300" />
      </div>
      <h3 className="text-base font-semibold text-gray-900 mb-1">
        {filter === 'all' ? 'No trips yet' : `No ${filterLabel.toLowerCase()} trips`}
      </h3>
      <p className="text-sm text-gray-500 max-w-[260px]">
        {filter === 'all'
          ? "Your trip history will appear here once you're assigned trips."
          : `You don't have any ${filterLabel.toLowerCase()} trips at the moment.`}
      </p>
    </div>
  )
}

// ── Trip Card (List Item) ──────────────────────────────────────────────────

function TripCard({
  trip,
  onTap,
}: {
  trip: Trip
  onTap: (trip: Trip) => void
}) {
  const { formatCurrency } = useCurrency()
  const statusMeta = TRIP_STATUS_META[trip.status]

  return (
    <Card
      className="rounded-xl cursor-pointer hover:shadow-md transition-shadow duration-200 active:scale-[0.99] active:transition-transform"
      onClick={() => onTap(trip)}
      role="button"
      tabIndex={0}
      aria-label={`View details for trip ${trip.tripNumber}`}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault()
          onTap(trip)
        }
      }}
    >
      <CardContent className="p-4 space-y-3">
        {/* Header: Trip number + Date + Status */}
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0">
            <p className="text-sm font-bold text-gray-900 truncate">
              {trip.tripNumber}
            </p>
            <p className="text-xs text-gray-500 mt-0.5 flex items-center gap-1">
              <Clock className="h-3 w-3" />
              {formatDate(trip.departureTime)}
            </p>
          </div>
          <div className="flex flex-col items-end gap-1.5 shrink-0">
            <Badge className={statusMeta?.color ?? 'bg-gray-100 text-gray-600'}>
              {statusMeta?.icon && <span className="mr-0.5">{statusMeta.icon}</span>}
              {statusMeta?.label ?? trip.status}
            </Badge>
          </div>
        </div>

        {/* Route */}
        <div className="flex items-center gap-2 bg-gray-50 rounded-lg px-3 py-2.5">
          <MapPin className="h-4 w-4 text-amber-500 shrink-0" />
          <div className="flex-1 min-w-0 flex items-center gap-1.5">
            <span className="text-sm font-medium text-gray-900 truncate">
              {truncate(trip.loadingLocation, 20)}
            </span>
            <ArrowRight className="h-3.5 w-3.5 text-gray-400 shrink-0" />
            <span className="text-sm font-medium text-gray-900 truncate">
              {truncate(trip.destination, 20)}
            </span>
          </div>
        </div>

        {/* Cargo info */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-1.5 text-sm text-gray-600 min-w-0">
            <Package className="h-3.5 w-3.5 text-gray-400 shrink-0" />
            <span className="truncate">
              {trip.itemName} &times; {trip.quantity} {trip.unit}
            </span>
          </div>
        </div>

        {/* Chevron */}
        <div className="flex justify-end -mt-1">
          <ChevronRight className="h-4 w-4 text-gray-300" />
        </div>
      </CardContent>
    </Card>
  )
}

// ── Status Timeline (Detail View) ──────────────────────────────────────────

function StatusTimeline({ currentStatus }: { currentStatus: string }) {
  const timeline = getStatusTimeline(currentStatus)
  const hasReachedPhase = (statuses: readonly string[]): boolean => {
    const currentIdx = ALL_TRIP_STATUSES.indexOf(
      currentStatus as (typeof ALL_TRIP_STATUSES)[number],
    )
    if (currentIdx === -1 && currentStatus === 'completed') return true
    return statuses.some(
      (s) => ALL_TRIP_STATUSES.indexOf(s) <= currentIdx,
    )
  }

  return (
    <div className="space-y-4">
      {timeline.map((phase) => {
        const reached = hasReachedPhase(phase.statuses)
        return (
          <div key={phase.phase} className={reached ? 'opacity-100' : 'opacity-40'}>
            {/* Phase label */}
            <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2">
              {phase.phaseLabel}
            </p>

            {/* Phase steps */}
            <div className="space-y-0">
              {phase.statuses.map((step, idx) => {
                const isLast = idx === phase.statuses.length - 1
                const statusIdx = ALL_TRIP_STATUSES.indexOf(step)
                const currentIdx = ALL_TRIP_STATUSES.indexOf(
                  currentStatus as (typeof ALL_TRIP_STATUSES)[number],
                )
                const stepReached =
                  currentStatus === 'completed' ||
                  (currentIdx >= 0 && statusIdx <= currentIdx)
                const isActive = step === currentStatus
                const meta = TRIP_STATUS_META[step]

                return (
                  <div key={step} className="flex gap-3">
                    {/* Timeline line + dot */}
                    <div className="flex flex-col items-center">
                      <div
                        className={`flex items-center justify-center w-6 h-6 rounded-full shrink-0 ${
                          isActive
                            ? 'bg-amber-500 ring-2 ring-amber-200'
                            : stepReached
                              ? 'bg-emerald-500'
                              : 'bg-gray-200'
                        }`}
                      >
                        {stepReached && !isActive ? (
                          <CheckCircle2 className="h-3.5 w-3.5 text-white" />
                        ) : isActive ? (
                          <CircleDot className="h-3 w-3 text-white" />
                        ) : (
                          <Circle className="h-3 w-3 text-gray-400" />
                        )}
                      </div>
                      {!isLast && (
                        <div
                          className={`w-0.5 flex-1 min-h-[16px] ${
                            stepReached ? 'bg-emerald-400' : 'bg-gray-200'
                          }`}
                        />
                      )}
                    </div>

                    {/* Step label */}
                    <div className={`pb-3 ${isLast ? 'pb-0' : ''}`}>
                      <p
                        className={`text-sm font-medium ${
                          isActive
                            ? 'text-amber-700'
                            : stepReached
                              ? 'text-gray-700'
                              : 'text-gray-400'
                        }`}
                      >
                        {meta?.icon && <span className="mr-1">{meta.icon}</span>}
                        {meta?.label ?? step}
                      </p>
                      {isActive && meta?.description && (
                        <p className="text-xs text-amber-600/70 mt-0.5">
                          {meta.description}
                        </p>
                      )}
                    </div>
                  </div>
                )
              })}
            </div>
          </div>
        )
      })}
    </div>
  )
}

// ── Expense Form (Detail View) ─────────────────────────────────────────────

function ExpenseForm({
  tripId,
  onSubmitted,
  onCancel,
}: {
  tripId: string
  onSubmitted: () => void
  onCancel: () => void
}) {
  const [category, setCategory] = React.useState('')
  const [description, setDescription] = React.useState('')
  const [amount, setAmount] = React.useState('')
  const [date, setDate] = React.useState(() => new Date().toISOString().split('T')[0])
  const [submitting, setSubmitting] = React.useState(false)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (submitting) return
    if (!category || !amount || !date) {
      toast.error('Please fill in category, amount, and date.')
      return
    }

    setSubmitting(true)
    try {
      await apiFetch(`/api/trips/${tripId}/expenses`, {
        method: 'POST',
        body: JSON.stringify({
          category,
          description,
          amount: parseFloat(amount),
          date,
        }),
      })
      toast.success('Expense added successfully')
      onSubmitted()
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to add expense')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-3">
      {/* Category select */}
      <div>
        <label className="text-xs font-medium text-gray-600 mb-1 block">Category</label>
        <select
          value={category}
          onChange={(e) => setCategory(e.target.value)}
          className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-xs outline-none focus-visible:border-ring focus-visible:ring-ring/50 focus-visible:ring-[3px] disabled:cursor-not-allowed disabled:opacity-50"
        >
          <option value="">Select category</option>
          {TRIP_EXPENSE_CATEGORIES.map((cat) => (
            <option key={cat.value} value={cat.value}>
              {cat.icon} {cat.label}
            </option>
          ))}
        </select>
      </div>

      {/* Description */}
      <div>
        <label className="text-xs font-medium text-gray-600 mb-1 block">Description</label>
        <Input
          placeholder="e.g. Diesel at Shell station"
          value={description}
          onChange={(e) => setDescription(e.target.value)}
        />
      </div>

      {/* Amount + Date row */}
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="text-xs font-medium text-gray-600 mb-1 block">Amount</label>
          <Input
            type="number"
            step="0.01"
            min="0"
            placeholder="0.00"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
          />
        </div>
        <div>
          <label className="text-xs font-medium text-gray-600 mb-1 block">Date</label>
          <Input
            type="date"
            value={date}
            onChange={(e) => setDate(e.target.value)}
          />
        </div>
      </div>

      {/* Actions */}
      <div className="flex gap-2 pt-1">
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="flex-1"
          onClick={onCancel}
          disabled={submitting}
        >
          Cancel
        </Button>
        <Button
          type="submit"
          size="sm"
          className="flex-1 bg-amber-500 hover:bg-amber-600 text-white"
          disabled={submitting}
        >
          {submitting ? (
            <Loader2 className="h-3.5 w-3.5 animate-spin mr-1" />
          ) : (
            <Plus className="h-3.5 w-3.5 mr-1" />
          )}
          {submitting ? 'Adding...' : 'Add Expense'}
        </Button>
      </div>
    </form>
  )
}

// ── Expense List Item ──────────────────────────────────────────────────────

function ExpenseItem({ expense }: { expense: TripExpense }) {
  const { formatCurrency } = useCurrency()
  const catMeta = getExpenseCategoryMeta(expense.category)

  return (
    <div className="flex items-center gap-3 py-2.5">
      <div className="flex items-center justify-center w-9 h-9 rounded-lg bg-gray-50 shrink-0 text-base">
        {catMeta.icon}
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium text-gray-900 truncate">
          {catMeta.label}
        </p>
        <p className="text-xs text-gray-500 truncate">
          {expense.description || 'No description'}
          {' · '}
          {formatDate(expense.date)}
        </p>
      </div>
      <span className="text-sm font-semibold text-gray-900 shrink-0">
        {formatCurrency(expense.amount)}
      </span>
    </div>
  )
}

// ── Trip Detail View ───────────────────────────────────────────────────────

function TripDetailView({
  tripId,
  onBack,
}: {
  tripId: string
  onBack: () => void
}) {
  const { formatCurrency } = useCurrency()

  const [trip, setTrip] = React.useState<Trip | null>(null)
  const [expenses, setExpenses] = React.useState<TripExpense[]>([])
  const [loading, setLoading] = React.useState(true)
  const [loadingExpenses, setLoadingExpenses] = React.useState(true)
  const [advancing, setAdvancing] = React.useState(false)
  const [showExpenseForm, setShowExpenseForm] = React.useState(false)
  const [timelineOpen, setTimelineOpen] = React.useState(false)

  // Fetch trip detail
  React.useEffect(() => {
    if (!tripId) return
    let cancelled = false

    async function fetchDetail() {
      setLoading(true)
      try {
        const data = await apiFetch<Trip>(`/api/trips/${tripId}`)
        if (!cancelled && data) setTrip(data)
      } catch {
        toast.error('Failed to load trip details')
      } finally {
        if (!cancelled) setLoading(false)
      }
    }

    fetchDetail()
    return () => { cancelled = true }
  }, [tripId])

  // Fetch expenses
  async function fetchExpenses() {
    if (!tripId) return
    setLoadingExpenses(true)
    try {
      const data = await apiFetch<TripExpense[]>(`/api/trips/${tripId}/expenses`)
      if (data) setExpenses(Array.isArray(data) ? data : [])
    } catch {
      // Expenses are non-critical
    } finally {
      setLoadingExpenses(false)
    }
  }

  React.useEffect(() => {
    fetchExpenses()
  }, [tripId])

  // Advance status handler
  async function handleAdvanceStatus() {
    if (!trip || advancing) return
    setAdvancing(true)
    try {
      const updated = await apiFetch<Trip>(`/api/trips/${tripId}/advance-status`, {
        method: 'POST',
        body: JSON.stringify({}),
      })
      if (updated) {
        const newMeta = TRIP_STATUS_META[updated.status]
        toast.success(`Status updated to "${newMeta?.label ?? updated.status}"`)
        setTrip(updated)
        setTimelineOpen(true)
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to update status')
    } finally {
      setAdvancing(false)
    }
  }

  const advanceLabel = trip ? getAdvanceAction(trip.status) : null
  const statusMeta = trip ? TRIP_STATUS_META[trip.status] : null
  const totalExpenses = expenses.reduce((sum, e) => sum + e.amount, 0)

  // Loading skeleton
  if (loading) {
    return (
      <div className="p-4 space-y-4">
        <div className="flex items-center gap-3">
          <Skeleton className="h-8 w-8 rounded-lg" />
          <Skeleton className="h-5 w-32" />
        </div>
        <Skeleton className="h-40 w-full rounded-xl" />
        <Skeleton className="h-32 w-full rounded-xl" />
        <Skeleton className="h-48 w-full rounded-xl" />
      </div>
    )
  }

  if (!trip) {
    return (
      <div className="p-4">
        <Button variant="ghost" size="sm" onClick={onBack} className="gap-1.5 mb-4">
          <ArrowLeft className="h-4 w-4" />
          Back
        </Button>
        <div className="flex flex-col items-center text-center py-12">
          <Route className="h-8 w-8 text-gray-300 mb-3" />
          <p className="text-sm text-gray-500">Trip not found</p>
        </div>
      </div>
    )
  }

  return (
    <motion.div
      variants={detailVariants}
      initial="initial"
      animate="animate"
      exit="exit"
      transition={sharedTransition}
      className="p-4 space-y-4 pb-6"
    >
      {/* ── Back Button ───────────────────────────────────────────────── */}
      <button
        type="button"
        onClick={onBack}
        className="flex items-center gap-1.5 text-sm font-medium text-gray-600 hover:text-gray-900 transition-colors"
      >
        <ArrowLeft className="h-4 w-4" />
        Back to Trips
      </button>

      {/* ── Trip Header Card ──────────────────────────────────────────── */}
      <Card className="rounded-xl overflow-hidden">
        {/* Accent bar */}
        <div className="h-1 bg-gradient-to-r from-amber-400 to-orange-400" />
        <CardContent className="p-4 space-y-3">
          <div className="flex items-start justify-between gap-2">
            <div className="min-w-0">
              <p className="text-xs text-gray-500 font-medium uppercase tracking-wide">Trip Details</p>
              <h2 className="text-lg font-bold text-gray-900 mt-0.5">{trip.tripNumber}</h2>
            </div>
            <Badge className={statusMeta?.color ?? 'bg-gray-100 text-gray-600'}>
              {statusMeta?.icon && <span className="mr-0.5">{statusMeta.icon}</span>}
              {statusMeta?.label ?? trip.status}
            </Badge>
          </div>
          <p className="text-xs text-gray-500 flex items-center gap-1">
            <Clock className="h-3 w-3" />
            {formatDateTime(trip.departureTime)}
            {trip.arrivalTime && (
              <> → {formatDateTime(trip.arrivalTime)}</>
            )}
          </p>
        </CardContent>
      </Card>

      {/* ── Route Visualization ───────────────────────────────────────── */}
      <Card className="rounded-xl">
        <CardContent className="p-4">
          <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-3">Route</h3>
          <div className="flex items-center gap-3">
            {/* Origin */}
            <div className="flex flex-col items-center">
              <div className="w-3 h-3 rounded-full bg-emerald-500 ring-2 ring-emerald-200" />
              <div className="w-0.5 h-8 bg-gray-200" />
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-semibold text-gray-900 truncate">{trip.loadingLocation}</p>
              <p className="text-xs text-gray-400">Pickup</p>
            </div>
          </div>

          <div className="ml-[5px] pl-3 border-l-2 border-dashed border-gray-200 py-1 my-0">
            <ArrowRight className="h-4 w-4 text-amber-400" />
          </div>

          <div className="flex items-center gap-3">
            {/* Destination */}
            <div className="flex flex-col items-center">
              <div className="w-3 h-3 rounded-full bg-amber-500 ring-2 ring-amber-200" />
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-semibold text-gray-900 truncate">{trip.destination}</p>
              <p className="text-xs text-gray-400">Delivery</p>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* ── Cargo Details ─────────────────────────────────────────────── */}
      <Card className="rounded-xl">
        <CardContent className="p-4">
          <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-3">Cargo</h3>
          <div className="flex items-center gap-3 bg-gray-50 rounded-lg px-3 py-3">
            <div className="flex items-center justify-center w-10 h-10 rounded-lg bg-amber-50">
              <Package className="h-5 w-5 text-amber-500" />
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-semibold text-gray-900 truncate">{trip.itemName}</p>
              <p className="text-xs text-gray-500">
                Quantity: <span className="font-medium text-gray-700">{formatNumber(trip.quantity)}</span>{' '}
                {trip.unit}
              </p>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* ── Trip Expenses Summary ─────────────────────────────────────── */}
      <Card className="rounded-xl">
        <CardContent className="p-4">
          <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-3">Trip Expenses</h3>
          <div className="space-y-2.5">
            <div className="flex items-center justify-between">
              <span className="text-sm text-gray-600 flex items-center gap-1.5">
                <DollarSign className="h-3.5 w-3.5 text-gray-400" />
                Total Expenses
              </span>
              <span className="text-sm font-semibold text-red-500">
                {loadingExpenses ? (
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                ) : totalExpenses > 0 ? (
                  formatCurrency(totalExpenses)
                ) : (
                  '—'
                )}
              </span>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* ── Status Timeline ───────────────────────────────────────────── */}
      <Card className="rounded-xl">
        <CardContent className="p-4">
          <button
            type="button"
            className="flex items-center justify-between w-full text-left"
            onClick={() => setTimelineOpen(!timelineOpen)}
          >
            <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Trip Progress</h3>
            <motion.div
              animate={{ rotate: timelineOpen ? 90 : 0 }}
              transition={{ duration: 0.15 }}
            >
              <ChevronRight className="h-4 w-4 text-gray-400" />
            </motion.div>
          </button>

          <AnimatePresence>
            {timelineOpen && (
              <motion.div
                initial={{ height: 0, opacity: 0 }}
                animate={{ height: 'auto', opacity: 1 }}
                exit={{ height: 0, opacity: 0 }}
                transition={{ duration: 0.2 }}
                className="overflow-hidden"
              >
                <div className="pt-4">
                  <StatusTimeline currentStatus={trip.status} />
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </CardContent>
      </Card>

      {/* ── Advance Status Button ─────────────────────────────────────── */}
      {advanceLabel && (
        <Button
          size="lg"
          className="w-full gap-2 bg-amber-500 hover:bg-amber-600 text-white rounded-xl h-12"
          disabled={advancing}
          onClick={handleAdvanceStatus}
        >
          {advancing ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <RefreshCw className="h-4 w-4" />
          )}
          {advancing ? 'Updating...' : advanceLabel}
        </Button>
      )}

      {/* ── Expenses Section ──────────────────────────────────────────── */}
      <Card className="rounded-xl">
        <CardContent className="p-4">
          <div className="flex items-center justify-between mb-3">
            <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wide">
              Trip Expenses
            </h3>
            {!isTerminalStatus(trip.status) && !showExpenseForm && (
              <Button
                variant="ghost"
                size="sm"
                className="h-7 text-xs text-amber-600 hover:text-amber-700 hover:bg-amber-50 gap-1 px-2"
                onClick={() => setShowExpenseForm(true)}
              >
                <Plus className="h-3 w-3" />
                Add
              </Button>
            )}
          </div>

          {/* Expense form */}
          <AnimatePresence>
            {showExpenseForm && (
              <motion.div
                initial={{ height: 0, opacity: 0 }}
                animate={{ height: 'auto', opacity: 1 }}
                exit={{ height: 0, opacity: 0 }}
                transition={{ duration: 0.2 }}
                className="overflow-hidden mb-3"
              >
                <div className="bg-gray-50 rounded-lg p-3">
                  <ExpenseForm
                    tripId={tripId}
                    onSubmitted={() => {
                      setShowExpenseForm(false)
                      fetchExpenses()
                    }}
                    onCancel={() => setShowExpenseForm(false)}
                  />
                </div>
              </motion.div>
            )}
          </AnimatePresence>

          {/* Expense list */}
          {loadingExpenses ? (
            <div className="space-y-2 py-2">
              {[0, 1, 2].map((i) => (
                <div key={i} className="flex items-center gap-3">
                  <Skeleton className="h-9 w-9 rounded-lg" />
                  <div className="flex-1 space-y-1.5">
                    <Skeleton className="h-3.5 w-24" />
                    <Skeleton className="h-3 w-36" />
                  </div>
                  <Skeleton className="h-4 w-16" />
                </div>
              ))}
            </div>
          ) : expenses.length > 0 ? (
            <div className="divide-y divide-gray-100">
              {expenses.map((expense) => (
                <ExpenseItem key={expense.id} expense={expense} />
              ))}
            </div>
          ) : (
            <div className="flex flex-col items-center text-center py-6">
              <DollarSign className="h-7 w-7 text-gray-200 mb-2" />
              <p className="text-xs text-gray-400">No expenses logged yet</p>
            </div>
          )}
        </CardContent>
      </Card>
    </motion.div>
  )
}

// ── Main Component ─────────────────────────────────────────────────────────

export function DriverPortalTripList({ driver, onNavigate, tripId }: DriverPortalTripListProps) {
  const driverId = driver?.id

  // List view state
  const [trips, setTrips] = React.useState<Trip[]>([])
  const [allTrips, setAllTrips] = React.useState<Trip[]>([])
  const [loading, setLoading] = React.useState(true)
  const [refreshing, setRefreshing] = React.useState(false)
  const [activeFilter, setActiveFilter] = React.useState<FilterTab>('all')
  const [page, setPage] = React.useState(1)
  const [hasMore, setHasMore] = React.useState(false)
  const [loadingMore, setLoadingMore] = React.useState(false)

  // Detail view state
  const [selectedTripId, setSelectedTripId] = React.useState<string | null>(tripId ?? null)

  // When the parent provides a new tripId via navigation, show that trip's detail
  React.useEffect(() => {
    if (tripId) {
      setSelectedTripId(tripId)
    }
  }, [tripId])

  // ── Fetch trips ─────────────────────────────────────────────────────

  async function fetchTrips(reset = true) {
    if (!driverId) return

    if (reset) {
      setLoading(true)
      setPage(1)
    } else {
      setLoadingMore(true)
    }

    const currentPage = reset ? 1 : page
    try {
      const res = await apiFetch<{ data: Trip[]; total?: number }>(
        `/api/trips?driverId=${driverId}&limit=${PAGE_SIZE}&page=${currentPage}`
      )
      if (res?.data) {
        if (reset) {
          setTrips(res.data)
          setAllTrips(res.data)
        } else {
          setTrips((prev) => [...prev, ...res.data])
          setAllTrips((prev) => [...prev, ...res.data])
        }
        // Check if there are more pages
        setHasMore(res.data.length >= PAGE_SIZE)
      }
    } catch {
      toast.error('Failed to load trips')
    } finally {
      setLoading(false)
      setRefreshing(false)
      setLoadingMore(false)
    }
  }

  React.useEffect(() => {
    fetchTrips(true)
  }, [driverId])

  // ── Pull-to-refresh ─────────────────────────────────────────────────

  function handleRefresh() {
    if (refreshing) return
    setRefreshing(true)
    setSelectedTripId(null)
    fetchTrips(true)
  }

  // ── Load more ───────────────────────────────────────────────────────

  function handleLoadMore() {
    if (loadingMore) return
    const nextPage = page + 1
    setPage(nextPage)
    fetchTrips(false)
  }

  // ── Open detail view ────────────────────────────────────────────────

  function handleTripTap(trip: Trip) {
    setSelectedTripId(trip.id)
    // Also allow parent navigation
    onNavigate?.('trips', { tripId: trip.id })
  }

  // ── Back from detail ────────────────────────────────────────────────

  function handleBackFromDetail() {
    setSelectedTripId(null)
  }

  // ── Filtered trips ──────────────────────────────────────────────────

  const filteredTrips = applyFilter(trips, activeFilter)

  // ── Detail view ─────────────────────────────────────────────────────

  if (selectedTripId) {
    return (
      <AnimatePresence mode="wait">
        <TripDetailView
          key={`detail-${selectedTripId}`}
          tripId={selectedTripId}
          onBack={handleBackFromDetail}
        />
      </AnimatePresence>
    )
  }

  // ── Loading skeleton ────────────────────────────────────────────────

  if (loading) {
    return (
      <div className="p-4 space-y-4">
        <div className="flex items-center justify-between">
          <Skeleton className="h-6 w-24" />
          <Skeleton className="h-5 w-10 rounded-full" />
        </div>
        <div className="flex gap-2">
          {[0, 1, 2, 3].map((i) => (
            <Skeleton key={i} className="h-8 w-16 rounded-full" />
          ))}
        </div>
        {[0, 1, 2, 3].map((i) => (
          <TripCardSkeleton key={i} />
        ))}
      </div>
    )
  }

  // ── List view ───────────────────────────────────────────────────────

  const totalTrips = allTrips.length

  return (
    <motion.div
      variants={listVariants}
      initial="initial"
      animate="animate"
      exit="exit"
      transition={sharedTransition}
      className="p-4 space-y-4 pb-6"
    >
      {/* ── Header ───────────────────────────────────────────────────── */}
      <div className="flex items-center justify-between">
        <h1 className="text-lg font-bold text-gray-900">My Trips</h1>
        <Badge variant="secondary" className="bg-amber-50 text-amber-700 border-amber-200 text-xs font-semibold">
          {totalTrips}
        </Badge>
      </div>

      {/* ── Filter Tabs ──────────────────────────────────────────────── */}
      <div className="flex gap-2 overflow-x-auto no-scrollbar -mx-4 px-4 pb-1">
        {FILTER_TABS.map((tab) => {
          const isActive = activeFilter === tab.key
          return (
            <button
              key={tab.key}
              type="button"
              onClick={() => setActiveFilter(tab.key)}
              className={`
                shrink-0 flex items-center gap-1.5 px-4 py-1.5 rounded-full text-sm font-medium
                transition-all duration-200 border
                ${
                  isActive
                    ? 'bg-amber-500 text-white border-amber-500 shadow-sm shadow-amber-500/25'
                    : 'bg-white text-gray-600 border-gray-200 hover:border-gray-300 hover:text-gray-900'
                }
              `}
            >
              <Filter className="h-3 w-3" />
              {tab.label}
            </button>
          )
        })}
      </div>

      {/* ── Refresh button ───────────────────────────────────────────── */}
      <div className="flex justify-end">
        <Button
          variant="ghost"
          size="sm"
          className="h-8 text-xs text-gray-500 hover:text-gray-700 gap-1.5"
          onClick={handleRefresh}
          disabled={refreshing}
        >
          <RefreshCw className={`h-3 w-3 ${refreshing ? 'animate-spin' : ''}`} />
          {refreshing ? 'Refreshing...' : 'Refresh'}
        </Button>
      </div>

      {/* ── Trip List ────────────────────────────────────────────────── */}
      {filteredTrips.length === 0 ? (
        <TripsEmptyState filter={activeFilter} />
      ) : (
        <motion.div
          variants={itemStagger}
          initial="initial"
          animate="animate"
          className="space-y-3"
        >
          {filteredTrips.map((trip) => (
            <motion.div key={trip.id} variants={itemFadeIn}>
              <TripCard trip={trip} onTap={handleTripTap} />
            </motion.div>
          ))}
        </motion.div>
      )}

      {/* ── Load More ────────────────────────────────────────────────── */}
      {hasMore && !loading && filteredTrips.length > 0 && (
        <div className="flex justify-center pt-2">
          <Button
            variant="outline"
            size="sm"
            className="gap-1.5 text-xs"
            onClick={handleLoadMore}
            disabled={loadingMore}
          >
            {loadingMore ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
            ) : (
              <ChevronRight className="h-3.5 w-3.5" />
            )}
            {loadingMore ? 'Loading...' : 'Load More'}
          </Button>
        </div>
      )}
    </motion.div>
  )
}
