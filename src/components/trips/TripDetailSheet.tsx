'use client'

import * as React from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { MapPin, Truck, User, Package, Clock, DollarSign, Fuel, Route, ArrowRight, AlertTriangle, ChevronRight, Copy, MessageSquare, Send, Trash2, X, Camera, Users } from 'lucide-react'
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
} from '@/components/ui/sheet'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Separator } from '@/components/ui/separator'
import { Progress } from '@/components/ui/progress'
import { StatusBadge } from '@/components/ui/status-badge'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from '@/components/ui/alert-dialog'
import { CURRENCY_SYMBOL } from '@/lib/constants'
import type { Trip } from '@/lib/api'
import { apiFetch, fetchTripComments, addTripComment, deleteTripComment, type TripComment } from '@/lib/api'
import { useAuthStore, getRoleBadgeColor } from '@/lib/store/auth'
import {
  TRIP_STATUS_META,
  ALL_TRIP_STATUSES,
  getNextStatus,
  getTripProgress,
  isTerminalStatus,
} from '@/lib/trip-lifecycle'
import { toast } from 'sonner'

interface TripDetailSheetProps {
  trip: Trip | null
  open: boolean
  onOpenChange: (open: boolean) => void
  onStatusChanged?: () => void
}

interface FuelLogEntry {
  id: string
  tripId: string
  truckId: string
  date: string
  odometer: number | null
  litersFilled: number
  totalCost: number
  fuelType: string
  stationName: string | null
  endMileage: number | null
  endMileageImage: string | null
  notes: string | null
}

interface TripFull extends Trip {
  startMileage?: number | null
  endMileage?: number | null
  totalMileage?: number | null
  fuelUsed?: number | null
  fuelCost?: number | null
  notes?: string | null
  waybillNumber?: string | null
  startMileageImage?: string | null
  fuelLogs?: FuelLogEntry[]
}

export function TripDetailSheet({ trip, open, onOpenChange, onStatusChanged }: TripDetailSheetProps) {
  const [fullTrip, setFullTrip] = React.useState<TripFull | null>(null)
  const [loading, setLoading] = React.useState(false)
  const [advancing, setAdvancing] = React.useState(false)
  const [previewImage, setPreviewImage] = React.useState<string | null>(null)

  // Comments state
  const [comments, setComments] = React.useState<TripComment[]>([])
  const [commentInput, setCommentInput] = React.useState('')
  const [sendingComment, setSendingComment] = React.useState(false)
  const [loadingComments, setLoadingComments] = React.useState(false)
  const commentsEndRef = React.useRef<HTMLDivElement>(null)
  const authUser = useAuthStore((s) => s.user)
  const canSeeFinancialData = useAuthStore((s) => s.canSeeFinancialData())

  // Fetch full trip details when sheet opens
  React.useEffect(() => {
    if (open && trip) {
      setLoading(true)
      apiFetch<TripFull>(`/api/trips/${trip.id}`)
        .then((data) => setFullTrip(data))
        .catch((err) => console.error('Failed to fetch trip details:', err))
        .finally(() => setLoading(false))

      // Load comments
      setLoadingComments(true)
      fetchTripComments(trip.id)
        .then((data) => setComments(data))
        .catch(() => {})
        .finally(() => setLoadingComments(false))
    }
    if (!open) {
      setFullTrip(null)
      setComments([])
      setCommentInput('')
      setPreviewImage(null)
    }
  }, [open, trip])

  // Auto-scroll to bottom when new comments arrive
  React.useEffect(() => {
    commentsEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [comments])

  const handleAdvanceStatus = async () => {
    if (!trip) return
    setAdvancing(true)
    try {
      const res = await apiFetch<TripFull>(`/api/trips/${trip.id}/advance-status`, {
        method: 'POST',
        body: JSON.stringify({}),
      })
      const updated = res
      setFullTrip(updated)
      toast.success('Trip status advanced', {
        description: `Status updated to ${TRIP_STATUS_META[updated.status]?.label || updated.status}`,
      })
      onStatusChanged?.()
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to advance status')
    } finally {
      setAdvancing(false)
    }
  }

  const handleCancelTrip = async () => {
    if (!trip) return
    try {
      await apiFetch(`/api/trips/${trip.id}`, { method: 'DELETE' })
      toast.success('Trip cancelled')
      onOpenChange(false)
      onStatusChanged?.()
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to cancel trip')
    }
  }

  const handleSendComment = async () => {
    if (!trip || !commentInput.trim() || sendingComment) return
    setSendingComment(true)
    try {
      const newComment = await addTripComment(trip.id, commentInput.trim())
      setComments((prev) => [...prev, newComment])
      setCommentInput('')
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to send comment')
    } finally {
      setSendingComment(false)
    }
  }

  const handleDeleteComment = async (commentId: string) => {
    if (!trip) return
    try {
      await deleteTripComment(trip.id, commentId)
      setComments((prev) => prev.filter((c) => c.id !== commentId))
      toast.success('Comment deleted')
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to delete comment')
    }
  }

  const handleCommentKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      handleSendComment()
    }
  }

  const [duplicating, setDuplicating] = React.useState(false)

  const handleDuplicateTrip = async () => {
    if (!currentTrip) return
    setDuplicating(true)
    try {
      const newTrip = await apiFetch<{ tripNumber: string }>('/api/trips', {
        method: 'POST',
        body: JSON.stringify({
          truckId: currentTrip.truckId,
          driverId: currentTrip.driverId,
          loadingLocation: currentTrip.loadingLocation,
          destination: currentTrip.destination,
          itemName: currentTrip.itemName,
          quantity: currentTrip.quantity,
          unit: currentTrip.unit,
          unitPrice: currentTrip.unitPrice,
          totalRevenue: currentTrip.totalRevenue,
          departureTime: new Date().toISOString(),
          customerName: currentTrip.customerName,
          customerPhone: currentTrip.customerPhone,
          notes: currentTrip.notes ? `[Duplicated from ${currentTrip.tripNumber}]` : undefined,
        }),
      })
      toast.success('Trip duplicated', {
        description: `New trip ${newTrip.tripNumber} created successfully`,
      })
      onStatusChanged?.()
      onOpenChange(false)
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to duplicate trip')
    } finally {
      setDuplicating(false)
    }
  }

  const currentTrip = fullTrip || trip
  if (!currentTrip) return null

  const nextStatus = getNextStatus(currentTrip.status)
  const progress = getTripProgress(currentTrip.status)
  const currentStatusIdx = ALL_TRIP_STATUSES.indexOf(currentTrip.status as typeof ALL_TRIP_STATUSES[number])
  const meta = TRIP_STATUS_META[currentTrip.status]
  const nextMeta = nextStatus ? TRIP_STATUS_META[nextStatus] : null

  const formatDateTime = (dt: string) => {
    try {
      return new Date(dt).toLocaleString('en-GB', {
        day: '2-digit', month: 'short', year: 'numeric',
        hour: '2-digit', minute: '2-digit',
      })
    } catch { return dt }
  }

  const formatTimeAgo = (dt: string) => {
    try {
      const now = Date.now()
      const then = new Date(dt).getTime()
      const diffMs = now - then
      const diffSec = Math.floor(diffMs / 1000)
      if (diffSec < 60) return 'just now'
      const diffMin = Math.floor(diffSec / 60)
      if (diffMin < 60) return `${diffMin}m ago`
      const diffHr = Math.floor(diffMin / 60)
      if (diffHr < 24) return `${diffHr}h ago`
      const diffDay = Math.floor(diffHr / 24)
      if (diffDay < 7) return `${diffDay}d ago`
      return new Date(dt).toLocaleDateString('en-GB', { day: '2-digit', month: 'short' })
    } catch { return '' }
  }

  const getInitials = (name: string) => {
    return name
      .split(' ')
      .map((n) => n[0])
      .join('')
      .toUpperCase()
      .slice(0, 2)
  }

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="sm:max-w-lg">
        {/* Image Preview Overlay */}
        <AnimatePresence>
          {previewImage && (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.15 }}
              className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-4"
              onClick={() => setPreviewImage(null)}
            >
              <button
                onClick={(e) => {
                  e.stopPropagation()
                  setPreviewImage(null)
                }}
                className="absolute top-3 right-3 z-10 flex h-9 w-9 items-center justify-center rounded-full bg-white/10 text-white hover:bg-white/20 transition-colors"
              >
                <X className="h-5 w-5" />
              </button>
              <img
                src={previewImage}
                alt="Preview"
                className="max-h-[85vh] max-w-full rounded-lg object-contain"
                onClick={(e) => e.stopPropagation()}
              />
            </motion.div>
          )}
        </AnimatePresence>
        <SheetHeader className="shrink-0 px-5 sm:px-6 pt-5 sm:pt-5">
          <SheetTitle className="flex items-center gap-2">
            <Route className="h-5 w-5 text-amber-500" />
            {currentTrip.tripNumber}
          </SheetTitle>
          <SheetDescription>Trip details and management</SheetDescription>
        </SheetHeader>

        <AnimatePresence>
          {loading ? (
            <div className="flex items-center justify-center py-12">
              <div className="h-6 w-6 animate-spin rounded-full border-4 border-amber-200 border-t-amber-500" />
            </div>
          ) : (
            <motion.div
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              className="mt-4 sm:mt-6 space-y-5 px-5 sm:px-6 overflow-y-auto flex-1 min-h-0 pb-8 sm:pb-6"
              style={{ WebkitOverflowScrolling: 'touch', overscrollBehavior: 'contain' }}
            >
              {/* Status + Route */}
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <StatusBadge status={currentTrip.status} variant="trip" />
                  {canSeeFinancialData && currentTrip.totalRevenue && (
                    <span className="text-sm font-bold text-emerald-600 dark:text-emerald-400">
                      {CURRENCY_SYMBOL}{currentTrip.totalRevenue.toLocaleString()}
                    </span>
                  )}
                </div>

                {/* Route display */}
                <div className="flex items-center gap-2 p-3 rounded-lg bg-muted/50">
                  <MapPin className="h-4 w-4 text-amber-500 shrink-0" />
                  <div className="flex-1 min-w-0">
                    <div className="text-sm font-medium truncate">{currentTrip.loadingLocation}</div>
                    <div className="flex items-center gap-1 my-0.5">
                      <div className="flex-1 h-px bg-border" />
                      <ArrowRight className="h-3 w-3 text-muted-foreground" />
                      <div className="flex-1 h-px bg-border" />
                    </div>
                    <div className="text-sm font-medium truncate">{currentTrip.destination}</div>
                  </div>
                </div>
              </div>

              {/* Lifecycle Progress */}
              <div className="space-y-2">
                <div className="flex items-center justify-between text-xs text-muted-foreground">
                  <span>Trip Progress</span>
                  <span className="font-medium">{progress}%</span>
                </div>
                <Progress value={progress} className="h-2" />

                {/* Lifecycle Timeline */}
                <div className="flex items-center gap-0.5 mt-3 overflow-x-auto pb-1">
                  {ALL_TRIP_STATUSES.map((stage, idx) => {
                    const stageMeta = TRIP_STATUS_META[stage]
                    const isActive = stage === currentTrip.status
                    const isCompleted = idx < currentStatusIdx || currentTrip.status === 'completed'
                    const isPending = idx > currentStatusIdx && currentTrip.status !== 'completed'

                    return (
                      <div key={stage} className="flex items-center flex-shrink-0">
                        <div className="flex flex-col items-center gap-1">
                          <div
                            className={`w-6 h-6 rounded-full flex items-center justify-center text-[10px] transition-all ${
                              isCompleted
                                ? 'bg-emerald-500 text-white'
                                : isActive
                                  ? 'bg-amber-500 text-white ring-2 ring-amber-200 dark:ring-amber-800'
                                  : 'bg-muted text-muted-foreground'
                            }`}
                          >
                            {stageMeta.icon}
                          </div>
                          <span className="text-[9px] text-muted-foreground whitespace-nowrap max-w-[60px] truncate">
                            {stageMeta.label}
                          </span>
                        </div>
                        {idx < ALL_TRIP_STATUSES.length - 1 && (
                          <div
                            className={`w-3 h-0.5 mb-4 ${
                              idx < currentStatusIdx || currentTrip.status === 'completed'
                                ? 'bg-emerald-500'
                                : 'bg-muted'
                            }`}
                          />
                        )}
                      </div>
                    )
                  })}
                </div>
              </div>

              <Separator />

              {/* Trip Info Grid */}
              <div className="space-y-3">
                <h4 className="text-sm font-semibold text-amber-600 dark:text-amber-400">Trip Information</h4>
                <div className="grid grid-cols-2 gap-3">
                  <InfoItem icon={Truck} label="Truck" value={currentTrip.truck ? `${currentTrip.truck.plateNumber}` : 'Unassigned'} sub={currentTrip.truck ? `${currentTrip.truck.make} ${currentTrip.truck.model}` : undefined} />
                  <InfoItem icon={User} label="Driver" value={currentTrip.driver ? `${currentTrip.driver.firstName} ${currentTrip.driver.lastName}` : 'Unassigned'} />
                  <InfoItem icon={Package} label="Cargo" value={currentTrip.itemName} sub={`${currentTrip.quantity} ${currentTrip.unit}`} />
                  <InfoItem icon={Clock} label="Departure" value={formatDateTime(currentTrip.departureTime)} />
                  {fullTrip?.waybillNumber && (
                    <InfoItem icon={Route} label="Waybill" value={fullTrip.waybillNumber} />
                  )}
                  {currentTrip.customerName && (
                    <InfoItem icon={User} label="Customer" value={currentTrip.customerName} sub={currentTrip.customerPhone || undefined} />
                  )}
                  {fullTrip && (fullTrip as Record<string, unknown>).deliveryType === 'MULTIPLE' && (
                    <InfoItem icon={Users} label="Delivery" value="Multi-Drop" sub={`${((fullTrip as Record<string, unknown>).deliveryDestinations as Record<string, unknown>[])?.length || 0} stops`} />
                  )}
                </div>
              </div>

              {/* Multi-Customer Delivery Destinations */}
              {fullTrip && (fullTrip as Record<string, unknown>).deliveryType === 'MULTIPLE' && (() => {
                const dests = (fullTrip as Record<string, unknown>).deliveryDestinations as Record<string, unknown>[] | undefined
                if (!dests || dests.length === 0) return null
                return (
                  <>
                    <Separator />
                    <div className="space-y-3">
                      <h4 className="text-sm font-semibold text-amber-600 dark:text-amber-400 flex items-center gap-2">
                        <Users className="h-4 w-4" />
                        Delivery Destinations ({dests.length})
                      </h4>
                      <div className="space-y-2">
                        {dests.map((dest, idx) => {
                          const zone = dest.destinationZone as Record<string, unknown> | undefined
                          const zoneCity = zone?.destinationCity as Record<string, unknown> | undefined
                          const destItems = dest.tripItems as Record<string, unknown>[] | undefined
                          const clientName = dest.customerName as string || 'Unknown'
                          const client = dest.client as Record<string, unknown> | undefined
                          return (
                            <div key={dest.id as string} className="rounded-lg border bg-muted/20 p-3 space-y-2">
                              <div className="flex items-center justify-between">
                                <div className="flex items-center gap-2">
                                  <span className="flex items-center justify-center h-6 w-6 rounded-full bg-amber-100 dark:bg-amber-900/40 text-amber-700 dark:text-amber-400 text-xs font-bold">
                                    {idx + 1}
                                  </span>
                                  <span className="text-sm font-medium">{clientName}</span>
                                </div>
                                <span className="text-xs px-2 py-0.5 rounded-full bg-muted text-muted-foreground">
                                  {(dest.status as string) || 'pending'}
                                </span>
                              </div>
                              {zone && (
                                <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                                  <MapPin className="h-3 w-3 shrink-0" />
                                  <span>{zone.name as string}{zoneCity ? `, ${zoneCity.name as string}` : ''}</span>
                                </div>
                              )}
                              {(dest.customerPhone as string) && (
                                <div className="text-xs text-muted-foreground">
                                  Phone: {dest.customerPhone as string}
                                </div>
                              )}
                              {(dest.address as string) && (
                                <div className="text-xs text-muted-foreground">
                                  Address: {dest.address as string}
                                </div>
                              )}
                              {dest.zoneRate != null && Number(dest.zoneRate) > 0 && (
                                <div className="text-xs font-medium text-emerald-600 dark:text-emerald-400">
                                  Zone Rate: {CURRENCY_SYMBOL}{Number(dest.zoneRate).toLocaleString()}
                                </div>
                              )}
                              {dest.actualQty != null && Number(dest.actualQty) > 0 && (
                                <div className="text-xs text-muted-foreground">
                                  Delivered: {Number(dest.actualQty)} units
                                </div>
                              )}
                              {dest.notes && (
                                <div className="text-xs italic text-muted-foreground">
                                  {dest.notes as string}
                                </div>
                              )}
                              {destItems && destItems.length > 0 && (
                                <div className="flex flex-wrap gap-1 mt-1">
                                  {destItems.map((ti) => {
                                    const item = ti.item as Record<string, unknown> | undefined
                                    return (
                                      <span key={ti.id as string} className="inline-flex items-center gap-1 text-xs px-2 py-0.5 rounded-md bg-background border">
                                        <Package className="h-3 w-3 text-muted-foreground" />
                                        {item?.name as string || (ti.itemName as string)}
                                        <span className="text-muted-foreground">({ti.quantity} {ti.unit as string || ''})</span>
                                      </span>
                                    )
                                  })}
                                </div>
                              )}
                            </div>
                          )
                        })}
                      </div>
                    </div>
                  </>
                )
              })()}

              {/* Fuel & Mileage */}
              {fullTrip && (fullTrip.startMileage || fullTrip.endMileage || fullTrip.totalMileage || fullTrip.fuelUsed || fullTrip.fuelCost || fullTrip.startMileageImage) && (
                <>
                  <Separator />
                  <div className="space-y-3">
                    <h4 className="text-sm font-semibold text-amber-600 dark:text-amber-400">Mileage & Uploads</h4>
                    <div className="grid grid-cols-2 gap-3">
                      {fullTrip.startMileage != null && (
                        <InfoItem icon={Route} label="Start Mileage" value={`${fullTrip.startMileage.toLocaleString()} km`} />
                      )}
                      {fullTrip.endMileage != null && (
                        <InfoItem icon={Route} label="End Mileage" value={`${fullTrip.endMileage.toLocaleString()} km`} />
                      )}
                      {fullTrip.totalMileage != null && fullTrip.totalMileage > 0 && (
                        <InfoItem icon={Route} label="Total Distance" value={`${fullTrip.totalMileage.toLocaleString()} km`} />
                      )}
                      {fullTrip.fuelUsed != null && fullTrip.fuelUsed > 0 && (
                        <InfoItem icon={Fuel} label="Fuel Used" value={`${fullTrip.fuelUsed} L`} />
                      )}
                      {canSeeFinancialData && fullTrip.fuelCost != null && fullTrip.fuelCost > 0 && (
                        <InfoItem icon={DollarSign} label="Fuel Cost" value={`${CURRENCY_SYMBOL}${fullTrip.fuelCost.toLocaleString()}`} />
                      )}
                    </div>

                    {/* Start Mileage Photos */}
                    {(() => {
                      const images = parseMileageImages(fullTrip.startMileageImage)
                      return images.length > 0 ? (
                        <div className="space-y-2">
                          <div className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
                            <Camera className="h-3 w-3" />
                            Uploaded Photos ({images.length})
                          </div>
                          <ImageGallery images={images} onPreview={setPreviewImage} />
                        </div>
                      ) : null
                    })()}

                    {/* End Mileage Photos from Fuel Logs */}
                    {(() => {
                      const endImages = (fullTrip.fuelLogs || [])
                        .filter((log) => log.endMileageImage)
                        .flatMap((log) => parseMileageImages(log.endMileageImage))
                      return endImages.length > 0 ? (
                        <div className="space-y-2">
                          <div className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
                            <Camera className="h-3 w-3" />
                            End Mileage Photos ({endImages.length})
                          </div>
                          <ImageGallery images={endImages} onPreview={setPreviewImage} />
                        </div>
                      ) : null
                    })()}
                  </div>
                </>
              )}

              {/* Notes */}
              {fullTrip?.notes && (
                <>
                  <Separator />
                  <div className="space-y-2">
                    <h4 className="text-sm font-semibold text-amber-600 dark:text-amber-400">Notes</h4>
                    <p className="text-sm text-muted-foreground bg-muted/50 rounded-md p-3">{fullTrip.notes}</p>
                  </div>
                </>
              )}

              <Separator />

              {/* Actions */}
              <div className="space-y-3">
                <h4 className="text-sm font-semibold text-amber-600 dark:text-amber-400">Actions</h4>
                <div className="flex flex-col gap-2">
                  <Button
                    variant="outline"
                    onClick={handleDuplicateTrip}
                    disabled={duplicating}
                    className="w-full gap-2"
                  >
                    {duplicating ? (
                      <div className="h-4 w-4 animate-spin rounded-full border-2 border-muted-foreground/30 border-t-muted-foreground" />
                    ) : (
                      <Copy className="h-4 w-4" />
                    )}
                    Duplicate Trip
                  </Button>

                  {!isTerminalStatus(currentTrip.status) && (
                    <>
                    <Button
                      onClick={handleAdvanceStatus}
                      disabled={advancing}
                      className="bg-amber-500 hover:bg-amber-600 text-white w-full"
                    >
                      {advancing ? (
                        <>
                          <div className="h-4 w-4 animate-spin rounded-full border-2 border-white/30 border-t-white mr-2" />
                          Updating...
                        </>
                      ) : (
                        <>
                          <ChevronRight className="h-4 w-4 mr-2" />
                          {nextMeta
                            ? `Advance to ${nextMeta.label}`
                            : 'Complete Trip'}
                        </>
                      )}
                    </Button>

                    <AlertDialog>
                      <AlertDialogTrigger asChild>
                        <Button variant="destructive" className="w-full">
                          <AlertTriangle className="h-4 w-4 mr-2" />
                          Cancel Trip
                        </Button>
                      </AlertDialogTrigger>
                      <AlertDialogContent>
                        <AlertDialogHeader>
                          <AlertDialogTitle>Cancel this trip?</AlertDialogTitle>
                          <AlertDialogDescription>
                            This will mark trip {currentTrip.tripNumber} as cancelled. This action cannot be undone.
                          </AlertDialogDescription>
                        </AlertDialogHeader>
                        <AlertDialogFooter>
                          <AlertDialogCancel>Keep Trip</AlertDialogCancel>
                          <AlertDialogAction onClick={handleCancelTrip} className="bg-red-600 hover:bg-red-700">
                            Cancel Trip
                          </AlertDialogAction>
                        </AlertDialogFooter>
                      </AlertDialogContent>
                    </AlertDialog>
                    </>
                  )}
                </div>
              </div>

              {/* Comments Section */}
              <Separator />
              <div className="space-y-3">
                <h4 className="text-sm font-semibold text-amber-600 dark:text-amber-400 flex items-center gap-1.5">
                  <MessageSquare className="h-4 w-4" />
                  Comments
                  {comments.length > 0 && (
                    <span className="ml-1 text-xs font-normal text-muted-foreground">
                      ({comments.length})
                    </span>
                  )}
                </h4>

                {/* Comments list */}
                <div className="max-h-64 overflow-y-auto space-y-3 pr-1">
                  {loadingComments ? (
                    // Skeleton loading state
                    <>
                      {[1, 2, 3].map((i) => (
                        <div key={i} className="flex gap-2 animate-pulse">
                          <div className="h-7 w-7 rounded-full bg-muted shrink-0" />
                          <div className="flex-1 space-y-1.5">
                            <div className="flex items-center gap-2">
                              <div className="h-3 w-20 rounded bg-muted" />
                              <div className="h-3 w-12 rounded bg-muted" />
                            </div>
                            <div className="h-10 w-3/4 rounded-lg bg-muted" />
                          </div>
                        </div>
                      ))}
                    </>
                  ) : comments.length === 0 ? (
                    <div className="text-center py-8 text-sm text-muted-foreground">
                      <MessageSquare className="h-8 w-8 mx-auto mb-2 opacity-30" />
                      <p className="text-muted-foreground">No comments yet.</p>
                      <p className="text-xs text-muted-foreground/60 mt-0.5">Start the conversation.</p>
                    </div>
                  ) : (
                    <AnimatePresence initial={false}>
                      {comments.map((comment) => {
                        const isOwn = comment.userId === authUser?.id
                        return (
                          <motion.div
                            key={comment.id}
                            initial={{ opacity: 0, y: 8, scale: 0.97 }}
                            animate={{ opacity: 1, y: 0, scale: 1 }}
                            exit={{ opacity: 0, x: isOwn ? 20 : -20 }}
                            transition={{ duration: 0.2 }}
                            className={`group flex gap-2.5 ${isOwn ? 'flex-row-reverse' : ''}`}
                          >
                            {/* Avatar */}
                            <div className="shrink-0 mt-0.5">
                              {comment.user.avatar ? (
                                <img
                                  src={comment.user.avatar}
                                  alt={comment.user.name}
                                  className="h-7 w-7 rounded-full object-cover ring-1 ring-border"
                                />
                              ) : (
                                <div className="h-7 w-7 rounded-full bg-amber-100 dark:bg-amber-900/40 flex items-center justify-center text-[10px] font-bold text-amber-700 dark:text-amber-300 ring-1 ring-amber-200 dark:ring-amber-800">
                                  {getInitials(comment.user.name)}
                                </div>
                              )}
                            </div>

                            {/* Message area */}
                            <div className={`max-w-[78%] ${isOwn ? 'items-end' : 'items-start'}`}>
                              {/* Header: name + role badge + time */}
                              <div className={`flex items-center gap-1.5 mb-0.5 ${isOwn ? 'justify-end' : ''}`}>
                                <span className="text-[11px] font-medium text-foreground/80">
                                  {isOwn ? 'You' : comment.user.name}
                                </span>
                                <Badge
                                  variant="secondary"
                                  className={`h-4 px-1.5 text-[9px] font-medium ${getRoleBadgeColor(comment.user.role)}`}
                                >
                                  {comment.user.role}
                                </Badge>
                                <span className="text-[10px] text-muted-foreground/60">
                                  {formatTimeAgo(comment.createdAt)}
                                </span>
                              </div>

                              {/* Message bubble */}
                              <div className="relative">
                                <div
                                  className={`rounded-2xl px-3 py-1.5 text-sm leading-relaxed whitespace-pre-wrap break-words ${
                                    isOwn
                                      ? 'bg-amber-500 text-white rounded-tr-sm'
                                      : 'bg-muted text-foreground rounded-tl-sm'
                                  }`}
                                >
                                  {comment.message}
                                </div>
                                {/* Delete button for own comments */}
                                {isOwn && (
                                  <button
                                    onClick={() => handleDeleteComment(comment.id)}
                                    className="absolute -top-1.5 right-1 h-5 w-5 rounded-full bg-background border border-border flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity hover:bg-red-50 hover:border-red-200 dark:hover:bg-red-950 dark:hover:border-red-800"
                                    title="Delete comment"
                                  >
                                    <Trash2 className="h-3 w-3 text-muted-foreground hover:text-red-500" />
                                  </button>
                                )}
                              </div>
                            </div>
                          </motion.div>
                        )
                      })}
                    </AnimatePresence>
                  )}
                  <div ref={commentsEndRef} />
                </div>

                {/* Comment input */}
                <div className="flex items-center gap-2">
                  <input
                    type="text"
                    value={commentInput}
                    onChange={(e) => setCommentInput(e.target.value)}
                    onKeyDown={handleCommentKeyDown}
                    placeholder="Add a comment..."
                    maxLength={2000}
                    disabled={sendingComment}
                    className="flex-1 rounded-full border border-input bg-background px-3 py-1.5 text-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-amber-500 disabled:opacity-50"
                  />
                  <Button
                    size="icon"
                    onClick={handleSendComment}
                    disabled={!commentInput.trim() || sendingComment}
                    className="shrink-0 h-8 w-8 rounded-full bg-amber-500 hover:bg-amber-600 text-white"
                  >
                    {sendingComment ? (
                      <div className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-white/30 border-t-white" />
                    ) : (
                      <Send className="h-3.5 w-3.5" />
                    )}
                  </Button>
                </div>
              </div>

              {currentTrip.status === 'completed' && (
                <div className="text-center py-2">
                  <Badge variant="outline" className="bg-emerald-50 text-emerald-700 dark:bg-emerald-900/20 dark:text-emerald-400 border-emerald-200">
                    Trip Completed Successfully
                  </Badge>
                </div>
              )}
            </motion.div>
          )}
        </AnimatePresence>
      </SheetContent>
    </Sheet>
  )
}

function InfoItem({
  icon: Icon,
  label,
  value,
  sub,
}: {
  icon: React.ComponentType<{ className?: string }>
  label: string
  value: string
  sub?: string
}) {
  return (
    <div className="space-y-0.5">
      <div className="flex items-center gap-1 text-xs text-muted-foreground">
        <Icon className="h-3 w-3" />
        {label}
      </div>
      <div className="text-sm font-medium">{value}</div>
      {sub && <div className="text-xs text-muted-foreground">{sub}</div>}
    </div>
  )
}

/** Safely parse a mileage image field — JSON array of URLs or legacy single URL string. */
function parseMileageImages(value: string | null | undefined): string[] {
  if (!value) return []
  try {
    const parsed = JSON.parse(value)
    if (Array.isArray(parsed)) {
      return parsed.filter((item): item is string => typeof item === 'string' && item.length > 0)
    }
    if (typeof parsed === 'string' && parsed.length > 0) {
      return [parsed]
    }
    return []
  } catch {
    // Legacy: single URL stored as plain string (not JSON)
    if (typeof value === 'string' && value.length > 0 && !value.startsWith('[')) {
      return [value]
    }
    return []
  }
}

/** Responsive thumbnail grid for trip/fuel log images. */
function ImageGallery({
  images,
  onPreview,
}: {
  images: string[]
  onPreview: (url: string) => void
}) {
  if (images.length === 0) {
    return (
      <p className="text-xs text-muted-foreground/60 italic">No photos</p>
    )
  }

  return (
    <div className="grid grid-cols-3 gap-2">
      {images.map((url, idx) => (
        <button
          key={`${url}-${idx}`}
          onClick={() => onPreview(url)}
          className="group relative aspect-square overflow-hidden rounded-lg border border-border/50 bg-muted/30 transition-all hover:border-amber-300 hover:ring-2 hover:ring-amber-200 dark:hover:border-amber-700 dark:hover:ring-amber-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-500"
        >
          <img
            src={url}
            alt={`Mileage photo ${idx + 1}`}
            className="h-full w-full object-cover transition-transform group-hover:scale-105"
          />
          <div className="absolute inset-0 flex items-center justify-center bg-black/0 transition-colors group-hover:bg-black/10">
            <Camera className="h-5 w-5 text-white opacity-0 drop-shadow-md transition-opacity group-hover:opacity-80" />
          </div>
        </button>
      ))}
    </div>
  )
}
