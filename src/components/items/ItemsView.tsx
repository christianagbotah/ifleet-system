'use client'

import * as React from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import {
  Package, Plus, Search, Pencil, Trash2, AlertCircle,
  RefreshCw, Download, Loader2,
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
import { apiFetch } from '@/lib/api'
import { toast } from 'sonner'

// ─── Constants ───

const ITEM_UNITS = ['bags', 'tonnes', 'pallets', 'crates', 'litres'] as const

const containerVariants = {
  show: { transition: { staggerChildren: 0.04 } },
}

const itemVariants = {
  show: { opacity: 1, y: 0 },
}

// ─── Types ───

interface Supplier {
  id: string
  name: string
}

interface Item {
  id: string
  name: string
  description?: string | null
  unit: string
  isActive: boolean
  supplierId?: string | null
  supplier?: { id: string; name: string } | null
  createdAt: string
  updatedAt: string
}

// ─── Component ───

export function ItemsView() {
  const [search, setSearch] = React.useState('')
  const [items, setItems] = React.useState<Item[]>([])
  const [loading, setLoading] = React.useState(true)
  const [error, setError] = React.useState<string | null>(null)

  // Dialog state
  const [formOpen, setFormOpen] = React.useState(false)
  const [editingItem, setEditingItem] = React.useState<Item | null>(null)
  const [submitting, setSubmitting] = React.useState(false)

  // Delete confirmation
  const [deleteId, setDeleteId] = React.useState<string | null>(null)
  const [deleting, setDeleting] = React.useState(false)

  // Suppliers
  const [suppliers, setSuppliers] = React.useState<Supplier[]>([])

  // Form fields
  const [formName, setFormName] = React.useState('')
  const [formDescription, setFormDescription] = React.useState('')
  const [formUnit, setFormUnit] = React.useState('')
  const [formSupplierId, setFormSupplierId] = React.useState('')

  const isEditing = !!editingItem

  // ─── Fetch items ───

  const loadItems = React.useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const res = await apiFetch<{ data: Item[] }>('/api/items')
      setItems(res.data || [])
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to fetch items')
    } finally {
      setLoading(false)
    }
  }, [])

  // Fetch suppliers
  React.useEffect(() => {
    apiFetch<{ data: Supplier[] }>('/api/suppliers')
      .then(res => setSuppliers(res.data || []))
      .catch(() => {})
  }, [])

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
        (item.description && item.description.toLowerCase().includes(q)) ||
        item.unit.toLowerCase().includes(q)
    )
  }, [items, search])

  // ─── Stats ───

  // ─── Form handling ───

  function resetForm() {
    setFormName('')
    setFormDescription('')
    setFormUnit('')
    setFormSupplierId('')
  }

  function openCreateDialog() {
    setEditingItem(null)
    resetForm()
    setFormOpen(true)
  }

  function openEditDialog(item: Item) {
    setEditingItem(item)
    setFormName(item.name)
    setFormDescription(item.description || '')
    setFormUnit(item.unit)
    setFormSupplierId(item.supplierId || '')
    setFormOpen(true)
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()

    if (!formName.trim()) {
      toast.error('Item name is required')
      return
    }
    if (!formUnit) {
      toast.error('Please select a unit')
      return
    }

    setSubmitting(true)
    try {
      const body: Record<string, unknown> = {
        name: formName.trim(),
        unit: formUnit,
      }
      if (formDescription.trim()) {
        body.description = formDescription.trim()
      }
      if (formSupplierId) {
        body.supplierId = formSupplierId
      } else if (isEditing) {
        // Send null to clear supplier when editing
        body.supplierId = null
      }

      if (isEditing) {
        await apiFetch(`/api/items/${editingItem!.id}`, {
          method: 'PUT',
          body: JSON.stringify(body),
        })
        toast.success('Item updated successfully')
      } else {
        await apiFetch('/api/items', {
          method: 'POST',
          body: JSON.stringify(body),
        })
        toast.success('Item created successfully')
      }
      setFormOpen(false)
      loadItems()
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to save item')
    } finally {
      setSubmitting(false)
    }
  }

  // ─── Delete ───

  async function handleDelete() {
    if (!deleteId) return
    setDeleting(true)
    try {
      await apiFetch(`/api/items/${deleteId}`, { method: 'DELETE' })
      toast.success('Item deleted successfully')
      setDeleteId(null)
      loadItems()
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to delete item')
    } finally {
      setDeleting(false)
    }
  }

  // ─── Generate Report ───

  async function generateReport(format: 'pdf' | 'xlsx') {
    try {
      const body: Record<string, unknown> = {
        type: 'items',
        format,
        params: {},
      }
      const stored = localStorage.getItem('fleetpro-auth')
      const token = stored ? JSON.parse(stored)?.token : ''
      const res = await fetch('/api/reports/generate', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify(body),
      })

      if (!res.ok) {
        const errData = await res.json().catch(() => ({ error: 'Report generation failed' }))
        throw new Error(errData.error || 'Report generation failed')
      }

      const blob = await res.blob()
      const url = window.URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `items-report.${format === 'pdf' ? 'pdf' : 'xlsx'}`
      document.body.appendChild(a)
      a.click()
      document.body.removeChild(a)
      window.URL.revokeObjectURL(url)
      toast.success('Report downloaded successfully')
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to generate report')
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
          <h1 className="text-2xl font-bold tracking-tight">Items & Products</h1>
          <p className="text-muted-foreground">Manage cargo items and products</p>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <Button variant="outline" size="sm" onClick={() => generateReport('pdf')} disabled={loading}>
            <Download className="h-4 w-4 mr-1.5" />
            PDF
          </Button>
          <Button variant="outline" size="sm" onClick={() => generateReport('xlsx')} disabled={loading}>
            <Download className="h-4 w-4 mr-1.5" />
            Excel
          </Button>
          <Button
            onClick={openCreateDialog}
            className="bg-amber-500 hover:bg-amber-600 text-white"
          >
            <Plus className="mr-2 h-4 w-4" />
            Add Item
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
                  <Package className="h-4 w-4 text-amber-500" />
                  <span className="text-xs sm:text-sm text-muted-foreground">Total Items</span>
                </div>
                <p className="text-2xl sm:text-3xl font-bold">{items.length}</p>
              </CardContent>
            </Card>
          </>
        )}
      </motion.div>

      {/* Search */}
      <motion.div variants={itemVariants}>
        <div className="relative">
          <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Search by name, description, or unit..."
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
              icon={Package}
              title="No items found"
              description={
                search
                  ? 'Try adjusting your search criteria'
                  : 'Get started by adding your first cargo item'
              }
              action={
                !search
                  ? { label: 'Add Item', onClick: openCreateDialog }
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
                      <TableHead>Unit</TableHead>
                      <TableHead>Supplier</TableHead>
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
                              <div className="min-w-0">
                                <p className="font-semibold text-sm">
                                  {item.name}
                                </p>
                                {item.description && (
                                  <p className="text-xs text-muted-foreground truncate max-w-[200px]">
                                    {item.description}
                                  </p>
                                )}
                              </div>
                            </TableCell>
                            <TableCell>
                              <Badge variant="outline" className="font-medium capitalize">
                                {item.unit}
                              </Badge>
                            </TableCell>
                            <TableCell>
                              {item.supplier ? (
                                <span className="text-sm text-muted-foreground">{item.supplier.name}</span>
                              ) : (
                                <span className="text-xs text-muted-foreground/50">—</span>
                              )}
                            </TableCell>
                            <TableCell>
                              <div className="flex items-center justify-end gap-1">
                                <Button
                                  variant="ghost"
                                  size="icon"
                                  className="h-8 w-8"
                                  onClick={() => openEditDialog(item)}
                                  title="Edit item"
                                >
                                  <Pencil className="h-3.5 w-3.5" />
                                </Button>
                                <Button
                                  variant="ghost"
                                  size="icon"
                                  className="h-8 w-8 text-red-500 hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-900/20"
                                  onClick={() => setDeleteId(item.id)}
                                  title="Delete item"
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
                        <Card className="mobile-card rounded-none border-0 shadow-none">
                          <CardContent className="p-4 space-y-3">
                            {/* Header row */}
                            <div className="flex items-start justify-between gap-2">
                              <div className="min-w-0 flex-1">
                                <p className="font-semibold text-sm truncate">
                                  {item.name}
                                </p>
                                {item.description && (
                                  <p className="text-xs text-muted-foreground truncate">{item.description}</p>
                                )}
                              </div>
                            </div>

                            {/* Details row */}
                            <div className="flex items-center gap-3 text-xs text-muted-foreground">
                              <Badge variant="outline" className="font-medium capitalize text-[10px]">
                                {item.unit}
                              </Badge>
                              {item.supplier && (
                                <span className="truncate">{item.supplier.name}</span>
                              )}
                            </div>

                            {/* Actions */}
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
                          </CardContent>
                        </Card>
                      </motion.div>
                  ))}
                </AnimatePresence>
              </div>

              {/* Footer count */}
              <div className="text-center text-xs text-muted-foreground py-3">
                Showing {filteredItems.length} of {items.length} item{items.length !== 1 ? 's' : ''}
              </div>
            </>
          )}
        </div>
      </motion.div>

      {/* Add/Edit Dialog */}
      <Dialog open={formOpen} onOpenChange={(open) => { setFormOpen(open); if (!open) { setEditingItem(null); resetForm() } }}>
        <DialogContent className="max-w-xl">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Package className="h-5 w-5 text-amber-500" />
              {isEditing ? 'Edit Item' : 'Add New Item'}
            </DialogTitle>
            <DialogDescription>
              {isEditing
                ? `Update details for "${editingItem?.name}"`
                : 'Enter the details for a new cargo item or product'}
            </DialogDescription>
          </DialogHeader>

          <form onSubmit={handleSubmit}>
            <DialogBody className="space-y-4">
              {/* Name & Supplier — same row */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="item-name">
                    Name <span className="text-destructive">*</span>
                  </Label>
                  <Input
                    id="item-name"
                    placeholder="e.g., Cement, Rice, Flour"
                    value={formName}
                    onChange={(e) => setFormName(e.target.value)}
                  />
                </div>
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
              </div>

              {/* Description */}
              <div className="space-y-2">
                <Label htmlFor="item-description">Description</Label>
                <textarea
                  id="item-description"
                  className="flex min-h-[60px] w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50 resize-none"
                  placeholder="Optional description of the item..."
                  value={formDescription}
                  onChange={(e) => setFormDescription(e.target.value)}
                />
              </div>

              {/* Unit */}
              <div className="space-y-2">
                <Label>Unit <span className="text-destructive">*</span></Label>
                <Select value={formUnit} onValueChange={setFormUnit}>
                  <SelectTrigger>
                    <SelectValue placeholder="Select unit" />
                  </SelectTrigger>
                  <SelectContent>
                    {ITEM_UNITS.map((u) => (
                      <SelectItem key={u} value={u} className="capitalize">
                        {u}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
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
                  'Update Item'
                ) : (
                  'Create Item'
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
            <AlertDialogTitle>Delete Item</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete this item? This action cannot be undone.
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
