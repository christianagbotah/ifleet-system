'use client'

import { useState, useRef, useMemo, useEffect, useCallback } from 'react'
import { useDebounce } from '@/hooks/use-debounce'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { format, formatDistanceToNow } from 'date-fns'
import { motion } from 'framer-motion'
import {
  Plus,
  Search,
  Eye,
  Pencil,
  Trash2,
  Users,
  AlertCircle,
  Loader2,
  X,
  ChevronUp,
  ChevronDown,
  UserPlus,
  ChevronRight,
  FileText,
  Download,
  Upload,
  UserRound,
  Phone,
  ShieldCheck,
  MapPin,
  ClipboardList,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { useAppStore } from '@/lib/store'
import { useBulkSelect } from '@/hooks/use-bulk-select'
import { useColumnVisibility } from '@/hooks/use-column-visibility'
import { ColumnVisibilityMenu } from '@/components/ui/column-visibility-menu'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
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
import { Label } from '@/components/ui/label'
import { Checkbox } from '@/components/ui/checkbox'
import { toast } from '@/lib/toast-config'
import { exportToCSV } from '@/lib/export'
import { DRIVER_FIELDS } from '@/lib/csv-import'
import { CsvImportDialog } from '@/components/ui/csv-import-dialog'
import { FormFieldWrapper } from '@/components/ui/form-field-wrapper'
import { FormStepIndicator } from '@/components/ui/form-step-indicator'
import { DataPagination } from '@/components/ui/data-pagination'
import { useUndoDelete } from '@/hooks/use-undo-delete'
import { DriverAvatar } from '@/components/ui/driver-avatar'
import { DriverDetailSheet } from '@/components/ui/driver-detail-sheet'

interface Driver {
  id: string
  driverName: string
  phone: string
  licenseNo: string
  licenseExpiry: string
  emergencyContact?: string
  emergencyPhone?: string
  address: string
  status: string
  hireDate: string
  notes: string
  updatedAt?: string
}

const driverSchema = z.object({
  driverName: z.string().min(2, 'Name must be at least 2 characters'),
  phone: z.string().min(8, 'Phone must be at least 8 characters'),
  licenseNo: z.string().min(5, 'License number is required'),
  licenseExpiry: z.string().min(1, 'License expiry date is required'),
  emergencyContact: z.string().optional(),
  emergencyPhone: z.string().optional(),
  address: z.string().default(''),
  status: z.enum(['active', 'inactive', 'suspended']),
  notes: z.string().default(''),
})

type DriverFormValues = z.infer<typeof driverSchema>

const statusColors: Record<string, string> = {
  active: 'bg-emerald-100 text-emerald-800 border-emerald-200 dark:bg-emerald-900/30 dark:text-emerald-400 dark:border-emerald-800/50',
  inactive: 'bg-gray-100 text-gray-800 border-gray-200 dark:bg-gray-800/50 dark:text-gray-400 dark:border-gray-700/50',
  suspended: 'bg-red-100 text-red-800 border-red-200 dark:bg-red-900/30 dark:text-red-400 dark:border-red-800/50',
}

function SortIcon({ field, sortField, sortDir }: { field: string; sortField: string; sortDir: 'asc' | 'desc' }) {
  if (sortField !== field) return <ChevronUp className="size-3 opacity-30" />
  return sortDir === 'asc' ? <ChevronUp className="size-3" /> : <ChevronDown className="size-3" />
}

const statusBorderColors: Record<string, string> = {
  active: 'border-l-emerald-500',
  inactive: 'border-l-gray-400',
  suspended: 'border-l-red-500',
}

const driverColumnDefs = [
  { key: 'name', label: 'Name', defaultVisible: true, group: 'Core' },
  { key: 'phone', label: 'Phone', defaultVisible: true, group: 'Core' },
  { key: 'license', label: 'License', defaultVisible: false, group: 'License & Employment' },
  { key: 'status', label: 'Status', defaultVisible: true, group: 'Core' },
  { key: 'hireDate', label: 'Hire Date', defaultVisible: false, group: 'License & Employment' },
  { key: 'lastUpdated', label: 'Last Updated', defaultVisible: false, group: 'License & Employment' },
  { key: 'actions', label: 'Actions', defaultVisible: true, group: 'General' },
]

export default function DriversPage() {
  const queryClient = useQueryClient()
  const { setCurrentView } = useAppStore()
  const [search, setSearch] = useState('')
  const debouncedSearch = useDebounce(search, 300)
  const [formOpen, setFormOpen] = useState(false)
  const [viewOpen, setViewOpen] = useState(false)
  const [deleteOpen, setDeleteOpen] = useState(false)
  const [selectedDriver, setSelectedDriver] = useState<Driver | null>(null)
  const [detailDriverId, setDetailDriverId] = useState<string | null>(null)
  const [detailDriverName, setDetailDriverName] = useState<string | undefined>(undefined)
  const [statusFilter, setStatusFilter] = useState<string>('all')
  const [sortField, setSortField] = useState<string>('driverName')
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('asc')
  const [currentPage, setCurrentPage] = useState(1)
  const pageSize = 10
  const [bulkDeleteOpen, setBulkDeleteOpen] = useState(false)
  const [importOpen, setImportOpen] = useState(false)
  const bulkSelect = useBulkSelect<Driver>()

  // Form step indicator state
  const [currentStep, setCurrentStep] = useState(0)
  const stepSectionRefs = useRef<(HTMLDivElement | null)[]>([])
  const formScrollRef = useRef<HTMLDivElement | null>(null)

  const driverFormSteps = useMemo(() => [
    { id: 'personal', label: 'Personal Info', icon: <UserRound className="size-4" /> },
    { id: 'license', label: 'License & Emergency', icon: <ShieldCheck className="size-4" /> },
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


  const columnVisibility = useColumnVisibility('drivers', driverColumnDefs)

  // Listen for command palette "Add Driver" action
  useEffect(() => {
    const handler = () => { setCurrentStep(0); setFormOpen(true) }
    window.addEventListener('ifleetpro:open-form:drivers', handler)
    return () => window.removeEventListener('ifleetpro:open-form:drivers', handler)
  }, [])

  const undoDelete = useUndoDelete<Driver>({
    entityName: 'Driver',
    queryKey: ['drivers'],
    createFn: async (driver) => {
      const res = await fetch('/api/drivers', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(driver),
      })
      if (!res.ok) throw new Error('Failed to undo delete')
    },
  })

  const bulkDeleteMutation = useMutation({
    mutationFn: async (ids: string[]) => {
      await Promise.all(
        ids.map((id) =>
          fetch(`/api/drivers/${id}`, { method: 'DELETE' }).then((res) => {
            if (!res.ok) throw new Error('Failed to delete driver')
          })
        )
    )
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['drivers'] })
      toast.success(`${bulkSelect.selectedCount} driver(s) deleted successfully`)
      bulkSelect.clearSelection()
      setBulkDeleteOpen(false)
    },
    onError: () => {
      toast.error('Failed to delete some drivers')
    },
  })

  const { data: drivers = [], isLoading, error, refetch } = useQuery<Driver[]>({
    queryKey: ['drivers'],
    queryFn: async () => {
      const res = await fetch('/api/drivers')
      if (!res.ok) throw new Error('Failed to fetch drivers')
      return res.json()
    },
  })

  const form = useForm<DriverFormValues>({
    resolver: zodResolver(driverSchema),
    defaultValues: {
      driverName: '',
      phone: '',
      licenseNo: '',
      licenseExpiry: '',
      emergencyContact: '',
      emergencyPhone: '',
      address: '',
      status: 'active',
      notes: '',
    },
  })

  const createMutation = useMutation({
    mutationFn: async (data: DriverFormValues) => {
      const res = await fetch('/api/drivers', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      })
      if (!res.ok) {
        const err = await res.json().catch(() => ({}))
        throw new Error(err.error || 'Failed to create driver')
      }
      return res.json()
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['drivers'] })
      toast.success('Driver created successfully')
      setFormOpen(false)
      form.reset()
    },
    onError: (err) => toast.error(err.message),
  })

  const updateMutation = useMutation({
    mutationFn: async ({ id, ...data }: { id: string } & DriverFormValues) => {
      const res = await fetch(`/api/drivers/${id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      })
      if (!res.ok) {
        const err = await res.json().catch(() => ({}))
        throw new Error(err.error || 'Failed to update driver')
      }
      return res.json()
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['drivers'] })
      toast.success('Driver updated successfully')
      setFormOpen(false)
      setSelectedDriver(null)
      form.reset()
    },
    onError: (err) => toast.error(err.message),
  })

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      const res = await fetch(`/api/drivers/${id}`, { method: 'DELETE' })
      if (!res.ok) {
        const err = await res.json().catch(() => ({}))
        throw new Error(err.error || 'Failed to delete driver')
      }
      return res.json()
    },
    onSuccess: (deletedDriver) => {
      queryClient.invalidateQueries({ queryKey: ['drivers'] })
      setDeleteOpen(false)
      setSelectedDriver(null)
      undoDelete.executeWithUndo(deletedDriver as Driver)
    },
    onError: (err) => toast.error(err.message),
  })

  const handleEdit = (driver: Driver) => {
    setSelectedDriver(driver)
    form.reset({
      driverName: driver.driverName,
      phone: driver.phone,
      licenseNo: driver.licenseNo,
      licenseExpiry: driver.licenseExpiry ? driver.licenseExpiry.split('T')[0] : '',
      emergencyContact: driver.emergencyContact || '',
      emergencyPhone: driver.emergencyPhone || '',
      address: driver.address,
      status: driver.status as 'active' | 'inactive' | 'suspended',
      notes: driver.notes,
    })
    setFormOpen(true)
  }

  const handleAdd = () => {
    setSelectedDriver(null)
    form.reset({
      driverName: '',
      phone: '',
      licenseNo: '',
      licenseExpiry: '',
      emergencyContact: '',
      emergencyPhone: '',
      address: '',
      status: 'active',
      notes: '',
    })
    setFormOpen(true)
  }

  const onSubmit = (data: DriverFormValues) => {
    if (selectedDriver) {
      updateMutation.mutate({ id: selectedDriver.id, ...data })
    } else {
      createMutation.mutate(data)
    }
  }

  const filteredDrivers = drivers.filter((d) => {
    const matchSearch =
      d.driverName.toLowerCase().includes(debouncedSearch.toLowerCase()) ||
      d.phone.includes(debouncedSearch) ||
      d.licenseNo.toLowerCase().includes(debouncedSearch.toLowerCase())
    const matchStatus = statusFilter === 'all' || d.status === statusFilter
    return matchSearch && matchStatus
  }).sort((a, b) => {
    const dir = sortDir === 'asc' ? 1 : -1
    if (sortField === 'driverName') return dir * a.driverName.localeCompare(b.driverName)
    if (sortField === 'status') return dir * a.status.localeCompare(b.status)
    return 0
  })

  const stats = {
    total: drivers.length,
    active: drivers.filter((d) => d.status === 'active').length,
    inactive: drivers.filter((d) => d.status === 'inactive').length,
    suspended: drivers.filter((d) => d.status === 'suspended').length,
  }

  const toggleSort = (field: string) => {
    if (sortField === field) {
      setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'))
    } else {
      setSortField(field)
      setSortDir('asc')
    }
  }

  const totalPages = Math.ceil(filteredDrivers.length / pageSize)
  const paginatedDrivers = filteredDrivers.slice((currentPage - 1) * pageSize, currentPage * pageSize)

  const isSubmitting = createMutation.isPending || updateMutation.isPending
  const isFormDirty = form.formState.isDirty
  const watchNotes = form.watch('notes')
  const isBulkDeleting = bulkDeleteMutation.isPending

  if (isLoading) return <PageSkeleton statsCount={3} filterRow tableRows={5} />

  if (error) {
    return (
      <div className="flex flex-col items-center justify-center h-[60vh] gap-4">
        <AlertCircle className="size-12 text-destructive" />
        <p className="text-muted-foreground">Failed to load drivers</p>
        <Button variant="outline" onClick={() => refetch()}>
          Try Again
        </Button>
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
            <span className="text-sm font-medium">Drivers</span>
          </div>
          <div className="flex items-center gap-3">
            <h1 className="text-2xl font-bold">Drivers</h1>
            {!isLoading && <span className="text-sm font-medium text-muted-foreground bg-muted rounded-full px-2.5 py-0.5">{drivers.length}</span>}
          </div>
          <p className="text-muted-foreground text-sm">Manage your driver fleet</p>
        </div>
        <div className="flex gap-2">
          <ColumnVisibilityMenu
            groupedColumns={columnVisibility.groupedColumns}
            isColumnVisible={columnVisibility.isColumnVisible}
            toggleColumn={columnVisibility.toggleColumn}
            showAll={columnVisibility.showAll}
            hideAll={columnVisibility.hideAll}
            visibleCount={columnVisibility.columnCount}
            totalCount={driverColumnDefs.length}
          />
          <Button
            variant="outline"
            size="sm"
            onClick={async () => {
              try {
                const res = await fetch('/api/drivers')
                if (!res.ok) throw new Error('Failed to fetch drivers')
                const data = await res.json()
                const exportData = data.map((d: Driver) => ({
                  driverName: d.driverName,
                  phone: d.phone,
                  licenseNo: d.licenseNo,
                  licenseExpiry: d.licenseExpiry ? d.licenseExpiry.split('T')[0] : '',
                  status: d.status,
                  hireDate: d.hireDate ? d.hireDate.split('T')[0] : '',
                  emergencyContact: d.emergencyContact || '',
                  emergencyPhone: d.emergencyPhone || '',
                  address: d.address,
                }))
                exportToCSV(exportData, `drivers-export-${new Date().toISOString().split('T')[0]}`)
                toast.success('Drivers exported successfully')
              } catch {
                toast.error('Failed to export drivers')
              }
            }}
          >
            <Download className="size-4" />
            Export CSV
          </Button>
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
            Add Driver
          </Button>
        </div>
      </div>

      {/* Stats Summary */}
      <div className="flex flex-wrap gap-3">
        <div className="flex items-center gap-2 rounded-lg bg-muted/60 px-3 py-2 text-sm">
          <span className="font-medium text-muted-foreground">Total</span>
          <Badge variant="secondary" className="font-semibold">{stats.total}</Badge>
        </div>
        <div className="flex items-center gap-2 rounded-lg bg-emerald-50 dark:bg-emerald-900/20 px-3 py-2 text-sm">
          <span className="size-2 rounded-full bg-emerald-500" />
          <span className="text-emerald-700 dark:text-emerald-400 font-medium">Active</span>
          <Badge className="bg-emerald-100 text-emerald-800 border-emerald-200 dark:bg-emerald-900/30 dark:text-emerald-400 dark:border-emerald-800/50 font-semibold">{stats.active}</Badge>
        </div>
        <div className="flex items-center gap-2 rounded-lg bg-gray-50 dark:bg-gray-800/30 px-3 py-2 text-sm">
          <span className="size-2 rounded-full bg-gray-400" />
          <span className="text-gray-700 dark:text-gray-400 font-medium">Inactive</span>
          <Badge className="bg-gray-100 text-gray-800 border-gray-200 dark:bg-gray-800/50 dark:text-gray-400 dark:border-gray-700/50 font-semibold">{stats.inactive}</Badge>
        </div>
        <div className="flex items-center gap-2 rounded-lg bg-red-50 dark:bg-red-900/20 px-3 py-2 text-sm">
          <span className="size-2 rounded-full bg-red-500" />
          <span className="text-red-700 dark:text-red-400 font-medium">Suspended</span>
          <Badge className="bg-red-100 text-red-800 border-red-200 dark:bg-red-900/30 dark:text-red-400 dark:border-red-800/50 font-semibold">{stats.suspended}</Badge>
        </div>
      </div>

      {/* Filters */}
      <Card>
        <CardContent className="p-4">
          <div className="flex flex-col sm:flex-row gap-3">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 size-4 text-muted-foreground" />
              <Input
                placeholder="Search by name, phone, or license..."
                value={search}
                onChange={(e) => { setSearch(e.target.value); setCurrentPage(1) }}
                className="pl-9"
              />
            </div>
            <Select value={statusFilter} onValueChange={(val) => { setStatusFilter(val); setCurrentPage(1) }}>
              <SelectTrigger className="w-full sm:w-40">
                <SelectValue placeholder="Filter status" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Status</SelectItem>
                <SelectItem value="active">Active</SelectItem>
                <SelectItem value="inactive">Inactive</SelectItem>
                <SelectItem value="suspended">Suspended</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </CardContent>
      </Card>

      {/* Table */}
      <Card>
        <CardContent className="p-0">
          {filteredDrivers.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-20 text-muted-foreground">
              <div className="relative mb-6">
                <div className="size-20 rounded-2xl bg-muted flex items-center justify-center">
                  <Users className="size-10 opacity-30" />
                </div>
                <div className="absolute -top-1 -right-1 size-8 rounded-lg bg-muted/80 flex items-center justify-center">
                  <UserPlus className="size-4 opacity-40" />
                </div>
                <div className="absolute -bottom-1 -left-1 size-8 rounded-lg bg-muted/80 flex items-center justify-center">
                  <FileText className="size-4 opacity-40" />
                </div>
              </div>
              <p className="text-base font-medium">No drivers found</p>
              <p className="text-sm mt-1 max-w-xs text-center">Get started by adding your first driver to manage your fleet operations.</p>
              <ul className="text-xs text-muted-foreground mt-3 space-y-1">
                <li className="flex items-center gap-1.5"><span className="size-1 rounded-full bg-muted-foreground/50" /> Track driver licenses and expiry dates</li>
                <li className="flex items-center gap-1.5"><span className="size-1 rounded-full bg-muted-foreground/50" /> Assign drivers to trips</li>
                <li className="flex items-center gap-1.5"><span className="size-1 rounded-full bg-muted-foreground/50" /> Monitor driver performance</li>
              </ul>
              <Button variant="outline" size="sm" className="mt-5" onClick={handleAdd}>
                <Plus className="size-4" />
                Add Your First Driver
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
                          checked={bulkSelect.isAllSelected(paginatedDrivers)}
                          onCheckedChange={() => bulkSelect.toggleAll(paginatedDrivers)}
                          aria-label="Select all drivers"
                        />
                      </TableHead>
                      {columnVisibility.isColumnVisible('name') && (
                        <TableHead className="cursor-pointer select-none" onClick={() => toggleSort('driverName')}>
                          <span className="inline-flex items-center gap-1">Name <SortIcon field="driverName" sortField={sortField} sortDir={sortDir} /></span>
                        </TableHead>
                      )}
                      {columnVisibility.isColumnVisible('phone') && (
                        <TableHead>Phone</TableHead>
                      )}
                      {columnVisibility.isColumnVisible('license') && (
                        <TableHead>License No.</TableHead>
                      )}
                      {columnVisibility.isColumnVisible('status') && (
                        <TableHead className="cursor-pointer select-none" onClick={() => toggleSort('status')}>
                          <span className="inline-flex items-center gap-1">Status <SortIcon field="status" sortField={sortField} sortDir={sortDir} /></span>
                        </TableHead>
                      )}
                      {columnVisibility.isColumnVisible('hireDate') && (
                        <TableHead>Hire Date</TableHead>
                      )}
                      {columnVisibility.isColumnVisible('lastUpdated') && (
                        <TableHead>Last Updated</TableHead>
                      )}
                      <TableHead className="text-right">Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {paginatedDrivers.map((driver, idx) => (
                      <TableRow key={driver.id} className={cn('border-l-[3px] transition-colors hover:bg-muted/50 animate-[fadeInUp_0.3s_ease-out]', idx % 2 === 1 ? 'bg-muted/30' : '', statusBorderColors[driver.status], bulkSelect.isSelected(driver.id) && 'bg-emerald-50/50 dark:bg-emerald-900/10')} style={{ animationDelay: `${idx * 30}ms` }}>
                        <TableCell>
                          <Checkbox
                            checked={bulkSelect.isSelected(driver.id)}
                            onCheckedChange={() => bulkSelect.toggleOne(driver.id)}
                            aria-label={`Select ${driver.driverName}`}
                          />
                        </TableCell>
                        {columnVisibility.isColumnVisible('name') && (
                          <TableCell>
                            <div className="flex items-center gap-2 cursor-pointer hover:opacity-80 transition-opacity" onClick={() => { setDetailDriverId(driver.id); setDetailDriverName(driver.driverName) }}>
                              <DriverAvatar name={driver.driverName} size="sm" />
                              <span className="font-medium hover:text-emerald-600 dark:hover:text-emerald-400 transition-colors">{driver.driverName}</span>
                            </div>
                          </TableCell>
                        )}
                        {columnVisibility.isColumnVisible('phone') && (
                          <TableCell>{driver.phone}</TableCell>
                        )}
                        {columnVisibility.isColumnVisible('license') && (
                          <TableCell className="font-mono text-sm">{driver.licenseNo}</TableCell>
                        )}
                        {columnVisibility.isColumnVisible('status') && (
                          <TableCell>
                            <Badge variant="outline" className={statusColors[driver.status] || ''}>
                              {driver.status}
                            </Badge>
                          </TableCell>
                        )}
                        {columnVisibility.isColumnVisible('hireDate') && (
                          <TableCell className="text-muted-foreground">
                            {driver.hireDate ? format(new Date(driver.hireDate), 'MMM d, yyyy') : '—'}
                          </TableCell>
                        )}
                        {columnVisibility.isColumnVisible('lastUpdated') && (
                          <TableCell className="text-muted-foreground text-xs">
                            {driver.updatedAt ? formatDistanceToNow(new Date(driver.updatedAt), { addSuffix: true }) : '—'}
                          </TableCell>
                        )}
                        <TableCell className="text-right">
                          <div className="flex justify-end gap-1">
                            <Button variant="ghost" size="icon" onClick={() => { setSelectedDriver(driver); setViewOpen(true) }}>
                              <Eye className="size-4" />
                            </Button>
                            <Button variant="ghost" size="icon" onClick={() => handleEdit(driver)}>
                              <Pencil className="size-4" />
                            </Button>
                            <Button variant="ghost" size="icon" onClick={() => { setSelectedDriver(driver); setDeleteOpen(true) }}>
                              <Trash2 className="size-4 text-destructive" />
                            </Button>
                          </div>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>

              {/* Mobile Card List */}
              <div className="md:hidden divide-y">
                {paginatedDrivers.map((driver) => (
                  <div key={driver.id} className={cn('p-4 space-y-3 border-l-[3px]', statusBorderColors[driver.status], bulkSelect.isSelected(driver.id) && 'bg-emerald-50/50 dark:bg-emerald-900/10')}>
                    <div className="flex items-center gap-3">
                      <Checkbox
                        checked={bulkSelect.isSelected(driver.id)}
                        onCheckedChange={() => bulkSelect.toggleOne(driver.id)}
                        aria-label={`Select ${driver.driverName}`}
                      />
                      <div className="flex-1 cursor-pointer" onClick={() => { setDetailDriverId(driver.id); setDetailDriverName(driver.driverName) }}>
                        <div className="flex items-center gap-2">
                          <DriverAvatar name={driver.driverName} size="sm" />
                          <p className="font-medium hover:text-emerald-600 dark:hover:text-emerald-400 transition-colors">{driver.driverName}</p>
                        </div>
                        <p className="text-sm text-muted-foreground">{driver.phone}</p>
                      </div>
                      <Badge variant="outline" className={statusColors[driver.status] || ''}>
                        {driver.status}
                      </Badge>
                    </div>
                    <div className="flex gap-2 ml-7">
                      <Button variant="outline" size="sm" onClick={() => { setSelectedDriver(driver); setViewOpen(true) }}>
                        <Eye className="size-3.5" />
                      </Button>
                      <Button variant="outline" size="sm" onClick={() => handleEdit(driver)}>
                        <Pencil className="size-3.5" />
                      </Button>
                      <Button variant="outline" size="sm" onClick={() => { setSelectedDriver(driver); setDeleteOpen(true) }}>
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
          totalItems={filteredDrivers.length}
          pageSize={pageSize}
        />
      </Card>

      {/* Add/Edit Dialog */}
      <Dialog open={formOpen} onOpenChange={(open) => { setFormOpen(open); if (!open) { setSelectedDriver(null); form.reset() } }}>
        <DialogContent className="sm:max-w-2xl p-4 sm:p-6">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              {selectedDriver ? 'Edit Driver' : 'Add New Driver'}
              {isFormDirty && (
                <span className="inline-flex items-center gap-1 text-xs text-amber-600 dark:text-amber-400 font-normal">
                  <span className="size-1.5 rounded-full bg-amber-500 animate-pulse" />
                  Unsaved changes
                </span>
              )}
            </DialogTitle>
            <DialogDescription>
              {selectedDriver ? 'Update driver information below' : 'Fill in the driver details'}
            </DialogDescription>
          </DialogHeader>
          <FormStepIndicator steps={driverFormSteps} currentStep={currentStep} className="mb-4 pb-3 border-b border-border" />
          <Form {...form}>
            <form onSubmit={form.handleSubmit(onSubmit)} className="flex flex-col flex-1 min-h-0">
              <div ref={formScrollRef} className="flex-1 overflow-y-auto pr-1 space-y-4" onScroll={handleFormScroll}>
              {/* Step 0: Personal Info */}
              <div ref={(el) => { stepSectionRefs.current[0] = el }} className="bg-muted/20 dark:bg-muted/10 rounded-lg p-3 space-y-3">
                <div>
                  <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider mb-3 flex items-center gap-1.5">
                    <UserRound className="size-3.5 text-blue-500" />
                    Personal Information
                  </p>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <FormField
                    control={form.control}
                    name="driverName"
                    render={({ field }) => (
                      <FormFieldWrapper error={form.formState.errors.driverName?.message} label="Full Name *">
                        <FormItem>
                          <FormControl>
                            <Input {...field} placeholder="John Doe" />
                          </FormControl>
                        </FormItem>
                      </FormFieldWrapper>
                    )}
                  />
                  <FormField
                    control={form.control}
                    name="phone"
                    render={({ field }) => (
                      <FormFieldWrapper error={form.formState.errors.phone?.message} label="Phone Number *">
                        <FormItem>
                          <FormControl>
                            <Input {...field} placeholder="024 000 0000" />
                          </FormControl>
                        </FormItem>
                      </FormFieldWrapper>
                    )}
                  />
                  </div>
                </div>
              </div>
              {/* Step 1: License & Emergency */}
              <div ref={(el) => { stepSectionRefs.current[1] = el }} className="rounded-lg p-3 space-y-3">
                <div>
                  <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider mb-3 flex items-center gap-1.5">
                    <ShieldCheck className="size-3.5 text-emerald-500" />
                    License & Emergency Contact
                  </p>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <FormField
                    control={form.control}
                    name="licenseNo"
                    render={({ field }) => (
                      <FormFieldWrapper error={form.formState.errors.licenseNo?.message} label="License Number *">
                        <FormItem>
                          <FormControl>
                            <Input {...field} placeholder="DL-00000" />
                          </FormControl>
                        </FormItem>
                      </FormFieldWrapper>
                    )}
                  />
                  <FormField
                    control={form.control}
                    name="licenseExpiry"
                    render={({ field }) => (
                      <FormFieldWrapper error={form.formState.errors.licenseExpiry?.message} label="License Expiry *" description="Drivers with expired licenses will be flagged">
                        <FormItem>
                          <FormControl>
                            <Input type="date" {...field} />
                          </FormControl>
                        </FormItem>
                      </FormFieldWrapper>
                    )}
                  />
                  <FormField
                    control={form.control}
                    name="emergencyContact"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Emergency Contact</FormLabel>
                        <FormControl>
                          <Input {...field} placeholder="Contact name" />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <FormField
                    control={form.control}
                    name="emergencyPhone"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Emergency Phone</FormLabel>
                        <FormControl>
                          <Input {...field} placeholder="024 000 0000" />
                        </FormControl>
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
                        <Select onValueChange={field.onChange} value={field.value}>
                          <FormControl>
                            <SelectTrigger>
                              <SelectValue placeholder="Select status" />
                            </SelectTrigger>
                          </FormControl>
                          <SelectContent>
                            <SelectItem value="active">Active</SelectItem>
                            <SelectItem value="inactive">Inactive</SelectItem>
                            <SelectItem value="suspended">Suspended</SelectItem>
                          </SelectContent>
                        </Select>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <FormField
                    control={form.control}
                    name="address"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Address</FormLabel>
                        <FormControl>
                          <Input {...field} placeholder="Driver address" />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  </div>
                </div>
              </div>
              {/* Step 2: Notes */}
              <div ref={(el) => { stepSectionRefs.current[2] = el }} className="bg-muted/20 dark:bg-muted/10 rounded-lg p-3 space-y-3">
                <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider mb-3 flex items-center gap-1.5">
                  <ClipboardList className="size-3.5 text-rose-500" />
                  Notes
                </p>
                <FormField
                  control={form.control}
                  name="notes"
                  render={({ field }) => (
                    <FormItem>
                      <FormControl>
                        <Textarea {...field} placeholder="Additional notes..." rows={3} />
                      </FormControl>
                      <div className="flex justify-end">
                        <span className="text-[10px] text-muted-foreground">{(watchNotes || '').length}/500</span>
                      </div>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>
              </div>
              <DialogFooter className="mt-4 pt-4 border-t shrink-0">
                <Button type="button" variant="ghost" onClick={() => { setFormOpen(false); form.reset() }}>
                  Cancel
                </Button>
                <Button type="submit" disabled={isSubmitting} className="hover:shadow-md transition-shadow">
                  {isSubmitting && <Loader2 className="size-4 animate-spin" />}
                  {selectedDriver ? 'Update Driver' : 'Add Driver'}
                </Button>
              </DialogFooter>
            </form>
          </Form>
        </DialogContent>
      </Dialog>

      {/* View Dialog */}
      <Dialog open={viewOpen} onOpenChange={setViewOpen}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>Driver Details</DialogTitle>
          </DialogHeader>
          {selectedDriver && (
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <p className="text-sm text-muted-foreground">Name</p>
                  <p className="font-medium">{selectedDriver.driverName}</p>
                </div>
                <div>
                  <p className="text-sm text-muted-foreground">Phone</p>
                  <p className="font-medium">{selectedDriver.phone}</p>
                </div>
                <div>
                  <p className="text-sm text-muted-foreground">License No.</p>
                  <p className="font-medium font-mono">{selectedDriver.licenseNo}</p>
                </div>
                <div>
                  <p className="text-sm text-muted-foreground">Status</p>
                  <Badge variant="outline" className={statusColors[selectedDriver.status] || ''}>
                    {selectedDriver.status}
                  </Badge>
                </div>
                <div>
                  <p className="text-sm text-muted-foreground">License Expiry</p>
                  <p className="font-medium">
                    {selectedDriver.licenseExpiry ? format(new Date(selectedDriver.licenseExpiry), 'MMM d, yyyy') : '—'}
                  </p>
                </div>
                <div>
                  <p className="text-sm text-muted-foreground">Hire Date</p>
                  <p className="font-medium">
                    {selectedDriver.hireDate ? format(new Date(selectedDriver.hireDate), 'MMM d, yyyy') : '—'}
                  </p>
                </div>
                {selectedDriver.emergencyContact && (
                  <div>
                    <p className="text-sm text-muted-foreground">Emergency Contact</p>
                    <p className="font-medium">{selectedDriver.emergencyContact}</p>
                  </div>
                )}
                {selectedDriver.emergencyPhone && (
                  <div>
                    <p className="text-sm text-muted-foreground">Emergency Phone</p>
                    <p className="font-medium">{selectedDriver.emergencyPhone}</p>
                  </div>
                )}
              </div>
              {selectedDriver.address && (
                <div>
                  <p className="text-sm text-muted-foreground">Address</p>
                  <p className="font-medium">{selectedDriver.address}</p>
                </div>
              )}
              {selectedDriver.notes && (
                <div>
                  <p className="text-sm text-muted-foreground">Notes</p>
                  <p className="text-sm">{selectedDriver.notes}</p>
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
            <AlertDialogTitle>Delete Selected Drivers</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete <strong>{bulkSelect.selectedCount}</strong> driver(s)? This action cannot be undone.
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
              Delete {bulkSelect.selectedCount} Driver(s)
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
            <AlertDialogTitle>Delete Driver</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete <strong>{selectedDriver?.driverName}</strong>? This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => selectedDriver && deleteMutation.mutate(selectedDriver.id)}
              className="bg-destructive text-white hover:bg-destructive/90"
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Driver Detail Sheet */}
      <DriverDetailSheet
        driverId={detailDriverId}
        driverName={detailDriverName}
        open={!!detailDriverId}
        onOpenChange={(open) => { if (!open) setDetailDriverId(null) }}
      />

      {/* CSV Import Dialog */}
      <CsvImportDialog
        open={importOpen}
        onOpenChange={setImportOpen}
        entityType="drivers"
        fields={DRIVER_FIELDS as unknown as { key: string; label: string; required: boolean }[]}
        onImportComplete={(created) => {
          queryClient.invalidateQueries({ queryKey: ['drivers'] })
          if (created > 0) toast.success(`Successfully imported ${created} drivers`)
        }}
      />
    </div>
  )
}
