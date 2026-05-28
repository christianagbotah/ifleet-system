'use client'

import * as React from 'react'
import { motion } from 'framer-motion'
import {
  Plus,
  Search,
  Pencil,
  Trash2,
  Fuel,
  Droplets,
  TrendingDown,
  FileText,
  AlertCircle,
  RefreshCw,
  ChevronLeft,
  ChevronRight,
  Download,
  Upload,
  X,
  Eye,
  Truck,
  Route,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import { StatsCard } from '@/components/ui/stats-card'
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
import { CURRENCY_SYMBOL } from '@/lib/constants'
import { Checkbox } from '@/components/ui/checkbox'
import {
  fetchFuelLogs,
  fetchTrucks,
  deleteFuelLog,
  bulkDeleteFuelLogs,
  exportData,
  type FuelLog,
  type FuelLogStats,
  type Truck,
} from '@/lib/api'
import { DatePicker } from '@/components/ui/date-picker'
import { useDebounce } from '@/hooks/use-debounce'
import { FuelLogFormDialog } from '@/components/fuel/FuelLogFormDialog'
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
} from '@/components/ui/sheet'
import { ImportCSVDialog } from '@/components/import-csv-dialog'
import { toast } from 'sonner'
import { useEntityHighlight } from '@/lib/hooks/useEntityHighlight'

const containerVariants = {
  show: { transition: { staggerChildren: 0.04 } },
}

const itemVariants = {
  show: { opacity: 1, y: 0 },
}

const ITEMS_PER_PAGE = 10

function formatCurrency(amount: number): string {
  return `${CURRENCY_SYMBOL}${amount.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
}

export function FuelLogsView() {
  const [search, setSearch] = React.useState('')
  const debouncedSearch = useDebounce(search, 300)
  const [truckFilter, setTruckFilter] = React.useState('all')
  const [fuelTypeFilter, setFuelTypeFilter] = React.useState('all')
  const [dateFrom, setDateFrom] = React.useState('')
  const [dateTo, setDateTo] = React.useState('')
  const [fuelLogs, setFuelLogs] = React.useState<FuelLog[]>([])
  const [trucks, setTrucks] = React.useState<Truck[]>([])
  const [loading, setLoading] = React.useState(true)
  const [error, setError] = React.useState<string | null>(null)
  const [total, setTotal] = React.useState(0)
  const [page, setPage] = React.useState(1)
  const [stats, setStats] = React.useState<FuelLogStats | null>(null)
  const [formOpen, setFormOpen] = React.useState(false)
  const [viewLog, setViewLog] = React.useState<FuelLog | null>(null)
  const [editingLog, setEditingLog] = React.useState<FuelLog | null>(null)
  const [deleteId, setDeleteId] = React.useState<string | null>(null)
  const [deleting, setDeleting] = React.useState(false)
  const [importOpen, setImportOpen] = React.useState(false)

  // Bulk selection state
  const [selectedIds, setSelectedIds] = React.useState<Set<string>>(new Set())
  const [bulkLoading, setBulkLoading] = React.useState(false)
  const [bulkDeleteDialogOpen, setBulkDeleteDialogOpen] = React.useState(false)

  const { highlightEntityId, highlightClassName, scrollIntoView } = useEntityHighlight('fuellog')
  const rowRefs = React.useRef<Record<string, HTMLTableRowElement | HTMLDivElement | null>>({})

  const totalPages = Math.ceil(total / ITEMS_PER_PAGE)

  // Load trucks for filter dropdown
  React.useEffect(() => {
    fetchTrucks({ status: 'active', limit: 100 })
      .then((result) => setTrucks(result.data))
      .catch(() => toast.error('Failed to load trucks'))
  }, [])

  // Load fuel logs
  const loadFuelLogs = React.useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const params: Parameters<typeof fetchFuelLogs>[0] = {
        limit: ITEMS_PER_PAGE,
        page,
        stats: true,
      }
      if (truckFilter !== 'all') params.truckId = truckFilter
      if (fuelTypeFilter !== 'all') params.fuelType = fuelTypeFilter
      if (debouncedSearch) params.search = debouncedSearch
      if (dateFrom) params.dateFrom = dateFrom
      if (dateTo) params.dateTo = dateTo
      const result = await fetchFuelLogs(params)
      setFuelLogs(result.data)
      setTotal(result.total)
      setStats(result.stats ?? null)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to fetch fuel logs')
    } finally {
      setLoading(false)
    }
  }, [truckFilter, fuelTypeFilter, debouncedSearch, dateFrom, dateTo, page])

  React.useEffect(() => {
    loadFuelLogs()
  }, [loadFuelLogs])

  const handleExport = React.useCallback(async () => {
    try {
      const filters: Record<string, string> = {}
      if (truckFilter !== 'all') filters.truckId = truckFilter
      if (fuelTypeFilter !== 'all') filters.fuelType = fuelTypeFilter
      if (dateFrom) filters.startDate = dateFrom
      if (dateTo) filters.endDate = dateTo
      if (debouncedSearch) filters.search = debouncedSearch
      await exportData('fuel-logs', filters)
      toast.success('Export completed successfully')
    } catch {
      toast.error('Failed to export data')
    }
  }, [truckFilter, fuelTypeFilter, debouncedSearch, dateFrom, dateTo])

  // Reset page when filters change
  React.useEffect(() => {
    setPage(1)
  }, [truckFilter, fuelTypeFilter, debouncedSearch, dateFrom, dateTo])

  const handleDelete = async () => {
    if (!deleteId) return
    setDeleting(true)
    try {
      await deleteFuelLog(deleteId)
      toast.success('Fuel log deleted')
      setDeleteId(null)
      loadFuelLogs()
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to delete fuel log')
    } finally {
      setDeleting(false)
    }
  }

  // Bulk selection handlers
  const toggleSelect = React.useCallback((id: string) => {
    setSelectedIds(prev => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }, [])

  const toggleSelectAll = React.useCallback(() => {
    if (selectedIds.size === fuelLogs.length && fuelLogs.every(f => selectedIds.has(f.id))) {
      setSelectedIds(new Set())
    } else {
      setSelectedIds(new Set(fuelLogs.map(f => f.id)))
    }
  }, [fuelLogs, selectedIds])

  const isAllSelected = fuelLogs.length > 0 && fuelLogs.every(f => selectedIds.has(f.id))
  const isSomeSelected = fuelLogs.some(f => selectedIds.has(f.id)) && !isAllSelected
  const clearSelection = React.useCallback(() => setSelectedIds(new Set()), [])

  // Clear selection when filters/page change
  React.useEffect(() => {
    setSelectedIds(new Set())
  }, [truckFilter, fuelTypeFilter, debouncedSearch, dateFrom, dateTo, page])

  // Scroll to highlighted row after data loads
  React.useEffect(() => {
    if (highlightEntityId && !loading && rowRefs.current[highlightEntityId]) {
      scrollIntoView(rowRefs.current[highlightEntityId])
    }
  }, [highlightEntityId, loading, fuelLogs, scrollIntoView])

  // Bulk delete handler
  const handleBulkDelete = React.useCallback(async () => {
    if (selectedIds.size === 0) return
    setBulkLoading(true)
    try {
      const result = await bulkDeleteFuelLogs(Array.from(selectedIds))
      if (result.errors.length > 0) {
        const skippedMsg = result.errors.map(e => e.message).filter((m, i, arr) => arr.indexOf(m) === i).join('; ')
        toast.warning(`${result.success} fuel log(s) deleted. ${result.failed} skipped: ${skippedMsg}`)
      } else {
        toast.success(`${result.success} fuel log(s) deleted successfully`)
      }
      setSelectedIds(new Set())
      setBulkDeleteDialogOpen(false)
      loadFuelLogs()
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Bulk delete failed')
    } finally {
      setBulkLoading(false)
    }
  }, [selectedIds, loadFuelLogs])

  return (
    <motion.div
      variants={containerVariants}
      animate="show"
      className="space-y-4 sm:space-y-6"
    >
      {/* Header */}
      <motion.div variants={itemVariants} className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Fuel Management</h1>
          <p className="text-muted-foreground">Track fleet fuel consumption and costs ({total} records)</p>
        </div>
        <div className="flex gap-2">
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
          <Button
            onClick={() => {
              setEditingLog(null)
              setFormOpen(true)
            }}
            className="bg-amber-500 hover:bg-amber-600 text-white"
          >
            <Plus className="mr-2 h-4 w-4" />
            Add Fuel Log
          </Button>
        </div>
      </motion.div>

      {/* KPI Stats Row */}
      <motion.div variants={itemVariants} className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
        {loading ? (
          <>
            {[1, 2, 3, 4].map(i => (
              <div key={i} className="rounded-lg border bg-card p-4 sm:p-6">
                <Skeleton className="h-4 w-24 mb-3" />
                <Skeleton className="h-8 w-20" />
              </div>
            ))}
          </>
        ) : (
          <>
            <StatsCard
              icon={Fuel}
              title="Total Fuel Cost"
              value={formatCurrency(stats?.totalCost ?? 0)}
              description="this month"
            />
            <StatsCard
              icon={Droplets}
              title="Total Liters"
              value={`${(stats?.totalLiters ?? 0).toLocaleString()} L`}
              description="this month"
            />
            <StatsCard
              icon={TrendingDown}
              title="Avg Cost/Liter"
              value={formatCurrency(stats?.avgCostPerLiter ?? 0)}
              description="this month"
            />
            <StatsCard
              icon={FileText}
              title="Fuel Entries"
              value={String(stats?.count ?? 0)}
              description="this month"
            />
          </>
        )}
      </motion.div>

      {/* Filters */}
      <motion.div variants={itemVariants} className="flex flex-col lg:flex-row gap-3">
        <div className="relative flex-1 min-w-0">
          <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Search by station or receipt #..."
            className="pl-8"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
        <Select value={truckFilter} onValueChange={setTruckFilter}>
          <SelectTrigger className="w-full lg:w-44">
            <SelectValue placeholder="All Trucks" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Trucks</SelectItem>
            {trucks.map((truck) => (
              <SelectItem key={truck.id} value={truck.id}>
                {truck.plateNumber}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select value={fuelTypeFilter} onValueChange={setFuelTypeFilter}>
          <SelectTrigger className="w-full lg:w-36">
            <SelectValue placeholder="All Types" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Types</SelectItem>
            <SelectItem value="Diesel">Diesel</SelectItem>
            <SelectItem value="Petrol">Petrol</SelectItem>
          </SelectContent>
        </Select>
        <DatePicker value={dateFrom} onChange={(val) => setDateFrom(val)} className="w-full lg:w-40" />
        <DatePicker value={dateTo} onChange={(val) => setDateTo(val)} className="w-full lg:w-40" />
      </motion.div>

      {/* Bulk Action Toolbar */}
      {selectedIds.size > 0 && (
        <motion.div
          initial={{ opacity: 0, y: -10 }}
          animate={{ opacity: 1, y: 0 }}
          className="sticky top-0 z-20 rounded-lg border bg-amber-50 dark:bg-amber-950/40 border-amber-200 dark:border-amber-800 p-3 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 shadow-sm"
        >
          <div className="flex items-center gap-3">
            <Badge variant="secondary" className="bg-amber-600 text-white hover:bg-amber-600 border-0 font-medium">
              {selectedIds.size} fuel log{selectedIds.size !== 1 ? 's' : ''} selected
            </Badge>
          </div>
          <div className="flex items-center gap-2 flex-wrap">
            <Button
              size="sm"
              variant="outline"
              className="gap-1.5 text-xs border-red-300 bg-white dark:bg-gray-900 hover:bg-red-50 dark:hover:bg-red-950/30 text-red-600"
              onClick={() => setBulkDeleteDialogOpen(true)}
              disabled={bulkLoading}
            >
              <Trash2 className="h-3.5 w-3.5" />
              Delete
            </Button>
            <Button
              size="sm"
              variant="ghost"
              className="gap-1.5 text-xs text-muted-foreground hover:text-foreground"
              onClick={clearSelection}
              disabled={bulkLoading}
            >
              <X className="h-3.5 w-3.5" />
              Clear Selection
            </Button>
          </div>
        </motion.div>
      )}

      {/* Table */}
      <motion.div variants={itemVariants}>
        <div className="rounded-lg border bg-card">
          {error ? (
            <div className="flex flex-col items-center justify-center py-12 text-center">
              <AlertCircle className="h-8 w-8 text-red-500 mb-3" />
              <p className="text-sm text-muted-foreground mb-3">{error}</p>
              <Button variant="outline" size="sm" onClick={loadFuelLogs}>
                <RefreshCw className="mr-2 h-3 w-3" /> Retry
              </Button>
            </div>
          ) : loading ? (
            <div className="p-4 space-y-3">
              {[1, 2, 3, 4, 5].map(i => (
                <Skeleton key={i} className="h-12 w-full rounded" />
              ))}
            </div>
          ) : fuelLogs.length === 0 ? (
            <EmptyState
              icon={Fuel}
              title="No fuel logs found"
              description="Try adjusting your filters or record a new fuel fill"
              action={{
                label: 'Add Fuel Log',
                onClick: () => {
                  setEditingLog(null)
                  setFormOpen(true)
                },
              }}
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
                            checked={isAllSelected ? true : isSomeSelected ? 'indeterminate' : false}
                            onCheckedChange={toggleSelectAll}
                            aria-label="Select all fuel logs"
                          />
                        </TableHead>
                        <TableHead>Date</TableHead>
                      <TableHead>Truck</TableHead>
                      <TableHead>Trip #</TableHead>
                      <TableHead>Fuel Type</TableHead>
                      <TableHead className="text-right">Liters</TableHead>
                      <TableHead className="text-right">Cost/Liter</TableHead>
                      <TableHead className="text-right">Total</TableHead>
                      <TableHead>Station</TableHead>
                      <TableHead className="text-right">Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {fuelLogs.map((log) => (
                      <TableRow
                        key={log.id}
                        ref={(el) => { rowRefs.current[log.id] = el }}
                        className={`cursor-pointer hover:bg-muted/50 ${selectedIds.has(log.id) ? 'bg-amber-50 dark:bg-amber-950/20' : ''}${log.id === highlightEntityId ? ' ' + highlightClassName : ''}`}
                        onClick={() => {
                          setEditingLog(log)
                          setFormOpen(true)
                        }}
                      >
                        <TableCell onClick={(e) => e.stopPropagation()}>
                          <Checkbox
                            checked={selectedIds.has(log.id)}
                            onCheckedChange={() => toggleSelect(log.id)}
                            aria-label={`Select fuel log ${log.id}`}
                          />
                        </TableCell>
                        <TableCell className="text-sm">
                          {new Date(log.date).toLocaleDateString()}
                        </TableCell>
                        <TableCell className="text-sm font-medium">
                          {log.truck?.plateNumber || log.truckId}
                        </TableCell>
                        <TableCell className="text-sm text-muted-foreground">
                          {log.trip?.tripNumber || '—'}
                        </TableCell>
                        <TableCell>
                          <Badge
                            variant="outline"
                            className={`text-xs font-medium border-transparent ${
                              log.fuelType === 'Diesel'
                                ? 'bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-400'
                                : 'bg-sky-100 text-sky-700 dark:bg-sky-900/30 dark:text-sky-400'
                            }`}
                          >
                            {log.fuelType}
                          </Badge>
                        </TableCell>
                        <TableCell className="text-right text-sm">
                          {log.litersFilled.toLocaleString()} L
                        </TableCell>
                        <TableCell className="text-right text-sm">
                          {log.costPerLiter ? formatCurrency(log.costPerLiter) : '—'}
                        </TableCell>
                        <TableCell className="text-right text-sm font-semibold">
                          {formatCurrency(log.totalCost)}
                        </TableCell>
                        <TableCell className="text-sm text-muted-foreground max-w-[160px] truncate">
                          {log.stationName || '—'}
                        </TableCell>
                        <TableCell className="text-right">
                          <div className="flex items-center justify-end gap-1">
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-8 w-8"
                              onClick={(e) => {
                                e.stopPropagation()
                                setViewLog(log)
                              }}
                            >
                              <Eye className="h-3.5 w-3.5" />
                            </Button>
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-8 w-8"
                              onClick={(e) => {
                                e.stopPropagation()
                                setEditingLog(log)
                                setFormOpen(true)
                              }}
                            >
                              <Pencil className="h-3.5 w-3.5" />
                            </Button>
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-8 w-8 text-red-500 hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-900/20"
                              onClick={(e) => {
                                e.stopPropagation()
                                setDeleteId(log.id)
                              }}
                            >
                              <Trash2 className="h-3.5 w-3.5" />
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
                {fuelLogs.map((log) => (
                  <div
                    key={log.id}
                    ref={(el) => { rowRefs.current[log.id] = el }}
                    className={`p-4 space-y-3 cursor-pointer hover:bg-muted/50 transition-colors${log.id === highlightEntityId ? ' ' + highlightClassName : ''}`}
                    onClick={() => {
                      setEditingLog(log)
                      setFormOpen(true)
                    }}
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <p className="text-sm font-medium truncate">
                          {log.truck?.plateNumber || log.truckId}
                        </p>
                        <p className="text-xs text-muted-foreground">
                          {new Date(log.date).toLocaleDateString()}
                          {log.trip?.tripNumber && ` • ${log.trip.tripNumber}`}
                        </p>
                      </div>
                      <Badge
                        variant="outline"
                        className={`text-xs font-medium border-transparent shrink-0 ${
                          log.fuelType === 'Diesel'
                            ? 'bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-400'
                            : 'bg-sky-100 text-sky-700 dark:bg-sky-900/30 dark:text-sky-400'
                        }`}
                      >
                        {log.fuelType}
                      </Badge>
                    </div>
                    <div className="flex items-center justify-between text-sm">
                      <div>
                        <p className="text-muted-foreground text-xs">Station</p>
                        <p className="text-sm">{log.stationName || '—'}</p>
                      </div>
                      <div className="text-right">
                        <p className="text-muted-foreground text-xs">Liters</p>
                        <p className="text-sm font-medium">{log.litersFilled.toLocaleString()} L</p>
                      </div>
                      <div className="text-right">
                        <p className="text-muted-foreground text-xs">Total</p>
                        <p className="text-sm font-semibold">{formatCurrency(log.totalCost)}</p>
                      </div>
                    </div>
                    <div className="flex items-center justify-end gap-2 pt-1">
                      <Button
                        variant="outline"
                        size="sm"
                        className="h-8 text-xs"
                        onClick={(e) => {
                          e.stopPropagation()
                          setViewLog(log)
                        }}
                      >
                        <Eye className="mr-1 h-3 w-3" />
                        View
                      </Button>
                      <Button
                        variant="outline"
                        size="sm"
                        className="h-8 text-xs"
                        onClick={(e) => {
                          e.stopPropagation()
                          setEditingLog(log)
                          setFormOpen(true)
                        }}
                      >
                        <Pencil className="mr-1 h-3 w-3" />
                        Edit
                      </Button>
                      <Button
                        variant="outline"
                        size="sm"
                        className="h-8 text-xs text-red-500 hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-900/20 border-red-200 dark:border-red-800"
                        onClick={(e) => {
                          e.stopPropagation()
                          setDeleteId(log.id)
                        }}
                      >
                        <Trash2 className="mr-1 h-3 w-3" />
                        Delete
                      </Button>
                    </div>
                  </div>
                ))}
              </div>

              {/* Pagination */}
              {totalPages > 1 && (
                <div className="flex items-center justify-between px-4 py-3 border-t">
                  <p className="text-sm text-muted-foreground">
                    Showing {(page - 1) * ITEMS_PER_PAGE + 1}–{Math.min(page * ITEMS_PER_PAGE, total)} of {total}
                  </p>
                  <div className="flex items-center gap-1">
                    <Button
                      variant="outline"
                      size="icon"
                      className="h-8 w-8"
                      disabled={page <= 1}
                      onClick={() => setPage(p => Math.max(1, p - 1))}
                    >
                      <ChevronLeft className="h-4 w-4" />
                    </Button>
                    <span className="text-sm px-2">
                      {page} / {totalPages}
                    </span>
                    <Button
                      variant="outline"
                      size="icon"
                      className="h-8 w-8"
                      disabled={page >= totalPages}
                      onClick={() => setPage(p => Math.min(totalPages, p + 1))}
                    >
                      <ChevronRight className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
              )}
            </>
          )}
        </div>
      </motion.div>

      {/* Form Dialog */}
      <FuelLogFormDialog
        open={formOpen}
        onOpenChange={(open) => {
          setFormOpen(open)
          if (!open) setEditingLog(null)
        }}
        fuelLog={editingLog}
        onCreated={loadFuelLogs}
        onUpdated={loadFuelLogs}
      />

      <ImportCSVDialog
        open={importOpen}
        onOpenChange={setImportOpen}
        type="fuel-logs"
        label="Fuel Logs"
        onSuccess={loadFuelLogs}
      />

      {/* Bulk Delete Confirmation */}
      <AlertDialog open={bulkDeleteDialogOpen} onOpenChange={setBulkDeleteDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete {selectedIds.size} fuel log{selectedIds.size > 1 ? 's' : ''}?</AlertDialogTitle>
            <AlertDialogDescription>
              This will permanently delete {selectedIds.size} fuel log{selectedIds.size > 1 ? 's' : ''}. This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={bulkLoading}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleBulkDelete}
              disabled={bulkLoading}
              className="bg-red-600 hover:bg-red-700 focus:ring-red-600"
            >
              {bulkLoading ? 'Deleting...' : 'Delete'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* View Details Sheet */}
      <Sheet open={!!viewLog} onOpenChange={(open) => { if (!open) setViewLog(null) }}>
        <SheetContent side="right" className="sm:max-w-md overflow-y-auto">
          {viewLog && (
            <>
              <SheetHeader>
                <SheetTitle>Fuel Log Details</SheetTitle>
                <SheetDescription>
                  {new Date(viewLog.date).toLocaleDateString(undefined, { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}
                </SheetDescription>
              </SheetHeader>
              <div className="space-y-5 px-4 pb-4">
                {/* Truck & Trip */}
                <div className="grid grid-cols-2 gap-3">
                  <div className="rounded-lg border p-3 space-y-1">
                    <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                      <Truck className="h-3 w-3" />
                      Truck
                    </div>
                    <p className="text-sm font-semibold">{viewLog.truck?.plateNumber || viewLog.truckId}</p>
                  </div>
                  <div className="rounded-lg border p-3 space-y-1">
                    <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                      <Route className="h-3 w-3" />
                      Trip
                    </div>
                    <p className="text-sm font-semibold">{viewLog.trip?.tripNumber || '—'}</p>
                  </div>
                </div>

                {/* Fuel Info */}
                <div className="space-y-2">
                  <h4 className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Fuel Information</h4>
                  <div className="rounded-lg border divide-y">
                    <div className="flex items-center justify-between p-3">
                      <span className="text-sm text-muted-foreground">Fuel Type</span>
                      <Badge
                        variant="outline"
                        className={`text-xs font-medium border-transparent ${
                          viewLog.fuelType === 'Diesel'
                            ? 'bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-400'
                            : 'bg-sky-100 text-sky-700 dark:bg-sky-900/30 dark:text-sky-400'
                        }`}
                      >
                        {viewLog.fuelType}
                      </Badge>
                    </div>
                    <div className="flex items-center justify-between p-3">
                      <span className="text-sm text-muted-foreground">Liters Filled</span>
                      <span className="text-sm font-semibold">{viewLog.litersFilled.toLocaleString()} L</span>
                    </div>
                    <div className="flex items-center justify-between p-3">
                      <span className="text-sm text-muted-foreground">Cost / Liter</span>
                      <span className="text-sm font-medium">{viewLog.costPerLiter ? formatCurrency(viewLog.costPerLiter) : '—'}</span>
                    </div>
                    <div className="flex items-center justify-between p-3">
                      <span className="text-sm text-muted-foreground">Total Cost</span>
                      <span className="text-sm font-bold text-amber-600 dark:text-amber-400">{formatCurrency(viewLog.totalCost)}</span>
                    </div>
                  </div>
                </div>

                {/* Mileage */}
                {(viewLog.odometer || viewLog.fuelLevelBefore != null || viewLog.fuelLevelAfter != null) && (
                  <div className="space-y-2">
                    <h4 className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Mileage</h4>
                    <div className="rounded-lg border divide-y">
                      {viewLog.odometer && (
                        <div className="flex items-center justify-between p-3">
                          <span className="text-sm text-muted-foreground">Odometer</span>
                          <span className="text-sm font-medium">{viewLog.odometer.toLocaleString()} km</span>
                        </div>
                      )}
                      {viewLog.fuelLevelBefore != null && (
                        <div className="flex items-center justify-between p-3">
                          <span className="text-sm text-muted-foreground">Level Before</span>
                          <span className="text-sm font-medium">{viewLog.fuelLevelBefore}%</span>
                        </div>
                      )}
                      {viewLog.fuelLevelAfter != null && (
                        <div className="flex items-center justify-between p-3">
                          <span className="text-sm text-muted-foreground">Level After</span>
                          <span className="text-sm font-medium">{viewLog.fuelLevelAfter}%</span>
                        </div>
                      )}
                    </div>
                  </div>
                )}

                {/* Station & Receipt */}
                {(viewLog.stationName || viewLog.receiptNumber) && (
                  <div className="space-y-2">
                    <h4 className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Station & Receipt</h4>
                    <div className="rounded-lg border divide-y">
                      {viewLog.stationName && (
                        <div className="flex items-center justify-between p-3">
                          <span className="text-sm text-muted-foreground">Station</span>
                          <span className="text-sm font-medium">{viewLog.stationName}</span>
                        </div>
                      )}
                      {viewLog.receiptNumber && (
                        <div className="flex items-center justify-between p-3">
                          <span className="text-sm text-muted-foreground">Receipt #</span>
                          <span className="text-sm font-medium font-mono">{viewLog.receiptNumber}</span>
                        </div>
                      )}
                    </div>
                  </div>
                )}

                {/* Images */}
                {(() => {
                  if (!viewLog.images) return null
                  let parsed: string[]
                  try {
                    parsed = JSON.parse(viewLog.images)
                  } catch {
                    // If images is a plain string URL (legacy), treat as single image
                    if (typeof viewLog.images === 'string' && viewLog.images.startsWith('/')) {
                      parsed = [viewLog.images]
                    } else {
                      console.error('[FuelLogDetail] Failed to parse images:', viewLog.images)
                      return null
                    }
                  }
                  if (!Array.isArray(parsed) || parsed.length === 0) return null

                  return (
                    <div className="space-y-2">
                      <h4 className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Attached Photos</h4>
                      <div className="grid grid-cols-2 gap-2">
                        {parsed.map((url: string, idx: number) => (
                          <div key={idx} className="rounded-lg overflow-hidden border bg-muted aspect-square">
                            <img
                              src={url}
                              alt={`Photo ${idx + 1}`}
                              className="h-full w-full object-cover"
                              onError={(e) => {
                                console.error('[FuelLogDetail] Image failed to load:', url)
                                const target = e.currentTarget
                                target.style.display = 'none'
                                const parent = target.parentElement
                                if (parent) {
                                  parent.innerHTML = '<div class="flex flex-col items-center justify-center h-full gap-1 p-2"><svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="text-muted-foreground"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg><span class="text-[10px] text-muted-foreground text-center">Image not available</span></div>'
                                }
                              }}
                            />
                          </div>
                        ))}
                      </div>
                    </div>
                  )
                })()}

                {/* Timestamps */}
                <div className="text-xs text-muted-foreground space-y-0.5 pt-2 border-t">
                  <p>Created: {new Date(viewLog.createdAt).toLocaleString()}</p>
                  <p>Updated: {new Date(viewLog.updatedAt).toLocaleString()}</p>
                </div>
              </div>
            </>
          )}
        </SheetContent>
      </Sheet>

      {/* Delete Confirmation */}
      <AlertDialog open={!!deleteId} onOpenChange={(open) => { if (!open) setDeleteId(null) }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Fuel Log</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete this fuel log? This action cannot be undone. The fuel record will be permanently removed.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deleting}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDelete}
              disabled={deleting}
              className="bg-red-500 hover:bg-red-600 text-white"
            >
              {deleting ? 'Deleting...' : 'Delete'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </motion.div>
  )
}
