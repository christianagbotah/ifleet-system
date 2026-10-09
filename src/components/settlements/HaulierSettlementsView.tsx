'use client'

import * as React from 'react'
import { Building2, CheckCircle2, Loader2, RefreshCw, Truck, WalletCards } from 'lucide-react'
import { toast } from 'sonner'

import { apiFetch } from '@/lib/api'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'

interface HaulierSettlementLine {
  id: string
  type: string
  description: string
  amount: number
}

interface HaulierSettlement {
  id: string
  tripId: string
  payeeType: string
  payeeId: string
  payeeName: string
  currency: string
  baseFreight: number
  detentionAmount: number
  extrasAmount: number
  shortageDeduction: number
  fuelAdjustment: number
  taxAmount: number
  withholdingAmount: number
  advanceDeduction: number
  netPayable: number
  status: string
  snapshotVersion: number
  snapshotJson: string
  createdAt: string
  approvedAt?: string | null
  paidAt?: string | null
  lines: HaulierSettlementLine[]
}

interface EligibleTrip {
  id: string
  tripNumber: string
  itemName: string
  quantity: number
  unit: string
  destination: string
  truck: { plateNumber: string }
}

interface HaulierSettlementResponse {
  settlements: HaulierSettlement[]
  eligibleTrips: EligibleTrip[]
}

function money(amount: number, currency = 'GHS') {
  return new Intl.NumberFormat('en-GH', { style: 'currency', currency, maximumFractionDigits: 2 }).format(amount)
}

function statusBadge(status: string) {
  if (status === 'paid') return <Badge className="bg-emerald-100 text-emerald-700 hover:bg-emerald-100">Paid</Badge>
  if (status === 'approved') return <Badge className="bg-sky-100 text-sky-700 hover:bg-sky-100">Approved</Badge>
  return <Badge variant="secondary">Draft</Badge>
}

function snapshotTripNumber(settlement: HaulierSettlement) {
  try {
    const snapshot = JSON.parse(settlement.snapshotJson) as { trip?: { tripNumber?: string } }
    return snapshot.trip?.tripNumber || settlement.tripId
  } catch {
    return settlement.tripId
  }
}

export function HaulierSettlementsView() {
  const [data, setData] = React.useState<HaulierSettlementResponse>({ settlements: [], eligibleTrips: [] })
  const [selectedTripId, setSelectedTripId] = React.useState('')
  const [loading, setLoading] = React.useState(true)
  const [busyId, setBusyId] = React.useState<string | null>(null)
  const [expandedId, setExpandedId] = React.useState<string | null>(null)

  const load = React.useCallback(async () => {
    setLoading(true)
    try {
      const response = await apiFetch<HaulierSettlementResponse>('/api/haulier-settlements')
      setData(response)
      setSelectedTripId((current) => response.eligibleTrips.some((trip) => trip.id === current) ? current : '')
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Failed to load haulier settlements')
    } finally {
      setLoading(false)
    }
  }, [])

  React.useEffect(() => { void load() }, [load])

  async function generate() {
    if (!selectedTripId) return
    setBusyId('generate')
    try {
      await apiFetch('/api/haulier-settlements', {
        method: 'POST',
        body: JSON.stringify({ tripId: selectedTripId }),
      })
      toast.success('Haulier settlement generated from reconciled trip facts')
      await load()
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Failed to generate settlement')
    } finally {
      setBusyId(null)
    }
  }

  async function transition(settlement: HaulierSettlement, status: 'approved' | 'paid') {
    setBusyId(settlement.id)
    try {
      await apiFetch(`/api/haulier-settlements/${settlement.id}`, {
        method: 'PUT',
        body: JSON.stringify({ status }),
      })
      toast.success(status === 'approved' ? 'Settlement approved and locked' : 'Settlement marked paid')
      await load()
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Failed to update settlement')
    } finally {
      setBusyId(null)
    }
  }

  const outstanding = data.settlements
    .filter((settlement) => settlement.status !== 'paid')
    .reduce((sum, settlement) => sum + settlement.netPayable, 0)
  const paid = data.settlements
    .filter((settlement) => settlement.status === 'paid')
    .reduce((sum, settlement) => sum + settlement.netPayable, 0)

  return (
    <div className="space-y-6 p-4 md:p-6">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <div className="mb-2 flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.2em] text-sky-600">
            <WalletCards className="h-4 w-4" /> Financial closure
          </div>
          <h1 className="text-2xl font-semibold tracking-tight md:text-3xl">Haulier Settlements</h1>
          <p className="mt-1 max-w-2xl text-sm text-muted-foreground">
            Settle third-party transporters and vehicle owners from approved reconciliation, verified POD and effective transport rate cards.
          </p>
        </div>
        <Button variant="outline" onClick={() => void load()} disabled={loading} className="cursor-pointer">
          <RefreshCw className={`mr-2 h-4 w-4 ${loading ? 'animate-spin' : ''}`} /> Refresh
        </Button>
      </div>

      <div className="grid gap-4 md:grid-cols-3">
        <Card><CardHeader className="pb-2"><CardDescription>Eligible reconciled trips</CardDescription><CardTitle className="text-3xl">{data.eligibleTrips.length}</CardTitle></CardHeader></Card>
        <Card><CardHeader className="pb-2"><CardDescription>Outstanding third-party payable</CardDescription><CardTitle className="text-2xl">{money(outstanding)}</CardTitle></CardHeader></Card>
        <Card><CardHeader className="pb-2"><CardDescription>Paid settlements</CardDescription><CardTitle className="text-2xl">{money(paid)}</CardTitle></CardHeader></Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Generate from reconciled trip</CardTitle>
          <CardDescription>Amounts are calculated by contract/rate card. They cannot be manually keyed here.</CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-3 md:flex-row">
          <Select value={selectedTripId} onValueChange={setSelectedTripId}>
            <SelectTrigger className="min-h-11 flex-1 cursor-pointer"><SelectValue placeholder="Select an eligible reconciled trip" /></SelectTrigger>
            <SelectContent>
              {data.eligibleTrips.map((trip) => (
                <SelectItem key={trip.id} value={trip.id} className="cursor-pointer">
                  {trip.tripNumber} · {trip.truck.plateNumber} · {trip.itemName} · {trip.destination}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Button onClick={() => void generate()} disabled={!selectedTripId || busyId === 'generate'} className="min-h-11 cursor-pointer">
            {busyId === 'generate' ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Truck className="mr-2 h-4 w-4" />}
            Generate settlement
          </Button>
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle className="text-lg">Settlement ledger</CardTitle><CardDescription>Approved and paid snapshots remain immutable.</CardDescription></CardHeader>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <Table>
              <TableHeader><TableRow>
                <TableHead>Trip</TableHead><TableHead>Payee</TableHead><TableHead>Type</TableHead><TableHead>Status</TableHead>
                <TableHead className="text-right">Freight</TableHead><TableHead className="text-right">Net payable</TableHead><TableHead className="text-right">Actions</TableHead>
              </TableRow></TableHeader>
              <TableBody>
                {data.settlements.map((settlement) => (
                  <React.Fragment key={settlement.id}>
                    <TableRow>
                      <TableCell className="font-medium">{snapshotTripNumber(settlement)}</TableCell>
                      <TableCell><div className="flex items-center gap-2"><Building2 className="h-4 w-4 text-muted-foreground" />{settlement.payeeName}</div></TableCell>
                      <TableCell className="capitalize">{settlement.payeeType.replace('_', ' ')}</TableCell>
                      <TableCell>{statusBadge(settlement.status)}</TableCell>
                      <TableCell className="text-right">{money(settlement.baseFreight, settlement.currency)}</TableCell>
                      <TableCell className="text-right font-semibold">{money(settlement.netPayable, settlement.currency)}</TableCell>
                      <TableCell>
                        <div className="flex justify-end gap-2">
                          <Button size="sm" variant="ghost" className="cursor-pointer" onClick={() => setExpandedId(expandedId === settlement.id ? null : settlement.id)}>Details</Button>
                          {settlement.status === 'draft' && <Button size="sm" className="cursor-pointer" disabled={busyId === settlement.id} onClick={() => void transition(settlement, 'approved')}>Approve</Button>}
                          {settlement.status === 'approved' && <Button size="sm" className="cursor-pointer" disabled={busyId === settlement.id} onClick={() => void transition(settlement, 'paid')}><CheckCircle2 className="mr-1 h-4 w-4" />Pay</Button>}
                        </div>
                      </TableCell>
                    </TableRow>
                    {expandedId === settlement.id && (
                      <TableRow><TableCell colSpan={7} className="bg-muted/30 p-4">
                        <div className="grid gap-3 text-sm sm:grid-cols-2 lg:grid-cols-4">
                          <div><span className="text-muted-foreground">Detention</span><div className="font-medium">{money(settlement.detentionAmount, settlement.currency)}</div></div>
                          <div><span className="text-muted-foreground">Approved extras</span><div className="font-medium">{money(settlement.extrasAmount, settlement.currency)}</div></div>
                          <div><span className="text-muted-foreground">Shortage deduction</span><div className="font-medium">{money(settlement.shortageDeduction, settlement.currency)}</div></div>
                          <div><span className="text-muted-foreground">Fuel adjustment</span><div className="font-medium">{money(settlement.fuelAdjustment, settlement.currency)}</div></div>
                          <div><span className="text-muted-foreground">Tax</span><div className="font-medium">{money(settlement.taxAmount, settlement.currency)}</div></div>
                          <div><span className="text-muted-foreground">Withholding</span><div className="font-medium">{money(settlement.withholdingAmount, settlement.currency)}</div></div>
                          <div><span className="text-muted-foreground">Advance deducted</span><div className="font-medium">{money(settlement.advanceDeduction, settlement.currency)}</div></div>
                          <div><span className="text-muted-foreground">Snapshot</span><div className="font-medium">v{settlement.snapshotVersion}</div></div>
                        </div>
                        <div className="mt-4 border-t pt-3">
                          <div className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">Settlement lines</div>
                          <div className="space-y-1">
                            {settlement.lines.map((line) => <div key={line.id} className="flex justify-between gap-4"><span>{line.description}</span><span className="font-medium tabular-nums">{money(line.amount, settlement.currency)}</span></div>)}
                          </div>
                        </div>
                      </TableCell></TableRow>
                    )}
                  </React.Fragment>
                ))}
                {!loading && data.settlements.length === 0 && <TableRow><TableCell colSpan={7} className="py-12 text-center text-muted-foreground">No haulier settlements yet.</TableCell></TableRow>}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
