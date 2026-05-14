'use client'

import * as React from 'react'
import { motion } from 'framer-motion'
import {
  Plus, Search, Award, AlertCircle, RefreshCw, Loader2,
  CheckCircle2, XCircle, Banknote, Trophy, TrendingUp, CalendarDays,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Card, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Skeleton } from '@/components/ui/skeleton'
import { EmptyState } from '@/components/ui/empty-state'
import {
  Dialog, DialogBody, DialogContent, DialogHeader,
  DialogTitle, DialogDescription, DialogFooter,
} from '@/components/ui/dialog'
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select'
import { SearchableSelect } from '@/components/ui/searchable-select'
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table'
import { CURRENCY_SYMBOL } from '@/lib/constants'
import { useDebounce } from '@/hooks/use-debounce'
import { apiFetch, fetchDrivers, type Driver, type ApiResponse } from '@/lib/api'
import { toast } from 'sonner'

// ============ Types ============

interface DriverIncentive {
  id: string
  driverId: string
  driver: { id: string; firstName: string; lastName: string; phone: string; photo?: string | null }
  type: string
  title: string
  description?: string | null
  amount: number
  period: string
  periodStart?: string | null
  periodEnd?: string | null
  status: string
  approvedBy?: string | null
  approver?: { id: string; name: string } | null
  approvedAt?: string | null
  paidAt?: string | null
  metrics?: string | null
  notes?: string | null
  createdBy: string
  creator?: { id: string; name: string } | null
  createdAt: string
  updatedAt: string
}

// ============ Constants ============

const INCENTIVE_TYPES: Record<string, { label: string; color: string }> = {
  safety_bonus: { label: 'Safety Bonus', color: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400' },
  fuel_efficiency: { label: 'Fuel Efficiency', color: 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400' },
  on_time_delivery: { label: 'On-Time Delivery', color: 'bg-sky-100 text-sky-700 dark:bg-sky-900/30 dark:text-sky-400' },
  referral: { label: 'Referral', color: 'bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-400' },
  performance: { label: 'Performance', color: 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400' },
  milestone: { label: 'Milestone', color: 'bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-400' },
  custom: { label: 'Custom', color: 'bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-400' },
}

const INCENTIVE_STATUS: Record<string, { label: string; color: string }> = {
  pending: { label: 'Pending', color: 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400' },
  approved: { label: 'Approved', color: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400' },
  paid: { label: 'Paid', color: 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400' },
  cancelled: { label: 'Cancelled', color: 'bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-400' },
}

const PERIODS = [
  { value: 'one_time', label: 'One Time' },
  { value: 'weekly', label: 'Weekly' },
  { value: 'monthly', label: 'Monthly' },
  { value: 'quarterly', label: 'Quarterly' },
  { value: 'yearly', label: 'Yearly' },
]

// ============ Animation ============

const containerVariants = { show: { transition: { staggerChildren: 0.04 } } }
const itemVariants = { show: { opacity: 1, y: 0 } }

// ============ Helpers ============

function fetchDriverIncentives(params?: { status?: string; type?: string; driverId?: string; limit?: number }): Promise<ApiResponse<DriverIncentive[]>> {
  const sp = new URLSearchParams()
  if (params?.status) sp.set('status', params.status)
  if (params?.type) sp.set('type', params.type)
  if (params?.driverId) sp.set('driverId', params.driverId)
  if (params?.limit) sp.set('limit', String(params.limit))
  const qs = sp.toString()
  return apiFetch<ApiResponse<DriverIncentive[]>>(`/api/driver-incentives${qs ? `?${qs}` : ''}`)
}

async function createDriverIncentive(data: Record<string, unknown>): Promise<DriverIncentive> {
  return apiFetch<DriverIncentive>('/api/driver-incentives', {
    method: 'POST',
    body: JSON.stringify(data),
  })
}

async function updateIncentiveStatus(id: string, status: string, notes?: string): Promise<DriverIncentive> {
  return apiFetch<DriverIncentive>(`/api/driver-incentives/${id}`, {
    method: 'PUT',
    body: JSON.stringify({ status, notes }),
  })
}

function formatPeriod(incentive: DriverIncentive): string {
  if (incentive.periodStart && incentive.periodEnd) {
    return `${new Date(incentive.periodStart).toLocaleDateString('en-GH', { month: 'short', day: 'numeric' })} - ${new Date(incentive.periodEnd).toLocaleDateString('en-GH', { month: 'short', day: 'numeric', year: 'numeric' })}`
  }
  const periodLabel = PERIODS.find(p => p.value === incentive.period)?.label || incentive.period
  return periodLabel
}

// ============ Component ============

export function DriverIncentivesView() {
  const [search, setSearch] = React.useState('')
  const debouncedSearch = useDebounce(search, 300)
  const [activeTab, setActiveTab] = React.useState('all')
  const [incentives, setIncentives] = React.useState<DriverIncentive[]>([])
  const [loading, setLoading] = React.useState(true)
  const [error, setError] = React.useState<string | null>(null)

  // Dialog states
  const [createOpen, setCreateOpen] = React.useState(false)
  const [approveOpen, setApproveOpen] = React.useState(false)
  const [payOpen, setPayOpen] = React.useState(false)
  const [selectedIncentive, setSelectedIncentive] = React.useState<DriverIncentive | null>(null)

  const loadIncentives = React.useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const params: Parameters<typeof fetchDriverIncentives>[0] = { limit: 100 }
      if (activeTab !== 'all') params.status = activeTab
      const result = await fetchDriverIncentives(params)
      setIncentives(result.data)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to fetch incentives')
    } finally {
      setLoading(false)
    }
  }, [activeTab])

  React.useEffect(() => {
    loadIncentives()
  }, [loadIncentives])

  // Filter by search
  const filtered = React.useMemo(() => {
    if (!debouncedSearch) return incentives
    const q = debouncedSearch.toLowerCase()
    return incentives.filter((i) =>
      i.title.toLowerCase().includes(q) ||
      `${i.driver.firstName} ${i.driver.lastName}`.toLowerCase().includes(q) ||
      i.type.toLowerCase().includes(q)
    )
  }, [incentives, debouncedSearch])

  // Summary stats
  const now = new Date()
  const currentMonth = now.getMonth()
  const currentYear = now.getFullYear()
  const totalPaidThisMonth = incentives
    .filter(i => i.status === 'paid' && i.paidAt && new Date(i.paidAt).getMonth() === currentMonth && new Date(i.paidAt).getFullYear() === currentYear)
    .reduce((s, i) => s + i.amount, 0)
  const pendingCount = incentives.filter(i => i.status === 'pending').length
  const approvedCount = incentives.filter(i => i.status === 'approved').length

  // Top earner
  const topEarner = React.useMemo(() => {
    const totals: Record<string, { name: string; total: number }> = {}
    incentives.filter(i => i.status === 'paid').forEach(i => {
      const key = i.driverId
      const name = `${i.driver.firstName} ${i.driver.lastName}`
      if (!totals[key]) totals[key] = { name, total: 0 }
      totals[key].total += i.amount
    })
    const sorted = Object.values(totals).sort((a, b) => b.total - a.total)
    return sorted[0] || null
  }, [incentives])

  return (
    <motion.div variants={containerVariants} animate="show" className="space-y-4 sm:space-y-6">
      {/* Header */}
      <motion.div variants={itemVariants} className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Driver Incentives</h1>
          <p className="text-muted-foreground">Manage driver rewards and bonus programs</p>
        </div>
        <Button
          onClick={() => setCreateOpen(true)}
          className="bg-amber-500 hover:bg-amber-600 text-white"
        >
          <Plus className="mr-2 h-4 w-4" />
          New Incentive
        </Button>
      </motion.div>

      {/* Summary Cards */}
      <motion.div variants={itemVariants} className="grid grid-cols-2 sm:grid-cols-4 gap-3 sm:gap-4">
        {loading ? (
          Array.from({ length: 4 }).map((_, i) => (
            <Card key={i}><CardContent className="p-4"><Skeleton className="h-3 w-20 mb-2" /><Skeleton className="h-6 w-14" /></CardContent></Card>
          ))
        ) : (
          <>
            <Card className="hover:shadow-md transition-shadow">
              <CardContent className="p-4">
                <div className="flex items-center gap-2 mb-1">
                  <Banknote className="h-4 w-4 text-emerald-600" />
                  <p className="text-xs text-muted-foreground">Paid This Month</p>
                </div>
                <p className="text-xl font-bold">{CURRENCY_SYMBOL}{totalPaidThisMonth.toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 0 })}</p>
              </CardContent>
            </Card>
            <Card className="hover:shadow-md transition-shadow">
              <CardContent className="p-4">
                <div className="flex items-center gap-2 mb-1">
                  <Clock className="h-4 w-4 text-amber-600" />
                  <p className="text-xs text-muted-foreground">Pending Approval</p>
                </div>
                <p className="text-xl font-bold text-amber-600">{pendingCount}</p>
              </CardContent>
            </Card>
            <Card className="hover:shadow-md transition-shadow">
              <CardContent className="p-4">
                <div className="flex items-center gap-2 mb-1">
                  <CheckCircle2 className="h-4 w-4 text-emerald-600" />
                  <p className="text-xs text-muted-foreground">Approved</p>
                </div>
                <p className="text-xl font-bold text-emerald-600">{approvedCount}</p>
              </CardContent>
            </Card>
            <Card className="hover:shadow-md transition-shadow">
              <CardContent className="p-4">
                <div className="flex items-center gap-2 mb-1">
                  <Trophy className="h-4 w-4 text-orange-500" />
                  <p className="text-xs text-muted-foreground">Top Earner</p>
                </div>
                <p className="text-sm font-bold truncate">{topEarner ? topEarner.name : 'N/A'}</p>
                {topEarner && <p className="text-xs text-muted-foreground">{CURRENCY_SYMBOL}{topEarner.total.toLocaleString()}</p>}
              </CardContent>
            </Card>
          </>
        )}
      </motion.div>

      {/* Search & Tabs */}
      <motion.div variants={itemVariants} className="space-y-4">
        <div className="relative">
          <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Search by driver, title, or type..."
            className="pl-8"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>

        <Tabs value={activeTab} onValueChange={setActiveTab}>
          <TabsList className="flex-wrap h-auto">
            <TabsTrigger value="all">All</TabsTrigger>
            <TabsTrigger value="pending">Pending</TabsTrigger>
            <TabsTrigger value="approved">Approved</TabsTrigger>
            <TabsTrigger value="paid">Paid</TabsTrigger>
            <TabsTrigger value="cancelled">Cancelled</TabsTrigger>
          </TabsList>

          {error ? (
            <div className="flex flex-col items-center justify-center py-12 text-center mt-4">
              <AlertCircle className="h-8 w-8 text-red-500 mb-3" />
              <p className="text-sm text-muted-foreground mb-3">{error}</p>
              <Button variant="outline" size="sm" onClick={loadIncentives}>
                <RefreshCw className="mr-2 h-3 w-3" /> Retry
              </Button>
            </div>
          ) : loading ? (
            <div className="mt-4 space-y-3">
              {[1, 2, 3, 4].map(i => <Skeleton key={i} className="h-12 w-full rounded" />)}
            </div>
          ) : (
            <TabsContent value={activeTab} className="mt-4">
              <IncentiveTable
                incentives={filtered}
                onApprove={(inc) => { setSelectedIncentive(inc); setApproveOpen(true) }}
                onPay={(inc) => { setSelectedIncentive(inc); setPayOpen(true) }}
                onRefresh={loadIncentives}
              />
            </TabsContent>
          )}
        </Tabs>
      </motion.div>

      {/* Create Dialog */}
      <CreateIncentiveDialog
        open={createOpen}
        onOpenChange={setCreateOpen}
        onCreated={loadIncentives}
      />

      {/* Approve Dialog */}
      <Dialog open={approveOpen} onOpenChange={setApproveOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Review Incentive</DialogTitle>
            <DialogDescription>Approve or reject this incentive request</DialogDescription>
          </DialogHeader>
          {selectedIncentive && (
            <ApproveDialogContent
              incentive={selectedIncentive}
              onApprove={async () => {
                try {
                  await updateIncentiveStatus(selectedIncentive.id, 'approved')
                  toast.success('Incentive approved')
                  setApproveOpen(false)
                  setSelectedIncentive(null)
                  loadIncentives()
                } catch { toast.error('Failed to approve incentive') }
              }}
              onReject={async () => {
                try {
                  await updateIncentiveStatus(selectedIncentive.id, 'cancelled')
                  toast.success('Incentive rejected')
                  setApproveOpen(false)
                  setSelectedIncentive(null)
                  loadIncentives()
                } catch { toast.error('Failed to reject incentive') }
              }}
            />
          )}
        </DialogContent>
      </Dialog>

      {/* Pay Dialog */}
      <Dialog open={payOpen} onOpenChange={setPayOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Confirm Payment</DialogTitle>
            <DialogDescription>Mark this incentive as paid to the driver</DialogDescription>
          </DialogHeader>
          {selectedIncentive && (
            <>
              <DialogBody>
                <div className="space-y-4">
                  <div className="rounded-lg border p-4 space-y-2">
                    <div className="flex justify-between text-sm">
                      <span className="text-muted-foreground">Driver</span>
                      <span className="font-medium">{selectedIncentive.driver.firstName} {selectedIncentive.driver.lastName}</span>
                    </div>
                    <div className="flex justify-between text-sm">
                      <span className="text-muted-foreground">Incentive</span>
                      <span className="font-medium">{selectedIncentive.title}</span>
                    </div>
                    <div className="flex justify-between text-sm">
                      <span className="text-muted-foreground">Amount</span>
                      <span className="font-bold text-emerald-600">{CURRENCY_SYMBOL}{selectedIncentive.amount.toLocaleString()}</span>
                    </div>
                    <div className="flex justify-between text-sm">
                      <span className="text-muted-foreground">Period</span>
                      <span>{formatPeriod(selectedIncentive)}</span>
                    </div>
                  </div>
                </div>
              </DialogBody>
              <DialogFooter>
              <Button variant="outline" onClick={() => setPayOpen(false)}>Cancel</Button>
              <Button
                onClick={async () => {
                  try {
                    await updateIncentiveStatus(selectedIncentive.id, 'paid')
                    toast.success(`Payment of ${CURRENCY_SYMBOL}${selectedIncentive.amount.toLocaleString()} confirmed`)
                    setPayOpen(false)
                    setSelectedIncentive(null)
                    loadIncentives()
                  } catch { toast.error('Failed to confirm payment') }
                }}
                className="bg-emerald-600 hover:bg-emerald-700 text-white"
              >
                <Banknote className="mr-2 h-4 w-4" />
                Confirm Payment
              </Button>
              </DialogFooter>
            </>
          )}
        </DialogContent>
      </Dialog>
    </motion.div>
  )
}

// ============ Clock icon alias ============

function Clock({ className }: { className?: string }) {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className}>
      <circle cx="12" cy="12" r="10" /><polyline points="12 6 12 12 16 14" />
    </svg>
  )
}

// ============ Approve Dialog Content ============

function ApproveDialogContent({ incentive, onApprove, onReject }: {
  incentive: DriverIncentive
  onApprove: () => void
  onReject: () => void
}) {
  return (
    <>
      <DialogBody>
        <div className="space-y-4">
          <div className="rounded-lg border p-4 space-y-3">
            <div className="flex items-center gap-3">
              <div className="h-10 w-10 rounded-full bg-amber-100 dark:bg-amber-900/30 flex items-center justify-center">
                <Award className="h-5 w-5 text-amber-600" />
              </div>
              <div>
                <p className="font-medium">{incentive.title}</p>
                <p className="text-sm text-muted-foreground">{incentive.driver.firstName} {incentive.driver.lastName}</p>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-2 text-sm">
              <div>
                <span className="text-muted-foreground">Type</span>
                <div className="mt-0.5">
                  <Badge variant="outline" className={cn('border-transparent', INCENTIVE_TYPES[incentive.type]?.color)}>
                    {INCENTIVE_TYPES[incentive.type]?.label || incentive.type}
                  </Badge>
                </div>
              </div>
              <div>
                <span className="text-muted-foreground">Amount</span>
                <p className="font-bold">{CURRENCY_SYMBOL}{incentive.amount.toLocaleString()}</p>
              </div>
              <div>
                <span className="text-muted-foreground">Period</span>
                <p>{formatPeriod(incentive)}</p>
              </div>
              <div>
                <span className="text-muted-foreground">Created</span>
                <p>{new Date(incentive.createdAt).toLocaleDateString()}</p>
              </div>
            </div>
            {incentive.description && (
              <div className="text-sm">
                <span className="text-muted-foreground">Description</span>
                <p className="mt-0.5">{incentive.description}</p>
              </div>
            )}
          </div>
        </div>
      </DialogBody>
      <DialogFooter>
        <Button variant="outline" className="text-red-600 hover:text-red-700" onClick={onReject}>
          <XCircle className="mr-2 h-4 w-4" />
          Reject
        </Button>
        <Button className="bg-emerald-600 hover:bg-emerald-700 text-white" onClick={onApprove}>
          <CheckCircle2 className="mr-2 h-4 w-4" />
          Approve
        </Button>
      </DialogFooter>
    </>
  )
}

// ============ Create Incentive Dialog ============

function CreateIncentiveDialog({ open, onOpenChange, onCreated }: {
  open: boolean
  onOpenChange: (open: boolean) => void
  onCreated: () => void
}) {
  const [submitting, setSubmitting] = React.useState(false)
  const [drivers, setDrivers] = React.useState<Driver[]>([])
  const [driversLoading, setDriversLoading] = React.useState(false)

  const [form, setForm] = React.useState({
    driverId: '',
    type: 'performance',
    title: '',
    description: '',
    amount: '',
    period: 'one_time',
    periodStart: '',
    periodEnd: '',
  })

  React.useEffect(() => {
    if (open) {
      setDriversLoading(true)
      fetchDrivers({ status: 'active', limit: 200 })
        .then((res) => setDrivers(res.data))
        .catch(() => toast.error('Failed to load drivers'))
        .finally(() => setDriversLoading(false))
    }
  }, [open])

  React.useEffect(() => {
    if (!open) {
      setForm({ driverId: '', type: 'performance', title: '', description: '', amount: '', period: 'one_time', periodStart: '', periodEnd: '' })
    }
  }, [open])

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!form.driverId || !form.title || !form.amount) {
      toast.error('Please fill in all required fields')
      return
    }
    setSubmitting(true)
    try {
      await createDriverIncentive({
        driverId: form.driverId,
        type: form.type,
        title: form.title,
        description: form.description || null,
        amount: parseFloat(form.amount),
        period: form.period,
        periodStart: form.periodStart || null,
        periodEnd: form.periodEnd || null,
      })
      toast.success('Incentive created successfully')
      onOpenChange(false)
      onCreated()
    } catch {
      toast.error('Failed to create incentive')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Create New Incentive</DialogTitle>
          <DialogDescription>Set up a reward or bonus for a driver</DialogDescription>
        </DialogHeader>
        <DialogBody>
          <form id="create-incentive-form" onSubmit={handleSubmit} className="space-y-4">
            {/* Driver */}
            <div>
              <label className="text-sm font-medium">Driver *</label>
              <SearchableSelect
                options={drivers.map(d => ({ value: d.id, label: `${d.firstName} ${d.lastName} (${d.employeeId || d.phone})` }))}
                value={form.driverId}
                onValueChange={(v) => setForm(f => ({ ...f, driverId: v }))}
                placeholder={driversLoading ? 'Loading drivers...' : 'Select a driver'}
                disabled={driversLoading}
              />
            </div>

            {/* Type */}
            <div>
              <label className="text-sm font-medium">Type *</label>
              <Select value={form.type} onValueChange={(v) => setForm(f => ({ ...f, type: v }))}>
                <SelectTrigger className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {Object.entries(INCENTIVE_TYPES).map(([key, val]) => (
                    <SelectItem key={key} value={key}>{val.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* Title */}
            <div>
              <label className="text-sm font-medium">Title *</label>
              <Input
                placeholder="e.g. December Safety Bonus"
                value={form.title}
                onChange={(e) => setForm(f => ({ ...f, title: e.target.value }))}
              />
            </div>

            {/* Description */}
            <div>
              <label className="text-sm font-medium">Description</label>
              <Textarea
                placeholder="Optional details about this incentive..."
                rows={2}
                value={form.description}
                onChange={(e) => setForm(f => ({ ...f, description: e.target.value }))}
              />
            </div>

            {/* Amount & Period */}
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="text-sm font-medium">Amount *</label>
                <div className="relative">
                  <span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm text-muted-foreground">{CURRENCY_SYMBOL}</span>
                  <Input
                    type="number"
                    placeholder="0.00"
                    className="pl-8"
                    value={form.amount}
                    onChange={(e) => setForm(f => ({ ...f, amount: e.target.value }))}
                  />
                </div>
              </div>
              <div>
                <label className="text-sm font-medium">Period</label>
                <Select value={form.period} onValueChange={(v) => setForm(f => ({ ...f, period: v }))}>
                  <SelectTrigger className="w-full">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {PERIODS.map(p => (
                      <SelectItem key={p.value} value={p.value}>{p.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            {/* Period Dates */}
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="text-sm font-medium">Period Start</label>
                <Input
                  type="date"
                  value={form.periodStart}
                  onChange={(e) => setForm(f => ({ ...f, periodStart: e.target.value }))}
                />
              </div>
              <div>
                <label className="text-sm font-medium">Period End</label>
                <Input
                  type="date"
                  value={form.periodEnd}
                  onChange={(e) => setForm(f => ({ ...f, periodEnd: e.target.value }))}
                />
              </div>
            </div>
          </form>
        </DialogBody>
        <DialogFooter>
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)} disabled={submitting}>Cancel</Button>
          <Button type="submit" form="create-incentive-form" className="bg-amber-500 hover:bg-amber-600 text-white" disabled={submitting}>
            {submitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            Create Incentive
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

// ============ Incentive Table ============

function IncentiveTable({ incentives, onApprove, onPay, onRefresh }: {
  incentives: DriverIncentive[]
  onApprove: (inc: DriverIncentive) => void
  onPay: (inc: DriverIncentive) => void
  onRefresh: () => void
}) {
  if (incentives.length === 0) {
    return (
      <div className="rounded-lg border bg-card">
        <EmptyState
          icon={Award}
          title="No incentives found"
          description="Try adjusting your search or create a new incentive"
          action={{ label: 'Create Incentive', onClick: () => {} }}
        />
      </div>
    )
  }

  return (
    <>
      {/* Desktop Table */}
      <div className="rounded-lg border bg-card hidden md:block">
        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Driver</TableHead>
                <TableHead>Type</TableHead>
                <TableHead>Title</TableHead>
                <TableHead className="text-right">Amount</TableHead>
                <TableHead className="hidden lg:table-cell">Period</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {incentives.map((inc) => (
                <TableRow key={inc.id}>
                  <TableCell className="text-sm font-medium">
                    {inc.driver.firstName} {inc.driver.lastName}
                  </TableCell>
                  <TableCell>
                    <Badge variant="outline" className={cn('border-transparent', INCENTIVE_TYPES[inc.type]?.color)}>
                      {INCENTIVE_TYPES[inc.type]?.label || inc.type}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-sm font-medium">{inc.title}</TableCell>
                  <TableCell className="text-right text-sm font-semibold">
                    {CURRENCY_SYMBOL}{inc.amount.toLocaleString()}
                  </TableCell>
                  <TableCell className="hidden lg:table-cell text-sm text-muted-foreground">
                    {formatPeriod(inc)}
                  </TableCell>
                  <TableCell>
                    <Badge variant="outline" className={cn('border-transparent', INCENTIVE_STATUS[inc.status]?.color)}>
                      {INCENTIVE_STATUS[inc.status]?.label || inc.status}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-right">
                    <div className="flex items-center justify-end gap-1">
                      {inc.status === 'pending' && (
                        <Button size="sm" variant="outline" className="h-8 text-xs gap-1" onClick={() => onApprove(inc)}>
                          <CheckCircle2 className="h-3 w-3" /> Review
                        </Button>
                      )}
                      {inc.status === 'approved' && (
                        <Button size="sm" className="h-8 text-xs gap-1 bg-emerald-600 hover:bg-emerald-700 text-white" onClick={() => onPay(inc)}>
                          <Banknote className="h-3 w-3" /> Pay
                        </Button>
                      )}
                      {(inc.status === 'paid') && (
                        <span className="text-xs text-muted-foreground">
                          {inc.paidAt ? new Date(inc.paidAt).toLocaleDateString() : ''}
                        </span>
                      )}
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      </div>

      {/* Mobile Cards */}
      <div className="md:hidden space-y-3">
        {incentives.map((inc) => (
          <Card key={inc.id} className="overflow-hidden">
            <CardContent className="p-4 space-y-3">
              <div className="flex items-start justify-between gap-2">
                <div className="flex-1 min-w-0">
                  <p className="font-medium text-sm truncate">{inc.title}</p>
                  <p className="text-xs text-muted-foreground">{inc.driver.firstName} {inc.driver.lastName}</p>
                </div>
                <Badge variant="outline" className={cn('border-transparent shrink-0', INCENTIVE_STATUS[inc.status]?.color)}>
                  {INCENTIVE_STATUS[inc.status]?.label || inc.status}
                </Badge>
              </div>
              <div className="flex items-center gap-2 flex-wrap">
                <Badge variant="outline" className={cn('border-transparent', INCENTIVE_TYPES[inc.type]?.color)}>
                  {INCENTIVE_TYPES[inc.type]?.label || inc.type}
                </Badge>
                <span className="text-xs text-muted-foreground">{formatPeriod(inc)}</span>
              </div>
              <div className="flex items-center justify-between">
                <p className="text-lg font-bold">{CURRENCY_SYMBOL}{inc.amount.toLocaleString()}</p>
                {inc.status === 'pending' && (
                  <Button size="sm" variant="outline" className="h-8 text-xs gap-1" onClick={() => onApprove(inc)}>
                    <CheckCircle2 className="h-3 w-3" /> Review
                  </Button>
                )}
                {inc.status === 'approved' && (
                  <Button size="sm" className="h-8 text-xs gap-1 bg-emerald-600 hover:bg-emerald-700 text-white" onClick={() => onPay(inc)}>
                    <Banknote className="h-3 w-3" /> Pay
                  </Button>
                )}
              </div>
            </CardContent>
          </Card>
        ))}
      </div>
    </>
  )
}

// ============ cn utility ============

function cn(...classes: (string | undefined | false | null)[]) {
  return classes.filter(Boolean).join(' ')
}
