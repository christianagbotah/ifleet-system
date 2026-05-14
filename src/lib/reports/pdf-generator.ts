// ════════════════════════════════════════════════════════════════════
// ${APP_NAME} — Reusable PDF Report Generator
// ════════════════════════════════════════════════════════════════════
//
// Brand-aware PDF generator built on jsPDF + jspdf-autotable.
// Provides consistent header, KPI cards, tables, and footer
// matching the ${APP_NAME} visual identity.
// ────────────────────────────────────────────────────────────────────

import jsPDF from 'jspdf'
import autoTable from 'jspdf-autotable'
import { APP_NAME, APP_TAGLINE } from '@/lib/constants'

// ── Brand Colors ──
const COLORS = {
  amber: '#D97706',
  dark: '#1C1917',
  gray: '#78716C',
  light: '#FFFBEB',
  white: '#FFFFFF',
  tableHeaderBg: [217, 119, 6] as [number, number, number],
  tableAltRow: [255, 251, 235] as [number, number, number],
  tableBorder: [214, 211, 209] as [number, number, number],
  footerLine: [214, 211, 209] as [number, number, number],
  kpiLabelBg: [245, 245, 244] as [number, number, number],
  summaryBg: [254, 243, 199] as [number, number, number],
}

/** KPI card data shape */
export interface KpiCard {
  label: string
  value: string
  trend?: string
}

/** Options for addTable */
export interface TableOptions {
  summaryRow?: {
    label: string
    values: (string | number)[]
  }
  columnStyles?: Record<number, { cellWidth?: number; halign?: 'left' | 'center' | 'right' }>
  headStyles?: Record<string, unknown>
  startY?: number
}

/**
 * Reusable PDF report generator for ${APP_NAME}.
 *
 * Usage:
 *   const pdf = new PdfReport('landscape')
 *   pdf.addHeader()
 *   pdf.addTitle('Trip Summary Report')
 *   pdf.addSubtitle('Period: 2026-01 to 2026-06')
 *   pdf.addKPICards([...])
 *   pdf.addTable(headers, rows)
 *   pdf.addFooter()
 *   const blob = pdf.toBlob()
 */
export class PdfReport {
  private doc: jsPDF

  constructor(orientation: 'portrait' | 'landscape' = 'portrait', format: 'a4' | 'letter' = 'a4') {
    this.doc = new jsPDF({
      orientation,
      format,
      unit: 'mm',
      compress: true,
    })
  }

  // ── Public Accessors ────────────────────────────────────────────

  /** Access the underlying jsPDF instance for custom drawing */
  get pdf(): jsPDF {
    return this.doc
  }

  /** Get current Y cursor position */
  get y(): number {
    return this.doc.getCursorPosition().y
  }

  /** Get page width in mm */
  get pageWidth(): number {
    return this.doc.internal.pageSize.getWidth()
  }

  /** Get page height in mm */
  get pageHeight(): number {
    return this.doc.internal.pageSize.getHeight()
  }

  // ── Header ─────────────────────────────────────────────────────

  /**
   * Add amber branded header bar: "${APP_NAME}" (left)
   * + "${APP_TAGLINE}" (right).
   */
  addHeader(): void {
    const pageWidth = this.pageWidth

    // Amber background bar
    this.doc.setFillColor(217, 119, 6)
    this.doc.rect(0, 0, pageWidth, 14, 'F')

    // Company name — left
    this.doc.setFont('helvetica', 'bold')
    this.doc.setFontSize(14)
    this.doc.setTextColor(255, 255, 255)
    this.doc.text(APP_NAME, 10, 9.5)

    // System name — right
    this.doc.setFont('helvetica', 'normal')
    this.doc.setFontSize(9)
    this.doc.text(APP_TAGLINE, pageWidth - 10, 9.5, { align: 'right' })

    // Thin amber accent line
    this.doc.setDrawColor(217, 119, 6)
    this.doc.setLineWidth(0.5)
    this.doc.line(0, 14, pageWidth, 14)

    this.doc.setDrawColor(0, 0, 0)
    this.doc.setTextColor(0, 0, 0)
  }

  // ── Title ──────────────────────────────────────────────────────

  /** Add a bold report title below the header */
  addTitle(title: string): void {
    this.doc.setFont('helvetica', 'bold')
    this.doc.setFontSize(16)
    this.doc.setTextColor(28, 25, 23)
    this.doc.text(title, 10, this.y + 10)
    this.doc.setTextColor(0, 0, 0)
  }

  // ── Subtitle ───────────────────────────────────────────────────

  /** Add a smaller subtitle line (date range, filters, etc.) */
  addSubtitle(text: string): void {
    this.doc.setFont('helvetica', 'normal')
    this.doc.setFontSize(9)
    this.doc.setTextColor(120, 113, 108)
    this.doc.text(text, 10, this.y + 6)

    const yPos = this.y + 9
    this.doc.setDrawColor(...COLORS.footerLine)
    this.doc.setLineWidth(0.2)
    this.doc.line(10, yPos, this.pageWidth - 10, yPos)
    this.doc.setDrawColor(0, 0, 0)
    this.doc.setTextColor(0, 0, 0)
  }

  // ── KPI Cards ──────────────────────────────────────────────────

  /**
   * Add a row of KPI cards with label, value, and optional trend indicator.
   * Cards are arranged horizontally and wrap if needed.
   */
  addKPICards(kpis: KpiCard[]): void {
    const pageWidth = this.pageWidth
    const margin = 10
    const cardGap = 4
    const usableWidth = pageWidth - margin * 2

    const cardsPerRow = pageWidth > 200 ? 4 : 3
    const cardWidth = (usableWidth - cardGap * (cardsPerRow - 1)) / cardsPerRow
    const cardHeight = 18

    let currentY = this.y + 4

    for (let i = 0; i < kpis.length; i += cardsPerRow) {
      if (currentY + cardHeight > this.pageHeight - 30) {
        this.newPage()
        currentY = this.y + 4
      }

      const rowKpis = kpis.slice(i, i + cardsPerRow)

      for (let j = 0; j < rowKpis.length; j++) {
        const kpi = rowKpis[j]
        const x = margin + j * (cardWidth + cardGap)

        // Card background
        this.doc.setFillColor(...COLORS.kpiLabelBg)
        this.doc.roundedRect(x, currentY, cardWidth, cardHeight, 2, 2, 'F')

        // Left accent bar
        this.doc.setFillColor(217, 119, 6)
        this.doc.rect(x, currentY, 1.5, cardHeight, 'F')

        // Label
        this.doc.setFont('helvetica', 'normal')
        this.doc.setFontSize(7)
        this.doc.setTextColor(120, 113, 108)
        this.doc.text(kpi.label, x + 5, currentY + 6)

        // Value
        this.doc.setFont('helvetica', 'bold')
        this.doc.setFontSize(11)
        this.doc.setTextColor(28, 25, 23)
        const displayValue = kpi.trend ? `${kpi.value} ${kpi.trend}` : kpi.value
        this.doc.text(displayValue, x + 5, currentY + 13.5)

        this.doc.setTextColor(0, 0, 0)
      }

      currentY += cardHeight + cardGap
    }
  }

  // ── Data Table ─────────────────────────────────────────────────

  /**
   * Add a styled data table using jspdf-autotable.
   * Returns the Y position after the table.
   */
  addTable(
    headers: string[],
    rows: (string | number)[][],
    options?: TableOptions,
  ): number {
    const startY = options?.startY ?? this.y + 4

    const headStyles: Record<string, unknown> = {
      fillColor: COLORS.tableHeaderBg,
      textColor: [255, 255, 255],
      fontStyle: 'bold',
      fontSize: 7,
      halign: 'center',
      cellPadding: 2,
      ...options?.headStyles,
    }

    const bodyStyles: Record<string, unknown> = {
      fontSize: 7,
      cellPadding: 2,
      textColor: [28, 25, 23],
    }

    const altRowStyles: Record<string, unknown> = {
      fillColor: COLORS.tableAltRow,
    }

    const allStyles: Record<string, unknown> = {
      lineColor: COLORS.tableBorder,
      lineWidth: 0.1,
      valign: 'middle',
    }

    const autoTableOptions: Record<string, unknown> = {
      startY,
      head: [headers],
      body: rows,
      theme: 'grid',
      headStyles,
      bodyStyles,
      alternateRowStyles: altRowStyles,
      styles: allStyles,
      margin: { left: 10, right: 10 },
      tableWidth: 'auto',
      didDrawPage: () => {
        this.addHeader()
      },
    }

    if (options?.columnStyles) {
      autoTableOptions.columnStyles = options.columnStyles
    }

    autoTable(this.doc, autoTableOptions as Parameters<typeof autoTable>[1])

    if (options?.summaryRow) {
      const finalY = (this.doc as unknown as Record<string, unknown>).lastAutoTable != null
        ? ((this.doc as unknown as Record<string, Record<string, number>>).lastAutoTable?.finalY ?? this.y + 20)
        : this.y + 20
      this._addSummaryRow(headers, options.summaryRow, finalY)
      return finalY + 8
    }

    return (this.doc as unknown as Record<string, Record<string, number>>).lastAutoTable?.finalY ?? startY + 20
  }

  // ── Footer ─────────────────────────────────────────────────────

  /**
   * Add footer to all pages: page number (center) + "${APP_NAME} — Confidential" (left).
   * Call AFTER all content is added so pageCount is accurate.
   */
  addFooter(): void {
    const pageCount = this.doc.getNumberOfPages()

    for (let i = 1; i <= pageCount; i++) {
      this.doc.setPage(i)

      const pageHeight = this.pageHeight
      const pageWidth = this.pageWidth

      // Footer line
      this.doc.setDrawColor(...COLORS.footerLine)
      this.doc.setLineWidth(0.3)
      this.doc.line(10, pageHeight - 15, pageWidth - 10, pageHeight - 15)

      // Page number — center
      this.doc.setFont('helvetica', 'normal')
      this.doc.setFontSize(8)
      this.doc.setTextColor(120, 113, 108)
      this.doc.text(`Page ${i} of ${pageCount}`, pageWidth / 2, pageHeight - 10, { align: 'center' })

      // Confidential text — left
      this.doc.setFontSize(7)
      this.doc.text(`${APP_NAME} \u2014 Confidential`, 10, pageHeight - 10)

      // Date — right
      const now = new Date()
      const dateStr = now.toLocaleDateString('en-GB', {
        day: '2-digit',
        month: 'short',
        year: 'numeric',
      })
      this.doc.text(dateStr, pageWidth - 10, pageHeight - 10, { align: 'right' })

      this.doc.setTextColor(0, 0, 0)
    }
  }

  // ── Page Break ─────────────────────────────────────────────────

  /** Add a new page with header repeated */
  newPage(): void {
    this.doc.addPage()
    this.addHeader()
  }

  // ── Export ─────────────────────────────────────────────────────

  /** Generate the PDF as a Blob for download */
  toBlob(): Blob {
    return this.doc.output('blob')
  }

  /** Generate the PDF as a Buffer */
  toBuffer(): Buffer {
    const output = this.doc.output('arraybuffer')
    return Buffer.from(output)
  }

  // ── Private Helpers ────────────────────────────────────────────

  private _addSummaryRow(
    headers: string[],
    summary: { label: string; values: (string | number)[] },
    y: number,
  ): void {
    const pageWidth = this.pageWidth
    const cols = headers.length
    const colWidth = (pageWidth - 20) / cols

    // Background
    this.doc.setFillColor(...COLORS.summaryBg)
    this.doc.rect(10, y, pageWidth - 20, 7, 'F')

    // Label
    this.doc.setFont('helvetica', 'bold')
    this.doc.setFontSize(7)
    this.doc.setTextColor(146, 64, 14)
    this.doc.text(summary.label, 12, y + 5)

    // Values
    this.doc.setFont('helvetica', 'bold')
    summary.values.forEach((val, idx) => {
      if (idx === 0) return
      const x = 10 + idx * colWidth + colWidth / 2
      this.doc.text(String(val), x, y + 5, { align: 'right' })
    })

    this.doc.setTextColor(0, 0, 0)
  }
}

// ── Shared Formatting Utilities ─────────────────────────────────

/** Format currency in GHS */
export function formatGHS(amount: number): string {
  return `GHS ${amount.toLocaleString('en-GH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
}

/** Format number with locale */
export function formatNumber(n: number): string {
  return n.toLocaleString('en-GH')
}

/** Format date to DD/MM/YYYY */
export function fmtDate(d?: Date | null): string {
  if (!d) return ''
  const date = new Date(d)
  const day = String(date.getDate()).padStart(2, '0')
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const year = date.getFullYear()
  return `${day}/${month}/${year}`
}

/** Format datetime to DD/MM/YYYY HH:MM */
export function fmtDateTime(d?: Date | null): string {
  if (!d) return ''
  const date = new Date(d)
  const day = String(date.getDate()).padStart(2, '0')
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const year = date.getFullYear()
  const hours = String(date.getHours()).padStart(2, '0')
  const mins = String(date.getMinutes()).padStart(2, '0')
  return `${day}/${month}/${year} ${hours}:${mins}`
}

/** Build subtitle text from report params */
export function buildPdfSubtitle(params: { dateFrom?: string; dateTo?: string; truckId?: string; driverId?: string; clientId?: string; status?: string }): string {
  const parts: string[] = []
  parts.push(`Generated: ${fmtDate(new Date())}`)

  if (params.dateFrom || params.dateTo) {
    parts.push(`Period: ${params.dateFrom || '...'} to ${params.dateTo || '...'}`)
  }
  if (params.truckId) parts.push(`Truck: ${params.truckId}`)
  if (params.driverId) parts.push(`Driver: ${params.driverId}`)
  if (params.clientId) parts.push(`Client: ${params.clientId}`)
  if (params.status) parts.push(`Status: ${params.status}`)

  return parts.join(' | ')
}

/** Build a Prisma where clause from report params for trip-based queries */
export function buildTripWhereClause(params: { dateFrom?: string; dateTo?: string; truckId?: string; driverId?: string; clientId?: string; status?: string }): Record<string, unknown> {
  const where: Record<string, unknown> = {}

  if (params.dateFrom || params.dateTo) {
    const departureFilter: Record<string, unknown> = {}
    if (params.dateFrom) departureFilter.gte = new Date(params.dateFrom)
    if (params.dateTo) departureFilter.lte = new Date(params.dateTo)
    where.departureTime = departureFilter
  }
  if (params.truckId) where.truckId = params.truckId
  if (params.driverId) where.driverId = params.driverId
  if (params.clientId) where.clientId = params.clientId
  if (params.status) where.status = params.status

  return where
}
