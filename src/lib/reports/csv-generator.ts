// ════════════════════════════════════════════════════════════════════
// ${APP_NAME} — CSV Generator Utility
// ════════════════════════════════════════════════════════════════════

import { APP_NAME } from '@/lib/constants'

/** Ghana Cedi sign — generated at runtime to avoid any encoding/transpilation issues */
export const CEDI: string = String.fromCodePoint(0x20B5)

export function csvEscape(value: string | number | null | undefined): string {
  if (value === null || value === undefined) return ''
  const str = String(value)
  if (str.includes(',') || str.includes('"') || str.includes('\n') || str.includes('\r')) {
    return `"${str.replace(/"/g, '""')}"`
  }
  return str
}

export function csvDate(date: Date | string | null | undefined): string {
  if (!date) return ''
  const d = typeof date === 'string' ? new Date(date) : date
  if (isNaN(d.getTime())) return ''
  const day = String(d.getDate()).padStart(2, '0')
  const month = String(d.getMonth() + 1).padStart(2, '0')
  const year = d.getFullYear()
  return `${day}/${month}/${year}`
}

export function csvDateTime(date: Date | string | null | undefined): string {
  if (!date) return ''
  const d = typeof date === 'string' ? new Date(date) : date
  if (isNaN(d.getTime())) return ''
  const day = String(d.getDate()).padStart(2, '0')
  const month = String(d.getMonth() + 1).padStart(2, '0')
  const year = d.getFullYear()
  const hours = String(d.getHours()).padStart(2, '0')
  const mins = String(d.getMinutes()).padStart(2, '0')
  return `${day}/${month}/${year} ${hours}:${mins}`
}

export function csvCurrency(amount: number | null | undefined): string {
  if (amount === null || amount === undefined) return ''
  return `${CEDI}${amount.toLocaleString('en-GH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
}

export function csvNumber(value: number | null | undefined, decimals?: number): string {
  if (value === null || value === undefined) return ''
  if (decimals !== undefined) {
    return value.toLocaleString('en-GH', { minimumFractionDigits: decimals, maximumFractionDigits: decimals })
  }
  return value.toLocaleString('en-GH')
}

export function csvPercent(value: number | null | undefined): string {
  if (value === null || value === undefined) return ''
  return `${value.toFixed(1)}%`
}

export function buildCsv(
  headers: string[],
  rows: (string | number | null | undefined)[][]
): string {
  const lines: string[] = []
  lines.push('\uFEFF')
  lines.push(headers.map(csvEscape).join(','))
  for (const row of rows) {
    lines.push(row.map(csvEscape).join(','))
  }
  return lines.join('\n')
}

export function buildCsvSection(
  title: string,
  headers: string[],
  rows: (string | number | null | undefined)[][],
  width: number
): string {
  const lines: string[] = []
  lines.push('')
  lines.push(csvEscape(title) + ','.repeat(width - 1))
  lines.push(headers.map(csvEscape).join(','))
  for (const row of rows) {
    lines.push(row.map(csvEscape).join(','))
  }
  return lines.join('\n')
}

export function generateReportFilename(type: string, format: string): string {
  const date = new Date().toISOString().split('T')[0]
  return `report_${type}_${date}.${format}`
}

export interface ReportData {
  headers: string[]
  rows: (string | number | null | undefined)[][]
}
