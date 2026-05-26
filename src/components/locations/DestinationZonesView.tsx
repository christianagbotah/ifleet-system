'use client'

import * as React from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import {
  MapPin, Plus, Search, Pencil, Trash2, AlertCircle,
  RefreshCw, Loader2, DollarSign, Route,
  CheckSquare, Square, ListPlus, FileEdit, X,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Card, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { EmptyState } from '@/components/ui/empty-state'
import { Skeleton } from '@/components/ui/skeleton'
import { Label } from '@/components/ui/label'
import { Checkbox } from '@/components/ui/checkbox'
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
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
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
import { Switch } from '@/components/ui/switch'
import { apiFetch } from '@/lib/api'
import { CURRENCY_SYMBOL } from '@/lib/constants'
import { useBulkSelect } from '@/hooks/use-bulk-select'
import { toast } from 'sonner'

// ─── Types ───

interface DestinationCityOption {
  id: string
  name: string
  region: string
}

interface ZoneRate {
  id: string
  rateAmount: number
}

interface DestinationZone {
  id: string
  name: string
  destinationCityId: string
  destinationCity?: DestinationCityOption
  isActive: boolean
  ZoneRate?: ZoneRate[]
  createdAt: string
  updatedAt: string
}

interface BulkRow {
  id: string
  name: string
  destinationCityId: string
  isActive: boolean
}

const containerVariants = {
  show: { transition: { staggerChildren: 0.04 } },
}

const itemVariants = {
  show: { opacity: 1, y: 0 },
}

// ─── Component ───

export function DestinationZonesView() {
  const [search, setSearch] = React.useState('')
  const [cityFilter, setCityFilter] = React.useState<string>('all')
  const [items, setItems] = React.useState<DestinationZone[]>([])
  const [cities, setCities] = React.useState<DestinationCityOption[]>([])
  const [loading, setLoading] = React.useState(true)
  const [loadingCities, setLoadingCities] = React.useState(true)
  const [error, setError] = React.useState<string | null>(null)

  // Dialog state
  const [formOpen, setFormOpen] = React.useState(false)
  const [editingItem, setEditingItem] = React.useState<DestinationZone | null>(null)
  const [submitting, setSubmitting] = React.useState(false)

  // Delete confirmation
  const [deleteId, setDeleteId] = React.useState<string | null>(null)
  const [deleting, setDeleting] = React.useState(false)

  // Form fields
  const [formName, setFormName] = React.useState('')
  const [formCityId, setFormCityId] = React.useState('')
  const [formIsActive, setFormIsActive] = React.useState(true)

  // ── Bulk state ──
  const bulk = useBulkSelect<DestinationZone>()

  const [bulkAddOpen, setBulkAddOpen] = React.useState(false)
  const [bulkEditOpen, setBulkEditOpen] = React.useState(false)
  const [bulkDeleteOpen, setBulkDeleteOpen] = React.useState(false)
  const [bulkSubmitting, setBulkSubmitting] = React.useState(false)

  // Bulk add rows
  const [bulkRows, setBulkRows] = React.useState<BulkRow[]>([
    { id: crypto.randomUUID(), name: '', destinationCityId: cityFilter && cityFilter !== 'all' ? cityFilter : '', isActive: true },
  ])
  // Bulk edit rows (pre-filled from selected)
  const [bulkEditRows, setBulkEditRows] = React.useState<BulkRow[]>([])

  const isEditing = !!editingItem

  // ─── Fetch cities ───

  const loadCities = React.useCallback(async () => {
    setLoadingCities(true)
    try {
      const res = await apiFetch<{ data: DestinationCityOption[] }>('/api/destination-cities')
      setCities(res.data || [])
    } catch {
      // silently fail for cities
    } finally {
      setLoadingCities(false)
    }
  }, [])

  React.useEffect(() => {
    loadCities()
  }, [loadCities])

  // ─── Fetch zones ───

  const loadItems = React.useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const params = new URLSearchParams()
      if (cityFilter && cityFilter !== 'all') {
        params.set('destinationCityId', cityFilter)
      }
      const qs = params.toString()
      const res = await apiFetch<{ data: DestinationZone[] }>(`/api/destination-zones${qs ? `?${qs}` : ''}`)
      setItems(res.data || [])
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to fetch destination zones')
    } finally {
      setLoading(false)
    }
  }, [cityFilter])

  React.useEffect(() => {
    loadItems()
  }, [loadItems])

  // ─── Filtered items ───

  const filteredItems = React.useMemo(() => {
    if (!search.trim()) return items
    const q = search.toLowerCase()
    return items.filter(
      (item) =>
        item.name.toLowerCase().includes(q) ||
        item.destinationCity?.name.toLowerCase().includes(q)
    )
  }, [items, search])

  // ─── Stats ───

  const activeZones = items.filter((i) => i.isActive)

  // ─── Form handling ───

  function resetForm() {
    setFormName('')
    setFormCityId(cityFilter && cityFilter !== 'all' ? cityFilter : '')
    setFormIsActive(true)
  }

  function openCreateDialog() {
    setEditingItem(null)
    resetForm()
    setFormOpen(true)
  }

  function openEditDialog(item: DestinationZone) {
    setEditingItem(item)
    setFormName(item.name)
    setFormCityId(item.destinationCityId)
    setFormIsActive(item.isActive)
    setFormOpen(true)
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()

    if (!formName.trim()) {
      toast.error('Zone name is required')
      return
    }
    if (!formCityId) {
      toast.error('Please select a destination city')
      return
    }

    setSubmitting(true)
    try {
      const body: Record<string, unknown> = {
        name: formName.trim(),
        destinationCityId: formCityId,
        isActive: formIsActive,
      }
      if (isEditing) {
        await apiFetch(`/api/destination-zones/${editingItem!.id}`, {
          method: 'PUT',
          body: JSON.stringify(body),
        })
        toast.success('Destination zone updated successfully')
      } else {
        await apiFetch<DestinationZone>('/api/destination-zones', {
          method: 'POST',
          body: JSON.stringify(body),
        })
        toast.success('Destination zone created successfully')
      }
      setFormOpen(false)
      loadItems()
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to save destination zone')
    } finally {
      setSubmitting(false)
    }
  }

  // ─── Delete ───

  async function handleDelete() {
    if (!deleteId) return
    setDeleting(true)
    try {
      await apiFetch(`/api/destination-zones/${deleteId}`, { method: 'DELETE' })
      toast.success('Destination zone deleted successfully')
      setDeleteId(null)
      loadItems()
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to delete destination zone')
    } finally {
      setDeleting(false)
    }
  }

  // ─── Bulk operations ───

  function openBulkAdd() {
    const defaultCity = cityFilter && cityFilter !== 'all' ? cityFilter : ''
    setBulkRows([
      { id: crypto.randomUUID(), name: '', destinationCityId: defaultCity, isActive: true },
      { id: crypto.randomUUID(), name: '', destinationCityId: defaultCity, isActive: true },
      { id: crypto.randomUUID(), name: '', destinationCityId: defaultCity, isActive: true },
    ])
    setBulkAddOpen(true)
  }

  function addBulkRow() {
    const defaultCity = cityFilter && cityFilter !== 'all' ? cityFilter : ''
    setBulkRows(prev => [...prev, { id: crypto.randomUUID(), name: '', destinationCityId: defaultCity, isActive: true }])
  }

  function removeBulkRow(id: string) {
    if (bulkRows.length <= 1) return
    setBulkRows(prev => prev.filter(r => r.id !== id))
  }

  function updateBulkRow(id: string, field: keyof BulkRow, value: string | boolean) {
    setBulkRows(prev => prev.map(r => r.id === id ? { ...r, [field]: value } : r))
  }

  async function handleBulkAdd() {
    const validRows = bulkRows.filter(r => r.name.trim() && r.destinationCityId)
    if (validRows.length === 0) {
      toast.error('At least one row with name and city is required')
      return
    }
    setBulkSubmitting(true)
    try {
      const res = await apiFetch<{ success: number; failed: number; errors: Array<{ index: number; message: string }> }>('/api/destination-zones/bulk', {
        method: 'POST',
        body: JSON.stringify({ action: 'create', items: validRows.map(r => ({ name: r.name.trim(), destinationCityId: r.destinationCityId, isActive: r.isActive })) }),
      })
      if (res.failed > 0) {
        toast.warning(`${res.success} created, ${res.failed} failed`)
        res.errors.slice(0, 3).forEach(e => toast.error(`Row ${e.index + 1}: ${e.message}`))
      } else {
        toast.success(`${res.success} zones created successfully`)
      }
      setBulkAddOpen(false)
      bulk.clearSelection()
      loadItems()
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Bulk create failed')
    } finally {
      setBulkSubmitting(false)
    }
  }

  function openBulkEdit() {
    const selected = items.filter(i => bulk.selectedIds.has(i.id))
    setBulkEditRows(selected.map(i => ({
      id: i.id,
      name: i.name,
      destinationCityId: i.destinationCityId,
      isActive: i.isActive,
    })))
    setBulkEditOpen(true)
  }

  function updateBulkEditRow(id: string, field: keyof BulkRow, value: string | boolean) {
    setBulkEditRows(prev => prev.map(r => r.id === id ? { ...r, [field]: value } : r))
  }

  async function handleBulkEdit() {
    if (bulkEditRows.length === 0) return
    setBulkSubmitting(true)
    try {
      const res = await apiFetch<{ success: number; failed: number; errors: Array<{ index: number; message: string }> }>('/api/destination-zones/bulk', {
        method: 'POST',
        body: JSON.stringify({ action: 'update', items: bulkEditRows }),
      })
      if (res.failed > 0) {
        toast.warning(`${res.success} updated, ${res.failed} failed`)
        res.errors.slice(0, 3).forEach(e => toast.error(`Row ${e.index + 1}: ${e.message}`))
      } else {
        toast.success(`${res.success} zones updated successfully`)
      }
      setBulkEditOpen(false)
      bulk.clearSelection()
      loadItems()
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Bulk update failed')
    } finally {
      setBulkSubmitting(false)
    }
  }

  async function handleBulkDelete() {
    if (bulk.selectedIds.size === 0) return
    setBulkSubmitting(true)
    try {
      const res = await apiFetch<{ success: number; failed: number; errors: Array<{ id: string; message: string }> }>('/api/destination-zones/bulk', {
        method: 'POST',
        body: JSON.stringify({ action: 'delete', ids: Array.from(bulk.selectedIds) }),
      })
      if (res.failed > 0) {
        toast.warning(`${res.success} deleted, ${res.failed} failed`)
        res.errors.slice(0, 3).forEach(e => toast.error(e.message))
      } else {
        toast.success(`${res.success} zones deleted successfully`)
      }
      setBulkDeleteOpen(false)
      bulk.clearSelection()
      loadItems()
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Bulk delete failed')
    } finally {
      setBulkSubmitting(false)
    }
  }

  // ─── Get rate from zoneRates array ───

  function getZoneRate(zone: DestinationZone): number | null {
    if (zone.ZoneRate && zone.ZoneRate.length > 0) {
      return zone.ZoneRate[0].rateAmount
    }
    return null
  }

  // ─── Render ───

  return (
    <motion.div
      variants={containerVariants}
      animate="show"
      className="space-y-4 sm:space-y-6"
    >
      {/* Header */}
      <motion.div variants={itemVariants} className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Destination Zones</h1>
          <p className="text-muted-foreground">Manage destination zones and rates</p>
        </div>
        <div className="flex items-center gap-2">
          <Button
            onClick={openBulkAdd}
            variant="outline"
            size="sm"
          >
            <ListPlus className="mr-2 h-4 w-4" />
            Bulk Add
          </Button>
          <Button
            onClick={openCreateDialog}
            className="bg-amber-500 hover:bg-amber-600 text-white"
          >
            <Plus className="mr-2 h-4 w-4" />
            Add Zone
          </Button>
        </div>
      </motion.div>

      {/* Filters Row */}
      <motion.div variants={itemVariants} className="flex flex-col sm:flex-row gap-3">
        {/* City filter */}
        <div className="w-full sm:w-64">
          <Select
            value={cityFilter}
            onValueChange={(v) => { setCityFilter(v); bulk.clearSelection() }}
            disabled={loadingCities}
          >
            <SelectTrigger>
              <SelectValue placeholder={loadingCities ? 'Loading cities...' : 'Filter by city'} />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Cities</SelectItem>
              {cities.map((city) => (
                <SelectItem key={city.id} value={city.id}>
                  {city.name} ({city.region})
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        {/* Search */}
        <div className="relative flex-1">
          <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Search zones..."
            className="pl-8"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
      </motion.div>

      {/* Table / Cards */}
      <motion.div variants={itemVariants}>
        <div className="rounded-lg border bg-card">
          {error ? (
            <div className="flex flex-col items-center justify-center py-12 text-center">
              <AlertCircle className="h-8 w-8 text-red-500 mb-3" />
              <p className="text-sm text-muted-foreground mb-3">{error}</p>
              <Button variant="outline" size="sm" onClick={loadItems}>
                <RefreshCw className="mr-2 h-3 w-3" /> Retry
              </Button>
            </div>
          ) : loading ? (
            <div className="p-4 space-y-3">
              {[1, 2, 3, 4].map((i) => (
                <Skeleton key={i} className="h-12 w-full rounded" />
              ))}
            </div>
          ) : filteredItems.length === 0 ? (
            <EmptyState
              icon={MapPin}
              title="No destination zones found"
              description={
                search || (cityFilter && cityFilter !== 'all')
                  ? 'Try adjusting your filters'
                  : 'Get started by adding your first destination zone'
              }
              action={
                !search && (!cityFilter || cityFilter === 'all')
                  ? { label: 'Add Zone', onClick: openCreateDialog }
                  : undefined
              }
            />
          ) : (
            <>
              {/* Desktop Table */}
              <div className="hidden md:block overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow className="bg-muted/50 border-b">
                      <TableHead className="w-10">
                        <Checkbox
                          checked={bulk.isAllSelected(filteredItems)}
                          onCheckedChange={() => bulk.toggleAll(filteredItems)}
                        />
                      </TableHead>
                      <TableHead>Name</TableHead>
                      <TableHead>City</TableHead>
                      <TableHead className="text-right">Rate</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead className="text-right">Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    <AnimatePresence>
                      {filteredItems.map((item, index) => {
                        const rate = getZoneRate(item)
                        const selected = bulk.isSelected(item.id)
                        return (
                          <motion.tr
                            key={item.id}
                            initial={{ opacity: 0, y: 10 }}
                            animate={{ opacity: 1, y: 0 }}
                            exit={{ opacity: 0, y: -10 }}
                            transition={{ delay: index * 0.03 }}
                            className={`border-b transition-colors hover:bg-muted/50 ${selected ? 'bg-amber-50 dark:bg-amber-950/20' : ''}`}
                          >
                            <TableCell>
                              <Checkbox
                                checked={selected}
                                onCheckedChange={() => bulk.toggleOne(item.id)}
                              />
                            </TableCell>
                            <TableCell>
                              <p className={`font-semibold text-sm ${!item.isActive ? 'text-muted-foreground' : ''}`}>
                                {item.name}
                              </p>
                            </TableCell>
                            <TableCell>
                              <span className="text-sm text-muted-foreground">
                                {item.destinationCity?.name || '—'}
                              </span>
                            </TableCell>
                            <TableCell className="text-right">
                              {rate !== null ? (
                                <span className="text-sm font-semibold text-emerald-600">
                                  {CURRENCY_SYMBOL}{rate.toLocaleString()}
                                </span>
                              ) : (
                                <Badge variant="outline" className="text-xs text-amber-600 border-amber-300 dark:border-amber-700">
                                  No rate
                                </Badge>
                              )}
                            </TableCell>
                            <TableCell>
                              <Badge
                                variant="outline"
                                className={`border-transparent text-[10px] font-medium ${
                                  item.isActive
                                    ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400'
                                    : 'bg-gray-100 text-gray-500 dark:bg-gray-800 dark:text-gray-400'
                                }`}
                              >
                                {item.isActive ? 'Active' : 'Inactive'}
                              </Badge>
                            </TableCell>
                            <TableCell>
                              <div className="flex items-center justify-end gap-1">
                                <Button
                                  variant="ghost"
                                  size="icon"
                                  className="h-8 w-8"
                                  onClick={() => openEditDialog(item)}
                                  title="Edit zone"
                                >
                                  <Pencil className="h-3.5 w-3.5" />
                                </Button>
                                <Button
                                  variant="ghost"
                                  size="icon"
                                  className="h-8 w-8 text-red-500 hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-900/20"
                                  onClick={() => setDeleteId(item.id)}
                                  title="Delete zone"
                                >
                                  <Trash2 className="h-3.5 w-3.5" />
                                </Button>
                              </div>
                            </TableCell>
                          </motion.tr>
                        )
                      })}
                    </AnimatePresence>
                  </TableBody>
                </Table>
              </div>

              {/* Mobile Cards */}
              <div className="md:hidden divide-y">
                {/* Select All for mobile */}
                <div className="flex items-center gap-2 p-3 bg-muted/30 border-b">
                  <Checkbox
                    checked={bulk.isAllSelected(filteredItems)}
                    onCheckedChange={() => bulk.toggleAll(filteredItems)}
                  />
                  <span className="text-xs text-muted-foreground">
                    {bulk.selectedCount > 0 ? `${bulk.selectedCount} selected` : 'Select all'}
                  </span>
                </div>
                <AnimatePresence>
                  {filteredItems.map((item, index) => {
                    const rate = getZoneRate(item)
                    const selected = bulk.isSelected(item.id)
                    return (
                      <motion.div
                        key={item.id}
                        initial={{ opacity: 0, y: 10 }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={{ opacity: 0, y: -10 }}
                        transition={{ delay: index * 0.03 }}
                      >
                        <div className={`mobile-card p-4 space-y-3 ${selected ? 'bg-amber-50 dark:bg-amber-950/20' : ''}`}>
                          <div className="flex items-start gap-3">
                            <Checkbox
                              checked={selected}
                              onCheckedChange={() => bulk.toggleOne(item.id)}
                              className="mt-0.5"
                            />
                            <div className="min-w-0 flex-1">
                              <div className="flex items-start justify-between gap-2">
                                <div className="min-w-0 flex-1">
                                  <p className={`font-semibold text-sm truncate ${!item.isActive ? 'text-muted-foreground' : ''}`}>
                                    {item.name}
                                  </p>
                                  <p className="text-xs text-muted-foreground">
                                    {item.destinationCity?.name || '—'}
                                  </p>
                                </div>
                                <Badge
                                  variant="outline"
                                  className={`border-transparent text-[10px] font-medium shrink-0 ${
                                    item.isActive
                                      ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400'
                                      : 'bg-gray-100 text-gray-500 dark:bg-gray-800 dark:text-gray-400'
                                  }`}
                                >
                                  {item.isActive ? 'Active' : 'Inactive'}
                                </Badge>
                              </div>
                            </div>
                          </div>
                          <div className="flex items-center gap-4 text-xs text-muted-foreground pl-7">
                            <div>
                              <span className="text-xs text-muted-foreground">Rate </span>
                              {rate !== null ? (
                                <span className="font-semibold text-emerald-600">{CURRENCY_SYMBOL}{rate.toLocaleString()}</span>
                              ) : (
                                <Badge variant="outline" className="text-[10px] text-amber-600 border-amber-300 ml-1">
                                  No rate
                                </Badge>
                              )}
                            </div>
                          </div>
                          <div className="flex gap-2 pt-1 pl-7">
                            <Button
                              variant="outline"
                              size="sm"
                              className="flex-1 h-8 text-xs"
                              onClick={() => openEditDialog(item)}
                            >
                              <Pencil className="mr-1 h-3 w-3" />
                              Edit
                            </Button>
                            <Button
                              variant="outline"
                              size="sm"
                              className="h-8 text-xs text-red-500 hover:text-red-600"
                              onClick={() => setDeleteId(item.id)}
                            >
                              <Trash2 className="h-3 w-3" />
                            </Button>
                          </div>
                        </div>
                      </motion.div>
                    )
                  })}
                </AnimatePresence>
              </div>

              {/* Footer count */}
              <div className="text-center text-xs text-muted-foreground py-3">
                Showing {filteredItems.length} of {items.length} zone{items.length !== 1 ? 's' : ''} &middot; {activeZones.length} active
              </div>
            </>
          )}
        </div>
      </motion.div>

      {/* ── Bulk Action Bar ── */}
      <AnimatePresence>
        {bulk.selectedCount > 0 && (
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 20 }}
            className="fixed bottom-6 left-1/2 -translate-x-1/2 z-50 flex items-center gap-2 bg-background border shadow-xl rounded-full px-4 py-2"
          >
            <span className="text-sm font-medium text-muted-foreground whitespace-nowrap">
              {bulk.selectedCount} selected
            </span>
            <Button
              variant="outline"
              size="sm"
              className="h-8"
              onClick={openBulkEdit}
            >
              <FileEdit className="mr-1.5 h-3.5 w-3.5" />
              Edit
            </Button>
            <Button
              variant="outline"
              size="sm"
              className="h-8 text-red-600 hover:text-red-700 hover:bg-red-50 dark:hover:bg-red-900/20"
              onClick={() => setBulkDeleteOpen(true)}
            >
              <Trash2 className="mr-1.5 h-3.5 w-3.5" />
              Delete
            </Button>
            <Button
              variant="ghost"
              size="sm"
              className="h-8"
              onClick={() => bulk.clearSelection()}
            >
              <X className="h-3.5 w-3.5" />
            </Button>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Add/Edit Dialog */}
      <Dialog open={formOpen} onOpenChange={(open) => {
        if (!open) {
          setEditingItem(null)
          resetForm()
        }
        setFormOpen(open)
      }}>
        <DialogContent className="max-w-xl">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <MapPin className="h-5 w-5 text-amber-500" />
              {isEditing ? 'Edit Destination Zone' : 'Add Destination Zone'}
            </DialogTitle>
            <DialogDescription>
              {isEditing
                ? `Update details for "${editingItem?.name}"`
                : 'Enter the details for a new destination zone'}
            </DialogDescription>
          </DialogHeader>

          <form onSubmit={handleSubmit}>
            <DialogBody className="space-y-4">
              {/* Name */}
              <div className="space-y-2">
                <Label htmlFor="zone-name">
                  Zone Name <span className="text-destructive">*</span>
                </Label>
                <Input
                  id="zone-name"
                  placeholder="e.g., Industrial Area, Central Market"
                  value={formName}
                  onChange={(e) => setFormName(e.target.value)}
                />
              </div>

              {/* City */}
              <div className="space-y-2">
                <Label>
                  Destination City <span className="text-destructive">*</span>
                </Label>
                <Select value={formCityId} onValueChange={setFormCityId}>
                  <SelectTrigger>
                    <SelectValue placeholder={loadingCities ? 'Loading cities...' : 'Select destination city'} />
                  </SelectTrigger>
                  <SelectContent>
                    {cities.map((city) => (
                      <SelectItem key={city.id} value={city.id}>
                        {city.name} ({city.region})
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              {/* Active toggle */}
              <div className="flex items-center justify-between rounded-lg border p-3">
                <div className="space-y-0.5">
                  <Label className="text-sm font-medium">Active</Label>
                  <p className="text-xs text-muted-foreground">Enable this zone for new trips</p>
                </div>
                <Switch checked={formIsActive} onCheckedChange={setFormIsActive} />
              </div>
            </DialogBody>

            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setFormOpen(false)}>
                Cancel
              </Button>
              <Button type="submit" disabled={submitting}>
                {submitting ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Saving...
                  </>
                ) : isEditing ? (
                  'Update Zone'
                ) : (
                  'Create Zone'
                )}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* ── Bulk Add Dialog ── */}
      <Dialog open={bulkAddOpen} onOpenChange={(open) => { if (!open) setBulkAddOpen(false) }}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <ListPlus className="h-5 w-5 text-amber-500" />
              Bulk Add Zones
            </DialogTitle>
            <DialogDescription>
              Add multiple destination zones at once. Each row must have a name and city.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-3 flex-1 min-h-0 overflow-y-auto">
            {/* Column headers */}
            <div className="grid grid-cols-[1fr_1fr_80px_40px] gap-2 px-1">
              <span className="text-xs font-medium text-muted-foreground">Zone Name *</span>
              <span className="text-xs font-medium text-muted-foreground">City *</span>
              <span className="text-xs font-medium text-muted-foreground">Active</span>
              <span></span>
            </div>

            {/* Rows */}
            <div className="space-y-2 max-h-[50vh] overflow-y-auto">
              {bulkRows.map((row, idx) => (
                <div key={row.id} className="grid grid-cols-[1fr_1fr_80px_40px] gap-2 items-center">
                  <Input
                    placeholder={`Zone ${idx + 1}`}
                    value={row.name}
                    onChange={(e) => updateBulkRow(row.id, 'name', e.target.value)}
                  />
                  <Select
                    value={row.destinationCityId}
                    onValueChange={(v) => updateBulkRow(row.id, 'destinationCityId', v)}
                  >
                    <SelectTrigger className="h-9">
                      <SelectValue placeholder="Select city" />
                    </SelectTrigger>
                    <SelectContent>
                      {cities.map((city) => (
                        <SelectItem key={city.id} value={city.id}>
                          {city.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <div className="flex justify-center">
                    <Switch
                      checked={row.isActive}
                      onCheckedChange={(v) => updateBulkRow(row.id, 'isActive', v)}
                    />
                  </div>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-8 w-8 text-muted-foreground hover:text-red-500"
                    onClick={() => removeBulkRow(row.id)}
                    disabled={bulkRows.length <= 1}
                  >
                    <X className="h-4 w-4" />
                  </Button>
                </div>
              ))}
            </div>

            <Button variant="outline" size="sm" onClick={addBulkRow} className="w-full">
              <Plus className="mr-2 h-3.5 w-3.5" />
              Add Another Row
            </Button>
          </div>

          <DialogFooter className="shrink-0 border-t pt-3">
            <Button variant="outline" onClick={() => setBulkAddOpen(false)}>
              Cancel
            </Button>
            <Button
              onClick={handleBulkAdd}
              disabled={bulkSubmitting || bulkRows.every(r => !r.name.trim() || !r.destinationCityId)}
              className="bg-amber-500 hover:bg-amber-600 text-white"
            >
              {bulkSubmitting ? (
                <><Loader2 className="mr-2 h-4 w-4 animate-spin" /> Creating...</>
              ) : (
                `Create ${bulkRows.filter(r => r.name.trim() && r.destinationCityId).length} Zone(s)`
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── Bulk Edit Dialog ── */}
      <Dialog open={bulkEditOpen} onOpenChange={(open) => { if (!open) setBulkEditOpen(false) }}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <FileEdit className="h-5 w-5 text-amber-500" />
              Bulk Edit Zones
            </DialogTitle>
            <DialogDescription>
              Edit {bulkEditRows.length} selected zone{bulkEditRows.length !== 1 ? 's' : ''}. Modify names, cities, or status.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-3 flex-1 min-h-0 overflow-y-auto">
            <div className="grid grid-cols-[1fr_1fr_80px] gap-2 px-1">
              <span className="text-xs font-medium text-muted-foreground">Zone Name *</span>
              <span className="text-xs font-medium text-muted-foreground">City *</span>
              <span className="text-xs font-medium text-muted-foreground">Active</span>
            </div>

            <div className="space-y-2 max-h-[50vh] overflow-y-auto">
              {bulkEditRows.map((row, idx) => (
                <div key={row.id} className="grid grid-cols-[1fr_1fr_80px] gap-2 items-center">
                  <Input
                    placeholder={`Zone ${idx + 1}`}
                    value={row.name}
                    onChange={(e) => updateBulkEditRow(row.id, 'name', e.target.value)}
                  />
                  <Select
                    value={row.destinationCityId}
                    onValueChange={(v) => updateBulkEditRow(row.id, 'destinationCityId', v)}
                  >
                    <SelectTrigger className="h-9">
                      <SelectValue placeholder="Select city" />
                    </SelectTrigger>
                    <SelectContent>
                      {cities.map((city) => (
                        <SelectItem key={city.id} value={city.id}>
                          {city.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <div className="flex justify-center">
                    <Switch
                      checked={row.isActive}
                      onCheckedChange={(v) => updateBulkEditRow(row.id, 'isActive', v)}
                    />
                  </div>
                </div>
              ))}
            </div>
          </div>

          <DialogFooter className="shrink-0 border-t pt-3">
            <Button variant="outline" onClick={() => setBulkEditOpen(false)}>
              Cancel
            </Button>
            <Button onClick={handleBulkEdit} disabled={bulkSubmitting}>
              {bulkSubmitting ? (
                <><Loader2 className="mr-2 h-4 w-4 animate-spin" /> Saving...</>
              ) : (
                `Update ${bulkEditRows.length} Zone(s)`
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── Bulk Delete Confirmation ── */}
      <AlertDialog open={bulkDeleteOpen} onOpenChange={(open) => { if (!open) setBulkDeleteOpen(false) }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete {bulk.selectedCount} Zone{bulk.selectedCount !== 1 ? 's' : ''}</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to deactivate {bulk.selectedCount} selected zone{bulk.selectedCount !== 1 ? 's' : ''}?
              They will be marked as inactive and hidden from new trips.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={bulkSubmitting}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleBulkDelete}
              disabled={bulkSubmitting}
              className="bg-red-600 hover:bg-red-700 text-white"
            >
              {bulkSubmitting ? (
                <><Loader2 className="mr-2 h-4 w-4 animate-spin" /> Deleting...</>
              ) : (
                `Delete ${bulk.selectedCount} Zone${bulk.selectedCount !== 1 ? 's' : ''}`
              )}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Delete Confirmation (single) */}
      <AlertDialog open={!!deleteId} onOpenChange={(open) => { if (!open) setDeleteId(null) }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Destination Zone</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete this destination zone? This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deleting}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDelete}
              disabled={deleting}
              className="bg-red-600 hover:bg-red-700 text-white"
            >
              {deleting ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Deleting...
                </>
              ) : (
                'Delete'
              )}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </motion.div>
  )
}
