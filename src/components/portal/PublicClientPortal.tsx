'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import {
  AlertTriangle,
  ArrowRight,
  Building2,
  CheckCircle2,
  CircleDot,
  Clock,
  FileText,
  Loader2,
  MapPin,
  Navigation,
  Package,
  RefreshCw,
  ShieldCheck,
  Truck,
} from 'lucide-react'

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
import { Progress } from '@/components/ui/progress'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { APP_NAME, CURRENCY_SYMBOL, TRIP_STATUSES } from '@/lib/constants'

interface DeliveryStop {
  id: string
  stopOrder: number
  destination: string
  expectedQty: number
  actualQty: number | null
  unit: string
  status: string
  arrivalTime: string | null
  offloadCompleted: string | null
}

interface ActiveShipment {
  id: string
  tripNumber: string
  status: string
  loadingLocation: string
  destination: string
  itemName: string
  quantity: number
  unit: string
  totalRevenue: number
  departureTime: string
  estimatedArrival: string | null
  truck: { plateNumber: string; make: string; model: string }
  driver: { firstName: string; lastName: string }
  progress: number
  deliveryStops: DeliveryStop[]
  latestLocation: {
    latitude: number
    longitude: number
    timestamp: string
    receivedAt: string
    speed: number | null
    source: string
    freshness: 'fresh' | 'stale' | 'unknown'
  } | null
}

interface PortalDashboard {
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
  activeShipments: ActiveShipment[]
  recentDeliveries: Array<{
    id: string
    tripNumber: string
    status: string
    loadingLocation: string
    destination: string
    itemName: string
    quantity: number
    unit: string
    totalRevenue: number
    departureTime: string
    arrivalTime: string | null
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
    tripNumber: string | null
  }>
}

interface ShipmentDetail {
  shipment: {
    id: string
    tripNumber: string
    status: string
    progress: number
    loadingLocation: string
    loadingAddress: string | null
    destination: string
    destinationAddress: string | null
    itemName: string
    quantity: number
    unit: string
    totalRevenue: number
    departureTime: string
    estimatedArrival: string | null
    estimatedDuration: number | null
    actualDuration: number | null
    waitingReason: string | null
    totalOffloaded: number
    waybillNumber: string | null
    customerRef: string | null
  }
  truck: { plateNumber: string; make: string; model: string }
  driver: { firstName: string; lastName: string }
  deliveryStops: Array<DeliveryStop & {
    address?: string | null
    customerName?: string | null
    offloadStarted?: string | null
  }>
  timeline: Array<{
    status: string
    fromStatus?: string
    timestamp: string
    location?: string
  }>
  steps: Array<{ label: string; status: 'completed' | 'current' | 'pending' }>
  latestLocation: {
    latitude: number
    longitude: number
    speed: number | null
    timestamp: string
    receivedAt: string
    source: string
    freshness: 'fresh' | 'stale' | 'unknown'
  } | null
}

function money(value: number): string {
  return `${CURRENCY_SYMBOL}${value.toLocaleString('en-GH', { maximumFractionDigits: 2 })}`
}

function dateTime(value: string | null): string {
  if (!value) return '—'
  return new Date(value).toLocaleString('en-GH', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  })
}

function dateOnly(value: string): string {
  return new Date(value).toLocaleDateString('en-GH', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  })
}

function statusLabel(value: string): string {
  return TRIP_STATUSES[value as keyof typeof TRIP_STATUSES]?.label ?? value.replaceAll('_', ' ')
}

function freshnessText(value: ActiveShipment['latestLocation']): string {
  if (!value) return 'Location unavailable'
  if (value.freshness === 'fresh') return 'Fresh location'
  if (value.freshness === 'stale') return 'Last known location is stale'
  return 'Location freshness unknown'
}

async function portalFetch<T>(path: string, token: string): Promise<T> {
  const response = await fetch(path, {
    method: 'GET',
    headers: { 'x-portal-token': token },
    cache: 'no-store',
  })
  const body = await response.json().catch(() => ({})) as { error?: string } & T
  if (!response.ok) throw new Error(body.error || 'Portal request failed')
  return body
}

export function PublicClientPortal() {
  const [token, setToken] = useState<string | null>(null)
  const [dashboard, setDashboard] = useState<PortalDashboard | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [detailId, setDetailId] = useState<string | null>(null)
  const [detail, setDetail] = useState<ShipmentDetail | null>(null)
  const [detailLoading, setDetailLoading] = useState(false)

  const captureToken = useCallback(() => {
    const fragment = new URLSearchParams(window.location.hash.replace(/^#/, ''))
    const access = fragment.get('access')
    if (!access) {
      setError('This portal link is missing its secure access token.')
      setLoading(false)
      return
    }
    setToken(access)
    window.history.replaceState(null, '', `${window.location.pathname}${window.location.search}`)
  }, [])

  useEffect(() => {
    captureToken()
  }, [captureToken])

  const loadDashboard = useCallback(async (accessToken: string) => {
    setLoading(true)
    setError(null)
    try {
      const data = await portalFetch<PortalDashboard>('/api/portal/public/client', accessToken)
      setDashboard(data)
    } catch (cause) {
      setDashboard(null)
      setError(cause instanceof Error ? cause.message : 'Portal link could not be validated.')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    if (token) void loadDashboard(token)
  }, [loadDashboard, token])

  const loadDetail = useCallback(async (tripId: string) => {
    if (!token) return
    setDetailId(tripId)
    setDetail(null)
    setDetailLoading(true)
    try {
      const data = await portalFetch<ShipmentDetail>(`/api/portal/public/shipment/${encodeURIComponent(tripId)}`, token)
      setDetail(data)
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Shipment details could not be loaded.')
      setDetailId(null)
    } finally {
      setDetailLoading(false)
    }
  }, [token])

  const outstanding = useMemo(() => {
    if (!dashboard) return 0
    return dashboard.invoices.reduce((sum, invoice) => sum + Math.max(0, invoice.totalAmount - invoice.paidAmount), 0)
  }, [dashboard])

  if (loading) {
    return (
      <PortalShell>
        <div className="flex min-h-[55vh] items-center justify-center">
          <div className="text-center">
            <Loader2 className="mx-auto h-8 w-8 animate-spin text-amber-600" />
            <p className="mt-3 font-medium">Opening secure shipment portal…</p>
            <p className="mt-1 text-sm text-muted-foreground">Validating your access link and loading current shipment information.</p>
          </div>
        </div>
      </PortalShell>
    )
  }

  if (error && !dashboard) {
    return (
      <PortalShell>
        <div className="mx-auto max-w-xl py-16">
          <Card className="border-amber-200">
            <CardContent className="p-8 text-center">
              <AlertTriangle className="mx-auto h-9 w-9 text-amber-600" />
              <h1 className="mt-4 text-xl font-semibold">Portal link unavailable</h1>
              <p className="mt-2 text-sm leading-6 text-muted-foreground">{error}</p>
              <p className="mt-3 text-xs text-muted-foreground">Request a new secure link from your transport provider if this link has expired.</p>
            </CardContent>
          </Card>
        </div>
      </PortalShell>
    )
  }

  if (!dashboard) return null

  return (
    <PortalShell>
      <div className="space-y-5">
        <section className="overflow-hidden rounded-2xl border bg-gradient-to-br from-amber-500 via-amber-600 to-orange-700 text-white shadow-sm">
          <div className="grid gap-6 p-5 sm:p-7 lg:grid-cols-[1fr_auto] lg:items-end">
            <div>
              <div className="flex items-center gap-3">
                <div className="rounded-xl bg-white/15 p-2.5 backdrop-blur">
                  <Building2 className="h-6 w-6" />
                </div>
                <div>
                  <p className="text-xs font-medium uppercase tracking-[0.2em] text-amber-100">Customer shipment portal</p>
                  <h1 className="mt-1 text-2xl font-bold sm:text-3xl">{dashboard.client.companyName}</h1>
                </div>
              </div>
              <p className="mt-4 max-w-2xl text-sm text-amber-50/90">
                Track active deliveries, review completed shipments and monitor invoice balances from one secure view.
              </p>
            </div>
            <div className="rounded-xl bg-black/10 px-4 py-3 text-sm backdrop-blur">
              <p className="text-xs text-amber-100">Account contact</p>
              <p className="mt-1 font-semibold">{dashboard.client.contactPerson}</p>
              {dashboard.client.email && <p className="mt-0.5 text-xs text-amber-100">{dashboard.client.email}</p>}
            </div>
          </div>
        </section>

        {error && (
          <div className="flex items-start gap-3 rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
            <span>{error}</span>
          </div>
        )}

        <section className="grid grid-cols-2 gap-3 xl:grid-cols-5">
          <SummaryCard label="Total shipments" value={String(dashboard.stats.totalTrips)} />
          <SummaryCard label="Active" value={String(dashboard.stats.activeTrips)} />
          <SummaryCard label="Completed" value={String(dashboard.stats.completedTrips)} />
          <SummaryCard label="Shipment value" value={money(dashboard.stats.totalRevenue)} />
          <SummaryCard label="Outstanding" value={money(outstanding)} />
        </section>

        <Tabs defaultValue="active" className="space-y-4">
          <TabsList className="h-auto flex-wrap">
            <TabsTrigger value="active">Active shipments</TabsTrigger>
            <TabsTrigger value="deliveries">Recent deliveries</TabsTrigger>
            <TabsTrigger value="invoices">Invoices</TabsTrigger>
          </TabsList>

          <TabsContent value="active" className="mt-0">
            {dashboard.activeShipments.length === 0 ? (
              <EmptyState icon={<Truck className="h-7 w-7" />} title="No active shipments" text="There are no shipments currently in progress." />
            ) : (
              <div className="grid gap-4 xl:grid-cols-2">
                {dashboard.activeShipments.map((shipment) => (
                  <Card key={shipment.id} className="overflow-hidden">
                    <CardContent className="p-4 sm:p-5">
                      <div className="flex flex-wrap items-start justify-between gap-3">
                        <div>
                          <Badge variant="outline" className="font-mono">{shipment.tripNumber}</Badge>
                          <div className="mt-3 flex min-w-0 items-center gap-2 text-sm font-medium">
                            <MapPin className="h-4 w-4 shrink-0 text-amber-600" />
                            <span className="truncate">{shipment.loadingLocation}</span>
                            <ArrowRight className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                            <span className="truncate">{shipment.destination}</span>
                          </div>
                        </div>
                        <Badge>{statusLabel(shipment.status)}</Badge>
                      </div>

                      <div className="mt-4">
                        <div className="mb-1.5 flex justify-between text-xs">
                          <span className="text-muted-foreground">Delivery progress</span>
                          <span className="font-semibold">{shipment.progress}%</span>
                        </div>
                        <Progress value={shipment.progress} className="h-2" />
                      </div>

                      <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
                        <Fact label="Cargo" value={`${shipment.quantity} ${shipment.unit}`} />
                        <Fact label="Truck" value={shipment.truck.plateNumber} />
                        <Fact label="Driver" value={`${shipment.driver.firstName} ${shipment.driver.lastName}`} />
                        <Fact label="ETA" value={shipment.estimatedArrival ? dateTime(shipment.estimatedArrival) : 'Pending'} />
                      </div>

                      <div className="mt-4 flex flex-col gap-3 border-t pt-4 sm:flex-row sm:items-center sm:justify-between">
                        <div className="flex items-start gap-2 text-xs text-muted-foreground">
                          <CircleDot className={`mt-0.5 h-3.5 w-3.5 shrink-0 ${shipment.latestLocation?.freshness === 'fresh' ? 'text-emerald-600' : 'text-amber-600'}`} />
                          <div>
                            <p>{freshnessText(shipment.latestLocation)}</p>
                            {shipment.latestLocation && <p className="mt-0.5">Updated {dateTime(shipment.latestLocation.receivedAt)}</p>}
                          </div>
                        </div>
                        <Button size="sm" onClick={() => void loadDetail(shipment.id)}>
                          <Navigation className="mr-2 h-4 w-4" />
                          Track shipment
                        </Button>
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>
            )}
          </TabsContent>

          <TabsContent value="deliveries" className="mt-0">
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Recent completed deliveries</CardTitle>
              </CardHeader>
              <CardContent className="space-y-2">
                {dashboard.recentDeliveries.length === 0 ? (
                  <p className="py-8 text-center text-sm text-muted-foreground">No completed deliveries yet.</p>
                ) : dashboard.recentDeliveries.map((delivery) => (
                  <div key={delivery.id} className="grid gap-3 rounded-xl border p-3 sm:grid-cols-[0.8fr_1.5fr_1fr_0.8fr] sm:items-center">
                    <div>
                      <p className="font-mono text-xs font-semibold">{delivery.tripNumber}</p>
                      <p className="mt-1 text-xs text-muted-foreground">{dateOnly(delivery.completedAt)}</p>
                    </div>
                    <p className="text-sm">{delivery.loadingLocation} → {delivery.destination}</p>
                    <p className="text-sm text-muted-foreground">{delivery.itemName} · {delivery.quantity} {delivery.unit}</p>
                    <p className="text-sm font-semibold sm:text-right">{money(delivery.totalRevenue)}</p>
                  </div>
                ))}
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="invoices" className="mt-0">
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Account invoices</CardTitle>
              </CardHeader>
              <CardContent className="space-y-2">
                {dashboard.invoices.length === 0 ? (
                  <p className="py-8 text-center text-sm text-muted-foreground">No invoices available.</p>
                ) : dashboard.invoices.map((invoice) => {
                  const invoiceOutstanding = Math.max(0, invoice.totalAmount - invoice.paidAmount)
                  return (
                    <div key={invoice.id} className="grid gap-3 rounded-xl border p-3 sm:grid-cols-[1fr_0.8fr_0.8fr_0.7fr] sm:items-center">
                      <div>
                        <div className="flex items-center gap-2">
                          <FileText className="h-4 w-4 text-muted-foreground" />
                          <p className="font-mono text-sm font-semibold">{invoice.invoiceNumber}</p>
                        </div>
                        <p className="mt-1 text-xs text-muted-foreground">Due {dateOnly(invoice.dueDate)}</p>
                      </div>
                      <Fact label="Total" value={money(invoice.totalAmount)} />
                      <Fact label="Outstanding" value={money(invoiceOutstanding)} />
                      <Badge variant="outline" className="w-fit capitalize">{invoice.status}</Badge>
                    </div>
                  )
                })}
                <p className="pt-2 text-xs text-muted-foreground">Invoice PDF downloads remain disabled on public share links until a token-bound document endpoint is enabled.</p>
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </div>

      <Dialog open={detailId !== null} onOpenChange={(open) => { if (!open) { setDetailId(null); setDetail(null) } }}>
        <DialogContent className="max-h-[90vh] max-w-2xl overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Shipment tracking</DialogTitle>
            <DialogDescription>Customer-visible progress and latest location evidence.</DialogDescription>
          </DialogHeader>

          {detailLoading ? (
            <div className="flex min-h-52 items-center justify-center">
              <Loader2 className="h-7 w-7 animate-spin" />
            </div>
          ) : detail ? (
            <div className="space-y-5">
              <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border p-4">
                <div>
                  <Badge variant="outline" className="font-mono">{detail.shipment.tripNumber}</Badge>
                  <p className="mt-2 font-semibold">{detail.shipment.loadingLocation} → {detail.shipment.destination}</p>
                </div>
                <Badge>{statusLabel(detail.shipment.status)}</Badge>
              </div>

              <div>
                <div className="mb-1.5 flex justify-between text-xs">
                  <span className="text-muted-foreground">Progress</span>
                  <span className="font-semibold">{detail.shipment.progress}%</span>
                </div>
                <Progress value={detail.shipment.progress} />
              </div>

              {detail.shipment.waitingReason && (
                <div className="flex items-start gap-2 rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">
                  <Clock className="mt-0.5 h-4 w-4 shrink-0" />
                  Waiting: {detail.shipment.waitingReason}
                </div>
              )}

              <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                <Fact label="Cargo" value={`${detail.shipment.quantity} ${detail.shipment.unit}`} />
                <Fact label="Truck" value={detail.truck.plateNumber} />
                <Fact label="Driver" value={`${detail.driver.firstName} ${detail.driver.lastName}`} />
                <Fact label="Waybill" value={detail.shipment.waybillNumber || 'Pending'} />
              </div>

              {detail.latestLocation && (
                <div className="rounded-xl border p-4">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <p className="text-sm font-semibold">Latest shipment location</p>
                      <p className="mt-1 text-xs text-muted-foreground">{detail.latestLocation.latitude.toFixed(5)}, {detail.latestLocation.longitude.toFixed(5)}</p>
                    </div>
                    <Badge variant="outline" className="capitalize">{detail.latestLocation.freshness}</Badge>
                  </div>
                  <p className="mt-3 text-xs text-muted-foreground">Received {dateTime(detail.latestLocation.receivedAt)} · source: {detail.latestLocation.source}</p>
                </div>
              )}

              <div>
                <h3 className="text-sm font-semibold">Journey timeline</h3>
                <div className="mt-3 space-y-2">
                  {detail.steps.map((step) => (
                    <div key={step.label} className="flex items-center gap-3 rounded-lg border p-3 text-sm">
                      {step.status === 'completed' ? <CheckCircle2 className="h-4 w-4 text-emerald-600" /> : step.status === 'current' ? <CircleDot className="h-4 w-4 text-amber-600" /> : <div className="h-4 w-4 rounded-full border" />}
                      <span className={step.status === 'current' ? 'font-semibold' : ''}>{step.label}</span>
                      <Badge variant="outline" className="ml-auto capitalize">{step.status}</Badge>
                    </div>
                  ))}
                </div>
              </div>

              {detail.deliveryStops.length > 0 && (
                <div>
                  <h3 className="text-sm font-semibold">Delivery stops</h3>
                  <div className="mt-3 space-y-2">
                    {detail.deliveryStops.map((stop) => (
                      <div key={stop.id} className="flex items-center gap-3 rounded-lg border p-3 text-sm">
                        <div className="flex h-7 w-7 items-center justify-center rounded-full bg-muted text-xs font-bold">{stop.stopOrder}</div>
                        <div className="min-w-0 flex-1">
                          <p className="font-medium">{stop.destination}</p>
                          <p className="text-xs text-muted-foreground">{stop.expectedQty} {stop.unit} expected{stop.actualQty != null ? ` · ${stop.actualQty} delivered` : ''}</p>
                        </div>
                        <Badge variant="outline" className="capitalize">{stop.status}</Badge>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          ) : (
            <p className="py-8 text-center text-sm text-muted-foreground">Shipment detail is unavailable.</p>
          )}
        </DialogContent>
      </Dialog>
    </PortalShell>
  )
}

function PortalShell({ children }: { children: React.ReactNode }) {
  return (
    <main className="min-h-screen bg-muted/20">
      <header className="border-b bg-background/95 backdrop-blur">
        <div className="mx-auto flex max-w-7xl items-center justify-between px-4 py-3 sm:px-6">
          <div className="flex items-center gap-2">
            <div className="rounded-lg bg-amber-600 p-2 text-white"><Truck className="h-4 w-4" /></div>
            <div>
              <p className="text-sm font-bold">{APP_NAME}</p>
              <p className="text-[11px] text-muted-foreground">Secure Client Portal</p>
            </div>
          </div>
          <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
            <ShieldCheck className="h-4 w-4 text-emerald-600" />
            Signed access link
          </div>
        </div>
      </header>
      <div className="mx-auto max-w-7xl px-4 py-5 sm:px-6 sm:py-7">{children}</div>
    </main>
  )
}

function SummaryCard({ label, value }: { label: string; value: string }) {
  return (
    <Card>
      <CardContent className="p-4">
        <p className="text-xs text-muted-foreground">{label}</p>
        <p className="mt-2 text-xl font-bold tracking-tight">{value}</p>
      </CardContent>
    </Card>
  )
}

function Fact({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="text-[11px] uppercase tracking-wide text-muted-foreground">{label}</p>
      <p className="mt-1 text-sm font-medium">{value}</p>
    </div>
  )
}

function EmptyState({ icon, title, text }: { icon: React.ReactNode; title: string; text: string }) {
  return (
    <Card>
      <CardContent className="py-12 text-center">
        <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-muted">{icon}</div>
        <p className="mt-3 font-semibold">{title}</p>
        <p className="mt-1 text-sm text-muted-foreground">{text}</p>
      </CardContent>
    </Card>
  )
}
