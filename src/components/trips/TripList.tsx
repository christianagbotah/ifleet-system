'use client'

import { useEffect, useState } from 'react'
import { ArrowUpDown, ChevronRight, Inbox, User } from 'lucide-react'
import { apiFetch } from '@/lib/apiFetch'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import type { Trip } from '@/types'

interface TripListProps {
  onNewTrip?: () => void
  onEditTrip?: (trip: Trip) => void
  onSelectTrip?: (trip: Trip) => void
}

type SortDir = 'desc' | 'asc'

function statusVariant(status: string) {
  switch (status) {
    case 'DRAFT':
      return 'secondary'
    case 'IN_TRANSIT':
      return 'outline'
    case 'COMPLETED':
      return 'default'
    case 'CANCELLED':
      return 'destructive'
    default:
      return 'secondary'
  }
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

function formatDate(dateStr: string) {
  return new Date(dateStr).toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  })
}

const CEDI = String.fromCodePoint(0x20B5)

function formatCurrency(amount: number) {
  return `${CEDI}${amount.toLocaleString('en-GH', { minimumFractionDigits: 0, maximumFractionDigits: 2 })}`
}

function getUniqueItems(trip: Trip): string {
  if (!trip.items || trip.items.length === 0) return 'No items'
  const itemNames = new Set<string>()
  trip.items.forEach((item) => {
    if (item.item) itemNames.add(item.item.name)
  })
  const names = Array.from(itemNames)
  if (names.length <= 2) return names.join(', ')
  return `${names.slice(0, 2).join(', ')} +${names.length - 2} more`
}

// Skeleton loader for table rows
function TripTableSkeleton() {
  return (
    <>
      {Array.from({ length: 5 }).map((_, i) => (
        <TableRow key={i}>
          <TableCell><Skeleton className="h-5 w-24" /></TableCell>
          <TableCell><Skeleton className="h-5 w-32" /></TableCell>
          <TableCell><Skeleton className="h-5 w-28" /></TableCell>
          <TableCell><Skeleton className="h-5 w-24" /></TableCell>
          <TableCell><Skeleton className="h-5 w-28" /></TableCell>
          <TableCell><Skeleton className="h-5 w-8" /></TableCell>
          <TableCell className="text-right"><Skeleton className="h-5 w-20 ml-auto" /></TableCell>
          <TableCell className="text-right"><Skeleton className="h-5 w-16 ml-auto" /></TableCell>
          <TableCell><Skeleton className="h-5 w-20" /></TableCell>
          <TableCell><Skeleton className="h-5 w-24" /></TableCell>
        </TableRow>
      ))}
    </>
  )
}

// Skeleton loader for mobile cards
function TripCardSkeleton() {
  return (
    <>
      {Array.from({ length: 3 }).map((_, i) => (
        <Card key={i}>
          <CardContent className="p-4 space-y-3">
            <Skeleton className="h-5 w-32" />
            <Skeleton className="h-4 w-full" />
            <div className="flex gap-2">
              <Skeleton className="h-5 w-16" />
              <Skeleton className="h-5 w-20" />
            </div>
            <Skeleton className="h-4 w-24" />
          </CardContent>
        </Card>
      ))}
    </>
  )
}

// Empty state
function EmptyState({ onNewTrip }: { onNewTrip?: () => void }) {
  return (
    <div className="flex flex-col items-center justify-center py-16 px-4 text-center">
      <div className="flex h-16 w-16 items-center justify-center rounded-full bg-muted mb-4">
        <Inbox className="h-8 w-8 text-muted-foreground" />
      </div>
      <h3 className="text-lg font-medium mb-1">No Trips Yet</h3>
      <p className="text-sm text-muted-foreground mb-4 max-w-sm">
        Get started by creating your first trip. Add loading details, delivery destinations, and items.
      </p>
      {onNewTrip && (
        <Button
          onClick={onNewTrip}
          className="bg-emerald-600 hover:bg-emerald-700 text-white"
        >
          <Inbox className="h-4 w-4" />
          Create First Trip
        </Button>
      )}
    </div>
  )
}

// Mobile card view for a single trip
function TripMobileCard({
  trip,
  onClick,
}: {
  trip: Trip
  onClick: () => void
}) {
  return (
    <Card
      className="cursor-pointer hover:border-emerald-200 hover:shadow-sm transition-all"
      onClick={onClick}
    >
      <CardContent className="p-4">
        <div className="flex items-start justify-between mb-2">
          <div className="flex items-center gap-2">
            <Badge variant="secondary" className="font-mono text-xs">
              {trip.tripNumber}
            </Badge>
          </div>
          <Badge className={statusColor(trip.status)}>
            {trip.status.replace('_', ' ')}
          </Badge>
        </div>

        <div className="flex items-center gap-1.5 text-sm font-medium mb-1">
          <span>{trip.loadingCity?.name || 'Unknown'}</span>
          <ChevronRight className="h-3 w-3 text-muted-foreground" />
          <span>{trip.destinationCity?.name || 'Unknown'}</span>
        </div>

        <div className="text-sm text-muted-foreground mb-1">
          {trip.truck?.plateNumber || 'No truck'}
          {trip.driver ? ` · ${trip.driver.name}` : ''}
        </div>

        {(trip as Record<string, unknown>).customerName && (
          <div className="text-xs text-muted-foreground mb-2 flex items-center gap-1">
            <User className="h-3 w-3" />
            <span>{String((trip as Record<string, unknown>).customerName)}</span>
            {(trip as Record<string, unknown>).client && (() => {
              const client = (trip as Record<string, unknown>).client as Record<string, unknown>
              return client.companyName ? ` (${client.companyName as string})` : ''
            })()}
          </div>
        )}

        <div className="flex items-center justify-between text-sm">
          <span className="text-muted-foreground">
            {trip.items?.length || 0} items
          </span>
          <span className="font-medium text-foreground">
            {formatCurrency(trip.totalAmount)}
          </span>
        </div>

        <div className="text-xs text-muted-foreground mt-2 border-t pt-2">
          {formatDate(trip.createdAt)}
        </div>
      </CardContent>
    </Card>
  )
}

export function TripList({ onNewTrip, onSelectTrip }: TripListProps) {
  const [trips, setTrips] = useState<Trip[]>([])
  const [loading, setLoading] = useState(true)
  const [sortDir, setSortDir] = useState<SortDir>('desc')

  useEffect(() => {
    fetchTrips()
  }, [])

  const fetchTrips = async () => {
    try {
      setLoading(true)
      const res = await apiFetch<{ data: Trip[] }>('/api/trips')
      const sorted = [...(res.data || [])].sort((a, b) => {
        const dateA = new Date(a.createdAt).getTime()
        const dateB = new Date(b.createdAt).getTime()
        return sortDir === 'desc' ? dateB - dateA : dateA - dateB
      })
      setTrips(sorted)
    } catch {
      // Error already shown by apiFetch toast
    } finally {
      setLoading(false)
    }
  }

  const handleSort = () => {
    const nextDir = sortDir === 'desc' ? 'asc' : 'desc'
    setSortDir(nextDir)
    setTrips((prev) =>
      [...prev].sort((a, b) => {
        const dateA = new Date(a.createdAt).getTime()
        const dateB = new Date(b.createdAt).getTime()
        return nextDir === 'desc' ? dateB - dateA : dateA - dateB
      })
    )
  }

  const handleRowClick = (trip: Trip) => {
    onSelectTrip?.(trip)
  }

  if (loading) {
    return (
      <div className="space-y-4">
        {/* Desktop skeleton */}
        <div className="hidden md:block rounded-lg border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-[140px]">Trip #</TableHead>
                <TableHead>Route</TableHead>
                <TableHead>Customer</TableHead>
                <TableHead>Truck / Driver</TableHead>
                <TableHead>Items</TableHead>
                <TableHead className="text-center">Dest.</TableHead>
                <TableHead className="text-right">Amount</TableHead>
                <TableHead className="text-right">Bags</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>
                  <Button variant="ghost" size="icon" className="h-7 w-7">
                    <ArrowUpDown className="h-3.5 w-3.5" />
                  </Button>
                </TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              <TripTableSkeleton />
            </TableBody>
          </Table>
        </div>
        {/* Mobile skeleton */}
        <div className="md:hidden space-y-3">
          <TripCardSkeleton />
        </div>
      </div>
    )
  }

  if (trips.length === 0) {
    return <EmptyState onNewTrip={onNewTrip} />
  }

  return (
    <div className="space-y-4">
      {/* Desktop table */}
      <div className="hidden md:block rounded-lg border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-[140px]">Trip #</TableHead>
              <TableHead>Route</TableHead>
              <TableHead>Customer</TableHead>
              <TableHead>Truck / Driver</TableHead>
              <TableHead>Items</TableHead>
              <TableHead className="text-center">Dest.</TableHead>
              <TableHead className="text-right">Amount</TableHead>
              <TableHead className="text-right">Bags</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-7 w-7"
                  onClick={handleSort}
                >
                  <ArrowUpDown className="h-3.5 w-3.5" />
                  <span className="sr-only">
                    Sort by date ({sortDir === 'desc' ? 'newest' : 'oldest'} first)
                  </span>
                </Button>
              </TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {trips.map((trip) => (
              <TableRow
                key={trip.id}
                className="cursor-pointer"
                onClick={() => handleRowClick(trip)}
              >
                <TableCell>
                  <Badge variant="secondary" className="font-mono text-xs">
                    {trip.tripNumber}
                  </Badge>
                </TableCell>
                <TableCell>
                  <div className="flex items-center gap-1.5 text-sm">
                    <span>{trip.loadingCity?.name || '—'}</span>
                    <ChevronRight className="h-3 w-3 text-muted-foreground" />
                    <span>{trip.destinationCity?.name || '—'}</span>
                  </div>
                </TableCell>
                <TableCell>
                  <div className="text-sm">
                    {(trip as Record<string, unknown>).customerName ? (
                      <div>
                        <div className="font-medium truncate max-w-[150px]">{String((trip as Record<string, unknown>).customerName)}</div>
                        {(trip as Record<string, unknown>).client && (() => {
                          const client = (trip as Record<string, unknown>).client as Record<string, unknown>
                          return client.companyName ? (
                            <div className="text-muted-foreground text-xs truncate max-w-[150px]">{client.companyName as string}</div>
                          ) : null
                        })()}
                      </div>
                    ) : (
                      <span className="text-muted-foreground">—</span>
                    )}
                  </div>
                </TableCell>
                <TableCell>
                  <div className="text-sm">
                    <div className="font-medium">
                      {trip.truck?.plateNumber || 'No truck'}
                    </div>
                    {trip.driver ? (
                      <div className="text-muted-foreground text-xs">
                        {trip.driver.name}
                      </div>
                    ) : (
                      <div className="text-muted-foreground text-xs">
                        No driver
                      </div>
                    )}
                  </div>
                </TableCell>
                <TableCell className="max-w-[200px]">
                  <span className="text-sm text-muted-foreground truncate block">
                    {getUniqueItems(trip)}
                  </span>
                </TableCell>
                <TableCell className="text-center">
                  <span className="text-sm">
                    {trip.deliveryDestinations?.length || 0}
                  </span>
                </TableCell>
                <TableCell className="text-right">
                  <span className="text-sm font-medium">
                    {formatCurrency(trip.totalAmount)}
                  </span>
                </TableCell>
                <TableCell className="text-right">
                  <span className="text-sm">
                    {trip.totalBags.toLocaleString()}
                  </span>
                </TableCell>
                <TableCell>
                  <Badge className={statusColor(trip.status)}>
                    {trip.status.replace('_', ' ')}
                  </Badge>
                </TableCell>
                <TableCell className="text-sm text-muted-foreground">
                  {formatDate(trip.createdAt)}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>

      {/* Mobile card view */}
      <div className="md:hidden space-y-3">
        {trips.map((trip) => (
          <TripMobileCard
            key={trip.id}
            trip={trip}
            onClick={() => handleRowClick(trip)}
          />
        ))}
      </div>
    </div>
  )
}
