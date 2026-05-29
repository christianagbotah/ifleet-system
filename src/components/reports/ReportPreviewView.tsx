'use client'

import { useState, useEffect, useCallback } from 'react'
import { motion } from 'framer-motion'
import {
  ArrowLeft,
  Download,
  Printer,
  FileSpreadsheet,
  FileText,
  Loader2,
  AlertTriangle,
  BarChart3,
  RefreshCw,
  ChevronLeft,
  X,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Skeleton } from '@/components/ui/skeleton'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { useAuthStore } from '@/lib/store/auth'
import { toast } from 'sonner'
import { triggerDownload } from '@/lib/export'
import type { ReportType, ReportParams } from '@/lib/reports/types'

// ─── Report Name Map ─────────────────────────────────────────────────

const REPORT_NAMES: Record<string, string> = {
  trip_summary: 'Trip Summary',
  fuel_report: 'Fuel Report',
  expense_report: 'Expense Report',
  fleet_profit_loss: 'Fleet Profit & Loss',
  payroll_report: 'Payroll Report',
  cash_advances_report: 'Cash Advances',
  toll_report: 'Toll & Checkpoint',
  daily_summary: 'Daily Operations Summary',
  driver_performance: 'Driver Performance',
  driver_incentives_report: 'Driver Incentives',
  waybill_report: 'Waybill Report',
  load_board_report: 'Load Board Report',
  border_crossings_report: 'Border Crossings',
  depot_queue_report: 'Depot Queue',
  fleet_overview: 'Fleet Overview',
  maintenance_report: 'Maintenance Report',
  tyre_report: 'Tyre Management',
  compliance_report: 'Compliance & Documents',
  insurance_claims_report: 'Insurance Claims',
  safety_report: 'Safety Inspections',
  cost_analytics: 'Cost Analytics',
  trip_profitability: 'Trip Profitability',
  fuel_anomaly_report: 'Fuel Anomalies',
  fuel_analytics: 'Fuel Analytics',
  safety_scoring: 'Safety Scoring',
  warehouse_report: 'Warehouse Inventory',
}

// ─── Format cell value for display ────────────────────────────────────

function formatCell(value: string | number | null | undefined, header: string): string {
  if (value === null || value === undefined) return '—'

  const h = header.toLowerCase()

  // Currency fields
  if (h.includes('revenue') || h.includes('cost') || h.includes('price') || h.includes('profit') ||
      h.includes('amount') || h.includes('budget') || h.includes('expense') || h.includes('rate') ||
      h.includes('salary') || h.includes('deduction') || h.includes('net pay') || h.includes('gross') ||
      h.includes('total value') || h.includes('unit price')) {
    if (typeof value === 'number') {
      const str = String(value)
      if (str.startsWith('GHS')) return str
      return `GHS ${value.toLocaleString('en-GH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
    }
    return String(value)
  }

  // Percentage
  if (h.includes('margin') || h.includes('percent') || h.includes('%')) {
    return `${value}%`
  }

  if (typeof value === 'number') {
    // Efficiency
    if (h.includes('efficiency') || h.includes('l/100km') || h.includes('km/l')) {
      return `${value.toFixed(2)}`
    }
    // Volume (liters)
    if (h.includes('liter') || h.includes('litre') || h.includes('fuel')) {
      return `${value.toLocaleString('en-GH', { maximumFractionDigits: 1 })} L`
    }
    // Distance
    if (h.includes('distance') || h.includes('mileage') || h.includes('km')) {
      return `${value.toLocaleString('en-GH', { maximumFractionDigits: 1 })} km`
    }
    // Count
    if (h.includes('count') || h.includes('trips') || h.includes('deliveries') ||
        h.includes('fill-up') || h.includes('check') || h.includes('days') ||
        h.includes('rank') || h.includes('position') || h.includes('violations') ||
        h.includes('incidents') || h.includes('score')) {
      return String(value)
    }
    // Weight
    if (h.includes('weight') || h.includes('tonnage') || h.includes('tonne')) {
      return `${value.toLocaleString('en-GH', { maximumFractionDigits: 1 })} t`
    }
    return value.toLocaleString('en-GH')
  }

  return String(value)
}

// ─── Status coloring helper ──────────────────────────────────────────

function getStatusColor(value: string | number | null | undefined): string | null {
  const v = String(value ?? '').toLowerCase()
  if (['expired', 'failed', 'rejected', 'cancelled', 'overdue', 'damaged', 'retired'].includes(v))
    return 'text-red-600 dark:text-red-400 bg-red-50 dark:bg-red-950/30'
  if (['expiring soon', 'warning', 'pending', 'in progress', 'processing', 'flagged', 'high cost', 'high consumption'].includes(v))
    return 'text-amber-600 dark:text-amber-400 bg-amber-50 dark:bg-amber-950/30'
  if (['valid', 'active', 'completed', 'approved', 'cleared', 'paid', 'excellent'].includes(v))
    return 'text-emerald-600 dark:text-emerald-400 bg-emerald-50 dark:bg-emerald-950/30'
  if (['good', 'fair', 'stable', 'improving'].includes(v))
    return 'text-sky-600 dark:text-sky-400 bg-sky-50 dark:bg-sky-950/30'
  return null
}

function isStatusHeader(header: string): boolean {
  const h = header.toLowerCase()
  return h === 'status' || h === 'result' || h === 'grade' || h === 'rating' ||
         h === 'efficiency rating' || h === 'trend' || h.includes('flag') ||
         h === 'document status' || h === 'direction'
}

// ─── Component Props ─────────────────────────────────────────────────

interface ReportPreviewViewProps {
  reportType: ReportType
  reportName: string
  params: ReportParams
  onBack: () => void
}

// ─── Main Component ──────────────────────────────────────────────────

export function ReportPreviewView({ reportType, reportName, params, onBack }: ReportPreviewViewProps) {
  const [headers, setHeaders] = useState<string[]>([])
  const [rows, setRows] = useState<(string | number | null | undefined)[][]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [downloading, setDownloading] = useState<string | null>(null)
  const token = useAuthStore((s) => s.token)

  const reportDisplayName = reportName || REPORT_NAMES[reportType] || reportType

  // Format filter summary
  const filterSummary = [
    params.dateFrom ? `From: ${params.dateFrom}` : null,
    params.dateTo ? `To: ${params.dateTo}` : null,
    params.truckId ? `Truck: ${params.truckId}` : null,
    params.driverId ? `Driver: ${params.driverId}` : null,
    params.zoneId ? `Zone: ${params.zoneId}` : null,
  ].filter(Boolean)

  // ── Fetch data ──
  const fetchData = useCallback(async () => {
    if (!token) return
    setLoading(true)
    setError(null)

    try {
      const res = await fetch('/api/reports/preview-data', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ type: reportType, params }),
      })

      if (!res.ok) {
        const errData = await res.json().catch(() => ({ error: 'Failed to fetch' }))
        throw new Error(errData.error || `Server error ${res.status}`)
      }

      const data = await res.json()
      setHeaders(data.headers || [])
      setRows(data.rows || [])
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load report data')
      toast.error('Failed to load report preview')
    } finally {
      setLoading(false)
    }
  }, [token, reportType, JSON.stringify(params)])

  useEffect(() => {
    fetchData()
    document.title = `${reportDisplayName} — iFleetPro`
    return () => {
      document.title = 'Reports Hub — iFleetPro'
    }
  }, [fetchData, reportDisplayName])

  // ── Download handlers ──
  const handleDownload = useCallback(async (format: 'pdf' | 'xlsx' | 'csv') => {
    if (!token) return
    setDownloading(format)

    try {
      const res = await fetch('/api/reports/generate', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ type: reportType, format, params }),
      })

      if (!res.ok) {
        const errData = await res.json().catch(() => ({ error: 'Generation failed' }))
        throw new Error(errData.error || `Failed to generate ${format}`)
      }

      const contentDisposition = res.headers.get('Content-Disposition')
      const ext = format === 'xlsx' ? 'xlsx' : format === 'csv' ? 'csv' : 'pdf'
      let filename = `${reportType}-${new Date().toISOString().split('T')[0]}.${ext}`
      if (contentDisposition) {
        const match = contentDisposition.match(/filename[^;=\n]*=((['"]).*?\2|[^;\n]*)/)
        if (match?.[1]) filename = match[1].replace(/['"]/g, '')
      }

      const blob = await res.blob()

      if (format === 'pdf') {
        const url = URL.createObjectURL(blob)
        const win = window.open(url, '_blank')
        if (win) {
          win.addEventListener('load', () => win.print())
        } else {
          triggerDownload(blob, filename)
          toast.warning('Pop-up blocked. PDF downloaded instead.')
          return
        }
        toast.success(`${reportDisplayName} opened for printing`)
      } else {
        triggerDownload(blob, filename)
        const label = format === 'xlsx' ? 'Excel' : format.toUpperCase()
        toast.success(`${reportDisplayName} (${label}) downloaded`)
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : `Failed to generate ${format}`)
    } finally {
      setDownloading(null)
    }
  }, [token, reportType, reportDisplayName, JSON.stringify(params)])

  // ── Loading state ──
  if (loading) {
    return (
      <div className="space-y-4">
        {/* Header skeleton */}
        <div className="flex items-center gap-3">
          <Skeleton className="size-9 rounded-lg" />
          <div className="space-y-1.5">
            <Skeleton className="h-5 w-48" />
            <Skeleton className="h-3 w-72" />
          </div>
        </div>
        {/* Table skeleton */}
        <div className="rounded-lg border">
          <div className="p-4 space-y-3">
            <Skeleton className="h-10 w-full" />
            {Array.from({ length: 8 }).map((_, i) => (
              <Skeleton key={i} className="h-12 w-full" />
            ))}
          </div>
        </div>
      </div>
    )
  }

  // ── Error state ──
  if (error) {
    return (
      <div className="space-y-4">
        <div className="flex items-center gap-3">
          <Button variant="outline" size="sm" onClick={onBack} className="gap-1.5">
            <ArrowLeft className="size-4" />
            Back to Reports
          </Button>
        </div>
        <div className="flex flex-col items-center justify-center py-20 text-center">
          <div className="size-16 rounded-full bg-red-100 dark:bg-red-950/50 flex items-center justify-center mb-4">
            <AlertTriangle className="size-8 text-red-500" />
          </div>
          <h3 className="text-lg font-semibold">Failed to Load Report</h3>
          <p className="text-sm text-muted-foreground mt-1 max-w-md">{error}</p>
          <div className="flex gap-2 mt-4">
            <Button variant="outline" size="sm" onClick={fetchData}>
              <RefreshCw className="size-3.5 mr-1.5" />
              Retry
            </Button>
            <Button variant="outline" size="sm" onClick={onBack}>
              <ArrowLeft className="size-3.5 mr-1.5" />
              Back to Reports
            </Button>
          </div>
        </div>
      </div>
    )
  }

  // ── Empty state ──
  if (rows.length === 0) {
    return (
      <div className="space-y-4">
        <div className="flex items-center gap-3">
          <Button variant="outline" size="sm" onClick={onBack} className="gap-1.5">
            <ArrowLeft className="size-4" />
            Back to Reports
          </Button>
        </div>
        <div className="flex flex-col items-center justify-center py-20 text-center">
          <div className="size-16 rounded-full bg-muted flex items-center justify-center mb-4">
            <BarChart3 className="size-8 text-muted-foreground" />
          </div>
          <h3 className="text-lg font-semibold">No Data Available</h3>
          <p className="text-sm text-muted-foreground mt-1 max-w-md">
            There is no data for this report with the current filters. Try adjusting the date range or other filters.
          </p>
          <Button variant="outline" size="sm" onClick={onBack} className="mt-4">
            <ArrowLeft className="size-3.5 mr-1.5" />
            Back to Reports
          </Button>
        </div>
      </div>
    )
  }

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3 }}
      className="space-y-4"
    >
      {/* ── Top Bar: Back + Title + Actions ────────────────────── */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div className="flex items-center gap-3 min-w-0">
          <Button
            variant="outline"
            size="sm"
            onClick={onBack}
            className="shrink-0 gap-1.5"
          >
            <ChevronLeft className="size-4" />
            <span className="hidden sm:inline">Back to Reports</span>
          </Button>
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <h1 className="text-lg sm:text-xl font-bold tracking-tight truncate">{reportDisplayName}</h1>
              <Badge variant="secondary" className="text-xs shrink-0 tabular-nums">
                {rows.length} rows
              </Badge>
            </div>
            {filterSummary.length > 0 && (
              <p className="text-xs text-muted-foreground mt-0.5 truncate">
                {filterSummary.join(' · ')}
              </p>
            )}
          </div>
        </div>

        {/* Download / Print Actions */}
        <div className="flex items-center gap-2 shrink-0">
          <Button
            size="sm"
            variant="outline"
            className="h-8 text-xs gap-1.5"
            onClick={() => handleDownload('xlsx')}
            disabled={!!downloading}
          >
            {downloading === 'xlsx' ? (
              <Loader2 className="size-3.5 animate-spin" />
            ) : (
              <FileSpreadsheet className="size-3.5 text-emerald-600 dark:text-emerald-400" />
            )}
            Excel
          </Button>
          <Button
            size="sm"
            variant="outline"
            className="h-8 text-xs gap-1.5"
            onClick={() => handleDownload('csv')}
            disabled={!!downloading}
          >
            {downloading === 'csv' ? (
              <Loader2 className="size-3.5 animate-spin" />
            ) : (
              <FileText className="size-3.5 text-blue-600 dark:text-blue-400" />
            )}
            CSV
          </Button>
          <Button
            size="sm"
            variant="outline"
            className="h-8 text-xs gap-1.5"
            onClick={() => handleDownload('pdf')}
            disabled={!!downloading}
          >
            {downloading === 'pdf' ? (
              <Loader2 className="size-3.5 animate-spin" />
            ) : (
              <Download className="size-3.5 text-red-500 dark:text-red-400" />
            )}
            PDF
          </Button>
          <Button
            size="sm"
            variant="default"
            className="h-8 text-xs gap-1.5"
            onClick={() => handleDownload('pdf')}
            disabled={!!downloading}
          >
            {downloading === 'pdf' ? (
              <Loader2 className="size-3.5 animate-spin" />
            ) : (
              <Printer className="size-3.5" />
            )}
            Print
          </Button>
        </div>
      </div>

      {/* ── Data Table ──────────────────────────────────────────── */}
      <div className="rounded-lg border bg-card overflow-hidden">
        {/* Desktop Table */}
        <div className="hidden md:block overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow className="bg-muted/50 hover:bg-muted/50">
                <TableHead className="w-10 text-center text-xs font-bold">#</TableHead>
                {headers.map((header, i) => (
                  <TableHead
                    key={i}
                    className={`text-xs font-bold whitespace-nowrap ${
                      i === 0 ? 'text-left min-w-[140px]' : 'text-right'
                    }`}
                  >
                    {header}
                  </TableHead>
                ))}
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((row, rowIdx) => (
                <TableRow
                  key={rowIdx}
                  className={`border-b transition-colors hover:bg-muted/30 ${
                    rowIdx % 2 === 0 ? '' : 'bg-muted/10'
                  }`}
                >
                  <TableCell className="text-center text-xs text-muted-foreground font-mono tabular-nums">
                    {rowIdx + 1}
                  </TableCell>
                  {headers.map((header, colIdx) => {
                    const value = row[colIdx]
                    const statusColor = isStatusHeader(header) ? getStatusColor(value) : null
                    return (
                      <TableCell
                        key={colIdx}
                        className={`text-sm whitespace-nowrap max-w-[300px] truncate ${
                          colIdx === 0 ? 'font-medium text-left' : 'text-right tabular-nums'
                        } ${statusColor || ''}`}
                        title={String(value ?? '')}
                      >
                        {statusColor ? (
                          <span className={`inline-flex items-center px-2 py-0.5 rounded-md text-xs font-medium ${statusColor}`}>
                            {formatCell(value, header)}
                          </span>
                        ) : (
                          formatCell(value, header)
                        )}
                      </TableCell>
                    )
                  })}
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>

        {/* Mobile Cards */}
        <div className="md:hidden divide-y">
          {rows.map((row, rowIdx) => (
            <div key={rowIdx} className="p-4 space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-xs font-mono text-muted-foreground">#{rowIdx + 1}</span>
                <span className="text-sm font-semibold truncate max-w-[60%]">
                  {String(row[0] ?? '—')}
                </span>
              </div>
              <div className="grid grid-cols-2 gap-x-4 gap-y-1.5 text-xs">
                {headers.slice(1).map((header, colIdx) => {
                  const value = row[colIdx + 1]
                  const statusColor = isStatusHeader(header) ? getStatusColor(value) : null
                  return (
                    <div key={colIdx} className="min-w-0">
                      <span className="text-muted-foreground block truncate">{header}: </span>
                      {statusColor ? (
                        <span className={`inline-flex items-center px-1.5 py-0.5 rounded text-[11px] font-medium ${statusColor}`}>
                          {formatCell(value, header)}
                        </span>
                      ) : (
                        <span className="font-medium truncate block">{formatCell(value, header)}</span>
                      )}
                    </div>
                  )
                })}
              </div>
            </div>
          ))}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between px-4 py-3 border-t bg-muted/20 text-xs text-muted-foreground">
          <span>Showing {rows.length} row{rows.length !== 1 ? 's' : ''}</span>
          <span>Generated: {new Date().toLocaleString()}</span>
        </div>
      </div>

      {/* ── Bottom Back Button ──────────────────────────────────── */}
      <div className="flex justify-center pt-2">
        <Button variant="ghost" size="sm" onClick={onBack} className="gap-1.5 text-muted-foreground">
          <ArrowLeft className="size-3.5" />
          Back to Reports Hub
        </Button>
      </div>
    </motion.div>
  )
}
