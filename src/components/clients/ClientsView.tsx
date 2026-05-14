'use client'

import * as React from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import {
  Plus, Search, Eye, Pencil, Building2, Phone, Mail, MapPin,
  DollarSign, TrendingUp, Users, Package, ArrowRight,
  AlertCircle, RefreshCw, CalendarDays, Route, ChevronRight,
  CheckCircle2, XCircle, Trash2, X,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { EmptyState } from '@/components/ui/empty-state'
import { Skeleton } from '@/components/ui/skeleton'
import { Separator } from '@/components/ui/separator'
import { StatsCard } from '@/components/ui/stats-card'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { VisuallyHidden } from '@radix-ui/react-visually-hidden'
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
} from '@/components/ui/sheet'
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
import { Checkbox } from '@/components/ui/checkbox'
import {
  fetchClients, fetchClientDetail, deleteClient, bulkClientAction, type Client, type ClientDetail,
} from '@/lib/api'
import { useDebounce } from '@/hooks/use-debounce'
import { TRIP_STATUSES } from '@/lib/constants'
import { ClientFormDialog } from '@/components/clients/ClientFormDialog'
import { useEntityHighlight } from '@/lib/hooks/useEntityHighlight'
import { toast } from 'sonner'

const containerVariants = {
  show: { transition: { staggerChildren: 0.04 } },
}

const itemVariants = {
  show: { opacity: 1, y: 0 },
}

function formatGHS(amount: number): string {
  return `₵${amount.toLocaleString('en-GH', { minimumFractionDigits: 0, maximumFractionDigits: 2 })}`
}

function formatDate(dateStr: string | null | undefined): string {
  if (!dateStr) return '—'
  return new Date(dateStr).toLocaleDateString('en-GB', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  })
}

function timeAgo(dateStr: string | null | undefined): string {
  if (!dateStr) return 'Never'
  const diff = Date.now() - new Date(dateStr).getTime()
  const days = Math.floor(diff / (1000 * 60 * 60 * 24))
  if (days === 0) return 'Today'
  if (days === 1) return 'Yesterday'
  if (days < 7) return `${days} days ago`
  if (days < 30) return `${Math.floor(days / 7)} week(s) ago`
  if (days < 365) return `${Math.floor(days / 30)} month(s) ago`
  return `${Math.floor(days / 365)} year(s) ago`
}

export function ClientsView() {
  const [search, setSearch] = React.useState('')
  const debouncedSearch = useDebounce(search, 300)
  const [statusFilter, setStatusFilter] = React.useState('all')
  const [clients, setClients] = React.useState<Client[]>([])
  const [totalCount, setTotalCount] = React.useState(0)
  const [loading, setLoading] = React.useState(true)
  const [error, setError] = React.useState<string | null>(null)

  const [formOpen, setFormOpen] = React.useState(false)
  const [editingClient, setEditingClient] = React.useState<Client | null>(null)

  const [detailOpen, setDetailOpen] = React.useState(false)
  const [selectedDetail, setSelectedDetail] = React.useState<ClientDetail | null>(null)
  const [detailLoading, setDetailLoading] = React.useState(false)

  const [deactivateId, setDeactivateId] = React.useState<string | null>(null)
  const [deactivating, setDeactivating] = React.useState(false)

  // Bulk selection state
  const [selectedIds, setSelectedIds] = React.useState<Set<string>>(new Set())
  const [bulkLoading, setBulkLoading] = React.useState(false)
  const [bulkDeleteDialogOpen, setBulkDeleteDialogOpen] = React.useState(false)

  const { highlightEntityId, highlightClassName, scrollIntoView } = useEntityHighlight('client')
  const rowRefs = React.useRef<Record<string, HTMLElement | null>>({})

  const loadClients = React.useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const params: Parameters<typeof fetchClients>[0] = { limit: 100 }
      if (debouncedSearch) params.search = debouncedSearch
      if (statusFilter === 'active') params.isActive = 'true'
      if (statusFilter === 'inactive') params.isActive = 'false'
      const result = await fetchClients(params)
      setClients(result.data)
      setTotalCount(result.total || result.data.length)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to fetch clients')
    } finally {
      setLoading(false)
    }
  }, [debouncedSearch, statusFilter])

  React.useEffect(() => {
    loadClients()
  }, [loadClients])

  // Scroll to highlighted row after data loads
  React.useEffect(() => {
    if (highlightEntityId && rowRefs.current[highlightEntityId]) {
      scrollIntoView(rowRefs.current[highlightEntityId])
    }
  }, [highlightEntityId, clients, scrollIntoView])

  // Clear selection when filters change
  React.useEffect(() => {
    setSelectedIds(new Set())
  }, [debouncedSearch, statusFilter])

  // Bulk selection handlers
  const toggleSelect = React.useCallback((id: string) => {
    setSelectedIds(prev => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }, [])

  const toggleSelectAll = React.useCallback(() => {
    if (selectedIds.size === clients.length && clients.every(c => selectedIds.has(c.id))) {
      setSelectedIds(new Set())
    } else {
      setSelectedIds(new Set(clients.map(c => c.id)))
    }
  }, [clients, selectedIds])

  const isAllSelected = clients.length > 0 && clients.every(c => selectedIds.has(c.id))
  const isSomeSelected = clients.some(c => selectedIds.has(c.id)) && !isAllSelected
  const clearSelection = React.useCallback(() => setSelectedIds(new Set()), [])

  // Bulk action handler
  const handleBulkAction = React.useCallback(async (action: 'delete' | 'activate' | 'deactivate') => {
    if (selectedIds.size === 0) return
    if (action === 'delete') {
      setBulkDeleteDialogOpen(true)
      return
    }

    setBulkLoading(true)
    try {
      const result = await bulkClientAction(action, Array.from(selectedIds))
      if (result.errors.length > 0) {
        const skippedMsg = result.errors.map(e => e.message).filter((m, i, arr) => arr.indexOf(m) === i).join('; ')
        toast.warning(`${result.success} client(s) updated. ${result.failed} skipped: ${skippedMsg}`)
      } else {
        const actionLabel = action === 'activate' ? 'activated' : 'deactivated'
        toast.success(`${result.success} client(s) ${actionLabel} successfully`)
      }
      setSelectedIds(new Set())
      loadClients()
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Bulk action failed')
    } finally {
      setBulkLoading(false)
    }
  }, [selectedIds, loadClients])

  const handleBulkDelete = React.useCallback(async () => {
    setBulkLoading(true)
    try {
      const result = await bulkClientAction('delete', Array.from(selectedIds))
      if (result.errors.length > 0) {
        const skippedMsg = result.errors.map(e => e.message).filter((m, i, arr) => arr.indexOf(m) === i).join('; ')
        toast.warning(`${result.success} client(s) deleted. ${result.failed} skipped: ${skippedMsg}`)
      } else {
        toast.success(`${result.success} client(s) deleted successfully`)
      }
      setSelectedIds(new Set())
      setBulkDeleteDialogOpen(false)
      loadClients()
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to delete clients')
    } finally {
      setBulkLoading(false)
    }
  }, [selectedIds, loadClients])

  // Summary stats
  const activeClients = clients.filter((c) => c.isActive)
  const totalRevenue = clients.reduce((sum, c) => sum + (c.totalRevenue || 0), 0)
  const avgRevenue = activeClients.length > 0 ? Math.round(totalRevenue / activeClients.length) : 0

  async function handleViewDetail(id: string) {
    setSelectedDetail(null)
    setDetailOpen(true)
    setDetailLoading(true)
    try {
      const detail = await fetchClientDetail(id)
      setSelectedDetail(detail)
    } catch (err) {
      toast.error('Failed to load client details')
    } finally {
      setDetailLoading(false)
    }
  }

  async function handleDeactivate(id: string) {
    setDeactivating(true)
    try {
      await deleteClient(id)
      toast.success('Client deactivated successfully')
      setDeactivateId(null)
      loadClients()
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to deactivate client')
    } finally {
      setDeactivating(false)
    }
  }

  return (
    <motion.div
      variants={containerVariants}
      animate="show"
      className="space-y-4 sm:space-y-6"
    >
      {/* Header */}
      <motion.div variants={itemVariants} className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Client Management</h1>
          <p className="text-muted-foreground">
            Manage your client companies and track business relationships
          </p>
        </div>
        <Button
          onClick={() => {
            setEditingClient(null)
            setFormOpen(true)
          }}
          className="bg-amber-500 hover:bg-amber-600 text-white"
        >
          <Plus className="mr-2 h-4 w-4" />
          Add Client
        </Button>
      </motion.div>

      {/* Stats Row */}
      <motion.div variants={itemVariants} className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <StatsCard
          icon={Building2}
          title="Active Clients"
          value={activeClients.length}
          className="border-l-4 border-l-amber-500"
        />
        <StatsCard
          icon={DollarSign}
          title="Total Client Revenue"
          value={formatGHS(totalRevenue)}
          className="border-l-4 border-l-emerald-500"
        />
        <StatsCard
          icon={TrendingUp}
          title="Avg Revenue / Client"
          value={formatGHS(avgRevenue)}
          className="border-l-4 border-l-sky-500"
        />
      </motion.div>

      {/* Bulk Action Toolbar */}
      {selectedIds.size > 0 && (
        <motion.div
          initial={{ opacity: 0, y: -10 }}
          animate={{ opacity: 1, y: 0 }}
          className="sticky top-0 z-20 rounded-lg border bg-amber-50 dark:bg-amber-950/40 border-amber-200 dark:border-amber-800 p-3 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 shadow-sm"
        >
          <div className="flex items-center gap-3">
            <Badge variant="secondary" className="bg-amber-600 text-white hover:bg-amber-600 border-0 font-medium">
              {selectedIds.size} client{selectedIds.size !== 1 ? 's' : ''} selected
            </Badge>
          </div>
          <div className="flex items-center gap-2 flex-wrap">
            <Button
              size="sm"
              variant="outline"
              className="gap-1.5 text-xs border-emerald-300 bg-white dark:bg-gray-900 hover:bg-emerald-50 dark:hover:bg-emerald-950/30"
              onClick={() => handleBulkAction('activate')}
              disabled={bulkLoading}
            >
              <CheckCircle2 className="h-3.5 w-3.5 text-emerald-600" />
              Activate
            </Button>
            <Button
              size="sm"
              variant="outline"
              className="gap-1.5 text-xs border-gray-300 bg-white dark:bg-gray-900 hover:bg-gray-50 dark:hover:bg-gray-800"
              onClick={() => handleBulkAction('deactivate')}
              disabled={bulkLoading}
            >
              <XCircle className="h-3.5 w-3.5 text-gray-500" />
              Deactivate
            </Button>
            <Button
              size="sm"
              variant="outline"
              className="gap-1.5 text-xs border-red-300 bg-white dark:bg-gray-900 hover:bg-red-50 dark:hover:bg-red-950/30 text-red-600"
              onClick={() => handleBulkAction('delete')}
              disabled={bulkLoading}
            >
              <Trash2 className="h-3.5 w-3.5" />
              Delete
            </Button>
            <Button
              size="sm"
              variant="ghost"
              className="gap-1.5 text-xs text-muted-foreground hover:text-foreground"
              onClick={clearSelection}
              disabled={bulkLoading}
            >
              <X className="h-3.5 w-3.5" />
              Clear Selection
            </Button>
          </div>
        </motion.div>
      )}

      {/* Filters */}
      <motion.div variants={itemVariants} className="flex flex-col sm:flex-row gap-3">
        <div className="relative flex-1">
          <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Search by company, contact, phone, city..."
            className="pl-8"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
        <Select value={statusFilter} onValueChange={setStatusFilter}>
          <SelectTrigger className="w-full sm:w-40">
            <SelectValue placeholder="Status" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Status</SelectItem>
            <SelectItem value="active">Active</SelectItem>
            <SelectItem value="inactive">Inactive</SelectItem>
          </SelectContent>
        </Select>
      </motion.div>

      {/* Content */}
      <motion.div variants={itemVariants}>
        {error ? (
          <div className="flex flex-col items-center justify-center py-12 text-center">
            <AlertCircle className="h-8 w-8 text-red-500 mb-3" />
            <p className="text-sm text-muted-foreground mb-3">{error}</p>
            <Button variant="outline" size="sm" onClick={loadClients}>
              <RefreshCw className="mr-2 h-3 w-3" /> Retry
            </Button>
          </div>
        ) : loading ? (
          <div className="space-y-4">
            {/* Desktop skeleton */}
            <div className="hidden md:block">
              <Card>
                <CardContent className="p-0">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Company</TableHead>
                        <TableHead>Contact</TableHead>
                        <TableHead>Location</TableHead>
                        <TableHead className="text-right">Revenue</TableHead>
                        <TableHead className="text-right">Trips</TableHead>
                        <TableHead>Last Trip</TableHead>
                        <TableHead>Status</TableHead>
                        <TableHead className="text-right">Actions</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {[1, 2, 3, 4, 5].map((i) => (
                        <TableRow key={i}>
                          <TableCell><Skeleton className="h-4 w-36" /></TableCell>
                          <TableCell><Skeleton className="h-4 w-28" /></TableCell>
                          <TableCell><Skeleton className="h-4 w-24" /></TableCell>
                          <TableCell><Skeleton className="h-4 w-20 ml-auto" /></TableCell>
                          <TableCell><Skeleton className="h-4 w-12 ml-auto" /></TableCell>
                          <TableCell><Skeleton className="h-4 w-20" /></TableCell>
                          <TableCell><Skeleton className="h-5 w-16" /></TableCell>
                          <TableCell><Skeleton className="h-4 w-24 ml-auto" /></TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </CardContent>
              </Card>
            </div>
            {/* Mobile skeleton */}
            <div className="md:hidden space-y-3">
              {[1, 2, 3].map((i) => (
                <Card key={i}>
                  <CardContent className="p-4">
                    <Skeleton className="h-5 w-40 mb-3" />
                    <div className="space-y-2">
                      <Skeleton className="h-4 w-32" />
                      <Skeleton className="h-4 w-28" />
                      <Skeleton className="h-4 w-24" />
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          </div>
        ) : clients.length === 0 ? (
          <EmptyState
            icon={Building2}
            title="No clients yet"
            description={
              search || statusFilter !== 'all'
                ? 'Try adjusting your search or filter criteria'
                : 'Get started by adding your first client company'
            }
            action={
              !search && statusFilter === 'all'
                ? { label: 'Add Client', onClick: () => setFormOpen(true) }
                : undefined
            }
          />
        ) : (
          <>
            {/* Desktop: Table view */}
            <div className="hidden md:block">
              <Card>
                <CardContent className="p-0">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead className="w-10">
                          <Checkbox
                            checked={isAllSelected ? true : isSomeSelected ? 'indeterminate' : false}
                            onCheckedChange={toggleSelectAll}
                            aria-label="Select all clients"
                          />
                        </TableHead>
                        <TableHead>Company</TableHead>
                        <TableHead>Contact</TableHead>
                        <TableHead>Location</TableHead>
                        <TableHead className="text-right">Revenue</TableHead>
                        <TableHead className="text-right">Trips</TableHead>
                        <TableHead>Last Trip</TableHead>
                        <TableHead>Status</TableHead>
                        <TableHead className="text-right">Actions</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      <AnimatePresence>
                        {clients.map((client, index) => (
                          <motion.tr
                            key={client.id}
                            ref={(el) => { rowRefs.current[client.id] = el }}
                            initial={{ opacity: 0, y: 10 }}
                            animate={{ opacity: 1, y: 0 }}
                            exit={{ opacity: 0, y: -10 }}
                            transition={{ delay: index * 0.03 }}
                            className={`border-b transition-colors hover:bg-muted/50 data-[state=selected]:bg-muted ${selectedIds.has(client.id) ? 'bg-amber-50 dark:bg-amber-950/20' : ''} ${client.id === highlightEntityId ? highlightClassName : ''}`}
                          >
                            <TableCell>
                              <Checkbox
                                checked={selectedIds.has(client.id)}
                                onCheckedChange={() => toggleSelect(client.id)}
                                aria-label={`Select ${client.companyName}`}
                              />
                            </TableCell>
                            <TableCell>
                              <div className="flex items-center gap-3">
                                <div className="h-9 w-9 rounded-lg bg-amber-100 dark:bg-amber-900/30 flex items-center justify-center shrink-0">
                                  <Building2 className="h-4 w-4 text-amber-600 dark:text-amber-400" />
                                </div>
                                <div className="min-w-0">
                                  <p className="font-semibold text-sm truncate">{client.companyName}</p>
                                  <p className="text-xs text-muted-foreground">{client.contactPerson}</p>
                                </div>
                              </div>
                            </TableCell>
                            <TableCell>
                              <div className="space-y-0.5">
                                <div className="flex items-center gap-1 text-xs">
                                  <Phone className="h-3 w-3 text-muted-foreground" />
                                  <span className="truncate max-w-[140px]">{client.phone}</span>
                                </div>
                                {client.email && (
                                  <div className="flex items-center gap-1 text-xs text-muted-foreground">
                                    <Mail className="h-3 w-3 shrink-0" />
                                    <span className="truncate max-w-[140px]">{client.email}</span>
                                  </div>
                                )}
                              </div>
                            </TableCell>
                            <TableCell>
                              <span className="text-sm">
                                {client.zones && client.zones.length > 0
                                  ? client.zones.map((z) => z.branchName ? `${z.zoneName} (${z.branchName})` : z.zoneName).join(', ')
                                  : [client.city, client.region].filter(Boolean).join(', ') || '—'}
                              </span>
                            </TableCell>
                            <TableCell className="text-right">
                              <span className="font-semibold text-sm">{formatGHS(client.totalRevenue)}</span>
                            </TableCell>
                            <TableCell className="text-right">
                              <span className="text-sm font-medium">{client.tripCount}</span>
                            </TableCell>
                            <TableCell>
                              <span className="text-xs text-muted-foreground whitespace-nowrap">
                                {timeAgo(client.lastTripDate)}
                              </span>
                            </TableCell>
                            <TableCell>
                              <Badge
                                variant="outline"
                                className={`border-transparent text-[10px] font-medium ${
                                  client.isActive
                                    ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400'
                                    : 'bg-gray-100 text-gray-500 dark:bg-gray-800 dark:text-gray-400'
                                }`}
                              >
                                {client.isActive ? 'Active' : 'Inactive'}
                              </Badge>
                            </TableCell>
                            <TableCell>
                              <div className="flex items-center justify-end gap-1">
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  className="h-7 text-xs"
                                  onClick={() => handleViewDetail(client.id)}
                                >
                                  <Eye className="mr-1 h-3 w-3" />
                                  View
                                </Button>
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  className="h-7 text-xs"
                                  onClick={() => {
                                    setEditingClient(client)
                                    setFormOpen(true)
                                  }}
                                >
                                  <Pencil className="h-3 w-3" />
                                </Button>
                                {client.isActive && (
                                  <Button
                                    variant="ghost"
                                    size="sm"
                                    className="h-7 text-xs text-red-500 hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-900/20"
                                    onClick={() => setDeactivateId(client.id)}
                                  >
                                    Deactivate
                                  </Button>
                                )}
                              </div>
                            </TableCell>
                          </motion.tr>
                        ))}
                      </AnimatePresence>
                    </TableBody>
                  </Table>
                </CardContent>
              </Card>
            </div>

            {/* Mobile: Card view */}
            <div className="md:hidden divide-y">
              <AnimatePresence>
                {clients.map((client, index) => (
                  <motion.div
                    key={client.id}
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: -10 }}
                    transition={{ delay: index * 0.03 }}
                    whileTap={{ scale: 0.99 }}
                  >
                    <Card ref={(el) => { rowRefs.current[client.id] = el }} className={`mobile-card hover:shadow-md transition-shadow ${client.id === highlightEntityId ? highlightClassName : ''}`}>
                      <CardContent className="p-4">
                        <div className="flex items-start gap-3">
                          <div className="h-10 w-10 rounded-lg bg-amber-100 dark:bg-amber-900/30 flex items-center justify-center shrink-0 mt-0.5">
                            <Building2 className="h-5 w-5 text-amber-600 dark:text-amber-400" />
                          </div>
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center justify-between gap-2">
                              <h3 className="font-semibold text-sm truncate">{client.companyName}</h3>
                              <Badge
                                variant="outline"
                                className={`border-transparent text-[10px] font-medium shrink-0 ${
                                  client.isActive
                                    ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400'
                                    : 'bg-gray-100 text-gray-500 dark:bg-gray-800 dark:text-gray-400'
                                }`}
                              >
                                {client.isActive ? 'Active' : 'Inactive'}
                              </Badge>
                            </div>
                            <p className="text-xs text-muted-foreground mt-0.5">{client.contactPerson}</p>
                          </div>
                        </div>

                        <div className="mt-3 space-y-1.5">
                          <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                            <Phone className="h-3 w-3 shrink-0" />
                            <span>{client.phone}</span>
                          </div>
                          {client.email && (
                            <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                              <Mail className="h-3 w-3 shrink-0" />
                              <span className="truncate">{client.email}</span>
                            </div>
                          )}
                          {[client.city, client.region].filter(Boolean).length > 0 && (
                            <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                              <MapPin className="h-3 w-3 shrink-0" />
                              <span>{[client.city, client.region].filter(Boolean).join(', ')}</span>
                            </div>
                          )}
                        </div>

                        <Separator className="my-3" />

                        <div className="flex items-center justify-between">
                          <div className="flex gap-4">
                            <div className="text-center">
                              <p className="text-xs text-muted-foreground">Trips</p>
                              <p className="font-semibold text-sm">{client.tripCount}</p>
                            </div>
                            <div className="text-center">
                              <p className="text-xs text-muted-foreground">Revenue</p>
                              <p className="font-semibold text-sm text-emerald-600 dark:text-emerald-400">
                                {formatGHS(client.totalRevenue)}
                              </p>
                            </div>
                            <div className="text-center">
                              <p className="text-xs text-muted-foreground">Last Trip</p>
                              <p className="text-xs font-medium">{timeAgo(client.lastTripDate)}</p>
                            </div>
                          </div>
                        </div>

                        <div className="flex gap-2 mt-3">
                          <Button
                            variant="outline"
                            size="sm"
                            className="flex-1 h-8 text-xs"
                            onClick={() => handleViewDetail(client.id)}
                          >
                            <Eye className="mr-1 h-3 w-3" />
                            Details
                          </Button>
                          <Button
                            variant="outline"
                            size="sm"
                            className="h-8 text-xs"
                            onClick={() => {
                              setEditingClient(client)
                              setFormOpen(true)
                            }}
                          >
                            <Pencil className="h-3 w-3" />
                          </Button>
                          {client.isActive && (
                            <Button
                              variant="outline"
                              size="sm"
                              className="h-8 text-xs text-red-500 hover:text-red-600"
                              onClick={() => setDeactivateId(client.id)}
                            >
                              Deactivate
                            </Button>
                          )}
                        </div>
                      </CardContent>
                    </Card>
                  </motion.div>
                ))}
              </AnimatePresence>
            </div>

            {/* Footer count */}
            <div className="text-center text-xs text-muted-foreground pt-2">
              Showing {clients.length} of {totalCount} client{totalCount !== 1 ? 's' : ''}
            </div>
          </>
        )}
      </motion.div>

      {/* Client Detail Sheet */}
      <Sheet open={detailOpen} onOpenChange={setDetailOpen}>
        <SheetContent className="w-full sm:max-w-xl">
          <VisuallyHidden>
            <SheetTitle>Client Details</SheetTitle>
          </VisuallyHidden>
          <div className="flex-1 min-h-0 overflow-y-auto">
          {detailLoading ? (
            <div className="p-6 space-y-4">
              <Skeleton className="h-7 w-48" />
              <Skeleton className="h-4 w-32" />
              <div className="space-y-3 mt-6">
                {[1, 2, 3, 4].map((i) => (
                  <Skeleton key={i} className="h-4 w-full" />
                ))}
              </div>
              <div className="grid grid-cols-2 gap-3 mt-4">
                {[1, 2, 3, 4].map((i) => (
                  <Skeleton key={i} className="h-16 w-full rounded-lg" />
                ))}
              </div>
            </div>
          ) : selectedDetail ? (
            <div className="space-y-6 pt-6">
              {/* Header */}
              <SheetHeader className="px-6">
                <div className="flex items-center gap-3">
                  <div className="h-12 w-12 rounded-xl bg-amber-100 dark:bg-amber-900/30 flex items-center justify-center">
                    <Building2 className="h-6 w-6 text-amber-600 dark:text-amber-400" />
                  </div>
                  <div className="min-w-0">
                    <SheetTitle className="text-lg truncate">{selectedDetail.companyName}</SheetTitle>
                    <SheetDescription className="text-sm">
                      Contact: {selectedDetail.contactPerson}
                    </SheetDescription>
                  </div>
                </div>
                <div className="flex items-center gap-2 mt-2">
                  <Badge
                    variant="outline"
                    className={`border-transparent font-medium ${
                      selectedDetail.isActive
                        ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400'
                        : 'bg-gray-100 text-gray-500 dark:bg-gray-800 dark:text-gray-400'
                    }`}
                  >
                    {selectedDetail.isActive ? 'Active' : 'Inactive'}
                  </Badge>
                  {selectedDetail.zones && selectedDetail.zones.length > 0
                    ? selectedDetail.zones.slice(0, 3).map((z) => (
                        <Badge key={z.id} variant="outline" className="text-xs">
                          <MapPin className="h-3 w-3 mr-0.5 shrink-0" />
                          {z.branchName ? `${z.zoneName} — ${z.branchName}` : z.zoneName}
                        </Badge>
                      ))
                    : [selectedDetail.city, selectedDetail.region].filter(Boolean).length > 0 && (
                      <Badge variant="outline" className="text-xs">
                        {[selectedDetail.city, selectedDetail.region].filter(Boolean).join(', ')}
                      </Badge>
                    )}
                </div>
              </SheetHeader>

              {/* Destination Zones */}
              {selectedDetail.zones && selectedDetail.zones.length > 0 && (
                <div className="px-6">
                  <Card>
                    <CardHeader className="pb-2 pt-4 px-4">
                      <CardTitle className="text-sm font-medium text-muted-foreground">
                        <span className="flex items-center gap-1.5">
                          <MapPin className="h-3.5 w-3.5" />
                          Destination Zones ({selectedDetail.zones.length})
                        </span>
                      </CardTitle>
                    </CardHeader>
                    <CardContent className="px-4 pb-4">
                      <div className="space-y-2">
                        {selectedDetail.zones.map((z) => (
                          <div key={z.id} className="flex items-center gap-3 p-2 rounded-lg hover:bg-muted/50 text-sm">
                            <MapPin className="h-4 w-4 text-amber-500 shrink-0" />
                            <div className="flex-1 min-w-0">
                              <div className="flex items-center gap-2">
                                <span className="font-medium">{z.zoneName}</span>
                                <span className="text-muted-foreground">·</span>
                                <span className="text-xs text-muted-foreground">{z.cityName}{z.cityRegion ? `, ${z.cityRegion}` : ''}</span>
                                {z.isPrimary && (
                                  <Badge variant="outline" className="text-[9px] border-amber-300 bg-amber-50 text-amber-700 dark:bg-amber-900/20 dark:text-amber-400 shrink-0">
                                    Primary
                                  </Badge>
                                )}
                              </div>
                              {z.branchName && (
                                <p className="text-xs text-muted-foreground">{z.branchName}</p>
                              )}
                              {(z.address || z.contactPerson) && (
                                <p className="text-xs text-muted-foreground mt-0.5">
                                  {[z.address, z.contactPerson ? `Contact: ${z.contactPerson}` : null, z.phone].filter(Boolean).join(' · ')}
                                </p>
                              )}
                            </div>
                          </div>
                        ))}
                      </div>
                    </CardContent>
                  </Card>
                </div>
              )}

              {/* Contact Info */}
              <div className="px-6">
                <Card>
                  <CardHeader className="pb-2 pt-4 px-4">
                    <CardTitle className="text-sm font-medium text-muted-foreground">Contact Information</CardTitle>
                  </CardHeader>
                  <CardContent className="px-4 pb-4 space-y-2">
                    <div className="flex items-center gap-2 text-sm">
                      <Phone className="h-4 w-4 text-muted-foreground shrink-0" />
                      <a href={`tel:${selectedDetail.phone}`} className="hover:underline text-amber-600 dark:text-amber-400">
                        {selectedDetail.phone}
                      </a>
                    </div>
                    {selectedDetail.email && (
                      <div className="flex items-center gap-2 text-sm">
                        <Mail className="h-4 w-4 text-muted-foreground shrink-0" />
                        <a href={`mailto:${selectedDetail.email}`} className="hover:underline text-amber-600 dark:text-amber-400 truncate">
                          {selectedDetail.email}
                        </a>
                      </div>
                    )}
                    {selectedDetail.address && (
                      <div className="flex items-start gap-2 text-sm">
                        <MapPin className="h-4 w-4 text-muted-foreground shrink-0 mt-0.5" />
                        <span>{selectedDetail.address}</span>
                      </div>
                    )}
                  </CardContent>
                </Card>
              </div>

              {/* Stats Grid */}
              <div className="px-6">
                <div className="grid grid-cols-2 gap-3">
                  <Card className="p-3">
                    <p className="text-xs text-muted-foreground">Total Trips</p>
                    <p className="text-lg font-bold">{selectedDetail.stats.totalTrips}</p>
                    <p className="text-xs text-muted-foreground">{selectedDetail.stats.completedTrips} completed</p>
                  </Card>
                  <Card className="p-3">
                    <p className="text-xs text-muted-foreground">Total Revenue</p>
                    <p className="text-lg font-bold text-emerald-600 dark:text-emerald-400">
                      {formatGHS(selectedDetail.stats.totalRevenue)}
                    </p>
                  </Card>
                  <Card className="p-3">
                    <p className="text-xs text-muted-foreground">Avg Trip Value</p>
                    <p className="text-lg font-bold">{formatGHS(selectedDetail.stats.avgTripValue)}</p>
                  </Card>
                  <Card className="p-3">
                    <p className="text-xs text-muted-foreground">First Trip</p>
                    <p className="text-sm font-semibold">{formatDate(selectedDetail.stats.firstTripDate)}</p>
                  </Card>
                </div>
              </div>

              {/* Notes */}
              {selectedDetail.notes && (
                <div className="px-6">
                  <Card className="p-4">
                    <p className="text-xs font-medium text-muted-foreground mb-1">Notes</p>
                    <p className="text-sm whitespace-pre-wrap">{selectedDetail.notes}</p>
                  </Card>
                </div>
              )}

              {/* Recent Trips */}
              <div className="px-6">
                <Card>
                  <CardHeader className="pb-2 pt-4 px-4">
                    <div className="flex items-center justify-between">
                      <CardTitle className="text-sm font-medium">Recent Trips</CardTitle>
                      {selectedDetail.recentTrips.length > 0 && (
                        <span className="text-xs text-muted-foreground">
                          Last {selectedDetail.recentTrips.length} of {selectedDetail.stats.totalTrips}
                        </span>
                      )}
                    </div>
                  </CardHeader>
                  <CardContent className="px-4 pb-4">
                    {selectedDetail.recentTrips.length === 0 ? (
                      <div className="text-center py-6">
                        <Package className="h-8 w-8 text-muted-foreground mx-auto mb-2" />
                        <p className="text-sm text-muted-foreground">No trips yet for this client</p>
                      </div>
                    ) : (
                      <div className="space-y-2 max-h-96 overflow-y-auto">
                        {selectedDetail.recentTrips.map((trip) => {
                          const statusInfo = (TRIP_STATUSES as Record<string, { label: string; color: string }>)[trip.status]
                          return (
                            <div
                              key={trip.id}
                              className="flex items-center gap-3 p-2.5 rounded-lg hover:bg-muted/50 transition-colors"
                            >
                              <div className="flex-1 min-w-0">
                                <div className="flex items-center gap-2">
                                  <span className="font-medium text-xs">{trip.tripNumber}</span>
                                  {statusInfo && (
                                    <Badge variant="outline" className={`border-transparent text-[9px] ${statusInfo.color}`}>
                                      {statusInfo.label}
                                    </Badge>
                                  )}
                                </div>
                                <div className="flex items-center gap-1 text-xs text-muted-foreground mt-0.5">
                                  <Route className="h-3 w-3 shrink-0" />
                                  <span className="truncate">
                                    {trip.loadingLocation} <ChevronRight className="h-3 w-3 inline" /> {trip.destination}
                                  </span>
                                </div>
                                <div className="flex items-center gap-2 text-xs text-muted-foreground mt-0.5">
                                  <span className="truncate">
                                    {trip.itemName} - {trip.quantity} {trip.unit}
                                  </span>
                                  <span className="text-muted-foreground/60">|</span>
                                  <span className="truncate">{trip.truck.plateNumber}</span>
                                </div>
                              </div>
                              <div className="text-right shrink-0">
                                {trip.totalRevenue ? (
                                  <p className="text-sm font-semibold text-emerald-600 dark:text-emerald-400">
                                    {formatGHS(trip.totalRevenue)}
                                  </p>
                                ) : (
                                  <p className="text-xs text-muted-foreground">N/A</p>
                                )}
                                <p className="text-[10px] text-muted-foreground">
                                  {formatDate(trip.departureTime)}
                                </p>
                              </div>
                            </div>
                          )
                        })}
                      </div>
                    )}
                  </CardContent>
                </Card>
              </div>

              {/* Quick Actions */}
              <div className="px-6 pb-6">
                <div className="flex gap-2">
                  <Button
                    variant="outline"
                    className="flex-1"
                    onClick={() => {
                      setDetailOpen(false)
                      setEditingClient(selectedDetail)
                      setFormOpen(true)
                    }}
                  >
                    <Pencil className="mr-2 h-4 w-4" />
                    Edit Client
                  </Button>
                </div>
              </div>
            </div>
          ) : null}
          </div>
        </SheetContent>
      </Sheet>

      {/* Form Dialog */}
      <ClientFormDialog
        open={formOpen}
        onOpenChange={(open) => {
          setFormOpen(open)
          if (!open) setEditingClient(null)
        }}
        client={editingClient}
        onCreated={loadClients}
        onUpdated={loadClients}
      />

      {/* Bulk Delete Confirmation */}
      <AlertDialog open={bulkDeleteDialogOpen} onOpenChange={setBulkDeleteDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete {selectedIds.size} client{selectedIds.size > 1 ? 's' : ''}?</AlertDialogTitle>
            <AlertDialogDescription>
              This will permanently delete {selectedIds.size} client{selectedIds.size > 1 ? 's' : ''}. Clients with active trips or unpaid invoices will be skipped. This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={bulkLoading}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleBulkDelete}
              disabled={bulkLoading}
              className="bg-red-600 hover:bg-red-700 focus:ring-red-600"
            >
              {bulkLoading ? 'Deleting...' : 'Delete'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Deactivate Confirmation */}
      <AlertDialog open={!!deactivateId} onOpenChange={() => setDeactivateId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Deactivate Client</AlertDialogTitle>
            <AlertDialogDescription>
              This will mark the client as inactive. They will no longer appear in active client lists.
              Any completed trips will remain in the system. This action can be reversed by editing the client.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deactivating}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => deactivateId && handleDeactivate(deactivateId)}
              disabled={deactivating}
              className="bg-red-500 hover:bg-red-600 text-white"
            >
              {deactivating ? 'Deactivating...' : 'Deactivate Client'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </motion.div>
  )
}
