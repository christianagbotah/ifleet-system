'use client'

import * as React from 'react'
import { AlertCircle, PackageCheck, RefreshCw, Route, Truck } from 'lucide-react'

import { apiFetch } from '@/lib/api'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { EmptyState } from '@/components/ui/empty-state'
import { Skeleton } from '@/components/ui/skeleton'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { AssignmentDialog, type DispatchOrderForAssignment } from './AssignmentDialog'

interface LoadOrderRecord {
  id: string
  orderNumber: string
  status: string
  priority: string
  requiredTrailerType?: string | null
  shipperProfile: { name: string }
  loadingPoint: { name: string; loadingCity?: { name: string } | null }
  LoadOrderLine: Array<{ id: string; itemName: string; unit: string; orderedQuantity: number }>
  allocation: { valid: boolean; lines: Array<{ lineId: string; ordered: number; allocated: number; remaining: number }> }
  Trip: Array<{ id: string; tripNumber: string; status: string }>
}

export function DispatchView() {
  const [orders, setOrders] = React.useState<LoadOrderRecord[]>([])
  const [loading, setLoading] = React.useState(true)
  const [error, setError] = React.useState<string | null>(null)
  const [selected, setSelected] = React.useState<DispatchOrderForAssignment | null>(null)
  const [dialogOpen, setDialogOpen] = React.useState(false)

  const load = React.useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const result = await apiFetch<{ data: LoadOrderRecord[] }>('/api/load-orders?limit=100')
      setOrders(result.data.filter((order) => ['open', 'partially_allocated'].includes(order.status)))
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load dispatch queue')
    } finally {
      setLoading(false)
    }
  }, [])

  React.useEffect(() => { load() }, [load])

  const openAssignment = (order: LoadOrderRecord) => {
    const allocationById = new Map(order.allocation.lines.map((line) => [line.lineId, line]))
    setSelected({
      id: order.id,
      orderNumber: order.orderNumber,
      shipperName: order.shipperProfile.name,
      loadingPointName: `${order.loadingPoint.name}${order.loadingPoint.loadingCity?.name ? ` · ${order.loadingPoint.loadingCity.name}` : ''}`,
      requiredTrailerType: order.requiredTrailerType,
      lines: order.LoadOrderLine.map((line) => ({
        id: line.id,
        itemName: line.itemName,
        unit: line.unit,
        remaining: Math.max(0, allocationById.get(line.id)?.remaining ?? line.orderedQuantity),
      })).filter((line) => line.remaining > 0),
    })
    setDialogOpen(true)
  }

  const partiallyAllocated = orders.filter((order) => order.status === 'partially_allocated').length
  const remainingLines = orders.reduce((sum, order) => sum + order.allocation.lines.filter((line) => line.remaining > 0).length, 0)

  return (
    <div className="space-y-5">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Dispatch Control</h1>
          <p className="text-sm text-muted-foreground">Assign eligible drivers, tractors and trailers to unallocated shipper loads.</p>
        </div>
        <Button variant="outline" onClick={load} disabled={loading} className="gap-2"><RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} /> Refresh queue</Button>
      </div>

      <div className="grid gap-3 sm:grid-cols-3">
        <Card><CardHeader className="pb-2"><CardTitle className="text-xs font-medium text-muted-foreground">Ready to assign</CardTitle></CardHeader><CardContent className="flex items-center justify-between"><span className="text-2xl font-bold">{orders.length}</span><Route className="h-5 w-5 text-amber-500" /></CardContent></Card>
        <Card><CardHeader className="pb-2"><CardTitle className="text-xs font-medium text-muted-foreground">Partially allocated</CardTitle></CardHeader><CardContent className="flex items-center justify-between"><span className="text-2xl font-bold">{partiallyAllocated}</span><Truck className="h-5 w-5 text-sky-500" /></CardContent></Card>
        <Card><CardHeader className="pb-2"><CardTitle className="text-xs font-medium text-muted-foreground">Remaining load lines</CardTitle></CardHeader><CardContent className="flex items-center justify-between"><span className="text-2xl font-bold">{remainingLines}</span><PackageCheck className="h-5 w-5 text-emerald-500" /></CardContent></Card>
      </div>

      <Card>
        <CardContent className="p-0">
          {error ? (
            <div className="flex flex-col items-center gap-3 py-12 text-center"><AlertCircle className="h-8 w-8 text-red-500" /><p className="text-sm text-muted-foreground">{error}</p><Button variant="outline" onClick={load}>Retry</Button></div>
          ) : loading ? (
            <div className="space-y-3 p-4">{[1, 2, 3, 4].map((item) => <Skeleton key={item} className="h-14 w-full" />)}</div>
          ) : orders.length === 0 ? (
            <EmptyState icon={PackageCheck} title="Dispatch queue is clear" description="Open or partially allocated load orders will appear here for assignment." />
          ) : (
            <>
              <div className="hidden overflow-x-auto md:block">
                <Table>
                  <TableHeader><TableRow><TableHead>Order</TableHead><TableHead>Shipper / Loading point</TableHead><TableHead>Remaining</TableHead><TableHead>Trips</TableHead><TableHead>Priority</TableHead><TableHead className="text-right">Action</TableHead></TableRow></TableHeader>
                  <TableBody>{orders.map((order) => {
                    const remaining = order.allocation.lines.filter((line) => line.remaining > 0)
                    return <TableRow key={order.id}><TableCell><div className="font-semibold">{order.orderNumber}</div><div className="text-xs text-muted-foreground capitalize">{order.status.replaceAll('_', ' ')}</div></TableCell><TableCell><div>{order.shipperProfile.name}</div><div className="text-xs text-muted-foreground">{order.loadingPoint.name}</div></TableCell><TableCell>{remaining.map((line) => <div key={line.id} className="text-xs">{line.remaining.toLocaleString()} remaining</div>)}</TableCell><TableCell>{order.Trip.length}</TableCell><TableCell><Badge variant="outline" className="capitalize">{order.priority}</Badge></TableCell><TableCell className="text-right"><Button size="sm" onClick={() => openAssignment(order)} className="bg-amber-500 text-white hover:bg-amber-600">Assign resources</Button></TableCell></TableRow>
                  })}</TableBody>
                </Table>
              </div>
              <div className="divide-y md:hidden">{orders.map((order) => <div key={order.id} className="space-y-3 p-4"><div className="flex items-start justify-between gap-3"><div><p className="font-semibold">{order.orderNumber}</p><p className="text-xs text-muted-foreground">{order.shipperProfile.name} · {order.loadingPoint.name}</p></div><Badge variant="outline" className="capitalize">{order.priority}</Badge></div><div className="grid grid-cols-2 gap-3 text-sm"><div><p className="text-xs text-muted-foreground">Remaining lines</p><p className="font-medium">{order.allocation.lines.filter((line) => line.remaining > 0).length}</p></div><div><p className="text-xs text-muted-foreground">Existing trips</p><p className="font-medium">{order.Trip.length}</p></div></div><Button onClick={() => openAssignment(order)} className="min-h-[44px] w-full bg-amber-500 text-white hover:bg-amber-600">Assign resources</Button></div>)}</div>
            </>
          )}
        </CardContent>
      </Card>

      <AssignmentDialog open={dialogOpen} onOpenChange={setDialogOpen} order={selected} onAssigned={load} />
    </div>
  )
}
