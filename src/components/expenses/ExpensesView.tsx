'use client'

import * as React from 'react'
import { motion } from 'framer-motion'
import { Plus, Search, Eye, Pencil, Receipt, AlertCircle, RefreshCw, Download, Upload } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
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
import { SearchableSelect, type SearchableOption } from '@/components/ui/searchable-select'
import { BulkActionsToolbar } from '@/components/ui/bulk-actions-toolbar'
import { EXPENSE_CATEGORIES, EXPENSE_CATEGORY_COLORS, CURRENCY_SYMBOL } from '@/lib/constants'
import { fetchExpenses, exportData, bulkDeleteExpenses, type Expense } from '@/lib/api'
import { useDebounce } from '@/hooks/use-debounce'
import { ExpenseFormDialog } from '@/components/expenses/ExpenseFormDialog'
import { ExpenseDetailSheet } from '@/components/expenses/ExpenseDetailSheet'
import { ImportCSVDialog } from '@/components/import-csv-dialog'
import { toast } from 'sonner'
import { useEntityHighlight } from '@/lib/hooks/useEntityHighlight'

const containerVariants = {
  show: { transition: { staggerChildren: 0.04 } },
}

const itemVariants = {
  show: { opacity: 1, y: 0 },
}

export function ExpensesView() {
  const [search, setSearch] = React.useState('')
  const debouncedSearch = useDebounce(search, 300)
  const [categoryFilter, setCategoryFilter] = React.useState('all')
  const [statusFilter, setStatusFilter] = React.useState('all')
  const [expenses, setExpenses] = React.useState<Expense[]>([])
  const [loading, setLoading] = React.useState(true)
  const [error, setError] = React.useState<string | null>(null)
  const [total, setTotal] = React.useState(0)
  const [formOpen, setFormOpen] = React.useState(false)
  const [editingExpense, setEditingExpense] = React.useState<Expense | null>(null)
  const [importOpen, setImportOpen] = React.useState(false)
  const [viewExpense, setViewExpense] = React.useState<Expense | null>(null)

  // Bulk selection state
  const [selectedIds, setSelectedIds] = React.useState<Set<string>>(new Set())
  const [deleteDialogOpen, setDeleteDialogOpen] = React.useState(false)
  const [isDeleting, setIsDeleting] = React.useState(false)

  const { highlightEntityId, highlightClassName, scrollIntoView } = useEntityHighlight('expense')
  const rowRefs = React.useRef<Record<string, HTMLTableRowElement | null>>({})

  const selectedCount = selectedIds.size
  const allSelected = expenses.length > 0 && selectedIds.size === expenses.length

  const loadExpenses = React.useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const params: Parameters<typeof fetchExpenses>[0] = { limit: 100 }
      if (debouncedSearch) params.search = debouncedSearch
      if (categoryFilter !== 'all') params.category = categoryFilter
      if (statusFilter !== 'all') params.status = statusFilter
      const result = await fetchExpenses(params)
      setExpenses(result.data)
      setTotal(result.total)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to fetch expenses')
    } finally {
      setLoading(false)
    }
  }, [debouncedSearch, categoryFilter, statusFilter])

  React.useEffect(() => {
    loadExpenses()
  }, [loadExpenses])

  // Clear selection when filters change
  React.useEffect(() => {
    setSelectedIds(new Set())
  }, [debouncedSearch, categoryFilter, statusFilter])

  // Scroll to highlighted row after data loads
  React.useEffect(() => {
    if (highlightEntityId && !loading && rowRefs.current[highlightEntityId]) {
      scrollIntoView(rowRefs.current[highlightEntityId])
    }
  }, [highlightEntityId, loading, expenses, scrollIntoView])

  // Toggle single selection
  const toggleSelect = React.useCallback((id: string) => {
    setSelectedIds(prev => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }, [])

  // Select all on current page
  const selectAll = React.useCallback(() => {
    setSelectedIds(new Set(expenses.map(e => e.id)))
  }, [expenses])

  // Deselect all
  const deselectAll = React.useCallback(() => {
    setSelectedIds(new Set())
  }, [])

  // Bulk delete handler
  const handleBulkDelete = React.useCallback(async () => {
    setIsDeleting(true)
    try {
      const ids = Array.from(selectedIds)
      const result = await bulkDeleteExpenses(ids)
      toast.success(`Successfully deleted ${result.deleted} expense${result.deleted > 1 ? 's' : ''}`)
      setSelectedIds(new Set())
      setDeleteDialogOpen(false)
      loadExpenses()
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to delete expenses')
    } finally {
      setIsDeleting(false)
    }
  }, [selectedIds, loadExpenses])

  const handleExport = React.useCallback(async () => {
    try {
      const filters: Record<string, string> = {}
      if (categoryFilter !== 'all') filters.category = categoryFilter
      if (statusFilter !== 'all') filters.status = statusFilter
      if (debouncedSearch) filters.search = debouncedSearch
      await exportData('expenses', filters)
      toast.success('Export completed successfully')
    } catch {
      toast.error('Failed to export data')
    }
  }, [categoryFilter, statusFilter, debouncedSearch])

  const totalExpensesAmount = expenses.reduce((sum, e) => sum + e.amount, 0)

  const categoryBreakdown = React.useMemo(() => {
    const map: Record<string, { category: string; amount: number; count: number }> = {}
    expenses.forEach(e => {
      if (!map[e.category]) map[e.category] = { category: e.category.charAt(0).toUpperCase() + e.category.slice(1), amount: 0, count: 0 }
      map[e.category].amount += e.amount
      map[e.category].count += 1
    })
    return Object.values(map)
  }, [expenses])

  return (
    <motion.div
      variants={containerVariants}
      animate="show"
      className="space-y-4 sm:space-y-6"
    >
      {/* Header */}
      <motion.div variants={itemVariants} className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Expenses</h1>
          <p className="text-muted-foreground">Track and manage fleet expenses ({total} records)</p>
        </div>
        <div className="flex gap-2">
          <div className="hidden sm:flex gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => setImportOpen(true)}
              className="gap-2"
            >
              <Upload className="h-4 w-4" />
              Import CSV
            </Button>
            <Button variant="outline" size="sm" onClick={handleExport} className="gap-2">
              <Download className="h-4 w-4" />
              Export CSV
            </Button>
          </div>
          <Button
            onClick={() => {
              setEditingExpense(null)
              setFormOpen(true)
            }}
            className="bg-amber-500 hover:bg-amber-600 text-white"
          >
            <Plus className="mr-2 h-4 w-4" />
            Add Expense
          </Button>
        </div>
      </motion.div>

      {/* Summary Cards */}
      <motion.div variants={itemVariants} className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {loading ? (
          <Card><CardContent className="p-6"><Skeleton className="h-4 w-24 mb-3" /><Skeleton className="h-8 w-20" /></CardContent></Card>
        ) : (
          <>
            <StatsCard
              icon={Receipt}
              title="Total This Month"
              value={`${CURRENCY_SYMBOL}${totalExpensesAmount.toLocaleString()}`}
              change={5.2}
              changeLabel="vs last month"
            />
            <Card className="sm:col-span-2 lg:col-span-3 hover:shadow-md transition-shadow">
              <CardHeader className="pb-2 pt-4 px-4 sm:px-6">
                <CardTitle className="text-sm">By Category</CardTitle>
              </CardHeader>
              <CardContent className="px-4 sm:px-6">
                {categoryBreakdown.length > 0 ? (
                  <div className="flex flex-wrap gap-3">
                    {categoryBreakdown.map((cat) => (
                      <div key={cat.category} className="flex items-center gap-2 text-xs">
                        <Badge variant="outline" className="text-xs">
                          {cat.category}
                        </Badge>
                        <span className="font-medium">{CURRENCY_SYMBOL}{cat.amount.toLocaleString()}</span>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="text-sm text-muted-foreground">No expense data available</p>
                )}
              </CardContent>
            </Card>
          </>
        )}
      </motion.div>

      {/* Filters */}
      <motion.div variants={itemVariants} className="flex flex-col sm:flex-row gap-3">
        <div className="relative flex-1">
          <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Search by description or truck plate..."
            className="pl-8"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
        <SearchableSelect
          className="w-full sm:w-44"
          placeholder="Category"
          searchPlaceholder="Search categories..."
          emptyMessage="No category found."
          value={categoryFilter}
          onValueChange={setCategoryFilter}
          options={[
            { value: 'all', label: 'All Categories' },
            ...EXPENSE_CATEGORIES.map((cat): SearchableOption => ({ value: cat.value, label: `${cat.icon} ${cat.label}` })),
          ]}
        />
        <Select value={statusFilter} onValueChange={setStatusFilter}>
          <SelectTrigger className="w-full sm:w-36">
            <SelectValue placeholder="Status" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Status</SelectItem>
            <SelectItem value="pending">Pending</SelectItem>
            <SelectItem value="approved">Approved</SelectItem>
            <SelectItem value="rejected">Rejected</SelectItem>
          </SelectContent>
        </Select>
      </motion.div>

      {/* Table */}
      <motion.div variants={itemVariants}>
        <div className="rounded-lg border bg-card">
          {error ? (
            <div className="flex flex-col items-center justify-center py-12 text-center">
              <AlertCircle className="h-8 w-8 text-red-500 mb-3" />
              <p className="text-sm text-muted-foreground mb-3">{error}</p>
              <Button variant="outline" size="sm" onClick={loadExpenses}>
                <RefreshCw className="mr-2 h-3 w-3" /> Retry
              </Button>
            </div>
          ) : loading ? (
            <div className="p-4 space-y-3">
              {[1, 2, 3, 4].map(i => (
                <Skeleton key={i} className="h-12 w-full rounded" />
              ))}
            </div>
          ) : expenses.length === 0 ? (
            <EmptyState
              icon={Receipt}
              title="No expenses found"
              description="Try adjusting your filters or add a new expense"
            />
          ) : (
            <>
            {/* Desktop Table */}
            <div className="hidden md:block overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-10">
                      <Checkbox
                        checked={allSelected}
                        onCheckedChange={(checked) => {
                          if (checked) selectAll()
                          else deselectAll()
                        }}
                        aria-label="Select all expenses"
                      />
                    </TableHead>
                    <TableHead>Date</TableHead>
                    <TableHead className="hidden sm:table-cell">Truck</TableHead>
                    <TableHead>Category</TableHead>
                    <TableHead className="hidden md:table-cell">Description</TableHead>
                    <TableHead className="text-right">Amount</TableHead>
                    <TableHead className="hidden lg:table-cell">Payment</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead className="text-right">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {expenses.map((exp) => (
                    <TableRow key={exp.id} ref={(el) => { rowRefs.current[exp.id] = el }} className={`${selectedIds.has(exp.id) ? 'bg-amber-50 dark:bg-amber-950/20' : ''}${exp.id === highlightEntityId ? ' ' + highlightClassName : ''}`}>
                      <TableCell>
                        <Checkbox
                          checked={selectedIds.has(exp.id)}
                          onCheckedChange={() => toggleSelect(exp.id)}
                          aria-label={`Select expense ${exp.description}`}
                        />
                      </TableCell>
                      <TableCell className="text-sm">{new Date(exp.date).toLocaleDateString()}</TableCell>
                      <TableCell className="hidden sm:table-cell text-sm font-medium">{exp.truck.plateNumber}</TableCell>
                      <TableCell>
                        <Badge
                          variant="outline"
                          className={`text-xs border-transparent font-medium capitalize ${
                            EXPENSE_CATEGORY_COLORS[exp.category] || ''
                          }`}
                        >
                          {exp.category}
                        </Badge>
                      </TableCell>
                      <TableCell className="hidden md:table-cell text-sm max-w-[200px] truncate">
                        {exp.description}
                      </TableCell>
                      <TableCell className="text-right text-sm font-semibold">
                        {CURRENCY_SYMBOL}{exp.amount.toLocaleString()}
                      </TableCell>
                      <TableCell className="hidden lg:table-cell text-sm capitalize">
                        {exp.paymentMethod.replace('_', ' ')}
                      </TableCell>
                      <TableCell>
                        <StatusBadge status={exp.status} variant="expense" />
                      </TableCell>
                      <TableCell className="text-right">
                        <div className="flex items-center justify-end gap-1">
                          <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => setViewExpense(exp)}>
                            <Eye className="h-3.5 w-3.5" />
                          </Button>
                          <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => {
                            setEditingExpense(exp)
                            setFormOpen(true)
                          }}>
                            <Pencil className="h-3.5 w-3.5" />
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>

              {/* Mobile Cards */}
              <div className="md:hidden divide-y">
                {expenses.map((exp) => (
                  <div
                    key={exp.id}
                    ref={(el) => { rowRefs.current[exp.id] = el }}
                    className={`mobile-card p-4 space-y-3${exp.id === highlightEntityId ? ' ' + highlightClassName : ''}`}
                  >
                    {/* Top row: checkbox + truck + date + status */}
                    <div className="flex items-start gap-2">
                      <div className="pt-0.5">
                        <Checkbox
                          checked={selectedIds.has(exp.id)}
                          onCheckedChange={() => toggleSelect(exp.id)}
                          aria-label={`Select expense ${exp.description}`}
                        />
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center justify-between gap-2">
                          <p className="text-sm font-medium truncate">{exp.truck.plateNumber}</p>
                          <StatusBadge status={exp.status} variant="expense" />
                        </div>
                        <p className="text-xs text-muted-foreground">
                          {new Date(exp.date).toLocaleDateString()}
                        </p>
                      </div>
                    </div>

                    {/* Category + Description */}
                    <div className="flex items-center gap-2 flex-wrap">
                      <Badge
                        variant="outline"
                        className={`text-xs border-transparent font-medium capitalize shrink-0 ${
                          EXPENSE_CATEGORY_COLORS[exp.category] || ''
                        }`}
                      >
                        {exp.category}
                      </Badge>
                      <p className="text-sm text-muted-foreground truncate">{exp.description}</p>
                    </div>

                    {/* Amount + Actions */}
                    <div className="flex items-center justify-between gap-2 pt-1">
                      <p className="text-sm font-bold whitespace-nowrap">
                        {CURRENCY_SYMBOL}{exp.amount.toLocaleString()}
                      </p>
                      <div className="flex items-center gap-2">
                        <Button
                          variant="outline"
                          size="sm"
                          className="min-h-[44px] gap-1.5 text-xs"
                          onClick={() => setViewExpense(exp)}
                        >
                          <Eye className="h-3.5 w-3.5" />
                          View
                        </Button>
                        <Button
                          variant="outline"
                          size="sm"
                          className="min-h-[44px] gap-1.5 text-xs"
                          onClick={() => {
                            setEditingExpense(exp)
                            setFormOpen(true)
                          }}
                        >
                          <Pencil className="h-3.5 w-3.5" />
                          Edit
                        </Button>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </>
          )}
        </div>
      </motion.div>

      <ExpenseFormDialog
        open={formOpen}
        onOpenChange={(open) => {
          setFormOpen(open)
          if (!open) setEditingExpense(null)
        }}
        expense={editingExpense}
        onCreated={loadExpenses}
        onUpdated={loadExpenses}
      />

      <ExpenseDetailSheet
        expense={viewExpense}
        open={!!viewExpense}
        onOpenChange={(open) => { if (!open) setViewExpense(null) }}
      />

      <ImportCSVDialog
        open={importOpen}
        onOpenChange={setImportOpen}
        type="expenses"
        label="Expenses"
        onSuccess={loadExpenses}
      />

      {/* Bulk Actions Toolbar */}
      <BulkActionsToolbar
        selectedCount={selectedCount}
        totalCount={expenses.length}
        allSelected={allSelected}
        onSelectAll={selectAll}
        onDeselectAll={deselectAll}
        onDelete={() => setDeleteDialogOpen(true)}
        onCancel={deselectAll}
        isDeleting={isDeleting}
      />

      {/* Delete Confirmation Dialog */}
      <AlertDialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete {selectedCount} expense{selectedCount > 1 ? 's' : ''}?</AlertDialogTitle>
            <AlertDialogDescription>
              This will permanently delete {selectedCount} expense{selectedCount > 1 ? 's' : ''}. This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={isDeleting}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleBulkDelete}
              disabled={isDeleting}
              className="bg-red-600 hover:bg-red-700 focus:ring-red-600"
            >
              {isDeleting ? 'Deleting...' : 'Delete'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </motion.div>
  )
}
