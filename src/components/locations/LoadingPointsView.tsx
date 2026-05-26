'use client'

import * as React from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import {
  MapPin, Plus, Search, Pencil, Trash2, AlertCircle,
  RefreshCw, Loader2, MapPinned, Phone, User, Building2, Store,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Card, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { EmptyState } from '@/components/ui/empty-state'
import { Skeleton } from '@/components/ui/skeleton'
import { Label } from '@/components/ui/label'
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
import { toast } from 'sonner'

// ─── Types ───

interface LoadingCityOption {
  id: string
  name: string
  region: string
}

interface SupplierOption {
  id: string
  name: string
}

interface LoadingPoint {
  id: string
  name: string
  loadingCityId: string
  loadingCity?: LoadingCityOption
  supplierId?: string | null
  supplier?: { id: string; name: string } | null
  address?: string | null
  contactPerson?: string | null
  contactPhone?: string | null
  isActive: boolean
  createdAt: string
  updatedAt: string
}

const containerVariants = {
  show: { transition: { staggerChildren: 0.04 } },
}

const itemVariants = {
  show: { opacity: 1, y: 0 },
}

// ─── Component ───

export function LoadingPointsView() {
  const [search, setSearch] = React.useState('')
  const [supplierFilter, setSupplierFilter] = React.useState<string>('all')
  const [cityFilter, setCityFilter] = React.useState<string>('all')
  const [items, setItems] = React.useState<LoadingPoint[]>([])
  const [cities, setCities] = React.useState<LoadingCityOption[]>([])
  const [loading, setLoading] = React.useState(true)
  const [loadingCities, setLoadingCities] = React.useState(true)
  const [error, setError] = React.useState<string | null>(null)

  // Dialog state
  const [formOpen, setFormOpen] = React.useState(false)
  const [editingItem, setEditingItem] = React.useState<LoadingPoint | null>(null)
  const [submitting, setSubmitting] = React.useState(false)

  // Delete confirmation
  const [deleteId, setDeleteId] = React.useState<string | null>(null)
  const [deleting, setDeleting] = React.useState(false)

  // Form fields
  const [formName, setFormName] = React.useState('')
  const [formCityId, setFormCityId] = React.useState('')
  const [formAddress, setFormAddress] = React.useState('')
  const [formContactPerson, setFormContactPerson] = React.useState('')
  const [formContactPhone, setFormContactPhone] = React.useState('')
  const [formSupplierId, setFormSupplierId] = React.useState('')
  const [formIsActive, setFormIsActive] = React.useState(true)

  // Suppliers
  const [suppliers, setSuppliers] = React.useState<SupplierOption[]>([])

  const isEditing = !!editingItem

  // ─── Fetch cities ───

  const loadCities = React.useCallback(async () => {
    setLoadingCities(true)
    try {
      const res = await apiFetch<{ data: LoadingCityOption[] }>('/api/loading-cities')
      setCities(res.data || [])
    } catch {
      // silently fail for cities
    } finally {
      setLoadingCities(false)
    }
  }, [])

  // ─── Fetch suppliers ───

  React.useEffect(() => {
    apiFetch<{ data: SupplierOption[] }>('/api/suppliers')
      .then((res) => setSuppliers(res.data || []))
      .catch(() => {})
  }, [])

  React.useEffect(() => {
    loadCities()
  }, [loadCities])

  // ─── Fetch points ───

  const loadItems = React.useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const params = new URLSearchParams()
      if (cityFilter && cityFilter !== 'all') {
        params.set('loadingCityId', cityFilter)
      }
      if (supplierFilter && supplierFilter !== 'all') {
        params.set('supplierId', supplierFilter)
      }
      const qs = params.toString()
      const res = await apiFetch<{ data: LoadingPoint[] }>(`/api/loading-points${qs ? `?${qs}` : ''}`)
      setItems(res.data || [])
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to fetch loading points')
    } finally {
      setLoading(false)
    }
  }, [cityFilter, supplierFilter])

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
        item.address?.toLowerCase().includes(q) ||
        item.contactPerson?.toLowerCase().includes(q) ||
        item.loadingCity?.name.toLowerCase().includes(q) ||
        item.supplier?.name.toLowerCase().includes(q)
    )
  }, [items, search])

  // ─── Stats ───

  // ─── Form handling ───

  function resetForm() {
    setFormName('')
    setFormCityId(cityFilter && cityFilter !== 'all' ? cityFilter : '')
    setFormAddress('')
    setFormContactPerson('')
    setFormContactPhone('')
    setFormSupplierId('')
    setFormIsActive(true)
  }

  function openCreateDialog() {
    setEditingItem(null)
    resetForm()
    setFormOpen(true)
  }

  function openEditDialog(item: LoadingPoint) {
    setEditingItem(item)
    setFormName(item.name)
    setFormCityId(item.loadingCityId)
    setFormAddress(item.address || '')
    setFormContactPerson(item.contactPerson || '')
    setFormContactPhone(item.contactPhone || '')
    setFormSupplierId(item.supplierId || '')
    setFormIsActive(item.isActive)
    setFormOpen(true)
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()

    if (!formName.trim()) {
      toast.error('Point name is required')
      return
    }
    if (!formCityId) {
      toast.error('Please select a loading city')
      return
    }

    setSubmitting(true)
    try {
      const body: Record<string, unknown> = {
        name: formName.trim(),
        loadingCityId: formCityId,
        isActive: formIsActive,
      }
      if (formAddress.trim()) body.address = formAddress.trim()
      if (formContactPerson.trim()) body.contactPerson = formContactPerson.trim()
      if (formContactPhone.trim()) body.contactPhone = formContactPhone.trim()
      if (formSupplierId) {
        body.supplierId = formSupplierId
      } else if (isEditing) {
        body.supplierId = null
      }

      if (isEditing) {
        await apiFetch(`/api/loading-points/${editingItem!.id}`, {
          method: 'PUT',
          body: JSON.stringify(body),
        })
        toast.success('Loading point updated successfully')
      } else {
        await apiFetch('/api/loading-points', {
          method: 'POST',
          body: JSON.stringify(body),
        })
        toast.success('Loading point created successfully')
      }
      setFormOpen(false)
      loadItems()
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to save loading point')
    } finally {
      setSubmitting(false)
    }
  }

  // ─── Delete ───

  async function handleDelete() {
    if (!deleteId) return
    setDeleting(true)
    try {
      await apiFetch(`/api/loading-points/${deleteId}`, { method: 'DELETE' })
      toast.success('Loading point deleted successfully')
      setDeleteId(null)
      loadItems()
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to delete loading point')
    } finally {
      setDeleting(false)
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
          <h1 className="text-2xl font-bold tracking-tight">Loading Points</h1>
          <p className="text-muted-foreground">Manage loading points within cities</p>
        </div>
        <Button
          onClick={openCreateDialog}
          className="bg-amber-500 hover:bg-amber-600 text-white"
        >
          <Plus className="mr-2 h-4 w-4" />
          Add Point
        </Button>
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
                  <MapPin className="h-4 w-4 text-amber-500" />
                  <span className="text-xs sm:text-sm text-muted-foreground">Total Points</span>
                </div>
                <p className="text-2xl sm:text-3xl font-bold">{items.length}</p>
              </CardContent>
            </Card>
            <Card className="hover:shadow-md transition-shadow">
              <CardContent className="p-4 sm:p-6">
                <div className="flex items-center gap-2 mb-2">
                  <MapPinned className="h-4 w-4 text-emerald-500" />
                  <span className="text-xs sm:text-sm text-muted-foreground">Total Points</span>
                </div>
                <p className="text-2xl sm:text-3xl font-bold text-emerald-600">{items.length}</p>
              </CardContent>
            </Card>
          </>
        )}
      </motion.div>

      {/* Filters Row */}
      <motion.div variants={itemVariants} className="flex flex-col sm:flex-row gap-3">
        {/* City filter */}
        <div className="w-full sm:w-48">
          <Select
            value={cityFilter}
            onValueChange={(v) => setCityFilter(v)}
            disabled={loadingCities}
          >
            <SelectTrigger>
              <SelectValue placeholder={loadingCities ? 'Loading...' : 'Filter by city'} />
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
        {/* Supplier filter */}
        <div className="w-full sm:w-48">
          <Select
            value={supplierFilter}
            onValueChange={(v) => setSupplierFilter(v)}
          >
            <SelectTrigger>
              <SelectValue placeholder="Filter by supplier" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Suppliers</SelectItem>
              {suppliers.map((s) => (
                <SelectItem key={s.id} value={s.id}>
                  {s.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        {/* Search */}
        <div className="relative flex-1">
          <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Search points, addresses, contacts..."
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
              title="No loading points found"
              description={
                search || (cityFilter && cityFilter !== 'all')
                  ? 'Try adjusting your filters'
                  : 'Get started by adding your first loading point'
              }
              action={
                !search && (!cityFilter || cityFilter === 'all')
                  ? { label: 'Add Point', onClick: openCreateDialog }
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
                      <TableHead>Name</TableHead>
                      <TableHead>Loading City</TableHead>
                      <TableHead>Supplier</TableHead>
                      <TableHead>Contact Person</TableHead>
                      <TableHead>Contact Phone</TableHead>
                      <TableHead className="text-right">Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    <AnimatePresence>
                      {filteredItems.map((item, index) => (
                        <motion.tr
                          key={item.id}
                          initial={{ opacity: 0, y: 10 }}
                          animate={{ opacity: 1, y: 0 }}
                          exit={{ opacity: 0, y: -10 }}
                          transition={{ delay: index * 0.03 }}
                          className="border-b transition-colors hover:bg-muted/50"
                        >
                          <TableCell>
                            <p className="font-semibold text-sm">
                              {item.name}
                            </p>
                          </TableCell>
                          <TableCell>
                            <span className="text-sm text-muted-foreground">
                              {item.loadingCity?.name || '—'}
                            </span>
                            {item.loadingCity?.region && (
                              <p className="text-xs text-muted-foreground">{item.loadingCity.region}</p>
                            )}
                          </TableCell>
                          <TableCell>
                            {item.supplier ? (
                              <div className="flex items-center gap-1.5">
                                <Store className="h-3 w-3 text-muted-foreground" />
                                <span className="text-sm">{item.supplier.name}</span>
                              </div>
                            ) : (
                              <span className="text-xs text-muted-foreground/50">—</span>
                            )}
                          </TableCell>
                          <TableCell>
                            <div className="flex items-center gap-1.5">
                              <User className="h-3 w-3 text-muted-foreground" />
                              <span className="text-sm">{item.contactPerson || '—'}</span>
                            </div>
                          </TableCell>
                          <TableCell>
                            <div className="flex items-center gap-1.5">
                              <Phone className="h-3 w-3 text-muted-foreground" />
                              <span className="text-sm">{item.contactPhone || '—'}</span>
                            </div>
                          </TableCell>
                          <TableCell>
                            <div className="flex items-center justify-end gap-1">
                              <Button
                                variant="ghost"
                                size="icon"
                                className="h-8 w-8"
                                onClick={() => openEditDialog(item)}
                                title="Edit point"
                              >
                                <Pencil className="h-3.5 w-3.5" />
                              </Button>
                              <Button
                                variant="ghost"
                                size="icon"
                                className="h-8 w-8 text-red-500 hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-900/20"
                                onClick={() => setDeleteId(item.id)}
                                title="Delete point"
                              >
                                <Trash2 className="h-3.5 w-3.5" />
                              </Button>
                            </div>
                          </TableCell>
                        </motion.tr>
                      ))}
                    </AnimatePresence>
                  </TableBody>
                </Table>
              </div>

              {/* Mobile Cards */}
              <div className="md:hidden divide-y">
                <AnimatePresence>
                  {filteredItems.map((item, index) => (
                    <motion.div
                      key={item.id}
                      initial={{ opacity: 0, y: 10 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0, y: -10 }}
                      transition={{ delay: index * 0.03 }}
                    >
                      <div className="mobile-card p-4 space-y-3">
                        <div className="flex items-start justify-between gap-2">
                          <div className="min-w-0 flex-1">
                            <p className="font-semibold text-sm truncate">
                              {item.name}
                            </p>
                            <p className="text-xs text-muted-foreground">
                              {item.loadingCity?.name || '—'}
                              {item.loadingCity?.region ? ` (${item.loadingCity.region})` : ''}
                            </p>
                          </div>
                          {item.supplier && (
                            <Badge variant="secondary" className="text-[10px] shrink-0">
                              {item.supplier.name}
                            </Badge>
                          )}
                        </div>
                        {item.address && (
                          <p className="text-xs text-muted-foreground">{item.address}</p>
                        )}
                        <div className="flex items-center gap-4 text-xs text-muted-foreground">
                          {item.contactPerson && (
                            <span className="flex items-center gap-1">
                              <User className="h-3 w-3" />
                              {item.contactPerson}
                            </span>
                          )}
                          {item.contactPhone && (
                            <span className="flex items-center gap-1">
                              <Phone className="h-3 w-3" />
                              {item.contactPhone}
                            </span>
                          )}
                        </div>
                        <div className="flex gap-2 pt-1">
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
                  ))}
                </AnimatePresence>
              </div>

              {/* Footer count */}
              <div className="text-center text-xs text-muted-foreground py-3">
                Showing {filteredItems.length} of {items.length} point{items.length !== 1 ? 's' : ''}
              </div>
            </>
          )}
        </div>
      </motion.div>

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
              {isEditing ? 'Edit Loading Point' : 'Add Loading Point'}
            </DialogTitle>
            <DialogDescription>
              {isEditing
                ? `Update details for "${editingItem?.name}"`
                : 'Enter the details for a new loading point'}
            </DialogDescription>
          </DialogHeader>

          <form onSubmit={handleSubmit}>
            <DialogBody className="space-y-4">
              {/* Loading City */}
              <div className="space-y-2">
                <Label>
                  Loading City <span className="text-destructive">*</span>
                </Label>
                <Select value={formCityId} onValueChange={setFormCityId}>
                  <SelectTrigger>
                    <SelectValue placeholder={loadingCities ? 'Loading cities...' : 'Select loading city'} />
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

              {/* Supplier */}
              <div className="space-y-2">
                <Label>Supplier</Label>
                <Select value={formSupplierId} onValueChange={(v) => setFormSupplierId(v === '__none__' ? '' : v)}>
                  <SelectTrigger>
                    <SelectValue placeholder="Select supplier (optional)" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="__none__">None</SelectItem>
                    {suppliers.map((s) => (
                      <SelectItem key={s.id} value={s.id}>
                        {s.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              {/* Name */}
              <div className="space-y-2">
                <Label htmlFor="point-name">
                  Point Name <span className="text-destructive">*</span>
                </Label>
                <Input
                  id="point-name"
                  placeholder="e.g., Tema Harbor, Accra Industrial"
                  value={formName}
                  onChange={(e) => setFormName(e.target.value)}
                />
              </div>

              {/* Address */}
              <div className="space-y-2">
                <Label htmlFor="point-address">Address</Label>
                <Input
                  id="point-address"
                  placeholder="e.g., Plot 23, Industrial Area"
                  value={formAddress}
                  onChange={(e) => setFormAddress(e.target.value)}
                />
              </div>

              {/* Contact Person & Phone */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="point-contact-person">Contact Person</Label>
                  <Input
                    id="point-contact-person"
                    placeholder="e.g., Kwame Asante"
                    value={formContactPerson}
                    onChange={(e) => setFormContactPerson(e.target.value)}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="point-contact-phone">Contact Phone</Label>
                  <Input
                    id="point-contact-phone"
                    placeholder="e.g., 024 123 4567"
                    value={formContactPhone}
                    onChange={(e) => setFormContactPhone(e.target.value)}
                  />
                </div>
              </div>

              {/* Active toggle */}
              <div className="flex items-center justify-between rounded-lg border p-3">
                <div className="space-y-0.5">
                  <Label className="text-sm font-medium">Active</Label>
                  <p className="text-xs text-muted-foreground">Enable this point for new trips</p>
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
                  'Update Point'
                ) : (
                  'Create Point'
                )}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation */}
      <AlertDialog open={!!deleteId} onOpenChange={(open) => { if (!open) setDeleteId(null) }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Loading Point</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete this loading point? This action cannot be undone.
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
