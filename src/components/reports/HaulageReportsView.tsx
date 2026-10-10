'use client'

import * as React from 'react'
import {
  BarChart3,
  Download,
  FileSpreadsheet,
  FileText,
  Filter,
  Loader2,
  RefreshCw,
  Route,
  ShieldCheck,
  Truck,
  X,
} from 'lucide-react'
import { toast } from 'sonner'

import { apiFetch } from '@/lib/api'
import { triggerDownload } from '@/lib/export'
import type {
  HaulageReportFamily,
  HaulageReportFilters,
  HaulageReportResult,
} from '@/lib/domain/reports/haulage-reports'
import { useAuthStore } from '@/lib/store/auth'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { DatePicker } from '@/components/ui/date-picker'
import { Label } from '@/components/ui/label'
import { SearchableSelect } from '@/components/ui/searchable-select'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Skeleton } from '@/components/ui/skeleton'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'

type ExportFormat = 'csv' | 'xlsx' | 'pdf'
type Option = { id: string; name: string }
type FilterOptions = {
  shippers: Option[]
  transporters: Option[]
  vehicles: Option[]
  drivers: Option[]
  routes: string[]
}

type FamilyDefinition = {
  id: HaulageReportFamily
  label: string
  description: string
  group: 'Operations' | 'Safety & Compliance' | 'Financial' | 'Technology'
}

const FAMILY_DEFINITIONS: FamilyDefinition[] = [
  { id: 'trip_operations', label: 'Trip Operations', description: 'Trip movement, cargo, tonnage and distance.', group: 'Operations' },
  { id: 'utilization', label: 'Fleet Utilization', description: 'Truck activity, distance and active hours.', group: 'Operations' },
  { id: 'route', label: 'Route Performance', description: 'Movement volume, distance and duration by corridor.', group: 'Operations' },
  { id: 'shipper_customer', label: 'Shipper & Customer', description: 'Service volume by shipper, customer and route.', group: 'Operations' },
  { id: 'loading_wait', label: 'Loading Wait & Detention', description: 'Factory queues, bay wait and detention.', group: 'Operations' },
  { id: 'driver_safety', label: 'Driver & Safety', description: 'Inspection outcomes, warnings and defects.', group: 'Safety & Compliance' },
  { id: 'fuel', label: 'Fuel Operations', description: 'Fuel volume, distance and cost facts.', group: 'Operations' },
  { id: 'maintenance', label: 'Maintenance', description: 'Maintenance events, status, mileage and cost.', group: 'Safety & Compliance' },
  { id: 'compliance', label: 'Compliance', description: 'Roadworthy, DVLA and insurance validity.', group: 'Safety & Compliance' },
  { id: 'weight_overload', label: 'Weight & Axle Compliance', description: 'Gross/tare/net weights and axle exceedance.', group: 'Safety & Compliance' },
  { id: 'pod_exceptions', label: 'POD Exceptions', description: 'Delivery discrepancies and evidence exceptions.', group: 'Operations' },
  { id: 'revenue_cost_margin', label: 'Revenue / Cost / Margin', description: 'Trip revenue against reconciled operating cost.', group: 'Financial' },
  { id: 'haulier_settlement', label: 'Haulier Settlement', description: 'Freight, deductions and net transporter payables.', group: 'Financial' },
  { id: 'driver_settlement', label: 'Driver Settlement', description: 'Driver earnings, deductions, bonuses and net pay.', group: 'Financial' },
  { id: 'device_health', label: 'Device Health', description: 'GPS/telematics connectivity and last-seen latency.', group: 'Technology' },
]

const EMPTY_OPTIONS: FilterOptions = { shippers: [], transporters: [], vehicles: [], drivers: [], routes: [] }

function prettyLabel(value: string) {
  return value.replace(/_/g, ' ').replace(/\b\w/g, (char) => char.toUpperCase())
}

function formatCell(value: unknown, key: string) {
  if (value === null || value === undefined || value === '') return '—'
  if (typeof value === 'boolean') return value ? 'Yes' : 'No'
  if (typeof value !== 'number') return String(value)

  const financial = /(revenue|cost|margin|profit|amount|payable|earnings|deduction|bonus|netPay)/i.test(key)
  if (financial) return `₵${value.toLocaleString('en-GH', { maximumFractionDigits: 2 })}`
  if (/percent/i.test(key)) return `${value.toLocaleString('en-GH', { maximumFractionDigits: 2 })}%`
  return value.toLocaleString('en-GH', { maximumFractionDigits: 2 })
}

function searchable(options: Option[]) {
  return options.map((option) => ({ value: option.id, label: option.name }))
}

function filtersToQuery(family: HaulageReportFamily, filters: HaulageReportFilters) {
  const query = new URLSearchParams({ family })
  Object.entries(filters).forEach(([key, value]) => {
    if (value) query.set(key, value)
  })
  return query.toString()
}

export function HaulageReportsView() {
  const token = useAuthStore((state) => state.token)
  const user = useAuthStore((state) => state.user)
  const [family, setFamily] = React.useState<HaulageReportFamily>('trip_operations')
  const [filters, setFilters] = React.useState<HaulageReportFilters>(() => ({
    dateFrom: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10),
    dateTo: new Date().toISOString().slice(0, 10),
  }))
  const [options, setOptions] = React.useState<FilterOptions>(EMPTY_OPTIONS)
  const [report, setReport] = React.useState<HaulageReportResult | null>(null)
  const [loading, setLoading] = React.useState(true)
  const [exporting, setExporting] = React.useState<ExportFormat | null>(null)
  const [error, setError] = React.useState<string | null>(null)

  const selectedFamily = React.useMemo(
    () => FAMILY_DEFINITIONS.find((definition) => definition.id === family) ?? FAMILY_DEFINITIONS[0],
    [family],
  )

  const loadOptions = React.useCallback(async () => {
    try {
      const data = await apiFetch<FilterOptions>('/api/reports/haulage/options')
      setOptions(data)
    } catch (err) {
      console.error('Haulage report filter options failed:', err)
    }
  }, [])

  const loadReport = React.useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const data = await apiFetch<HaulageReportResult>(`/api/reports/haulage?${filtersToQuery(family, filters)}`)
      setReport(data)
    } catch (err) {
      setReport(null)
      setError(err instanceof Error ? err.message : 'Failed to load haulage report.')
    } finally {
      setLoading(false)
    }
  }, [family, filters])

  React.useEffect(() => { void loadOptions() }, [loadOptions])
  React.useEffect(() => {
    const timer = window.setTimeout(() => { void loadReport() }, 250)
    return () => window.clearTimeout(timer)
  }, [loadReport])

  React.useEffect(() => {
    document.title = 'Haulage Reports — iFleetPro'
  }, [])

  function updateFilter(key: keyof HaulageReportFilters, value: string) {
    setFilters((current) => ({ ...current, [key]: value || undefined }))
  }

  function clearDimensions() {
    setFilters((current) => ({ dateFrom: current.dateFrom, dateTo: current.dateTo }))
  }

  async function exportReport(format: ExportFormat) {
    if (!token) {
      toast.error('Authentication required. Please sign in.')
      return
    }
    setExporting(format)
    try {
      const response = await fetch('/api/reports/haulage/export', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ family, format, filters }),
      })
      if (!response.ok) {
        const body = await response.json().catch(() => ({ error: 'Export failed.' }))
        throw new Error(body.error || 'Export failed.')
      }
      const disposition = response.headers.get('Content-Disposition')
      const match = disposition?.match(/filename[^;=\n]*=((['"]).*?\2|[^;\n]*)/)
      const filename = match?.[1]?.replace(/['"]/g, '')
        ?? `ifleetpro-${family}-${new Date().toISOString().slice(0, 10)}.${format}`
      triggerDownload(await response.blob(), filename)
      toast.success(`${selectedFamily.label} ${format.toUpperCase()} downloaded`)
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Report export failed.')
    } finally {
      setExporting(null)
    }
  }

  const dimensionFilterCount = [
    filters.shipperId, filters.transporterId, filters.vehicleId,
    filters.driverId, filters.route,
  ].filter(Boolean).length
  const isDriver = user?.role === 'Driver'

  return (
    <div className="mx-auto max-w-[1700px] space-y-5 p-4 md:p-6">
      <div className="flex flex-col gap-4 xl:flex-row xl:items-start xl:justify-between">
        <div className="space-y-2">
          <div className="flex items-center gap-2">
            <div className="flex size-10 items-center justify-center rounded-xl bg-amber-500/10">
              <BarChart3 className="size-5 text-amber-600" />
            </div>
            <div>
              <h1 className="text-xl font-bold tracking-tight sm:text-2xl">Ghana Haulage Reports</h1>
              <p className="text-sm text-muted-foreground">One authoritative reporting layer for operations, compliance, settlements and telematics.</p>
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Badge variant="secondary">15 report families</Badge>
            <Badge variant="outline">Screen / export parity</Badge>
            {isDriver && <Badge variant="outline"><ShieldCheck className="mr-1 size-3" /> Financial fields hidden</Badge>}
          </div>
        </div>

        <div className="flex flex-wrap gap-2">
          <Button variant="outline" size="sm" onClick={() => exportReport('csv')} disabled={!!exporting || loading}>
            {exporting === 'csv' ? <Loader2 className="mr-2 size-4 animate-spin" /> : <Download className="mr-2 size-4" />}
            CSV
          </Button>
          <Button variant="outline" size="sm" onClick={() => exportReport('xlsx')} disabled={!!exporting || loading}>
            {exporting === 'xlsx' ? <Loader2 className="mr-2 size-4 animate-spin" /> : <FileSpreadsheet className="mr-2 size-4 text-emerald-600" />}
            Excel
          </Button>
          <Button variant="outline" size="sm" onClick={() => exportReport('pdf')} disabled={!!exporting || loading}>
            {exporting === 'pdf' ? <Loader2 className="mr-2 size-4 animate-spin" /> : <FileText className="mr-2 size-4 text-red-500" />}
            PDF
          </Button>
          <Button variant="ghost" size="sm" onClick={() => void loadReport()} disabled={loading}>
            <RefreshCw className={`mr-2 size-4 ${loading ? 'animate-spin' : ''}`} /> Refresh
          </Button>
        </div>
      </div>

      <Card className="border-border/70">
        <CardContent className="p-4">
          <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4 2xl:grid-cols-7">
            <div className="space-y-1.5 md:col-span-2 xl:col-span-2">
              <Label>Report family</Label>
              <Select value={family} onValueChange={(value) => setFamily(value as HaulageReportFamily)}>
                <SelectTrigger className="h-9"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {(['Operations', 'Safety & Compliance', 'Financial', 'Technology'] as const).map((group) => (
                    <React.Fragment key={group}>
                      <div className="px-2 py-1.5 text-[10px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">{group}</div>
                      {FAMILY_DEFINITIONS.filter((definition) => definition.group === group).map((definition) => (
                        <SelectItem key={definition.id} value={definition.id}>{definition.label}</SelectItem>
                      ))}
                    </React.Fragment>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>From</Label>
              <DatePicker value={filters.dateFrom ?? ''} onChange={(value) => updateFilter('dateFrom', value)} />
            </div>
            <div className="space-y-1.5">
              <Label>To</Label>
              <DatePicker value={filters.dateTo ?? ''} onChange={(value) => updateFilter('dateTo', value)} />
            </div>
            <div className="space-y-1.5">
              <Label>Shipper</Label>
              <SearchableSelect value={filters.shipperId ?? ''} onValueChange={(value) => updateFilter('shipperId', value)} options={searchable(options.shippers)} placeholder="All shippers" />
            </div>
            <div className="space-y-1.5">
              <Label>Transporter</Label>
              <SearchableSelect value={filters.transporterId ?? ''} onValueChange={(value) => updateFilter('transporterId', value)} options={searchable(options.transporters)} placeholder="All transporters" />
            </div>
            <div className="space-y-1.5">
              <Label>Vehicle</Label>
              <SearchableSelect value={filters.vehicleId ?? ''} onValueChange={(value) => updateFilter('vehicleId', value)} options={searchable(options.vehicles)} placeholder="All trucks" />
            </div>
          </div>

          <div className="mt-3 grid gap-3 md:grid-cols-2 xl:grid-cols-[1fr_1fr_2fr_auto]">
            <div className="space-y-1.5">
              <Label>Driver</Label>
              <SearchableSelect value={filters.driverId ?? ''} onValueChange={(value) => updateFilter('driverId', value)} options={searchable(options.drivers)} placeholder={isDriver ? 'My driver profile' : 'All drivers'} disabled={isDriver} />
            </div>
            <div className="space-y-1.5 xl:col-span-2">
              <Label>Route</Label>
              <SearchableSelect value={filters.route ?? ''} onValueChange={(value) => updateFilter('route', value)} options={options.routes.map((route) => ({ value: route, label: route }))} placeholder="All routes" />
            </div>
            <div className="flex items-end">
              <Button variant="ghost" className="h-9 w-full xl:w-auto" onClick={clearDimensions} disabled={dimensionFilterCount === 0}>
                <X className="mr-2 size-4" /> Clear dimensions
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>

      <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_320px]">
        <Card className="min-w-0 border-border/70">
          <CardHeader className="border-b py-4">
            <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <CardTitle className="text-base">{selectedFamily.label}</CardTitle>
                <p className="mt-1 text-xs text-muted-foreground">{selectedFamily.description}</p>
              </div>
              <div className="flex items-center gap-2 text-xs text-muted-foreground">
                <Filter className="size-3.5" />
                {dimensionFilterCount} dimension filter{dimensionFilterCount === 1 ? '' : 's'}
              </div>
            </div>
          </CardHeader>
          <CardContent className="p-0">
            {error ? (
              <div className="flex min-h-72 flex-col items-center justify-center gap-3 p-8 text-center">
                <FileText className="size-9 text-muted-foreground" />
                <div>
                  <p className="font-medium">Report could not be loaded</p>
                  <p className="mt-1 text-sm text-muted-foreground">{error}</p>
                </div>
                <Button variant="outline" size="sm" onClick={() => void loadReport()}><RefreshCw className="mr-2 size-4" /> Retry</Button>
              </div>
            ) : loading ? (
              <div className="space-y-2 p-4">
                {[1, 2, 3, 4, 5, 6].map((row) => <Skeleton key={row} className="h-11 w-full" />)}
              </div>
            ) : !report || report.rows.length === 0 ? (
              <div className="flex min-h-72 flex-col items-center justify-center gap-2 p-8 text-center">
                <BarChart3 className="size-9 text-muted-foreground" />
                <p className="font-medium">No matching report rows</p>
                <p className="max-w-md text-sm text-muted-foreground">Adjust the date range or dimension filters. The report uses live authoritative haulage records only.</p>
              </div>
            ) : (
              <div className="max-h-[620px] overflow-auto">
                <Table>
                  <TableHeader className="sticky top-0 z-10 bg-background">
                    <TableRow>
                      {report.columns.map((column) => <TableHead key={column} className="whitespace-nowrap text-[11px]">{prettyLabel(column)}</TableHead>)}
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {report.rows.map((row, index) => (
                      <TableRow key={index}>
                        {report.columns.map((column) => (
                          <TableCell key={column} className="max-w-[320px] whitespace-nowrap text-xs">
                            <span className="block truncate" title={String(row[column] ?? '')}>{formatCell(row[column], column)}</span>
                          </TableCell>
                        ))}
                      </TableRow>
                    ))}
                    {Object.keys(report.totals).length > 0 && (
                      <TableRow className="sticky bottom-0 bg-muted/80 font-semibold backdrop-blur">
                        {report.columns.map((column, index) => (
                          <TableCell key={column} className="whitespace-nowrap text-xs">
                            {index === 0 ? 'TOTAL' : report.totals[column] !== undefined ? formatCell(report.totals[column], column) : '—'}
                          </TableCell>
                        ))}
                      </TableRow>
                    )}
                  </TableBody>
                </Table>
              </div>
            )}
          </CardContent>
        </Card>

        <div className="space-y-4">
          <Card className="border-border/70">
            <CardHeader className="pb-2"><CardTitle className="text-sm">Result summary</CardTitle></CardHeader>
            <CardContent className="space-y-3">
              <div className="grid grid-cols-2 gap-2">
                <div className="rounded-xl border bg-muted/20 p-3">
                  <div className="text-[10px] uppercase tracking-wide text-muted-foreground">Rows</div>
                  <div className="mt-1 text-xl font-bold tabular-nums">{report?.rows.length ?? 0}</div>
                </div>
                <div className="rounded-xl border bg-muted/20 p-3">
                  <div className="text-[10px] uppercase tracking-wide text-muted-foreground">Columns</div>
                  <div className="mt-1 text-xl font-bold tabular-nums">{report?.columns.length ?? 0}</div>
                </div>
              </div>
              {report && Object.entries(report.totals).slice(0, 8).map(([key, value]) => (
                <div key={key} className="flex items-center justify-between gap-3 border-b pb-2 text-xs last:border-0 last:pb-0">
                  <span className="truncate text-muted-foreground">{prettyLabel(key)}</span>
                  <span className="font-semibold tabular-nums">{formatCell(value, key)}</span>
                </div>
              ))}
              {report && Object.keys(report.totals).length === 0 && <p className="text-xs text-muted-foreground">This report contains categorical evidence rather than summable metrics.</p>}
            </CardContent>
          </Card>

          <Card className="border-border/70">
            <CardHeader className="pb-2"><CardTitle className="text-sm">Report integrity</CardTitle></CardHeader>
            <CardContent className="space-y-2 text-xs text-muted-foreground">
              <p className="flex gap-2"><ShieldCheck className="mt-0.5 size-3.5 shrink-0 text-emerald-600" /> Screen and exports use the same filtered result and total calculations.</p>
              <p className="flex gap-2"><Route className="mt-0.5 size-3.5 shrink-0 text-amber-600" /> Route, shipper, transporter, vehicle and driver dimensions come from authoritative trip/fleet records.</p>
              <p className="flex gap-2"><Truck className="mt-0.5 size-3.5 shrink-0 text-sky-600" /> Export runs are recorded in Report History for auditability.</p>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  )
}
