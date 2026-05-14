'use client'

import * as React from 'react'
import { motion } from 'framer-motion'
import { Plus, Search, Eye, Pencil, Star, Phone, Users, AlertCircle, RefreshCw, ShieldCheck, Download, Upload, X, CheckCircle2, XCircle, Trash2 } from 'lucide-react'
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
import { Card, CardContent } from '@/components/ui/card'
import { Avatar, AvatarFallback } from '@/components/ui/avatar'
import { Badge } from '@/components/ui/badge'
import { Checkbox } from '@/components/ui/checkbox'
import { StatusBadge } from '@/components/ui/status-badge'
import { EmptyState } from '@/components/ui/empty-state'
import { Skeleton } from '@/components/ui/skeleton'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { fetchDrivers, exportData, bulkDriverAction, type Driver } from '@/lib/api'
import { useDebounce } from '@/hooks/use-debounce'
import { useAuthStore } from '@/lib/store/auth'
import { DriverDetailSheet } from '@/components/drivers/DriverDetailSheet'
import { DriverFormDialog } from '@/components/drivers/DriverFormDialog'
import { ImportCSVDialog } from '@/components/import-csv-dialog'
import { DriverVerificationDialog } from '@/components/drivers/DriverVerificationDialog'
import { toast } from 'sonner'
import { useEntityHighlight } from '@/lib/hooks/useEntityHighlight'

const containerVariants = {
  show: { transition: { staggerChildren: 0.04 } },
}

const itemVariants = {
  show: { opacity: 1, y: 0 },
}

function StarRating({ rating }: { rating: number }) {
  return (
    <div className="flex items-center gap-0.5">
      {[1, 2, 3, 4, 5].map((star) => (
        <Star
          key={star}
          className={`h-3 w-3 ${
            star <= Math.round(rating)
              ? 'fill-amber-400 text-amber-400'
              : 'text-gray-300 dark:text-gray-600'
          }`}
        />
      ))}
      <span className="text-xs text-muted-foreground ml-1">{rating.toFixed(1)}</span>
    </div>
  )
}

export function DriversView() {
  const [search, setSearch] = React.useState('')
  const debouncedSearch = useDebounce(search, 300)
  const [statusFilter, setStatusFilter] = React.useState('all')
  const [drivers, setDrivers] = React.useState<Driver[]>([])
  const [loading, setLoading] = React.useState(true)
  const [error, setError] = React.useState<string | null>(null)
  const [total, setTotal] = React.useState(0)
  const [page, setPage] = React.useState(1)
  const LIMIT = 20
  const [selectedDriverId, setSelectedDriverId] = React.useState<string | null>(null)
  const [detailOpen, setDetailOpen] = React.useState(false)
  const [formOpen, setFormOpen] = React.useState(false)
  const [editingDriver, setEditingDriver] = React.useState<Driver | null>(null)
  const [verifyDriverId, setVerifyDriverId] = React.useState<string | null>(null)
  const [verifyDialogOpen, setVerifyDialogOpen] = React.useState(false)
  const [importOpen, setImportOpen] = React.useState(false)

  // Bulk selection state
  const [selectedIds, setSelectedIds] = React.useState<Set<string>>(new Set())
  const [bulkLoading, setBulkLoading] = React.useState(false)
  const [deleteDialogOpen, setDeleteDialogOpen] = React.useState(false)

  const { user } = useAuthStore()
  const canWrite = user?.role !== 'Driver'
  const { highlightEntityId, highlightClassName, scrollIntoView } = useEntityHighlight('driver')
  const rowRefs = React.useRef<Record<string, HTMLDivElement | null>>({})

  const totalPages = Math.ceil(total / LIMIT)

  const loadDrivers = React.useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const params: Parameters<typeof fetchDrivers>[0] = { page, limit: LIMIT }
      if (debouncedSearch) params.search = debouncedSearch
      if (statusFilter !== 'all') params.status = statusFilter
      const result = await fetchDrivers(params)
      setDrivers(result.data)
      setTotal(result.total ?? 0)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to fetch drivers')
    } finally {
      setLoading(false)
    }
  }, [debouncedSearch, statusFilter, page])

  const handleExport = React.useCallback(async () => {
    try {
      const filters: Record<string, string> = {}
      if (statusFilter !== 'all') filters.status = statusFilter
      if (debouncedSearch) filters.search = debouncedSearch
      await exportData('drivers', filters)
      toast.success('Export completed successfully')
    } catch {
      toast.error('Failed to export data')
    }
  }, [statusFilter, debouncedSearch])

  React.useEffect(() => {
    loadDrivers()
  }, [loadDrivers])

  // Reset to page 1 when filters change
  React.useEffect(() => {
    setPage(1)
  }, [debouncedSearch, statusFilter])

  // Clear selection when filters/page change or list refreshes
  React.useEffect(() => {
    setSelectedIds(new Set())
  }, [debouncedSearch, statusFilter, page])

  // Scroll to highlighted row after data loads
  React.useEffect(() => {
    if (highlightEntityId && !loading && rowRefs.current[highlightEntityId]) {
      scrollIntoView(rowRefs.current[highlightEntityId])
    }
  }, [highlightEntityId, loading, drivers, scrollIntoView])

  // Toggle a single driver selection
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

  // Clear selection
  const clearSelection = React.useCallback(() => {
    setSelectedIds(new Set())
  }, [])

  // Bulk actions
  const handleBulkAction = React.useCallback(async (action: 'activate' | 'deactivate' | 'delete' | 'verify') => {
    if (selectedIds.size === 0) return

    if (action === 'delete') {
      setDeleteDialogOpen(true)
      return
    }

    setBulkLoading(true)
    try {
      const result = await bulkDriverAction(action, Array.from(selectedIds))
      if (result.errors.length > 0) {
        const skippedMsg = result.errors.map(e => e.message).filter((m, i, arr) => arr.indexOf(m) === i).join('; ')
        toast.warning(`${result.success} driver(s) updated. ${result.failed} skipped: ${skippedMsg}`)
      } else {
        const actionLabels: Record<string, string> = {
          activate: 'activated',
          deactivate: 'deactivated',
          verify: 'verified',
        }
        toast.success(`${result.success} driver(s) ${actionLabels[action]} successfully`)
      }
      setSelectedIds(new Set())
      loadDrivers()
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Bulk action failed')
    } finally {
      setBulkLoading(false)
    }
  }, [selectedIds, loadDrivers])

  // Bulk delete confirmation
  const handleBulkDelete = React.useCallback(async () => {
    setBulkLoading(true)
    try {
      const result = await bulkDriverAction('delete', Array.from(selectedIds))
      if (result.errors.length > 0) {
        const skippedMsg = result.errors.map(e => e.message).filter((m, i, arr) => arr.indexOf(m) === i).join('; ')
        toast.warning(`${result.success} driver(s) deleted. ${result.failed} skipped: ${skippedMsg}`)
      } else {
        toast.success(`${result.success} driver(s) deleted successfully`)
      }
      setSelectedIds(new Set())
      setDeleteDialogOpen(false)
      loadDrivers()
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to delete drivers')
    } finally {
      setBulkLoading(false)
    }
  }, [selectedIds, loadDrivers])

  return (
    <motion.div
      variants={containerVariants}
      animate="show"
      className="space-y-4 sm:space-y-6"
    >
      {/* Header */}
      <motion.div variants={itemVariants} className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Driver Management</h1>
          <p className="text-muted-foreground">Manage your team of professional drivers</p>
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
          {canWrite && (
            <Button
              onClick={() => {
                setEditingDriver(null)
                setFormOpen(true)
              }}
              className="bg-amber-500 hover:bg-amber-600 text-white"
            >
              <Plus className="mr-2 h-4 w-4" />
              Add Driver
            </Button>
          )}
        </div>
      </motion.div>

      {/* Filters */}
      <motion.div variants={itemVariants} className="flex flex-col sm:flex-row gap-3">
        <div className="relative flex-1">
          <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Search by name, phone, or license #..."
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
            <SelectItem value="inactive">Inactive</SelectItem>
            <SelectItem value="suspended">Suspended</SelectItem>
          </SelectContent>
        </Select>
        {canWrite && (
          <Button
            variant="outline"
            size="sm"
            className="gap-2 sm:self-end"
            onClick={() => {
              if (selectedIds.size === drivers.length && drivers.length > 0) {
                setSelectedIds(new Set())
              } else {
                setSelectedIds(new Set(drivers.map(d => d.id)))
              }
            }}
            disabled={loading || drivers.length === 0}
          >
            {selectedIds.size === drivers.length && drivers.length > 0 ? (
              <>
                <X className="h-4 w-4" />
                Deselect All
              </>
            ) : (
              <>
                <CheckCircle2 className="h-4 w-4" />
                Select All
              </>
            )}
          </Button>
        )}
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
              {selectedIds.size} driver{selectedIds.size !== 1 ? 's' : ''} selected
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
              className="gap-1.5 text-xs border-sky-300 bg-white dark:bg-gray-900 hover:bg-sky-50 dark:hover:bg-sky-950/30 text-sky-600"
              onClick={() => handleBulkAction('verify')}
              disabled={bulkLoading}
            >
              <ShieldCheck className="h-3.5 w-3.5" />
              Verify
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

      {/* Driver Cards Grid */}
      <motion.div variants={itemVariants}>
        {error ? (
          <div className="flex flex-col items-center justify-center py-12 text-center">
            <AlertCircle className="h-8 w-8 text-red-500 mb-3" />
            <p className="text-sm text-muted-foreground mb-3">{error}</p>
            <Button variant="outline" size="sm" onClick={loadDrivers}>
              <RefreshCw className="mr-2 h-3 w-3" /> Retry
            </Button>
          </div>
        ) : loading ? (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {[1, 2, 3, 4, 5, 6].map(i => (
              <Card key={i}>
                <CardContent className="p-5">
                  <div className="flex items-start gap-3 mb-4">
                    <Skeleton className="h-11 w-11 rounded-full" />
                    <div className="flex-1">
                      <Skeleton className="h-4 w-28 mb-2" />
                      <Skeleton className="h-3 w-24" />
                    </div>
                  </div>
                  <div className="space-y-2">
                    {[1, 2, 3, 4].map(j => (
                      <Skeleton key={j} className="h-4 w-full" />
                    ))}
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        ) : drivers.length === 0 ? (
          <EmptyState
            icon={Users}
            title="No drivers found"
            description={search || statusFilter !== 'all'
              ? 'Try adjusting your search or filter criteria'
              : 'Get started by adding your first driver'
            }
          />
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 max-h-[600px] overflow-y-auto pr-1">
            {drivers.map((driver) => (
              <motion.div
                key={driver.id}
                whileHover={{ scale: 1.01 }}
                whileTap={{ scale: 0.99 }}
              >
                <Card ref={(el) => { rowRefs.current[driver.id] = el }} className={`hover:shadow-md transition-shadow relative ${selectedIds.has(driver.id) ? 'ring-2 ring-amber-500 bg-amber-50/50 dark:bg-amber-950/20' : ''}${driver.id === highlightEntityId ? ' ' + highlightClassName : ''}`}>
                  {canWrite && (
                    <div className="absolute top-3 right-3 z-10">
                      <Checkbox
                        checked={selectedIds.has(driver.id)}
                        onCheckedChange={() => toggleSelect(driver.id)}
                        className="border-2 data-[state=checked]:bg-amber-600 data-[state=checked]:border-amber-600"
                        aria-label={`Select ${driver.firstName} ${driver.lastName}`}
                      />
                    </div>
                  )}
                  <CardContent className="p-4 sm:p-5">
                    <div className="flex items-start gap-3">
                      <Avatar className="h-11 w-11">
                        {driver.photo ? (
                          <img src={driver.photo} alt="" className="h-full w-full object-cover" />
                        ) : (
                          <AvatarFallback className="bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400 text-sm font-bold">
                            {driver.firstName[0]}{driver.lastName[0]}
                          </AvatarFallback>
                        )}
                      </Avatar>
                      <div className="flex-1 min-w-0 pr-8">
                        <div className="flex items-center justify-between gap-2">
                          <h3 className="font-semibold text-sm truncate">
                            {driver.firstName} {driver.lastName}
                          </h3>
                          <StatusBadge status={driver.status} variant="truck" />
                        </div>
                        <div className="flex items-center gap-1.5 mt-0.5 text-xs text-muted-foreground">
                          <Phone className="h-3 w-3" />
                          {driver.phone}
                        </div>
                      </div>
                    </div>

                    <div className="mt-3 space-y-2">
                      <div className="flex items-center justify-between text-xs">
                        <span className="text-muted-foreground">License</span>
                        <span className="font-medium">{driver.licenseNumber}</span>
                      </div>
                      <div className="flex items-center justify-between text-xs">
                        <span className="text-muted-foreground">Employee ID</span>
                        <span className="font-medium">{driver.employeeId || '—'}</span>
                      </div>
                      {driver.verificationStatus && (
                      <div className="flex items-center justify-between text-xs">
                        <span className="text-muted-foreground">Verification</span>
                        <Badge variant="outline" className={`text-[10px] border-transparent font-medium ${
                          driver.verificationStatus === 'verified'
                            ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400'
                            : driver.verificationStatus === 'submitted'
                              ? 'bg-sky-100 text-sky-700 dark:bg-sky-900/30 dark:text-sky-400'
                              : driver.verificationStatus === 'rejected'
                                ? 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400'
                                : 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400'
                        }`}>
                          {driver.verificationStatus.charAt(0).toUpperCase() + driver.verificationStatus.slice(1)}
                        </Badge>
                      </div>
                      )}
                      {!driver.verificationStatus && (
                      <div className="flex items-center justify-between text-xs">
                        <span className="text-muted-foreground">Verification</span>
                        <Badge variant="outline" className="text-[10px] border-transparent font-medium bg-gray-100 text-gray-500 dark:bg-gray-800 dark:text-gray-400">
                          Not Set
                        </Badge>
                      </div>
                      )}
                      <div className="flex items-center justify-between text-xs">
                        <span className="text-muted-foreground">Rating</span>
                        <StarRating rating={driver.rating} />
                      </div>
                      <div className="flex items-center justify-between text-xs">
                        <span className="text-muted-foreground">Total Trips</span>
                        <span className="font-medium">{driver.totalTrips}</span>
                      </div>
                      {/* Account Status */}
                      <div className="flex items-center justify-between text-xs">
                        <span className="text-muted-foreground">Login Account</span>
                        {driver.user ? (
                          <Badge variant="outline" className={`text-[10px] border-transparent font-medium ${
                            driver.user.isActive
                              ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400'
                              : 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400'
                          }`}>
                            {driver.user.isActive ? 'Active' : 'Inactive'}
                          </Badge>
                        ) : (
                          <Badge variant="outline" className="text-[10px] border-transparent font-medium bg-gray-100 text-gray-500 dark:bg-gray-800 dark:text-gray-400">
                            No account
                          </Badge>
                        )}
                      </div>
                      <div className="flex items-center justify-between text-xs">
                        <span className="text-muted-foreground">Assigned Truck</span>
                        <span className="font-medium">
                          {driver.trucks.length > 0 ? (
                            driver.trucks[0].plateNumber
                          ) : (
                            <span className="text-muted-foreground italic">None</span>
                          )}
                        </span>
                      </div>
                    </div>

                    <div className="flex gap-2 mt-4 pt-3 border-t">
                      <Button
                        variant="outline"
                        size="sm"
                        className="flex-1 h-8 text-xs"
                        onClick={() => {
                          setSelectedDriverId(driver.id)
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
                            className="flex-1 h-8 text-xs"
                            onClick={() => {
                              setVerifyDriverId(driver.id)
                              setVerifyDialogOpen(true)
                            }}
                          >
                            <ShieldCheck className="mr-1 h-3 w-3" />
                            Verify
                          </Button>
                          <Button
                            variant="outline"
                            size="sm"
                            className="flex-1 h-8 text-xs"
                            onClick={() => {
                              setEditingDriver(driver)
                              setFormOpen(true)
                            }}
                          >
                            <Pencil className="mr-1 h-3 w-3" />
                            Edit
                          </Button>
                        </>
                      )}
                    </div>
                  </CardContent>
                </Card>
              </motion.div>
            ))}
          </div>
        )}
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

      <DriverDetailSheet
        open={detailOpen}
        onOpenChange={setDetailOpen}
        driverId={selectedDriverId}
      />

      <DriverFormDialog
        open={formOpen}
        onOpenChange={(open) => {
          setFormOpen(open)
          if (!open) setEditingDriver(null)
        }}
        driver={editingDriver}
        onCreated={loadDrivers}
        onUpdated={loadDrivers}
      />

      <DriverVerificationDialog
        open={verifyDialogOpen}
        onOpenChange={(open) => {
          setVerifyDialogOpen(open)
          if (!open) setVerifyDriverId(null)
        }}
        driverId={verifyDriverId}
        onVerified={loadDrivers}
      />

      <ImportCSVDialog
        open={importOpen}
        onOpenChange={setImportOpen}
        type="drivers"
        label="Drivers"
        onSuccess={loadDrivers}
      />

      {/* Delete Confirmation Dialog */}
      <AlertDialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete {selectedIds.size} driver{selectedIds.size > 1 ? 's' : ''}?</AlertDialogTitle>
            <AlertDialogDescription>
              This will permanently deactivate {selectedIds.size} driver{selectedIds.size > 1 ? 's' : ''}. Drivers with active trips will be skipped. This action cannot be undone.
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
