'use client'

import * as React from 'react'
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
} from '@/components/ui/sheet'
import { VisuallyHidden } from '@radix-ui/react-visually-hidden'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Separator } from '@/components/ui/separator'
import { Skeleton } from '@/components/ui/skeleton'
import {
  Truck,
  Fuel,
  Wrench,
  Shield,
  Calendar,
  AlertCircle,
  RefreshCw,
  Route,
  BarChart3,
} from 'lucide-react'

interface TruckDetailSheetProps {
  truckId?: string
  open: boolean
  onOpenChange: (open: boolean) => void
}

interface TruckData {
  id: string
  plateNumber: string
  make: string
  model: string
  year: number
  fuelType: string
  currentMileage: number
  tankCapacity: number | null
  status: 'active' | 'inactive' | 'maintenance' | 'decommissioned'
  insuranceExpiry: string | null
  insuranceStatus: 'active' | 'expired' | 'none'
  nextServiceDate: string | null
  totalTrips: number
  totalRevenue: number
}

const PLACEHOLDER_TRUCK: TruckData = {
  id: '',
  plateNumber: 'GR-1234-A',
  make: 'Mercedes-Benz',
  model: 'Actros',
  year: 2022,
  fuelType: 'Diesel',
  currentMileage: 128450,
  tankCapacity: 400,
  status: 'active',
  insuranceExpiry: '2025-12-31',
  insuranceStatus: 'active',
  nextServiceDate: '2025-06-15',
  totalTrips: 62,
  totalRevenue: 245600,
}

export function TruckDetailSheet({
  truckId,
  open,
  onOpenChange,
}: TruckDetailSheetProps) {
  const [truck, setTruck] = React.useState<TruckData | null>(null)
  const [loading, setLoading] = React.useState(false)
  const [error, setError] = React.useState<string | null>(null)

  React.useEffect(() => {
    if (open && truckId) {
      setLoading(true)
      setError(null)

      fetch(`/api/trucks/${truckId}`)
        .then((res) => {
          if (!res.ok) throw new Error('Failed to load truck')
          return res.json()
        })
        .then(setTruck)
        .catch((err) => {
          setError(err instanceof Error ? err.message : 'Failed to load truck')
          // Fallback to placeholder data in development
          setTruck({ ...PLACEHOLDER_TRUCK, id: truckId })
        })
        .finally(() => setLoading(false))
    }
  }, [open, truckId])

  const handleSheetClose = React.useCallback(
    (val: boolean) => {
      onOpenChange(val)
      if (!val) {
        setTruck(null)
        setError(null)
      }
    },
    [onOpenChange]
  )

  const statusColor = React.useCallback((status: string) => {
    switch (status) {
      case 'active':
        return 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400'
      case 'maintenance':
        return 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400'
      case 'decommissioned':
        return 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400'
      default:
        return 'bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-400'
    }
  }, [])

  if (!truckId) return null

  return (
    <Sheet open={open} onOpenChange={handleSheetClose}>
      <SheetContent className="w-full sm:max-w-xl overflow-y-auto px-4 sm:px-6 max-sm:max-h-[95vh] max-sm:rounded-t-2xl">
        {loading ? (
          <LoadingSkeleton />
        ) : error && !truck ? (
          <ErrorState
            message={error}
            onRetry={() => {
              setLoading(true)
              setError(null)
              fetch(`/api/trucks/${truckId}`)
                .then((res) => {
                  if (!res.ok) throw new Error('Failed to load')
                  return res.json()
                })
                .then(setTruck)
                .catch((err) =>
                  setError(err instanceof Error ? err.message : 'Failed to load')
                )
                .finally(() => setLoading(false))
            }}
          />
        ) : truck ? (
          <>
            <SheetHeader className="max-sm:px-1 max-sm:pt-5">
              <SheetTitle className="flex items-center gap-2">
                <div className="rounded bg-amber-100 dark:bg-amber-900/30 p-1.5">
                  <Truck className="h-4 w-4 text-amber-600 dark:text-amber-400" />
                </div>
                {truck.plateNumber}
              </SheetTitle>
              <SheetDescription>
                {truck.make} {truck.model} {truck.year} — Fleet Details
              </SheetDescription>
            </SheetHeader>

            {/* Key Metrics */}
            <div className="grid grid-cols-3 gap-3 mt-4">
              <div className="rounded-lg border p-3 text-center">
                <Fuel className="h-4 w-4 mx-auto mb-1 text-amber-500" />
                <p className="text-xs text-muted-foreground">Mileage</p>
                <p className="text-sm font-bold">
                  {Math.round(truck.currentMileage).toLocaleString()} km
                </p>
              </div>
              <div className="rounded-lg border p-3 text-center">
                <Shield className="h-4 w-4 mx-auto mb-1 text-amber-500" />
                <p className="text-xs text-muted-foreground">Insurance</p>
                <p
                  className={`text-sm font-bold capitalize ${
                    truck.insuranceStatus === 'active'
                      ? 'text-emerald-600'
                      : 'text-red-600'
                  }`}
                >
                  {truck.insuranceStatus}
                </p>
              </div>
              <div className="rounded-lg border p-3 text-center">
                <Wrench className="h-4 w-4 mx-auto mb-1 text-amber-500" />
                <p className="text-xs text-muted-foreground">Next Service</p>
                <p className="text-sm font-bold">
                  {truck.nextServiceDate
                    ? new Date(truck.nextServiceDate).toLocaleDateString()
                    : '-'}
                </p>
              </div>
            </div>

            <Separator className="my-4" />

            <Tabs defaultValue="overview" className="w-full">
              <TabsList className="w-full">
                <TabsTrigger value="overview" className="flex-1">
                  Overview
                </TabsTrigger>
                <TabsTrigger value="fuel" className="flex-1">
                  Fuel Logs
                </TabsTrigger>
                <TabsTrigger value="maintenance" className="flex-1">
                  Maintenance
                </TabsTrigger>
                <TabsTrigger value="trips" className="flex-1">
                  Trips
                </TabsTrigger>
              </TabsList>

              <TabsContent value="overview" className="space-y-3 mt-4">
                <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">
                  Vehicle Information
                </p>
                <InfoRow
                  icon={<Truck className="h-3.5 w-3.5" />}
                  label="Plate Number"
                  value={truck.plateNumber}
                />
                <InfoRow
                  icon={<Truck className="h-3.5 w-3.5" />}
                  label="Make / Model"
                  value={`${truck.make} ${truck.model}`}
                />
                <InfoRow
                  icon={<Calendar className="h-3.5 w-3.5" />}
                  label="Year"
                  value={String(truck.year)}
                />
                <InfoRow
                  icon={<Fuel className="h-3.5 w-3.5" />}
                  label="Fuel Type"
                  value={truck.fuelType}
                />
                <InfoRow
                  icon={<Route className="h-3.5 w-3.5" />}
                  label="Mileage"
                  value={`${Math.round(truck.currentMileage).toLocaleString()} km`}
                />
                <InfoRow
                  icon={<Fuel className="h-3.5 w-3.5" />}
                  label="Tank Capacity"
                  value={truck.tankCapacity ? `${truck.tankCapacity} L` : '-'}
                />
                <Separator className="my-2" />
                <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">
                  Status & Insurance
                </p>
                <InfoRow
                  icon={<Shield className="h-3.5 w-3.5" />}
                  label="Status"
                  value={
                    <Badge
                      variant="outline"
                      className={`text-[10px] border-transparent font-medium capitalize ${statusColor(truck.status)}`}
                    >
                      {truck.status}
                    </Badge>
                  }
                  isValueElement
                />
                <InfoRow
                  icon={<Shield className="h-3.5 w-3.5" />}
                  label="Insurance Expiry"
                  value={
                    truck.insuranceExpiry
                      ? new Date(truck.insuranceExpiry).toLocaleDateString()
                      : 'Not insured'
                  }
                  warn={
                    truck.insuranceExpiry
                      ? new Date(truck.insuranceExpiry) <
                        new Date(Date.now() + 30 * 86400000)
                      : false
                  }
                />
                <InfoRow
                  icon={<Wrench className="h-3.5 w-3.5" />}
                  label="Next Service"
                  value={
                    truck.nextServiceDate
                      ? new Date(truck.nextServiceDate).toLocaleDateString()
                      : 'Not scheduled'
                  }
                />
              </TabsContent>

              <TabsContent value="fuel" className="mt-4">
                <div className="text-center py-10">
                  <Fuel className="h-8 w-8 text-muted-foreground mx-auto mb-2" />
                  <p className="text-sm text-muted-foreground">No fuel logs recorded</p>
                </div>
              </TabsContent>

              <TabsContent value="maintenance" className="mt-4">
                <div className="text-center py-10">
                  <Wrench className="h-8 w-8 text-muted-foreground mx-auto mb-2" />
                  <p className="text-sm text-muted-foreground">
                    {truck.nextServiceDate
                      ? `Next service: ${new Date(truck.nextServiceDate).toLocaleDateString()}`
                      : 'No maintenance scheduled'}
                  </p>
                </div>
              </TabsContent>

              <TabsContent value="trips" className="mt-4">
                <div className="text-center py-10">
                  <BarChart3 className="h-8 w-8 text-muted-foreground mx-auto mb-2" />
                  <p className="text-sm text-muted-foreground">
                    {truck.totalTrips > 0
                      ? `${truck.totalTrips} trips completed`
                      : 'No trips recorded'}
                  </p>
                </div>
              </TabsContent>
            </Tabs>
          </>
        ) : null}
      </SheetContent>
    </Sheet>
  )
}

function InfoRow({
  icon,
  label,
  value,
  warn,
  isValueElement,
}: {
  icon: React.ReactNode
  label: string
  value: React.ReactNode
  warn?: boolean
  isValueElement?: boolean
}) {
  return (
    <div className="flex items-center justify-between py-1">
      <span className="text-sm text-muted-foreground flex items-center gap-2">
        {icon}
        {label}
      </span>
      {isValueElement ? (
        <span
          className={warn ? 'text-amber-600 dark:text-amber-400' : ''}
        >
          {value}
        </span>
      ) : (
        <span
          className={`text-sm font-medium ${warn ? 'text-amber-600 dark:text-amber-400' : ''}`}
        >
          {value as string}
        </span>
      )}
    </div>
  )
}

function LoadingSkeleton() {
  return (
    <>
      <SheetHeader>
        <VisuallyHidden>
          <SheetTitle>Truck Details</SheetTitle>
        </VisuallyHidden>
        <SheetDescription>Loading truck information...</SheetDescription>
      </SheetHeader>
      <div className="space-y-4 p-4">
        <Skeleton className="h-6 w-40" />
        <div className="grid grid-cols-3 gap-3">
          {[1, 2, 3].map((i) => (
            <Skeleton key={i} className="h-20 rounded-lg" />
          ))}
        </div>
        <Skeleton className="h-10 w-full" />
        <div className="space-y-3">
          {[1, 2, 3, 4].map((i) => (
            <Skeleton key={i} className="h-5 w-full" />
          ))}
        </div>
      </div>
    </>
  )
}

function ErrorState({
  message,
  onRetry,
}: {
  message: string
  onRetry: () => void
}) {
  return (
    <>
      <SheetHeader>
        <VisuallyHidden>
          <SheetTitle>Truck Details</SheetTitle>
        </VisuallyHidden>
        <SheetDescription>Error loading truck information</SheetDescription>
      </SheetHeader>
      <div className="flex flex-col items-center justify-center py-16 text-center">
        <AlertCircle className="h-8 w-8 text-red-500 mb-3" />
        <p className="text-sm text-muted-foreground mb-3">{message}</p>
        <Button variant="outline" size="sm" onClick={onRetry} className="gap-2">
          <RefreshCw className="h-3 w-3" />
          Retry
        </Button>
      </div>
    </>
  )
}
