import { APP_NAME } from '@/lib/constants'

/**
 * ${APP_NAME} — CSV Export Utility
 *
 * Generates CSV files with UTF-8 BOM for Excel compatibility.
 * Properly escapes fields containing commas, quotes, or newlines.
 */

export function generateCSV(
  headers: string[],
  rows: (string | number | null | undefined | boolean)[][]
): string {
  const bom = '\uFEFF'

  const escapeField = (field: unknown): string => {
    const str =
      field === null || field === undefined ? '' : String(field)
    if (str.includes(',') || str.includes('"') || str.includes('\n')) {
      return `"${str.replace(/"/g, '""')}"`
    }
    return str
  }

  const lines = [headers.map(escapeField).join(',')]
  for (const row of rows) {
    lines.push(row.map(escapeField).join(','))
  }

  return bom + lines.join('\n')
}

/**
 * Format a date value for CSV output (ISO string or empty).
 */
export function formatDate(date: Date | null | undefined): string {
  if (!date) return ''
  return new Date(date).toISOString().split('T')[0]
}

/**
 * Format a datetime value for CSV output.
 */
export function formatDateTime(date: Date | null | undefined): string {
  if (!date) return ''
  return new Date(date).toISOString()
}

/**
 * Format a currency value for CSV output.
 */
export function formatCurrency(amount: number | null | undefined): string {
  if (amount === null || amount === undefined) return '0.00'
  return amount.toFixed(2)
}

/**
 * Trigger a browser file download from a Blob.
 */
export function triggerDownload(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  document.body.appendChild(a)
  a.click()
  document.body.removeChild(a)
  URL.revokeObjectURL(url)
}
