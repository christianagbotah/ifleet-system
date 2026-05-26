'use client'

import * as React from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import {
  Building2, Plus, Search, Pencil, Trash2, AlertCircle,
  RefreshCw, Phone, Mail, MapPin, FileText, Package, Loader2,
  Users,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Card, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { EmptyState } from '@/components/ui/empty-state'
import { Skeleton } from '@/components/ui/skeleton'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
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
  contactPerson?: string | null
  contactPhone?: string | null
  email?: string | null
  address?: string | null
  notes?: string | null
  isActive: boolean
  createdAt: string
  updatedAt: string
  LoadingPoint?: { id: string; name: string }[]
  Item?: { id: string; name: string; unit: string }[]
  _count?: {
    Item: number
    LoadingPoint: number
    TripItem: number
  }
}

// ─── Component ───

export function SuppliersView() {
  const [search, setSearch] = React.useState('')
  const [suppliers, setSuppliers] = React.useState<Supplier[]>([])
  const [loading, setLoading] = React.useState(true)
  const [error, setError] = React.useState<string | null>(null)

  // Dialog state
  const [formOpen, setFormOpen] = React.useState(false)
  const [editingSupplier, setEditingSupplier] = React.useState<Supplier | null>(null)
  const [submitting, setSubmitting] = React.useState(false)

  // Delete confirmation
  const [deleteId, setDeleteId] = React.useState<string | null>(null)
  const [deleting, setDeleting] = React.useState(false)

  // Form fields
  const [formName, setFormName] = React.useState('')
  const [formContactPerson, setFormContactPerson] = React.useState('')
  const [formContactPhone, setFormContactPhone] = React.useState('')
  const [formEmail, setFormEmail] = React.useState('')
  const [formAddress, setFormAddress] = React.useState('')
  const [formNotes, setFormNotes] = React.useState('')

  const isEditing = !!editingSupplier

  // ─── Fetch suppliers ───

  const loadSuppliers = React.useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const res = await apiFetch<{ data: Supplier[] }>('/api/suppliers')
      setSuppliers(res.data || [])
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to fetch suppliers')
    } finally {
      setLoading(false)
    }
  }, [])

  React.useEffect(() => {
    loadSuppliers()
  }, [loadSuppliers])

  // ─── Filtered suppliers ───

  const filteredSuppliers = React.useMemo(() => {
    if (!search.trim()) return suppliers
    const q = search.toLowerCase()
    return suppliers.filter(
      (s) =>
        s.name.toLowerCase().includes(q) ||
        (s.contactPerson && s.contactPerson.toLowerCase().includes(q)) ||
        (s.contactPhone && s.contactPhone.includes(q)) ||
        (s.email && s.email.toLowerCase().includes(q)) ||
        (s.address && s.address.toLowerCase().includes(q))
    )
  }, [suppliers, search])

  // ─── Stats ───

  const totalItems = React.useMemo(
    () => suppliers.reduce((sum, s) => sum + (s._count?.Item || 0), 0),
    [suppliers]
  )

  const totalLoadingPoints = React.useMemo(
    () => suppliers.reduce((sum, s) => sum + (s._count?.LoadingPoint || 0), 0),
    [suppliers]
  )

  // ─── Form handling ───

  function resetForm() {
    setFormName('')
    setFormContactPerson('')
    setFormContactPhone('')
    setFormEmail('')
    setFormAddress('')
    setFormNotes('')
  }

  function openCreateDialog() {
    setEditingSupplier(null)
    resetForm()
    setFormOpen(true)
  }

  function openEditDialog(supplier: Supplier) {
    setEditingSupplier(supplier)
    setFormName(supplier.name)
    setFormContactPerson(supplier.contactPerson || '')
    setFormContactPhone(supplier.contactPhone || '')
    setFormEmail(supplier.email || '')
    setFormAddress(supplier.address || '')
    setFormNotes(supplier.notes || '')
    setFormOpen(true)
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()

    if (!formName.trim()) {
      toast.error('Supplier name is required')
      return
    }

    setSubmitting(true)
    try {
      const body: Record<string, unknown> = {
        name: formName.trim(),
      }
      if (formContactPerson.trim()) body.contactPerson = formContactPerson.trim()
      if (formContactPhone.trim()) body.contactPhone = formContactPhone.trim()
      if (formEmail.trim()) body.email = formEmail.trim()
      if (formAddress.trim()) body.address = formAddress.trim()
      if (formNotes.trim()) body.notes = formNotes.trim()

      if (isEditing) {
        await apiFetch(`/api/suppliers/${editingSupplier!.id}`, {
          method: 'PUT',
          body: JSON.stringify(body),
        })
        toast.success('Supplier updated successfully')
      } else {
        await apiFetch('/api/suppliers', {
          method: 'POST',
          body: JSON.stringify(body),
        })
        toast.success('Supplier created successfully')
      }
      setFormOpen(false)
      loadSuppliers()
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to save supplier')
    } finally {
      setSubmitting(false)
    }
  }

  // ─── Delete ───

  async function handleDelete() {
    if (!deleteId) return
    setDeleting(true)
    try {
      await apiFetch(`/api/suppliers/${deleteId}`, { method: 'DELETE' })
      toast.success('Supplier deleted successfully')
      setDeleteId(null)
      loadSuppliers()
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to delete supplier')
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
          <h1 className="text-2xl font-bold tracking-tight">Suppliers</h1>
          <p className="text-muted-foreground">Manage your product suppliers and vendors</p>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <Button
            onClick={openCreateDialog}
            className="bg-amber-500 hover:bg-amber-600 text-white"
          >
            <Plus className="mr-2 h-4 w-4" />
            Add Supplier
          </Button>
        </div>
      </motion.div>

      {/* Stats Row */}
      <motion.div variants={itemVariants} className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        {loading ? (
          Array.from({ length: 3 }).map((_, i) => (
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
                  <Building2 className="h-4 w-4 text-amber-500" />
                  <span className="text-xs sm:text-sm text-muted-foreground">Total Suppliers</span>
                </div>
                <p className="text-2xl sm:text-3xl font-bold">{suppliers.length}</p>
              </CardContent>
            </Card>
            <Card className="hover:shadow-md transition-shadow">
              <CardContent className="p-4 sm:p-6">
                <div className="flex items-center gap-2 mb-2">
                  <Package className="h-4 w-4 text-emerald-500" />
                  <span className="text-xs sm:text-sm text-muted-foreground">Linked Items</span>
                </div>
                <p className="text-2xl sm:text-3xl font-bold">{totalItems}</p>
              </CardContent>
            </Card>
            <Card className="hover:shadow-md transition-shadow">
              <CardContent className="p-4 sm:p-6">
                <div className="flex items-center gap-2 mb-2">
                  <MapPin className="h-4 w-4 text-sky-500" />
                  <span className="text-xs sm:text-sm text-muted-foreground">Loading Points</span>
                </div>
                <p className="text-2xl sm:text-3xl font-bold">{totalLoadingPoints}</p>
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
            placeholder="Search by name, contact, phone, email..."
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
              <Button variant="outline" size="sm" onClick={loadSuppliers}>
                <RefreshCw className="mr-2 h-3 w-3" /> Retry
              </Button>
            </div>
          ) : loading ? (
            <div className="p-4 space-y-3">
              {[1, 2, 3, 4].map((i) => (
                <Skeleton key={i} className="h-12 w-full rounded" />
              ))}
            </div>
          ) : filteredSuppliers.length === 0 ? (
            <EmptyState
              icon={Building2}
              title="No suppliers found"
              description={
                search
                  ? 'Try adjusting your search criteria'
                  : 'Get started by adding your first supplier'
              }
              action={
                !search
                  ? { label: 'Add Supplier', onClick: openCreateDialog }
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
                      <TableHead>Supplier</TableHead>
                      <TableHead>Contact Person</TableHead>
                      <TableHead>Phone</TableHead>
                      <TableHead>Email</TableHead>
                      <TableHead className="text-center">Items</TableHead>
                      <TableHead className="text-right">Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    <AnimatePresence>
                      {filteredSuppliers.map((supplier, index) => (
                        <motion.tr
                          key={supplier.id}
                          initial={{ opacity: 0, y: 10 }}
                          animate={{ opacity: 1, y: 0 }}
                          exit={{ opacity: 0, y: -10 }}
                          transition={{ delay: index * 0.03 }}
                          className="border-b transition-colors hover:bg-muted/50"
                        >
                          <TableCell>
                            <div className="min-w-0">
                              <div className="flex items-center gap-2">
                                <Building2 className="h-4 w-4 text-amber-500 shrink-0" />
                                <p className="font-semibold text-sm truncate">
                                  {supplier.name}
                                </p>
                              </div>
                              {supplier.address && (
                                <p className="text-xs text-muted-foreground truncate ml-6 max-w-[200px]">
                                  {supplier.address}
                                </p>
                              )}
                            </div>
                          </TableCell>
                          <TableCell>
                            {supplier.contactPerson ? (
                              <div className="flex items-center gap-1.5">
                                <Users className="h-3.5 w-3.5 text-muted-foreground" />
                                <span className="text-sm">{supplier.contactPerson}</span>
                              </div>
                            ) : (
                              <span className="text-xs text-muted-foreground/50">—</span>
                            )}
                          </TableCell>
                          <TableCell>
                            {supplier.contactPhone ? (
                              <div className="flex items-center gap-1.5">
                                <Phone className="h-3.5 w-3.5 text-muted-foreground" />
                                <span className="text-sm">{supplier.contactPhone}</span>
                              </div>
                            ) : (
                              <span className="text-xs text-muted-foreground/50">—</span>
                            )}
                          </TableCell>
                          <TableCell>
                            {supplier.email ? (
                              <div className="flex items-center gap-1.5">
                                <Mail className="h-3.5 w-3.5 text-muted-foreground" />
                                <span className="text-sm text-muted-foreground">{supplier.email}</span>
                              </div>
                            ) : (
                              <span className="text-xs text-muted-foreground/50">—</span>
                            )}
                          </TableCell>
                          <TableCell className="text-center">
                            <div className="flex items-center justify-center gap-2">
                              {(supplier._count?.Item || 0) > 0 && (
                                <Badge variant="secondary" className="text-xs">
                                  {supplier._count?.Item} item{supplier._count?.Item !== 1 ? 's' : ''}
                                </Badge>
                              )}
                              {(supplier._count?.LoadingPoint || 0) > 0 && (
                                <Badge variant="outline" className="text-xs">
                                  {supplier._count?.LoadingPoint} LP{supplier._count?.LoadingPoint !== 1 ? 's' : ''}
                                </Badge>
                              )}
                              {(supplier._count?.Item || 0) === 0 && (supplier._count?.LoadingPoint || 0) === 0 && (
                                <span className="text-xs text-muted-foreground/50">None</span>
                              )}
                            </div>
                          </TableCell>
                          <TableCell>
                            <div className="flex items-center justify-end gap-1">
                              <Button
                                variant="ghost"
                                size="icon"
                                className="h-8 w-8"
                                onClick={() => openEditDialog(supplier)}
                                title="Edit supplier"
                              >
                                <Pencil className="h-3.5 w-3.5" />
                              </Button>
                              <Button
                                variant="ghost"
                                size="icon"
                                className="h-8 w-8 text-red-500 hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-900/20"
                                onClick={() => setDeleteId(supplier.id)}
                                title="Delete supplier"
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
                  {filteredSuppliers.map((supplier, index) => (
                    <motion.div
                      key={supplier.id}
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
                              <div className="flex items-center gap-2">
                                <Building2 className="h-4 w-4 text-amber-500 shrink-0" />
                                <p className="font-semibold text-sm truncate">
                                  {supplier.name}
                                </p>
                              </div>
                              {supplier.address && (
                                <p className="text-xs text-muted-foreground truncate ml-6">{supplier.address}</p>
                              )}
                            </div>
                          </div>

                          {/* Contact details */}
                          <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground ml-6">
                            {supplier.contactPerson && (
                              <div className="flex items-center gap-1">
                                <Users className="h-3 w-3" />
                                <span>{supplier.contactPerson}</span>
                              </div>
                            )}
                            {supplier.contactPhone && (
                              <div className="flex items-center gap-1">
                                <Phone className="h-3 w-3" />
                                <span>{supplier.contactPhone}</span>
                              </div>
                            )}
                            {supplier.email && (
                              <div className="flex items-center gap-1">
                                <Mail className="h-3 w-3" />
                                <span className="truncate">{supplier.email}</span>
                              </div>
                            )}
                          </div>

                          {/* Linked records */}
                          <div className="flex items-center gap-2 ml-6">
                            {(supplier._count?.Item || 0) > 0 && (
                              <Badge variant="secondary" className="text-[10px]">
                                {supplier._count?.Item} item{supplier._count?.Item !== 1 ? 's' : ''}
                              </Badge>
                            )}
                            {(supplier._count?.LoadingPoint || 0) > 0 && (
                              <Badge variant="outline" className="text-[10px]">
                                {supplier._count?.LoadingPoint} LP{supplier._count?.LoadingPoint !== 1 ? 's' : ''}
                              </Badge>
                            )}
                          </div>

                          {/* Actions */}
                          <div className="flex gap-2 pt-1">
                            <Button
                              variant="outline"
                              size="sm"
                              className="flex-1 h-8 text-xs"
                              onClick={() => openEditDialog(supplier)}
                            >
                              <Pencil className="mr-1 h-3 w-3" />
                              Edit
                            </Button>
                            <Button
                              variant="outline"
                              size="sm"
                              className="h-8 text-xs text-red-500 hover:text-red-600"
                              onClick={() => setDeleteId(supplier.id)}
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
                Showing {filteredSuppliers.length} of {suppliers.length} supplier{suppliers.length !== 1 ? 's' : ''}
              </div>
            </>
          )}
        </div>
      </motion.div>

      {/* Add/Edit Dialog */}
      <Dialog open={formOpen} onOpenChange={(open) => { setFormOpen(open); if (!open) { setEditingSupplier(null); resetForm() } }}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Building2 className="h-5 w-5 text-amber-500" />
              {isEditing ? 'Edit Supplier' : 'Add New Supplier'}
            </DialogTitle>
            <DialogDescription>
              {isEditing
                ? `Update details for "${editingSupplier?.name}"`
                : 'Enter the details for a new supplier or vendor'}
            </DialogDescription>
          </DialogHeader>

          <form onSubmit={handleSubmit}>
            <DialogBody className="space-y-4">
              {/* Name */}
              <div className="space-y-2">
                <Label htmlFor="supplier-name">
                  Name <span className="text-destructive">*</span>
                </Label>
                <Input
                  id="supplier-name"
                  placeholder="e.g., Dangote Cement, Ghacem"
                  value={formName}
                  onChange={(e) => setFormName(e.target.value)}
                />
              </div>

              {/* Contact Person & Phone - same row */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="supplier-contact">Contact Person</Label>
                  <Input
                    id="supplier-contact"
                    placeholder="John Doe"
                    value={formContactPerson}
                    onChange={(e) => setFormContactPerson(e.target.value)}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="supplier-phone">Phone</Label>
                  <Input
                    id="supplier-phone"
                    placeholder="+233 24 000 0000"
                    value={formContactPhone}
                    onChange={(e) => setFormContactPhone(e.target.value)}
                  />
                </div>
              </div>

              {/* Email */}
              <div className="space-y-2">
                <Label htmlFor="supplier-email">Email</Label>
                <Input
                  id="supplier-email"
                  type="email"
                  placeholder="supplier@example.com"
                  value={formEmail}
                  onChange={(e) => setFormEmail(e.target.value)}
                />
              </div>

              {/* Address */}
              <div className="space-y-2">
                <Label htmlFor="supplier-address">Address</Label>
                <Input
                  id="supplier-address"
                  placeholder="e.g., Spintex Road, Accra"
                  value={formAddress}
                  onChange={(e) => setFormAddress(e.target.value)}
                />
              </div>

              {/* Notes */}
              <div className="space-y-2">
                <Label htmlFor="supplier-notes">Notes</Label>
                <Textarea
                  id="supplier-notes"
                  placeholder="Any additional notes about this supplier..."
                  value={formNotes}
                  onChange={(e) => setFormNotes(e.target.value)}
                  rows={3}
                />
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
                  'Update Supplier'
                ) : (
                  'Create Supplier'
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
            <AlertDialogTitle>Delete Supplier</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to permanently delete this supplier? This action cannot be undone.
              Suppliers with linked items, loading points, or trip records cannot be deleted.
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
                'Delete Permanently'
              )}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </motion.div>
  )
}
