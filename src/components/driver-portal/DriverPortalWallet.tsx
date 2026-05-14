'use client'

import * as React from 'react'
import {
  Wallet,
  Plus,
  History,
  ArrowUpRight,
  ArrowDownLeft,
  Clock,
  ChevronDown,
  ChevronUp,
  Loader2,
  CheckCircle2,
  XCircle,
  AlertCircle,
} from 'lucide-react'
import { toast } from 'sonner'

import { apiFetch } from '@/lib/api'
import { useCurrency } from '@/lib/currency-context'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Skeleton } from '@/components/ui/skeleton'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'

// ── Types ──────────────────────────────────────────────────────────────────

interface DriverPortalWalletProps {
  driver: any
}

interface WalletInfo {
  id: string
  availableBalance: number
  totalAdvances: number
  totalDeducted: number
  totalSettled: number
}

interface CashAdvance {
  id: string
  driverId: string
  amount: number
  purpose: string
  status: 'pending' | 'approved' | 'disbursed' | 'rejected'
  totalDeducted: number
  createdAt: string
  approvedAt?: string | null
  disbursedAt?: string | null
  rejectedAt?: string | null
  rejectedReason?: string | null
  tripId?: string | null
}

interface Settlement {
  id: string
  driverId: string
  month: number
  year: number
  grossEarnings: number
  totalDeductions: number
  netPay: number
  status: string
  paidAt?: string | null
  createdAt: string
}

// ── Constants ──────────────────────────────────────────────────────────────

const PURPOSE_OPTIONS = [
  { value: 'fuel', label: 'Fuel' },
  { value: 'maintenance', label: 'Vehicle Maintenance' },
  { value: 'toll', label: 'Tolls & Fees' },
  { value: 'food', label: 'Food & Accommodation' },
  { value: 'loading', label: 'Loading Charges' },
  { value: 'offloading', label: 'Offloading Charges' },
  { value: 'emergency', label: 'Emergency Repair' },
  { value: 'other', label: 'Other' },
]

const STATUS_CONFIG: Record<string, { color: string; label: string; icon: React.ReactNode }> = {
  pending: {
    color: 'bg-yellow-100 text-yellow-800 border-yellow-200',
    label: 'Pending',
    icon: <Clock className="h-3 w-3" />,
  },
  approved: {
    color: 'bg-blue-100 text-blue-800 border-blue-200',
    label: 'Approved',
    icon: <CheckCircle2 className="h-3 w-3" />,
  },
  disbursed: {
    color: 'bg-emerald-100 text-emerald-800 border-emerald-200',
    label: 'Disbursed',
    icon: <ArrowDownLeft className="h-3 w-3" />,
  },
  rejected: {
    color: 'bg-red-100 text-red-800 border-red-200',
    label: 'Rejected',
    icon: <XCircle className="h-3 w-3" />,
  },
}

const MONTH_NAMES = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
]

// ── Helpers ────────────────────────────────────────────────────────────────

function formatDate(dateStr: string): string {
  const date = new Date(dateStr)
  return date.toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  })
}

function formatPeriod(month: number, year: number): string {
  return `${MONTH_NAMES[month - 1]} ${year}`
}

function getStatusBadge(status: string) {
  const config = STATUS_CONFIG[status] ?? {
    color: 'bg-gray-100 text-gray-600 border-gray-200',
    label: status.charAt(0).toUpperCase() + status.slice(1),
    icon: <AlertCircle className="h-3 w-3" />,
  }
  return (
    <Badge
      variant="outline"
      className={`text-[11px] px-2 py-0.5 gap-1 font-medium ${config.color}`}
    >
      {config.icon}
      {config.label}
    </Badge>
  )
}

// ── Sub-components ─────────────────────────────────────────────────────────

// ── Balance Card Skeleton ──────────────────────────────────────────────────

function BalanceCardSkeleton() {
  return (
    <div className="rounded-2xl bg-gradient-to-br from-amber-500 via-amber-500 to-orange-500 p-6 text-white shadow-lg shadow-amber-500/20">
      <div className="flex items-center gap-2 mb-4">
        <Skeleton className="h-5 w-5 rounded" />
        <Skeleton className="h-4 w-28" />
      </div>
      <Skeleton className="h-12 w-40 mb-6" />
      <div className="grid grid-cols-2 gap-4">
        <Skeleton className="h-16 rounded-xl" />
        <Skeleton className="h-16 rounded-xl" />
      </div>
    </div>
  )
}

// ── Balance Card ───────────────────────────────────────────────────────────

function BalanceCard({
  wallet,
  formatCurrency,
}: {
  wallet: WalletInfo
  formatCurrency: (amount: number) => string
}) {
  return (
    <div className="rounded-2xl bg-gradient-to-br from-amber-500 via-amber-500 to-orange-500 p-6 text-white shadow-lg shadow-amber-500/20">
      {/* Header */}
      <div className="flex items-center gap-2 mb-1">
        <Wallet className="h-5 w-5 text-amber-100" />
        <span className="text-sm font-medium text-amber-100">Wallet Balance</span>
      </div>

      {/* Large balance */}
      <h2 className="text-4xl font-bold tracking-tight mt-2 mb-6">
        {formatCurrency(wallet.availableBalance)}
      </h2>

      {/* Summary stats */}
      <div className="grid grid-cols-2 gap-3">
        <div className="bg-white/15 backdrop-blur-sm rounded-xl px-4 py-3">
          <div className="flex items-center gap-1.5 mb-1">
            <ArrowUpRight className="h-3.5 w-3.5 text-amber-200" />
            <span className="text-xs text-amber-100 font-medium">Total Advances</span>
          </div>
          <p className="text-lg font-bold">{formatCurrency(wallet.totalAdvances)}</p>
        </div>
        <div className="bg-white/15 backdrop-blur-sm rounded-xl px-4 py-3">
          <div className="flex items-center gap-1.5 mb-1">
            <ArrowDownLeft className="h-3.5 w-3.5 text-amber-200" />
            <span className="text-xs text-amber-100 font-medium">Total Settled</span>
          </div>
          <p className="text-lg font-bold">{formatCurrency(wallet.totalSettled)}</p>
        </div>
      </div>
    </div>
  )
}

// ── Quick Actions Row ──────────────────────────────────────────────────────

function QuickActionsRow({
  onRequestAdvance,
  onViewHistory,
}: {
  onRequestAdvance: () => void
  onViewHistory: () => void
}) {
  return (
    <div className="grid grid-cols-2 gap-3">
      <Button
        className="gap-2 bg-amber-500 hover:bg-amber-600 text-white font-semibold rounded-xl h-12"
        onClick={onRequestAdvance}
      >
        <Plus className="h-4 w-4" />
        Request Advance
      </Button>
      <Button
        variant="outline"
        className="gap-2 border-gray-200 hover:bg-gray-50 font-semibold rounded-xl h-12"
        onClick={onViewHistory}
      >
        <History className="h-4 w-4" />
        View History
      </Button>
    </div>
  )
}

// ── Request Advance Form ───────────────────────────────────────────────────

function RequestAdvanceForm({
  driverId,
  onSubmit,
  isSubmitting,
}: {
  driverId: string
  onSubmit: (success: boolean) => void
  isSubmitting: boolean
}) {
  const [amount, setAmount] = React.useState('')
  const [purpose, setPurpose] = React.useState('')
  const [customPurpose, setCustomPurpose] = React.useState('')
  const [error, setError] = React.useState('')

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError('')

    const numAmount = parseFloat(amount)
    if (!numAmount || numAmount <= 0) {
      setError('Please enter a valid amount greater than zero.')
      return
    }

    const finalPurpose = purpose === 'other' ? customPurpose.trim() : purpose
    if (!finalPurpose) {
      setError('Please select or enter a purpose for the advance.')
      return
    }

    try {
      await apiFetch('/api/cash-advances', {
        method: 'POST',
        body: JSON.stringify({
          driverId,
          amount: numAmount,
          purpose: finalPurpose,
        }),
      })
      toast.success('Cash advance request submitted successfully!')
      setAmount('')
      setPurpose('')
      setCustomPurpose('')
      onSubmit(true)
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to submit request. Please try again.'
      setError(message)
      toast.error(message)
      onSubmit(false)
    }
  }

  return (
    <Card className="rounded-xl overflow-hidden border-amber-200/60">
      <div className="h-1 bg-gradient-to-r from-amber-400 to-orange-400" />
      <CardContent className="p-4">
        <form onSubmit={handleSubmit} className="space-y-4">
          {/* Amount */}
          <div className="space-y-2">
            <Label htmlFor="advance-amount" className="text-sm font-medium text-gray-700">
              Amount
            </Label>
            <div className="relative">
              <span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm text-gray-400 font-medium">
                GHS
              </span>
              <Input
                id="advance-amount"
                type="number"
                placeholder="0.00"
                min="1"
                step="0.01"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                className="pl-12 h-11 rounded-lg"
                disabled={isSubmitting}
              />
            </div>
          </div>

          {/* Purpose */}
          <div className="space-y-2">
            <Label htmlFor="advance-purpose" className="text-sm font-medium text-gray-700">
              Purpose
            </Label>
            <Select value={purpose} onValueChange={setPurpose} disabled={isSubmitting}>
              <SelectTrigger className="h-11 rounded-lg" id="advance-purpose">
                <SelectValue placeholder="Select a purpose" />
              </SelectTrigger>
              <SelectContent>
                {PURPOSE_OPTIONS.map((opt) => (
                  <SelectItem key={opt.value} value={opt.value}>
                    {opt.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Custom purpose for "Other" */}
          {purpose === 'other' && (
            <div className="space-y-2 animate-in fade-in slide-in-from-top-2 duration-200">
              <Label htmlFor="custom-purpose" className="text-sm font-medium text-gray-700">
                Specify Purpose
              </Label>
              <Input
                id="custom-purpose"
                type="text"
                placeholder="Describe the purpose..."
                value={customPurpose}
                onChange={(e) => setCustomPurpose(e.target.value)}
                className="h-11 rounded-lg"
                disabled={isSubmitting}
              />
            </div>
          )}

          {/* Error message */}
          {error && (
            <div className="flex items-start gap-2 rounded-lg bg-red-50 border border-red-200 px-3 py-2.5 text-sm text-red-700 animate-in fade-in slide-in-from-top-2 duration-200">
              <AlertCircle className="h-4 w-4 mt-0.5 shrink-0 text-red-500" />
              <span>{error}</span>
            </div>
          )}

          {/* Submit */}
          <Button
            type="submit"
            className="w-full gap-2 bg-amber-500 hover:bg-amber-600 text-white font-semibold rounded-lg h-11"
            disabled={isSubmitting || !amount || !purpose}
          >
            {isSubmitting ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" />
                Submitting...
              </>
            ) : (
              <>
                <Plus className="h-4 w-4" />
                Submit Request
              </>
            )}
          </Button>
        </form>
      </CardContent>
    </Card>
  )
}

// ── Advances List Skeleton ─────────────────────────────────────────────────

function AdvancesListSkeleton() {
  return (
    <Card className="rounded-xl">
      <CardHeader className="pb-3">
        <Skeleton className="h-5 w-32" />
      </CardHeader>
      <CardContent className="space-y-0 p-0">
        {[0, 1, 2, 3].map((i) => (
          <div key={i} className="flex items-center gap-3 px-4 py-3">
            <Skeleton className="h-10 w-10 rounded-lg shrink-0" />
            <div className="flex-1 min-w-0 space-y-1.5">
              <Skeleton className="h-4 w-24" />
              <Skeleton className="h-3 w-36" />
            </div>
            <div className="flex flex-col items-end gap-1 shrink-0">
              <Skeleton className="h-4 w-20" />
              <Skeleton className="h-5 w-16 rounded-full" />
            </div>
          </div>
        ))}
      </CardContent>
    </Card>
  )
}

// ── Advance Item ───────────────────────────────────────────────────────────

function AdvanceItem({
  advance,
  formatCurrency,
}: {
  advance: CashAdvance
  formatCurrency: (amount: number) => string
}) {
  return (
    <div className="flex items-center gap-3 px-4 py-3.5 hover:bg-gray-50/50 transition-colors">
      {/* Icon */}
      <div className={`flex items-center justify-center w-10 h-10 rounded-lg shrink-0 ${
        advance.status === 'disbursed'
          ? 'bg-emerald-50 text-emerald-600'
          : advance.status === 'rejected'
          ? 'bg-red-50 text-red-500'
          : advance.status === 'approved'
          ? 'bg-blue-50 text-blue-600'
          : 'bg-yellow-50 text-yellow-600'
      }`}>
        {advance.status === 'disbursed' ? (
          <ArrowDownLeft className="h-4.5 w-4.5" />
        ) : advance.status === 'rejected' ? (
          <XCircle className="h-4.5 w-4.5" />
        ) : (
          <Clock className="h-4.5 w-4.5" />
        )}
      </div>

      {/* Info */}
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <span className="text-sm font-semibold text-gray-900">
            {formatCurrency(advance.amount)}
          </span>
        </div>
        <p className="text-xs text-gray-500 mt-0.5 truncate">
          {advance.purpose}
        </p>
        <p className="text-[11px] text-gray-400 mt-0.5">
          {formatDate(advance.createdAt)}
        </p>
      </div>

      {/* Status + Deducted */}
      <div className="flex flex-col items-end gap-1.5 shrink-0">
        {getStatusBadge(advance.status)}
        {advance.totalDeducted > 0 && (
          <span className="text-[11px] text-gray-400">
            Deducted: {formatCurrency(advance.totalDeducted)}
          </span>
        )}
      </div>
    </div>
  )
}

// ── Advances List ──────────────────────────────────────────────────────────

function AdvancesList({
  driverId,
  initialLimit = 10,
  formatCurrency,
  listRef,
}: {
  driverId: string
  initialLimit?: number
  formatCurrency: (amount: number) => string
  listRef: React.RefObject<HTMLDivElement | null>
}) {
  const [advances, setAdvances] = React.useState<CashAdvance[]>([])
  const [loading, setLoading] = React.useState(true)
  const [loadingMore, setLoadingMore] = React.useState(false)
  const [hasMore, setHasMore] = React.useState(false)

  async function fetchAdvances(limit: number, append: boolean) {
    if (append) {
      setLoadingMore(true)
    } else {
      setLoading(true)
    }

    try {
      const res = await apiFetch<{ data: CashAdvance[]; total?: number }>(
        `/api/cash-advances?driverId=${driverId}&limit=${limit}`
      )
      if (res?.data) {
        setAdvances((prev) => (append ? [...prev, ...res.data.slice(prev.length)] : res.data))
        setHasMore(res.total != null ? res.data.length < res.total : res.data.length >= limit)
      }
    } catch {
      toast.error('Failed to load cash advances.')
    } finally {
      setLoading(false)
      setLoadingMore(false)
    }
  }

  React.useEffect(() => {
    fetchAdvances(initialLimit, false)
  }, [driverId, initialLimit])

  function loadMore() {
    const newLimit = advances.length + 10
    fetchAdvances(newLimit, true)
  }

  if (loading) {
    return <AdvancesListSkeleton />
  }

  return (
    <Card className="rounded-xl overflow-hidden" ref={listRef}>
      <CardHeader className="pb-2 pt-4 px-4">
        <div className="flex items-center justify-between">
          <CardTitle className="text-sm font-semibold text-gray-900">
            Cash Advances
          </CardTitle>
          <span className="text-xs text-gray-400">{advances.length} records</span>
        </div>
      </CardHeader>
      <CardContent className="p-0">
        {advances.length === 0 ? (
          <div className="flex flex-col items-center text-center py-8 px-4">
            <div className="w-14 h-14 rounded-2xl bg-gray-50 flex items-center justify-center mb-3">
              <Wallet className="h-7 w-7 text-gray-300" />
            </div>
            <p className="text-sm font-medium text-gray-600">No advances yet</p>
            <p className="text-xs text-gray-400 mt-1">
              Request a cash advance to get started.
            </p>
          </div>
        ) : (
          <div className="divide-y divide-gray-100">
            {advances.map((advance) => (
              <AdvanceItem
                key={advance.id}
                advance={advance}
                formatCurrency={formatCurrency}
              />
            ))}
          </div>
        )}

        {/* Load more */}
        {hasMore && (
          <div className="px-4 py-3 border-t border-gray-100">
            <Button
              variant="ghost"
              size="sm"
              className="w-full gap-2 text-sm text-gray-500 hover:text-gray-700"
              onClick={loadMore}
              disabled={loadingMore}
            >
              {loadingMore ? (
                <>
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  Loading...
                </>
              ) : (
                <>
                  <ChevronDown className="h-3.5 w-3.5" />
                  Load More
                </>
              )}
            </Button>
          </div>
        )}
      </CardContent>
    </Card>
  )
}

// ── Settlements Skeleton ───────────────────────────────────────────────────

function SettlementsSkeleton() {
  return (
    <Card className="rounded-xl">
      <CardHeader className="pb-3">
        <Skeleton className="h-5 w-40" />
      </CardHeader>
      <CardContent className="space-y-0 p-0">
        {[0, 1, 2].map((i) => (
          <div key={i} className="flex items-center gap-3 px-4 py-3">
            <Skeleton className="h-10 w-10 rounded-lg shrink-0" />
            <div className="flex-1 min-w-0 space-y-1.5">
              <Skeleton className="h-4 w-28" />
              <Skeleton className="h-3 w-40" />
            </div>
            <div className="flex flex-col items-end gap-1 shrink-0">
              <Skeleton className="h-4 w-20" />
              <Skeleton className="h-5 w-16 rounded-full" />
            </div>
          </div>
        ))}
      </CardContent>
    </Card>
  )
}

// ── Settlement Item ────────────────────────────────────────────────────────

function SettlementItem({
  settlement,
  formatCurrency,
}: {
  settlement: Settlement
  formatCurrency: (amount: number) => string
}) {
  const statusColors: Record<string, string> = {
    paid: 'bg-emerald-100 text-emerald-800 border-emerald-200',
    pending: 'bg-yellow-100 text-yellow-800 border-yellow-200',
    processing: 'bg-blue-100 text-blue-800 border-blue-200',
  }

  return (
    <div className="flex items-center gap-3 px-4 py-3.5 hover:bg-gray-50/50 transition-colors">
      {/* Period icon */}
      <div className="flex items-center justify-center w-10 h-10 rounded-lg bg-violet-50 text-violet-600 shrink-0">
        <Wallet className="h-4.5 w-4.5" />
      </div>

      {/* Info */}
      <div className="flex-1 min-w-0">
        <p className="text-sm font-semibold text-gray-900">
          {formatPeriod(settlement.month, settlement.year)}
        </p>
        <div className="flex items-center gap-2 mt-0.5 text-xs text-gray-500">
          <span>Gross: {formatCurrency(settlement.grossEarnings)}</span>
          <span className="text-gray-300">|</span>
          <span>Net: {formatCurrency(settlement.netPay)}</span>
        </div>
        {settlement.paidAt && (
          <p className="text-[11px] text-gray-400 mt-0.5">
            Paid on {formatDate(settlement.paidAt)}
          </p>
        )}
      </div>

      {/* Status badge */}
      <Badge
        variant="outline"
        className={`text-[11px] px-2 py-0.5 font-medium shrink-0 ${
          statusColors[settlement.status] ?? 'bg-gray-100 text-gray-600 border-gray-200'
        }`}
      >
        {settlement.status.charAt(0).toUpperCase() + settlement.status.slice(1)}
      </Badge>
    </div>
  )
}

// ── Settlements Summary ────────────────────────────────────────────────────

function SettlementsSummary({
  driverId,
  formatCurrency,
}: {
  driverId: string
  formatCurrency: (amount: number) => string
}) {
  const [settlements, setSettlements] = React.useState<Settlement[]>([])
  const [loading, setLoading] = React.useState(true)
  const [expanded, setExpanded] = React.useState(false)

  React.useEffect(() => {
    let cancelled = false

    async function fetchSettlements() {
      setLoading(true)
      try {
        const res = await apiFetch<{ data: Settlement[] }>(
          `/api/settlements?driverId=${driverId}&limit=5`
        )
        if (!cancelled && res?.data) {
          setSettlements(res.data)
        }
      } catch {
        // Non-critical
      } finally {
        if (!cancelled) setLoading(false)
      }
    }

    fetchSettlements()
    return () => { cancelled = true }
  }, [driverId])

  if (loading) {
    return <SettlementsSkeleton />
  }

  return (
    <Card className="rounded-xl overflow-hidden">
      <CardHeader className="pb-2 pt-4 px-4">
        <button
          type="button"
          className="flex items-center justify-between w-full text-left"
          onClick={() => setExpanded(!expanded)}
        >
          <CardTitle className="text-sm font-semibold text-gray-900">
            Recent Settlements
          </CardTitle>
          {expanded ? (
            <ChevronUp className="h-4 w-4 text-gray-400" />
          ) : (
            <ChevronDown className="h-4 w-4 text-gray-400" />
          )}
        </button>
      </CardHeader>

      {expanded && (
        <CardContent className="p-0 animate-in fade-in slide-in-from-top-2 duration-200">
          {settlements.length === 0 ? (
            <div className="flex flex-col items-center text-center py-8 px-4">
              <div className="w-14 h-14 rounded-2xl bg-gray-50 flex items-center justify-center mb-3">
                <History className="h-7 w-7 text-gray-300" />
              </div>
              <p className="text-sm font-medium text-gray-600">No settlements yet</p>
              <p className="text-xs text-gray-400 mt-1">
                Settlements will appear here once processed.
              </p>
            </div>
          ) : (
            <div className="divide-y divide-gray-100">
              {settlements.map((s) => (
                <SettlementItem
                  key={s.id}
                  settlement={s}
                  formatCurrency={formatCurrency}
                />
              ))}
            </div>
          )}
        </CardContent>
      )}

      {!expanded && settlements.length > 0 && (
        <CardContent className="px-4 pb-3">
          <p className="text-xs text-gray-400 text-center">
            Tap to view {settlements.length} recent settlement{settlements.length !== 1 ? 's' : ''}
          </p>
        </CardContent>
      )}
    </Card>
  )
}

// ── Main Component ─────────────────────────────────────────────────────────

export function DriverPortalWallet({ driver }: DriverPortalWalletProps) {
  const { formatCurrency } = useCurrency()

  // ── State ──────────────────────────────────────────────────────────────

  const [wallet, setWallet] = React.useState<WalletInfo | null>(null)
  const [loadingWallet, setLoadingWallet] = React.useState(true)
  const [showAdvanceForm, setShowAdvanceForm] = React.useState(false)
  const [isSubmitting, setIsSubmitting] = React.useState(false)
  const [refreshKey, setRefreshKey] = React.useState(0)

  const historyRef = React.useRef<HTMLDivElement>(null)

  const driverId = driver?.id

  // ── Fetch wallet info ──────────────────────────────────────────────────

  React.useEffect(() => {
    if (!driverId) {
      setLoadingWallet(false)
      return
    }

    let cancelled = false

    async function fetchWalletInfo() {
      setLoadingWallet(true)
      try {
        const res = await apiFetch<{ data: WalletInfo[] }>(
          `/api/driver-wallets?driverId=${driverId}&limit=1`
        )
        if (!cancelled && res?.data?.[0]) {
          setWallet(res.data[0])
        } else if (!cancelled) {
          // No wallet record yet — create a default view
          setWallet({
            id: 'new',
            availableBalance: 0,
            totalAdvances: 0,
            totalDeducted: 0,
            totalSettled: 0,
          })
        }
      } catch {
        // Non-critical — show empty wallet
        if (!cancelled) {
          setWallet({
            id: 'error',
            availableBalance: 0,
            totalAdvances: 0,
            totalDeducted: 0,
            totalSettled: 0,
          })
        }
      } finally {
        if (!cancelled) setLoadingWallet(false)
      }
    }

    fetchWalletInfo()
    return () => { cancelled = true }
  }, [driverId, refreshKey])

  // ── Handlers ───────────────────────────────────────────────────────────

  function handleRequestAdvance() {
    setShowAdvanceForm((prev) => !prev)
  }

  function handleViewHistory() {
    historyRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' })
  }

  function handleAdvanceSubmitted(_success: boolean) {
    setShowAdvanceForm(false)
    // Refresh wallet data and advances list
    setRefreshKey((prev) => prev + 1)
  }

  // ── No driver state ────────────────────────────────────────────────────

  if (!driver) {
    return (
      <div className="p-4 space-y-4 pb-6">
        <BalanceCardSkeleton />
        <div className="grid grid-cols-2 gap-3">
          <Skeleton className="h-12 rounded-xl" />
          <Skeleton className="h-12 rounded-xl" />
        </div>
        <AdvancesListSkeleton />
        <SettlementsSkeleton />
      </div>
    )
  }

  // ── Render ─────────────────────────────────────────────────────────────

  return (
    <div className="p-4 space-y-4 pb-6">
      {/* ── Section 1: Balance Card ──────────────────────────────────────── */}
      {loadingWallet ? (
        <BalanceCardSkeleton />
      ) : wallet ? (
        <BalanceCard wallet={wallet} formatCurrency={formatCurrency} />
      ) : null}

      {/* ── Section 2: Quick Actions ─────────────────────────────────────── */}
      <QuickActionsRow
        onRequestAdvance={handleRequestAdvance}
        onViewHistory={handleViewHistory}
      />

      {/* ── Section 3: Request Advance Form (collapsible) ────────────────── */}
      {showAdvanceForm && driverId && (
        <div className="animate-in fade-in slide-in-from-top-2 duration-200">
          <RequestAdvanceForm
            driverId={driverId}
            onSubmit={handleAdvanceSubmitted}
            isSubmitting={isSubmitting}
          />
        </div>
      )}

      {/* ── Section 4: Cash Advances List ────────────────────────────────── */}
      {driverId && (
        <AdvancesList
          key={`advances-${refreshKey}`}
          driverId={driverId}
          initialLimit={20}
          formatCurrency={formatCurrency}
          listRef={historyRef}
        />
      )}

      {/* ── Section 5: Settlements Summary ───────────────────────────────── */}
      {driverId && (
        <SettlementsSummary
          driverId={driverId}
          formatCurrency={formatCurrency}
        />
      )}
    </div>
  )
}
