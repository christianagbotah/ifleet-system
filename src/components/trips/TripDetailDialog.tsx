'use client'

import { useMemo } from 'react'
import {
  ChevronRight,
  Clock,
  MapPin,
  Truck,
  User,
  Package,
} from 'lucide-react'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog'
import { Badge } from '@/components/ui/badge'
import { Separator } from '@/components/ui/separator'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { ScrollArea } from '@/components/ui/scroll-area'
import type { Trip } from '@/types'

interface TripDetailDialogProps {
  trip: Trip | null
  open: boolean
  onOpenChange: (open: boolean) => void
}

function statusColor(status: string) {
  switch (status) {
    case 'DRAFT':
      return 'bg-secondary text-secondary-foreground'
    case 'IN_TRANSIT':
      return 'bg-amber-100 text-amber-800 border-amber-200'
    case 'COMPLETED':
      return 'bg-emerald-100 text-emerald-800 border-emerald-200'
    case 'CANCELLED':
      return 'bg-red-100 text-red-800 border-red-200'
    default:
      return ''
  }
}

const CEDI = String.fromCodePoint(0x20B5)

function formatCurrency(amount: number) {
  return `${CEDI}${amount.toLocaleString('en-GH', { minimumFractionDigits: 0, maximumFractionDigits: 2 })}`
}

function formatDateTime(dateStr?: string) {
  if (!dateStr) return '—'
  return new Date(dateStr).toLocaleString('en-US', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  })
}

function formatDate(dateStr: string) {
  return new Date(dateStr).toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  })
}

export function TripDetailDialog({
  trip,
  open,
  onOpenChange,
}: TripDetailDialogProps) {
  const destinationSubtotals = useMemo(() => {
    if (!trip?.deliveryDestinations || !trip?.items) return {}
    const map: Record<string, number> = {}
    trip.deliveryDestinations.forEach((dest) => {
      const total = trip.items
        ?.filter((item) => item.deliveryDestinationId === dest.id)
        .reduce((sum, item) => sum + item.amount, 0)
      map[dest.id] = total || 0
    })
    return map
  }, [trip])

  const destinationItemCounts = useMemo(() => {
    if (!trip?.deliveryDestinations || !trip?.items) return {}
    const map: Record<string, number> = {}
    trip.deliveryDestinations.forEach((dest) => {
      const count = trip.items?.filter(
        (item) => item.deliveryDestinationId === dest.id
      ).length
      map[dest.id] = count || 0
    })
    return map
  }, [trip])

  if (!trip) return null

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-2xl max-h-[90vh] p-0">
        <ScrollArea className="max-h-[90vh]">
          <div className="p-6 space-y-5">
            <DialogHeader>
              <div className="flex items-center gap-3">
                <div>
                  <DialogTitle className="text-lg">
                    {trip.tripNumber}
                  </DialogTitle>
                  <DialogDescription>
                    Trip details and delivery breakdown
                  </DialogDescription>
                </div>
                <Badge className={statusColor(trip.status)}>
                  {trip.status.replace('_', ' ')}
                </Badge>
              </div>
            </DialogHeader>

            <Separator />

            {/* Route info */}
            <div className="space-y-3">
              <h4 className="text-sm font-medium text-muted-foreground uppercase tracking-wide">
                Route Information
              </h4>
              <div className="flex items-center gap-2 text-sm">
                <MapPin className="h-4 w-4 text-emerald-600 shrink-0" />
                <div className="flex items-center gap-1.5 flex-wrap">
                  <span className="font-medium">
                    {trip.loadingCity?.name || 'Unknown'}
                  </span>
                  <ChevronRight className="h-3 w-3 text-muted-foreground" />
                  <span className="font-medium">
                    {trip.destinationCity?.name || 'Unknown'}
                  </span>
                </div>
              </div>

              {trip.loadingPoint && (
                <div className="flex items-center gap-2 text-sm text-muted-foreground ml-6">
                  <span>
                    Loading Point: {trip.loadingPoint.name}
                    {trip.loadingPoint.supplier &&
                      ` (${trip.loadingPoint.supplier.name})`}
                  </span>
                </div>
              )}

              {trip.departureTime && (
                <div className="flex items-center gap-2 text-sm text-muted-foreground ml-6">
                  <Clock className="h-3.5 w-3.5" />
                  <span>Departure: {formatDateTime(trip.departureTime)}</span>
                </div>
              )}
            </div>

            <Separator />

            {/* Truck & Driver */}
            <div className="space-y-3">
              <h4 className="text-sm font-medium text-muted-foreground uppercase tracking-wide">
                Assignment
              </h4>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div className="flex items-center gap-2 text-sm">
                  <Truck className="h-4 w-4 text-muted-foreground shrink-0" />
                  <div>
                    <div className="font-medium">
                      {trip.truck?.plateNumber || 'No truck'}
                    </div>
                    {trip.truck?.model && (
                      <div className="text-xs text-muted-foreground">
                        {trip.truck.model}
                      </div>
                    )}
                  </div>
                </div>
                <div className="flex items-center gap-2 text-sm">
                  <User className="h-4 w-4 text-muted-foreground shrink-0" />
                  <div>
                    <div className="font-medium">
                      {trip.driver?.name || 'No driver'}
                    </div>
                    {trip.driver?.phone && (
                      <div className="text-xs text-muted-foreground">
                        {trip.driver.phone}
                      </div>
                    )}
                  </div>
                </div>
              </div>
            </div>

            <Separator />

            {/* Delivery Destinations */}
            {trip.deliveryDestinations && trip.deliveryDestinations.length > 0 && (
              <div className="space-y-3">
                <h4 className="text-sm font-medium text-muted-foreground uppercase tracking-wide">
                  Delivery Destinations ({trip.deliveryDestinations.length})
                </h4>
                <div className="rounded-lg border overflow-hidden">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Zone</TableHead>
                        <TableHead>Customer</TableHead>
                        <TableHead className="hidden sm:table-cell">
                          Phone
                        </TableHead>
                        <TableHead className="text-right">Rate</TableHead>
                        <TableHead className="text-center">Items</TableHead>
                        <TableHead className="text-right">Subtotal</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {trip.deliveryDestinations.map((dest) => (
                        <TableRow key={dest.id}>
                          <TableCell className="font-medium">
                            {dest.zone?.name || '—'}
                          </TableCell>
                          <TableCell>{dest.customer?.name || '—'}</TableCell>
                          <TableCell className="hidden sm:table-cell text-muted-foreground">
                            {dest.phone}
                          </TableCell>
                          <TableCell className="text-right">
                            {formatCurrency(dest.rate)}
                          </TableCell>
                          <TableCell className="text-center">
                            {destinationItemCounts[dest.id] || 0}
                          </TableCell>
                          <TableCell className="text-right font-medium">
                            {formatCurrency(destinationSubtotals[dest.id] || 0)}
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              </div>
            )}

            {/* Items */}
            {trip.items && trip.items.length > 0 && (
              <div className="space-y-3">
                <h4 className="text-sm font-medium text-muted-foreground uppercase tracking-wide">
                  <Package className="h-3.5 w-3.5 inline mr-1" />
                  Items ({trip.items.length})
                </h4>
                <div className="rounded-lg border overflow-hidden">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Item</TableHead>
                        <TableHead className="text-right">Qty</TableHead>
                        <TableHead className="hidden sm:table-cell">Unit</TableHead>
                        <TableHead className="text-right">Rate</TableHead>
                        <TableHead className="text-right">Amount</TableHead>
                        <TableHead className="hidden lg:table-cell">
                          Customer
                        </TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {trip.items.map((item) => (
                        <TableRow key={item.id}>
                          <TableCell className="font-medium">
                            {item.item?.name || '—'}
                          </TableCell>
                          <TableCell className="text-right">
                            {item.quantity.toLocaleString()}
                          </TableCell>
                          <TableCell className="hidden sm:table-cell text-muted-foreground">
                            {item.unit}
                          </TableCell>
                          <TableCell className="text-right">
                            {formatCurrency(item.rate)}
                          </TableCell>
                          <TableCell className="text-right font-medium">
                            {formatCurrency(item.amount)}
                          </TableCell>
                          <TableCell className="hidden lg:table-cell text-muted-foreground">
                            {item.deliveryDestination?.customer?.name || '—'}
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              </div>
            )}

            <Separator />

            {/* Totals */}
            <div className="space-y-3">
              <h4 className="text-sm font-medium text-muted-foreground uppercase tracking-wide">
                Summary
              </h4>
              <div className="grid grid-cols-2 gap-4 rounded-lg border p-4">
                <div className="space-y-1">
                  <p className="text-xs text-muted-foreground">Total Bags</p>
                  <p className="text-xl font-bold">
                    {trip.totalBags.toLocaleString()}
                  </p>
                </div>
                <div className="space-y-1">
                  <p className="text-xs text-muted-foreground">Total Amount</p>
                  <p className="text-xl font-bold text-emerald-600">
                    {formatCurrency(trip.totalAmount)}
                  </p>
                </div>
              </div>
            </div>

            {/* Notes */}
            {trip.notes && (
              <>
                <Separator />
                <div className="space-y-2">
                  <h4 className="text-sm font-medium text-muted-foreground uppercase tracking-wide">
                    Notes
                  </h4>
                  <p className="text-sm bg-muted/50 rounded-md p-3">
                    {trip.notes}
                  </p>
                </div>
              </>
            )}

            <Separator />

            {/* Timestamps */}
            <div className="flex flex-col sm:flex-row gap-2 sm:gap-6 text-xs text-muted-foreground">
              <span>Created: {formatDate(trip.createdAt)}</span>
              <span>Updated: {formatDate(trip.updatedAt)}</span>
            </div>
          </div>
        </ScrollArea>
      </DialogContent>
    </Dialog>
  )
}
