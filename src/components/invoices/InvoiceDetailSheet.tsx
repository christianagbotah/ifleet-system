'use client'

import * as React from 'react'
import {
  Receipt,
  Send,
  Trash2,
  FileDown,
  Printer,
  CircleDollarSign,
  Plus,
  X,
  Check,
  Pencil,
  Save,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import { Separator } from '@/components/ui/separator'
import { ResponsiveSheet } from '@/components/ui/responsive-sheet'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from '@/components/ui/alert-dialog'
import {
  updateInvoice,
  deleteInvoice,
  downloadInvoicePdf,
  previewInvoicePdf,
  fetchInvoice,
  type Invoice,
  type InvoiceItem,
} from '@/lib/api'
import { CURRENCY_SYMBOL } from '@/lib/constants'
import { toast } from 'sonner'

// ────────────────────────────────────────────────────────────────────
// Helpers
// ────────────────────────────────────────────────────────────────────

function getStatusBadge(status: string) {
  switch (status) {
    case 'draft':
      return <Badge variant="outline" className="bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-400 border-0">Draft</Badge>
    case 'sent':
      return <Badge variant="outline" className="bg-sky-100 text-sky-700 dark:bg-sky-900/30 dark:text-sky-400 border-0">Sent</Badge>
    case 'paid':
      return <Badge variant="outline" className="bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400 border-0">Paid</Badge>
    case 'overdue':
      return <Badge variant="outline" className="bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400 border-0">Overdue</Badge>
    case 'cancelled':
      return <Badge variant="outline" className="bg-stone-100 text-stone-500 dark:bg-stone-800 dark:text-stone-400 border-0">Cancelled</Badge>
    default:
      return <Badge variant="outline">{status}</Badge>
  }
}

function formatCurrency(amount: number): string {
  return `${CURRENCY_SYMBOL} ${amount.toLocaleString('en-GH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
}

function formatDate(dateStr: string): string {
  return new Date(dateStr).toLocaleDateString('en-GB', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  })
}

// ────────────────────────────────────────────────────────────────────
// Editable line-item row
// ────────────────────────────────────────────────────────────────────

interface EditableItem {
  id: string           // existing item id or 'new-<index>'
  description: string
  quantity: number
  unitPrice: number
  total: number
  order: number
  _isNew?: boolean     // true = not yet persisted
  _dirty?: boolean     // true = changed since last save
  _deleted?: boolean   // true = removed from invoice
}

function makeEditableItem(item: InvoiceItem): EditableItem {
  return {
    id: item.id,
    description: item.description,
    quantity: item.quantity,
    unitPrice: item.unitPrice,
    total: item.total,
    order: item.order,
  }
}

function newEditableItem(order: number): EditableItem {
  return {
    id: `new-${Date.now()}-${order}`,
    description: '',
    quantity: 1,
    unitPrice: 0,
    total: 0,
    order,
    _isNew: true,
    _dirty: true,
  }
}

// ────────────────────────────────────────────────────────────────────
// InvoiceDetailSheet
// ────────────────────────────────────────────────────────────────────

interface InvoiceDetailSheetProps {
  invoice: Invoice | null
  open: boolean
  onOpenChange: (open: boolean) => void
  onRefresh: () => void
}

export function InvoiceDetailSheet({
  invoice,
  open,
  onOpenChange,
  onRefresh,
}: InvoiceDetailSheetProps) {
  // Editing state
  const [isEditing, setIsEditing] = React.useState(false)
  const [editItems, setEditItems] = React.useState<EditableItem[]>([])
  const [saving, setSaving] = React.useState(false)
  const [deleting, setDeleting] = React.useState(false)

  // Keep a fresh copy of invoice for re-fetching
  const [liveInvoice, setLiveInvoice] = React.useState<Invoice | null>(null)

  // Sync invoice prop → local state
  React.useEffect(() => {
    if (invoice) {
      setLiveInvoice(invoice)
      setEditItems(invoice.items.map(makeEditableItem))
      setIsEditing(false)
    }
  }, [invoice])

  // ── Computed totals from edit items ──
  const activeItems = editItems.filter((i) => !i._deleted)
  const computedSubtotal = activeItems.reduce((s, i) => s + i.quantity * i.unitPrice, 0)
  const taxRate = liveInvoice?.taxRate || 0
  const computedTax = Math.round(computedSubtotal * (taxRate / 100) * 100) / 100
  const computedTotal = Math.round((computedSubtotal + computedTax) * 100) / 100

  const hasChanges = React.useMemo(() => {
    if (!liveInvoice) return false
    return editItems.some((i) => i._dirty || i._deleted || i._isNew)
  }, [editItems, liveInvoice])

  // ── Edit handlers ──
  const updateItem = (id: string, field: keyof EditableItem, value: string | number) => {
    setEditItems((prev) =>
      prev.map((item) => {
        if (item.id !== id) return item
        const updated = { ...item, [field]: value, _dirty: true }
        if (field === 'quantity' || field === 'unitPrice') {
          updated.total = Math.round(Number(updated.quantity) * Number(updated.unitPrice) * 100) / 100
        }
        return updated
      })
    )
  }

  const addRow = () => {
    setEditItems((prev) => {
      const maxOrder = Math.max(0, ...prev.filter((i) => !i._deleted).map((i) => i.order))
      return [...prev, newEditableItem(maxOrder + 1)]
    })
  }

  const removeRow = (id: string) => {
    setEditItems((prev) =>
      prev.map((item) => {
        if (item.id !== id) return item
        if (item._isNew) return { ...item, _deleted: true } // soft-remove new items
        return { ...item, _dirty: true, _deleted: true } // mark existing for delete
      })
    )
  }

  const handleSave = async () => {
    if (!liveInvoice) return

    // Validate: at least one active item
    const active = editItems.filter((i) => !i._deleted)
    if (active.length === 0) {
      toast.error('Invoice must have at least one item')
      return
    }

    // Validate all active items have descriptions
    const missingDesc = active.find((i) => !i.description.trim())
    if (missingDesc) {
      toast.error('All items must have a description')
      return
    }

    setSaving(true)
    try {
      const finalItems = active.map((item, idx) => ({
        description: item.description.trim(),
        quantity: Number(item.quantity) || 0,
        unitPrice: Number(item.unitPrice) || 0,
        total: (Number(item.quantity) || 0) * (Number(item.unitPrice) || 0),
        order: idx,
      }))

      const updated = await updateInvoice(liveInvoice.id, { items: finalItems })
      setLiveInvoice(updated)
      setEditItems(updated.items.map(makeEditableItem))
      setIsEditing(false)
      toast.success('Invoice updated')
      onRefresh()
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to update invoice')
    } finally {
      setSaving(false)
    }
  }

  const handleCancelEdit = () => {
    if (liveInvoice) {
      setEditItems(liveInvoice.items.map(makeEditableItem))
    }
    setIsEditing(false)
  }

  // ── Action handlers ──
  const handleMarkSent = async () => {
    if (!liveInvoice) return
    try {
      await updateInvoice(liveInvoice.id, { status: 'sent' })
      toast.success('Invoice marked as sent')
      onOpenChange(false)
      onRefresh()
    } catch {
      toast.error('Failed to update status')
    }
  }

  const handleMarkPaid = async () => {
    if (!liveInvoice) return
    try {
      await updateInvoice(liveInvoice.id, { status: 'paid' })
      toast.success('Invoice marked as paid')
      onOpenChange(false)
      onRefresh()
    } catch {
      toast.error('Failed to update status')
    }
  }

  const handleDelete = async () => {
    if (!liveInvoice) return
    setDeleting(true)
    try {
      await deleteInvoice(liveInvoice.id)
      toast.success('Invoice deleted')
      onOpenChange(false)
      onRefresh()
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to delete')
    } finally {
      setDeleting(false)
    }
  }

  const handleDownloadPdf = async () => {
    if (!liveInvoice) return
    try {
      toast.loading('Generating PDF...', { id: 'detail-pdf' })
      await downloadInvoicePdf(liveInvoice.id, liveInvoice.invoiceNumber)
      toast.success('PDF downloaded', { id: 'detail-pdf' })
    } catch {
      toast.error('Failed to generate PDF', { id: 'detail-pdf' })
    }
  }

  const handlePrint = async () => {
    if (!liveInvoice) return
    try {
      toast.loading('Preparing PDF...', { id: 'detail-print' })
      await previewInvoicePdf(liveInvoice.id)
      toast.success('PDF opened for printing', { id: 'detail-print' })
    } catch {
      toast.error('Failed to generate PDF for printing', { id: 'detail-print' })
    }
  }

  const inv = liveInvoice
  if (!inv) return null

  const balance = inv.totalAmount - inv.paidAmount
  const canEdit = inv.status === 'draft' || inv.status === 'sent'

  return (
    <ResponsiveSheet
      open={open}
      onOpenChange={(o) => {
        if (!o && hasChanges) {
          // Warn about unsaved changes
          if (window.confirm('You have unsaved changes. Discard them?')) {
            setIsEditing(false)
            onOpenChange(o)
          }
          return
        }
        onOpenChange(o)
      }}
      title={
        <span className="flex items-center gap-2">
          <Receipt className="h-4 w-4 text-amber-500 shrink-0" />
          {inv.invoiceNumber}
        </span>
      }
      description={`Invoice for ${inv.client?.companyName ?? 'Unknown'}`}
      width="sm:max-w-lg"
      footer={
        <div className="flex flex-col gap-2">
          {/* Top row: utility actions */}
          <div className="flex gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={handleDownloadPdf}
              className="flex-1 gap-1.5"
            >
              <FileDown className="h-4 w-4" />
              Download
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={handlePrint}
              className="flex-1 gap-1.5"
            >
              <Printer className="h-4 w-4" />
              Print
            </Button>
          </div>
          {/* Bottom row: status actions */}
          <div className="flex gap-2">
            {inv.status === 'draft' && (
              <Button
                variant="outline"
                size="sm"
                onClick={handleMarkSent}
                className="flex-1 border-sky-200 text-sky-600 hover:bg-sky-50 dark:border-sky-800 dark:text-sky-400 dark:hover:bg-sky-950/30"
              >
                <Send className="h-4 w-4 mr-1" />
                Mark as Sent
              </Button>
            )}
            {inv.status === 'sent' && (
              <Button
                variant="outline"
                size="sm"
                onClick={handleMarkPaid}
                className="flex-1 border-emerald-200 text-emerald-600 hover:bg-emerald-50 dark:border-emerald-800 dark:text-emerald-400 dark:hover:bg-emerald-950/30"
              >
                <CircleDollarSign className="h-4 w-4 mr-1" />
                Mark as Paid
              </Button>
            )}
            {(inv.status === 'draft' || inv.status === 'cancelled') && (
              <AlertDialog>
                <AlertDialogTrigger asChild>
                  <Button
                    variant="outline"
                    size="sm"
                    disabled={deleting}
                    className="flex-1 text-red-500 hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-950/30"
                  >
                    {deleting ? (
                      <div className="h-4 w-4 animate-spin rounded-full border-2 border-red-200 border-t-red-500" />
                    ) : (
                      <Trash2 className="h-4 w-4 mr-1" />
                    )}
                    Delete
                  </Button>
                </AlertDialogTrigger>
                <AlertDialogContent>
                  <AlertDialogHeader>
                    <AlertDialogTitle>Delete this invoice?</AlertDialogTitle>
                    <AlertDialogDescription>
                      This will permanently delete invoice {inv.invoiceNumber}. This action cannot be undone.
                    </AlertDialogDescription>
                  </AlertDialogHeader>
                  <AlertDialogFooter>
                    <AlertDialogCancel>Cancel</AlertDialogCancel>
                    <AlertDialogAction onClick={handleDelete} className="bg-red-600 hover:bg-red-700">
                      Delete Invoice
                    </AlertDialogAction>
                  </AlertDialogFooter>
                </AlertDialogContent>
              </AlertDialog>
            )}
          </div>
        </div>
      }
    >
      {/* ── Body ── */}
      <div className="space-y-5 p-4 md:p-6">
        {/* Status badge + quick info */}
        <div className="flex items-center justify-between">
          {getStatusBadge(inv.status)}
          <span className="text-xs text-muted-foreground">
            Created {formatDate(inv.createdAt)}
          </span>
        </div>

        {/* Client Info */}
        <div className="bg-muted/50 rounded-lg p-3">
          <p className="text-xs text-muted-foreground mb-1">Bill To</p>
          <p className="font-medium text-sm">{inv.client?.companyName}</p>
          <p className="text-xs text-muted-foreground">{inv.client?.contactPerson}</p>
          <p className="text-xs text-muted-foreground">
            {inv.client?.phone}
            {inv.client?.email ? ` | ${inv.client.email}` : ''}
          </p>
        </div>

        {/* Dates */}
        <div className="grid grid-cols-2 gap-3">
          <div>
            <p className="text-xs text-muted-foreground">Issue Date</p>
            <p className="text-sm font-medium">{formatDate(inv.issueDate)}</p>
          </div>
          <div>
            <p className="text-xs text-muted-foreground">Due Date</p>
            <p className="text-sm font-medium">{formatDate(inv.dueDate)}</p>
          </div>
        </div>

        {inv.trip && (
          <div>
            <p className="text-xs text-muted-foreground">Trip Reference</p>
            <p className="text-sm font-medium">{inv.trip.tripNumber}</p>
          </div>
        )}

        <Separator />

        {/* Line Items — View or Edit mode */}
        <div>
          <div className="flex items-center justify-between mb-2">
            <p className="text-xs font-medium text-muted-foreground">Line Items</p>
            {canEdit && !isEditing && (
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setIsEditing(true)}
                className="h-7 gap-1 text-xs text-muted-foreground hover:text-foreground"
              >
                <Pencil className="h-3 w-3" />
                Edit Items
              </Button>
            )}
            {isEditing && (
              <div className="flex items-center gap-1">
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={handleCancelEdit}
                  className="h-7 gap-1 text-xs text-muted-foreground hover:text-foreground"
                >
                  Cancel
                </Button>
                <Button
                  size="sm"
                  onClick={handleSave}
                  disabled={saving}
                  className="h-7 gap-1 text-xs bg-emerald-600 hover:bg-emerald-700 text-white"
                >
                  {saving ? (
                    <div className="h-3 w-3 animate-spin rounded-full border-2 border-white/30 border-t-white" />
                  ) : (
                    <Save className="h-3 w-3" />
                  )}
                  Save
                </Button>
              </div>
            )}
          </div>

          <div className="rounded-lg border overflow-hidden">
            {/* Table Header */}
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-muted/50">
                  <th className="text-left text-xs font-medium px-3 py-2 w-6">#</th>
                  <th className="text-left text-xs font-medium px-3 py-2">Description</th>
                  <th className="text-right text-xs font-medium px-3 py-2 w-14">Qty</th>
                  <th className="text-right text-xs font-medium px-3 py-2 w-24">Price</th>
                  <th className="text-right text-xs font-medium px-3 py-2 w-24">Total</th>
                  {isEditing && <th className="w-8"></th>}
                </tr>
              </thead>
              <tbody>
                {activeItems.map((item, idx) => (
                  <tr
                    key={item.id}
                    className={`${idx % 2 === 1 ? 'bg-muted/20' : ''} ${isEditing && item._isNew ? 'bg-amber-50/50 dark:bg-amber-950/10' : ''}`}
                  >
                    <td className="px-3 py-1.5 text-xs text-muted-foreground">{idx + 1}</td>
                    <td className="px-3 py-1.5 text-xs">
                      {isEditing ? (
                        <Input
                          value={item.description}
                          onChange={(e) => updateItem(item.id, 'description', e.target.value)}
                          className="h-7 text-xs border-dashed"
                          placeholder="Item description..."
                        />
                      ) : (
                        <span className={item._isNew ? 'font-medium' : ''}>{item.description}</span>
                      )}
                    </td>
                    <td className="px-3 py-1.5 text-xs text-right">
                      {isEditing ? (
                        <Input
                          type="number"
                          value={item.quantity}
                          onChange={(e) => updateItem(item.id, 'quantity', Number(e.target.value))}
                          className="h-7 text-xs text-right border-dashed w-14"
                          min={0}
                        />
                      ) : (
                        item.quantity
                      )}
                    </td>
                    <td className="px-3 py-1.5 text-xs text-right">
                      {isEditing ? (
                        <Input
                          type="number"
                          value={item.unitPrice}
                          onChange={(e) => updateItem(item.id, 'unitPrice', Number(e.target.value))}
                          className="h-7 text-xs text-right border-dashed w-24"
                          min={0}
                          step={0.01}
                        />
                      ) : (
                        formatCurrency(item.unitPrice)
                      )}
                    </td>
                    <td className="px-3 py-1.5 text-xs text-right font-medium">
                      {isEditing ? formatCurrency(item.quantity * item.unitPrice) : formatCurrency(item.total)}
                    </td>
                    {isEditing && (
                      <td className="px-1">
                        <button
                          onClick={() => removeRow(item.id)}
                          className="flex items-center justify-center h-6 w-6 rounded hover:bg-red-100 dark:hover:bg-red-900/30 text-muted-foreground hover:text-red-500 transition-colors"
                        >
                          <X className="h-3.5 w-3.5" />
                        </button>
                      </td>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>

            {/* Add Row Button (edit mode only) */}
            {isEditing && (
              <button
                onClick={addRow}
                className="w-full flex items-center justify-center gap-1.5 px-3 py-2 text-xs text-amber-600 dark:text-amber-400 hover:bg-amber-50 dark:hover:bg-amber-950/20 border-t border-dashed transition-colors"
              >
                <Plus className="h-3.5 w-3.5" />
                Add Item
              </button>
            )}
          </div>
        </div>

        {/* Totals */}
        <div className="bg-muted/50 rounded-lg p-3 space-y-1.5 text-sm">
          <div className="flex justify-between">
            <span className="text-muted-foreground">Subtotal</span>
            <span>{formatCurrency(isEditing ? computedSubtotal : inv.subtotal)}</span>
          </div>
          {taxRate > 0 && (
            <div className="flex justify-between">
              <span className="text-muted-foreground">VAT ({taxRate}%)</span>
              <span>{formatCurrency(isEditing ? computedTax : inv.taxAmount)}</span>
            </div>
          )}
          <div className="flex justify-between pt-1.5 border-t font-bold">
            <span>Total</span>
            <span className="text-amber-600">{formatCurrency(isEditing ? computedTotal : inv.totalAmount)}</span>
          </div>
          {inv.paidAmount > 0 && (
            <>
              <div className="flex justify-between text-xs text-muted-foreground">
                <span>Paid</span>
                <span>{formatCurrency(inv.paidAmount)}</span>
              </div>
              <div className="flex justify-between text-xs font-semibold">
                <span>Balance Due</span>
                <span className={balance > 0 ? 'text-red-500' : 'text-emerald-500'}>
                  {formatCurrency(balance)}
                </span>
              </div>
            </>
          )}
          {isEditing && hasChanges && (
            <div className="flex items-center gap-1.5 pt-1 text-xs text-amber-600 dark:text-amber-400">
              <Pencil className="h-3 w-3" />
              Unsaved changes
            </div>
          )}
        </div>

        {/* Notes & Terms */}
        {inv.notes && (
          <div>
            <p className="text-xs font-medium text-muted-foreground mb-1">Notes</p>
            <p className="text-xs">{inv.notes}</p>
          </div>
        )}
        {inv.terms && (
          <div>
            <p className="text-xs font-medium text-muted-foreground mb-1">Payment Terms</p>
            <p className="text-xs">{inv.terms}</p>
          </div>
        )}
      </div>

    </ResponsiveSheet>
  )
}
