'use client'

import * as React from 'react'
import { motion } from 'framer-motion'
import {
  Plus, Search, Package, AlertTriangle, RefreshCw, Loader2,
  PackageCheck, PackageOpen, DollarSign, Filter, ChevronDown,
  Trash2, Pencil, X, Layers, Warehouse as WarehouseIcon, Edit3,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Skeleton } from '@/components/ui/skeleton'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { EmptyState } from '@/components/ui/empty-state'
import { StatsCard } from '@/components/ui/stats-card'
import {
  Dialog, DialogBody, DialogContent, DialogHeader,
  DialogTitle, DialogDescription, DialogFooter,
} from '@/components/ui/dialog'
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from '@/components/ui/alert-dialog'
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select'
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table'
import {
  Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription,
} from '@/components/ui/sheet'
import { CURRENCY_SYMBOL } from '@/lib/constants'
import {
  apiFetch, fetchWarehouseItems, fetchWarehouseAnalytics,
  createWarehouseItem, updateWarehouseItem, deleteWarehouseItem,
  type WarehouseItem, type WarehouseAnalytics,
} from '@/lib/api'
import { useAuthStore } from '@/lib/store/auth'
import { toast } from 'sonner'

// ============ Constants ============

const ITEM_STATUS: Record<string, { label: string; color: string }> = {
  in_stock: { label: 'In Stock', color: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400' },
  low_stock: { label: 'Low Stock', color: 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400' },
  out_of_stock: { label: 'Out of Stock', color: 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400' },
  discontinued: { label: 'Discontinued', color: 'bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-400' },
  expired: { label: 'Expired', color: 'bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-400' },
}

const CATEGORIES = [
  { value: 'spare_parts', label: 'Spare Parts' },
  { value: 'fuel_additives', label: 'Fuel Additives' },
  { value: 'lubricants', label: 'Lubricants' },
  { value: 'tools', label: 'Tools' },
  { value: 'safety_equipment', label: 'Safety Equipment' },
  { value: 'tyres', label: 'Tyres' },
  { value: 'other', label: 'Other' },
]

const WAREHOUSES = [
  { value: 'Tema Main', label: 'Tema Main' },
  { value: 'Kumasi Depot', label: 'Kumasi Depot' },
  { value: 'Accra Warehouse', label: 'Accra Warehouse' },
  { value: 'Takoradi Hub', label: 'Takoradi Hub' },
  { value: 'Tema Depot', label: 'Tema Depot' },
]

const UNITS = [
  { value: 'pieces', label: 'Pieces' },
  { value: 'liters', label: 'Liters' },
  { value: 'kilograms', label: 'Kilograms' },
  { value: 'boxes', label: 'Boxes' },
  { value: 'sets', label: 'Sets' },
  { value: 'meters', label: 'Meters' },
  { value: 'rolls', label: 'Rolls' },
  { value: 'pairs', label: 'Pairs' },
]

// ============ Animation ============

const containerVariants = { show: { transition: { staggerChildren: 0.04 } } }
const itemVariants = { show: { opacity: 1, y: 0 }, hidden: { opacity: 0, y: 12 } }

// ============ Helpers ============

function cn(...classes: (string | undefined | false | null)[]) {
  return classes.filter(Boolean).join(' ')
}

function formatCurrency(amount: number): string {
  return `${CURRENCY_SYMBOL}${Math.abs(amount).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
}

function getCategoryLabel(value: string): string {
  return CATEGORIES.find(c => c.value === value)?.label || value
}

function getWarehouseLabel(value: string): string {
  return WAREHOUSES.find(w => w.value === value)?.label || value
}

function getUnitLabel(value: string): string {
  return UNITS.find(u => u.value === value)?.label || value
}

// ==================== ITEM FORM DIALOG ====================

function ItemFormDialog({
  open, onOpenChange, onSaved, editItem,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  onSaved: () => void
  editItem?: WarehouseItem | null
}) {
  const [submitting, setSubmitting] = React.useState(false)
  const [form, setForm] = React.useState({
    name: '', category: 'spare_parts', sku: '', quantity: '', minStock: '5',
    unitPrice: '', unit: 'pieces', warehouse: 'Tema Main', location: '',
    supplier: '', expiryDate: '', notes: '',
  })

  const isEditing = !!editItem

  React.useEffect(() => {
    if (open) {
      if (editItem) {
        setForm({
          name: editItem.name,
          category: editItem.category,
          sku: editItem.sku || '',
          quantity: String(editItem.quantity),
          minStock: String(editItem.minStock),
          unitPrice: String(editItem.unitPrice),
          unit: editItem.unit || 'pieces',
          warehouse: editItem.warehouse || 'Tema Main',
          location: editItem.location || '',
          supplier: editItem.supplier || '',
          expiryDate: editItem.expiryDate ? editItem.expiryDate.split('T')[0] : '',
          notes: editItem.notes || '',
        })
      } else {
        setForm({
          name: '', category: 'spare_parts', sku: '', quantity: '', minStock: '5',
          unitPrice: '', unit: 'pieces', warehouse: 'Tema Main', location: '',
          supplier: '', expiryDate: '', notes: '',
        })
      }
    }
  }, [open, editItem])

  const update = (key: string, value: string) => setForm(f => ({ ...f, [key]: value }))

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!form.name || !form.quantity || !form.unitPrice) {
      toast.error('Name, quantity, and unit price are required')
      return
    }
    setSubmitting(true)
    try {
      const payload: Record<string, unknown> = {
        name: form.name,
        category: form.category,
        sku: form.sku || undefined,
        quantity: parseInt(form.quantity),
        minStock: parseInt(form.minStock) || 5,
        unitPrice: parseFloat(form.unitPrice),
        unit: form.unit,
        warehouse: form.warehouse,
        location: form.location || undefined,
        supplier: form.supplier || undefined,
        expiryDate: form.expiryDate || undefined,
        notes: form.notes || undefined,
      }

      if (isEditing && editItem) {
        await updateWarehouseItem(editItem.id, payload)
        toast.success('Item updated successfully')
      } else {
        await createWarehouseItem(payload as Parameters<typeof createWarehouseItem>[0])
        toast.success('Item added to inventory')
      }
      onOpenChange(false)
      onSaved()
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to save item')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Package className="h-5 w-5 text-orange-500" />
            {isEditing ? 'Edit Item' : 'Add Warehouse Item'}
          </DialogTitle>
          <DialogDescription>
            {isEditing ? 'Update item details in the inventory' : 'Add a new item to the warehouse inventory'}
          </DialogDescription>
        </DialogHeader>
        <DialogBody>
          <form id="warehouse-form" onSubmit={handleSubmit} className="space-y-4">
            {/* Name & SKU */}
            <div className="grid grid-cols-3 gap-3">
              <div className="col-span-2 space-y-1.5">
                <Label className="text-sm font-medium">Name *</Label>
                <Input placeholder="e.g. Engine Oil Filter" value={form.name} onChange={e => update('name', e.target.value)} />
              </div>
              <div className="space-y-1.5">
                <Label className="text-sm font-medium">SKU</Label>
                <Input placeholder="Auto-generated" value={form.sku} onChange={e => update('sku', e.target.value)} className="font-mono text-xs" />
              </div>
            </div>

            {/* Category & Warehouse */}
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label className="text-sm font-medium">Category *</Label>
                <Select value={form.category} onValueChange={v => update('category', v)}>
                  <SelectTrigger><SelectValue placeholder="Select..." /></SelectTrigger>
                  <SelectContent>
                    {CATEGORIES.map(c => <SelectItem key={c.value} value={c.value}>{c.label}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label className="text-sm font-medium">Warehouse</Label>
                <Select value={form.warehouse} onValueChange={v => update('warehouse', v)}>
                  <SelectTrigger><SelectValue placeholder="Select..." /></SelectTrigger>
                  <SelectContent>
                    {WAREHOUSES.map(w => <SelectItem key={w.value} value={w.value}>{w.label}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
            </div>

            {/* Quantity & Min Stock */}
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label className="text-sm font-medium">Quantity *</Label>
                <Input type="number" placeholder="0" min="0" value={form.quantity} onChange={e => update('quantity', e.target.value)} />
              </div>
              <div className="space-y-1.5">
                <Label className="text-sm font-medium">Min. Stock Level</Label>
                <Input type="number" placeholder="5" min="0" value={form.minStock} onChange={e => update('minStock', e.target.value)} />
              </div>
            </div>

            {/* Unit Price & Unit */}
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label className="text-sm font-medium">Unit Price (GHS) *</Label>
                <div className="relative">
                  <span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm text-muted-foreground">{CURRENCY_SYMBOL}</span>
                  <Input type="number" placeholder="0.00" step="0.01" className="pl-8" value={form.unitPrice} onChange={e => update('unitPrice', e.target.value)} />
                </div>
              </div>
              <div className="space-y-1.5">
                <Label className="text-sm font-medium">Unit</Label>
                <Select value={form.unit} onValueChange={v => update('unit', v)}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {UNITS.map(u => <SelectItem key={u.value} value={u.value}>{u.label}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
            </div>

            {/* Location & Supplier */}
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label className="text-sm font-medium">Location (Bin/Shelf)</Label>
                <Input placeholder="e.g. A3-12" value={form.location} onChange={e => update('location', e.target.value)} />
              </div>
              <div className="space-y-1.5">
                <Label className="text-sm font-medium">Supplier</Label>
                <Input placeholder="e.g. AutoParts Ghana" value={form.supplier} onChange={e => update('supplier', e.target.value)} />
              </div>
            </div>

            {/* Expiry Date */}
            <div className="space-y-1.5">
              <Label className="text-sm font-medium">Expiry Date</Label>
              <Input type="date" value={form.expiryDate} onChange={e => update('expiryDate', e.target.value)} />
            </div>

            {/* Notes */}
            <div className="space-y-1.5">
              <Label className="text-sm font-medium">Notes</Label>
              <Textarea placeholder="Additional notes..." rows={2} value={form.notes} onChange={e => update('notes', e.target.value)} />
            </div>
          </form>
        </DialogBody>
        <DialogFooter>
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)} disabled={submitting}>Cancel</Button>
          <Button type="submit" form="warehouse-form" className="bg-orange-500 hover:bg-orange-600 text-white" disabled={submitting || !form.name || !form.quantity || !form.unitPrice}>
            {submitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            {isEditing ? 'Update Item' : 'Add Item'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

// ==================== DETAIL SHEET ====================

function DetailSheet({
  item, open, onOpenChange, onEdit, onDelete, onRestock,
}: {
  item: WarehouseItem | null
  open: boolean
  onOpenChange: (open: boolean) => void
  onEdit: (item: WarehouseItem) => void
  onDelete: (item: WarehouseItem) => void
  onRestock: (item: WarehouseItem) => void
}) {
  if (!item) return null

  const totalVal = item.quantity * item.unitPrice
  const isLow = item.status === 'low_stock'
  const isOut = item.status === 'out_of_stock'

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="w-full sm:max-w-lg overflow-y-auto">
        <div className="space-y-6 p-6">
          <SheetHeader>
            <SheetTitle className="flex items-center gap-2">
              <Package className="h-5 w-5 text-orange-500" />
              Item Details
            </SheetTitle>
            <SheetDescription>{item.name}</SheetDescription>
          </SheetHeader>

          {/* Status Badge */}
          <div className="flex items-center gap-3">
            <Badge variant="outline" className={cn('border-transparent text-sm px-3 py-1', ITEM_STATUS[item.status]?.color)}>
              {ITEM_STATUS[item.status]?.label || item.status}
            </Badge>
            {isLow && (
              <span className="flex items-center gap-1 text-xs text-amber-600 dark:text-amber-400">
                <AlertTriangle className="h-3 w-3" /> Below minimum stock
              </span>
            )}
            {isOut && (
              <span className="flex items-center gap-1 text-xs text-red-600 dark:text-red-400">
                <AlertTriangle className="h-3 w-3" /> Out of stock
              </span>
            )}
          </div>

          {/* Key Info */}
          <div className="rounded-xl border-2 border-orange-200 dark:border-orange-800 bg-gradient-to-br from-orange-50 to-amber-50 dark:from-orange-950/30 dark:to-amber-950/30 p-5 space-y-2">
            <p className="text-sm font-medium text-muted-foreground">Stock Value</p>
            <p className="text-3xl font-bold">{formatCurrency(totalVal)}</p>
            <p className="text-xs text-muted-foreground">
              {item.quantity} {getUnitLabel(item.unit)} × {formatCurrency(item.unitPrice)}/unit
            </p>
          </div>

          {/* Details Grid */}
          <div className="grid grid-cols-2 gap-3">
            <Card><CardContent className="p-3">
              <p className="text-xs text-muted-foreground">Quantity</p>
              <p className={cn('text-lg font-bold', isOut && 'text-red-600', isLow && 'text-amber-600')}>
                {item.quantity}
              </p>
              <p className="text-xs text-muted-foreground">{getUnitLabel(item.unit)}</p>
            </CardContent></Card>
            <Card><CardContent className="p-3">
              <p className="text-xs text-muted-foreground">Min. Stock</p>
              <p className="text-lg font-bold">{item.minStock}</p>
              <p className="text-xs text-muted-foreground">{getUnitLabel(item.unit)}</p>
            </CardContent></Card>
            <Card><CardContent className="p-3">
              <p className="text-xs text-muted-foreground">Unit Price</p>
              <p className="text-lg font-bold">{formatCurrency(item.unitPrice)}</p>
            </CardContent></Card>
            <Card><CardContent className="p-3">
              <p className="text-xs text-muted-foreground">Category</p>
              <p className="text-sm font-semibold">{getCategoryLabel(item.category)}</p>
            </CardContent></Card>
          </div>

          {/* Additional Info */}
          <div className="rounded-lg border bg-muted/30 p-3 space-y-2 text-sm">
            <div className="flex justify-between">
              <span className="text-muted-foreground">SKU</span>
              <span className="font-mono text-xs">{item.sku}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">Warehouse</span>
              <span className="font-medium">{item.warehouse}</span>
            </div>
            {item.location && (
              <div className="flex justify-between">
                <span className="text-muted-foreground">Location</span>
                <span className="font-medium">{item.location}</span>
              </div>
            )}
            {item.supplier && (
              <div className="flex justify-between">
                <span className="text-muted-foreground">Supplier</span>
                <span className="font-medium">{item.supplier}</span>
              </div>
            )}
            {item.lastRestocked && (
              <div className="flex justify-between">
                <span className="text-muted-foreground">Last Restocked</span>
                <span className="font-medium">{new Date(item.lastRestocked).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })}</span>
              </div>
            )}
            {item.expiryDate && (
              <div className="flex justify-between">
                <span className="text-muted-foreground">Expiry Date</span>
                <span className={cn('font-medium', new Date(item.expiryDate) < new Date() && 'text-red-600')}>
                  {new Date(item.expiryDate).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })}
                </span>
              </div>
            )}
          </div>

          {item.notes && (
            <div className="rounded-lg border bg-muted/30 p-3">
              <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide mb-1">Notes</p>
              <p className="text-sm">{item.notes}</p>
            </div>
          )}

          {/* Actions */}
          <div className="space-y-2 pt-2">
            {(isLow || isOut) && (
              <Button className="w-full bg-emerald-600 hover:bg-emerald-700 text-white gap-2" onClick={() => { onOpenChange(false); onRestock(item) }}>
                <PackageCheck className="h-4 w-4" /> Restock Item
              </Button>
            )}
            <Button className="w-full gap-2" variant="outline" onClick={() => { onOpenChange(false); onEdit(item) }}>
              <Pencil className="h-4 w-4" /> Edit Item
            </Button>
            <Button className="w-full gap-2 text-red-600 hover:text-red-700 hover:bg-red-50 dark:hover:bg-red-950/20" variant="outline" onClick={() => { onOpenChange(false); onDelete(item) }}>
              <Trash2 className="h-4 w-4" /> Delete Item
            </Button>
          </div>
        </div>
      </SheetContent>
    </Sheet>
  )
}

// ==================== RESTOCK DIALOG ====================

function RestockDialog({
  item, open, onOpenChange, onRestocked,
}: {
  item: WarehouseItem | null
  open: boolean
  onOpenChange: (open: boolean) => void
  onRestocked: () => void
}) {
  const [qty, setQty] = React.useState('')
  const [submitting, setSubmitting] = React.useState(false)

  if (!item) return null

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    const numQty = parseInt(qty)
    if (!numQty || numQty <= 0) { toast.error('Enter a valid quantity'); return }
    setSubmitting(true)
    try {
      await updateWarehouseItem(item.id, { restockQty: numQty })
      toast.success(`Added ${numQty} ${getUnitLabel(item.unit)} to ${item.name}`)
      onOpenChange(false)
      onRestocked()
    } catch { toast.error('Failed to restock') } finally { setSubmitting(false) }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-emerald-600">
            <PackageCheck className="h-5 w-5" /> Restock Item
          </DialogTitle>
          <DialogDescription>Add quantity to existing inventory</DialogDescription>
        </DialogHeader>
        <DialogBody>
          <form id="restock-form" onSubmit={handleSubmit} className="space-y-4">
            <div className="rounded-lg border p-4 space-y-2 text-sm">
              <div className="flex justify-between"><span className="text-muted-foreground">Item</span><span className="font-medium">{item.name}</span></div>
              <div className="flex justify-between"><span className="text-muted-foreground">SKU</span><span className="font-mono text-xs">{item.sku}</span></div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Current Stock</span>
                <span className={cn('font-bold', item.status === 'out_of_stock' && 'text-red-600', item.status === 'low_stock' && 'text-amber-600')}>
                  {item.quantity} {getUnitLabel(item.unit)}
                </span>
              </div>
              <div className="flex justify-between"><span className="text-muted-foreground">Min. Stock</span><span>{item.minStock} {getUnitLabel(item.unit)}</span></div>
            </div>
            <div className="space-y-1.5">
              <Label className="text-sm font-medium">Quantity to Add *</Label>
              <div className="relative">
                <Input type="number" placeholder="0" min="1" value={qty} onChange={e => setQty(e.target.value)} autoFocus />
                <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-muted-foreground">{getUnitLabel(item.unit)}</span>
              </div>
            </div>
          </form>
        </DialogBody>
        <DialogFooter>
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button type="submit" form="restock-form" className="bg-emerald-600 hover:bg-emerald-700 text-white" disabled={submitting || !qty}>
            {submitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            Restock
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

// ==================== WAREHOUSE TABLE ====================

function WarehouseTable({
  items, onSelect,
}: {
  items: WarehouseItem[]
  onSelect: (item: WarehouseItem) => void
}) {
  if (items.length === 0) {
    return (
      <div className="rounded-lg border bg-card">
        <EmptyState icon={Package} title="No items found" description="Try adjusting your search or filters, or add a new item" />
      </div>
    )
  }

  function getRowBg(status: string): string {
    if (status === 'out_of_stock') return 'bg-red-50 dark:bg-red-950/20'
    if (status === 'low_stock') return 'bg-amber-50 dark:bg-amber-950/20'
    return ''
  }

  return (
    <>
      {/* Desktop Table */}
      <div className="rounded-lg border bg-card hidden md:block">
        <div className="max-h-[500px] overflow-y-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Name</TableHead>
                <TableHead>Category</TableHead>
                <TableHead>Warehouse</TableHead>
                <TableHead className="text-right">Quantity</TableHead>
                <TableHead className="text-right">Min Level</TableHead>
                <TableHead className="text-right">Total Value</TableHead>
                <TableHead>Status</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {items.map(item => {
                const totalVal = item.quantity * item.unitPrice
                return (
                  <TableRow
                    key={item.id}
                    className={cn('cursor-pointer hover:bg-muted/50 transition-colors', getRowBg(item.status))}
                    onClick={() => onSelect(item)}
                  >
                    <TableCell>
                      <div className="flex items-center gap-2">
                        <div>
                          <p className="text-sm font-medium">{item.name}</p>
                          <p className="text-xs text-muted-foreground font-mono">{item.sku}</p>
                        </div>
                      </div>
                    </TableCell>
                    <TableCell className="text-sm">{getCategoryLabel(item.category)}</TableCell>
                    <TableCell className="text-sm text-muted-foreground">{item.warehouse}</TableCell>
                    <TableCell className="text-right">
                      <span className={cn('text-sm font-semibold', item.status === 'out_of_stock' && 'text-red-600', item.status === 'low_stock' && 'text-amber-600')}>
                        {item.quantity}
                      </span>
                      <span className="text-xs text-muted-foreground ml-1">{getUnitLabel(item.unit)}</span>
                    </TableCell>
                    <TableCell className="text-right text-sm text-muted-foreground">{item.minStock}</TableCell>
                    <TableCell className="text-right text-sm font-medium">{formatCurrency(totalVal)}</TableCell>
                    <TableCell>
                      <Badge variant="outline" className={cn('border-transparent', ITEM_STATUS[item.status]?.color)}>
                        {ITEM_STATUS[item.status]?.label || item.status}
                      </Badge>
                    </TableCell>
                  </TableRow>
                )
              })}
            </TableBody>
          </Table>
        </div>
      </div>

      {/* Mobile Cards */}
      <div className="md:hidden space-y-3">
        {items.map(item => {
          const totalVal = item.quantity * item.unitPrice
          return (
            <Card
              key={item.id}
              className={cn('cursor-pointer overflow-hidden hover:shadow-md transition-shadow', getRowBg(item.status))}
              onClick={() => onSelect(item)}
            >
              <CardContent className="p-4 space-y-3">
                <div className="flex items-start justify-between gap-2">
                  <div className="flex-1 min-w-0">
                    <p className="font-medium text-sm truncate">{item.name}</p>
                    <p className="text-xs text-muted-foreground font-mono">{item.sku} · {getCategoryLabel(item.category)}</p>
                    <p className="text-xs text-muted-foreground mt-0.5">{item.warehouse}</p>
                  </div>
                  <Badge variant="outline" className={cn('border-transparent shrink-0', ITEM_STATUS[item.status]?.color)}>
                    {ITEM_STATUS[item.status]?.label || item.status}
                  </Badge>
                </div>
                <div className="grid grid-cols-3 gap-2 text-sm">
                  <div>
                    <p className="text-xs text-muted-foreground">Quantity</p>
                    <p className={cn('font-semibold', item.status === 'out_of_stock' && 'text-red-600', item.status === 'low_stock' && 'text-amber-600')}>
                      {item.quantity} {getUnitLabel(item.unit)}
                    </p>
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground">Min Level</p>
                    <p>{item.minStock}</p>
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground">Value</p>
                    <p className="font-medium">{formatCurrency(totalVal)}</p>
                  </div>
                </div>
                {(item.status === 'low_stock' || item.status === 'out_of_stock') && (
                  <div className="flex items-center gap-1 text-xs text-amber-600 dark:text-amber-400">
                    <AlertTriangle className="h-3 w-3" />
                    Below minimum stock level
                  </div>
                )}
              </CardContent>
            </Card>
          )
        })}
      </div>
    </>
  )
}

// ==================== MAIN VIEW ====================

export function WarehouseInventoryView() {
  const [items, setItems] = React.useState<WarehouseItem[]>([])
  const [analytics, setAnalytics] = React.useState<WarehouseAnalytics | null>(null)
  const [loading, setLoading] = React.useState(true)
  const [error, setError] = React.useState<string | null>(null)
  const [total, setTotal] = React.useState(0)
  const [page, setPage] = React.useState(1)
  const limit = 50

  // Filters
  const [activeTab, setActiveTab] = React.useState('all')
  const [searchQuery, setSearchQuery] = React.useState('')
  const [filterCategory, setFilterCategory] = React.useState('')
  const [filterWarehouse, setFilterWarehouse] = React.useState('')
  const [showFilters, setShowFilters] = React.useState(false)

  // Dialogs
  const [formOpen, setFormOpen] = React.useState(false)
  const [editItem, setEditItem] = React.useState<WarehouseItem | null>(null)
  const [detailItem, setDetailItem] = React.useState<WarehouseItem | null>(null)
  const [detailOpen, setDetailOpen] = React.useState(false)
  const [restockItem, setRestockItem] = React.useState<WarehouseItem | null>(null)
  const [restockOpen, setRestockOpen] = React.useState(false)
  const [deleteItem, setDeleteItem] = React.useState<WarehouseItem | null>(null)
  const [deleteOpen, setDeleteOpen] = React.useState(false)

  const { user } = useAuthStore()
  const isAdmin = user?.role === 'Admin' || user?.role === 'Manager'

  // Load data
  const loadData = React.useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const params: Parameters<typeof fetchWarehouseItems>[0] = { page, limit }
      if (activeTab !== 'all') params.status = activeTab
      if (searchQuery) params.search = searchQuery
      if (filterCategory) params.category = filterCategory
      if (filterWarehouse) params.warehouse = filterWarehouse
      const res = await fetchWarehouseItems(params)
      setItems(res.data || [])
      setTotal(res.total || 0)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load items')
    } finally {
      setLoading(false)
    }
  }, [activeTab, searchQuery, filterCategory, filterWarehouse, page])

  const loadAnalytics = React.useCallback(async () => {
    try {
      const data = await fetchWarehouseAnalytics()
      setAnalytics(data)
    } catch { /* analytics optional */ }
  }, [])

  React.useEffect(() => { loadData() }, [loadData])
  React.useEffect(() => { loadAnalytics() }, [loadAnalytics])

  // Reset page on filter changes
  React.useEffect(() => { setPage(1) }, [activeTab, searchQuery, filterCategory, filterWarehouse])

  const totalPages = Math.ceil(total / limit)

  // Delete handler
  async function handleDelete() {
    if (!deleteItem) return
    try {
      await deleteWarehouseItem(deleteItem.id)
      toast.success('Item deleted successfully')
      setDeleteOpen(false)
      setDeleteItem(null)
      loadData()
      loadAnalytics()
    } catch { toast.error('Failed to delete item') }
  }

  // Edit handler
  function handleEdit(item: WarehouseItem) {
    setEditItem(item)
    setFormOpen(true)
  }

  // Restock handler
  function handleRestock(item: WarehouseItem) {
    setRestockItem(item)
    setRestockOpen(true)
  }

  return (
    <motion.div variants={containerVariants} animate="show" className="space-y-4 sm:space-y-6">
      {/* Header */}
      <motion.div variants={itemVariants} className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Warehouse Inventory</h1>
          <p className="text-muted-foreground">Track spare parts, supplies, and equipment across warehouses</p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={() => { setSearchQuery(''); setFilterCategory(''); setFilterWarehouse(''); setActiveTab('all'); setPage(1) }}>
            <RefreshCw className="mr-1.5 h-3.5 w-3.5" /> Reset
          </Button>
          {isAdmin && (
            <Button onClick={() => { setEditItem(null); setFormOpen(true) }} className="bg-orange-500 hover:bg-orange-600 text-white">
              <Plus className="mr-2 h-4 w-4" /> Add Item
            </Button>
          )}
        </div>
      </motion.div>

      {/* Summary Cards */}
      <motion.div variants={itemVariants} className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
        {loading ? (
          Array.from({ length: 4 }).map((_, i) => (
            <Card key={i}><CardContent className="p-4 sm:p-6"><Skeleton className="h-3 w-24 mb-3" /><Skeleton className="h-7 w-20" /></CardContent></Card>
          )) 
        ) : (
          <>
            <StatsCard
              icon={Package}
              title="Total Items"
              value={String(analytics?.totalItems || total)}
              changeLabel={`${analytics?.categoryCount || 0} categories`}
              className="cursor-default"
            />
            <StatsCard
              icon={DollarSign}
              title="Total Value"
              value={formatCurrency(analytics?.totalValue || 0)}
              changeLabel="Inventory value"
              className="cursor-default"
            />
            <StatsCard
              icon={AlertTriangle}
              title="Low Stock"
              value={String(analytics?.lowStockAlerts || 0)}
              changeLabel="Need restocking"
              className="cursor-default"
              valueClassName="text-amber-600"
            />
            <StatsCard
              icon={Layers}
              title="Categories"
              value={String(analytics?.categoryCount || 0)}
              changeLabel={`${analytics?.warehouseCount || 0} warehouses`}
              className="cursor-default"
            />
          </>
        )}
      </motion.div>

      {/* Search & Filters */}
      <motion.div variants={itemVariants} className="space-y-3">
        <div className="flex flex-col sm:flex-row gap-2 sm:gap-3">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Search by name, SKU, or supplier..."
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
              className="pl-9"
            />
          </div>
          <Button variant="outline" size="sm" onClick={() => setShowFilters(!showFilters)}>
            <Filter className="mr-1.5 h-3.5 w-3.5" />
            Filters
            <ChevronDown className={`ml-1 h-3 w-3 transition-transform ${showFilters ? 'rotate-180' : ''}`} />
          </Button>
        </div>

        {showFilters && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            className="flex flex-col sm:flex-row gap-2 sm:gap-3 p-3 rounded-lg border bg-muted/30"
          >
            <div className="flex-1">
              <label className="text-xs font-medium text-muted-foreground mb-1 block">Category</label>
              <Select value={filterCategory} onValueChange={v => setFilterCategory(v === '_all' ? '' : v)}>
                <SelectTrigger><SelectValue placeholder="All Categories" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="_all">All Categories</SelectItem>
                  {CATEGORIES.map(c => <SelectItem key={c.value} value={c.value}>{c.label}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="flex-1">
              <label className="text-xs font-medium text-muted-foreground mb-1 block">Warehouse</label>
              <Select value={filterWarehouse} onValueChange={v => setFilterWarehouse(v === '_all' ? '' : v)}>
                <SelectTrigger><SelectValue placeholder="All Warehouses" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="_all">All Warehouses</SelectItem>
                  {WAREHOUSES.map(w => <SelectItem key={w.value} value={w.value}>{w.label}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
          </motion.div>
        )}
      </motion.div>

      {/* Tabs */}
      <motion.div variants={itemVariants}>
        <Tabs value={activeTab} onValueChange={v => setActiveTab(v)}>
          <TabsList className="w-full sm:w-auto">
            <TabsTrigger value="all">All</TabsTrigger>
            <TabsTrigger value="in_stock">In Stock</TabsTrigger>
            <TabsTrigger value="low_stock" className="gap-1">
              Low Stock {analytics?.lowStockAlerts ? `(${analytics.lowStockAlerts})` : ''}
            </TabsTrigger>
            <TabsTrigger value="out_of_stock">Out of Stock</TabsTrigger>
          </TabsList>

          {error ? (
            <div className="flex flex-col items-center justify-center py-12 text-center mt-4">
              <AlertTriangle className="h-8 w-8 text-red-500 mb-3" />
              <p className="text-sm text-muted-foreground mb-3">{error}</p>
              <Button variant="outline" size="sm" onClick={loadData}>
                <RefreshCw className="mr-2 h-3 w-3" /> Retry
              </Button>
            </div>
          ) : loading ? (
            <div className="mt-4 space-y-3">
              {[1, 2, 3, 4, 5].map(i => <Skeleton key={i} className="h-14 w-full rounded-lg" />)}
            </div>
          ) : (
            <div className="mt-4">
              <WarehouseTable items={items} onSelect={item => { setDetailItem(item); setDetailOpen(true) }} />
            </div>
          )}
        </Tabs>

        {/* Pagination */}
        {!loading && !error && totalPages > 1 && (
          <div className="flex items-center justify-between mt-4">
            <p className="text-sm text-muted-foreground">
              Showing {(page - 1) * limit + 1}–{Math.min(page * limit, total)} of {total}
            </p>
            <div className="flex gap-1">
              <Button variant="outline" size="sm" disabled={page <= 1} onClick={() => setPage(p => p - 1)}>
                Previous
              </Button>
              <Button variant="outline" size="sm" disabled={page >= totalPages} onClick={() => setPage(p => p + 1)}>
                Next
              </Button>
            </div>
          </div>
        )}
      </motion.div>

      {/* Dialogs */}
      <ItemFormDialog
        open={formOpen}
        onOpenChange={open => { setFormOpen(open); if (!open) setEditItem(null) }}
        onSaved={() => { loadData(); loadAnalytics() }}
        editItem={editItem}
      />
      <DetailSheet
        item={detailItem}
        open={detailOpen}
        onOpenChange={setDetailOpen}
        onEdit={handleEdit}
        onDelete={item => { setDeleteItem(item); setDeleteOpen(true) }}
        onRestock={handleRestock}
      />
      <RestockDialog
        item={restockItem}
        open={restockOpen}
        onOpenChange={open => { setRestockOpen(open); if (!open) setRestockItem(null) }}
        onRestocked={() => { loadData(); loadAnalytics() }}
      />

      {/* Delete Confirmation */}
      <AlertDialog open={deleteOpen} onOpenChange={setDeleteOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Warehouse Item</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete <strong>{deleteItem?.name}</strong>? This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={handleDelete} className="bg-red-600 hover:bg-red-700 text-white">
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </motion.div>
  )
}
