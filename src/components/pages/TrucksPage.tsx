'use client'

import { useState, useEffect, useRef, useMemo, useCallback } from 'react'
import { useDebounce } from '@/hooks/use-debounce'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { format } from 'date-fns'
import {
  Plus,
  Search,
  Eye,
  Pencil,
  Trash2,
  Truck,
  AlertCircle,
  Loader2,
  Wrench,
  Warehouse,
  Route,
  ChevronRight,
  ChevronUp,
  ChevronDown,
  Fuel,
  Gauge,
  Upload,
  ClipboardList,
  User,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { useAppStore } from '@/lib/store'
import { useBulkSelect } from '@/hooks/use-bulk-select'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
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
import { toast } from '@/lib/toast-config'
import { TRUCK_FIELDS } from '@/lib/csv-import'
import { CsvImportDialog } from '@/components/ui/csv-import-dialog'
import { Checkbox } from '@/components/ui/checkbox'
import { DataPagination } from '@/components/ui/data-pagination'
import { FormStepIndicator } from '@/components/ui/form-step-indicator'
import { useUndoDelete } from '@/hooks/use-undo-delete'
import { TruckDetailSheet } from '@/components/ui/truck-detail-sheet'

// ─── Types ───────────────────────────────────────────────────────────────────

interface TruckDriver {
  id: string
  firstName: string
  lastName: string
  phone: string | null
  status: string
}

interface TruckData {
  id: string
  plateNumber: string
  make: string
  model: string
  year: number
  vinNumber?: string | null
  engineNumber?: string | null
  chassisNumber?: string | null
  color?: string | null
  fuelType: string
  tankCapacity?: number | null
  status: string
  currentMileage: number
  driverId?: string | null
  driver?: TruckDriver | null
  notes?: string | null
  insuranceStatus: string
  nextServiceDate?: string | null
  createdAt: string
  updatedAt: string
}

// ─── Schema ──────────────────────────────────────────────────────────────────

const truckSchema = z.object({
  plateNumber: z.string().min(2, 'Plate number is required'),
  make: z.string().min(1, 'Make is required (e.g. Mercedes-Benz)'),
  model: z.string().min(1, 'Model is required (e.g. Actros)'),
  year: z.coerce.number().min(1990).max(2035),
  vinNumber: z.string().optional().or(z.literal('')),
  engineNumber: z.string().optional().or(z.literal('')),
  chassisNumber: z.string().optional().or(z.literal('')),
  color: z.string().optional().or(z.literal('')),
  fuelType: z.string().default('Diesel'),
  tankCapacity: z.coerce.number().min(0).optional().or(z.literal('')),
  status: z.string().default('active'),
  currentMileage: z.coerce.number().min(0).default(0),
  driverId: z.string().optional().or(z.literal('')),
  insuranceStatus: z.string().default('none'),
  nextServiceDate: z.string().optional().or(z.literal('')),
  notes: z.string().optional().or(z.literal('')),
})

type TruckFormValues = z.infer<typeof truckSchema>

// ─── Constants ───────────────────────────────────────────────────────────────

const statusColors: Record<string, string> = {
  active: 'bg-emerald-100 text-emerald-800 border-emerald-200 dark:bg-emerald-900/30 dark:text-emerald-400 dark:border-emerald-800/50',
  inactive: 'bg-gray-100 text-gray-800 border-gray-200 dark:bg-gray-800/30 dark:text-gray-400 dark:border-gray-700/50',
  maintenance: 'bg-amber-100 text-amber-800 border-amber-200 dark:bg-amber-900/30 dark:text-amber-400 dark:border-amber-800/50',
  decommissioned: 'bg-red-100 text-red-800 border-red-200 dark:bg-red-900/30 dark:text-red-400 dark:border-red-800/50',
  out_of_service: 'bg-red-100 text-red-800 border-red-200 dark:bg-red-900/30 dark:text-red-400 dark:border-red-800/50',
}

const statusBorderColors: Record<string, string> = {
  active: 'border-l-emerald-500',
  inactive: 'border-l-gray-400',
  maintenance: 'border-l-amber-500',
  decommissioned: 'border-l-red-500',
  out_of_service: 'border-l-red-500',
}

const insuranceStatusColors: Record<string, string> = {
  active: 'text-emerald-600 dark:text-emerald-400',
  expired: 'text-red-600 dark:text-red-400',
  none: 'text-muted-foreground',
}

function SortIcon({ field, sortField, sortDir }: { field: string; sortField: string; sortDir: 'asc' | 'desc' }) {
  if (sortField !== field) return <ChevronUp className="size-3 opacity-30" />
  return sortDir === 'asc' ? <ChevronUp className="size-3" /> : <ChevronDown className="size-3" />
}

function formatStatus(status: string) {
  return status.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase())
}

// ─── Component ───────────────────────────────────────────────────────────────

export default function TrucksPage() {
  const queryClient = useQueryClient()
  const { setCurrentView } = useAppStore()
  const [search, setSearch] = useState('')
  const debouncedSearch = useDebounce(search, 300)
  const [formOpen, setFormOpen] = useState(false)
  const [viewOpen, setViewOpen] = useState(false)
  const [deleteOpen, setDeleteOpen] = useState(false)
  const [selectedTruck, setSelectedTruck] = useState<TruckData | null>(null)
  const [statusFilter, setStatusFilter] = useState<string>('all')
  const [sortField, setSortField] = useState<string>('make')
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('asc')
  const [currentPage, setCurrentPage] = useState(1)
  const pageSize = 10
  const [bulkDeleteOpen, setBulkDeleteOpen] = useState(false)
  const [importOpen, setImportOpen] = useState(false)
  const [detailTruckId, setDetailTruckId] = useState<string | null>(null)
  const bulkSelect = useBulkSelect<TruckData>()

  // Form step indicator state
  const [currentStep, setCurrentStep] = useState(0)
  const stepSectionRefs = useRef<(HTMLDivElement | null)[]>([])
  const formScrollRef = useRef<HTMLDivElement | null>(null)

  const truckFormSteps = useMemo(() => [
    { id: 'info', label: 'Truck Info', icon: <Truck className="size-4" /> },
    { id: 'specs', label: 'Specifications', icon: <Gauge className="size-4" /> },
    { id: 'notes', label: 'Notes', icon: <ClipboardList className="size-4" /> },
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

  // Listen for command palette "Add Truck" action
  useEffect(() => {
    const handler = () => { setCurrentStep(0); setFormOpen(true) }
    window.addEventListener('ifleetpro:open-form:trucks', handler)
    return () => window.removeEventListener('ifleetpro:open-form:trucks', handler)
  }, [])

  const undoDelete = useUndoDelete<TruckData>({
    entityName: 'Truck',
    queryKey: ['trucks'],
    createFn: async (truck) => {
      const res = await fetch('/api/trucks', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(truck),
      })
      if (!res.ok) throw new Error('Failed to undo delete')
    },
  })

  const bulkDeleteMutation = useMutation({
    mutationFn: async (ids: string[]) => {
      const res = await fetch('/api/trucks/bulk', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'delete', ids }),
      })
      if (!res.ok) {
        const err = await res.json().catch(() => ({}))
        throw new Error(err.error || 'Failed to delete trucks')
      }
      return res.json()
    },
    onSuccess: (result) => {
      queryClient.invalidateQueries({ queryKey: ['trucks'] })
      const msg = result.failed > 0
        ? `${result.success} truck(s) deleted, ${result.failed} failed`
        : `${result.success} truck(s) deleted successfully`
      toast.success(msg)
      bulkSelect.clearSelection()
      setBulkDeleteOpen(false)
    },
    onError: (err) => toast.error(err.message),
  })

  const { data: trucksResponse, isLoading, error, refetch } = useQuery<{
    data: TruckData[]
    total: number
  }>({
    queryKey: ['trucks', debouncedSearch, statusFilter],
    queryFn: async () => {
      const params = new URLSearchParams()
      params.set('limit', '200') // fetch all for client-side filtering
      if (debouncedSearch) params.set('search', debouncedSearch)
      if (statusFilter && statusFilter !== 'all') params.set('status', statusFilter)
      const res = await fetch(`/api/trucks?${params.toString()}`)
      if (!res.ok) throw new Error('Failed to fetch trucks')
      return res.json()
    },
  })

  const trucks = trucksResponse?.data || []

  const form = useForm<TruckFormValues>({
    resolver: zodResolver(truckSchema),
    defaultValues: {
      plateNumber: '',
      make: '',
      model: '',
      year: new Date().getFullYear(),
      vinNumber: '',
      engineNumber: '',
      chassisNumber: '',
      color: '',
      fuelType: 'Diesel',
      tankCapacity: '',
      status: 'active',
      currentMileage: 0,
      driverId: '',
      insuranceStatus: 'none',
      nextServiceDate: '',
      notes: '',
    },
  })

  const createMutation = useMutation({
    mutationFn: async (data: TruckFormValues) => {
      const payload: Record<string, unknown> = {
        plateNumber: data.plateNumber,
        make: data.make,
        model: data.model,
        year: Number(data.year),
        vinNumber: data.vinNumber || undefined,
        engineNumber: data.engineNumber || undefined,
        chassisNumber: data.chassisNumber || undefined,
        color: data.color || undefined,
        fuelType: data.fuelType,
        tankCapacity: data.tankCapacity ? Number(data.tankCapacity) : undefined,
        status: data.status,
        currentMileage: Number(data.currentMileage) || 0,
        driverId: data.driverId || undefined,
        insuranceStatus: data.insuranceStatus || 'none',
        nextServiceDate: data.nextServiceDate || undefined,
        notes: data.notes || undefined,
      }
      const res = await fetch('/api/trucks', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })
      if (!res.ok) {
        const err = await res.json().catch(() => ({}))
        throw new Error(err.error || 'Failed to create truck')
      }
      return res.json()
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['trucks'] })
      toast.success('Truck created successfully')
      setFormOpen(false)
      form.reset()
    },
    onError: (err) => toast.error(err.message),
  })

  const updateMutation = useMutation({
    mutationFn: async ({ id, ...data }: { id: string } & Record<string, unknown>) => {
      const res = await fetch(`/api/trucks/${id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      })
      if (!res.ok) {
        const err = await res.json().catch(() => ({}))
        throw new Error(err.error || 'Failed to update truck')
      }
      return res.json()
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['trucks'] })
      toast.success('Truck updated successfully')
      setFormOpen(false)
      setSelectedTruck(null)
      form.reset()
    },
    onError: (err) => toast.error(err.message),
  })

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      const res = await fetch(`/api/trucks/${id}`, { method: 'DELETE' })
      if (!res.ok) {
        const err = await res.json().catch(() => ({}))
        throw new Error(err.error || 'Failed to delete truck')
      }
      return res.json()
    },
    onSuccess: (deletedTruck) => {
      queryClient.invalidateQueries({ queryKey: ['trucks'] })
      setDeleteOpen(false)
      setSelectedTruck(null)
      undoDelete.executeWithUndo(deletedTruck as TruckData)
    },
    onError: (err) => toast.error(err.message),
  })

  const handleEdit = (truck: TruckData) => {
    setSelectedTruck(truck)
    form.reset({
      plateNumber: truck.plateNumber,
      make: truck.make,
      model: truck.model,
      year: truck.year,
      vinNumber: truck.vinNumber || '',
      engineNumber: truck.engineNumber || '',
      chassisNumber: truck.chassisNumber || '',
      color: truck.color || '',
      fuelType: truck.fuelType,
      tankCapacity: truck.tankCapacity || '',
      status: truck.status,
      currentMileage: truck.currentMileage,
      driverId: truck.driverId || '',
      insuranceStatus: truck.insuranceStatus || 'none',
      nextServiceDate: truck.nextServiceDate ? truck.nextServiceDate.split('T')[0] : '',
      notes: truck.notes || '',
    })
    setFormOpen(true)
  }

  const handleAdd = () => {
    setSelectedTruck(null)
    setCurrentStep(0)
    form.reset({
      plateNumber: '',
      make: '',
      model: '',
      year: new Date().getFullYear(),
      vinNumber: '',
      engineNumber: '',
      chassisNumber: '',
      color: '',
      fuelType: 'Diesel',
      tankCapacity: '',
      status: 'active',
      currentMileage: 0,
      driverId: '',
      insuranceStatus: 'none',
      nextServiceDate: '',
      notes: '',
    })
    setFormOpen(true)
  }

  const onSubmit = (data: TruckFormValues) => {
    const payload: Record<string, unknown> = {
      plateNumber: data.plateNumber,
      make: data.make,
      model: data.model,
      year: Number(data.year),
      vinNumber: data.vinNumber || undefined,
      engineNumber: data.engineNumber || undefined,
      chassisNumber: data.chassisNumber || undefined,
      color: data.color || undefined,
      fuelType: data.fuelType,
      tankCapacity: data.tankCapacity ? Number(data.tankCapacity) : undefined,
      status: data.status,
      currentMileage: Number(data.currentMileage) || 0,
      driverId: data.driverId || undefined,
      insuranceStatus: data.insuranceStatus || 'none',
      nextServiceDate: data.nextServiceDate || undefined,
      notes: data.notes || undefined,
    }

    if (selectedTruck) {
      updateMutation.mutate({ id: selectedTruck.id, ...payload })
    } else {
      createMutation.mutate(data)
    }
  }

  const filteredTrucks = trucks.filter((t) => {
    // Server-side search is handled, but also filter locally by make/model
    if (debouncedSearch) {
      const s = debouncedSearch.toLowerCase()
      const matchPlate = t.plateNumber.toLowerCase().includes(s)
      const matchMake = t.make.toLowerCase().includes(s)
      const matchModel = t.model.toLowerCase().includes(s)
      if (!matchPlate && !matchMake && !matchModel) return false
    }
    const matchStatus = statusFilter === 'all' || t.status === statusFilter
    return matchStatus
  }).sort((a, b) => {
    const dir = sortDir === 'asc' ? 1 : -1
    if (sortField === 'make') return dir * a.make.localeCompare(b.make)
    if (sortField === 'plateNumber') return dir * a.plateNumber.localeCompare(b.plateNumber)
    if (sortField === 'status') return dir * a.status.localeCompare(b.status)
    if (sortField === 'year') return dir * (a.year - b.year)
    return 0
  })

  const toggleSort = (field: string) => {
    if (sortField === field) {
      setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'))
    } else {
      setSortField(field)
      setSortDir('asc')
    }
  }

  const totalPages = Math.ceil(filteredTrucks.length / pageSize)
  const paginatedTrucks = filteredTrucks.slice((currentPage - 1) * pageSize, currentPage * pageSize)

  const isSubmitting = createMutation.isPending || updateMutation.isPending

  if (isLoading) return <PageSkeleton statsCount={3} filterRow tableRows={5} />

  if (error) {
    return (
      <div className="flex flex-col items-center justify-center h-[60vh] gap-4">
        <AlertCircle className="size-12 text-destructive" />
        <p className="text-muted-foreground">Failed to load trucks</p>
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
            <span className="text-sm font-medium">Trucks</span>
          </div>
          <div className="flex items-center gap-3">
            <h1 className="text-2xl font-bold">Trucks</h1>
            <span className="text-sm font-medium text-muted-foreground bg-muted rounded-full px-2.5 py-0.5">{trucksResponse?.total ?? trucks.length}</span>
          </div>
          <p className="text-muted-foreground text-sm">Manage your truck fleet</p>
        </div>
        <div className="flex gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => setImportOpen(true)}
          >
            <Upload className="size-4" />
            Import CSV
          </Button>
          <Button onClick={handleAdd} size="sm">
            <Plus className="size-4" />
            Add Truck
          </Button>
        </div>
      </div>

      {/* Status Distribution */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <div className="flex items-center gap-2 rounded-lg bg-emerald-50 dark:bg-emerald-900/20 border border-emerald-100 dark:border-emerald-800/50 px-3 py-2.5">
          <Route className="size-4 text-emerald-600 dark:text-emerald-400" />
          <div className="text-sm">
            <p className="text-muted-foreground text-xs">Active</p>
            <p className="font-semibold text-emerald-700 dark:text-emerald-400">{trucks.filter((t) => t.status === 'active').length}</p>
          </div>
        </div>
        <div className="flex items-center gap-2 rounded-lg bg-amber-50 dark:bg-amber-900/20 border border-amber-100 dark:border-amber-800/50 px-3 py-2.5">
          <Wrench className="size-4 text-amber-600 dark:text-amber-400" />
          <div className="text-sm">
            <p className="text-muted-foreground text-xs">Maintenance</p>
            <p className="font-semibold text-amber-700 dark:text-amber-400">{trucks.filter((t) => t.status === 'maintenance').length}</p>
          </div>
        </div>
        <div className="flex items-center gap-2 rounded-lg bg-gray-50 dark:bg-gray-800/30 border border-gray-100 dark:border-gray-700/50 px-3 py-2.5">
          <Warehouse className="size-4 text-gray-500 dark:text-gray-400" />
          <div className="text-sm">
            <p className="text-muted-foreground text-xs">Inactive</p>
            <p className="font-semibold text-gray-700 dark:text-gray-400">{trucks.filter((t) => t.status === 'inactive' || t.status === 'decommissioned' || t.status === 'out_of_service').length}</p>
          </div>
        </div>
        <div className="flex items-center gap-2 rounded-lg bg-muted/60 border border-muted px-3 py-2.5">
          <Truck className="size-4 text-muted-foreground" />
          <div className="text-sm">
            <p className="text-muted-foreground text-xs">Total Fleet</p>
            <p className="font-semibold">{trucks.length}</p>
          </div>
        </div>
      </div>

      {/* Filters */}
      <Card>
        <CardContent className="p-4">
          <div className="flex flex-col sm:flex-row gap-3">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 size-4 text-muted-foreground" />
              <Input
                placeholder="Search by plate number, make, or model..."
                value={search}
                onChange={(e) => { setSearch(e.target.value); setCurrentPage(1) }}
                className="pl-9"
              />
            </div>
            <Select value={statusFilter} onValueChange={(val) => { setStatusFilter(val); setCurrentPage(1) }}>
              <SelectTrigger className="w-full sm:w-44">
                <SelectValue placeholder="Filter status" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Status</SelectItem>
                <SelectItem value="active">Active</SelectItem>
                <SelectItem value="inactive">Inactive</SelectItem>
                <SelectItem value="maintenance">Maintenance</SelectItem>
                <SelectItem value="decommissioned">Decommissioned</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardContent className="p-0">
          {filteredTrucks.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-20 text-muted-foreground">
              <div className="relative mb-6">
                <div className="size-20 rounded-2xl bg-muted flex items-center justify-center">
                  <Truck className="size-10 opacity-30" />
                </div>
                <div className="absolute -top-1 -right-1 size-8 rounded-lg bg-muted/80 flex items-center justify-center">
                  <Wrench className="size-4 opacity-40" />
                </div>
                <div className="absolute -bottom-1 -left-1 size-8 rounded-lg bg-muted/80 flex items-center justify-center">
                  <Gauge className="size-4 opacity-40" />
                </div>
              </div>
              <p className="text-base font-medium">No trucks found</p>
              <p className="text-sm mt-1 max-w-xs text-center">Register your first truck to start tracking your fleet operations.</p>
              <ul className="text-xs text-muted-foreground mt-3 space-y-1">
                <li className="flex items-center gap-1.5"><span className="size-1 rounded-full bg-muted-foreground/50" /> Track mileage and maintenance schedules</li>
                <li className="flex items-center gap-1.5"><span className="size-1 rounded-full bg-muted-foreground/50" /> Monitor fuel consumption and efficiency</li>
                <li className="flex items-center gap-1.5"><span className="size-1 rounded-full bg-muted-foreground/50" /> Assign trucks to transport trips</li>
              </ul>
              <Button variant="outline" size="sm" className="mt-5" onClick={handleAdd}>
                <Plus className="size-4" />
                Add Your First Truck
              </Button>
            </div>
          ) : (
            <>
              {/* Desktop Table */}
              <div className="hidden md:block overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="w-10">
                        <Checkbox
                          checked={bulkSelect.isAllSelected(paginatedTrucks)}
                          onCheckedChange={() => bulkSelect.toggleAll(paginatedTrucks)}
                          aria-label="Select all trucks"
                        />
                      </TableHead>
                      <TableHead className="cursor-pointer select-none" onClick={() => toggleSort('plateNumber')}>
                        <span className="inline-flex items-center gap-1">Plate # <SortIcon field="plateNumber" sortField={sortField} sortDir={sortDir} /></span>
                      </TableHead>
                      <TableHead className="cursor-pointer select-none" onClick={() => toggleSort('make')}>
                        <span className="inline-flex items-center gap-1">Make / Model <SortIcon field="make" sortField={sortField} sortDir={sortDir} /></span>
                      </TableHead>
                      <TableHead className="cursor-pointer select-none" onClick={() => toggleSort('year')}>
                        <span className="inline-flex items-center gap-1">Year <SortIcon field="year" sortField={sortField} sortDir={sortDir} /></span>
                      </TableHead>
                      <TableHead>Fuel</TableHead>
                      <TableHead className="cursor-pointer select-none" onClick={() => toggleSort('status')}>
                        <span className="inline-flex items-center gap-1">Status <SortIcon field="status" sortField={sortField} sortDir={sortDir} /></span>
                      </TableHead>
                      <TableHead>Mileage</TableHead>
                      <TableHead>Driver</TableHead>
                      <TableHead className="text-right">Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {paginatedTrucks.map((truck, idx) => (
                      <TableRow key={truck.id} className={cn('border-l-[3px] transition-colors hover:bg-muted/50 animate-[fadeInUp_0.3s_ease-out]', idx % 2 === 1 ? 'bg-muted/30' : '', statusBorderColors[truck.status] || '', bulkSelect.isSelected(truck.id) && 'bg-emerald-50/50 dark:bg-emerald-900/10')} style={{ animationDelay: `${idx * 30}ms` }}>
                        <TableCell>
                          <Checkbox
                            checked={bulkSelect.isSelected(truck.id)}
                            onCheckedChange={() => bulkSelect.toggleOne(truck.id)}
                            aria-label={`Select ${truck.plateNumber}`}
                          />
                        </TableCell>
                        <TableCell className="font-mono font-medium">{truck.plateNumber}</TableCell>
                        <TableCell>
                          <button
                            onClick={() => setDetailTruckId(truck.id)}
                            className="font-medium hover:underline hover:text-primary transition-colors text-left"
                          >
                            {truck.make} {truck.model}
                          </button>
                        </TableCell>
                        <TableCell>{truck.year}</TableCell>
                        <TableCell>
                          <div className="flex items-center gap-1.5">
                            <Fuel className="size-3 text-muted-foreground" />
                            <span className="text-sm">{truck.fuelType}</span>
                          </div>
                        </TableCell>
                        <TableCell>
                          <Badge variant="outline" className={statusColors[truck.status] || ''}>
                            {formatStatus(truck.status)}
                          </Badge>
                        </TableCell>
                        <TableCell className="text-sm">{Math.round(truck.currentMileage).toLocaleString()} km</TableCell>
                        <TableCell>
                          {truck.driver ? (
                            <div className="flex items-center gap-1.5 text-sm">
                              <User className="size-3 text-muted-foreground" />
                              <span>{truck.driver.firstName} {truck.driver.lastName}</span>
                            </div>
                          ) : (
                            <span className="text-sm text-muted-foreground">—</span>
                          )}
                        </TableCell>
                        <TableCell className="text-right">
                          <div className="flex justify-end gap-1">
                            <Button variant="ghost" size="icon" onClick={() => { setSelectedTruck(truck); setViewOpen(true) }}>
                              <Eye className="size-4" />
                            </Button>
                            <Button variant="ghost" size="icon" onClick={() => handleEdit(truck)}>
                              <Pencil className="size-4" />
                            </Button>
                            <Button variant="ghost" size="icon" onClick={() => { setSelectedTruck(truck); setDeleteOpen(true) }}>
                              <Trash2 className="size-4 text-destructive" />
                            </Button>
                          </div>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>

              {/* Mobile Cards */}
              <div className="md:hidden divide-y">
                {paginatedTrucks.map((truck) => (
                  <div key={truck.id} className={cn('p-4 space-y-3 border-l-[3px] transition-colors active:bg-muted/50', statusBorderColors[truck.status] || '', bulkSelect.isSelected(truck.id) && 'bg-emerald-50/50 dark:bg-emerald-900/10')}>
                    <div className="flex items-center gap-3">
                      <Checkbox
                        checked={bulkSelect.isSelected(truck.id)}
                        onCheckedChange={() => bulkSelect.toggleOne(truck.id)}
                        aria-label={`Select ${truck.plateNumber}`}
                      />
                      <div className="flex-1 min-w-0">
                        <button
                          onClick={() => setDetailTruckId(truck.id)}
                          className="font-semibold truncate hover:underline hover:text-primary transition-colors text-left"
                        >
                          {truck.make} {truck.model}
                        </button>
                        <p className="text-sm text-muted-foreground font-mono">{truck.plateNumber} · {truck.year}</p>
                      </div>
                      <Badge variant="outline" className={cn('shrink-0 text-[10px] px-1.5', statusColors[truck.status] || '')}>
                        {formatStatus(truck.status)}
                      </Badge>
                    </div>
                    <div className="flex items-center gap-3 ml-7 text-sm text-muted-foreground">
                      <span className="flex items-center gap-1">
                        <Fuel className="size-3" />
                        {truck.fuelType}
                      </span>
                      <span className="flex items-center gap-1">
                        <Gauge className="size-3" />
                        {Math.round(truck.currentMileage).toLocaleString()} km
                      </span>
                      {truck.driver && (
                        <span className="flex items-center gap-1">
                          <User className="size-3" />
                          {truck.driver.firstName}
                        </span>
                      )}
                    </div>
                    <div className="flex gap-2 ml-7">
                      <Button variant="outline" size="sm" onClick={() => { setSelectedTruck(truck); setViewOpen(true) }}>
                        <Eye className="size-3.5" />
                      </Button>
                      <Button variant="outline" size="sm" onClick={() => handleEdit(truck)}>
                        <Pencil className="size-3.5" />
                      </Button>
                      <Button variant="outline" size="sm" onClick={() => { setSelectedTruck(truck); setDeleteOpen(true) }}>
                        <Trash2 className="size-3.5 text-destructive" />
                      </Button>
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
          totalItems={filteredTrucks.length}
          pageSize={pageSize}
        />
      </Card>

      {/* Add/Edit Dialog */}
      <Dialog open={formOpen} onOpenChange={(open) => { setFormOpen(open); if (!open) { setSelectedTruck(null); form.reset() } }}>
        <DialogContent className="sm:max-w-2xl p-4 sm:p-6">
          <DialogHeader>
            <DialogTitle>{selectedTruck ? 'Edit Truck' : 'Add New Truck'}</DialogTitle>
            <DialogDescription>
              {selectedTruck ? 'Update truck information below' : 'Fill in the truck details'}
            </DialogDescription>
          </DialogHeader>
          <FormStepIndicator steps={truckFormSteps} currentStep={currentStep} className="mb-4 pb-3 border-b border-border" />
          <Form {...form}>
            <form onSubmit={form.handleSubmit(onSubmit)} className="flex flex-col flex-1 min-h-0">
              <div ref={formScrollRef} className="flex-1 overflow-y-auto pr-1 space-y-4" onScroll={handleFormScroll}>
                {/* Step 0: Truck Info */}
                <div ref={(el) => { stepSectionRefs.current[0] = el }} className="bg-muted/20 dark:bg-muted/10 rounded-lg p-3 space-y-3">
                  <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider flex items-center gap-1.5">
                    <Truck className="size-3.5 text-blue-500" />
                    Truck Information
                  </p>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <FormField
                      control={form.control}
                      name="plateNumber"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Plate Number *</FormLabel>
                          <FormControl><Input {...field} placeholder="GC-0000-00" /></FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                    <FormField
                      control={form.control}
                      name="status"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Status *</FormLabel>
                          <Select onValueChange={field.onChange} defaultValue={field.value}>
                            <FormControl><SelectTrigger><SelectValue /></SelectTrigger></FormControl>
                            <SelectContent>
                              <SelectItem value="active">Active</SelectItem>
                              <SelectItem value="inactive">Inactive</SelectItem>
                              <SelectItem value="maintenance">Maintenance</SelectItem>
                              <SelectItem value="out_of_service">Out of Service</SelectItem>
                            </SelectContent>
                          </Select>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                  </div>
                </div>

                {/* Step 1: Specifications */}
                <div ref={(el) => { stepSectionRefs.current[1] = el }} className="rounded-lg p-3 space-y-3">
                  <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider flex items-center gap-1.5">
                    <Gauge className="size-3.5 text-emerald-500" />
                    Specifications
                  </p>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <FormField
                      control={form.control}
                      name="make"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Make *</FormLabel>
                          <FormControl><Input {...field} placeholder="Mercedes-Benz" /></FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                    <FormField
                      control={form.control}
                      name="model"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Model *</FormLabel>
                          <FormControl><Input {...field} placeholder="Actros" /></FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                    <FormField
                      control={form.control}
                      name="year"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Year *</FormLabel>
                          <FormControl><Input type="number" {...field} placeholder="2024" /></FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                    <FormField
                      control={form.control}
                      name="fuelType"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Fuel Type</FormLabel>
                          <Select onValueChange={field.onChange} defaultValue={field.value}>
                            <FormControl><SelectTrigger><SelectValue /></SelectTrigger></FormControl>
                            <SelectContent>
                              <SelectItem value="Diesel">Diesel</SelectItem>
                              <SelectItem value="Petrol">Petrol</SelectItem>
                              <SelectItem value="Gas">Gas</SelectItem>
                              <SelectItem value="Electric">Electric</SelectItem>
                              <SelectItem value="Hybrid">Hybrid</SelectItem>
                            </SelectContent>
                          </Select>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                    <FormField
                      control={form.control}
                      name="vinNumber"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>VIN Number</FormLabel>
                          <FormControl><Input {...field} placeholder="Vehicle Identification Number" /></FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                    <FormField
                      control={form.control}
                      name="engineNumber"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Engine Number</FormLabel>
                          <FormControl><Input {...field} placeholder="Engine serial number" /></FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                    <FormField
                      control={form.control}
                      name="chassisNumber"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Chassis Number</FormLabel>
                          <FormControl><Input {...field} placeholder="Chassis serial number" /></FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                    <FormField
                      control={form.control}
                      name="color"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Color</FormLabel>
                          <FormControl><Input {...field} placeholder="White" /></FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                    <FormField
                      control={form.control}
                      name="tankCapacity"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Tank Capacity (L)</FormLabel>
                          <FormControl><Input type="number" {...field} placeholder="400" /></FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                    <FormField
                      control={form.control}
                      name="currentMileage"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Current Mileage (km)</FormLabel>
                          <FormControl><Input type="number" {...field} /></FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                    <FormField
                      control={form.control}
                      name="insuranceStatus"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Insurance Status</FormLabel>
                          <Select onValueChange={field.onChange} defaultValue={field.value}>
                            <FormControl><SelectTrigger><SelectValue /></SelectTrigger></FormControl>
                            <SelectContent>
                              <SelectItem value="none">None</SelectItem>
                              <SelectItem value="active">Active</SelectItem>
                              <SelectItem value="expired">Expired</SelectItem>
                            </SelectContent>
                          </Select>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                    <FormField
                      control={form.control}
                      name="nextServiceDate"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Next Service Date</FormLabel>
                          <FormControl><Input type="date" {...field} /></FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                  </div>
                </div>

                {/* Step 2: Notes */}
                <div ref={(el) => { stepSectionRefs.current[2] = el }} className="bg-muted/20 dark:bg-muted/10 rounded-lg p-3 space-y-3">
                  <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider flex items-center gap-1.5">
                    <ClipboardList className="size-3.5 text-rose-500" />
                    Notes
                  </p>
                  <FormField
                    control={form.control}
                    name="notes"
                    render={({ field }) => (
                      <FormItem>
                        <FormControl><Textarea {...field} placeholder="Additional notes about this truck..." rows={3} /></FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                </div>
              </div>
              <DialogFooter className="mt-4 pt-4 border-t shrink-0">
                <Button type="button" variant="ghost" onClick={() => { setFormOpen(false); form.reset() }}>Cancel</Button>
                <Button type="submit" disabled={isSubmitting} className="hover:shadow-md transition-shadow">
                  {isSubmitting && <Loader2 className="size-4 animate-spin" />}
                  {selectedTruck ? 'Update Truck' : 'Add Truck'}
                </Button>
              </DialogFooter>
            </form>
          </Form>
        </DialogContent>
      </Dialog>

      {/* View Dialog */}
      <Dialog open={viewOpen} onOpenChange={setViewOpen}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader><DialogTitle>Truck Details</DialogTitle></DialogHeader>
          {selectedTruck && (
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <p className="text-sm text-muted-foreground">Plate Number</p>
                  <p className="font-mono font-medium">{selectedTruck.plateNumber}</p>
                </div>
                <div>
                  <p className="text-sm text-muted-foreground">Make / Model</p>
                  <p className="font-medium">{selectedTruck.make} {selectedTruck.model}</p>
                </div>
                <div>
                  <p className="text-sm text-muted-foreground">Year</p>
                  <p className="font-medium">{selectedTruck.year}</p>
                </div>
                <div>
                  <p className="text-sm text-muted-foreground">Fuel Type</p>
                  <p className="font-medium">{selectedTruck.fuelType}</p>
                </div>
                <div>
                  <p className="text-sm text-muted-foreground">Status</p>
                  <Badge variant="outline" className={statusColors[selectedTruck.status] || ''}>
                    {formatStatus(selectedTruck.status)}
                  </Badge>
                </div>
                <div>
                  <p className="text-sm text-muted-foreground">Mileage</p>
                  <p className="font-medium">{Math.round(selectedTruck.currentMileage).toLocaleString()} km</p>
                </div>
                <div>
                  <p className="text-sm text-muted-foreground">Insurance</p>
                  <p className={cn('font-medium capitalize', insuranceStatusColors[selectedTruck.insuranceStatus] || '')}>
                    {selectedTruck.insuranceStatus || 'None'}
                  </p>
                </div>
                <div>
                  <p className="text-sm text-muted-foreground">Next Service</p>
                  <p className="font-medium">
                    {selectedTruck.nextServiceDate
                      ? format(new Date(selectedTruck.nextServiceDate), 'MMM d, yyyy')
                      : 'Not scheduled'}
                  </p>
                </div>
                {selectedTruck.color && (
                  <div>
                    <p className="text-sm text-muted-foreground">Color</p>
                    <p className="font-medium capitalize">{selectedTruck.color}</p>
                  </div>
                )}
                {selectedTruck.tankCapacity && (
                  <div>
                    <p className="text-sm text-muted-foreground">Tank Capacity</p>
                    <p className="font-medium">{selectedTruck.tankCapacity} L</p>
                  </div>
                )}
                {selectedTruck.vinNumber && (
                  <div className="col-span-2">
                    <p className="text-sm text-muted-foreground">VIN Number</p>
                    <p className="font-mono font-medium text-sm">{selectedTruck.vinNumber}</p>
                  </div>
                )}
                {selectedTruck.engineNumber && (
                  <div className="col-span-2">
                    <p className="text-sm text-muted-foreground">Engine Number</p>
                    <p className="font-mono font-medium text-sm">{selectedTruck.engineNumber}</p>
                  </div>
                )}
                {selectedTruck.chassisNumber && (
                  <div className="col-span-2">
                    <p className="text-sm text-muted-foreground">Chassis Number</p>
                    <p className="font-mono font-medium text-sm">{selectedTruck.chassisNumber}</p>
                  </div>
                )}
                {selectedTruck.driver && (
                  <div className="col-span-2">
                    <p className="text-sm text-muted-foreground">Assigned Driver</p>
                    <p className="font-medium">{selectedTruck.driver.firstName} {selectedTruck.driver.lastName} {selectedTruck.driver.phone && <span className="text-muted-foreground">· {selectedTruck.driver.phone}</span>}</p>
                  </div>
                )}
              </div>
              {selectedTruck.notes && (
                <div>
                  <p className="text-sm text-muted-foreground">Notes</p>
                  <p className="text-sm">{selectedTruck.notes}</p>
                </div>
              )}
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* Bulk Delete Confirmation */}
      <AlertDialog open={bulkDeleteOpen} onOpenChange={setBulkDeleteOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Selected Trucks</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete <strong>{bulkSelect.selectedCount}</strong> truck(s)? Trucks with active trips cannot be deleted and will be skipped.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => bulkDeleteMutation.mutate(bulkSelect.selectedIds as string[])}
              disabled={bulkDeleteMutation.isPending}
            >
              {bulkDeleteMutation.isPending && <Loader2 className="size-4 animate-spin" />}
              Delete {bulkSelect.selectedCount} Truck(s)
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Single Delete Confirmation */}
      <AlertDialog open={deleteOpen} onOpenChange={setDeleteOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Truck</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to decommission <strong>{selectedTruck?.plateNumber}</strong> ({selectedTruck?.make} {selectedTruck?.model})?
              This action can be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => selectedTruck && deleteMutation.mutate(selectedTruck.id)}
              disabled={deleteMutation.isPending}
            >
              {deleteMutation.isPending && <Loader2 className="size-4 animate-spin" />}
              Delete Truck
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* CSV Import Dialog */}
      <CsvImportDialog
        open={importOpen}
        onOpenChange={setImportOpen}
        title="Import Trucks"
        fields={TRUCK_FIELDS}
        importEndpoint="/api/trucks/import"
        queryKey={['trucks']}
        entityName="truck"
      />

      {/* Truck Detail Sheet */}
      <TruckDetailSheet
        truckId={detailTruckId || undefined}
        open={!!detailTruckId}
        onOpenChange={(open) => { if (!open) setDetailTruckId(null) }}
      />
    </div>
  )
}
