'use client'

import { useState, useEffect, useCallback, useMemo, useRef } from 'react'
import { motion } from 'framer-motion'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Skeleton } from '@/components/ui/skeleton'
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
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  DropdownMenuSeparator,
} from '@/components/ui/dropdown-menu'
import {
  Receipt,
  Plus,
  Search,
  MoreHorizontal,
  Loader2,
  Trash2,
  Eye,
  Send,
  FileText,
  ChevronLeft,
  ChevronRight,
  AlertTriangle,
  CircleDollarSign,
  TrendingUp,
  X,
  FileDown,
  Printer,
} from 'lucide-react'
import { Checkbox } from '@/components/ui/checkbox'
import {
  fetchInvoices,
  createInvoice,
  updateInvoice,
  deleteInvoice,
  bulkInvoiceAction,
  downloadInvoicePdf,
  previewInvoicePdf,
  fetchClients,
  type Invoice,
  type InvoiceItem,
  type InvoiceSummary,
  type Client,
} from '@/lib/api'
import { CURRENCY_SYMBOL } from '@/lib/constants'
import { useEntityHighlight } from '@/lib/hooks/useEntityHighlight'
import { toast } from 'sonner'

// ============ CONSTANTS ============

const PAGE_SIZE = 20

const STATUS_OPTIONS = [
  { value: 'all', label: 'All Statuses' },
  { value: 'draft', label: 'Draft' },
  { value: 'sent', label: 'Sent' },
  { value: 'paid', label: 'Paid' },
  { value: 'overdue', label: 'Overdue' },
  { value: 'cancelled', label: 'Cancelled' },
]

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

// ============ SKELETON ============

function TableSkeleton() {
  return (
    <div className="space-y-3">
      <Skeleton className="h-10 w-full" />
      <div className="space-y-2">
        {Array.from({ length: 8 }).map((_, i) => (
          <Skeleton key={i} className="h-14 w-full" />
        ))}
      </div>
      <Skeleton className="h-10 w-64 mx-auto" />
    </div>
  )
}

// ============ EMPTY STATE ============

function EmptyState({ onCreate }: { onCreate: () => void }) {
  return (
    <div className="flex flex-col items-center justify-center py-16 text-muted-foreground">
      <FileText className="h-12 w-12 mb-3 opacity-30" />
      <p className="text-sm font-medium">No invoices found</p>
      <p className="text-xs mt-1">Create your first invoice to get started</p>
      <Button
        onClick={onCreate}
        className="mt-4 bg-amber-600 hover:bg-amber-700 text-white"
        size="sm"
      >
        <Plus className="h-4 w-4 mr-1" />
        Create Invoice
      </Button>
    </div>
  )
}

// ============ CREATE INVOICE DIALOG ============

interface LineItemForm {
  description: string
  quantity: number
  unitPrice: number
}

const emptyLineItem = (): LineItemForm => ({
  description: '',
  quantity: 1,
  unitPrice: 0,
})

function CreateInvoiceDialog({
  open,
  onOpenChange,
  clients,
  onSubmit,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  clients: Client[]
  onSubmit: () => void
}) {
  const [loading, setLoading] = useState(false)
  const [clientId, setClientId] = useState('')
  const [tripId, setTripId] = useState('')
  const [dueDate, setDueDate] = useState('')
  const [taxRate, setTaxRate] = useState('0')
  const [notes, setNotes] = useState('')
  const [terms, setTerms] = useState('')
  const [items, setItems] = useState<LineItemForm[]>([emptyLineItem()])

  const resetForm = () => {
    setClientId('')
    setTripId('')
    setDueDate('')
    setTaxRate('0')
    setNotes('')
    setTerms('')
    setItems([emptyLineItem()])
  }

  const subtotal = items.reduce((sum, item) => sum + (item.quantity * item.unitPrice), 0)
  const tax = subtotal * (parseFloat(taxRate) || 0) / 100
  const total = subtotal + tax

  const handleAddItem = () => {
    setItems([...items, emptyLineItem()])
  }

  const handleRemoveItem = (index: number) => {
    if (items.length <= 1) return
    setItems(items.filter((_, i) => i !== index))
  }

  const handleItemChange = (index: number, field: keyof LineItemForm, value: string | number) => {
    const updated = [...items]
    updated[index] = { ...updated[index], [field]: value }
    setItems(updated)
  }

  const handleSubmit = async () => {
    if (!clientId) {
      toast.error('Please select a client')
      return
    }
    if (!dueDate) {
      toast.error('Please set a due date')
      return
    }
    const validItems = items.filter(i => i.description.trim() && i.quantity > 0 && i.unitPrice > 0)
    if (validItems.length === 0) {
      toast.error('Add at least one item with description, quantity, and price')
      return
    }

    setLoading(true)
    try {
      await createInvoice({
        clientId,
        tripId: tripId || undefined,
        dueDate,
        taxRate: parseFloat(taxRate) || 0,
        notes: notes || undefined,
        terms: terms || undefined,
        items: validItems.map((item, idx) => ({
          description: item.description,
          quantity: item.quantity,
          unitPrice: item.unitPrice,
          total: item.quantity * item.unitPrice,
          order: idx,
        })),
      })
      toast.success('Invoice created successfully')
      resetForm()
      onOpenChange(false)
      onSubmit()
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to create invoice')
    } finally {
      setLoading(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v) resetForm(); onOpenChange(v) }}>
      <DialogContent className="max-w-2xl max-h-[95vh] flex flex-col overflow-hidden">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Receipt className="h-5 w-5 text-amber-500" />
            Create Invoice
          </DialogTitle>
          <DialogDescription>Add a new invoice for a client with line items and payment terms.</DialogDescription>
        </DialogHeader>

        <div className="space-y-4 pt-2 flex-1 min-h-0 overflow-y-auto">
          {/* Client */}
          <div>
            <Label className="text-sm font-medium">Client *</Label>
            <Select value={clientId} onValueChange={setClientId}>
              <SelectTrigger className="mt-1.5">
                <SelectValue placeholder="Select a client..." />
              </SelectTrigger>
              <SelectContent>
                {clients.filter(c => c.isActive).map((c) => (
                  <SelectItem key={c.id} value={c.id}>
                    {c.companyName}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Trip & Dates */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <Label className="text-sm font-medium">Due Date *</Label>
              <Input
                type="date"
                className="mt-1.5"
                value={dueDate}
                onChange={(e) => setDueDate(e.target.value)}
              />
            </div>
            <div>
              <Label className="text-sm font-medium">Tax Rate (%)</Label>
              <Input
                type="number"
                min="0"
                step="0.5"
                placeholder="0"
                className="mt-1.5"
                value={taxRate}
                onChange={(e) => setTaxRate(e.target.value)}
              />
            </div>
          </div>

          {/* Line Items */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <Label className="text-sm font-medium">Line Items *</Label>
              <Button variant="outline" size="sm" onClick={handleAddItem} className="h-7 text-xs">
                <Plus className="h-3 w-3 mr-1" />
                Add Item
              </Button>
            </div>
            <div className="space-y-2 max-h-60 overflow-y-auto rounded-md border p-2">
              {items.map((item, idx) => (
                <div key={idx} className="grid grid-cols-[1fr_60px_80px_28px] gap-2 items-end">
                  <div>
                    {idx === 0 && <span className="text-[10px] text-muted-foreground">Description</span>}
                    <Input
                      placeholder="Item description..."
                      className="h-8 text-sm"
                      value={item.description}
                      onChange={(e) => handleItemChange(idx, 'description', e.target.value)}
                    />
                  </div>
                  <div>
                    {idx === 0 && <span className="text-[10px] text-muted-foreground">Qty</span>}
                    <Input
                      type="number"
                      min="1"
                      className="h-8 text-sm"
                      value={item.quantity}
                      onChange={(e) => handleItemChange(idx, 'quantity', parseFloat(e.target.value) || 0)}
                    />
                  </div>
                  <div>
                    {idx === 0 && <span className="text-[10px] text-muted-foreground">Price</span>}
                    <Input
                      type="number"
                      min="0"
                      step="0.01"
                      className="h-8 text-sm"
                      value={item.unitPrice}
                      onChange={(e) => handleItemChange(idx, 'unitPrice', parseFloat(e.target.value) || 0)}
                    />
                  </div>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-8 w-7 p-0 text-muted-foreground hover:text-red-500"
                    onClick={() => handleRemoveItem(idx)}
                    disabled={items.length <= 1}
                  >
                    <X className="h-3 w-3" />
                  </Button>
                </div>
              ))}
            </div>
          </div>

          {/* Totals */}
          <div className="bg-muted/50 rounded-md p-3 space-y-1.5 text-sm">
            <div className="flex justify-between">
              <span className="text-muted-foreground">Subtotal</span>
              <span className="font-medium">{formatCurrency(subtotal)}</span>
            </div>
            {parseFloat(taxRate) > 0 && (
              <div className="flex justify-between">
                <span className="text-muted-foreground">Tax ({taxRate}%)</span>
                <span className="font-medium">{formatCurrency(tax)}</span>
              </div>
            )}
            <div className="flex justify-between pt-1.5 border-t">
              <span className="font-semibold">Total</span>
              <span className="font-bold text-amber-600">{formatCurrency(total)}</span>
            </div>
          </div>

          {/* Notes & Terms */}
          <div>
            <Label className="text-sm font-medium">Notes</Label>
            <Input
              placeholder="Internal notes..."
              className="mt-1.5"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
            />
          </div>
          <div>
            <Label className="text-sm font-medium">Payment Terms</Label>
            <Input
              placeholder="e.g. Net 30"
              className="mt-1.5"
              value={terms}
              onChange={(e) => setTerms(e.target.value)}
            />
          </div>
        </div>

        <DialogFooter className="shrink-0 border-t pt-3">
          <Button variant="outline" onClick={() => { resetForm(); onOpenChange(false) }}>
            Cancel
          </Button>
          <Button
            onClick={handleSubmit}
            disabled={loading}
            className="bg-amber-600 hover:bg-amber-700 text-white"
          >
            {loading ? (
              <>
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                Creating...
              </>
            ) : (
              'Create Invoice'
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

// ============ INVOICE DETAIL DIALOG ============

function InvoiceDetailDialog({
  invoice,
  open,
  onOpenChange,
  onRefresh,
}: {
  invoice: Invoice | null
  open: boolean
  onOpenChange: (open: boolean) => void
  onRefresh: () => void
}) {
  if (!invoice) return null

  const balance = invoice.totalAmount - invoice.paidAmount

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-xl max-h-[95vh] flex flex-col overflow-hidden">
        <DialogHeader>
          <div className="flex items-center justify-between">
            <DialogTitle className="flex items-center gap-2">
              <Receipt className="h-5 w-5 text-amber-500" />
              {invoice.invoiceNumber}
            </DialogTitle>
            {getStatusBadge(invoice.status)}
          </div>
          <DialogDescription>
            Invoice for {invoice.client?.companyName}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 flex-1 min-h-0 overflow-y-auto">
          {/* Client Info */}
          <div className="bg-muted/50 rounded-md p-3">
            <p className="text-xs text-muted-foreground mb-1">Bill To</p>
            <p className="font-medium text-sm">{invoice.client?.companyName}</p>
            <p className="text-xs text-muted-foreground">{invoice.client?.contactPerson}</p>
            <p className="text-xs text-muted-foreground">{invoice.client?.phone}{invoice.client?.email ? ` | ${invoice.client.email}` : ''}</p>
          </div>

          {/* Dates */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <p className="text-xs text-muted-foreground">Issue Date</p>
              <p className="text-sm font-medium">{formatDate(invoice.issueDate)}</p>
            </div>
            <div>
              <p className="text-xs text-muted-foreground">Due Date</p>
              <p className="text-sm font-medium">{formatDate(invoice.dueDate)}</p>
            </div>
          </div>

          {invoice.trip && (
            <div>
              <p className="text-xs text-muted-foreground">Trip Reference</p>
              <p className="text-sm font-medium">{invoice.trip.tripNumber}</p>
            </div>
          )}

          {/* Line Items */}
          <div>
            <p className="text-xs font-medium text-muted-foreground mb-2">Line Items</p>
            <div className="rounded-md border overflow-hidden">
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-muted/50">
                    <th className="text-left text-xs font-medium px-3 py-2">#</th>
                    <th className="text-left text-xs font-medium px-3 py-2">Description</th>
                    <th className="text-right text-xs font-medium px-3 py-2">Qty</th>
                    <th className="text-right text-xs font-medium px-3 py-2">Price</th>
                    <th className="text-right text-xs font-medium px-3 py-2">Total</th>
                  </tr>
                </thead>
                <tbody>
                  {invoice.items.map((item, idx) => (
                    <tr key={item.id} className={idx % 2 === 1 ? 'bg-muted/20' : ''}>
                      <td className="px-3 py-2 text-xs text-muted-foreground">{idx + 1}</td>
                      <td className="px-3 py-2 text-xs">{item.description}</td>
                      <td className="px-3 py-2 text-xs text-right">{item.quantity}</td>
                      <td className="px-3 py-2 text-xs text-right">{formatCurrency(item.unitPrice)}</td>
                      <td className="px-3 py-2 text-xs text-right font-medium">{formatCurrency(item.total)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          {/* Totals */}
          <div className="bg-muted/50 rounded-md p-3 space-y-1.5 text-sm">
            <div className="flex justify-between">
              <span className="text-muted-foreground">Subtotal</span>
              <span>{formatCurrency(invoice.subtotal)}</span>
            </div>
            {invoice.taxRate > 0 && (
              <div className="flex justify-between">
                <span className="text-muted-foreground">VAT ({invoice.taxRate}%)</span>
                <span>{formatCurrency(invoice.taxAmount)}</span>
              </div>
            )}
            <div className="flex justify-between pt-1.5 border-t font-bold">
              <span>Total</span>
              <span className="text-amber-600">{formatCurrency(invoice.totalAmount)}</span>
            </div>
            {invoice.paidAmount > 0 && (
              <>
                <div className="flex justify-between text-xs text-muted-foreground">
                  <span>Paid</span>
                  <span>{formatCurrency(invoice.paidAmount)}</span>
                </div>
                <div className="flex justify-between text-xs font-semibold">
                  <span>Balance Due</span>
                  <span className={balance > 0 ? 'text-red-500' : 'text-emerald-500'}>{formatCurrency(balance)}</span>
                </div>
              </>
            )}
          </div>

          {invoice.notes && (
            <div>
              <p className="text-xs font-medium text-muted-foreground mb-1">Notes</p>
              <p className="text-xs">{invoice.notes}</p>
            </div>
          )}
          {invoice.terms && (
            <div>
              <p className="text-xs font-medium text-muted-foreground mb-1">Payment Terms</p>
              <p className="text-xs">{invoice.terms}</p>
            </div>
          )}
        </div>

        <DialogFooter className="flex flex-col sm:flex-row gap-2 sm:gap-2 shrink-0 border-t pt-3">
          <div className="flex gap-2">
            <Button
              variant="outline"
              onClick={async () => {
                try {
                  toast.loading('Generating PDF...', { id: 'detail-pdf' })
                  await downloadInvoicePdf(invoice.id, invoice.invoiceNumber)
                  toast.success('PDF downloaded', { id: 'detail-pdf' })
                } catch { toast.error('Failed to generate PDF', { id: 'detail-pdf' }) }
              }}
              className="gap-1.5"
            >
              <FileDown className="h-4 w-4" />
              Download
            </Button>
            <Button
              variant="outline"
              onClick={async () => {
                try {
                  toast.loading('Preparing PDF...', { id: 'detail-print' })
                  await previewInvoicePdf(invoice.id)
                  toast.success('PDF opened for printing', { id: 'detail-print' })
                } catch { toast.error('Failed to generate PDF for printing', { id: 'detail-print' }) }
              }}
              className="gap-1.5"
            >
              <Printer className="h-4 w-4" />
              Print
            </Button>
          </div>
          <div className="flex gap-2 sm:ml-auto">
            {invoice.status === 'draft' && (
              <Button
                variant="outline"
                onClick={async () => {
                  try {
                    await updateInvoice(invoice.id, { status: 'sent' })
                    toast.success('Invoice marked as sent')
                    onOpenChange(false)
                    onRefresh()
                  } catch { toast.error('Failed to update status') }
                }}
                className="border-sky-200 text-sky-600 hover:bg-sky-50"
              >
                <Send className="h-4 w-4 mr-1" />
                Mark as Sent
              </Button>
            )}
            {invoice.status === 'sent' && (
              <Button
                variant="outline"
                onClick={async () => {
                  try {
                    await updateInvoice(invoice.id, { status: 'paid' })
                    toast.success('Invoice marked as paid')
                    onOpenChange(false)
                    onRefresh()
                  } catch { toast.error('Failed to update status') }
                }}
                className="border-emerald-200 text-emerald-600 hover:bg-emerald-50"
              >
                <CircleDollarSign className="h-4 w-4 mr-1" />
                Mark as Paid
              </Button>
            )}
            {(invoice.status === 'draft' || invoice.status === 'cancelled') && (
              <Button
                variant="outline"
                className="text-red-500 hover:text-red-600 hover:bg-red-50"
                onClick={async () => {
                  try {
                    await deleteInvoice(invoice.id)
                    toast.success('Invoice deleted')
                    onOpenChange(false)
                    onRefresh()
                  } catch (err) {
                    toast.error(err instanceof Error ? err.message : 'Failed to delete')
                  }
                }}
              >
                <Trash2 className="h-4 w-4 mr-1" />
                Delete
              </Button>
            )}
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

// ============ DELETE CONFIRM DIALOG ============

function DeleteConfirmDialog({
  open,
  onOpenChange,
  invoice,
  onConfirm,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  invoice: Invoice | null
  onConfirm: () => void
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-red-600">
            <AlertTriangle className="h-5 w-5" />
            Delete Invoice
          </DialogTitle>
          <DialogDescription>
            Are you sure you want to delete invoice <strong>{invoice?.invoiceNumber}</strong>?
            This action cannot be undone.
          </DialogDescription>
        </DialogHeader>
        <DialogFooter className="gap-2">
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button
            variant="destructive"
            onClick={() => { onConfirm(); onOpenChange(false) }}
          >
            Delete
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

// ============ MAIN VIEW ============

export function InvoicesView() {
  // Data state
  const [invoices, setInvoices] = useState<Invoice[]>([])
  const [clients, setClients] = useState<Client[]>([])
  const [summary, setSummary] = useState<InvoiceSummary | null>(null)
  const [loading, setLoading] = useState(true)
  const [total, setTotal] = useState(0)
  const [page, setPage] = useState(1)

  // Filter state
  const [search, setSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState('all')
  const [dateFrom, setDateFrom] = useState('')
  const [dateTo, setDateTo] = useState('')

  // Dialog state
  const [createOpen, setCreateOpen] = useState(false)
  const [detailInvoice, setDetailInvoice] = useState<Invoice | null>(null)
  const [detailOpen, setDetailOpen] = useState(false)
  const [deleteInvoiceState, setDeleteInvoiceState] = useState<Invoice | null>(null)
  const [deleteOpen, setDeleteOpen] = useState(false)

  // Bulk selection state
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set())
  const [bulkLoading, setBulkLoading] = useState(false)

  const { highlightEntityId, highlightClassName, scrollIntoView } = useEntityHighlight('invoice')
  const rowRefs = useRef<Record<string, HTMLElement | null>>({})

  const totalPages = Math.ceil(total / PAGE_SIZE)

  const loadData = useCallback(async (pageNum: number = 1) => {
    setLoading(true)
    try {
      const params: Record<string, string | number> = {
        page: pageNum,
        limit: PAGE_SIZE,
      }
      if (search) params.search = search
      if (statusFilter !== 'all') params.status = statusFilter
      if (dateFrom) params.dateFrom = dateFrom
      if (dateTo) params.dateTo = dateTo

      const searchParams = new URLSearchParams()
      Object.entries(params).forEach(([k, v]) => searchParams.set(k, String(v)))
      const qs = searchParams.toString()

      const result = await fetchInvoices(qs ? `?${qs}` : '')
      setInvoices(result.data)
      setTotal(result.total)
      setPage(result.page)
      setSummary(result.summary as InvoiceSummary)
    } catch {
      toast.error('Failed to load invoices')
    } finally {
      setLoading(false)
    }
  }, [search, statusFilter, dateFrom, dateTo])

  const loadClients = useCallback(async () => {
    try {
      const result = await fetchClients({ limit: 200 })
      setClients(result.data)
    } catch {
      // Silent fail for clients
    }
  }, [])

  useEffect(() => {
    loadData(1)
  }, [loadData])

  useEffect(() => {
    loadClients()
  }, [loadClients])

  // Scroll to highlighted row after data loads
  useEffect(() => {
    if (highlightEntityId && rowRefs.current[highlightEntityId]) {
      scrollIntoView(rowRefs.current[highlightEntityId])
    }
  }, [highlightEntityId, invoices, scrollIntoView])

  const handleSearch = (value: string) => {
    setSearch(value)
    setPage(1)
  }

  const handleStatusChange = (value: string) => {
    setStatusFilter(value)
    setPage(1)
  }

  const handlePageChange = (newPage: number) => {
    if (newPage < 1 || newPage > totalPages) return
    loadData(newPage)
  }

  const handleViewDetail = (invoice: Invoice) => {
    setDetailInvoice(invoice)
    setDetailOpen(true)
  }

  const handleDeleteClick = (invoice: Invoice) => {
    setDeleteInvoiceState(invoice)
    setDeleteOpen(true)
  }

  const handleDownload = async (invoice: Invoice) => {
    try {
      toast.loading('Generating PDF...', { id: 'invoice-pdf' })
      await downloadInvoicePdf(invoice.id, invoice.invoiceNumber)
      toast.success('PDF downloaded', { id: 'invoice-pdf' })
    } catch {
      toast.error('Failed to generate PDF', { id: 'invoice-pdf' })
    }
  }

  const handlePrint = async (invoice: Invoice) => {
    try {
      toast.loading('Preparing PDF for print...', { id: 'invoice-print' })
      await previewInvoicePdf(invoice.id)
      toast.success('PDF opened for printing', { id: 'invoice-print' })
    } catch {
      toast.error('Failed to generate PDF for printing', { id: 'invoice-print' })
    }
  }

  const handleMarkSent = async (invoice: Invoice) => {
    try {
      await updateInvoice(invoice.id, { status: 'sent' })
      toast.success('Invoice marked as sent')
      loadData(page)
    } catch { toast.error('Failed to update status') }
  }

  const handleMarkPaid = async (invoice: Invoice) => {
    try {
      await updateInvoice(invoice.id, { status: 'paid' })
      toast.success('Invoice marked as paid')
      loadData(page)
    } catch { toast.error('Failed to update status') }
  }

  const handleConfirmDelete = async () => {
    if (!deleteInvoiceState) return
    try {
      await deleteInvoice(deleteInvoiceState.id)
      toast.success('Invoice deleted')
      loadData(page)
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to delete')
    }
  }

  // Bulk selection handlers
  const toggleSelect = useCallback((id: string) => {
    setSelectedIds(prev => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }, [])

  const toggleSelectAll = useCallback(() => {
    if (selectedIds.size === invoices.length && invoices.every(inv => selectedIds.has(inv.id))) {
      setSelectedIds(new Set())
    } else {
      setSelectedIds(new Set(invoices.map(inv => inv.id)))
    }
  }, [invoices, selectedIds])

  const isAllSelected = invoices.length > 0 && invoices.every(inv => selectedIds.has(inv.id))
  const isSomeSelected = invoices.some(inv => selectedIds.has(inv.id)) && !isAllSelected

  const clearSelection = useCallback(() => {
    setSelectedIds(new Set())
  }, [])

  // Clear selection when filters/page change
  useEffect(() => {
    setSelectedIds(new Set())
  }, [search, statusFilter, dateFrom, dateTo, page])

  // Bulk action handler
  const handleBulkAction = useCallback(async (action: 'delete' | 'mark_sent' | 'mark_paid') => {
    if (selectedIds.size === 0) return
    if (action === 'delete' && !window.confirm(`Cancel ${selectedIds.size} selected invoice(s)? Draft and cancelled invoices will be permanently deleted. This action cannot be undone.`)) return

    setBulkLoading(true)
    try {
      const result = await bulkInvoiceAction(action, Array.from(selectedIds))
      if (result.errors.length > 0) {
        const skippedMsg = result.errors.map(e => e.message).filter((m, i, arr) => arr.indexOf(m) === i).join('; ')
        toast.warning(`${result.success} invoice(s) updated. ${result.failed} skipped: ${skippedMsg}`)
      } else {
        const actionLabel = action === 'delete' ? 'cancelled/deleted' : action === 'mark_sent' ? 'marked as sent' : 'marked as paid'
        toast.success(`${result.success} invoice(s) ${actionLabel} successfully`)
      }
      setSelectedIds(new Set())
      loadData(page)
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Bulk action failed')
    } finally {
      setBulkLoading(false)
    }
  }, [selectedIds, page, loadData])

  return (
    <div className="space-y-6">
      {/* Page Header */}
      <motion.div
        initial={{ opacity: 0, y: -10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.3 }}
        className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4"
      >
        <div>
          <h1 className="text-2xl font-bold tracking-tight flex items-center gap-2">
            <Receipt className="h-6 w-6 text-amber-500" />
            Invoices
          </h1>
          <p className="text-muted-foreground mt-1">
            Create and manage client invoices
          </p>
        </div>
        <Button
          onClick={() => setCreateOpen(true)}
          className="bg-amber-600 hover:bg-amber-700 text-white gap-2"
        >
          <Plus className="h-4 w-4" />
          New Invoice
        </Button>
      </motion.div>

      {/* Stats Cards */}
      <motion.div
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.3, delay: 0.1 }}
        className="grid grid-cols-2 lg:grid-cols-4 gap-4"
      >
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-3">
              <div className="rounded-lg bg-amber-100 dark:bg-amber-900/40 p-2">
                <Receipt className="h-4 w-4 text-amber-600 dark:text-amber-400" />
              </div>
              <div>
                <p className="text-xs text-muted-foreground">Total Invoices</p>
                <p className="text-lg font-bold">{summary?.totalInvoices ?? '—'}</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-3">
              <div className="rounded-lg bg-sky-100 dark:bg-sky-900/40 p-2">
                <CircleDollarSign className="h-4 w-4 text-sky-600 dark:text-sky-400" />
              </div>
              <div>
                <p className="text-xs text-muted-foreground">Outstanding</p>
                <p className="text-lg font-bold">{summary ? formatCurrency(summary.outstandingAmount) : '—'}</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-3">
              <div className="rounded-lg bg-red-100 dark:bg-red-900/40 p-2">
                <AlertTriangle className="h-4 w-4 text-red-600 dark:text-red-400" />
              </div>
              <div>
                <p className="text-xs text-muted-foreground">Overdue</p>
                <p className="text-lg font-bold">{summary?.overdueCount ?? '—'}</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-3">
              <div className="rounded-lg bg-emerald-100 dark:bg-emerald-900/40 p-2">
                <TrendingUp className="h-4 w-4 text-emerald-600 dark:text-emerald-400" />
              </div>
              <div>
                <p className="text-xs text-muted-foreground">Revenue (Month)</p>
                <p className="text-lg font-bold">{summary ? formatCurrency(summary.thisMonthRevenue) : '—'}</p>
              </div>
            </div>
          </CardContent>
        </Card>
      </motion.div>

      {/* Filters */}
      <motion.div
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.3, delay: 0.15 }}
      >
        <Card>
          <CardContent className="p-4">
            <div className="flex flex-col sm:flex-row gap-3">
              <div className="relative flex-1">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder="Search invoices..."
                  className="pl-9 h-9"
                  value={search}
                  onChange={(e) => handleSearch(e.target.value)}
                />
              </div>
              <Select value={statusFilter} onValueChange={handleStatusChange}>
                <SelectTrigger className="h-9 w-full sm:w-44">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {STATUS_OPTIONS.map((s) => (
                    <SelectItem key={s.value} value={s.value}>
                      {s.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Input
                type="date"
                className="h-9 w-full sm:w-40"
                placeholder="From"
                value={dateFrom}
                onChange={(e) => { setDateFrom(e.target.value); setPage(1) }}
              />
              <Input
                type="date"
                className="h-9 w-full sm:w-40"
                placeholder="To"
                value={dateTo}
                onChange={(e) => { setDateTo(e.target.value); setPage(1) }}
              />
            </div>
          </CardContent>
        </Card>
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
              {selectedIds.size} invoice{selectedIds.size !== 1 ? 's' : ''} selected
            </Badge>
          </div>
          <div className="flex items-center gap-2 flex-wrap">
            <Button
              size="sm"
              variant="outline"
              className="gap-1.5 text-xs border-sky-300 bg-white dark:bg-gray-900 hover:bg-sky-50 dark:hover:bg-sky-950/30"
              onClick={() => handleBulkAction('mark_sent')}
              disabled={bulkLoading}
            >
              <Send className="h-3.5 w-3.5 text-sky-600" />
              Mark as Sent
            </Button>
            <Button
              size="sm"
              variant="outline"
              className="gap-1.5 text-xs border-emerald-300 bg-white dark:bg-gray-900 hover:bg-emerald-50 dark:hover:bg-emerald-950/30"
              onClick={() => handleBulkAction('mark_paid')}
              disabled={bulkLoading}
            >
              <CircleDollarSign className="h-3.5 w-3.5 text-emerald-600" />
              Mark as Paid
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

      {/* Table */}
      <motion.div
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.3, delay: 0.2 }}
      >
        <Card>
          <CardHeader className="pb-3">
            <div className="flex items-center justify-between">
              <div>
                <CardTitle className="text-base">Invoice List</CardTitle>
                <CardDescription>
                  {total > 0
                    ? `Showing ${(page - 1) * PAGE_SIZE + 1}\u2013${Math.min(page * PAGE_SIZE, total)} of ${total}`
                    : 'No invoices match your filters'}
                </CardDescription>
              </div>
            </div>
          </CardHeader>
          <CardContent>
            {loading ? (
              <TableSkeleton />
            ) : invoices.length === 0 ? (
              <EmptyState onCreate={() => setCreateOpen(true)} />
            ) : (
              <>
                <div className="hidden md:block max-h-[480px] overflow-y-auto rounded-md border">
                  <Table>
                    <TableHeader>
                      <TableRow className="bg-muted/50">
                        <TableHead className="w-10">
                          <Checkbox
                            checked={isAllSelected ? true : isSomeSelected ? 'indeterminate' : false}
                            onCheckedChange={toggleSelectAll}
                            aria-label="Select all invoices"
                          />
                        </TableHead>
                        <TableHead className="text-xs font-semibold">Invoice #</TableHead>
                        <TableHead className="text-xs font-semibold">Client</TableHead>
                        <TableHead className="text-xs font-semibold hidden sm:table-cell">Issue Date</TableHead>
                        <TableHead className="text-xs font-semibold hidden md:table-cell">Due Date</TableHead>
                        <TableHead className="text-xs font-semibold">Status</TableHead>
                        <TableHead className="text-xs font-semibold text-right">Amount</TableHead>
                        <TableHead className="text-xs font-semibold text-right hidden sm:table-cell">Balance</TableHead>
                        <TableHead className="text-xs font-semibold text-right">Actions</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {invoices.map((inv) => {
                        const balance = inv.totalAmount - inv.paidAmount
                        return (
                          <TableRow key={inv.id} ref={(el) => { rowRefs.current[inv.id] = el }} className={`cursor-pointer hover:bg-muted/30 ${selectedIds.has(inv.id) ? 'bg-amber-50 dark:bg-amber-950/20' : ''} ${inv.id === highlightEntityId ? highlightClassName : ''}`} onClick={() => handleViewDetail(inv)}>
                            <TableCell onClick={(e) => e.stopPropagation()}>
                              <Checkbox
                                checked={selectedIds.has(inv.id)}
                                onCheckedChange={() => toggleSelect(inv.id)}
                                aria-label={`Select ${inv.invoiceNumber}`}
                              />
                            </TableCell>
                            <TableCell className="font-medium text-sm">{inv.invoiceNumber}</TableCell>
                            <TableCell className="text-sm max-w-[160px] truncate">{inv.client?.companyName}</TableCell>
                            <TableCell className="text-xs text-muted-foreground hidden sm:table-cell">{formatDate(inv.issueDate)}</TableCell>
                            <TableCell className="text-xs text-muted-foreground hidden md:table-cell">{formatDate(inv.dueDate)}</TableCell>
                            <TableCell>{getStatusBadge(inv.status)}</TableCell>
                            <TableCell className="text-sm font-medium text-right">{formatCurrency(inv.totalAmount)}</TableCell>
                            <TableCell className={`text-xs text-right hidden sm:table-cell font-medium ${balance > 0 ? 'text-red-500' : 'text-emerald-500'}`}>
                              {formatCurrency(balance)}
                            </TableCell>
                            <TableCell className="text-right">
                              <DropdownMenu>
                                <DropdownMenuTrigger asChild onClick={(e) => e.stopPropagation()}>
                                  <Button variant="ghost" size="sm" className="h-8 w-8 p-0">
                                    <MoreHorizontal className="h-4 w-4" />
                                  </Button>
                                </DropdownMenuTrigger>
                                <DropdownMenuContent align="end">
                                  <DropdownMenuItem onClick={(e) => { e.stopPropagation(); handleViewDetail(inv) }}>
                                    <Eye className="h-4 w-4 mr-2" />
                                    View Details
                                  </DropdownMenuItem>
                                  <DropdownMenuItem onClick={(e) => { e.stopPropagation(); handleDownload(inv) }}>
                                    <FileDown className="h-4 w-4 mr-2" />
                                    Download PDF
                                  </DropdownMenuItem>
                                  <DropdownMenuItem onClick={(e) => { e.stopPropagation(); handlePrint(inv) }}>
                                    <Printer className="h-4 w-4 mr-2" />
                                    Print
                                  </DropdownMenuItem>
                                  <DropdownMenuSeparator />
                                  {inv.status === 'draft' && (
                                    <DropdownMenuItem onClick={(e) => { e.stopPropagation(); handleMarkSent(inv) }}>
                                      <Send className="h-4 w-4 mr-2" />
                                      Mark as Sent
                                    </DropdownMenuItem>
                                  )}
                                  {inv.status === 'sent' && (
                                    <DropdownMenuItem onClick={(e) => { e.stopPropagation(); handleMarkPaid(inv) }}>
                                      <CircleDollarSign className="h-4 w-4 mr-2" />
                                      Mark as Paid
                                    </DropdownMenuItem>
                                  )}
                                  {(inv.status === 'draft' || inv.status === 'cancelled') && (
                                    <>
                                      <DropdownMenuSeparator />
                                      <DropdownMenuItem
                                        className="text-red-500 focus:text-red-600"
                                        onClick={(e) => { e.stopPropagation(); handleDeleteClick(inv) }}
                                      >
                                        <Trash2 className="h-4 w-4 mr-2" />
                                        Delete
                                      </DropdownMenuItem>
                                    </>
                                  )}
                                </DropdownMenuContent>
                              </DropdownMenu>
                            </TableCell>
                          </TableRow>
                        )
                      })}
                    </TableBody>
                  </Table>
                </div>

                {/* Mobile Card View */}
                <div className="md:hidden divide-y">
                  {invoices.map((inv) => {
                    const balance = inv.totalAmount - inv.paidAmount
                    return (
                      <div
                        key={inv.id}
                        className="mobile-card py-3 px-1"
                        onClick={() => handleViewDetail(inv)}
                      >
                        <div className="flex items-start justify-between gap-2 mb-1.5">
                          <div className="min-w-0">
                            <p className="font-semibold text-sm truncate">{inv.invoiceNumber}</p>
                            <p className="text-xs text-muted-foreground truncate">{inv.client?.companyName}</p>
                          </div>
                          <div className="flex items-center gap-2 shrink-0">
                            {getStatusBadge(inv.status)}
                          </div>
                        </div>
                        <div className="flex items-end justify-between gap-2">
                          <div className="flex gap-3 text-xs text-muted-foreground">
                            <span>Issued {formatDate(inv.issueDate)}</span>
                            <span>Due {formatDate(inv.dueDate)}</span>
                          </div>
                          <span className="font-bold text-sm whitespace-nowrap">{formatCurrency(inv.totalAmount)}</span>
                        </div>
                      </div>
                    )
                  })}
                </div>

                {/* Pagination */}
                {totalPages > 1 && (
                  <div className="flex items-center justify-between mt-4 pt-4 border-t">
                    <p className="text-xs text-muted-foreground">
                      Page {page} of {totalPages}
                    </p>
                    <div className="flex items-center gap-1">
                      <Button
                        variant="outline"
                        size="sm"
                        className="h-8 w-8 p-0"
                        disabled={page <= 1}
                        onClick={() => handlePageChange(page - 1)}
                      >
                        <ChevronLeft className="h-4 w-4" />
                      </Button>
                      {Array.from({ length: totalPages }, (_, i) => i + 1)
                        .filter((p) => p === 1 || p === totalPages || Math.abs(p - page) <= 1)
                        .reduce<(number | 'ellipsis')[]>((acc, p, idx, arr) => {
                          if (idx > 0 && p - arr[idx - 1] > 1) acc.push('ellipsis')
                          acc.push(p)
                          return acc
                        }, [])
                        .map((item, idx) =>
                          item === 'ellipsis' ? (
                            <span key={`ellipsis-${idx}`} className="text-xs text-muted-foreground px-1">...</span>
                          ) : (
                            <Button
                              key={item}
                              variant={page === item ? 'default' : 'outline'}
                              size="sm"
                              className={`h-8 w-8 p-0 text-xs ${page === item ? 'bg-amber-600 hover:bg-amber-700 text-white' : ''}`}
                              onClick={() => handlePageChange(item)}
                            >
                              {item}
                            </Button>
                          )
                        )}
                      <Button
                        variant="outline"
                        size="sm"
                        className="h-8 w-8 p-0"
                        disabled={page >= totalPages}
                        onClick={() => handlePageChange(page + 1)}
                      >
                        <ChevronRight className="h-4 w-4" />
                      </Button>
                    </div>
                  </div>
                )}
              </>
            )}
          </CardContent>
        </Card>
      </motion.div>

      {/* Dialogs */}
      <CreateInvoiceDialog
        open={createOpen}
        onOpenChange={setCreateOpen}
        clients={clients}
        onSubmit={() => loadData(page)}
      />
      <InvoiceDetailDialog
        invoice={detailInvoice}
        open={detailOpen}
        onOpenChange={setDetailOpen}
        onRefresh={() => loadData(page)}
      />
      <DeleteConfirmDialog
        open={deleteOpen}
        onOpenChange={setDeleteOpen}
        invoice={deleteInvoiceState}
        onConfirm={handleConfirmDelete}
      />
    </div>
  )
}

export default InvoicesView
