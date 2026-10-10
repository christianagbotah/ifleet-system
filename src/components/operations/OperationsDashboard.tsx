'use client'

import * as React from 'react'
import { AlertTriangle, CalendarDays, Clock3, Factory, FileCheck2, Gauge, Loader2, MapPin, PackageOpen, RefreshCw, Route, Scale, ShieldAlert, Truck, Wrench } from 'lucide-react'

import { apiFetch, type Trip } from '@/lib/api'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { StatusBadge } from '@/components/ui/status-badge'
import { TripDetailSheet } from '@/components/trips/TripDetailSheet'
import { OperationalStatusBoard } from '@/components/operations/OperationalStatusBoard'
import { toast } from 'sonner'

interface OperationsPayload {
  summary: {
    activeTrucks: number
    inactiveTrucks: number
    maintenanceTrucks: number
    outOfServiceTrucks: number
    activeTrips: number
    tripsByStage: Record<string, number>
    overdueLoads: number
    todaysTrips: number
    todaysTonnage: number
    outstandingPod: number
    awaitingReconciliation: number
    activeQueue: number
    detentionCases: number
    maxDetentionMinutes: number
    unreadTrackingAlerts: number
    deliveryExceptions: number
    reconciliationBlockers: number
  }
  activeTrips: Array<{
    id: string; tripNumber: string; status: string; loadingLocation: string; destination: string; departureTime: string
    truck: { id: string; plateNumber: string }; driver: { id: string; firstName: string; lastName: string }; loadOrder: { orderNumber: string; priority: string } | null
  }>
  overdueLoadOrders: Array<{ id: string; orderNumber: string; status: string; priority: string; pickupWindowEnd: string; externalReference: string | null; shipperProfile: { name: string }; loadingPoint: { name: string } }>
  queues: Array<{ id: string; tripId: string | null; siteName: string; truckId: string; status: string; position: number | null; bayId: string | null; joinedAt: string; liveDetention: number }>
  trackingAlerts: Array<{ id: string; tripId: string | null; type: string; title: string; message: string; createdAt: string; truck: { plateNumber: string } }>
  deliveryExceptions: Array<{ id: string; tripId: string; type: string; status: string; quantity: number | null; notes: string | null; createdAt: string }>
  reconciliationExceptions: Array<{ id: string; tripId: string; type: string; status: string; notes: string | null; createdAt: string }>
  generatedAt: string
}

function Stat({ icon: Icon, label, value, note, attention }: { icon: React.ComponentType<{ className?: string }>; label: string; value: number | string; note: string; attention?: boolean }) {
  return <Card className={attention ? 'border-amber-300/70 dark:border-amber-800' : ''}><CardContent className="flex h-full items-center gap-3 p-4"><div className={`rounded-xl p-2.5 ${attention ? 'bg-amber-100 text-amber-700 dark:bg-amber-950/50 dark:text-amber-300' : 'bg-muted text-muted-foreground'}`}><Icon className="h-5 w-5" /></div><div className="min-w-0"><div className="text-2xl font-bold tabular-nums">{value}</div><div className="text-xs font-medium">{label}</div><div className="truncate text-[11px] text-muted-foreground">{note}</div></div></CardContent></Card>
}

function timeAgo(value: string) {
  const minutes = Math.max(0, Math.floor((Date.now() - new Date(value).getTime()) / 60000))
  if (minutes < 60) return `${minutes}m ago`
  const hours = Math.floor(minutes / 60)
  if (hours < 24) return `${hours}h ago`
  return `${Math.floor(hours / 24)}d ago`
}

export function OperationsDashboard({ onNavigate }: { onNavigate?: (page: string) => void }) {
  const [data, setData] = React.useState<OperationsPayload | null>(null)
  const [loading, setLoading] = React.useState(true)
  const [selectedTrip, setSelectedTrip] = React.useState<Trip | null>(null)
  const [sheetOpen, setSheetOpen] = React.useState(false)

  const load = React.useCallback(async () => {
    setLoading(true)
    try { setData(await apiFetch<OperationsPayload>('/api/operations/summary')) }
    catch (error) { toast.error(error instanceof Error ? error.message : 'Failed to load operations center') }
    finally { setLoading(false) }
  }, [])

  React.useEffect(() => { void load() }, [load])

  async function openTrip(id: string) {
    try {
      const trip = await apiFetch<Trip>(`/api/trips/${id}`)
      setSelectedTrip(trip)
      setSheetOpen(true)
    } catch (error) { toast.error(error instanceof Error ? error.message : 'Failed to load trip') }
  }

  if (loading && !data) return <div className="flex min-h-[50vh] items-center justify-center text-sm text-muted-foreground"><Loader2 className="mr-2 h-5 w-5 animate-spin" />Loading live operations…</div>

  const s = data?.summary ?? { activeTrucks: 0, inactiveTrucks: 0, maintenanceTrucks: 0, outOfServiceTrucks: 0, activeTrips: 0, tripsByStage: {}, overdueLoads: 0, todaysTrips: 0, todaysTonnage: 0, outstandingPod: 0, awaitingReconciliation: 0, activeQueue: 0, detentionCases: 0, maxDetentionMinutes: 0, unreadTrackingAlerts: 0, deliveryExceptions: 0, reconciliationBlockers: 0 }
  const stages = Object.entries(s.tripsByStage).sort((a, b) => b[1] - a[1])
  const attentionTotal = s.overdueLoads + s.detentionCases + s.unreadTrackingAlerts + s.deliveryExceptions + s.reconciliationBlockers

  return <div className="space-y-5">
    <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between"><div><h1 className="text-2xl font-bold tracking-tight">Operations Center</h1><p className="text-sm text-muted-foreground">One live view of dispatch, factory queues, trips, exceptions and financial-close blockers.</p></div><div className="flex gap-2"><Button variant="outline" size="sm" onClick={() => onNavigate?.('control-tower')}><MapPin className="mr-1.5 h-4 w-4" />Control Tower</Button><Button size="sm" variant="outline" onClick={() => void load()} disabled={loading}><RefreshCw className={`mr-1.5 h-4 w-4 ${loading ? 'animate-spin' : ''}`} />Refresh</Button></div></div>

    <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-6">
      <Stat icon={Truck} label="Active fleet" value={s.activeTrucks} note={`${s.inactiveTrucks} inactive · ${s.outOfServiceTrucks} out`} />
      <Stat icon={Wrench} label="Maintenance" value={s.maintenanceTrucks} note="Vehicles currently unavailable" attention={s.maintenanceTrucks > 0} />
      <Stat icon={CalendarDays} label="Today trips" value={s.todaysTrips} note="Planned / dispatched today" />
      <Stat icon={Scale} label="Today tonnage" value={`${s.todaysTonnage.toLocaleString()} t`} note="Native tonne-denominated loads" />
      <Stat icon={FileCheck2} label="POD pending" value={s.outstandingPod} note="Delivered without POD evidence" attention={s.outstandingPod > 0} />
      <Stat icon={Gauge} label="Awaiting close" value={s.awaitingReconciliation} note="Trips awaiting reconciliation" attention={s.awaitingReconciliation > 0} />
    </div>

    <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-6">
      <Stat icon={Route} label="Active trips" value={s.activeTrips} note={`${stages.length} active stages`} />
      <Stat icon={Factory} label="Factory queue" value={s.activeQueue} note={`${s.detentionCases} detention case${s.detentionCases === 1 ? '' : 's'}`} attention={s.detentionCases > 0} />
      <Stat icon={Clock3} label="Overdue loads" value={s.overdueLoads} note="Pickup window missed" attention={s.overdueLoads > 0} />
      <Stat icon={ShieldAlert} label="Tracking alerts" value={s.unreadTrackingAlerts} note="Unread telematics exceptions" attention={s.unreadTrackingAlerts > 0} />
      <Stat icon={PackageOpen} label="Delivery issues" value={s.deliveryExceptions} note="Shortage / damage exceptions" attention={s.deliveryExceptions > 0} />
      <Stat icon={Gauge} label="Close blockers" value={s.reconciliationBlockers} note={attentionTotal ? `${attentionTotal} total attention items` : 'Operations clear'} attention={s.reconciliationBlockers > 0} />
    </div>

    <OperationalStatusBoard trips={data?.activeTrips ?? []} onChanged={load} />

    <div className="grid gap-4 xl:grid-cols-[1.45fr_0.85fr]">
      <Card><CardHeader className="pb-3"><div className="flex items-center justify-between"><div><CardTitle className="text-base">Active movement</CardTitle><CardDescription>Click a trip to open its unified workspace.</CardDescription></div><Badge variant="secondary">{s.activeTrips}</Badge></div></CardHeader><CardContent className="space-y-2">
        {data?.activeTrips.length ? data.activeTrips.slice(0, 12).map((trip) => <button key={trip.id} onClick={() => void openTrip(trip.id)} className="flex w-full items-center gap-3 rounded-xl border p-3 text-left transition-colors hover:bg-muted/50"><div className="rounded-lg bg-emerald-100 p-2 dark:bg-emerald-950/40"><Truck className="h-4 w-4 text-emerald-700 dark:text-emerald-300" /></div><div className="min-w-0 flex-1"><div className="flex flex-wrap items-center gap-2"><span className="font-semibold">{trip.tripNumber}</span><StatusBadge status={trip.status} variant="trip" /></div><div className="mt-1 truncate text-xs text-muted-foreground">{trip.loadingLocation} → {trip.destination} · {trip.truck.plateNumber} · {trip.driver.firstName} {trip.driver.lastName}</div></div>{trip.loadOrder?.priority && trip.loadOrder.priority !== 'normal' && <Badge variant="outline">{trip.loadOrder.priority}</Badge>}</button>) : <div className="py-10 text-center text-sm text-muted-foreground">No active trips.</div>}
      </CardContent></Card>

      <div className="space-y-4">
        <Card><CardHeader className="pb-3"><CardTitle className="text-base">Trips by stage</CardTitle><CardDescription>Current operational distribution</CardDescription></CardHeader><CardContent className="space-y-2">{stages.length ? stages.map(([stage, count]) => <div key={stage} className="flex items-center justify-between rounded-lg bg-muted/35 px-3 py-2"><StatusBadge status={stage} variant="trip" /><span className="font-bold tabular-nums">{count}</span></div>) : <div className="text-sm text-muted-foreground">No active stages.</div>}</CardContent></Card>
        <Card><CardHeader className="pb-3"><CardTitle className="text-base">Factory detention</CardTitle><CardDescription>Longest current delays</CardDescription></CardHeader><CardContent className="space-y-2">{data?.queues.filter((q) => q.liveDetention > 0).slice(0, 6).map((queue) => <button key={queue.id} onClick={() => queue.tripId && void openTrip(queue.tripId)} className="flex w-full items-center justify-between rounded-lg border px-3 py-2 text-left"><div><div className="text-sm font-medium">{queue.siteName}</div><div className="text-xs text-muted-foreground">{queue.status.replace(/_/g, ' ')}{queue.position ? ` · #${queue.position}` : ''}</div></div><Badge variant="destructive">+{queue.liveDetention}m</Badge></button>)}{!data?.queues.some((q) => q.liveDetention > 0) && <div className="text-sm text-muted-foreground">No detention beyond free time.</div>}</CardContent></Card>
      </div>
    </div>

    <div className="grid gap-4 lg:grid-cols-2 xl:grid-cols-4">
      <ExceptionCard title="Overdue load orders" icon={Clock3} empty="No overdue pickup windows." items={(data?.overdueLoadOrders ?? []).slice(0, 6).map((item) => ({ id: item.id, title: item.orderNumber, subtitle: `${item.shipperProfile.name} · ${item.loadingPoint.name}`, meta: item.pickupWindowEnd ? timeAgo(item.pickupWindowEnd) : '' }))} onAll={() => onNavigate?.('load-orders')} />
      <ExceptionCard title="Tracking exceptions" icon={ShieldAlert} empty="No unread tracking alerts." items={(data?.trackingAlerts ?? []).slice(0, 6).map((item) => ({ id: item.id, title: item.title, subtitle: `${item.truck.plateNumber} · ${item.message}`, meta: timeAgo(item.createdAt), tripId: item.tripId }))} onTrip={openTrip} onAll={() => onNavigate?.('control-tower')} />
      <ExceptionCard title="Delivery discrepancies" icon={PackageOpen} empty="No open delivery discrepancies." items={(data?.deliveryExceptions ?? []).slice(0, 6).map((item) => ({ id: item.id, title: item.type.replace(/_/g, ' '), subtitle: item.notes || (item.quantity != null ? `Quantity: ${item.quantity}` : 'Review delivery evidence'), meta: timeAgo(item.createdAt), tripId: item.tripId }))} onTrip={openTrip} onAll={() => onNavigate?.('trips')} />
      <ExceptionCard title="Reconciliation blockers" icon={AlertTriangle} empty="No open reconciliation blockers." items={(data?.reconciliationExceptions ?? []).slice(0, 6).map((item) => ({ id: item.id, title: item.type.replace(/_/g, ' '), subtitle: item.notes || 'Financial close requires review', meta: timeAgo(item.createdAt), tripId: item.tripId }))} onTrip={openTrip} onAll={() => onNavigate?.('haulier-settlements')} />
    </div>

    <TripDetailSheet trip={selectedTrip} open={sheetOpen} onOpenChange={setSheetOpen} onStatusChanged={load} />
  </div>
}

function ExceptionCard({ title, icon: Icon, items, empty, onTrip, onAll }: { title: string; icon: React.ComponentType<{ className?: string }>; items: Array<{ id: string; title: string; subtitle: string; meta: string; tripId?: string | null }>; empty: string; onTrip?: (id: string) => Promise<void>; onAll?: () => void }) {
  return <Card><CardHeader className="pb-3"><div className="flex items-center justify-between gap-2"><CardTitle className="flex items-center gap-2 text-sm"><Icon className="h-4 w-4 text-amber-600" />{title}</CardTitle>{onAll && <Button variant="ghost" size="sm" className="h-7 px-2 text-xs" onClick={onAll}>View</Button>}</div></CardHeader><CardContent className="space-y-2">{items.length ? items.map((item) => <button key={item.id} disabled={!item.tripId || !onTrip} onClick={() => item.tripId && onTrip && void onTrip(item.tripId)} className="block w-full rounded-lg border p-2.5 text-left disabled:cursor-default"><div className="truncate text-xs font-semibold capitalize">{item.title}</div><div className="mt-0.5 line-clamp-2 text-[11px] text-muted-foreground">{item.subtitle}</div><div className="mt-1 text-[10px] text-muted-foreground/70">{item.meta}</div></button>) : <div className="py-4 text-center text-xs text-muted-foreground">{empty}</div>}</CardContent></Card>
}
