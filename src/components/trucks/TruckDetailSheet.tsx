'use client'

import * as React from 'react'
import { ResponsiveSheet } from '@/components/ui/responsive-sheet'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Separator } from '@/components/ui/separator'
import { Skeleton } from '@/components/ui/skeleton'
import {
  Truck, Fuel, Shield, Wrench, CircleDot, Receipt,
  Clock, AlertCircle, RefreshCw,
} from 'lucide-react'
import { CURRENCY_SYMBOL, TYRE_CONDITIONS } from '@/lib/constants'
import { fetchTruckDetail, type TruckDetail } from '@/lib/api'

interface TruckDetailSheetProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  truckId: string | null
}

export function TruckDetailSheet({ open, onOpenChange, truckId }: TruckDetailSheetProps) {
  const [truck, setTruck] = React.useState<TruckDetail | null>(null)
  const [loading, setLoading] = React.useState(false)
  const [error, setError] = React.useState<string | null>(null)

  React.useEffect(() => {
    if (open && truckId) {
      setLoading(true)
      setError(null)
      fetchTruckDetail(truckId)
        .then(setTruck)
        .catch((err) => setError(err instanceof Error ? err.message : 'Failed to load truck'))
        .finally(() => setLoading(false))
    }
  }, [open, truckId])

  const handleSheetClose = React.useCallback((val: boolean) => {
    onOpenChange(val)
    if (!val) {
      setTruck(null)
      setError(null)
    }
  }, [onOpenChange])

  if (!truckId) return null

  const getTitle = (): React.ReactNode => {
    if (loading || error || !truck) return 'Truck Details'
    return (
      <span className="flex items-center gap-2">
        <div className="rounded bg-amber-100 dark:bg-amber-900/30 p-1.5">
          <Truck className="h-4 w-4 text-amber-600 dark:text-amber-400" />
        </div>
        {truck.plateNumber}
      </span>
    )
  }

  const getDescription = (): string | undefined => {
    if (loading) return 'Loading truck information...'
    if (error) return 'Error loading truck information'
    if (truck) return `${truck.make} ${truck.model} ${truck.year} — Fleet Details`
    return undefined
  }

  return (
    <ResponsiveSheet
      open={open}
      onOpenChange={handleSheetClose}
      title={getTitle()}
      description={getDescription()}
      width="sm:max-w-xl"
    >
      {loading ? (
        <div className="space-y-5 p-4 md:p-6">
          <Skeleton className="h-6 w-40" />
          <div className="grid grid-cols-3 gap-3">
            {[1, 2, 3].map(i => (
              <Skeleton key={i} className="h-20 rounded-lg" />
            ))}
          </div>
          <Skeleton className="h-10 w-full" />
          <div className="space-y-3">
            {[1, 2, 3, 4].map(i => (
              <Skeleton key={i} className="h-5 w-full" />
            ))}
          </div>
        </div>
      ) : error ? (
        <div className="space-y-5 p-4 md:p-6">
          <div className="flex flex-col items-center justify-center py-16 text-center">
            <AlertCircle className="h-8 w-8 text-red-500 mb-3" />
            <p className="text-sm text-muted-foreground mb-3">{error}</p>
            <Button variant="outline" size="sm" onClick={() => {
              setLoading(true)
              setError(null)
              fetchTruckDetail(truckId)
                .then(setTruck)
                .catch((err) => setError(err instanceof Error ? err.message : 'Failed to load'))
                .finally(() => setLoading(false))
            }}>
              <RefreshCw className="mr-2 h-3 w-3" /> Retry
            </Button>
          </div>
        </div>
      ) : truck ? (
        <div className="space-y-5 p-4 md:p-6">
          {/* Key Metrics */}
          <div className="grid grid-cols-3 gap-3">
            <div className="rounded-lg border p-3 text-center">
              <Fuel className="h-4 w-4 mx-auto mb-1 text-amber-500" />
              <p className="text-xs text-muted-foreground">Mileage</p>
              <p className="text-sm font-bold">{Math.round(truck.currentMileage).toLocaleString()} km</p>
            </div>
            <div className="rounded-lg border p-3 text-center">
              <Shield className="h-4 w-4 mx-auto mb-1 text-amber-500" />
              <p className="text-xs text-muted-foreground">Insurance</p>
              <p className={`text-sm font-bold capitalize ${truck.insuranceStatus === 'active' ? 'text-emerald-600' : 'text-red-600'}`}>
                {truck.insuranceStatus}
              </p>
            </div>
            <div className="rounded-lg border p-3 text-center">
              <Wrench className="h-4 w-4 mx-auto mb-1 text-amber-500" />
              <p className="text-xs text-muted-foreground">Next Service</p>
              <p className="text-sm font-bold">
                {truck.nextServiceDate ? new Date(truck.nextServiceDate).toLocaleDateString() : '-'}
              </p>
            </div>
          </div>

          <Separator />

          <Tabs defaultValue="overview" className="w-full">
            <TabsList className="w-full">
              <TabsTrigger value="overview" className="flex-1">Overview</TabsTrigger>
              <TabsTrigger value="tyres" className="flex-1">Tyres ({truck.tyres?.length ?? 0})</TabsTrigger>
              <TabsTrigger value="maintenance" className="flex-1">Service ({truck.maintenance?.length ?? 0})</TabsTrigger>
            </TabsList>

            <TabsContent value="overview" className="space-y-4 mt-4">
              <div className="space-y-3">
                <InfoRow label="Make / Model" value={`${truck.make} ${truck.model}`} />
                <InfoRow label="Year" value={String(truck.year)} />
                <InfoRow label="Driver" value={truck.driver ? `${truck.driver.firstName} ${truck.driver.lastName}` : 'Unassigned'} />
                <InfoRow label="Status" value={truck.status} />
                <InfoRow label="Fuel Type" value={truck.fuelType} />
                <InfoRow label="Tank Capacity" value={truck.tankCapacity ? `${truck.tankCapacity} L` : '-'} />
              </div>

              <Separator />

              <div>
                <h4 className="text-sm font-semibold mb-3">Recent Expenses</h4>
                <div className="space-y-2 max-h-48 overflow-y-auto">
                  {(truck.expenses?.length ?? 0) === 0 ? (
                    <p className="text-sm text-muted-foreground text-center py-2">No expenses</p>
                  ) : (
                    truck.expenses.map((exp) => (
                      <div key={exp.id} className="flex items-center justify-between text-sm p-2 rounded-lg hover:bg-muted/50">
                        <div>
                          <p className="font-medium">{exp.description}</p>
                          <p className="text-xs text-muted-foreground">{new Date(exp.date).toLocaleDateString()} • {exp.category}</p>
                        </div>
                        <span className="font-semibold text-sm">{CURRENCY_SYMBOL}{exp.amount.toLocaleString()}</span>
                      </div>
                    ))
                  )}
                </div>
              </div>

              <Separator />

              <div>
                <h4 className="text-sm font-semibold mb-3">Recent Trips</h4>
                <div className="space-y-2 max-h-48 overflow-y-auto">
                  {(truck.trips?.length ?? 0) === 0 ? (
                    <p className="text-sm text-muted-foreground text-center py-2">No trips</p>
                  ) : (
                    truck.trips.map((trip) => (
                      <div key={trip.id} className="flex items-center justify-between text-sm p-2 rounded-lg hover:bg-muted/50">
                        <div>
                          <p className="font-medium">{trip.loadingLocation} → {trip.destination}</p>
                          <p className="text-xs text-muted-foreground">{trip.tripNumber} • {new Date(trip.departureTime).toLocaleDateString()}</p>
                        </div>
                        <div className="flex items-center gap-2">
                          <Badge variant="outline" className={`text-xs border-transparent capitalize ${trip.status === 'in_transit' ? 'bg-emerald-100 text-emerald-700' : 'bg-gray-100 text-gray-600'}`}>
                            {trip.status.replace(/_/g, ' ')}
                          </Badge>
                          <span className="font-semibold text-xs">{trip.totalRevenue ? `${CURRENCY_SYMBOL}${trip.totalRevenue.toLocaleString()}` : '-'}</span>
                        </div>
                      </div>
                    ))
                  )}
                </div>
              </div>
            </TabsContent>

            <TabsContent value="tyres" className="mt-4">
              {(truck.tyres?.length ?? 0) === 0 ? (
                <div className="text-center py-8">
                  <CircleDot className="h-8 w-8 text-muted-foreground mx-auto mb-2" />
                  <p className="text-sm text-muted-foreground">No tyre data available</p>
                </div>
              ) : (
                <div className="space-y-2 max-h-64 overflow-y-auto">
                  {truck.tyres.map((tyre) => (
                    <div key={tyre.id} className="rounded-lg border p-3">
                      <div className="flex items-center justify-between mb-1">
                        <div className="flex items-center gap-1.5">
                          <CircleDot className="h-3.5 w-3.5 text-amber-500" />
                          <span className="text-xs font-mono font-medium">{tyre.serialNumber}</span>
                        </div>
                        <Badge
                          variant="outline"
                          className={`text-[10px] border-transparent font-medium ${TYRE_CONDITIONS[tyre.condition as keyof typeof TYRE_CONDITIONS]?.color || ''}`}
                        >
                          {tyre.condition}
                        </Badge>
                      </div>
                      <div className="flex items-center justify-between text-xs text-muted-foreground">
                        <span>{tyre.brand}</span>
                        <span className="font-medium text-foreground">
                          {CURRENCY_SYMBOL}{tyre.purchasePrice.toLocaleString()}
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </TabsContent>

            <TabsContent value="maintenance" className="mt-4">
              {(truck.maintenance?.length ?? 0) === 0 ? (
                <div className="text-center py-8">
                  <Wrench className="h-8 w-8 text-muted-foreground mx-auto mb-2" />
                  <p className="text-sm text-muted-foreground">No maintenance records</p>
                </div>
              ) : (
                <div className="space-y-3">
                  {truck.maintenance.map((record) => (
                    <div key={record.id} className="rounded-lg border p-3">
                      <div className="flex items-center justify-between mb-1">
                        <span className="text-sm font-medium">{record.title}</span>
                        <Badge variant="outline" className="text-xs border-transparent bg-emerald-100 text-emerald-700 capitalize">
                          {record.status.replace(/_/g, ' ')}
                        </Badge>
                      </div>
                      <div className="flex items-center gap-3 text-xs text-muted-foreground">
                        <span className="flex items-center gap-1">
                          <Clock className="h-3 w-3" />
                          {new Date(record.performedAt).toLocaleDateString()}
                        </span>
                        <span className="capitalize">{record.type}</span>
                        <span className="ml-auto font-medium text-foreground">
                          {record.cost ? `${CURRENCY_SYMBOL}${record.cost.toLocaleString()}` : '-'}
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </TabsContent>
          </Tabs>
        </div>
      ) : null}
    </ResponsiveSheet>
  )
}

function InfoRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between py-1">
      <span className="text-sm text-muted-foreground">{label}</span>
      <span className="text-sm font-medium capitalize">{value}</span>
    </div>
  )
}
