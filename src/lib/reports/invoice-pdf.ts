// ══════════════════════════════════════════════════════════════════════
// ${APP_NAME} — Invoice PDF Generator
// ══════════════════════════════════════════════════════════════════════
//
// Generates a professional portrait A4 invoice document with company header,
// client details, line items table, totals, and payment terms.
// ────────────────────────────────────────────────────────────────────

import jsPDF from 'jspdf'
import { db } from '@/lib/db'
import { fmtDate } from './pdf-generator'
import { APP_NAME, APP_TAGLINE } from '@/lib/constants'
import { registerFonts, getFontFamily } from './pdf-font'

const FF = getFontFamily()

// ── Brand Colors ──
const C = {
  amber: [217, 119, 6] as [number, number, number],
  dark: [28, 25, 23] as [number, number, number],
  gray: [120, 113, 108] as [number, number, number],
  light: [255, 251, 235] as [number, number, number],
  border: [214, 211, 209] as [number, number, number],
  white: [255, 255, 255] as [number, number, number],
  green: [22, 163, 74] as [number, number, number],
}

/** Format a number as ₵ currency string */
function ghs(amount: number): string {
  return `₵${amount.toLocaleString('en-GH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
}

/**
 * Build a professional invoice PDF for a given invoice.
 * Portrait A4 format with branded styling.
 */
export async function buildInvoicePdf(invoiceId: string): Promise<jsPDF> {
  const invoice = await db.invoice.findUnique({
    where: { id: invoiceId },
    include: {
      client: { select: { id: true, companyName: true, contactPerson: true, phone: true, email: true, address: true, city: true, region: true } },
      trip: { select: { id: true, tripNumber: true } },
      InvoiceItem: { orderBy: { order: 'asc' } },
    },
  })

  if (!invoice) {
    throw new Error(`Invoice not found: ${invoiceId}`)
  }

  const doc = new jsPDF({ orientation: 'portrait', format: 'a4', unit: 'mm' })
  registerFonts(doc)
  const pw = 210
  const margin = 15
  const contentW = pw - margin * 2
  let y = 0

  // ════════════════════════════════════════════════════════════
  // 1. HEADER
  // ════════════════════════════════════════════════════════════
  doc.setFillColor(...C.amber)
  doc.rect(0, 0, pw, 20, 'F')

  doc.setFont(FF, 'bold')
  doc.setFontSize(16)
  doc.setTextColor(...C.white)
  doc.text(APP_NAME, margin, 13)

  doc.setFont(FF, 'normal')
  doc.setFontSize(8)
  doc.text(APP_TAGLINE, pw - margin, 8, { align: 'right' })
  doc.text('37 Ring Road Central, Accra, Ghana', pw - margin, 13, { align: 'right' })
  doc.text('+233 30 277 8899', pw - margin, 18, { align: 'right' })

  y = 25

  // ════════════════════════════════════════════════════════════
  // 2. INVOICE TITLE & META
  // ════════════════════════════════════════════════════════════
  doc.setFont(FF, 'bold')
  doc.setFontSize(20)
  doc.setTextColor(...C.amber)
  doc.text('INVOICE', margin, y)
  y += 6

  doc.setFont(FF, 'normal')
  doc.setFontSize(9)
  doc.setTextColor(...C.dark)
  doc.text(`Invoice No: ${invoice.invoiceNumber}`, margin, y)

  const statusLabel = invoice.status.toUpperCase().replace(/_/g, ' ')
  const statusColor = invoice.status === 'paid' ? C.green : invoice.status === 'overdue' ? [220, 38, 38] as [number, number, number] : C.gray
  doc.setTextColor(...statusColor)
  doc.setFont(FF, 'bold')
  doc.text(statusLabel, pw - margin, y, { align: 'right' })
  y += 2

  doc.setDrawColor(...C.amber)
  doc.setLineWidth(0.8)
  doc.line(margin, y, pw - margin, y)
  y += 6

  // ════════════════════════════════════════════════════════════
  // 3. BILL TO / CLIENT DETAILS
  // ════════════════════════════════════════════════════════════
  doc.setFillColor(...C.light)
  doc.roundedRect(margin, y, contentW, 30, 2, 2, 'F')

  doc.setFont(FF, 'bold')
  doc.setFontSize(8)
  doc.setTextColor(...C.amber)
  doc.text('BILL TO', margin + 4, y + 5)

  const client = invoice.client
  doc.setFont(FF, 'bold')
  doc.setFontSize(10)
  doc.setTextColor(...C.dark)
  doc.text(client.companyName, margin + 4, y + 11)

  doc.setFont(FF, 'normal')
  doc.setFontSize(8)
  doc.setTextColor(...C.gray)

  const clientAddress = [client.address, client.city, client.region].filter(Boolean).join(', ')
  doc.text(`Contact: ${client.contactPerson}`, margin + 4, y + 16)
  doc.text(`Phone: ${client.phone}${client.email ? `  |  ${client.email}` : ''}`, margin + 4, y + 21)
  if (clientAddress) {
    doc.text(`Address: ${clientAddress}`, margin + 4, y + 26)
  }

  y += 34

  // ════════════════════════════════════════════════════════════
  // 4. INVOICE DETAILS (Date, Due, Trip ref)
  // ════════════════════════════════════════════════════════════
  doc.setFillColor(245, 245, 244)
  doc.roundedRect(margin, y, contentW, 16, 2, 2, 'F')

  const details = [
    { label: 'Issue Date', value: fmtDate(invoice.issueDate) },
    { label: 'Due Date', value: fmtDate(invoice.dueDate) },
    { label: 'Trip Ref', value: invoice.trip?.tripNumber || 'N/A' },
    { label: 'Payment Terms', value: invoice.terms || 'Net 30' },
  ]

  // Two-column layout
  details.forEach((item, idx) => {
    const col = idx < 2 ? 0 : 1
    const row = idx < 2 ? idx : idx - 2
    const ix = margin + 4 + col * (contentW / 2)
    const iy = y + 5 + row * 5.5

    doc.setFont(FF, 'normal')
    doc.setFontSize(7)
    doc.setTextColor(...C.gray)
    doc.text(`${item.label}:`, ix, iy)

    doc.setFont(FF, 'bold')
    doc.setFontSize(8)
    doc.setTextColor(...C.dark)
    doc.text(item.value, ix + 28, iy)
  })

  y += 20

  // ════════════════════════════════════════════════════════════
  // 5. LINE ITEMS TABLE
  // ════════════════════════════════════════════════════════════
  doc.setFont(FF, 'bold')
  doc.setFontSize(8)
  doc.setTextColor(...C.amber)
  doc.text('LINE ITEMS', margin, y)
  y += 4

  if (invoice.InvoiceItem.length > 0) {
    const tableHeaders = ['#', 'Description', 'Qty', 'Unit Price', 'Total']
    const tableRows = invoice.InvoiceItem.map((item) => [
      String(item.order + 1),
      item.description,
      item.quantity.toString(),
      ghs(item.unitPrice),
      ghs(item.total),
    ])

    doc.setFont(FF, 'normal')
    const tableStartY = y

    // Table header row
    const colWidths = [12, contentW - 12 - 30 - 35 - 35, 30, 35, 35]
    let cx = margin
    const headerH = 7

    doc.setFillColor(...C.amber)
    doc.rect(margin, tableStartY, contentW, headerH, 'F')

    tableHeaders.forEach((header, idx) => {
      doc.setTextColor(...C.white)
      doc.setFontSize(7)
      doc.setFont(FF, 'bold')
      doc.text(header, cx + 2, tableStartY + 5, { align: idx > 1 ? 'right' : 'left' })
      cx += colWidths[idx]
    })

    y = tableStartY + headerH

    // Table body rows
    invoice.InvoiceItem.forEach((item, rowIdx) => {
      if (y > 260) {
        doc.addPage()
        doc.setFillColor(...C.amber)
        doc.rect(0, 0, pw, 14, 'F')
        doc.setFont(FF, 'bold')
        doc.setFontSize(10)
        doc.setTextColor(...C.white)
        doc.text(APP_NAME, margin, 10)
        y = 18
      }

      const rowH = 7
      const rowBg = rowIdx % 2 === 1 ? C.light : C.white

      doc.setFillColor(...rowBg)
      doc.rect(margin, y, contentW, rowH, 'F')

      const rowData = [
        String(rowIdx + 1),
        item.description,
        item.quantity.toString(),
        ghs(item.unitPrice),
        ghs(item.total),
      ]

      cx = margin
      rowData.forEach((cell, idx) => {
        doc.setTextColor(...C.dark)
        doc.setFont(FF, 'normal')
        doc.setFontSize(7)
        doc.text(cell, cx + 2, y + 5, { align: idx > 1 ? 'right' : 'left' })
        cx += colWidths[idx]
      })

      y += rowH
    })

    // Bottom border
    doc.setDrawColor(...C.border)
    doc.setLineWidth(0.3)
    doc.line(margin, y, pw - margin, y)
    y += 6
  } else {
    doc.setFont(FF, 'normal')
    doc.setFontSize(8)
    doc.setTextColor(...C.gray)
    doc.text('No line items on this invoice.', margin + 4, y + 4)
    y += 12
  }

  // ════════════════════════════════════════════════════════════
  // 6. TOTALS
  // ════════════════════════════════════════════════════════════
  const totalsH = 38
  doc.setFillColor(28, 25, 23)
  doc.roundedRect(margin, y, contentW, totalsH, 2, 2, 'F')

  // Amber left accent
  doc.setFillColor(...C.amber)
  doc.rect(margin, y, 3, totalsH, 'F')

  let ty = y + 8

  // Subtotal
  doc.setFont(FF, 'normal')
  doc.setFontSize(8)
  doc.setTextColor(168, 162, 158)
  doc.text('Subtotal', margin + 8, ty)
  doc.setFont(FF, 'bold')
  doc.setFontSize(10)
  doc.setTextColor(...C.white)
  doc.text(ghs(invoice.subtotal), pw - margin - 4, ty, { align: 'right' })
  ty += 8

  // Tax
  doc.setFont(FF, 'normal')
  doc.setFontSize(8)
  doc.setTextColor(168, 162, 158)
  const taxPercent = invoice.taxRate > 0 ? `VAT (${invoice.taxRate}%)` : 'Tax'
  doc.text(`${taxPercent}`, margin + 8, ty)
  doc.setFont(FF, 'bold')
  doc.setFontSize(10)
  doc.setTextColor(...C.white)
  doc.text(ghs(invoice.taxAmount), pw - margin - 4, ty, { align: 'right' })
  ty += 8

  // Divider
  doc.setDrawColor(120, 113, 108)
  doc.setLineWidth(0.3)
  doc.line(margin + 8, ty - 1, pw - margin - 4, ty - 1)

  // Total
  ty += 2
  doc.setFont(FF, 'bold')
  doc.setFontSize(11)
  doc.setTextColor(...C.amber)
  doc.text('TOTAL DUE', margin + 8, ty)
  doc.setFont(FF, 'bold')
  doc.setFontSize(16)
  doc.setTextColor(...C.white)
  doc.text(ghs(invoice.totalAmount), pw - margin - 4, ty, { align: 'right' })

  y += totalsH + 6

  // ════════════════════════════════════════════════════════════
  // 7. PAYMENT STATUS
  // ════════════════════════════════════════════════════════════
  if (invoice.paidAmount > 0) {
    const balance = invoice.totalAmount - invoice.paidAmount
    doc.setFillColor(245, 245, 244)
    doc.roundedRect(margin, y, contentW, 10, 2, 2, 'F')

    doc.setFont(FF, 'normal')
    doc.setFontSize(7)
    doc.setTextColor(...C.dark)
    doc.text(`Paid: ${ghs(invoice.paidAmount)}`, margin + 4, y + 6)
    doc.setFont(FF, 'bold')
    doc.setTextColor(balance <= 0 ? C.green : C.dark)
    doc.text(`Balance Due: ${ghs(balance)}`, pw - margin - 4, y + 6, { align: 'right' })
    y += 14
  }

  // ════════════════════════════════════════════════════════════
  // 8. NOTES (if any)
  // ════════════════════════════════════════════════════════════
  if (invoice.notes) {
    if (y > 255) {
      doc.addPage()
      doc.setFillColor(...C.amber)
      doc.rect(0, 0, pw, 14, 'F')
      doc.setFont(FF, 'bold')
      doc.setFontSize(10)
      doc.setTextColor(...C.white)
      doc.text(APP_NAME, margin, 10)
      y = 18
    }

    doc.setFont(FF, 'bold')
    doc.setFontSize(8)
    doc.setTextColor(...C.amber)
    doc.text('NOTES', margin, y)
    y += 4

    doc.setFillColor(...C.light)
    const noteLines = doc.splitTextToSize(invoice.notes, contentW - 10)
    const noteH = Math.min(noteLines.length * 4, 20)
    doc.roundedRect(margin, y, contentW, noteH + 4, 2, 2, 'F')

    doc.setFont(FF, 'normal')
    doc.setFontSize(8)
    doc.setTextColor(...C.dark)
    doc.text(noteLines.slice(0, 5), margin + 5, y + 6)

    y += noteH + 8
  }

  // ════════════════════════════════════════════════════════════
  // 9. TERMS (if any)
  // ════════════════════════════════════════════════════════════
  if (invoice.terms) {
    if (y > 260) {
      doc.addPage()
      doc.setFillColor(...C.amber)
      doc.rect(0, 0, pw, 14, 'F')
      doc.setFont(FF, 'bold')
      doc.setFontSize(10)
      doc.setTextColor(...C.white)
      doc.text(APP_NAME, margin, 10)
      y = 18
    }

    doc.setFont(FF, 'bold')
    doc.setFontSize(8)
    doc.setTextColor(...C.amber)
    doc.text('PAYMENT TERMS', margin, y)
    y += 4

    doc.setFillColor(245, 245, 244)
    const termLines = doc.splitTextToSize(invoice.terms, contentW - 10)
    const termH = Math.min(termLines.length * 4, 20)
    doc.roundedRect(margin, y, contentW, termH + 4, 2, 2, 'F')

    doc.setFont(FF, 'normal')
    doc.setFontSize(8)
    doc.setTextColor(...C.dark)
    doc.text(termLines.slice(0, 5), margin + 5, y + 6)

    y += termH + 8
  }

  // ════════════════════════════════════════════════════════════
  // 10. THANK YOU
  // ════════════════════════════════════════════════════════════
  if (y > 250) {
    doc.addPage()
    doc.setFillColor(...C.amber)
    doc.rect(0, 0, pw, 14, 'F')
    doc.setFont(FF, 'bold')
    doc.setFontSize(10)
    doc.setTextColor(...C.white)
    doc.text(APP_NAME, margin, 10)
    y = 18
  }

  doc.setFillColor(...C.light)
  doc.roundedRect(margin, y, contentW, 12, 2, 2, 'F')

  doc.setFont(FF, 'normal')
  doc.setFontSize(8)
  doc.setTextColor(...C.dark)
  doc.text('Thank you for your business!', margin + 5, y + 5)
  doc.setFont(FF, 'normal')
  doc.text('For questions, contact accounts@fleetpro.com.gh or call +233 30 277 8899.', margin + 5, y + 9)

  y += 18

  // ════════════════════════════════════════════════════════════
  // 11. FOOTER
  // ════════════════════════════════════════════════════════════
  const pageCount = doc.getNumberOfPages()
  for (let i = 1; i <= pageCount; i++) {
    doc.setPage(i)
    const ph = doc.internal.pageSize.getHeight()

    doc.setDrawColor(...C.border)
    doc.setLineWidth(0.3)
    doc.line(margin, ph - 15, pw - margin, ph - 15)

    doc.setFont(FF, 'normal')
    doc.setFontSize(7)
    doc.setTextColor(...C.gray)

    const disclaimer = 'This is a computer-generated invoice. It does not require a physical signature to be valid. ' +
      'For questions contact accounts@fleetpro.com.gh or call +233 30 277 8899. ' +
      'This document is confidential and intended solely for the named client.'

    const splitDisclaimer = doc.splitTextToSize(disclaimer, contentW)
    doc.text(splitDisclaimer.slice(0, 2), margin, ph - 20)

    doc.setFontSize(7)
    doc.text(
      `Invoice ${invoice.invoiceNumber} | ${client.companyName} | ${APP_NAME} \u2014 Confidential`,
      margin,
      ph - 10,
    )
    doc.text(`Page ${i} of ${pageCount}`, pw - margin, ph - 10, { align: 'right' })
  }

  return doc
}
