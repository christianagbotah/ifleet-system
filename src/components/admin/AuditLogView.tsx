'use client'

import React, { Fragment, useState, useEffect } from 'react'
import { apiFetch } from '@/lib/api'
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
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
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { Skeleton } from '@/components/ui/skeleton'
import { Separator } from '@/components/ui/separator'
import {
  Shield,
  Clock,
  User,
  FileText,
  Activity,
  ChevronRight,
  ChevronDown,
  Search,
  Filter,
  RotateCcw,
  ArrowUpRight,
  Calendar,
  Network,
  Hash,
  Loader2,
  CircleDot,
} from 'lucide-react'

// ============ Types ============

interface AuditLogItem {
  id: string
  userId: string
  userName: string
  userEmail: string
  action: string
  entity: string
  entityId: string | null
  entityLabel: string
  details: {
    changes?: Record<string, { old?: string | null; new?: string | null }>
    reason?: string
    notes?: string
    [key: string]: unknown
  }
  ipAddress: string | null
  createdAt: string
}

interface AuditLogSummary {
  byEntity: Record<string, number>
  byAction: Record<string, number>
  todayCount: number
  mostActiveUser: string
  mostActiveEntity: string
}

interface EntityTimelineLog {
  id: string
  timestamp: string
  action: string
  user: { id: string; name: string; email: string }
  changes: { field: string; oldValue: string; newValue: string }[]
  metadata: Record<string, unknown>
  ipAddress: string | null
}

interface EntityTrailData {
  entity: string
  entityId: string
  entityLabel: string
  logs: EntityTimelineLog[]
  statistics: {
    totalChanges: number
    lastModified: string | null
    modifiedBy: string[]
    fieldChangeCount: Record<string, number>
  }
}

interface UserOption {
  id: string
  name: string
  email: string
}

// ============ Action Badge Config ============

const ACTION_STYLES: Record<string, { label: string; className: string }> = {
  create: {
    label: 'Create',
    className: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400',
  },
  update: {
    label: 'Update',
    className: 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400',
  },
  delete: {
    label: 'Delete',
    className: 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400',
  },
  login: {
    label: 'Login',
    className: 'bg-sky-100 text-sky-700 dark:bg-sky-900/30 dark:text-sky-400',
  },
}

function getActionStyle(action: string) {
  return ACTION_STYLES[action] || {
    label: action.charAt(0).toUpperCase() + action.slice(1),
    className: 'bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-400',
  }
}

// ============ Format Helpers ============

function formatDateTime(isoString: string): string {
  const date = new Date(isoString)
  return date.toLocaleDateString('en-GB', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  })
}

function formatDate(isoString: string): string {
  const date = new Date(isoString)
  return date.toLocaleDateString('en-GB', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  })
}

function formatTime(isoString: string): string {
  const date = new Date(isoString)
  return date.toLocaleTimeString('en-GB', {
    hour: '2-digit',
    minute: '2-digit',
  })
}

function timeAgo(isoString: string): string {
  const now = new Date()
  const date = new Date(isoString)
  const seconds = Math.floor((now.getTime() - date.getTime()) / 1000)

  if (seconds < 60) return 'just now'
  const minutes = Math.floor(seconds / 60)
  if (minutes < 60) return `${minutes}m ago`
  const hours = Math.floor(minutes / 60)
  if (hours < 24) return `${hours}h ago`
  const days = Math.floor(hours / 24)
  if (days < 7) return `${days}d ago`
  return formatDate(isoString)
}

function nullDisplay(val: string | null | undefined): string {
  if (val === null || val === undefined || val === '') return '—'
  return val
}

// ============ Summary Card Component ============

function SummaryCard({
  icon: Icon,
  label,
  value,
  subValue,
  colorClass,
}: {
  icon: React.ElementType
  label: string
  value: string | number
  subValue?: string
  colorClass: string
}) {
  return (
    <Card className="border-0 shadow-sm">
      <CardContent className="p-4 flex items-start gap-3">
        <div className={`rounded-lg p-2 ${colorClass}`}>
          <Icon className="h-4 w-4" />
        </div>
        <div className="min-w-0 flex-1">
          <p className="text-xs text-muted-foreground truncate">{label}</p>
          <p className="text-lg font-bold leading-tight truncate">{value}</p>
          {subValue && (
            <p className="text-xs text-muted-foreground truncate">{subValue}</p>
          )}
        </div>
      </CardContent>
    </Card>
  )
}

// ============ Diff View Component ============

function DiffView({
  changes,
  action,
  details,
}: {
  changes: { field: string; oldValue: string; newValue: string }[]
  action: string
  details: Record<string, unknown>
}) {
  if (action === 'create' && details) {
    // Show all field values for create
    const fields = Object.entries(details).filter(([key]) => key !== 'changes')
    if (fields.length === 0) return null

    return (
      <div className="mt-3">
        <p className="text-xs font-medium text-muted-foreground mb-2 uppercase tracking-wider">
          Created Fields
        </p>
        <div className="rounded-lg border overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-muted/50">
                <th className="text-left px-3 py-1.5 font-medium text-muted-foreground">Field</th>
                <th className="text-left px-3 py-1.5 font-medium text-muted-foreground">Value</th>
              </tr>
            </thead>
            <tbody>
              {fields.map(([key, value]) => (
                <tr key={key} className="border-t">
                  <td className="px-3 py-1.5 font-mono text-xs text-muted-foreground whitespace-nowrap">
                    {key}
                  </td>
                  <td className="px-3 py-1.5 break-all">
                    {typeof value === 'object' ? JSON.stringify(value) : String(value ?? '—')}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    )
  }

  if (action === 'delete' && details) {
    const fields = Object.entries(details).filter(([key]) => key !== 'changes')
    if (fields.length === 0) return null

    return (
      <div className="mt-3">
        <p className="text-xs font-medium text-red-500 mb-2 uppercase tracking-wider">
          Deleted Data
        </p>
        <div className="rounded-lg border border-red-200 dark:border-red-900/30 overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-red-50 dark:bg-red-900/20">
                <th className="text-left px-3 py-1.5 font-medium text-red-600 dark:text-red-400">Field</th>
                <th className="text-left px-3 py-1.5 font-medium text-red-600 dark:text-red-400">Value</th>
              </tr>
            </thead>
            <tbody>
              {fields.map(([key, value]) => (
                <tr key={key} className="border-t border-red-100 dark:border-red-900/20">
                  <td className="px-3 py-1.5 font-mono text-xs text-muted-foreground whitespace-nowrap">
                    {key}
                  </td>
                  <td className="px-3 py-1.5 break-all text-red-700 dark:text-red-300">
                    {typeof value === 'object' ? JSON.stringify(value) : String(value ?? '—')}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    )
  }

  if (action === 'update' && changes.length > 0) {
    return (
      <div className="mt-3">
        <p className="text-xs font-medium text-muted-foreground mb-2 uppercase tracking-wider">
          Changes
        </p>
        <div className="rounded-lg border overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-muted/50">
                <th className="text-left px-3 py-1.5 font-medium text-muted-foreground w-1/3">Field</th>
                <th className="text-left px-3 py-1.5 font-medium text-red-600 dark:text-red-400 w-1/3">Old Value</th>
                <th className="text-center px-1 py-1.5 w-6"></th>
                <th className="text-left px-3 py-1.5 font-medium text-emerald-600 dark:text-emerald-400 w-1/3">New Value</th>
              </tr>
            </thead>
            <tbody>
              {changes.map((change, i) => (
                <tr key={i} className="border-t">
                  <td className="px-3 py-1.5 font-mono text-xs text-muted-foreground whitespace-nowrap align-top">
                    {change.field}
                  </td>
                  <td className="px-3 py-1.5 break-all align-top">
                    <span className="line-through text-red-600 dark:text-red-400 opacity-70">
                      {nullDisplay(change.oldValue)}
                    </span>
                  </td>
                  <td className="px-1 py-1.5 text-center text-muted-foreground align-top text-xs">→</td>
                  <td className="px-3 py-1.5 break-all align-top">
                    <span className="text-emerald-600 dark:text-emerald-400 font-medium">
                      {nullDisplay(change.newValue)}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    )
  }

  // Login or other actions with no changes
  if (details && Object.keys(details).length > 0) {
    const meta = Object.entries(details).filter(([key]) => key !== 'changes')
    if (meta.length > 0) {
      return (
        <div className="mt-3">
          <p className="text-xs font-medium text-muted-foreground mb-2 uppercase tracking-wider">
            Details
          </p>
          <div className="rounded-lg border bg-muted/20 p-3 space-y-1 text-sm">
            {meta.map(([key, value]) => (
              <div key={key} className="flex gap-2">
                <span className="font-mono text-xs text-muted-foreground shrink-0">{key}:</span>
                <span className="break-all">
                  {typeof value === 'object' ? JSON.stringify(value) : String(value ?? '—')}
                </span>
              </div>
            ))}
          </div>
        </div>
      )
    }
  }

  return null
}

// ============ Entity History Dialog ============

function EntityHistoryDialog({
  entity,
  entityId,
  entityLabel,
  open,
  onClose,
}: {
  entity: string
  entityId: string
  entityLabel: string
  open: boolean
  onClose: () => void
}) {
  const [trailData, setTrailData] = useState<EntityTrailData | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [fetchKey, setFetchKey] = useState(0)

  // Trigger fetch when dialog opens
  useEffect(() => {
    if (!open || !entityId) return

    let cancelled = false
    // Use microtask to avoid synchronous setState in effect
    queueMicrotask(() => {
      setLoading(true)
      setError(null)
    })

    apiFetch<EntityTrailData>(
      `/api/audit-logs/entity/${entity}/${entityId}`
    )
      .then((data) => {
        if (!cancelled) setTrailData(data)
      })
      .catch((err) => {
        if (!cancelled) setError(err.message || 'Failed to load entity history')
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })

    return () => { cancelled = true }
  }, [open, entity, entityId, fetchKey])

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v) onClose() }}>
      <DialogContent className="max-w-3xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Clock className="h-5 w-5 text-amber-500" />
            Audit Trail: {entity}
          </DialogTitle>
          <DialogDescription className="text-base font-medium text-foreground truncate">
            {entityLabel}
          </DialogDescription>
        </DialogHeader>

        {loading && (
          <div className="flex-1 flex items-center justify-center py-12">
            <Loader2 className="h-8 w-8 animate-spin text-amber-500" />
          </div>
        )}

        {error && (
          <div className="flex-1 flex items-center justify-center py-12 text-center">
            <div>
              <p className="text-destructive font-medium">Error</p>
              <p className="text-sm text-muted-foreground mt-1">{error}</p>
              <Button variant="outline" size="sm" className="mt-3" onClick={() => onClose()}>
                Close
              </Button>
            </div>
          </div>
        )}

        {trailData && !loading && !error && (
          <DialogBody className="flex-1 overflow-y-auto flex flex-col lg:flex-row gap-4 mt-2 px-2">
            {/* Timeline */}
            <div className="flex-1 min-w-0">
              {trailData.logs.length === 0 ? (
                <div className="text-center py-12">
                  <FileText className="h-10 w-10 text-muted-foreground mx-auto mb-2" />
                  <p className="text-muted-foreground">No audit history for this entity</p>
                </div>
              ) : (
                <div className="relative space-y-0">
                  {trailData.logs.map((log, index) => {
                    const style = getActionStyle(log.action)
                    const isLast = index === trailData.logs.length - 1
                    return (
                      <div key={log.id} className="relative flex gap-4 pb-6">
                        {/* Timeline line + dot */}
                        <div className="flex flex-col items-center shrink-0">
                          <div className={`rounded-full w-8 h-8 flex items-center justify-center text-xs font-bold ring-4 ring-background z-10
                            ${log.action === 'create' ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/50 dark:text-emerald-400' :
                              log.action === 'update' ? 'bg-amber-100 text-amber-700 dark:bg-amber-900/50 dark:text-amber-400' :
                              log.action === 'delete' ? 'bg-red-100 text-red-700 dark:bg-red-900/50 dark:text-red-400' :
                              'bg-sky-100 text-sky-700 dark:bg-sky-900/50 dark:text-sky-400'}`}
                          >
                            {log.action === 'create' ? '+' : log.action === 'delete' ? '×' : log.action === 'login' ? '↗' : '~'}
                          </div>
                          {!isLast && (
                            <div className="w-px flex-1 bg-border mt-1" />
                          )}
                        </div>

                        {/* Content */}
                        <div className="flex-1 min-w-0 -mt-1">
                          <div className="flex items-center gap-2 flex-wrap">
                            <Badge variant="outline" className={style.className}>
                              {style.label}
                            </Badge>
                            <span className="text-xs text-muted-foreground">
                              {formatDateTime(log.timestamp)}
                            </span>
                          </div>
                          <p className="text-sm font-medium mt-1">
                            {log.user.name}
                          </p>
                          <p className="text-xs text-muted-foreground">
                            {log.user.email}
                          </p>

                          {/* Changes */}
                          {log.changes.length > 0 && (
                            <div className="mt-2">
                              <div className="rounded-lg border overflow-hidden">
                                <table className="w-full text-xs">
                                  <thead>
                                    <tr className="bg-muted/50">
                                      <th className="text-left px-2 py-1 font-medium text-muted-foreground">Field</th>
                                      <th className="text-left px-2 py-1 font-medium text-red-500">Old</th>
                                      <th className="text-left px-2 py-1 font-medium text-emerald-500">New</th>
                                    </tr>
                                  </thead>
                                  <tbody>
                                    {log.changes.map((change, ci) => (
                                      <tr key={ci} className="border-t">
                                        <td className="px-2 py-1 font-mono text-muted-foreground">{change.field}</td>
                                        <td className="px-2 py-1 line-through text-red-500 opacity-70 break-all">{change.oldValue}</td>
                                        <td className="px-2 py-1 text-emerald-600 dark:text-emerald-400 font-medium break-all">{change.newValue}</td>
                                      </tr>
                                    ))}
                                  </tbody>
                                </table>
                              </div>
                            </div>
                          )}

                          {/* Metadata (reason, notes) */}
                          {Object.keys(log.metadata).length > 0 && (
                            <div className="mt-2 space-y-1">
                              {Object.entries(log.metadata).map(([key, value]) => (
                                <div key={key} className="text-xs flex gap-2">
                                  <span className="text-muted-foreground shrink-0 capitalize">{key}:</span>
                                  <span className="break-all">
                                    {typeof value === 'object' ? JSON.stringify(value) : String(value)}
                                  </span>
                                </div>
                              ))}
                            </div>
                          )}

                          {log.ipAddress && (
                            <p className="text-[10px] text-muted-foreground mt-1">
                              IP: {log.ipAddress}
                            </p>
                          )}
                        </div>
                      </div>
                    )
                  })}
                </div>
              )}
            </div>

            {/* Statistics Sidebar */}
            <div className="lg:w-56 shrink-0 space-y-3 lg:max-h-full lg:overflow-y-auto">
              <Card className="border-0 shadow-sm">
                <CardHeader className="p-3 pb-2">
                  <CardTitle className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
                    Statistics
                  </CardTitle>
                </CardHeader>
                <CardContent className="p-3 pt-0 space-y-3">
                  <div className="flex justify-between items-center">
                    <span className="text-xs text-muted-foreground">Total Changes</span>
                    <span className="text-sm font-bold">{trailData.statistics.totalChanges}</span>
                  </div>
                  <Separator />
                  <div>
                    <span className="text-xs text-muted-foreground block mb-1">Last Modified</span>
                    <span className="text-xs font-medium">
                      {trailData.statistics.lastModified
                        ? formatDateTime(trailData.statistics.lastModified)
                        : 'Never'}
                    </span>
                  </div>
                  <Separator />
                  <div>
                    <span className="text-xs text-muted-foreground block mb-1">Modified By</span>
                    <div className="space-y-1">
                      {trailData.statistics.modifiedBy.map((name, i) => (
                        <div key={i} className="flex items-center gap-1.5 text-xs">
                          <div className="h-1.5 w-1.5 rounded-full bg-amber-500" />
                          {name}
                        </div>
                      ))}
                    </div>
                  </div>
                  <Separator />
                  <div>
                    <span className="text-xs text-muted-foreground block mb-1">Field Change Frequency</span>
                    <div className="space-y-1.5">
                      {Object.entries(trailData.statistics.fieldChangeCount).map(([field, count]) => (
                        <div key={field} className="flex items-center justify-between text-xs">
                          <span className="font-mono text-muted-foreground truncate mr-2">{field}</span>
                          <Badge variant="secondary" className="text-[10px] shrink-0">
                            {count as number}
                          </Badge>
                        </div>
                      ))}
                    </div>
                  </div>
                </CardContent>
              </Card>
            </div>
          </DialogBody>
        )}
      </DialogContent>
    </Dialog>
  )
}

// ============ Loading Skeleton ============

function TableSkeleton() {
  return (
    <div className="space-y-3">
      {Array.from({ length: 8 }).map((_, i) => (
        <div key={i} className="flex items-center gap-4">
          <Skeleton className="h-4 w-32" />
          <Skeleton className="h-4 w-20" />
          <Skeleton className="h-5 w-16" />
          <Skeleton className="h-4 w-16" />
          <Skeleton className="h-4 w-40" />
          <Skeleton className="h-4 w-24" />
        </div>
      ))}
    </div>
  )
}

// ============ Main Component ============

export function AuditLogView() {
  // Filters
  const [entityFilter, setEntityFilter] = useState('all')
  const [actionFilter, setActionFilter] = useState('all')
  const [userFilter, setUserFilter] = useState('all')
  const [dateFrom, setDateFrom] = useState('')
  const [dateTo, setDateTo] = useState('')
  const [entityIdSearch, setEntityIdSearch] = useState('')

  // Data
  const [logs, setLogs] = useState<AuditLogItem[]>([])
  const [total, setTotal] = useState(0)
  const [page, setPage] = useState(1)
  const [summary, setSummary] = useState<AuditLogSummary | null>(null)
  const [users, setUsers] = useState<UserOption[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [fetchKey, setFetchKey] = useState(0)

  // Expanded row
  const [expandedId, setExpandedId] = useState<string | null>(null)

  // Entity history dialog
  const [trailDialog, setTrailDialog] = useState<{
    open: boolean
    entity: string
    entityId: string
    entityLabel: string
  }>({ open: false, entity: '', entityId: '', entityLabel: '' })

  const limit = 20

  // Fetch users for filter dropdown
  useEffect(() => {
    apiFetch<{ data: UserOption[] }>('/api/users?limit=100')
      .then((res) => {
        if (res?.data) setUsers(res.data)
      })
      .catch(() => { /* ignore */ })
  }, [])

  useEffect(() => {
    // Inline fetch logic to avoid synchronous setState in effect via callback
    let cancelled = false

    const load = async () => {
      setLoading(true)
      setError(null)

      const params = new URLSearchParams()
      if (entityFilter !== 'all') params.set('entity', entityFilter)
      if (actionFilter !== 'all') params.set('action', actionFilter)
      if (userFilter !== 'all') params.set('userId', userFilter)
      if (dateFrom) params.set('dateFrom', dateFrom)
      if (dateTo) params.set('dateTo', dateTo)
      if (entityIdSearch) params.set('entityId', entityIdSearch)
      params.set('page', String(page))
      params.set('limit', String(limit))

      try {
        const res = await apiFetch<{
          data: AuditLogItem[]
          total: number
          page: number
          limit: number
          summary: AuditLogSummary
        }>(`/api/audit-logs?${params.toString()}`)
        if (!cancelled && res) {
          setLogs(res.data || [])
          setTotal(res.total || 0)
          setSummary(res.summary || null)
        }
      } catch (err) {
        if (!cancelled) setError(err instanceof Error ? err.message : 'Failed to load audit logs')
      } finally {
        if (!cancelled) setLoading(false)
      }
    }

    load()

    return () => { cancelled = true }
  }, [entityFilter, actionFilter, userFilter, dateFrom, dateTo, entityIdSearch, page, fetchKey])

  // Retry button handler
  const handleRetry = () => {
    setFetchKey((k) => k + 1)
  }

  // Reset filters
  const resetFilters = () => {
    setEntityFilter('all')
    setActionFilter('all')
    setUserFilter('all')
    setDateFrom('')
    setDateTo('')
    setEntityIdSearch('')
    setPage(1)
  }

  // Handle filter changes
  const handleFilterChange = (setter: (v: string) => void) => (value: string) => {
    setter(value)
    setPage(1)
  }

  const totalPages = Math.ceil(total / limit)

  // Get entity types from summary
  const entityTypes = summary
    ? Object.keys(summary.byEntity).sort()
    : ['Truck', 'Driver', 'Trip', 'Expense', 'FuelLog', 'MaintenanceRecord', 'Tyre', 'Insurance', 'Payroll', 'Client', 'User']

  const actionTypes = ['create', 'update', 'delete', 'login']

  return (
    <div className="space-y-6">
      {/* Page Header */}
      <div className="flex items-center gap-3">
        <div className="rounded-lg bg-violet-100 dark:bg-violet-900/25 p-2">
          <Shield className="h-5 w-5 text-violet-600 dark:text-violet-400" />
        </div>
        <div>
          <h1 className="text-xl font-bold tracking-tight">Audit Trail</h1>
          <p className="text-sm text-muted-foreground">
            Complete activity history with per-entity tracking and diff visualization
          </p>
        </div>
      </div>

      {/* Summary Cards */}
      {summary && (
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          <SummaryCard
            icon={Activity}
            label="Total Events"
            value={total}
            colorClass="bg-violet-100 text-violet-600 dark:bg-violet-900/30 dark:text-violet-400"
          />
          <SummaryCard
            icon={Calendar}
            label="Events Today"
            value={summary.todayCount}
            colorClass="bg-emerald-100 text-emerald-600 dark:bg-emerald-900/30 dark:text-emerald-400"
          />
          <SummaryCard
            icon={Network}
            label="Most Active Entity"
            value={summary.mostActiveEntity}
            subValue={`${summary.byEntity[summary.mostActiveEntity] || 0} events`}
            colorClass="bg-amber-100 text-amber-600 dark:bg-amber-900/30 dark:text-amber-400"
          />
          <SummaryCard
            icon={User}
            label="Most Active User"
            value={summary.mostActiveUser || 'N/A'}
            colorClass="bg-sky-100 text-sky-600 dark:bg-sky-900/30 dark:text-sky-400"
          />
        </div>
      )}

      {/* Filters */}
      <Card className="border-0 shadow-sm">
        <CardContent className="p-4">
          <div className="flex items-center gap-2 mb-3">
            <Filter className="h-4 w-4 text-muted-foreground" />
            <span className="text-sm font-medium">Filters</span>
            <Button
              variant="ghost"
              size="sm"
              className="ml-auto h-7 text-xs text-muted-foreground"
              onClick={resetFilters}
            >
              <RotateCcw className="h-3 w-3 mr-1" />
              Reset
            </Button>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6 gap-3">
            <Select value={entityFilter} onValueChange={handleFilterChange(setEntityFilter)}>
              <SelectTrigger className="h-9">
                <SelectValue placeholder="All Entities" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Entities</SelectItem>
                {entityTypes.map((e) => (
                  <SelectItem key={e} value={e}>{e}</SelectItem>
                ))}
              </SelectContent>
            </Select>

            <Select value={actionFilter} onValueChange={handleFilterChange(setActionFilter)}>
              <SelectTrigger className="h-9">
                <SelectValue placeholder="All Actions" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Actions</SelectItem>
                {actionTypes.map((a) => (
                  <SelectItem key={a} value={a}>{a.charAt(0).toUpperCase() + a.slice(1)}</SelectItem>
                ))}
              </SelectContent>
            </Select>

            <Select value={userFilter} onValueChange={handleFilterChange(setUserFilter)}>
              <SelectTrigger className="h-9">
                <SelectValue placeholder="All Users" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Users</SelectItem>
                {users.map((u) => (
                  <SelectItem key={u.id} value={u.id}>{u.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>

            <Input
              type="date"
              value={dateFrom}
              onChange={(e) => { setDateFrom(e.target.value); setPage(1) }}
              className="h-9"
              placeholder="From date"
            />

            <Input
              type="date"
              value={dateTo}
              onChange={(e) => { setDateTo(e.target.value); setPage(1) }}
              className="h-9"
              placeholder="To date"
            />

            <div className="relative">
              <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
              <Input
                value={entityIdSearch}
                onChange={(e) => { setEntityIdSearch(e.target.value); setPage(1) }}
                className="h-9 pl-8"
                placeholder="Entity ID..."
              />
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Audit Log Table */}
      <Card className="border-0 shadow-sm">
        <CardContent className="p-0">
          <div className="max-h-[600px] overflow-y-auto">
            {loading ? (
              <div className="p-4">
                <TableSkeleton />
              </div>
            ) : error ? (
              <div className="p-8 text-center">
                <p className="text-destructive font-medium">{error}</p>
                <Button variant="outline" size="sm" className="mt-3" onClick={handleRetry}>
                  Retry
                </Button>
              </div>
            ) : logs.length === 0 ? (
              <div className="p-12 text-center">
                <FileText className="h-10 w-10 text-muted-foreground mx-auto mb-3" />
                <p className="text-muted-foreground font-medium">No audit logs found</p>
                <p className="text-xs text-muted-foreground mt-1">
                  Try adjusting your filters to see more results
                </p>
              </div>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow className="hover:bg-transparent">
                    <TableHead className="w-8"></TableHead>
                    <TableHead className="text-xs">Timestamp</TableHead>
                    <TableHead className="text-xs">User</TableHead>
                    <TableHead className="text-xs">Action</TableHead>
                    <TableHead className="text-xs">Entity</TableHead>
                    <TableHead className="text-xs min-w-[200px]">Details</TableHead>
                    <TableHead className="text-xs hidden lg:table-cell">IP</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {logs.map((log) => {
                    const isExpanded = expandedId === log.id
                    const actionStyle = getActionStyle(log.action)
                    const rawChanges = log.details?.changes
                      ? Object.entries(log.details.changes as Record<string, { old?: string | null; new?: string | null }>)
                      : []

                    return (
                      <Fragment key={log.id}>
                        <TableRow
                          className={`cursor-pointer ${isExpanded ? 'bg-muted/30' : ''}`}
                          onClick={() => setExpandedId(isExpanded ? null : log.id)}
                        >
                          <TableCell className="w-8 px-2">
                            {isExpanded ? (
                              <ChevronDown className="h-4 w-4 text-muted-foreground" />
                            ) : (
                              <ChevronRight className="h-4 w-4 text-muted-foreground" />
                            )}
                          </TableCell>
                          <TableCell className="py-2">
                            <div>
                              <span className="text-xs font-medium">{formatDateTime(log.createdAt)}</span>
                              <br />
                              <span className="text-[10px] text-muted-foreground">{timeAgo(log.createdAt)}</span>
                            </div>
                          </TableCell>
                          <TableCell className="py-2">
                            <div>
                              <span className="text-xs font-medium">{log.userName}</span>
                              {log.userEmail && (
                                <p className="text-[10px] text-muted-foreground truncate max-w-[150px]">
                                  {log.userEmail}
                                </p>
                              )}
                            </div>
                          </TableCell>
                          <TableCell className="py-2">
                            <Badge variant="outline" className={`text-[10px] ${actionStyle.className}`}>
                              {actionStyle.label}
                            </Badge>
                          </TableCell>
                          <TableCell className="py-2">
                            <button
                              className="text-xs font-medium text-amber-600 dark:text-amber-400 hover:underline flex items-center gap-1 text-left"
                              onClick={(e) => {
                                e.stopPropagation()
                                if (log.entityId) {
                                  setTrailDialog({
                                    open: true,
                                    entity: log.entity,
                                    entityId: log.entityId,
                                    entityLabel: log.entityLabel,
                                  })
                                }
                              }}
                            >
                              {log.entityLabel}
                              {log.entityId && <ArrowUpRight className="h-3 w-3" />}
                            </button>
                          </TableCell>
                          <TableCell className="py-2">
                            <div className="text-xs text-muted-foreground truncate max-w-[200px]">
                              {log.action === 'update' && rawChanges.length > 0
                                ? `${rawChanges.length} field${rawChanges.length > 1 ? 's' : ''} changed`
                                : log.action === 'create'
                                  ? 'New record created'
                                  : log.action === 'delete'
                                    ? 'Record deleted'
                                    : log.details?.reason || log.details?.notes || '—'
                              }
                            </div>
                          </TableCell>
                          <TableCell className="py-2 hidden lg:table-cell">
                            <span className="text-[10px] font-mono text-muted-foreground">
                              {log.ipAddress || '—'}
                            </span>
                          </TableCell>
                        </TableRow>

                        {/* Expanded Detail Row */}
                        {isExpanded && (
                          <TableRow className="bg-muted/20 hover:bg-muted/20">
                            <TableCell colSpan={7} className="px-4 py-3">
                              <div className="max-w-3xl">
                                {/* Header info */}
                                <div className="flex flex-wrap gap-x-6 gap-y-1 mb-2 text-xs">
                                  <span className="text-muted-foreground">
                                    <Clock className="h-3 w-3 inline mr-1" />
                                    {formatDateTime(log.createdAt)}
                                  </span>
                                  <span className="text-muted-foreground">
                                    <User className="h-3 w-3 inline mr-1" />
                                    {log.userName} ({log.userEmail})
                                  </span>
                                  {log.ipAddress && (
                                    <span className="text-muted-foreground font-mono">
                                      <Hash className="h-3 w-3 inline mr-1" />
                                      {log.ipAddress}
                                    </span>
                                  )}
                                </div>

                                {/* Entity link */}
                                <div className="mb-2">
                                  <span className="text-xs text-muted-foreground">Entity: </span>
                                  <button
                                    className="text-xs font-medium text-amber-600 dark:text-amber-400 hover:underline inline-flex items-center gap-1"
                                    onClick={() => {
                                      if (log.entityId) {
                                        setTrailDialog({
                                          open: true,
                                          entity: log.entity,
                                          entityId: log.entityId,
                                          entityLabel: log.entityLabel,
                                        })
                                      }
                                    }}
                                  >
                                    {log.entity}: {log.entityLabel}
                                    <ArrowUpRight className="h-3 w-3" />
                                  </button>
                                </div>

                                {/* Reason / Notes */}
                                {(log.details?.reason || log.details?.notes) && (
                                  <div className="mb-2 px-3 py-2 rounded-md bg-amber-50 dark:bg-amber-900/10 border border-amber-100 dark:border-amber-900/20">
                                    <span className="text-xs font-medium text-amber-700 dark:text-amber-400">
                                      {log.details.reason ? 'Reason' : 'Notes'}:
                                    </span>
                                    <span className="text-xs ml-1">
                                      {log.details.reason || log.details.notes}
                                    </span>
                                  </div>
                                )}

                                {/* Diff View */}
                                <DiffView
                                  changes={rawChanges.map(([field, vals]) => ({
                                    field,
                                    oldValue: vals.old ?? null,
                                    newValue: vals.new ?? null,
                                  }))}
                                  action={log.action}
                                  details={log.details}
                                />
                              </div>
                            </TableCell>
                          </TableRow>
                        )}
                      </Fragment>
                    )
                  })}
                </TableBody>
              </Table>
            )}
          </div>

          {/* Pagination */}
          {!loading && !error && logs.length > 0 && totalPages > 1 && (
            <div className="flex items-center justify-between px-4 py-3 border-t">
              <p className="text-xs text-muted-foreground">
                Showing {(page - 1) * limit + 1}–{Math.min(page * limit, total)} of {total} events
              </p>
              <div className="flex items-center gap-1">
                <Button
                  variant="outline"
                  size="sm"
                  className="h-7 text-xs"
                  disabled={page <= 1}
                  onClick={() => setPage(1)}
                >
                  First
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  className="h-7 text-xs"
                  disabled={page <= 1}
                  onClick={() => setPage((p) => p - 1)}
                >
                  Prev
                </Button>
                <span className="px-2 text-xs font-medium">
                  Page {page} of {totalPages}
                </span>
                <Button
                  variant="outline"
                  size="sm"
                  className="h-7 text-xs"
                  disabled={page >= totalPages}
                  onClick={() => setPage((p) => p + 1)}
                >
                  Next
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  className="h-7 text-xs"
                  disabled={page >= totalPages}
                  onClick={() => setPage(totalPages)}
                >
                  Last
                </Button>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Entity History Dialog */}
      <EntityHistoryDialog
        entity={trailDialog.entity}
        entityId={trailDialog.entityId}
        entityLabel={trailDialog.entityLabel}
        open={trailDialog.open}
        onClose={() => setTrailDialog({ open: false, entity: '', entityId: '', entityLabel: '' })}
      />
    </div>
  )
}
