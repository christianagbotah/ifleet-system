'use client'

import * as React from 'react'
import { Clock3, DoorOpen, RefreshCw, ShieldCheck, Truck } from 'lucide-react'
import { toast } from 'sonner'

import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { apiFetch } from '@/lib/api'
import { useAuthStore } from '@/lib/store/auth'

interface SiteOption { id: string; name: string }
interface TruckOption { id: string; plateNumber: string; status?: string }
interface TripOption { id: string; tripNumber: string; truckId: string; driverId: string; loadingPointId?: string | null; status: string }
interface GateEventRecord {
  id: string; siteId: string; siteName?: string | null; truckId: string; tripId?: string | null
  direction: string; occurredAt: string; source?: string
}
interface QueueRecord {
  id: string; siteId: string; siteName: string; truckId: string; tripId?: string | null; driverId?: string | null
  status: string; position?: number | null; bayId?: string | null; joinedAt: string; actualWait?: number | null
  detentionMinutes?: number | null; detentionFreeMinutes?: number | null
}

function statusBadge(status: string) {
  if (status === 'completed') return 'default'
  if (status === 'loading' || status === 'in_progress') return 'secondary'
  if (status === 'cancelled') return 'destructive'
  return 'outline'
}

export function FactoryOperationsView() {
  const { user } = useAuthStore()
  const canWrite = user?.role !== 'Driver'
  const [sites, setSites] = React.useState<SiteOption[]>([])
  const [trucks, setTrucks] = React.useState<TruckOption[]>([])
  const [trips, setTrips] = React.useState<TripOption[]>([])
  const [events, setEvents] = React.useState<GateEventRecord[]>([])
  const [queue, setQueue] = React.useState<QueueRecord[]>([])
  const [loading, setLoading] = React.useState(true)
  const [saving, setSaving] = React.useState(false)
  const [siteId, setSiteId] = React.useState('all')
  const [truckId, setTruckId] = React.useState('')
  const [tripId, setTripId] = React.useState('')
  const [bayId, setBayId] = React.useState('')
  const [detentionFreeMinutes, setDetentionFreeMinutes] = React.useState('120')

  const load = React.useCallback(async () => {
    setLoading(true)
    try {
      const gateQuery = new URLSearchParams({ limit: '100' })
      const queueQuery = new URLSearchParams({ limit: '100' })
      if (siteId !== 'all') {
        gateQuery.set('siteId', siteId)
        queueQuery.set('siteId', siteId)
      }
      const [siteResult, truckResult, tripResult, gateResult, queueResult] = await Promise.all([
        apiFetch<{ data: SiteOption[] }>('/api/loading-points?limit=200&isActive=true'),
        apiFetch<{ data: TruckOption[] }>('/api/trucks?limit=200'),
        apiFetch<{ data: TripOption[] }>('/api/trips?limit=200'),
        apiFetch<{ data: GateEventRecord[] }>(`/api/factory-ops/gate?${gateQuery}`),
        apiFetch<{ data: QueueRecord[] }>(`/api/factory-ops/queue?${queueQuery}`),
      ])
      setSites(siteResult.data ?? [])
      setTrucks((truckResult.data ?? []).filter((truck) => !truck.status || truck.status === 'active'))
      setTrips(tripResult.data ?? [])
      setEvents(gateResult.data ?? [])
      setQueue(queueResult.data ?? [])
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Failed to load factory operations')
    } finally {
      setLoading(false)
    }
  }, [siteId])

  React.useEffect(() => { void load() }, [load])

  const activeTrip = trips.find((trip) => trip.id === tripId)
  React.useEffect(() => {
    if (!activeTrip) return
    if (!truckId) setTruckId(activeTrip.truckId)
    if (activeTrip.loadingPointId && siteId === 'all') setSiteId(activeTrip.loadingPointId)
  }, [activeTrip, truckId, siteId])

  async function recordGate(direction: 'in' | 'out') {
    if (siteId === 'all' || !truckId || !tripId) {
      toast.error('Select loading site, truck and trip first')
      return
    }
    setSaving(true)
    try {
      const result = await apiFetch<{ duplicate: boolean }>('/api/factory-ops/gate', {
        method: 'POST',
        body: JSON.stringify({ siteId, truckId, tripId, direction }),
      })
      toast.success(result.duplicate ? 'Duplicate scan ignored safely' : `Gate-${direction} recorded`)
      await load()
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Gate operation failed')
    } finally {
      setSaving(false)
    }
  }

  async function joinQueue() {
    if (siteId === 'all' || !truckId || !tripId) {
      toast.error('Select loading site, truck and trip first')
      return
    }
    setSaving(true)
    try {
      await apiFetch('/api/factory-ops/queue', {
        method: 'POST',
        body: JSON.stringify({
          siteId,
          truckId,
          tripId,
          driverId: activeTrip?.driverId,
          queueType: 'loading',
          detentionFreeMinutes: Number(detentionFreeMinutes || 0),
        }),
      })
      toast.success('Truck added to factory queue')
      await load()
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Queue operation failed')
    } finally {
      setSaving(false)
    }
  }

  async function advance(entry: QueueRecord, action: 'call_to_bay' | 'start_loading' | 'complete' | 'cancel') {
    setSaving(true)
    try {
      await apiFetch('/api/factory-ops/queue', {
        method: 'PUT',
        body: JSON.stringify({ queueId: entry.id, action, bayId: action === 'call_to_bay' ? bayId || null : undefined }),
      })
      await load()
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Queue transition failed')
    } finally {
      setSaving(false)
    }
  }

  const waiting = queue.filter((entry) => entry.status === 'waiting').length
  const active = queue.filter((entry) => ['in_progress', 'loading', 'unloading'].includes(entry.status)).length
  const totalDetention = queue.reduce((sum, entry) => sum + (entry.detentionMinutes ?? 0), 0)

  return (
    <div className="space-y-5 p-4 md:p-6">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Factory Operations</h1>
          <p className="text-sm text-muted-foreground">Gate & Queue control for loading sites, bays, waiting time and detention.</p>
        </div>
        <Button variant="outline" onClick={() => void load()} disabled={loading} className="cursor-pointer">
          <RefreshCw className="mr-2 size-4" /> Refresh
        </Button>
      </div>

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <Card><CardContent className="flex items-center justify-between p-4"><div><p className="text-xs text-muted-foreground">Waiting</p><p className="text-2xl font-semibold">{waiting}</p></div><Clock3 className="size-5 text-muted-foreground" /></CardContent></Card>
        <Card><CardContent className="flex items-center justify-between p-4"><div><p className="text-xs text-muted-foreground">At bay / loading</p><p className="text-2xl font-semibold">{active}</p></div><Truck className="size-5 text-muted-foreground" /></CardContent></Card>
        <Card><CardContent className="flex items-center justify-between p-4"><div><p className="text-xs text-muted-foreground">Gate events</p><p className="text-2xl font-semibold">{events.length}</p></div><DoorOpen className="size-5 text-muted-foreground" /></CardContent></Card>
        <Card><CardContent className="flex items-center justify-between p-4"><div><p className="text-xs text-muted-foreground">Detention</p><p className="text-2xl font-semibold">{totalDetention}m</p></div><ShieldCheck className="size-5 text-muted-foreground" /></CardContent></Card>
      </div>

      <Card>
        <CardHeader><CardTitle className="text-base">Gate & Queue</CardTitle></CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-5">
            <div className="space-y-1.5"><Label>Loading site</Label><Select value={siteId} onValueChange={setSiteId}><SelectTrigger className="cursor-pointer"><SelectValue placeholder="Select site" /></SelectTrigger><SelectContent><SelectItem value="all">All sites</SelectItem>{sites.map((site) => <SelectItem key={site.id} value={site.id}>{site.name}</SelectItem>)}</SelectContent></Select></div>
            <div className="space-y-1.5"><Label>Truck</Label><Select value={truckId} onValueChange={setTruckId}><SelectTrigger className="cursor-pointer"><SelectValue placeholder="Select truck" /></SelectTrigger><SelectContent>{trucks.map((truck) => <SelectItem key={truck.id} value={truck.id}>{truck.plateNumber}</SelectItem>)}</SelectContent></Select></div>
            <div className="space-y-1.5"><Label>Trip</Label><Select value={tripId} onValueChange={setTripId}><SelectTrigger className="cursor-pointer"><SelectValue placeholder="Select trip" /></SelectTrigger><SelectContent>{trips.filter((trip) => !['completed','cancelled'].includes(trip.status)).map((trip) => <SelectItem key={trip.id} value={trip.id}>{trip.tripNumber}</SelectItem>)}</SelectContent></Select></div>
            <div className="space-y-1.5"><Label>Bay</Label><Input value={bayId} onChange={(event) => setBayId(event.target.value)} placeholder="e.g. Bay 4" /></div>
            <div className="space-y-1.5"><Label>Free detention (min)</Label><Input type="number" min="0" value={detentionFreeMinutes} onChange={(event) => setDetentionFreeMinutes(event.target.value)} /></div>
          </div>
          {canWrite && <div className="flex flex-wrap gap-2">
            <Button onClick={() => void recordGate('in')} disabled={saving || siteId === 'all'} className="cursor-pointer">Gate In</Button>
            <Button variant="outline" onClick={() => void joinQueue()} disabled={saving || siteId === 'all'} className="cursor-pointer">Join Queue</Button>
            <Button variant="outline" onClick={() => void recordGate('out')} disabled={saving || siteId === 'all'} className="cursor-pointer">Gate Out</Button>
          </div>}
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle className="text-base">Live factory queue</CardTitle></CardHeader>
        <CardContent className="overflow-x-auto">
          <Table>
            <TableHeader><TableRow><TableHead>Position</TableHead><TableHead>Site</TableHead><TableHead>Truck</TableHead><TableHead>Status</TableHead><TableHead>Bay</TableHead><TableHead>Wait</TableHead><TableHead>Detention</TableHead><TableHead className="text-right">Action</TableHead></TableRow></TableHeader>
            <TableBody>
              {queue.length === 0 ? <TableRow><TableCell colSpan={8} className="py-10 text-center text-muted-foreground">No factory queue entries yet.</TableCell></TableRow> : queue.map((entry) => {
                const truck = trucks.find((candidate) => candidate.id === entry.truckId)
                return <TableRow key={entry.id}>
                  <TableCell>{entry.position ?? '—'}</TableCell><TableCell>{entry.siteName}</TableCell><TableCell>{truck?.plateNumber ?? entry.truckId}</TableCell>
                  <TableCell><Badge variant={statusBadge(entry.status)}>{entry.status.replaceAll('_', ' ')}</Badge></TableCell><TableCell>{entry.bayId || '—'}</TableCell><TableCell>{entry.actualWait ?? '—'}{entry.actualWait != null ? 'm' : ''}</TableCell><TableCell>{entry.detentionMinutes ?? 0}m</TableCell>
                  <TableCell className="text-right">{canWrite && <div className="flex justify-end gap-1">{entry.status === 'waiting' && <Button size="sm" variant="outline" onClick={() => void advance(entry, 'call_to_bay')} disabled={saving} className="cursor-pointer">Call</Button>}{entry.status === 'in_progress' && <Button size="sm" onClick={() => void advance(entry, 'start_loading')} disabled={saving} className="cursor-pointer">Load</Button>}{entry.status === 'loading' && <Button size="sm" onClick={() => void advance(entry, 'complete')} disabled={saving} className="cursor-pointer">Complete</Button>}</div>}</TableCell>
                </TableRow>
              })}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  )
}
