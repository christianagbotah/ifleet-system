'use client'

import React, { useState, useEffect } from 'react'
import { FileText, Plus, Trash2, Printer, Download, CheckCircle2, X, Loader2, Pencil } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Badge } from '@/components/ui/badge'
import { Separator } from '@/components/ui/separator'
import { CURRENCY_SYMBOL } from '@/lib/constants'
import { apiFetch } from '@/lib/api'
import { toast } from 'sonner'

// ============ Types ============

interface InvoiceItem {
  id?: string
  description: string
  quantity: number
  unitPrice: number
  total: number
  order: number
}

interface GeneratedInvoice {
  id: string
  invoiceNumber: string
  clientId: string
  tripId: string
  issueDate: string
  dueDate: string
  status: string
  subtotal: number
  taxAmount: number
  taxRate: number
  totalAmount: number
  notes?: string | null
  terms?: string | null
  client?: { id: string; companyName: string; contactPerson: string; phone: string; email: string } | null
  items: InvoiceItem[]
}

interface TripInvoicePanelProps {
  invoice: GeneratedInvoice
  tripNumber: string
  onClose: () => void
  onFinalized?: () => void
}

// ============ Component ============

export function TripInvoicePanel({ invoice: initialInvoice, tripNumber, onClose, onFinalized }: TripInvoicePanelProps) {
  const [invoice, setInvoice] = useState<GeneratedInvoice>(initialInvoice)
  const [items, setItems] = useState<InvoiceItem[]>(initialInvoice.items || [])
  const [taxRate, setTaxRate] = useState(initialInvoice.taxRate || 0)
  const [notes, setNotes] = useState(initialInvoice.notes || '')
  const [terms, setTerms] = useState(initialInvoice.terms || '')
  const [dueDate, setDueDate] = useState(
    initialInvoice.dueDate ? new Date(initialInvoice.dueDate).toISOString().split('T')[0] : ''
  )
  const [isEditing, setIsEditing] = useState(false)
  const [saving, setSaving] = useState(false)
  const [printing, setPrinting] = useState(false)

  // Computed totals
  const subtotal = items.reduce((sum, item) => sum + (item.quantity * item.unitPrice), 0)
  const taxAmount = (subtotal * taxRate) / 100
  const totalAmount = subtotal + taxAmount

  // Add a new blank line item
  function addLineItem() {
    const newOrder = items.length > 0 ? Math.max(...items.map(i => i.order)) + 1 : 0
    setItems(prev => [...prev, {
      description: '',
      quantity: 1,
      unitPrice: 0,
      total: 0,
      order: newOrder,
    }])
  }

  // Remove a line item
  function removeLineItem(index: number) {
    setItems(prev => prev.filter((_, i) => i !== index))
  }

  // Update a line item field
  function updateLineItem(index: number, field: keyof InvoiceItem, value: string | number) {
    setItems(prev => {
      const updated = [...prev]
      updated[index] = { ...updated[index], [field]: value }
      // Recalculate total when quantity or unitPrice changes
      if (field === 'quantity' || field === 'unitPrice') {
        updated[index].total = updated[index].quantity * updated[index].unitPrice
      }
      return updated
    })
  }

  // Save all edits
  async function saveChanges() {
    setSaving(true)
    try {
      const updated = await apiFetch<GeneratedInvoice>(`/api/invoices/${invoice.id}`, {
        method: 'PUT',
        body: JSON.stringify({
          taxRate,
          notes,
          terms,
          dueDate: dueDate || undefined,
          items: items.map((item, index) => ({
            ...item,
            total: item.quantity * item.unitPrice,
            order: index,
          })),
        }),
      })
      setInvoice(updated)
      setIsEditing(false)
      toast.success('Invoice updated successfully')
    } catch (err) {
      toast.error('Failed to update invoice')
    } finally {
      setSaving(false)
    }
  }

  // Finalize invoice (change status to sent)
  async function finalizeInvoice() {
    setSaving(true)
    try {
      const updated = await apiFetch<GeneratedInvoice>(`/api/invoices/${invoice.id}`, {
        method: 'PUT',
        body: JSON.stringify({ status: 'sent' }),
      })
      setInvoice(updated)
      toast.success('Invoice finalized — ready for delivery', {
        description: `Invoice ${invoice.invoiceNumber} is now active.`,
      })
      onFinalized?.()
    } catch (err) {
      toast.error('Failed to finalize invoice')
    } finally {
      setSaving(false)
    }
  }

  // Download/print PDF
  async function downloadPdf() {
    setPrinting(true)
    try {
      const res = await fetch(`/api/invoices/${invoice.id}/pdf`)
      if (!res.ok) throw new Error('Failed to generate PDF')
      const blob = await res.blob()
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `invoice_${invoice.invoiceNumber}.pdf`
      document.body.appendChild(a)
      a.click()
      document.body.removeChild(a)
      URL.revokeObjectURL(url)
      toast.success('Invoice PDF downloaded')
    } catch {
      toast.error('Failed to download invoice PDF')
    } finally {
      setPrinting(false)
    }
  }

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="p-2 rounded-lg bg-emerald-100 dark:bg-emerald-900/30">
            <FileText className="h-5 w-5 text-emerald-600" />
          </div>
          <div>
            <h3 className="font-semibold text-sm">Invoice Generated</h3>
            <p className="text-xs text-muted-foreground">
              {invoice.invoiceNumber} · Trip {tripNumber}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Badge
            className={
              invoice.status === 'draft'
                ? 'bg-amber-100 text-amber-700'
                : 'bg-emerald-100 text-emerald-700'
            }
          >
            {invoice.status === 'draft' ? 'Draft' : 'Sent'}
          </Badge>
          {!isEditing && (
            <Button
              variant="outline"
              size="sm"
              onClick={() => setIsEditing(true)}
              className="h-7 text-xs"
            >
              <Pencil className="h-3 w-3 mr-1" />
              Edit
            </Button>
          )}
          <Button variant="ghost" size="sm" onClick={onClose} className="h-7 w-7 p-0">
            <X className="h-4 w-4" />
          </Button>
        </div>
      </div>

      <Separator />

      {/* Client info */}
      {invoice.client && (
        <div className="rounded-md bg-muted/50 p-3">
          <p className="text-xs text-muted-foreground mb-1">Billed To</p>
          <p className="text-sm font-medium">{invoice.client.companyName}</p>
          {(invoice.client.contactPerson || invoice.client.phone) && (
            <p className="text-xs text-muted-foreground">
              {[invoice.client.contactPerson, invoice.client.phone].filter(Boolean).join(' · ')}
            </p>
          )}
        </div>
      )}

      {/* Line Items Table */}
      <div className="border rounded-md overflow-hidden">
        <div className="bg-muted/50 px-3 py-2">
          <div className="grid grid-cols-12 gap-2 text-xs font-medium text-muted-foreground">
            <div className="col-span-6">Description</div>
            <div className="col-span-2 text-right">Qty</div>
            <div className="col-span-2 text-right">Unit Price</div>
            <div className="col-span-2 text-right">Total</div>
          </div>
        </div>
        <div className="divide-y max-h-48 overflow-y-auto">
          {items.map((item, index) => (
            <div key={index} className="grid grid-cols-12 gap-2 px-3 py-2 items-center text-sm">
              {isEditing ? (
                <>
                  <div className="col-span-6">
                    <Input
                      value={item.description}
                      onChange={e => updateLineItem(index, 'description', e.target.value)}
                      placeholder="Item description"
                      className="h-7 text-xs"
                    />
                  </div>
                  <div className="col-span-2">
                    <Input
                      type="number"
                      value={item.quantity}
                      onChange={e => updateLineItem(index, 'quantity', parseFloat(e.target.value) || 0)}
                      className="h-7 text-xs text-right"
                    />
                  </div>
                  <div className="col-span-2">
                    <Input
                      type="number"
                      value={item.unitPrice}
                      onChange={e => updateLineItem(index, 'unitPrice', parseFloat(e.target.value) || 0)}
                      className="h-7 text-xs text-right"
                    />
                  </div>
                  <div className="col-span-1 text-right text-xs font-medium">
                    {CURRENCY_SYMBOL}{(item.quantity * item.unitPrice).toLocaleString('en-GH', { minimumFractionDigits: 2 })}
                  </div>
                  <div className="col-span-1 flex justify-end">
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => removeLineItem(index)}
                      className="h-6 w-6 p-0 text-muted-foreground hover:text-destructive"
                    >
                      <Trash2 className="h-3 w-3" />
                    </Button>
                  </div>
                </>
              ) : (
                <>
                  <div className="col-span-6 text-sm">{item.description}</div>
                  <div className="col-span-2 text-right text-sm">{item.quantity}</div>
                  <div className="col-span-2 text-right text-sm">{CURRENCY_SYMBOL}{item.unitPrice.toLocaleString('en-GH', { minimumFractionDigits: 2 })}</div>
                  <div className="col-span-2 text-right text-sm font-medium">{CURRENCY_SYMBOL}{(item.quantity * item.unitPrice).toLocaleString('en-GH', { minimumFractionDigits: 2 })}</div>
                </>
              )}
            </div>
          ))}
          {items.length === 0 && (
            <div className="px-3 py-6 text-center text-sm text-muted-foreground">
              No line items
            </div>
          )}
        </div>
      </div>

      {/* Add Extra Charge button */}
      {isEditing && (
        <Button
          variant="outline"
          size="sm"
          onClick={addLineItem}
          className="w-full border-dashed"
        >
          <Plus className="h-3.5 w-3.5 mr-1.5" />
          Add Extra Charge
        </Button>
      )}

      {/* Totals */}
      <div className="flex justify-end">
        <div className="w-64 space-y-1.5">
          {isEditing && (
            <div className="flex items-center justify-between text-xs">
              <span className="text-muted-foreground">Tax Rate (%)</span>
              <Input
                type="number"
                value={taxRate}
                onChange={e => setTaxRate(parseFloat(e.target.value) || 0)}
                className="h-7 w-20 text-right text-xs"
              />
            </div>
          )}
          <div className="flex items-center justify-between text-sm">
            <span className="text-muted-foreground">Subtotal</span>
            <span>{CURRENCY_SYMBOL}{subtotal.toLocaleString('en-GH', { minimumFractionDigits: 2 })}</span>
          </div>
          {taxAmount > 0 && (
            <div className="flex items-center justify-between text-sm text-muted-foreground">
              <span>Tax ({taxRate}%)</span>
              <span>{CURRENCY_SYMBOL}{taxAmount.toLocaleString('en-GH', { minimumFractionDigits: 2 })}</span>
            </div>
          )}
          <Separator />
          <div className="flex items-center justify-between text-base font-semibold">
            <span>Total</span>
            <span className="text-emerald-600">{CURRENCY_SYMBOL}{totalAmount.toLocaleString('en-GH', { minimumFractionDigits: 2 })}</span>
          </div>
        </div>
      </div>

      {/* Notes & Terms (editable) */}
      {isEditing && (
        <div className="space-y-3">
          <div className="space-y-1.5">
            <label className="text-xs font-medium text-muted-foreground">Notes</label>
            <Textarea
              value={notes}
              onChange={e => setNotes(e.target.value)}
              placeholder="Additional notes for the customer..."
              className="text-sm min-h-[60px] resize-none"
            />
          </div>
          <div className="space-y-1.5">
            <label className="text-xs font-medium text-muted-foreground">Due Date</label>
            <Input
              type="date"
              value={dueDate}
              onChange={e => setDueDate(e.target.value)}
              className="h-8 text-sm max-w-[200px]"
            />
          </div>
        </div>
      )}

      {/* Actions */}
      <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end pt-2">
        {isEditing ? (
          <>
            <Button variant="outline" size="sm" onClick={() => { setIsEditing(false) }}>
              Cancel
            </Button>
            <Button size="sm" onClick={saveChanges} disabled={saving} className="bg-emerald-600 hover:bg-emerald-700">
              {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <CheckCircle2 className="h-4 w-4 mr-1.5" />}
              Save Changes
            </Button>
          </>
        ) : (
          <>
            {invoice.status === 'draft' && (
              <Button
                size="sm"
                onClick={finalizeInvoice}
                disabled={saving}
                className="bg-emerald-600 hover:bg-emerald-700"
              >
                {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <CheckCircle2 className="h-4 w-4 mr-1.5" />}
                Finalize Invoice
              </Button>
            )}
            <Button
              variant="outline"
              size="sm"
              onClick={downloadPdf}
              disabled={printing}
            >
              {printing ? <Loader2 className="h-4 w-4 animate-spin" /> : <Download className="h-4 w-4 mr-1.5" />}
              Download PDF
            </Button>
          </>
        )}
      </div>
    </div>
  )
}
