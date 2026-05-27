'use client'

import * as React from 'react'
import { motion } from 'framer-motion'
import {
  Warehouse, Plus, Search, Filter, RefreshCw, Loader2, Clock, CheckCircle2,
  PlayCircle, XCircle, ChevronDown, MapPin, DollarSign, TrendingUp, Truck,
  User, Eye, Trash2, ArrowDownToLine, ArrowUpFromLine, Hash, CalendarClock,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Skeleton } from '@/components/ui/skeleton'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { EmptyState } from '@/components/ui/empty-state'
import { StatsCard } from '@/components/ui/stats-card'
import {
  Dialog, DialogBody, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter,
} from '@/components/ui/dialog'
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from '@/components/ui/alert-dialog'
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select'
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table'
import { SearchableSelect } from '@/components/ui/searchable-select'
import {
  fetchDepotQueue, createDepotQueue, updateDepotQueue, deleteDepotQueue,
  type DepotQueue, type DepotQueueSummary,
} from '@/lib/api'
import { apiFetch, fetchTrucks, fetchDrivers, type Truck, type Driver, type Trip } from '@/lib/api'
import { toast } from 'sonner'

// ==================== TYPES & CONSTANTS ====================

const STATUS_CONFIG: Record<string, { label: string; color: string }> = {
  waiting: { label: 'Waiting', color: 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400' },
  in_progress: { label: 'In Progress', color: 'bg-sky-100 text-sky-700 dark:bg-sky-900/30 dark:text-sky-400' },
  completed: { label: 'Completed', color: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400' },
  cancelled: { label: 'Cancelled', color: 'bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-400' },
}

const DEPOT_OPTIONS = [
  { value: 'Tema', label: 'Tema', description: 'Tema Depot / Port' },
  { value: 'Kumasi', label: 'Kumasi', description: 'Kumasi Depot' },
  { value: 'Takoradi', label: 'Takoradi', description: 'Takoradi Depot / Port' },
  { value: 'Tamale', label: 'Tamale', description: 'Tamale Depot' },
  { value: 'Accra', label: 'Accra', description: 'Accra Depot' },
]

const QUEUE_TYPE_OPTIONS = [
  { value: 'loading', label: 'Loading' },
  { value: 'unloading', label: 'Unloading' },
]

const containerVariants = {
  show: { transition: { staggerChildren: 0.04 } },
}
const itemVariants = {
  show: { opacity: 1, y: 0 },
  hidden: { opacity: 0, y: 12 },
}

// ==================== HELPERS ====================

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

function formatWait(minutes: number | null | undefined): string {
  if (!minutes && minutes !== 0) return '—'
  if (minutes < 60) return `${minutes}m`
  const h = Math.floor(minutes / 60)
  const m = minutes % 60
  return m > 0 ? `${h}h ${m}m` : `${h}h`
}

// ==================== FORM DIALOG ====================

function DepotQueueFormDialog({
  open, onOpenChange, onCreated, editing, onUpdated,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  onCreated: () => void
  editing: DepotQueue | null
  onUpdated: () => void
}) {
  const [trucks, setTrucks] = React.useState<Truck[]>([])
  const [drivers, setDrivers] = React.useState<Driver[]>([])
  const [trips, setTrips] = React.useState<Trip[]>([])

  const [truckId, setTruckId] = React.useState('')
  const [driverId, setDriverId] = React.useState('')
  const [tripId, setTripId] = React.useState('')
  const [depotName, setDepotName] = React.useState('')
  const [queueType, setQueueType] = React.useState('')
  const [estimatedWait, setEstimatedWait] = React.useState('')
  const [notes, setNotes] = React.useState('')
  const [submitting, setSubmitting] = React.useState(false)

  React.useEffect(() => {
    if (open) {
      fetchTrucks({ status: 'active', limit: 200 }).then(r => setTrucks(r.data || [])).catch(() => {})
      fetchDrivers({ status: 'active', limit: 200 }).then(r => setDrivers(r.data || [])).catch(() => {})

      if (editing) {
        setTruckId(editing.truckId)
        setDriverId(editing.driverId || '')
        setTripId(editing.tripId || '')
        setDepotName(editing.depotName)
        setQueueType(editing.queueType)
        setEstimatedWait(editing.estimatedWait ? String(editing.estimatedWait) : '')
        setNotes(editing.notes || '')
      } else {
        setTruckId('')
        setDriverId('')
        setTripId('')
        setDepotName('')
        setQueueType('')
        setEstimatedWait('')
        setNotes('')
      }
    }
  }, [open, editing])

  React.useEffect(() => {
    if (driverId) {
      apiFetch<{ data: Trip[] }>('/api/trips?status=in_transit&limit=100')
        .then(res => setTrips(res.data || []))
        .catch(() => setTrips([]))
    } else {
      setTrips([])
    }
  }, [driverId])

  const truckOptions = React.useMemo(() => trucks.map(t => ({
    value: t.id, label: `${t.plateNumber} — ${t.make} ${t.model}`,
  })), [trucks])

  const driverOptions = React.useMemo(() => drivers.map(d => ({
    value: d.id, label: `${d.firstName} ${d.lastName}`, description: d.phone,
  })), [drivers])

  const tripOptions = React.useMemo(() => trips
    .filter(t => !t.driverId || t.driverId === driverId)
    .map(t => ({
      value: t.id, label: t.tripNumber, description: `${t.loadingLocation} → ${t.destination}`,
    })), [trips, driverId])

  async function handleSubmit() {
    if (!truckId || !depotName || !queueType) {
      toast.error('Truck, depot, and queue type are required')
      return
    }
    setSubmitting(true)
    try {
      const payload: Record<string, unknown> = {
        truckId,
        driverId: driverId || undefined,
        tripId: tripId || undefined,
        depotName,
        queueType,
        estimatedWait: estimatedWait ? parseInt(estimatedWait) : undefined,
        notes: notes || undefined,
      }
      if (editing) {
        await updateDepotQueue(editing.id, payload)
        toast.success('Depot queue updated')
        onUpdated()
      } else {
        await createDepotQueue(payload)
        toast.success('Added to depot queue')
        onCreated()
      }
      onOpenChange(false)
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to save')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Warehouse className="h-5 w-5 text-amber-500" />
            {editing ? 'Edit Queue Entry' : 'Add to Depot Queue'}
          </DialogTitle>
          <DialogDescription>
            {editing ? 'Update depot queue details.' : 'Add a truck to the depot queue.'}
          </DialogDescription>
        </DialogHeader>

        <DialogBody className="space-y-4 py-2">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div className="space-y-2">
              <Label className="text-sm font-medium">Truck *</Label>
              <SearchableSelect options={truckOptions} value={truckId} onValueChange={setTruckId} placeholder="Select truck..." emptyMessage="No trucks found" searchPlaceholder="Search trucks..." />
            </div>
            <div className="space-y-2">
              <Label className="text-sm font-medium">Driver</Label>
              <SearchableSelect options={driverOptions} value={driverId} onValueChange={setDriverId} placeholder="Optional" emptyMessage="No drivers found" searchPlaceholder="Search drivers..." alwaysSearchable />
            </div>
          </div>

          <div className="space-y-2">
            <Label className="text-sm font-medium">Trip (optional)</Label>
            <SearchableSelect options={tripOptions} value={tripId} onValueChange={setTripId} placeholder="Link to trip..." emptyMessage="No active trips" searchPlaceholder="Search trips..." />
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div className="space-y-2">
              <Label className="text-sm font-medium">Depot *</Label>
              <Select value={depotName} onValueChange={setDepotName}>
                <SelectTrigger><SelectValue placeholder="Select depot..." /></SelectTrigger>
                <SelectContent>
                  {DEPOT_OPTIONS.map(d => (
                    <SelectItem key={d.value} value={d.value}>{d.label} — {d.description}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label className="text-sm font-medium">Queue Type *</Label>
              <Select value={queueType} onValueChange={setQueueType}>
                <SelectTrigger><SelectValue placeholder="Select type..." /></SelectTrigger>
                <SelectContent>
                  {QUEUE_TYPE_OPTIONS.map(q => (
                    <SelectItem key={q.value} value={q.value}>
                      <span className="flex items-center gap-1.5">
                        {q.value === 'loading' ? <ArrowUpFromLine className="h-3.5 w-3.5" /> : <ArrowDownToLine className="h-3.5 w-3.5" />}
                        {q.label}
                      </span>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="space-y-2">
            <Label className="text-sm font-medium">Est. Wait (minutes)</Label>
            <Input type="number" value={estimatedWait} onChange={e => setEstimatedWait(e.target.value)} placeholder="e.g. 60" min="0" />
          </div>

          <div className="space-y-2">
            <Label className="text-sm font-medium">Notes</Label>
            <Textarea value={notes} onChange={e => setNotes(e.target.value)} placeholder="Additional notes..." rows={3} />
          </div>
        </DialogBody>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button
            onClick={handleSubmit}
            disabled={!truckId || !depotName || !queueType || submitting}
            className="bg-amber-500 hover:bg-amber-600 text-white"
          >
            {submitting ? <><Loader2 className="mr-2 h-4 w-4 animate-spin" />Saving...</> : <><Plus className="mr-2 h-4 w-4" />{editing ? 'Update' : 'Add to Queue'}</>}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

// ==================== DETAIL DIALOG ====================

function DetailDialog({
  entry, open, onOpenChange, onStatusChange, onDelete,
}: {
  entry: DepotQueue | null
  open: boolean
  onOpenChange: (open: boolean) => void
  onStatusChange: (id: string, status: string) => void
  onDelete: (id: string) => void
}) {
  const [actionLoading, setActionLoading] = React.useState(false)
  const [deleteDialogOpen, setDeleteDialogOpen] = React.useState(false)

  if (!entry) return null

  const sc = STATUS_CONFIG[entry.status] || STATUS_CONFIG.waiting

  async function handleStatusChange(newStatus: string) {
    setActionLoading(true)
    try {
      await updateDepotQueue(entry.id, { status: newStatus })
      toast.success(`Queue entry ${newStatus === 'in_progress' ? 'started' : newStatus === 'completed' ? 'completed' : 'cancelled'}`)
      onStatusChange(entry.id, newStatus)
      onOpenChange(false)
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to update status')
    } finally {
      setActionLoading(false)
    }
  }

  async function handleDelete() {
    setActionLoading(true)
    try {
      await deleteDepotQueue(entry.id)
      toast.success('Queue entry deleted')
      onDelete(entry.id)
      onOpenChange(false)
      setDeleteDialogOpen(false)
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to delete')
    } finally {
      setActionLoading(false)
    }
  }

  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Warehouse className="h-5 w-5 text-amber-500" />
              Depot Queue Detail
            </DialogTitle>
            <DialogDescription>
              {entry.depotName} — {entry.queueType === 'loading' ? 'Loading' : 'Unloading'} Queue
            </DialogDescription>
          </DialogHeader>

          <DialogBody className="space-y-4 py-2">
            <div className="rounded-lg border bg-muted/30 p-4 space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-sm text-muted-foreground">Status</span>
                <Badge className={sc.color} variant="outline">{sc.label}</Badge>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-sm text-muted-foreground">Queue Type</span>
                <span className="text-sm font-medium flex items-center gap-1.5">
                  {entry.queueType === 'loading' ? <ArrowUpFromLine className="h-3.5 w-3.5 text-amber-500" /> : <ArrowDownToLine className="h-3.5 w-3.5 text-emerald-500" />}
                  {entry.queueType === 'loading' ? 'Loading' : 'Unloading'}
                </span>
              </div>
              {entry.position != null && (
                <div className="flex items-center justify-between">
                  <span className="text-sm text-muted-foreground">Position</span>
                  <span className="text-sm font-bold text-amber-600">#{entry.position}</span>
                </div>
              )}
              <div className="flex items-center justify-between">
                <span className="text-sm text-muted-foreground">Joined At</span>
                <span className="text-sm font-medium">{formatDateTime(entry.joinedAt)}</span>
              </div>
              {entry.startedAt && (
                <div className="flex items-center justify-between">
                  <span className="text-sm text-muted-foreground">Started At</span>
                  <span className="text-sm font-medium">{formatDateTime(entry.startedAt)}</span>
                </div>
              )}
              {entry.completedAt && (
                <div className="flex items-center justify-between">
                  <span className="text-sm text-muted-foreground">Completed At</span>
                  <span className="text-sm font-medium">{formatDateTime(entry.completedAt)}</span>
                </div>
              )}
              <div className="flex items-center justify-between">
                <span className="text-sm text-muted-foreground">Est. Wait</span>
                <span className="text-sm font-medium">{formatWait(entry.estimatedWait)}</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-sm text-muted-foreground">Actual Wait</span>
                <span className="text-sm font-medium">{formatWait(entry.actualWait)}</span>
              </div>
            </div>

            {/* Linked entities */}
            <div className="space-y-2">
              <h4 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">Linked Records</h4>
              <div className="grid grid-cols-1 gap-2">
                <div className="rounded-lg border p-3 flex items-center gap-3">
                  <Truck className="h-4 w-4 text-amber-500 shrink-0" />
                  <div className="min-w-0">
                    <p className="text-sm font-medium truncate">{entry.truck.plateNumber}</p>
                    <p className="text-xs text-muted-foreground">{entry.truck.make} {entry.truck.model}</p>
                  </div>
                </div>
                {entry.driver && (
                  <div className="rounded-lg border p-3 flex items-center gap-3">
                    <User className="h-4 w-4 text-amber-500 shrink-0" />
                    <div className="min-w-0">
                      <p className="text-sm font-medium truncate">{entry.driver.firstName} {entry.driver.lastName}</p>
                    </div>
                  </div>
                )}
                {entry.trip && (
                  <div className="rounded-lg border p-3 flex items-center gap-3">
                    <MapPin className="h-4 w-4 text-amber-500 shrink-0" />
                    <div className="min-w-0">
                      <p className="text-sm font-medium truncate">{entry.trip.tripNumber}</p>
                      <p className="text-xs text-muted-foreground">{entry.trip.destination}</p>
                    </div>
                  </div>
                )}
              </div>
            </div>

            {entry.notes && (
              <div className="space-y-2">
                <h4 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">Notes</h4>
                <p className="text-sm text-muted-foreground rounded-lg border bg-muted/30 p-3">{entry.notes}</p>
              </div>
            )}
          </DialogBody>

          {/* Actions */}
          <div className="flex flex-wrap gap-2 pt-2 border-t">
            {entry.status === 'waiting' && (
              <Button size="sm" onClick={() => handleStatusChange('in_progress')} disabled={actionLoading} className="bg-sky-500 hover:bg-sky-600 text-white">
                {actionLoading ? <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" /> : <PlayCircle className="mr-1.5 h-3.5 w-3.5" />}
                Start
              </Button>
            )}
            {entry.status === 'in_progress' && (
              <Button size="sm" onClick={() => handleStatusChange('completed')} disabled={actionLoading} className="bg-emerald-500 hover:bg-emerald-600 text-white">
                {actionLoading ? <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" /> : <CheckCircle2 className="mr-1.5 h-3.5 w-3.5" />}
                Complete
              </Button>
            )}
            {(entry.status === 'waiting' || entry.status === 'in_progress') && (
              <Button size="sm" variant="outline" onClick={() => handleStatusChange('cancelled')} disabled={actionLoading}>
                {actionLoading ? <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" /> : <XCircle className="mr-1.5 h-3.5 w-3.5" />}
                Cancel
              </Button>
            )}
            <div className="flex-1" />
            <Button size="sm" variant="destructive" onClick={() => setDeleteDialogOpen(true)} disabled={actionLoading}>
              <Trash2 className="mr-1.5 h-3.5 w-3.5" />Delete
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      <AlertDialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Queue Entry</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete this depot queue entry? This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={handleDelete} className="bg-red-600 hover:bg-red-700">Delete</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  )
}

// ==================== MAIN VIEW ====================

export function DepotQueueView() {
  const [queue, setQueue] = React.useState<DepotQueue[]>([])
  const [summary, setSummary] = React.useState<DepotQueueSummary | null>(null)
  const [loading, setLoading] = React.useState(true)
  const [error, setError] = React.useState<string | null>(null)
  const [total, setTotal] = React.useState(0)
  const [page, setPage] = React.useState(1)
  const limit = 20

  // Filters
  const [activeTab, setActiveTab] = React.useState('all')
  const [searchQuery, setSearchQuery] = React.useState('')
  const [filterDepot, setFilterDepot] = React.useState('')
  const [showFilters, setShowFilters] = React.useState(false)

  // Dialogs
  const [formDialogOpen, setFormDialogOpen] = React.useState(false)
  const [editing, setEditing] = React.useState<DepotQueue | null>(null)
  const [detailOpen, setDetailOpen] = React.useState(false)
  const [selectedEntry, setSelectedEntry] = React.useState<DepotQueue | null>(null)

  // Load data
  const loadData = React.useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const res = await fetchDepotQueue({
        status: activeTab !== 'all' ? activeTab : undefined,
        depotName: filterDepot || (searchQuery ? searchQuery : undefined),
        page,
        limit,
      })
      setQueue(res.data || [])
      setTotal(res.total || 0)
      setSummary(res.summary || null)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load depot queue')
    } finally {
      setLoading(false)
    }
  }, [activeTab, searchQuery, filterDepot, page])

  React.useEffect(() => { loadData() }, [loadData])

  const totalPages = Math.ceil(total / limit)

  // Active depots count
  const activeDepots = React.useMemo(() => {
    const deps = new Set(queue.map(q => q.depotName))
    return deps.size
  }, [queue])

  function handleStatusChange(id: string, _newStatus: string) {
    loadData()
  }

  function handleDelete(id: string) {
    setQueue(prev => prev.filter(q => q.id !== id))
    setTotal(prev => prev - 1)
  }

  return (
    <motion.div variants={containerVariants} animate="show" className="space-y-4 sm:space-y-6">
      {/* Header */}
      <motion.div variants={itemVariants} className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Depot Queue</h1>
          <p className="text-muted-foreground">Manage truck loading and unloading queues at Ghana depots</p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={() => { setSearchQuery(''); setFilterDepot(''); setActiveTab('all'); setPage(1) }}>
            <RefreshCw className="mr-1.5 h-3.5 w-3.5" /> Reset
          </Button>
          <Button onClick={() => { setEditing(null); setFormDialogOpen(true) }} className="bg-amber-500 hover:bg-amber-600 text-white">
            <Plus className="mr-2 h-4 w-4" /> Add to Queue
          </Button>
        </div>
      </motion.div>

      {/* Summary Cards */}
      <motion.div variants={itemVariants} className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
        {loading ? (
          Array.from({ length: 4 }).map((_, i) => (
            <Card key={i}><CardContent className="p-4 sm:p-6"><Skeleton className="h-3 w-24 mb-3" /><Skeleton className="h-7 w-20" /></CardContent></Card>
          ))
        ) : (
          <>
            <StatsCard icon={Clock} title="In Queue" value={summary?.inQueue || 0} changeLabel="waiting trucks" className="cursor-default" />
            <StatsCard icon={TrendingUp} title="Avg Wait" value={formatWait(summary?.avgWait)} changeLabel="estimated wait time" className="cursor-default" />
            <StatsCard icon={CheckCircle2} title="Completed Today" value={summary?.completedToday || 0} changeLabel="entries completed" className="cursor-default" />
            <StatsCard icon={Warehouse} title="Active Depots" value={activeDepots} changeLabel="with queue activity" className="cursor-default" />
          </>
        )}
      </motion.div>

      {/* Search & Filters */}
      <motion.div variants={itemVariants} className="space-y-3">
        <div className="flex flex-col sm:flex-row gap-2 sm:gap-3">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input placeholder="Search depot, truck, driver..." value={searchQuery} onChange={e => { setSearchQuery(e.target.value); setPage(1) }} className="pl-9" />
          </div>
          <Button variant="outline" size="sm" onClick={() => setShowFilters(!showFilters)}>
            <Filter className="mr-1.5 h-3.5 w-3.5" /> Filters
            <ChevronDown className={`ml-1 h-3 w-3 transition-transform ${showFilters ? 'rotate-180' : ''}`} />
          </Button>
        </div>
        {showFilters && (
          <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }} className="flex flex-col sm:flex-row gap-2 sm:gap-3 p-3 rounded-lg border bg-muted/30">
            <div className="flex-1">
              <label className="text-xs font-medium text-muted-foreground mb-1 block">Depot</label>
              <Select value={filterDepot} onValueChange={v => { setFilterDepot(v === 'all' ? '' : v); setPage(1) }}>
                <SelectTrigger><SelectValue placeholder="All Depots" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Depots</SelectItem>
                  {DEPOT_OPTIONS.map(d => <SelectItem key={d.value} value={d.value}>{d.label}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
          </motion.div>
        )}
      </motion.div>

      {/* Tabs */}
      <motion.div variants={itemVariants}>
        <Tabs value={activeTab} onValueChange={v => { setActiveTab(v); setPage(1) }}>
          <TabsList className="w-full sm:w-auto">
            <TabsTrigger value="all">All</TabsTrigger>
            <TabsTrigger value="waiting">Waiting</TabsTrigger>
            <TabsTrigger value="in_progress">In Progress</TabsTrigger>
            <TabsTrigger value="completed">Completed</TabsTrigger>
          </TabsList>
        </Tabs>
      </motion.div>

      {/* Content */}
      <motion.div variants={itemVariants}>
        {loading ? (
          <div className="rounded-lg border p-6 space-y-3">
            {Array.from({ length: 5 }).map((_, i) => <Skeleton key={i} className="h-12 w-full" />)}
          </div>
        ) : error ? (
          <div className="rounded-lg border p-6 text-center">
            <p className="text-red-500 text-sm">{error}</p>
            <Button variant="outline" size="sm" className="mt-2" onClick={loadData}><RefreshCw className="mr-1.5 h-3.5 w-3.5" />Retry</Button>
          </div>
        ) : queue.length === 0 ? (
          <EmptyState icon={Warehouse} title="No queue entries" description="No depot queue entries found. Add one to get started." action={{ label: 'Add to Queue', onClick: () => { setEditing(null); setFormDialogOpen(true) } }} />
        ) : (
          <>
            {/* Desktop Table */}
            <div className="hidden md:block rounded-lg border overflow-hidden">
              <div className="max-h-[500px] overflow-y-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="w-[60px]">Pos.</TableHead>
                      <TableHead>Truck</TableHead>
                      <TableHead>Driver</TableHead>
                      <TableHead>Depot</TableHead>
                      <TableHead>Type</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead>Wait Time</TableHead>
                      <TableHead>Joined</TableHead>
                      <TableHead className="w-[80px]">Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {queue.map(q => {
                      const sc = STATUS_CONFIG[q.status] || STATUS_CONFIG.waiting
                      return (
                        <TableRow key={q.id} className="cursor-pointer hover:bg-muted/50" onClick={() => { setSelectedEntry(q); setDetailOpen(true) }}>
                          <TableCell>
                            {q.position != null ? (
                              <span className="inline-flex items-center justify-center h-6 w-6 rounded-full bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-400 text-xs font-bold">
                                {q.position}
                              </span>
                            ) : '—'}
                          </TableCell>
                          <TableCell className="text-xs font-medium">{q.truck.plateNumber}</TableCell>
                          <TableCell className="text-xs">{q.driver ? `${q.driver.firstName} ${q.driver.lastName}` : '—'}</TableCell>
                          <TableCell className="text-xs font-medium">{q.depotName}</TableCell>
                          <TableCell>
                            <Badge variant="outline" className="text-xs gap-1">
                              {q.queueType === 'loading' ? <ArrowUpFromLine className="h-3 w-3" /> : <ArrowDownToLine className="h-3 w-3" />}
                              {q.queueType === 'loading' ? 'Loading' : 'Unloading'}
                            </Badge>
                          </TableCell>
                          <TableCell><Badge className={sc.color} variant="outline">{sc.label}</Badge></TableCell>
                          <TableCell className="text-xs">{formatWait(q.actualWait || q.estimatedWait)}</TableCell>
                          <TableCell className="text-xs">{formatDate(q.joinedAt)}</TableCell>
                          <TableCell>
                            <div className="flex gap-1" onClick={e => e.stopPropagation()}>
                              {q.status === 'waiting' && (
                                <Button size="icon" variant="ghost" className="h-7 w-7 text-sky-500 hover:text-sky-600" title="Start" onClick={() => handleStatusChange(q.id, 'in_progress')}>
                                  <PlayCircle className="h-4 w-4" />
                                </Button>
                              )}
                              {q.status === 'in_progress' && (
                                <Button size="icon" variant="ghost" className="h-7 w-7 text-emerald-500 hover:text-emerald-600" title="Complete" onClick={() => handleStatusChange(q.id, 'completed')}>
                                  <CheckCircle2 className="h-4 w-4" />
                                </Button>
                              )}
                            </div>
                          </TableCell>
                        </TableRow>
                      )
                    })}
                  </TableBody>
                </Table>
              </div>
            </div>

            {/* Mobile Cards */}
            <div className="md:hidden space-y-3">
              {queue.map(q => {
                const sc = STATUS_CONFIG[q.status] || STATUS_CONFIG.waiting
                return (
                  <Card key={q.id} className="cursor-pointer hover:shadow-md transition-shadow" onClick={() => { setSelectedEntry(q); setDetailOpen(true) }}>
                    <CardContent className="p-4 space-y-3">
                      <div className="flex items-start justify-between">
                        <div className="min-w-0">
                          <p className="font-medium text-sm truncate">{q.depotName}</p>
                          <p className="text-xs text-muted-foreground">{q.truck.plateNumber} · {q.driver ? `${q.driver.firstName} ${q.driver.lastName}` : 'No driver'}</p>
                        </div>
                        <div className="flex items-center gap-2">
                          {q.position != null && (
                            <span className="inline-flex items-center justify-center h-6 w-6 rounded-full bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-400 text-xs font-bold">
                              {q.position}
                            </span>
                          )}
                          <Badge className={sc.color} variant="outline">{sc.label}</Badge>
                        </div>
                      </div>
                      <div className="grid grid-cols-2 gap-2 text-xs text-muted-foreground">
                        <div className="flex items-center gap-1.5">
                          {q.queueType === 'loading' ? <ArrowUpFromLine className="h-3 w-3" /> : <ArrowDownToLine className="h-3 w-3" />}
                          {q.queueType === 'loading' ? 'Loading' : 'Unloading'}
                        </div>
                        <div className="flex items-center gap-1.5"><Clock className="h-3 w-3" />{formatWait(q.actualWait || q.estimatedWait)}</div>
                        <div className="flex items-center gap-1.5"><CalendarClock className="h-3 w-3" />{formatDate(q.joinedAt)}</div>
                        <div />
                      </div>
                      {(q.status === 'waiting' || q.status === 'in_progress') && (
                        <div className="flex gap-2 pt-1" onClick={e => e.stopPropagation()}>
                          {q.status === 'waiting' && (
                            <Button size="sm" variant="outline" className="text-sky-600 border-sky-300 text-xs h-7" onClick={() => handleStatusChange(q.id, 'in_progress')}>
                              <PlayCircle className="mr-1 h-3 w-3" />Start
                            </Button>
                          )}
                          {q.status === 'in_progress' && (
                            <Button size="sm" variant="outline" className="text-emerald-600 border-emerald-300 text-xs h-7" onClick={() => handleStatusChange(q.id, 'completed')}>
                              <CheckCircle2 className="mr-1 h-3 w-3" />Complete
                            </Button>
                          )}
                        </div>
                      )}
                    </CardContent>
                  </Card>
                )
              })}
            </div>

            {/* Pagination */}
            {totalPages > 1 && (
              <div className="flex items-center justify-between pt-4">
                <p className="text-sm text-muted-foreground">
                  Page {page} of {totalPages} ({total} records)
                </p>
                <div className="flex gap-1">
                  <Button variant="outline" size="sm" disabled={page <= 1} onClick={() => setPage(p => p - 1)}>
                    <ChevronDown className="h-4 w-4 rotate-90" />
                  </Button>
                  {Array.from({ length: Math.min(5, totalPages) }, (_, i) => {
                    const p = page <= 3 ? i + 1 : page + i - 2
                    if (p > totalPages) return null
                    return (
                      <Button key={p} variant={p === page ? 'default' : 'outline'} size="sm" className={p === page ? 'bg-amber-500 hover:bg-amber-600 text-white h-8 w-8 p-0' : 'h-8 w-8 p-0'} onClick={() => setPage(p)}>
                        {p}
                      </Button>
                    )
                  })}
                  <Button variant="outline" size="sm" disabled={page >= totalPages} onClick={() => setPage(p => p + 1)}>
                    <ChevronDown className="h-4 w-4 -rotate-90" />
                  </Button>
                </div>
              </div>
            )}
          </>
        )}
      </motion.div>

      {/* Form Dialog */}
      <DepotQueueFormDialog
        open={formDialogOpen}
        onOpenChange={setFormDialogOpen}
        onCreated={loadData}
        onUpdated={loadData}
        editing={editing}
      />

      {/* Detail Dialog */}
      <DetailDialog
        entry={selectedEntry}
        open={detailOpen}
        onOpenChange={setDetailOpen}
        onStatusChange={handleStatusChange}
        onDelete={handleDelete}
      />
    </motion.div>
  )
}
