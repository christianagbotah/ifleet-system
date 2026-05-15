'use client'

import { useState, useEffect, useRef, useMemo, useCallback } from 'react'
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
  Package,
  Upload,
  ClipboardList,
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

interface TruckData {
  id: string
  plateNumber: string
  truckName: string
  truckType: string
  capacity: string
  year?: number
  fuelType: string
  status: string
  mileage: number
  insuranceExpiry?: string
  notes: string
}

const truckSchema = z.object({
  plateNumber: z.string().min(3, 'Plate number is required'),
  truckName: z.string().min(2, 'Truck name is required'),
  truckType: z.enum(['flatbed', 'tanker', 'container', 'refrigerated', 'other']),
  capacity: z.string().default(''),
  year: z.coerce.number().min(1990).max(2030).optional().or(z.literal('')),
  fuelType: z.enum(['diesel', 'petrol', 'gas']),
  status: z.enum(['active', 'maintenance', 'out_of_service']),
  mileage: z.coerce.number().min(0).default(0),
  insuranceExpiry: z.string().optional(),
  notes: z.string().default(''),
})

type TruckFormValues = z.infer<typeof truckSchema>

const statusColors: Record<string, string> = {
  active: 'bg-emerald-100 text-emerald-800 border-emerald-200 dark:bg-emerald-900/30 dark:text-emerald-400 dark:border-emerald-800/50',
  maintenance: 'bg-amber-100 text-amber-800 border-amber-200 dark:bg-amber-900/30 dark:text-amber-400 dark:border-amber-800/50',
  out_of_service: 'bg-red-100 text-red-800 border-red-200 dark:bg-red-900/30 dark:text-red-400 dark:border-red-800/50',
}

const typeColors: Record<string, string> = {
  flatbed: 'bg-slate-500',
  tanker: 'bg-sky-500',
  container: 'bg-orange-500',
  refrigerated: 'bg-cyan-500',
  other: 'bg-gray-500',
}

const typeLabels: Record<string, string> = {
  flatbed: 'Flatbed',
  tanker: 'Tanker',
  container: 'Container',
  refrigerated: 'Refrigerated',
  other: 'Other',
}

const statusBorderColors: Record<string, string> = {
  active: 'border-l-emerald-500',
  maintenance: 'border-l-amber-500',
  out_of_service: 'border-l-red-500',
}

function SortIcon({ field, sortField, sortDir }: { field: string; sortField: string; sortDir: 'asc' | 'desc' }) {
  if (sortField !== field) return <ChevronUp className="size-3 opacity-30" />
  return sortDir === 'asc' ? <ChevronUp className="size-3" /> : <ChevronDown className="size-3" />
}

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
  const [sortField, setSortField] = useState<string>('truckName')
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
      await Promise.all(
        ids.map((id) =>
          fetch(`/api/trucks/${id}`, { method: 'DELETE' }).then((res) => {
            if (!res.ok) throw new Error('Failed to delete truck')
          })
        )
      )
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['trucks'] })
      toast.success(`${bulkSelect.selectedCount} truck(s) deleted successfully`)
      bulkSelect.clearSelection()
      setBulkDeleteOpen(false)
    },
    onError: () => {
      toast.error('Failed to delete some trucks')
    },
  })

  const { data: trucks = [], isLoading, error, refetch } = useQuery<TruckData[]>({
    queryKey: ['trucks'],
    queryFn: async () => {
      const res = await fetch('/api/trucks')
      if (!res.ok) throw new Error('Failed to fetch trucks')
      return res.json()
    },
  })

  const form = useForm<TruckFormValues>({
    resolver: zodResolver(truckSchema),
    defaultValues: {
      plateNumber: '',
      truckName: '',
      truckType: 'flatbed',
      capacity: '',
      year: undefined,
      fuelType: 'diesel',
      status: 'active',
      mileage: 0,
      insuranceExpiry: '',
      notes: '',
    },
  })

  const createMutation = useMutation({
    mutationFn: async (data: TruckFormValues) => {
      const res = await fetch('/api/trucks', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
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
      truckName: truck.truckName,
      truckType: truck.truckType as TruckFormValues['truckType'],
      capacity: truck.capacity,
      year: truck.year || '',
      fuelType: truck.fuelType as TruckFormValues['fuelType'],
      status: truck.status as TruckFormValues['status'],
      mileage: truck.mileage,
      insuranceExpiry: truck.insuranceExpiry ? truck.insuranceExpiry.split('T')[0] : '',
      notes: truck.notes,
    })
    setFormOpen(true)
  }

  const handleAdd = () => {
    setSelectedTruck(null)
    form.reset({
      plateNumber: '',
      truckName: '',
      truckType: 'flatbed',
      capacity: '',
      year: undefined,
      fuelType: 'diesel',
      status: 'active',
      mileage: 0,
      insuranceExpiry: '',
      notes: '',
    })
    setFormOpen(true)
  }

  const onSubmit = (data: TruckFormValues) => {
    const payload = {
      ...data,
      year: data.year ? Number(data.year) : null,
    }
    if (selectedTruck) {
      updateMutation.mutate({ id: selectedTruck.id, ...payload })
    } else {
      createMutation.mutate(payload as unknown as TruckFormValues)
    }
  }

  const filteredTrucks = trucks.filter((t) => {
    const matchSearch =
      t.plateNumber.toLowerCase().includes(debouncedSearch.toLowerCase()) ||
      t.truckName.toLowerCase().includes(debouncedSearch.toLowerCase())
    const matchStatus = statusFilter === 'all' || t.status === statusFilter
    return matchSearch && matchStatus
  }).sort((a, b) => {
    const dir = sortDir === 'asc' ? 1 : -1
    if (sortField === 'truckName') return dir * a.truckName.localeCompare(b.truckName)
    if (sortField === 'plateNumber') return dir * a.plateNumber.localeCompare(b.plateNumber)
    if (sortField === 'status') return dir * a.status.localeCompare(b.status)
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
  const isBulkDeleting = bulkDeleteMutation.isPending

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
            {!isLoading && <span className="text-sm font-medium text-muted-foreground bg-muted rounded-full px-2.5 py-0.5">{trucks.length}</span>}
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

      {/* Status Distribution & Utilization */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <div className="flex items-center gap-2 rounded-lg bg-emerald-50 dark:bg-emerald-900/20 border border-emerald-100 dark:border-emerald-800/50 px-3 py-2.5">
          <Route className="size-4 text-emerald-600 dark:text-emerald-400" />
          <div className="text-sm">
            <p className="text-muted-foreground text-xs">On Road</p>
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
            <p className="text-muted-foreground text-xs">In Garage</p>
            <p className="font-semibold text-gray-700 dark:text-gray-400">{trucks.filter((t) => t.status === 'out_of_service').length}</p>
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

      {/* Status Type Badges */}
      <div className="flex flex-wrap gap-2">
        {Object.entries(typeLabels).map(([key, label]) => {
          const count = trucks.filter((t) => t.truckType === key).length
          if (count === 0) return null
          return (
            <div key={key} className="flex items-center gap-1.5 rounded-full bg-muted/60 px-3 py-1 text-xs">
              <span className={cn('size-2 rounded-full', typeColors[key])} />
              <span className="text-muted-foreground">{label}</span>
              <Badge variant="secondary" className="ml-1 h-5 min-w-5 flex items-center justify-center text-xs font-semibold px-1.5">{count}</Badge>
            </div>
          )
        })}
      </div>

      {/* Filters */}
      <Card>
        <CardContent className="p-4">
          <div className="flex flex-col sm:flex-row gap-3">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 size-4 text-muted-foreground" />
              <Input
                placeholder="Search by plate number or name..."
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
                <SelectItem value="maintenance">Maintenance</SelectItem>
                <SelectItem value="out_of_service">Out of Service</SelectItem>
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
                      <TableHead>Plate Number</TableHead>
                      <TableHead className="cursor-pointer select-none" onClick={() => toggleSort('truckName')}>
                        <span className="inline-flex items-center gap-1">Name <SortIcon field="truckName" sortField={sortField} sortDir={sortDir} /></span>
                      </TableHead>
                      <TableHead>Type</TableHead>
                      <TableHead>Capacity</TableHead>
                      <TableHead className="cursor-pointer select-none" onClick={() => toggleSort('status')}>
                        <span className="inline-flex items-center gap-1">Status <SortIcon field="status" sortField={sortField} sortDir={sortDir} /></span>
                      </TableHead>
                      <TableHead>Mileage</TableHead>
                      <TableHead className="text-right">Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {paginatedTrucks.map((truck, idx) => (
                      <TableRow key={truck.id} className={cn('border-l-[3px] transition-colors hover:bg-muted/50 animate-[fadeInUp_0.3s_ease-out]', idx % 2 === 1 ? 'bg-muted/30' : '', statusBorderColors[truck.status], bulkSelect.isSelected(truck.id) && 'bg-emerald-50/50 dark:bg-emerald-900/10')} style={{ animationDelay: `${idx * 30}ms` }}>
                        <TableCell>
                          <Checkbox
                            checked={bulkSelect.isSelected(truck.id)}
                            onCheckedChange={() => bulkSelect.toggleOne(truck.id)}
                            aria-label={`Select ${truck.truckName}`}
                          />
                        </TableCell>
                        <TableCell className="font-mono font-medium">{truck.plateNumber}</TableCell>
                        <TableCell>
                          <button
                            onClick={() => setDetailTruckId(truck.id)}
                            className="font-medium hover:underline hover:text-primary transition-colors text-left"
                          >
                            {truck.truckName}
                          </button>
                        </TableCell>
                        <TableCell>
                          <div className="flex items-center gap-2">
                            <span className={cn('size-2 rounded-full', typeColors[truck.truckType] || 'bg-gray-400')} />
                            <span className="capitalize">{truck.truckType.replace('_', ' ')}</span>
                          </div>
                        </TableCell>
                        <TableCell>{truck.capacity || '—'}</TableCell>
                        <TableCell>
                          <Badge variant="outline" className={statusColors[truck.status] || ''}>
                            {truck.status.replace('_', ' ')}
                          </Badge>
                        </TableCell>
                        <TableCell>{truck.mileage.toLocaleString()} km</TableCell>
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

              <div className="md:hidden divide-y">
                {paginatedTrucks.map((truck) => (
                  <div key={truck.id} className={cn('p-4 space-y-3 border-l-[3px] transition-colors active:bg-muted/50', statusBorderColors[truck.status], bulkSelect.isSelected(truck.id) && 'bg-emerald-50/50 dark:bg-emerald-900/10')}>
                    <div className="flex items-center gap-3">
                      <Checkbox
                        checked={bulkSelect.isSelected(truck.id)}
                        onCheckedChange={() => bulkSelect.toggleOne(truck.id)}
                        aria-label={`Select ${truck.truckName}`}
                      />
                      <div className="flex-1 min-w-0">
                        <button
                          onClick={() => setDetailTruckId(truck.id)}
                          className="font-semibold truncate hover:underline hover:text-primary transition-colors text-left"
                        >
                          {truck.truckName}
                        </button>
                        <p className="text-sm text-muted-foreground font-mono">{truck.plateNumber}</p>
                      </div>
                      <Badge variant="outline" className={cn('shrink-0 text-[10px] px-1.5', statusColors[truck.status] || '')}>
                        {truck.status.replace('_', ' ')}
                      </Badge>
                    </div>
                    <div className="flex items-center gap-3 ml-7 text-sm text-muted-foreground">
                      {truck.capacity && (
                        <span className="flex items-center gap-1">
                          <Package className="size-3" />
                          {truck.capacity}
                        </span>
                      )}
                      <span className="flex items-center gap-1">
                        <Gauge className="size-3" />
                        {truck.mileage.toLocaleString()} km
                      </span>
                      <span className={cn('size-2 rounded-full', typeColors[truck.truckType] || 'bg-gray-400')} />
                      <span className="capitalize">{truck.truckType.replace('_', ' ')}</span>
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
                  name="truckName"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Truck Name *</FormLabel>
                      <FormControl><Input {...field} placeholder="Volvo FH16" /></FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="truckType"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Truck Type *</FormLabel>
                      <Select onValueChange={field.onChange} defaultValue={field.value}>
                        <FormControl><SelectTrigger><SelectValue /></SelectTrigger></FormControl>
                        <SelectContent>
                          <SelectItem value="flatbed">Flatbed</SelectItem>
                          <SelectItem value="tanker">Tanker</SelectItem>
                          <SelectItem value="container">Container</SelectItem>
                          <SelectItem value="refrigerated">Refrigerated</SelectItem>
                          <SelectItem value="other">Other</SelectItem>
                        </SelectContent>
                      </Select>
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
                  name="capacity"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Capacity</FormLabel>
                      <FormControl><Input {...field} placeholder="20 tons" /></FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="year"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Year</FormLabel>
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
                      <FormLabel>Fuel Type *</FormLabel>
                      <Select onValueChange={field.onChange} defaultValue={field.value}>
                        <FormControl><SelectTrigger><SelectValue /></SelectTrigger></FormControl>
                        <SelectContent>
                          <SelectItem value="diesel">Diesel</SelectItem>
                          <SelectItem value="petrol">Petrol</SelectItem>
                          <SelectItem value="gas">Gas</SelectItem>
                        </SelectContent>
                      </Select>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="mileage"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Mileage (km)</FormLabel>
                      <FormControl><Input type="number" {...field} /></FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="insuranceExpiry"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Insurance Expiry</FormLabel>
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
                      <FormControl><Textarea {...field} placeholder="Additional notes..." rows={3} /></FormControl>
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
                  <p className="text-sm text-muted-foreground">Name</p>
                  <p className="font-medium">{selectedTruck.truckName}</p>
                </div>
                <div>
                  <p className="text-sm text-muted-foreground">Type</p>
                  <p className="font-medium capitalize">{selectedTruck.truckType.replace('_', ' ')}</p>
                </div>
                <div>
                  <p className="text-sm text-muted-foreground">Capacity</p>
                  <p className="font-medium">{selectedTruck.capacity || '—'}</p>
                </div>
                <div>
                  <p className="text-sm text-muted-foreground">Year</p>
                  <p className="font-medium">{selectedTruck.year || '—'}</p>
                </div>
                <div>
                  <p className="text-sm text-muted-foreground">Fuel Type</p>
                  <p className="font-medium capitalize">{selectedTruck.fuelType}</p>
                </div>
                <div>
                  <p className="text-sm text-muted-foreground">Status</p>
                  <Badge variant="outline" className={statusColors[selectedTruck.status] || ''}>
                    {selectedTruck.status.replace('_', ' ')}
                  </Badge>
                </div>
                <div>
                  <p className="text-sm text-muted-foreground">Mileage</p>
                  <p className="font-medium">{selectedTruck.mileage.toLocaleString()} km</p>
                </div>
                {selectedTruck.insuranceExpiry && (
                  <div>
                    <p className="text-sm text-muted-foreground">Insurance Expiry</p>
                    <p className="font-medium">{format(new Date(selectedTruck.insuranceExpiry), 'MMM d, yyyy')}</p>
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
              Are you sure you want to delete <strong>{bulkSelect.selectedCount}</strong> truck(s)? This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={isBulkDeleting}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => bulkDeleteMutation.mutate(Array.from(bulkSelect.selectedIds))}
              className="bg-destructive text-white hover:bg-destructive/90"
              disabled={isBulkDeleting}
            >
              {isBulkDeleting && <Loader2 className="size-4 animate-spin mr-1" />}
              Delete {bulkSelect.selectedCount} Truck(s)
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Bulk Action Bar */}
      {bulkSelect.selectedCount > 0 && (
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="fixed bottom-6 left-1/2 -translate-x-1/2 z-50"
        >
          <div className="flex items-center gap-3 bg-background border shadow-lg rounded-xl px-4 py-3">
            <span className="text-sm font-medium">
              {bulkSelect.selectedCount} selected
            </span>
            <Button
              variant="outline"
              size="sm"
              onClick={() => bulkSelect.clearSelection()}
            >
              Clear
            </Button>
            <Button
              variant="destructive"
              size="sm"
              onClick={() => setBulkDeleteOpen(true)}
            >
              <Trash2 className="size-4 mr-1" />
              Delete Selected
            </Button>
          </div>
        </motion.div>
      )}

      {/* Delete Confirmation */}
      <AlertDialog open={deleteOpen} onOpenChange={setDeleteOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Truck</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete <strong>{selectedTruck?.truckName}</strong> ({selectedTruck?.plateNumber})? This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => selectedTruck && deleteMutation.mutate(selectedTruck.id)}
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

      {/* CSV Import Dialog */}
      <CsvImportDialog
        open={importOpen}
        onOpenChange={setImportOpen}
        entityType="trucks"
        fields={TRUCK_FIELDS as unknown as { key: string; label: string; required: boolean }[]}
        onImportComplete={(created) => {
          queryClient.invalidateQueries({ queryKey: ['trucks'] })
          if (created > 0) toast.success(`Imported ${created} trucks`)
        }}
      />
    </div>
  )
}
