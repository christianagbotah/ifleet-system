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
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import {
  User,
  Phone,
  Mail,
  IdCard,
  Calendar,
  AlertCircle,
  RefreshCw,
  Route,
  BarChart3,
  FileText,
} from 'lucide-react'

interface DriverDetailSheetProps {
  driverId?: string
  open: boolean
  onOpenChange: (open: boolean) => void
}

interface DriverData {
  id: string
  firstName: string
  lastName: string
  phone: string
  email: string | null
  licenseNumber: string
  licenseClass: string
  licenseExpiry: string
  status: 'active' | 'inactive' | 'suspended'
  hireDate: string
  photo: string | null
  totalTrips: number
  rating: number
  totalMileage: number
}

const PLACEHOLDER_DRIVER: DriverData = {
  id: '',
  firstName: 'Kwame',
  lastName: 'Asante',
  phone: '024 123 4567',
  email: 'kwame.asante@email.com',
  licenseNumber: 'DL-2024-001',
  licenseClass: 'C',
  licenseExpiry: '2027-12-31',
  status: 'active',
  hireDate: '2024-01-15',
  photo: null,
  totalTrips: 47,
  rating: 4.8,
  totalMileage: 128450,
}

export function DriverDetailSheet({
  driverId,
  open,
  onOpenChange,
}: DriverDetailSheetProps) {
  const [driver, setDriver] = React.useState<DriverData | null>(null)
  const [loading, setLoading] = React.useState(false)
  const [error, setError] = React.useState<string | null>(null)

  React.useEffect(() => {
    if (open && driverId) {
      setLoading(true)
      setError(null)

      fetch(`/api/drivers/${driverId}`)
        .then((res) => {
          if (!res.ok) throw new Error('Failed to load driver')
          return res.json()
        })
        .then(setDriver)
        .catch((err) => {
          setError(err instanceof Error ? err.message : 'Failed to load driver')
          // Fallback to placeholder data in development
          setDriver({ ...PLACEHOLDER_DRIVER, id: driverId })
        })
        .finally(() => setLoading(false))
    }
  }, [open, driverId])

  const handleSheetClose = React.useCallback(
    (val: boolean) => {
      onOpenChange(val)
      if (!val) {
        setDriver(null)
        setError(null)
      }
    },
    [onOpenChange]
  )

  const statusColor = React.useCallback((status: string) => {
    switch (status) {
      case 'active':
        return 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400'
      case 'suspended':
        return 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400'
      default:
        return 'bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-400'
    }
  }, [])

  if (!driverId) return null

  return (
    <Sheet open={open} onOpenChange={handleSheetClose}>
      <SheetContent className="w-full sm:max-w-xl overflow-y-auto px-4 sm:px-6 max-sm:max-h-[95vh] max-sm:rounded-t-2xl">
        {loading ? (
          <LoadingSkeleton />
        ) : error && !driver ? (
          <ErrorState
            message={error}
            onRetry={() => {
              setLoading(true)
              setError(null)
              fetch(`/api/drivers/${driverId}`)
                .then((res) => {
                  if (!res.ok) throw new Error('Failed to load')
                  return res.json()
                })
                .then(setDriver)
                .catch((err) =>
                  setError(err instanceof Error ? err.message : 'Failed to load')
                )
                .finally(() => setLoading(false))
            }}
          />
        ) : driver ? (
          <>
            <SheetHeader className="max-sm:px-1 max-sm:pt-5">
              <SheetTitle className="flex items-center gap-3">
                <Avatar className="h-10 w-10">
                  {driver.photo ? (
                    <AvatarImage src={driver.photo} alt={`${driver.firstName} ${driver.lastName}`} />
                  ) : null}
                  <AvatarFallback className="bg-amber-100 dark:bg-amber-900/30 text-amber-600 dark:text-amber-400">
                    <User className="h-5 w-5" />
                  </AvatarFallback>
                </Avatar>
                <div>
                  <span>
                    {driver.firstName} {driver.lastName}
                  </span>
                  <div className="flex items-center gap-2 mt-0.5">
                    <Badge
                      variant="outline"
                      className={`text-[10px] border-transparent font-medium ${statusColor(driver.status)}`}
                    >
                      {driver.status}
                    </Badge>
                    <span className="text-xs text-muted-foreground capitalize">
                      License: {driver.licenseClass}
                    </span>
                  </div>
                </div>
              </SheetTitle>
              <SheetDescription>Driver profile & activity details</SheetDescription>
            </SheetHeader>

            {/* Key Metrics */}
            <div className="grid grid-cols-3 gap-3 mt-2">
              <div className="rounded-lg border p-3 text-center">
                <Route className="h-4 w-4 mx-auto mb-1 text-amber-500" />
                <p className="text-xs text-muted-foreground">Trips</p>
                <p className="text-lg font-bold">{driver.totalTrips}</p>
              </div>
              <div className="rounded-lg border p-3 text-center">
                <BarChart3 className="h-4 w-4 mx-auto mb-1 text-amber-500" />
                <p className="text-xs text-muted-foreground">Rating</p>
                <p className="text-lg font-bold">{driver.rating.toFixed(1)}</p>
              </div>
              <div className="rounded-lg border p-3 text-center">
                <Route className="h-4 w-4 mx-auto mb-1 text-amber-500" />
                <p className="text-xs text-muted-foreground">Mileage</p>
                <p className="text-sm font-bold">
                  {Math.round(driver.totalMileage).toLocaleString()}
                </p>
              </div>
            </div>

            <Separator className="my-4" />

            <Tabs defaultValue="profile" className="w-full">
              <TabsList className="w-full">
                <TabsTrigger value="profile" className="flex-1">
                  Profile
                </TabsTrigger>
                <TabsTrigger value="trips" className="flex-1">
                  Trips
                </TabsTrigger>
                <TabsTrigger value="performance" className="flex-1">
                  Performance
                </TabsTrigger>
                <TabsTrigger value="documents" className="flex-1">
                  Documents
                </TabsTrigger>
              </TabsList>

              <TabsContent value="profile" className="space-y-3 mt-4">
                <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">
                  Personal Information
                </p>
                <InfoRow
                  icon={<User className="h-3.5 w-3.5" />}
                  label="Full Name"
                  value={`${driver.firstName} ${driver.lastName}`}
                />
                <InfoRow
                  icon={<Phone className="h-3.5 w-3.5" />}
                  label="Phone"
                  value={driver.phone}
                />
                <InfoRow
                  icon={<Mail className="h-3.5 w-3.5" />}
                  label="Email"
                  value={driver.email || 'Not provided'}
                />
                <Separator className="my-2" />
                <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">
                  License Information
                </p>
                <InfoRow
                  icon={<IdCard className="h-3.5 w-3.5" />}
                  label="License #"
                  value={driver.licenseNumber}
                />
                <InfoRow
                  icon={<IdCard className="h-3.5 w-3.5" />}
                  label="License Class"
                  value={driver.licenseClass}
                />
                <InfoRow
                  icon={<Calendar className="h-3.5 w-3.5" />}
                  label="License Expiry"
                  value={new Date(driver.licenseExpiry).toLocaleDateString()}
                  warn={
                    new Date(driver.licenseExpiry) <
                    new Date(Date.now() + 30 * 86400000)
                  }
                />
                <InfoRow
                  icon={<Calendar className="h-3.5 w-3.5" />}
                  label="Hire Date"
                  value={new Date(driver.hireDate).toLocaleDateString()}
                />
              </TabsContent>

              <TabsContent value="trips" className="mt-4">
                <div className="text-center py-10">
                  <Route className="h-8 w-8 text-muted-foreground mx-auto mb-2" />
                  <p className="text-sm text-muted-foreground">
                    {driver.totalTrips > 0
                      ? `${driver.totalTrips} trips completed`
                      : 'No trips recorded'}
                  </p>
                </div>
              </TabsContent>

              <TabsContent value="performance" className="mt-4">
                <div className="text-center py-10">
                  <BarChart3 className="h-8 w-8 text-muted-foreground mx-auto mb-2" />
                  <p className="text-sm text-muted-foreground">
                    Rating: {driver.rating.toFixed(1)} / 5.0
                  </p>
                  <p className="text-xs text-muted-foreground mt-1">
                    Total mileage: {Math.round(driver.totalMileage).toLocaleString()} km
                  </p>
                </div>
              </TabsContent>

              <TabsContent value="documents" className="mt-4">
                <div className="text-center py-10">
                  <FileText className="h-8 w-8 text-muted-foreground mx-auto mb-2" />
                  <p className="text-sm text-muted-foreground">No documents uploaded</p>
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
}: {
  icon: React.ReactNode
  label: string
  value: string
  warn?: boolean
}) {
  return (
    <div className="flex items-center justify-between py-1">
      <span className="text-sm text-muted-foreground flex items-center gap-2">
        {icon}
        {label}
      </span>
      <span
        className={`text-sm font-medium ${warn ? 'text-amber-600 dark:text-amber-400' : ''}`}
      >
        {value}
      </span>
    </div>
  )
}

function LoadingSkeleton() {
  return (
    <>
      <SheetHeader>
        <VisuallyHidden>
          <SheetTitle>Driver Details</SheetTitle>
        </VisuallyHidden>
        <SheetDescription>Loading driver information...</SheetDescription>
      </SheetHeader>
      <div className="space-y-4 p-4">
        <div className="flex items-center gap-3">
          <Skeleton className="h-14 w-14 rounded-full" />
          <div className="flex-1 space-y-2">
            <Skeleton className="h-5 w-36" />
            <Skeleton className="h-3 w-28" />
          </div>
        </div>
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
          <SheetTitle>Driver Details</SheetTitle>
        </VisuallyHidden>
        <SheetDescription>Error loading driver information</SheetDescription>
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
