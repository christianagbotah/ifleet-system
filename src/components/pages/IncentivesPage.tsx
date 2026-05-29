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
  TrendingUp,
  AlertCircle,
  Loader2,
  CheckCircle,
  Banknote,
  ChevronRight,
  Award,
  Star,
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

interface IncentiveData {
  id: string
  driverId: string
  tripId?: string
  incentiveType: string
  amount: number
  description: string
  period: string
  status: string
  approvedBy?: string
  approvedAt?: string
  paidAt?: string
  notes: string
  createdAt: string
  driver?: Driver
}

const incentiveSchema = z.object({
  driverId: z.string().min(1, 'Driver is required'),
  amount: z.coerce.number().min(0.01, 'Amount must be greater than 0'),
  incentiveType: z.enum(['performance', 'safety', 'bonus', 'overtime']),
  description: z.string().default(''),
  period: z.string().default(''),
  notes: z.string().default(''),
})

type IncentiveFormValues = z.infer<typeof incentiveSchema>

const statusColors: Record<string, string> = {
  pending: 'bg-yellow-100 text-yellow-800 border-yellow-200 dark:bg-yellow-900/30 dark:text-yellow-400 dark:border-yellow-800/50',
  approved: 'bg-blue-100 text-blue-800 border-blue-200 dark:bg-blue-900/30 dark:text-blue-400 dark:border-blue-800/50',
  paid: 'bg-emerald-100 text-emerald-800 border-emerald-200 dark:bg-emerald-900/30 dark:text-emerald-400 dark:border-emerald-800/50',
}

const typeLabels: Record<string, string> = {
  performance: 'Performance',
  safety: 'Safety',
  bonus: 'Bonus',
  overtime: 'Overtime',
}

const typeColors: Record<string, string> = {
  performance: 'bg-blue-50 text-blue-700 border-blue-200 dark:bg-blue-900/30 dark:text-blue-400 dark:border-blue-800/50',
  safety: 'bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-900/30 dark:text-emerald-400 dark:border-emerald-800/50',
  bonus: 'bg-amber-50 text-amber-700 border-amber-200 dark:bg-amber-900/30 dark:text-amber-400 dark:border-amber-800/50',
  overtime: 'bg-purple-50 text-purple-700 border-purple-200 dark:bg-purple-900/30 dark:text-purple-400 dark:border-purple-800/50',
}

const incStatusSteps = ['pending', 'approved', 'paid']

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

const incStatusBorderColors: Record<string, string> = {
  pending: 'border-l-yellow-500',
  approved: 'border-l-blue-500',
  paid: 'border-l-emerald-500',
}

export default function IncentivesPage() {
  const queryClient = useQueryClient()
  const { setCurrentView } = useAppStore()
  const [search, setSearch] = useState('')
  const debouncedSearch = useDebounce(search, 300)
  const [driverFilter, setDriverFilter] = useState<string>('all')
  const [statusFilter, setStatusFilter] = useState<string>('all')
  const [typeFilter, setTypeFilter] = useState<string>('all')
  const [formOpen, setFormOpen] = useState(false)
  const [deleteOpen, setDeleteOpen] = useState(false)
  const [actionOpen, setActionOpen] = useState(false)
  const [selectedIncentive, setSelectedIncentive] = useState<IncentiveData | null>(null)
  const [pendingAction, setPendingAction] = useState<'approve' | 'paid' | null>(null)
  const [currentPage, setCurrentPage] = useState(1)
  const pageSize = 10
  const [bulkDeleteOpen, setBulkDeleteOpen] = useState(false)
  const bulkSelect = useBulkSelect<IncentiveData>()

  // Listen for command palette "New Incentive" action
  useEffect(() => {
    const handler = () => setFormOpen(true)
    window.addEventListener('ifleetpro:open-form:incentives', handler)
    return () => window.removeEventListener('ifleetpro:open-form:incentives', handler)
  }, [])

  const { data: incentives = [], isLoading, error, refetch } = useQuery<IncentiveData[]>({
    queryKey: ['incentives'],
    queryFn: async () => {
      const res = await fetch('/api/incentives')
      if (!res.ok) throw new Error('Failed to fetch incentives')
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

  const form = useForm<IncentiveFormValues>({
    resolver: zodResolver(incentiveSchema),
    defaultValues: {
      driverId: '', amount: 0, incentiveType: 'performance',
      description: '', period: '', notes: '',
    },
  })

  const createMutation = useMutation({
    mutationFn: async (data: IncentiveFormValues) => {
      const res = await fetch('/api/incentives', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      })
      if (!res.ok) {
        const err = await res.json().catch(() => ({}))
        throw new Error(err.error || 'Failed to create incentive')
      }
      return res.json()
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['incentives'] })
      toast.success('Incentive created successfully')
      setFormOpen(false)
      form.reset()
    },
    onError: (err) => toast.error(err.message),
  })

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      const res = await fetch(`/api/incentives/${id}`, { method: 'DELETE' })
      if (!res.ok) {
        const err = await res.json().catch(() => ({}))
        throw new Error(err.error || 'Failed to delete incentive')
      }
      return res.json()
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['incentives'] })
      toast.success('Incentive deleted successfully')
      setDeleteOpen(false)
      setSelectedIncentive(null)
    },
    onError: (err) => toast.error(err.message),
  })

  const updateMutation = useMutation({
    mutationFn: async ({ id, ...data }: { id: string } & Record<string, unknown>) => {
      const res = await fetch(`/api/incentives/${id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      })
      if (!res.ok) {
        const err = await res.json().catch(() => ({}))
        throw new Error(err.error || 'Failed to update incentive')
      }
      return res.json()
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['incentives'] })
      toast.success('Incentive updated successfully')
      setFormOpen(false)
      setSelectedIncentive(null)
      form.reset()
    },
    onError: (err) => toast.error(err.message),
  })

  const actionMutation = useMutation({
    mutationFn: async ({ id, action }: { id: string; action: string }) => {
      const res = await fetch(`/api/incentives/${id}`, {
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
      queryClient.invalidateQueries({ queryKey: ['incentives'] })
      toast.success('Action completed successfully')
      setActionOpen(false)
      setSelectedIncentive(null)
      setPendingAction(null)
    },
    onError: (err) => toast.error(err.message),
  })

  const handleAction = (inc: IncentiveData, action: 'approve' | 'paid') => {
    setSelectedIncentive(inc)
    setPendingAction(action)
    setActionOpen(true)
  }

  const bulkDeleteMutation = useMutation({
    mutationFn: async (ids: string[]) => {
      await Promise.all(
        ids.map((id) =>
          fetch(`/api/incentives/${id}`, { method: 'DELETE' }).then((res) => {
            if (!res.ok) throw new Error('Failed to delete incentive')
          })
        )
      )
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['incentives'] })
      toast.success(`${bulkSelect.selectedCount} incentive(s) deleted successfully`)
      bulkSelect.clearSelection()
      setBulkDeleteOpen(false)
    },
    onError: () => {
      toast.error('Failed to delete some incentives')
    },
  })

  const isBulkDeleting = bulkDeleteMutation.isPending

  const confirmAction = () => {
    if (selectedIncentive && pendingAction) {
      const status = pendingAction === 'approve' ? 'approved' : 'paid'
      actionMutation.mutate({ id: selectedIncentive.id, action: status })
    }
  }

  const handleEdit = (inc: IncentiveData) => {
    setSelectedIncentive(inc)
    form.reset({
      driverId: inc.driverId,
      amount: inc.amount,
      incentiveType: inc.incentiveType as IncentiveFormValues['incentiveType'],
      description: inc.description || '',
      period: inc.period || '',
      notes: inc.notes || '',
    })
    setFormOpen(true)
  }

  const handleAdd = () => {
    setSelectedIncentive(null)
    form.reset({
      driverId: '', amount: 0, incentiveType: 'performance',
      description: '', period: '', notes: '',
    })
    setFormOpen(true)
  }

  const onSubmit = (data: IncentiveFormValues) => {
    if (selectedIncentive) {
      updateMutation.mutate({ id: selectedIncentive.id, ...data })
    } else {
      createMutation.mutate(data)
    }
  }

  const filteredIncentives = incentives.filter((inc) => {
    const s = debouncedSearch.toLowerCase()
    const matchSearch =
      inc.driver?.driverName?.toLowerCase().includes(s) ||
      inc.description.toLowerCase().includes(s)
    const matchDriver = driverFilter === 'all' || inc.driverId === driverFilter
    const matchStatus = statusFilter === 'all' || inc.status === statusFilter
    const matchType = typeFilter === 'all' || inc.incentiveType === typeFilter
    return matchSearch && matchDriver && matchStatus && matchType
  })

  const summaryStats = {
    total: incentives.reduce((sum, inc) => sum + inc.amount, 0),
    pending: incentives.filter((inc) => inc.status === 'pending').reduce((sum, inc) => sum + inc.amount, 0),
    approved: incentives.filter((inc) => inc.status === 'approved').reduce((sum, inc) => sum + inc.amount, 0),
    paid: incentives.filter((inc) => inc.status === 'paid').reduce((sum, inc) => sum + inc.amount, 0),
  }

  const statusCounts = (() => {
    const counts: Record<string, number> = { all: incentives.length }
    incentives.forEach((inc) => { counts[inc.status] = (counts[inc.status] || 0) + 1 })
    return counts
  })()

  const totalPages = Math.ceil(filteredIncentives.length / pageSize)
  const paginatedIncentives = filteredIncentives.slice((currentPage - 1) * pageSize, currentPage * pageSize)

  const isSubmitting = createMutation.isPending || updateMutation.isPending

  if (isLoading) return <PageSkeleton statsCount={3} filterRow tableRows={5} />

  if (error) {
    return (
      <div className="flex flex-col items-center justify-center h-[60vh] gap-4">
        <AlertCircle className="size-12 text-destructive" />
        <p className="text-muted-foreground">Failed to load incentives</p>
        <Button variant="outline" onClick={() => refetch()}>Try Again</Button>
      </div>
    )
  }

  const actionLabels: Record<string, string> = {
    approve: 'Approve',
    paid: 'Mark as Paid',
  }

  return (
    <div className="p-4 md:p-6 space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 pb-4 border-b">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <button onClick={() => setCurrentView('dashboard')} className="text-sm text-muted-foreground hover:text-foreground transition-colors">Dashboard</button>
            <ChevronRight className="size-3.5 text-muted-foreground" />
            <span className="text-sm font-medium">Incentives</span>
          </div>
          <div className="flex items-center gap-3">
            <h1 className="text-2xl font-bold">Driver Incentives</h1>
            {!isLoading && <span className="text-sm font-medium text-muted-foreground bg-muted rounded-full px-2.5 py-0.5">{incentives.length}</span>}
          </div>
          <p className="text-muted-foreground text-sm">Manage driver incentives and bonuses</p>
        </div>
        <Button onClick={handleAdd} size="sm">
          <Plus className="size-4" />
          New Incentive
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
          <p className="text-xs text-emerald-700 dark:text-emerald-400">Paid</p>
          <p className="text-lg font-bold text-emerald-800 dark:text-emerald-400 mt-1">{formatCurrency(summaryStats.paid)}</p>
        </div>
      </div>

      {/* Filters */}
      <Card>
        <CardContent className="p-4">
          <div className="flex flex-col sm:flex-row gap-3">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 size-4 text-muted-foreground" />
              <Input
                placeholder="Search by driver or description..."
                value={search}
                onChange={(e) => { setSearch(e.target.value); setCurrentPage(1) }}
                className="pl-9"
              />
            </div>
            <Select value={driverFilter} onValueChange={(val) => { setDriverFilter(val); setCurrentPage(1) }}>
              <SelectTrigger className="w-full sm:w-40">
                <SelectValue placeholder="Driver" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Drivers</SelectItem>
                {drivers.map((d) => (
                  <SelectItem key={d.id} value={d.id}>{d.driverName}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select value={typeFilter} onValueChange={(val) => { setTypeFilter(val); setCurrentPage(1) }}>
              <SelectTrigger className="w-full sm:w-36">
                <SelectValue placeholder="Type" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Types</SelectItem>
                <SelectItem value="performance">Performance</SelectItem>
                <SelectItem value="safety">Safety</SelectItem>
                <SelectItem value="bonus">Bonus</SelectItem>
                <SelectItem value="overtime">Overtime</SelectItem>
              </SelectContent>
            </Select>
            <Select value={statusFilter} onValueChange={(val) => { setStatusFilter(val); setCurrentPage(1) }}>
              <SelectTrigger className="w-full sm:w-36">
                <SelectValue placeholder="Status" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Status <Badge variant="secondary" className="ml-1 h-5 min-w-5 text-xs px-1">{statusCounts.all || 0}</Badge></SelectItem>
                <SelectItem value="pending">Pending <Badge variant="secondary" className="ml-1 h-5 min-w-5 text-xs px-1">{statusCounts.pending || 0}</Badge></SelectItem>
                <SelectItem value="approved">Approved <Badge variant="secondary" className="ml-1 h-5 min-w-5 text-xs px-1">{statusCounts.approved || 0}</Badge></SelectItem>
                <SelectItem value="paid">Paid <Badge variant="secondary" className="ml-1 h-5 min-w-5 text-xs px-1">{statusCounts.paid || 0}</Badge></SelectItem>
              </SelectContent>
            </Select>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardContent className="p-0">
          {filteredIncentives.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-20 text-muted-foreground">
              <div className="relative mb-6">
                <motion.div className="size-20 rounded-2xl bg-muted flex items-center justify-center" animate={{ y: [0, -8, 0] }} transition={{ duration: 3, repeat: Infinity, ease: 'easeInOut' }}>
                  <TrendingUp className="size-10 opacity-30" />
                </motion.div>
                <motion.div className="absolute -top-1 -right-1 size-8 rounded-lg bg-muted/80 flex items-center justify-center" animate={{ y: [0, -6, 0] }} transition={{ duration: 3, repeat: Infinity, ease: 'easeInOut', delay: 0.3 }}>
                  <Award className="size-4 opacity-40" />
                </motion.div>
                <motion.div className="absolute -bottom-1 -left-1 size-8 rounded-lg bg-muted/80 flex items-center justify-center" animate={{ y: [0, -6, 0] }} transition={{ duration: 3, repeat: Infinity, ease: 'easeInOut', delay: 0.6 }}>
                  <Star className="size-4 opacity-40" />
                </motion.div>
              </div>
              <p className="text-base font-medium">No incentives found</p>
              <p className="text-sm mt-1 max-w-xs text-center">Create driver incentives to reward outstanding performance and achievements.</p>
              <ul className="text-xs text-muted-foreground mt-3 space-y-1">
                <li className="flex items-center gap-1.5"><span className="size-1 rounded-full bg-muted-foreground/50" /> Reward performance, safety, and overtime</li>
                <li className="flex items-center gap-1.5"><span className="size-1 rounded-full bg-muted-foreground/50" /> Track approval and payment status</li>
                <li className="flex items-center gap-1.5"><span className="size-1 rounded-full bg-muted-foreground/50" /> Link incentives to specific time periods</li>
              </ul>
              <Button variant="outline" size="sm" className="mt-5" onClick={() => setFormOpen(true)}>
                <Plus className="size-4" />
                Create First Incentive
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
                          checked={bulkSelect.isAllSelected(paginatedIncentives)}
                          onCheckedChange={() => bulkSelect.toggleAll(paginatedIncentives)}
                          aria-label="Select all incentives"
                        />
                      </TableHead>
                      <TableHead>Driver</TableHead>
                      <TableHead>Type</TableHead>
                      <TableHead className="text-right">Amount</TableHead>
                      <TableHead>Description</TableHead>
                      <TableHead>Period</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead>Date</TableHead>
                      <TableHead className="text-right">Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {paginatedIncentives.map((inc, idx) => (
                      <TableRow key={inc.id} className={cn('border-l-[3px] transition-colors hover:bg-muted/50', idx % 2 === 1 ? 'bg-muted/30' : '', incStatusBorderColors[inc.status], bulkSelect.isSelected(inc.id) && 'bg-emerald-50/50 dark:bg-emerald-900/10')}>
                        <TableCell>
                          <Checkbox
                            checked={bulkSelect.isSelected(inc.id)}
                            onCheckedChange={() => bulkSelect.toggleOne(inc.id)}
                            aria-label={`Select incentive for ${inc.driver?.driverName}`}
                          />
                        </TableCell>
                        <TableCell>
                          <div className="flex items-center gap-2">
                            <DriverAvatar name={inc.driver?.driverName || ''} />
                            <span className="font-medium">{inc.driver?.driverName || '—'}</span>
                          </div>
                        </TableCell>
                        <TableCell>
                          <Badge variant="outline" className={typeColors[inc.incentiveType] || ''}>
                            {typeLabels[inc.incentiveType] || inc.incentiveType}
                          </Badge>
                        </TableCell>
                        <TableCell className="text-right font-medium">{formatCurrency(inc.amount)}</TableCell>
                        <TableCell className="max-w-40 truncate text-muted-foreground text-sm">
                          {inc.description || '—'}
                        </TableCell>
                        <TableCell className="text-sm">{inc.period || '—'}</TableCell>
                        <TableCell>
                          <div className="flex flex-col gap-2">
                            <StatusDropdown
                              currentStatus={inc.status}
                              onStatusChange={(newStatus) => {
                                actionMutation.mutate(
                                  { id: inc.id, action: newStatus },
                                  {
                                    onSuccess: () => {
                                      toast.success(`Incentive status updated to ${newStatus}`)
                                    },
                                  }
                                )
                              }}
                              statuses={[
                                { value: 'pending', label: 'Pending', color: statusColors.pending, dotColor: 'bg-yellow-500' },
                                { value: 'approved', label: 'Approved', color: statusColors.approved, dotColor: 'bg-blue-500' },
                                { value: 'paid', label: 'Paid', color: statusColors.paid, dotColor: 'bg-emerald-500' },
                              ]}
                              isLoading={actionMutation.isPending}
                              size="sm"
                            />
                            <StatusProgressStepper
                              steps={incStatusSteps.map((step) => ({
                                label: step.charAt(0).toUpperCase() + step.slice(1),
                                status: incStatusSteps.indexOf(step) < incStatusSteps.indexOf(inc.status)
                                  ? 'completed'
                                  : step === inc.status
                                    ? 'current'
                                    : 'upcoming',
                              }))}
                              className="max-w-[200px]"
                            />
                          </div>
                        </TableCell>
                        <TableCell className="text-muted-foreground text-sm">
                          {format(new Date(inc.createdAt), 'MMM d, yyyy')}
                        </TableCell>
                        <TableCell className="text-right">
                          <div className="flex justify-end gap-1">
                            {inc.status === 'pending' && (
                              <>
                                <Button variant="ghost" size="icon" onClick={() => handleEdit(inc)}>
                                  <Pencil className="size-4" />
                                </Button>
                                <Button variant="ghost" size="sm" onClick={() => handleAction(inc, 'approve')} className="text-blue-600 hover:text-blue-700 hover:bg-blue-50 dark:text-blue-400 dark:hover:text-blue-300 dark:hover:bg-blue-900/30">
                                  <CheckCircle className="size-3.5" />
                                  Approve
                                </Button>
                                <Button variant="ghost" size="icon" onClick={() => { setSelectedIncentive(inc); setDeleteOpen(true) }}>
                                  <Trash2 className="size-4 text-destructive" />
                                </Button>
                              </>
                            )}
                            {inc.status === 'approved' && (
                              <>
                                <Button variant="ghost" size="icon" onClick={() => handleEdit(inc)}>
                                  <Pencil className="size-4" />
                                </Button>
                                <Button variant="ghost" size="sm" onClick={() => handleAction(inc, 'paid')} className="text-emerald-600 hover:text-emerald-700 hover:bg-emerald-50 dark:text-emerald-400 dark:hover:text-emerald-300 dark:hover:bg-emerald-900/30">
                                  <Banknote className="size-3.5" />
                                  Mark as Paid
                                </Button>
                              </>
                            )}
                          </div>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                  <TableFooter>
                    <TableRow className="bg-muted/50 font-semibold border-t-2 border-muted-foreground/20 hover:bg-muted/50">
                      <TableCell className="text-sm">Totals ({filteredIncentives.length})</TableCell>
                      <TableCell />
                      <TableCell className="text-right text-sm font-bold">
                        {formatCurrency(filteredIncentives.reduce((sum, inc) => sum + inc.amount, 0))}
                      </TableCell>
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
                {paginatedIncentives.map((inc) => (
                  <div key={inc.id} className={cn('p-4 space-y-3 border-l-[3px] transition-colors active:bg-muted/50', incStatusBorderColors[inc.status], bulkSelect.isSelected(inc.id) && 'bg-emerald-50/50 dark:bg-emerald-900/10')}>
                    <div className="flex items-start justify-between">
                      <div className="flex items-center gap-3">
                        <Checkbox
                          checked={bulkSelect.isSelected(inc.id)}
                          onCheckedChange={() => bulkSelect.toggleOne(inc.id)}
                          aria-label={`Select incentive for ${inc.driver?.driverName}`}
                        />
                        <div className="flex-1 min-w-0 mr-2">
                          <p className="font-semibold truncate">{inc.driver?.driverName || '—'}</p>
                          <p className="text-sm text-muted-foreground truncate">{inc.description || 'No description'}</p>
                        </div>
                      </div>
                      <div className="flex gap-1.5 shrink-0">
                        <Badge variant="outline" className={cn('text-[10px] px-1.5', typeColors[inc.incentiveType] || '')}>
                          {typeLabels[inc.incentiveType] || inc.incentiveType}
                        </Badge>
                        <Badge variant="outline" className={cn('text-[10px] px-1.5', statusColors[inc.status] || '')}>
                          {inc.status}
                        </Badge>
                      </div>
                    </div>
                    <div className="flex items-center justify-between">
                      <p className="text-lg font-bold text-foreground">{formatCurrency(inc.amount)}</p>
                      <div className="flex gap-1">
                        {inc.status === 'pending' && (
                          <>
                            <Button variant="outline" size="sm" onClick={() => handleEdit(inc)}>
                              <Pencil className="size-3.5" />
                            </Button>
                            <Button variant="outline" size="sm" onClick={() => handleAction(inc, 'approve')}>
                              <CheckCircle className="size-3.5" />
                            </Button>
                            <Button variant="outline" size="sm" onClick={() => { setSelectedIncentive(inc); setDeleteOpen(true) }}>
                              <Trash2 className="size-3.5 text-destructive" />
                            </Button>
                          </>
                        )}
                        {inc.status === 'approved' && (
                          <>
                            <Button variant="outline" size="sm" onClick={() => handleEdit(inc)}>
                              <Pencil className="size-3.5" />
                            </Button>
                            <Button variant="outline" size="sm" onClick={() => handleAction(inc, 'paid')}>
                              <Banknote className="size-3.5" />
                            </Button>
                          </>
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
          totalItems={filteredIncentives.length}
          pageSize={pageSize}
        />
      </Card>

      {/* Add/Edit Dialog */}
      <Dialog open={formOpen} onOpenChange={(open) => { setFormOpen(open); if (!open) { setSelectedIncentive(null); form.reset() } }}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>{selectedIncentive ? 'Edit Incentive' : 'New Incentive'}</DialogTitle>
            <DialogDescription>
              {selectedIncentive ? 'Update incentive details' : 'Create a driver incentive or bonus'}
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
                  <FormControl><Input type="number" step="0.01" {...field} placeholder="200.00" /></FormControl>
                  <FormMessage />
                </FormItem>
              )} />
              <FormField control={form.control} name="incentiveType" render={({ field }) => (
                <FormItem>
                  <FormLabel>Type *</FormLabel>
                  <Select onValueChange={field.onChange} defaultValue={field.value}>
                    <FormControl><SelectTrigger><SelectValue /></SelectTrigger></FormControl>
                    <SelectContent>
                      <SelectItem value="performance">Performance</SelectItem>
                      <SelectItem value="safety">Safety</SelectItem>
                      <SelectItem value="bonus">Bonus</SelectItem>
                      <SelectItem value="overtime">Overtime</SelectItem>
                    </SelectContent>
                  </Select>
                  <FormMessage />
                </FormItem>
              )} />
              <FormField control={form.control} name="description" render={({ field }) => (
                <FormItem>
                  <FormLabel>Description</FormLabel>
                  <FormControl><Input {...field} placeholder="e.g. Extra deliveries this month" /></FormControl>
                  <FormMessage />
                </FormItem>
              )} />
              <FormField control={form.control} name="period" render={({ field }) => (
                <FormItem>
                  <FormLabel>Period</FormLabel>
                  <FormControl><Input {...field} placeholder="e.g. 2024-01, Week 5" /></FormControl>
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
                <Button type="button" variant="outline" onClick={() => { setFormOpen(false); form.reset(); setSelectedIncentive(null) }}>Cancel</Button>
                <Button type="submit" disabled={isSubmitting}>
                  {isSubmitting && <Loader2 className="size-4 animate-spin" />}
                  {selectedIncentive ? 'Update Incentive' : 'Create Incentive'}
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
            <AlertDialogTitle>{pendingAction ? actionLabels[pendingAction] : ''} Incentive</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to <strong>{pendingAction}</strong> the incentive of{' '}
              <strong>{formatCurrency(selectedIncentive?.amount || 0)}</strong> for{' '}
              <strong>{selectedIncentive?.driver?.driverName}</strong>?
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
            <AlertDialogTitle>Delete Incentive</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete the incentive for{' '}
              <strong>{selectedIncentive?.driver?.driverName}</strong>? This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => selectedIncentive && deleteMutation.mutate(selectedIncentive.id)}
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
            <AlertDialogTitle>Delete Selected Incentives</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete <strong>{bulkSelect.selectedCount}</strong> incentive(s)? This action cannot be undone.
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
              Delete {bulkSelect.selectedCount} Incentive(s)
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
