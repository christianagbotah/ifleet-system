'use client'

import * as React from 'react'
import { motion } from 'framer-motion'
import {
  Car,
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
  Eye,
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
import { Badge } from '@/components/ui/badge'
import { EmptyState } from '@/components/ui/empty-state'
import { Skeleton } from '@/components/ui/skeleton'
import { useApi, apiFetch } from '@/lib/api'
import { cn } from '@/lib/utils'
import { toast } from 'sonner'
import { DvlaFormDialog, type DvlaRegistration } from './DvlaFormDialog'
import { DvlaDetailSheet } from './DvlaDetailSheet'

// ─── Animation Variants ───────────────────────────────────────────────────
const containerVariants = {
  show: { transition: { staggerChildren: 0.04 } },
}

const itemVariants = {
  show: { opacity: 1, y: 0 },
}

// ─── Status Colors ────────────────────────────────────────────────────────
const DVLA_STATUS_COLORS: Record<string, string> = {
  active: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400',
  expired: 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400',
  suspended: 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400',
  transferred: 'bg-sky-100 text-sky-700 dark:bg-sky-900/30 dark:text-sky-400',
  revoked: 'bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-400',
}

// ─── Days Until Expiry ────────────────────────────────────────────────────
function DaysUntilExpiry({ endDate, status }: { endDate: string; status?: string }) {
  if (status === 'expired' || status === 'revoked') {
    return (
      <div className="flex items-center gap-1 text-xs">
        <XCircle className="h-3 w-3 text-red-500" />
        <span className="text-red-600 font-semibold">Expired</span>
      </div>
    )
  }

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

// ─── Vehicle Class Labels ─────────────────────────────────────────────────
const VEHICLE_CLASS_LABELS: Record<string, string> = {
  heavy_goods: 'Heavy Goods',
  medium_goods: 'Medium Goods',
  light_goods: 'Light Goods',
  articulated: 'Articulated',
  trailer: 'Trailer',
}

// ─── Main Component ───────────────────────────────────────────────────────
export function DvlaView() {
  const [statusFilter, setStatusFilter] = React.useState('all')
  const [vehicleClassFilter, setVehicleClassFilter] = React.useState('all')
  const [dialogOpen, setDialogOpen] = React.useState(false)
  const [editingRegistration, setEditingRegistration] = React.useState<DvlaRegistration | null>(null)
  const [deletingId, setDeletingId] = React.useState<string | null>(null)
  const [selectedRegistrationId, setSelectedRegistrationId] = React.useState<string | null>(null)
  const [detailOpen, setDetailOpen] = React.useState(false)

  const { data, loading, error, refetch } = useApi<{ data: DvlaRegistration[]; total: number }>(
    () => apiFetch('/api/dvla-registrations?limit=100'),
    []
  )

  const registrations = data?.data || []

  // ─── Computed stats ───────────────────────────────────────────────────
  const stats = React.useMemo(() => {
    const now = new Date()
    const thirtyDaysFromNow = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000)

    const total = registrations.length
    const active = registrations.filter(r => r.status === 'active').length
    const expiringSoon = registrations.filter(r => {
      if (r.status !== 'active') return false
      const expiry = new Date(r.expiryDate)
      return expiry > now && expiry <= thirtyDaysFromNow
    }).length
    const expired = registrations.filter(r => r.status === 'expired').length

    return { total, active, expiringSoon, expired }
  }, [registrations])

  // ─── Filtered data ────────────────────────────────────────────────────
  const filteredData = React.useMemo(() => {
    return registrations.filter((r) => {
      const matchesStatus = statusFilter === 'all' || r.status === statusFilter
      const matchesClass = vehicleClassFilter === 'all' || r.vehicleClass === vehicleClassFilter
      return matchesStatus && matchesClass
    })
  }, [registrations, statusFilter, vehicleClassFilter])

  // ─── Handlers ─────────────────────────────────────────────────────────
  function handleAdd() {
    setEditingRegistration(null)
    setDialogOpen(true)
  }

  function handleView(registration: DvlaRegistration) {
    setSelectedRegistrationId(registration.id)
    setDetailOpen(true)
  }

  function handleEdit(registration: DvlaRegistration) {
    setEditingRegistration(registration)
    setDialogOpen(true)
  }

  async function handleDelete(registration: DvlaRegistration) {
    setDeletingId(registration.id)
    try {
      await apiFetch(`/api/dvla-registrations/${registration.id}`, { method: 'DELETE' })
      toast.success('DVLA registration deleted successfully')
      refetch()
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to delete registration')
    } finally {
      setDeletingId(null)
    }
  }

  function handleDialogSuccess() {
    refetch()
  }

  function handleDetailDeleted() {
    refetch()
  }

  function handleDetailEdit(registration: Record<string, unknown>) {
    setDetailOpen(false)
    setEditingRegistration(registration as DvlaRegistration)
    setDialogOpen(true)
  }

  return (
    <motion.div
      variants={containerVariants}
      animate="show"
      className="space-y-4 sm:space-y-6"
    >
      {/* Header */}
      <motion.div variants={itemVariants}>
        <h1 className="text-2xl font-bold tracking-tight">DVLA Vehicle Registration</h1>
        <p className="text-muted-foreground">
          Manage fleet vehicle registrations with the Driver and Vehicle Licensing Authority
        </p>
      </motion.div>

      {/* Summary Stat Cards */}
      <motion.div variants={itemVariants} className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
        <div className="rounded-lg border bg-card p-4">
          <div className="flex items-center gap-3">
            <div className="rounded-md bg-primary/10 p-2">
              <FileCheck className="h-4 w-4 text-primary" />
            </div>
            <div>
              <p className="text-2xl font-bold">{loading ? '—' : stats.total}</p>
              <p className="text-xs text-muted-foreground">Total Registrations</p>
            </div>
          </div>
        </div>
        <div className="rounded-lg border bg-card p-4">
          <div className="flex items-center gap-3">
            <div className="rounded-md bg-emerald-500/10 p-2">
              <FileCheck className="h-4 w-4 text-emerald-600" />
            </div>
            <div>
              <p className="text-2xl font-bold text-emerald-600">{loading ? '—' : stats.active}</p>
              <p className="text-xs text-muted-foreground">Active</p>
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
              <p className="text-xs text-muted-foreground">Expiring Soon</p>
            </div>
          </div>
        </div>
        <div className="rounded-lg border bg-card p-4">
          <div className="flex items-center gap-3">
            <div className="rounded-md bg-red-500/10 p-2">
              <XCircle className="h-4 w-4 text-red-600" />
            </div>
            <div>
              <p className="text-2xl font-bold text-red-600">{loading ? '—' : stats.expired}</p>
              <p className="text-xs text-muted-foreground">Expired</p>
            </div>
          </div>
        </div>
      </motion.div>

      {/* Filters + Add Button */}
      <motion.div variants={itemVariants} className="flex flex-col sm:flex-row gap-3 items-start sm:items-center justify-between">
        <div className="flex flex-col sm:flex-row gap-3 w-full sm:w-auto">
          <Select value={statusFilter} onValueChange={setStatusFilter}>
            <SelectTrigger className="w-full sm:w-40">
              <SelectValue placeholder="Status" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Status</SelectItem>
              <SelectItem value="active">Active</SelectItem>
              <SelectItem value="expired">Expired</SelectItem>
              <SelectItem value="suspended">Suspended</SelectItem>
              <SelectItem value="transferred">Transferred</SelectItem>
              <SelectItem value="revoked">Revoked</SelectItem>
            </SelectContent>
          </Select>
          <Select value={vehicleClassFilter} onValueChange={setVehicleClassFilter}>
            <SelectTrigger className="w-full sm:w-44">
              <SelectValue placeholder="Vehicle Class" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Classes</SelectItem>
              <SelectItem value="heavy_goods">Heavy Goods</SelectItem>
              <SelectItem value="medium_goods">Medium Goods</SelectItem>
              <SelectItem value="light_goods">Light Goods</SelectItem>
              <SelectItem value="articulated">Articulated</SelectItem>
              <SelectItem value="trailer">Trailer</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <Button onClick={handleAdd} className="shrink-0">
          <Plus className="mr-2 h-4 w-4" />
          Add Registration
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
              icon={Car}
              title="No DVLA registrations found"
              description={
                statusFilter !== 'all' || vehicleClassFilter !== 'all'
                  ? 'Try adjusting your filter criteria'
                  : 'Add your first DVLA vehicle registration to start tracking compliance.'
              }
            />
          ) : (
            <>
              <div className="overflow-x-auto hidden md:block">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Reg. #</TableHead>
                    <TableHead className="hidden md:table-cell">Certificate #</TableHead>
                    <TableHead>Truck</TableHead>
                    <TableHead className="hidden lg:table-cell">Vehicle Class</TableHead>
                    <TableHead className="hidden lg:table-cell">Registered Owner</TableHead>
                    <TableHead className="hidden xl:table-cell">DVLA Office</TableHead>
                    <TableHead className="hidden lg:table-cell">Reg. Date</TableHead>
                    <TableHead className="hidden sm:table-cell">Expiry Date</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead className="hidden md:table-cell">Expiry</TableHead>
                    <TableHead className="w-[110px]">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredData.map((reg) => (
                    <TableRow key={reg.id}>
                      <TableCell className="font-mono text-xs font-medium">
                        {reg.registrationNumber}
                      </TableCell>
                      <TableCell className="hidden md:table-cell text-xs text-muted-foreground">
                        {reg.certificateNumber}
                      </TableCell>
                      <TableCell className="text-sm font-medium">
                        {reg.truck?.plateNumber || '—'}
                      </TableCell>
                      <TableCell className="hidden lg:table-cell text-sm">
                        <Badge variant="outline" className="border-transparent font-normal">
                          {VEHICLE_CLASS_LABELS[reg.vehicleClass] || reg.vehicleClass}
                        </Badge>
                      </TableCell>
                      <TableCell className="hidden lg:table-cell text-sm max-w-[160px] truncate">
                        {reg.registeredOwner}
                      </TableCell>
                      <TableCell className="hidden xl:table-cell text-sm text-muted-foreground">
                        {reg.dvlaOffice || '—'}
                      </TableCell>
                      <TableCell className="hidden lg:table-cell text-xs text-muted-foreground">
                        {new Date(reg.registrationDate).toLocaleDateString('en-GB', {
                          day: '2-digit', month: 'short', year: 'numeric',
                        })}
                      </TableCell>
                      <TableCell className="hidden sm:table-cell text-xs text-muted-foreground">
                        {new Date(reg.expiryDate).toLocaleDateString('en-GB', {
                          day: '2-digit', month: 'short', year: 'numeric',
                        })}
                      </TableCell>
                      <TableCell>
                        <Badge
                          variant="outline"
                          className={cn(
                            'border-transparent font-medium capitalize',
                            DVLA_STATUS_COLORS[reg.status] || ''
                          )}
                        >
                          {reg.status}
                        </Badge>
                      </TableCell>
                      <TableCell className="hidden md:table-cell">
                        <DaysUntilExpiry endDate={reg.expiryDate} status={reg.status} />
                      </TableCell>
                      <TableCell>
                        <div className="flex items-center gap-1">
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-8 w-8"
                            onClick={() => handleView(reg)}
                            title="View details"
                          >
                            <Eye className="h-3.5 w-3.5" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-8 w-8"
                            onClick={() => handleEdit(reg)}
                            title="Edit"
                          >
                            <Pencil className="h-3.5 w-3.5" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-8 w-8 text-red-500 hover:text-red-600"
                            onClick={() => handleDelete(reg)}
                            disabled={deletingId === reg.id}
                            title="Delete"
                          >
                            <Trash2 className="h-3.5 w-3.5" />
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
                {filteredData.map((reg) => (
                  <div key={reg.id} className="mobile-card p-4 space-y-2">
                    <div className="flex items-center justify-between">
                      <div>
                        <p className="font-semibold text-sm">{reg.truck?.plateNumber || '—'}</p>
                        <p className="text-xs text-muted-foreground font-mono">{reg.registrationNumber}</p>
                      </div>
                      <Badge
                        variant="outline"
                        className={cn(
                          'border-transparent font-medium capitalize',
                          DVLA_STATUS_COLORS[reg.status] || ''
                        )}
                      >
                        {reg.status}
                      </Badge>
                    </div>
                    <div className="flex items-center justify-between">
                      <div className="text-sm">
                        <span className="text-muted-foreground">Cert: </span>
                        <span className="font-medium text-xs">{reg.certificateNumber}</span>
                      </div>
                      <DaysUntilExpiry endDate={reg.expiryDate} status={reg.status} />
                    </div>
                    <div className="flex items-center justify-between">
                      <p className="text-xs text-muted-foreground">
                        Expiry: <span className="font-semibold text-foreground">
                          {new Date(reg.expiryDate).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })}
                        </span>
                      </p>
                      <div className="flex items-center gap-1">
                        <Button
                          variant="outline"
                          size="sm"
                          className="flex-1 h-8 text-xs"
                          onClick={() => handleView(reg)}
                        >
                          <Eye className="mr-1 h-3 w-3" /> View
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-8 w-8"
                          onClick={() => handleEdit(reg)}
                        >
                          <Pencil className="h-3.5 w-3.5" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-8 w-8 text-red-500 hover:text-red-600"
                          onClick={() => handleDelete(reg)}
                          disabled={deletingId === reg.id}
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </Button>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </>
          )}
        </div>
      </motion.div>

      {/* Form Dialog */}
      <DvlaFormDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        registration={editingRegistration}
        onSuccess={handleDialogSuccess}
      />

      {/* Detail Sheet */}
      <DvlaDetailSheet
        registrationId={selectedRegistrationId}
        open={detailOpen}
        onOpenChange={setDetailOpen}
        onEdit={handleDetailEdit}
        onDeleted={handleDetailDeleted}
      />
    </motion.div>
  )
}
