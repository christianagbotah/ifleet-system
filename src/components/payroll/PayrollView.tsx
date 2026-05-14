'use client'

import * as React from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { CreditCard, Eye, AlertCircle, RefreshCw, Plus, X as XIcon, CheckSquare, Download } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Checkbox } from '@/components/ui/checkbox'
import { StatsCard } from '@/components/ui/stats-card'
import { StatusBadge } from '@/components/ui/status-badge'
import { EmptyState } from '@/components/ui/empty-state'
import { Skeleton } from '@/components/ui/skeleton'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { MONTHS, CURRENCY_SYMBOL } from '@/lib/constants'
import { fetchPayroll, exportData, type PayrollRecord, type PayrollSummary } from '@/lib/api'
import { PayrollFormDialog } from '@/components/payroll/PayrollFormDialog'
import { useEntityHighlight } from '@/lib/hooks/useEntityHighlight'
import { PayrollDetailSheet } from '@/components/payroll/PayrollDetailSheet'
import { toast } from 'sonner'

const containerVariants = {
  show: { transition: { staggerChildren: 0.04 } },
}

const itemVariants = {
  show: { opacity: 1, y: 0 },
}

export function PayrollView() {
  const [selectedMonth, setSelectedMonth] = React.useState(String(new Date().getMonth() + 1))
  const [selectedYear, setSelectedYear] = React.useState(String(new Date().getFullYear()))
  const [records, setRecords] = React.useState<PayrollRecord[]>([])
  const [summary, setSummary] = React.useState<PayrollSummary | null>(null)
  const [loading, setLoading] = React.useState(true)
  const [error, setError] = React.useState<string | null>(null)
  const [formOpen, setFormOpen] = React.useState(false)
  const [bulkLoading, setBulkLoading] = React.useState(false)

  // Detail sheet state
  const [detailRecord, setDetailRecord] = React.useState<PayrollRecord | null>(null)
  const [detailOpen, setDetailOpen] = React.useState(false)

  // Edit form state
  const [editingRecord, setEditingRecord] = React.useState<PayrollRecord | null>(null)

  // Bulk selection state
  const [selectedIds, setSelectedIds] = React.useState<Set<string>>(new Set())

  const { highlightEntityId, highlightClassName, scrollIntoView } = useEntityHighlight('payroll')
  const rowRefs = React.useRef<Record<string, HTMLElement | null>>({})

  const loadPayroll = React.useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const result = await fetchPayroll({
        month: parseInt(selectedMonth),
        year: parseInt(selectedYear),
        limit: 100,
      })
      setRecords(result.data)
      setSummary(result.summary)
      // Clear selection when data reloads
      setSelectedIds(new Set())
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to fetch payroll')
    } finally {
      setLoading(false)
    }
  }, [selectedMonth, selectedYear])

  const handleExport = React.useCallback(async () => {
    try {
      const filters: Record<string, string> = {}
      filters.month = selectedMonth
      filters.year = selectedYear
      await exportData('payroll', filters)
      toast.success('Export completed successfully')
    } catch {
      toast.error('Failed to export data')
    }
  }, [selectedMonth, selectedYear])

  React.useEffect(() => {
    loadPayroll()
  }, [loadPayroll])

  // Scroll to highlighted row after data loads
  React.useEffect(() => {
    if (highlightEntityId && rowRefs.current[highlightEntityId]) {
      scrollIntoView(rowRefs.current[highlightEntityId])
    }
  }, [highlightEntityId, records, scrollIntoView])

  const monthLabel = MONTHS[parseInt(selectedMonth) - 1] || selectedMonth

  // Selection helpers
  const allVisibleIds = React.useMemo(() => records.map((r) => r.id), [records])
  const allSelected = allVisibleIds.length > 0 && allVisibleIds.every((id) => selectedIds.has(id))
  const someSelected = allVisibleIds.some((id) => selectedIds.has(id)) && !allSelected

  const toggleAll = React.useCallback(() => {
    if (allSelected) {
      setSelectedIds(new Set())
    } else {
      setSelectedIds(new Set(allVisibleIds))
    }
  }, [allSelected, allVisibleIds])

  const toggleRow = React.useCallback((id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev)
      if (next.has(id)) {
        next.delete(id)
      } else {
        next.add(id)
      }
      return next
    })
  }, [])

  const deselectAll = React.useCallback(() => {
    setSelectedIds(new Set())
  }, [])

  // Compute bulk action availability
  const selectedRecords = React.useMemo(
    () => records.filter((r) => selectedIds.has(r.id)),
    [records, selectedIds]
  )
  const hasPendingSelected = selectedRecords.some((r) => r.status === 'pending')
  const hasApprovedSelected = selectedRecords.some((r) => r.status === 'approved')

  // Status change from detail sheet
  async function handleStatusChange(id: string, newStatus: string) {
    try {
      const res = await fetch(`/api/payroll/${id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: newStatus }),
      })
      if (!res.ok) throw new Error('Failed')
      const label = newStatus === 'approved' ? 'approved' : 'paid'
      toast.success(`Payroll ${label} successfully`)
      loadPayroll()
    } catch {
      toast.error(`Failed to ${newStatus === 'approved' ? 'approve' : 'process payment for'} payroll`)
    }
  }

  // Delete handler from detail sheet
  async function handleDelete() {
    if (!detailRecord) return
    try {
      const res = await fetch(`/api/payroll/${detailRecord.id}`, {
        method: 'DELETE',
      })
      if (!res.ok) {
        const err = await res.json().catch(() => ({ error: 'Failed' }))
        throw new Error(err.error || 'Failed to delete')
      }
      toast.success('Payroll record deleted successfully')
      setDetailOpen(false)
      setDetailRecord(null)
      loadPayroll()
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to delete payroll record')
    }
  }

  // Ref to track a pending edit transition (detail → form)
  const pendingEditRef = React.useRef(false)

  // Edit handler from detail sheet — store the record and close detail.
  function handleEdit(record: PayrollRecord) {
    setEditingRecord(record)
    pendingEditRef.current = true
    setDetailOpen(false)
  }

  // When detail sheet closes with a pending edit, open the form sheet after delay
  React.useEffect(() => {
    if (!detailOpen && pendingEditRef.current) {
      pendingEditRef.current = false
      const timer = setTimeout(() => {
        setFormOpen(true)
      }, 350)
      return () => clearTimeout(timer)
    }
  }, [detailOpen])

  // Bulk actions
  async function handleBulkAction(status: 'approved' | 'paid') {
    if (selectedIds.size === 0) return

    // Filter IDs to only those eligible for this action
    const eligibleIds = selectedRecords
      .filter((r) => status === 'approved' ? r.status === 'pending' : r.status === 'approved')
      .map((r) => r.id)

    if (eligibleIds.length === 0) {
      toast.error(`No ${status === 'approved' ? 'pending' : 'approved'} records selected`)
      return
    }

    setBulkLoading(true)
    try {
      const res = await fetch('/api/payroll/bulk-update', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ids: eligibleIds, status }),
      })
      if (!res.ok) {
        const err = await res.json().catch(() => ({ error: 'Failed' }))
        throw new Error(err.error || 'Failed')
      }
      const data = await res.json()
      const label = status === 'approved' ? 'approved' : 'paid'
      toast.success(`${data.updated} payroll record${data.updated !== 1 ? 's' : ''} ${label} successfully`)
      loadPayroll()
    } catch (err) {
      toast.error(err instanceof Error ? err.message : `Failed to bulk ${status}`)
    } finally {
      setBulkLoading(false)
    }
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
          <h1 className="text-2xl font-bold tracking-tight">Payroll Management</h1>
          <p className="text-muted-foreground">Manage driver salaries, bonuses, and payments</p>
        </div>
        <div className="flex gap-2 flex-wrap">
          <Button variant="outline" size="sm" onClick={handleExport} className="gap-2">
            <Download className="h-4 w-4" />
            Export CSV
          </Button>
          <Button
            onClick={() => {
              setEditingRecord(null)
              setFormOpen(true)
            }}
            className="bg-amber-500 hover:bg-amber-600 text-white"
          >
            <Plus className="mr-2 h-4 w-4" />
            Create Payroll
          </Button>
          <Select value={selectedMonth} onValueChange={setSelectedMonth}>
            <SelectTrigger className="w-full sm:w-36">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {MONTHS.map((m, i) => (
                <SelectItem key={m} value={String(i + 1)}>{m}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select value={selectedYear} onValueChange={setSelectedYear}>
            <SelectTrigger className="w-full sm:w-24">
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
      </motion.div>

      {/* Summary */}
      <motion.div variants={itemVariants} className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {loading ? (
          Array.from({ length: 4 }).map((_, i) => (
            <Card key={i}><CardContent className="p-6"><Skeleton className="h-3 w-24 mb-3" /><Skeleton className="h-8 w-20" /></CardContent></Card>
          ))
        ) : (
          <>
            <StatsCard
              icon={CreditCard}
              title="Total Base Salaries"
              value={`${CURRENCY_SYMBOL}${(summary?.totalBaseSalary || 0).toLocaleString()}`}
            />
            <Card className="hover:shadow-md transition-shadow">
              <CardContent className="p-4 sm:p-6">
                <div className="space-y-1">
                  <p className="text-xs sm:text-sm text-muted-foreground">Total Bonuses</p>
                  <p className="text-xl sm:text-2xl font-bold text-emerald-600">{CURRENCY_SYMBOL}{(summary?.totalTripBonus || 0).toLocaleString()}</p>
                </div>
              </CardContent>
            </Card>
            <Card className="hover:shadow-md transition-shadow">
              <CardContent className="p-4 sm:p-6">
                <div className="space-y-1">
                  <p className="text-xs sm:text-sm text-muted-foreground">Total Deductions</p>
                  <p className="text-xl sm:text-2xl font-bold text-red-600">{CURRENCY_SYMBOL}{(summary?.totalDeductions || 0).toLocaleString()}</p>
                </div>
              </CardContent>
            </Card>
            <Card className="hover:shadow-md transition-shadow">
              <CardContent className="p-4 sm:p-6">
                <div className="space-y-1">
                  <p className="text-xs sm:text-sm text-muted-foreground">Total Net Pay</p>
                  <p className="text-xl sm:text-2xl font-bold text-amber-600">{CURRENCY_SYMBOL}{(summary?.totalNetPay || 0).toLocaleString()}</p>
                </div>
              </CardContent>
            </Card>
          </>
        )}
      </motion.div>

      {/* Table */}
      <motion.div variants={itemVariants}>
        <div className="rounded-lg border bg-card">
          {/* Bulk Action Bar */}
          <AnimatePresence>
            {selectedIds.size > 0 && (
              <motion.div
                initial={{ height: 0, opacity: 0 }}
                animate={{ height: 'auto', opacity: 1 }}
                exit={{ height: 0, opacity: 0 }}
                transition={{ duration: 0.2 }}
                className="overflow-hidden"
              >
                <div className="flex items-center justify-between gap-3 px-4 py-3 border-b bg-amber-50 dark:bg-amber-900/10">
                  <div className="flex items-center gap-2 text-sm font-medium text-amber-800 dark:text-amber-300">
                    <CheckSquare className="h-4 w-4" />
                    <span>{selectedIds.size} selected</span>
                  </div>
                  <div className="flex items-center gap-2">
                    {hasPendingSelected && (
                      <Button
                        size="sm"
                        className="h-8 bg-amber-500 hover:bg-amber-600 text-white text-xs"
                        disabled={bulkLoading}
                        onClick={() => handleBulkAction('approved')}
                      >
                        <CheckSquare className="mr-1.5 h-3.5 w-3.5" />
                        {bulkLoading ? 'Approving...' : 'Bulk Approve'}
                      </Button>
                    )}
                    {hasApprovedSelected && (
                      <Button
                        size="sm"
                        className="h-8 bg-emerald-600 hover:bg-emerald-700 text-white text-xs"
                        disabled={bulkLoading}
                        onClick={() => handleBulkAction('paid')}
                      >
                        <CreditCard className="mr-1.5 h-3.5 w-3.5" />
                        {bulkLoading ? 'Paying...' : 'Bulk Pay'}
                      </Button>
                    )}
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-8 text-xs text-muted-foreground hover:text-foreground"
                      onClick={deselectAll}
                    >
                      <XIcon className="mr-1 h-3.5 w-3.5" />
                      Deselect All
                    </Button>
                  </div>
                </div>
              </motion.div>
            )}
          </AnimatePresence>

          {error ? (
            <div className="flex flex-col items-center justify-center py-12 text-center">
              <AlertCircle className="h-8 w-8 text-red-500 mb-3" />
              <p className="text-sm text-muted-foreground mb-3">{error}</p>
              <Button variant="outline" size="sm" onClick={loadPayroll}>
                <RefreshCw className="mr-2 h-3 w-3" /> Retry
              </Button>
            </div>
          ) : loading ? (
            <div className="p-4 space-y-3">
              {[1, 2, 3, 4].map(i => (
                <Skeleton key={i} className="h-12 w-full rounded" />
              ))}
            </div>
          ) : records.length === 0 ? (
            <EmptyState
              icon={CreditCard}
              title="No payroll records"
              description={`No payroll data found for ${monthLabel} ${selectedYear}`}
            />
          ) : (
            <>
              {/* Desktop Table */}
              <div className="hidden md:block overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-12">
                      <Checkbox
                        checked={allSelected}
                        ref={(el) => {
                          // Use data attribute for indeterminate state
                          if (el) {
                            const input = el.querySelector('input') as HTMLInputElement | null
                            if (input) input.indeterminate = someSelected
                          }
                        }}
                        onCheckedChange={toggleAll}
                        aria-label="Select all"
                      />
                    </TableHead>
                    <TableHead>Driver</TableHead>
                    <TableHead className="hidden sm:table-cell text-right">Base Salary</TableHead>
                    <TableHead className="hidden md:table-cell text-right">Trip Bonus</TableHead>
                    <TableHead className="hidden lg:table-cell text-right">Overtime</TableHead>
                    <TableHead className="hidden lg:table-cell text-right">Deductions</TableHead>
                    <TableHead className="text-right">Net Pay</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead className="text-right">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {records.map((record) => {
                    const isSelected = selectedIds.has(record.id)
                    return (
                      <TableRow
                        key={record.id}
                        ref={(el) => { rowRefs.current[record.id] = el }}
                        className={`${isSelected ? 'bg-amber-50/50 dark:bg-amber-900/10' : ''} ${record.id === highlightEntityId ? highlightClassName : ''}`}
                      >
                        <TableCell>
                          <Checkbox
                            checked={isSelected}
                            onCheckedChange={() => toggleRow(record.id)}
                            aria-label={`Select ${record.driver.firstName} ${record.driver.lastName}`}
                          />
                        </TableCell>
                        <TableCell className="font-medium text-sm">{record.driver.firstName} {record.driver.lastName}</TableCell>
                        <TableCell className="hidden sm:table-cell text-right text-sm">
                          {CURRENCY_SYMBOL}{record.baseSalary.toLocaleString()}
                        </TableCell>
                        <TableCell className="hidden md:table-cell text-right text-sm text-emerald-600">
                          +{CURRENCY_SYMBOL}{record.tripBonus.toLocaleString()}
                        </TableCell>
                        <TableCell className="hidden lg:table-cell text-right text-sm text-emerald-600">
                          +{CURRENCY_SYMBOL}{record.overtimePay.toLocaleString()}
                        </TableCell>
                        <TableCell className="hidden lg:table-cell text-right text-sm text-red-600">
                          -{CURRENCY_SYMBOL}{record.deductions.toLocaleString()}
                        </TableCell>
                        <TableCell className="text-right text-sm font-bold">
                          {CURRENCY_SYMBOL}{record.netPay.toLocaleString()}
                        </TableCell>
                        <TableCell>
                          <StatusBadge status={record.status} variant="payroll" />
                        </TableCell>
                        <TableCell className="text-right">
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-8 w-8"
                            onClick={() => {
                              setDetailRecord(record)
                              setDetailOpen(true)
                            }}
                          >
                            <Eye className="h-3.5 w-3.5" />
                          </Button>
                        </TableCell>
                      </TableRow>
                    )
                  })}
                </TableBody>
              </Table>
              </div>

              {/* Mobile Cards */}
              <div className="md:hidden divide-y">
                {records.map((record) => (
                  <div key={record.id} className="mobile-card p-4 space-y-2">
                    <div className="flex items-center justify-between">
                      <span className="font-semibold text-sm">{record.driver.firstName} {record.driver.lastName}</span>
                      <StatusBadge status={record.status} variant="payroll" />
                    </div>
                    <div className="text-sm">
                      <span className="text-muted-foreground font-medium">Net Pay: </span>
                      <span className="font-bold text-amber-600">{CURRENCY_SYMBOL}{record.netPay.toLocaleString()}</span>
                    </div>
                    <div className="grid grid-cols-2 gap-2 text-xs text-muted-foreground">
                      <div><span className="font-medium">Base:</span> {CURRENCY_SYMBOL}{record.baseSalary.toLocaleString()}</div>
                      <div><span className="font-medium">Bonus:</span> +{CURRENCY_SYMBOL}{record.tripBonus.toLocaleString()}</div>
                      <div><span className="font-medium">Overtime:</span> +{CURRENCY_SYMBOL}{record.overtimePay.toLocaleString()}</div>
                      <div><span className="font-medium">Deductions:</span> -{CURRENCY_SYMBOL}{record.deductions.toLocaleString()}</div>
                    </div>
                    <Button
                      variant="outline"
                      size="sm"
                      className="w-full min-h-[44px]"
                      onClick={() => {
                        setDetailRecord(record)
                        setDetailOpen(true)
                      }}
                    >
                      <Eye className="mr-1.5 h-3.5 w-3.5" />
                      View Details
                    </Button>
                  </div>
                ))}
              </div>
            </>
          )}
        </div>
      </motion.div>

      {/* Payroll Detail Sheet */}
      <PayrollDetailSheet
        record={detailRecord}
        open={detailOpen}
        onOpenChange={(open) => {
          setDetailOpen(open)
          if (!open) setDetailRecord(null)
        }}
        onEdit={handleEdit}
        onStatusChange={(id, status) => {
          setDetailOpen(false)
          handleStatusChange(id, status)
        }}
        onDeleted={handleDelete}
      />

      {/* Payroll Create/Edit Form Sheet */}
      <PayrollFormDialog
        open={formOpen}
        onOpenChange={(open) => {
          setFormOpen(open)
          if (!open) setEditingRecord(null)
        }}
        onSaved={loadPayroll}
        editRecord={editingRecord}
      />
    </motion.div>
  )
}
