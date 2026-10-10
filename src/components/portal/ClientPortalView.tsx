'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import {
  AlertTriangle,
  Building2,
  CheckCircle2,
  ClipboardCopy,
  ExternalLink,
  FileText,
  Loader2,
  MapPin,
  Navigation,
  Search,
  ShieldCheck,
  Truck,
} from 'lucide-react'
import { toast } from 'sonner'

import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Progress } from '@/components/ui/progress'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { apiFetch, fetchClients, type Client } from '@/lib/api'
import { CURRENCY_SYMBOL, TRIP_STATUSES } from '@/lib/constants'

interface ShareResult {
  clientId: string
  token: string
  expiresAt: string
  path: string
}

interface Dashboard {
  client: {
    id: string
    companyName: string
    contactPerson: string
    email: string | null
    phone: string
  }
  stats: {
    totalTrips: number
    completedTrips: number
    activeTrips: number
    pendingTrips: number
    totalRevenue: number
    avgTripValue: number
  }
  activeShipments: Array<{
    id: string
    tripNumber: string
    status: string
    loadingLocation: string
    destination: string
    itemName: string
    quantity: number
    unit: string
    totalRevenue: number
    truck: { plateNumber: string; make: string; model: string }
    driver: { firstName: string; lastName: string }
    progress: number
    latestLocation: {
      receivedAt: string
      freshness: 'fresh' | 'stale' | 'unknown'
      source: string
    } | null
  }>
  recentDeliveries: Array<{
    id: string
    tripNumber: string
    loadingLocation: string
    destination: string
    totalRevenue: number
    completedAt: string
  }>
  invoices: Array<{
    id: string
    invoiceNumber: string
    issueDate: string
    dueDate: string
    totalAmount: number
    paidAmount: number
    status: string
  }>
}

interface ShipmentDetail {
  shipment: {
    id: string
    tripNumber: string
    status: string
    progress: number
    loadingLocation: string
    destination: string
    itemName: string
    quantity: number
    unit: string
    waitingReason: string | null
    waybillNumber: string | null
  }
  truck: { plateNumber: string; make: string; model: string }
  driver: { firstName: string; lastName: string }
  steps: Array<{ label: string; status: 'completed' | 'current' | 'pending' }>
  latestLocation: {
    latitude: number
    longitude: number
    receivedAt: string
    source: string
    freshness: 'fresh' | 'stale' | 'unknown'
  } | null
}

function money(value: number) {
  return `${CURRENCY_SYMBOL}${value.toLocaleString('en-GH', { maximumFractionDigits: 2 })}`
}

function statusLabel(value: string) {
  return TRIP_STATUSES[value as keyof typeof TRIP_STATUSES]?.label ?? value.replaceAll('_', ' ')
}

async function portalFetch<T>(path: string, token: string): Promise<T> {
  const response = await fetch(path, {
    headers: { 'x-portal-token': token },
    cache: 'no-store',
  })
  const body = await response.json().catch(() => ({})) as T & { error?: string }
  if (!response.ok) throw new Error(body.error || 'Portal request failed')
  return body
}

export function ClientPortalView() {
  const [clients, setClients] = useState<Client[]>([])
  const [query, setQuery] = useState('')
  const [selectedClientId, setSelectedClientId] = useState('')
  const [dashboard, setDashboard] = useState<Dashboard | null>(null)
  const [previewToken, setPreviewToken] = useState<string | null>(null)
  const [shareExpiresAt, setShareExpiresAt] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [detail, setDetail] = useState<ShipmentDetail | null>(null)
  const [detailOpen, setDetailOpen] = useState(false)
  const [detailLoading, setDetailLoading] = useState(false)

  useEffect(() => {
    fetchClients({ limit: 100 })
      .then((response) => setClients(response.data ?? []))
      .catch((cause) => setError(cause instanceof Error ? cause.message : 'Clients could not be loaded.'))
  }, [])

  const filteredClients = useMemo(() => {
    const normalized = query.trim().toLowerCase()
    if (!normalized) return clients
    return clients.filter((client) =>
      client.companyName.toLowerCase().includes(normalized)
      || client.contactPerson.toLowerCase().includes(normalized),
    )
  }, [clients, query])

  const issueShare = useCallback(async (clientId: string, expiresInDays = 7) => {
    return apiFetch<ShareResult>(`/api/portal/share/client/${encodeURIComponent(clientId)}`, {
      method: 'POST',
      body: JSON.stringify({ expiresInDays }),
    })
  }, [])

  const loadPreview = useCallback(async () => {
    if (!selectedClientId) return
    setLoading(true)
    setError(null)
    setDashboard(null)
    try {
      const share = await issueShare(selectedClientId)
      const data = await portalFetch<Dashboard>('/api/portal/public/client', share.token)
      setPreviewToken(share.token)
      setShareExpiresAt(share.expiresAt)
      setDashboard(data)
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Client portal preview could not be loaded.')
    } finally {
      setLoading(false)
    }
  }, [issueShare, selectedClientId])

  const copyShareLink = useCallback(async () => {
    if (!selectedClientId) return
    try {
      const share = await issueShare(selectedClientId)
      const expectedFragment = '/portal#access='
      if (!share.path.startsWith(expectedFragment)) throw new Error('Unexpected portal link format')
      const link = `${window.location.origin}${share.path}`
      await navigator.clipboard.writeText(link)
      toast.success('Secure client portal link copied')
      setShareExpiresAt(share.expiresAt)
    } catch (cause) {
      toast.error(cause instanceof Error ? cause.message : 'Could not generate portal link')
    }
  }, [issueShare, selectedClientId])

  const openShipment = useCallback(async (tripId: string) => {
    if (!previewToken) {
      toast.error('Load the portal preview first.')
      return
    }
    setDetailOpen(true)
    setDetailLoading(true)
    setDetail(null)
    try {
      const data = await portalFetch<ShipmentDetail>(`/api/portal/public/shipment/${encodeURIComponent(tripId)}`, previewToken)
      setDetail(data)
    } catch (cause) {
      toast.error(cause instanceof Error ? cause.message : 'Shipment could not be loaded')
      setDetailOpen(false)
    } finally {
      setDetailLoading(false)
    }
  }, [previewToken])

  const selectedClient = clients.find((client) => client.id === selectedClientId) ?? null

  return (
    <div className="space-y-5">
      <div>
        <div className="flex flex-wrap items-center gap-2">
          <h1 className="text-2xl font-bold tracking-tight">Client Portal</h1>
          <Badge variant="outline" className="gap-1"><ShieldCheck className="h-3 w-3" />Secure share links</Badge>
        </div>
        <p className="mt-1 max-w-3xl text-sm text-muted-foreground">
          Preview exactly what a client will see and generate signed, expiring portal links without exposing raw client or shipment IDs as credentials.
        </p>
      </div>

      <Card>
        <CardContent className="p-4 sm:p-5">
          <div className="grid gap-3 lg:grid-cols-[1fr_auto_auto] lg:items-end">
            <div className="space-y-2">
              <label className="text-sm font-medium">Client</label>
              <div className="relative">
                <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                <Input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search client by company or contact" className="pl-9" />
              </div>
              <div className="max-h-48 overflow-y-auto rounded-xl border">
                {filteredClients.slice(0, 30).map((client) => (
                  <button
                    key={client.id}
                    type="button"
                    onClick={() => { setSelectedClientId(client.id); setDashboard(null); setPreviewToken(null) }}
                    className={`flex w-full cursor-pointer items-center gap-3 border-b px-3 py-2.5 text-left text-sm last:border-b-0 hover:bg-muted/60 ${selectedClientId === client.id ? 'bg-amber-50 dark:bg-amber-950/20' : ''}`}
                  >
                    <Building2 className="h-4 w-4 shrink-0 text-amber-600" />
                    <div className="min-w-0 flex-1">
                      <p className="truncate font-medium">{client.companyName}</p>
                      <p className="truncate text-xs text-muted-foreground">{client.contactPerson}</p>
                    </div>
                    {client.isActive ? <Badge variant="outline">Active</Badge> : <Badge variant="secondary">Inactive</Badge>}
                  </button>
                ))}
              </div>
            </div>
            <Button onClick={() => void loadPreview()} disabled={!selectedClientId || loading}>
              {loading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <ExternalLink className="mr-2 h-4 w-4" />}
              View secure preview
            </Button>
            <Button variant="outline" onClick={() => void copyShareLink()} disabled={!selectedClientId}>
              <ClipboardCopy className="mr-2 h-4 w-4" />
              Copy 7-day link
            </Button>
          </div>

          {selectedClient && (
            <div className="mt-4 flex flex-wrap items-center gap-2 border-t pt-4 text-sm">
              <CheckCircle2 className="h-4 w-4 text-emerald-600" />
              <span className="font-medium">{selectedClient.companyName}</span>
              {shareExpiresAt && <span className="text-xs text-muted-foreground">Latest link expires {new Date(shareExpiresAt).toLocaleString()}</span>}
            </div>
          )}
        </CardContent>
      </Card>

      {error && (
        <div className="flex items-start gap-3 rounded-xl border border-destructive/30 p-4 text-sm">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-destructive" />
          {error}
        </div>
      )}

      {dashboard && (
        <div className="space-y-4">
          <div className="rounded-2xl bg-gradient-to-r from-amber-500 to-orange-600 p-5 text-white">
            <p className="text-xs uppercase tracking-[0.18em] text-amber-100">Secure client preview</p>
            <h2 className="mt-1 text-2xl font-bold">{dashboard.client.companyName}</h2>
            <p className="mt-2 text-sm text-amber-50">{dashboard.client.contactPerson}{dashboard.client.email ? ` · ${dashboard.client.email}` : ''}</p>
          </div>

          <div className="grid grid-cols-2 gap-3 xl:grid-cols-4">
            <Summary label="Total shipments" value={String(dashboard.stats.totalTrips)} />
            <Summary label="Active" value={String(dashboard.stats.activeTrips)} />
            <Summary label="Completed" value={String(dashboard.stats.completedTrips)} />
            <Summary label="Total value" value={money(dashboard.stats.totalRevenue)} />
          </div>

          <Tabs defaultValue="shipments">
            <TabsList className="h-auto flex-wrap">
              <TabsTrigger value="shipments">Active shipments</TabsTrigger>
              <TabsTrigger value="deliveries">Recent deliveries</TabsTrigger>
              <TabsTrigger value="invoices">Invoices</TabsTrigger>
            </TabsList>

            <TabsContent value="shipments" className="mt-4">
              <div className="grid gap-4 xl:grid-cols-2">
                {dashboard.activeShipments.map((shipment) => (
                  <Card key={shipment.id}>
                    <CardContent className="p-4">
                      <div className="flex items-start justify-between gap-3">
                        <div>
                          <Badge variant="outline" className="font-mono">{shipment.tripNumber}</Badge>
                          <p className="mt-2 text-sm font-medium">{shipment.loadingLocation} → {shipment.destination}</p>
                        </div>
                        <Badge>{statusLabel(shipment.status)}</Badge>
                      </div>
                      <div className="mt-4">
                        <div className="mb-1.5 flex justify-between text-xs"><span className="text-muted-foreground">Progress</span><span>{shipment.progress}%</span></div>
                        <Progress value={shipment.progress} className="h-2" />
                      </div>
                      <div className="mt-4 grid grid-cols-3 gap-3 text-sm">
                        <Fact label="Truck" value={shipment.truck.plateNumber} />
                        <Fact label="Driver" value={`${shipment.driver.firstName} ${shipment.driver.lastName}`} />
                        <Fact label="Location" value={shipment.latestLocation?.freshness ?? 'unknown'} />
                      </div>
                      <Button size="sm" className="mt-4" onClick={() => void openShipment(shipment.id)}>
                        <Navigation className="mr-2 h-4 w-4" />Track
                      </Button>
                    </CardContent>
                  </Card>
                ))}
                {dashboard.activeShipments.length === 0 && <p className="text-sm text-muted-foreground">No active shipments.</p>}
              </div>
            </TabsContent>

            <TabsContent value="deliveries" className="mt-4">
              <Card><CardContent className="space-y-2 p-4">
                {dashboard.recentDeliveries.map((delivery) => (
                  <div key={delivery.id} className="grid gap-2 rounded-lg border p-3 sm:grid-cols-[0.8fr_1.4fr_0.8fr] sm:items-center">
                    <span className="font-mono text-xs font-semibold">{delivery.tripNumber}</span>
                    <span className="text-sm">{delivery.loadingLocation} → {delivery.destination}</span>
                    <span className="text-sm font-semibold sm:text-right">{money(delivery.totalRevenue)}</span>
                  </div>
                ))}
              </CardContent></Card>
            </TabsContent>

            <TabsContent value="invoices" className="mt-4">
              <Card><CardContent className="space-y-2 p-4">
                {dashboard.invoices.map((invoice) => (
                  <div key={invoice.id} className="grid gap-2 rounded-lg border p-3 sm:grid-cols-[1fr_0.8fr_0.8fr] sm:items-center">
                    <div className="flex items-center gap-2"><FileText className="h-4 w-4" /><span className="font-mono text-sm font-semibold">{invoice.invoiceNumber}</span></div>
                    <span className="text-sm">{money(invoice.totalAmount)}</span>
                    <Badge variant="outline" className="w-fit capitalize sm:justify-self-end">{invoice.status}</Badge>
                  </div>
                ))}
              </CardContent></Card>
            </TabsContent>
          </Tabs>
        </div>
      )}

      <Dialog open={detailOpen} onOpenChange={setDetailOpen}>
        <DialogContent className="max-h-[90vh] max-w-2xl overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Secure shipment preview</DialogTitle>
            <DialogDescription>Same token-bound shipment payload exposed to the client portal.</DialogDescription>
          </DialogHeader>
          {detailLoading ? (
            <div className="flex min-h-48 items-center justify-center"><Loader2 className="h-7 w-7 animate-spin" /></div>
          ) : detail ? (
            <div className="space-y-4">
              <div className="flex items-start justify-between gap-3 rounded-xl border p-4">
                <div>
                  <Badge variant="outline" className="font-mono">{detail.shipment.tripNumber}</Badge>
                  <p className="mt-2 font-semibold">{detail.shipment.loadingLocation} → {detail.shipment.destination}</p>
                </div>
                <Badge>{statusLabel(detail.shipment.status)}</Badge>
              </div>
              <Progress value={detail.shipment.progress} />
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                <Fact label="Cargo" value={`${detail.shipment.quantity} ${detail.shipment.unit}`} />
                <Fact label="Truck" value={detail.truck.plateNumber} />
                <Fact label="Driver" value={`${detail.driver.firstName} ${detail.driver.lastName}`} />
                <Fact label="Waybill" value={detail.shipment.waybillNumber || 'Pending'} />
              </div>
              {detail.latestLocation && (
                <div className="rounded-xl border p-4 text-sm">
                  <div className="flex items-center gap-2"><MapPin className="h-4 w-4" /><span className="font-medium">Latest location</span><Badge variant="outline" className="ml-auto capitalize">{detail.latestLocation.freshness}</Badge></div>
                  <p className="mt-2 text-xs text-muted-foreground">{detail.latestLocation.latitude.toFixed(5)}, {detail.latestLocation.longitude.toFixed(5)} · {detail.latestLocation.source}</p>
                </div>
              )}
              <div className="space-y-2">
                {detail.steps.map((step) => (
                  <div key={step.label} className="flex items-center gap-2 rounded-lg border p-3 text-sm">
                    {step.status === 'completed' ? <CheckCircle2 className="h-4 w-4 text-emerald-600" /> : <Truck className="h-4 w-4 text-muted-foreground" />}
                    <span>{step.label}</span><Badge variant="outline" className="ml-auto capitalize">{step.status}</Badge>
                  </div>
                ))}
              </div>
            </div>
          ) : null}
        </DialogContent>
      </Dialog>
    </div>
  )
}

function Summary({ label, value }: { label: string; value: string }) {
  return <Card><CardContent className="p-4"><p className="text-xs text-muted-foreground">{label}</p><p className="mt-2 text-xl font-bold">{value}</p></CardContent></Card>
}

function Fact({ label, value }: { label: string; value: string }) {
  return <div><p className="text-[11px] uppercase tracking-wide text-muted-foreground">{label}</p><p className="mt-1 text-sm font-medium">{value}</p></div>
}
