'use client'

import * as React from 'react'
import { motion } from 'framer-motion'
import {
  ShieldCheck,
  Search,
  AlertCircle,
  RefreshCw,
  Clock,
  Plus,
  Pencil,
  Trash2,
  FileCheck,
  AlertTriangle,
  XCircle,
  CheckCircle2,
  Eye,
  ChevronDown,
  ChevronUp,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
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
  Dialog,
  DialogBody,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Badge } from '@/components/ui/badge'
import { Separator } from '@/components/ui/separator'
import { EmptyState } from '@/components/ui/empty-state'
import { Skeleton } from '@/components/ui/skeleton'
import { useApi, apiFetch } from '@/lib/api'
import { cn } from '@/lib/utils'
import { toast } from 'sonner'
import { RoadworthyFormDialog, type RoadworthyInspection } from './RoadworthyFormDialog'

// ─── Animation Variants ───────────────────────────────────────────────────
const containerVariants = {
  show: { transition: { staggerChildren: 0.04 } },
}

const itemVariants = {
  show: { opacity: 1, y: 0 },
}

// ─── Status Colors ────────────────────────────────────────────────────────
const RESULT_COLORS: Record<string, string> = {
  passed: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400',
  failed: 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400',
  conditional_pass: 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400',
  pending: 'bg-sky-100 text-sky-700 dark:bg-sky-900/30 dark:text-sky-400',
}

const FITNESS_COLORS: Record<string, string> = {
  fit: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400',
  conditional: 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400',
  unfit: 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400',
}

const STATUS_COLORS: Record<string, string> = {
  scheduled: 'bg-sky-100 text-sky-700 dark:bg-sky-900/30 dark:text-sky-400',
  in_progress: 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400',
  completed: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400',
  voided: 'bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-400',
}

const CHECK_COLORS: Record<string, string> = {
  pass: 'text-emerald-600 bg-emerald-50 dark:bg-emerald-900/20',
  fail: 'text-red-600 bg-red-50 dark:bg-red-900/20',
  advisory: 'text-amber-600 bg-amber-50 dark:bg-amber-900/20',
}

// ─── Labels ───────────────────────────────────────────────────────────────
const INSPECTION_TYPE_LABELS: Record<string, string> = {
  annual: 'Annual',
  quarterly: 'Quarterly',
  special: 'Special',
  pre_trip: 'Pre-Trip',
  transfer: 'Transfer',
}

const RESULT_LABELS: Record<string, string> = {
  passed: 'Passed',
  failed: 'Failed',
  conditional_pass: 'Conditional Pass',
  pending: 'Pending',
}

// ─── Days Until Expiry ────────────────────────────────────────────────────
function DaysUntilExpiry({ endDate }: { endDate: string }) {
  const now = new Date()
  const end = new Date(endDate)
  const diffMs = end.getTime() - now.getTime()
  const diffDays = Math.ceil(diffMs / (1000 * 60 * 60 * 24))

  if (diffDays < 0) {
    return (
      <div className="flex items-center gap-1 text-xs">
        <XCircle className="h-3 w-3 text-red-500" />
        <span className="text-red-600 font-semibold">Expired</span>
      </div>
    )
  }

  if (diffDays === 0) {
    return (
      <div className="flex items-center gap-1 text-xs">
        <AlertTriangle className="h-3 w-3 text-red-500" />
        <span className="text-red-600 font-semibold">Today</span>
      </div>
    )
  }

  if (diffDays <= 30) {
    return (
      <div className="flex items-center gap-1 text-xs">
        <AlertTriangle className="h-3 w-3 text-amber-500" />
        <span className="text-amber-600 font-semibold">{diffDays} days</span>
      </div>
    )
  }

  return (
    <div className="flex items-center gap-1 text-xs">
      <Clock className="h-3 w-3 text-muted-foreground" />
      <span className="text-muted-foreground">{diffDays} days</span>
    </div>
  )
}

// ─── Safety Checks Summary ────────────────────────────────────────────────
function SafetyChecksSummary({ inspection }: { inspection: RoadworthyInspection }) {
  const checks = [
    { label: 'Brakes', value: inspection.brakesCheck },
    { label: 'Lights', value: inspection.lightsCheck },
    { label: 'Tyres', value: inspection.tyresCheck },
    { label: 'Emissions', value: inspection.emissionsCheck },
    { label: 'Steering', value: inspection.steeringCheck },
    { label: 'Suspension', value: inspection.suspensionCheck },
    { label: 'Body', value: inspection.bodyCheck },
    { label: 'Electrical', value: inspection.electricalCheck },
  ]

  const passCount = checks.filter(c => c.value === 'pass').length
  const failCount = checks.filter(c => c.value === 'fail').length
  const advisoryCount = checks.filter(c => c.value === 'advisory').length

  return (
    <div className="grid grid-cols-3 gap-2">
      <div className="flex items-center gap-1.5">
        <CheckCircle2 className="h-3.5 w-3.5 text-emerald-500" />
        <span className="text-xs font-medium text-emerald-600">{passCount} Pass</span>
      </div>
      {failCount > 0 && (
        <div className="flex items-center gap-1.5">
          <XCircle className="h-3.5 w-3.5 text-red-500" />
          <span className="text-xs font-medium text-red-600">{failCount} Fail</span>
        </div>
      )}
      {advisoryCount > 0 && (
        <div className="flex items-center gap-1.5">
          <AlertTriangle className="h-3.5 w-3.5 text-amber-500" />
          <span className="text-xs font-medium text-amber-600">{advisoryCount} Advisory</span>
        </div>
      )}
    </div>
  )
}

// ─── Inspection Detail Dialog ─────────────────────────────────────────────
function InspectionDetailDialog({
  inspection,
  open,
  onOpenChange,
}: {
  inspection: RoadworthyInspection | null
  open: boolean
  onOpenChange: (open: boolean) => void
}) {
  if (!inspection) return null

  const checks = [
    { label: 'Brakes', value: inspection.brakesCheck },
    { label: 'Lights', value: inspection.lightsCheck },
    { label: 'Tyres', value: inspection.tyresCheck },
    { label: 'Emissions', value: inspection.emissionsCheck },
    { label: 'Steering', value: inspection.steeringCheck },
    { label: 'Suspension', value: inspection.suspensionCheck },
    { label: 'Body', value: inspection.bodyCheck },
    { label: 'Electrical', value: inspection.electricalCheck },
  ]

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <ShieldCheck className="h-5 w-5 text-primary" />
            Inspection Details — {inspection.certificateNumber}
          </DialogTitle>
        </DialogHeader>
        <DialogBody className="space-y-4">
          {/* Top info grid */}
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
            <div>
              <p className="text-xs text-muted-foreground">Truck</p>
              <p className="text-sm font-medium">{inspection.truck?.plateNumber}</p>
            </div>
            <div>
              <p className="text-xs text-muted-foreground">Inspection Type</p>
              <p className="text-sm font-medium">{INSPECTION_TYPE_LABELS[inspection.inspectionType] || inspection.inspectionType}</p>
            </div>
            <div>
              <p className="text-xs text-muted-foreground">Inspection Date</p>
              <p className="text-sm font-medium">{new Date(inspection.inspectionDate).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })}</p>
            </div>
            <div>
              <p className="text-xs text-muted-foreground">Result</p>
              <Badge variant="outline" className={cn('border-transparent font-medium', RESULT_COLORS[inspection.result] || '')}>
                {RESULT_LABELS[inspection.result] || inspection.result}
              </Badge>
            </div>
            <div>
              <p className="text-xs text-muted-foreground">Vehicle Fitness</p>
              <Badge variant="outline" className={cn('border-transparent font-medium capitalize', FITNESS_COLORS[inspection.vehicleFitness || ''] || '')}>
                {inspection.vehicleFitness || '—'}
              </Badge>
            </div>
            <div>
              <p className="text-xs text-muted-foreground">Status</p>
              <Badge variant="outline" className={cn('border-transparent font-medium capitalize', STATUS_COLORS[inspection.status] || '')}>
                {inspection.status}
              </Badge>
            </div>
          </div>

          {inspection.inspectorName && (
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
              <div>
                <p className="text-xs text-muted-foreground">Inspector</p>
                <p className="text-sm font-medium">{inspection.inspectorName}</p>
              </div>
              {inspection.inspectorId && (
                <div>
                  <p className="text-xs text-muted-foreground">Inspector ID</p>
                  <p className="text-sm font-medium">{inspection.inspectorId}</p>
                </div>
              )}
              {inspection.inspectionStation && (
                <div>
                  <p className="text-xs text-muted-foreground">Station</p>
                  <p className="text-sm font-medium">{inspection.inspectionStation}</p>
                </div>
              )}
            </div>
          )}

          <Separator />

          {/* Safety Checks Grid */}
          <div>
            <h4 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider mb-3">Safety Checks</h4>
            <div className="grid grid-cols-4 gap-3">
              {checks.map((check) => (
                <div
                  key={check.label}
                  className={cn(
                    'flex flex-col items-center justify-center rounded-lg border p-3 text-center',
                    CHECK_COLORS[check.value || ''] || 'bg-gray-50 dark:bg-gray-900'
                  )}
                >
                  <span className="text-xs text-muted-foreground mb-1">{check.label}</span>
                  <span className="text-sm font-semibold capitalize">{check.value || '—'}</span>
                </div>
              ))}
            </div>
          </div>

          <Separator />

          {/* Certificate & Scheduling */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
            <div>
              <p className="text-xs text-muted-foreground">Certificate Issued</p>
              <p className="text-sm font-medium">{inspection.certificateIssued ? 'Yes' : 'No'}</p>
            </div>
            {inspection.certificateExpiry && (
              <div>
                <p className="text-xs text-muted-foreground">Certificate Expiry</p>
                <p className="text-sm font-medium">{new Date(inspection.certificateExpiry).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })}</p>
              </div>
            )}
            {inspection.nextInspectionDue && (
              <div>
                <p className="text-xs text-muted-foreground">Next Inspection</p>
                <p className="text-sm font-medium">{new Date(inspection.nextInspectionDue).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })}</p>
              </div>
            )}
            {inspection.inspectionFee != null && (
              <div>
                <p className="text-xs text-muted-foreground">Inspection Fee</p>
                <p className="text-sm font-medium">₵{inspection.inspectionFee.toLocaleString()}</p>
              </div>
            )}
          </div>

          {(inspection.defectsFound || inspection.advisories || inspection.recommendations) && (
            <>
              <Separator />
              <div className="space-y-3">
                <h4 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider">Defects & Recommendations</h4>
                {inspection.defectsFound && (
                  <div>
                    <p className="text-xs text-muted-foreground mb-1">Defects Found</p>
                    <p className="text-sm bg-red-50 dark:bg-red-900/10 border border-red-200 dark:border-red-800 rounded-md p-3 text-red-700 dark:text-red-400">{inspection.defectsFound}</p>
                  </div>
                )}
                {inspection.advisories && (
                  <div>
                    <p className="text-xs text-muted-foreground mb-1">Advisories</p>
                    <p className="text-sm bg-amber-50 dark:bg-amber-900/10 border border-amber-200 dark:border-amber-800 rounded-md p-3 text-amber-700 dark:text-amber-400">{inspection.advisories}</p>
                  </div>
                )}
                {inspection.recommendations && (
                  <div>
                    <p className="text-xs text-muted-foreground mb-1">Recommendations</p>
                    <p className="text-sm bg-sky-50 dark:bg-sky-900/10 border border-sky-200 dark:border-sky-800 rounded-md p-3 text-sky-700 dark:text-sky-400">{inspection.recommendations}</p>
                  </div>
                )}
              </div>
            </>
          )}
        </DialogBody>
      </DialogContent>
    </Dialog>
  )
}

// ─── Main Component ───────────────────────────────────────────────────────
export function RoadworthyView() {
  const [resultFilter, setResultFilter] = React.useState('all')
  const [typeFilter, setTypeFilter] = React.useState('all')
  const [statusFilter, setStatusFilter] = React.useState('all')
  const [dialogOpen, setDialogOpen] = React.useState(false)
  const [detailDialogOpen, setDetailDialogOpen] = React.useState(false)
  const [editingInspection, setEditingInspection] = React.useState<RoadworthyInspection | null>(null)
  const [viewingInspection, setViewingInspection] = React.useState<RoadworthyInspection | null>(null)
  const [deletingId, setDeletingId] = React.useState<string | null>(null)
  const [expandedId, setExpandedId] = React.useState<string | null>(null)

  const { data, loading, error, refetch } = useApi<{ data: RoadworthyInspection[]; total: number }>(
    () => apiFetch('/api/roadworthy-inspections?limit=100'),
    []
  )

  const inspections = data?.data || []

  // ─── Computed stats ───────────────────────────────────────────────────
  const stats = React.useMemo(() => {
    const total = inspections.length
    const passed = inspections.filter(i => i.result === 'passed').length
    const failed = inspections.filter(i => i.result === 'failed').length
    const expiringSoon = inspections.filter(i => {
      if (!i.certificateExpiry) return false
      const now = new Date()
      const thirtyDaysFromNow = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000)
      const expiry = new Date(i.certificateExpiry)
      return expiry > now && expiry <= thirtyDaysFromNow
    }).length

    return { total, passed, failed, expiringSoon }
  }, [inspections])

  // ─── Filtered data ────────────────────────────────────────────────────
  const filteredData = React.useMemo(() => {
    return inspections.filter((i) => {
      const matchesResult = resultFilter === 'all' || i.result === resultFilter
      const matchesType = typeFilter === 'all' || i.inspectionType === typeFilter
      const matchesStatus = statusFilter === 'all' || i.status === statusFilter
      return matchesResult && matchesType && matchesStatus
    })
  }, [inspections, resultFilter, typeFilter, statusFilter])

  // ─── Handlers ─────────────────────────────────────────────────────────
  function handleAdd() {
    setEditingInspection(null)
    setDialogOpen(true)
  }

  function handleEdit(inspection: RoadworthyInspection) {
    setEditingInspection(inspection)
    setDialogOpen(true)
  }

  function handleView(inspection: RoadworthyInspection) {
    setViewingInspection(inspection)
    setDetailDialogOpen(true)
  }

  async function handleDelete(inspection: RoadworthyInspection) {
    setDeletingId(inspection.id)
    try {
      await apiFetch(`/api/roadworthy-inspections/${inspection.id}`, { method: 'DELETE' })
      toast.success('Roadworthy inspection deleted successfully')
      refetch()
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to delete inspection')
    } finally {
      setDeletingId(null)
    }
  }

  function handleDialogSuccess() {
    refetch()
  }

  return (
    <motion.div
      variants={containerVariants}
      animate="show"
      className="space-y-4 sm:space-y-6"
    >
      {/* Header */}
      <motion.div variants={itemVariants}>
        <h1 className="text-2xl font-bold tracking-tight">Roadworthy Inspections</h1>
        <p className="text-muted-foreground">
          Manage vehicle roadworthiness inspections, certificates, and compliance checks
        </p>
      </motion.div>

      {/* Summary Stat Cards */}
      <motion.div variants={itemVariants} className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
        <div className="rounded-lg border bg-card p-4">
          <div className="flex items-center gap-3">
            <div className="rounded-md bg-primary/10 p-2">
              <ShieldCheck className="h-4 w-4 text-primary" />
            </div>
            <div>
              <p className="text-2xl font-bold">{loading ? '—' : stats.total}</p>
              <p className="text-xs text-muted-foreground">Total Inspections</p>
            </div>
          </div>
        </div>
        <div className="rounded-lg border bg-card p-4">
          <div className="flex items-center gap-3">
            <div className="rounded-md bg-emerald-500/10 p-2">
              <CheckCircle2 className="h-4 w-4 text-emerald-600" />
            </div>
            <div>
              <p className="text-2xl font-bold text-emerald-600">{loading ? '—' : stats.passed}</p>
              <p className="text-xs text-muted-foreground">Passed</p>
            </div>
          </div>
        </div>
        <div className="rounded-lg border bg-card p-4">
          <div className="flex items-center gap-3">
            <div className="rounded-md bg-red-500/10 p-2">
              <XCircle className="h-4 w-4 text-red-600" />
            </div>
            <div>
              <p className="text-2xl font-bold text-red-600">{loading ? '—' : stats.failed}</p>
              <p className="text-xs text-muted-foreground">Failed</p>
            </div>
          </div>
        </div>
        <div className="rounded-lg border bg-card p-4">
          <div className="flex items-center gap-3">
            <div className="rounded-md bg-amber-500/10 p-2">
              <AlertTriangle className="h-4 w-4 text-amber-600" />
            </div>
            <div>
              <p className="text-2xl font-bold text-amber-600">{loading ? '—' : stats.expiringSoon}</p>
              <p className="text-xs text-muted-foreground">Cert. Expiring Soon</p>
            </div>
          </div>
        </div>
      </motion.div>

      {/* Filters + Add Button */}
      <motion.div variants={itemVariants} className="flex flex-col sm:flex-row gap-3 items-start sm:items-center justify-between">
        <div className="flex flex-col sm:flex-row gap-3 w-full sm:w-auto">
          <Select value={resultFilter} onValueChange={setResultFilter}>
            <SelectTrigger className="w-full sm:w-40">
              <SelectValue placeholder="Result" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Results</SelectItem>
              <SelectItem value="passed">Passed</SelectItem>
              <SelectItem value="failed">Failed</SelectItem>
              <SelectItem value="conditional_pass">Conditional</SelectItem>
              <SelectItem value="pending">Pending</SelectItem>
            </SelectContent>
          </Select>
          <Select value={typeFilter} onValueChange={setTypeFilter}>
            <SelectTrigger className="w-full sm:w-40">
              <SelectValue placeholder="Type" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Types</SelectItem>
              <SelectItem value="annual">Annual</SelectItem>
              <SelectItem value="quarterly">Quarterly</SelectItem>
              <SelectItem value="special">Special</SelectItem>
              <SelectItem value="pre_trip">Pre-Trip</SelectItem>
              <SelectItem value="transfer">Transfer</SelectItem>
            </SelectContent>
          </Select>
          <Select value={statusFilter} onValueChange={setStatusFilter}>
            <SelectTrigger className="w-full sm:w-40">
              <SelectValue placeholder="Status" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Status</SelectItem>
              <SelectItem value="completed">Completed</SelectItem>
              <SelectItem value="scheduled">Scheduled</SelectItem>
              <SelectItem value="in_progress">In Progress</SelectItem>
              <SelectItem value="voided">Voided</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <Button onClick={handleAdd} className="shrink-0">
          <Plus className="mr-2 h-4 w-4" />
          Add Inspection
        </Button>
      </motion.div>

      {/* Table */}
      <motion.div variants={itemVariants}>
        <div className="rounded-lg border bg-card">
          {error ? (
            <div className="flex flex-col items-center justify-center py-12 text-center">
              <AlertCircle className="h-8 w-8 text-red-500 mb-3" />
              <p className="text-sm text-muted-foreground mb-3">{error}</p>
              <Button variant="outline" size="sm" onClick={refetch}>
                <RefreshCw className="mr-2 h-3 w-3" /> Retry
              </Button>
            </div>
          ) : loading ? (
            <div className="p-4 space-y-3">
              {[1, 2, 3, 4, 5].map(i => (
                <Skeleton key={i} className="h-12 w-full rounded" />
              ))}
            </div>
          ) : filteredData.length === 0 ? (
            <EmptyState
              icon={ShieldCheck}
              title="No roadworthy inspections found"
              description={
                resultFilter !== 'all' || typeFilter !== 'all' || statusFilter !== 'all'
                  ? 'Try adjusting your filter criteria'
                  : 'Add your first roadworthy inspection to start tracking compliance.'
              }
            />
          ) : (
            <>
              <div className="overflow-x-auto hidden md:block">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Certificate #</TableHead>
                    <TableHead>Truck</TableHead>
                    <TableHead className="hidden md:table-cell">Type</TableHead>
                    <TableHead className="hidden lg:table-cell">Date</TableHead>
                    <TableHead>Result</TableHead>
                    <TableHead className="hidden md:table-cell">Fitness</TableHead>
                    <TableHead className="hidden lg:table-cell">Cert. Expiry</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead className="w-[100px]">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredData.map((insp) => (
                    <React.Fragment key={insp.id}>
                      <TableRow>
                        <TableCell className="font-mono text-xs font-medium">
                          {insp.certificateNumber}
                        </TableCell>
                        <TableCell className="text-sm font-medium">
                          {insp.truck?.plateNumber || '—'}
                        </TableCell>
                        <TableCell className="hidden md:table-cell text-sm">
                          <Badge variant="outline" className="border-transparent font-normal">
                            {INSPECTION_TYPE_LABELS[insp.inspectionType] || insp.inspectionType}
                          </Badge>
                        </TableCell>
                        <TableCell className="hidden lg:table-cell text-xs text-muted-foreground">
                          {new Date(insp.inspectionDate).toLocaleDateString('en-GB', {
                            day: '2-digit', month: 'short', year: 'numeric',
                          })}
                        </TableCell>
                        <TableCell>
                          <Badge
                            variant="outline"
                            className={cn('border-transparent font-medium', RESULT_COLORS[insp.result] || '')}
                          >
                            {RESULT_LABELS[insp.result] || insp.result}
                          </Badge>
                        </TableCell>
                        <TableCell className="hidden md:table-cell">
                          {insp.vehicleFitness ? (
                            <Badge
                              variant="outline"
                              className={cn('border-transparent font-medium capitalize', FITNESS_COLORS[insp.vehicleFitness] || '')}
                            >
                              {insp.vehicleFitness}
                            </Badge>
                          ) : '—'}
                        </TableCell>
                        <TableCell className="hidden lg:table-cell">
                          {insp.certificateExpiry ? (
                            <DaysUntilExpiry endDate={insp.certificateExpiry} />
                          ) : (
                            <span className="text-xs text-muted-foreground">—</span>
                          )}
                        </TableCell>
                        <TableCell>
                          <Badge
                            variant="outline"
                            className={cn('border-transparent font-medium capitalize', STATUS_COLORS[insp.status] || '')}
                          >
                            {insp.status.replace('_', ' ')}
                          </Badge>
                        </TableCell>
                        <TableCell>
                          <div className="flex items-center gap-1">
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-8 w-8"
                              onClick={() => setExpandedId(expandedId === insp.id ? null : insp.id)}
                            >
                              {expandedId === insp.id ? (
                                <ChevronUp className="h-3.5 w-3.5" />
                              ) : (
                                <ChevronDown className="h-3.5 w-3.5" />
                              )}
                            </Button>
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-8 w-8"
                              onClick={() => handleView(insp)}
                            >
                              <Eye className="h-3.5 w-3.5" />
                            </Button>
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-8 w-8"
                              onClick={() => handleEdit(insp)}
                            >
                              <Pencil className="h-3.5 w-3.5" />
                            </Button>
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-8 w-8 text-red-500 hover:text-red-600"
                              onClick={() => handleDelete(insp)}
                              disabled={deletingId === insp.id}
                            >
                              <Trash2 className="h-3.5 w-3.5" />
                            </Button>
                          </div>
                        </TableCell>
                      </TableRow>
                      {/* Expanded safety checks row */}
                      {expandedId === insp.id && (
                        <TableRow>
                          <TableCell colSpan={9} className="bg-muted/30 px-6 py-4">
                            <SafetyChecksSummary inspection={insp} />
                            {insp.inspectorName && (
                              <p className="text-xs text-muted-foreground mt-2">
                                Inspector: {insp.inspectorName}
                                {insp.inspectionStation ? ` — ${insp.inspectionStation}` : ''}
                                {insp.odometerReading ? ` — ${insp.odometerReading.toLocaleString()} km` : ''}
                              </p>
                            )}
                          </TableCell>
                        </TableRow>
                      )}
                    </React.Fragment>
                  ))}
                </TableBody>
              </Table>
              </div>

              {/* Mobile Cards */}
              <div className="md:hidden divide-y">
                {filteredData.map((insp) => (
                  <div key={insp.id} className="mobile-card p-4 space-y-2">
                    <div className="flex items-center justify-between">
                      <div>
                        <p className="font-semibold text-sm">{insp.truck?.plateNumber || '—'}</p>
                        <p className="text-xs text-muted-foreground font-mono">{insp.certificateNumber}</p>
                      </div>
                      <Badge
                        variant="outline"
                        className={cn('border-transparent font-medium', RESULT_COLORS[insp.result] || '')}
                      >
                        {RESULT_LABELS[insp.result] || insp.result}
                      </Badge>
                    </div>
                    <div className="flex items-center justify-between">
                      <div className="text-sm">
                        <span className="text-muted-foreground">Type: </span>
                        <span className="font-medium text-xs">{INSPECTION_TYPE_LABELS[insp.inspectionType] || insp.inspectionType}</span>
                      </div>
                      <Badge
                        variant="outline"
                        className={cn('border-transparent font-medium capitalize', STATUS_COLORS[insp.status] || '')}
                      >
                        {insp.status.replace('_', ' ')}
                      </Badge>
                    </div>
                    {insp.certificateExpiry && (
                      <div className="flex items-center justify-between">
                        <p className="text-xs text-muted-foreground">
                          Cert. Expiry: <span className="font-semibold text-foreground">
                            {new Date(insp.certificateExpiry).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })}
                          </span>
                        </p>
                        <DaysUntilExpiry endDate={insp.certificateExpiry} />
                      </div>
                    )}
                    <div className="flex items-center justify-end gap-1">
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-8 w-8"
                        onClick={() => handleView(insp)}
                      >
                        <Eye className="h-3.5 w-3.5" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-8 w-8"
                        onClick={() => handleEdit(insp)}
                      >
                        <Pencil className="h-3.5 w-3.5" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-8 w-8 text-red-500 hover:text-red-600"
                        onClick={() => handleDelete(insp)}
                        disabled={deletingId === insp.id}
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </Button>
                    </div>
                  </div>
                ))}
              </div>
            </>
          )}
        </div>
      </motion.div>

      {/* Form Dialog */}
      <RoadworthyFormDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        inspection={editingInspection}
        onSuccess={handleDialogSuccess}
      />

      {/* Detail Dialog */}
      <InspectionDetailDialog
        inspection={viewingInspection}
        open={detailDialogOpen}
        onOpenChange={setDetailDialogOpen}
      />
    </motion.div>
  )
}
