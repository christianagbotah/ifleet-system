'use client'

import { useState, useMemo } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { format, differenceInDays, subMonths, addDays } from 'date-fns'
import { motion, AnimatePresence } from 'framer-motion'
import {
  Wrench,
  Plus,
  Calendar,
  DollarSign,
  CheckCircle2,
  Clock,
  XCircle,
  Loader2,
  AlertTriangle,
  FileText,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { formatCurrency } from '@/lib/currency'
import { toast } from '@/lib/toast-config'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Label } from '@/components/ui/label'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Separator } from '@/components/ui/separator'
import { DatePicker } from '@/components/ui/date-picker'
import { Skeleton } from '@/components/ui/skeleton'

// --- Types ---
interface MaintenanceItem {
  id: string
  truckId: string
  maintenanceType: string
  description: string
  scheduledDate: string
  completedDate: string | null
  status: string
  cost: number | null
  mileageAtService: number | null
  performedBy: string | null
  notes: string | null
  createdAt: string
  updatedAt: string
}

interface MaintenanceSectionProps {
  truckId: string
}

// --- Constants ---
const maintenanceTypeLabels: Record<string, string> = {
  oil_change: 'Oil Change',
  tire_rotation: 'Tire Rotation',
  brake_service: 'Brake Service',
  engine_service: 'Engine Service',
  inspection: 'Inspection',
  other: 'Other',
}

const statusConfig: Record<string, { label: string; color: string; dot: string; icon: React.ReactNode }> = {
  scheduled: {
    label: 'Scheduled',
    color: 'bg-amber-100 text-amber-800 border-amber-200 dark:bg-amber-900/30 dark:text-amber-400 dark:border-amber-800/50',
    dot: 'bg-amber-500',
    icon: <Clock className="size-3" />,
  },
  in_progress: {
    label: 'In Progress',
    color: 'bg-blue-100 text-blue-800 border-blue-200 dark:bg-blue-900/30 dark:text-blue-400 dark:border-blue-800/50',
    dot: 'bg-blue-500',
    icon: <Loader2 className="size-3 animate-spin" />,
  },
  completed: {
    label: 'Completed',
    color: 'bg-emerald-100 text-emerald-800 border-emerald-200 dark:bg-emerald-900/30 dark:text-emerald-400 dark:border-emerald-800/50',
    dot: 'bg-emerald-500',
    icon: <CheckCircle2 className="size-3" />,
  },
  cancelled: {
    label: 'Cancelled',
    color: 'bg-gray-100 text-gray-600 border-gray-200 dark:bg-gray-800/30 dark:text-gray-400 dark:border-gray-700/50',
    dot: 'bg-gray-400',
    icon: <XCircle className="size-3" />,
  },
}

const fadeUp = {
  hidden: { opacity: 0, y: 10 },
  visible: (i: number) => ({
    opacity: 1,
    y: 0,
    transition: { delay: i * 0.05, duration: 0.2, ease: 'easeOut' },
  }),
}

// --- Component ---
export function MaintenanceSection({ truckId }: MaintenanceSectionProps) {
  const queryClient = useQueryClient()
  const [dialogOpen, setDialogOpen] = useState(false)

  const { data: maintenances = [], isLoading } = useQuery<MaintenanceItem[]>({
    queryKey: ['truck-maintenances', truckId],
    queryFn: async () => {
      const res = await fetch(`/api/trucks/${truckId}/maintenances`)
      if (!res.ok) throw new Error('Failed to fetch maintenances')
      return res.json()
    },
    enabled: !!truckId,
  })

  const createMutation = useMutation({
    mutationFn: async (body: Record<string, unknown>) => {
      const res = await fetch(`/api/trucks/${truckId}/maintenances`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })
      if (!res.ok) throw new Error('Failed to create maintenance')
      return res.json()
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['truck-maintenances', truckId] })
      setDialogOpen(false)
      toast.success('Maintenance scheduled successfully')
    },
    onError: () => {
      toast.error('Failed to schedule maintenance')
    },
  })

  const updateMutation = useMutation({
    mutationFn: async ({ id, ...body }: { id: string; [key: string]: unknown }) => {
      const res = await fetch(`/api/maintenances/${id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })
      if (!res.ok) throw new Error('Failed to update maintenance')
      return res.json()
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['truck-maintenances', truckId] })
    },
  })

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      const res = await fetch(`/api/maintenances/${id}`, { method: 'DELETE' })
      if (!res.ok) throw new Error('Failed to delete maintenance')
      return res.json()
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['truck-maintenances', truckId] })
      toast.success('Maintenance record deleted')
    },
    onError: () => {
      toast.error('Failed to delete maintenance')
    },
  })

  // Computed stats
  const now = new Date()
  const upcoming7 = useMemo(
    () => maintenances.filter(
      (m) => m.status === 'scheduled' && differenceInDays(new Date(m.scheduledDate), now) <= 7 && differenceInDays(new Date(m.scheduledDate), now) >= 0
    ),
    [maintenances, now]
  )

  const upcoming30 = useMemo(
    () => maintenances.filter(
      (m) => m.status === 'scheduled' && differenceInDays(new Date(m.scheduledDate), now) <= 30 && differenceInDays(new Date(m.scheduledDate), now) >= 0
    ),
    [maintenances, now]
  )

  const completedThisMonth = useMemo(
    () => maintenances.filter(
      (m) => m.status === 'completed' && m.completedDate && m.completedDate >= subMonths(now, 0) && new Date(m.completedDate).getMonth() === now.getMonth() && new Date(m.completedDate).getFullYear() === now.getFullYear()
    ),
    [maintenances, now]
  )

  const totalScheduled = maintenances.filter(
    (m) => m.status === 'scheduled' || m.status === 'in_progress'
  ).length

  const handleComplete = (m: MaintenanceItem) => {
    updateMutation.mutate(
      { id: m.id, status: 'completed', completedDate: new Date().toISOString() },
      {
        onSuccess: () => toast.success('Maintenance marked as completed'),
        onError: () => toast.error('Failed to update maintenance'),
      }
    )
  }

  const handleCancel = (m: MaintenanceItem) => {
    updateMutation.mutate(
      { id: m.id, status: 'cancelled' },
      {
        onSuccess: () => toast.success('Maintenance cancelled'),
        onError: () => toast.error('Failed to cancel maintenance'),
      }
    )
  }

  const handleDelete = (m: MaintenanceItem) => {
    deleteMutation.mutate(m.id)
  }

  return (
    <motion.div
      variants={fadeUp}
      initial="hidden"
      animate="visible"
      custom={4}
      className="space-y-4"
    >
      {/* Header */}
      <div className="flex items-center justify-between">
        <h4 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
          Maintenance
        </h4>
        <Button
          size="sm"
          variant="outline"
          className="h-7 text-xs gap-1.5"
          onClick={() => setDialogOpen(true)}
        >
          <Wrench className="size-3" />
          Schedule
        </Button>
      </div>

      {/* Upcoming Warning Banner */}
      <AnimatePresence>
        {upcoming7.length > 0 && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            exit={{ opacity: 0, height: 0 }}
            className="flex items-start gap-2.5 rounded-lg border border-amber-200 bg-amber-50 p-3 dark:border-amber-800/50 dark:bg-amber-900/20"
          >
            <AlertTriangle className="size-4 text-amber-600 dark:text-amber-400 shrink-0 mt-0.5" />
            <div className="min-w-0">
              <p className="text-xs font-semibold text-amber-800 dark:text-amber-300">
                Upcoming Maintenance Due
              </p>
              <p className="text-xs text-amber-700 dark:text-amber-400 mt-0.5">
                {upcoming7.length} maintenance{upcoming7.length === 1 ? '' : 's'} scheduled within 7 days.
                {upcoming7.length === 1
                  ? ` ${maintenanceTypeLabels[upcoming7[0].maintenanceType] || upcoming7[0].maintenanceType} due ${format(new Date(upcoming7[0].scheduledDate), 'MMM d')}.`
                  : ''}
              </p>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Stats Cards */}
      <div className="grid grid-cols-3 gap-2">
        <div className="rounded-lg border p-2.5 text-center space-y-1">
          <p className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider">Scheduled</p>
          <p className="text-base font-bold text-blue-600 dark:text-blue-400">{totalScheduled}</p>
        </div>
        <div className="rounded-lg border p-2.5 text-center space-y-1">
          <p className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider">Done This Month</p>
          <p className="text-base font-bold text-emerald-600 dark:text-emerald-400">{completedThisMonth.length}</p>
        </div>
        <div className="rounded-lg border p-2.5 text-center space-y-1">
          <p className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider">Upcoming 30d</p>
          <p className="text-base font-bold text-amber-600 dark:text-amber-400">{upcoming30.length}</p>
        </div>
      </div>

      {/* Timeline */}
      {isLoading ? (
        <div className="space-y-3">
          {Array.from({ length: 3 }).map((_, i) => (
            <div key={i} className="flex gap-3">
              <Skeleton className="size-3 rounded-full mt-1.5" />
              <div className="flex-1 space-y-1.5">
                <Skeleton className="h-3.5 w-32" />
                <Skeleton className="h-3 w-48" />
              </div>
            </div>
          ))}
        </div>
      ) : maintenances.length === 0 ? (
        <div className="text-center py-6 text-muted-foreground text-sm">
          <Wrench className="size-6 mx-auto mb-2 opacity-30" />
          No maintenance records
        </div>
      ) : (
        <div className="relative pl-6 space-y-0">
          {/* Vertical line */}
          <div className="absolute left-[5px] top-2 bottom-2 w-px bg-border" />

          {maintenances.map((m, i) => {
            const config = statusConfig[m.status] || statusConfig.scheduled
            return (
              <motion.div
                key={m.id}
                custom={i}
                variants={fadeUp}
                initial="hidden"
                animate="visible"
                className="relative py-3 group"
              >
                {/* Dot */}
                <div className={cn(
                  'absolute -left-6 top-3.5 size-3 rounded-full border-2 border-background z-10',
                  config.dot,
                  m.status === 'in_progress' && 'animate-pulse',
                )} />

                {/* Entry card */}
                <div className="rounded-lg border p-3 transition-colors hover:bg-muted/30">
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0 flex-1 space-y-1.5">
                      {/* Type badge + Status */}
                      <div className="flex items-center gap-2 flex-wrap">
                        <Badge variant="outline" className="text-[10px] px-1.5 font-medium bg-muted/50">
                          {maintenanceTypeLabels[m.maintenanceType] || m.maintenanceType}
                        </Badge>
                        <Badge variant="outline" className={cn('text-[10px] px-1.5', config.color)}>
                          {config.icon}
                          <span className="ml-1">{config.label}</span>
                        </Badge>
                      </div>

                      {/* Description */}
                      <p className="text-sm font-medium truncate">{m.description}</p>

                      {/* Date + Cost */}
                      <div className="flex items-center gap-3 text-xs text-muted-foreground flex-wrap">
                        <span className="flex items-center gap-1">
                          <Calendar className="size-3" />
                          {format(new Date(m.scheduledDate), 'MMM d, yyyy')}
                        </span>
                        {m.cost != null && m.cost > 0 && (
                          <span className="flex items-center gap-1 text-foreground font-medium">
                            <DollarSign className="size-3" />
                            {formatCurrency(m.cost)}
                          </span>
                        )}
                        {m.performedBy && (
                          <span className="flex items-center gap-1">
                            <FileText className="size-3" />
                            {m.performedBy}
                          </span>
                        )}
                      </div>

                      {/* Completed date */}
                      {m.completedDate && m.status === 'completed' && (
                        <p className="text-[10px] text-muted-foreground">
                          Completed {format(new Date(m.completedDate), 'MMM d, yyyy')}
                          {m.mileageAtService != null && ` at ${m.mileageAtService.toLocaleString()} km`}
                        </p>
                      )}
                    </div>

                    {/* Actions */}
                    {(m.status === 'scheduled' || m.status === 'in_progress') && (
                      <div className="flex gap-1 shrink-0">
                        <Button
                          size="sm"
                          variant="ghost"
                          className="h-7 text-xs text-emerald-600 hover:text-emerald-700 hover:bg-emerald-50 dark:text-emerald-400 dark:hover:bg-emerald-900/20"
                          onClick={() => handleComplete(m)}
                          disabled={updateMutation.isPending}
                        >
                          <CheckCircle2 className="size-3" />
                        </Button>
                        <Button
                          size="sm"
                          variant="ghost"
                          className="h-7 text-xs text-gray-500 hover:text-gray-700 hover:bg-gray-100 dark:text-gray-400 dark:hover:bg-gray-800/30"
                          onClick={() => handleCancel(m)}
                          disabled={updateMutation.isPending}
                        >
                          <XCircle className="size-3" />
                        </Button>
                        <Button
                          size="sm"
                          variant="ghost"
                          className="h-7 text-xs text-red-500 hover:text-red-700 hover:bg-red-50 dark:text-red-400 dark:hover:bg-red-900/20"
                          onClick={() => handleDelete(m)}
                          disabled={deleteMutation.isPending}
                        >
                          <XCircle className="size-3" />
                        </Button>
                      </div>
                    )}
                    {m.status === 'completed' && (
                      <div className="flex gap-1 shrink-0">
                        <Button
                          size="sm"
                          variant="ghost"
                          className="h-7 text-xs text-red-500 hover:text-red-700 hover:bg-red-50 dark:text-red-400 dark:hover:bg-red-900/20"
                          onClick={() => handleDelete(m)}
                          disabled={deleteMutation.isPending}
                        >
                          <XCircle className="size-3" />
                        </Button>
                      </div>
                    )}
                  </div>
                </div>
              </motion.div>
            )
          })}
        </div>
      )}

      {/* Schedule Dialog */}
      <ScheduleDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        onSubmit={(data) => createMutation.mutate(data)}
        isPending={createMutation.isPending}
      />
    </motion.div>
  )
}

// --- Schedule Dialog ---
function ScheduleDialog({
  open,
  onOpenChange,
  onSubmit,
  isPending,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  onSubmit: (data: Record<string, unknown>) => void
  isPending: boolean
}) {
  const [maintenanceType, setMaintenanceType] = useState('')
  const [description, setDescription] = useState('')
  const [scheduledDate, setScheduledDate] = useState(format(addDays(new Date(), 7), 'yyyy-MM-dd'))
  const [cost, setCost] = useState('')
  const [mileageAtService, setMileageAtService] = useState('')
  const [performedBy, setPerformedBy] = useState('')
  const [notes, setNotes] = useState('')

  const resetForm = () => {
    setMaintenanceType('')
    setDescription('')
    setScheduledDate(format(addDays(new Date(), 7), 'yyyy-MM-dd'))
    setCost('')
    setMileageAtService('')
    setPerformedBy('')
    setNotes('')
  }

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    if (!maintenanceType || !description || !scheduledDate) return
    onSubmit({
      maintenanceType,
      description,
      scheduledDate,
      cost: cost ? Number(cost) : null,
      mileageAtService: mileageAtService ? Number(mileageAtService) : null,
      performedBy: performedBy || null,
      notes: notes || null,
    })
    resetForm()
  }

  return (
    <Dialog open={open} onOpenChange={(v) => { onOpenChange(v); if (!v) resetForm() }}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Wrench className="size-4" />
            Schedule Maintenance
          </DialogTitle>
          <DialogDescription>
            Add a new maintenance record for this truck.
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4">
          {/* Maintenance Type */}
          <div className="space-y-2">
            <Label className="text-sm">Maintenance Type</Label>
            <Select value={maintenanceType} onValueChange={setMaintenanceType}>
              <SelectTrigger>
                <SelectValue placeholder="Select type..." />
              </SelectTrigger>
              <SelectContent>
                {Object.entries(maintenanceTypeLabels).map(([value, label]) => (
                  <SelectItem key={value} value={value}>
                    {label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Description */}
          <div className="space-y-2">
            <Label className="text-sm">Description</Label>
            <Textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Describe the maintenance needed..."
              rows={2}
            />
          </div>

          {/* Scheduled Date */}
          <div className="space-y-2">
            <Label className="text-sm">Scheduled Date</Label>
            <DatePicker value={scheduledDate} onChange={(val) => setScheduledDate(val)} />
          </div>

          {/* Cost + Mileage row */}
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-2">
              <Label className="text-sm">Estimated Cost</Label>
              <Input
                type="number"
                step="0.01"
                min="0"
                value={cost}
                onChange={(e) => setCost(e.target.value)}
                placeholder="0.00"
              />
            </div>
            <div className="space-y-2">
              <Label className="text-sm">Current Mileage</Label>
              <Input
                type="number"
                step="1"
                min="0"
                value={mileageAtService}
                onChange={(e) => setMileageAtService(e.target.value)}
                placeholder="0"
              />
            </div>
          </div>

          {/* Performed By */}
          <div className="space-y-2">
            <Label className="text-sm">Performed By</Label>
            <Input
              value={performedBy}
              onChange={(e) => setPerformedBy(e.target.value)}
              placeholder="Mechanic or service center"
            />
          </div>

          {/* Notes */}
          <div className="space-y-2">
            <Label className="text-sm">Notes</Label>
            <Textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Additional notes..."
              rows={2}
            />
          </div>

          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={!maintenanceType || !description || !scheduledDate || isPending}>
              {isPending ? (
                <>
                  <Loader2 className="size-3.5 animate-spin" />
                  Scheduling...
                </>
              ) : (
                <>
                  <Plus className="size-3.5" />
                  Schedule
                </>
              )}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
