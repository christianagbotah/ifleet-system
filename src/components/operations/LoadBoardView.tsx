'use client'

import * as React from 'react'
import { motion } from 'framer-motion'
import {
  Plus, Search, Package, ArrowRight, MapPin, Weight, DollarSign,
  Truck, CalendarDays, RefreshCw, AlertCircle, UserCheck, X,
  ChevronDown, Phone, Building2, Pencil, Trash2,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { DatePicker } from '@/components/ui/date-picker'
import { Textarea } from '@/components/ui/textarea'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Label } from '@/components/ui/label'
import { EmptyState } from '@/components/ui/empty-state'
import { Skeleton } from '@/components/ui/skeleton'
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
import { CURRENCY_SYMBOL, GHANA_LOCATIONS } from '@/lib/constants'
import { useDebounce } from '@/hooks/use-debounce'
import {
  fetchLoadBoard, createLoadBoard, updateLoadBoard, deleteLoadBoard,
  fetchTrucks, fetchDrivers, fetchClients,
  type LoadBoardItem, type Truck, type Driver, type Client,
} from '@/lib/api'
import { toast } from 'sonner'

// ─── Status helpers ──────────────────────────────────────────────────────────

const LOAD_STATUS_MAP: Record<string, { label: string; color: string }> = {
  open:       { label: 'Open',       color: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400' },
  assigned:   { label: 'Assigned',   color: 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400' },
  in_transit: { label: 'In Transit', color: 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400' },
  delivered:  { label: 'Delivered',  color: 'bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-400' },
  cancelled:  { label: 'Cancelled',  color: 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400' },
  expired:    { label: 'Expired',    color: 'bg-gray-100 text-gray-500 dark:bg-gray-800 dark:text-gray-500' },
}

function LoadStatusBadge({ status }: { status: string }) {
  const cfg = LOAD_STATUS_MAP[status]
  if (!cfg) {
    return <Badge variant="outline">{status.replace(/_/g, ' ')}</Badge>
  }
  return <Badge variant="outline" className="border-transparent font-medium">{cfg.label}</Badge>
}

function ColoredStatusBadge({ status }: { status: string }) {
  const cfg = LOAD_STATUS_MAP[status]
  if (!cfg) {
    return <Badge variant="outline">{status.replace(/_/g, ' ')}</Badge>
  }
  return <Badge variant="outline" className={`border-transparent font-medium ${cfg.color}`}>{cfg.label}</Badge>
}

// ─── Commodity / truck types ────────────────────────────────────────────────

const COMMODITY_TYPES = [
  'Cement', 'Sand', 'Gravel', 'Steel', 'Timber', 'Fuel',
  'Food Products', 'Consumer Goods', 'Construction Materials',
  'Agricultural Products', 'Electronics', 'Chemicals', 'Other',
] as const

const TRUCK_TYPES = [
  'Flatbed', 'Tipper', 'Tanker', 'Container Carrier',
  'Trailer', 'Drop Side', 'Low Bed', 'Refrigerated', 'Other',
] as const

// ─── Animation variants ──────────────────────────────────────────────────────

const containerVariants = {
  show: { transition: { staggerChildren: 0.04 } },
}
const itemVariants = {
  show: { opacity: 1, y: 0 },
}

// ─── Main Component ──────────────────────────────────────────────────────────

export function LoadBoardView() {
  const [search, setSearch] = React.useState('')
  const debouncedSearch = useDebounce(search, 300)
  const [activeTab, setActiveTab] = React.useState('all')
  const [records, setRecords] = React.useState<LoadBoardItem[]>([])
  const [loading, setLoading] = React.useState(true)
  const [error, setError] = React.useState<string | null>(null)
  const [createOpen, setCreateOpen] = React.useState(false)
  const [assignOpen, setAssignOpen] = React.useState(false)
  const [assigningRecord, setAssigningRecord] = React.useState<LoadBoardItem | null>(null)
  const [editingLoad, setEditingLoad] = React.useState<LoadBoardItem | null>(null)
  const [editDialogOpen, setEditDialogOpen] = React.useState(false)
  const [deleteId, setDeleteId] = React.useState<string | null>(null)
  const [editForm, setEditForm] = React.useState({
    title: '', pickupLocation: '', dropoffLocation: '',
    pickupRegion: '', dropoffRegion: '', commodityType: '',
    weight: '', truckType: '', offeredRate: '', budgetMin: '', budgetMax: '',
    pickupDate: '', deliveryDate: '', requirements: '',
    contactName: '', contactPhone: '', clientId: '', truckCount: '1',
  })
  const [editing, setEditing] = React.useState(false)

  // Assign dialog state
  const [trucks, setTrucks] = React.useState<Truck[]>([])
  const [drivers, setDrivers] = React.useState<Driver[]>([])
  const [assignTruckId, setAssignTruckId] = React.useState('')
  const [assignDriverId, setAssignDriverId] = React.useState('')
  const [assigning, setAssigning] = React.useState(false)

  // Create dialog state
  const [clients, setClients] = React.useState<Client[]>([])
  const [creating, setCreating] = React.useState(false)
  const [createForm, setCreateForm] = React.useState({
    title: '', pickupLocation: '', dropoffLocation: '',
    pickupRegion: '', dropoffRegion: '', commodityType: '',
    weight: '', truckType: '', offeredRate: '', budgetMin: '', budgetMax: '',
    pickupDate: '', deliveryDate: '', requirements: '',
    contactName: '', contactPhone: '', clientId: '', truckCount: '1',
  })

  const loadRecords = React.useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const params: Parameters<typeof fetchLoadBoard>[0] = { limit: 100 }
      if (activeTab !== 'all') params.status = activeTab
      const result = await fetchLoadBoard(params)
      setRecords(result.data)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to fetch load board')
    } finally {
      setLoading(false)
    }
  }, [activeTab])

  React.useEffect(() => { loadRecords() }, [loadRecords])

  const filteredRecords = React.useMemo(() => {
    if (!debouncedSearch) return records
    const q = debouncedSearch.toLowerCase()
    return records.filter((r) =>
      r.title.toLowerCase().includes(q) ||
      r.pickupLocation.toLowerCase().includes(q) ||
      r.dropoffLocation.toLowerCase().includes(q) ||
      r.commodityType.toLowerCase().includes(q)
    )
  }, [records, debouncedSearch])

  // Summary stats
  const openCount = records.filter((r) => r.status === 'open').length
  const assignedToday = records.filter((r) => {
    if (r.status !== 'assigned') return false
    const today = new Date().toDateString()
    return new Date(r.updatedAt).toDateString() === today
  }).length
  const inTransitCount = records.filter((r) => r.status === 'in_transit').length
  const totalValue = records.reduce((s, r) => s + (r.offeredRate || 0), 0)

  // Load reference data when dialogs open
  const loadAssignData = React.useCallback(async () => {
    try {
      const [trucksRes, driversRes] = await Promise.all([
        fetchTrucks({ status: 'active', limit: 200 }),
        fetchDrivers({ status: 'active', limit: 200 }),
      ])
      setTrucks(trucksRes.data)
      setDrivers(driversRes.data)
    } catch { /* ignore */ }
  }, [])

  // Auto-populate driver when truck is selected in assign dialog
  React.useEffect(() => {
    if (!assignTruckId) {
      setAssignDriverId('')
      return
    }
    const selectedTruck = trucks.find(t => t.id === assignTruckId)
    if (selectedTruck?.driverId) {
      setAssignDriverId(selectedTruck.driverId)
    } else {
      setAssignDriverId('')
    }
  }, [assignTruckId, trucks])

  const loadCreateData = React.useCallback(async () => {
    try {
      const clientsRes = await fetchClients({ limit: 200 })
      setClients(clientsRes.data)
    } catch { /* ignore */ }
  }, [])

  const handleCreateOpen = () => {
    setCreateForm({
      title: '', pickupLocation: '', dropoffLocation: '',
      pickupRegion: '', dropoffRegion: '', commodityType: '',
      weight: '', truckType: '', offeredRate: '', budgetMin: '', budgetMax: '',
      pickupDate: '', deliveryDate: '', requirements: '',
      contactName: '', contactPhone: '', clientId: '', truckCount: '1',
    })
    setCreateOpen(true)
    loadCreateData()
  }

  const handleCreateSubmit = async () => {
    if (!createForm.title || !createForm.pickupLocation || !createForm.dropoffLocation ||
        !createForm.pickupRegion || !createForm.dropoffRegion || !createForm.commodityType) {
      toast.error('Please fill in all required fields')
      return
    }
    setCreating(true)
    try {
      await createLoadBoard({
        ...createForm,
        weight: createForm.weight ? parseFloat(createForm.weight) : null,
        offeredRate: createForm.offeredRate ? parseFloat(createForm.offeredRate) : null,
        budgetMin: createForm.budgetMin ? parseFloat(createForm.budgetMin) : null,
        budgetMax: createForm.budgetMax ? parseFloat(createForm.budgetMax) : null,
        truckCount: parseInt(createForm.truckCount) || 1,
        clientId: createForm.clientId || undefined,
      })
      toast.success('Load posted successfully')
      setCreateOpen(false)
      loadRecords()
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to create load')
    } finally {
      setCreating(false)
    }
  }

  const handleAssignOpen = (record: LoadBoardItem) => {
    setAssigningRecord(record)
    setAssignTruckId(record.assignedTruckId || '')
    setAssignDriverId(record.assignedDriverId || '')
    setAssignOpen(true)
    loadAssignData()
  }

  const handleAssignSubmit = async () => {
    if (!assigningRecord) return
    setAssigning(true)
    try {
      await updateLoadBoard(assigningRecord.id, {
        assignedTruckId: assignTruckId || null,
        assignedDriverId: assignDriverId || null,
        status: assignTruckId ? 'assigned' : 'open',
      })
      toast.success('Load assigned successfully')
      setAssignOpen(false)
      setAssigningRecord(null)
      loadRecords()
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to assign load')
    } finally {
      setAssigning(false)
    }
  }

  const handleStatusUpdate = async (record: LoadBoardItem, newStatus: string) => {
    try {
      await updateLoadBoard(record.id, { status: newStatus })
      toast.success(`Load status updated to ${newStatus.replace(/_/g, ' ')}`)
      loadRecords()
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to update status')
    }
  }

  const handleEditOpen = (record: LoadBoardItem) => {
    setEditForm({
      title: record.title,
      pickupLocation: record.pickupLocation,
      dropoffLocation: record.dropoffLocation,
      pickupRegion: record.pickupRegion,
      dropoffRegion: record.dropoffRegion,
      commodityType: record.commodityType,
      weight: record.weight?.toString() || '',
      truckType: record.truckType || '',
      offeredRate: record.offeredRate?.toString() || '',
      budgetMin: record.budgetMin?.toString() || '',
      budgetMax: record.budgetMax?.toString() || '',
      pickupDate: record.pickupDate?.split('T')[0] || '',
      deliveryDate: record.deliveryDate?.split('T')[0] || '',
      requirements: record.requirements || '',
      contactName: record.contactName || '',
      contactPhone: record.contactPhone || '',
      clientId: record.clientId || '',
      truckCount: record.truckCount?.toString() || '1',
    })
    setEditingLoad(record)
    setEditDialogOpen(true)
    loadCreateData()
  }

  const handleEditSubmit = async () => {
    if (!editingLoad) return
    if (!editForm.title || !editForm.pickupLocation || !editForm.dropoffLocation ||
        !editForm.pickupRegion || !editForm.dropoffRegion || !editForm.commodityType) {
      toast.error('Please fill in all required fields')
      return
    }
    setEditing(true)
    try {
      await updateLoadBoard(editingLoad.id, {
        ...editForm,
        weight: editForm.weight ? parseFloat(editForm.weight) : null,
        offeredRate: editForm.offeredRate ? parseFloat(editForm.offeredRate) : null,
        budgetMin: editForm.budgetMin ? parseFloat(editForm.budgetMin) : null,
        budgetMax: editForm.budgetMax ? parseFloat(editForm.budgetMax) : null,
        truckCount: parseInt(editForm.truckCount) || 1,
        clientId: editForm.clientId || undefined,
      })
      toast.success('Load updated successfully')
      setEditDialogOpen(false)
      setEditingLoad(null)
      loadRecords()
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to update load')
    } finally {
      setEditing(false)
    }
  }

  const handleDeleteLoad = async () => {
    if (!deleteId) return
    try {
      await deleteLoadBoard(deleteId)
      toast.success('Load deleted successfully')
      setDeleteId(null)
      loadRecords()
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to delete load')
    }
  }

  return (
    <motion.div variants={containerVariants} animate="show" className="space-y-4 sm:space-y-6">
      {/* Header */}
      <motion.div variants={itemVariants} className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Load Board</h1>
          <p className="text-muted-foreground">Find available loads and manage assignments</p>
        </div>
        <Button onClick={handleCreateOpen} className="bg-emerald-500 hover:bg-emerald-600 text-white">
          <Plus className="mr-2 h-4 w-4" />
          Post Load
        </Button>
      </motion.div>

      {/* Summary Cards */}
      <motion.div variants={itemVariants} className="grid grid-cols-2 sm:grid-cols-4 gap-3 sm:gap-4">
        {loading ? (
          Array.from({ length: 4 }).map((_, i) => (
            <Card key={i}><CardContent className="p-4"><Skeleton className="h-3 w-16 mb-2" /><Skeleton className="h-6 w-10" /></CardContent></Card>
          ))
        ) : (
          <>
            <Card className="hover:shadow-md transition-shadow">
              <CardContent className="p-4">
                <p className="text-xs text-muted-foreground">Open Loads</p>
                <p className="text-xl font-bold text-emerald-600">{openCount}</p>
              </CardContent>
            </Card>
            <Card className="hover:shadow-md transition-shadow">
              <CardContent className="p-4">
                <p className="text-xs text-muted-foreground">Assigned Today</p>
                <p className="text-xl font-bold text-blue-600">{assignedToday}</p>
              </CardContent>
            </Card>
            <Card className="hover:shadow-md transition-shadow">
              <CardContent className="p-4">
                <p className="text-xs text-muted-foreground">In Transit</p>
                <p className="text-xl font-bold text-amber-600">{inTransitCount}</p>
              </CardContent>
            </Card>
            <Card className="hover:shadow-md transition-shadow">
              <CardContent className="p-4">
                <p className="text-xs text-muted-foreground">Total Value</p>
                <p className="text-xl font-bold">{CURRENCY_SYMBOL}{totalValue.toLocaleString()}</p>
              </CardContent>
            </Card>
          </>
        )}
      </motion.div>

      {/* Search & Tabs */}
      <motion.div variants={itemVariants} className="space-y-4">
        <div className="relative">
          <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Search by title, location, commodity..."
            className="pl-8"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>

        <Tabs value={activeTab} onValueChange={setActiveTab}>
          <TabsList className="w-full sm:w-auto">
            <TabsTrigger value="all">All</TabsTrigger>
            <TabsTrigger value="open">Open</TabsTrigger>
            <TabsTrigger value="assigned">Assigned</TabsTrigger>
            <TabsTrigger value="in_transit">In Transit</TabsTrigger>
            <TabsTrigger value="delivered">Delivered</TabsTrigger>
          </TabsList>

          {error ? (
            <div className="flex flex-col items-center justify-center py-12 text-center mt-4">
              <AlertCircle className="h-8 w-8 text-red-500 mb-3" />
              <p className="text-sm text-muted-foreground mb-3">{error}</p>
              <Button variant="outline" size="sm" onClick={loadRecords}>
                <RefreshCw className="mr-2 h-3 w-3" /> Retry
              </Button>
            </div>
          ) : loading ? (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 mt-4">
              {Array.from({ length: 6 }).map((_, i) => (
                <Card key={i}><CardContent className="p-4"><Skeleton className="h-4 w-3/4 mb-3" /><Skeleton className="h-3 w-full mb-2" /><Skeleton className="h-3 w-1/2 mb-4" /><Skeleton className="h-8 w-full" /></CardContent></Card>
              ))}
            </div>
          ) : (
            <TabsContent value={activeTab} className="mt-4">
              <LoadBoardGrid
                records={filteredRecords}
                onAssign={handleAssignOpen}
                onStatusUpdate={handleStatusUpdate}
                onEdit={handleEditOpen}
                onDelete={(id) => setDeleteId(id)}
              />
            </TabsContent>
          )}
        </Tabs>
      </motion.div>

      {/* Create Dialog */}
      <CreateLoadDialog
        open={createOpen}
        onOpenChange={setCreateOpen}
        form={createForm}
        setForm={setCreateForm}
        clients={clients}
        submitting={creating}
        onSubmit={handleCreateSubmit}
      />

      {/* Edit Dialog */}
      <CreateLoadDialog
        open={editDialogOpen}
        onOpenChange={setEditDialogOpen}
        form={editForm}
        setForm={setEditForm}
        clients={clients}
        submitting={editing}
        onSubmit={handleEditSubmit}
        isEdit
      />

      {/* Delete Confirmation */}
      <AlertDialog open={!!deleteId} onOpenChange={(open) => { if (!open) setDeleteId(null) }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Load</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete this load? This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={handleDeleteLoad} className="bg-red-500 hover:bg-red-600 text-white">
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Assign Dialog */}
      <Dialog open={assignOpen} onOpenChange={setAssignOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Assign Load</DialogTitle>
          </DialogHeader>
          {assigningRecord && (
            <DialogBody className="space-y-4 py-2">
              <div className="text-sm text-muted-foreground">
                <span className="font-medium text-foreground">{assigningRecord.title}</span>
                <br />
                {assigningRecord.pickupLocation} &rarr; {assigningRecord.dropoffLocation}
              </div>

              <div className="space-y-2">
                <Label>Select Truck</Label>
                <Select value={assignTruckId} onValueChange={setAssignTruckId}>
                  <SelectTrigger>
                    <SelectValue placeholder="Choose a truck..." />
                  </SelectTrigger>
                  <SelectContent>
                    {trucks.map((t) => (
                      <SelectItem key={t.id} value={t.id}>
                        {t.plateNumber} — {t.make} {t.model}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label>Select Driver</Label>
                <Select value={assignDriverId} onValueChange={setAssignDriverId} disabled={!!assignTruckId}>
                  <SelectTrigger>
                    <SelectValue placeholder={assignTruckId ? 'No driver assigned to truck' : 'Select a truck first'} />
                  </SelectTrigger>
                  <SelectContent>
                    {drivers.map((d) => (
                      <SelectItem key={d.id} value={d.id}>
                        {d.firstName} {d.lastName} — {d.phone}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                {assignTruckId && !assignDriverId && (
                  <p className="text-xs text-amber-600">No driver assigned to this truck</p>
                )}
              </div>
            </DialogBody>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setAssignOpen(false)}>Cancel</Button>
            <Button onClick={handleAssignSubmit} disabled={assigning || !assignTruckId} className="bg-blue-500 hover:bg-blue-600 text-white">
              {assigning ? 'Assigning...' : 'Assign Load'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </motion.div>
  )
}

// ─── Load Board Card Grid ────────────────────────────────────────────────────

function LoadBoardGrid({ records, onAssign, onStatusUpdate, onEdit, onDelete }: {
  records: LoadBoardItem[]
  onAssign: (record: LoadBoardItem) => void
  onStatusUpdate: (record: LoadBoardItem, status: string) => void
  onEdit: (record: LoadBoardItem) => void
  onDelete: (id: string) => void
}) {
  if (records.length === 0) {
    return (
      <div className="rounded-lg border bg-card">
        <EmptyState
          icon={Package}
          title="No loads found"
          description="No loads match your current filter. Try adjusting your search or post a new load."
          action={{ label: 'Post Load', onClick: () => { /* handled by parent via onEdit/onAssign */ } }}
        />
      </div>
    )
  }

  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
      {records.map((record) => (
        <motion.div
          key={record.id}
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.2 }}
        >
          <Card className="hover:shadow-md transition-shadow h-full flex flex-col">
            <CardHeader className="pb-3">
              <div className="flex items-start justify-between gap-2">
                <CardTitle className="text-sm font-semibold leading-tight line-clamp-2 flex-1">
                  {record.title}
                </CardTitle>
                <ColoredStatusBadge status={record.status} />
              </div>
              {record.client && (
                <p className="text-xs text-muted-foreground flex items-center gap-1 mt-1">
                  <Building2 className="h-3 w-3" />
                  {record.client.companyName}
                </p>
              )}
            </CardHeader>
            <CardContent className="flex-1 flex flex-col gap-3 pt-0">
              {/* Route */}
              <div className="flex items-center gap-2 text-sm">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-1 text-muted-foreground">
                    <MapPin className="h-3 w-3 shrink-0 text-emerald-500" />
                    <span className="truncate">{record.pickupLocation}</span>
                  </div>
                </div>
                <ArrowRight className="h-3 w-3 shrink-0 text-muted-foreground" />
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-1 text-muted-foreground">
                    <MapPin className="h-3 w-3 shrink-0 text-red-500" />
                    <span className="truncate">{record.dropoffLocation}</span>
                  </div>
                </div>
              </div>

              {/* Badges Row */}
              <div className="flex flex-wrap gap-1.5">
                <Badge variant="secondary" className="text-xs font-normal">
                  {record.commodityType}
                </Badge>
                {record.truckType && (
                  <Badge variant="outline" className="text-xs font-normal">
                    <Truck className="h-3 w-3 mr-1" />
                    {record.truckType}
                  </Badge>
                )}
                {record.weight && (
                  <Badge variant="outline" className="text-xs font-normal">
                    <Weight className="h-3 w-3 mr-1" />
                    {record.weight.toLocaleString()} kg
                  </Badge>
                )}
              </div>

              {/* Rate & Dates */}
              <div className="flex items-center justify-between text-sm">
                {record.offeredRate ? (
                  <span className="font-semibold text-emerald-600">
                    {CURRENCY_SYMBOL}{record.offeredRate.toLocaleString()}
                  </span>
                ) : (
                  <span className="text-muted-foreground text-xs">Rate not set</span>
                )}
                {record.pickupDate && (
                  <span className="text-xs text-muted-foreground flex items-center gap-1">
                    <CalendarDays className="h-3 w-3" />
                    {new Date(record.pickupDate).toLocaleDateString()}
                  </span>
                )}
              </div>

              {/* Assigned Info */}
              {record.assignedTruck && (
                <div className="text-xs text-muted-foreground bg-muted/50 rounded-md px-2 py-1.5">
                  <span className="font-medium text-foreground">{record.assignedTruck.plateNumber}</span>
                  {record.assignedDriver && (
                    <> — {record.assignedDriver.firstName} {record.assignedDriver.lastName}</>
                  )}
                </div>
              )}

              {/* Contact info */}
              {record.contactName && (
                <div className="text-xs text-muted-foreground flex items-center gap-1">
                  <Phone className="h-3 w-3" />
                  {record.contactName}{record.contactPhone ? ` — ${record.contactPhone}` : ''}
                </div>
              )}

              {/* Actions */}
              <div className="flex gap-2 mt-auto pt-2 border-t">
                {record.status === 'open' && (
                  <Button
                    size="sm"
                    className="flex-1 bg-blue-500 hover:bg-blue-600 text-white"
                    onClick={() => onAssign(record)}
                  >
                    <UserCheck className="mr-1.5 h-3.5 w-3.5" />
                    Assign
                  </Button>
                )}
                {record.status === 'assigned' && (
                  <Button
                    size="sm"
                    variant="outline"
                    className="flex-1"
                    onClick={() => onStatusUpdate(record, 'in_transit')}
                  >
                    Start Transit
                  </Button>
                )}
                {record.status === 'in_transit' && (
                  <Button
                    size="sm"
                    variant="outline"
                    className="flex-1"
                    onClick={() => onStatusUpdate(record, 'delivered')}
                  >
                    Mark Delivered
                  </Button>
                )}
                <Button
                  size="sm"
                  variant="ghost"
                  className="text-sky-500 hover:text-sky-600 hover:bg-sky-50 dark:hover:bg-sky-900/20 h-8 w-8 p-0"
                  onClick={() => onEdit(record)}
                  title="Edit"
                >
                  <Pencil className="h-3.5 w-3.5" />
                </Button>
                <Button
                  size="sm"
                  variant="ghost"
                  className="text-red-500 hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-900/20 h-8 w-8 p-0"
                  onClick={() => onDelete(record.id)}
                  title="Delete"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </Button>
                {(record.status === 'open' || record.status === 'assigned') && (
                  <Button
                    size="sm"
                    variant="ghost"
                    className="text-red-500 hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-900/20 h-8 w-8 p-0"
                    onClick={() => onStatusUpdate(record, 'cancelled')}
                    title="Cancel"
                  >
                    <X className="h-3.5 w-3.5" />
                  </Button>
                )}
              </div>
            </CardContent>
          </Card>
        </motion.div>
      ))}
    </div>
  )
}

// ─── Create Load Dialog ──────────────────────────────────────────────────────

function CreateLoadDialog({ open, onOpenChange, form, setForm, clients, submitting, onSubmit, isEdit }: {
  open: boolean
  onOpenChange: (open: boolean) => void
  form: Record<string, string>
  setForm: React.Dispatch<React.SetStateAction<Record<string, string>>>
  clients: Client[]
  submitting: boolean
  onSubmit: () => void
  isEdit?: boolean
}) {
  const updateField = (field: string, value: string) => {
    setForm((prev) => ({ ...prev, [field]: value }))
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{isEdit ? 'Edit Load' : 'Post New Load'}</DialogTitle>
        </DialogHeader>
        <DialogBody className="grid gap-4 py-2">
          {/* Title */}
          <div className="space-y-2">
            <Label>Title *</Label>
            <Input
              placeholder="e.g. Cement delivery to Kumasi"
              value={form.title}
              onChange={(e) => updateField('title', e.target.value)}
            />
          </div>

          {/* Pickup / Dropoff */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>Pickup Location *</Label>
              <Input
                placeholder="e.g. Tema Port"
                value={form.pickupLocation}
                onChange={(e) => updateField('pickupLocation', e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label>Dropoff Location *</Label>
              <Input
                placeholder="e.g. Kumasi Terminal"
                value={form.dropoffLocation}
                onChange={(e) => updateField('dropoffLocation', e.target.value)}
              />
            </div>
          </div>

          {/* Regions */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>Pickup Region *</Label>
              <Select value={form.pickupRegion} onValueChange={(v) => updateField('pickupRegion', v)}>
                <SelectTrigger><SelectValue placeholder="Select region" /></SelectTrigger>
                <SelectContent>
                  {GHANA_LOCATIONS.map((loc) => (
                    <SelectItem key={loc} value={loc}>{loc}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Dropoff Region *</Label>
              <Select value={form.dropoffRegion} onValueChange={(v) => updateField('dropoffRegion', v)}>
                <SelectTrigger><SelectValue placeholder="Select region" /></SelectTrigger>
                <SelectContent>
                  {GHANA_LOCATIONS.map((loc) => (
                    <SelectItem key={loc} value={loc}>{loc}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          {/* Commodity & Truck Type */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>Commodity Type *</Label>
              <Select value={form.commodityType} onValueChange={(v) => updateField('commodityType', v)}>
                <SelectTrigger><SelectValue placeholder="Select type" /></SelectTrigger>
                <SelectContent>
                  {COMMODITY_TYPES.map((t) => (
                    <SelectItem key={t} value={t}>{t}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Truck Type</Label>
              <Select value={form.truckType} onValueChange={(v) => updateField('truckType', v)}>
                <SelectTrigger><SelectValue placeholder="Select truck type" /></SelectTrigger>
                <SelectContent>
                  {TRUCK_TYPES.map((t) => (
                    <SelectItem key={t} value={t}>{t}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          {/* Weight & Rate */}
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
            <div className="space-y-2">
              <Label>Weight (kg)</Label>
              <Input
                type="number"
                placeholder="0"
                value={form.weight}
                onChange={(e) => updateField('weight', e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label>Offered Rate ({CURRENCY_SYMBOL})</Label>
              <Input
                type="number"
                placeholder="0"
                value={form.offeredRate}
                onChange={(e) => updateField('offeredRate', e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label>Truck Count</Label>
              <Input
                type="number"
                placeholder="1"
                value={form.truckCount}
                onChange={(e) => updateField('truckCount', e.target.value)}
              />
            </div>
          </div>

          {/* Budget Range */}
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>Budget Min ({CURRENCY_SYMBOL})</Label>
              <Input
                type="number"
                placeholder="0"
                value={form.budgetMin}
                onChange={(e) => updateField('budgetMin', e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label>Budget Max ({CURRENCY_SYMBOL})</Label>
              <Input
                type="number"
                placeholder="0"
                value={form.budgetMax}
                onChange={(e) => updateField('budgetMax', e.target.value)}
              />
            </div>
          </div>

          {/* Dates */}
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>Pickup Date</Label>
              <DatePicker value={form.pickupDate} onChange={(val) => updateField('pickupDate', val)} />
            </div>
            <div className="space-y-2">
              <Label>Delivery Date</Label>
              <DatePicker value={form.deliveryDate} onChange={(val) => updateField('deliveryDate', val)} />
            </div>
          </div>

          {/* Requirements */}
          <div className="space-y-2">
            <Label>Requirements</Label>
            <Textarea
              placeholder="Special requirements, instructions..."
              value={form.requirements}
              onChange={(e) => updateField('requirements', e.target.value)}
              rows={3}
            />
          </div>

          {/* Client */}
          <div className="space-y-2">
            <Label>Client (optional)</Label>
            <Select value={form.clientId} onValueChange={(v) => updateField('clientId', v)}>
              <SelectTrigger><SelectValue placeholder="Select client" /></SelectTrigger>
              <SelectContent>
                {clients.map((c) => (
                  <SelectItem key={c.id} value={c.id}>{c.companyName}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Contact Info */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>Contact Name</Label>
              <Input
                placeholder="Contact person"
                value={form.contactName}
                onChange={(e) => updateField('contactName', e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label>Contact Phone</Label>
              <Input
                placeholder="Phone number"
                value={form.contactPhone}
                onChange={(e) => updateField('contactPhone', e.target.value)}
              />
            </div>
          </div>
        </DialogBody>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button onClick={onSubmit} disabled={submitting} className="bg-emerald-500 hover:bg-emerald-600 text-white">
            {submitting ? (isEdit ? 'Saving...' : 'Posting...') : (isEdit ? 'Save Changes' : 'Post Load')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
