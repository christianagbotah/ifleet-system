'use client'

import { useState, useEffect, useCallback } from 'react'
import { motion } from 'framer-motion'
import { toast } from 'sonner'
import { Card } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Dialog, DialogBody, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from '@/components/ui/dialog'
import { Skeleton } from '@/components/ui/skeleton'
import {
  Globe, Clock, CheckCircle, AlertTriangle, Plus, RefreshCw,
  Truck, User, Navigation, ArrowRightLeft, MoreHorizontal,
  FileEdit, Trash2, MapPin, Timer, DollarSign,
} from 'lucide-react'
import { CURRENCY_SYMBOL } from '@/lib/constants'
import {
  apiFetch, fetchBorderCrossings, createBorderCrossing,
  fetchTrucks, fetchDrivers, fetchTrips,
  type BorderCrossing, type Truck, type Driver, type Trip,
} from '@/lib/api'
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'

// ── Ghana Borders ──
const GHANA_BORDERS = [
  { name: 'Aflao', country: 'Togo' },
  { name: 'Elubo', country: "Côte d'Ivoire" },
  { name: 'Paga', country: 'Burkina Faso' },
  { name: 'Kpakor', country: 'Togo' },
]

// ── Status Config ──
const BORDER_STATUS: Record<string, { label: string; color: string }> = {
  queued: { label: 'Queued', color: 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400' },
  processing: { label: 'Processing', color: 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400' },
  cleared: { label: 'Cleared', color: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400' },
  denied: { label: 'Denied', color: 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400' },
  abandoned: { label: 'Abandoned', color: 'bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-400' },
}

const DIRECTION_LABELS: Record<string, string> = {
  outbound: 'Outbound',
  inbound: 'Inbound',
}

function formatWaitTime(minutes: number | null | undefined): string {
  if (minutes == null) return '—'
  if (minutes < 60) return `${minutes}m`
  const h = Math.floor(minutes / 60)
  const m = minutes % 60
  return m > 0 ? `${h}h ${m}m` : `${h}h`
}

// ── Component ──
export function BorderCrossingsView() {
  const [crossings, setCrossings] = useState<BorderCrossing[]>([])
  const [summary, setSummary] = useState({ activeCrossings: 0, avgWaitTime: 0, clearedToday: 0, pendingClearance: 0 })
  const [total, setTotal] = useState(0)
  const [page, setPage] = useState(1)
  const [loading, setLoading] = useState(true)
  const [activeTab, setActiveTab] = useState('all')

  // Dialogs
  const [showCreateDialog, setShowCreateDialog] = useState(false)
  const [showUpdateDialog, setShowUpdateDialog] = useState(false)
  const [selectedCrossing, setSelectedCrossing] = useState<BorderCrossing | null>(null)

  // Create form
  const [trucks, setTrucks] = useState<Truck[]>([])
  const [drivers, setDrivers] = useState<Driver[]>([])
  const [trips, setTrips] = useState<Trip[]>([])

  const loadData = useCallback(async () => {
    setLoading(true)
    try {
      const params: Record<string, unknown> = { page, limit: 20 }
      if (activeTab !== 'all') params.status = activeTab
      const res = await fetchBorderCrossings(params as Parameters<typeof fetchBorderCrossings>[0])
      setCrossings(res.data)
      setTotal(res.total || 0)
      if (res.summary) {
        setSummary({
          activeCrossings: res.summary.activeCrossings,
          avgWaitTime: res.summary.avgWaitTime,
          clearedToday: res.summary.clearedToday,
          pendingClearance: res.summary.pendingClearance,
        })
      }
    } catch (err) {
      console.error(err)
      toast.error('Failed to load border crossings')
    } finally {
      setLoading(false)
    }
  }, [page, activeTab])

  useEffect(() => { loadData() }, [loadData])

  const loadFormOptions = useCallback(async () => {
    try {
      const [truckRes, driverRes, tripRes] = await Promise.all([
        fetchTrucks({ limit: 200 }),
        fetchDrivers({ limit: 200 }),
        fetchTrips({ status: 'in_transit', limit: 200 }),
      ])
      setTrucks(truckRes.data || [])
      setDrivers(driverRes.data || [])
      setTrips(tripRes.data || [])
    } catch (err) {
      console.error(err)
    }
  }, [])

  const handleOpenCreate = () => {
    loadFormOptions()
    setShowCreateDialog(true)
  }

  const handleOpenUpdate = (crossing: BorderCrossing) => {
    setSelectedCrossing(crossing)
    setShowUpdateDialog(true)
  }

  const handleCreate = async (data: Record<string, unknown>) => {
    try {
      await createBorderCrossing(data)
      setShowCreateDialog(false)
      toast.success('Border crossing created successfully')
      loadData()
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to create border crossing')
    }
  }

  const handleUpdate = async (data: Record<string, unknown>) => {
    if (!selectedCrossing) return
    try {
      await apiFetch<BorderCrossing>(`/api/border-crossings/${selectedCrossing.id}`, {
        method: 'PUT',
        body: JSON.stringify(data),
      })
      setShowUpdateDialog(false)
      setSelectedCrossing(null)
      toast.success('Border crossing updated')
      loadData()
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to update border crossing')
    }
  }

  const handleDelete = async (id: string) => {
    try {
      await apiFetch<void>(`/api/border-crossings/${id}`, { method: 'DELETE' })
      toast.success('Border crossing deleted')
      loadData()
    } catch (err) {
      toast.error('Failed to delete border crossing')
    }
  }

  const summaryCards = [
    { label: 'Active Crossings', value: summary.activeCrossings, icon: Globe, color: 'text-blue-600 dark:text-blue-400', bg: 'bg-blue-50 dark:bg-blue-900/20' },
    { label: 'Avg Wait Time', value: formatWaitTime(summary.avgWaitTime), icon: Clock, color: 'text-amber-600 dark:text-amber-400', bg: 'bg-amber-50 dark:bg-amber-900/20' },
    { label: 'Cleared Today', value: summary.clearedToday, icon: CheckCircle, color: 'text-emerald-600 dark:text-emerald-400', bg: 'bg-emerald-50 dark:bg-emerald-900/20' },
    { label: 'Queued', value: summary.pendingClearance, icon: AlertTriangle, color: 'text-orange-600 dark:text-orange-400', bg: 'bg-orange-50 dark:bg-orange-900/20' },
  ]

  const totalPages = Math.ceil(total / 20)

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Border Crossings</h1>
          <p className="text-sm text-muted-foreground">Track and manage truck crossings at Ghana borders</p>
        </div>
        <Button onClick={handleOpenCreate} className="gap-2">
          <Plus className="h-4 w-4" /> New Crossing
        </Button>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {summaryCards.map((card, i) => (
          <motion.div key={card.label} initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.05 }}>
            <Card className="p-4">
              <div className="flex items-center gap-3">
                <div className={`p-2 rounded-lg ${card.bg}`}>
                  <card.icon className={`h-5 w-5 ${card.color}`} />
                </div>
                <div>
                  <p className="text-2xl font-bold">{loading ? <Skeleton className="h-7 w-12" /> : card.value}</p>
                  <p className="text-xs text-muted-foreground">{card.label}</p>
                </div>
              </div>
            </Card>
          </motion.div>
        ))}
      </div>

      {/* Tabs */}
      <div className="flex items-center gap-3">
        <Tabs value={activeTab} onValueChange={(v) => { setActiveTab(v); setPage(1) }}>
          <TabsList className="flex-wrap h-auto">
            <TabsTrigger value="all">All</TabsTrigger>
            <TabsTrigger value="queued">Queued</TabsTrigger>
            <TabsTrigger value="processing">Processing</TabsTrigger>
            <TabsTrigger value="cleared">Cleared</TabsTrigger>
            <TabsTrigger value="denied">Denied</TabsTrigger>
          </TabsList>
        </Tabs>
        <Button variant="outline" size="sm" onClick={loadData} className="gap-1 ml-auto">
          <RefreshCw className="h-3.5 w-3.5" /> Refresh
        </Button>
      </div>

      {/* Desktop Table */}
      <Card className="hidden md:block">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b bg-muted/50">
                <th className="text-left p-3 font-medium">Trip #</th>
                <th className="text-left p-3 font-medium">Truck</th>
                <th className="text-left p-3 font-medium">Driver</th>
                <th className="text-left p-3 font-medium">Border</th>
                <th className="text-left p-3 font-medium">Country</th>
                <th className="text-left p-3 font-medium">Direction</th>
                <th className="text-left p-3 font-medium">Status</th>
                <th className="text-left p-3 font-medium">Wait Time</th>
                <th className="text-left p-3 font-medium">Fee</th>
                <th className="text-right p-3 font-medium">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {loading ? (
                Array.from({ length: 5 }).map((_, i) => (
                  <tr key={i}>
                    {Array.from({ length: 10 }).map((_, j) => (
                      <td key={j} className="p-3"><Skeleton className="h-5 w-16" /></td>
                    ))}
                  </tr>
                ))
              ) : crossings.length === 0 ? (
                <tr>
                  <td colSpan={10}>
                    <div className="flex flex-col items-center justify-center py-12 text-center">
                      <div className="rounded-full bg-muted p-4 mb-4">
                        <Globe className="h-8 w-8 text-muted-foreground" />
                      </div>
                      <h3 className="text-lg font-semibold mb-1">No crossings found</h3>
                      <p className="text-sm text-muted-foreground">No border crossings match the current filter.</p>
                    </div>
                  </td>
                </tr>
              ) : (
                crossings.map((c, i) => (
                  <motion.tr
                    key={c.id}
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    transition={{ delay: i * 0.02 }}
                    className="hover:bg-muted/30"
                  >
                    <td className="p-3 font-medium">{c.trip?.tripNumber || '—'}</td>
                    <td className="p-3">
                      <div className="flex items-center gap-2">
                        <Truck className="h-4 w-4 text-muted-foreground" />
                        {c.truck?.plateNumber || '—'}
                      </div>
                    </td>
                    <td className="p-3">
                      <div className="flex items-center gap-2">
                        <User className="h-4 w-4 text-muted-foreground" />
                        {c.driver ? `${c.driver.firstName} ${c.driver.lastName}` : '—'}
                      </div>
                    </td>
                    <td className="p-3">
                      <div className="flex items-center gap-2">
                        <MapPin className="h-4 w-4 text-muted-foreground" />
                        {c.borderName}
                      </div>
                    </td>
                    <td className="p-3">{c.country}</td>
                    <td className="p-3">
                      <div className="flex items-center gap-1">
                        {c.direction === 'outbound' ? (
                          <ArrowRightLeft className="h-3.5 w-3.5 text-muted-foreground" />
                        ) : (
                          <ArrowRightLeft className="h-3.5 w-3.5 text-muted-foreground rotate-180" />
                        )}
                        {DIRECTION_LABELS[c.direction] || c.direction}
                      </div>
                    </td>
                    <td className="p-3">
                      <Badge variant="outline" className={`border-transparent font-medium ${BORDER_STATUS[c.status]?.color || ''}`}>
                        {BORDER_STATUS[c.status]?.label || c.status}
                      </Badge>
                    </td>
                    <td className="p-3">
                      <div className="flex items-center gap-1">
                        <Clock className="h-3.5 w-3.5 text-muted-foreground" />
                        {formatWaitTime(c.actualWait ?? c.estimatedWait)}
                      </div>
                    </td>
                    <td className="p-3">
                      {c.clearanceFee != null ? `${CURRENCY_SYMBOL}${c.clearanceFee.toFixed(2)}` : '—'}
                    </td>
                    <td className="p-3 text-right">
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button variant="ghost" size="sm" className="h-8 w-8 p-0">
                            <MoreHorizontal className="h-4 w-4" />
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                          <DropdownMenuItem onClick={() => handleOpenUpdate(c)}>
                            <FileEdit className="h-4 w-4 mr-2" /> Update Status
                          </DropdownMenuItem>
                          <DropdownMenuItem
                            className="text-red-600"
                            onClick={() => handleDelete(c.id)}
                          >
                            <Trash2 className="h-4 w-4 mr-2" /> Delete
                          </DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </td>
                  </motion.tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        {/* Pagination */}
        {totalPages > 1 && (
          <div className="flex items-center justify-between p-4 border-t">
            <p className="text-sm text-muted-foreground">
              Showing {((page - 1) * 20) + 1}–{Math.min(page * 20, total)} of {total}
            </p>
            <div className="flex gap-1">
              <Button variant="outline" size="sm" disabled={page <= 1} onClick={() => setPage(p => p - 1)}>Prev</Button>
              <Button variant="outline" size="sm" disabled={page >= totalPages} onClick={() => setPage(p => p + 1)}>Next</Button>
            </div>
          </div>
        )}
      </Card>

      {/* Mobile Card Layout */}
      <div className="md:hidden space-y-3">
        {loading ? (
          Array.from({ length: 4 }).map((_, i) => (
            <Card key={i} className="p-4 space-y-3">
              <Skeleton className="h-5 w-32" />
              <Skeleton className="h-4 w-48" />
              <Skeleton className="h-4 w-24" />
            </Card>
          ))
        ) : crossings.length === 0 ? (
          <Card className="p-6">
            <div className="flex flex-col items-center justify-center py-8 text-center">
              <div className="rounded-full bg-muted p-4 mb-4">
                <Globe className="h-8 w-8 text-muted-foreground" />
              </div>
              <h3 className="text-lg font-semibold mb-1">No crossings found</h3>
              <p className="text-sm text-muted-foreground">No border crossings match the current filter.</p>
            </div>
          </Card>
        ) : (
          crossings.map((c, i) => (
            <motion.div
              key={c.id}
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: i * 0.03 }}
            >
              <Card className="p-4">
                <div className="flex items-start justify-between mb-3">
                  <div>
                    <p className="font-semibold">{c.borderName} — {c.country}</p>
                    <p className="text-xs text-muted-foreground">Trip: {c.trip?.tripNumber || '—'}</p>
                  </div>
                  <Badge variant="outline" className={`border-transparent font-medium ${BORDER_STATUS[c.status]?.color || ''}`}>
                    {BORDER_STATUS[c.status]?.label || c.status}
                  </Badge>
                </div>
                <div className="grid grid-cols-2 gap-2 text-sm mb-3">
                  <div className="flex items-center gap-1.5">
                    <Truck className="h-3.5 w-3.5 text-muted-foreground" />
                    <span>{c.truck?.plateNumber || '—'}</span>
                  </div>
                  <div className="flex items-center gap-1.5">
                    <User className="h-3.5 w-3.5 text-muted-foreground" />
                    <span>{c.driver ? `${c.driver.firstName} ${c.driver.lastName}` : '—'}</span>
                  </div>
                  <div className="flex items-center gap-1.5">
                    <ArrowRightLeft className="h-3.5 w-3.5 text-muted-foreground" />
                    <span>{DIRECTION_LABELS[c.direction] || c.direction}</span>
                  </div>
                  <div className="flex items-center gap-1.5">
                    <Clock className="h-3.5 w-3.5 text-muted-foreground" />
                    <span>{formatWaitTime(c.actualWait ?? c.estimatedWait)}</span>
                  </div>
                  {c.clearanceFee != null && (
                    <div className="flex items-center gap-1.5">
                      <DollarSign className="h-3.5 w-3.5 text-muted-foreground" />
                      <span>{CURRENCY_SYMBOL}{c.clearanceFee.toFixed(2)}</span>
                    </div>
                  )}
                </div>
                <div className="flex justify-end gap-2">
                  <Button variant="outline" size="sm" onClick={() => handleOpenUpdate(c)} className="gap-1 h-8">
                    <FileEdit className="h-3.5 w-3.5" /> Update
                  </Button>
                  <Button variant="outline" size="sm" onClick={() => handleDelete(c.id)} className="gap-1 h-8 text-red-600 hover:text-red-700">
                    <Trash2 className="h-3.5 w-3.5" /> Delete
                  </Button>
                </div>
              </Card>
            </motion.div>
          ))
        )}
      </div>

      {/* Create Dialog */}
      <Dialog open={showCreateDialog} onOpenChange={setShowCreateDialog}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>New Border Crossing</DialogTitle>
            <DialogDescription>Create a new border crossing entry for a trip</DialogDescription>
          </DialogHeader>
          <CreateForm trucks={trucks} drivers={drivers} trips={trips} onSubmit={handleCreate} onCancel={() => setShowCreateDialog(false)} />
        </DialogContent>
      </Dialog>

      {/* Update Dialog */}
      <Dialog open={showUpdateDialog} onOpenChange={(open) => { if (!open) { setShowUpdateDialog(false); setSelectedCrossing(null) } }}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Update Border Crossing</DialogTitle>
            <DialogDescription>Change status, set wait time, clearance fee and notes</DialogDescription>
          </DialogHeader>
          <UpdateForm crossing={selectedCrossing} onSubmit={handleUpdate} onCancel={() => { setShowUpdateDialog(false); setSelectedCrossing(null) }} />
        </DialogContent>
      </Dialog>
    </div>
  )
}

// ── Create Form ──
function CreateForm({ trucks, drivers, trips, onSubmit, onCancel }: {
  trucks: Truck[]
  drivers: Driver[]
  trips: Trip[]
  onSubmit: (data: Record<string, unknown>) => void
  onCancel: () => void
}) {
  const [tripId, setTripId] = useState('')
  const [truckId, setTruckId] = useState('')
  const [driverId, setDriverId] = useState('')
  const [borderName, setBorderName] = useState('')
  const [country, setCountry] = useState('')
  const [direction, setDirection] = useState('')
  const [estimatedWait, setEstimatedWait] = useState('')
  const [clearanceFee, setClearanceFee] = useState('')
  const [notes, setNotes] = useState('')
  const [submitting, setSubmitting] = useState(false)

  const handleBorderChange = (name: string) => {
    setBorderName(name)
    const border = GHANA_BORDERS.find(b => b.name === name)
    if (border) setCountry(border.country)
  }

  const handleSubmit = async () => {
    if (!tripId || !truckId || !driverId || !borderName || !country || !direction) {
      toast.error('Please fill all required fields')
      return
    }
    setSubmitting(true)
    try {
      await onSubmit({
        tripId, truckId, driverId, borderName, country, direction,
        estimatedWait: estimatedWait ? parseInt(estimatedWait) : null,
        clearanceFee: clearanceFee ? parseFloat(clearanceFee) : null,
        notes: notes || null,
      })
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <>
      <DialogBody className="space-y-4">
      <div className="space-y-2">
        <Label>Trip *</Label>
        <Select value={tripId} onValueChange={setTripId}>
          <SelectTrigger><SelectValue placeholder="Select a trip" /></SelectTrigger>
          <SelectContent>
            {trips.map(t => (
              <SelectItem key={t.id} value={t.id}>
                {t.tripNumber} — {t.destination}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      <div className="grid grid-cols-2 gap-4">
        <div className="space-y-2">
          <Label>Truck *</Label>
          <Select value={truckId} onValueChange={setTruckId}>
            <SelectTrigger><SelectValue placeholder="Select truck" /></SelectTrigger>
            <SelectContent>
              {trucks.filter(t => t.status === 'active').map(t => (
                <SelectItem key={t.id} value={t.id}>
                  {t.plateNumber} ({t.make} {t.model})
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-2">
          <Label>Driver *</Label>
          <Select value={driverId} onValueChange={setDriverId}>
            <SelectTrigger><SelectValue placeholder="Select driver" /></SelectTrigger>
            <SelectContent>
              {drivers.filter(d => d.status === 'active').map(d => (
                <SelectItem key={d.id} value={d.id}>
                  {d.firstName} {d.lastName}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>
      <div className="grid grid-cols-2 gap-4">
        <div className="space-y-2">
          <Label>Border Name *</Label>
          <Select value={borderName} onValueChange={handleBorderChange}>
            <SelectTrigger><SelectValue placeholder="Select border" /></SelectTrigger>
            <SelectContent>
              {GHANA_BORDERS.map(b => (
                <SelectItem key={b.name} value={b.name}>
                  {b.name} ({b.country})
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-2">
          <Label>Country *</Label>
          <Select value={country} onValueChange={setCountry}>
            <SelectTrigger><SelectValue placeholder="Country" /></SelectTrigger>
            <SelectContent>
              {GHANA_BORDERS.map(b => (
                <SelectItem key={b.country} value={b.country}>
                  {b.country}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>
      <div className="grid grid-cols-2 gap-4">
        <div className="space-y-2">
          <Label>Direction *</Label>
          <Select value={direction} onValueChange={setDirection}>
            <SelectTrigger><SelectValue placeholder="Select direction" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="outbound">Outbound</SelectItem>
              <SelectItem value="inbound">Inbound</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-2">
          <Label>Est. Wait (min)</Label>
          <Input type="number" placeholder="e.g. 120" value={estimatedWait} onChange={e => setEstimatedWait(e.target.value)} />
        </div>
      </div>
      <div className="grid grid-cols-2 gap-4">
        <div className="space-y-2">
          <Label>Clearance Fee ({CURRENCY_SYMBOL})</Label>
          <Input type="number" step="0.01" placeholder="e.g. 50.00" value={clearanceFee} onChange={e => setClearanceFee(e.target.value)} />
        </div>
        <div className="space-y-2">
          <Label>Notes</Label>
          <Input placeholder="Optional notes" value={notes} onChange={e => setNotes(e.target.value)} />
        </div>
      </div>
      </DialogBody>
      <DialogFooter>
        <Button variant="outline" onClick={onCancel}>Cancel</Button>
        <Button onClick={handleSubmit} disabled={submitting}>
          {submitting ? 'Creating...' : 'Create Crossing'}
        </Button>
      </DialogFooter>
    </>
  )
}

// ── Update Form ──
function UpdateForm({ crossing, onSubmit, onCancel }: {
  crossing: BorderCrossing | null
  onSubmit: (data: Record<string, unknown>) => void
  onCancel: () => void
}) {
  const [status, setStatus] = useState(crossing?.status || '')
  const [actualWait, setActualWait] = useState(crossing?.actualWait?.toString() || '')
  const [clearanceFee, setClearanceFee] = useState(crossing?.clearanceFee?.toString() || '')
  const [notes, setNotes] = useState(crossing?.notes || '')
  const [submitting, setSubmitting] = useState(false)

  const handleSubmit = async () => {
    if (!status) {
      toast.error('Please select a status')
      return
    }
    setSubmitting(true)
    try {
      const data: Record<string, unknown> = { status }
      if (actualWait) data.actualWait = parseInt(actualWait)
      if (clearanceFee) data.clearanceFee = parseFloat(clearanceFee)
      if (notes) data.notes = notes
      await onSubmit(data)
    } finally {
      setSubmitting(false)
    }
  }

  if (!crossing) return null

  return (
    <>
      <DialogBody className="space-y-4">
      {/* Crossing Info */}
      <div className="rounded-lg bg-muted/50 p-3 space-y-1 text-sm">
        <p className="font-medium">{crossing.borderName} — {crossing.country}</p>
        <p className="text-muted-foreground">Truck: {crossing.truck?.plateNumber} | Driver: {crossing.driver ? `${crossing.driver.firstName} ${crossing.driver.lastName}` : '—'}</p>
        <p className="text-muted-foreground">Trip: {crossing.trip?.tripNumber || '—'} | Direction: {DIRECTION_LABELS[crossing.direction] || crossing.direction}</p>
      </div>

      <div className="space-y-2">
        <Label>Status *</Label>
        <Select value={status} onValueChange={setStatus}>
          <SelectTrigger><SelectValue placeholder="Select status" /></SelectTrigger>
          <SelectContent>
            {Object.entries(BORDER_STATUS).map(([key, val]) => (
              <SelectItem key={key} value={key}>{val.label}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      <div className="grid grid-cols-2 gap-4">
        <div className="space-y-2">
          <Label>Actual Wait (min)</Label>
          <Input type="number" placeholder="e.g. 90" value={actualWait} onChange={e => setActualWait(e.target.value)} />
        </div>
        <div className="space-y-2">
          <Label>Clearance Fee ({CURRENCY_SYMBOL})</Label>
          <Input type="number" step="0.01" placeholder="e.g. 50.00" value={clearanceFee} onChange={e => setClearanceFee(e.target.value)} />
        </div>
      </div>
      <div className="space-y-2">
        <Label>Notes</Label>
        <Textarea placeholder="Additional notes..." value={notes} onChange={e => setNotes(e.target.value)} rows={3} />
      </div>
      </DialogBody>
      <DialogFooter>
        <Button variant="outline" onClick={onCancel}>Cancel</Button>
        <Button onClick={handleSubmit} disabled={submitting}>
          {submitting ? 'Updating...' : 'Update Crossing'}
        </Button>
      </DialogFooter>
    </>
  )
}
