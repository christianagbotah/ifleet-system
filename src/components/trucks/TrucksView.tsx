'use client'

import * as React from 'react'
import { motion } from 'framer-motion'
import { Plus, Search, Eye, Pencil, UserPlus, Truck, AlertCircle, RefreshCw, Download, Upload, X, CheckCircle2, XCircle, Trash2 } from 'lucide-react'
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
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Checkbox } from '@/components/ui/checkbox'
import { Badge } from '@/components/ui/badge'
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
import { SearchableSelect, type SearchableOption } from '@/components/ui/searchable-select'
import { StatusBadge } from '@/components/ui/status-badge'
import { EmptyState } from '@/components/ui/empty-state'
import { Skeleton } from '@/components/ui/skeleton'
import { TRUCK_MAKES } from '@/lib/constants'
import { fetchTrucks, exportData, bulkTruckAction, type Truck } from '@/lib/api'
import { useDebounce } from '@/hooks/use-debounce'
import { useAuthStore } from '@/lib/store/auth'
import { TruckFormDialog } from './TruckFormDialog'
import { ImportCSVDialog } from '@/components/import-csv-dialog'
import { AssignDriverDialog } from './AssignDriverDialog'
import { TruckDetailSheet } from './TruckDetailSheet'
import { toast } from 'sonner'
import { useEntityHighlight } from '@/lib/hooks/useEntityHighlight'

const containerVariants = {
  show: { transition: { staggerChildren: 0.04 } },
}

const itemVariants = {
  show: { opacity: 1, y: 0 },
}

export function TrucksView() {
  const [search, setSearch] = React.useState('')
  const debouncedSearch = useDebounce(search, 300)
  const [statusFilter, setStatusFilter] = React.useState('all')
  const [makeFilter, setMakeFilter] = React.useState('all')
  const [formOpen, setFormOpen] = React.useState(false)
  const [detailOpen, setDetailOpen] = React.useState(false)
  const [selectedTruck, setSelectedTruck] = React.useState<string | null>(null)
  const [editTruck, setEditTruck] = React.useState<Truck | null>(null)
  const [assignTruckId, setAssignTruckId] = React.useState<string | null>(null)
  const [assignTruckPlate, setAssignTruckPlate] = React.useState<string | null>(null)
  const [assignDriverId, setAssignDriverId] = React.useState<string | null>(null)
  const [assignOpen, setAssignOpen] = React.useState(false)
  const [importOpen, setImportOpen] = React.useState(false)
  const [trucks, setTrucks] = React.useState<Truck[]>([])
  const [loading, setLoading] = React.useState(true)
  const [error, setError] = React.useState<string | null>(null)
  const [total, setTotal] = React.useState(0)
  const [page, setPage] = React.useState(1)
  const LIMIT = 20

  // Bulk selection state
  const [selectedIds, setSelectedIds] = React.useState<Set<string>>(new Set())
  const [bulkLoading, setBulkLoading] = React.useState(false)
  const [deleteDialogOpen, setDeleteDialogOpen] = React.useState(false)

  const { user } = useAuthStore()
  const canWrite = user?.role !== 'Driver'
  const { highlightEntityId, highlightClassName, scrollIntoView } = useEntityHighlight('truck')
  const rowRefs = React.useRef<Record<string, HTMLTableRowElement | null>>({})

  const totalPages = Math.ceil(total / LIMIT)

  const loadTrucks = React.useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const params: Parameters<typeof fetchTrucks>[0] = { page, limit: LIMIT }
      if (user?.role === 'Driver' && user.driverId) params.driverId = user.driverId
      if (debouncedSearch) params.search = debouncedSearch
      if (statusFilter !== 'all') params.status = statusFilter
      if (makeFilter !== 'all') params.make = makeFilter
      const result = await fetchTrucks(params)
      setTrucks(result.data)
      setTotal(result.total ?? 0)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to fetch trucks')
    } finally {
      setLoading(false)
    }
  }, [debouncedSearch, statusFilter, makeFilter, user, page])

  React.useEffect(() => {
    loadTrucks()
  }, [loadTrucks])

  // Reset to page 1 when filters change
  React.useEffect(() => {
    setPage(1)
  }, [debouncedSearch, statusFilter, makeFilter])

  // Clear selection when filters/page change or list refreshes
  React.useEffect(() => {
    setSelectedIds(new Set())
  }, [debouncedSearch, statusFilter, makeFilter, page])

  // Scroll to highlighted row after data loads
  React.useEffect(() => {
    if (highlightEntityId && !loading && rowRefs.current[highlightEntityId]) {
      scrollIntoView(rowRefs.current[highlightEntityId])
    }
  }, [highlightEntityId, loading, trucks, scrollIntoView])

  const handleTruckCreated = React.useCallback(() => {
    loadTrucks()
  }, [loadTrucks])

  const handleTruckUpdated = React.useCallback(() => {
    loadTrucks()
  }, [loadTrucks])

  const handleExport = React.useCallback(async () => {
    try {
      const filters: Record<string, string> = {}
      if (statusFilter !== 'all') filters.status = statusFilter
      if (makeFilter !== 'all') filters.make = makeFilter
      if (debouncedSearch) filters.search = debouncedSearch
      await exportData('trucks', filters)
      toast.success('Export completed successfully')
    } catch {
      toast.error('Failed to export data')
    }
  }, [statusFilter, makeFilter, debouncedSearch])

  const handleDriverAssigned = React.useCallback(() => {
    loadTrucks()
  }, [loadTrucks])

  const handleEditTruck = React.useCallback((truck: Truck) => {
    setEditTruck(truck)
    setFormOpen(true)
  }, [])

  const handleAssignDriver = React.useCallback((truck: Truck) => {
    setAssignTruckId(truck.id)
    setAssignTruckPlate(truck.plateNumber)
    setAssignDriverId(truck.driverId || null)
    setAssignOpen(true)
  }, [])

  // Toggle a single truck selection
  const toggleSelect = React.useCallback((id: string) => {
    setSelectedIds(prev => {
      const next = new Set(prev)
      if (next.has(id)) {
        next.delete(id)
      } else {
        next.add(id)
      }
      return next
    })
  }, [])

  // Toggle select all on current page
  const toggleSelectAll = React.useCallback(() => {
    if (selectedIds.size === trucks.length && trucks.every(t => selectedIds.has(t.id))) {
      setSelectedIds(new Set())
    } else {
      setSelectedIds(new Set(trucks.map(t => t.id)))
    }
  }, [trucks, selectedIds])

  const isAllSelected = trucks.length > 0 && trucks.every(t => selectedIds.has(t.id))
  const isSomeSelected = trucks.some(t => selectedIds.has(t.id)) && !isAllSelected

  // Clear selection
  const clearSelection = React.useCallback(() => {
    setSelectedIds(new Set())
  }, [])

  // Bulk actions
  const handleBulkAction = React.useCallback(async (action: 'activate' | 'deactivate' | 'delete') => {
    if (selectedIds.size === 0) return

    if (action === 'delete') {
      setDeleteDialogOpen(true)
      return
    }

    setBulkLoading(true)
    try {
      const result = await bulkTruckAction(action, Array.from(selectedIds))
      if (result.errors.length > 0) {
        const skippedMsg = result.errors.map(e => e.message).filter((m, i, arr) => arr.indexOf(m) === i).join('; ')
        toast.warning(`${result.success} truck(s) updated. ${result.failed} skipped: ${skippedMsg}`)
      } else {
        const actionLabel = action === 'activate' ? 'activated' : 'deactivated'
        toast.success(`${result.success} truck(s) ${actionLabel} successfully`)
      }
      setSelectedIds(new Set())
      loadTrucks()
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Bulk action failed')
    } finally {
      setBulkLoading(false)
    }
  }, [selectedIds, loadTrucks])

  // Bulk delete confirmation
  const handleBulkDelete = React.useCallback(async () => {
    setBulkLoading(true)
    try {
      const result = await bulkTruckAction('delete', Array.from(selectedIds))
      if (result.errors.length > 0) {
        const skippedMsg = result.errors.map(e => e.message).filter((m, i, arr) => arr.indexOf(m) === i).join('; ')
        toast.warning(`${result.success} truck(s) deleted. ${result.failed} skipped: ${skippedMsg}`)
      } else {
        toast.success(`${result.success} truck(s) deleted successfully`)
      }
      setSelectedIds(new Set())
      setDeleteDialogOpen(false)
      loadTrucks()
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to delete trucks')
    } finally {
      setBulkLoading(false)
    }
  }, [selectedIds, loadTrucks])

  return (
    <motion.div
      variants={containerVariants}
      animate="show"
      className="space-y-4 sm:space-y-6"
    >
      {/* Header */}
      <motion.div variants={itemVariants} className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Fleet Management</h1>
          <p className="text-muted-foreground">Manage all trucks in your fleet ({total} total)</p>
        </div>
        <div className="flex gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => setImportOpen(true)}
            className="gap-2 hidden sm:flex"
          >
            <Upload className="h-4 w-4" />
            Import CSV
          </Button>
          <Button variant="outline" size="sm" onClick={handleExport} className="gap-2 hidden sm:flex">
            <Download className="h-4 w-4" />
            Export CSV
          </Button>
          {canWrite && (
            <Button
              onClick={() => { setEditTruck(null); setFormOpen(true) }}
              className="bg-amber-500 hover:bg-amber-600 text-white"
            >
              <Plus className="mr-2 h-4 w-4" />
              Add Truck
            </Button>
          )}
        </div>
      </motion.div>

      {/* Filters */}
      <motion.div variants={itemVariants} className="flex flex-col sm:flex-row gap-3">
        <div className="relative flex-1">
          <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Search by plate number..."
            className="pl-8"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
        <Select value={statusFilter} onValueChange={setStatusFilter}>
          <SelectTrigger className="w-full sm:w-40">
            <SelectValue placeholder="Status" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Status</SelectItem>
            <SelectItem value="active">Active</SelectItem>
            <SelectItem value="maintenance">Maintenance</SelectItem>
            <SelectItem value="inactive">Inactive</SelectItem>
            <SelectItem value="decommissioned">Decommissioned</SelectItem>
          </SelectContent>
        </Select>
        <SearchableSelect
          className="w-full sm:w-44"
          placeholder="Make"
          searchPlaceholder="Search makes..."
          emptyMessage="No make found."
          value={makeFilter}
          onValueChange={setMakeFilter}
          options={[
            { value: 'all', label: 'All Makes' },
            ...TRUCK_MAKES.map((make): SearchableOption => ({ value: make, label: make })),
          ]}
        />
      </motion.div>

      {/* Bulk Action Toolbar */}
      {selectedIds.size > 0 && canWrite && (
        <motion.div
          initial={{ opacity: 0, y: -10 }}
          animate={{ opacity: 1, y: 0 }}
          className="sticky top-0 z-20 rounded-lg border bg-amber-50 dark:bg-amber-950/40 border-amber-200 dark:border-amber-800 p-3 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 shadow-sm"
        >
          <div className="flex items-center gap-3">
            <Badge variant="secondary" className="bg-amber-600 text-white hover:bg-amber-600 border-0 font-medium">
              {selectedIds.size} truck{selectedIds.size !== 1 ? 's' : ''} selected
            </Badge>
          </div>
          <div className="flex items-center gap-2 flex-wrap">
            <Button
              size="sm"
              variant="outline"
              className="gap-1.5 text-xs border-emerald-300 bg-white dark:bg-gray-900 hover:bg-emerald-50 dark:hover:bg-emerald-950/30"
              onClick={() => handleBulkAction('activate')}
              disabled={bulkLoading}
            >
              <CheckCircle2 className="h-3.5 w-3.5 text-emerald-600" />
              Activate
            </Button>
            <Button
              size="sm"
              variant="outline"
              className="gap-1.5 text-xs border-gray-300 bg-white dark:bg-gray-900 hover:bg-gray-50 dark:hover:bg-gray-800"
              onClick={() => handleBulkAction('deactivate')}
              disabled={bulkLoading}
            >
              <XCircle className="h-3.5 w-3.5 text-gray-500" />
              Deactivate
            </Button>
            <Button
              size="sm"
              variant="outline"
              className="gap-1.5 text-xs border-red-300 bg-white dark:bg-gray-900 hover:bg-red-50 dark:hover:bg-red-950/30 text-red-600"
              onClick={() => handleBulkAction('delete')}
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
              <Button variant="outline" size="sm" onClick={loadTrucks}>
                <RefreshCw className="mr-2 h-3 w-3" /> Retry
              </Button>
            </div>
          ) : loading ? (
            <div className="p-4 space-y-3">
              {[1, 2, 3, 4].map(i => (
                <Skeleton key={i} className="h-12 w-full rounded" />
              ))}
            </div>
          ) : trucks.length === 0 ? (
            <EmptyState
              icon={Truck}
              title="No trucks found"
              description={search || statusFilter !== 'all' || makeFilter !== 'all'
                ? 'Try adjusting your search or filter criteria'
                : 'Get started by adding your first truck to the fleet'
              }
              action={!search && statusFilter === 'all' && makeFilter === 'all' && canWrite ? {
                label: 'Add Truck',
                onClick: () => setFormOpen(true),
              } : undefined}
            />
          ) : (
            <>
            {/* Desktop Table */}
            <div className="hidden md:block overflow-x-auto max-h-[500px] overflow-y-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    {canWrite && (
                      <TableHead className="w-10">
                        <Checkbox
                          checked={isAllSelected ? true : isSomeSelected ? 'indeterminate' : false}
                          onCheckedChange={toggleSelectAll}
                          aria-label="Select all trucks"
                        />
                      </TableHead>
                    )}
                    <TableHead>Plate Number</TableHead>
                    <TableHead className="hidden md:table-cell">Make / Model</TableHead>
                    <TableHead className="hidden lg:table-cell">Driver</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead className="hidden sm:table-cell">Mileage</TableHead>
                    <TableHead className="hidden lg:table-cell">Insurance</TableHead>
                    <TableHead className="hidden xl:table-cell">Next Service</TableHead>
                    <TableHead className="text-right">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {trucks.map((truck) => (
                    <TableRow key={truck.id} ref={(el) => { rowRefs.current[truck.id] = el }} className={`group ${selectedIds.has(truck.id) ? 'bg-amber-50 dark:bg-amber-950/20' : ''}${truck.id === highlightEntityId ? ' ' + highlightClassName : ''}`}>
                      {canWrite && (
                        <TableCell>
                          <Checkbox
                            checked={selectedIds.has(truck.id)}
                            onCheckedChange={() => toggleSelect(truck.id)}
                            aria-label={`Select ${truck.plateNumber}`}
                          />
                        </TableCell>
                      )}
                      <TableCell>
                        <div className="flex items-center gap-2">
                          <div className="rounded bg-amber-100 dark:bg-amber-900/30 p-1">
                            <Truck className="h-3.5 w-3.5 text-amber-600 dark:text-amber-400" />
                          </div>
                          <span className="font-semibold text-sm">{truck.plateNumber}</span>
                        </div>
                      </TableCell>
                      <TableCell className="hidden md:table-cell text-sm">
                        {truck.make} {truck.model}
                        <span className="text-muted-foreground ml-1">({truck.year})</span>
                      </TableCell>
                      <TableCell className="hidden lg:table-cell text-sm">
                        {truck.driver ? (
                          `${truck.driver.firstName} ${truck.driver.lastName}`
                        ) : (
                          <span className="text-muted-foreground italic">Unassigned</span>
                        )}
                      </TableCell>
                      <TableCell>
                        <StatusBadge status={truck.status} variant="truck" />
                      </TableCell>
                      <TableCell className="hidden sm:table-cell text-sm">
                        {Math.round(truck.currentMileage).toLocaleString()} km
                      </TableCell>
                      <TableCell className="hidden lg:table-cell">
                        <StatusBadge
                          status={truck.insuranceStatus}
                          variant={truck.insuranceStatus === 'active' ? 'truck' : 'trip'}
                        />
                      </TableCell>
                      <TableCell className="hidden xl:table-cell text-sm text-muted-foreground">
                        {truck.nextServiceDate
                          ? new Date(truck.nextServiceDate).toLocaleDateString()
                          : '-'}
                      </TableCell>
                      <TableCell className="text-right">
                        <div className="flex items-center justify-end gap-1">
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-8 w-8"
                            onClick={() => {
                              setSelectedTruck(truck.id)
                              setDetailOpen(true)
                            }}
                          >
                            <Eye className="h-3.5 w-3.5" />
                          </Button>
                          {canWrite && (
                            <>
                              <Button
                                variant="ghost"
                                size="icon"
                                className="h-8 w-8"
                                onClick={() => handleEditTruck(truck)}
                              >
                                <Pencil className="h-3.5 w-3.5" />
                              </Button>
                              <Button
                                variant="ghost"
                                size="icon"
                                className="h-8 w-8"
                                onClick={() => handleAssignDriver(truck)}
                              >
                                <UserPlus className="h-3.5 w-3.5" />
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
                {trucks.map((truck) => (
                  <div
                    key={truck.id}
                    className={`mobile-card p-4 space-y-3${selectedIds.has(truck.id) ? ' bg-amber-50 dark:bg-amber-950/20' : ''}${truck.id === highlightEntityId ? ' ' + highlightClassName : ''}`}
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <p className="font-semibold text-sm">{truck.plateNumber}</p>
                        <p className="text-xs text-muted-foreground">
                          {truck.make} {truck.model} ({truck.year})
                        </p>
                      </div>
                      <div className="flex items-center gap-2 shrink-0">
                        <StatusBadge status={truck.status} variant="truck" />
                        {canWrite && (
                          <Checkbox
                            checked={selectedIds.has(truck.id)}
                            onCheckedChange={() => toggleSelect(truck.id)}
                            aria-label={`Select ${truck.plateNumber}`}
                          />
                        )}
                      </div>
                    </div>
                    <div className="flex items-center justify-between text-sm">
                      <div>
                        <p className="text-muted-foreground text-xs">Driver</p>
                        <p className="text-sm">
                          {truck.driver
                            ? `${truck.driver.firstName} ${truck.driver.lastName}`
                            : 'Unassigned'}
                        </p>
                      </div>
                      <div className="text-right">
                        <p className="text-muted-foreground text-xs">Mileage</p>
                        <p className="text-sm font-medium">{Math.round(truck.currentMileage).toLocaleString()} km</p>
                      </div>
                      <div className="text-right">
                        <p className="text-muted-foreground text-xs">Insurance</p>
                        <StatusBadge
                          status={truck.insuranceStatus}
                          variant={truck.insuranceStatus === 'active' ? 'truck' : 'trip'}
                        />
                      </div>
                    </div>
                    <div className="flex items-center gap-2 pt-1">
                      <Button
                        variant="outline"
                        size="sm"
                        className="min-h-[44px] flex-1 text-xs"
                        onClick={() => {
                          setSelectedTruck(truck.id)
                          setDetailOpen(true)
                        }}
                      >
                        <Eye className="mr-1 h-3 w-3" />
                        View Details
                      </Button>
                      {canWrite && (
                        <>
                          <Button
                            variant="outline"
                            size="sm"
                            className="min-h-[44px] flex-1 text-xs"
                            onClick={() => handleEditTruck(truck)}
                          >
                            <Pencil className="mr-1 h-3 w-3" />
                            Edit
                          </Button>
                          <Button
                            variant="outline"
                            size="sm"
                            className="min-h-[44px] flex-1 text-xs"
                            onClick={() => handleAssignDriver(truck)}
                          >
                            <UserPlus className="mr-1 h-3 w-3" />
                            Assign Driver
                          </Button>
                        </>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </>
          )}
        </div>
        {totalPages > 1 && (
          <div className="flex items-center justify-between pt-4">
            <p className="text-sm text-muted-foreground">
              Showing {((page - 1) * LIMIT) + 1}–{Math.min(page * LIMIT, total)} of {total}
            </p>
            <div className="flex items-center gap-2">
              <Button variant="outline" size="sm" disabled={page <= 1} onClick={() => setPage(p => p - 1)}>
                Previous
              </Button>
              <span className="text-sm text-muted-foreground">Page {page} of {totalPages}</span>
              <Button variant="outline" size="sm" disabled={page >= totalPages} onClick={() => setPage(p => p + 1)}>
                Next
              </Button>
            </div>
          </div>
        )}
      </motion.div>

      <TruckFormDialog
        open={formOpen}
        onOpenChange={(open) => {
          setFormOpen(open)
          if (!open) setEditTruck(null)
        }}
        onCreated={handleTruckCreated}
        onUpdated={handleTruckUpdated}
        truck={editTruck}
      />
      <AssignDriverDialog
        open={assignOpen}
        onOpenChange={setAssignOpen}
        truckId={assignTruckId}
        truckPlateNumber={assignTruckPlate}
        currentDriverId={assignDriverId}
        onAssigned={handleDriverAssigned}
      />
      <TruckDetailSheet
        open={detailOpen}
        onOpenChange={setDetailOpen}
        truckId={selectedTruck}
      />

      <ImportCSVDialog
        open={importOpen}
        onOpenChange={setImportOpen}
        type="trucks"
        label="Trucks"
        onSuccess={loadTrucks}
      />

      {/* Delete Confirmation Dialog */}
      <AlertDialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete {selectedIds.size} truck{selectedIds.size > 1 ? 's' : ''}?</AlertDialogTitle>
            <AlertDialogDescription>
              This will permanently decommission {selectedIds.size} truck{selectedIds.size > 1 ? 's' : ''}. Trucks with active trips will be skipped. This action cannot be undone.
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
    </motion.div>
  )
}
