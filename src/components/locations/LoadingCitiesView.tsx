'use client'

import * as React from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import {
  MapPin, Plus, Search, Pencil, Trash2, AlertCircle,
  RefreshCw, Loader2, MapPinned,
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

const REGIONS = [
  'Greater Accra',
  'Ashanti',
  'Western',
  'Eastern',
  'Central',
  'Northern',
  'Volta',
  'Upper East',
  'Upper West',
  'Bono',
  'Bono East',
  'Ahafo',
  'Savannah',
  'North East',
  'Oti',
  'Western North',
] as const

const containerVariants = {
  show: { transition: { staggerChildren: 0.04 } },
}

const itemVariants = {
  show: { opacity: 1, y: 0 },
}

// ─── Types ───

interface LoadingCity {
  id: string
  name: string
  region: string
  loadingPointsCount: number
  isActive: boolean
  createdAt: string
  updatedAt: string
}

// ─── Component ───

export function LoadingCitiesView() {
  const [search, setSearch] = React.useState('')
  const [items, setItems] = React.useState<LoadingCity[]>([])
  const [loading, setLoading] = React.useState(true)
  const [error, setError] = React.useState<string | null>(null)

  // Dialog state
  const [formOpen, setFormOpen] = React.useState(false)
  const [editingItem, setEditingItem] = React.useState<LoadingCity | null>(null)
  const [submitting, setSubmitting] = React.useState(false)

  // Delete confirmation
  const [deleteId, setDeleteId] = React.useState<string | null>(null)
  const [deleting, setDeleting] = React.useState(false)

  // Form fields
  const [formName, setFormName] = React.useState('')
  const [formRegion, setFormRegion] = React.useState('')

  const isEditing = !!editingItem

  // ─── Fetch items ───

  const loadItems = React.useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const res = await apiFetch<{ data: LoadingCity[] }>('/api/loading-cities')
      setItems(res.data || [])
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to fetch loading cities')
    } finally {
      setLoading(false)
    }
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
        item.region.toLowerCase().includes(q)
    )
  }, [items, search])

  // ─── Stats ───

  const totalPoints = items.reduce((sum, i) => sum + (i.loadingPointsCount || 0), 0)

  // ─── Form handling ───

  function resetForm() {
    setFormName('')
    setFormRegion('')
  }

  function openCreateDialog() {
    setEditingItem(null)
    resetForm()
    setFormOpen(true)
  }

  function openEditDialog(item: LoadingCity) {
    setEditingItem(item)
    setFormName(item.name)
    setFormRegion(item.region)
    setFormOpen(true)
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()

    if (!formName.trim()) {
      toast.error('City name is required')
      return
    }
    if (!formRegion) {
      toast.error('Please select a region')
      return
    }

    setSubmitting(true)
    try {
      const body: Record<string, unknown> = {
        name: formName.trim(),
        region: formRegion,
      }

      if (isEditing) {
        await apiFetch(`/api/loading-cities/${editingItem!.id}`, {
          method: 'PUT',
          body: JSON.stringify(body),
        })
        toast.success('Loading city updated successfully')
      } else {
        await apiFetch('/api/loading-cities', {
          method: 'POST',
          body: JSON.stringify(body),
        })
        toast.success('Loading city created successfully')
      }
      setFormOpen(false)
      loadItems()
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to save loading city')
    } finally {
      setSubmitting(false)
    }
  }

  // ─── Delete ───

  async function handleDelete() {
    if (!deleteId) return
    setDeleting(true)
    try {
      await apiFetch(`/api/loading-cities/${deleteId}`, { method: 'DELETE' })
      toast.success('Loading city deleted successfully')
      setDeleteId(null)
      loadItems()
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to delete loading city')
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
          <h1 className="text-2xl font-bold tracking-tight">Loading Cities</h1>
          <p className="text-muted-foreground">Manage loading cities and their regions</p>
        </div>
        <Button
          onClick={openCreateDialog}
          className="bg-amber-500 hover:bg-amber-600 text-white"
        >
          <Plus className="mr-2 h-4 w-4" />
          Add City
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
                  <span className="text-xs sm:text-sm text-muted-foreground">Total Cities</span>
                </div>
                <p className="text-2xl sm:text-3xl font-bold">{items.length}</p>
              </CardContent>
            </Card>
            <Card className="hover:shadow-md transition-shadow">
              <CardContent className="p-4 sm:p-6">
                <div className="flex items-center gap-2 mb-2">
                  <MapPinned className="h-4 w-4 text-emerald-500" />
                  <span className="text-xs sm:text-sm text-muted-foreground">Total Loading Points</span>
                </div>
                <p className="text-2xl sm:text-3xl font-bold text-emerald-600">{totalPoints}</p>
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
            placeholder="Search by city or region..."
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
              title="No loading cities found"
              description={
                search
                  ? 'Try adjusting your search criteria'
                  : 'Get started by adding your first loading city'
              }
              action={
                !search
                  ? { label: 'Add City', onClick: openCreateDialog }
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
                      <TableHead>Region</TableHead>
                      <TableHead className="text-center">Loading Points</TableHead>
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
                            <Badge variant="outline" className="font-medium">
                              {item.region}
                            </Badge>
                          </TableCell>
                          <TableCell className="text-center">
                            <span className="text-sm font-medium">{item.loadingPointsCount || 0}</span>
                          </TableCell>
                          <TableCell>
                            <div className="flex items-center justify-end gap-1">
                              <Button
                                variant="ghost"
                                size="icon"
                                className="h-8 w-8"
                                onClick={() => openEditDialog(item)}
                                title="Edit city"
                              >
                                <Pencil className="h-3.5 w-3.5" />
                              </Button>
                              <Button
                                variant="ghost"
                                size="icon"
                                className="h-8 w-8 text-red-500 hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-900/20"
                                onClick={() => setDeleteId(item.id)}
                                title="Delete city"
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
                            <p className="text-xs text-muted-foreground">{item.region}</p>
                          </div>
                        </div>
                        <div className="flex items-center gap-3 text-xs text-muted-foreground">
                          <span className="font-medium">{item.loadingPointsCount || 0} loading points</span>
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
                Showing {filteredItems.length} of {items.length} cit{items.length !== 1 ? 'ies' : 'y'}
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
              <MapPin className="h-5 w-5 text-amber-500" />
              {isEditing ? 'Edit Loading City' : 'Add Loading City'}
            </DialogTitle>
            <DialogDescription>
              {isEditing
                ? `Update details for "${editingItem?.name}"`
                : 'Enter the details for a new loading city'}
            </DialogDescription>
          </DialogHeader>

          <form onSubmit={handleSubmit}>
            <DialogBody className="space-y-4">
              {/* Name */}
              <div className="space-y-2">
                <Label htmlFor="city-name">
                  City Name <span className="text-destructive">*</span>
                </Label>
                <Input
                  id="city-name"
                  placeholder="e.g., Tema, Accra, Kumasi"
                  value={formName}
                  onChange={(e) => setFormName(e.target.value)}
                />
              </div>

              {/* Region */}
              <div className="space-y-2">
                <Label>
                  Region <span className="text-destructive">*</span>
                </Label>
                <Select value={formRegion} onValueChange={setFormRegion}>
                  <SelectTrigger>
                    <SelectValue placeholder="Select region" />
                  </SelectTrigger>
                  <SelectContent>
                    {REGIONS.map((r) => (
                      <SelectItem key={r} value={r}>
                        {r}
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
                  'Update City'
                ) : (
                  'Create City'
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
            <AlertDialogTitle>Delete Loading City</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete this loading city? This action cannot be undone.
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
