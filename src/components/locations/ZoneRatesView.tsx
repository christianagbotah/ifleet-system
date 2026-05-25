'use client'

import * as React from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import {
  MapPin, Plus, Search, Pencil, Trash2, AlertCircle,
  RefreshCw, Loader2, DollarSign, Route, Fuel,
  ListPlus, FileEdit, X,
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

interface DestinationZoneOption {
  id: string
  name: string
  destinationCityId: string
  destinationCity?: DestinationCityOption
}

interface ZoneRate {
  id: string
  destinationZoneId: string
  destinationZone?: DestinationZoneOption
  rateAmount: number
  minMileage?: number | null
  maxMileage?: number | null
  expectedFuelConsumption?: number | null
  isActive: boolean
  createdAt: string
  updatedAt: string
}

interface BulkRateRow {
  id: string
  destinationZoneId: string
  rateAmount: string
  minMileage: string
  maxMileage: string
  expectedFuelConsumption: string
  isActive: boolean
}

const containerVariants = {
  show: { transition: { staggerChildren: 0.04 } },
}

const itemVariants = {
  show: { opacity: 1, y: 0 },
}

// ─── Component ───

export function ZoneRatesView() {
  const [search, setSearch] = React.useState('')
  const [filterRegion, setFilterRegion] = React.useState<string>('all')
  const [cityFilter, setCityFilter] = React.useState<string>('all')
  const [zoneFilter, setZoneFilter] = React.useState<string>('all')
  const [items, setItems] = React.useState<ZoneRate[]>([])
  const [cities, setCities] = React.useState<DestinationCityOption[]>([])
  const [zones, setZones] = React.useState<DestinationZoneOption[]>([])
  const [loading, setLoading] = React.useState(true)
  const [loadingCities, setLoadingCities] = React.useState(true)
  const [loadingZones, setLoadingZones] = React.useState(false)
  const [error, setError] = React.useState<string | null>(null)

  // Dialog state
  const [formOpen, setFormOpen] = React.useState(false)
  const [editingItem, setEditingItem] = React.useState<ZoneRate | null>(null)
  const [submitting, setSubmitting] = React.useState(false)

  // Delete confirmation
  const [deleteId, setDeleteId] = React.useState<string | null>(null)
  const [deleting, setDeleting] = React.useState(false)

  // Form fields
  const [formRegion, setFormRegion] = React.useState('')
  const [formCityId, setFormCityId] = React.useState('')
  const [formZoneId, setFormZoneId] = React.useState('')
  const [formLoadingZones, setFormLoadingZones] = React.useState(false)
  const [formRate, setFormRate] = React.useState('')
  const [formMinMileage, setFormMinMileage] = React.useState('')
  const [formMaxMileage, setFormMaxMileage] = React.useState('')
  const [formExpectedFuel, setFormExpectedFuel] = React.useState('')

  const [formIsActive, setFormIsActive] = React.useState(true)

  // Form zone list
  const [formZones, setFormZones] = React.useState<DestinationZoneOption[]>([])

  // ── Bulk state ──
  const bulk = useBulkSelect<ZoneRate>()

  const [bulkAddOpen, setBulkAddOpen] = React.useState(false)
  const [bulkEditOpen, setBulkEditOpen] = React.useState(false)
  const [bulkDeleteOpen, setBulkDeleteOpen] = React.useState(false)
  const [bulkSubmitting, setBulkSubmitting] = React.useState(false)

  // Bulk add rows
  const [bulkAddRows, setBulkAddRows] = React.useState<BulkRateRow[]>([])
  // Bulk edit rows
  const [bulkEditRows, setBulkEditRows] = React.useState<BulkRateRow[]>([])
  // Bulk add form zones
  const [bulkAddFormZones, setBulkAddFormZones] = React.useState<DestinationZoneOption[]>([])
  const [bulkAddFormCityId, setBulkAddFormCityId] = React.useState('')
  const [bulkAddFormRegion, setBulkAddFormRegion] = React.useState('')
  const [bulkAddLoadingZones, setBulkAddLoadingZones] = React.useState(false)

  const isEditing = !!editingItem

  // ─── Fetch cities ───

  const loadCities = React.useCallback(async () => {
    setLoadingCities(true)
    try {
      const res = await apiFetch<{ data: DestinationCityOption[] }>('/api/destination-cities')
      setCities(res.data || [])
    } catch {
      // silently fail
    } finally {
      setLoadingCities(false)
    }
  }, [])

  React.useEffect(() => {
    loadCities()
  }, [loadCities])

  // ─── Fetch zones (for filter & form) ───

  const loadZones = React.useCallback(async (cityId?: string) => {
    setLoadingZones(true)
    try {
      const params = new URLSearchParams()
      if (cityId) params.set('destinationCityId', cityId)
      const res = await apiFetch<{ data: DestinationZoneOption[] }>(`/api/destination-zones${params.toString() ? `?${params.toString()}` : ''}`)
      setZones(res.data || [])
    } catch {
      setZones([])
    } finally {
      setLoadingZones(false)
    }
  }, [])

  React.useEffect(() => {
    loadZones(cityFilter && cityFilter !== 'all' ? cityFilter : undefined)
    setZoneFilter('all')
  }, [cityFilter, loadZones])

  // ─── Fetch rates ───

  const loadItems = React.useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const params = new URLSearchParams()
      if (cityFilter && cityFilter !== 'all') {
        params.set('destinationCityId', cityFilter)
      }
      if (zoneFilter && zoneFilter !== 'all') {
        params.set('destinationZoneId', zoneFilter)
      }
      const qs = params.toString()
      const res = await apiFetch<{ data: ZoneRate[] }>(`/api/zone-rates${qs ? `?${qs}` : ''}`)
      setItems(res.data || [])
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to fetch zone rates')
    } finally {
      setLoading(false)
    }
  }, [cityFilter, zoneFilter])

  React.useEffect(() => {
    loadItems()
  }, [loadItems])

  // ─── Filtered items ───

  const filteredItems = React.useMemo(() => {
    if (!search.trim()) return items
    const q = search.toLowerCase()
    return items.filter(
      (item) =>
        item.destinationZone?.name.toLowerCase().includes(q) ||
        item.destinationZone?.destinationCity?.name.toLowerCase().includes(q)
    )
  }, [items, search])

  // ─── Stats ───

  const activeRates = items.filter((i) => i.isActive)

  // Filter cities by region for the top-level filter
  const filterCities = React.useMemo(() => {
    if (!filterRegion || filterRegion === 'all') return cities
    return cities.filter((c) => c.region === filterRegion)
  }, [cities, filterRegion])

  // Derive unique regions from cities, plus filtered cities by selected region
  const regions = React.useMemo(() => {
    const set = new Set<string>()
    cities.forEach((c) => { if (c.region) set.add(c.region) })
    return Array.from(set).sort()
  }, [cities])

  const filteredCities = React.useMemo(() => {
    if (!formRegion) return cities
    return cities.filter((c) => c.region === formRegion)
  }, [cities, formRegion])

  // Bulk add: filtered cities by selected region
  const bulkAddFilteredCities = React.useMemo(() => {
    if (!bulkAddFormRegion) return cities
    return cities.filter((c) => c.region === bulkAddFormRegion)
  }, [cities, bulkAddFormRegion])

  // ─── Form handling ───

  function resetForm() {
    setFormRegion('')
    setFormCityId('')
    setFormZoneId('')
    setFormRate('')
    setFormMinMileage('')
    setFormMaxMileage('')
    setFormExpectedFuel('')
    setFormIsActive(true)
    setFormZones([])
  }

  async function loadFormZones(cityId: string) {
    setFormZoneId('')
    setFormLoadingZones(true)
    if (!cityId) {
      setFormZones([])
      setFormLoadingZones(false)
      return
    }
    try {
      const params = new URLSearchParams()
      params.set('destinationCityId', cityId)
      const res = await apiFetch<{ data: DestinationZoneOption[] }>(`/api/destination-zones?${params.toString()}`)
      setFormZones(res.data || [])
    } catch {
      setFormZones([])
    } finally {
      setFormLoadingZones(false)
    }
  }

  function openCreateDialog() {
    setEditingItem(null)
    resetForm()
    setFormOpen(true)
  }

  function openEditDialog(item: ZoneRate) {
    // Pre-populate all form fields synchronously
    setEditingItem(item)
    setFormRate(String(item.rateAmount))
    setFormMinMileage(item.minMileage ? String(item.minMileage) : '')
    setFormMaxMileage(item.maxMileage ? String(item.maxMileage) : '')
    setFormExpectedFuel(item.expectedFuelConsumption ? String(item.expectedFuelConsumption) : '')
    setFormIsActive(item.isActive)
    setFormZones([]) // Clear zones first to avoid stale data flash

    const cityId = item.destinationZone?.destinationCityId || ''
    const regionName = item.destinationZone?.destinationCity?.region || ''
    setFormRegion(regionName)
    setFormCityId(cityId)
    setFormZoneId(item.destinationZoneId)

    // Open dialog immediately
    setFormOpen(true)
  }

  // Load zones for edit dialog when it opens (only if editing with a city)
  React.useEffect(() => {
    if (formOpen && isEditing && formCityId) {
      loadFormZones(formCityId)
    }
  }, [formOpen, isEditing])

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()

    if (!formZoneId) {
      toast.error('Please select a destination zone')
      return
    }
    if (!formRate || isNaN(Number(formRate)) || Number(formRate) <= 0) {
      toast.error('Please enter a valid rate amount')
      return
    }

    setSubmitting(true)
    try {
      const body: Record<string, unknown> = {
        destinationZoneId: formZoneId,
        rateAmount: Number(formRate),
        isActive: formIsActive,
      }
      if (formMinMileage && !isNaN(Number(formMinMileage))) {
        body.minMileage = Number(formMinMileage)
      }
      if (formMaxMileage && !isNaN(Number(formMaxMileage))) {
        body.maxMileage = Number(formMaxMileage)
      }
      if (formExpectedFuel && !isNaN(Number(formExpectedFuel))) {
        body.expectedFuelConsumption = Number(formExpectedFuel)
      }


      if (isEditing) {
        await apiFetch(`/api/zone-rates/${editingItem!.id}`, {
          method: 'PUT',
          body: JSON.stringify(body),
        })
        toast.success('Zone rate updated successfully')
      } else {
        await apiFetch('/api/zone-rates', {
          method: 'POST',
          body: JSON.stringify(body),
        })
        toast.success('Zone rate created successfully')
      }
      setFormOpen(false)
      loadItems()
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to save zone rate')
    } finally {
      setSubmitting(false)
    }
  }

  // ─── Delete ───

  async function handleDelete() {
    if (!deleteId) return
    setDeleting(true)
    try {
      await apiFetch(`/api/zone-rates/${deleteId}`, { method: 'DELETE' })
      toast.success('Zone rate deleted successfully')
      setDeleteId(null)
      loadItems()
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to delete zone rate')
    } finally {
      setDeleting(false)
    }
  }

  // ─── Bulk operations ───

  async function loadBulkAddZones(cityId: string) {
    setBulkAddFormZones([])
    setBulkAddLoadingZones(true)
    if (!cityId) {
      setBulkAddLoadingZones(false)
      return
    }
    try {
      const params = new URLSearchParams()
      params.set('destinationCityId', cityId)
      const res = await apiFetch<{ data: DestinationZoneOption[] }>(`/api/destination-zones?${params.toString()}`)
      setBulkAddFormZones(res.data || [])
    } catch {
      setBulkAddFormZones([])
    } finally {
      setBulkAddLoadingZones(false)
    }
  }

  function openBulkAdd() {
    const defaultCity = cityFilter && cityFilter !== 'all' ? cityFilter : ''
    setBulkAddFormCityId(defaultCity)
    setBulkAddFormRegion('')
    setBulkAddFormZones([])
    if (defaultCity) loadBulkAddZones(defaultCity)
    setBulkAddRows([
      { id: crypto.randomUUID(), destinationZoneId: '', rateAmount: '', minMileage: '', maxMileage: '', expectedFuelConsumption: '', isActive: true },
      { id: crypto.randomUUID(), destinationZoneId: '', rateAmount: '', minMileage: '', maxMileage: '', expectedFuelConsumption: '', isActive: true },
      { id: crypto.randomUUID(), destinationZoneId: '', rateAmount: '', minMileage: '', maxMileage: '', expectedFuelConsumption: '', isActive: true },
    ])
    setBulkAddOpen(true)
  }

  function addBulkAddRow() {
    setBulkAddRows(prev => [...prev, {
      id: crypto.randomUUID(), destinationZoneId: '', rateAmount: '', minMileage: '',
      maxMileage: '', expectedFuelConsumption: '', isActive: true,
    }])
  }

  function removeBulkAddRow(id: string) {
    if (bulkAddRows.length <= 1) return
    setBulkAddRows(prev => prev.filter(r => r.id !== id))
  }

  function updateBulkAddRow(id: string, field: keyof BulkRateRow, value: string | boolean) {
    setBulkAddRows(prev => prev.map(r => r.id === id ? { ...r, [field]: value } : r))
  }

  async function handleBulkAdd() {
    const validRows = bulkAddRows.filter(r => r.destinationZoneId && r.rateAmount && !isNaN(Number(r.rateAmount)) && Number(r.rateAmount) > 0)
    if (validRows.length === 0) {
      toast.error('At least one row with zone and valid rate is required')
      return
    }
    setBulkSubmitting(true)
    try {
      const res = await apiFetch<{ success: number; failed: number; errors: Array<{ index: number; message: string }> }>('/api/zone-rates/bulk', {
        method: 'POST',
        body: JSON.stringify({
          action: 'create',
          items: validRows.map(r => ({
            destinationZoneId: r.destinationZoneId,
            rateAmount: Number(r.rateAmount),
            ...(r.minMileage ? { minMileage: Number(r.minMileage) } : {}),
            ...(r.maxMileage ? { maxMileage: Number(r.maxMileage) } : {}),
            ...(r.expectedFuelConsumption ? { expectedFuelConsumption: Number(r.expectedFuelConsumption) } : {}),
            isActive: r.isActive,
          })),
        }),
      })
      if (res.failed > 0) {
        toast.warning(`${res.success} created, ${res.failed} failed`)
        res.errors.slice(0, 3).forEach(e => toast.error(`Row ${e.index + 1}: ${e.message}`))
      } else {
        toast.success(`${res.success} rates created successfully`)
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
      destinationZoneId: i.destinationZoneId,
      rateAmount: String(i.rateAmount),
      minMileage: i.minMileage ? String(i.minMileage) : '',
      maxMileage: i.maxMileage ? String(i.maxMileage) : '',
      expectedFuelConsumption: i.expectedFuelConsumption ? String(i.expectedFuelConsumption) : '',
      isActive: i.isActive,
    })))
    setBulkEditOpen(true)
  }

  function updateBulkEditRow(id: string, field: keyof BulkRateRow, value: string | boolean) {
    setBulkEditRows(prev => prev.map(r => r.id === id ? { ...r, [field]: value } : r))
  }

  async function handleBulkEdit() {
    if (bulkEditRows.length === 0) return
    setBulkSubmitting(true)
    try {
      const res = await apiFetch<{ success: number; failed: number; errors: Array<{ index: number; message: string }> }>('/api/zone-rates/bulk', {
        method: 'POST',
        body: JSON.stringify({
          action: 'update',
          items: bulkEditRows.map(r => ({
            id: r.id,
            rateAmount: r.rateAmount ? Number(r.rateAmount) : undefined,
            ...(r.minMileage ? { minMileage: Number(r.minMileage) } : { minMileage: null }),
            ...(r.maxMileage ? { maxMileage: Number(r.maxMileage) } : { maxMileage: null }),
            ...(r.expectedFuelConsumption ? { expectedFuelConsumption: Number(r.expectedFuelConsumption) } : { expectedFuelConsumption: null }),
            isActive: r.isActive,
          })),
        }),
      })
      if (res.failed > 0) {
        toast.warning(`${res.success} updated, ${res.failed} failed`)
        res.errors.slice(0, 3).forEach(e => toast.error(`Row ${e.index + 1}: ${e.message}`))
      } else {
        toast.success(`${res.success} rates updated successfully`)
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
      const res = await apiFetch<{ success: number; failed: number; errors: Array<{ id: string; message: string }> }>('/api/zone-rates/bulk', {
        method: 'POST',
        body: JSON.stringify({ action: 'delete', ids: Array.from(bulk.selectedIds) }),
      })
      if (res.failed > 0) {
        toast.warning(`${res.success} deleted, ${res.failed} failed`)
        res.errors.slice(0, 3).forEach(e => toast.error(e.message))
      } else {
        toast.success(`${res.success} rates deleted successfully`)
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
          <h1 className="text-2xl font-bold tracking-tight">Zone Rates</h1>
          <p className="text-muted-foreground">Manage transport rates per destination zone</p>
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
            Add Rate
          </Button>
        </div>
      </motion.div>

      {/* Stats Row */}
      <motion.div variants={itemVariants} className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        {loading ? (
          Array.from({ length: 2 }).map((_, i) => (
            <Card key={i}>
              <CardContent className="p-4 sm:p-6">
                <Skeleton className="h-3 w-24 mb-3" />
                <Skeleton className="h-8 w-16" />
              </CardContent>
            </Card>
          ))
        ) : (
          <>
            <Card className="hover:shadow-md transition-shadow">
              <CardContent className="p-4 sm:p-6">
                <div className="flex items-center gap-2 mb-2">
                  <DollarSign className="h-4 w-4 text-amber-500" />
                  <span className="text-xs sm:text-sm text-muted-foreground">Total Rates</span>
                </div>
                <p className="text-2xl sm:text-3xl font-bold">{items.length}</p>
              </CardContent>
            </Card>
            <Card className="hover:shadow-md transition-shadow">
              <CardContent className="p-4 sm:p-6">
                <div className="flex items-center gap-2 mb-2">
                  <DollarSign className="h-4 w-4 text-emerald-500" />
                  <span className="text-xs sm:text-sm text-muted-foreground">Active Rates</span>
                </div>
                <p className="text-2xl sm:text-3xl font-bold text-emerald-600">{activeRates.length}</p>
              </CardContent>
            </Card>
          </>
        )}
      </motion.div>

      {/* Filters Row 1: Region + City */}
      <motion.div variants={itemVariants} className="flex flex-wrap gap-3">
        {/* Region filter */}
        <div className="flex-1 min-w-[180px]">
          <Select
            value={filterRegion}
            onValueChange={(v) => {
              setFilterRegion(v)
              setZoneFilter('all')
              setZones([])
              bulk.clearSelection()
              // Auto-select first city in region
              if (v !== 'all') {
                const firstCity = cities.find((c) => c.region === v)
                if (firstCity) setCityFilter(firstCity.id)
              } else {
                setCityFilter('all')
              }
            }}
          >
            <SelectTrigger>
              <SelectValue placeholder="Filter by region" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Regions</SelectItem>
              {regions.map((r) => (
                <SelectItem key={r} value={r}>
                  {r}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        {/* City filter */}
        <div className="flex-1 min-w-[180px]">
          <Select
            value={cityFilter}
            onValueChange={(v) => { setCityFilter(v); setZoneFilter('all'); bulk.clearSelection() }}
            disabled={loadingCities}
          >
            <SelectTrigger>
              <SelectValue placeholder={loadingCities ? 'Loading cities...' : 'Filter by city'} />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Cities</SelectItem>
              {filterCities.map((city) => (
                <SelectItem key={city.id} value={city.id}>
                  {city.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </motion.div>

      {/* Filters Row 2: Zone + Search */}
      <motion.div variants={itemVariants} className="flex flex-wrap gap-3">
        {/* Zone filter */}
        <div className="flex-1 min-w-[180px]">
          <Select
            value={zoneFilter}
            onValueChange={(v) => setZoneFilter(v)}
            disabled={!cityFilter || cityFilter === 'all' || loadingZones}
          >
            <SelectTrigger>
              <SelectValue placeholder={
                loadingZones ? 'Loading zones...' :
                !cityFilter || cityFilter === 'all' ? 'Select city first' :
                'Filter by zone'
              } />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Zones</SelectItem>
              {zones.map((zone) => (
                <SelectItem key={zone.id} value={zone.id}>
                  {zone.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="relative flex-1 min-w-[180px]">
          <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Search zones or cities..."
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
              icon={DollarSign}
              title="No zone rates found"
              description={
                search || (cityFilter && cityFilter !== 'all') || (zoneFilter && zoneFilter !== 'all')
                  ? 'Try adjusting your filters'
                  : 'Get started by adding your first zone rate'
              }
              action={
                !search && (!cityFilter || cityFilter === 'all') && (!zoneFilter || zoneFilter === 'all')
                  ? { label: 'Add Rate', onClick: openCreateDialog }
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
                      <TableHead>Destination Zone</TableHead>
                      <TableHead className="text-right">Rate Amount</TableHead>
                      <TableHead className="text-right">Min Mileage</TableHead>
                      <TableHead className="text-right">Max Mileage</TableHead>
                      <TableHead className="text-right">Expected Fuel (L)</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead className="text-right">Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    <AnimatePresence>
                      {filteredItems.map((item, index) => {
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
                              <div>
                                <p className={`font-semibold text-sm ${!item.isActive ? 'text-muted-foreground' : ''}`}>
                                  {item.destinationZone?.name || '—'}
                                </p>
                                <p className="text-xs text-muted-foreground">
                                  {item.destinationZone?.destinationCity?.name || '—'}
                                </p>
                              </div>
                            </TableCell>
                            <TableCell className="text-right">
                              <span className="text-sm font-semibold text-emerald-600">
                                {CURRENCY_SYMBOL}{item.rateAmount?.toLocaleString() ?? '—'}
                              </span>
                            </TableCell>
                            <TableCell className="text-right">
                              <span className="text-sm">
                                {item.minMileage != null ? item.minMileage.toLocaleString() : '—'}
                              </span>
                            </TableCell>
                            <TableCell className="text-right">
                              <span className="text-sm">
                                {item.maxMileage != null ? item.maxMileage.toLocaleString() : '—'}
                              </span>
                            </TableCell>
                            <TableCell className="text-right">
                              <span className="text-sm">
                                {item.expectedFuelConsumption != null ? item.expectedFuelConsumption.toLocaleString() : '—'}
                              </span>
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
                                  title="Edit rate"
                                >
                                  <Pencil className="h-3.5 w-3.5" />
                                </Button>
                                <Button
                                  variant="ghost"
                                  size="icon"
                                  className="h-8 w-8 text-red-500 hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-900/20"
                                  onClick={() => setDeleteId(item.id)}
                                  title="Delete rate"
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
                                    {item.destinationZone?.name || '—'}
                                  </p>
                                  <p className="text-xs text-muted-foreground">
                                    {item.destinationZone?.destinationCity?.name || '—'}
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
                              <span className="font-semibold text-emerald-600">{CURRENCY_SYMBOL}{item.rateAmount?.toLocaleString() ?? '—'}</span>
                            </div>
                            {item.minMileage != null && (
                              <span className="flex items-center gap-1">
                                <Route className="h-3 w-3" />
                                {item.minMileage}+ km
                              </span>
                            )}
                            {item.expectedFuelConsumption != null && (
                              <span className="flex items-center gap-1">
                                <Fuel className="h-3 w-3" />
                                {item.expectedFuelConsumption} L
                              </span>
                            )}
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
                Showing {filteredItems.length} of {items.length} rate{items.length !== 1 ? 's' : ''} &middot; {activeRates.length} active
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
          setFormZones([])
        }
        setFormOpen(open)
      }}>
        <DialogContent className="md:max-w-2xl">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <DollarSign className="h-5 w-5 text-amber-500" />
              {isEditing ? 'Edit Zone Rate' : 'Add Zone Rate'}
            </DialogTitle>
            <DialogDescription>
              {isEditing
                ? `Update rate for "${editingItem?.destinationZone?.name}"`
                : 'Set a transport rate for a destination zone'}
            </DialogDescription>
          </DialogHeader>

          <form onSubmit={handleSubmit} className="flex-1 flex flex-col min-h-0">
            <DialogBody className="space-y-4">
              {/* Region — only for create */}
              {!isEditing && regions.length > 0 && (
                <div className="space-y-2">
                  <Label>Region</Label>
                  <Select
                    value={formRegion}
                    onValueChange={(v) => {
                      setFormRegion(v)
                      setFormCityId('')
                      setFormZoneId('')
                      setFormZones([])
                    }}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Filter by region (optional)" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">All Regions</SelectItem>
                      {regions.map((r) => (
                        <SelectItem key={r} value={r}>
                          {r}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              )}

              {/* Destination City */}
              <div className="space-y-2">
                <Label>
                  Destination City <span className="text-destructive">*</span>
                </Label>
                {isEditing ? (
                  <Input
                    value={editingItem?.destinationZone?.destinationCity?.name || ''}
                    disabled
                    className="bg-muted"
                  />
                ) : (
                  <Select
                    value={formCityId}
                    onValueChange={(v) => {
                      setFormCityId(v)
                      setFormZoneId('')
                      loadFormZones(v)
                    }}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder={loadingCities ? 'Loading cities...' : 'Select destination city'} />
                    </SelectTrigger>
                    <SelectContent>
                      {filteredCities.map((city) => (
                        <SelectItem key={city.id} value={city.id}>
                          {city.name}{city.region ? ` (${city.region})` : ''}
                        </SelectItem>
                      ))}
                      {filteredCities.length === 0 && (
                        <div className="px-2 py-1.5 text-sm text-muted-foreground">
                          {formRegion ? 'No cities in this region' : 'No cities available'}
                        </div>
                      )}
                    </SelectContent>
                  </Select>
                )}
              </div>

              {/* Row 1: Zone | Rate Amount | Active toggle */}
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                <div className="space-y-2">
                  <Label>
                    Destination Zone <span className="text-destructive">*</span>
                  </Label>
                  {isEditing ? (
                    <Input
                      value={editingItem?.destinationZone?.name || ''}
                      disabled
                      className="bg-muted"
                    />
                  ) : (
                    <Select
                      value={formZoneId}
                      onValueChange={setFormZoneId}
                      disabled={!formCityId || formLoadingZones}
                    >
                      <SelectTrigger>
                        <SelectValue placeholder={
                          formLoadingZones ? 'Loading zones...' :
                          !formCityId ? 'Select a city first' :
                          formZones.length === 0 ? 'No zones found for this city' :
                          'Select destination zone'
                        } />
                      </SelectTrigger>
                      <SelectContent>
                        {formZones.map((zone) => (
                          <SelectItem key={zone.id} value={zone.id}>
                            {zone.name}
                          </SelectItem>
                        ))}
                        {formZones.length === 0 && !formLoadingZones && formCityId && (
                          <div className="px-2 py-1.5 text-sm text-muted-foreground">
                            No zones found for this city
                          </div>
                        )}
                      </SelectContent>
                    </Select>
                  )}
                </div>

                <div className="space-y-2">
                  <Label htmlFor="rate-amount">
                    Rate Amount ({CURRENCY_SYMBOL}) <span className="text-destructive">*</span>
                  </Label>
                  <Input
                    id="rate-amount"
                    type="number"
                    placeholder="e.g., 2500"
                    min="0"
                    step="0.01"
                    value={formRate}
                    onChange={(e) => setFormRate(e.target.value)}
                  />
                </div>

                {/* Active toggle — bordered box */}
                <div className="flex items-end pb-0.5 sm:pb-1">
                  <div className="flex items-center justify-between rounded-lg border p-3 w-full">
                    <div>
                      <Label className="text-sm font-medium">Active</Label>
                      <p className="text-xs text-muted-foreground">Enable rate</p>
                    </div>
                    <Switch checked={formIsActive} onCheckedChange={setFormIsActive} />
                  </div>
                </div>
              </div>

              {/* Row 2: Min Mileage | Max Mileage | Fuel Consumption */}
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="rate-min-mileage">Min Mileage (km)</Label>
                  <Input
                    id="rate-min-mileage"
                    type="number"
                    placeholder="e.g., 0"
                    min="0"
                    value={formMinMileage}
                    onChange={(e) => setFormMinMileage(e.target.value)}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="rate-max-mileage">Max Mileage (km)</Label>
                  <Input
                    id="rate-max-mileage"
                    type="number"
                    placeholder="e.g., 500"
                    min="0"
                    value={formMaxMileage}
                    onChange={(e) => setFormMaxMileage(e.target.value)}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="rate-fuel">Fuel Consumption (L)</Label>
                  <Input
                    id="rate-fuel"
                    type="number"
                    placeholder="e.g., 180"
                    min="0"
                    step="0.1"
                    value={formExpectedFuel}
                    onChange={(e) => setFormExpectedFuel(e.target.value)}
                  />
                </div>
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
                  'Update Rate'
                ) : (
                  'Create Rate'
                )}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* ── Bulk Add Dialog ── */}
      <Dialog open={bulkAddOpen} onOpenChange={(open) => { if (!open) setBulkAddOpen(false) }}>
        <DialogContent className="md:max-w-4xl">
          <DialogHeader className="shrink-0">
            <DialogTitle className="flex items-center gap-2">
              <ListPlus className="h-5 w-5 text-amber-500" />
              Bulk Add Rates
            </DialogTitle>
            <DialogDescription>
              Add multiple zone rates at once. Select a region, then a city to populate available zones.
            </DialogDescription>
          </DialogHeader>

          <DialogBody className="space-y-4 flex-1 min-h-0">
            {/* Region & City selector for bulk add */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              {/* Region filter */}
              <div className="space-y-2">
                <Label>Region</Label>
                <Select
                  value={bulkAddFormRegion}
                  onValueChange={(v) => {
                    setBulkAddFormRegion(v)
                    setBulkAddFormCityId('')
                    setBulkAddFormZones([])
                    setBulkAddRows(prev => prev.map(r => ({ ...r, destinationZoneId: '' })))
                  }}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="All Regions" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All Regions</SelectItem>
                    {regions.map((r) => (
                      <SelectItem key={r} value={r}>
                        {r}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              {/* City filter */}
              <div className="space-y-2">
                <Label>
                  Destination City <span className="text-destructive">*</span>
                </Label>
                <Select
                  value={bulkAddFormCityId}
                  onValueChange={(v) => {
                    setBulkAddFormCityId(v)
                    setBulkAddRows(prev => prev.map(r => ({ ...r, destinationZoneId: '' })))
                    loadBulkAddZones(v)
                  }}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Select a city" />
                  </SelectTrigger>
                  <SelectContent>
                    {bulkAddFilteredCities.map((city) => (
                      <SelectItem key={city.id} value={city.id}>
                        {city.name}{city.region ? ` (${city.region})` : ''}
                      </SelectItem>
                    ))}
                    {bulkAddFilteredCities.length === 0 && (
                      <div className="px-2 py-1.5 text-sm text-muted-foreground">
                        {bulkAddFormRegion ? 'No cities in this region' : 'No cities available'}
                      </div>
                    )}
                  </SelectContent>
                </Select>
              </div>
            </div>

            {/* Rows */}
            <div className="space-y-3">
              {bulkAddRows.map((row, idx) => (
                <div key={row.id} className="rounded-lg border p-3 space-y-2 bg-muted/30">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-medium text-muted-foreground">Rate #{idx + 1}</span>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-6 w-6 text-muted-foreground hover:text-red-500"
                      onClick={() => removeBulkAddRow(row.id)}
                      disabled={bulkAddRows.length <= 1}
                    >
                      <X className="h-3.5 w-3.5" />
                    </Button>
                  </div>

                  {/* Row 1: Zone | Rate | Active (3-col on sm+) */}
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                    <div className="space-y-1">
                      <span className="text-[11px] text-muted-foreground">Zone *</span>
                      <Select
                        value={row.destinationZoneId}
                        onValueChange={(v) => updateBulkAddRow(row.id, 'destinationZoneId', v)}
                        disabled={!bulkAddFormCityId || bulkAddLoadingZones}
                      >
                        <SelectTrigger className="h-9">
                          <SelectValue placeholder={
                            bulkAddLoadingZones ? 'Loading zones...' :
                            !bulkAddFormCityId ? 'Select city first' :
                            bulkAddFormZones.length === 0 ? 'No zones for this city' :
                            'Select zone'
                          } />
                        </SelectTrigger>
                        <SelectContent>
                          {bulkAddFormZones.map((zone) => (
                            <SelectItem key={zone.id} value={zone.id}>
                              {zone.name}
                            </SelectItem>
                          ))}
                          {bulkAddFormZones.length === 0 && !bulkAddLoadingZones && bulkAddFormCityId && (
                            <div className="px-2 py-1.5 text-sm text-muted-foreground">
                              No zones found for this city
                            </div>
                          )}
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="space-y-1">
                      <span className="text-[11px] text-muted-foreground">Rate ({CURRENCY_SYMBOL}) *</span>
                      <Input
                        type="number"
                        placeholder="e.g., 2500"
                        min="0"
                        step="0.01"
                        className="h-9"
                        value={row.rateAmount}
                        onChange={(e) => updateBulkAddRow(row.id, 'rateAmount', e.target.value)}
                      />
                    </div>
                    <div className="flex items-end gap-2 pb-0.5">
                      <Switch
                        checked={row.isActive}
                        onCheckedChange={(v) => updateBulkAddRow(row.id, 'isActive', v)}
                      />
                      <span className="text-[11px] text-muted-foreground">{row.isActive ? 'Active' : 'Inactive'}</span>
                    </div>
                  </div>

                  {/* Row 2: Min Km | Max Km | Fuel (3-col on sm+) */}
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                    <div className="space-y-1">
                      <span className="text-[11px] text-muted-foreground">Min Km</span>
                      <Input
                        type="number"
                        placeholder="0"
                        min="0"
                        className="h-9"
                        value={row.minMileage}
                        onChange={(e) => updateBulkAddRow(row.id, 'minMileage', e.target.value)}
                      />
                    </div>
                    <div className="space-y-1">
                      <span className="text-[11px] text-muted-foreground">Max Km</span>
                      <Input
                        type="number"
                        placeholder="0"
                        min="0"
                        className="h-9"
                        value={row.maxMileage}
                        onChange={(e) => updateBulkAddRow(row.id, 'maxMileage', e.target.value)}
                      />
                    </div>
                    <div className="space-y-1">
                      <span className="text-[11px] text-muted-foreground">Fuel (L)</span>
                      <Input
                        type="number"
                        placeholder="0"
                        min="0"
                        step="0.1"
                        className="h-9"
                        value={row.expectedFuelConsumption}
                        onChange={(e) => updateBulkAddRow(row.id, 'expectedFuelConsumption', e.target.value)}
                      />
                    </div>
                  </div>
                </div>
              ))}
            </div>

            <Button variant="outline" size="sm" onClick={addBulkAddRow} className="w-full">
              <Plus className="mr-2 h-3.5 w-3.5" />
              Add Another Row
            </Button>
          </DialogBody>

          <DialogFooter className="shrink-0 border-t pt-3">
            <Button variant="outline" onClick={() => setBulkAddOpen(false)}>
              Cancel
            </Button>
            <Button
              onClick={handleBulkAdd}
              disabled={bulkSubmitting || bulkAddRows.every(r => !r.destinationZoneId || !r.rateAmount)}
              className="bg-amber-500 hover:bg-amber-600 text-white"
            >
              {bulkSubmitting ? (
                <><Loader2 className="mr-2 h-4 w-4 animate-spin" /> Creating...</>
              ) : (
                `Create ${bulkAddRows.filter(r => r.destinationZoneId && r.rateAmount && !isNaN(Number(r.rateAmount)) && Number(r.rateAmount) > 0).length} Rate(s)`
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── Bulk Edit Dialog ── */}
      <Dialog open={bulkEditOpen} onOpenChange={(open) => { if (!open) setBulkEditOpen(false) }}>
        <DialogContent className="md:max-w-5xl">
          <DialogHeader className="shrink-0">
            <DialogTitle className="flex items-center gap-2">
              <FileEdit className="h-5 w-5 text-amber-500" />
              Bulk Edit Rates
            </DialogTitle>
            <DialogDescription>
              Edit {bulkEditRows.length} selected rate{bulkEditRows.length !== 1 ? 's' : ''}. Modify rate amounts, mileage, fuel, or status.
            </DialogDescription>
          </DialogHeader>

          <DialogBody className="space-y-3 flex-1 min-h-0">
            {bulkEditRows.map((row) => {
              const original = items.find(i => i.id === row.id)
              const regionName = original?.destinationZone?.destinationCity?.region || ''
              const cityName = original?.destinationZone?.destinationCity?.name || ''
              return (
                <div key={row.id} className="rounded-lg border p-3 space-y-2 bg-muted/30">
                  <div className="flex items-center justify-between gap-2">
                    <div className="flex items-center gap-1.5 min-w-0 flex-1">
                      <span className="text-sm font-medium truncate">{original?.destinationZone?.name || '—'}</span>
                      {regionName && (
                        <Badge variant="outline" className="text-[10px] bg-amber-50 text-amber-700 dark:bg-amber-900/20 dark:text-amber-400 shrink-0">
                          {regionName}
                        </Badge>
                      )}
                      {cityName && (
                        <Badge
                          variant="outline"
                          className={`text-[10px] shrink-0 ${row.isActive ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400' : 'bg-gray-100 text-gray-500 dark:bg-gray-800 dark:text-gray-400'}`}
                        >
                          {cityName}
                        </Badge>
                      )}
                    </div>
                  </div>

                  {/* All fields in one row on lg+, 2 rows on sm (3-col) */}
                  <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-2">
                    <div className="space-y-1">
                      <span className="text-[11px] text-muted-foreground">Rate ({CURRENCY_SYMBOL})</span>
                      <Input
                        type="number"
                        placeholder="0"
                        min="0"
                        step="0.01"
                        className="h-9"
                        value={row.rateAmount}
                        onChange={(e) => updateBulkEditRow(row.id, 'rateAmount', e.target.value)}
                      />
                    </div>
                    <div className="space-y-1">
                      <span className="text-[11px] text-muted-foreground">Min Km</span>
                      <Input
                        type="number"
                        placeholder="0"
                        min="0"
                        className="h-9"
                        value={row.minMileage}
                        onChange={(e) => updateBulkEditRow(row.id, 'minMileage', e.target.value)}
                      />
                    </div>
                    <div className="space-y-1">
                      <span className="text-[11px] text-muted-foreground">Max Km</span>
                      <Input
                        type="number"
                        placeholder="0"
                        min="0"
                        className="h-9"
                        value={row.maxMileage}
                        onChange={(e) => updateBulkEditRow(row.id, 'maxMileage', e.target.value)}
                      />
                    </div>
                    <div className="space-y-1">
                      <span className="text-[11px] text-muted-foreground">Fuel (L)</span>
                      <Input
                        type="number"
                        placeholder="0"
                        min="0"
                        step="0.1"
                        className="h-9"
                        value={row.expectedFuelConsumption}
                        onChange={(e) => updateBulkEditRow(row.id, 'expectedFuelConsumption', e.target.value)}
                      />
                    </div>
                    <div className="flex items-end pb-0.5">
                      <div className="flex items-center gap-2">
                        <Switch
                          checked={row.isActive}
                          onCheckedChange={(v) => updateBulkEditRow(row.id, 'isActive', v)}
                        />
                        <span className="text-[11px] text-muted-foreground">{row.isActive ? 'Active' : 'Inactive'}</span>
                      </div>
                    </div>
                  </div>
                </div>
              )
            })}
          </DialogBody>

          <DialogFooter className="shrink-0 border-t pt-3">
            <Button variant="outline" onClick={() => setBulkEditOpen(false)}>
              Cancel
            </Button>
            <Button onClick={handleBulkEdit} disabled={bulkSubmitting}>
              {bulkSubmitting ? (
                <><Loader2 className="mr-2 h-4 w-4 animate-spin" /> Saving...</>
              ) : (
                `Update ${bulkEditRows.length} Rate(s)`
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── Bulk Delete Confirmation ── */}
      <AlertDialog open={bulkDeleteOpen} onOpenChange={(open) => { if (!open) setBulkDeleteOpen(false) }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete {bulk.selectedCount} Rate{bulk.selectedCount !== 1 ? 's' : ''}</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to permanently delete {bulk.selectedCount} selected rate{bulk.selectedCount !== 1 ? 's' : ''}?
              This action cannot be undone.
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
                `Delete ${bulk.selectedCount} Rate${bulk.selectedCount !== 1 ? 's' : ''}`
              )}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Delete Confirmation (single) */}
      <AlertDialog open={!!deleteId} onOpenChange={(open) => { if (!open) setDeleteId(null) }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Zone Rate</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete this zone rate? This action cannot be undone.
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
