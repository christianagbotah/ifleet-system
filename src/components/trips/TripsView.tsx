'use client'

import * as React from 'react'
import { motion } from 'framer-motion'
import { Plus, Search, Eye, Pencil, Route, AlertCircle, RefreshCw, Download, Truck, User, Package, Users } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Checkbox } from '@/components/ui/checkbox'
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
import { StatusBadge } from '@/components/ui/status-badge'
import { EmptyState } from '@/components/ui/empty-state'
import { Skeleton } from '@/components/ui/skeleton'
import { BulkActionsToolbar } from '@/components/ui/bulk-actions-toolbar'
import { CURRENCY_SYMBOL, TRIP_STATUSES } from '@/lib/constants'
import { fetchTrips, exportData, bulkDeleteTrips, type Trip } from '@/lib/api'
import { useDebounce } from '@/hooks/use-debounce'
import { TripFormDialog } from './TripFormDialog'
import { TripDetailSheet } from './TripDetailSheet'
import { DriverTripController } from './DriverTripController'
import { useAuthStore } from '@/lib/store/auth'
import { usePushNotifications, type PushNotification } from '@/lib/hooks/usePushNotifications'
import { toast } from 'sonner'
import { useEntityHighlight } from '@/lib/hooks/useEntityHighlight'

const containerVariants = {
  show: { transition: { staggerChildren: 0.04 } },
}

const itemVariants = {
  show: { opacity: 1, y: 0 },
}

export function TripsView() {
  const { user } = useAuthStore()
  const isDriver = user?.role === 'Driver'

  const [search, setSearch] = React.useState('')
  const debouncedSearch = useDebounce(search, 300)
  const [statusFilter, setStatusFilter] = React.useState('all')
  const [formOpen, setFormOpen] = React.useState(false)
  const [editTrip, setEditTrip] = React.useState<Trip | null>(null)
  const [detailTrip, setDetailTrip] = React.useState<Trip | null>(null)
  const [detailOpen, setDetailOpen] = React.useState(false)
  const [trips, setTrips] = React.useState<Trip[]>([])
  const [loading, setLoading] = React.useState(true)
  const [error, setError] = React.useState<string | null>(null)
  const [total, setTotal] = React.useState(0)
  const [page, setPage] = React.useState(1)
  const LIMIT = 20

  // Bulk selection state
  const [selectedIds, setSelectedIds] = React.useState<Set<string>>(new Set())
  const [deleteDialogOpen, setDeleteDialogOpen] = React.useState(false)
  const [isDeleting, setIsDeleting] = React.useState(false)

  const { highlightEntityId, highlightClassName, scrollIntoView } = useEntityHighlight('trip')
  const rowRefs = React.useRef<Record<string, HTMLTableRowElement | null>>({})

  // ALL hooks before any conditional return
  const selectedCount = selectedIds.size
  const allSelected = trips.length > 0 && selectedIds.size === trips.length
  const totalPages = Math.ceil(total / LIMIT)

  const loadTrips = React.useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const params: Parameters<typeof fetchTrips>[0] = { page, limit: LIMIT }
      if (debouncedSearch) params.search = debouncedSearch
      if (statusFilter !== 'all') params.status = statusFilter
      const result = await fetchTrips(params)
      setTrips(result.data)
      setTotal(result.total ?? 0)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to fetch trips')
    } finally {
      setLoading(false)
    }
  }, [debouncedSearch, statusFilter, page])

  React.useEffect(() => {
    loadTrips()
  }, [loadTrips])

  // Reset to page 1 when filters change
  React.useEffect(() => {
    setPage(1)
  }, [debouncedSearch, statusFilter])

  // Clear selection when filters/page change
  React.useEffect(() => {
    setSelectedIds(new Set())
  }, [debouncedSearch, statusFilter, page])

  // Scroll to highlighted row after data loads
  React.useEffect(() => {
    if (highlightEntityId && !loading && rowRefs.current[highlightEntityId]) {
      scrollIntoView(rowRefs.current[highlightEntityId])
    }
  }, [highlightEntityId, loading, trips, scrollIntoView])

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
    setSelectedIds(new Set(trips.map(t => t.id)))
  }, [trips])

  // Deselect all
  const deselectAll = React.useCallback(() => {
    setSelectedIds(new Set())
  }, [])

  // Bulk delete handler
  const handleBulkDelete = React.useCallback(async () => {
    setIsDeleting(true)
    try {
      const ids = Array.from(selectedIds)
      const result = await bulkDeleteTrips(ids)
      toast.success(`Successfully cancelled ${result.deleted} trip${result.deleted > 1 ? 's' : ''}`)
      setSelectedIds(new Set())
      setDeleteDialogOpen(false)
      loadTrips()
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to delete trips')
    } finally {
      setIsDeleting(false)
    }
  }, [selectedIds, loadTrips])

  const handleExport = React.useCallback(async () => {
    try {
      const filters: Record<string, string> = {}
      if (statusFilter !== 'all') filters.status = statusFilter
      if (debouncedSearch) filters.search = debouncedSearch
      await exportData('trips', filters)
      toast.success('Export completed successfully')
    } catch {
      toast.error('Failed to export data')
    }
  }, [statusFilter, debouncedSearch])

  // Auto-refresh trips list every 30 seconds
  React.useEffect(() => {
    const interval = setInterval(loadTrips, 30000)
    return () => clearInterval(interval)
  }, [loadTrips])

  // Listen for push notifications to auto-refresh trips on status changes
  const handlePushNotification = React.useCallback((_notification: PushNotification) => {
    // Reload trips when a trip-related push notification arrives
    loadTrips()
  }, [loadTrips])
  usePushNotifications(handlePushNotification)

  const handleTripCreated = React.useCallback(() => {
    loadTrips()
  }, [loadTrips])

  const handleTripUpdated = React.useCallback(() => {
    loadTrips()
  }, [loadTrips])

  const handleStatusChanged = React.useCallback(() => {
    loadTrips()
    setDetailOpen(false)
  }, [loadTrips])

  const handleViewTrip = React.useCallback((trip: Trip) => {
    setDetailTrip(trip)
    setDetailOpen(true)
  }, [])

  const allStatusKeys = Object.keys(TRIP_STATUSES)

  // If driver, show the driver trip controller (after all hooks)
  if (isDriver) {
    return <DriverTripController />
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
          <h1 className="text-2xl font-bold tracking-tight">Trip Management</h1>
          <p className="text-muted-foreground">Track and manage all cargo trips ({total} total)</p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={handleExport} className="hidden md:flex gap-2">
            <Download className="h-4 w-4" />
            Export CSV
          </Button>
          <Button
            onClick={() => { setEditTrip(null); setFormOpen(true) }}
            className="bg-amber-500 hover:bg-amber-600 text-white"
          >
            <Plus className="mr-2 h-4 w-4" />
            New Trip
          </Button>
        </div>
      </motion.div>

      {/* Filters */}
      <motion.div variants={itemVariants} className="flex flex-col sm:flex-row gap-3">
        <div className="relative flex-1">
          <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Search by trip #, truck, driver, or route..."
            className="pl-8"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
        <Select value={statusFilter} onValueChange={setStatusFilter}>
          <SelectTrigger className="w-full sm:w-44">
            <SelectValue placeholder="Status" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Status</SelectItem>
            {allStatusKeys.map((key) => (
              <SelectItem key={key} value={key}>
                {TRIP_STATUSES[key as keyof typeof TRIP_STATUSES].label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </motion.div>

      {/* Table & Mobile Cards */}
      <motion.div variants={itemVariants}>
        {/* ── Error state (shared) ── */}
        {error ? (
          <div className="rounded-lg border bg-card flex flex-col items-center justify-center py-12 text-center">
            <AlertCircle className="h-8 w-8 text-red-500 mb-3" />
            <p className="text-sm text-muted-foreground mb-3">{error}</p>
            <Button variant="outline" size="sm" onClick={loadTrips}>
              <RefreshCw className="mr-2 h-3 w-3" /> Retry
            </Button>
          </div>
        ) : loading ? (
          /* ── Loading state (shared) ── */
          <div className="rounded-lg border bg-card p-4 space-y-3">
            {[1, 2, 3, 4].map(i => (
              <Skeleton key={i} className="h-12 w-full rounded" />
            ))}
          </div>
        ) : trips.length === 0 ? (
          /* ── Empty state (shared) ── */
          <div className="rounded-lg border bg-card">
            <EmptyState
              icon={Route}
              title="No trips found"
              description={search || statusFilter !== 'all'
                ? 'Try adjusting your search or filter criteria'
                : 'Get started by creating a new trip'
              }
              action={!search && statusFilter === 'all' ? {
                label: 'New Trip',
                onClick: () => setFormOpen(true),
              } : undefined}
            />
          </div>
        ) : (
          <>
            {/* ── Desktop: Table view ── */}
            <div className="hidden md:block rounded-lg border bg-card">
              <div className="overflow-x-auto max-h-[500px] overflow-y-auto">
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
                          aria-label="Select all trips"
                        />
                      </TableHead>
                      <TableHead>Trip #</TableHead>
                      <TableHead>Truck</TableHead>
                      <TableHead className="hidden md:table-cell">Driver</TableHead>
                      <TableHead className="hidden lg:table-cell">Route</TableHead>
                      <TableHead className="hidden sm:table-cell">Cargo</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead className="text-right">Revenue</TableHead>
                      <TableHead className="text-right">Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {trips.map((trip) => (
                      <TableRow key={trip.id} ref={(el) => { rowRefs.current[trip.id] = el }} className={`group cursor-pointer ${selectedIds.has(trip.id) ? 'bg-amber-50 dark:bg-amber-950/20' : ''}${trip.id === highlightEntityId ? ' ' + highlightClassName : ''}`} onClick={() => handleViewTrip(trip)}>
                        <TableCell onClick={(e) => e.stopPropagation()}>
                          <Checkbox
                            checked={selectedIds.has(trip.id)}
                            onCheckedChange={() => toggleSelect(trip.id)}
                            aria-label={`Select trip ${trip.tripNumber}`}
                          />
                        </TableCell>
                        <TableCell className="font-medium text-xs">{trip.tripNumber}</TableCell>
                        <TableCell className="text-sm">{trip.truck.plateNumber}</TableCell>
                        <TableCell className="hidden md:table-cell text-sm">{trip.driver.firstName} {trip.driver.lastName}</TableCell>
                        <TableCell className="hidden lg:table-cell text-xs">
                          <span className="bg-muted rounded px-1.5 py-0.5">{trip.loadingLocation}</span>
                          <span className="mx-1 text-muted-foreground">→</span>
                          <span className="bg-muted rounded px-1.5 py-0.5">{trip.destination}</span>
                        </TableCell>
                        <TableCell className="hidden sm:table-cell text-xs">
                          <div className="flex items-center gap-1.5">
                            <span className="font-medium">{trip.itemName}</span>
                            <span className="text-muted-foreground">({trip.quantity} {trip.unit})</span>
                            {(trip as Record<string, unknown>).deliveryType === 'MULTIPLE' && (
                              <span className="inline-flex items-center gap-0.5 text-[10px] px-1.5 py-0.5 rounded-full bg-violet-100 dark:bg-violet-900/30 text-violet-700 dark:text-violet-400 font-medium ml-1">
                                <Users className="h-3 w-3" />
                                Multi-Drop
                              </span>
                            )}
                          </div>
                        </TableCell>
                        <TableCell>
                          <StatusBadge status={trip.status} variant="trip" />
                        </TableCell>
                        <TableCell className="text-right text-sm font-medium">
                          {trip.totalRevenue ? `${CURRENCY_SYMBOL}${trip.totalRevenue.toLocaleString()}` : '-'}
                        </TableCell>
                        <TableCell className="text-right">
                          <div className="flex items-center justify-end gap-1">
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-8 w-8"
                              onClick={(e) => {
                                e.stopPropagation()
                                handleViewTrip(trip)
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
                                setEditTrip(trip)
                                setFormOpen(true)
                              }}
                            >
                              <Pencil className="h-3.5 w-3.5" />
                            </Button>
                          </div>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            </div>

            {/* ── Mobile: Card list view ── */}
            <div className="md:hidden space-y-3">
              {trips.map((trip) => (
                <div
                  key={trip.id}
                  onClick={() => handleViewTrip(trip)}
                  className={`mobile-card rounded-xl border bg-card p-4 active:scale-[0.98] transition-transform cursor-pointer${trip.id === highlightEntityId ? ' ' + highlightClassName : ''}`}
                >
                  {/* Row 1: Trip # + Status */}
                  <div className="flex items-center justify-between mb-2">
                    <span className="font-bold text-sm">{trip.tripNumber}</span>
                    <StatusBadge status={trip.status} variant="trip" />
                  </div>

                  {/* Row 2: Route */}
                  <div className="flex items-center gap-1.5 text-xs text-muted-foreground mb-2">
                    <Route className="h-3.5 w-3.5 shrink-0" />
                    <span className="truncate">
                      <span className="font-medium text-foreground">{trip.loadingLocation}</span>
                      <span className="mx-1">→</span>
                      <span className="font-medium text-foreground">{trip.destination}</span>
                    </span>
                  </div>

                  {/* Row 3: Truck + Driver */}
                  <div className="flex items-center gap-4 text-xs mb-2">
                    <div className="flex items-center gap-1.5 min-w-0">
                      <Truck className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                      <span className="truncate">{trip.truck.plateNumber}</span>
                    </div>
                    <div className="flex items-center gap-1.5 min-w-0">
                      <User className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                      <span className="truncate">{trip.driver.firstName} {trip.driver.lastName}</span>
                    </div>
                  </div>

                  {/* Row 4: Cargo */}
                  <div className="flex items-center gap-1.5 text-xs text-muted-foreground mb-2">
                    <Package className="h-3.5 w-3.5 shrink-0" />
                    <span>
                      <span className="font-medium text-foreground">{trip.itemName}</span>
                      <span className="ml-1">({trip.quantity} {trip.unit})</span>
                    </span>
                    {(trip as Record<string, unknown>).deliveryType === 'MULTIPLE' && (
                      <span className="inline-flex items-center gap-0.5 text-[10px] px-1.5 py-0.5 rounded-full bg-violet-100 dark:bg-violet-900/30 text-violet-700 dark:text-violet-400 font-medium ml-auto">
                        <Users className="h-3 w-3" />
                        Multi-Drop
                      </span>
                    )}
                  </div>

                  {/* Row 5: Revenue (if available) */}
                  {trip.totalRevenue && (
                    <div className="text-sm font-semibold text-right pt-1 border-t">
                      {CURRENCY_SYMBOL}{trip.totalRevenue.toLocaleString()}
                    </div>
                  )}
                </div>
              ))}
            </div>
          </>
        )}

        {/* Pagination */}
        {totalPages > 1 && (
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pt-4">
            <p className="hidden sm:block text-sm text-muted-foreground">
              Showing {((page - 1) * LIMIT) + 1}–{Math.min(page * LIMIT, total)} of {total}
            </p>
            <div className="flex items-center justify-between sm:justify-end gap-2">
              <span className="text-sm text-muted-foreground order-2 sm:order-1">Page {page} of {totalPages}</span>
              <div className="flex items-center gap-2 order-1 sm:order-2">
                <Button variant="outline" size="sm" disabled={page <= 1} onClick={() => setPage(p => p - 1)}>
                  Previous
                </Button>
                <Button variant="outline" size="sm" disabled={page >= totalPages} onClick={() => setPage(p => p + 1)}>
                  Next
                </Button>
              </div>
            </div>
          </div>
        )}
      </motion.div>

      {/* Trip Form Dialog */}
      <TripFormDialog
        open={formOpen}
        onOpenChange={(open) => {
          setFormOpen(open)
          if (!open) setEditTrip(null)
        }}
        onCreated={handleTripCreated}
        onUpdated={handleTripUpdated}
        trip={editTrip}
      />

      {/* Trip Detail Sheet */}
      <TripDetailSheet
        trip={detailTrip}
        open={detailOpen}
        onOpenChange={setDetailOpen}
        onStatusChanged={handleStatusChanged}
      />

      {/* Bulk Actions Toolbar */}
      <BulkActionsToolbar
        selectedCount={selectedCount}
        totalCount={trips.length}
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
            <AlertDialogTitle>Delete {selectedCount} trip{selectedCount > 1 ? 's' : ''}?</AlertDialogTitle>
            <AlertDialogDescription>
              This will permanently cancel {selectedCount} trip{selectedCount > 1 ? 's' : ''}. Completed trips will be skipped. This action cannot be undone.
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
