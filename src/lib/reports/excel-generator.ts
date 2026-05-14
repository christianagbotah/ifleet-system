import ExcelJS from 'exceljs'
import type { PartialStyle } from 'exceljs'
import { APP_NAME, APP_COMPANY, APP_TAGLINE } from '@/lib/constants'

// ──────────────────────────────────────────────────────────────────
// Professional styling constants — all Excel exports use these
// ──────────────────────────────────────────────────────────────────

const BRAND_AMBER = 'FFD97706'
const BRAND_AMBER_LIGHT = 'FFFFFBEB'
const BRAND_AMBER_KPI = 'FFFFF7ED'
const BRAND_AMBER_SUMMARY = 'FFFEF3C7'
const DARK_TEXT = 'FF1C1917'
const MEDIUM_TEXT = 'FF57534E'
const LIGHT_TEXT = 'FF78716C'
const WHITE = 'FFFFFFFF'
const BORDER_COLOR = 'FFD6D3D1'

const STYLES = {
  // ── Title & Subtitle ──
  titleFont: { bold: true, size: 18, color: { argb: DARK_TEXT }, name: 'Calibri' } as PartialStyle,
  titleAlignment: { vertical: 'middle' as const, indent: 1 },
  subtitleFont: { bold: true, size: 11, color: { argb: LIGHT_TEXT }, name: 'Calibri' } as PartialStyle,
  subtitleAlignment: { vertical: 'middle' as const, indent: 1 },

  // ── Section titles (for multi-section reports) ──
  sectionTitleFont: { bold: true, size: 13, color: { argb: DARK_TEXT }, name: 'Calibri' } as PartialStyle,
  sectionTitleFill: { type: 'pattern' as const, pattern: 'solid' as const, fgColor: { argb: BRAND_AMBER_LIGHT } },

  // ── KPI Section ──
  kpiHeaderFont: { bold: true, size: 12, color: { argb: DARK_TEXT }, name: 'Calibri' } as PartialStyle,
  kpiLabelFont: { bold: true, size: 10, color: { argb: MEDIUM_TEXT }, name: 'Calibri' } as PartialStyle,
  kpiValueFont: { bold: true, size: 12, color: { argb: DARK_TEXT }, name: 'Calibri' } as PartialStyle,
  kpiLabelFill: { type: 'pattern' as const, pattern: 'solid' as const, fgColor: { argb: BRAND_AMBER_KPI } },

  // ── Column Headers ──
  headerFont: { bold: true, size: 11, color: { argb: WHITE }, name: 'Calibri' } as PartialStyle,
  headerFill: { type: 'pattern' as const, pattern: 'solid' as const, fgColor: { argb: BRAND_AMBER } },
  headerAlignment: { horizontal: 'center' as const, vertical: 'middle' as const, wrapText: true } as PartialStyle,

  // ── Data Rows ──
  dataFont: { size: 10, color: { argb: DARK_TEXT }, name: 'Calibri' } as PartialStyle,
  dataAlignment: { vertical: 'middle' as const, wrapText: true } as PartialStyle,

  // ── Summary / Total Rows ──
  summaryFont: { bold: true, size: 11, color: { argb: 'FF92400E' }, name: 'Calibri' } as PartialStyle,
  summaryFill: { type: 'pattern' as const, pattern: 'solid' as const, fgColor: { argb: BRAND_AMBER_SUMMARY } },

  // ── Borders ──
  thinBorder: {
    top: { style: 'thin' as const, color: { argb: BORDER_COLOR } },
    left: { style: 'thin' as const, color: { argb: BORDER_COLOR } },
    bottom: { style: 'thin' as const, color: { argb: BORDER_COLOR } },
    right: { style: 'thin' as const, color: { argb: BORDER_COLOR } },
  },
  summaryBorder: {
    top: { style: 'thin' as const, color: { argb: BRAND_AMBER } },
    left: { style: 'thin' as const, color: { argb: BORDER_COLOR } },
    bottom: { style: 'medium' as const, color: { argb: BRAND_AMBER } },
    right: { style: 'thin' as const, color: { argb: BORDER_COLOR } },
  },

  // ── Alternating Row Fill ──
  alternateRowFill: { type: 'pattern' as const, pattern: 'solid' as const, fgColor: { argb: BRAND_AMBER_LIGHT } },

  // ── Number Formats ──
  currencyFormat: '#,##0.00',
  dateFormat: 'yyyy-mm-dd',
  dateTimeFormat: 'yyyy-mm-dd hh:mm',
}

// ──────────────────────────────────────────────────────────────────
// Row height constants (in Excel points, 1 point ≈ 1.33px)
// ──────────────────────────────────────────────────────────────────

const ROW_HEIGHTS = {
  title: 38,
  subtitle: 24,
  sectionTitle: 30,
  kpiHeader: 26,
  kpiRow: 26,
  spacer: 8,
  header: 30,
  data: 22,
  dataWrapped: 32,
  summary: 28,
}

// ──────────────────────────────────────────────────────────────────
// Column width calculation constants
// Average character width for Calibri 10pt ≈ 7px
// 1 Excel column width unit ≈ 7 pixels
// ──────────────────────────────────────────────────────────────────

const CHAR_WIDTH_SCALE = 1.1
const MIN_COL_WIDTH = 12
const MAX_COL_WIDTH = 48
const HEADER_PADDING = 4
const DATA_PADDING = 3

export type ColumnType = 'text' | 'number' | 'currency' | 'date' | 'datetime' | 'percent'

export interface ColumnDef {
  key: string
  header: string
  type?: ColumnType
  width?: number
}

// ──────────────────────────────────────────────────────────────────
// ExcelReport class
// ──────────────────────────────────────────────────────────────────

export class ExcelReport {
  private workbook: ExcelJS.Workbook
  private sheet: ExcelJS.Worksheet
  private currentRow: number
  private headerRow: number = 0
  private columnCount: number = 0
  private dataRowCount: number = 0
  private maxTextLengths: Map<number, number> = new Map()
  private headerTexts: Map<number, string> = new Map()

  constructor(title: string, subtitle?: string) {
    this.workbook = new ExcelJS.Workbook()
    this.workbook.creator = APP_NAME
    this.workbook.company = APP_COMPANY
    this.workbook.created = new Date()

    this.sheet = this.workbook.addWorksheet('Report', {
      views: [{ showGridLines: false }],
      properties: {
        defaultRowHeight: ROW_HEIGHTS.data,
        defaultColWidth: 14,
      },
    })

    this.currentRow = 1
    if (title) this.addTitle(title)
    if (subtitle) this.addSubtitle(subtitle)
  }

  // ─────────── Title & Subtitle ───────────

  addTitle(title: string): void {
    this.sheet.mergeCells(this.currentRow, 1, this.currentRow, 12)
    const cell = this.sheet.getCell(this.currentRow, 1)
    cell.value = title
    Object.assign(cell, {
      font: STYLES.titleFont,
      alignment: STYLES.titleAlignment,
    })
    // Amber accent bar under title
    const borderBottom = this.sheet.getCell(this.currentRow, 1)
    borderBottom.border = {
      bottom: { style: 'medium' as const, color: { argb: BRAND_AMBER } },
    }
    this.sheet.getRow(this.currentRow).height = ROW_HEIGHTS.title
    this.currentRow++
  }

  addSubtitle(text: string): void {
    this.sheet.mergeCells(this.currentRow, 1, this.currentRow, 12)
    const cell = this.sheet.getCell(this.currentRow, 1)
    cell.value = text
    Object.assign(cell, {
      font: STYLES.subtitleFont,
      alignment: STYLES.subtitleAlignment,
    })
    this.sheet.getRow(this.currentRow).height = ROW_HEIGHTS.subtitle
    this.currentRow++
  }

  // ─────────── Spacer ───────────

  addSpacer(): void {
    this.sheet.getRow(this.currentRow).height = ROW_HEIGHTS.spacer
    this.currentRow++
  }

  // ─────────── Section Title (for multi-section reports) ───────────

  addSectionTitle(title: string): void {
    this.sheet.mergeCells(this.currentRow, 1, this.currentRow, 12)
    const cell = this.sheet.getCell(this.currentRow, 1)
    cell.value = title
    Object.assign(cell, {
      font: STYLES.sectionTitleFont,
      alignment: { vertical: 'middle' as const, indent: 1 },
      fill: STYLES.sectionTitleFill,
      border: {
        bottom: { style: 'thin' as const, color: { argb: BRAND_AMBER } },
      },
    })
    this.sheet.getRow(this.currentRow).height = ROW_HEIGHTS.sectionTitle
    this.currentRow++
  }

  // ─────────── KPI Section ───────────

  addKPISection(kpis: { label: string; value: string | number }[]): void {
    // KPI section header
    const headerCell = this.sheet.getCell(this.currentRow, 1)
    headerCell.value = 'Key Performance Indicators'
    Object.assign(headerCell, {
      font: STYLES.kpiHeaderFont,
      fill: STYLES.kpiLabelFill,
      border: STYLES.thinBorder,
      alignment: { vertical: 'middle' as const, indent: 1 },
    })
    this.sheet.mergeCells(this.currentRow, 1, this.currentRow, 4)
    // Fill the entire merged range
    for (let c = 1; c <= 4; c++) {
      const cell = this.sheet.getCell(this.currentRow, c)
      cell.fill = STYLES.kpiLabelFill
      cell.border = STYLES.thinBorder
    }
    this.sheet.getRow(this.currentRow).height = ROW_HEIGHTS.kpiHeader
    this.currentRow++

    // KPI pairs (label : value) arranged in 2 columns across 4 cells wide
    const colsPerKPI = 2
    const kpisPerRow = 2

    for (let i = 0; i < kpis.length; i += kpisPerRow) {
      const row = this.sheet.getRow(this.currentRow)
      row.height = ROW_HEIGHTS.kpiRow

      for (let j = 0; j < kpisPerRow; j++) {
        const kpiIndex = i + j
        if (kpiIndex >= kpis.length) break

        const baseCol = j * 4 // Each KPI pair occupies 4 columns (2 per KPI)

        // Label cell
        const labelCell = this.sheet.getCell(this.currentRow, baseCol + 1)
        labelCell.value = kpis[kpiIndex].label
        Object.assign(labelCell, {
          font: STYLES.kpiLabelFont,
          alignment: { vertical: 'middle' as const, indent: 2 },
          fill: STYLES.kpiLabelFill,
          border: STYLES.thinBorder,
        })

        // Value cell
        const valueCell = this.sheet.getCell(this.currentRow, baseCol + 2)
        valueCell.value = kpis[kpiIndex].value
        Object.assign(valueCell, {
          font: STYLES.kpiValueFont,
          alignment: { vertical: 'middle' as const, indent: 1 },
          fill: STYLES.kpiLabelFill,
          border: STYLES.thinBorder,
        })
      }

      // Fill remaining cells in the row
      for (let c = 1; c <= 8; c++) {
        const cell = this.sheet.getCell(this.currentRow, c)
        cell.fill = STYLES.kpiLabelFill
        if (!cell.border?.top) cell.border = STYLES.thinBorder
      }

      this.currentRow++
    }

    this.addSpacer()
  }

  // ─────────── Column Headers ───────────

  addHeaders(headers: string[]): void {
    this.headerRow = this.currentRow
    this.columnCount = headers.length
    const row = this.sheet.getRow(this.currentRow)
    row.height = ROW_HEIGHTS.header

    headers.forEach((header, index) => {
      const cell = row.getCell(index + 1)
      cell.value = header
      Object.assign(cell, {
        font: STYLES.headerFont,
        fill: STYLES.headerFill,
        alignment: STYLES.headerAlignment,
        border: STYLES.thinBorder,
      })
      // Track header text length for auto-fit
      const len = header.length
      this.headerTexts.set(index + 1, len > (this.maxTextLengths.get(index + 1) ?? 0) ? header : '')
      this.maxTextLengths.set(index + 1, Math.max(this.maxTextLengths.get(index + 1) ?? 0, len))
    })

    this.currentRow++
    this.dataRowCount = 0
  }

  addHeadersFromDefs(columns: ColumnDef[]): void {
    this.headerRow = this.currentRow
    this.columnCount = columns.length
    const row = this.sheet.getRow(this.currentRow)
    row.height = ROW_HEIGHTS.header

    columns.forEach((col, index) => {
      const cell = row.getCell(index + 1)
      cell.value = col.header
      Object.assign(cell, {
        font: STYLES.headerFont,
        fill: STYLES.headerFill,
        alignment: STYLES.headerAlignment,
        border: STYLES.thinBorder,
      })
      // Track header text length for auto-fit
      const len = col.header.length
      this.headerTexts.set(index + 1, col.header)
      this.maxTextLengths.set(index + 1, Math.max(this.maxTextLengths.get(index + 1) ?? 0, len))
    })

    this.currentRow++
    this.dataRowCount = 0
  }

  // ─────────── Data Rows ───────────

  addRow(data: Record<string, unknown>, columnKeys: string[]): void {
    const isAlternate = this.dataRowCount % 2 === 1
    const row = this.sheet.getRow(this.currentRow)
    row.height = ROW_HEIGHTS.data

    columnKeys.forEach((key, index) => {
      const cell = row.getCell(index + 1)
      let value = data[key]
      const textLen = this.setCellValue(cell, value, undefined)

      Object.assign(cell, {
        alignment: STYLES.dataAlignment,
        border: STYLES.thinBorder,
        font: STYLES.dataFont,
      })
      if (isAlternate) cell.fill = STYLES.alternateRowFill

      // Track max length for auto-fit
      const col = index + 1
      this.maxTextLengths.set(col, Math.max(this.maxTextLengths.get(col) ?? 0, textLen))
    })

    this.currentRow++
    this.dataRowCount++
  }

  addTypedRow(data: Record<string, unknown>, columns: ColumnDef[]): void {
    const isAlternate = this.dataRowCount % 2 === 1
    const row = this.sheet.getRow(this.currentRow)
    row.height = ROW_HEIGHTS.data

    columns.forEach((col, index) => {
      const cell = row.getCell(index + 1)
      let value = data[col.key]
      const textLen = this.setCellValue(cell, value, col.type)

      const isNumeric = col.type === 'number' || col.type === 'currency' || col.type === 'percent'
      Object.assign(cell, {
        alignment: {
          vertical: 'middle' as const,
          wrapText: true,
          horizontal: (isNumeric ? 'right' : 'left') as const,
        },
        border: STYLES.thinBorder,
        font: STYLES.dataFont,
      })
      if (isAlternate) cell.fill = STYLES.alternateRowFill

      // Track max length for auto-fit
      const colNum = index + 1
      this.maxTextLengths.set(colNum, Math.max(this.maxTextLengths.get(colNum) ?? 0, textLen))
    })

    this.currentRow++
    this.dataRowCount++
  }

  // ─────────── Summary / Total Rows ───────────

  addSummaryRow(label: string, values: Record<string, number | string>, columnKeys: string[]): void {
    const row = this.sheet.getRow(this.currentRow)
    row.height = ROW_HEIGHTS.summary

    columnKeys.forEach((key, index) => {
      const cell = row.getCell(index + 1)
      if (index === 0) {
        cell.value = label
      } else {
        const val = values[key]
        cell.value = val
        if (typeof val === 'number') cell.numFmt = STYLES.currencyFormat
      }
      Object.assign(cell, {
        font: STYLES.summaryFont,
        fill: STYLES.summaryFill,
        border: STYLES.summaryBorder,
        alignment: {
          vertical: 'middle' as const,
          horizontal: index === 0 ? 'left' as const : 'right' as const,
          indent: index === 0 ? 1 : undefined,
        },
      })
    })

    this.currentRow++
  }

  addTypedSummaryRow(label: string, values: Record<string, number | string>, columns: ColumnDef[]): void {
    const row = this.sheet.getRow(this.currentRow)
    row.height = ROW_HEIGHTS.summary

    columns.forEach((col, index) => {
      const cell = row.getCell(index + 1)
      if (index === 0) {
        cell.value = label
      } else {
        const val = values[col.key]
        cell.value = val
        if (typeof val === 'number') {
          if (col.type === 'currency') cell.numFmt = STYLES.currencyFormat
          else cell.numFmt = '#,##0.##'
        }
      }
      const isNumeric = col.type === 'number' || col.type === 'currency' || col.type === 'percent'
      Object.assign(cell, {
        font: STYLES.summaryFont,
        fill: STYLES.summaryFill,
        border: STYLES.summaryBorder,
        alignment: {
          vertical: 'middle' as const,
          horizontal: (index === 0 || !isNumeric) ? 'left' as const : 'right' as const,
          indent: index === 0 ? 1 : undefined,
        },
      })
    })

    this.currentRow++
  }

  // ─────────── Auto-fit Columns (pixel-accurate) ───────────

  autoFitColumns(): void {
    for (let col = 1; col <= this.columnCount; col++) {
      const maxLen = this.maxTextLengths.get(col) ?? 0
      const headerText = this.headerTexts.get(col) ?? ''

      // Calculate width from character count
      // Calibri 10pt average char width ≈ 7px, 1 Excel unit ≈ 7px
      let width = maxLen * CHAR_WIDTH_SCALE

      // Ensure header text always fits
      const headerWidth = headerText.length * CHAR_WIDTH_SCALE + HEADER_PADDING
      if (headerWidth > width) width = headerWidth

      // Add padding
      width += DATA_PADDING

      // Apply min/max bounds
      width = Math.min(Math.max(width, MIN_COL_WIDTH), MAX_COL_WIDTH)

      // Round to nearest 0.5 for cleaner widths
      width = Math.round(width * 2) / 2

      this.sheet.getColumn(col).width = width
    }
  }

  // ─────────── Freeze Panes ───────────

  freezePanes(): void {
    if (this.headerRow > 0) {
      this.sheet.views = [{ state: 'frozen', ySplit: this.headerRow, xSplit: 1, topLeftCell: 'B2' }]
    }
  }

  // ─────────── Page Setup (for printing) ───────────

  setPageSetup(): void {
    this.sheet.pageSetup = {
      orientation: 'landscape',
      fitToPage: true,
      fitToWidth: 1,
      fitToHeight: 0,
      paperSize: 9, // A4
      margins: { left: 0.4, right: 0.4, top: 0.5, bottom: 0.5, header: 0.3, footer: 0.3 },
    }
    this.sheet.headerFooter = {
      oddFooter: `&L&8${APP_COMPANY}&C&8Page &P of &N&R&8&D`,
      oddHeader: `&L&8${APP_NAME} — ${APP_TAGLINE}`,
    }
  }

  // ─────────── Export ───────────

  async toBuffer(): Promise<Buffer> {
    const buffer = await this.workbook.xlsx.writeBuffer()
    return Buffer.from(buffer)
  }

  // ─────────── Private helpers ───────────

  /**
   * Set cell value and format, returning the text length for auto-fit.
   */
  private setCellValue(cell: ExcelJS.Cell, value: unknown, type?: ColumnType): number {
    if (value instanceof Date) {
      cell.value = value
      cell.numFmt = type === 'datetime' ? STYLES.dateTimeFormat : STYLES.dateFormat
      return type === 'datetime' ? 16 : 10
    } else if (typeof value === 'number') {
      cell.value = value
      if (type === 'currency') cell.numFmt = STYLES.currencyFormat
      else if (type === 'percent') cell.numFmt = '0.0%'
      else cell.numFmt = '#,##0.##'
      return String(value).length + 2 // +2 for comma formatting
    } else {
      const text = String(value ?? '')
      cell.value = text
      return text.length
    }
  }
}
