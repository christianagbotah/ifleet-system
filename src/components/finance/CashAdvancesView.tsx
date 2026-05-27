'use client'

import * as React from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import {
  Banknote, Plus, Eye, CheckCircle, XCircle, Clock, TrendingUp,
  Wallet, Search, Filter, RefreshCw, Loader2, AlertCircle,
  ChevronDown, ChevronLeft, ChevronRight, User, Phone, Smartphone,
  MapPin, StickyNote, Route, X, Ban, CircleDollarSign,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Skeleton } from '@/components/ui/skeleton'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Separator } from '@/components/ui/separator'
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Checkbox } from '@/components/ui/checkbox'
import { EmptyState } from '@/components/ui/empty-state'
import { StatsCard } from '@/components/ui/stats-card'
import {
  Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription,
} from '@/components/ui/sheet'
import {
  Dialog, DialogBody, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter,
} from '@/components/ui/dialog'
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from '@/components/ui/alert-dialog'
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select'
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table'
import { SearchableSelect } from '@/components/ui/searchable-select'
import { CURRENCY_SYMBOL } from '@/lib/constants'
import { apiFetch, fetchDrivers, type Driver, type Trip } from '@/lib/api'
import { useAuthStore } from '@/lib/store/auth'
import { useEntityHighlight } from '@/lib/hooks/useEntityHighlight'
import { toast } from 'sonner'

import { DatePicker } from '@/components/ui/date-picker'

// ==================== TYPES ====================

interface CashAdvance {
  id: string
  driverId: string
  tripId: string | null
  amount: number
  purpose: string
  paymentMethod: string
  mobileMoneyRef: string | null
  mobileMoneyNetwork: string | null
  status: string
  approvedBy: string | null
  approvedAt: string | null
  rejectionReason: string | null
  disbursedBy: string | null
  disbursedAt: string | null
  totalDeducted: number
  remainingBalance: number
  requestDate: string
  notes: string | null
  createdAt: string
  driver: { id: string; firstName: string; lastName: string; phone: string }
  trip: { id: string; tripNumber: string; loadingLocation: string; destination: string } | null
}

interface AdvanceSummary {
  pendingAmount: number
  pendingCount: number
  outstandingAmount: number
  outstandingCount: number
  thisMonthAmount: number
  thisMonthCount: number
  avgAmount: number
  totalCount: number
}

interface DriverWallet {
  id: string
  driverId: string
  availableBalance: number
  totalAdvances: number
  totalDeducted: number
  totalSettled: number
  monthlyAdvanceLimit: number | null
  monthlyAdvancesThisMonth: number
  lastAdvanceDate: string | null
  mobileMoneyNumber: string | null
  mobileMoneyNetwork: string | null
  preferredPaymentMethod: string
  createdAt: string
  updatedAt: string
  driver: { id: string; firstName: string; lastName: string; phone: string; status: string }
  recentAdvances?: CashAdvance[]
}

// ==================== CONSTANTS ====================

const STATUS_CONFIG: Record<string, { label: string; color: string }> = {
  pending: { label: 'Pending', color: 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400' },
  approved: { label: 'Approved', color: 'bg-sky-100 text-sky-700 dark:bg-sky-900/30 dark:text-sky-400' },
  disbursed: { label: 'Disbursed', color: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400' },
  partially_deducted: { label: 'Partial', color: 'bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-400' },
  fully_deducted: { label: 'Settled', color: 'bg-teal-100 text-teal-700 dark:bg-teal-900/30 dark:text-teal-400' },
  rejected: { label: 'Rejected', color: 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400' },
}

const PURPOSE_OPTIONS = [
  { value: 'food', label: 'Food & Meals' },
  { value: 'tolls', label: 'Tolls' },
  { value: 'police', label: 'Police / Checkpoint' },
  { value: 'fuel_topup', label: 'Fuel Top-up' },
  { value: 'emergency', label: 'Emergency' },
  { value: 'loading_fees', label: 'Loading Fees' },
  { value: 'offloading_fees', label: 'Offloading Fees' },
  { value: 'other', label: 'Other' },
]

const PAYMENT_METHODS = [
  { value: 'cash', label: 'Cash' },
  { value: 'mobile_money', label: 'Mobile Money' },
]

const MOBILE_NETWORKS = [
  { value: 'mtn', label: 'MTN Mobile Money' },
  { value: 'vodafone', label: 'Vodafone Cash' },
  { value: 'airteltigo', label: 'AirtelTigo Money' },
]

const containerVariants = {
  show: { transition: { staggerChildren: 0.04 } },
}
const itemVariants = {
  show: { opacity: 1, y: 0 },
  hidden: { opacity: 0, y: 12 },
}

// ==================== HELPERS ====================

function formatCurrency(amount: number): string {
  return `${CURRENCY_SYMBOL}${Math.abs(amount).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
}

function formatDate(dateStr: string): string {
  return new Date(dateStr).toLocaleDateString('en-GB', {
    day: '2-digit', month: 'short', year: 'numeric',
  })
}

function formatDateTime(dateStr: string): string {
  return new Date(dateStr).toLocaleString('en-GB', {
    day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit',
  })
}

function getPurposeLabel(value: string): string {
  return PURPOSE_OPTIONS.find(p => p.value === value)?.label || value
}

function getNetworkLabel(value: string): string {
  return MOBILE_NETWORKS.find(n => n.value === value)?.label || value
}

// ==================== CASH ADVANCE FORM DIALOG ====================

function CashAdvanceFormDialog({
  open, onOpenChange, onCreated,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  onCreated: () => void
}) {
  const [drivers, setDrivers] = React.useState<Driver[]>([])
  const [driverId, setDriverId] = React.useState('')
  const [amount, setAmount] = React.useState('')
  const [purpose, setPurpose] = React.useState('')
  const [paymentMethod, setPaymentMethod] = React.useState('cash')
  const [mobileMoneyNetwork, setMobileMoneyNetwork] = React.useState('')
  const [mobileMoneyNumber, setMobileMoneyNumber] = React.useState('')
  const [mobileMoneyRef, setMobileMoneyRef] = React.useState('')
  const [notes, setNotes] = React.useState('')
  const [tripId, setTripId] = React.useState('')
  const [trips, setTrips] = React.useState<Trip[]>([])
  const [submitting, setSubmitting] = React.useState(false)

  React.useEffect(() => {
    if (open) {
      fetchDrivers({ status: 'active', limit: 100 })
        .then(res => setDrivers(res.data))
        .catch(() => {})
      // Reset form
      setDriverId('')
      setAmount('')
      setPurpose('')
      setPaymentMethod('cash')
      setMobileMoneyNetwork('')
      setMobileMoneyNumber('')
      setMobileMoneyRef('')
      setNotes('')
      setTripId('')
    }
  }, [open])

  React.useEffect(() => {
    if (driverId) {
      apiFetch<{ data: Trip[] }>('/api/trips?status=in_transit&limit=50')
        .then(res => setTrips(res.data || []))
        .catch(() => setTrips([]))
    } else {
      setTrips([])
    }
  }, [driverId])

  const driverOptions = React.useMemo(() => drivers.map(d => ({
    value: d.id,
    label: `${d.firstName} ${d.lastName}`,
    description: d.phone,
  })), [drivers])

  const tripOptions = React.useMemo(() => trips
    .filter(t => !t.driverId || t.driverId === driverId)
    .map(t => ({
      value: t.id,
      label: t.tripNumber,
      description: `${t.loadingLocation} → ${t.destination}`,
    })), [trips, driverId])

  async function handleSubmit() {
    if (!driverId || !amount || !purpose) {
      toast.error('Driver, amount, and purpose are required')
      return
    }
    if (parseFloat(amount) <= 0) {
      toast.error('Amount must be greater than zero')
      return
    }
    if (paymentMethod === 'mobile_money' && !mobileMoneyNumber) {
      toast.error('Mobile money number is required')
      return
    }

    setSubmitting(true)
    try {
      await apiFetch('/api/cash-advances', {
        method: 'POST',
        body: JSON.stringify({
          driverId,
          tripId: tripId || undefined,
          amount: parseFloat(amount),
          purpose,
          paymentMethod,
          mobileMoneyNetwork: paymentMethod === 'mobile_money' ? mobileMoneyNetwork : undefined,
          mobileMoneyRef: paymentMethod === 'mobile_money' ? mobileMoneyRef : undefined,
          notes: notes || undefined,
        }),
      })
      toast.success('Cash advance request created successfully')
      onOpenChange(false)
      onCreated()
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to create cash advance')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Banknote className="h-5 w-5 text-amber-500" />
            New Cash Advance
          </DialogTitle>
          <DialogDescription>
            Request a cash advance for a driver for trip-related expenses.
          </DialogDescription>
        </DialogHeader>

        <DialogBody className="space-y-4 py-2">
          {/* Driver Selection */}
          <div className="space-y-2">
            <Label className="text-sm font-medium">Driver *</Label>
            <SearchableSelect
              options={driverOptions}
              value={driverId}
              onValueChange={setDriverId}
              placeholder="Select a driver..."
              emptyMessage="No drivers found"
              searchPlaceholder="Search by name or phone..."
              alwaysSearchable
            />
          </div>

          {/* Amount */}
          <div className="space-y-2">
            <Label className="text-sm font-medium">Amount (GHS) *</Label>
            <div className="relative">
              <span className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground text-sm font-medium">{CURRENCY_SYMBOL}</span>
              <Input
                type="number"
                value={amount}
                onChange={e => setAmount(e.target.value)}
                placeholder="0.00"
                className="pl-8"
                min="0"
                step="0.01"
              />
            </div>
          </div>

          {/* Purpose */}
          <div className="space-y-2">
            <Label className="text-sm font-medium">Purpose *</Label>
            <Select value={purpose} onValueChange={setPurpose}>
              <SelectTrigger>
                <SelectValue placeholder="Select purpose..." />
              </SelectTrigger>
              <SelectContent>
                {PURPOSE_OPTIONS.map(p => (
                  <SelectItem key={p.value} value={p.value}>{p.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Trip Link */}
          <div className="space-y-2">
            <Label className="text-sm font-medium">Link to Trip (optional)</Label>
            <SearchableSelect
              options={tripOptions}
              value={tripId}
              onValueChange={setTripId}
              placeholder="No trip linked"
              emptyMessage="No active trips"
              searchPlaceholder="Search trips..."
              alwaysSearchable
            />
          </div>

          {/* Payment Method */}
          <div className="space-y-2">
            <Label className="text-sm font-medium">Payment Method</Label>
            <div className="grid grid-cols-2 gap-2">
              {PAYMENT_METHODS.map(pm => (
                <Button
                  key={pm.value}
                  type="button"
                  variant={paymentMethod === pm.value ? 'default' : 'outline'}
                  className={paymentMethod === pm.value ? 'bg-amber-500 hover:bg-amber-600 text-white' : ''}
                  onClick={() => setPaymentMethod(pm.value)}
                >
                  {pm.value === 'cash' ? (
                    <Banknote className="mr-2 h-4 w-4" />
                  ) : (
                    <Smartphone className="mr-2 h-4 w-4" />
                  )}
                  {pm.label}
                </Button>
              ))}
            </div>
          </div>

          {/* Mobile Money Fields */}
          {paymentMethod === 'mobile_money' && (
            <motion.div
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: 'auto' }}
              exit={{ opacity: 0, height: 0 }}
              className="space-y-3 rounded-lg border border-sky-200 dark:border-sky-800 bg-sky-50 dark:bg-sky-950/20 p-3"
            >
              <p className="text-xs font-medium text-sky-600 dark:text-sky-400">Mobile Money Details</p>
              <div className="space-y-2">
                <Label className="text-xs font-medium">Network</Label>
                <Select value={mobileMoneyNetwork} onValueChange={setMobileMoneyNetwork}>
                  <SelectTrigger>
                    <SelectValue placeholder="Select network..." />
                  </SelectTrigger>
                  <SelectContent>
                    {MOBILE_NETWORKS.map(n => (
                      <SelectItem key={n.value} value={n.value}>{n.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label className="text-xs font-medium">Phone Number</Label>
                <Input
                  type="tel"
                  value={mobileMoneyNumber}
                  onChange={e => setMobileMoneyNumber(e.target.value)}
                  placeholder="024 XXX XXXX"
                />
              </div>
              <div className="space-y-2">
                <Label className="text-xs font-medium">Transaction Reference (optional)</Label>
                <Input
                  value={mobileMoneyRef}
                  onChange={e => setMobileMoneyRef(e.target.value)}
                  placeholder="Enter reference after sending..."
                />
              </div>
            </motion.div>
          )}

          {/* Notes */}
          <div className="space-y-2">
            <Label className="text-sm font-medium">Notes</Label>
            <Textarea
              value={notes}
              onChange={e => setNotes(e.target.value)}
              placeholder="Additional notes..."
              rows={3}
            />
          </div>
        </DialogBody>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button
            onClick={handleSubmit}
            disabled={!driverId || !amount || !purpose || submitting}
            className="bg-amber-500 hover:bg-amber-600 text-white"
          >
            {submitting ? (
              <><Loader2 className="mr-2 h-4 w-4 animate-spin" /> Creating...</>
            ) : (
              <><Plus className="mr-2 h-4 w-4" /> Create Advance</>
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

// ==================== REJECT DIALOG ====================

function RejectDialog({
  open, onOpenChange, onRejected, advanceId,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  onRejected: () => void
  advanceId: string | null
}) {
  const [reason, setReason] = React.useState('')
  const [submitting, setSubmitting] = React.useState(false)

  React.useEffect(() => {
    if (open) setReason('')
  }, [open])

  async function handleReject() {
    if (!advanceId || !reason.trim()) {
      toast.error('Rejection reason is required')
      return
    }
    setSubmitting(true)
    try {
      await apiFetch(`/api/cash-advances/${advanceId}/reject`, {
        method: 'POST',
        body: JSON.stringify({ reason: reason.trim() }),
      })
      toast.success('Cash advance rejected')
      onOpenChange(false)
      onRejected()
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to reject')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-red-600">
            <XCircle className="h-5 w-5" />
            Reject Cash Advance
          </DialogTitle>
          <DialogDescription>
            Please provide a reason for rejecting this advance request.
          </DialogDescription>
        </DialogHeader>
        <DialogBody className="space-y-3 py-2">
          <div className="space-y-2">
            <Label className="text-sm font-medium">Rejection Reason *</Label>
            <Textarea
              value={reason}
              onChange={e => setReason(e.target.value)}
              placeholder="Explain why this advance is being rejected..."
              rows={3}
            />
          </div>
        </DialogBody>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button
            variant="destructive"
            onClick={handleReject}
            disabled={!reason.trim() || submitting}
          >
            {submitting ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Ban className="mr-2 h-4 w-4" />}
            Reject Advance
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

// ==================== WALLET DETAIL SHEET ====================

function WalletDetailSheet({
  wallet, open, onOpenChange,
}: {
  wallet: DriverWallet | null
  open: boolean
  onOpenChange: (open: boolean) => void
}) {
  const [loading, setLoading] = React.useState(false)

  React.useEffect(() => {
    if (wallet?.driverId && open) {
      setLoading(true)
      apiFetch<DriverWallet>(`/api/driver-wallets/${wallet.id}`)
        .then(data => { /* wallet data already loaded */ })
        .catch(() => {})
        .finally(() => setLoading(false))
    }
  }, [wallet?.driverId, wallet?.id, open])

  if (!wallet) return null

  const recentAdvances = wallet.recentAdvances || []

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="w-full sm:max-w-lg">
        <div className="space-y-6 p-6">
          <SheetHeader>
            <SheetTitle className="flex items-center gap-2">
              <Wallet className="h-5 w-5 text-amber-500" />
              Driver Wallet
            </SheetTitle>
            <SheetDescription>
              {wallet.driver.firstName} {wallet.driver.lastName}
            </SheetDescription>
          </SheetHeader>

          {/* Balance Card */}
          <div className="rounded-xl border-2 border-amber-200 dark:border-amber-800 bg-gradient-to-br from-amber-50 to-orange-50 dark:from-amber-950/40 dark:to-orange-950/40 p-5 space-y-3">
            <p className="text-sm font-medium text-muted-foreground">Available Balance</p>
            <p className={`text-3xl font-bold ${wallet.availableBalance >= 0 ? 'text-emerald-600' : 'text-red-600'}`}>
              {wallet.availableBalance < 0 ? '-' : ''}{formatCurrency(wallet.availableBalance)}
            </p>
            <p className="text-xs text-muted-foreground">
              {wallet.availableBalance >= 0
                ? 'Fleet owes driver this amount'
                : 'Driver owes fleet this amount'}
            </p>
          </div>

          {/* Wallet Stats */}
          <div className="grid grid-cols-2 gap-3">
            <Card>
              <CardContent className="p-3">
                <p className="text-xs text-muted-foreground">Total Advances</p>
                <p className="text-lg font-bold text-red-600">{formatCurrency(wallet.totalAdvances)}</p>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="p-3">
                <p className="text-xs text-muted-foreground">Total Deducted</p>
                <p className="text-lg font-bold text-sky-600">{formatCurrency(wallet.totalDeducted)}</p>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="p-3">
                <p className="text-xs text-muted-foreground">Total Settled</p>
                <p className="text-lg font-bold text-emerald-600">{formatCurrency(wallet.totalSettled)}</p>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="p-3">
                <p className="text-xs text-muted-foreground">This Month</p>
                <p className="text-lg font-bold text-amber-600">{formatCurrency(wallet.monthlyAdvancesThisMonth)}</p>
              </CardContent>
            </Card>
          </div>

          {/* Mobile Money Settings */}
          {(wallet.mobileMoneyNumber || wallet.mobileMoneyNetwork) && (
            <>
              <Separator />
              <div className="space-y-2">
                <h4 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide flex items-center gap-1.5">
                  <Smartphone className="h-4 w-4" /> Mobile Money
                </h4>
                <div className="rounded-lg border bg-muted/30 p-3 space-y-1.5 text-sm">
                  {wallet.mobileMoneyNetwork && (
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Network</span>
                      <span className="font-medium">{getNetworkLabel(wallet.mobileMoneyNetwork)}</span>
                    </div>
                  )}
                  {wallet.mobileMoneyNumber && (
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Number</span>
                      <span className="font-medium">{wallet.mobileMoneyNumber}</span>
                    </div>
                  )}
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Preferred</span>
                    <span className="font-medium">{wallet.preferredPaymentMethod === 'cash' ? 'Cash' : 'Mobile Money'}</span>
                  </div>
                </div>
              </div>
            </>
          )}

          {/* Monthly Limit */}
          {wallet.monthlyAdvanceLimit && (
            <>
              <Separator />
              <div className="space-y-2">
                <h4 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">Monthly Limit</h4>
                <div className="rounded-lg border bg-muted/30 p-3">
                  <div className="flex justify-between text-sm">
                    <span className="text-muted-foreground">Limit</span>
                    <span className="font-medium">{formatCurrency(wallet.monthlyAdvanceLimit)}</span>
                  </div>
                  <div className="flex justify-between text-sm mt-1">
                    <span className="text-muted-foreground">Used This Month</span>
                    <span className={`font-medium ${wallet.monthlyAdvancesThisMonth > wallet.monthlyAdvanceLimit ? 'text-red-600' : ''}`}>
                      {formatCurrency(wallet.monthlyAdvancesThisMonth)}
                    </span>
                  </div>
                  <div className="mt-2 h-2 rounded-full bg-muted overflow-hidden">
                    <div
                      className={`h-full rounded-full transition-all ${wallet.monthlyAdvancesThisMonth > wallet.monthlyAdvanceLimit ? 'bg-red-500' : 'bg-amber-500'}`}
                      style={{ width: `${Math.min(100, (wallet.monthlyAdvancesThisMonth / wallet.monthlyAdvanceLimit) * 100)}%` }}
                    />
                  </div>
                </div>
              </div>
            </>
          )}

          {/* Recent Advances */}
          <Separator />
          <div className="space-y-2">
            <h4 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">Recent Advances</h4>
            {recentAdvances.length > 0 ? (
              <div className="space-y-2 max-h-64 overflow-y-auto">
                {recentAdvances.map(advance => (
                  <div key={advance.id} className="flex items-center justify-between rounded-lg border bg-card p-3 text-sm">
                    <div className="min-w-0">
                      <p className="font-medium truncate">{getPurposeLabel(advance.purpose)}</p>
                      <p className="text-xs text-muted-foreground">{formatDate(advance.requestDate)}</p>
                    </div>
                    <div className="text-right shrink-0 ml-2">
                      <p className="font-semibold">{formatCurrency(advance.amount)}</p>
                      <Badge className={STATUS_CONFIG[advance.status]?.color || ''} variant="outline">
                        {STATUS_CONFIG[advance.status]?.label || advance.status}
                      </Badge>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-sm text-muted-foreground italic">No advances yet</p>
            )}
          </div>

          {/* Last Advance Date */}
          {wallet.lastAdvanceDate && (
            <>
              <Separator />
              <div className="flex items-center justify-between text-sm">
                <span className="text-muted-foreground">Last Advance</span>
                <span className="font-medium">{formatDate(wallet.lastAdvanceDate)}</span>
              </div>
            </>
          )}
        </div>
      </SheetContent>
    </Sheet>
  )
}

// ==================== MAIN VIEW ====================

export function CashAdvancesView() {
  const [advances, setAdvances] = React.useState<CashAdvance[]>([])
  const [summary, setSummary] = React.useState<AdvanceSummary | null>(null)
  const [loading, setLoading] = React.useState(true)
  const [error, setError] = React.useState<string | null>(null)
  const [total, setTotal] = React.useState(0)
  const [page, setPage] = React.useState(1)
  const limit = 20

  // Filters
  const [activeTab, setActiveTab] = React.useState('all')
  const [searchQuery, setSearchQuery] = React.useState('')
  const [filterDriverId, setFilterDriverId] = React.useState('')
  const [filterPaymentMethod, setFilterPaymentMethod] = React.useState('')
  const [dateFrom, setDateFrom] = React.useState('')
  const [dateTo, setDateTo] = React.useState('')
  const [showFilters, setShowFilters] = React.useState(false)
  const [filterDrivers, setFilterDrivers] = React.useState<Driver[]>([])

  // Load driver list for filter dropdown
  React.useEffect(() => {
    fetchDrivers({ status: 'active', limit: 200 })
      .then(res => setFilterDrivers(res.data || []))
      .catch(() => {})
  }, [])

  // Actions
  const [actionLoading, setActionLoading] = React.useState<string | null>(null)
  const [formDialogOpen, setFormDialogOpen] = React.useState(false)
  const [rejectDialogOpen, setRejectDialogOpen] = React.useState(false)
  const [rejectAdvanceId, setRejectAdvanceId] = React.useState<string | null>(null)

  // Wallet
  const [walletSheetOpen, setWalletSheetOpen] = React.useState(false)
  const [selectedWallet, setSelectedWallet] = React.useState<DriverWallet | null>(null)

  // Bulk
  const [selectedIds, setSelectedIds] = React.useState<Set<string>>(new Set())
  const [bulkLoading, setBulkLoading] = React.useState(false)

  const { user } = useAuthStore()

  const isAdmin = user?.role === 'Admin' || user?.role === 'Manager'

  const { highlightEntityId, highlightClassName, scrollIntoView } = useEntityHighlight('cashadvance')
  const rowRefs = React.useRef<Record<string, HTMLElement | null>>({})

  // Load advances
  const loadData = React.useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const params = new URLSearchParams()
      params.set('limit', String(limit))
      params.set('page', String(page))

      if (activeTab !== 'all') params.set('status', activeTab)
      if (searchQuery) params.set('search', searchQuery)
      if (filterDriverId) params.set('driverId', filterDriverId)
      if (dateFrom) params.set('dateFrom', dateFrom)
      if (dateTo) params.set('dateTo', dateTo)

      const res = await apiFetch<{ data: CashAdvance[]; total: number; summary: AdvanceSummary }>(
        `/api/cash-advances?${params.toString()}`
      )
      setAdvances(res.data || [])
      setTotal(res.total || 0)
      setSummary(res.summary || null)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load advances')
    } finally {
      setLoading(false)
    }
  }, [activeTab, searchQuery, filterDriverId, dateFrom, dateTo, page])

  React.useEffect(() => {
    loadData()
  }, [loadData])

  // Scroll to highlighted row after data loads
  React.useEffect(() => {
    if (highlightEntityId && rowRefs.current[highlightEntityId]) {
      scrollIntoView(rowRefs.current[highlightEntityId])
    }
  }, [highlightEntityId, advances, scrollIntoView])

  // Clear selection on filter changes
  React.useEffect(() => {
    setSelectedIds(new Set())
  }, [activeTab, searchQuery, filterDriverId, dateFrom, dateTo])

  const totalPages = Math.ceil(total / limit)

  // Selection
  function toggleSelect(id: string) {
    setSelectedIds(prev => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  function toggleSelectAll() {
    if (selectedIds.size === advances.length) {
      setSelectedIds(new Set())
    } else {
      setSelectedIds(new Set(advances.map(a => a.id)))
    }
  }

  const isAllSelected = advances.length > 0 && selectedIds.size === advances.length
  const isSomeSelected = selectedIds.size > 0 && selectedIds.size < advances.length

  // Actions
  async function handleApprove(id: string) {
    setActionLoading(id)
    try {
      await apiFetch(`/api/cash-advances/${id}/approve`, { method: 'POST' })
      toast.success('Cash advance approved')
      loadData()
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to approve')
    } finally {
      setActionLoading(null)
    }
  }

  async function handleDisburse(id: string) {
    setActionLoading(id)
    try {
      await apiFetch(`/api/cash-advances/${id}/disburse`, { method: 'POST' })
      toast.success('Cash advance disbursed')
      loadData()
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to disburse')
    } finally {
      setActionLoading(null)
    }
  }

  function handleReject(id: string) {
    setRejectAdvanceId(id)
    setRejectDialogOpen(true)
  }

  async function handleBulkApprove() {
    if (selectedIds.size === 0) return
    setBulkLoading(true)
    try {
      const results = await Promise.allSettled(
        Array.from(selectedIds).map(id => apiFetch(`/api/cash-advances/${id}/approve`, { method: 'POST' }))
      )
      const succeeded = results.filter(r => r.status === 'fulfilled').length
      const failed = results.filter(r => r.status === 'rejected').length
      toast.success(`${succeeded} advance(s) approved${failed > 0 ? `, ${failed} failed` : ''}`)
      setSelectedIds(new Set())
      loadData()
    } catch (err) {
      toast.error('Bulk approve failed')
    } finally {
      setBulkLoading(false)
    }
  }

  async function handleViewWallet(driverId: string) {
    try {
      // Try to fetch wallet, fall back to constructing a basic one
      const wallet = await apiFetch<DriverWallet>(`/api/driver-wallets/${driverId}`).catch(() => null)
      if (wallet) {
        setSelectedWallet(wallet)
      } else {
        // Wallet doesn't exist yet — create a fallback view
        const advance = advances.find(a => a.driverId === driverId)
        if (advance) {
          setSelectedWallet({
            id: '',
            driverId,
            availableBalance: 0,
            totalAdvances: 0,
            totalDeducted: 0,
            totalSettled: 0,
            monthlyAdvanceLimit: null,
            monthlyAdvancesThisMonth: 0,
            lastAdvanceDate: null,
            mobileMoneyNumber: null,
            mobileMoneyNetwork: null,
            preferredPaymentMethod: 'cash',
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
            driver: advance.driver,
            recentAdvances: [],
          })
        }
      }
      setWalletSheetOpen(true)
    } catch (err) {
      toast.error('Failed to load wallet')
    }
  }

  const pendingCount = advances.filter(a => a.status === 'pending' && selectedIds.has(a.id)).length

  return (
    <motion.div
      variants={containerVariants}
      animate="show"
      className="space-y-4 sm:space-y-6"
    >
      {/* Header */}
      <motion.div variants={itemVariants} className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Cash Advances</h1>
          <p className="text-muted-foreground">Manage driver cash advances and wallet settlements</p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={() => { setDateFrom(''); setDateTo(''); setFilterDriverId(''); setFilterPaymentMethod(''); setSearchQuery(''); setActiveTab('all'); setPage(1) }}>
            <RefreshCw className="mr-1.5 h-3.5 w-3.5" /> Reset
          </Button>
          {isAdmin && (
            <Button
              onClick={() => setFormDialogOpen(true)}
              className="bg-amber-500 hover:bg-amber-600 text-white"
            >
              <Plus className="mr-2 h-4 w-4" />
              New Advance
            </Button>
          )}
        </div>
      </motion.div>

      {/* Summary Stats */}
      <motion.div variants={itemVariants} className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
        {loading ? (
          Array.from({ length: 4 }).map((_, i) => (
            <Card key={i}><CardContent className="p-4 sm:p-6"><Skeleton className="h-3 w-24 mb-3" /><Skeleton className="h-7 w-20" /></CardContent></Card>
          ))
        ) : (
          <>
            <StatsCard
              icon={Clock}
              title="Pending Advances"
              value={`${formatCurrency(summary?.pendingAmount || 0)}`}
              changeLabel={`${summary?.pendingCount || 0} requests`}
              className="cursor-default"
            />
            <StatsCard
              icon={AlertCircle}
              title="Outstanding"
              value={`${formatCurrency(summary?.outstandingAmount || 0)}`}
              changeLabel={`${summary?.outstandingCount || 0} active`}
              className="cursor-default"
            />
            <StatsCard
              icon={TrendingUp}
              title="This Month"
              value={`${formatCurrency(summary?.thisMonthAmount || 0)}`}
              changeLabel={`${summary?.thisMonthCount || 0} advances`}
              className="cursor-default"
            />
            <StatsCard
              icon={Banknote}
              title="Average Advance"
              value={`${formatCurrency(summary?.avgAmount || 0)}`}
              changeLabel={`${summary?.totalCount || 0} total`}
              className="cursor-default"
            />
          </>
        )}
      </motion.div>

      {/* Filters Row */}
      <motion.div variants={itemVariants} className="space-y-3">
        <div className="flex flex-col sm:flex-row gap-2 sm:gap-3">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Search driver, purpose..."
              value={searchQuery}
              onChange={e => { setSearchQuery(e.target.value); setPage(1) }}
              className="pl-9"
            />
          </div>
          <Button
            variant="outline"
            size="sm"
            onClick={() => setShowFilters(!showFilters)}
          >
            <Filter className="mr-1.5 h-3.5 w-3.5" />
            Filters
            <ChevronDown className={`ml-1 h-3 w-3 transition-transform ${showFilters ? 'rotate-180' : ''}`} />
          </Button>
        </div>

        {showFilters && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            className="flex flex-col sm:flex-row gap-2 sm:gap-3 p-3 rounded-lg border bg-muted/30"
          >
            <div className="flex-1">
              <label className="text-xs font-medium text-muted-foreground mb-1 block">From Date</label>
              <DatePicker value={dateFrom} onChange={(val) => setDateFrom(val)} />
            </div>
            <div className="flex-1">
              <label className="text-xs font-medium text-muted-foreground mb-1 block">To Date</label>
              <DatePicker value={dateTo} onChange={(val) => setDateTo(val)} />
            </div>
            <div className="flex-1">
              <label className="text-xs font-medium text-muted-foreground mb-1 block">Driver</label>
              <Select value={filterDriverId || 'all'} onValueChange={v => { setFilterDriverId(v === 'all' ? '' : v); setPage(1) }}>
                <SelectTrigger>
                  <SelectValue placeholder="All Drivers" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Drivers</SelectItem>
                  {filterDrivers.map(d => (
                    <SelectItem key={d.id} value={d.id}>
                      {d.firstName} {d.lastName}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="flex-1">
              <label className="text-xs font-medium text-muted-foreground mb-1 block">Payment Method</label>
              <Select value={filterPaymentMethod || 'all'} onValueChange={v => { setFilterPaymentMethod(v === 'all' ? '' : v); setPage(1) }}>
                <SelectTrigger>
                  <SelectValue placeholder="All Methods" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Methods</SelectItem>
                  {PAYMENT_METHODS.map(pm => (
                    <SelectItem key={pm.value} value={pm.value}>{pm.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </motion.div>
        )}
      </motion.div>

      {/* Bulk Actions Bar */}
      {selectedIds.size > 0 && isAdmin && (
        <motion.div
          initial={{ opacity: 0, y: -10 }}
          animate={{ opacity: 1, y: 0 }}
          className="sticky top-0 z-10 flex items-center gap-2 p-3 rounded-lg bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800"
        >
          <span className="text-sm font-medium text-amber-700 dark:text-amber-400">
            {selectedIds.size} selected
          </span>
          <div className="flex-1" />
          <Button
            size="sm"
            variant="outline"
            className="text-sky-600 border-sky-300 hover:bg-sky-50 dark:border-sky-700 dark:hover:bg-sky-950/30"
            onClick={handleBulkApprove}
            disabled={bulkLoading}
          >
            {bulkLoading ? <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" /> : <CheckCircle className="mr-1.5 h-3.5 w-3.5" />}
            Bulk Approve ({pendingCount} pending)
          </Button>
          <Button
            size="sm"
            variant="ghost"
            onClick={() => setSelectedIds(new Set())}
          >
            <X className="mr-1.5 h-3.5 w-3.5" /> Clear
          </Button>
        </motion.div>
      )}

      {/* Tabs */}
      <motion.div variants={itemVariants}>
        <Tabs value={activeTab} onValueChange={v => { setActiveTab(v); setPage(1) }}>
          <TabsList className="w-full sm:w-auto">
            <TabsTrigger value="all">All</TabsTrigger>
            <TabsTrigger value="pending" className="gap-1">
              Pending {summary?.pendingCount ? `(${summary.pendingCount})` : ''}
            </TabsTrigger>
            <TabsTrigger value="approved">Approved</TabsTrigger>
            <TabsTrigger value="disbursed">Disbursed</TabsTrigger>
            <TabsTrigger value="rejected">Rejected</TabsTrigger>
          </TabsList>
        </Tabs>
      </motion.div>

      {/* Table */}
      <motion.div variants={itemVariants} className="rounded-lg border">
        {loading ? (
          <div className="p-6 space-y-3">
            {Array.from({ length: 5 }).map((_, i) => (
              <Skeleton key={i} className="h-12 w-full" />
            ))}
          </div>
        ) : error ? (
          <div className="p-6 text-center">
            <AlertCircle className="h-8 w-8 text-red-500 mx-auto mb-2" />
            <p className="text-sm text-muted-foreground">{error}</p>
            <Button variant="outline" size="sm" className="mt-2" onClick={loadData}>
              <RefreshCw className="mr-1.5 h-3.5 w-3.5" /> Retry
            </Button>
          </div>
        ) : advances.length === 0 ? (
          <EmptyState
            icon={Banknote}
            title="No cash advances"
            description={activeTab !== 'all' ? `No ${activeTab} advances found` : 'No cash advance requests yet'}
          />
        ) : (
          <>
            {/* Desktop Table */}
            <div className="hidden md:block overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    {isAdmin && (
                      <TableHead className="w-10">
                        <Checkbox
                          checked={isAllSelected}
                          ref={el => {
                            if (el) el.dataset.state = isSomeSelected ? 'indeterminate' : ''
                          }}
                          onCheckedChange={toggleSelectAll}
                          aria-label="Select all"
                        />
                      </TableHead>
                    )}
                    <TableHead>Driver</TableHead>
                    <TableHead>Amount</TableHead>
                    <TableHead>Purpose</TableHead>
                    <TableHead className="hidden lg:table-cell">Trip</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Date</TableHead>
                    <TableHead className="hidden lg:table-cell">Remaining</TableHead>
                    <TableHead className="text-right">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {advances.map(advance => {
                    const statusCfg = STATUS_CONFIG[advance.status] || STATUS_CONFIG.pending
                    const isSelected = selectedIds.has(advance.id)
                    return (
                      <TableRow
                        key={advance.id}
                        ref={(el) => { rowRefs.current[advance.id] = el }}
                        className={`${isSelected ? 'bg-amber-50 dark:bg-amber-950/20' : ''} ${advance.id === highlightEntityId ? highlightClassName : ''}`}
                      >
                        {isAdmin && (
                          <TableCell>
                            <Checkbox
                              checked={isSelected}
                              onCheckedChange={() => toggleSelect(advance.id)}
                              onClick={e => e.stopPropagation()}
                              aria-label={`Select advance for ${advance.driver.firstName}`}
                            />
                          </TableCell>
                        )}
                        <TableCell>
                          <button
                            className="flex items-center gap-2 hover:text-amber-600 transition-colors text-left"
                            onClick={() => handleViewWallet(advance.driverId)}
                          >
                            <div className="h-8 w-8 rounded-full bg-amber-100 dark:bg-amber-900/30 flex items-center justify-center text-xs font-medium text-amber-700 dark:text-amber-400">
                              {advance.driver.firstName[0]}{advance.driver.lastName[0]}
                            </div>
                            <div>
                              <p className="font-medium text-sm">{advance.driver.firstName} {advance.driver.lastName}</p>
                              <p className="text-xs text-muted-foreground">{advance.driver.phone}</p>
                            </div>
                          </button>
                        </TableCell>
                        <TableCell>
                          <span className="font-semibold">{formatCurrency(advance.amount)}</span>
                          {advance.paymentMethod === 'mobile_money' && (
                            <Badge variant="outline" className="ml-1.5 text-xs">
                              <Smartphone className="h-3 w-3 mr-0.5" />MoMo
                            </Badge>
                          )}
                        </TableCell>
                        <TableCell>
                          <span className="text-sm capitalize">{getPurposeLabel(advance.purpose)}</span>
                        </TableCell>
                        <TableCell className="hidden lg:table-cell">
                          {advance.trip ? (
                            <span className="text-sm text-muted-foreground flex items-center gap-1">
                              <Route className="h-3 w-3" />
                              {advance.trip.tripNumber}
                            </span>
                          ) : (
                            <span className="text-xs text-muted-foreground">—</span>
                          )}
                        </TableCell>
                        <TableCell>
                          <Badge className={statusCfg.color} variant="outline">
                            {statusCfg.label}
                          </Badge>
                        </TableCell>
                        <TableCell>
                          <span className="text-sm text-muted-foreground">{formatDate(advance.requestDate)}</span>
                        </TableCell>
                        <TableCell className="hidden lg:table-cell">
                          <span className={`text-sm font-medium ${advance.remainingBalance > 0 ? 'text-red-600' : 'text-emerald-600'}`}>
                            {advance.remainingBalance > 0 ? formatCurrency(advance.remainingBalance) : 'Settled'}
                          </span>
                        </TableCell>
                        <TableCell className="text-right">
                          <div className="flex items-center justify-end gap-1">
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => handleViewWallet(advance.driverId)}
                              title="View Wallet"
                            >
                              <Wallet className="h-3.5 w-3.5" />
                            </Button>
                            {advance.status === 'pending' && isAdmin && (
                              <>
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  className="text-sky-600 hover:text-sky-700 hover:bg-sky-50 dark:hover:bg-sky-950/30"
                                  onClick={() => handleApprove(advance.id)}
                                  disabled={actionLoading === advance.id}
                                  title="Approve"
                                >
                                  {actionLoading === advance.id ? (
                                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                                  ) : (
                                    <CheckCircle className="h-3.5 w-3.5" />
                                  )}
                                </Button>
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  className="text-red-600 hover:text-red-700 hover:bg-red-50 dark:hover:bg-red-950/30"
                                  onClick={() => handleReject(advance.id)}
                                  title="Reject"
                                >
                                  <XCircle className="h-3.5 w-3.5" />
                                </Button>
                              </>
                            )}
                            {advance.status === 'approved' && isAdmin && (
                              <Button
                                variant="ghost"
                                size="sm"
                                className="text-emerald-600 hover:text-emerald-700 hover:bg-emerald-50 dark:hover:bg-emerald-950/30"
                                onClick={() => handleDisburse(advance.id)}
                                disabled={actionLoading === advance.id}
                                title="Disburse"
                              >
                                {actionLoading === advance.id ? (
                                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                                ) : (
                                  <Banknote className="h-3.5 w-3.5" />
                                )}
                              </Button>
                            )}
                          </div>
                        </TableCell>
                      </TableRow>
                    )
                  })}
                </TableBody>
              </Table>
            </div>

            {/* Mobile Cards */}
            <div className="md:hidden divide-y">
              {advances.map(advance => {
                const statusCfg = STATUS_CONFIG[advance.status] || STATUS_CONFIG.pending
                return (
                  <div key={advance.id} ref={(el) => { rowRefs.current[advance.id] = el }} className={`mobile-card p-4 space-y-3 ${advance.id === highlightEntityId ? highlightClassName : ''}`}>
                    <div className="flex items-start justify-between">
                      <button
                        className="flex items-center gap-2 text-left"
                        onClick={() => handleViewWallet(advance.driverId)}
                      >
                        <div className="h-9 w-9 rounded-full bg-amber-100 dark:bg-amber-900/30 flex items-center justify-center text-xs font-medium text-amber-700 dark:text-amber-400">
                          {advance.driver.firstName[0]}{advance.driver.lastName[0]}
                        </div>
                        <div>
                          <p className="font-medium text-sm">{advance.driver.firstName} {advance.driver.lastName}</p>
                          <p className="text-xs text-muted-foreground">{formatDate(advance.requestDate)}</p>
                        </div>
                      </button>
                      <Badge className={statusCfg.color} variant="outline">{statusCfg.label}</Badge>
                    </div>

                    <div className="grid grid-cols-2 gap-2 text-sm">
                      <div>
                        <p className="text-xs text-muted-foreground">Amount</p>
                        <p className="font-semibold">{formatCurrency(advance.amount)}</p>
                      </div>
                      <div>
                        <p className="text-xs text-muted-foreground">Purpose</p>
                        <p className="capitalize">{getPurposeLabel(advance.purpose)}</p>
                      </div>
                      {advance.trip && (
                        <div className="col-span-2">
                          <p className="text-xs text-muted-foreground">Trip</p>
                          <p className="text-sm flex items-center gap-1">
                            <Route className="h-3 w-3" />{advance.trip.tripNumber}
                          </p>
                        </div>
                      )}
                    </div>

                    <div className="flex items-center gap-1 pt-1">
                      <Button
                        variant="outline"
                        size="sm"
                        className="min-h-[44px]"
                        onClick={() => handleViewWallet(advance.driverId)}
                      >
                        <Wallet className="mr-1.5 h-3.5 w-3.5" /> Wallet
                      </Button>
                      {advance.status === 'pending' && isAdmin && (
                        <>
                          <Button
                            size="sm"
                            className="min-h-[44px] bg-sky-500 hover:bg-sky-600 text-white ml-auto"
                            onClick={() => handleApprove(advance.id)}
                            disabled={actionLoading === advance.id}
                          >
                            {actionLoading === advance.id ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <CheckCircle className="mr-1.5 h-3.5 w-3.5" />}
                            Approve
                          </Button>
                          <Button
                            variant="ghost"
                            size="sm"
                            className="min-h-[44px] text-red-600"
                            onClick={() => handleReject(advance.id)}
                          >
                            <XCircle className="h-3.5 w-3.5" />
                          </Button>
                        </>
                      )}
                      {advance.status === 'approved' && isAdmin && (
                        <Button
                          size="sm"
                          className="min-h-[44px] bg-emerald-500 hover:bg-emerald-600 text-white ml-auto"
                          onClick={() => handleDisburse(advance.id)}
                          disabled={actionLoading === advance.id}
                        >
                          {actionLoading === advance.id ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Banknote className="mr-1.5 h-3.5 w-3.5" />}
                          Disburse
                        </Button>
                      )}
                    </div>
                  </div>
                )
              })}
            </div>

            {/* Pagination */}
            {totalPages > 1 && (
              <div className="flex items-center justify-between px-4 py-3 border-t">
                <p className="text-sm text-muted-foreground">
                  Showing {(page - 1) * limit + 1}–{Math.min(page * limit, total)} of {total}
                </p>
                <div className="flex items-center gap-1">
                  <Button
                    variant="outline"
                    size="sm"
                    disabled={page <= 1}
                    onClick={() => setPage(p => p - 1)}
                  >
                    <ChevronLeft className="h-4 w-4" />
                  </Button>
                  {Array.from({ length: Math.min(5, totalPages) }, (_, i) => {
                    let pageNum: number
                    if (totalPages <= 5) {
                      pageNum = i + 1
                    } else if (page <= 3) {
                      pageNum = i + 1
                    } else if (page >= totalPages - 2) {
                      pageNum = totalPages - 4 + i
                    } else {
                      pageNum = page - 2 + i
                    }
                    return (
                      <Button
                        key={pageNum}
                        variant={page === pageNum ? 'default' : 'outline'}
                        size="sm"
                        className={page === pageNum ? 'bg-amber-500 hover:bg-amber-600 text-white' : ''}
                        onClick={() => setPage(pageNum)}
                      >
                        {pageNum}
                      </Button>
                    )
                  })}
                  <Button
                    variant="outline"
                    size="sm"
                    disabled={page >= totalPages}
                    onClick={() => setPage(p => p + 1)}
                  >
                    <ChevronRight className="h-4 w-4" />
                  </Button>
                </div>
              </div>
            )}
          </>
        )}
      </motion.div>

      {/* Dialogs */}
      <CashAdvanceFormDialog
        open={formDialogOpen}
        onOpenChange={setFormDialogOpen}
        onCreated={loadData}
      />

      <RejectDialog
        open={rejectDialogOpen}
        onOpenChange={setRejectDialogOpen}
        onRejected={loadData}
        advanceId={rejectAdvanceId}
      />

      <WalletDetailSheet
        wallet={selectedWallet}
        open={walletSheetOpen}
        onOpenChange={setWalletSheetOpen}
      />
    </motion.div>
  )
}
