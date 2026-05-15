'use client'

import * as React from 'react'
import { motion } from 'framer-motion'
import {
  ClipboardCheck, Clock, CheckCircle, XCircle, Search, Filter, RefreshCw,
  Loader2, ChevronLeft, ChevronRight, Eye, Ban, CalendarDays,
  Percent, AlertCircle, TrendingDown,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Skeleton } from '@/components/ui/skeleton'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs'
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter,
} from '@/components/ui/dialog'
import {
  Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription,
} from '@/components/ui/sheet'
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table'
import { EmptyState } from '@/components/ui/empty-state'
import { StatsCard } from '@/components/ui/stats-card'
import { CURRENCY_SYMBOL, EXPENSE_CATEGORY_COLORS } from '@/lib/constants'
import {
  fetchExpenseApprovals,
  fetchExpenseApproval,
  updateExpenseApproval,
  type ExpenseApproval,
  type ExpenseApprovalSummary,
} from '@/lib/api'
import { toast } from 'sonner'

// ==================== CONSTANTS ====================

const STATUS_CONFIG: Record<string, { label: string; color: string }> = {
  pending: { label: 'Pending', color: 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400' },
  approved: { label: 'Approved', color: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400' },
  rejected: { label: 'Rejected', color: 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400' },
  partial: { label: 'Partial', color: 'bg-sky-100 text-sky-700 dark:bg-sky-900/30 dark:text-sky-400' },
}

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

function getApprovalLevelLabel(level: number): string {
  switch (level) {
    case 1: return 'Level 1 — Supervisor'
    case 2: return 'Level 2 — Manager'
    case 3: return 'Level 3 — Director'
    default: return `Level ${level}`
  }
}

function toISODate(date: Date): string {
  return date.toISOString().split('T')[0]
}

// ==================== APPROVAL DIALOG ====================

function ApprovalDialog({
  open,
  onOpenChange,
  onApproved,
  approval,
  action,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  onApproved: () => void
  approval: ExpenseApproval | null
  action: 'approve' | 'reject' | 'partial'
}) {
  const [approvedAmount, setApprovedAmount] = React.useState('')
  const [notes, setNotes] = React.useState('')
  const [rejectionReason, setRejectionReason] = React.useState('')
  const [submitting, setSubmitting] = React.useState(false)

  React.useEffect(() => {
    if (open && approval) {
      setApprovedAmount(String(approval.amount))
      setNotes(approval.notes || '')
      setRejectionReason('')
    }
  }, [open, approval])

  async function handleSubmit() {
    if (!approval) return

    if (action === 'reject' && !rejectionReason.trim()) {
      toast.error('Rejection reason is required')
      return
    }

    if (action === 'partial') {
      const amt = parseFloat(approvedAmount)
      if (!amt || amt <= 0) {
        toast.error('Approved amount must be greater than zero')
        return
      }
      if (amt > approval.amount) {
        toast.error('Approved amount cannot exceed the requested amount')
        return
      }
    }

    setSubmitting(true)
    try {
      const data: { status: 'approved' | 'rejected' | 'partial'; approvedAmount?: number; notes?: string; rejectionReason?: string } = {
        status: action === 'reject' ? 'rejected' : action === 'partial' ? 'partial' : 'approved',
        notes: notes || undefined,
        rejectionReason: rejectionReason || undefined,
      }

      if (action === 'partial') {
        data.approvedAmount = parseFloat(approvedAmount)
      }

      await updateExpenseApproval(approval.id, data)
      toast.success(
        action === 'approve'
          ? 'Expense approved successfully'
          : action === 'partial'
            ? `Expense partially approved — ${formatCurrency(parseFloat(approvedAmount))}`
            : 'Expense rejected'
      )
      onOpenChange(false)
      onApproved()
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to process approval')
    } finally {
      setSubmitting(false)
    }
  }

  if (!approval) return null

  const dialogConfig = {
    approve: {
      title: 'Approve Expense',
      description: `Approve ${formatCurrency(approval.amount)} for ${approval.expense.category} expense`,
      icon: <CheckCircle className="h-5 w-5 text-emerald-500" />,
      btnClass: 'bg-emerald-600 hover:bg-emerald-700 text-white',
      btnLabel: 'Approve',
    },
    partial: {
      title: 'Partial Approval',
      description: `Adjust the approved amount for this expense`,
      icon: <Percent className="h-5 w-5 text-sky-500" />,
      btnClass: 'bg-sky-500 hover:bg-sky-600 text-white',
      btnLabel: 'Partial Approve',
    },
    reject: {
      title: 'Reject Expense',
      description: `Reject this ${approval.expense.category} expense request`,
      icon: <XCircle className="h-5 w-5 text-red-500" />,
      btnClass: 'bg-red-600 hover:bg-red-700 text-white',
      btnLabel: 'Reject',
    },
  }

  const cfg = dialogConfig[action]

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            {cfg.icon}
            {cfg.title}
          </DialogTitle>
          <DialogDescription>{cfg.description}</DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-2">
          {/* Expense Summary */}
          <div className="rounded-lg border bg-muted/30 p-3 space-y-2 text-sm">
            <div className="flex justify-between">
              <span className="text-muted-foreground">Category</span>
              <span className="font-medium capitalize">{approval.expense.category}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">Description</span>
              <span className="font-medium text-right max-w-[200px] truncate">{approval.expense.description}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">Truck</span>
              <span className="font-medium">{approval.expense.truck.plateNumber}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">Date</span>
              <span className="font-medium">{formatDate(approval.expense.date)}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">Requested Amount</span>
              <span className="font-bold text-amber-600">{formatCurrency(approval.amount)}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">Requested By</span>
              <span className="font-medium">{approval.requestedBy.name}</span>
            </div>
            {approval.expense.trip && (
              <div className="flex justify-between">
                <span className="text-muted-foreground">Trip</span>
                <span className="font-medium">{approval.expense.trip.tripNumber}</span>
              </div>
            )}
          </div>

          {/* Partial Approval Amount */}
          {action === 'partial' && (
            <div className="space-y-2">
              <Label className="text-sm font-medium">Approved Amount (GHS) *</Label>
              <div className="relative">
                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground text-sm font-medium">{CURRENCY_SYMBOL}</span>
                <Input
                  type="number"
                  value={approvedAmount}
                  onChange={e => setApprovedAmount(e.target.value)}
                  className="pl-8"
                  min="0"
                  step="0.01"
                />
              </div>
              {parseFloat(approvedAmount) > 0 && parseFloat(approvedAmount) < approval.amount && (
                <p className="text-xs text-sky-600">
                  Difference: {formatCurrency(approval.amount - parseFloat(approvedAmount))} will be denied
                </p>
              )}
            </div>
          )}

          {/* Rejection Reason */}
          {action === 'reject' && (
            <div className="space-y-2">
              <Label className="text-sm font-medium">Rejection Reason *</Label>
              <Textarea
                value={rejectionReason}
                onChange={e => setRejectionReason(e.target.value)}
                placeholder="Explain why this expense is being rejected..."
                rows={3}
              />
            </div>
          )}

          {/* Notes */}
          <div className="space-y-2">
            <Label className="text-sm font-medium">Notes (optional)</Label>
            <Textarea
              value={notes}
              onChange={e => setNotes(e.target.value)}
              placeholder="Additional notes..."
              rows={2}
            />
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button
            onClick={handleSubmit}
            disabled={(action === 'reject' && !rejectionReason.trim()) || submitting}
            className={cfg.btnClass}
          >
            {submitting ? (
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            ) : action === 'reject' ? (
              <Ban className="mr-2 h-4 w-4" />
            ) : action === 'partial' ? (
              <Percent className="mr-2 h-4 w-4" />
            ) : (
              <CheckCircle className="mr-2 h-4 w-4" />
            )}
            {cfg.btnLabel}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

// ==================== DETAIL SHEET ====================

function ApprovalDetailSheet({
  approvalId,
  open,
  onOpenChange,
}: {
  approvalId: string | null
  open: boolean
  onOpenChange: (open: boolean) => void
}) {
  const [approval, setApproval] = React.useState<ExpenseApproval | null>(null)
  const [loading, setLoading] = React.useState(false)

  React.useEffect(() => {
    if (approvalId && open) {
      setLoading(true)
      fetchExpenseApproval(approvalId)
        .then(data => setApproval(data))
        .catch(() => setApproval(null))
        .finally(() => setLoading(false))
    }
  }, [approvalId, open])

  if (loading) {
    return (
      <Sheet open={open} onOpenChange={onOpenChange}>
        <SheetContent side="right" className="w-full sm:max-w-lg">
          <div className="p-6 space-y-4">
            <Skeleton className="h-8 w-48" />
            <Skeleton className="h-32 w-full" />
            <Skeleton className="h-24 w-full" />
          </div>
        </SheetContent>
      </Sheet>
    )
  }

  if (!approval) return null

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="w-full sm:max-w-lg">
        <div className="space-y-6 p-6">
          <SheetHeader>
            <SheetTitle className="flex items-center gap-2">
              <ClipboardCheck className="h-5 w-5 text-amber-500" />
              Approval Details
            </SheetTitle>
            <SheetDescription>
              {getApprovalLevelLabel(approval.approvalLevel)}
            </SheetDescription>
          </SheetHeader>

          {/* Status Badge + Created */}
          <div className="flex items-center gap-2 flex-wrap">
            <Badge className={STATUS_CONFIG[approval.status]?.color || ''} variant="outline">
              {STATUS_CONFIG[approval.status]?.label || approval.status}
            </Badge>
            <span className="text-xs text-muted-foreground">
              Created {formatDateTime(approval.createdAt)}
            </span>
          </div>

          {/* Timeline */}
          <div className="rounded-lg border p-4 space-y-3">
            <h4 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">Timeline</h4>
            <div className="space-y-3">
              <div className="flex gap-3">
                <div className="flex flex-col items-center">
                  <div className="h-2.5 w-2.5 rounded-full bg-amber-500 mt-1" />
                  <div className="w-px flex-1 bg-border" />
                </div>
                <div className="pb-3">
                  <p className="text-sm font-medium">Submitted</p>
                  <p className="text-xs text-muted-foreground">
                    {formatDateTime(approval.createdAt)} by {approval.requestedBy.name}
                  </p>
                </div>
              </div>
              {approval.reviewedAt && approval.approvedBy && (
                <div className="flex gap-3">
                  <div className="flex flex-col items-center">
                    <div className={`h-2.5 w-2.5 rounded-full mt-1 ${
                      approval.status === 'approved' ? 'bg-emerald-500' :
                      approval.status === 'partial' ? 'bg-sky-500' :
                      'bg-red-500'
                    }`} />
                  </div>
                  <div>
                    <p className="text-sm font-medium">
                      {approval.status === 'approved' ? 'Approved' :
                       approval.status === 'partial' ? 'Partially Approved' : 'Rejected'}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {formatDateTime(approval.reviewedAt)} by {approval.approvedBy.name}
                    </p>
                  </div>
                </div>
              )}
              {!approval.reviewedAt && (
                <div className="flex gap-3">
                  <div className="flex flex-col items-center">
                    <div className="h-2.5 w-2.5 rounded-full bg-muted-foreground/30 mt-1 animate-pulse" />
                  </div>
                  <div>
                    <p className="text-sm font-medium text-muted-foreground">Awaiting review</p>
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* Expense Info */}
          <div className="rounded-lg border p-4 space-y-3">
            <h4 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">Expense</h4>
            <div className="space-y-2 text-sm">
              <div className="flex justify-between">
                <span className="text-muted-foreground">Category</span>
                <span className="font-medium">
                  <Badge className={EXPENSE_CATEGORY_COLORS[approval.expense.category] || ''} variant="outline">
                    {approval.expense.category}
                  </Badge>
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Description</span>
                <span className="font-medium text-right max-w-[200px]">{approval.expense.description}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Truck</span>
                <span className="font-medium">{approval.expense.truck.plateNumber}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Date</span>
                <span className="font-medium">{formatDate(approval.expense.date)}</span>
              </div>
              {approval.expense.trip && (
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Trip</span>
                  <span className="font-medium">{approval.expense.trip.tripNumber} — {approval.expense.trip.loadingLocation} → {approval.expense.trip.destination}</span>
                </div>
              )}
            </div>
          </div>

          {/* Amounts */}
          <div className="rounded-lg border p-4 space-y-3">
            <h4 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">Amounts</h4>
            <div className="space-y-2 text-sm">
              <div className="flex justify-between">
                <span className="text-muted-foreground">Requested Amount</span>
                <span className="font-bold text-amber-600">{formatCurrency(approval.amount)}</span>
              </div>
              {approval.approvedAmount !== null && (
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Approved Amount</span>
                  <span className="font-bold text-emerald-600">{formatCurrency(approval.approvedAmount)}</span>
                </div>
              )}
              {approval.status === 'partial' && (
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Denied Portion</span>
                  <span className="font-bold text-red-600">{formatCurrency(approval.amount - (approval.approvedAmount || 0))}</span>
                </div>
              )}
            </div>
          </div>

          {/* People */}
          <div className="rounded-lg border p-4 space-y-3">
            <h4 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">People</h4>
            <div className="space-y-2 text-sm">
              <div className="flex justify-between">
                <span className="text-muted-foreground">Requested By</span>
                <span className="font-medium">{approval.requestedBy.name}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Reviewed By</span>
                <span className="font-medium">{approval.approvedBy?.name || '—'}</span>
              </div>
              {approval.reviewedAt && (
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Reviewed At</span>
                  <span className="font-medium">{formatDateTime(approval.reviewedAt)}</span>
                </div>
              )}
            </div>
          </div>

          {/* Notes & Reason */}
          {(approval.notes || approval.rejectionReason) && (
            <div className="rounded-lg border p-4 space-y-3">
              <h4 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">Notes</h4>
              {approval.notes && (
                <p className="text-sm text-muted-foreground">{approval.notes}</p>
              )}
              {approval.rejectionReason && (
                <div className="rounded-lg border border-red-200 dark:border-red-800 bg-red-50 dark:bg-red-950/20 p-3">
                  <p className="text-xs font-medium text-red-600 mb-1">Rejection Reason</p>
                  <p className="text-sm">{approval.rejectionReason}</p>
                </div>
              )}
            </div>
          )}
        </div>
      </SheetContent>
    </Sheet>
  )
}

// ==================== LOADING SKELETON ====================

function SummarySkeleton() {
  return (
    <Card>
      <CardContent className="p-4 sm:p-6">
        <Skeleton className="h-3 w-24 mb-3" />
        <Skeleton className="h-7 w-20" />
      </CardContent>
    </Card>
  )
}

// ==================== MAIN VIEW ====================

export function ExpenseApprovalsView() {
  const [approvals, setApprovals] = React.useState<ExpenseApproval[]>([])
  const [summary, setSummary] = React.useState<ExpenseApprovalSummary | null>(null)
  const [loading, setLoading] = React.useState(true)
  const [error, setError] = React.useState<string | null>(null)
  const [total, setTotal] = React.useState(0)
  const [page, setPage] = React.useState(1)
  const limit = 20

  // Filters
  const [activeTab, setActiveTab] = React.useState('all')
  const [searchQuery, setSearchQuery] = React.useState('')
  const [dateFrom, setDateFrom] = React.useState('')
  const [dateTo, setDateTo] = React.useState('')
  const [showFilters, setShowFilters] = React.useState(false)

  // Actions
  const [approvalDialogOpen, setApprovalDialogOpen] = React.useState(false)
  const [rejectDialogOpen, setRejectDialogOpen] = React.useState(false)
  const [selectedApproval, setSelectedApproval] = React.useState<ExpenseApproval | null>(null)
  const [dialogAction, setDialogAction] = React.useState<'approve' | 'reject' | 'partial'>('approve')

  // Detail
  const [detailApprovalId, setDetailApprovalId] = React.useState<string | null>(null)
  const [detailOpen, setDetailOpen] = React.useState(false)

  // Load data
  const loadData = React.useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const params: Record<string, string | number> = { limit, page }
      if (activeTab !== 'all') params.status = activeTab
      if (searchQuery) params.search = searchQuery

      const res = await fetchExpenseApprovals(params as Parameters<typeof fetchExpenseApprovals>[0])
      let data = res.data || []

      // Apply date range filter client-side
      if (dateFrom) {
        data = data.filter(a => a.createdAt >= dateFrom)
      }
      if (dateTo) {
        const toDate = new Date(dateTo)
        toDate.setDate(toDate.getDate() + 1)
        data = data.filter(a => a.createdAt < toISOString().split('T')[0] ? a.createdAt <= dateTo : true)
        data = data.filter(a => a.expense.date <= dateTo)
      }

      setApprovals(data)
      setTotal(res.total || 0)
      setSummary(res.summary || null)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load expense approvals')
    } finally {
      setLoading(false)
    }
  }, [activeTab, searchQuery, page, dateFrom, dateTo])

  React.useEffect(() => {
    loadData()
  }, [loadData])

  const totalPages = Math.ceil(total / limit)

  // Action handlers
  function openApproveDialog(approval: ExpenseApproval) {
    setSelectedApproval(approval)
    setDialogAction('approve')
    setApprovalDialogOpen(true)
  }

  function openPartialDialog(approval: ExpenseApproval) {
    setSelectedApproval(approval)
    setDialogAction('partial')
    setApprovalDialogOpen(true)
  }

  function openRejectDialog(approval: ExpenseApproval) {
    setSelectedApproval(approval)
    setDialogAction('reject')
    setRejectDialogOpen(true)
  }

  function handleViewDetail(approval: ExpenseApproval) {
    setDetailApprovalId(approval.id)
    setDetailOpen(true)
  }

  // Client-side search filter
  const filteredApprovals = React.useMemo(() => {
    if (!searchQuery) return approvals
    const q = searchQuery.toLowerCase()
    return approvals.filter(a =>
      a.expense.truck?.plateNumber?.toLowerCase().includes(q) ||
      a.expense.category.toLowerCase().includes(q) ||
      a.expense.description.toLowerCase().includes(q) ||
      a.requestedBy.name.toLowerCase().includes(q)
    )
  }, [approvals, searchQuery])

  function resetFilters() {
    setSearchQuery('')
    setActiveTab('all')
    setPage(1)
    setDateFrom('')
    setDateTo('')
  }

  return (
    <motion.div
      variants={containerVariants}
      animate="show"
      className="space-y-4 sm:space-y-6"
    >
      {/* Header */}
      <motion.div variants={itemVariants} className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Expense Approvals</h1>
          <p className="text-muted-foreground">Review and manage expense approval workflow</p>
        </div>
        <Button variant="outline" size="sm" onClick={resetFilters}>
          <RefreshCw className="mr-1.5 h-3.5 w-3.5" /> Reset
        </Button>
      </motion.div>

      {/* Summary Stats Cards */}
      <motion.div variants={itemVariants} className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
        {loading ? (
          <>
            <SummarySkeleton />
            <SummarySkeleton />
            <SummarySkeleton />
            <SummarySkeleton />
          </>
        ) : (
          <>
            <StatsCard
              icon={Clock}
              title="Pending Count"
              value={String(summary?.pendingCount || 0)}
              changeLabel={`${formatCurrency(summary?.pendingAmount || 0)} pending value`}
              className="cursor-default"
            />
            <StatsCard
              icon={TrendingDown}
              title="Pending Amount"
              value={formatCurrency(summary?.pendingAmount || 0)}
              changeLabel="Awaiting approval"
              className="cursor-default"
            />
            <StatsCard
              icon={CheckCircle}
              title="Approved This Month"
              value={String(summary?.approvedThisMonthCount || 0)}
              changeLabel={formatCurrency(summary?.approvedThisMonthAmount || 0)}
              className="cursor-default"
            />
            <StatsCard
              icon={XCircle}
              title="Rejected This Month"
              value={String(summary?.totalCount != null ? Math.max(0, (summary.totalCount || 0) - (summary.approvedThisMonthCount || 0) - (summary.pendingCount || 0)) : 0)}
              changeLabel="Requires review"
              className="cursor-default"
            />
          </>
        )}
      </motion.div>

      {/* Search & Filters */}
      <motion.div variants={itemVariants} className="space-y-3">
        <div className="flex flex-col sm:flex-row gap-2 sm:gap-3">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Search truck, category, requester..."
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
            {(dateFrom || dateTo) && (
              <span className="ml-1.5 h-1.5 w-1.5 rounded-full bg-amber-500" />
            )}
          </Button>
        </div>

        {/* Date Range Filter */}
        {showFilters && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            exit={{ opacity: 0, height: 0 }}
            className="flex flex-col sm:flex-row gap-2 sm:gap-3"
          >
            <div className="space-y-1.5 flex-1">
              <Label className="text-xs text-muted-foreground">From Date</Label>
              <Input
                type="date"
                value={dateFrom}
                onChange={e => { setDateFrom(e.target.value); setPage(1) }}
                className="h-9"
              />
            </div>
            <div className="space-y-1.5 flex-1">
              <Label className="text-xs text-muted-foreground">To Date</Label>
              <Input
                type="date"
                value={dateTo}
                onChange={e => { setDateTo(e.target.value); setPage(1) }}
                className="h-9"
              />
            </div>
            {(dateFrom || dateTo) && (
              <div className="flex items-end">
                <Button
                  variant="ghost"
                  size="sm"
                  className="text-muted-foreground"
                  onClick={() => { setDateFrom(''); setDateTo('') }}
                >
                  Clear dates
                </Button>
              </div>
            )}
          </motion.div>
        )}
      </motion.div>

      {/* Tabs */}
      <motion.div variants={itemVariants}>
        <Tabs value={activeTab} onValueChange={v => { setActiveTab(v); setPage(1) }}>
          <TabsList className="w-full sm:w-auto">
            <TabsTrigger value="all">All</TabsTrigger>
            <TabsTrigger value="pending" className="gap-1">
              Pending{summary?.pendingCount ? ` (${summary.pendingCount})` : ''}
            </TabsTrigger>
            <TabsTrigger value="approved">Approved</TabsTrigger>
            <TabsTrigger value="partial">Partial</TabsTrigger>
            <TabsTrigger value="rejected">Rejected</TabsTrigger>
          </TabsList>
        </Tabs>
      </motion.div>

      {/* Table / Cards */}
      <motion.div variants={itemVariants} className="rounded-lg border">
        {loading ? (
          <div className="p-6 space-y-3">
            {Array.from({ length: 5 }).map((_, i) => (
              <Skeleton key={i} className="h-12 w-full" />
            ))}
          </div>
        ) : error ? (
          <div className="p-6 text-center">
            <AlertCircle className="h-8 w-8 mx-auto mb-2 text-red-400" />
            <p className="text-sm text-muted-foreground">{error}</p>
          </div>
        ) : filteredApprovals.length === 0 ? (
          <div className="p-8">
            <EmptyState
              icon={ClipboardCheck}
              title="No expense approvals found"
              description={activeTab !== 'all'
                ? `No ${activeTab} approvals match your filters`
                : 'No approvals yet. Submit expenses for approval from the Expenses page.'}
            />
          </div>
        ) : (
          <>
            {/* Desktop Table */}
            <div className="hidden md:block overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Expense</TableHead>
                    <TableHead>Truck</TableHead>
                    <TableHead>Amount</TableHead>
                    <TableHead>Requested By</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Date</TableHead>
                    <TableHead className="text-right">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredApprovals.map((approval) => (
                    <TableRow key={approval.id}>
                      <TableCell>
                        <div>
                          <p className="font-medium capitalize">{approval.expense.category}</p>
                          <p className="text-xs text-muted-foreground max-w-[180px] truncate">
                            {approval.expense.description}
                          </p>
                        </div>
                      </TableCell>
                      <TableCell>
                        <span className="font-medium text-sm">
                          {approval.expense.truck?.plateNumber || '—'}
                        </span>
                      </TableCell>
                      <TableCell>
                        <div>
                          <span className="font-bold">{formatCurrency(approval.amount)}</span>
                          {approval.approvedAmount !== null && approval.approvedAmount < approval.amount && (
                            <p className="text-xs text-sky-600">→ {formatCurrency(approval.approvedAmount)}</p>
                          )}
                        </div>
                      </TableCell>
                      <TableCell>
                        <span className="text-sm">{approval.requestedBy.name}</span>
                      </TableCell>
                      <TableCell>
                        <Badge className={STATUS_CONFIG[approval.status]?.color || ''} variant="outline">
                          {STATUS_CONFIG[approval.status]?.label || approval.status}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        <span className="text-sm text-muted-foreground">{formatDate(approval.createdAt)}</span>
                      </TableCell>
                      <TableCell className="text-right">
                        <div className="flex items-center justify-end gap-1">
                          <Button variant="ghost" size="sm" onClick={() => handleViewDetail(approval)}>
                            <Eye className="h-4 w-4 text-muted-foreground" />
                          </Button>
                          {approval.status === 'pending' && (
                            <>
                              <Button
                                variant="ghost"
                                size="sm"
                                className="text-emerald-600 hover:text-emerald-700 hover:bg-emerald-50 dark:hover:bg-emerald-950/20"
                                onClick={() => openApproveDialog(approval)}
                              >
                                <CheckCircle className="h-4 w-4" />
                              </Button>
                              <Button
                                variant="ghost"
                                size="sm"
                                className="text-sky-600 hover:text-sky-700 hover:bg-sky-50 dark:hover:bg-sky-950/20"
                                onClick={() => openPartialDialog(approval)}
                              >
                                <Percent className="h-4 w-4" />
                              </Button>
                              <Button
                                variant="ghost"
                                size="sm"
                                className="text-red-600 hover:text-red-700 hover:bg-red-50 dark:hover:bg-red-950/20"
                                onClick={() => openRejectDialog(approval)}
                              >
                                <XCircle className="h-4 w-4" />
                              </Button>
                            </>
                          )}
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>

            {/* Mobile Cards */}
            <div className="md:hidden divide-y">
              {filteredApprovals.map((approval) => (
                <div key={approval.id} className="mobile-card p-4 space-y-3">
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-1 flex-wrap">
                        <Badge className={EXPENSE_CATEGORY_COLORS[approval.expense.category] || ''} variant="outline">
                          {approval.expense.category}
                        </Badge>
                        <Badge className={STATUS_CONFIG[approval.status]?.color || ''} variant="outline">
                          {STATUS_CONFIG[approval.status]?.label || approval.status}
                        </Badge>
                      </div>
                      <p className="text-sm text-muted-foreground truncate">{approval.expense.description}</p>
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-2 text-sm">
                    <div className="space-y-0.5">
                      <p className="text-xs text-muted-foreground">Truck</p>
                      <p className="font-medium">{approval.expense.truck?.plateNumber || '—'}</p>
                    </div>
                    <div className="space-y-0.5">
                      <p className="text-xs text-muted-foreground">Amount</p>
                      <p className="font-bold text-amber-600">{formatCurrency(approval.amount)}</p>
                    </div>
                    <div className="space-y-0.5">
                      <p className="text-xs text-muted-foreground">Requested By</p>
                      <p className="font-medium">{approval.requestedBy.name}</p>
                    </div>
                    <div className="space-y-0.5">
                      <p className="text-xs text-muted-foreground">Date</p>
                      <p className="font-medium">{formatDate(approval.createdAt)}</p>
                    </div>
                  </div>

                  {approval.approvedAmount !== null && approval.approvedAmount < approval.amount && (
                    <div className="flex items-center gap-1 text-xs text-sky-600 bg-sky-50 dark:bg-sky-950/20 rounded px-2 py-1">
                      <Percent className="h-3 w-3" />
                      Partial: {formatCurrency(approval.approvedAmount)}
                    </div>
                  )}

                  {approval.rejectionReason && (
                    <div className="flex items-start gap-1 text-xs text-red-600 bg-red-50 dark:bg-red-950/20 rounded px-2 py-1">
                      <XCircle className="h-3 w-3 mt-0.5 shrink-0" />
                      {approval.rejectionReason}
                    </div>
                  )}

                  <div className="flex items-center gap-2 pt-1">
                    <Button
                      variant="outline"
                      size="sm"
                      className="min-h-[44px] flex-1"
                      onClick={() => handleViewDetail(approval)}
                    >
                      <Eye className="mr-1.5 h-3.5 w-3.5" /> Details
                    </Button>
                    {approval.status === 'pending' && (
                      <>
                        <Button
                          variant="outline"
                          size="sm"
                          className="min-h-[44px] flex-1 text-emerald-600 border-emerald-300 hover:bg-emerald-50"
                          onClick={() => openApproveDialog(approval)}
                        >
                          <CheckCircle className="mr-1.5 h-3.5 w-3.5" /> Approve
                        </Button>
                        <Button
                          variant="outline"
                          size="sm"
                          className="min-h-[44px] text-red-600 border-red-300 hover:bg-red-50"
                          onClick={() => openRejectDialog(approval)}
                        >
                          <XCircle className="mr-1.5 h-3.5 w-3.5" />
                        </Button>
                      </>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </>
        )}
      </motion.div>

      {/* Pagination */}
      {!loading && totalPages > 1 && (
        <motion.div variants={itemVariants} className="flex items-center justify-between">
          <p className="text-sm text-muted-foreground">
            Showing {((page - 1) * limit) + 1}–{Math.min(page * limit, total)} of {total}
          </p>
          <div className="flex items-center gap-1">
            <Button variant="outline" size="sm" disabled={page <= 1} onClick={() => setPage(p => p - 1)}>
              <ChevronLeft className="h-4 w-4" />
            </Button>
            {Array.from({ length: Math.min(totalPages, 5) }).map((_, i) => {
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
            <Button variant="outline" size="sm" disabled={page >= totalPages} onClick={() => setPage(p => p + 1)}>
              <ChevronRight className="h-4 w-4" />
            </Button>
          </div>
        </motion.div>
      )}

      {/* Dialogs */}
      <ApprovalDialog
        open={dialogAction === 'approve' || dialogAction === 'partial' ? approvalDialogOpen : false}
        onOpenChange={(open) => {
          setApprovalDialogOpen(open)
          if (!open) setSelectedApproval(null)
        }}
        onApproved={() => loadData()}
        approval={selectedApproval}
        action={dialogAction === 'approve' || dialogAction === 'partial' ? dialogAction : 'approve'}
      />
      <ApprovalDialog
        open={rejectDialogOpen}
        onOpenChange={(open) => {
          setRejectDialogOpen(open)
          if (!open) setSelectedApproval(null)
        }}
        onApproved={() => loadData()}
        approval={selectedApproval}
        action="reject"
      />
      <ApprovalDetailSheet
        approvalId={detailApprovalId}
        open={detailOpen}
        onOpenChange={setDetailOpen}
      />
    </motion.div>
  )
}
