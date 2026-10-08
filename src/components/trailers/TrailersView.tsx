'use client'

import * as React from 'react'
import { Link2, Link2Off, Pencil, Plus, RefreshCw, Search, Truck, Warehouse } from 'lucide-react'
import { toast } from 'sonner'

import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import {
  Dialog,
  DialogBody,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { EmptyState } from '@/components/ui/empty-state'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Skeleton } from '@/components/ui/skeleton'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { useDebounce } from '@/hooks/use-debounce'
import { apiFetch } from '@/lib/api'
import { useAuthStore } from '@/lib/store/auth'

interface TrailerCouplingSummary {
  id: string
  tractor: { id: string; plateNumber: string; status: string }
  driver: { id: string; firstName: string; lastName: string; status: string } | null
  trip: { id: string; tripNumber: string; status: string; destination: string } | null
}

interface TrailerRecord {
  id: string
  plateNumber: string
  vinNumber: string | null
  chassisNumber: string | null
  trailerType: string
  bodyType: string | null
  axleCount: number | null
  tareWeight: number | null
  maxPayload: number | null
  status: string
  roadworthyExpiry: string | null
  registrationExpiry: string | null
  currentCoupling: TrailerCouplingSummary | null
}

interface TruckOption {
  id: string
  plateNumber: string
  status: string
}

interface DriverOption {
  id: string
  firstName: string
  lastName: string
  status: string
}

const blankForm = {
  plateNumber: '',
  vinNumber: '',
  chassisNumber: '',
  trailerType: 'semi-trailer',
  bodyType: 'flatbed',
  axleCount: '3',
  tareWeight: '',
  maxPayload: '',
  status: 'active',
}

type TrailerForm = typeof blankForm

export function TrailersView() {
  const { user } = useAuthStore()
  const canWrite = user?.role !== 'Driver'
  const [trailers, setTrailers] = React.useState<TrailerRecord[]>([])
  const [total, setTotal] = React.useState(0)
  const [loading, setLoading] = React.useState(true)
  const [error, setError] = React.useState<string | null>(null)
  const [search, setSearch] = React.useState('')
  const debouncedSearch = useDebounce(search, 300)
  const [status, setStatus] = React.useState('all')
  const [formOpen, setFormOpen] = React.useState(false)
  const [editing, setEditing] = React.useState<TrailerRecord | null>(null)
  const [form, setForm] = React.useState<TrailerForm>(blankForm)
  const [saving, setSaving] = React.useState(false)
  const [coupleOpen, setCoupleOpen] = React.useState(false)
  const [couplingTrailer, setCouplingTrailer] = React.useState<TrailerRecord | null>(null)
  const [trucks, setTrucks] = React.useState<TruckOption[]>([])
  const [drivers, setDrivers] = React.useState<DriverOption[]>([])
  const [tractorId, setTractorId] = React.useState('')
  const [driverId, setDriverId] = React.useState('')
  const [coupling, setCoupling] = React.useState(false)

  const loadTrailers = React.useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const query = new URLSearchParams({ limit: '100' })
      if (debouncedSearch) query.set('search', debouncedSearch)
      if (status !== 'all') query.set('status', status)
      const result = await apiFetch<{ data: TrailerRecord[]; total: number }>(`/api/trailers?${query}`)
      setTrailers(result.data ?? [])
      setTotal(result.total ?? 0)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to fetch trailers')
    } finally {
      setLoading(false)
    }
  }, [debouncedSearch, status])

  React.useEffect(() => {
    loadTrailers()
  }, [loadTrailers])

  function openCreate() {
    setEditing(null)
    setForm(blankForm)
    setFormOpen(true)
  }

  function openEdit(item: TrailerRecord) {
    setEditing(item)
    setForm({
      plateNumber: item.plateNumber,
      vinNumber: item.vinNumber ?? '',
      chassisNumber: item.chassisNumber ?? '',
      trailerType: item.trailerType,
      bodyType: item.bodyType ?? '',
      axleCount: item.axleCount ? String(item.axleCount) : '',
      tareWeight: item.tareWeight ? String(item.tareWeight) : '',
      maxPayload: item.maxPayload ? String(item.maxPayload) : '',
      status: item.status,
    })
    setFormOpen(true)
  }

  async function saveTrailer(event: React.FormEvent) {
    event.preventDefault()
    if (!form.plateNumber.trim() || !form.trailerType.trim()) {
      toast.error('Plate number and trailer type are required')
      return
    }

    setSaving(true)
    try {
      const payload = {
        plateNumber: form.plateNumber,
        vinNumber: form.vinNumber || null,
        chassisNumber: form.chassisNumber || null,
        trailerType: form.trailerType,
        bodyType: form.bodyType || null,
        axleCount: form.axleCount || null,
        tareWeight: form.tareWeight || null,
        maxPayload: form.maxPayload || null,
        status: form.status,
      }
      if (editing) {
        await apiFetch(`/api/trailers/${editing.id}`, { method: 'PATCH', body: JSON.stringify(payload) })
        toast.success('Trailer updated')
      } else {
        await apiFetch('/api/trailers', { method: 'POST', body: JSON.stringify(payload) })
        toast.success('Trailer created')
      }
      setFormOpen(false)
      await loadTrailers()
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to save trailer')
    } finally {
      setSaving(false)
    }
  }

  async function openCoupling(item: TrailerRecord) {
    setCouplingTrailer(item)
    setTractorId('')
    setDriverId('')
    try {
      const [truckResult, driverResult] = await Promise.all([
        apiFetch<{ data: TruckOption[] }>('/api/trucks?limit=100&status=active'),
        apiFetch<{ data: DriverOption[] }>('/api/drivers?limit=100&status=active'),
      ])
      setTrucks(truckResult.data ?? [])
      setDrivers(driverResult.data ?? [])
      setCoupleOpen(true)
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to load coupling candidates')
    }
  }

  async function coupleTrailer() {
    if (!couplingTrailer || !tractorId) return
    setCoupling(true)
    try {
      await apiFetch(`/api/trailers/${couplingTrailer.id}/couplings`, {
        method: 'POST',
        body: JSON.stringify({ action: 'couple', tractorId, driverId: driverId || null }),
      })
      toast.success('Trailer coupled to tractor')
      setCoupleOpen(false)
      await loadTrailers()
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to couple trailer')
    } finally {
      setCoupling(false)
    }
  }

  async function decoupleTrailer(item: TrailerRecord) {
    if (!item.currentCoupling) return
    setCoupling(true)
    try {
      await apiFetch(`/api/trailers/${item.id}/couplings`, {
        method: 'POST',
        body: JSON.stringify({ action: 'decouple' }),
      })
      toast.success('Trailer decoupled')
      await loadTrailers()
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to decouple trailer')
    } finally {
      setCoupling(false)
    }
  }

  return (
    <div className="space-y-4 sm:space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Trailer Assets</h1>
          <p className="text-muted-foreground">Manage trailers and live tractor-trailer combinations ({total} total)</p>
        </div>
        {canWrite && (
          <Button onClick={openCreate} className="bg-amber-500 text-white hover:bg-amber-600">
            <Plus className="mr-2 h-4 w-4" /> Add Trailer
          </Button>
        )}
      </div>

      <div className="flex flex-col gap-3 sm:flex-row">
        <div className="relative flex-1">
          <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
          <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search plate, VIN, chassis or type..." className="pl-8" />
        </div>
        <Select value={status} onValueChange={setStatus}>
          <SelectTrigger className="w-full sm:w-48"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All statuses</SelectItem>
            <SelectItem value="active">Active</SelectItem>
            <SelectItem value="maintenance">Maintenance</SelectItem>
            <SelectItem value="inactive">Inactive</SelectItem>
            <SelectItem value="out_of_service">Out of service</SelectItem>
            <SelectItem value="decommissioned">Decommissioned</SelectItem>
          </SelectContent>
        </Select>
      </div>

      <Card>
        <CardContent className="p-0">
          {error ? (
            <div className="flex flex-col items-center gap-3 py-12 text-center">
              <p className="text-sm text-red-600">{error}</p>
              <Button variant="outline" size="sm" onClick={loadTrailers}><RefreshCw className="mr-2 h-4 w-4" />Retry</Button>
            </div>
          ) : loading ? (
            <div className="space-y-3 p-4">{[1, 2, 3, 4].map((i) => <Skeleton key={i} className="h-14 w-full" />)}</div>
          ) : trailers.length === 0 ? (
            <EmptyState icon={Warehouse} title="No trailers found" description="Add a trailer asset or adjust the current filters." action={canWrite ? { label: 'Add Trailer', onClick: openCreate } : undefined} />
          ) : (
            <>
              <div className="hidden overflow-x-auto md:block">
                <Table>
                  <TableHeader><TableRow><TableHead>Plate</TableHead><TableHead>Type</TableHead><TableHead>Axles / Payload</TableHead><TableHead>Status</TableHead><TableHead>Current Combination</TableHead><TableHead className="text-right">Actions</TableHead></TableRow></TableHeader>
                  <TableBody>{trailers.map((item) => <TrailerRow key={item.id} item={item} canWrite={canWrite} busy={coupling} onEdit={openEdit} onCouple={openCoupling} onDecouple={decoupleTrailer} />)}</TableBody>
                </Table>
              </div>
              <div className="divide-y md:hidden">{trailers.map((item) => <TrailerCard key={item.id} item={item} canWrite={canWrite} busy={coupling} onEdit={openEdit} onCouple={openCoupling} onDecouple={decoupleTrailer} />)}</div>
            </>
          )}
        </CardContent>
      </Card>

      <TrailerFormDialog open={formOpen} onOpenChange={setFormOpen} form={form} setForm={setForm} editing={editing} saving={saving} onSubmit={saveTrailer} />

      <Dialog open={coupleOpen} onOpenChange={setCoupleOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle>Couple {couplingTrailer?.plateNumber}</DialogTitle></DialogHeader>
          <DialogBody className="space-y-4">
            <div className="space-y-2"><Label>Tractor</Label><Select value={tractorId} onValueChange={setTractorId}><SelectTrigger><SelectValue placeholder="Select active tractor" /></SelectTrigger><SelectContent>{trucks.map((truck) => <SelectItem key={truck.id} value={truck.id}>{truck.plateNumber}</SelectItem>)}</SelectContent></Select></div>
            <div className="space-y-2"><Label>Driver (optional)</Label><Select value={driverId || 'none'} onValueChange={(value) => setDriverId(value === 'none' ? '' : value)}><SelectTrigger><SelectValue placeholder="Select driver" /></SelectTrigger><SelectContent><SelectItem value="none">No driver</SelectItem>{drivers.map((driver) => <SelectItem key={driver.id} value={driver.id}>{driver.firstName} {driver.lastName}</SelectItem>)}</SelectContent></Select></div>
          </DialogBody>
          <DialogFooter><Button variant="outline" onClick={() => setCoupleOpen(false)}>Cancel</Button><Button disabled={!tractorId || coupling} onClick={coupleTrailer}>{coupling ? 'Coupling...' : 'Couple Trailer'}</Button></DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}

function Combination({ item }: { item: TrailerRecord }) {
  const current = item.currentCoupling
  if (!current) return <span className="text-sm text-muted-foreground">Not coupled</span>
  return (
    <div className="space-y-0.5 text-sm">
      <div className="font-medium">{current.tractor.plateNumber}</div>
      <div className="text-xs text-muted-foreground">{current.driver ? `${current.driver.firstName} ${current.driver.lastName}` : 'No driver'}{current.trip ? ` · ${current.trip.tripNumber}` : ''}</div>
    </div>
  )
}

function TrailerRow({ item, canWrite, busy, onEdit, onCouple, onDecouple }: { item: TrailerRecord; canWrite: boolean; busy: boolean; onEdit: (item: TrailerRecord) => void; onCouple: (item: TrailerRecord) => void; onDecouple: (item: TrailerRecord) => void }) {
  return <TableRow><TableCell className="font-semibold">{item.plateNumber}</TableCell><TableCell>{item.trailerType}{item.bodyType ? <span className="block text-xs text-muted-foreground">{item.bodyType}</span> : null}</TableCell><TableCell>{item.axleCount ?? '—'} axles<span className="block text-xs text-muted-foreground">{item.maxPayload ? `${item.maxPayload.toLocaleString()} kg max` : 'Payload not set'}</span></TableCell><TableCell><Badge variant={item.status === 'active' ? 'default' : 'secondary'}>{item.status.replaceAll('_', ' ')}</Badge></TableCell><TableCell><Combination item={item} /></TableCell><TableCell className="text-right"><div className="flex justify-end gap-1">{canWrite && <Button variant="ghost" size="icon" onClick={() => onEdit(item)}><Pencil className="h-4 w-4" /></Button>}{canWrite && (item.currentCoupling ? <Button variant="ghost" size="icon" disabled={busy} onClick={() => onDecouple(item)} title="Decouple"><Link2Off className="h-4 w-4" /></Button> : <Button variant="ghost" size="icon" disabled={item.status !== 'active' || busy} onClick={() => onCouple(item)} title="Couple"><Link2 className="h-4 w-4" /></Button>)}</div></TableCell></TableRow>
}

function TrailerCard({ item, canWrite, busy, onEdit, onCouple, onDecouple }: { item: TrailerRecord; canWrite: boolean; busy: boolean; onEdit: (item: TrailerRecord) => void; onCouple: (item: TrailerRecord) => void; onDecouple: (item: TrailerRecord) => void }) {
  return <div className="space-y-3 p-4"><div className="flex items-start justify-between gap-3"><div><div className="flex items-center gap-2 font-semibold"><Truck className="h-4 w-4 text-amber-600" />{item.plateNumber}</div><p className="text-xs text-muted-foreground">{item.trailerType}{item.bodyType ? ` · ${item.bodyType}` : ''}</p></div><Badge variant={item.status === 'active' ? 'default' : 'secondary'}>{item.status.replaceAll('_', ' ')}</Badge></div><Combination item={item} /><div className="flex gap-2">{canWrite && <Button variant="outline" size="sm" className="flex-1" onClick={() => onEdit(item)}><Pencil className="mr-2 h-4 w-4" />Edit</Button>}{canWrite && (item.currentCoupling ? <Button variant="outline" size="sm" className="flex-1" disabled={busy} onClick={() => onDecouple(item)}><Link2Off className="mr-2 h-4 w-4" />Decouple</Button> : <Button variant="outline" size="sm" className="flex-1" disabled={item.status !== 'active' || busy} onClick={() => onCouple(item)}><Link2 className="mr-2 h-4 w-4" />Couple</Button>)}</div></div>
}

function TrailerFormDialog({ open, onOpenChange, form, setForm, editing, saving, onSubmit }: { open: boolean; onOpenChange: (open: boolean) => void; form: TrailerForm; setForm: React.Dispatch<React.SetStateAction<TrailerForm>>; editing: TrailerRecord | null; saving: boolean; onSubmit: (event: React.FormEvent) => void }) {
  const field = (key: keyof TrailerForm, value: string) => setForm((current) => ({ ...current, [key]: value }))
  return <Dialog open={open} onOpenChange={onOpenChange}><DialogContent className="max-w-2xl"><form onSubmit={onSubmit}><DialogHeader><DialogTitle>{editing ? 'Edit Trailer' : 'Add Trailer'}</DialogTitle></DialogHeader><DialogBody className="grid gap-4 sm:grid-cols-2"><div className="space-y-2"><Label>Plate number</Label><Input value={form.plateNumber} onChange={(e) => field('plateNumber', e.target.value)} required /></div><div className="space-y-2"><Label>Trailer type</Label><Input value={form.trailerType} onChange={(e) => field('trailerType', e.target.value)} required /></div><div className="space-y-2"><Label>Body type</Label><Input value={form.bodyType} onChange={(e) => field('bodyType', e.target.value)} /></div><div className="space-y-2"><Label>Axle count</Label><Input type="number" min="1" max="12" value={form.axleCount} onChange={(e) => field('axleCount', e.target.value)} /></div><div className="space-y-2"><Label>Tare weight (kg)</Label><Input type="number" min="1" value={form.tareWeight} onChange={(e) => field('tareWeight', e.target.value)} /></div><div className="space-y-2"><Label>Max payload (kg)</Label><Input type="number" min="1" value={form.maxPayload} onChange={(e) => field('maxPayload', e.target.value)} /></div><div className="space-y-2"><Label>VIN</Label><Input value={form.vinNumber} onChange={(e) => field('vinNumber', e.target.value)} /></div><div className="space-y-2"><Label>Chassis number</Label><Input value={form.chassisNumber} onChange={(e) => field('chassisNumber', e.target.value)} /></div><div className="space-y-2 sm:col-span-2"><Label>Status</Label><Select value={form.status} onValueChange={(value) => field('status', value)}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectItem value="active">Active</SelectItem><SelectItem value="maintenance">Maintenance</SelectItem><SelectItem value="inactive">Inactive</SelectItem><SelectItem value="out_of_service">Out of service</SelectItem><SelectItem value="decommissioned">Decommissioned</SelectItem></SelectContent></Select></div></DialogBody><DialogFooter><Button type="button" variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button><Button type="submit" disabled={saving}>{saving ? 'Saving...' : editing ? 'Save Changes' : 'Add Trailer'}</Button></DialogFooter></form></DialogContent></Dialog>
}
