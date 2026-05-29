'use client'

import * as React from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import {
  Plus,
  Pencil,
  Trash2,
  AlertTriangle,
  TrendingUp,
  TrendingDown,
  Fuel,
  ChevronLeft,
  ChevronRight,
  CalendarDays,
} from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Progress } from '@/components/ui/progress'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import {
  Dialog,
  DialogBody,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import {
  fetchFuelBudgets,
  createFuelBudget,
  updateFuelBudget,
  deleteFuelBudget,
  fetchTrucks,
  type FuelBudget,
  type Truck,
} from '@/lib/api'
import { toast } from 'sonner'

const MONTHS = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
]

/** Ghana Cedi sign — runtime generation avoids encoding issues */
const CEDI = String.fromCodePoint(0x20B5)

function formatCurrency(amount: number): string {
  return `${CEDI}${amount.toLocaleString('en-GH', { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`
}

function getProgressColor(percent: number): string {
  if (percent >= 100) return 'bg-red-500'
  if (percent >= 80) return 'bg-amber-500'
  if (percent >= 50) return 'bg-yellow-500'
  return 'bg-emerald-500'
}

function getProgressTextColor(percent: number): string {
  if (percent >= 100) return 'text-red-600'
  if (percent >= 80) return 'text-amber-600'
  if (percent >= 50) return 'text-yellow-600'
  return 'text-emerald-600'
}

function getRiskBadge(percent: number) {
  if (percent >= 100) return <Badge variant="destructive">Over Budget</Badge>
  if (percent >= 80) return <Badge className="bg-amber-100 text-amber-800 border-amber-200">Warning</Badge>
  return <Badge className="bg-emerald-100 text-emerald-800 border-emerald-200">On Track</Badge>
}

export function FuelBudgetView() {
  const now = new Date()
  const [selectedMonth, setSelectedMonth] = React.useState(now.getMonth() + 1)
  const [selectedYear, setSelectedYear] = React.useState(now.getFullYear())
  const [budgets, setBudgets] = React.useState<FuelBudget[]>([])
  const [trucks, setTrucks] = React.useState<Truck[]>([])
  const [loading, setLoading] = React.useState(true)
  const [error, setError] = React.useState<string | null>(null)

  // Dialog state
  const [showCreateDialog, setShowCreateDialog] = React.useState(false)
  const [editingBudget, setEditingBudget] = React.useState<FuelBudget | null>(null)
  const [deletingBudget, setDeletingBudget] = React.useState<FuelBudget | null>(null)

  // Form state
  const [formTruckId, setFormTruckId] = React.useState<string>('fleet')
  const [formMonth, setFormMonth] = React.useState(selectedMonth)
  const [formYear, setFormYear] = React.useState(selectedYear)
  const [formBudgetLimit, setFormBudgetLimit] = React.useState('')
  const [formLitersLimit, setFormLitersLimit] = React.useState('')
  const [formNotes, setFormNotes] = React.useState('')
  const [saving, setSaving] = React.useState(false)

  const loadData = React.useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const [budgetData, truckData] = await Promise.all([
        fetchFuelBudgets({ month: selectedMonth, year: selectedYear }),
        fetchTrucks({ status: 'active', limit: 100 }),
      ])
      setBudgets(budgetData)
      setTrucks(truckData.data)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load data')
    } finally {
      setLoading(false)
    }
  }, [selectedMonth, selectedYear])

  React.useEffect(() => { loadData() }, [loadData])

  const handlePrevMonth = () => {
    if (selectedMonth === 1) {
      setSelectedMonth(12)
      setSelectedYear(y => y - 1)
    } else {
      setSelectedMonth(m => m - 1)
    }
  }

  const handleNextMonth = () => {
    if (selectedMonth === 12) {
      setSelectedMonth(1)
      setSelectedYear(y => y + 1)
    } else {
      setSelectedMonth(m => m + 1)
    }
  }

  const resetForm = () => {
    setFormTruckId('fleet')
    setFormMonth(selectedMonth)
    setFormYear(selectedYear)
    setFormBudgetLimit('')
    setFormLitersLimit('')
    setFormNotes('')
  }

  const openCreateDialog = () => {
    resetForm()
    setShowCreateDialog(true)
  }

  const openEditDialog = (budget: FuelBudget) => {
    setFormBudgetLimit(String(budget.budgetLimit))
    setFormLitersLimit(budget.litersLimit ? String(budget.litersLimit) : '')
    setFormNotes(budget.notes || '')
    setEditingBudget(budget)
  }

  const handleCreate = async () => {
    if (!formBudgetLimit || parseFloat(formBudgetLimit) <= 0) {
      toast.error('Please enter a valid budget limit')
      return
    }
    setSaving(true)
    try {
      await createFuelBudget({
        truckId: formTruckId === 'fleet' ? undefined : formTruckId,
        month: formMonth,
        year: formYear,
        budgetLimit: parseFloat(formBudgetLimit),
        litersLimit: formLitersLimit ? parseFloat(formLitersLimit) : undefined,
        notes: formNotes || undefined,
      })
      toast.success('Budget created successfully')
      setShowCreateDialog(false)
      loadData()
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to create budget')
    } finally {
      setSaving(false)
    }
  }

  const handleUpdate = async () => {
    if (!editingBudget || !formBudgetLimit || parseFloat(formBudgetLimit) <= 0) return
    setSaving(true)
    try {
      await updateFuelBudget(editingBudget.id, {
        budgetLimit: parseFloat(formBudgetLimit),
        litersLimit: formLitersLimit ? parseFloat(formLitersLimit) : undefined,
        notes: formNotes || undefined,
      })
      toast.success('Budget updated successfully')
      setEditingBudget(null)
      loadData()
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to update budget')
    } finally {
      setSaving(false)
    }
  }

  const handleDelete = async () => {
    if (!deletingBudget) return
    try {
      await deleteFuelBudget(deletingBudget.id)
      toast.success('Budget deleted')
      setDeletingBudget(null)
      loadData()
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to delete budget')
    }
  }

  // Compute fleet-wide summary
  const fleetBudget = budgets.find(b => !b.truckId)
  const truckBudgets = budgets.filter(b => b.truckId)
  const totalBudgetLimit = budgets.reduce((sum, b) => sum + b.budgetLimit, 0)
  const totalActualSpend = budgets.reduce((sum, b) => sum + b.actualSpend, 0)
  const fleetPercent = totalBudgetLimit > 0 ? (totalActualSpend / totalBudgetLimit) * 100 : 0
  const overBudgetCount = budgets.filter(b => b.budgetLimit > 0 && b.actualSpend > b.budgetLimit).length

  // Projected overspend
  const daysInMonth = new Date(selectedYear, selectedMonth, 0).getDate()
  const currentDay = (selectedYear === now.getFullYear() && selectedMonth === now.getMonth() + 1)
    ? now.getDate()
    : daysInMonth
  const dailyRate = currentDay > 0 ? totalActualSpend / currentDay : 0
  const projectedTotal = dailyRate * daysInMonth
  const projectedOverspend = projectedTotal - totalBudgetLimit

  return (
    <div className="space-y-6 p-4 md:p-6">
      {/* Header */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Fuel Budget Management</h1>
          <p className="text-muted-foreground">Track and manage fuel spending against budgets</p>
        </div>
        <Button onClick={openCreateDialog} className="shrink-0">
          <Plus className="mr-2 h-4 w-4" />
          Create Budget
        </Button>
      </div>

      {/* Month Navigation */}
      <Card>
        <CardContent className="flex items-center justify-between py-4">
          <Button variant="outline" size="icon" onClick={handlePrevMonth}>
            <ChevronLeft className="h-4 w-4" />
          </Button>
          <div className="flex items-center gap-2">
            <CalendarDays className="h-5 w-5 text-amber-600" />
            <span className="text-lg font-semibold">
              {MONTHS[selectedMonth - 1]} {selectedYear}
            </span>
          </div>
          <Button variant="outline" size="icon" onClick={handleNextMonth}>
            <ChevronRight className="h-4 w-4" />
          </Button>
        </CardContent>
      </Card>

      {/* Loading */}
      {loading && (
        <div className="grid gap-4 md:grid-cols-3">
          {[1, 2, 3].map(i => (
            <Card key={i}><CardContent className="p-6"><div className="h-24 animate-pulse rounded bg-muted" /></CardContent></Card>
          ))}
        </div>
      )}

      {/* Error */}
      {error && (
        <Card className="border-red-200 bg-red-50">
          <CardContent className="flex items-center gap-3 py-4">
            <AlertTriangle className="h-5 w-5 text-red-600" />
            <p className="text-red-800">{error}</p>
            <Button variant="outline" size="sm" onClick={loadData} className="ml-auto">Retry</Button>
          </CardContent>
        </Card>
      )}

      {/* Content */}
      {!loading && !error && (
        <AnimatePresence mode="wait">
          <motion.div
            key={`${selectedYear}-${selectedMonth}`}
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
            className="space-y-6"
          >
            {/* Summary KPI Cards */}
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
              {/* Total Budget */}
              <Card>
                <CardContent className="p-4">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-sm text-muted-foreground">Total Budget</p>
                      <p className="text-2xl font-bold">{formatCurrency(totalBudgetLimit)}</p>
                      <p className="text-xs text-muted-foreground">{budgets.length} budget{budgets.length !== 1 ? 's' : ''}</p>
                    </div>
                    <div className="rounded-full bg-amber-100 p-3">
                      <Fuel className="h-5 w-5 text-amber-600" />
                    </div>
                  </div>
                </CardContent>
              </Card>

              {/* Total Spent */}
              <Card>
                <CardContent className="p-4">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-sm text-muted-foreground">Total Spent</p>
                      <p className="text-2xl font-bold">{formatCurrency(totalActualSpend)}</p>
                      <div className="flex items-center gap-1 text-xs">
                        {fleetPercent > 100 ? (
                          <TrendingDown className="h-3 w-3 text-red-500" />
                        ) : (
                          <TrendingUp className="h-3 w-3 text-emerald-500" />
                        )}
                        <span className={getProgressTextColor(fleetPercent)}>
                          {fleetPercent.toFixed(0)}% used
                        </span>
                      </div>
                    </div>
                    <div className="rounded-full bg-blue-100 p-3">
                      <span className="text-sm font-semibold text-blue-600">
                        {CEDI}
                      </span>
                    </div>
                  </div>
                </CardContent>
              </Card>

              {/* Over Budget */}
              <Card className={overBudgetCount > 0 ? 'border-red-200' : ''}>
                <CardContent className="p-4">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-sm text-muted-foreground">Over Budget</p>
                      <p className="text-2xl font-bold text-red-600">{overBudgetCount}</p>
                      <p className="text-xs text-muted-foreground">truck{overBudgetCount !== 1 ? 's' : ''} exceeding</p>
                    </div>
                    {overBudgetCount > 0 && (
                      <div className="rounded-full bg-red-100 p-3">
                        <AlertTriangle className="h-5 w-5 text-red-600" />
                      </div>
                    )}
                  </div>
                </CardContent>
              </Card>

              {/* Projected */}
              <Card>
                <CardContent className="p-4">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-sm text-muted-foreground">Projected Total</p>
                      <p className={`text-2xl font-bold ${projectedOverspend > 0 ? 'text-red-600' : ''}`}>
                        {formatCurrency(projectedTotal)}
                      </p>
                      {projectedOverspend > 0 && (
                        <p className="text-xs text-red-600">
                          {formatCurrency(projectedOverspend)} over budget
                        </p>
                      )}
                      {projectedOverspend <= 0 && totalBudgetLimit > 0 && (
                        <p className="text-xs text-emerald-600">
                          {formatCurrency(Math.abs(projectedOverspend))} under budget
                        </p>
                      )}
                    </div>
                    <div className={`rounded-full p-3 ${projectedOverspend > 0 ? 'bg-red-100' : 'bg-emerald-100'}`}>
                      <TrendingUp className={`h-5 w-5 ${projectedOverspend > 0 ? 'text-red-600' : 'text-emerald-600'}`} />
                    </div>
                  </div>
                </CardContent>
              </Card>
            </div>

            {/* Fleet-Wide Progress */}
            {totalBudgetLimit > 0 && (
              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-base">Fleet-Wide Fuel Budget Progress</CardTitle>
                </CardHeader>
                <CardContent className="space-y-3">
                  <div className="flex items-center justify-between text-sm">
                    <span>{formatCurrency(totalActualSpend)} of {formatCurrency(totalBudgetLimit)}</span>
                    <span className={`font-semibold ${getProgressTextColor(fleetPercent)}`}>
                      {fleetPercent.toFixed(1)}%
                    </span>
                  </div>
                  <div className="relative h-4 w-full overflow-hidden rounded-full bg-muted">
                    <motion.div
                      className={`h-full rounded-full ${getProgressColor(fleetPercent)}`}
                      initial={{ width: 0 }}
                      animate={{ width: `${Math.min(fleetPercent, 100)}%` }}
                      transition={{ duration: 0.8, ease: 'easeOut' }}
                    />
                  </div>
                  {/* Per-truck breakdown bars */}
                  {truckBudgets.length > 0 && (
                    <div className="mt-4 space-y-3">
                      <h4 className="text-sm font-medium text-muted-foreground">Per-Truck Breakdown</h4>
                      {truckBudgets.map(budget => {
                        const pct = budget.budgetLimit > 0 ? (budget.actualSpend / budget.budgetLimit) * 100 : 0
                        return (
                          <div key={budget.id} className="space-y-1">
                            <div className="flex items-center justify-between text-sm">
                              <span className="truncate">{budget.truck?.plateNumber || 'Unknown'}</span>
                              <div className="flex items-center gap-2">
                                {getRiskBadge(pct)}
                                <span className="text-xs text-muted-foreground">
                                  {formatCurrency(budget.actualSpend)} / {formatCurrency(budget.budgetLimit)}
                                </span>
                              </div>
                            </div>
                            <div className="relative h-2 w-full overflow-hidden rounded-full bg-muted">
                              <motion.div
                                className={`h-full rounded-full ${getProgressColor(pct)}`}
                                initial={{ width: 0 }}
                                animate={{ width: `${Math.min(pct, 100)}%` }}
                                transition={{ duration: 0.6, ease: 'easeOut' }}
                              />
                            </div>
                          </div>
                        )
                      })}
                    </div>
                  )}
                </CardContent>
              </Card>
            )}

            {/* Per-Truck Budget Cards */}
            <div>
              <h3 className="mb-4 text-lg font-semibold">
                Truck Budgets
                <span className="ml-2 text-sm font-normal text-muted-foreground">
                  ({truckBudgets.length} truck{truckBudgets.length !== 1 ? 's' : ''})
                </span>
              </h3>

              {budgets.length === 0 ? (
                <Card>
                  <CardContent className="flex flex-col items-center justify-center py-12 text-center">
                    <Fuel className="mb-3 h-12 w-12 text-muted-foreground/50" />
                    <h4 className="text-lg font-medium">No budgets set</h4>
                    <p className="mt-1 text-sm text-muted-foreground">
                      Create a fuel budget to start tracking spending against targets
                    </p>
                    <Button onClick={openCreateDialog} className="mt-4">
                      <Plus className="mr-2 h-4 w-4" />
                      Create First Budget
                    </Button>
                  </CardContent>
                </Card>
              ) : (
                <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                  {budgets.map((budget) => {
                    const pct = budget.budgetLimit > 0 ? (budget.actualSpend / budget.budgetLimit) * 100 : 0
                    const remaining = budget.budgetLimit - budget.actualSpend
                    return (
                      <motion.div
                        key={budget.id}
                        initial={{ opacity: 0, scale: 0.95 }}
                        animate={{ opacity: 1, scale: 1 }}
                        transition={{ duration: 0.2 }}
                      >
                        <Card className={pct >= 100 ? 'border-red-200' : ''}>
                          <CardContent className="p-4">
                            <div className="flex items-start justify-between">
                              <div>
                                <h4 className="font-semibold">
                                  {budget.truck?.plateNumber || 'Fleet-Wide'}
                                </h4>
                                {budget.truck && (
                                  <p className="text-xs text-muted-foreground">
                                    {budget.truck.make} {budget.truck.model}
                                  </p>
                                )}
                                {!budget.truck && (
                                  <p className="text-xs text-muted-foreground">All trucks combined</p>
                                )}
                              </div>
                              {getRiskBadge(pct)}
                            </div>

                            <div className="mt-4 space-y-2">
                              <div className="flex justify-between text-sm">
                                <span className="text-muted-foreground">Spent</span>
                                <span className="font-medium">{formatCurrency(budget.actualSpend)}</span>
                              </div>
                              <div className="flex justify-between text-sm">
                                <span className="text-muted-foreground">Budget</span>
                                <span>{formatCurrency(budget.budgetLimit)}</span>
                              </div>
                              {budget.litersLimit && (
                                <div className="flex justify-between text-sm">
                                  <span className="text-muted-foreground">Liters</span>
                                  <span>
                                    {budget.actualLiters.toFixed(0)} / {budget.litersLimit.toFixed(0)} L
                                  </span>
                                </div>
                              )}
                              <div className="flex justify-between text-sm">
                                <span className="text-muted-foreground">Remaining</span>
                                <span className={remaining < 0 ? 'font-medium text-red-600' : 'text-emerald-600'}>
                                  {formatCurrency(remaining)}
                                </span>
                              </div>
                            </div>

                            <div className="relative mt-3 h-2 w-full overflow-hidden rounded-full bg-muted">
                              <motion.div
                                className={`h-full rounded-full ${getProgressColor(pct)}`}
                                initial={{ width: 0 }}
                                animate={{ width: `${Math.min(pct, 100)}%` }}
                                transition={{ duration: 0.6 }}
                              />
                            </div>
                            <p className={`mt-1 text-right text-xs font-medium ${getProgressTextColor(pct)}`}>
                              {pct.toFixed(1)}% used
                            </p>

                            {budget.notes && (
                              <p className="mt-2 text-xs text-muted-foreground italic">{budget.notes}</p>
                            )}

                            <div className="mt-3 flex gap-2">
                              <Button
                                variant="outline"
                                size="sm"
                                className="flex-1"
                                onClick={() => openEditDialog(budget)}
                              >
                                <Pencil className="mr-1 h-3 w-3" />
                                Edit
                              </Button>
                              <Button
                                variant="outline"
                                size="sm"
                                className="text-red-600 hover:bg-red-50 hover:text-red-700"
                                onClick={() => setDeletingBudget(budget)}
                              >
                                <Trash2 className="h-3 w-3" />
                              </Button>
                            </div>
                          </CardContent>
                        </Card>
                      </motion.div>
                    )
                  })}
                </div>
              )}
            </div>
          </motion.div>
        </AnimatePresence>
      )}

      {/* Create Budget Dialog */}
      <Dialog open={showCreateDialog} onOpenChange={setShowCreateDialog}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Create Fuel Budget</DialogTitle>
          </DialogHeader>
          <DialogBody className="space-y-4 py-4">
            <div className="space-y-2">
              <Label>Scope</Label>
              <Select value={formTruckId} onValueChange={setFormTruckId}>
                <SelectTrigger>
                  <SelectValue placeholder="Select scope" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="fleet">Fleet-Wide (All Trucks)</SelectItem>
                  {trucks.map(t => (
                    <SelectItem key={t.id} value={t.id}>
                      {t.plateNumber} — {t.make} {t.model}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Month</Label>
                <Select
                  value={String(formMonth)}
                  onValueChange={v => setFormMonth(parseInt(v))}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {MONTHS.map((m, i) => (
                      <SelectItem key={i + 1} value={String(i + 1)}>{m}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>Year</Label>
                <Select
                  value={String(formYear)}
                  onValueChange={v => setFormYear(parseInt(v))}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {[now.getFullYear() - 1, now.getFullYear(), now.getFullYear() + 1].map(y => (
                      <SelectItem key={y} value={String(y)}>{y}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="space-y-2">
              <Label>Budget Limit ({CEDI}) *</Label>
              <Input
                type="number"
                placeholder="e.g., 5000"
                value={formBudgetLimit}
                onChange={e => setFormBudgetLimit(e.target.value)}
                min="0"
                step="100"
              />
            </div>

            <div className="space-y-2">
              <Label>Liters Limit (optional)</Label>
              <Input
                type="number"
                placeholder="e.g., 2000"
                value={formLitersLimit}
                onChange={e => setFormLitersLimit(e.target.value)}
                min="0"
              />
            </div>

            <div className="space-y-2">
              <Label>Notes (optional)</Label>
              <Textarea
                placeholder="Any notes about this budget..."
                value={formNotes}
                onChange={e => setFormNotes(e.target.value)}
                rows={2}
              />
            </div>
          </DialogBody>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowCreateDialog(false)}>Cancel</Button>
            <Button onClick={handleCreate} disabled={saving}>
              {saving ? 'Creating...' : 'Create Budget'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Edit Budget Dialog */}
      <Dialog open={!!editingBudget} onOpenChange={() => setEditingBudget(null)}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>
              Edit Budget — {editingBudget?.truck?.plateNumber || 'Fleet-Wide'}
            </DialogTitle>
          </DialogHeader>
          <DialogBody className="space-y-4 py-4">
            <div className="space-y-2">
              <Label>Budget Limit ({CEDI}) *</Label>
              <Input
                type="number"
                value={formBudgetLimit}
                onChange={e => setFormBudgetLimit(e.target.value)}
                min="0"
                step="100"
              />
            </div>
            <div className="space-y-2">
              <Label>Liters Limit (optional)</Label>
              <Input
                type="number"
                value={formLitersLimit}
                onChange={e => setFormLitersLimit(e.target.value)}
                min="0"
              />
            </div>
            <div className="space-y-2">
              <Label>Notes</Label>
              <Textarea
                value={formNotes}
                onChange={e => setFormNotes(e.target.value)}
                rows={2}
              />
            </div>
          </DialogBody>
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditingBudget(null)}>Cancel</Button>
            <Button onClick={handleUpdate} disabled={saving}>
              {saving ? 'Saving...' : 'Save Changes'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation */}
      <AlertDialog open={!!deletingBudget} onOpenChange={() => setDeletingBudget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Budget</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete the budget for{' '}
              {deletingBudget?.truck?.plateNumber || 'Fleet-Wide'} ({MONTHS[(deletingBudget?.month || 1) - 1]} {deletingBudget?.year})?
              This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDelete}
              className="bg-red-600 text-white hover:bg-red-700"
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}
