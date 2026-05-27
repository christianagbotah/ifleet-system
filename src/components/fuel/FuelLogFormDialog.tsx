'use client'

import * as React from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { Paperclip, Loader2, Camera, Route, Truck, Info, StickyNote, Upload, AlertCircle, CheckCircle2, X } from 'lucide-react'
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
import { DatePicker } from '@/components/ui/date-picker'
import { fetchTrucks, fetchTrips, type Truck, type Trip, type FuelLog, createFuelLog, updateFuelLog, uploadDocument, uploadFiles } from '@/lib/api'
import { toast } from 'sonner'
import { ReceiptScanner, type ScannedReceiptData } from '@/components/scanner/ReceiptScanner'

// Helper: treat empty string / NaN as undefined for optional number fields
const optionalNum = z.preprocess(
  (v) => (v === '' || v === undefined || v === null || (typeof v === 'number' && isNaN(v)) ? undefined : Number(v)),
  z.number().optional()
)

const fuelLogFormSchema = z.object({
  truckId: z.string().min(1, 'Truck is required'),
  tripId: z.string().optional(),
  date: z.string().min(1, 'Date is required'),
  fuelType: z.string().min(1, 'Fuel type is required'),
  odometer: optionalNum,
  endMileage: optionalNum,
  fuelLevelBefore: optionalNum,
  fuelLevelAfter: optionalNum,
  litersFilled: optionalNum,
  costPerLiter: z.preprocess(
    (v) => (v === '' || v === undefined || v === null ? undefined : Number(v)),
    z.number().min(0.01, 'Cost per liter is required')
  ),
  totalCost: z.preprocess(
    (v) => (v === '' || v === undefined || v === null ? undefined : Number(v)),
    z.number().min(0.01, 'Fuel cost is required')
  ),
  stationName: z.string().optional(),
  receiptNumber: z.string().optional(),
  notes: z.string().optional(),
})

type FuelLogFormValues = z.infer<typeof fuelLogFormSchema>

// ============ Image Upload State ============

interface ImageFile {
  file?: File
  url: string       // blob URL for preview (local) or server URL (existing)
  isUploaded: boolean // whether this is an already-uploaded image
  uploadError?: string
  uploading?: boolean
}

function ImageUploadArea({
  images,
  onImagesChange,
  disabled,
}: {
  images: ImageFile[]
  onImagesChange: (imgs: ImageFile[]) => void
  disabled?: boolean
}) {
  const fileInputRef = React.useRef<HTMLInputElement>(null)
  const [uploading, setUploading] = React.useState(false)
  const [dragOver, setDragOver] = React.useState(false)

  const uploadPendingImages = React.useCallback(async (currentImages: ImageFile[]) => {
    const pending = currentImages.filter(img => !img.isUploaded && !img.uploadError && img.file)
    if (pending.length === 0) return currentImages

    setUploading(true)
    const updated = currentImages.map(img =>
      !img.isUploaded && !img.uploadError && img.file
        ? { ...img, uploading: true, uploadError: undefined }
        : img
    )
    onImagesChange(updated)

    try {
      const uploadedUrls = await uploadFiles(pending.map(img => img.file!))
      const result = [...updated]
      let urlIndex = 0
      for (let i = 0; i < result.length; i++) {
        if (!result[i].isUploaded && result[i].uploading && result[i].file) {
          URL.revokeObjectURL(result[i].url)
          result[i] = {
            url: uploadedUrls[urlIndex],
            isUploaded: true,
            uploading: false,
          }
          urlIndex++
        }
      }
      onImagesChange(result)
      toast.success(`${uploadedUrls.length} image(s) uploaded successfully`)
      return result
    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : 'Upload failed'
      const failed = updated.map(img =>
        img.uploading
          ? { ...img, uploading: false, uploadError: errorMsg }
          : img
      )
      onImagesChange(failed)
      toast.error(errorMsg)
      return failed
    } finally {
      setUploading(false)
    }
  }, [onImagesChange])

  const handleFiles = React.useCallback(async (files: FileList | null) => {
    if (!files || files.length === 0 || disabled) return

    const newImages: ImageFile[] = [...images]
    for (let i = 0; i < files.length; i++) {
      const file = files[i]
      if (!file.type.startsWith('image/')) {
        toast.error(`"${file.name}" is not an image file`)
        continue
      }
      if (file.size > 5 * 1024 * 1024) {
        toast.error(`"${file.name}" exceeds 5MB limit`)
        continue
      }
      newImages.push({
        file,
        url: URL.createObjectURL(file),
        isUploaded: false,
      })
    }
    if (newImages.length !== images.length) {
      onImagesChange(newImages)
      setTimeout(() => uploadPendingImages(newImages), 100)
    }
    if (fileInputRef.current) fileInputRef.current.value = ''
  }, [images, onImagesChange, disabled, uploadPendingImages])

  const handleRetry = React.useCallback(async () => {
    const cleared = images.map(img =>
      img.uploadError ? { ...img, uploadError: undefined } : img
    )
    onImagesChange(cleared)
    setTimeout(() => uploadPendingImages(cleared), 100)
  }, [images, onImagesChange, uploadPendingImages])

  const removeImage = React.useCallback((index: number) => {
    const updated = [...images]
    if (!updated[index].isUploaded) {
      URL.revokeObjectURL(updated[index].url)
    }
    updated.splice(index, 1)
    onImagesChange(updated)
  }, [images, onImagesChange])

  const handleDrop = React.useCallback((e: React.DragEvent) => {
    e.preventDefault()
    setDragOver(false)
    handleFiles(e.dataTransfer.files)
  }, [handleFiles])

  const pendingCount = images.filter(img => !img.isUploaded && !img.uploadError).length
  const failedCount = images.filter(img => img.uploadError).length
  const isUploading = uploading || images.some(img => img.uploading)

  return (
    <div className="space-y-3">
      <div
        className={`
          relative flex flex-col items-center justify-center gap-2 rounded-lg border-2 border-dashed p-4
          transition-colors cursor-pointer min-h-[100px]
          ${dragOver ? 'border-amber-500 bg-amber-50 dark:bg-amber-950/20' : 'border-muted-foreground/25 hover:border-muted-foreground/50'}
          ${disabled || isUploading ? 'opacity-50 cursor-not-allowed' : ''}
        `}
        onClick={() => !disabled && !isUploading && fileInputRef.current?.click()}
        onDragOver={(e) => { e.preventDefault(); if (!disabled) setDragOver(true) }}
        onDragLeave={() => setDragOver(false)}
        onDrop={handleDrop}
      >
        <Upload className="h-6 w-6 text-muted-foreground" />
        <p className="text-sm text-muted-foreground text-center">
          Click to upload or drag & drop
        </p>
        <p className="text-xs text-muted-foreground/70">Receipts, fuel logs, mileage photos — max 5MB each</p>
        <input
          ref={fileInputRef}
          type="file"
          accept="image/jpeg,image/png,image/webp"
          multiple
          className="hidden"
          onChange={(e) => handleFiles(e.target.files)}
          disabled={disabled || isUploading}
        />
      </div>

      {failedCount > 0 && !isUploading && (
        <Button
          type="button"
          variant="destructive"
          size="sm"
          className="w-full"
          onClick={handleRetry}
        >
          <AlertCircle className="h-4 w-4 mr-2" />
          Retry {failedCount} failed image(s)
        </Button>
      )}

      {isUploading && (
        <div className="flex items-center justify-center gap-2 py-1">
          <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
          <span className="text-sm text-muted-foreground">Uploading image{pendingCount > 1 ? 's' : ''}...</span>
        </div>
      )}

      {images.length > 0 && (
        <div className="grid grid-cols-3 sm:grid-cols-4 gap-2">
          {images.map((img, idx) => (
            <div key={img.url} className="relative group rounded-md overflow-hidden border bg-muted aspect-square">
              <img
                src={img.url}
                alt={`Image ${idx + 1}`}
                className="h-full w-full object-cover"
              />
              {img.uploading && (
                <div className="absolute inset-0 bg-black/40 flex items-center justify-center">
                  <Loader2 className="h-6 w-6 text-white animate-spin" />
                </div>
              )}
              {img.uploadError && !img.uploading && (
                <>
                  <div className="absolute inset-0 bg-red-500/30 flex items-center justify-center">
                    <AlertCircle className="h-6 w-6 text-white" />
                  </div>
                  <div className="absolute bottom-0 left-0 right-0 bg-red-600 text-white text-[10px] text-center py-0.5 font-medium truncate px-1">
                    Failed
                  </div>
                </>
              )}
              {img.isUploaded && (
                <div className="absolute top-1 left-1">
                  <CheckCircle2 className="h-4 w-4 text-emerald-500 drop-shadow" />
                </div>
              )}
              {!img.isUploaded && !img.uploadError && !img.uploading && (
                <div className="absolute top-0 left-0 right-0 bg-amber-500 text-white text-[10px] text-center py-0.5 font-medium">
                  Pending
                </div>
              )}
              <button
                type="button"
                onClick={(e) => { e.stopPropagation(); removeImage(idx) }}
                className="absolute top-1 right-1 h-5 w-5 rounded-full bg-black/60 text-white flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity hover:bg-red-600"
                disabled={disabled || isUploading}
              >
                <X className="h-3 w-3" />
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

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

  // Image upload state for receipts, fuel & mileage photos
  const [fuelImages, setFuelImages] = React.useState<ImageFile[]>([])

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
      odometer: undefined,
      endMileage: undefined,
      fuelLevelBefore: undefined,
      fuelLevelAfter: undefined,
      litersFilled: undefined,
      costPerLiter: undefined,
      totalCost: undefined,
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

    // Reset/populate images
    if (fuelLog && (fuelLog as Record<string, unknown>).images) {
      try {
        const parsed = JSON.parse(String((fuelLog as Record<string, unknown>).images))
        if (Array.isArray(parsed)) {
          setFuelImages(parsed.map((url: string) => ({ url, isUploaded: true })))
        }
      } catch {
        setFuelImages([])
      }
    } else {
      setFuelImages([])
    }

    // Reset form based on create vs edit
    if (fuelLog) {
      form.reset({
        truckId: fuelLog.truckId,
        tripId: fuelLog.tripId || '',
        date: fuelLog.date ? fuelLog.date.split('T')[0] : '',
        fuelType: fuelLog.fuelType || 'Diesel',
        odometer: fuelLog.odometer,
        endMileage: undefined,
        fuelLevelBefore: fuelLog.fuelLevelBefore,
        fuelLevelAfter: fuelLog.fuelLevelAfter,
        litersFilled: fuelLog.litersFilled,
        costPerLiter: fuelLog.costPerLiter,
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
        odometer: undefined,
        endMileage: undefined,
        fuelLevelBefore: undefined,
        fuelLevelAfter: undefined,
        litersFilled: undefined,
        costPerLiter: undefined,
        totalCost: undefined,
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
      odometer: undefined,
      endMileage: undefined,
      fuelLevelBefore: undefined,
      fuelLevelAfter: undefined,
      litersFilled: undefined,
      costPerLiter: undefined,
      totalCost: undefined,
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

  // Auto-calculate litersFilled from totalCost / costPerLiter
  React.useEffect(() => {
    if (totalCost && totalCost > 0 && costPerLiter && costPerLiter > 0) {
      const calc = totalCost / costPerLiter
      form.setValue('litersFilled', parseFloat(calc.toFixed(2)))
    }
  }, [totalCost, costPerLiter, form])

  async function onSubmit(data: FuelLogFormValues) {
    setSubmitting(true)
    try {
      const body: Record<string, unknown> = { ...data }

      // In post-trip mode, calculate distance and endMileage
      if (formMode === 'post_trip' && data.endMileage && startMileagePostTrip) {
        body.distanceCovered = Math.round((data.endMileage - startMileagePostTrip) * 10) / 10
      }

      // Ensure litersFilled is calculated from totalCost / costPerLiter
      if (data.totalCost && data.costPerLiter && data.costPerLiter > 0) {
        body.litersFilled = parseFloat((data.totalCost / data.costPerLiter).toFixed(2))
      }
      // Clean up empty/NaN optional fields
      if (!body.tripId) delete body.tripId
      if (!body.odometer || isNaN(body.odometer as number)) delete body.odometer
      if (!body.endMileage || isNaN(body.endMileage as number)) delete body.endMileage
      if (!body.fuelLevelBefore || isNaN(body.fuelLevelBefore as number)) delete body.fuelLevelBefore
      if (!body.fuelLevelAfter || isNaN(body.fuelLevelAfter as number)) delete body.fuelLevelAfter
      if (!body.litersFilled || isNaN(body.litersFilled as number)) delete body.litersFilled
      if (!body.stationName) delete body.stationName
      if (!body.receiptNumber) delete body.receiptNumber
      if (!body.notes) delete body.notes
      if (!body.distanceCovered) delete body.distanceCovered

      // Store uploaded image URLs as JSON array
      const uploadedImageUrls = fuelImages.filter(img => img.isUploaded).map(img => img.url)
      if (uploadedImageUrls.length > 0) {
        body.images = JSON.stringify(uploadedImageUrls)
      } else {
        body.images = null
      }

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

        <Form {...form}>
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
                    <SearchableSelect
                      options={completedTrips.map(t => ({
                        value: t.id,
                        label: `${t.tripNumber} — ${t.loadingLocation} → ${t.destination}`,
                      }))}
                      value={field.value}
                      onValueChange={(val) => handlePostTripSelect(val)}
                      placeholder={loadingCompletedTrips ? 'Loading trips...' : 'Search or select a completed trip'}
                      searchPlaceholder="Search by trip #, location, destination..."
                      emptyMessage="No matching trips found."
                      disabled={loadingCompletedTrips}
                    />
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

            <div className="space-y-4">
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

              {/* Date, Fuel Type & End Mileage (post-trip) */}
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                <FormField
                  control={form.control}
                  name="date"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Date *</FormLabel>
                      <FormControl>
                        <DatePicker
                          value={field.value}
                          onChange={(val) => field.onChange(val)}
                          placeholder="Select date"
                        />
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
                {formMode === 'post_trip' && (
                  <FormField
                    control={form.control}
                    name="endMileage"
                    render={({ field }) => (
                      <FormItem>
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
                            ? `Distance: ${distanceCovered.toLocaleString()} km`
                            : 'Enter to calculate distance'}
                        </p>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                )}
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

              {/* Fuel Cost, Cost/Liter, Fuel Top Up (auto-calculated) */}
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                <FormField
                  control={form.control}
                  name="totalCost"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>{formMode === 'post_trip' ? 'Fuel Cost *' : 'Total Cost *'}</FormLabel>
                      <FormControl>
                        <div className="relative flex items-center">
                          <span className="absolute left-3 text-sm text-muted-foreground pointer-events-none">
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
                <FormField
                  control={form.control}
                  name="costPerLiter"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Cost/Liter *</FormLabel>
                      <FormControl>
                        <div className="relative flex items-center">
                          <span className="absolute left-3 text-sm text-muted-foreground pointer-events-none">
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
                <FormField
                  control={form.control}
                  name="litersFilled"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>{formMode === 'post_trip' ? 'Fuel Top Up (L)' : 'Liters Filled'}</FormLabel>
                      <FormControl>
                        <Input
                          type="number"
                          placeholder="Auto"
                          min="0"
                          step="0.1"
                          readOnly
                          className="bg-muted cursor-not-allowed"
                          {...field}
                          value={field.value ?? ''}
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>

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

              {/* Photos & Receipts */}
              <div className="space-y-2">
                <FormLabel className="flex items-center gap-1.5 text-sm font-medium">
                  <Camera className="h-3.5 w-3.5" />
                  Photos & Receipts
                </FormLabel>
                <p className="text-xs text-muted-foreground">
                  Upload fuel receipts, mileage logs, and other supporting photos
                </p>
                <ImageUploadArea
                  images={fuelImages}
                  onImagesChange={setFuelImages}
                  disabled={submitting}
                />
              </div>
            </div>
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
            type="button"
            className="bg-amber-500 hover:bg-amber-600 text-white"
            disabled={submitting}
            onClick={() => {
              // Trigger validation manually
              const result = form.handleSubmit(onSubmit)
              result()
            }}
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
        </Form>
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
