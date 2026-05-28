'use client'

import {
  Receipt,
  Send,
  Trash2,
  FileDown,
  Printer,
  CircleDollarSign,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { ResponsiveSheet } from '@/components/ui/responsive-sheet'
import {
  updateInvoice,
  deleteInvoice,
  downloadInvoicePdf,
  previewInvoicePdf,
  type Invoice,
} from '@/lib/api'
import { CURRENCY_SYMBOL } from '@/lib/constants'
import { toast } from 'sonner'

// ────────────────────────────────────────────────────────────────────
// Helpers (extracted so they can be reused across invoice views)
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
  if (!invoice) return null

  const balance = invoice.totalAmount - invoice.paidAmount

  const handleMarkSent = async () => {
    try {
      await updateInvoice(invoice.id, { status: 'sent' })
      toast.success('Invoice marked as sent')
      onOpenChange(false)
      onRefresh()
    } catch {
      toast.error('Failed to update status')
    }
  }

  const handleMarkPaid = async () => {
    try {
      await updateInvoice(invoice.id, { status: 'paid' })
      toast.success('Invoice marked as paid')
      onOpenChange(false)
      onRefresh()
    } catch {
      toast.error('Failed to update status')
    }
  }

  const handleDelete = async () => {
    try {
      await deleteInvoice(invoice.id)
      toast.success('Invoice deleted')
      onOpenChange(false)
      onRefresh()
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to delete')
    }
  }

  const handleDownloadPdf = async () => {
    try {
      toast.loading('Generating PDF...', { id: 'detail-pdf' })
      await downloadInvoicePdf(invoice.id, invoice.invoiceNumber)
      toast.success('PDF downloaded', { id: 'detail-pdf' })
    } catch {
      toast.error('Failed to generate PDF', { id: 'detail-pdf' })
    }
  }

  const handlePrint = async () => {
    try {
      toast.loading('Preparing PDF...', { id: 'detail-print' })
      await previewInvoicePdf(invoice.id)
      toast.success('PDF opened for printing', { id: 'detail-print' })
    } catch {
      toast.error('Failed to generate PDF for printing', { id: 'detail-print' })
    }
  }

  return (
    <ResponsiveSheet
      open={open}
      onOpenChange={onOpenChange}
      title={
        <span className="flex items-center gap-2">
          <Receipt className="h-4 w-4 text-amber-500 shrink-0" />
          {invoice.invoiceNumber}
        </span>
      }
      description={`Invoice for ${invoice.client?.companyName ?? 'Unknown'}`}
      width="sm:max-w-lg"
    >
      {/* ── Body ── */}
      <div className="space-y-5 p-4 md:p-6">
        {/* Status badge + quick info */}
        <div className="flex items-center justify-between">
          {getStatusBadge(invoice.status)}
          <span className="text-xs text-muted-foreground">
            Created {formatDate(invoice.createdAt)}
          </span>
        </div>

        {/* Client Info */}
        <div className="bg-muted/50 rounded-lg p-3">
          <p className="text-xs text-muted-foreground mb-1">Bill To</p>
          <p className="font-medium text-sm">{invoice.client?.companyName}</p>
          <p className="text-xs text-muted-foreground">{invoice.client?.contactPerson}</p>
          <p className="text-xs text-muted-foreground">
            {invoice.client?.phone}
            {invoice.client?.email ? ` | ${invoice.client.email}` : ''}
          </p>
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
          <div className="rounded-lg border overflow-hidden">
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
        <div className="bg-muted/50 rounded-lg p-3 space-y-1.5 text-sm">
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
                <span className={balance > 0 ? 'text-red-500' : 'text-emerald-500'}>
                  {formatCurrency(balance)}
                </span>
              </div>
            </>
          )}
        </div>

        {/* Notes & Terms */}
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

      {/* ── Footer ── */}
      <ResponsiveSheet.Footer>
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
            {invoice.status === 'draft' && (
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
            {invoice.status === 'sent' && (
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
            {(invoice.status === 'draft' || invoice.status === 'cancelled') && (
              <Button
                variant="outline"
                size="sm"
                onClick={handleDelete}
                className="flex-1 text-red-500 hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-950/30"
              >
                <Trash2 className="h-4 w-4 mr-1" />
                Delete
              </Button>
            )}
          </div>
        </div>
      </ResponsiveSheet.Footer>
    </ResponsiveSheet>
  )
}

// ────────────────────────────────────────────────────────────────────
// Namespace sub-component for convenience
// ────────────────────────────────────────────────────────────────────

ResponsiveSheet.Footer = function ResponsiveSheetFooter({
  children,
  className,
}: {
  children: React.ReactNode
  className?: string
}) {
  return <div className={className}>{children}</div>
}
