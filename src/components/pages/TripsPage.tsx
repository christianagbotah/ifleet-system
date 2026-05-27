'use client'

import { useState, useMemo, useEffect, useCallback, useRef } from 'react'
import { useDebounce } from '@/hooks/use-debounce'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { format } from 'date-fns'
import { motion } from 'framer-motion'
import {
  Plus,
  Search,
  Eye,
  Pencil,
  Trash2,
  Route,
  AlertCircle,
  Loader2,
  ArrowRight,
  X,
  ChevronLeft,
  ChevronRight,
  ChevronUp,
  ChevronDown,
  Upload,
  Download,
  MapPin,
  Package,
  Copy,
  UserRound,
  Truck,
  Milestone,
  CalendarDays,
  PackageOpen,
  DollarSign,
  ClipboardList,
  Printer,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { useAppStore } from '@/lib/store'
import { formatCurrency } from '@/lib/currency'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { DatePicker } from '@/components/ui/date-picker'
import { Badge } from '@/components/ui/badge'
import { PageSkeleton } from '@/components/ui/page-skeleton'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogDescription,
} from '@/components/ui/dialog'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog'
import {
  Table,
  TableBody,
  TableCell,
  TableFooter,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from '@/components/ui/form'
import { Textarea } from '@/components/ui/textarea'
import { Separator } from '@/components/ui/separator'
import { toast } from '@/lib/toast-config'
import { exportToCSV } from '@/lib/export'
import { FormFieldWrapper } from '@/components/ui/form-field-wrapper'
import { DataPagination } from '@/components/ui/data-pagination'
import { useUndoDelete } from '@/hooks/use-undo-delete'
import { useColumnVisibility } from '@/hooks/use-column-visibility'
import { ColumnVisibilityMenu } from '@/components/ui/column-visibility-menu'
import { DriverAvatar } from '@/components/ui/driver-avatar'
import { DriverDetailSheet } from '@/components/ui/driver-detail-sheet'
import { StatusDropdown } from '@/components/ui/status-dropdown'
import { FormStepIndicator } from '@/components/ui/form-step-indicator'
import { TruckDetailSheet } from '@/components/ui/truck-detail-sheet'

interface Driver {
  id: string
  driverName: string
}

interface Truck {
  id: string
  plateNumber: string
  truckName: string
}

interface Warehouse {
  id: string
  name: string
  code: string
  region: string
  isActive: boolean
}

interface ZoneRate {
  id: string
  zoneName: string
  fromRegion: string
  toRegion: string
  ratePerKm: number
  minimumRate: number
  waitingRate: number
  isActive: boolean
}

interface TripData {
  id: string
  tripNumber: string
  driverId: string
  truckId: string
  fromWarehouseId: string
  toWarehouseId: string
  status: string
  departureDate?: string
  arrivalDate?: string
  originAddress: string
  destinationAddress: string
  distance: number
  fuelUsed: number
  totalAmount: number
  baseRate: number
  waitingCharges: number
  otherCharges: number
  cargoDescription: string
  cargoWeight: number
  notes: string
  imageUrls: string
  createdAt: string
  driver?: Driver
  truck?: Truck
  fromWarehouse?: Warehouse
  toWarehouse?: Warehouse
  cashAdvances?: Array<{ id: string;
amount: number; purpose: string; status: string }>
  incentives?: Array<{ id: string; amount: number; incentiveType: string; status: string }>
}

const tripSchema = z.object({
  driverId: z.string().min(1, 'Driver is required'),
  truckId: z.string().min(1, 'Truck is required'),
  fromWarehouseId: z.string().min(1, 'Origin warehouse is required'),
  toWarehouseId: z.string().min(1, 'Destination warehouse is required'),
  departureDate: z.string().optional(),
  arrivalDate: z.string().optional(),
  originAddress: z.string().default(''),
  destinationAddress: z.string().default(''),
  distance: z.coerce.number().min(0).default(0),
  fuelUsed: z.coerce.number().min(0).default(0),
  baseRate: z.coerce.number().min(0).default(0),
  waitingCharges: z.coerce.number().min(0).default(0),
  otherCharges: z.coerce.number().min(0).default(0),
  cargoDescription: z.string().default(''),
  cargoWeight: z.coerce.number().min(0).default(0),
  status: z.enum(['pending', 'in_progress', 'completed', 'cancelled']),
  notes: z.string().default(''),
})

type TripFormValues = z.infer<typeof tripSchema>

const statusColors: Record<string, string> = {
  pending: 'bg-yellow-100 text-yellow-800 border-yellow-200 dark:bg-yellow-900/30 dark:text-yellow-400 dark:border-yellow-800/50',
  in_progress: 'bg-blue-100 text-blue-800 border-blue-200 dark:bg-blue-900/30 dark:text-blue-400 dark:border-blue-800/50',
  completed: 'bg-emerald-100 text-emerald-800 border-emerald-200 dark:bg-emerald-900/30 dark:text-emerald-400 dark:border-emerald-800/50',
  cancelled: 'bg-red-100 text-red-800 border-red-200 dark:bg-red-900/30 dark:text-red-400 dark:border-red-800/50',
}

const statusBorderColors: Record<string, string> = {
  pending: 'border-l-yellow-500',
  in_progress: 'border-l-blue-500',
  completed: 'border-l-emerald-500',
  cancelled: 'border-l-red-500',
}

function SortIcon({ field, sortField, sortDir }: { field: string; sortField: string; sortDir: 'asc' | 'desc' }) {
  if (sortField !== field) return <ChevronUp className="size-3 opacity-30" />
  return sortDir === 'asc' ? <ChevronUp className="size-3" /> : <ChevronDown className="size-3" />
}

const tripColumnDefs = [
  { key: 'tripNumber', label: 'Trip #', defaultVisible: true, group: 'Core' },
  { key: 'driver', label: 'Driver', defaultVisible: true, group: 'Core' },
  { key: 'truck', label: 'Truck', defaultVisible: false, group: 'Core' },
  { key: 'route', label: 'Route', defaultVisible: false, group: 'Core' },
  { key: 'status', label: 'Status', defaultVisible: true, group: 'Core' },
  { key: 'distance', label: 'Distance', defaultVisible: false, group: 'Financial' },
  { key: 'amount', label: 'Amount', defaultVisible: true, group: 'Financial' },
  { key: 'date', label: 'Date', defaultVisible: true, group: 'Financial' },
  { key: 'actions', label: 'Actions', defaultVisible: true, group: 'General' },
]

export default function TripsPage() {
  const queryClient = useQueryClient()
  const { setCurrentView } = useAppStore()
  const [search, setSearch] = useState('')
  const debouncedSearch = useDebounce(search, 300)
  const [statusFilter, setStatusFilter] = useState<string>('all')
  const [driverFilter, setDriverFilter] = useState<string>('all')
  const [formOpen, setFormOpen] = useState(false)
  const [viewOpen, setViewOpen] = useState(false)
  const [deleteOpen, setDeleteOpen] = useState(false)
  const [selectedTrip, setSelectedTrip] = useState<TripData | null>(null)
  const [imagePreviews, setImagePreviews] = useState<string[]>([])
  const [lightboxIndex, setLightboxIndex] = useState<number>(-1)
  const [detailDriverId, setDetailDriverId] = useState<string | null>(null)
  const [detailDriverName, setDetailDriverName] = useState<string | undefined>(undefined)
  const [currentPage, setCurrentPage] = useState(1)
  const pageSize = 10
  const [sortField, setSortField] = useState<string>('tripNumber')
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('asc')

  const columnVisibility = useColumnVisibility('trips', tripColumnDefs)

  // Listen for command palette "New Trip" action
  useEffect(() => {
    const handler = () => { setCurrentStep(0); setFormOpen(true) }
    window.addEventListener('ifleetpro:open-form:trips', handler)
    return () => window.removeEventListener('ifleetpro:open-form:trips', handler)
  }, [])

  const undoDelete = useUndoDelete<TripData>({
    entityName: 'Trip',
    queryKey: ['trips'],
    createFn: async (trip) => {
      const res = await fetch('/api/trips', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(trip),
      })
      if (!res.ok) throw new Error('Failed to undo delete')
    },
  })
  const [startDate, setStartDate] = useState('')
  const [endDate, setEndDate] = useState('')
  const [isPrinting, setIsPrinting] = useState(false)
  const [detailTruckId, setDetailTruckId] = useState<string | null>(null)

  // Form step indicator state
  const [currentStep, setCurrentStep] = useState(0)
  const stepSectionRefs = useRef<(HTMLDivElement | null)[]>([])
  const formScrollRef = useRef<HTMLDivElement | null>(null)

  const tripFormSteps = useMemo(() => [
    { id: 'assignment', label: 'Assignment', icon: <UserRound className="size-4" /> },
    { id: 'route', label: 'Route', icon: <Milestone className="size-4" /> },
    { id: 'schedule', label: 'Schedule', icon: <CalendarDays className="size-4" /> },
    { id: 'cargo-amount', label: 'Cargo & Amount', icon: <PackageOpen className="size-4" /> },
    { id: 'submit', label: 'Submit', icon: <ClipboardList className="size-4" /> },
  ], [])

  const handleFormScroll = useCallback(() => {
    const container = formScrollRef.current
    if (!container) return
    const scrollTop = container.scrollTop
    for (let i = stepSectionRefs.current.length - 1; i >= 0; i--) {
      const ref = stepSectionRefs.current[i]
      if (ref && ref.offsetTop <= scrollTop + 100) {
        setCurrentStep(i)
        break
      }
    }
  }, [])


  // Fetch data
  const { data: trips = [], isLoading, error, refetch } = useQuery<TripData[]>({
    queryKey: ['trips'],
    queryFn: async () => {
      const res = await fetch('/api/trips')
      if (!res.ok) throw new Error('Failed to fetch trips')
      return res.json()
    },
  })

  const { data: drivers = [] } = useQuery<Driver[]>({
    queryKey: ['drivers'],
    queryFn: async () => {
      const res = await fetch('/api/drivers')
      if (!res.ok) return []
      return res.json()
    },
  })

  const { data: trucks = [] } = useQuery<Truck[]>({
    queryKey: ['trucks'],
    queryFn: async () => {
      const res = await fetch('/api/trucks')
      if (!res.ok) return []
      return res.json()
    },
  })

  const { data: warehouses = [] } = useQuery<Warehouse[]>({
    queryKey: ['warehouses'],
    queryFn: async () => {
      const res = await fetch('/api/warehouses')
      if (!res.ok) return []
      return res.json()
    },
  })

  const { data: zoneRates = [] } = useQuery<ZoneRate[]>({
    queryKey: ['zone-rates'],
    queryFn: async () => {
      const res = await fetch('/api/zone-rates')
      if (!res.ok) return []
      return res.json()
    },
  })

  const form = useForm<TripFormValues>({
    resolver: zodResolver(tripSchema),
    defaultValues: {
      driverId: '', truckId: '', fromWarehouseId: '', toWarehouseId: '',
      departureDate: '', arrivalDate: '', originAddress: '', destinationAddress: '',
      distance: 0, fuelUsed: 0, baseRate: 0, waitingCharges: 0, otherCharges: 0,
      cargoDescription: '', cargoWeight: 0, status: 'pending', notes: '',
    },
  })

  const watchFromWarehouse = form.watch('fromWarehouseId')
  const watchToWarehouse = form.watch('toWarehouseId')
  const watchDistance = form.watch('distance')
  const watchBaseRate = form.watch('baseRate')
  const watchWaitingCharges = form.watch('waitingCharges')
  const watchOtherCharges = form.watch('otherCharges')

  // Auto-fill addresses from warehouse selection
  useEffect(() => {
    const fromWH = warehouses.find((w) => w.id === watchFromWarehouse)
    if (fromWH) form.setValue('originAddress', fromWH.region)
  }, [watchFromWarehouse, warehouses, form])

  useEffect(() => {
    const toWH = warehouses.find((w) => w.id === watchToWarehouse)
    if (toWH) form.setValue('destinationAddress', toWH.region)
  }, [watchToWarehouse, warehouses, form])

  // Auto-calculate rate from zone
  useEffect(() => {
    const fromWH = warehouses.find((w) => w.id === watchFromWarehouse)
    const toWH = warehouses.find((w) => w.id === watchToWarehouse)
    if (fromWH && toWH && watchDistance > 0) {
      const matchingRate = zoneRates.find(
        (r) => r.isActive &&
          ((r.fromRegion === fromWH.region && r.toRegion === toWH.region) ||
           (r.fromRegion === toWH.region && r.toRegion === fromWH.region))
      )
      if (matchingRate) {
        const calculated = matchingRate.ratePerKm * watchDistance
        form.setValue('baseRate', Math.max(calculated, matchingRate.minimumRate))
      }
    }
  }, [watchFromWarehouse, watchToWarehouse, watchDistance, warehouses, zoneRates, form])

  const totalAmount = useMemo(() => {
    return (Number(watchBaseRate) || 0) + (Number(watchWaitingCharges) || 0) + (Number(watchOtherCharges) || 0)
  }, [watchBaseRate, watchWaitingCharges, watchOtherCharges])

  // Image handling
  const handleImageUpload = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files
    if (!files) return
    Array.from(files).forEach((file) => {
      const reader = new FileReader()
      reader.onload = () => {
        setImagePreviews((prev) => [...prev, reader.result as string])
      }
      reader.readAsDataURL(file)
    })
    e.target.value = ''
  }, [])

  const removeImage = useCallback((index: number) => {
    setImagePreviews((prev) => prev.filter((_, i) => i !== index))
  }, [])

  const createMutation = useMutation({
    mutationFn: async (data: TripFormValues) => {
      const payload = {
        ...data,
        totalAmount,
        imageUrls: JSON.stringify(imagePreviews),
      }
      const res = await fetch('/api/trips', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })
      if (!res.ok) {
        const err = await res.json().catch(() => ({}))
        throw new Error(err.error || 'Failed to create trip')
      }
      return res.json()
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['trips'] })
      toast.success('Trip created successfully')
      setFormOpen(false)
      form.reset()
      setImagePreviews([])
    },
    onError: (err) => toast.error(err.message),
  })

  const updateMutation = useMutation({
    mutationFn: async ({ id, ...data }: { id: string } & Record<string, unknown>) => {
      const res = await fetch(`/api/trips/${id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      })
      if (!res.ok) {
        const err = await res.json().catch(() => ({}))
        throw new Error(err.error || 'Failed to update trip')
      }
      return res.json()
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['trips'] })
      toast.success('Trip updated successfully')
      setFormOpen(false)
      setSelectedTrip(null)
      form.reset()
      setImagePreviews([])
    },
    onError: (err) => toast.error(err.message),
  })

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      const res = await fetch(`/api/trips/${id}`, { method: 'DELETE' })
      if (!res.ok) {
        const err = await res.json().catch(() => ({}))
        throw new Error(err.error || 'Failed to delete trip')
      }
      return res.json()
    },
    onSuccess: (deletedTrip) => {
      queryClient.invalidateQueries({ queryKey: ['trips'] })
      setDeleteOpen(false)
      setSelectedTrip(null)
      undoDelete.executeWithUndo(deletedTrip as TripData)
    },
    onError: (err) => toast.error(err.message),
  })

  const handleEdit = (trip: TripData) => {
    setSelectedTrip(trip)
    let existingImages: string[] = []
    try { existingImages = JSON.parse(trip.imageUrls) } catch { existingImages = [] }
    setImagePreviews(existingImages)
    form.reset({
      driverId: trip.driverId,
      truckId: trip.truckId,
      fromWarehouseId: trip.fromWarehouseId,
      toWarehouseId: trip.toWarehouseId,
      departureDate: trip.departureDate ? trip.departureDate.split('T')[0] : '',
      arrivalDate: trip.arrivalDate ? trip.arrivalDate.split('T')[0] : '',
      originAddress: trip.originAddress,
      destinationAddress: trip.destinationAddress,
      distance: trip.distance,
      fuelUsed: trip.fuelUsed,
      baseRate: trip.baseRate,
      waitingCharges: trip.waitingCharges,
      otherCharges: trip.otherCharges,
      cargoDescription: trip.cargoDescription,
      cargoWeight: trip.cargoWeight,
      status: trip.status as TripFormValues['status'],
      notes: trip.notes,
    })
    setFormOpen(true)
  }

  const handleSaveDraft = () => {
    form.setValue('status', 'pending')
    form.handleSubmit(onSubmit)()
  }

  const handleAdd = () => {
    setSelectedTrip(null)
    setImagePreviews([])
    setCurrentStep(0)
    form.reset({
      driverId: '', truckId: '', fromWarehouseId: '', toWarehouseId: '',
      departureDate: '', arrivalDate: '', originAddress: '', destinationAddress: '',
      distance: 0, fuelUsed: 0, baseRate: 0, waitingCharges: 0, otherCharges: 0,
      cargoDescription: '', cargoWeight: 0, status: 'pending', notes: '',
    })
    setFormOpen(true)
  }

  const handleDuplicateTrip = (trip: TripData) => {
    handleAdd()
    setCurrentStep(0)
    form.reset({
      driverId: trip.driverId,
      truckId: trip.truckId,
      fromWarehouseId: trip.fromWarehouseId,
      toWarehouseId: trip.toWarehouseId,
      departureDate: '',
      arrivalDate: '',
      originAddress: trip.originAddress,
      destinationAddress: trip.destinationAddress,
      distance: trip.distance,
      fuelUsed: trip.fuelUsed,
      baseRate: trip.baseRate,
      waitingCharges: trip.waitingCharges,
      otherCharges: trip.otherCharges,
      cargoDescription: trip.cargoDescription,
      cargoWeight: trip.cargoWeight,
      status: 'pending',
      notes: trip.notes,
    })
    toast.info('Trip duplicated — review and save')
  }

  const onSubmit = (data: TripFormValues) => {
    const payload: Record<string, unknown> = { ...data, totalAmount, imageUrls: JSON.stringify(imagePreviews) }
    if (selectedTrip) {
      updateMutation.mutate({ id: selectedTrip.id, ...payload })
    } else {
      createMutation.mutate(payload)
    }
  }

  const toggleSort = (field: string) => {
    if (sortField === field) {
      setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'))
    } else {
      setSortField(field)
      setSortDir('asc')
    }
  }

  const filteredTrips = trips.filter((t) => {
    const s = debouncedSearch.toLowerCase()
    const matchSearch =
      t.tripNumber.toLowerCase().includes(s) ||
      t.driver?.driverName?.toLowerCase().includes(s) ||
      t.originAddress.toLowerCase().includes(s) ||
      t.destinationAddress.toLowerCase().includes(s)
    const matchStatus = statusFilter === 'all' || t.status === statusFilter
    const matchDriver = driverFilter === 'all' || t.driverId === driverFilter
    let matchDate = true
    if (startDate || endDate) {
      const tripDate = t.departureDate ? t.departureDate.split('T')[0] : ''
      if (startDate && tripDate < startDate) matchDate = false
      if (endDate && tripDate > endDate) matchDate = false
    }
    return matchSearch && matchStatus && matchDriver && matchDate
  }).sort((a, b) => {
    const dir = sortDir === 'asc' ? 1 : -1
    if (sortField === 'tripNumber') return dir * a.tripNumber.localeCompare(b.tripNumber)
    if (sortField === 'driverName') return dir * (a.driver?.driverName || '').localeCompare(b.driver?.driverName || '')
    if (sortField === 'status') return dir * a.status.localeCompare(b.status)
    if (sortField === 'distance') return dir * (a.distance - b.distance)
    if (sortField === 'amount') return dir * (a.totalAmount - b.totalAmount)
    if (sortField === 'date') return dir * (a.departureDate || '').localeCompare(b.departureDate || '')
    return 0
  })

  const hasDateFilter = startDate !== '' || endDate !== ''

  const clearDateFilters = () => {
    setStartDate('')
    setEndDate('')
    setCurrentPage(1)
  }

  const isSubmitting = createMutation.isPending || updateMutation.isPending

  const totalPages = Math.ceil(filteredTrips.length / pageSize)
  const paginatedTrips = filteredTrips.slice((currentPage - 1) * pageSize, currentPage * pageSize)

  // Status counts for filter badges
  const statusCounts = (() => {
    const counts: Record<string, number> = { all: trips.length }
    trips.forEach((t) => { counts[t.status] = (counts[t.status] || 0) + 1 })
    return counts
  })()

  // Parse images for view dialog
  const viewImages = useMemo(() => {
    if (!selectedTrip) return []
    try { return JSON.parse(selectedTrip.imageUrls) } catch { return [] }
  }, [selectedTrip])

  const isFormDirty = form.formState.isDirty
  const watchNotes = form.watch('notes')
  const watchCargoDescription = form.watch('cargoDescription')

  if (isLoading) return <PageSkeleton statsCount={4} filterRow tableRows={5} />

  if (error) {
    return (
      <div className="flex flex-col items-center justify-center h-[60vh] gap-4">
        <AlertCircle className="size-12 text-destructive" />
        <p className="text-muted-foreground">Failed to load trips</p>
        <Button variant="outline" onClick={() => refetch()}>Try Again</Button>
      </div>
    )
  }

  return (
    <div className="p-4 md:p-6 space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 pb-4 border-b">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <button onClick={() => setCurrentView('dashboard')} className="text-sm text-muted-foreground hover:text-foreground transition-colors">Dashboard</button>
            <ChevronRight className="size-3.5 text-muted-foreground" />
            <span className="text-sm font-medium">Trips</span>
          </div>
          <div className="flex items-center gap-3">
            <h1 className="text-2xl font-bold">Trips</h1>
            {!isLoading && <span className="text-sm font-medium text-muted-foreground bg-muted rounded-full px-2.5 py-0.5">{trips.length}</span>}
          </div>
          <p className="text-muted-foreground text-sm">Manage transport trips</p>
        </div>
        <div className="flex gap-2">
          <ColumnVisibilityMenu
            groupedColumns={columnVisibility.groupedColumns}
            isColumnVisible={columnVisibility.isColumnVisible}
            toggleColumn={columnVisibility.toggleColumn}
            showAll={columnVisibility.showAll}
            hideAll={columnVisibility.hideAll}
            visibleCount={columnVisibility.columnCount}
            totalCount={tripColumnDefs.length}
          />
          <Button
            variant="outline"
            size="sm"
            onClick={async () => {
              try {
                const res = await fetch('/api/trips')
                if (!res.ok) throw new Error('Failed to fetch trips')
                const data = await res.json()
                const exportData = data.map((t: TripData) => ({
                  tripNumber: t.tripNumber,
                  driverName: t.driver?.driverName || '',
                  truckPlate: t.truck?.plateNumber || '',
                  status: t.status,
                  origin: t.originAddress,
                  destination: t.destinationAddress,
                  distance: t.distance,
                  baseRate: t.baseRate,
                  waitingCharges: t.waitingCharges,
                  otherCharges: t.otherCharges,
                  totalAmount: t.totalAmount,
                  cargoDescription: t.cargoDescription,
                  cargoWeight: t.cargoWeight,
                  departureDate: t.departureDate ? t.departureDate.split('T')[0] : '',
                  arrivalDate: t.arrivalDate ? t.arrivalDate.split('T')[0] : '',
                }))
                exportToCSV(exportData, `trips-export-${new Date().toISOString().split('T')[0]}`)
                toast.success('Trips exported successfully')
              } catch {
                toast.error('Failed to export trips')
              }
            }}
          >
            <Download className="size-4" />
            Export CSV
          </Button>
          <Button onClick={handleAdd} size="sm">
            <Plus className="size-4" />
            New Trip
          </Button>
        </div>
      </div>

      {/* Filters */}
      <Card>
        <CardContent className="p-4">
          <div className="flex flex-col sm:flex-row gap-3">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 size-4 text-muted-foreground" />
              <Input
                placeholder="Search trips..."
                value={search}
                onChange={(e) => { setSearch(e.target.value); setCurrentPage(1) }}
                className="pl-9"
              />
            </div>
            <Select value={statusFilter} onValueChange={(val) => { setStatusFilter(val); setCurrentPage(1) }}>
              <SelectTrigger className="w-full sm:w-40">
                <SelectValue placeholder="Status" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">
                  <span className="flex items-center gap-2">All Status <Badge variant="secondary" className="ml-auto h-5 min-w-5 text-xs px-1">{statusCounts.all || 0}</Badge></span>
                </SelectItem>
                <SelectItem value="pending">
                  <span className="flex items-center gap-2">Pending <Badge variant="secondary" className="ml-auto h-5 min-w-5 text-xs px-1">{statusCounts.pending || 0}</Badge></span>
                </SelectItem>
                <SelectItem value="in_progress">
                  <span className="flex items-center gap-2">In Progress <Badge variant="secondary" className="ml-auto h-5 min-w-5 text-xs px-1">{statusCounts.in_progress || 0}</Badge></span>
                </SelectItem>
                <SelectItem value="completed">
                  <span className="flex items-center gap-2">Completed <Badge variant="secondary" className="ml-auto h-5 min-w-5 text-xs px-1">{statusCounts.completed || 0}</Badge></span>
                </SelectItem>
                <SelectItem value="cancelled">
                  <span className="flex items-center gap-2">Cancelled <Badge variant="secondary" className="ml-auto h-5 min-w-5 text-xs px-1">{statusCounts.cancelled || 0}</Badge></span>
                </SelectItem>
              </SelectContent>
            </Select>
            <Select value={driverFilter} onValueChange={(val) => { setDriverFilter(val); setCurrentPage(1) }}>
              <SelectTrigger className="w-full sm:w-44">
                <SelectValue placeholder="Driver" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Drivers</SelectItem>
                {drivers.map((d) => (
                  <SelectItem key={d.id} value={d.id}>{d.driverName}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          {/* Date Range Filter */}
          <div className="flex flex-col sm:flex-row sm:items-center gap-3 mt-3 pt-3 border-t border-border">
            <span className="text-xs font-medium text-muted-foreground uppercase tracking-wider flex items-center gap-1.5 whitespace-nowrap">
              <CalendarDays className="size-3.5 text-amber-500" />
              Date Range
            </span>
            <div className="flex flex-col sm:flex-row gap-2 flex-1">
              <DatePicker
                value={startDate}
                onChange={(val) => { setStartDate(val); setCurrentPage(1) }}
                className="w-full sm:w-auto"
                placeholder="Start date"
              />
              <span className="hidden sm:flex items-center text-muted-foreground text-sm">to</span>
              <DatePicker
                value={endDate}
                onChange={(val) => { setEndDate(val); setCurrentPage(1) }}
                className="w-full sm:w-auto"
                placeholder="End date"
              />
            </div>
            <div className="flex items-center gap-2">
              {hasDateFilter && (
                <Badge variant="secondary" className="bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400 text-xs">
                  Date filter active
                </Badge>
              )}
              <Button
                variant="ghost"
                size="sm"
                onClick={clearDateFilters}
                disabled={!hasDateFilter}
                className="text-muted-foreground hover:text-foreground"
              >
                <X className="size-3.5" />
                Clear
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Table */}
      <Card>
        <CardContent className="p-0">
          {filteredTrips.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-20 text-muted-foreground">
              <div className="relative mb-6">
                <motion.div className="size-20 rounded-2xl bg-muted flex items-center justify-center" animate={{ y: [0, -8, 0] }} transition={{ duration: 3, repeat: Infinity, ease: 'easeInOut' }}>
                  <Route className="size-10 opacity-30" />
                </motion.div>
                <motion.div className="absolute -top-1 -right-1 size-8 rounded-lg bg-muted/80 flex items-center justify-center" animate={{ y: [0, -6, 0] }} transition={{ duration: 3, repeat: Infinity, ease: 'easeInOut', delay: 0.3 }}>
                  <MapPin className="size-4 opacity-40" />
                </motion.div>
                <motion.div className="absolute -bottom-1 -left-1 size-8 rounded-lg bg-muted/80 flex items-center justify-center" animate={{ y: [0, -6, 0] }} transition={{ duration: 3, repeat: Infinity, ease: 'easeInOut', delay: 0.6 }}>
                  <Package className="size-4 opacity-40" />
                </motion.div>
              </div>
              <p className="text-base font-medium">No trips found</p>
              <p className="text-sm mt-1 max-w-xs text-center">Create your first trip to start tracking transport activities.</p>
              <ul className="text-xs text-muted-foreground mt-3 space-y-1">
                <li className="flex items-center gap-1.5"><span className="size-1 rounded-full bg-muted-foreground/50" /> Assign drivers and trucks to routes</li>
                <li className="flex items-center gap-1.5"><span className="size-1 rounded-full bg-muted-foreground/50" /> Auto-calculate amounts from zone rates</li>
                <li className="flex items-center gap-1.5"><span className="size-1 rounded-full bg-muted-foreground/50" /> Track trip status from start to completion</li>
              </ul>
              <Button variant="outline" size="sm" className="mt-5" onClick={handleAdd}>
                <Plus className="size-4" />
                Create Your First Trip
              </Button>
            </div>
          ) : (
            <>
              <div className="hidden lg:block overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      {columnVisibility.isColumnVisible('tripNumber') && (
                        <TableHead className="cursor-pointer select-none" onClick={() => toggleSort('tripNumber')}>
                          <span className="inline-flex items-center gap-1">Trip # <SortIcon field="tripNumber" sortField={sortField} sortDir={sortDir} /></span>
                        </TableHead>
                      )}
                      {columnVisibility.isColumnVisible('driver') && (
                        <TableHead className="cursor-pointer select-none" onClick={() => toggleSort('driverName')}>
                          <span className="inline-flex items-center gap-1">Driver <SortIcon field="driverName" sortField={sortField} sortDir={sortDir} /></span>
                        </TableHead>
                      )}
                      {columnVisibility.isColumnVisible('truck') && (
                        <TableHead>Truck</TableHead>
                      )}
                      {columnVisibility.isColumnVisible('route') && (
                        <TableHead>Route</TableHead>
                      )}
                      {columnVisibility.isColumnVisible('status') && (
                        <TableHead className="cursor-pointer select-none" onClick={() => toggleSort('status')}>
                          <span className="inline-flex items-center gap-1">Status <SortIcon field="status" sortField={sortField} sortDir={sortDir} /></span>
                        </TableHead>
                      )}
                      {columnVisibility.isColumnVisible('distance') && (
                        <TableHead className="text-right cursor-pointer select-none" onClick={() => toggleSort('distance')}>
                          <span className="inline-flex items-center gap-1">Distance <SortIcon field="distance" sortField={sortField} sortDir={sortDir} /></span>
                        </TableHead>
                      )}
                      {columnVisibility.isColumnVisible('amount') && (
                        <TableHead className="text-right cursor-pointer select-none" onClick={() => toggleSort('amount')}>
                          <span className="inline-flex items-center gap-1">Amount <SortIcon field="amount" sortField={sortField} sortDir={sortDir} /></span>
                        </TableHead>
                      )}
                      {columnVisibility.isColumnVisible('date') && (
                        <TableHead className="cursor-pointer select-none" onClick={() => toggleSort('date')}>
                          <span className="inline-flex items-center gap-1">Date <SortIcon field="date" sortField={sortField} sortDir={sortDir} /></span>
                        </TableHead>
                      )}
                      <TableHead className="text-right">Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {paginatedTrips.map((trip, idx) => (
                      <TableRow key={trip.id} className={cn('border-l-[3px] transition-colors hover:bg-muted/50 animate-[fadeInUp_0.3s_ease-out]', idx % 2 === 1 ? 'bg-muted/30' : '', statusBorderColors[trip.status])} style={{ animationDelay: `${idx * 30}ms` }}>
                        {columnVisibility.isColumnVisible('tripNumber') && (
                          <TableCell className="font-mono font-medium text-sm">{trip.tripNumber}</TableCell>
                        )}
                        {columnVisibility.isColumnVisible('driver') && (
                          <TableCell>
                            <div className="flex items-center gap-2">
                              <DriverAvatar name={trip.driver?.driverName} size="sm" />
                              <span
                                className="cursor-pointer hover:text-emerald-600 dark:hover:text-emerald-400 transition-colors"
                                onClick={() => { if (trip.driver?.id) { setDetailDriverId(trip.driver.id); setDetailDriverName(trip.driver?.driverName) } }}
                              >
                                {trip.driver?.driverName || '—'}
                              </span>
                            </div>
                          </TableCell>
                        )}
                        {columnVisibility.isColumnVisible('truck') && (
                          <TableCell className="text-sm">
                            {trip.truck ? (
                              <button
                                onClick={() => setDetailTruckId(trip.truckId)}
                                className="hover:underline hover:text-primary transition-colors"
                              >
                                {trip.truck.plateNumber}
                              </button>
                            ) : '—'}
                          </TableCell>
                        )}
                        {columnVisibility.isColumnVisible('route') && (
                          <TableCell>
                            <span className="text-xs text-muted-foreground">
                              {trip.originAddress || trip.fromWarehouse?.region || '—'}
                              <ArrowRight className="inline size-3 mx-1" />
                              {trip.destinationAddress || trip.toWarehouse?.region || '—'}
                            </span>
                          </TableCell>
                        )}
                        {columnVisibility.isColumnVisible('status') && (
                          <TableCell>
                            <StatusDropdown
                              currentStatus={trip.status}
                              onStatusChange={(newStatus) => {
                                updateMutation.mutate(
                                  { id: trip.id, status: newStatus },
                                  {
                                    onSuccess: () => {
                                      const label = trip.status === 'in_progress' ? 'In Progress' : trip.status.charAt(0).toUpperCase() + trip.status.slice(1)
                                      const newLabel = newStatus === 'in_progress' ? 'In Progress' : newStatus.charAt(0).toUpperCase() + newStatus.slice(1)
                                      toast.success(`Trip ${trip.tripNumber} status updated to ${newLabel}`)
                                    },
                                  }
                                )
                              }}
                              statuses={[
                                { value: 'pending', label: 'Pending', color: statusColors.pending, dotColor: 'bg-yellow-500' },
                                { value: 'in_progress', label: 'In Progress', color: statusColors.in_progress, dotColor: 'bg-blue-500' },
                                { value: 'completed', label: 'Completed', color: statusColors.completed, dotColor: 'bg-emerald-500' },
                                { value: 'cancelled', label: 'Cancelled', color: statusColors.cancelled, dotColor: 'bg-red-500' },
                              ]}
                              isLoading={updateMutation.isPending}
                              size="sm"
                            />
                          </TableCell>
                        )}
                        {columnVisibility.isColumnVisible('distance') && (
                          <TableCell className="text-right text-sm">{trip.distance} km</TableCell>
                        )}
                        {columnVisibility.isColumnVisible('amount') && (
                          <TableCell className="text-right font-medium">
                            <div>{formatCurrency(trip.totalAmount)}</div>
                            {(trip.waitingCharges > 0 || trip.otherCharges > 0) && (
                              <p className="text-xs text-muted-foreground font-normal">
                                base {formatCurrency(trip.baseRate)}{trip.waitingCharges > 0 ? ` + wait ${formatCurrency(trip.waitingCharges)}` : ''}{trip.otherCharges > 0 ? ` + other ${formatCurrency(trip.otherCharges)}` : ''}
                              </p>
                            )}
                          </TableCell>
                        )}
                        {columnVisibility.isColumnVisible('date') && (
                          <TableCell className="text-muted-foreground text-sm">
                            {trip.departureDate ? format(new Date(trip.departureDate), 'MMM d') : '—'}
                          </TableCell>
                        )}
                        <TableCell className="text-right">
                          <div className="flex justify-end gap-1">
                            <Button variant="ghost" size="icon" onClick={() => { setSelectedTrip(trip); setViewOpen(true) }}>
                              <Eye className="size-4" />
                            </Button>
                            <Button variant="ghost" size="icon" onClick={() => handleDuplicateTrip(trip)} title="Duplicate trip">
                              <Copy className="size-4" />
                            </Button>
                            <Button variant="ghost" size="icon" onClick={() => handleEdit(trip)}>
                              <Pencil className="size-4" />
                            </Button>
                            <Button variant="ghost" size="icon" onClick={() => { setSelectedTrip(trip); setDeleteOpen(true) }}>
                              <Trash2 className="size-4 text-destructive" />
                            </Button>
                          </div>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                  <TableFooter>
                    <TableRow className="bg-muted/50 font-semibold border-t-2 border-muted-foreground/20 hover:bg-muted/50">
                      <TableCell colSpan={columnVisibility.columnCount - 1} className="text-sm">
                        Totals ({filteredTrips.length} trip{filteredTrips.length !== 1 ? 's' : ''})
                      </TableCell>
                      <TableCell />
                    </TableRow>
                  </TableFooter>
                </Table>
              </div>

              {/* Mobile/Tablet */}
              <div className="lg:hidden divide-y">
                {paginatedTrips.map((trip) => (
                  <div key={trip.id} className="p-4 space-y-2">
                    <div className="flex items-start justify-between">
                      <div>
                        <div className="flex items-center gap-2">
                          <DriverAvatar name={trip.driver?.driverName} size="sm" />
                          <div>
                            <p className="font-mono font-medium text-sm">{trip.tripNumber}</p>
                            <p className="text-sm text-muted-foreground">
                              <span
                                className="cursor-pointer hover:text-emerald-600 dark:hover:text-emerald-400 transition-colors"
                                onClick={() => { if (trip.driver?.id) { setDetailDriverId(trip.driver.id); setDetailDriverName(trip.driver?.driverName) } }}
                              >
                                {trip.driver?.driverName}
                              </span>
                              {trip.truck && (
                                <button
                                  onClick={() => setDetailTruckId(trip.truckId)}
                                  className="hover:underline hover:text-primary transition-colors"
                                >
                                  {' · '}{trip.truck.plateNumber}
                                </button>
                              )}
                            </p>
                          </div>
                        </div>
                      </div>
                      <StatusDropdown
                        currentStatus={trip.status}
                        onStatusChange={(newStatus) => {
                          updateMutation.mutate(
                            { id: trip.id, status: newStatus },
                            {
                              onSuccess: () => {
                                const newLabel = newStatus === 'in_progress' ? 'In Progress' : newStatus.charAt(0).toUpperCase() + newStatus.slice(1)
                                toast.success(`Trip ${trip.tripNumber} status updated to ${newLabel}`)
                              },
                            }
                          )
                        }}
                        statuses={[
                          { value: 'pending', label: 'Pending', color: statusColors.pending, dotColor: 'bg-yellow-500' },
                          { value: 'in_progress', label: 'In Progress', color: statusColors.in_progress, dotColor: 'bg-blue-500' },
                          { value: 'completed', label: 'Completed', color: statusColors.completed, dotColor: 'bg-emerald-500' },
                          { value: 'cancelled', label: 'Cancelled', color: statusColors.cancelled, dotColor: 'bg-red-500' },
                        ]}
                        isLoading={updateMutation.isPending}
                        size="sm"
                      />
                    </div>
                    <p className="text-xs text-muted-foreground">
                      {trip.originAddress || trip.fromWarehouse?.region} → {trip.destinationAddress || trip.toWarehouse?.region}
                    </p>
                    <div className="flex items-center justify-between">
                      <span className="font-medium">{formatCurrency(trip.totalAmount)}</span>
                      <div className="flex gap-1">
                        <Button variant="ghost" size="icon" className="size-8" onClick={() => { setSelectedTrip(trip); setViewOpen(true) }}>
                          <Eye className="size-3.5" />
                        </Button>
                        <Button variant="ghost" size="icon" className="size-8" onClick={() => handleDuplicateTrip(trip)} title="Duplicate trip">
                          <Copy className="size-3.5" />
                        </Button>
                        <Button variant="ghost" size="icon" className="size-8" onClick={() => handleEdit(trip)}>
                          <Pencil className="size-3.5" />
                        </Button>
                        <Button variant="ghost" size="icon" className="size-8" onClick={() => { setSelectedTrip(trip); setDeleteOpen(true) }}>
                          <Trash2 className="size-3.5 text-destructive" />
                        </Button>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </>
          )}
        </CardContent>
        <DataPagination
          currentPage={currentPage}
          totalPages={totalPages}
          onPageChange={setCurrentPage}
          totalItems={filteredTrips.length}
          pageSize={pageSize}
        />
      </Card>

      {/* Add/Edit Dialog */}
      <Dialog open={formOpen} onOpenChange={(open) => { setFormOpen(open); if (!open) { setSelectedTrip(null); form.reset(); setImagePreviews([]) } }}>
        <DialogContent className="sm:max-w-3xl p-4 sm:p-6">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              {selectedTrip ? 'Edit Trip' : 'Create New Trip'}
              {isFormDirty && (
                <span className="inline-flex items-center gap-1 text-xs text-amber-600 dark:text-amber-400 font-normal">
                  <span className="size-1.5 rounded-full bg-amber-500 animate-pulse" />
                  Unsaved changes
                </span>
              )}
            </DialogTitle>
            <DialogDescription>
              {selectedTrip ? 'Update trip details' : 'Fill in trip information with auto-calculated rates'}
            </DialogDescription>
          </DialogHeader>
          <FormStepIndicator steps={tripFormSteps} currentStep={currentStep} className="mb-4 pb-3 border-b border-border" />
          <Form {...form}>
            <form onSubmit={form.handleSubmit(onSubmit)} className="flex flex-col flex-1 min-h-0">
              <div ref={formScrollRef} className="flex-1 overflow-y-auto pr-1 space-y-4" onScroll={handleFormScroll}>
              {/* Step 0: Assignment */}
              <div ref={(el) => { stepSectionRefs.current[0] = el }} className="bg-muted/20 dark:bg-muted/10 rounded-lg p-3 space-y-3">
              {/* Driver & Truck */}
              <div>
                <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider mb-3 flex items-center gap-1.5">
                  <UserRound className="size-3.5 text-blue-500" />
                  Assignment
                </p>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <FormField control={form.control} name="driverId" render={({ field }) => (
                  <FormFieldWrapper error={form.formState.errors.driverId?.message} label="Driver *" description="Only active drivers are shown">
                    <FormItem>
                      <Select onValueChange={field.onChange} value={field.value}>
                        <FormControl><SelectTrigger><SelectValue placeholder="Select driver" /></SelectTrigger></FormControl>
                        <SelectContent>
                          {drivers.map((d) => (
                            <SelectItem key={d.id} value={d.id}>{d.driverName}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </FormItem>
                  </FormFieldWrapper>
                )} />
                <FormField control={form.control} name="truckId" render={({ field }) => (
                  <FormFieldWrapper error={form.formState.errors.truckId?.message} label="Truck *" description="Available trucks in the fleet">
                    <FormItem>
                      <Select onValueChange={field.onChange} value={field.value}>
                        <FormControl><SelectTrigger><SelectValue placeholder="Select truck" /></SelectTrigger></FormControl>
                        <SelectContent>
                          {trucks.map((t) => (
                            <SelectItem key={t.id} value={t.id}>{t.truckName} ({t.plateNumber})</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </FormItem>
                  </FormFieldWrapper>
                )} />
                </div>
              </div>

              </div>
              {/* Step 1: Route */}
              <div ref={(el) => { stepSectionRefs.current[1] = el }} className="rounded-lg p-3 space-y-3">
              <div>
                <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider mb-3 flex items-center gap-1.5">
                  <Milestone className="size-3.5 text-emerald-500" />
                  Route
                </p>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <FormField control={form.control} name="fromWarehouseId" render={({ field }) => (
                  <FormFieldWrapper error={form.formState.errors.fromWarehouseId?.message} label="From Warehouse *">
                    <FormItem>
                      <Select onValueChange={field.onChange} value={field.value}>
                        <FormControl><SelectTrigger><SelectValue placeholder="Origin" /></SelectTrigger></FormControl>
                        <SelectContent>
                          {warehouses.filter((w) => w.isActive).map((w) => (
                            <SelectItem key={w.id} value={w.id}>{w.name} ({w.code})</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </FormItem>
                  </FormFieldWrapper>
                )} />
                <FormField control={form.control} name="toWarehouseId" render={({ field }) => (
                  <FormFieldWrapper error={form.formState.errors.toWarehouseId?.message} label="To Warehouse *" description="Only active warehouses are shown">
                    <FormItem>
                      <Select onValueChange={field.onChange} value={field.value}>
                        <FormControl><SelectTrigger><SelectValue placeholder="Destination" /></SelectTrigger></FormControl>
                        <SelectContent>
                          {warehouses.filter((w) => w.isActive).map((w) => (
                            <SelectItem key={w.id} value={w.id}>{w.name} ({w.code})</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </FormItem>
                  </FormFieldWrapper>
                )} />
                <FormField control={form.control} name="originAddress" render={({ field }) => (
                  <FormItem>
                    <FormLabel>Origin Address</FormLabel>
                    <FormControl><Input {...field} placeholder="Auto-filled from warehouse" /></FormControl>
                    <FormMessage />
                  </FormItem>
                )} />
                <FormField control={form.control} name="destinationAddress" render={({ field }) => (
                  <FormItem>
                    <FormLabel>Destination Address</FormLabel>
                    <FormControl><Input {...field} placeholder="Auto-filled from warehouse" /></FormControl>
                    <FormMessage />
                  </FormItem>
                )} />
                </div>
              </div>

              </div>
              {/* Step 2: Schedule */}
              <div ref={(el) => { stepSectionRefs.current[2] = el }} className="bg-muted/20 dark:bg-muted/10 rounded-lg p-3 space-y-3">
              <div>
                <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider mb-3 flex items-center gap-1.5">
                  <CalendarDays className="size-3.5 text-amber-500" />
                  Schedule & Metrics
                </p>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
                <FormField control={form.control} name="departureDate" render={({ field }) => (
                  <FormItem>
                    <FormLabel>Departure</FormLabel>
                    <FormControl><DatePicker value={field.value} onChange={(val) => field.onChange(val)} /></FormControl>
                    <FormMessage />
                  </FormItem>
                )} />
                <FormField control={form.control} name="arrivalDate" render={({ field }) => (
                  <FormItem>
                    <FormLabel>Arrival</FormLabel>
                    <FormControl><DatePicker value={field.value} onChange={(val) => field.onChange(val)} /></FormControl>
                    <FormMessage />
                  </FormItem>
                )} />
                <FormField control={form.control} name="distance" render={({ field }) => (
                  <FormFieldWrapper error={form.formState.errors.distance?.message} label="Distance (km)" description="Used to auto-calculate rate">
                    <FormItem>
                      <FormControl><Input type="number" step="0.1" {...field} /></FormControl>
                    </FormItem>
                  </FormFieldWrapper>
                )} />
                <FormField control={form.control} name="fuelUsed" render={({ field }) => (
                  <FormItem>
                    <FormLabel>Fuel Used (L)</FormLabel>
                    <FormControl><Input type="number" step="0.1" {...field} /></FormControl>
                    <FormMessage />
                  </FormItem>
                )} />
                </div>
              </div>

              </div>
              {/* Step 3: Cargo & Amount */}
              <div ref={(el) => { stepSectionRefs.current[3] = el }} className="rounded-lg p-3 space-y-3">
              <div>
                <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider mb-3 flex items-center gap-1.5">
                  <PackageOpen className="size-3.5 text-purple-500" />
                  Cargo
                </p>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <FormField control={form.control} name="cargoDescription" render={({ field }) => (
                  <FormItem>
                    <FormLabel>Cargo Description</FormLabel>
                    <FormControl><Input {...field} placeholder="e.g. Building materials" /></FormControl>
                    <div className="flex justify-end">
                      <span className="text-[10px] text-muted-foreground">{(watchCargoDescription || '').length}/200</span>
                    </div>
                    <FormMessage />
                  </FormItem>
                )} />
                <FormField control={form.control} name="cargoWeight" render={({ field }) => (
                  <FormItem>
                    <FormLabel>Cargo Weight (tons)</FormLabel>
                    <FormControl><Input type="number" step="0.1" {...field} /></FormControl>
                    <FormMessage />
                  </FormItem>
                )} />
                </div>
              </div>

              {/* Amount Calculation */}
              <div className="space-y-3">
                <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider flex items-center gap-1.5">
                  <DollarSign className="size-3.5 text-emerald-500" />
                  Amount Calculation
                </p>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                  <FormField control={form.control} name="baseRate" render={({ field }) => (
                    <FormItem>
                      <FormLabel>Base Rate (GHS)</FormLabel>
                      <FormControl><Input type="number" step="0.01" {...field} /></FormControl>
                      <FormMessage />
                    </FormItem>
                  )} />
                  <FormField control={form.control} name="waitingCharges" render={({ field }) => (
                    <FormItem>
                      <FormLabel>Waiting Charges (GHS)</FormLabel>
                      <FormControl><Input type="number" step="0.01" {...field} /></FormControl>
                      <FormMessage />
                    </FormItem>
                  )} />
                  <FormField control={form.control} name="otherCharges" render={({ field }) => (
                    <FormItem>
                      <FormLabel>Other Charges (GHS)</FormLabel>
                      <FormControl><Input type="number" step="0.01" {...field} /></FormControl>
                      <FormMessage />
                    </FormItem>
                  )} />
                </div>
                <div className="bg-emerald-50 dark:bg-emerald-900/30 border border-emerald-200 dark:border-emerald-800/50 rounded-lg p-4 flex items-center justify-between">
                  <span className="font-medium text-emerald-800 dark:text-emerald-400">Total Amount</span>
                  <span className="text-2xl font-bold text-emerald-700 dark:text-emerald-400">{formatCurrency(totalAmount)}</span>
                </div>
              </div>

              </div>
              {/* Step 4: Submit */}
              <div ref={(el) => { stepSectionRefs.current[4] = el }} className="bg-muted/20 dark:bg-muted/10 rounded-lg p-3 space-y-3">
              <div>
                <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider mb-3 flex items-center gap-1.5">
                  <ClipboardList className="size-3.5 text-rose-500" />
                  Status & Notes
                </p>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <FormField control={form.control} name="status" render={({ field }) => (
                  <FormItem>
                    <FormLabel>Status</FormLabel>
                    <Select onValueChange={field.onChange} value={field.value}>
                      <FormControl><SelectTrigger><SelectValue /></SelectTrigger></FormControl>
                      <SelectContent>
                        <SelectItem value="pending">Pending</SelectItem>
                        <SelectItem value="in_progress">In Progress</SelectItem>
                        <SelectItem value="completed">Completed</SelectItem>
                        <SelectItem value="cancelled">Cancelled</SelectItem>
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )} />
              </div>
              <FormField control={form.control} name="notes" render={({ field }) => (
                <FormItem className="sm:col-span-2">
                  <FormLabel>Notes</FormLabel>
                  <FormControl><Textarea {...field} placeholder="Trip notes..." rows={2} /></FormControl>
                  <div className="flex justify-end">
                    <span className="text-[10px] text-muted-foreground">{(watchNotes || '').length}/500</span>
                  </div>
                  <FormMessage />
                </FormItem>
              )} />
              </div>

              {/* Image Upload */}
              <div className="space-y-3">
                <h4 className="font-medium text-sm">Trip Images</h4>
                <div className="flex flex-wrap gap-3">
                  {imagePreviews.map((img, i) => (
                    <div key={i} className="relative group size-20 rounded-lg overflow-hidden border bg-muted">
                      <img src={img} alt={`Upload ${i + 1}`} className="size-full object-cover" />
                      <button
                        type="button"
                        onClick={() => removeImage(i)}
                        className="absolute top-1 right-1 size-5 bg-black/60 text-white rounded-full flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity"
                      >
                        <X className="size-3" />
                      </button>
                    </div>
                  ))}
                  <label className="size-20 rounded-lg border-2 border-dashed border-muted-foreground/30 flex flex-col items-center justify-center cursor-pointer hover:border-primary/50 hover:bg-muted/50 transition-colors gap-1">
                    <Upload className="size-4 text-muted-foreground" />
                    <span className="text-[10px] text-muted-foreground">Upload</span>
                    <input type="file" accept="image/*" multiple className="hidden" onChange={handleImageUpload} />
                  </label>
                </div>
                <p className="text-xs text-muted-foreground">PNG, JPG up to 5MB each. Drag &amp; drop or click to upload.</p>
              </div>

              </div>
              </div>
              <DialogFooter className="mt-4 pt-4 border-t shrink-0">
                <Button
                  type="button"
                  variant="ghost"
                  onClick={() => { setFormOpen(false); form.reset(); setImagePreviews([]) }}
                >
                  Cancel
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  disabled={isSubmitting}
                  onClick={handleSaveDraft}
                >
                  Save as Draft
                </Button>
                <Button type="submit" disabled={isSubmitting} className="hover:shadow-md transition-shadow">
                  {isSubmitting && <Loader2 className="size-4 animate-spin" />}
                  {selectedTrip ? 'Update Trip' : 'Create Trip'}
                </Button>
              </DialogFooter>
            </form>
          </Form>
        </DialogContent>
      </Dialog>

      {/* View Dialog */}
      <Dialog open={viewOpen} onOpenChange={(open) => { setViewOpen(open); if (!open) setLightboxIndex(-1) }}>
        <DialogContent className="sm:max-w-3xl">
          <DialogHeader>
            <DialogTitle className="flex items-center justify-between pr-8">
              <span>Trip Details — {selectedTrip?.tripNumber}</span>
            </DialogTitle>
            <div className="absolute right-4 top-4 flex items-center gap-1">
              <Button
                variant="ghost"
                size="icon"
                className="size-8"
                onClick={() => {
                  setIsPrinting(true)
                  setTimeout(() => {
                    window.print()
                    setTimeout(() => setIsPrinting(false), 500)
                  }, 100)
                }}
              >
                <Printer className="size-4" />
              </Button>
            </div>
          </DialogHeader>
          {selectedTrip && (
            <div className="space-y-6">
              {/* Status */}
              <div className="flex items-center gap-3">
                <Badge variant="outline" className={`text-sm ${statusColors[selectedTrip.status] || ''}`}>
                  {selectedTrip.status.replace('_', ' ')}
                </Badge>
                <span className="text-sm text-muted-foreground">
                  Created {format(new Date(selectedTrip.createdAt), 'MMM d, yyyy')}
                </span>
              </div>

              {/* Route Info */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <h4 className="text-sm font-medium text-muted-foreground">Driver & Truck</h4>
                  <p className="font-medium">{selectedTrip.driver?.driverName || '—'}</p>
                  <p className="text-sm text-muted-foreground">{selectedTrip.truck?.truckName} ({selectedTrip.truck?.plateNumber})</p>
                </div>
                <div className="space-y-2">
                  <h4 className="text-sm font-medium text-muted-foreground">Route</h4>
                  <p className="font-medium">
                    {selectedTrip.originAddress || selectedTrip.fromWarehouse?.region || '—'}
                    <ArrowRight className="inline size-3 mx-1.5" />
                    {selectedTrip.destinationAddress || selectedTrip.toWarehouse?.region || '—'}
                  </p>
                </div>
                <div className="space-y-2">
                  <h4 className="text-sm font-medium text-muted-foreground">Schedule</h4>
                  <p>Departure: {selectedTrip.departureDate ? format(new Date(selectedTrip.departureDate), 'MMM d, yyyy') : '—'}</p>
                  <p>Arrival: {selectedTrip.arrivalDate ? format(new Date(selectedTrip.arrivalDate), 'MMM d, yyyy') : '—'}</p>
                </div>
                <div className="space-y-2">
                  <h4 className="text-sm font-medium text-muted-foreground">Distance & Fuel</h4>
                  <p>{selectedTrip.distance} km · {selectedTrip.fuelUsed} L fuel</p>
                </div>
              </div>

              {/* Amount Breakdown */}
              <div className="bg-muted rounded-lg p-4 space-y-2">
                <h4 className="font-medium text-sm">💰 Amount Breakdown</h4>
                <div className="grid grid-cols-2 gap-2 text-sm">
                  <span className="text-muted-foreground">Base Rate:</span>
                  <span className="text-right">{formatCurrency(selectedTrip.baseRate)}</span>
                  <span className="text-muted-foreground">Waiting Charges:</span>
                  <span className="text-right">{formatCurrency(selectedTrip.waitingCharges)}</span>
                  <span className="text-muted-foreground">Other Charges:</span>
                  <span className="text-right">{formatCurrency(selectedTrip.otherCharges)}</span>
                  <Separator className="col-span-2" />
                  <span className="font-bold">Total:</span>
                  <span className="text-right font-bold text-lg">{formatCurrency(selectedTrip.totalAmount)}</span>
                </div>
              </div>

              {/* Cargo */}
              {(selectedTrip.cargoDescription || selectedTrip.cargoWeight > 0) && (
                <div className="space-y-1">
                  <h4 className="text-sm font-medium text-muted-foreground">Cargo</h4>
                  <p>{selectedTrip.cargoDescription || '—'} {selectedTrip.cargoWeight > 0 && `(${selectedTrip.cargoWeight} tons)`}</p>
                </div>
              )}

              {/* Notes */}
              {selectedTrip.notes && (
                <div className="space-y-1">
                  <h4 className="text-sm font-medium text-muted-foreground">Notes</h4>
                  <p className="text-sm">{selectedTrip.notes}</p>
                </div>
              )}

              {/* Images */}
              {viewImages.length > 0 && (
                <div className="space-y-3">
                  <h4 className="text-sm font-medium">📷 Trip Images</h4>
                  <div className="flex flex-wrap gap-3">
                    {viewImages.map((img, i) => (
                      <button
                        key={i}
                        type="button"
                        onClick={() => setLightboxIndex(i)}
                        className="size-24 rounded-lg overflow-hidden border hover:ring-2 hover:ring-primary transition-all"
                      >
                        <img src={img} alt={`Trip ${i + 1}`} className="size-full object-cover" />
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {/* Cash Advances & Incentives */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                {selectedTrip.cashAdvances && selectedTrip.cashAdvances.length > 0 && (
                  <div className="space-y-2">
                    <h4 className="text-sm font-medium text-muted-foreground">Cash Advances</h4>
                    {selectedTrip.cashAdvances.map((ca) => (
                      <div key={ca.id} className="flex justify-between text-sm border rounded p-2">
                        <span>{ca.purpose || 'Advance'}</span>
                        <span className="font-medium">{formatCurrency(ca.amount)}</span>
                      </div>
                    ))}
                  </div>
                )}
                {selectedTrip.incentives && selectedTrip.incentives.length > 0 && (
                  <div className="space-y-2">
                    <h4 className="text-sm font-medium text-muted-foreground">Incentives</h4>
                    {selectedTrip.incentives.map((inc) => (
                      <div key={inc.id} className="flex justify-between text-sm border rounded p-2">
                        <span>{inc.incentiveType}</span>
                        <span className="font-medium">{formatCurrency(inc.amount)}</span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* Print Content (hidden on screen, shown during print) */}
      <div className={cn('print-content fixed left-0 top-0 w-full bg-white p-8 text-black', isPrinting ? 'block' : 'hidden')}>
        {selectedTrip && (
          <div className="max-w-3xl mx-auto">
            {/* Print Header */}
            <div className="flex items-center justify-between border-b-2 border-gray-900 pb-4 mb-6">
              <div>
                <h1 className="text-2xl font-bold text-gray-900">iFleetPro</h1>
                <p className="text-sm text-gray-500">Fleet Management System</p>
              </div>
              <div className="text-right">
                <p className="text-sm font-medium text-gray-700">Trip Details</p>
                <p className="text-xs text-gray-400">Printed {format(new Date(), 'MMM d, yyyy · h:mm a')}</p>
              </div>
            </div>

            {/* Trip Number & Status */}
            <div className="flex items-center justify-between mb-6">
              <h2 className="text-xl font-bold">{selectedTrip.tripNumber}</h2>
              <span className="inline-block px-3 py-1 text-sm font-medium rounded border border-gray-300">
                {selectedTrip.status.replace('_', ' ').toUpperCase()}
              </span>
            </div>

            {/* Driver & Truck Info */}
            <div className="grid grid-cols-2 gap-6 mb-6">
              <div>
                <p className="text-xs font-medium text-gray-400 uppercase tracking-wider mb-1">Driver</p>
                <p className="font-medium">{selectedTrip.driver?.driverName || '—'}</p>
              </div>
              <div>
                <p className="text-xs font-medium text-gray-400 uppercase tracking-wider mb-1">Truck</p>
                <p className="font-medium">{selectedTrip.truck?.truckName} ({selectedTrip.truck?.plateNumber})</p>
              </div>
            </div>

            {/* Route */}
            <div className="border border-gray-200 rounded-lg p-4 mb-6">
              <p className="text-xs font-medium text-gray-400 uppercase tracking-wider mb-2">Route</p>
              <div className="flex items-center gap-2">
                <span className="font-medium">{selectedTrip.originAddress || selectedTrip.fromWarehouse?.region || '—'}</span>
                <span className="text-gray-400">→</span>
                <span className="font-medium">{selectedTrip.destinationAddress || selectedTrip.toWarehouse?.region || '—'}</span>
              </div>
            </div>

            {/* Distance & Dates */}
            <div className="grid grid-cols-3 gap-6 mb-6">
              <div>
                <p className="text-xs font-medium text-gray-400 uppercase tracking-wider mb-1">Distance</p>
                <p className="font-medium">{selectedTrip.distance} km</p>
              </div>
              <div>
                <p className="text-xs font-medium text-gray-400 uppercase tracking-wider mb-1">Departure</p>
                <p className="font-medium">{selectedTrip.departureDate ? format(new Date(selectedTrip.departureDate), 'MMM d, yyyy') : '—'}</p>
              </div>
              <div>
                <p className="text-xs font-medium text-gray-400 uppercase tracking-wider mb-1">Arrival</p>
                <p className="font-medium">{selectedTrip.arrivalDate ? format(new Date(selectedTrip.arrivalDate), 'MMM d, yyyy') : '—'}</p>
              </div>
            </div>

            {/* Amount Breakdown */}
            <div className="border border-gray-200 rounded-lg p-4 mb-6">
              <p className="text-xs font-medium text-gray-400 uppercase tracking-wider mb-3">Amount Breakdown</p>
              <div className="space-y-2">
                <div className="flex justify-between text-sm">
                  <span className="text-gray-600">Base Rate</span>
                  <span>{formatCurrency(selectedTrip.baseRate)}</span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-gray-600">Waiting Charges</span>
                  <span>{formatCurrency(selectedTrip.waitingCharges)}</span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-gray-600">Other Charges</span>
                  <span>{formatCurrency(selectedTrip.otherCharges)}</span>
                </div>
                <div className="border-t border-gray-300 pt-2 mt-2 flex justify-between font-bold">
                  <span>Total</span>
                  <span className="text-lg">{formatCurrency(selectedTrip.totalAmount)}</span>
                </div>
              </div>
            </div>

            {/* Cargo */}
            <div className="grid grid-cols-2 gap-6 mb-6">
              <div>
                <p className="text-xs font-medium text-gray-400 uppercase tracking-wider mb-1">Cargo Description</p>
                <p className="font-medium">{selectedTrip.cargoDescription || '—'}</p>
              </div>
              <div>
                <p className="text-xs font-medium text-gray-400 uppercase tracking-wider mb-1">Cargo Weight</p>
                <p className="font-medium">{selectedTrip.cargoWeight > 0 ? `${selectedTrip.cargoWeight} tons` : '—'}</p>
              </div>
            </div>

            {/* Notes */}
            {selectedTrip.notes && (
              <div className="mb-6">
                <p className="text-xs font-medium text-gray-400 uppercase tracking-wider mb-1">Notes</p>
                <p className="text-sm text-gray-700">{selectedTrip.notes}</p>
              </div>
            )}

            {/* Print Footer */}
            <div className="border-t border-gray-300 pt-4 mt-8 text-center">
              <p className="text-xs text-gray-400">
                iFleetPro Fleet Management System · Printed on {format(new Date(), 'EEEE, MMMM d, yyyy')} at {format(new Date(), 'h:mm a')}
              </p>
            </div>
          </div>
        )}
      </div>

      {/* Lightbox */}
      {lightboxIndex >= 0 && viewImages[lightboxIndex] && (
        <div className="fixed inset-0 z-[60] bg-black/90 flex items-center justify-center" onClick={() => setLightboxIndex(-1)}>
          <button className="absolute top-4 right-4 text-white p-2" onClick={() => setLightboxIndex(-1)}>
            <X className="size-6" />
          </button>
          {lightboxIndex > 0 && (
            <button className="absolute left-4 text-white p-2" onClick={(e) => { e.stopPropagation(); setLightboxIndex(lightboxIndex - 1) }}>
              <ChevronLeft className="size-8" />
            </button>
          )}
          <img src={viewImages[lightboxIndex]} alt="" className="max-w-[90vw] max-h-[90vh] object-contain" onClick={(e) => e.stopPropagation()} />
          {lightboxIndex < viewImages.length - 1 && (
            <button className="absolute right-4 text-white p-2" onClick={(e) => { e.stopPropagation(); setLightboxIndex(lightboxIndex + 1) }}>
              <ChevronRight className="size-8" />
            </button>
          )}
        </div>
      )}

      {/* Delete Confirmation */}
      <AlertDialog open={deleteOpen} onOpenChange={setDeleteOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Trip</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete trip <strong>{selectedTrip?.tripNumber}</strong>? This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => selectedTrip && deleteMutation.mutate(selectedTrip.id)}
              className="bg-destructive text-white hover:bg-destructive/90"
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Truck Detail Sheet */}
      <TruckDetailSheet
        truckId={detailTruckId}
        open={!!detailTruckId}
        onOpenChange={(open) => { if (!open) setDetailTruckId(null) }}
      />

      {/* Driver Detail Sheet */}
      <DriverDetailSheet
        driverId={detailDriverId}
        driverName={detailDriverName}
        open={!!detailDriverId}
        onOpenChange={(open) => { if (!open) setDetailDriverId(null) }}
      />
    </div>
  )
}
