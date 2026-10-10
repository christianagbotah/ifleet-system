'use client'

import * as React from 'react'
import { FileSpreadsheet, Link2, PackagePlus, Plus, Search, Trash2 } from 'lucide-react'
import { toast } from 'sonner'

import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Dialog, DialogBody, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { EmptyState } from '@/components/ui/empty-state'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Skeleton } from '@/components/ui/skeleton'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { useDebounce } from '@/hooks/use-debounce'
import { apiFetch } from '@/lib/api'
import { useAuthStore } from '@/lib/store/auth'
import { ImportLoadOrdersDialog } from '@/components/load-orders/ImportLoadOrdersDialog'

interface ShipperOption { id: string; code: string; name: string }
interface LoadingPointOption { id: string; name: string; loadingCity?: { name: string } }
interface AllocationLine { lineId: string; ordered: number; allocated: number; remaining: number; overAllocated: number }
interface LoadOrderRecord {
  id: string; orderNumber: string; externalReference?: string | null; status: string; priority: string; offeredRate?: number | null; currency?: string
  shipperProfile: ShipperOption; loadingPoint: LoadingPointOption
  LoadOrderDestination: Array<{ id: string; ref: string; name: string }>
  LoadOrderLine: Array<{ id: string; ref: string; itemName: string; orderedQuantity: number; unit: string }>
  Trip: Array<{ id: string; tripNumber: string; status: string }>
  allocation: { valid: boolean; lines: AllocationLine[]; overAllocatedLineIds: string[] }
}
interface DestinationForm { ref: string; name: string; address: string }
interface LineForm { ref: string; itemName: string; quantity: string; unit: string; destinationRef: string }
interface OrderForm {
  shipperProfileId: string; externalReference: string; loadingPointId: string; pickupWindowStart: string; pickupWindowEnd: string
  requiredVehicleType: string; requiredTrailerType: string; offeredRate: string; priority: string; specialHandling: string
  destinations: DestinationForm[]; lines: LineForm[]
}
const destination = (index: number): DestinationForm => ({ ref: `stop-${index}`, name: '', address: '' })
const line = (index: number, destinationRef = 'stop-1'): LineForm => ({ ref: `line-${index}`, itemName: '', quantity: '', unit: 'bags', destinationRef })
const blank = (): OrderForm => ({ shipperProfileId: '', externalReference: '', loadingPointId: '', pickupWindowStart: '', pickupWindowEnd: '', requiredVehicleType: '', requiredTrailerType: '', offeredRate: '', priority: 'normal', specialHandling: '', destinations: [destination(1)], lines: [line(1)] })

const statusOptions = ['draft','open','partially_allocated','allocated','in_progress','on_hold','completed','cancelled']

export function LoadOrdersView() {
  const { user } = useAuthStore()
  const canWrite = user?.role !== 'Driver'
  const [orders, setOrders] = React.useState<LoadOrderRecord[]>([])
  const [shippers, setShippers] = React.useState<ShipperOption[]>([])
  const [loadingPoints, setLoadingPoints] = React.useState<LoadingPointOption[]>([])
  const [search, setSearch] = React.useState('')
  const debounced = useDebounce(search, 300)
  const [status, setStatus] = React.useState('all')
  const [loading, setLoading] = React.useState(true)
  const [open, setOpen] = React.useState(false)
  const [importOpen, setImportOpen] = React.useState(false)
  const [saving, setSaving] = React.useState(false)
  const [form, setForm] = React.useState<OrderForm>(blank())

  const load = React.useCallback(async () => {
    setLoading(true)
    try {
      const query = new URLSearchParams({ limit: '100' }); if (debounced) query.set('search', debounced); if (status !== 'all') query.set('status', status)
      const [ordersResult, shipperResult, pointResult] = await Promise.all([
        apiFetch<{ data: LoadOrderRecord[] }>(`/api/load-orders?${query}`),
        apiFetch<{ data: ShipperOption[] }>('/api/shipper-profiles?active=true'),
        apiFetch<{ data: LoadingPointOption[] }>('/api/loading-points?limit=100&isActive=true'),
      ])
      setOrders(ordersResult.data ?? []); setShippers(shipperResult.data ?? []); setLoadingPoints(pointResult.data ?? [])
    } catch (error) { toast.error(error instanceof Error ? error.message : 'Failed to load orders') }
    finally { setLoading(false) }
  }, [debounced, status])
  React.useEffect(() => { load() }, [load])

  function createOrder() { setForm(blank()); setOpen(true) }
  function updateDestination(index: number, patch: Partial<DestinationForm>) { setForm((current)=>({...current,destinations:current.destinations.map((item,i)=>i===index?{...item,...patch}:item)})) }
  function updateLine(index: number, patch: Partial<LineForm>) { setForm((current)=>({...current,lines:current.lines.map((item,i)=>i===index?{...item,...patch}:item)})) }

  async function submit(event: React.FormEvent) {
    event.preventDefault(); setSaving(true)
    try {
      await apiFetch('/api/load-orders', { method:'POST', body: JSON.stringify({ ...form, offeredRate: form.offeredRate || null, destinations: form.destinations, lines: form.lines.map((item)=>({...item,quantity:Number(item.quantity)})) }) })
      toast.success('Load order created'); setOpen(false); await load()
    } catch (error) { toast.error(error instanceof Error ? error.message : 'Failed to create load order') }
    finally { setSaving(false) }
  }

  async function changeStatus(order: LoadOrderRecord, next: string) {
    if (next === order.status) return
    try { await apiFetch(`/api/load-orders/${order.id}`, { method:'PATCH', body:JSON.stringify({status:next}) }); toast.success('Load order status updated'); await load() }
    catch (error) { toast.error(error instanceof Error ? error.message : 'Status change rejected') }
  }

  return <div className="space-y-4 sm:space-y-6">
    <div className="flex flex-col gap-4 xl:flex-row xl:items-center xl:justify-between"><div><h1 className="text-2xl font-bold tracking-tight">Load Orders</h1><p className="text-muted-foreground">Operational instructions before trip assignment, with exact lines, destinations and allocation.</p></div><div className="flex flex-wrap gap-2">{canWrite && <><Button variant="outline" onClick={()=>setImportOpen(true)}><FileSpreadsheet className="mr-2 h-4 w-4" />Import CSV / Excel</Button><Button variant="outline" onClick={()=>window.dispatchEvent(new CustomEvent('navigate-page',{detail:'settings'}))}><Link2 className="mr-2 h-4 w-4" />ERP Connector</Button><Button onClick={createOrder} className="bg-amber-500 text-white hover:bg-amber-600"><Plus className="mr-2 h-4 w-4" />New Load Order</Button></>}</div></div>
    <div className="flex flex-col gap-3 sm:flex-row"><div className="relative flex-1"><Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" /><Input className="pl-8" placeholder="Search order or external reference..." value={search} onChange={(e)=>setSearch(e.target.value)} /></div><Select value={status} onValueChange={setStatus}><SelectTrigger className="w-full sm:w-52"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="all">All statuses</SelectItem>{statusOptions.map((value)=><SelectItem key={value} value={value}>{labelStatus(value)}</SelectItem>)}</SelectContent></Select></div>
    <Card><CardContent className="p-0">{loading ? <div className="space-y-3 p-4">{[1,2,3].map((i)=><Skeleton key={i} className="h-14 w-full" />)}</div> : orders.length===0 ? <EmptyState icon={PackagePlus} title="No load orders" description="Create the first manual load order; imports and ERP connectors are reserved for the connector phase." action={canWrite?{label:'New Load Order',onClick:createOrder}:undefined} /> : <div className="overflow-x-auto"><Table><TableHeader><TableRow><TableHead>Order</TableHead><TableHead>Shipper / Site</TableHead><TableHead>Load</TableHead><TableHead>Allocation</TableHead><TableHead>Priority</TableHead><TableHead>Status</TableHead></TableRow></TableHeader><TableBody>{orders.map((order)=>{const ordered=order.allocation.lines.reduce((sum,item)=>sum+item.ordered,0);const allocated=order.allocation.lines.reduce((sum,item)=>sum+item.allocated,0);return <TableRow key={order.id}><TableCell><div className="font-semibold">{order.orderNumber}</div><div className="text-xs text-muted-foreground">{order.externalReference || 'No external ref'}</div></TableCell><TableCell><div>{order.shipperProfile.name}</div><div className="text-xs text-muted-foreground">{order.loadingPoint.name}</div></TableCell><TableCell>{order.LoadOrderLine.length} line{order.LoadOrderLine.length===1?'':'s'} · {order.LoadOrderDestination.length} drop{order.LoadOrderDestination.length===1?'':'s'}</TableCell><TableCell><div className={order.allocation.valid?'':'text-red-600'}>{allocated.toLocaleString()} / {ordered.toLocaleString()}</div><div className="text-xs text-muted-foreground">{order.Trip.length} trip{order.Trip.length===1?'':'s'}</div></TableCell><TableCell><Badge variant="outline">{order.priority}</Badge></TableCell><TableCell>{canWrite ? <Select value={order.status} onValueChange={(value)=>changeStatus(order,value)}><SelectTrigger className="w-44"><SelectValue /></SelectTrigger><SelectContent>{statusOptions.map((value)=><SelectItem key={value} value={value}>{labelStatus(value)}</SelectItem>)}</SelectContent></Select> : <Badge>{labelStatus(order.status)}</Badge>}</TableCell></TableRow>})}</TableBody></Table></div>}</CardContent></Card>

    <ImportLoadOrdersDialog open={importOpen} onOpenChange={setImportOpen} shippers={shippers} loadingPoints={loadingPoints} onImported={load} />

    <Dialog open={open} onOpenChange={setOpen}><DialogContent className="max-h-[92vh] max-w-5xl overflow-y-auto"><form onSubmit={submit}><DialogHeader><DialogTitle>New Manual Load Order</DialogTitle></DialogHeader><DialogBody className="space-y-6">
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4"><Field label="Shipper profile"><Select value={form.shipperProfileId||'none'} onValueChange={(value)=>setForm({...form,shipperProfileId:value==='none'?'':value})}><SelectTrigger><SelectValue placeholder="Select shipper" /></SelectTrigger><SelectContent><SelectItem value="none">Select shipper</SelectItem>{shippers.map((shipper)=><SelectItem key={shipper.id} value={shipper.id}>{shipper.name}</SelectItem>)}</SelectContent></Select></Field><Field label="External reference"><Input value={form.externalReference} onChange={(e)=>setForm({...form,externalReference:e.target.value})} /></Field><Field label="Loading site"><Select value={form.loadingPointId||'none'} onValueChange={(value)=>setForm({...form,loadingPointId:value==='none'?'':value})}><SelectTrigger><SelectValue placeholder="Select site" /></SelectTrigger><SelectContent><SelectItem value="none">Select site</SelectItem>{loadingPoints.map((point)=><SelectItem key={point.id} value={point.id}>{point.name}{point.loadingCity?.name?` · ${point.loadingCity.name}`:''}</SelectItem>)}</SelectContent></Select></Field><Field label="Priority"><Select value={form.priority} onValueChange={(value)=>setForm({...form,priority:value})}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectItem value="low">Low</SelectItem><SelectItem value="normal">Normal</SelectItem><SelectItem value="high">High</SelectItem><SelectItem value="urgent">Urgent</SelectItem></SelectContent></Select></Field><Field label="Pickup window start"><Input type="datetime-local" value={form.pickupWindowStart} onChange={(e)=>setForm({...form,pickupWindowStart:e.target.value})} /></Field><Field label="Pickup window end"><Input type="datetime-local" value={form.pickupWindowEnd} onChange={(e)=>setForm({...form,pickupWindowEnd:e.target.value})} /></Field><Field label="Required vehicle type"><Input value={form.requiredVehicleType} onChange={(e)=>setForm({...form,requiredVehicleType:e.target.value})} placeholder="tractor / rigid" /></Field><Field label="Required trailer type"><Input value={form.requiredTrailerType} onChange={(e)=>setForm({...form,requiredTrailerType:e.target.value})} placeholder="flatbed / tanker" /></Field><Field label="Offered / contract rate"><Input type="number" min="0" step="0.01" value={form.offeredRate} onChange={(e)=>setForm({...form,offeredRate:e.target.value})} placeholder="GHS" /></Field><Field label="Special handling"><Input value={form.specialHandling} onChange={(e)=>setForm({...form,specialHandling:e.target.value})} /></Field></div>
      <Section title="Destinations" onAdd={()=>setForm({...form,destinations:[...form.destinations,destination(form.destinations.length+1)]})}>{form.destinations.map((item,index)=><div key={item.ref} className="grid gap-3 rounded-md bg-muted/30 p-3 sm:grid-cols-[1fr_1fr_auto]"><Field label={`Drop ${index+1}`}><Input value={item.name} onChange={(e)=>updateDestination(index,{name:e.target.value})} placeholder="Customer / depot" required /></Field><Field label="Address"><Input value={item.address} onChange={(e)=>updateDestination(index,{address:e.target.value})} /></Field><Button type="button" variant="ghost" className="self-end" disabled={form.destinations.length===1} onClick={()=>setForm({...form,destinations:form.destinations.filter((_,i)=>i!==index)})}><Trash2 className="h-4 w-4" /></Button></div>)}</Section>
      <Section title="Product lines" onAdd={()=>setForm({...form,lines:[...form.lines,line(form.lines.length+1,form.destinations[0]?.ref||'')]})}>{form.lines.map((item,index)=><div key={item.ref} className="grid gap-3 rounded-md bg-muted/30 p-3 sm:grid-cols-2 lg:grid-cols-[1.5fr_.7fr_.7fr_1fr_auto]"><Field label={`Product ${index+1}`}><Input value={item.itemName} onChange={(e)=>updateLine(index,{itemName:e.target.value})} required /></Field><Field label="Quantity"><Input type="number" min="0.0001" step="any" value={item.quantity} onChange={(e)=>updateLine(index,{quantity:e.target.value})} required /></Field><Field label="Unit"><Input value={item.unit} onChange={(e)=>updateLine(index,{unit:e.target.value})} placeholder="bags / tonnes / cartons" required /></Field><Field label="Destination"><Select value={item.destinationRef||'none'} onValueChange={(value)=>updateLine(index,{destinationRef:value==='none'?'':value})}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectItem value="none">Select drop</SelectItem>{form.destinations.map((drop,i)=><SelectItem key={drop.ref} value={drop.ref}>{drop.name || `Drop ${i+1}`}</SelectItem>)}</SelectContent></Select></Field><Button type="button" variant="ghost" className="self-end" disabled={form.lines.length===1} onClick={()=>setForm({...form,lines:form.lines.filter((_,i)=>i!==index)})}><Trash2 className="h-4 w-4" /></Button></div>)}</Section>
    </DialogBody><DialogFooter><Button type="button" variant="outline" onClick={()=>setOpen(false)}>Cancel</Button><Button type="submit" disabled={saving||!form.shipperProfileId||!form.loadingPointId}>{saving?'Creating...':'Create Load Order'}</Button></DialogFooter></form></DialogContent></Dialog>
  </div>
}

function Field({label,children}:{label:string;children:React.ReactNode}) { return <div className="space-y-2"><Label>{label}</Label>{children}</div> }
function Section({title,onAdd,children}:{title:string;onAdd:()=>void;children:React.ReactNode}) { return <div className="rounded-lg border p-4"><div className="mb-3 flex items-center justify-between"><h3 className="font-semibold">{title}</h3><Button type="button" variant="outline" size="sm" onClick={onAdd}><Plus className="mr-2 h-4 w-4" />Add</Button></div><div className="space-y-3">{children}</div></div> }
function labelStatus(value:string) { return value.replaceAll('_',' ').replace(/\b\w/g,(letter)=>letter.toUpperCase()) }
