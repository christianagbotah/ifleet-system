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
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from '@/components/ui/dialog'
import { Skeleton } from '@/components/ui/skeleton'
import {
  Scale, Weight, Truck, Plus, RefreshCw,
  FileEdit, Trash2, ArrowUpDown, MapPin, Clock,
  MoreHorizontal, AlertTriangle, CheckCircle,
} from 'lucide-react'
import {
  apiFetch, fetchTrips,
  type Trip,
} from '@/lib/api'
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'

// ── Types ──

interface WeightVerification {
  id: string
  tripId: string
  checkpointType: string
  verifiedWeight: number
  declaredWeight: number | null
  variance: number | null
  variancePercent: number | null
  status: string
  verifiedBy: string | null
  verifiedByName: string | null
  notes: string | null
  location: string | null
  createdAt: string
  updatedAt: string
  trip: {
    id: string
    tripNumber: string
    itemName: string
    truck: { id: string; plateNumber: string }
    driver: { id: string; firstName: string; lastName: string }
  } | null
}

interface WeightVerificationSummary {
  total: number
  overweightCount: number
  underweightCount: number
  avgVariancePercent: string
}

interface WeightVerificationResponse {
  records: WeightVerification[]
  pagination: { page: number; limit: number; total: number; pages: number }
  summary: WeightVerificationSummary
}

// ── Status Config ──

const STATUS_CONFIG: Record<string, { label: string; color: string }> = {
  verified: { label: 'Verified', color: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400' },
  overweight: { label: 'Overweight', color: 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400' },
  underweight: { label: 'Underweight', color: 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400' },
  disputed: { label: 'Disputed', color: 'bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-400' },
}

const CHECKPOINT_LABELS: Record<string, string> = {
  origin_loading: 'Origin Loading',
  border_crossing: 'Border Crossing',
  destination_offloading: 'Destination Offloading',
}

const CHECKPOINT_OPTIONS = [
  { value: 'origin_loading', label: 'Origin Loading' },
  { value: 'border_crossing', label: 'Border Crossing' },
  { value: 'destination_offloading', label: 'Destination Offloading' },
]

// ── Variance color helper ──

function getVarianceColor(variancePercent: number | null | undefined): string {
  if (variancePercent == null) return 'text-muted-foreground'
  const abs = Math.abs(variancePercent)
  if (abs <= 2) return 'text-emerald-600 dark:text-emerald-400'
  if (abs <= 5) return 'text-amber-600 dark:text-amber-400'
  return 'text-red-600 dark:text-red-400'
}

function getVarianceBg(variancePercent: number | null | undefined): string {
  if (variancePercent == null) return ''
  const abs = Math.abs(variancePercent)
  if (abs <= 2) return 'bg-emerald-50 dark:bg-emerald-900/20'
  if (abs <= 5) return 'bg-amber-50 dark:bg-amber-900/20'
  return 'bg-red-50 dark:bg-red-900/20'
}

function formatDate(dateStr: string): string {
  return new Date(dateStr).toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  })
}

function formatDateTime(dateStr: string): string {
  return new Date(dateStr).toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  })
}

// ── Component ──

export function WeightVerificationView() {
  const [verifications, setVerifications] = useState<WeightVerification[]>([])
  const [summary, setSummary] = useState<WeightVerificationSummary>({
    total: 0,
    overweightCount: 0,
    underweightCount: 0,
    avgVariancePercent: '0.0',
  })
  const [total, setTotal] = useState(0)
  const [page, setPage] = useState(1)
  const [loading, setLoading] = useState(true)
  const [activeTab, setActiveTab] = useState('all')

  // Dialogs
  const [showCreateDialog, setShowCreateDialog] = useState(false)
  const [showUpdateDialog, setShowUpdateDialog] = useState(false)
  const [showDeleteDialog, setShowDeleteDialog] = useState(false)
  const [selected, setSelected] = useState<WeightVerification | null>(null)

  // Create form
  const [trips, setTrips] = useState<Trip[]>([])

  const loadData = useCallback(async () => {
    setLoading(true)
    try {
      const params: Record<string, unknown> = { page, limit: 20 }
      if (activeTab !== 'all') params.status = activeTab
      const res = await apiFetch<WeightVerificationResponse>(`/api/weight-verifications?${new URLSearchParams(
        Object.entries(params).map(([k, v]) => [k, String(v)])
      ).toString()}`)
      setVerifications(res.records)
      setTotal(res.pagination.total)
      if (res.summary) {
        setSummary({
          total: res.summary.total,
          overweightCount: res.summary.overweightCount,
          underweightCount: res.summary.underweightCount,
          avgVariancePercent: res.summary.avgVariancePercent,
        })
      }
    } catch (err) {
      console.error(err)
      toast.error('Failed to load weight verifications')
    } finally {
      setLoading(false)
    }
  }, [page, activeTab])

  useEffect(() => { loadData() }, [loadData])

  const loadFormOptions = useCallback(async () => {
    try {
      const tripRes = await fetchTrips({ limit: 200 })
      setTrips(tripRes.data || [])
    } catch (err) {
      console.error(err)
    }
  }, [])

  const handleOpenCreate = () => {
    loadFormOptions()
    setShowCreateDialog(true)
  }

  const handleOpenUpdate = (v: WeightVerification) => {
    setSelected(v)
    setShowUpdateDialog(true)
  }

  const handleOpenDelete = (v: WeightVerification) => {
    setSelected(v)
    setShowDeleteDialog(true)
  }

  const handleCreate = async (data: Record<string, unknown>) => {
    try {
      await apiFetch<WeightVerification>('/api/weight-verifications', {
        method: 'POST',
        body: JSON.stringify(data),
      })
      setShowCreateDialog(false)
      toast.success('Weight verification created successfully')
      loadData()
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to create weight verification')
    }
  }

  const handleUpdate = async (data: Record<string, unknown>) => {
    if (!selected) return
    try {
      await apiFetch<WeightVerification>(`/api/weight-verifications/${selected.id}`, {
        method: 'PUT',
        body: JSON.stringify(data),
      })
      setShowUpdateDialog(false)
      setSelected(null)
      toast.success('Weight verification updated')
      loadData()
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to update weight verification')
    }
  }

  const handleDelete = async () => {
    if (!selected) return
    try {
      await apiFetch<void>(`/api/weight-verifications/${selected.id}`, { method: 'DELETE' })
      setShowDeleteDialog(false)
      setSelected(null)
      toast.success('Weight verification deleted')
      loadData()
    } catch (err) {
      toast.error('Failed to delete weight verification')
    }
  }

  const summaryCards = [
    { label: 'Total Verifications', value: summary.total, icon: Scale, color: 'text-blue-600 dark:text-blue-400', bg: 'bg-blue-50 dark:bg-blue-900/20' },
    { label: 'Overweight', value: summary.overweightCount, icon: AlertTriangle, color: 'text-red-600 dark:text-red-400', bg: 'bg-red-50 dark:bg-red-900/20' },
    { label: 'Underweight', value: summary.underweightCount, icon: ArrowUpDown, color: 'text-amber-600 dark:text-amber-400', bg: 'bg-amber-50 dark:bg-amber-900/20' },
    { label: 'Avg Variance %', value: `${summary.avgVariancePercent}%`, icon: Weight, color: 'text-emerald-600 dark:text-emerald-400', bg: 'bg-emerald-50 dark:bg-emerald-900/20' },
  ]

  const totalPages = Math.ceil(total / 20)

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Weight Verification</h1>
          <p className="text-sm text-muted-foreground">Track and verify cargo weights at checkpoints</p>
        </div>
        <Button onClick={handleOpenCreate} className="gap-2">
          <Plus className="h-4 w-4" /> New Verification
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
            <TabsTrigger value="verified">Verified</TabsTrigger>
            <TabsTrigger value="overweight">Overweight</TabsTrigger>
            <TabsTrigger value="underweight">Underweight</TabsTrigger>
            <TabsTrigger value="disputed">Disputed</TabsTrigger>
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
                <th className="text-left p-3 font-medium">Checkpoint</th>
                <th className="text-left p-3 font-medium">Verified (t)</th>
                <th className="text-left p-3 font-medium">Declared (t)</th>
                <th className="text-left p-3 font-medium">Variance %</th>
                <th className="text-left p-3 font-medium">Status</th>
                <th className="text-left p-3 font-medium">Date</th>
                <th className="text-right p-3 font-medium">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {loading ? (
                Array.from({ length: 5 }).map((_, i) => (
                  <tr key={i}>
                    {Array.from({ length: 9 }).map((_, j) => (
                      <td key={j} className="p-3"><Skeleton className="h-5 w-16" /></td>
                    ))}
                  </tr>
                ))
              ) : verifications.length === 0 ? (
                <tr>
                  <td colSpan={9}>
                    <div className="flex flex-col items-center justify-center py-12 text-center">
                      <div className="rounded-full bg-muted p-4 mb-4">
                        <Scale className="h-8 w-8 text-muted-foreground" />
                      </div>
                      <h3 className="text-lg font-semibold mb-1">No verifications found</h3>
                      <p className="text-sm text-muted-foreground">No weight verifications match the current filter.</p>
                    </div>
                  </td>
                </tr>
              ) : (
                verifications.map((v, i) => (
                  <motion.tr
                    key={v.id}
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    transition={{ delay: i * 0.02 }}
                    className="hover:bg-muted/30"
                  >
                    <td className="p-3 font-medium">{v.trip?.tripNumber || '—'}</td>
                    <td className="p-3">
                      <div className="flex items-center gap-2">
                        <Truck className="h-4 w-4 text-muted-foreground" />
                        {v.trip?.truck?.plateNumber || '—'}
                      </div>
                    </td>
                    <td className="p-3">
                      <div className="flex items-center gap-2">
                        <MapPin className="h-4 w-4 text-muted-foreground" />
                        {CHECKPOINT_LABELS[v.checkpointType] || v.checkpointType}
                      </div>
                    </td>
                    <td className="p-3 font-medium">{v.verifiedWeight.toFixed(2)}</td>
                    <td className="p-3">{v.declaredWeight != null ? v.declaredWeight.toFixed(2) : '—'}</td>
                    <td className="p-3">
                      {v.variancePercent != null ? (
                        <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-xs font-medium ${getVarianceBg(v.variancePercent)} ${getVarianceColor(v.variancePercent)}`}>
                          <ArrowUpDown className="h-3 w-3" />
                          {v.variancePercent > 0 ? '+' : ''}{v.variancePercent.toFixed(1)}%
                        </span>
                      ) : '—'}
                    </td>
                    <td className="p-3">
                      <Badge variant="outline" className={`border-transparent font-medium ${STATUS_CONFIG[v.status]?.color || ''}`}>
                        {STATUS_CONFIG[v.status]?.label || v.status}
                      </Badge>
                    </td>
                    <td className="p-3">
                      <div className="flex items-center gap-1">
                        <Clock className="h-3.5 w-3.5 text-muted-foreground" />
                        {formatDate(v.createdAt)}
                      </div>
                    </td>
                    <td className="p-3 text-right">
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button variant="ghost" size="sm" className="h-8 w-8 p-0">
                            <MoreHorizontal className="h-4 w-4" />
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                          <DropdownMenuItem onClick={() => handleOpenUpdate(v)}>
                            <FileEdit className="h-4 w-4 mr-2" /> Update
                          </DropdownMenuItem>
                          <DropdownMenuItem
                            className="text-red-600"
                            onClick={() => handleOpenDelete(v)}
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
        ) : verifications.length === 0 ? (
          <Card className="p-6">
            <div className="flex flex-col items-center justify-center py-8 text-center">
              <div className="rounded-full bg-muted p-4 mb-4">
                <Scale className="h-8 w-8 text-muted-foreground" />
              </div>
              <h3 className="text-lg font-semibold mb-1">No verifications found</h3>
              <p className="text-sm text-muted-foreground">No weight verifications match the current filter.</p>
            </div>
          </Card>
        ) : (
          verifications.map((v, i) => (
            <motion.div
              key={v.id}
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: i * 0.03 }}
            >
              <Card className="p-4">
                <div className="flex items-start justify-between mb-3">
                  <div>
                    <p className="font-semibold">{CHECKPOINT_LABELS[v.checkpointType] || v.checkpointType}</p>
                    <p className="text-xs text-muted-foreground">Trip: {v.trip?.tripNumber || '—'}</p>
                  </div>
                  <Badge variant="outline" className={`border-transparent font-medium ${STATUS_CONFIG[v.status]?.color || ''}`}>
                    {STATUS_CONFIG[v.status]?.label || v.status}
                  </Badge>
                </div>
                <div className="grid grid-cols-2 gap-2 text-sm mb-3">
                  <div className="flex items-center gap-1.5">
                    <Truck className="h-3.5 w-3.5 text-muted-foreground" />
                    <span>{v.trip?.truck?.plateNumber || '—'}</span>
                  </div>
                  <div className="flex items-center gap-1.5">
                    <Weight className="h-3.5 w-3.5 text-muted-foreground" />
                    <span>{v.verifiedWeight.toFixed(2)}t</span>
                  </div>
                  <div className="flex items-center gap-1.5">
                    <MapPin className="h-3.5 w-3.5 text-muted-foreground" />
                    <span>{v.location || '—'}</span>
                  </div>
                  {v.variancePercent != null && (
                    <div className="flex items-center gap-1.5">
                      <ArrowUpDown className="h-3.5 w-3.5 text-muted-foreground" />
                      <span className={getVarianceColor(v.variancePercent)}>
                        {v.variancePercent > 0 ? '+' : ''}{v.variancePercent.toFixed(1)}%
                      </span>
                    </div>
                  )}
                  <div className="flex items-center gap-1.5">
                    <Clock className="h-3.5 w-3.5 text-muted-foreground" />
                    <span>{formatDateTime(v.createdAt)}</span>
                  </div>
                </div>
                <div className="flex justify-end gap-2">
                  <Button variant="outline" size="sm" onClick={() => handleOpenUpdate(v)} className="gap-1 h-8">
                    <FileEdit className="h-3.5 w-3.5" /> Update
                  </Button>
                  <Button variant="outline" size="sm" onClick={() => handleOpenDelete(v)} className="gap-1 h-8 text-red-600 hover:text-red-700">
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
        <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>New Weight Verification</DialogTitle>
            <DialogDescription>Record a weight check at a checkpoint</DialogDescription>
          </DialogHeader>
          <CreateForm trips={trips} onSubmit={handleCreate} onCancel={() => setShowCreateDialog(false)} />
        </DialogContent>
      </Dialog>

      {/* Update Dialog */}
      <Dialog open={showUpdateDialog} onOpenChange={(open) => { if (!open) { setShowUpdateDialog(false); setSelected(null) } }}>
        <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Update Weight Verification</DialogTitle>
            <DialogDescription>Modify verification details, status, and notes</DialogDescription>
          </DialogHeader>
          <UpdateForm verification={selected} onSubmit={handleUpdate} onCancel={() => { setShowUpdateDialog(false); setSelected(null) }} />
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation Dialog */}
      <Dialog open={showDeleteDialog} onOpenChange={(open) => { if (!open) { setShowDeleteDialog(false); setSelected(null) } }}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Delete Verification</DialogTitle>
            <DialogDescription>
              Are you sure you want to delete this weight verification? This action cannot be undone.
            </DialogDescription>
          </DialogHeader>
          {selected && (
            <div className="rounded-lg bg-muted/50 p-3 space-y-1 text-sm">
              <p className="font-medium">Trip: {selected.trip?.tripNumber || '—'}</p>
              <p className="text-muted-foreground">
                {CHECKPOINT_LABELS[selected.checkpointType] || selected.checkpointType} — {selected.verifiedWeight}t verified
              </p>
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => { setShowDeleteDialog(false); setSelected(null) }}>Cancel</Button>
            <Button variant="destructive" onClick={handleDelete}>Delete</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}

// ── Create Form ──

function CreateForm({ trips, onSubmit, onCancel }: {
  trips: Trip[]
  onSubmit: (data: Record<string, unknown>) => void
  onCancel: () => void
}) {
  const [tripId, setTripId] = useState('')
  const [checkpointType, setCheckpointType] = useState('')
  const [verifiedWeight, setVerifiedWeight] = useState('')
  const [declaredWeight, setDeclaredWeight] = useState('')
  const [notes, setNotes] = useState('')
  const [location, setLocation] = useState('')
  const [submitting, setSubmitting] = useState(false)

  const handleSubmit = async () => {
    if (!tripId || !checkpointType || !verifiedWeight) {
      toast.error('Please fill all required fields')
      return
    }
    setSubmitting(true)
    try {
      await onSubmit({
        tripId,
        checkpointType,
        verifiedWeight: parseFloat(verifiedWeight),
        declaredWeight: declaredWeight ? parseFloat(declaredWeight) : null,
        notes: notes || null,
        location: location || null,
      })
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="space-y-4">
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

      <div className="space-y-2">
        <Label>Checkpoint Type *</Label>
        <Select value={checkpointType} onValueChange={setCheckpointType}>
          <SelectTrigger><SelectValue placeholder="Select checkpoint" /></SelectTrigger>
          <SelectContent>
            {CHECKPOINT_OPTIONS.map(cp => (
              <SelectItem key={cp.value} value={cp.value}>
                {cp.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div className="space-y-2">
          <Label>Verified Weight (tonnes) *</Label>
          <Input
            type="number"
            step="0.01"
            placeholder="e.g. 28.5"
            value={verifiedWeight}
            onChange={e => setVerifiedWeight(e.target.value)}
          />
        </div>
        <div className="space-y-2">
          <Label>Declared Weight (tonnes)</Label>
          <Input
            type="number"
            step="0.01"
            placeholder="e.g. 27.0"
            value={declaredWeight}
            onChange={e => setDeclaredWeight(e.target.value)}
          />
        </div>
      </div>

      <div className="space-y-2">
        <Label>Location</Label>
        <Input
          placeholder="e.g. Tema Harbour Weighbridge"
          value={location}
          onChange={e => setLocation(e.target.value)}
        />
      </div>

      <div className="space-y-2">
        <Label>Notes</Label>
        <Textarea
          placeholder="Additional notes about this verification..."
          value={notes}
          onChange={e => setNotes(e.target.value)}
          rows={3}
        />
      </div>

      <DialogFooter>
        <Button variant="outline" onClick={onCancel}>Cancel</Button>
        <Button onClick={handleSubmit} disabled={submitting}>
          {submitting ? 'Creating...' : 'Create Verification'}
        </Button>
      </DialogFooter>
    </div>
  )
}

// ── Update Form ──

function UpdateForm({ verification, onSubmit, onCancel }: {
  verification: WeightVerification | null
  onSubmit: (data: Record<string, unknown>) => void
  onCancel: () => void
}) {
  const [checkpointType, setCheckpointType] = useState(verification?.checkpointType || '')
  const [verifiedWeight, setVerifiedWeight] = useState(verification?.verifiedWeight?.toString() || '')
  const [declaredWeight, setDeclaredWeight] = useState(verification?.declaredWeight?.toString() || '')
  const [status, setStatus] = useState(verification?.status || '')
  const [notes, setNotes] = useState(verification?.notes || '')
  const [location, setLocation] = useState(verification?.location || '')
  const [submitting, setSubmitting] = useState(false)

  const handleSubmit = async () => {
    if (!verifiedWeight) {
      toast.error('Verified weight is required')
      return
    }
    setSubmitting(true)
    try {
      const data: Record<string, unknown> = {
        checkpointType,
        verifiedWeight: parseFloat(verifiedWeight),
        declaredWeight: declaredWeight ? parseFloat(declaredWeight) : null,
        status,
        location: location || null,
        notes: notes || null,
      }
      await onSubmit(data)
    } finally {
      setSubmitting(false)
    }
  }

  if (!verification) return null

  return (
    <div className="space-y-4">
      {/* Verification Info */}
      <div className="rounded-lg bg-muted/50 p-3 space-y-1 text-sm">
        <p className="font-medium">Trip: {verification.trip?.tripNumber || '—'}</p>
        <p className="text-muted-foreground">
          Truck: {verification.trip?.truck?.plateNumber || '—'} | Driver: {verification.trip?.driver ? `${verification.trip.driver.firstName} ${verification.trip.driver.lastName}` : '—'}
        </p>
        <p className="text-muted-foreground">
          Verified: {verification.verifiedWeight}t | Declared: {verification.declaredWeight != null ? `${verification.declaredWeight}t` : '—'} | Variance: {verification.variancePercent != null ? `${verification.variancePercent > 0 ? '+' : ''}${verification.variancePercent.toFixed(1)}%` : '—'}
        </p>
        {verification.verifiedByName && (
          <p className="text-muted-foreground">Verified by: {verification.verifiedByName}</p>
        )}
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div className="space-y-2">
          <Label>Checkpoint Type *</Label>
          <Select value={checkpointType} onValueChange={setCheckpointType}>
            <SelectTrigger><SelectValue placeholder="Select checkpoint" /></SelectTrigger>
            <SelectContent>
              {CHECKPOINT_OPTIONS.map(cp => (
                <SelectItem key={cp.value} value={cp.value}>
                  {cp.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-2">
          <Label>Status</Label>
          <Select value={status} onValueChange={setStatus}>
            <SelectTrigger><SelectValue placeholder="Select status" /></SelectTrigger>
            <SelectContent>
              {Object.entries(STATUS_CONFIG).map(([key, val]) => (
                <SelectItem key={key} value={key}>{val.label}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div className="space-y-2">
          <Label>Verified Weight (tonnes) *</Label>
          <Input
            type="number"
            step="0.01"
            placeholder="e.g. 28.5"
            value={verifiedWeight}
            onChange={e => setVerifiedWeight(e.target.value)}
          />
        </div>
        <div className="space-y-2">
          <Label>Declared Weight (tonnes)</Label>
          <Input
            type="number"
            step="0.01"
            placeholder="e.g. 27.0"
            value={declaredWeight}
            onChange={e => setDeclaredWeight(e.target.value)}
          />
        </div>
      </div>

      <div className="space-y-2">
        <Label>Location</Label>
        <Input
          placeholder="e.g. Tema Harbour Weighbridge"
          value={location}
          onChange={e => setLocation(e.target.value)}
        />
      </div>

      <div className="space-y-2">
        <Label>Notes</Label>
        <Textarea
          placeholder="Additional notes..."
          value={notes}
          onChange={e => setNotes(e.target.value)}
          rows={3}
        />
      </div>

      <DialogFooter>
        <Button variant="outline" onClick={onCancel}>Cancel</Button>
        <Button onClick={handleSubmit} disabled={submitting}>
          {submitting ? 'Updating...' : 'Update Verification'}
        </Button>
      </DialogFooter>
    </div>
  )
}
