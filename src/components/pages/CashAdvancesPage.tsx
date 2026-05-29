'use client'

import { useState, useEffect } from 'react'
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
  Trash2,
  Pencil,
  Banknote,
  AlertCircle,
  Loader2,
  CheckCircle,
  ArrowRight,
  ChevronRight,
  Wallet,
  Receipt,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { useAppStore } from '@/lib/store'
import { formatCurrency } from '@/lib/currency'
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
import { Checkbox } from '@/components/ui/checkbox'
import { toast } from '@/lib/toast-config'
import { DataPagination } from '@/components/ui/data-pagination'
import { StatusProgressStepper } from '@/components/ui/status-progress-stepper'
import { StatusDropdown } from '@/components/ui/status-dropdown'
import { useBulkSelect } from '@/hooks/use-bulk-select'

interface Driver {
  id: string
  driverName: string
}

interface Trip {
  id: string
  tripNumber: string
}

interface CashAdvanceData {
  id: string
  driverId: string
  amount: number
  purpose: string
  tripId?: string
  status: string
  approvedBy?: string
  approvedAt?: string
  disbursedAt?: string
  settledAt?: string
  notes: string
  createdAt: string
  driver?: Driver
  trip?: Trip
}

const caSchema = z.object({
  driverId: z.string().min(1, 'Driver is required'),
  amount: z.coerce.number().min(0.01, 'Amount must be greater than 0'),
  purpose: z.string().default(''),
  tripId: z.string().optional(),
  notes: z.string().default(''),
})

type CAFormValues = z.infer<typeof caSchema>

const statusColors: Record<string, string> = {
  pending: 'bg-yellow-100 text-yellow-800 border-yellow-200 dark:bg-yellow-900/30 dark:text-yellow-400 dark:border-yellow-800/50',
  approved: 'bg-blue-100 text-blue-800 border-blue-200 dark:bg-blue-900/30 dark:text-blue-400 dark:border-blue-800/50',
  disbursed: 'bg-purple-100 text-purple-800 border-purple-200 dark:bg-purple-900/30 dark:text-purple-400 dark:border-purple-800/50',
  settled: 'bg-emerald-100 text-emerald-800 border-emerald-200 dark:bg-emerald-900/30 dark:text-emerald-400 dark:border-emerald-800/50',
}

const caStatusSteps = ['pending', 'approved', 'disbursed', 'settled']

function DriverAvatar({ name }: { name: string }) {
  const initial = name?.charAt(0)?.toUpperCase() || '?'
  const colors = ['bg-sky-500', 'bg-violet-500', 'bg-rose-500', 'bg-amber-500', 'bg-teal-500', 'bg-indigo-500']
  const colorIndex = name ? name.charCodeAt(0) % colors.length : 0
  return (
    <div className={cn('size-7 rounded-full flex items-center justify-center text-white text-xs font-semibold shrink-0', colors[colorIndex])}>
      {initial}
    </div>
  )
}

const caStatusBorderColors: Record<string, string> = {
  pending: 'border-l-yellow-500',
  approved: 'border-l-blue-500',
  disbursed: 'border-l-green-500',
  settled: 'border-l-emerald-500',
}

export default function CashAdvancesPage() {
  const queryClient = useQueryClient()
  const { setCurrentView } = useAppStore()
  const [search, setSearch] = useState('')
  const debouncedSearch = useDebounce(search, 300)
  const [driverFilter, setDriverFilter] = useState<string>('all')
  const [statusFilter, setStatusFilter] = useState<string>('all')
  const [formOpen, setFormOpen] = useState(false)
  const [deleteOpen, setDeleteOpen] = useState(false)
  const [actionOpen, setActionOpen] = useState(false)
  const [selectedCA, setSelectedCA] = useState<CashAdvanceData | null>(null)
  const [pendingAction, setPendingAction] = useState<'approve' | 'disburse' | 'settle' | null>(null)
  const [currentPage, setCurrentPage] = useState(1)
  const pageSize = 10
  const [bulkDeleteOpen, setBulkDeleteOpen] = useState(false)
  const bulkSelect = useBulkSelect<CashAdvanceData>()

  // Listen for command palette "New Cash Advance" action
  useEffect(() => {
    const handler = () => setFormOpen(true)
    window.addEventListener('ifleetpro:open-form:cash-advances', handler)
    return () => window.removeEventListener('ifleetpro:open-form:cash-advances', handler)
  }, [])

  const { data: advances = [], isLoading, error, refetch } = useQuery<CashAdvanceData[]>({
    queryKey: ['cash-advances'],
    queryFn: async () => {
      const res = await fetch('/api/cash-advances')
      if (!res.ok) throw new Error('Failed to fetch cash advances')
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

  const { data: trips = [] } = useQuery<Trip[]>({
    queryKey: ['trips'],
    queryFn: async () => {
      const res = await fetch('/api/trips')
      if (!res.ok) return []
      return res.json()
    },
  })

  const form = useForm<CAFormValues>({
    resolver: zodResolver(caSchema),
    defaultValues: {
      driverId: '', amount: 0, purpose: '', tripId: '', notes: '',
    },
  })

  const createMutation = useMutation({
    mutationFn: async (data: CAFormValues) => {
      const res = await fetch('/api/cash-advances', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      })
      if (!res.ok) {
        const err = await res.json().catch(() => ({}))
        throw new Error(err.error || 'Failed to create cash advance')
      }
      return res.json()
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['cash-advances'] })
      toast.success('Cash advance created successfully')
      setFormOpen(false)
      form.reset()
    },
    onError: (err) => toast.error(err.message),
  })

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      const res = await fetch(`/api/cash-advances/${id}`, { method: 'DELETE' })
      if (!res.ok) {
        const err = await res.json().catch(() => ({}))
        throw new Error(err.error || 'Failed to delete cash advance')
      }
      return res.json()
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['cash-advances'] })
      toast.success('Cash advance deleted successfully')
      setDeleteOpen(false)
      setSelectedCA(null)
    },
    onError: (err) => toast.error(err.message),
  })

  const updateMutation = useMutation({
    mutationFn: async ({ id, ...data }: { id: string } & Record<string, unknown>) => {
      const res = await fetch(`/api/cash-advances/${id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      })
      if (!res.ok) {
        const err = await res.json().catch(() => ({}))
        throw new Error(err.error || 'Failed to update cash advance')
      }
      return res.json()
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['cash-advances'] })
      toast.success('Cash advance updated successfully')
      setFormOpen(false)
      setSelectedCA(null)
      form.reset()
    },
    onError: (err) => toast.error(err.message),
  })

  const actionMutation = useMutation({
    mutationFn: async ({ id, action }: { id: string; action: string }) => {
      const res = await fetch(`/api/cash-advances/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: action }),
      })
      if (!res.ok) {
        const err = await res.json().catch(() => ({}))
        throw new Error(err.error || `Failed to ${action}`)
      }
      return res.json()
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['cash-advances'] })
      toast.success('Action completed successfully')
      setActionOpen(false)
      setSelectedCA(null)
      setPendingAction(null)
    },
    onError: (err) => toast.error(err.message),
  })

  const handleAction = (ca: CashAdvanceData, action: 'approve' | 'disburse' | 'settle') => {
    setSelectedCA(ca)
    setPendingAction(action)
    setActionOpen(true)
  }

  const bulkDeleteMutation = useMutation({
    mutationFn: async (ids: string[]) => {
      await Promise.all(
        ids.map((id) =>
          fetch(`/api/cash-advances/${id}`, { method: 'DELETE' }).then((res) => {
            if (!res.ok) throw new Error('Failed to delete cash advance')
          })
        )
      )
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['cash-advances'] })
      toast.success(`${bulkSelect.selectedCount} cash advance(s) deleted successfully`)
      bulkSelect.clearSelection()
      setBulkDeleteOpen(false)
    },
    onError: () => {
      toast.error('Failed to delete some cash advances')
    },
  })

  const isBulkDeleting = bulkDeleteMutation.isPending

  const confirmAction = () => {
    if (selectedCA && pendingAction) {
      actionMutation.mutate({ id: selectedCA.id, action: pendingAction })
    }
  }

  const handleEdit = (ca: CashAdvanceData) => {
    setSelectedCA(ca)
    form.reset({
      driverId: ca.driverId,
      amount: ca.amount,
      purpose: ca.purpose || '',
      tripId: ca.tripId || '',
      notes: ca.notes || '',
    })
    setFormOpen(true)
  }

  const handleAdd = () => {
    setSelectedCA(null)
    form.reset({
      driverId: '', amount: 0, purpose: '', tripId: '', notes: '',
    })
    setFormOpen(true)
  }

  const onSubmit = (data: CAFormValues) => {
    if (selectedCA) {
      updateMutation.mutate({ id: selectedCA.id, ...data })
    } else {
      createMutation.mutate(data)
    }
  }

  const filteredAdvances = advances.filter((ca) => {
    const s = debouncedSearch.toLowerCase()
    const matchSearch =
      ca.driver?.driverName?.toLowerCase().includes(s) ||
      ca.purpose.toLowerCase().includes(s)
    const matchDriver = driverFilter === 'all' || ca.driverId === driverFilter
    const matchStatus = statusFilter === 'all' || ca.status === statusFilter
    return matchSearch && matchDriver && matchStatus
  })

  const summaryStats = {
    total: advances.reduce((sum, ca) => sum + ca.amount, 0),
    pending: advances.filter((ca) => ca.status === 'pending').reduce((sum, ca) => sum + ca.amount, 0),
    approved: advances.filter((ca) => ca.status === 'approved').reduce((sum, ca) => sum + ca.amount, 0),
    disbursed: advances.filter((ca) => ca.status === 'disbursed').reduce((sum, ca) => sum + ca.amount, 0),
    settled: advances.filter((ca) => ca.status === 'settled').reduce((sum, ca) => sum + ca.amount, 0),
  }

  const statusCounts = (() => {
    const counts: Record<string, number> = { all: advances.length }
    advances.forEach((ca) => { counts[ca.status] = (counts[ca.status] || 0) + 1 })
    return counts
  })()

  const totalPages = Math.ceil(filteredAdvances.length / pageSize)
  const paginatedAdvances = filteredAdvances.slice((currentPage - 1) * pageSize, currentPage * pageSize)

  const isSubmitting = createMutation.isPending || updateMutation.isPending

  if (isLoading) return <PageSkeleton statsCount={3} filterRow tableRows={5} />

  if (error) {
    return (
      <div className="flex flex-col items-center justify-center h-[60vh] gap-4">
        <AlertCircle className="size-12 text-destructive" />
        <p className="text-muted-foreground">Failed to load cash advances</p>
        <Button variant="outline" onClick={() => refetch()}>Try Again</Button>
      </div>
    )
  }

  const actionLabels: Record<string, string> = {
    approve: 'Approve',
    disburse: 'Disburse',
    settle: 'Settle',
  }

  return (
    <div className="p-4 md:p-6 space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 pb-4 border-b">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <button onClick={() => setCurrentView('dashboard')} className="text-sm text-muted-foreground hover:text-foreground transition-colors">Dashboard</button>
            <ChevronRight className="size-3.5 text-muted-foreground" />
            <span className="text-sm font-medium">Cash Advances</span>
          </div>
          <div className="flex items-center gap-3">
            <h1 className="text-2xl font-bold">Cash Advances</h1>
            {!isLoading && <span className="text-sm font-medium text-muted-foreground bg-muted rounded-full px-2.5 py-0.5">{advances.length}</span>}
          </div>
          <p className="text-muted-foreground text-sm">Manage driver cash advance requests</p>
        </div>
        <Button onClick={handleAdd} size="sm">
          <Plus className="size-4" />
          New Cash Advance
        </Button>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <div className="rounded-lg border bg-card p-3">
          <p className="text-xs text-muted-foreground">Total Amount</p>
          <p className="text-lg font-bold mt-1">{formatCurrency(summaryStats.total)}</p>
        </div>
        <div className="rounded-lg border bg-yellow-50 dark:bg-yellow-900/20 p-3">
          <p className="text-xs text-yellow-700 dark:text-yellow-400">Pending</p>
          <p className="text-lg font-bold text-yellow-800 dark:text-yellow-400 mt-1">{formatCurrency(summaryStats.pending)}</p>
        </div>
        <div className="rounded-lg border bg-blue-50 dark:bg-blue-900/20 p-3">
          <p className="text-xs text-blue-700 dark:text-blue-400">Approved</p>
          <p className="text-lg font-bold text-blue-800 dark:text-blue-400 mt-1">{formatCurrency(summaryStats.approved)}</p>
        </div>
        <div className="rounded-lg border bg-emerald-50 dark:bg-emerald-900/20 p-3">
          <p className="text-xs text-emerald-700 dark:text-emerald-400">Disbursed &amp; Settled</p>
          <p className="text-lg font-bold text-emerald-800 dark:text-emerald-400 mt-1">{formatCurrency(summaryStats.disbursed + summaryStats.settled)}</p>
        </div>
      </div>

      {/* Filters */}
      <Card>
        <CardContent className="p-4">
          <div className="flex flex-col sm:flex-row gap-3">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 size-4 text-muted-foreground" />
              <Input
                placeholder="Search by driver or purpose..."
                value={search}
                onChange={(e) => { setSearch(e.target.value); setCurrentPage(1) }}
                className="pl-9"
              />
            </div>
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
            <Select value={statusFilter} onValueChange={(val) => { setStatusFilter(val); setCurrentPage(1) }}>
              <SelectTrigger className="w-full sm:w-40">
                <SelectValue placeholder="Status" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Status <Badge variant="secondary" className="ml-1 h-5 min-w-5 text-xs px-1">{statusCounts.all || 0}</Badge></SelectItem>
                <SelectItem value="pending">Pending <Badge variant="secondary" className="ml-1 h-5 min-w-5 text-xs px-1">{statusCounts.pending || 0}</Badge></SelectItem>
                <SelectItem value="approved">Approved <Badge variant="secondary" className="ml-1 h-5 min-w-5 text-xs px-1">{statusCounts.approved || 0}</Badge></SelectItem>
                <SelectItem value="disbursed">Disbursed <Badge variant="secondary" className="ml-1 h-5 min-w-5 text-xs px-1">{statusCounts.disbursed || 0}</Badge></SelectItem>
                <SelectItem value="settled">Settled <Badge variant="secondary" className="ml-1 h-5 min-w-5 text-xs px-1">{statusCounts.settled || 0}</Badge></SelectItem>
              </SelectContent>
            </Select>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardContent className="p-0">
          {filteredAdvances.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-20 text-muted-foreground">
              <div className="relative mb-6">
                <motion.div className="size-20 rounded-2xl bg-muted flex items-center justify-center" animate={{ y: [0, -8, 0] }} transition={{ duration: 3, repeat: Infinity, ease: 'easeInOut' }}>
                  <Banknote className="size-10 opacity-30" />
                </motion.div>
                <motion.div className="absolute -top-1 -right-1 size-8 rounded-lg bg-muted/80 flex items-center justify-center" animate={{ y: [0, -6, 0] }} transition={{ duration: 3, repeat: Infinity, ease: 'easeInOut', delay: 0.3 }}>
                  <Wallet className="size-4 opacity-40" />
                </motion.div>
                <motion.div className="absolute -bottom-1 -left-1 size-8 rounded-lg bg-muted/80 flex items-center justify-center" animate={{ y: [0, -6, 0] }} transition={{ duration: 3, repeat: Infinity, ease: 'easeInOut', delay: 0.6 }}>
                  <Receipt className="size-4 opacity-40" />
                </motion.div>
              </div>
              <p className="text-base font-medium">No cash advances found</p>
              <p className="text-sm mt-1 max-w-xs text-center">Create a cash advance request to provide funds for driver expenses.</p>
              <ul className="text-xs text-muted-foreground mt-3 space-y-1">
                <li className="flex items-center gap-1.5"><span className="size-1 rounded-full bg-muted-foreground/50" /> Submit and track approval workflow</li>
                <li className="flex items-center gap-1.5"><span className="size-1 rounded-full bg-muted-foreground/50" /> Link advances to specific trips</li>
                <li className="flex items-center gap-1.5"><span className="size-1 rounded-full bg-muted-foreground/50" /> Settle against trip settlements</li>
              </ul>
              <Button variant="outline" size="sm" className="mt-5" onClick={() => setFormOpen(true)}>
                <Plus className="size-4" />
                Create First Cash Advance
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
                          checked={bulkSelect.isAllSelected(paginatedAdvances)}
                          onCheckedChange={() => bulkSelect.toggleAll(paginatedAdvances)}
                          aria-label="Select all cash advances"
                        />
                      </TableHead>
                      <TableHead>Driver</TableHead>
                      <TableHead className="text-right">Amount</TableHead>
                      <TableHead>Purpose</TableHead>
                      <TableHead>Trip</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead>Date</TableHead>
                      <TableHead>Approved By</TableHead>
                      <TableHead className="text-right">Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {paginatedAdvances.map((ca, idx) => (
                      <TableRow key={ca.id} className={cn('border-l-[3px] transition-colors hover:bg-muted/50', idx % 2 === 1 ? 'bg-muted/30' : '', caStatusBorderColors[ca.status], bulkSelect.isSelected(ca.id) && 'bg-emerald-50/50 dark:bg-emerald-900/10')}>
                        <TableCell>
                          <Checkbox
                            checked={bulkSelect.isSelected(ca.id)}
                            onCheckedChange={() => bulkSelect.toggleOne(ca.id)}
                            aria-label={`Select cash advance for ${ca.driver?.driverName}`}
                          />
                        </TableCell>
                        <TableCell>
                          <div className="flex items-center gap-2">
                            <DriverAvatar name={ca.driver?.driverName || ''} />
                            <span className="font-medium">{ca.driver?.driverName || '—'}</span>
                          </div>
                        </TableCell>
                        <TableCell className="text-right font-medium">{formatCurrency(ca.amount)}</TableCell>
                        <TableCell className="max-w-32 truncate">{ca.purpose || '—'}</TableCell>
                        <TableCell className="text-sm font-mono">{ca.trip?.tripNumber || '—'}</TableCell>
                        <TableCell>
                          <div className="flex flex-col gap-2">
                            <StatusDropdown
                              currentStatus={ca.status}
                              onStatusChange={(newStatus) => {
                                actionMutation.mutate(
                                  { id: ca.id, action: newStatus },
                                  {
                                    onSuccess: () => {
                                      toast.success(`Cash advance status updated to ${newStatus}`)
                                    },
                                  }
                                )
                              }}
                              statuses={[
                                { value: 'pending', label: 'Pending', color: statusColors.pending, dotColor: 'bg-yellow-500' },
                                { value: 'approved', label: 'Approved', color: statusColors.approved, dotColor: 'bg-blue-500' },
                                { value: 'disbursed', label: 'Disbursed', color: statusColors.disbursed, dotColor: 'bg-purple-500' },
                                { value: 'settled', label: 'Settled', color: statusColors.settled, dotColor: 'bg-emerald-500' },
                              ]}
                              isLoading={actionMutation.isPending}
                              size="sm"
                            />
                            <StatusProgressStepper
                              steps={caStatusSteps.map((step) => ({
                                label: step.charAt(0).toUpperCase() + step.slice(1),
                                status: caStatusSteps.indexOf(step) < caStatusSteps.indexOf(ca.status)
                                  ? 'completed'
                                  : step === ca.status
                                    ? 'current'
                                    : 'upcoming',
                              }))}
                              className="max-w-[280px]"
                            />
                          </div>
                        </TableCell>
                        <TableCell className="text-muted-foreground text-sm">
                          {format(new Date(ca.createdAt), 'MMM d, yyyy')}
                        </TableCell>
                        <TableCell className="text-sm">{ca.approvedBy || '—'}</TableCell>
                        <TableCell className="text-right">
                          <div className="flex justify-end gap-1">
                            {ca.status === 'pending' && (
                              <>
                                <Button variant="ghost" size="icon" onClick={() => handleEdit(ca)}>
                                  <Pencil className="size-4" />
                                </Button>
                                <Button variant="ghost" size="sm" onClick={() => handleAction(ca, 'approve')} className="text-blue-600 hover:text-blue-700 hover:bg-blue-50 dark:text-blue-400 dark:hover:text-blue-300 dark:hover:bg-blue-900/30">
                                  <CheckCircle className="size-3.5" />
                                  Approve
                                </Button>
                                <Button variant="ghost" size="icon" onClick={() => { setSelectedCA(ca); setDeleteOpen(true) }}>
                                  <Trash2 className="size-4 text-destructive" />
                                </Button>
                              </>
                            )}
                            {ca.status === 'approved' && (
                              <>
                                <Button variant="ghost" size="icon" onClick={() => handleEdit(ca)}>
                                  <Pencil className="size-4" />
                                </Button>
                                <Button variant="ghost" size="sm" onClick={() => handleAction(ca, 'disburse')} className="text-purple-600 hover:text-purple-700 hover:bg-purple-50 dark:text-purple-400 dark:hover:text-purple-300 dark:hover:bg-purple-900/30">
                                  <ArrowRight className="size-3.5" />
                                  Disburse
                                </Button>
                              </>
                            )}
                            {ca.status === 'disbursed' && (
                              <Button variant="ghost" size="sm" onClick={() => handleAction(ca, 'settle')} className="text-emerald-600 hover:text-emerald-700 hover:bg-emerald-50 dark:text-emerald-400 dark:hover:text-emerald-300 dark:hover:bg-emerald-900/30">
                                <CheckCircle className="size-3.5" />
                                Settle
                              </Button>
                            )}
                          </div>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                  <TableFooter>
                    <TableRow className="bg-muted/50 font-semibold border-t-2 border-muted-foreground/20 hover:bg-muted/50">
                      <TableCell className="text-sm">Totals ({filteredAdvances.length})</TableCell>
                      <TableCell className="text-right text-sm font-bold">
                        {formatCurrency(filteredAdvances.reduce((sum, ca) => sum + ca.amount, 0))}
                      </TableCell>
                      <TableCell />
                      <TableCell />
                      <TableCell />
                      <TableCell />
                      <TableCell />
                      <TableCell />
                    </TableRow>
                  </TableFooter>
                </Table>
              </div>

              <div className="md:hidden divide-y">
                {paginatedAdvances.map((ca) => (
                  <div key={ca.id} className={cn('p-4 space-y-3 border-l-[3px] transition-colors active:bg-muted/50', caStatusBorderColors[ca.status], bulkSelect.isSelected(ca.id) && 'bg-emerald-50/50 dark:bg-emerald-900/10')}>
                    <div className="flex items-start justify-between">
                      <div className="flex items-center gap-3">
                        <Checkbox
                          checked={bulkSelect.isSelected(ca.id)}
                          onCheckedChange={() => bulkSelect.toggleOne(ca.id)}
                          aria-label={`Select cash advance for ${ca.driver?.driverName}`}
                        />
                        <div className="flex-1 min-w-0 mr-2">
                          <p className="font-semibold truncate">{ca.driver?.driverName || '—'}</p>
                          <p className="text-sm text-muted-foreground truncate">{ca.purpose || 'No purpose'}</p>
                        </div>
                      </div>
                      <Badge variant="outline" className={cn('shrink-0 text-[10px] px-1.5', statusColors[ca.status] || '')}>
                        {ca.status}
                      </Badge>
                    </div>
                    <div className="flex items-center justify-between">
                      <p className="text-lg font-bold text-foreground">{formatCurrency(ca.amount)}</p>
                      <div className="flex gap-1">
                        {ca.status === 'pending' && (
                          <>
                            <Button variant="outline" size="sm" onClick={() => handleEdit(ca)}>
                              <Pencil className="size-3.5" />
                            </Button>
                            <Button variant="outline" size="sm" onClick={() => handleAction(ca, 'approve')}>
                              <CheckCircle className="size-3.5" />
                            </Button>
                            <Button variant="outline" size="sm" onClick={() => { setSelectedCA(ca); setDeleteOpen(true) }}>
                              <Trash2 className="size-3.5 text-destructive" />
                            </Button>
                          </>
                        )}
                        {ca.status === 'approved' && (
                          <>
                            <Button variant="outline" size="sm" onClick={() => handleEdit(ca)}>
                              <Pencil className="size-3.5" />
                            </Button>
                            <Button variant="outline" size="sm" onClick={() => handleAction(ca, 'disburse')}>
                              <ArrowRight className="size-3.5" />
                            </Button>
                          </>
                        )}
                        {ca.status === 'disbursed' && (
                          <Button variant="outline" size="sm" onClick={() => handleAction(ca, 'settle')}>
                            <CheckCircle className="size-3.5" />
                          </Button>
                        )}
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
          totalItems={filteredAdvances.length}
          pageSize={pageSize}
        />
      </Card>

      {/* Add/Edit Dialog */}
      <Dialog open={formOpen} onOpenChange={(open) => { setFormOpen(open); if (!open) { setSelectedCA(null); form.reset() } }}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>{selectedCA ? 'Edit Cash Advance' : 'New Cash Advance'}</DialogTitle>
            <DialogDescription>
              {selectedCA ? 'Update cash advance details' : 'Create a cash advance request for a driver'}
            </DialogDescription>
          </DialogHeader>
          <Form {...form}>
            <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
              <FormField control={form.control} name="driverId" render={({ field }) => (
                <FormItem>
                  <FormLabel>Driver *</FormLabel>
                  <Select onValueChange={field.onChange} value={field.value}>
                    <FormControl><SelectTrigger><SelectValue placeholder="Select driver" /></SelectTrigger></FormControl>
                    <SelectContent>
                      {drivers.map((d) => (
                        <SelectItem key={d.id} value={d.id}>{d.driverName}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <FormMessage />
                </FormItem>
              )} />
              <FormField control={form.control} name="amount" render={({ field }) => (
                <FormItem>
                  <FormLabel>Amount (₵) *</FormLabel>
                  <FormControl><Input type="number" step="0.01" {...field} placeholder="500.00" /></FormControl>
                  <FormMessage />
                </FormItem>
              )} />
              <FormField control={form.control} name="purpose" render={({ field }) => (
                <FormItem>
                  <FormLabel>Purpose</FormLabel>
                  <FormControl><Input {...field} placeholder="Fuel, maintenance, etc." /></FormControl>
                  <FormMessage />
                </FormItem>
              )} />
              <FormField control={form.control} name="tripId" render={({ field }) => (
                <FormItem>
                  <FormLabel>Associated Trip (optional)</FormLabel>
                  <Select onValueChange={field.onChange} value={field.value}>
                    <FormControl><SelectTrigger><SelectValue placeholder="Select trip" /></SelectTrigger></FormControl>
                    <SelectContent>
                      {trips.map((t) => (
                        <SelectItem key={t.id} value={t.id}>{t.tripNumber}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <FormMessage />
                </FormItem>
              )} />
              <FormField control={form.control} name="notes" render={({ field }) => (
                <FormItem>
                  <FormLabel>Notes</FormLabel>
                  <FormControl><Textarea {...field} placeholder="Additional notes..." rows={3} /></FormControl>
                  <FormMessage />
                </FormItem>
              )} />
              <DialogFooter>
                <Button type="button" variant="outline" onClick={() => { setFormOpen(false); form.reset(); setSelectedCA(null) }}>Cancel</Button>
                <Button type="submit" disabled={isSubmitting}>
                  {isSubmitting && <Loader2 className="size-4 animate-spin" />}
                  {selectedCA ? 'Update Cash Advance' : 'Create Cash Advance'}
                </Button>
              </DialogFooter>
            </form>
          </Form>
        </DialogContent>
      </Dialog>

      {/* Action Confirmation Dialog */}
      <AlertDialog open={actionOpen} onOpenChange={setActionOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{pendingAction ? actionLabels[pendingAction] : ''} Cash Advance</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to <strong>{pendingAction}</strong> the cash advance of{' '}
              <strong>{formatCurrency(selectedCA?.amount || 0)}</strong> for{' '}
              <strong>{selectedCA?.driver?.driverName}</strong>?
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={confirmAction}>
              {pendingAction ? actionLabels[pendingAction] : 'Confirm'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Delete Confirmation */}
      <AlertDialog open={deleteOpen} onOpenChange={setDeleteOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Cash Advance</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete the cash advance for{' '}
              <strong>{selectedCA?.driver?.driverName}</strong>? This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => selectedCA && deleteMutation.mutate(selectedCA.id)}
              className="bg-destructive text-white hover:bg-destructive/90"
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Bulk Delete Confirmation */}
      <AlertDialog open={bulkDeleteOpen} onOpenChange={setBulkDeleteOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Selected Cash Advances</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete <strong>{bulkSelect.selectedCount}</strong> cash advance(s)? This action cannot be undone.
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
              Delete {bulkSelect.selectedCount} Cash Advance(s)
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
    </div>
  )
}
