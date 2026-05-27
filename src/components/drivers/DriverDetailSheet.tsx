'use client'

import * as React from 'react'
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription } from '@/components/ui/sheet'
import { VisuallyHidden } from '@radix-ui/react-visually-hidden'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Separator } from '@/components/ui/separator'
import { Skeleton } from '@/components/ui/skeleton'
import {
  User, Phone, Mail, Star, MapPin, Calendar, CreditCard,
  Route, Clock, AlertCircle, RefreshCw, IdCard, ShieldAlert,
  Truck, Banknote, Hash, ShieldCheck, FileText, ImagePlus,
} from 'lucide-react'
import { CURRENCY_SYMBOL, MONTHS, TRIP_STATUSES, PAYROLL_STATUSES } from '@/lib/constants'
import { fetchDriverDetail, type DriverDetail } from '@/lib/api'

interface DriverDetailSheetProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  driverId: string | null
}

export function DriverDetailSheet({ open, onOpenChange, driverId }: DriverDetailSheetProps) {
  const [driver, setDriver] = React.useState<DriverDetail | null>(null)
  const [loading, setLoading] = React.useState(false)
  const [error, setError] = React.useState<string | null>(null)

  React.useEffect(() => {
    if (open && driverId) {
      setLoading(true)
      setError(null)
      fetchDriverDetail(driverId)
        .then(setDriver)
        .catch((err) => setError(err instanceof Error ? err.message : 'Failed to load driver'))
        .finally(() => setLoading(false))
    }
  }, [open, driverId])

  const handleSheetClose = React.useCallback((val: boolean) => {
    onOpenChange(val)
    if (!val) {
      setDriver(null)
      setError(null)
    }
  }, [onOpenChange])

  if (!driverId) return null

  return (
    <Sheet open={open} onOpenChange={handleSheetClose}>
      <SheetContent className="w-full sm:max-w-xl overflow-y-auto px-4 sm:px-6 max-sm:max-h-[95vh] max-sm:rounded-t-2xl">
        {loading ? (
          <>
            <SheetHeader>
              <VisuallyHidden><SheetTitle>Driver Details</SheetTitle></VisuallyHidden>
              <SheetDescription>Loading driver information...</SheetDescription>
            </SheetHeader>
            <div className="space-y-4 p-4">
              <div className="flex items-center gap-3">
                <Skeleton className="h-14 w-14 rounded-full" />
                <div className="flex-1">
                  <Skeleton className="h-5 w-36 mb-2" />
                  <Skeleton className="h-3 w-28" />
                </div>
              </div>
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
          </>
        ) : error ? (
          <>
            <SheetHeader>
              <VisuallyHidden><SheetTitle>Driver Details</SheetTitle></VisuallyHidden>
              <SheetDescription>Error loading driver information</SheetDescription>
            </SheetHeader>
            <div className="flex flex-col items-center justify-center py-16 text-center">
              <AlertCircle className="h-8 w-8 text-red-500 mb-3" />
              <p className="text-sm text-muted-foreground mb-3">{error}</p>
              <Button variant="outline" size="sm" onClick={() => {
                setLoading(true)
                setError(null)
                fetchDriverDetail(driverId)
                  .then(setDriver)
                  .catch((err) => setError(err instanceof Error ? err.message : 'Failed to load'))
                  .finally(() => setLoading(false))
              }}>
                <RefreshCw className="mr-2 h-3 w-3" /> Retry
              </Button>
            </div>
          </>
        ) : driver ? (
          <>
            <SheetHeader className="max-sm:px-1 max-sm:pt-5">
              <SheetTitle className="flex items-center gap-3">
                <div className="flex h-10 w-10 items-center justify-center rounded-full bg-amber-100 dark:bg-amber-900/30">
                  {driver.photo ? (
                    <img src={driver.photo} alt="" className="h-full w-full rounded-full object-cover" />
                  ) : (
                    <User className="h-5 w-5 text-amber-600 dark:text-amber-400" />
                  )}
                </div>
                <div>
                  <span>{driver.firstName} {driver.lastName}</span>
                  <div className="flex items-center gap-2 mt-0.5">
                    <Badge
                      variant="outline"
                      className={`text-[10px] border-transparent font-medium ${
                        driver.status === 'active'
                          ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400'
                          : driver.status === 'suspended'
                            ? 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400'
                            : 'bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-400'
                      }`}
                    >
                      {driver.status}
                    </Badge>
                    <span className="text-xs text-muted-foreground">
                      {driver.trucks?.length > 0 ? driver.trucks?.[0]?.plateNumber : 'No truck assigned'}
                    </span>
                  </div>
                </div>
              </SheetTitle>
              <SheetDescription>Driver profile &amp; activity details</SheetDescription>
            </SheetHeader>

            {/* Key Metrics */}
            <div className="grid grid-cols-3 gap-3 mt-2">
              <div className="rounded-lg border p-3 text-center">
                <Route className="h-4 w-4 mx-auto mb-1 text-amber-500" />
                <p className="text-xs text-muted-foreground">Trips</p>
                <p className="text-lg font-bold">{driver.totalTrips}</p>
              </div>
              <div className="rounded-lg border p-3 text-center">
                <Star className="h-4 w-4 mx-auto mb-1 text-amber-500" />
                <p className="text-xs text-muted-foreground">Rating</p>
                <p className="text-lg font-bold">{driver.rating.toFixed(1)}</p>
              </div>
              <div className="rounded-lg border p-3 text-center">
                <MapPin className="h-4 w-4 mx-auto mb-1 text-amber-500" />
                <p className="text-xs text-muted-foreground">Mileage</p>
                <p className="text-lg font-bold">{Math.round(driver.totalMileage).toLocaleString()}</p>
              </div>
            </div>

            <Separator className="my-4" />

            <Tabs defaultValue="profile" className="w-full">
              <TabsList className="w-full">
                <TabsTrigger value="profile" className="flex-1">Profile</TabsTrigger>
                <TabsTrigger value="trips" className="flex-1">Trips ({driver.trips?.length ?? 0})</TabsTrigger>
                <TabsTrigger value="payroll" className="flex-1">Payroll ({driver.payroll?.length ?? 0})</TabsTrigger>
                <TabsTrigger value="documents" className="flex-1">Documents</TabsTrigger>
              </TabsList>

              <TabsContent value="profile" className="space-y-4 mt-4">
                <div className="space-y-3">
                  <Separator className="my-2" />
                  <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Employee Information</p>
                  <InfoRow icon={<Hash className="h-3.5 w-3.5" />} label="Employee ID" value={driver.employeeId || 'Not assigned'} />
                  {driver.ghanaCardNumber && (
                    <InfoRow icon={<IdCard className="h-3.5 w-3.5" />} label="Ghana Card #" value={driver.ghanaCardNumber} />
                  )}
                  {driver.ghanaCardExpiry && (
                    <InfoRow icon={<Calendar className="h-3.5 w-3.5" />} label="Card Expiry" value={new Date(driver.ghanaCardExpiry).toLocaleDateString()} />
                  )}
                  <InfoRow icon={<Phone className="h-3.5 w-3.5" />} label="Phone" value={driver.phone} />
                  <InfoRow icon={<Mail className="h-3.5 w-3.5" />} label="Email" value={driver.email || 'Not provided'} />
                  <InfoRow icon={<IdCard className="h-3.5 w-3.5" />} label="License #" value={driver.licenseNumber} />
                  <InfoRow icon={<CreditCard className="h-3.5 w-3.5" />} label="License Class" value={driver.licenseClass} />
                  <InfoRow icon={<Calendar className="h-3.5 w-3.5" />} label="License Expiry" value={new Date(driver.licenseExpiry).toLocaleDateString()} warn={new Date(driver.licenseExpiry) < new Date(Date.now() + 30 * 86400000)} />
                  {driver.dateOfBirth && (
                    <InfoRow icon={<Calendar className="h-3.5 w-3.5" />} label="Date of Birth" value={new Date(driver.dateOfBirth).toLocaleDateString()} />
                  )}
                  <InfoRow icon={<Calendar className="h-3.5 w-3.5" />} label="Hire Date" value={new Date(driver.hireDate).toLocaleDateString()} />
                  {driver.address && (
                    <InfoRow icon={<MapPin className="h-3.5 w-3.5" />} label="Address" value={driver.address} />
                  )}
                  {driver.verificationStatus && (
                  <>
                    <Separator className="my-2" />
                    <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Verification Status</p>
                    <div className="flex items-center justify-between py-1">
                      <span className="text-sm text-muted-foreground flex items-center gap-2">
                        <ShieldCheck className="h-3.5 w-3.5" />
                        Status
                      </span>
                      <Badge variant="outline" className={`text-[10px] border-transparent font-medium ${getVerificationBadgeColor(driver.verificationStatus)}`}>
                        {driver.verificationStatus.charAt(0).toUpperCase() + driver.verificationStatus.slice(1)}
                      </Badge>
                    </div>
                  </>
                  )}
                  {driver.verifiedAt && (
                    <InfoRow icon={<Calendar className="h-3.5 w-3.5" />} label="Verified At" value={new Date(driver.verifiedAt).toLocaleDateString()} />
                  )}
                  {driver.verificationNotes && (
                    <InfoRow icon={<FileText className="h-3.5 w-3.5" />} label="Notes" value={driver.verificationNotes} />
                  )}
                  {driver.emergencyName && (
                    <>
                      <Separator className="my-2" />
                      <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Emergency Contact</p>
                      <InfoRow icon={<Phone className="h-3.5 w-3.5" />} label="Name" value={driver.emergencyName} />
                      <InfoRow icon={<Phone className="h-3.5 w-3.5" />} label="Phone" value={driver.emergencyPhone || '-'} />
                    </>
                  )}
                </div>
              </TabsContent>

              <TabsContent value="trips" className="mt-4">
                {(driver.trips?.length ?? 0) === 0 ? (
                  <div className="text-center py-8">
                    <Route className="h-8 w-8 text-muted-foreground mx-auto mb-2" />
                    <p className="text-sm text-muted-foreground">No trips recorded</p>
                  </div>
                ) : (
                  <div className="space-y-2 max-h-[400px] overflow-y-auto">
                    {driver.trips.map((trip) => (
                      <div key={trip.id} className="rounded-lg border p-3">
                        <div className="flex items-center justify-between mb-1">
                          <span className="text-sm font-medium">{trip.tripNumber}</span>
                          <Badge
                            variant="outline"
                            className={`text-[10px] border-transparent font-medium ${
                              TRIP_STATUSES[trip.status as keyof typeof TRIP_STATUSES]?.color || ''
                            }`}
                          >
                            {trip.status.replace(/_/g, ' ')}
                          </Badge>
                        </div>
                        <p className="text-xs font-medium">{trip.loadingLocation} → {trip.destination}</p>
                        <div className="flex items-center gap-3 text-xs text-muted-foreground mt-1">
                          <span className="flex items-center gap-1">
                            <Clock className="h-3 w-3" />
                            {new Date(trip.departureTime).toLocaleDateString()}
                          </span>
                          <span>{trip.itemName} · {trip.quantity} {trip.unit}</span>
                          <span className="ml-auto font-medium text-foreground">
                            {trip.totalRevenue ? `${CURRENCY_SYMBOL}${trip.totalRevenue.toLocaleString()}` : '-'}
                          </span>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </TabsContent>

              <TabsContent value="payroll" className="mt-4">
                {(driver.payroll?.length ?? 0) === 0 ? (
                  <div className="text-center py-8">
                    <Banknote className="h-8 w-8 text-muted-foreground mx-auto mb-2" />
                    <p className="text-sm text-muted-foreground">No payroll records</p>
                  </div>
                ) : (
                  <div className="space-y-2 max-h-[400px] overflow-y-auto">
                    {driver.payroll.map((record) => (
                      <div key={record.id} className="rounded-lg border p-3">
                        <div className="flex items-center justify-between mb-2">
                          <span className="text-sm font-medium">
                            {MONTHS[record.month - 1]} {record.year}
                          </span>
                          <Badge
                            variant="outline"
                            className={`text-[10px] border-transparent font-medium ${
                              PAYROLL_STATUSES[record.status as keyof typeof PAYROLL_STATUSES]?.color || ''
                            }`}
                          >
                            {record.status}
                          </Badge>
                        </div>
                        <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-xs">
                          <div className="flex justify-between">
                            <span className="text-muted-foreground">Base Salary</span>
                            <span>{CURRENCY_SYMBOL}{record.baseSalary.toLocaleString()}</span>
                          </div>
                          <div className="flex justify-between">
                            <span className="text-muted-foreground">Trip Bonus</span>
                            <span className="text-emerald-600">+{CURRENCY_SYMBOL}{record.tripBonus.toLocaleString()}</span>
                          </div>
                          <div className="flex justify-between">
                            <span className="text-muted-foreground">Overtime</span>
                            <span className="text-emerald-600">+{CURRENCY_SYMBOL}{record.overtimePay.toLocaleString()}</span>
                          </div>
                          <div className="flex justify-between">
                            <span className="text-muted-foreground">Deductions</span>
                            <span className="text-red-600">-{CURRENCY_SYMBOL}{record.deductions.toLocaleString()}</span>
                          </div>
                          <Separator className="col-span-2 my-1" />
                          <div className="col-span-2 flex justify-between font-semibold text-sm">
                            <span>Net Pay</span>
                            <span>{CURRENCY_SYMBOL}{record.netPay.toLocaleString()}</span>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </TabsContent>
              <TabsContent value="documents" className="mt-4">
                <div className="space-y-4">
                  <DocumentPreview label="Driver Photo" src={driver.photo} />
                  <DocumentPreview label="Ghana Card (Front)" src={driver.ghanaCardFrontImage} />
                  <DocumentPreview label="Ghana Card (Back)" src={driver.ghanaCardBackImage} />
                  <DocumentPreview label="Driver's License" src={driver.licenseImage} />
                </div>
              </TabsContent>
            </Tabs>
          </>
        ) : null}
      </SheetContent>
    </Sheet>
  )
}

function InfoRow({ icon, label, value, warn }: { icon: React.ReactNode; label: string; value: string; warn?: boolean }) {
  return (
    <div className="flex items-center justify-between py-1">
      <span className="text-sm text-muted-foreground flex items-center gap-2">
        {icon}
        {label}
      </span>
      <span className={`text-sm font-medium ${warn ? 'text-amber-600 dark:text-amber-400 flex items-center gap-1' : ''}`}>
        {warn && <ShieldAlert className="h-3 w-3" />}
        {value}
      </span>
    </div>
  )
}

function getVerificationBadgeColor(status: string): string {
  switch (status) {
    case 'verified': return 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400'
    case 'submitted': return 'bg-sky-100 text-sky-700 dark:bg-sky-900/30 dark:text-sky-400'
    case 'rejected': return 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400'
    default: return 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400'
  }
}

function DocumentPreview({ label, src }: { label: string; src?: string | null }) {
  if (src) {
    return (
      <div className="space-y-1.5">
        <p className="text-xs font-medium text-muted-foreground">{label}</p>
        <img src={src} alt={label} className="h-40 w-full max-w-xs rounded-lg border object-cover" />
      </div>
    )
  }
  return (
    <div className="space-y-1.5">
      <p className="text-xs font-medium text-muted-foreground">{label}</p>
      <div className="h-40 w-full max-w-xs rounded-lg border-2 border-dashed flex flex-col items-center justify-center text-muted-foreground bg-muted/20">
        <ImagePlus className="h-6 w-6 mb-1" />
        <span className="text-xs">Not uploaded</span>
      </div>
    </div>
  )
}
