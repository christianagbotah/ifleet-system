'use client'

import * as React from 'react'
import { motion } from 'framer-motion'
import { Search, FileText, AlertCircle, RefreshCw } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { StatusBadge } from '@/components/ui/status-badge'
import { EmptyState } from '@/components/ui/empty-state'
import { Skeleton } from '@/components/ui/skeleton'
import { fetchTrips, type Trip } from '@/lib/api'

const containerVariants = {
  show: { transition: { staggerChildren: 0.04 } },
}

const itemVariants = {
  show: { opacity: 1, y: 0 },
}

export function WaybillsView() {
  const [search, setSearch] = React.useState('')
  const [trips, setTrips] = React.useState<Trip[]>([])
  const [loading, setLoading] = React.useState(true)
  const [error, setError] = React.useState<string | null>(null)

  const loadTrips = React.useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const result = await fetchTrips({ limit: 50 })
      setTrips(result.data)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to fetch waybills')
    } finally {
      setLoading(false)
    }
  }, [])

  React.useEffect(() => {
    loadTrips()
  }, [loadTrips])

  const filteredTrips = React.useMemo(() => {
    if (!search) return trips
    const q = search.toLowerCase()
    return trips.filter((trip) =>
      trip.waybillNumber?.toLowerCase().includes(q) ||
      trip.tripNumber.toLowerCase().includes(q) ||
      trip.itemName.toLowerCase().includes(q)
    )
  }, [trips, search])

  return (
    <motion.div
      variants={containerVariants}
      animate="show"
      className="space-y-4 sm:space-y-6"
    >
      {/* Header */}
      <motion.div variants={itemVariants} className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Waybill Management</h1>
          <p className="text-muted-foreground">Track and manage waybills for all cargo shipments</p>
        </div>
      </motion.div>

      {/* Search */}
      <motion.div variants={itemVariants}>
        <div className="relative max-w-sm">
          <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Search by waybill #, trip #, or item..."
            className="pl-8"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
      </motion.div>

      {/* Table */}
      <motion.div variants={itemVariants}>
        <div className="rounded-lg border bg-card">
          {error ? (
            <div className="flex flex-col items-center justify-center py-12 text-center">
              <AlertCircle className="h-8 w-8 text-red-500 mb-3" />
              <p className="text-sm text-muted-foreground mb-3">{error}</p>
              <Button variant="outline" size="sm" onClick={loadTrips}>
                <RefreshCw className="mr-2 h-3 w-3" /> Retry
              </Button>
            </div>
          ) : loading ? (
            <div className="p-4 space-y-3">
              {[1, 2, 3, 4].map(i => (
                <Skeleton key={i} className="h-12 w-full rounded" />
              ))}
            </div>
          ) : filteredTrips.length === 0 ? (
            <EmptyState
              icon={FileText}
              title="No waybills found"
              description={search
                ? 'Try adjusting your search criteria'
                : 'Waybills are auto-generated when trips are created with a waybill number.'
              }
            />
          ) : (
            <>
              {/* Desktop table */}
              <div className="hidden md:block overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Waybill #</TableHead>
                      <TableHead>Trip #</TableHead>
                      <TableHead>Truck</TableHead>
                      <TableHead className="hidden md:table-cell">Driver</TableHead>
                      <TableHead className="hidden lg:table-cell">Route</TableHead>
                      <TableHead>Item</TableHead>
                      <TableHead className="hidden sm:table-cell">Qty</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead className="hidden sm:table-cell">Date</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {filteredTrips.map((trip) => (
                      <TableRow key={trip.id}>
                        <TableCell className="font-medium text-xs">
                          {trip.waybillNumber || (
                            <span className="text-muted-foreground italic">-</span>
                          )}
                        </TableCell>
                        <TableCell className="text-xs font-mono">{trip.tripNumber}</TableCell>
                        <TableCell className="text-sm">{trip.truck.plateNumber}</TableCell>
                        <TableCell className="hidden md:table-cell text-sm">
                          {trip.driver.firstName} {trip.driver.lastName}
                        </TableCell>
                        <TableCell className="hidden lg:table-cell text-xs">
                          <span className="bg-muted rounded px-1.5 py-0.5">{trip.loadingLocation}</span>
                          <span className="mx-1 text-muted-foreground">&rarr;</span>
                          <span className="bg-muted rounded px-1.5 py-0.5">{trip.destination}</span>
                        </TableCell>
                        <TableCell className="text-sm">{trip.itemName}</TableCell>
                        <TableCell className="hidden sm:table-cell text-sm">
                          {trip.quantity} {trip.unit}
                        </TableCell>
                        <TableCell>
                          <StatusBadge status={trip.status} variant="trip" />
                        </TableCell>
                        <TableCell className="hidden sm:table-cell text-xs text-muted-foreground">
                          {new Date(trip.departureTime).toLocaleDateString('en-GB', {
                            day: '2-digit',
                            month: 'short',
                            year: 'numeric',
                          })}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>

              {/* Mobile cards */}
              <div className="md:hidden divide-y">
                {filteredTrips.map((trip) => (
                  <div key={trip.id} className="mobile-card p-4 space-y-2">
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <p className="font-semibold text-sm truncate">
                          {trip.waybillNumber || '-'}
                        </p>
                        <p className="text-xs text-muted-foreground font-mono">{trip.tripNumber}</p>
                      </div>
                      <StatusBadge status={trip.status} variant="trip" />
                    </div>
                    <div className="text-sm space-y-1">
                      <div className="flex justify-between">
                        <span className="text-muted-foreground">Truck</span>
                        <span className="font-medium">{trip.truck.plateNumber}</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-muted-foreground">Item</span>
                        <span className="font-medium truncate ml-4">{trip.itemName}</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-muted-foreground">Date</span>
                        <span className="text-xs text-muted-foreground">
                          {new Date(trip.departureTime).toLocaleDateString('en-GB', {
                            day: '2-digit',
                            month: 'short',
                            year: 'numeric',
                          })}
                        </span>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </>
          )}
        </div>
      </motion.div>
    </motion.div>
  )
}
