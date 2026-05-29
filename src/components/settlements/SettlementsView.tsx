'use client'

import * as React from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import {
  Wallet, Plus, Eye, CheckCircle, Banknote, Clock, TrendingUp,
  AlertCircle, RefreshCw, Trash2, Printer, ArrowUpRight, ArrowDownRight,
  X, ChevronRight, CalendarDays, Truck, User,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Skeleton } from '@/components/ui/skeleton'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Separator } from '@/components/ui/separator'
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import { EmptyState } from '@/components/ui/empty-state'
import {
  Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription,
} from '@/components/ui/sheet'
import {
  Dialog, DialogContent, DialogBody, DialogHeader, DialogTitle, DialogDescription, DialogFooter,
} from '@/components/ui/dialog'
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select'
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table'
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from '@/components/ui/alert-dialog'
import { CURRENCY_SYMBOL, MONTHS } from '@/lib/constants'
import {
  fetchSettlements, fetchSettlementDetail, generateSettlement,
  updateSettlement, deleteSettlement,
  fetchDrivers, fetchTrips,
  type DriverSettlement, type SettlementSummary, type SettlementLine,
  type Driver, type Trip,
} from '@/lib/api'
import { useAuthStore } from '@/lib/store/auth'
import { toast } from 'sonner'

const containerVariants = {
  show: { transition: { staggerChildren: 0.04 } },
}
const itemVariants = {
  show: { opacity: 1, y: 0 },
}

function formatCurrency(amount: number): string {
  return `${CURRENCY_SYMBOL}${Math.abs(amount).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
}

function formatPeriod(period: string): string {
  const [year, month] = period.split('-')
  const monthIndex = parseInt(month, 10) - 1
  return `${MONTHS[monthIndex]} ${year}`
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

const STATUS_CONFIG: Record<string, { label: string; color: string }> = {
  pending: { label: 'Pending', color: 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400' },
  approved: { label: 'Approved', color: 'bg-sky-100 text-sky-700 dark:bg-sky-900/30 dark:text-sky-400' },
  paid: { label: 'Paid', color: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400' },
}

const LINE_TYPE_CONFIG: Record<string, { label: string; color: string; icon: typeof ArrowUpRight }> = {
  trip_revenue: { label: 'Trip Revenue', color: 'text-emerald-600', icon: ArrowUpRight },
  fuel_deduction: { label: 'Fuel Cost', color: 'text-red-600', icon: ArrowDownRight },
  expense_deduction: { label: 'Expense', color: 'text-red-600', icon: ArrowDownRight },
  bonus: { label: 'Bonus', color: 'text-emerald-600', icon: ArrowUpRight },
  adjustment: { label: 'Adjustment', color: 'text-gray-600', icon: ArrowUpRight },
}

// ==================== Generate Settlement Dialog ====================
function GenerateSettlementDialog({
  open, onOpenChange, onGenerated,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  onGenerated: () => void
}) {
  const [drivers, setDrivers] = React.useState<Driver[]>([])
  const [selectedDriverId, setSelectedDriverId] = React.useState('')
  const [selectedMonth, setSelectedMonth] = React.useState(String(new Date().getMonth() + 1))
  const [selectedYear, setSelectedYear] = React.useState(String(new Date().getFullYear()))
  const [generating, setGenerating] = React.useState(false)
  const [preview, setPreview] = React.useState<{ tripCount: number; estGross: number; estDeductions: number } | null>(null)
  const [loadingPreview, setLoadingPreview] = React.useState(false)

  React.useEffect(() => {
    if (open) {
      fetchDrivers({ status: 'active', limit: 100 }).then(res => setDrivers(res.data)).catch(() => {})
    }
  }, [open])

  React.useEffect(() => {
    if (selectedDriverId && selectedMonth && selectedYear) {
      loadPreview()
    } else {
      setPreview(null)
    }
  }, [selectedDriverId, selectedMonth, selectedYear])

  async function loadPreview() {
    if (!selectedDriverId) return
    setLoadingPreview(true)
    try {
      const month = parseInt(selectedMonth)
      const year = parseInt(selectedYear)
      const start = new Date(year, month - 1, 1).toISOString()
      const end = new Date(year, month, 0, 23, 59, 59).toISOString()
      const res = await fetchTrips({ driverId: selectedDriverId, limit: 200 })
      const completedTrips = res.data.filter(t =>
        (t.status === 'completed' || t.status === 'cancelled') &&
        new Date(t.createdAt) >= new Date(start) &&
        new Date(t.createdAt) <= new Date(end)
      )
      const estGross = completedTrips.reduce((sum, t) => sum + (t.totalRevenue || 0), 0)
      const estDeductions = completedTrips.reduce((sum, t) => sum + ((t as unknown as { fuelCost?: number }).fuelCost || 0), 0)
      setPreview({ tripCount: completedTrips.length, estGross, estDeductions })
    } catch {
      setPreview(null)
    } finally {
      setLoadingPreview(false)
    }
  }

  async function handleGenerate() {
    if (!selectedDriverId) return
    setGenerating(true)
    try {
      const month = parseInt(selectedMonth)
      const year = parseInt(selectedYear)
      const periodStart = new Date(year, month - 1, 1).toISOString()
      const periodEnd = new Date(year, month, 0, 23, 59, 59).toISOString()
      await generateSettlement({ driverId: selectedDriverId, periodStart, periodEnd })
      toast.success('Settlement generated successfully')
      onOpenChange(false)
      setSelectedDriverId('')
      setPreview(null)
      onGenerated()
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to generate settlement')
    } finally {
      setGenerating(false)
    }
  }

  const monthLabel = MONTHS[parseInt(selectedMonth) - 1]

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Wallet className="h-5 w-5 text-amber-500" />
            Generate Settlement
          </DialogTitle>
          <DialogDescription>
            Auto-calculate earnings and deductions from completed trips for a driver.
          </DialogDescription>
        </DialogHeader>

        <DialogBody className="space-y-4 py-2">
          <div className="space-y-2">
            <label className="text-sm font-medium">Select Driver</label>
            <Select value={selectedDriverId} onValueChange={setSelectedDriverId}>
              <SelectTrigger>
                <SelectValue placeholder="Choose a driver..." />
              </SelectTrigger>
              <SelectContent>
                {drivers.map(d => (
                  <SelectItem key={d.id} value={d.id}>
                    {d.firstName} {d.lastName} ({d.employeeId})
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-2">
              <label className="text-sm font-medium">Month</label>
              <Select value={selectedMonth} onValueChange={setSelectedMonth}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {MONTHS.map((m, i) => (
                    <SelectItem key={m} value={String(i + 1)}>{m}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium">Year</label>
              <Select value={selectedYear} onValueChange={setSelectedYear}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {Array.from({ length: 5 }).map((_, i) => {
                    const year = new Date().getFullYear() - 2 + i
                    return <SelectItem key={year} value={String(year)}>{year}</SelectItem>
                  })}
                </SelectContent>
              </Select>
            </div>
          </div>

          {/* Preview */}
          {selectedDriverId && loadingPreview && (
            <div className="rounded-lg border p-4 space-y-2">
              <Skeleton className="h-4 w-32" />
              <Skeleton className="h-8 w-24" />
            </div>
          )}
          {preview && !loadingPreview && (
            <motion.div
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              className="rounded-lg border border-amber-200 dark:border-amber-800 bg-amber-50 dark:bg-amber-950/30 p-4 space-y-2"
            >
              <p className="text-sm font-medium text-amber-700 dark:text-amber-400 flex items-center gap-1.5">
                <CalendarDays className="h-4 w-4" />
                Preview — {monthLabel} {selectedYear}
              </p>
              <div className="grid grid-cols-3 gap-3 text-sm">
                <div>
                  <p className="text-muted-foreground">Trips</p>
                  <p className="font-semibold">{preview.tripCount}</p>
                </div>
                <div>
                  <p className="text-muted-foreground">Est. Gross</p>
                  <p className="font-semibold text-emerald-600">{formatCurrency(preview.estGross)}</p>
                </div>
                <div>
                  <p className="text-muted-foreground">Est. Deductions</p>
                  <p className="font-semibold text-red-600">-{formatCurrency(preview.estDeductions)}</p>
                </div>
              </div>
              {preview.tripCount === 0 && (
                <p className="text-xs text-amber-600 dark:text-amber-400 mt-1">
                  No completed trips found for this period. Settlement will be created with zero values.
                </p>
              )}
            </motion.div>
          )}
        </DialogBody>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button
            onClick={handleGenerate}
            disabled={!selectedDriverId || generating}
            className="bg-amber-500 hover:bg-amber-600 text-white"
          >
            {generating ? (
              <><div className="mr-2 h-4 w-4 animate-spin rounded-full border-2 border-white/30 border-t-white" /> Generating...</>
            ) : (
              <><Wallet className="mr-2 h-4 w-4" /> Generate Settlement</>
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

// ==================== Settlement Detail Sheet ====================
function SettlementDetailSheet({
  settlementId, open, onOpenChange, onUpdated, onDeleted,
}: {
  settlementId: string | null
  open: boolean
  onOpenChange: (open: boolean) => void
  onUpdated: () => void
  onDeleted: () => void
}) {
  const [settlement, setSettlement] = React.useState<DriverSettlement | null>(null)
  const [loading, setLoading] = React.useState(false)
  const [actionLoading, setActionLoading] = React.useState(false)
  const [notes, setNotes] = React.useState('')
  const [bonusAmount, setBonusAmount] = React.useState('0')
  const [savingNotes, setSavingNotes] = React.useState(false)
  const [deleteDialogOpen, setDeleteDialogOpen] = React.useState(false)
  const { user } = useAuthStore()

  React.useEffect(() => {
    if (settlementId && open) {
      loadSettlement()
    } else {
      setSettlement(null)
    }
  }, [settlementId, open])

  async function loadSettlement() {
    if (!settlementId) return
    setLoading(true)
    try {
      const res = await fetchSettlementDetail(settlementId)
      setSettlement(res.data)
      setNotes(res.data.notes || '')
      setBonusAmount(String(res.data.bonusAmount || 0))
    } catch (err) {
      toast.error('Failed to load settlement details')
    } finally {
      setLoading(false)
    }
  }

  async function handleApprove() {
    if (!settlement) return
    setActionLoading(true)
    try {
      await updateSettlement(settlement.id, {
        status: 'approved',
        approvedBy: user?.id,
        notes,
        bonusAmount: parseFloat(bonusAmount) || 0,
      })
      toast.success('Settlement approved successfully')
      loadSettlement()
      onUpdated()
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to approve')
    } finally {
      setActionLoading(false)
    }
  }

  async function handleMarkPaid() {
    if (!settlement) return
    setActionLoading(true)
    try {
      await updateSettlement(settlement.id, {
        status: 'paid',
        notes,
        bonusAmount: parseFloat(bonusAmount) || 0,
      })
      toast.success('Settlement marked as paid')
      loadSettlement()
      onUpdated()
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to mark as paid')
    } finally {
      setActionLoading(false)
    }
  }

  async function handleSaveNotes() {
    if (!settlement) return
    setSavingNotes(true)
    try {
      await updateSettlement(settlement.id, {
        notes,
        bonusAmount: parseFloat(bonusAmount) || 0,
      })
      toast.success('Notes saved')
      loadSettlement()
      onUpdated()
    } catch {
      toast.error('Failed to save notes')
    } finally {
      setSavingNotes(false)
    }
  }

  async function handleDelete() {
    if (!settlement) return
    setActionLoading(true)
    try {
      await deleteSettlement(settlement.id)
      toast.success('Settlement deleted')
      setDeleteDialogOpen(false)
      onOpenChange(false)
      onDeleted()
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to delete')
    } finally {
      setActionLoading(false)
    }
  }

  const lines = settlement?.lines || []
  const revenueLines = lines.filter(l => l.type === 'trip_revenue')
  const fuelLines = lines.filter(l => l.type === 'fuel_deduction')
  const expenseLines = lines.filter(l => l.type === 'expense_deduction')
  const bonusLines = lines.filter(l => l.type === 'bonus')
  const adjustmentLines = lines.filter(l => l.type === 'adjustment')

  return (
    <>
      <Sheet open={open} onOpenChange={onOpenChange}>
        <SheetContent side="right" className="w-full sm:max-w-2xl">
          {loading ? (
            <div className="p-6 space-y-4">
              <Skeleton className="h-6 w-48" />
              <Skeleton className="h-4 w-32" />
              <div className="space-y-2">
                {[1, 2, 3, 4].map(i => <Skeleton key={i} className="h-12 w-full" />)}
              </div>
            </div>
          ) : settlement ? (
            <div className="space-y-6 p-6">
              {/* Driver header */}
              <SheetHeader>
                <SheetTitle>Settlement Details</SheetTitle>
                <SheetDescription>
                  {formatPeriod(settlement.period)}
                </SheetDescription>
              </SheetHeader>

              <div className="flex items-center gap-3">
                <Avatar className="h-12 w-12">
                  <AvatarImage src={settlement.driver.photo || undefined} />
                  <AvatarFallback className="bg-amber-100 text-amber-700">
                    {settlement.driver.firstName[0]}{settlement.driver.lastName[0]}
                  </AvatarFallback>
                </Avatar>
                <div>
                  <h3 className="font-semibold">
                    {settlement.driver.firstName} {settlement.driver.lastName}
                  </h3>
                  <p className="text-sm text-muted-foreground flex items-center gap-1">
                    <User className="h-3 w-3" /> {settlement.driver.employeeId}
                  </p>
                </div>
                <Badge className={STATUS_CONFIG[settlement.status]?.color || ''}>
                  {STATUS_CONFIG[settlement.status]?.label || settlement.status}
                </Badge>
              </div>

              <Separator />

              {/* Status timeline */}
              <div className="space-y-2">
                <h4 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">Status Timeline</h4>
                <div className="flex flex-col gap-2 ml-1">
                  <div className="flex items-center gap-2 text-sm">
                    <div className="h-2 w-2 rounded-full bg-emerald-500" />
                    <span>Created</span>
                    <span className="text-muted-foreground ml-auto">{formatDateTime(settlement.createdAt)}</span>
                  </div>
                  {settlement.approvedAt && (
                    <div className="flex items-center gap-2 text-sm">
                      <div className="h-2 w-2 rounded-full bg-sky-500" />
                      <span>Approved</span>
                      <span className="text-muted-foreground ml-auto">{formatDateTime(settlement.approvedAt)}</span>
                    </div>
                  )}
                  {settlement.paidAt && (
                    <div className="flex items-center gap-2 text-sm">
                      <div className="h-2 w-2 rounded-full bg-amber-500" />
                      <span>Paid</span>
                      <span className="text-muted-foreground ml-auto">{formatDateTime(settlement.paidAt)}</span>
                    </div>
                  )}
                </div>
              </div>

              <Separator />

              {/* Earnings breakdown */}
              <div className="space-y-3">
                <h4 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide flex items-center gap-1.5">
                  <ArrowUpRight className="h-4 w-4 text-emerald-500" />
                  Earnings ({formatCurrency(settlement.grossEarnings)})
                </h4>
                {revenueLines.length > 0 ? (
                  <div className="space-y-1.5">
                    {revenueLines.map(line => (
                      <div key={line.id} className="flex items-center justify-between text-sm rounded-md bg-emerald-50 dark:bg-emerald-950/20 px-3 py-2">
                        <div className="flex items-center gap-2 min-w-0">
                          <Truck className="h-3.5 w-3.5 text-emerald-500 shrink-0" />
                          <span className="truncate">{line.description}</span>
                        </div>
                        <span className="font-medium text-emerald-600 shrink-0 ml-2">+{formatCurrency(line.amount)}</span>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="text-sm text-muted-foreground italic">No trip revenue for this period</p>
                )}

                {bonusLines.length > 0 && (
                  <div className="space-y-1.5 mt-2">
                    {bonusLines.map(line => (
                      <div key={line.id} className="flex items-center justify-between text-sm rounded-md bg-emerald-50 dark:bg-emerald-950/20 px-3 py-2">
                        <span className="truncate">{line.description}</span>
                        <span className="font-medium text-emerald-600">+{formatCurrency(line.amount)}</span>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              <Separator />

              {/* Deductions breakdown */}
              <div className="space-y-3">
                <h4 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide flex items-center gap-1.5">
                  <ArrowDownRight className="h-4 w-4 text-red-500" />
                  Deductions ({formatCurrency(settlement.fuelDeductions + settlement.expenseDeductions)})
                </h4>

                {fuelLines.length > 0 && (
                  <div className="space-y-1.5">
                    <p className="text-xs text-muted-foreground font-medium px-1">Fuel Costs</p>
                    {fuelLines.map(line => (
                      <div key={line.id} className="flex items-center justify-between text-sm rounded-md bg-red-50 dark:bg-red-950/20 px-3 py-2">
                        <span className="truncate text-muted-foreground">{line.description}</span>
                        <span className="font-medium text-red-600 shrink-0 ml-2">-{formatCurrency(line.amount)}</span>
                      </div>
                    ))}
                  </div>
                )}

                {expenseLines.length > 0 && (
                  <div className="space-y-1.5 mt-2">
                    <p className="text-xs text-muted-foreground font-medium px-1">Other Expenses</p>
                    {expenseLines.map(line => (
                      <div key={line.id} className="flex items-center justify-between text-sm rounded-md bg-red-50 dark:bg-red-950/20 px-3 py-2">
                        <span className="truncate text-muted-foreground">{line.description}</span>
                        <span className="font-medium text-red-600 shrink-0 ml-2">-{formatCurrency(line.amount)}</span>
                      </div>
                    ))}
                  </div>
                )}

                {adjustmentLines.length > 0 && (
                  <div className="space-y-1.5 mt-2">
                    <p className="text-xs text-muted-foreground font-medium px-1">Adjustments</p>
                    {adjustmentLines.map(line => (
                      <div key={line.id} className={`flex items-center justify-between text-sm rounded-md px-3 py-2 ${line.amount >= 0 ? 'bg-emerald-50 dark:bg-emerald-950/20' : 'bg-red-50 dark:bg-red-950/20'}`}>
                        <span className="truncate text-muted-foreground">{line.description}</span>
                        <span className={`font-medium shrink-0 ml-2 ${line.amount >= 0 ? 'text-emerald-600' : 'text-red-600'}`}>
                          {line.amount >= 0 ? '+' : '-'}{formatCurrency(line.amount)}
                        </span>
                      </div>
                    ))}
                  </div>
                )}

                {fuelLines.length === 0 && expenseLines.length === 0 && adjustmentLines.length === 0 && (
                  <p className="text-sm text-muted-foreground italic">No deductions for this period</p>
                )}
              </div>

              <Separator />

              {/* Summary card */}
              <div className="rounded-lg border-2 border-amber-200 dark:border-amber-800 bg-amber-50 dark:bg-amber-950/30 p-4 space-y-2">
                <h4 className="text-sm font-semibold text-amber-700 dark:text-amber-400">Settlement Summary</h4>
                <div className="space-y-1 text-sm">
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Gross Earnings</span>
                    <span>{formatCurrency(settlement.grossEarnings)}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Fuel Deductions</span>
                    <span className="text-red-600">-{formatCurrency(settlement.fuelDeductions)}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Expense Deductions</span>
                    <span className="text-red-600">-{formatCurrency(settlement.expenseDeductions)}</span>
                  </div>
                  {settlement.bonusAmount > 0 && (
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Bonus</span>
                      <span className="text-emerald-600">+{formatCurrency(settlement.bonusAmount)}</span>
                    </div>
                  )}
                  <Separator />
                  <div className="flex justify-between text-lg font-bold">
                    <span>Net Pay</span>
                    <span className="text-amber-600">{formatCurrency(settlement.netPay)}</span>
                  </div>
                </div>
              </div>

              {/* Notes and bonus */}
              <div className="space-y-3">
                <h4 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">Notes & Bonus</h4>
                <div className="space-y-2">
                  <div>
                    <label className="text-xs font-medium text-muted-foreground">Bonus Amount (₵)</label>
                    <Input
                      type="number"
                      value={bonusAmount}
                      onChange={e => setBonusAmount(e.target.value)}
                      placeholder="0.00"
                      className="mt-1"
                      disabled={settlement.status === 'paid'}
                    />
                  </div>
                  <div>
                    <label className="text-xs font-medium text-muted-foreground">Notes</label>
                    <Textarea
                      value={notes}
                      onChange={e => setNotes(e.target.value)}
                      placeholder="Add settlement notes..."
                      className="mt-1"
                      rows={3}
                      disabled={settlement.status === 'paid'}
                    />
                  </div>
                  {settlement.status !== 'paid' && (
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={handleSaveNotes}
                      disabled={savingNotes}
                    >
                      {savingNotes ? 'Saving...' : 'Save Notes'}
                    </Button>
                  )}
                </div>
              </div>

              {/* Actions */}
              <div className="flex flex-wrap gap-2 pt-2">
                {settlement.status === 'pending' && (
                  <>
                    <Button
                      onClick={handleApprove}
                      disabled={actionLoading}
                      className="bg-sky-500 hover:bg-sky-600 text-white"
                    >
                      <CheckCircle className="mr-2 h-4 w-4" />
                      {actionLoading ? 'Approving...' : 'Approve Settlement'}
                    </Button>
                    <Button
                      variant="destructive"
                      onClick={() => setDeleteDialogOpen(true)}
                      disabled={actionLoading}
                      size="sm"
                    >
                      <Trash2 className="mr-2 h-4 w-4" />
                      Delete
                    </Button>
                  </>
                )}
                {settlement.status === 'approved' && (
                  <Button
                    onClick={handleMarkPaid}
                    disabled={actionLoading}
                    className="bg-emerald-500 hover:bg-emerald-600 text-white"
                  >
                    <Banknote className="mr-2 h-4 w-4" />
                    {actionLoading ? 'Processing...' : 'Mark as Paid'}
                  </Button>
                )}
                {settlement.status === 'paid' && (
                  <Button
                    variant="outline"
                    size="sm"
                    className="text-amber-600"
                    onClick={() => {
                      const printContent = document.getElementById('settlement-detail-content')
                      if (printContent) window.print()
                    }}
                  >
                    <Printer className="mr-2 h-4 w-4" />
                    Print
                  </Button>
                )}
              </div>
            </div>
          ) : null}
        </SheetContent>
      </Sheet>

      <AlertDialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Settlement</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete this settlement? This action cannot be undone. Only pending settlements can be deleted.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={handleDelete} className="bg-red-500 hover:bg-red-600">
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  )
}

// ==================== Settlement Card (Mobile) ====================
function SettlementCard({
  settlement, onView,
}: {
  settlement: DriverSettlement
  onView: () => void
}) {
  const statusCfg = STATUS_CONFIG[settlement.status] || STATUS_CONFIG.pending
  const totalDeductions = settlement.fuelDeductions + settlement.expenseDeductions

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      className="mobile-card rounded-lg border bg-card p-4 space-y-3"
    >
      <div className="flex items-start justify-between">
        <div className="flex items-center gap-3">
          <Avatar className="h-10 w-10">
            <AvatarImage src={settlement.driver.photo || undefined} />
            <AvatarFallback className="bg-amber-100 text-amber-700 text-sm">
              {settlement.driver.firstName[0]}{settlement.driver.lastName[0]}
            </AvatarFallback>
          </Avatar>
          <div>
            <p className="font-medium text-sm">
              {settlement.driver.firstName} {settlement.driver.lastName}
            </p>
            <p className="text-xs text-muted-foreground">
              {formatPeriod(settlement.period)}
            </p>
          </div>
        </div>
        <Badge className={statusCfg.color}>{statusCfg.label}</Badge>
      </div>

      <div className="grid grid-cols-2 gap-2 text-sm">
        <div className="rounded-md bg-muted/50 px-3 py-2">
          <p className="text-xs text-muted-foreground">Gross</p>
          <p className="font-medium">{formatCurrency(settlement.grossEarnings)}</p>
        </div>
        <div className="rounded-md bg-muted/50 px-3 py-2">
          <p className="text-xs text-muted-foreground">Deductions</p>
          <p className="font-medium text-red-600">-{formatCurrency(totalDeductions)}</p>
        </div>
      </div>

      <div className="flex items-center justify-between">
        <div>
          <p className="text-xs text-muted-foreground">Net Pay</p>
          <p className="text-lg font-bold text-amber-600">{formatCurrency(settlement.netPay)}</p>
        </div>
        <Button variant="outline" size="sm" className="min-h-[44px]" onClick={onView}>
          <Eye className="mr-1.5 h-3.5 w-3.5" /> View
        </Button>
      </div>
    </motion.div>
  )
}

// ==================== Main View ====================
export function SettlementsView() {
  const [settlements, setSettlements] = React.useState<DriverSettlement[]>([])
  const [summary, setSummary] = React.useState<SettlementSummary | null>(null)
  const [drivers, setDrivers] = React.useState<Driver[]>([])
  const [loading, setLoading] = React.useState(true)
  const [error, setError] = React.useState<string | null>(null)

  const [filterDriver, setFilterDriver] = React.useState('all')
  const [filterStatus, setFilterStatus] = React.useState('all')
  const [filterPeriod, setFilterPeriod] = React.useState('')

  const [selectedSettlementId, setSelectedSettlementId] = React.useState<string | null>(null)
  const [sheetOpen, setSheetOpen] = React.useState(false)
  const [generateDialogOpen, setGenerateDialogOpen] = React.useState(false)
  const [actionLoading, setActionLoading] = React.useState<string | null>(null)
  const { user } = useAuthStore()

  const loadData = React.useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const params: Record<string, string | number> = { limit: 100 }
      if (filterDriver !== 'all') params.driverId = filterDriver
      if (filterStatus !== 'all') params.status = filterStatus
      if (filterPeriod) params.period = filterPeriod

      const [settlementsRes, driversRes] = await Promise.all([
        fetchSettlements(params as Parameters<typeof fetchSettlements>[0]),
        fetchDrivers({ status: 'active', limit: 100 }),
      ])

      setSettlements(settlementsRes.data)
      setSummary(settlementsRes.summary)
      setDrivers(driversRes.data)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load settlements')
    } finally {
      setLoading(false)
    }
  }, [filterDriver, filterStatus, filterPeriod])

  React.useEffect(() => {
    loadData()
  }, [loadData])

  function handleView(settlement: DriverSettlement) {
    setSelectedSettlementId(settlement.id)
    setSheetOpen(true)
  }

  async function handleQuickAction(id: string, action: string) {
    setActionLoading(id)
    try {
      await updateSettlement(id, {
        status: action,
        approvedBy: action === 'approved' ? user?.id : undefined,
      })
      const label = action === 'approved' ? 'approved' : 'marked as paid'
      toast.success(`Settlement ${label}`)
      loadData()
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Action failed')
    } finally {
      setActionLoading(null)
    }
  }

  const currentMonth = new Date().getMonth() + 1
  const currentYear = new Date().getFullYear()
  const currentPeriod = `${currentYear}-${String(currentMonth).padStart(2, '0')}`

  return (
    <motion.div
      variants={containerVariants}
      animate="show"
      className="space-y-4 sm:space-y-6"
    >
      {/* Header */}
      <motion.div variants={itemVariants} className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Driver Settlements</h1>
          <p className="text-muted-foreground">Track trip earnings, deductions, and driver payouts</p>
        </div>
        <Button
          onClick={() => setGenerateDialogOpen(true)}
          className="bg-amber-500 hover:bg-amber-600 text-white"
        >
          <Plus className="mr-2 h-4 w-4" />
          Generate Settlement
        </Button>
      </motion.div>

      {/* Filters */}
      <motion.div variants={itemVariants} className="flex flex-col sm:flex-row gap-2 sm:gap-3">
        <Select value={filterDriver} onValueChange={setFilterDriver}>
          <SelectTrigger className="w-full sm:w-48">
            <SelectValue placeholder="All Drivers" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Drivers</SelectItem>
            {drivers.map(d => (
              <SelectItem key={d.id} value={d.id}>
                {d.firstName} {d.lastName}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Select value={filterStatus} onValueChange={setFilterStatus}>
          <SelectTrigger className="w-full sm:w-40">
            <SelectValue placeholder="All Statuses" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Statuses</SelectItem>
            <SelectItem value="pending">Pending</SelectItem>
            <SelectItem value="approved">Approved</SelectItem>
            <SelectItem value="paid">Paid</SelectItem>
          </SelectContent>
        </Select>

        <Select value={filterPeriod} onValueChange={setFilterPeriod}>
          <SelectTrigger className="w-full sm:w-44">
            <SelectValue placeholder="All Periods" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Periods</SelectItem>
            <SelectItem value={currentPeriod}>{formatPeriod(currentPeriod)}</SelectItem>
            {Array.from({ length: 12 }).map((_, i) => {
              const d = new Date(currentYear, currentMonth - 2 - i, 1)
              const p = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
              return (
                <SelectItem key={p} value={p}>{formatPeriod(p)}</SelectItem>
              )
            })}
          </SelectContent>
        </Select>
      </motion.div>

      {/* Stats Row */}
      <motion.div variants={itemVariants} className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
        {loading ? (
          Array.from({ length: 4 }).map((_, i) => (
            <Card key={i}><CardContent className="p-4 sm:p-6"><Skeleton className="h-3 w-24 mb-3" /><Skeleton className="h-7 w-20" /></CardContent></Card>
          ))
        ) : (
          <>
            <Card className="hover:shadow-md transition-shadow">
              <CardContent className="p-4 sm:p-6">
                <div className="flex items-center gap-2 mb-1">
                  <Clock className="h-4 w-4 text-amber-500" />
                  <p className="text-xs sm:text-sm text-muted-foreground">Pending Payouts</p>
                </div>
                <p className="text-xl sm:text-2xl font-bold">{summary?.pendingCount || 0}</p>
                <p className="text-xs text-muted-foreground mt-1">{formatCurrency(summary?.pendingTotal || 0)}</p>
              </CardContent>
            </Card>
            <Card className="hover:shadow-md transition-shadow">
              <CardContent className="p-4 sm:p-6">
                <div className="flex items-center gap-2 mb-1">
                  <CheckCircle className="h-4 w-4 text-sky-500" />
                  <p className="text-xs sm:text-sm text-muted-foreground">Approved</p>
                </div>
                <p className="text-xl sm:text-2xl font-bold">{summary?.approvedCount || 0}</p>
                <p className="text-xs text-muted-foreground mt-1">{formatCurrency(summary?.approvedTotal || 0)}</p>
              </CardContent>
            </Card>
            <Card className="hover:shadow-md transition-shadow">
              <CardContent className="p-4 sm:p-6">
                <div className="flex items-center gap-2 mb-1">
                  <Banknote className="h-4 w-4 text-emerald-500" />
                  <p className="text-xs sm:text-sm text-muted-foreground">Paid This Month</p>
                </div>
                <p className="text-xl sm:text-2xl font-bold text-emerald-600">{formatCurrency(summary?.paidThisMonth || 0)}</p>
              </CardContent>
            </Card>
            <Card className="hover:shadow-md transition-shadow">
              <CardContent className="p-4 sm:p-6">
                <div className="flex items-center gap-2 mb-1">
                  <TrendingUp className="h-4 w-4 text-amber-500" />
                  <p className="text-xs sm:text-sm text-muted-foreground">Average Settlement</p>
                </div>
                <p className="text-xl sm:text-2xl font-bold text-amber-600">{formatCurrency(summary?.avgSettlement || 0)}</p>
              </CardContent>
            </Card>
          </>
        )}
      </motion.div>

      {/* Settlements List */}
      <motion.div variants={itemVariants}>
        <div className="rounded-lg border bg-card">
          {error ? (
            <div className="flex flex-col items-center justify-center py-12 text-center">
              <AlertCircle className="h-8 w-8 text-red-500 mb-3" />
              <p className="text-sm text-muted-foreground mb-3">{error}</p>
              <Button variant="outline" size="sm" onClick={loadData}>
                <RefreshCw className="mr-2 h-3 w-3" /> Retry
              </Button>
            </div>
          ) : loading ? (
            <div className="p-4 space-y-3">
              {[1, 2, 3, 4].map(i => (
                <Skeleton key={i} className="h-16 w-full rounded-lg" />
              ))}
            </div>
          ) : settlements.length === 0 ? (
            <EmptyState
              icon={Wallet}
              title="No settlements found"
              description="Generate a settlement for a driver to get started"
            />
          ) : (
            <>
              {/* Desktop Table */}
              <div className="hidden md:block overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Driver</TableHead>
                      <TableHead>Period</TableHead>
                      <TableHead className="text-right">Gross Earnings</TableHead>
                      <TableHead className="text-right hidden lg:table-cell">Deductions</TableHead>
                      <TableHead className="text-right">Net Pay</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead className="text-right">Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    <AnimatePresence>
                      {settlements.map((s) => {
                        const statusCfg = STATUS_CONFIG[s.status] || STATUS_CONFIG.pending
                        const totalDeductions = s.fuelDeductions + s.expenseDeductions
                        return (
                          <TableRow key={s.id} className="group">
                            <TableCell>
                              <div className="flex items-center gap-2">
                                <Avatar className="h-8 w-8">
                                  <AvatarImage src={s.driver.photo || undefined} />
                                  <AvatarFallback className="bg-amber-100 text-amber-700 text-xs">
                                    {s.driver.firstName[0]}{s.driver.lastName[0]}
                                  </AvatarFallback>
                                </Avatar>
                                <div>
                                  <p className="font-medium text-sm">{s.driver.firstName} {s.driver.lastName}</p>
                                  <p className="text-xs text-muted-foreground">{s.driver.employeeId}</p>
                                </div>
                              </div>
                            </TableCell>
                            <TableCell className="text-sm">{formatPeriod(s.period)}</TableCell>
                            <TableCell className="text-right text-sm">{formatCurrency(s.grossEarnings)}</TableCell>
                            <TableCell className="text-right text-sm text-red-600 hidden lg:table-cell">
                              -{formatCurrency(totalDeductions)}
                            </TableCell>
                            <TableCell className="text-right font-bold text-amber-600">{formatCurrency(s.netPay)}</TableCell>
                            <TableCell>
                              <Badge className={statusCfg.color}>{statusCfg.label}</Badge>
                            </TableCell>
                            <TableCell className="text-right">
                              <div className="flex items-center justify-end gap-1">
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  className="h-7 text-xs"
                                  onClick={() => handleView(s)}
                                >
                                  <Eye className="mr-1 h-3 w-3" /> View
                                </Button>
                                {s.status === 'pending' && (
                                  <Button
                                    variant="ghost"
                                    size="sm"
                                    className="h-7 text-xs text-sky-600 hover:text-sky-700"
                                    disabled={actionLoading === s.id}
                                    onClick={() => handleQuickAction(s.id, 'approved')}
                                  >
                                    <CheckCircle className="mr-1 h-3 w-3" />
                                    {actionLoading === s.id ? '...' : 'Approve'}
                                  </Button>
                                )}
                                {s.status === 'approved' && (
                                  <Button
                                    variant="ghost"
                                    size="sm"
                                    className="h-7 text-xs text-emerald-600 hover:text-emerald-700"
                                    disabled={actionLoading === s.id}
                                    onClick={() => handleQuickAction(s.id, 'paid')}
                                  >
                                    <Banknote className="mr-1 h-3 w-3" />
                                    {actionLoading === s.id ? '...' : 'Pay'}
                                  </Button>
                                )}
                              </div>
                            </TableCell>
                          </TableRow>
                        )
                      })}
                    </AnimatePresence>
                  </TableBody>
                </Table>
              </div>

              {/* Mobile Cards */}
              <div className="md:hidden divide-y">
                {settlements.map(s => (
                  <SettlementCard
                    key={s.id}
                    settlement={s}
                    onView={() => handleView(s)}
                  />
                ))}
              </div>
            </>
          )}
        </div>
      </motion.div>

      {/* Generate Dialog */}
      <GenerateSettlementDialog
        open={generateDialogOpen}
        onOpenChange={setGenerateDialogOpen}
        onGenerated={loadData}
      />

      {/* Detail Sheet */}
      <SettlementDetailSheet
        settlementId={selectedSettlementId}
        open={sheetOpen}
        onOpenChange={setSheetOpen}
        onUpdated={loadData}
        onDeleted={loadData}
      />
    </motion.div>
  )
}
