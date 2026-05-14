'use client'

import * as React from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { Paperclip, Loader2, Camera, Route, Truck, Info, StickyNote } from 'lucide-react'
import {
  Dialog,
  DialogBody,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from '@/components/ui/form'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { SearchableSelect } from '@/components/ui/searchable-select'
import { CURRENCY_SYMBOL } from '@/lib/constants'
import { fetchTrucks, fetchTrips, type Truck, type Trip, type FuelLog, createFuelLog, updateFuelLog, uploadDocument } from '@/lib/api'
import { toast } from 'sonner'
import { ReceiptScanner, type ScannedReceiptData } from '@/components/scanner/ReceiptScanner'

const fuelLogFormSchema = z.object({
  truckId: z.string().min(1, 'Truck is required'),
  tripId: z.string().optional(),
  date: z.string().min(1, 'Date is required'),
  fuelType: z.string().min(1, 'Fuel type is required'),
  odometer: z.coerce.number().positive().optional().or(z.nan()),
  endMileage: z.coerce.number().min(0).optional().or(z.nan()),
  fuelLevelBefore: z.coerce.number().min(0).max(100).optional().or(z.nan()),
  fuelLevelAfter: z.coerce.number().min(0).max(100).optional().or(z.nan()),
  litersFilled: z.coerce.number().min(0.01, 'Liters must be greater than 0'),
  costPerLiter: z.coerce.number().min(0).optional().or(z.nan()),
  totalCost: z.coerce.number().min(0.01, 'Total cost is required'),
  stationName: z.string().optional(),
  receiptNumber: z.string().optional(),
  notes: z.string().optional(),
})

type FuelLogFormValues = z.infer<typeof fuelLogFormSchema>

interface FuelLogFormDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  fuelLog?: FuelLog | null
  onCreated?: () => void
  onUpdated?: () => void
  initialMode?: 'standard' | 'post_trip'
}

type FormMode = 'standard' | 'post_trip'

export function FuelLogFormDialog({
  open,
  onOpenChange,
  fuelLog,
  onCreated,
  onUpdated,
  initialMode = 'standard',
}: FuelLogFormDialogProps) {
  const [submitting, setSubmitting] = React.useState(false)
  const [trucks, setTrucks] = React.useState<Truck[]>([])
  const [trips, setTrips] = React.useState<Trip[]>([])
  const [loadingTrucks, setLoadingTrucks] = React.useState(false)
  const [loadingTrips, setLoadingTrips] = React.useState(false)
  const [uploadingReceipt, setUploadingReceipt] = React.useState(false)
  const [scannerOpen, setScannerOpen] = React.useState(false)

  // Post-trip mode
  const [formMode, setFormMode] = React.useState<FormMode>(fuelLog ? 'standard' : initialMode)
  const [completedTrips, setCompletedTrips] = React.useState<Trip[]>([])
  const [loadingCompletedTrips, setLoadingCompletedTrips] = React.useState(false)
  const [selectedTrip, setSelectedTrip] = React.useState<Trip | null>(null)

  const form = useForm<FuelLogFormValues>({
    resolver: zodResolver(fuelLogFormSchema),
    defaultValues: {
      truckId: '',
      tripId: '',
      date: '',
      fuelType: 'Diesel',
      odometer: '' as unknown as number,
      endMileage: '' as unknown as number,
      fuelLevelBefore: '' as unknown as number,
      fuelLevelAfter: '' as unknown as number,
      litersFilled: '' as unknown as number,
      costPerLiter: '' as unknown as number,
      totalCost: '' as unknown as number,
      stationName: '',
      receiptNumber: '',
      notes: '',
    },
  })

  // Watch for auto-calculation
  const litersFilled = form.watch('litersFilled')
  const totalCost = form.watch('totalCost')
  const costPerLiter = form.watch('costPerLiter')

  React.useEffect(() => {
    if (!open) return

    // Reset form based on create vs edit
    if (fuelLog) {
      form.reset({
        truckId: fuelLog.truckId,
        tripId: fuelLog.tripId || '',
        date: fuelLog.date ? fuelLog.date.split('T')[0] : '',
        fuelType: fuelLog.fuelType || 'Diesel',
        odometer: fuelLog.odometer ?? ('' as unknown as number),
        endMileage: '' as unknown as number,
        fuelLevelBefore: fuelLog.fuelLevelBefore ?? ('' as unknown as number),
        fuelLevelAfter: fuelLog.fuelLevelAfter ?? ('' as unknown as number),
        litersFilled: fuelLog.litersFilled,
        costPerLiter: fuelLog.costPerLiter ?? ('' as unknown as number),
        totalCost: fuelLog.totalCost,
        stationName: fuelLog.stationName || '',
        receiptNumber: fuelLog.receiptNumber || '',
        notes: '',
      })
    } else {
      form.reset({
        truckId: '',
        tripId: '',
        date: new Date().toISOString().split('T')[0],
        fuelType: 'Diesel',
        odometer: '' as unknown as number,
        endMileage: '' as unknown as number,
        fuelLevelBefore: '' as unknown as number,
        fuelLevelAfter: '' as unknown as number,
        litersFilled: '' as unknown as number,
        costPerLiter: '' as unknown as number,
        totalCost: '' as unknown as number,
        stationName: '',
        receiptNumber: '',
        notes: '',
      })
    }

    // Fetch trucks
    setLoadingTrucks(true)
    fetchTrucks({ status: 'active', limit: 100 })
      .then((result) => setTrucks(result.data))
      .catch(() => toast.error('Failed to load trucks'))
      .finally(() => setLoadingTrucks(false))

    // In post-trip mode, fetch completed trips
    if (!fuelLog && initialMode === 'post_trip') {
      setLoadingCompletedTrips(true)
      fetchTrips({ status: 'completed', limit: 50 })
        .then((result) => setCompletedTrips(result.data))
        .catch(() => setCompletedTrips([]))
        .finally(() => setLoadingCompletedTrips(false))
    }
  }, [fuelLog, form, open, initialMode])

  // Handle mode change — switch between standard and post-trip
  function handleModeChange(mode: FormMode) {
    setFormMode(mode)
    setSelectedTrip(null)
    form.reset({
      truckId: '',
      tripId: '',
      date: new Date().toISOString().split('T')[0],
      fuelType: 'Diesel',
      odometer: '' as unknown as number,
      endMileage: '' as unknown as number,
      fuelLevelBefore: '' as unknown as number,
      fuelLevelAfter: '' as unknown as number,
      litersFilled: '' as unknown as number,
      costPerLiter: '' as unknown as number,
      totalCost: '' as unknown as number,
      stationName: '',
      receiptNumber: '',
      notes: '',
    })

    // If switching to post-trip, fetch completed trips
    if (mode === 'post_trip' && completedTrips.length === 0) {
      setLoadingCompletedTrips(true)
      fetchTrips({ status: 'completed', limit: 50 })
        .then((result) => setCompletedTrips(result.data))
        .catch(() => setCompletedTrips([]))
        .finally(() => setLoadingCompletedTrips(false))
    }
  }

  // Handle post-trip trip selection
  function handlePostTripSelect(tripId: string) {
    form.setValue('tripId', tripId)
    form.setValue('truckId', '')
    form.setValue('endMileage', undefined)
    const trip = completedTrips.find(t => t.id === tripId)
    setSelectedTrip(trip || null)
    if (trip) {
      form.setValue('truckId', trip.truckId)
    }
  }

  // Computed distance covered for post-trip mode
  const endMileage = form.watch('endMileage')
  const startMileagePostTrip = (selectedTrip as Record<string, unknown>)?.startMileage as number | undefined
  const distanceCovered = React.useMemo(() => {
    if (formMode !== 'post_trip' || !endMileage || !startMileagePostTrip) return null
    const end = typeof endMileage === 'number' ? endMileage : parseFloat(String(endMileage))
    if (isNaN(end) || end <= 0) return null
    return Math.round((end - startMileagePostTrip) * 10) / 10
  }, [formMode, endMileage, startMileagePostTrip])

  // Fetch trips when truck changes (for standard mode's active trip selector)
  React.useEffect(() => {
    if (!open || formMode !== 'standard') return
    const truckId = fuelLog?.truckId || form.getValues('truckId')
    if (!truckId) {
      setTrips([])
      return
    }
    setLoadingTrips(true)
    fetchTrips({ truckId, status: 'in_transit', limit: 50 })
      .then((result) => setTrips(result.data))
      .catch(() => setTrips([]))
      .finally(() => setLoadingTrips(false))
  }, [open, fuelLog?.truckId, formMode])

  // Handle truck change - refetch trips for the new truck (standard mode)
  const handleTruckChange = React.useCallback((truckId: string) => {
    form.setValue('truckId', truckId)
    form.setValue('tripId', '')
    setTrips([])
    if (!truckId) return
    setLoadingTrips(true)
    fetchTrips({ truckId, status: 'in_transit', limit: 50 })
      .then((result) => setTrips(result.data))
      .catch(() => setTrips([]))
      .finally(() => setLoadingTrips(false))
  }, [form])

  // Auto-calculate costPerLiter when both liters and total are available
  React.useEffect(() => {
    if (litersFilled && litersFilled > 0 && totalCost && totalCost > 0) {
      const calc = totalCost / litersFilled
      if (!costPerLiter || isNaN(costPerLiter)) {
        form.setValue('costPerLiter', parseFloat(calc.toFixed(2)))
      }
    }
  }, [litersFilled, totalCost, costPerLiter, form])

  async function onSubmit(data: FuelLogFormValues) {
    setSubmitting(true)
    try {
      const body: Record<string, unknown> = { ...data }

      // In post-trip mode, calculate distance and endMileage
      if (formMode === 'post_trip' && data.endMileage && startMileagePostTrip) {
        body.distanceCovered = Math.round((data.endMileage - startMileagePostTrip) * 10) / 10
      }

      // Clean up empty/NaN optional fields
      if (!body.tripId) delete body.tripId
      if (!body.odometer || isNaN(body.odometer as number)) delete body.odometer
      if (!body.endMileage || isNaN(body.endMileage as number)) delete body.endMileage
      if (!body.fuelLevelBefore || isNaN(body.fuelLevelBefore as number)) delete body.fuelLevelBefore
      if (!body.fuelLevelAfter || isNaN(body.fuelLevelAfter as number)) delete body.fuelLevelAfter
      if (!body.costPerLiter || isNaN(body.costPerLiter as number)) delete body.costPerLiter
      if (!body.stationName) delete body.stationName
      if (!body.receiptNumber) delete body.receiptNumber
      if (!body.notes) delete body.notes
      if (!body.distanceCovered) delete body.distanceCovered

      if (fuelLog) {
        await updateFuelLog(fuelLog.id, body)
        toast.success('Fuel log updated successfully')
        onUpdated?.()
      } else {
        await createFuelLog(body)
        toast.success('Fuel log added successfully', {
          description: `${data.litersFilled}L ${data.fuelType} - ${CURRENCY_SYMBOL}${data.totalCost.toLocaleString()}`,
        })
        onCreated?.()
      }
      onOpenChange(false)
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to save fuel log')
    } finally {
      setSubmitting(false)
    }
  }

  function handleScanComplete(data: ScannedReceiptData) {
    const updates: Partial<FuelLogFormValues> = {}
    if (data.totalAmount != null) updates.totalCost = data.totalAmount
    if (data.date) updates.date = data.date
    if (data.liters != null) updates.litersFilled = data.liters
    if (data.pricePerLiter != null) updates.costPerLiter = data.pricePerLiter
    if (data.fuelType) updates.fuelType = data.fuelType
    if (data.odometer != null) updates.odometer = data.odometer
    if (data.stationName) updates.stationName = data.stationName
    if (data.reference) updates.receiptNumber = data.reference
    if (data.merchant && !data.stationName) updates.stationName = data.merchant
    // Apply updates to form
    Object.entries(updates).forEach(([key, value]) => {
      if (value !== undefined && value !== null) {
        form.setValue(key as keyof FuelLogFormValues, value as never, { shouldValidate: true })
      }
    })
    toast.success('Fuel receipt scanned! Review the auto-filled data.')
  }

  // Attach receipt handler
  const receiptInputRef = React.useRef<HTMLInputElement>(null)

  async function handleAttachReceipt() {
    const input = receiptInputRef.current
    if (!input) return
    input.click()
    return
  }

  async function handleReceiptFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return

    const allowed = ['image/jpeg', 'image/png', 'image/gif', 'image/webp', 'application/pdf']
    if (!allowed.includes(file.type)) {
      toast.error('Only images and PDF files are supported')
      return
    }
    if (file.size > 10 * 1024 * 1024) {
      toast.error('File too large (max 10MB)')
      return
    }

    setUploadingReceipt(true)
    try {
      const formData = new FormData()
      formData.append('file', file)
      formData.append('title', `Fuel Receipt - ${form.getValues('receiptNumber') || file.name}`)
      formData.append('category', 'receipt')
      formData.append('entityType', 'fuel_log')

      const doc = await uploadDocument(formData)
      toast.success('Receipt attached successfully', {
        description: `${doc.fileName} uploaded`,
      })
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to attach receipt')
    } finally {
      setUploadingReceipt(false)
      // Reset the input so the same file can be selected again
      if (e.target) e.target.value = ''
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-xl">
        <DialogHeader>
          <div className="flex items-center justify-between">
            <div>
              <DialogTitle>{fuelLog ? 'Edit Fuel Log' : formMode === 'post_trip' ? 'Post-Trip Fuel Recording' : 'Record Fuel Fill'}</DialogTitle>
              <DialogDescription>
                {fuelLog
                  ? 'Update the fuel log details below.'
                  : formMode === 'post_trip'
                    ? 'Record fuel usage after completing a trip.'
                    : 'Record a new fuel fill-up for your fleet.'}
              </DialogDescription>
            </div>
            {!fuelLog && formMode === 'standard' && (
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="flex-shrink-0"
                onClick={() => setScannerOpen(true)}
              >
                <Camera className="h-4 w-4 mr-1.5" />
                Scan Receipt
              </Button>
            )}
          </div>
        </DialogHeader>

        <DialogBody>
          {/* Mode toggle (only for new entries) */}
          {!fuelLog && (
            <div className="flex gap-2 mb-4">
              <Button
                type="button"
                variant={formMode === 'standard' ? 'default' : 'outline'}
                size="sm"
                className={formMode === 'standard' ? 'bg-amber-500 hover:bg-amber-600 text-white' : ''}
                onClick={() => handleModeChange('standard')}
              >
                Manual Entry
              </Button>
              <Button
                type="button"
                variant={formMode === 'post_trip' ? 'default' : 'outline'}
                size="sm"
                className={formMode === 'post_trip' ? 'bg-amber-500 hover:bg-amber-600 text-white' : ''}
                onClick={() => handleModeChange('post_trip')}
              >
                Post-Trip Recording
              </Button>
            </div>
          )}

          {/* ── Post-Trip: Trip selector and details ── */}
          {formMode === 'post_trip' && !fuelLog && (
            <div className="space-y-4 rounded-lg border p-4 bg-muted/30 mb-4">
              <FormField
                control={form.control}
                name="tripId"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Select Completed Trip *</FormLabel>
                    <Select onValueChange={(val) => handlePostTripSelect(val)} value={field.value}>
                      <FormControl>
                        <SelectTrigger>
                          <SelectValue placeholder={loadingCompletedTrips ? 'Loading trips...' : 'Select a completed trip'} />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        {completedTrips.length === 0 ? (
                          <SelectItem value="_none" disabled>No completed trips found</SelectItem>
                        ) : (
                          completedTrips.map((trip) => (
                            <SelectItem key={trip.id} value={trip.id}>
                              {trip.tripNumber} — {trip.loadingLocation} → {trip.destination}
                            </SelectItem>
                          ))
                        )}
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )}
              />

              {/* Show trip details when a trip is selected */}
              {selectedTrip && (
                <div className="space-y-3">
                  <div className="flex items-center gap-2 text-xs text-muted-foreground">
                    <Info className="h-3.5 w-3.5" />
                    <span className="font-medium">Trip Details (read-only)</span>
                  </div>
                  <div className="grid grid-cols-2 gap-3 text-xs">
                    <div className="flex items-center gap-1.5">
                      <Route className="h-3.5 w-3.5 text-muted-foreground" />
                      <span className="text-muted-foreground">Trip #:</span>
                      <span className="font-medium">{selectedTrip.tripNumber}</span>
                    </div>
                    <div className="flex items-center gap-1.5">
                      <Truck className="h-3.5 w-3.5 text-muted-foreground" />
                      <span className="text-muted-foreground">Truck Plate:</span>
                      <span className="font-medium">{selectedTrip.truck?.plateNumber || '—'}</span>
                    </div>
                    <div className="flex items-center gap-1.5">
                      <Info className="h-3.5 w-3.5 text-muted-foreground" />
                      <span className="text-muted-foreground">Route:</span>
                      <span className="font-medium">{selectedTrip.loadingLocation} → {selectedTrip.destination}</span>
                    </div>
                    <div className="flex items-center gap-1.5">
                      <Info className="h-3.5 w-3.5 text-muted-foreground" />
                      <span className="text-muted-foreground">Start Mileage:</span>
                      <span className="font-medium">{(selectedTrip as Record<string, unknown>).startMileage != null ? `${Number((selectedTrip as Record<string, unknown>).startMileage).toLocaleString()} km` : '—'}</span>
                    </div>
                  </div>

                  {/* Distance covered calculation */}
                  {distanceCovered !== null && (
                    <div className="rounded-md border border-emerald-200 bg-emerald-50 dark:border-emerald-800 dark:bg-emerald-950/40 p-3">
                      <div className="flex items-center justify-between">
                        <span className="text-xs font-medium text-emerald-700 dark:text-emerald-400">Distance Covered</span>
                        <span className="text-sm font-bold text-emerald-700 dark:text-emerald-400">{distanceCovered.toLocaleString()} km</span>
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>
          )}

          <Form {...form}>
            <form id="fuel-log-form" onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
              {/* Truck selection — hidden in post-trip mode when a trip is selected */}
              {!(formMode === 'post_trip' && selectedTrip) && (
                <FormField
                  control={form.control}
                  name="truckId"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Truck *</FormLabel>
                      <SearchableSelect
                        options={trucks.map(t => ({ value: t.id, label: `${t.plateNumber} (${t.make} ${t.model})` }))}
                        value={field.value}
                        onValueChange={handleTruckChange}
                        placeholder={loadingTrucks ? 'Loading...' : 'Select truck'}
                        disabled={loadingTrucks}
                      />
                      <FormMessage />
                    </FormItem>
                  )}
                />
              )}

              {/* Standard mode: trip selector for active trips */}
              {formMode === 'standard' && (
                <FormField
                  control={form.control}
                  name="tripId"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Trip (optional)</FormLabel>
                      <Select onValueChange={field.onChange} value={field.value}>
                        <FormControl>
                          <SelectTrigger>
                            <SelectValue placeholder={loadingTrips ? 'Loading...' : 'Select active trip'} />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          {trips.length === 0 ? (
                            <SelectItem value="_none" disabled>No active trips</SelectItem>
                          ) : (
                            trips.map((trip) => (
                              <SelectItem key={trip.id} value={trip.id}>
                                {trip.tripNumber} — {trip.loadingLocation} to {trip.destination}
                              </SelectItem>
                            ))
                          )}
                        </SelectContent>
                      </Select>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              )}

              {/* Date & Fuel Type */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <FormField
                  control={form.control}
                  name="date"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Date *</FormLabel>
                      <FormControl>
                        <Input type="date" {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="fuelType"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Fuel Type *</FormLabel>
                      <Select onValueChange={field.onChange} value={field.value} defaultValue="Diesel">
                        <FormControl>
                          <SelectTrigger>
                            <SelectValue placeholder="Select fuel type" />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          <SelectItem value="Diesel">Diesel</SelectItem>
                          <SelectItem value="Petrol">Petrol</SelectItem>
                        </SelectContent>
                      </Select>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>

              {/* Standard mode: Odometer & Fuel Levels */}
              {formMode === 'standard' && (
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                  <FormField
                    control={form.control}
                    name="odometer"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Odometer (km)</FormLabel>
                        <FormControl>
                          <Input
                            type="number"
                            placeholder="e.g., 45000"
                            min="0"
                            {...field}
                            value={field.value ?? ''}
                          />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <FormField
                    control={form.control}
                    name="fuelLevelBefore"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Level Before (%)</FormLabel>
                        <FormControl>
                          <Input
                            type="number"
                            placeholder="e.g., 20"
                            min="0"
                            max="100"
                            {...field}
                            value={field.value ?? ''}
                          />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <FormField
                    control={form.control}
                    name="fuelLevelAfter"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Level After (%)</FormLabel>
                        <FormControl>
                          <Input
                            type="number"
                            placeholder="e.g., 95"
                            min="0"
                            max="100"
                            {...field}
                            value={field.value ?? ''}
                          />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                </div>
              )}

              {/* Liters Filled, Cost/Liter, Total Cost */}
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                <FormField
                  control={form.control}
                  name="litersFilled"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>{formMode === 'post_trip' ? 'Fuel Top Up (L) *' : 'Liters Filled *'}</FormLabel>
                      <FormControl>
                        <Input
                          type="number"
                          placeholder="0.0"
                          min="0"
                          step="0.1"
                          {...field}
                          value={field.value ?? ''}
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="costPerLiter"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Cost/Liter</FormLabel>
                      <FormControl>
                        <div className="relative">
                          <span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm text-muted-foreground">
                            {CURRENCY_SYMBOL}
                          </span>
                          <Input
                            type="number"
                            placeholder="Auto"
                            min="0"
                            step="0.01"
                            className="pl-10"
                            {...field}
                            value={field.value ?? ''}
                          />
                        </div>
                      </FormControl>
                      <p className="text-xs text-muted-foreground mt-1">Auto-calculated if empty</p>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="totalCost"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>{formMode === 'post_trip' ? 'Fuel Cost *' : 'Total Cost *'}</FormLabel>
                      <FormControl>
                        <div className="relative">
                          <span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm text-muted-foreground">
                            {CURRENCY_SYMBOL}
                          </span>
                          <Input
                            type="number"
                            placeholder="0.00"
                            min="0"
                            step="0.01"
                            className="pl-10"
                            {...field}
                            value={field.value ?? ''}
                          />
                        </div>
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>

              {/* Post-trip specific: End Mileage */}
              {formMode === 'post_trip' && (
                <FormField
                  control={form.control}
                  name="endMileage"
                  render={({ field }) => (
                    <FormItem className="sm:max-w-xs">
                      <FormLabel>End Mileage (km) *</FormLabel>
                      <FormControl>
                        <Input
                          type="number"
                          placeholder="e.g., 146000"
                          min="0"
                          {...field}
                          value={field.value ?? ''}
                        />
                      </FormControl>
                      <p className="text-xs text-muted-foreground mt-1">
                        {distanceCovered !== null
                          ? `Distance covered: ${distanceCovered.toLocaleString()} km`
                          : 'Enter end mileage to calculate distance'}
                      </p>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              )}

              {/* Station & Receipt */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <FormField
                  control={form.control}
                  name="stationName"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Station Name</FormLabel>
                      <FormControl>
                        <Input
                          placeholder="e.g., Shell Tema"
                          {...field}
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="receiptNumber"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Receipt #</FormLabel>
                      <div className="flex gap-2">
                        <FormControl className="flex-1">
                          <Input
                            placeholder="Optional receipt number"
                            {...field}
                          />
                        </FormControl>
                        <Button
                          type="button"
                          variant="outline"
                          size="icon"
                          className="shrink-0"
                          onClick={handleAttachReceipt}
                          disabled={uploadingReceipt}
                          title="Attach Receipt"
                        >
                          {uploadingReceipt ? (
                            <Loader2 className="h-4 w-4 animate-spin" />
                          ) : (
                            <Paperclip className="h-4 w-4" />
                          )}
                        </Button>
                        <input
                          ref={receiptInputRef}
                          type="file"
                          accept="image/*,.pdf"
                          className="hidden"
                          onChange={handleReceiptFileChange}
                        />
                      </div>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>

              {/* Notes */}
              <FormField
                control={form.control}
                name="notes"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel className="flex items-center gap-1.5">
                      <StickyNote className="h-3.5 w-3.5" />
                      Notes
                    </FormLabel>
                    <FormControl>
                      <Textarea
                        placeholder={formMode === 'post_trip'
                          ? 'Any additional notes about this trip fuel usage...'
                          : 'Any additional notes...'}
                        rows={2}
                        {...field}
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </form>
          </Form>
        </DialogBody>

        <DialogFooter className="gap-2 sm:gap-0">
          <Button
            type="button"
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={submitting}
          >
            Cancel
          </Button>
          <Button
            type="submit"
            form="fuel-log-form"
            className="bg-amber-500 hover:bg-amber-600 text-white"
            disabled={submitting}
          >
            {submitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            {submitting
              ? 'Saving...'
              : fuelLog
                ? 'Update Fuel Log'
                : formMode === 'post_trip'
                  ? 'Save Post-Trip Record'
                  : 'Record Fuel Fill'}
          </Button>
        </DialogFooter>
      </DialogContent>

      {/* Fuel Receipt Scanner (standard mode only) */}
      {!fuelLog && formMode === 'standard' && (
        <ReceiptScanner
          open={scannerOpen}
          onOpenChange={setScannerOpen}
          scanType="fuel"
          onScanComplete={handleScanComplete}
        />
      )}
    </Dialog>
  )
}
