'use client'

import * as React from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
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
import { Separator } from '@/components/ui/separator'
import { CURRENCY_SYMBOL } from '@/lib/constants'
import { apiFetch, uploadFiles, createTrip, updateTrip, fetchTrucks, fetchDrivers, type Truck, type Driver, type Trip } from '@/lib/api'
import { useAuthStore } from '@/lib/store/auth'
import { toast } from 'sonner'
import { X, Upload, Loader2, Plus, AlertCircle, User } from 'lucide-react'

// ============ Image Upload State ============

interface ImageFile {
  file?: File
  url: string       // blob URL for preview (local) or server URL (existing)
  isUploaded: boolean // whether this is an already-uploaded image
}

const tripFormSchema = z.object({
  truckId: z.string().min(1, 'Truck is required'),
  driverId: z.string().min(1, 'Driver is required'),
  // loadingLocation and destination are auto-filled behind the scenes — no schema validation
  loadingLocation: z.string().optional(),
  destination: z.string().optional(),
  departureTime: z.string().min(1, 'Departure time is required'),
  // Cargo
  itemId: z.string().optional(),
  itemName: z.string().optional(),
  quantity: z.coerce.number().optional(),
  unit: z.string().default('bags'),
  unitPrice: z.coerce.number().optional(),
  // Customer
  clientId: z.string().optional(),
  customerName: z.string().optional(),
  customerPhone: z.string().optional(),
  waybillNumber: z.string().optional(),
  // Mileage & Delivery
  startMileage: z.coerce.number().min(0, 'Start mileage is required'),
  startMileageImage: z.string().optional(),
  deliveryType: z.string().optional(),
  // Location Refs
  loadingCityId: z.string().optional(),
  loadingPointId: z.string().optional(),
  destinationCityId: z.string().optional(),
  destinationZoneId: z.string().optional(),
  // Financial
  totalRevenue: z.coerce.number().optional(),
  fuelCost: z.coerce.number().optional(),
  endMileage: z.coerce.number().optional(),
  fuelUsed: z.coerce.number().optional(),
  notes: z.string().optional(),
})

type TripFormValues = z.infer<typeof tripFormSchema>

interface ItemOption {
  id: string
  name: string
  unit: string
}

interface ClientZone {
  destinationZoneId: string
  zoneName: string
  cityName: string
  destinationCityId?: string
  cityRegion?: string
  branchName?: string
  isPrimary: boolean
}

interface ClientOption {
  id: string
  companyName: string
  phone: string
  zones?: ClientZone[]
}

interface CityOption {
  id: string
  name: string
  region: string
}

interface LoadingPointOption {
  id: string
  name: string
}

interface ZoneOption {
  id: string
  name: string
  destinationCityId: string
}

interface CargoItemRow {
  id: string              // client-side temp ID
  itemId: string
  itemName: string
  unit: string
  quantity: number
  rate: number
  total: number
  deliveryDestinationId: string  // _tempId from DeliveryDestinationRow (for MULTIPLE trips)
}

interface DeliveryDestinationRow {
  _tempId: string          // client-side temp ID for linking to tripItems
  clientId: string
  customerName: string
  customerPhone: string
  destinationZoneId: string
  zoneRate: number | null
  address: string
  notes: string
}

interface TripFormDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  onCreated?: () => void
  onUpdated?: () => void
  trip?: Trip | null
}

// ============ Image Upload Component (inline) ============

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
    onImagesChange(newImages)
  }, [images, onImagesChange, disabled])

  const handleUpload = React.useCallback(async () => {
    const pending = images.filter(img => !img.isUploaded && img.file)
    if (pending.length === 0) return

    setUploading(true)
    try {
      const uploadedUrls = await uploadFiles(pending.map(img => img.file!))
      // Replace blob URLs with server URLs
      const updated = [...images]
      let urlIndex = 0
      for (let i = 0; i < updated.length; i++) {
        if (!updated[i].isUploaded && updated[i].file) {
          // Revoke old blob URL
          URL.revokeObjectURL(updated[i].url)
          updated[i] = {
            url: uploadedUrls[urlIndex],
            isUploaded: true,
          }
          urlIndex++
        }
      }
      onImagesChange(updated)
      toast.success(`${uploadedUrls.length} image(s) uploaded`)
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Upload failed')
    } finally {
      setUploading(false)
    }
  }, [images, onImagesChange])

  const removeImage = React.useCallback((index: number) => {
    const updated = [...images]
    URL.revokeObjectURL(updated[index].url)
    updated.splice(index, 1)
    onImagesChange(updated)
  }, [images, onImagesChange])

  const handleDrop = React.useCallback((e: React.DragEvent) => {
    e.preventDefault()
    setDragOver(false)
    handleFiles(e.dataTransfer.files)
  }, [handleFiles])

  return (
    <div className="space-y-3">
      {/* Drop zone */}
      <div
        className={`
          relative flex flex-col items-center justify-center gap-2 rounded-lg border-2 border-dashed p-4
          transition-colors cursor-pointer min-h-[100px]
          ${dragOver ? 'border-amber-500 bg-amber-50 dark:bg-amber-950/20' : 'border-muted-foreground/25 hover:border-muted-foreground/50'}
          ${disabled || uploading ? 'opacity-50 cursor-not-allowed' : ''}
        `}
        onClick={() => !disabled && !uploading && fileInputRef.current?.click()}
        onDragOver={(e) => { e.preventDefault(); if (!disabled) setDragOver(true) }}
        onDragLeave={() => setDragOver(false)}
        onDrop={handleDrop}
      >
        <Upload className="h-6 w-6 text-muted-foreground" />
        <p className="text-sm text-muted-foreground text-center">
          Click to upload or drag & drop
        </p>
        <p className="text-xs text-muted-foreground/70">JPEG, PNG, WebP — max 5MB each</p>
        <input
          ref={fileInputRef}
          type="file"
          accept="image/jpeg,image/png,image/webp"
          multiple
          className="hidden"
          onChange={(e) => handleFiles(e.target.files)}
          disabled={disabled || uploading}
        />
      </div>

      {/* Upload pending button */}
      {images.some(img => !img.isUploaded) && (
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="w-full"
          onClick={handleUpload}
          disabled={uploading}
        >
          {uploading ? (
            <>
              <Loader2 className="h-4 w-4 mr-2 animate-spin" />
              Uploading...
            </>
          ) : (
            <>
              <Upload className="h-4 w-4 mr-2" />
              Upload {images.filter(img => !img.isUploaded).length} pending image(s)
            </>
          )}
        </Button>
      )}

      {/* Preview grid */}
      {images.length > 0 && (
        <div className="grid grid-cols-3 sm:grid-cols-4 gap-2">
          {images.map((img, idx) => (
            <div key={img.url} className="relative group rounded-md overflow-hidden border bg-muted aspect-square">
              <img
                src={img.url}
                alt={`Mileage image ${idx + 1}`}
                className="h-full w-full object-cover"
              />
              {!img.isUploaded && (
                <div className="absolute top-0 left-0 right-0 bg-amber-500 text-white text-[10px] text-center py-0.5 font-medium">
                  Pending
                </div>
              )}
              <button
                type="button"
                onClick={(e) => { e.stopPropagation(); removeImage(idx) }}
                className="absolute top-1 right-1 h-5 w-5 rounded-full bg-black/60 text-white flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity hover:bg-red-600"
                disabled={disabled || uploading}
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

// ============ Main Form Dialog ============

export function TripFormDialog({ open, onOpenChange, onCreated, onUpdated, trip }: TripFormDialogProps) {
  const [submitting, setSubmitting] = React.useState(false)
  const [trucks, setTrucks] = React.useState<Truck[]>([])
  const [drivers, setDrivers] = React.useState<Driver[]>([])
  const [items, setItems] = React.useState<ItemOption[]>([])
  const [clients, setClients] = React.useState<ClientOption[]>([])
  const [loadingOptions, setLoadingOptions] = React.useState(false)

  // Cascading dropdown states
  const [loadingCities, setLoadingCities] = React.useState<CityOption[]>([])
  const [loadingPoints, setLoadingPoints] = React.useState<LoadingPointOption[]>([])
  const [loadingPointsLoading, setLoadingPointsLoading] = React.useState(false)
  const [destinationCities, setDestinationCities] = React.useState<CityOption[]>([])
  const [destinationZones, setDestinationZones] = React.useState<ZoneOption[]>([])
  const [destinationZonesLoading, setDestinationZonesLoading] = React.useState(false)
  const [zoneRate, setZoneRate] = React.useState<number | null>(null)
  const [zoneRateLoading, setZoneRateLoading] = React.useState(false)

  // Image upload state for start mileage
  const [mileageImages, setMileageImages] = React.useState<ImageFile[]>([])

  // Cargo items state (flat list)
  const [cargoItems, setCargoItems] = React.useState<CargoItemRow[]>([])
  const [deliveryDestinations, setDeliveryDestinations] = React.useState<DeliveryDestinationRow[]>([])

  const form = useForm<TripFormValues>({
    resolver: zodResolver(tripFormSchema),
    defaultValues: {
      truckId: '',
      driverId: '',
      loadingLocation: '',
      destination: '',
      departureTime: '',
      itemId: '',
      itemName: '',
      quantity: '' as unknown as number,
      unit: 'bags',
      unitPrice: '' as unknown as number,
      clientId: '',
      customerName: '',
      customerPhone: '',
      waybillNumber: '',
      startMileage: '' as unknown as number,
      startMileageImage: '',
      deliveryType: 'SINGLE',
      loadingCityId: '',
      loadingPointId: '',
      destinationCityId: '',
      destinationZoneId: '',
      totalRevenue: '' as unknown as number,
      fuelCost: '' as unknown as number,
      endMileage: '' as unknown as number,
      fuelUsed: '' as unknown as number,
      notes: '',
    },
  })

  // Load trucks, drivers, items, clients when dialog opens
  React.useEffect(() => {
    if (open) {
      if (trip) {
        // Parse existing startMileageImage as JSON array of URLs
        let existingImageUrls: string[] = []
        try {
          const parsed = JSON.parse(trip.startMileageImage || '[]')
          if (Array.isArray(parsed)) {
            existingImageUrls = parsed
          } else if (typeof parsed === 'string' && parsed) {
            existingImageUrls = [parsed]
          }
        } catch {
          // If it's a plain string URL (legacy), treat as single image
          if (trip.startMileageImage && trip.startMileageImage.startsWith('/')) {
            existingImageUrls = [trip.startMileageImage]
          }
        }
        setMileageImages(
          existingImageUrls.map(url => ({ url, isUploaded: true }))
        )

        form.reset({
          truckId: trip.truckId,
          driverId: trip.driverId,
          loadingLocation: trip.loadingLocation,
          destination: trip.destination,
          departureTime: trip.departureTime ? trip.departureTime.slice(0, 16) : '',
          itemId: (trip as Record<string, unknown>).itemId || '',
          itemName: trip.itemName,
          quantity: trip.quantity,
          unit: trip.unit,
          unitPrice: trip.unitPrice ?? ('' as unknown as number),
          clientId: (trip as Record<string, unknown>).clientId || '',
          customerName: trip.customerName || '',
          customerPhone: trip.customerPhone || '',
          waybillNumber: trip.waybillNumber || '',
          totalRevenue: trip.totalRevenue ?? ('' as unknown as number),
          fuelCost: '' as unknown as number,
          startMileage: '' as unknown as number,
          endMileage: '' as unknown as number,
          fuelUsed: '' as unknown as number,
          notes: '',
          deliveryType: (trip as Record<string, unknown>).deliveryType || 'SINGLE',
          loadingCityId: (trip as Record<string, unknown>).loadingCityId || '',
          loadingPointId: (trip as Record<string, unknown>).loadingPointId || '',
          destinationCityId: (trip as Record<string, unknown>).destinationCityId || '',
          destinationZoneId: (trip as Record<string, unknown>).destinationZoneId || '',
          startMileageImage: trip.startMileageImage || '',
        })
      } else {
        setMileageImages([])
        form.reset({
          truckId: '',
          driverId: '',
          loadingLocation: '',
          destination: '',
          departureTime: '',
          itemId: '',
          itemName: '',
          quantity: '' as unknown as number,
          unit: 'bags',
          unitPrice: '' as unknown as number,
          clientId: '',
          customerName: '',
          customerPhone: '',
          waybillNumber: '',
          totalRevenue: '' as unknown as number,
          fuelCost: '' as unknown as number,
          startMileage: '' as unknown as number,
          endMileage: '' as unknown as number,
          fuelUsed: '' as unknown as number,
          notes: '',
          deliveryType: 'SINGLE',
          loadingCityId: '',
          loadingPointId: '',
          destinationCityId: '',
          destinationZoneId: '',
          startMileageImage: '',
        })
      }

      const { user } = useAuthStore.getState()
      const driverId = user?.role === 'Driver' && user.driverId ? user.driverId : undefined
      setLoadingOptions(true)
      Promise.all([
        fetchTrucks({ status: 'active', limit: 100, driverId }).catch(() => ({ data: [] })),
        fetchDrivers({ status: 'active', limit: 100 }).catch(() => ({ data: [] })),
        apiFetch<{ data: ItemOption[] }>('/api/items?includeInactive=true').catch(() => ({ data: [] })),
        apiFetch<{ data: ClientOption[] }>('/api/clients?status=active').catch(() => ({ data: [] })),
        apiFetch<{ data: CityOption[] }>('/api/loading-cities').catch(() => ({ data: [] })),
        apiFetch<{ data: CityOption[] }>('/api/destination-cities').catch(() => ({ data: [] })),
      ])
        .then(([trucksResult, driversResult, itemsResult, clientsResult, lcResult, dcResult]) => {
          setTrucks((trucksResult.data || []) as typeof trucks)
          setDrivers((driversResult.data || []) as typeof drivers)
          setItems(itemsResult.data || [])
          setClients(clientsResult.data || [])
          setLoadingCities(lcResult.data || [])
          setDestinationCities(dcResult.data || [])
          // If editing a trip with a destination zone, populate zones dropdown and fetch zone rate
          const editZoneId = (trip as Record<string, unknown>).destinationZoneId as string | undefined
          const editCityId = (trip as Record<string, unknown>).destinationCityId as string | undefined
          if (editZoneId && editCityId) {
            setZoneRateLoading(true)
            Promise.all([
              apiFetch<{ data: ZoneOption[] }>(`/api/destination-zones?destinationCityId=${editCityId}`).catch(() => ({ data: [] })),
              apiFetch<{ data: { id: string; rateAmount: number }[] }>(`/api/zone-rates?destinationZoneId=${editZoneId}`).catch(() => ({ data: [] })),
            ])
              .then(([zonesResult, ratesResult]) => {
                setDestinationZones(zonesResult.data || [])
                const rates = ratesResult.data || []
                if (rates.length > 0) {
                  const rate = rates[0].rateAmount
                  setZoneRate(rate)
                  form.setValue('unitPrice', rate, { shouldValidate: false })
                  form.setValue('totalRevenue', rate, { shouldValidate: false })
                }
              })
              .catch(() => {})
              .finally(() => setZoneRateLoading(false))
          }
        })
        .catch(() => {
          // Individual API failures are handled by per-call .catch() above.
          // If we still get here, it's an unexpected error — fail silently
          // so the form still opens with whatever data loaded successfully.
        })
        .finally(() => setLoadingOptions(false))

      // Reset cascading states
      setLoadingPoints([])
      setDestinationZones([])
      setZoneRate(null)
      setCargoItems([])

      // Reset/populate delivery destinations
      if (trip && (trip as Record<string, unknown>).deliveryDestinations) {
        const existingDests = (trip as Record<string, unknown>).deliveryDestinations as Record<string, unknown>[]
        if (Array.isArray(existingDests) && existingDests.length > 0) {
          setDeliveryDestinations(existingDests.map(d => ({
            _tempId: (d.id as string) || crypto.randomUUID(),
            clientId: (d.clientId as string) || '',
            customerName: (d.customerName as string) || '',
            customerPhone: (d.customerPhone as string) || '',
            destinationZoneId: (d.destinationZoneId as string) || '',
            zoneRate: (d.zoneRate as number) || null,
            address: (d.address as string) || '',
            notes: (d.notes as string) || '',
          })))
          // Also set deliveryType to MULTIPLE if we have delivery destinations
          form.setValue('deliveryType', 'MULTIPLE')
        } else {
          setDeliveryDestinations([])
        }
      } else {
        setDeliveryDestinations([])
      }
    }
  }, [form, open, trip])

  // Auto-fill driver when truck is selected (driver is read-only — comes from truck assignment)
  React.useEffect(() => {
    const subscription = form.watch((data, { name }) => {
      if (name === 'truckId' && data.truckId) {
        const selectedTruck = trucks.find(t => t.id === data.truckId)
        if (selectedTruck?.driverId) {
          const driver = drivers.find(d => d.id === selectedTruck.driverId)
          if (driver) {
            form.setValue('driverId', driver.id, { shouldValidate: true })
            toast.info(`Auto-assigned driver: ${driver.firstName} ${driver.lastName}`, {
              description: `Currently assigned to ${selectedTruck.plateNumber}`,
              duration: 3000,
            })
          }
        } else {
          // Truck has no driver — clear and show error
          form.setValue('driverId', '', { shouldValidate: false })
          toast.error('This truck has no driver assigned', {
            description: 'Please assign a driver to the truck first before creating a trip.',
            duration: 4000,
          })
        }
      }
    })
    return () => subscription.unsubscribe()
  }, [form, trucks, drivers])

  // Auto-fill item name and unit when item is selected
  React.useEffect(() => {
    const subscription = form.watch((data, { name }) => {
      if (name === 'itemId' && data.itemId) {
        const selectedItem = items.find(i => i.id === data.itemId)
        if (selectedItem) {
          form.setValue('itemName', selectedItem.name)
          form.setValue('unit', selectedItem.unit)
        }
      }
    })
    return () => subscription.unsubscribe()
  }, [form, items])

  // Auto-fill customer info when client is selected
  React.useEffect(() => {
    const subscription = form.watch((data, { name }) => {
      if (name === 'clientId' && data.clientId) {
        const selectedClient = clients.find(c => c.id === data.clientId)
        if (selectedClient) {
          form.setValue('customerName', selectedClient.companyName)
          form.setValue('customerPhone', selectedClient.phone)
        }
      }
    })
    return () => subscription.unsubscribe()
  }, [form, clients])

  // When unitPrice is changed manually (no zone rate), mirror to totalRevenue
  React.useEffect(() => {
    const subscription = form.watch((data, { name }) => {
      if (zoneRate === null && name === 'unitPrice' && data.unitPrice) {
        form.setValue('totalRevenue', data.unitPrice, { shouldValidate: false })
      }
    })
    return () => subscription.unsubscribe()
  }, [form, zoneRate])

  // Cascading: loadingCityId → reset loading point
  React.useEffect(() => {
    const subscription = form.watch((data, { name }) => {
      if (name === 'loadingCityId') {
        form.setValue('loadingPointId', '')
        setLoadingPoints([])
        const cityId = data.loadingCityId
        if (!cityId) return
        // Fetch all loading points for this city
        setLoadingPointsLoading(true)
        apiFetch<{ data: LoadingPointOption[] }>(`/api/loading-points?loadingCityId=${cityId}`)
          .then((res) => setLoadingPoints(res.data || []))
          .catch(() => setLoadingPoints([]))
          .finally(() => setLoadingPointsLoading(false))
      }
    })
    return () => subscription.unsubscribe()
  }, [form])

  // Auto-fill loadingLocation when loadingPointId is selected
  React.useEffect(() => {
    const subscription = form.watch((data, { name }) => {
      if (name === 'loadingPointId' && data.loadingPointId) {
        const point = loadingPoints.find((pt) => pt.id === data.loadingPointId)
        if (point) {
          form.setValue('loadingLocation', point.name)
        }
      }
    })
    return () => subscription.unsubscribe()
  }, [form, loadingPoints])

  // Cascading: destinationCityId → fetch destinationZones
  React.useEffect(() => {
    const subscription = form.watch((data, { name }) => {
      if (name === 'destinationCityId') {
        form.setValue('destinationZoneId', '')
        setDestinationZones([])
        setZoneRate(null)
        const cityId = data.destinationCityId
        if (!cityId) return
        setDestinationZonesLoading(true)
        apiFetch<{ data: ZoneOption[] }>(`/api/destination-zones?destinationCityId=${cityId}`)
          .then((res) => setDestinationZones(res.data || []))
          .catch(() => setDestinationZones([]))
          .finally(() => setDestinationZonesLoading(false))
      }
    })
    return () => subscription.unsubscribe()
  }, [form])

  // When destinationZoneId is selected, fetch zone rate, auto-fill unitPrice (Rate) & totalRevenue (Revenue) & destination
  React.useEffect(() => {
    const subscription = form.watch((data, { name }) => {
      if (name === 'destinationZoneId') {
        setZoneRate(null)
        const zoneId = data.destinationZoneId
        if (!zoneId) return

        // Auto-fill destination with zone name + city name
        const zone = destinationZones.find((z) => z.id === zoneId)
        if (zone) {
          const city = destinationCities.find((c) => c.id === zone.destinationCityId)
          const destValue = city ? `${zone.name}, ${city.name}` : zone.name
          form.setValue('destination', destValue)
        }

        // Fetch zone rate
        setZoneRateLoading(true)
        apiFetch<{ data: { id: string; rateAmount: number; destinationZone?: { id: string; name: string } }[] }>(`/api/zone-rates?destinationZoneId=${zoneId}`)
          .then((res) => {
            const rates = res.data || []
            if (rates.length > 0) {
              const rate = rates[0].rateAmount
              setZoneRate(rate)
              form.setValue('unitPrice', rate, { shouldValidate: false })
              form.setValue('totalRevenue', rate, { shouldValidate: false })
              toast.success(`Zone rate applied: ${CURRENCY_SYMBOL}${rate.toLocaleString()}`)
            } else {
              setZoneRate(null)
              toast.info('No rate found for this zone. Enter rate manually.')
            }
          })
          .catch(() => {
            setZoneRate(null)
            toast.info('Could not fetch zone rate.')
          })
          .finally(() => setZoneRateLoading(false))
      }
    })
    return () => subscription.unsubscribe()
  }, [form, destinationZones, destinationCities])

  // Computed total revenue from all cargo items
  const computedTotalRevenue = React.useMemo(() => {
    return cargoItems.reduce((sum, item) => sum + (item.total || 0), 0)
  }, [cargoItems])

  // Delivery destination helpers
  const deliveryDestTotal = React.useMemo(() => {
    return deliveryDestinations.reduce((sum, dest) => sum + (dest.zoneRate || 0), 0)
  }, [deliveryDestinations])

  function addDeliveryDestination() {
    setDeliveryDestinations(prev => [...prev, {
      _tempId: crypto.randomUUID(),
      clientId: '',
      customerName: '',
      customerPhone: '',
      destinationZoneId: '',
      zoneRate: null,
      address: '',
      notes: '',
    }])
  }

  function removeDeliveryDestination(index: number) {
    setDeliveryDestinations(prev => prev.filter((_, i) => i !== index))
  }

  function updateDeliveryDestination(index: number, updates: Partial<DeliveryDestinationRow>) {
    setDeliveryDestinations(prev => prev.map((d, i) => i === index ? { ...d, ...updates } : d))
  }

  async function onSubmit(data: TripFormValues) {
    setSubmitting(true)
    try {
      const body: Record<string, unknown> = { ...data }

      // Store mileage image URLs as JSON array string
      const uploadedUrls = mileageImages.filter(img => img.isUploaded).map(img => img.url)
      body.startMileageImage = JSON.stringify(uploadedUrls)

      // Build tripItems from cargoItems
      const tripItems = cargoItems.map(item => ({
        itemId: item.itemId || null,
        itemName: item.itemName || 'Unknown',
        unit: item.unit,
        quantity: item.quantity,
        rate: item.rate || null,
        total: item.total || null,
        deliveryDestinationId: item.deliveryDestinationId || null,
      }))
      body.tripItems = tripItems
      body.totalRevenue = computedTotalRevenue

      // Handle multi-customer delivery destinations
      const currentDeliveryType = form.getValues('deliveryType')
      if (currentDeliveryType === 'MULTIPLE' && deliveryDestinations.length > 0) {
        body.deliveryType = 'MULTIPLE'
        body.deliveryDestinations = deliveryDestinations.map((dest, idx) => ({
          sortOrder: idx + 1,
          clientId: dest.clientId || null,
          customerName: dest.customerName || null,
          customerPhone: dest.customerPhone || null,
          destinationZoneId: dest.destinationZoneId || null,
          zoneRate: dest.zoneRate || null,
          address: dest.address || null,
          notes: dest.notes || null,
        }))
        // For multiple destinations, totalRevenue = sum of all item totals (rate × qty)
        body.totalRevenue = computedTotalRevenue
      }

      // Legacy single-item fields for backward compatibility
      if (tripItems.length > 0) {
        body.itemName = tripItems[0].itemName
        body.quantity = tripItems[0].quantity
        body.unit = tripItems[0].unit
        body.unitPrice = tripItems[0].rate
      } else {
        // Fallback: ensure itemName is set (from form)
        body.itemName = data.itemName || 'Cargo'
        body.quantity = data.quantity || 0
        body.unit = data.unit || 'bags'
      }

      if (trip) {
        await updateTrip(trip.id, body)
        toast.success('Trip updated successfully', {
          description: `${data.loadingLocation || 'Origin'} → ${data.destination || 'Destination'} (${data.itemName})`,
        })
        onOpenChange(false)
        onUpdated?.()
      } else {
        await createTrip(body)
        toast.success('Trip created successfully', {
          description: `${data.loadingLocation || 'Origin'} → ${data.destination || 'Destination'} (${data.itemName})`,
        })
        onOpenChange(false)
        onCreated?.()
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : trip ? 'Failed to update trip' : 'Failed to create trip')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="md:max-w-5xl max-h-[92vh]">
        <DialogHeader>
          <DialogTitle>{trip ? 'Edit Trip' : 'Create New Trip'}</DialogTitle>
          <DialogDescription>{trip ? 'Update trip details below.' : 'Fill in trip details to create a new cargo trip.'}</DialogDescription>
        </DialogHeader>

        <DialogBody className="flex-1 min-h-0">
        <Form {...form}>
          <form id="trip-form" onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
            {/* 0. Order / Waybill Number (always first) */}
            <div className="space-y-3">
              <h3 className="text-sm font-semibold text-amber-600 dark:text-amber-400">Order / Waybill</h3>
              <FormField
                control={form.control}
                name="waybillNumber"
                render={({ field }) => (
                  <FormItem className="sm:max-w-sm">
                    <FormLabel>Order/Waybill Number</FormLabel>
                    <FormControl>
                      <Input placeholder="WB-2024-001" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>

            <Separator />

            {/* 1. Assignment (Truck & Driver) */}
            <div className="space-y-3">
              <h3 className="text-sm font-semibold text-amber-600 dark:text-amber-400">Assignment</h3>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <FormField
                  control={form.control}
                  name="truckId"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Truck *</FormLabel>
                      <SearchableSelect
                        options={trucks.map(t => ({
                          value: t.id,
                          label: `${t.plateNumber} (${t.make} ${t.model})`,
                          description: t.driverId ? 'Has driver' : 'No driver',
                        }))}
                        value={field.value}
                        onValueChange={field.onChange}
                        placeholder={loadingOptions ? 'Loading...' : 'Select truck'}
                        disabled={loadingOptions}
                        alwaysSearchable
                      />
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="driverId"
                  render={({ field }) => {
                    const selectedTruck = trucks.find(t => t.id === form.getValues('truckId'))
                    const assignedDriver = field.value ? drivers.find(d => d.id === field.value) : null
                    const truckHasNoDriver = !!form.getValues('truckId') && !selectedTruck?.driverId

                    return (
                      <FormItem>
                        <FormLabel>Driver *</FormLabel>
                        <FormControl>
                          {assignedDriver ? (
                            <div className="flex items-center gap-2 h-9 px-3 rounded-md border bg-muted/50">
                              <User className="h-4 w-4 text-muted-foreground shrink-0" />
                              <span className="text-sm font-medium truncate">{assignedDriver.firstName} {assignedDriver.lastName}</span>
                              <span className="text-xs text-muted-foreground ml-auto shrink-0">{assignedDriver.phone}</span>
                            </div>
                          ) : truckHasNoDriver ? (
                            <div className="flex items-center gap-2 h-9 px-3 rounded-md border border-destructive/50 bg-destructive/5 text-destructive">
                              <AlertCircle className="h-4 w-4 shrink-0" />
                              <span className="text-sm">No driver assigned to this truck</span>
                            </div>
                          ) : (
                            <div className="flex items-center gap-2 h-9 px-3 rounded-md border bg-muted/30 text-muted-foreground">
                              <User className="h-4 w-4 shrink-0" />
                              <span className="text-sm">Select a truck first</span>
                            </div>
                          )}
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )
                  }}
                />
              </div>
            </div>

            <Separator />

            {/* 2. Loading City & Point */}
            <div className="space-y-3">
              <h3 className="text-sm font-semibold text-amber-600 dark:text-amber-400">Loading City & Point</h3>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <FormField
                  control={form.control}
                  name="loadingCityId"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Loading City</FormLabel>
                      <Select onValueChange={(val) => {
                        field.onChange(val)
                        const city = loadingCities.find(c => c.id === val)
                        if (city) form.setValue('loadingLocation', city.name)
                      }} value={field.value}>
                      <FormControl>
                        <SelectTrigger>
                          <SelectValue placeholder={loadingOptions ? 'Loading...' : 'Select loading city'} />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        {loadingCities.map((city) => (
                          <SelectItem key={city.id} value={city.id}>
                            {city.name} ({city.region})
                          </SelectItem>
                        ))}
                      </SelectContent>
                      </Select>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="loadingPointId"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Loading Point</FormLabel>
                      <Select onValueChange={field.onChange} value={field.value} disabled={!form.watch('loadingCityId') || loadingPointsLoading}>
                        <FormControl>
                          <SelectTrigger>
                            <SelectValue placeholder={loadingPointsLoading ? 'Loading...' : !form.watch('loadingCityId') ? 'Select city first' : 'Select loading point'} />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          {loadingPoints.length === 0 ? (
                            <SelectItem value="_none" disabled>No loading points</SelectItem>
                          ) : (
                            loadingPoints.map((pt) => (
                              <SelectItem key={pt.id} value={pt.id}>{pt.name}</SelectItem>
                            ))
                          )}
                        </SelectContent>
                      </Select>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>
              {/* Departure Time */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <FormField
                  control={form.control}
                  name="departureTime"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Departure Time *</FormLabel>
                      <FormControl>
                        <Input type="datetime-local" {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>
            </div>

            <Separator />

            {/* 3. Destination City, Zone & Customer */}
            <div className="space-y-3">
              <h3 className="text-sm font-semibold text-amber-600 dark:text-amber-400">Destination City, Zone & Customer</h3>
              {/* Delivery Type select (first field in this section) */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <FormField
                  control={form.control}
                  name="deliveryType"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Delivery Type</FormLabel>
                      <Select onValueChange={(val) => {
                        field.onChange(val)
                        // Reset destinations when switching to SINGLE
                        if (val === 'SINGLE') {
                          setDeliveryDestinations([])
                        }
                      }} value={field.value}>
                        <FormControl>
                          <SelectTrigger>
                            <SelectValue />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          <SelectItem value="SINGLE">Single Destination</SelectItem>
                          <SelectItem value="MULTIPLE">Multiple Destinations</SelectItem>
                        </SelectContent>
                      </Select>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <div /> {/* empty placeholder for grid alignment */}
              </div>

              {/* Destination City (shared, always shown) */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <FormField
                  control={form.control}
                  name="destinationCityId"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Destination City</FormLabel>
                      <Select onValueChange={(val) => {
                        field.onChange(val)
                        const city = destinationCities.find(c => c.id === val)
                        if (city) form.setValue('destination', city.name)
                      }} value={field.value}>
                      <FormControl>
                        <SelectTrigger>
                          <SelectValue placeholder={loadingOptions ? 'Loading...' : 'Select destination city'} />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        {destinationCities.map((city) => (
                          <SelectItem key={city.id} value={city.id}>
                            {city.name} ({city.region})
                          </SelectItem>
                        ))}
                      </SelectContent>
                      </Select>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                {form.watch('deliveryType') !== 'MULTIPLE' && (
                  <FormField
                    control={form.control}
                    name="destinationZoneId"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Destination Zone</FormLabel>
                        <Select onValueChange={(val) => {
                          field.onChange(val)
                          // Reset customer when zone changes
                          form.setValue('clientId', '')
                          form.setValue('customerName', '')
                          form.setValue('customerPhone', '')
                        }} value={field.value} disabled={!form.watch('destinationCityId') || destinationZonesLoading}>
                          <FormControl>
                            <SelectTrigger>
                              <SelectValue placeholder={destinationZonesLoading ? 'Loading...' : 'Select destination zone'} />
                            </SelectTrigger>
                          </FormControl>
                          <SelectContent>
                            {destinationZones.length === 0 ? (
                              <SelectItem value="_none" disabled>No zones</SelectItem>
                            ) : (
                              destinationZones.map((zone) => (
                                <SelectItem key={zone.id} value={zone.id}>{zone.name}</SelectItem>
                              ))
                            )}
                          </SelectContent>
                        </Select>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                )}
              </div>

              {/* SINGLE delivery: show customer and phone fields */}
              {form.watch('deliveryType') !== 'MULTIPLE' && (
                <>
                  {/* Row: Customer Name & Customer Phone */}
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <FormField
                      control={form.control}
                      name="clientId"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Customer Name</FormLabel>
                          <SearchableSelect
                            options={(() => {
                              const zoneId = form.getValues('destinationZoneId')
                              const filtered = zoneId
                                ? clients.filter(c => c.zones?.some(z => z.destinationZoneId === zoneId))
                                : clients
                              return filtered.map(c => ({
                                value: c.id,
                                label: c.companyName,
                                description: c.phone,
                              }))
                            })()}
                            value={field.value}
                            onValueChange={field.onChange}
                            placeholder={loadingOptions ? 'Loading...' : !form.getValues('destinationZoneId') ? 'Select zone first' : 'Select customer'}
                            disabled={loadingOptions || !form.getValues('destinationZoneId')}
                            alwaysSearchable
                          />
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                    <FormField
                      control={form.control}
                      name="customerPhone"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Customer Number</FormLabel>
                          <FormControl>
                            <Input
                              {...field}
                              readOnly
                              className="bg-muted/50 cursor-not-allowed"
                              placeholder={form.getValues('clientId') ? '' : 'Auto-populated from customer'}
                            />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                  </div>
                  {/* Hidden customerName (auto-populated from client selection) */}
                  <input type="hidden" {...form.register('customerName')} />
                  {/* Zone Rate Display */}
                  {zoneRate !== null && (
                    <div className="rounded-lg border border-emerald-200 bg-emerald-50 dark:border-emerald-800 dark:bg-emerald-950/40 p-3">
                      <p className="text-xs text-emerald-700 dark:text-emerald-400 font-medium">
                        Zone Rate Applied: {CURRENCY_SYMBOL}{zoneRate.toLocaleString()}
                      </p>
                    </div>
                  )}
                  {zoneRateLoading && (
                    <p className="text-xs text-muted-foreground">Fetching zone rate...</p>
                  )}
                </>
              )}

              {/* MULTIPLE delivery: dynamic delivery destinations list */}
              {form.watch('deliveryType') === 'MULTIPLE' && (
                <div className="space-y-3 mt-2">
                  <div className="flex items-center justify-between">
                    <p className="text-xs text-muted-foreground">
                      {deliveryDestinations.length} destination(s) — Total zone rates: {CURRENCY_SYMBOL}{deliveryDestTotal.toLocaleString()}
                    </p>
                    <Button type="button" variant="outline" size="sm" onClick={addDeliveryDestination}>
                      <Plus className="h-4 w-4 mr-1" /> Add Destination
                    </Button>
                  </div>

                  {deliveryDestinations.length === 0 && (
                    <p className="text-sm text-muted-foreground text-center py-4">No delivery destinations added.</p>
                  )}

                  {deliveryDestinations.map((dest, idx) => (
                    <div key={dest._tempId} className="rounded-lg border bg-muted/30 p-4 space-y-3">
                      <div className="flex items-center justify-between">
                        <span className="text-xs font-semibold text-muted-foreground">Destination #{idx + 1}</span>
                        <Button type="button" variant="ghost" size="sm" onClick={() => removeDeliveryDestination(idx)}>
                          <X className="h-4 w-4 text-destructive" />
                        </Button>
                      </div>
                      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                        {/* Zone select */}
                        <FormItem>
                          <FormLabel className="text-xs">Zone</FormLabel>
                          <Select
                            value={dest.destinationZoneId}
                            onValueChange={(val) => {
                              updateDeliveryDestination(idx, {
                                destinationZoneId: val,
                                clientId: '',
                                customerName: '',
                                customerPhone: '',
                                zoneRate: null,
                              })
                              if (val) {
                                apiFetch<{ data: { id: string; rateAmount: number }[] }>(`/api/zone-rates?destinationZoneId=${val}`)
                                  .then((res) => {
                                    const rates = res.data || []
                                    if (rates.length > 0) {
                                      const rate = rates[0].rateAmount
                                      updateDeliveryDestination(idx, { zoneRate: rate })
                                      toast.success(`Zone rate applied: ${CURRENCY_SYMBOL}${rate.toLocaleString()}`)
                                    }
                                  })
                                  .catch(() => {})
                              }
                            }}
                            disabled={!form.getValues('destinationCityId')}
                          >
                            <SelectTrigger className="h-9">
                              <SelectValue placeholder={destinationZonesLoading ? 'Loading...' : 'Select zone'} />
                            </SelectTrigger>
                            <SelectContent>
                              {destinationZones.length === 0 ? (
                                <SelectItem value="_none" disabled>No zones</SelectItem>
                              ) : (
                                destinationZones.map((zone) => (
                                  <SelectItem key={zone.id} value={zone.id}>{zone.name}</SelectItem>
                                ))
                              )}
                            </SelectContent>
                          </Select>
                        </FormItem>
                        {/* Customer select — label shows phone when selected */}
                        <FormItem>
                          <FormLabel className="text-xs">
                            Customer{dest.customerPhone ? `: ${dest.customerPhone}` : ''}
                          </FormLabel>
                          <SearchableSelect
                            options={(() => {
                              const filtered = dest.destinationZoneId
                                ? clients.filter(c => c.zones?.some(z => z.destinationZoneId === dest.destinationZoneId))
                                : clients
                              return filtered.map(c => ({
                                value: c.id,
                                label: c.companyName,
                                description: c.phone,
                              }))
                            })()}
                            value={dest.clientId}
                            onValueChange={(val) => {
                              const client = clients.find(c => c.id === val)
                              if (client) {
                                updateDeliveryDestination(idx, {
                                  clientId: val,
                                  customerName: client.companyName,
                                  customerPhone: client.phone,
                                })
                              }
                            }}
                            placeholder={!dest.destinationZoneId ? 'Select zone first' : 'Select customer'}
                            disabled={!dest.destinationZoneId}
                            alwaysSearchable
                          />
                        </FormItem>
                        {/* Rate display (auto-calculated, read-only) */}
                        <FormItem>
                          <FormLabel className="text-xs">Zone Rate</FormLabel>
                          <Input
                            type="number"
                            value={dest.zoneRate ?? ''}
                            readOnly
                            className="h-9 bg-muted/50 cursor-not-allowed"
                            placeholder="Auto from zone"
                          />
                        </FormItem>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            <Separator />

            {/* 4. Cargo & Item Details */}
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <h3 className="text-sm font-semibold text-amber-600 dark:text-amber-400">Cargo & Item Details</h3>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => {
                    setCargoItems(prev => [...prev, {
                      id: crypto.randomUUID(),
                      itemId: '',
                      itemName: '',
                      unit: 'bags',
                      quantity: 0,
                      rate: 0,
                      total: 0,
                      deliveryDestinationId: '',
                    }])
                  }}
                  disabled={loadingOptions}
                >
                  <Plus className="h-4 w-4 mr-1" />
                  Add Item
                </Button>
              </div>

              {cargoItems.length === 0 && (
                <div className="rounded-lg border border-dashed p-6 text-center">
                  <p className="text-sm text-muted-foreground">No items added yet. Click "+ Add Item" to begin.</p>
                </div>
              )}

              {cargoItems.length > 0 && (
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b">
                        <th className="text-left py-2 px-2 font-medium text-muted-foreground w-10">#</th>
                        <th className="text-left py-2 px-2 font-medium text-muted-foreground min-w-[180px]">Item Name</th>
                        <th className="text-left py-2 px-2 font-medium text-muted-foreground w-24">Unit</th>
                        <th className="text-left py-2 px-2 font-medium text-muted-foreground w-28">Quantity</th>
                        <th className="text-left py-2 px-2 font-medium text-muted-foreground w-28">Rate</th>
                        {form.watch('deliveryType') === 'MULTIPLE' && deliveryDestinations.length > 0 && (
                          <th className="text-left py-2 px-2 font-medium text-muted-foreground min-w-[180px]">Deliver To</th>
                        )}
                        <th className="text-right py-2 px-2 font-medium text-muted-foreground w-28">Total</th>
                        <th className="w-8"></th>
                      </tr>
                    </thead>
                    <tbody>
                      {cargoItems.map((item, itemIdx) => (
                        <tr key={item.id} className="border-b last:border-0">
                          <td className="py-1 px-2 text-muted-foreground">{itemIdx + 1}</td>
                          {/* Item Name */}
                          <td className="py-1 px-2">
                            <Select
                              value={item.itemId}
                              onValueChange={(val) => {
                                const selItem = items.find(i => i.id === val)
                                setCargoItems(prev => prev.map((it, ii) => ii === itemIdx ? {
                                  ...it,
                                  itemId: val,
                                  itemName: selItem?.name || '',
                                  unit: selItem?.unit || 'bags',
                                } : it))
                              }}
                            >
                              <SelectTrigger className="h-8 text-xs">
                                <SelectValue placeholder="Select item" />
                              </SelectTrigger>
                              <SelectContent>
                                {items.map(it => (
                                  <SelectItem key={it.id} value={it.id}>{it.name}</SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                          </td>
                          {/* Unit (auto from item) */}
                          <td className="py-1 px-2">
                            <Select
                              value={item.unit}
                              onValueChange={(val) => {
                                setCargoItems(prev => prev.map((it, ii) => ii === itemIdx ? { ...it, unit: val } : it))
                              }}
                            >
                              <SelectTrigger className="h-8 text-xs">
                                <SelectValue />
                              </SelectTrigger>
                              <SelectContent>
                                {['bags', 'tonnes', 'pallets', 'crates', 'litres', 'pieces', 'bundles', 'rolls', 'kg'].map(u => (
                                  <SelectItem key={u} value={u}>{u}</SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                          </td>
                          {/* Quantity */}
                          <td className="py-1 px-2">
                            <Input
                              type="number"
                              className="h-8 text-xs"
                              value={item.quantity || ''}
                              onChange={(e) => {
                                const qty = parseFloat(e.target.value) || 0
                                setCargoItems(prev => prev.map((it, ii) => ii === itemIdx ? {
                                  ...it,
                                  quantity: qty,
                                  total: qty * (it.rate || 0),
                                } : it))
                              }}
                              placeholder="0"
                            />
                          </td>
                          {/* Rate */}
                          <td className="py-1 px-2">
                            <Input
                              type="number"
                              className={`h-8 text-xs ${item.deliveryDestinationId ? 'bg-muted/50 cursor-not-allowed' : ''}`}
                              value={item.rate || ''}
                              readOnly={!!item.deliveryDestinationId}
                              onChange={(e) => {
                                const rate = parseFloat(e.target.value) || 0
                                setCargoItems(prev => prev.map((it, ii) => ii === itemIdx ? {
                                  ...it,
                                  rate,
                                  total: (it.quantity || 0) * rate,
                                } : it))
                              }}
                              placeholder="0.00"
                            />
                          </td>
                          {/* Deliver To (only shown for MULTIPLE delivery with destinations) */}
                          {form.watch('deliveryType') === 'MULTIPLE' && deliveryDestinations.length > 0 && (
                            <td className="py-1 px-2">
                              <Select
                                value={item.deliveryDestinationId}
                                onValueChange={(val) => {
                                  const dest = deliveryDestinations.find(d => d._tempId === val)
                                  const destRate = dest?.zoneRate || 0
                                  setCargoItems(prev => prev.map((it, ii) => ii === itemIdx ? {
                                    ...it,
                                    deliveryDestinationId: val,
                                    rate: destRate,
                                    total: (it.quantity || 0) * destRate,
                                  } : it))
                                }}
                              >
                                <SelectTrigger className="h-8 text-xs">
                                  <SelectValue placeholder="Select customer" />
                                </SelectTrigger>
                                <SelectContent>
                                  {deliveryDestinations.map((dest) => (
                                    <SelectItem key={dest._tempId} value={dest._tempId}>
                                      {dest.customerName || `Destination #${deliveryDestinations.indexOf(dest) + 1}`}
                                    </SelectItem>
                                  ))}
                                </SelectContent>
                              </Select>
                            </td>
                          )}
                          {/* Total */}
                          <td className="py-1 px-2 text-right font-medium text-sm">
                            {CURRENCY_SYMBOL}{(item.total || 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                          </td>
                          {/* Delete */}
                          <td className="py-1 px-1">
                            <button
                              type="button"
                              className="h-6 w-6 rounded flex items-center justify-center text-muted-foreground hover:text-red-500 hover:bg-red-50"
                              onClick={() => {
                                setCargoItems(prev => prev.filter((_, ii) => ii !== itemIdx))
                              }}
                            >
                              <X className="h-3 w-3" />
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}

              {/* Total Revenue */}
              {cargoItems.length > 0 && (
                <div className="rounded-lg border-2 border-emerald-300 bg-emerald-50 dark:border-emerald-700 dark:bg-emerald-950/40 p-4">
                  <div className="flex items-center justify-between">
                    <span className="text-sm font-semibold text-emerald-700 dark:text-emerald-400">Total Revenue</span>
                    <span className="text-xl font-bold text-emerald-700 dark:text-emerald-400">
                      {CURRENCY_SYMBOL}{computedTotalRevenue.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                    </span>
                  </div>
                  {form.watch('deliveryType') === 'MULTIPLE' && (
                    <p className="text-xs text-emerald-600 dark:text-emerald-500 mt-1">
                      Sum of (rate × quantity) across all items
                    </p>
                  )}
                </div>
              )}

              {/* Hidden fields for backward compatibility */}
              <input type="hidden" {...form.register('itemName')} />
              <input type="hidden" {...form.register('quantity')} />
              <input type="hidden" {...form.register('unit')} />
              <input type="hidden" {...form.register('unitPrice')} />
              <input type="hidden" {...form.register('totalRevenue')} />
            </div>

            <Separator />

            {/* 5. Mileage & Delivery */}
            <div className="space-y-3">
              <h3 className="text-sm font-semibold text-amber-600 dark:text-amber-400">Mileage</h3>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <FormField
                  control={form.control}
                  name="startMileage"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Start Mileage (km) *</FormLabel>
                      <FormControl>
                        <Input type="number" placeholder="145230" min="0" {...field} value={field.value ?? ''} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <div /> {/* empty placeholder for grid alignment */}
              </div>
              {/* Hidden field for startMileageImage (stored as JSON array via upload) */}
              <input type="hidden" {...form.register('startMileageImage')} />
              {/* Image Upload Area */}
              <div className="sm:max-w-lg">
                <FormLabel className="text-sm">Start Mileage Photos</FormLabel>
                <ImageUploadArea
                  images={mileageImages}
                  onImagesChange={setMileageImages}
                  disabled={submitting}
                />
              </div>
            </div>

            <Separator />

            {/* Notes */}
            <FormField
              control={form.control}
              name="notes"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Notes</FormLabel>
                  <FormControl>
                    <Textarea placeholder="Any additional notes..." {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

          </form>
        </Form>
        </DialogBody>
        <DialogFooter className="gap-2 sm:gap-0 shrink-0 border-t pt-3">
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)} disabled={submitting}>
            Cancel
          </Button>
          <Button type="submit" form="trip-form" className="bg-amber-500 hover:bg-amber-600 text-white" disabled={submitting}>
            {submitting ? 'Saving...' : trip ? 'Update Trip' : 'Create Trip'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
