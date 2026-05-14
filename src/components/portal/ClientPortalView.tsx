'use client'

import React, { useState, useEffect, useCallback } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import {
  Truck, MapPin, Package, Phone, Clock, CheckCircle2,
  Circle, ArrowRight, Download, ExternalLink, Copy,
  ChevronRight, Navigation, Loader2, Building2,
  TrendingUp, AlertTriangle, FileText, CreditCard,
  RefreshCw, Search, Globe, Mail, HelpCircle,
  CircleDot, ArrowDown,
} from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Progress } from '@/components/ui/progress'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Input } from '@/components/ui/input'
import { Skeleton } from '@/components/ui/skeleton'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog'
import {
  ResponsiveDialogContent,
} from '@/components/ui/responsive-dialog'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Separator } from '@/components/ui/separator'
import { apiFetch, fetchClients, type Client } from '@/lib/api'
import { TRIP_STATUSES, CURRENCY_SYMBOL, APP_NAME } from '@/lib/constants'
import { toast } from 'sonner'

// ============ Types ============

interface PortalClient {
  id: string
  companyName: string
  contactPerson: string
  email: string | null
  phone: string
}

interface PortalStats {
  totalTrips: number
  completedTrips: number
  activeTrips: number
  pendingTrips: number
  totalRevenue: number
  avgTripValue: number
}

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
  truck: { plateNumber: string; make: string }
  driver: { firstName: string; lastName: string; phone: string }
  progress: number
  deliveryStops: DeliveryStop[]
  latestLocation: {
    latitude: number
    longitude: number
    timestamp: string
    speed: number | null
  } | null
}

interface RecentDelivery {
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
}

interface Invoice {
  id: string
  invoiceNumber: string
  issueDate: string
  dueDate: string
  totalAmount: number
  paidAmount: number
  status: string
  tripNumber: string | null
}

interface ClientPortalData {
  client: PortalClient
  stats: PortalStats
  activeShipments: ActiveShipment[]
  recentDeliveries: RecentDelivery[]
  invoices: Invoice[]
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
    totalRevenue: number
    departureTime: string
    estimatedArrival: string | null
    estimatedDuration: number | null
    actualDuration: number | null
    waitingReason: string | null
    totalOffloaded: number
    notes: string | null
    waybillNumber: string | null
  }
  truck: { plateNumber: string; make: string; model: string }
  driver: { firstName: string; lastName: string; phone: string; employeeId: string }
  deliveryStops: DeliveryStop[]
  timeline: { status: string; fromStatus?: string; timestamp: string; notes?: string; location?: string }[]
  steps: { label: string; status: 'completed' | 'current' | 'pending' }[]
  latestLocation: { latitude: number; longitude: number; speed: number | null; timestamp: string } | null
  routeCoordinates: { lat: number; lng: number; speed: number | null; timestamp: string }[]
}

// ============ Helpers ============

function formatCurrency(n: number): string {
  return `${CURRENCY_SYMBOL}${n.toLocaleString('en-GH', { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString('en-GB', {
    day: '2-digit', month: 'short', year: 'numeric',
  })
}

function formatDateTime(iso: string): string {
  return new Date(iso).toLocaleString('en-GB', {
    day: '2-digit', month: 'short', year: 'numeric',
    hour: '2-digit', minute: '2-digit',
  })
}

function formatTime(iso: string): string {
  return new Date(iso).toLocaleTimeString('en-GB', {
    hour: '2-digit', minute: '2-digit',
  })
}

function timeAgo(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime()
  const mins = Math.floor(diff / 60000)
  if (mins < 1) return 'Just now'
  if (mins < 60) return `${mins}m ago`
  const hours = Math.floor(mins / 60)
  if (hours < 24) return `${hours}h ago`
  const days = Math.floor(hours / 24)
  return `${days}d ago`
}

function getStatusColor(status: string): string {
  return TRIP_STATUSES[status as keyof typeof TRIP_STATUSES]?.color ?? 'bg-gray-100 text-gray-600'
}

function getInvoiceStatusBadge(status: string) {
  switch (status) {
    case 'paid':
      return 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400'
    case 'sent':
      return 'bg-sky-100 text-sky-700 dark:bg-sky-900/30 dark:text-sky-400'
    case 'pending':
      return 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400'
    case 'overdue':
      return 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400'
    default:
      return 'bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-400'
  }
}

// ============ Sub-Components ============

function StatCard({ icon: Icon, label, value, color }: {
  icon: React.ElementType
  label: string
  value: string | number
  color: string
}) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3 }}
    >
      <Card className="border-0 shadow-sm bg-gradient-to-br from-white to-gray-50/50 dark:from-gray-900 dark:to-gray-900/80">
        <CardContent className="p-4 sm:p-6">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-xs sm:text-sm text-muted-foreground font-medium">{label}</p>
              <p className={`text-xl sm:text-2xl font-bold mt-1 ${color}`}>{value}</p>
            </div>
            <div className={`p-2.5 sm:p-3 rounded-xl ${color.split(' ')[0]} bg-opacity-20`}>
              <Icon className={`h-5 w-5 sm:h-6 sm:w-6 ${color.split(' ')[1]}`} />
            </div>
          </div>
        </CardContent>
      </Card>
    </motion.div>
  )
}

function ShipmentCard({ shipment, onTrack }: {
  shipment: ActiveShipment
  onTrack: (id: string) => void
}) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3 }}
      whileHover={{ y: -2 }}
    >
      <Card className="overflow-hidden border hover:border-amber-200 dark:hover:border-amber-800 transition-colors">
        <CardContent className="p-4 sm:p-5">
          {/* Header: Trip number + Status */}
          <div className="flex items-center justify-between mb-3">
            <Badge variant="outline" className="font-mono text-xs">
              {shipment.tripNumber}
            </Badge>
            <span className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-semibold ${getStatusColor(shipment.status)}`}>
              {shipment.status === 'in_transit' && (
                <span className="relative flex h-2 w-2">
                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75" />
                  <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500" />
                </span>
              )}
              {TRIP_STATUSES[shipment.status as keyof typeof TRIP_STATUSES]?.label ?? shipment.status}
            </span>
          </div>

          {/* Route */}
          <div className="flex items-center gap-2 mb-3">
            <div className="flex items-center gap-2 text-sm min-w-0">
              <MapPin className="h-3.5 w-3.5 text-amber-500 shrink-0" />
              <span className="font-medium truncate">{shipment.loadingLocation}</span>
            </div>
            <ArrowRight className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
            <div className="flex items-center gap-2 text-sm min-w-0">
              <MapPin className="h-3.5 w-3.5 text-emerald-500 shrink-0" />
              <span className="font-medium truncate">{shipment.destination}</span>
            </div>
          </div>

          {/* Cargo Info */}
          <div className="flex items-center gap-4 text-xs text-muted-foreground mb-3">
            <span className="flex items-center gap-1">
              <Package className="h-3 w-3" />
              {shipment.itemName}
            </span>
            <span>{shipment.quantity} {shipment.unit}</span>
          </div>

          {/* Progress */}
          <div className="mb-3">
            <div className="flex items-center justify-between text-xs mb-1.5">
              <span className="text-muted-foreground">Progress</span>
              <span className="font-semibold text-amber-600 dark:text-amber-400">{shipment.progress}%</span>
            </div>
            <Progress value={shipment.progress} className="h-2 [&>div]:bg-amber-500" />
          </div>

          {/* Driver + Truck */}
          <div className="grid grid-cols-2 gap-3 mb-4">
            <div className="flex items-center gap-2 text-xs">
              <div className="p-1.5 rounded-md bg-gray-100 dark:bg-gray-800">
                <Truck className="h-3.5 w-3.5 text-gray-500" />
              </div>
              <div>
                <p className="text-muted-foreground">Truck</p>
                <p className="font-medium text-foreground">{shipment.truck.plateNumber}</p>
              </div>
            </div>
            <div className="flex items-center gap-2 text-xs">
              <div className="p-1.5 rounded-md bg-gray-100 dark:bg-gray-800">
                <Navigation className="h-3.5 w-3.5 text-gray-500" />
              </div>
              <div>
                <p className="text-muted-foreground">Driver</p>
                <p className="font-medium text-foreground">{shipment.driver.firstName} {shipment.driver.lastName}</p>
              </div>
            </div>
          </div>

          {/* ETA + Track Button */}
          <div className="flex items-center justify-between">
            {shipment.estimatedArrival && (
              <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                <Clock className="h-3.5 w-3.5" />
                <span>ETA: {formatDateTime(shipment.estimatedArrival)}</span>
              </div>
            )}
            {shipment.latestLocation && (
              <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                <CircleDot className="h-3.5 w-3.5 text-emerald-500" />
                <span>Updated {timeAgo(shipment.latestLocation.timestamp)}</span>
              </div>
            )}
            <Button
              size="sm"
              className="bg-amber-600 hover:bg-amber-700 text-white h-8 text-xs gap-1"
              onClick={() => onTrack(shipment.id)}
            >
              <MapPin className="h-3 w-3" />
              Track
            </Button>
          </div>
        </CardContent>
      </Card>
    </motion.div>
  )
}

function TrackingDialog({ shipmentId, open, onOpenChange }: {
  shipmentId: string | null
  open: boolean
  onOpenChange: (open: boolean) => void
}) {
  const [detail, setDetail] = useState<ShipmentDetail | null>(null)
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    if (!shipmentId || !open) return
    let cancelled = false
    const loadData = async () => {
      try {
        const res = await fetch(`/api/portal/shipment/${shipmentId}`)
        const data = await res.json()
        if (cancelled) return
        if (data.error) throw new Error(data.error)
        setDetail(data)
        setLoading(false)
      } catch (err) {
        if (!cancelled) {
          console.error('Failed to load shipment detail:', err)
          setLoading(false)
        }
      }
    }
    setLoading(true)
    loadData()
    return () => { cancelled = true }
  }, [shipmentId, open])

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <ResponsiveDialogContent className="max-w-2xl max-h-[90vh]">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Navigation className="h-5 w-5 text-amber-500" />
            Shipment Tracking
          </DialogTitle>
          <DialogDescription>
            {loading ? 'Loading...' : detail ? `Tracking ${detail.shipment.tripNumber}` : ''}
          </DialogDescription>
        </DialogHeader>

        {loading ? (
          <div className="space-y-4 p-4">
            <Skeleton className="h-4 w-48" />
            <Skeleton className="h-48 w-full" />
            <Skeleton className="h-4 w-full" />
            <Skeleton className="h-4 w-3/4" />
          </div>
        ) : detail ? (
          <ScrollArea className="max-h-[70vh] pr-2">
            <div className="space-y-5 p-4">
              {/* Shipment Header */}
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                <div>
                  <div className="flex items-center gap-2">
                    <Badge variant="outline" className="font-mono">{detail.shipment.tripNumber}</Badge>
                    <span className={`px-2 py-0.5 rounded-full text-xs font-semibold ${getStatusColor(detail.shipment.status)}`}>
                      {TRIP_STATUSES[detail.shipment.status as keyof typeof TRIP_STATUSES]?.label ?? detail.shipment.status}
                    </span>
                  </div>
                  <div className="flex items-center gap-2 mt-2 text-sm">
                    <MapPin className="h-3.5 w-3.5 text-amber-500" />
                    <span className="font-medium">{detail.shipment.loadingLocation}</span>
                    <ArrowRight className="h-3.5 w-3.5 text-muted-foreground" />
                    <MapPin className="h-3.5 w-3.5 text-emerald-500" />
                    <span className="font-medium">{detail.shipment.destination}</span>
                  </div>
                </div>
                {detail.shipment.estimatedArrival && (
                  <div className="flex items-center gap-1.5 text-sm text-muted-foreground bg-muted px-3 py-1.5 rounded-lg">
                    <Clock className="h-3.5 w-3.5" />
                    ETA: {formatDateTime(detail.shipment.estimatedArrival)}
                  </div>
                )}
              </div>

              {/* Cargo Info */}
              <div className="flex items-center gap-4 text-sm text-muted-foreground">
                <span className="flex items-center gap-1.5">
                  <Package className="h-4 w-4" />
                  {detail.shipment.itemName} — {detail.shipment.quantity} {detail.shipment.unit}
                </span>
                <span className="font-semibold text-foreground">
                  {formatCurrency(detail.shipment.totalRevenue)}
                </span>
              </div>

              {/* Progress bar */}
              <div>
                <div className="flex items-center justify-between text-xs mb-1.5">
                  <span className="text-muted-foreground">Delivery Progress</span>
                  <span className="font-semibold text-amber-600 dark:text-amber-400">{detail.shipment.progress}%</span>
                </div>
                <Progress value={detail.shipment.progress} className="h-2.5 [&>div]:bg-amber-500" />
              </div>

              {/* Waiting Reason */}
              {detail.shipment.waitingReason && (
                <div className="flex items-center gap-2 p-3 bg-amber-50 dark:bg-amber-900/20 rounded-lg border border-amber-200 dark:border-amber-800">
                  <AlertTriangle className="h-4 w-4 text-amber-500" />
                  <span className="text-sm text-amber-700 dark:text-amber-400">
                    Waiting: {detail.shipment.waitingReason}
                  </span>
                </div>
              )}

              {/* Step-by-step Timeline */}
              <div>
                <h4 className="text-sm font-semibold mb-3 flex items-center gap-2">
                  <CircleDot className="h-4 w-4 text-amber-500" />
                  Trip Timeline
                </h4>
                <div className="relative space-y-0">
                  {detail.steps.map((step, idx) => (
                    <div key={step.label} className="flex items-start gap-3">
                      {/* Vertical line */}
                      <div className="flex flex-col items-center">
                        {step.status === 'completed' ? (
                          <div className="w-6 h-6 rounded-full bg-emerald-500 flex items-center justify-center shrink-0">
                            <CheckCircle2 className="h-4 w-4 text-white" />
                          </div>
                        ) : step.status === 'current' ? (
                          <div className="w-6 h-6 rounded-full bg-amber-500 flex items-center justify-center shrink-0 animate-pulse">
                            <div className="w-2 h-2 rounded-full bg-white" />
                          </div>
                        ) : (
                          <div className="w-6 h-6 rounded-full bg-gray-200 dark:bg-gray-700 flex items-center justify-center shrink-0">
                            <Circle className="h-3 w-3 text-gray-400" />
                          </div>
                        )}
                        {idx < detail.steps.length - 1 && (
                          <div className={`w-0.5 h-8 ${step.status === 'completed' ? 'bg-emerald-300' : 'bg-gray-200 dark:bg-gray-700'}`} />
                        )}
                      </div>
                      {/* Label */}
                      <div className="pt-0.5">
                        <p className={`text-sm ${step.status === 'completed' ? 'text-emerald-700 dark:text-emerald-400 font-medium' : step.status === 'current' ? 'text-amber-700 dark:text-amber-400 font-semibold' : 'text-muted-foreground'}`}>
                          {step.label}
                        </p>
                        {step.status === 'completed' && detail.timeline.find(t => t.status.toLowerCase().replace(/ /g, '_') === step.label.toLowerCase().replace(/ /g, '_') || (
                          step.label === 'In Transit' && t.status === 'in_transit'
                        ))?.timestamp && (
                          <p className="text-xs text-muted-foreground mt-0.5">
                            {formatDateTime(
                              detail.timeline.find(t =>
                                t.status === 'in_transit' && step.label === 'In Transit' ||
                                t.status === step.label.toLowerCase().replace(/ /g, '_')
                              )?.timestamp ?? ''
                            )}
                          </p>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              {/* Delivery Stops */}
              {detail.deliveryStops.length > 0 && (
                <div>
                  <h4 className="text-sm font-semibold mb-3 flex items-center gap-2">
                    <MapPin className="h-4 w-4 text-emerald-500" />
                    Delivery Stops ({detail.deliveryStops.length})
                  </h4>
                  <div className="space-y-2">
                    {detail.deliveryStops.map((stop) => (
                      <div key={stop.id} className="flex items-center gap-3 p-3 bg-muted/50 rounded-lg text-sm">
                        <div className={`w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold ${
                          stop.status === 'completed'
                            ? 'bg-emerald-500 text-white'
                            : stop.status === 'offloading' || stop.status === 'arrived'
                              ? 'bg-amber-500 text-white'
                              : 'bg-gray-200 dark:bg-gray-700 text-gray-500'
                        }`}>
                          {stop.stopOrder}
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="font-medium">{stop.destination}</p>
                          <p className="text-xs text-muted-foreground">
                            {stop.expectedQty} {stop.unit} expected
                            {stop.actualQty !== null && ` · ${stop.actualQty} delivered`}
                          </p>
                        </div>
                        <Badge className={`${getStatusColor(
                          stop.status === 'completed' ? 'completed' :
                          stop.status === 'pending' ? 'scheduled' : stop.status
                        )} text-[10px]`}>
                          {stop.status}
                        </Badge>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              <Separator />

              {/* Driver & Truck */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="flex items-center gap-3 p-3 rounded-lg bg-muted/50">
                  <div className="p-2 rounded-full bg-amber-100 dark:bg-amber-900/30">
                    <Navigation className="h-5 w-5 text-amber-600 dark:text-amber-400" />
                  </div>
                  <div>
                    <p className="font-medium text-sm">{detail.driver.firstName} {detail.driver.lastName}</p>
                    <a
                      href={`tel:${detail.driver.phone}`}
                      className="flex items-center gap-1 text-xs text-amber-600 dark:text-amber-400 hover:underline"
                    >
                      <Phone className="h-3 w-3" />
                      {detail.driver.phone}
                    </a>
                  </div>
                </div>
                <div className="flex items-center gap-3 p-3 rounded-lg bg-muted/50">
                  <div className="p-2 rounded-full bg-sky-100 dark:bg-sky-900/30">
                    <Truck className="h-5 w-5 text-sky-600 dark:text-sky-400" />
                  </div>
                  <div>
                    <p className="font-medium text-sm">{detail.truck.plateNumber}</p>
                    <p className="text-xs text-muted-foreground">{detail.truck.make} {detail.truck.model}</p>
                  </div>
                </div>
              </div>

              {/* Latest Location */}
              {detail.latestLocation && (
                <div className="flex items-center gap-2 text-xs text-muted-foreground">
                  <CircleDot className="h-3.5 w-3.5 text-emerald-500" />
                  Last update: {timeAgo(detail.latestLocation.timestamp)}
                  {detail.latestLocation.speed !== null && detail.latestLocation.speed > 0 && (
                    <span> · Moving at {Math.round(detail.latestLocation.speed)} km/h</span>
                  )}
                </div>
              )}
            </div>
          </ScrollArea>
        ) : (
          <div className="p-8 text-center text-muted-foreground">
            Failed to load shipment details
          </div>
        )}
      </ResponsiveDialogContent>
    </Dialog>
  )
}

function InvoicesSection({ invoices }: { invoices: Invoice[] }) {
  return (
    <div className="grid gap-3">
      {invoices.length === 0 ? (
        <div className="text-center py-8 text-muted-foreground">
          <FileText className="h-8 w-8 mx-auto mb-2 opacity-50" />
          <p className="text-sm">No invoices found</p>
        </div>
      ) : (
        invoices.map(inv => {
          const outstanding = inv.totalAmount - inv.paidAmount
          return (
            <motion.div
              key={inv.id}
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
            >
              <Card className="hover:border-amber-200 dark:hover:border-amber-800 transition-colors">
                <CardContent className="p-4 flex flex-col sm:flex-row sm:items-center gap-3 sm:gap-0 justify-between">
                  <div className="space-y-1">
                    <div className="flex items-center gap-2">
                      <span className="font-mono text-sm font-semibold">{inv.invoiceNumber}</span>
                      <Badge className={`${getInvoiceStatusBadge(inv.status)} text-[10px]`}>
                        {inv.status}
                      </Badge>
                    </div>
                    <div className="flex items-center gap-3 text-xs text-muted-foreground">
                      <span>Issued: {formatDate(inv.issueDate)}</span>
                      <span>Due: {formatDate(inv.dueDate)}</span>
                      {inv.tripNumber && <span>Trip: {inv.tripNumber}</span>}
                    </div>
                  </div>
                  <div className="flex items-center gap-4">
                    <div className="text-right">
                      <p className="text-sm font-bold">{formatCurrency(inv.totalAmount)}</p>
                      {outstanding > 0 && (
                        <p className="text-xs text-amber-600 dark:text-amber-400">
                          Outstanding: {formatCurrency(outstanding)}
                        </p>
                      )}
                      {inv.paidAmount > 0 && (
                        <p className="text-xs text-emerald-600 dark:text-emerald-400">
                          Paid: {formatCurrency(inv.paidAmount)}
                        </p>
                      )}
                    </div>
                    <Button size="sm" variant="outline" className="h-8 text-xs gap-1">
                      <Download className="h-3 w-3" />
                      PDF
                    </Button>
                  </div>
                </CardContent>
              </Card>
            </motion.div>
          )
        })
      )}
    </div>
  )
}

function DeliveriesTable({ deliveries }: { deliveries: RecentDelivery[] }) {
  const [page, setPage] = useState(0)
  const perPage = 5
  const paginated = deliveries.slice(page * perPage, (page + 1) * perPage)
  const totalPages = Math.ceil(deliveries.length / perPage)

  return (
    <div>
      <>
        {/* Desktop Table */}
        <div className="overflow-x-auto hidden md:block">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b text-left">
                <th className="pb-2 font-medium text-muted-foreground text-xs">Trip #</th>
                <th className="pb-2 font-medium text-muted-foreground text-xs">Route</th>
                <th className="pb-2 font-medium text-muted-foreground text-xs hidden sm:table-cell">Cargo</th>
                <th className="pb-2 font-medium text-muted-foreground text-xs text-right">Revenue</th>
                <th className="pb-2 font-medium text-muted-foreground text-xs hidden md:table-cell">Delivered</th>
                <th className="pb-2 font-medium text-muted-foreground text-xs">Status</th>
              </tr>
            </thead>
            <tbody>
              {paginated.map(del => (
                <tr key={del.id} className="border-b last:border-0 hover:bg-muted/30 transition-colors">
                  <td className="py-2.5 font-mono text-xs">{del.tripNumber}</td>
                  <td className="py-2.5">
                    <div className="flex items-center gap-1 text-xs">
                      <span>{del.loadingLocation}</span>
                      <ChevronRight className="h-3 w-3 text-muted-foreground" />
                      <span>{del.destination}</span>
                    </div>
                  </td>
                  <td className="py-2.5 text-xs hidden sm:table-cell">
                    {del.itemName} ({del.quantity} {del.unit})
                  </td>
                  <td className="py-2.5 text-right font-semibold text-xs">{formatCurrency(del.totalRevenue)}</td>
                  <td className="py-2.5 text-xs text-muted-foreground hidden md:table-cell">
                    {del.arrivalTime ? formatDate(del.arrivalTime) : '—'}
                  </td>
                  <td className="py-2.5">
                    <Badge className={`${getStatusColor(del.status)} text-[10px]`}>
                      Completed
                    </Badge>
                  </td>
                </tr>
              ))}
              {paginated.length === 0 && (
                <tr>
                  <td colSpan={6} className="py-8 text-center text-muted-foreground text-sm">
                    No completed deliveries yet
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        {/* Mobile Cards */}
        <div className="md:hidden divide-y">
          {paginated.map(del => (
            <div key={del.id} className="mobile-card p-4 space-y-2">
              <div className="flex items-center justify-between gap-2">
                <span className="font-mono text-xs font-medium">{del.tripNumber}</span>
                <Badge className={`${getStatusColor(del.status)} text-[10px]`}>
                  Completed
                </Badge>
              </div>
              <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                <span>{del.loadingLocation}</span>
                <ChevronRight className="h-3 w-3 shrink-0" />
                <span>{del.destination}</span>
              </div>
              <div className="grid grid-cols-3 gap-2 text-sm">
                <div>
                  <p className="text-xs text-muted-foreground">Cargo</p>
                  <p className="text-xs font-medium truncate">{del.itemName}</p>
                  <p className="text-xs text-muted-foreground">{del.quantity} {del.unit}</p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">Revenue</p>
                  <p className="text-xs font-semibold">{formatCurrency(del.totalRevenue)}</p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">Delivered</p>
                  <p className="text-xs">{del.arrivalTime ? formatDate(del.arrivalTime) : '—'}</p>
                </div>
              </div>
            </div>
          ))}
          {paginated.length === 0 && (
            <div className="py-8 text-center text-muted-foreground text-sm">
              No completed deliveries yet
            </div>
          )}
        </div>
      </>
      {totalPages > 1 && (
        <div className="flex items-center justify-center gap-2 mt-4">
          <Button
            variant="outline" size="sm" className="h-7 text-xs"
            disabled={page === 0}
            onClick={() => setPage(p => p - 1)}
          >
            Previous
          </Button>
          <span className="text-xs text-muted-foreground">
            Page {page + 1} of {totalPages}
          </span>
          <Button
            variant="outline" size="sm" className="h-7 text-xs"
            disabled={page >= totalPages - 1}
            onClick={() => setPage(p => p + 1)}
          >
            Next
          </Button>
        </div>
      )}
    </div>
  )
}

// ============ Loading Skeleton ============

function PortalSkeleton() {
  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <Skeleton className="h-10 w-10 rounded-xl" />
        <div>
          <Skeleton className="h-6 w-48" />
          <Skeleton className="h-4 w-32 mt-1" />
        </div>
      </div>
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {[...Array(4)].map((_, i) => (
          <Skeleton key={i} className="h-24 rounded-xl" />
        ))}
      </div>
      <Skeleton className="h-64 rounded-xl" />
    </div>
  )
}

// ============ Main Component ============

export function ClientPortalView() {
  // Client selector state
  const [clients, setClients] = useState<Client[]>([])
  const [selectedClientId, setSelectedClientId] = useState<string>('')
  const [searchQuery, setSearchQuery] = useState('')

  // Portal data state
  const [portalData, setPortalData] = useState<ClientPortalData | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // Tracking dialog state
  const [trackingTripId, setTrackingTripId] = useState<string | null>(null)
  const [trackingOpen, setTrackingOpen] = useState(false)

  // Active tab
  const [activeTab, setActiveTab] = useState('shipments')

  // Load clients list on mount
  useEffect(() => {
    fetchClients({ limit: 100 })
      .then(res => setClients(res.data ?? []))
      .catch(err => console.error('Failed to load clients:', err))
  }, [])

  // Filtered clients for search
  const filteredClients = clients.filter(c =>
    c.companyName.toLowerCase().includes(searchQuery.toLowerCase()) ||
    c.contactPerson.toLowerCase().includes(searchQuery.toLowerCase())
  )

  // Load portal data
  const loadPortal = useCallback(async (clientId: string) => {
    setLoading(true)
    setError(null)
    setPortalData(null)
    try {
      const res = await fetch(`/api/portal/client/${clientId}`)
      const data = await res.json()
      if (data.error) throw new Error(data.error)
      setPortalData(data)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load portal data')
    } finally {
      setLoading(false)
    }
  }, [])

  // Handle track button
  const handleTrack = (tripId: string) => {
    setTrackingTripId(tripId)
    setTrackingOpen(true)
  }

  // Copy shareable link
  const copyShareableLink = () => {
    const link = `${window.location.origin}?clientId=${selectedClientId}`
    navigator.clipboard.writeText(link).then(() => {
      toast.success('Shareable link copied to clipboard')
    }).catch(() => {
      toast.error('Failed to copy link')
    })
  }

  // Show client selector if no client selected
  const showSelector = !portalData && !loading

  return (
    <div className="space-y-6">
      {/* Client Selector Panel */}
      <Card className="border-0 shadow-sm">
        <CardContent className="p-4 sm:p-6">
          <div className="flex flex-col sm:flex-row gap-4">
            <div className="flex-1">
              <h3 className="text-sm font-semibold mb-2 flex items-center gap-2">
                <Globe className="h-4 w-4 text-amber-500" />
                Client Portal Preview
              </h3>
              <p className="text-xs text-muted-foreground mb-3">
                Select a client to preview their portal or generate a shareable tracking link.
              </p>

              {/* Search + Select */}
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder="Search clients by name or contact..."
                  value={searchQuery}
                  onChange={e => setSearchQuery(e.target.value)}
                  className="pl-9"
                />
              </div>

              {searchQuery && (
                <div className="mt-2 max-h-48 overflow-y-auto rounded-lg border bg-popover shadow-md">
                  {filteredClients.length === 0 ? (
                    <div className="p-3 text-sm text-muted-foreground text-center">
                      No clients found
                    </div>
                  ) : (
                    filteredClients.map(client => (
                      <button
                        key={client.id}
                        className={`w-full flex items-center gap-3 px-3 py-2.5 text-left text-sm hover:bg-muted/50 transition-colors ${
                          selectedClientId === client.id ? 'bg-amber-50 dark:bg-amber-900/20' : ''
                        }`}
                        onClick={() => {
                          setSelectedClientId(client.id)
                          setSearchQuery('')
                        }}
                      >
                        <div className="p-1.5 rounded-md bg-amber-100 dark:bg-amber-900/30">
                          <Building2 className="h-4 w-4 text-amber-600 dark:text-amber-400" />
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="font-medium truncate">{client.companyName}</p>
                          <p className="text-xs text-muted-foreground">{client.contactPerson}</p>
                        </div>
                        {client.isActive ? (
                          <Badge className="bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400 text-[10px]">
                            Active
                          </Badge>
                        ) : (
                          <Badge className="bg-gray-100 text-gray-500 dark:bg-gray-800 dark:text-gray-400 text-[10px]">
                            Inactive
                          </Badge>
                        )}
                      </button>
                    ))
                  )}
                </div>
              )}

              {/* Selected client display */}
              {selectedClientId && !searchQuery && (
                <div className="mt-2 flex items-center gap-2 p-2.5 bg-amber-50 dark:bg-amber-900/20 rounded-lg">
                  <CheckCircle2 className="h-4 w-4 text-amber-500" />
                  <span className="text-sm font-medium">
                    {clients.find(c => c.id === selectedClientId)?.companyName ?? 'Client selected'}
                  </span>
                </div>
              )}
            </div>

            {/* Action buttons */}
            <div className="flex sm:flex-col gap-2 shrink-0">
              <Button
                className="bg-amber-600 hover:bg-amber-700 text-white gap-2"
                disabled={!selectedClientId || loading}
                onClick={() => loadPortal(selectedClientId)}
              >
                {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <ExternalLink className="h-4 w-4" />}
                View Portal
              </Button>
              <Button
                variant="outline"
                className="gap-2"
                disabled={!selectedClientId}
                onClick={copyShareableLink}
              >
                <Copy className="h-4 w-4" />
                Copy Link
              </Button>
              {portalData && (
                <Button
                  variant="ghost"
                  className="gap-2"
                  onClick={() => {
                    setPortalData(null)
                    setError(null)
                  }}
                >
                  <RefreshCw className="h-4 w-4" />
                  Change Client
                </Button>
              )}
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Error State */}
      {error && (
        <Card className="border-red-200 dark:border-red-800">
          <CardContent className="p-6 text-center">
            <AlertTriangle className="h-8 w-8 text-red-400 mx-auto mb-2" />
            <p className="text-sm text-red-600 dark:text-red-400">{error}</p>
            <Button variant="outline" size="sm" className="mt-3" onClick={() => selectedClientId && loadPortal(selectedClientId)}>
              Try Again
            </Button>
          </CardContent>
        </Card>
      )}

      {/* Loading State */}
      {loading && <PortalSkeleton />}

      {/* Portal Content */}
      {portalData && !loading && (
        <AnimatePresence mode="wait">
          <motion.div
            key={portalData.client.id}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.3 }}
            className="space-y-6"
          >
            {/* Header */}
            <div className="bg-gradient-to-r from-amber-500 to-amber-600 dark:from-amber-600 dark:to-amber-700 rounded-2xl p-5 sm:p-6 text-white">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                <div>
                  <div className="flex items-center gap-3 mb-2">
                    <div className="p-2.5 rounded-xl bg-white/20 backdrop-blur-sm">
                      <Building2 className="h-6 w-6" />
                    </div>
                    <div>
                      <h1 className="text-xl sm:text-2xl font-bold">{portalData.client.companyName}</h1>
                      <p className="text-amber-100 text-sm">Contact: {portalData.client.contactPerson}</p>
                    </div>
                  </div>
                  <div className="flex flex-wrap items-center gap-4 text-sm text-amber-100">
                    {portalData.client.email && (
                      <span className="flex items-center gap-1">
                        <Mail className="h-3.5 w-3.5" />
                        {portalData.client.email}
                      </span>
                    )}
                    <span className="flex items-center gap-1">
                      <Phone className="h-3.5 w-3.5" />
                      {portalData.client.phone}
                    </span>
                  </div>
                </div>
                <div className="text-right">
                  <p className="text-xs text-amber-200 uppercase tracking-wider font-medium">Powered by</p>
                  <p className="text-lg font-bold">{APP_NAME}</p>
                  <p className="text-xs text-amber-200">Fleet Management System</p>
                </div>
              </div>
            </div>

            {/* Stats Cards */}
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
              <StatCard
                icon={Package}
                label="Total Shipments"
                value={portalData.stats.totalTrips}
                color="text-amber-600 dark:text-amber-400"
              />
              <StatCard
                icon={Truck}
                label="In Transit"
                value={portalData.stats.activeTrips}
                color="text-emerald-600 dark:text-emerald-400"
              />
              <StatCard
                icon={CheckCircle2}
                label="Completed"
                value={portalData.stats.completedTrips}
                color="text-sky-600 dark:text-sky-400"
              />
              <StatCard
                icon={TrendingUp}
                label="Total Value"
                value={formatCurrency(portalData.stats.totalRevenue)}
                color="text-violet-600 dark:text-violet-400"
              />
            </div>

            {/* Tabs */}
            <Tabs value={activeTab} onValueChange={setActiveTab}>
              <TabsList className="flex-wrap h-auto">
                <TabsTrigger value="shipments" className="gap-1.5">
                  <Truck className="h-3.5 w-3.5" />
                  Active Shipments
                  {portalData.activeShipments.length > 0 && (
                    <Badge className="bg-amber-500 text-white text-[10px] ml-1 h-4 min-w-4 px-1 flex items-center justify-center">
                      {portalData.activeShipments.length}
                    </Badge>
                  )}
                </TabsTrigger>
                <TabsTrigger value="deliveries" className="gap-1.5">
                  <CheckCircle2 className="h-3.5 w-3.5" />
                  Recent Deliveries
                </TabsTrigger>
                <TabsTrigger value="invoices" className="gap-1.5">
                  <CreditCard className="h-3.5 w-3.5" />
                  Invoices
                </TabsTrigger>
              </TabsList>

              {/* Active Shipments Tab */}
              <TabsContent value="shipments">
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                  {portalData.activeShipments.length === 0 ? (
                    <div className="col-span-full text-center py-12 text-muted-foreground">
                      <Truck className="h-10 w-10 mx-auto mb-3 opacity-30" />
                      <p className="font-medium">No active shipments</p>
                      <p className="text-sm">All shipments have been completed</p>
                    </div>
                  ) : (
                    portalData.activeShipments.map(shipment => (
                      <ShipmentCard
                        key={shipment.id}
                        shipment={shipment}
                        onTrack={handleTrack}
                      />
                    ))
                  )}
                </div>
              </TabsContent>

              {/* Recent Deliveries Tab */}
              <TabsContent value="deliveries">
                <Card className="border-0 shadow-sm">
                  <CardContent className="p-4 sm:p-6">
                    <DeliveriesTable deliveries={portalData.recentDeliveries} />
                  </CardContent>
                </Card>
              </TabsContent>

              {/* Invoices Tab */}
              <TabsContent value="invoices">
                <InvoicesSection invoices={portalData.invoices} />
              </TabsContent>
            </Tabs>

            {/* Help / Contact Footer */}
            <Card className="border-0 shadow-sm bg-gradient-to-br from-gray-50 to-gray-100/50 dark:from-gray-900 dark:to-gray-900/50">
              <CardContent className="p-4 sm:p-6">
                <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
                  <div className="flex items-start gap-3">
                    <div className="p-2.5 rounded-xl bg-amber-100 dark:bg-amber-900/30 shrink-0">
                      <HelpCircle className="h-5 w-5 text-amber-600 dark:text-amber-400" />
                    </div>
                    <div>
                      <h3 className="font-semibold text-sm">Need Help?</h3>
                      <p className="text-xs text-muted-foreground mt-0.5">
                        Contact our logistics team for any inquiries about your shipments or invoices.
                      </p>
                    </div>
                  </div>
                  <div className="flex flex-wrap items-center gap-3 text-sm">
                    <a
                      href="tel:+233302778899"
                      className="flex items-center gap-1.5 text-amber-600 dark:text-amber-400 hover:underline font-medium"
                    >
                      <Phone className="h-4 w-4" />
                      +233 30 277 8899
                    </a>
                    <a
                      href="mailto:info@fleetpro.com.gh"
                      className="flex items-center gap-1.5 text-muted-foreground hover:underline"
                    >
                      <Mail className="h-4 w-4" />
                      info@fleetpro.com.gh
                    </a>
                    <span className="text-xs text-muted-foreground">
                      37 Ring Road Central, Accra, Ghana
                    </span>
                  </div>
                </div>
              </CardContent>
            </Card>
          </motion.div>
        </AnimatePresence>
      )}

      {/* Tracking Detail Dialog */}
      <TrackingDialog
        shipmentId={trackingTripId}
        open={trackingOpen}
        onOpenChange={setTrackingOpen}
      />
    </div>
  )
}
