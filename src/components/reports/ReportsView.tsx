'use client'

import * as React from 'react'
import { motion } from 'framer-motion'
import {
  BarChart3, AlertCircle, RefreshCw, Loader2, Download,
  Users, Truck, MapPin, GitCompareArrows, FileText,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Card, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Skeleton } from '@/components/ui/skeleton'
import { Label } from '@/components/ui/label'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { apiFetch } from '@/lib/api'
import { CURRENCY_SYMBOL } from '@/lib/constants'
import { toast } from 'sonner'

// ─── Types ───

type ReportType = 'driver_performance' | 'truck_performance' | 'zone_analysis' | 'comparative'

interface ReportConfig {
  id: ReportType
  name: string
  description: string
  icon: React.ComponentType<{ className?: string }>
  columns: { key: string; label: string }[]
}

interface ReportRow {
  [key: string]: string | number | null | undefined
}

const REPORT_TYPES: ReportConfig[] = [
  {
    id: 'driver_performance',
    name: 'Driver Performance',
    description: 'Driver metrics: trips, distance, fuel efficiency, revenue',
    icon: Users,
    columns: [
      { key: 'driverName', label: 'Driver' },
      { key: 'totalTrips', label: 'Trips' },
      { key: 'totalDistance', label: 'Distance (km)' },
      { key: 'totalFuel', label: 'Fuel Used (L)' },
      { key: 'fuelEfficiency', label: 'Efficiency (km/L)' },
      { key: 'totalRevenue', label: 'Revenue' },
    ],
  },
  {
    id: 'truck_performance',
    name: 'Truck Performance',
    description: 'Truck metrics: utilization, revenue, expenses, profit',
    icon: Truck,
    columns: [
      { key: 'plateNumber', label: 'Truck' },
      { key: 'totalTrips', label: 'Trips' },
      { key: 'totalRevenue', label: 'Revenue' },
      { key: 'totalExpenses', label: 'Total Expenses' },
      { key: 'totalFuelCost', label: 'Fuel Cost' },
      { key: 'netProfit', label: 'Net Profit' },
      { key: 'avgRevenuePerTrip', label: 'Avg Revenue/Trip' },
    ],
  },
  {
    id: 'zone_analysis',
    name: 'Zone Analysis',
    description: 'Zone metrics: delivery count, average distance, revenue per zone',
    icon: MapPin,
    columns: [
      { key: 'zoneName', label: 'Zone' },
      { key: 'cityName', label: 'City' },
      { key: 'totalTrips', label: 'Deliveries' },
      { key: 'totalDistance', label: 'Total Distance (km)' },
      { key: 'fuelEfficiency', label: 'Efficiency (km/L)' },
      { key: 'totalRevenue', label: 'Revenue' },
    ],
  },
  {
    id: 'comparative',
    name: 'Comparative',
    description: 'Compare driver performance across zones',
    icon: GitCompareArrows,
    columns: [
      { key: 'driverName', label: 'Driver' },
      { key: 'zoneName', label: 'Zone' },
      { key: 'trips', label: 'Trips' },
      { key: 'avgDistance', label: 'Avg Distance (km)' },
      { key: 'fuelEfficiency', label: 'Fuel Efficiency (km/L)' },
      { key: 'totalRevenue', label: 'Revenue' },
    ],
  },
]

const containerVariants = {
  show: { transition: { staggerChildren: 0.04 } },
}

const itemVariants = {
  show: { opacity: 1, y: 0 },
}

// ─── Component ───

export function ReportsView() {
  const [reportType, setReportType] = React.useState<ReportType>('driver_performance')
  const [dateFrom, setDateFrom] = React.useState(
    new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0]
  )
  const [dateTo, setDateTo] = React.useState(
    new Date().toISOString().split('T')[0]
  )

  const [rows, setRows] = React.useState<ReportRow[]>([])
  const [loading, setLoading] = React.useState(false)
  const [error, setError] = React.useState<string | null>(null)
  const [hasSearched, setHasSearched] = React.useState(false)

  const currentConfig = REPORT_TYPES.find((r) => r.id === reportType)!

  // ─── Fetch report data ───

  const loadReport = React.useCallback(async () => {
    setLoading(true)
    setError(null)
    setHasSearched(true)
    try {
      const params = new URLSearchParams()
      // Map internal report type keys to API type values
      const typeMap: Record<string, string> = {
        driver_performance: 'driver',
        truck_performance: 'truck',
        zone_analysis: 'zone',
        comparative: 'comparative',
      }
      params.set('type', typeMap[reportType] || reportType)
      if (dateFrom) params.set('dateFrom', dateFrom)
      if (dateTo) params.set('dateTo', dateTo)
      const qs = params.toString()
      const res = await apiFetch<{ data: ReportRow[] }>(`/api/reports/performance?${qs}`)
      setRows(res.data || [])
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to fetch report data')
      setRows([])
    } finally {
      setLoading(false)
    }
  }, [reportType, dateFrom, dateTo])

  // Auto-load on first render
  React.useEffect(() => {
    loadReport()
  }, [])

  // Re-load when type or dates change (with debounce)
  const debounceRef = React.useRef<ReturnType<typeof setTimeout>>()
  React.useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current)
    debounceRef.current = setTimeout(() => {
      loadReport()
    }, 500)
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current)
    }
  }, [reportType, dateFrom, dateTo, loadReport])

  // ─── Export placeholder ───

  function handleExport() {
    toast.info('Export functionality coming soon. Report data will be downloaded as CSV/Excel.')
  }

  // ─── Format cell value ───

  function formatValue(value: string | number | null | undefined, key: string): string {
    if (value === null || value === undefined) return '—'
    if (typeof value === 'number') {
      // Revenue / cost / profit fields
      if (key.toLowerCase().includes('revenue') || key.toLowerCase().includes('cost') || key.toLowerCase().includes('price') || key.toLowerCase().includes('profit')) {
        const formatted = value.toLocaleString('en-GH', { maximumFractionDigits: 0 })
        return `${CURRENCY_SYMBOL}${formatted}`
      }
      // Efficiency
      if (key.toLowerCase().includes('efficiency')) {
        return `${value.toFixed(2)} km/L`
      }
      // Fuel volume
      if (key.toLowerCase().includes('fuel') || key.toLowerCase().includes('liters') || key.toLowerCase().includes('litres')) {
        return `${value.toFixed(1)} L`
      }
      // Distance
      if (key.toLowerCase().includes('distance') || key.toLowerCase().includes('mileage')) {
        return `${value.toLocaleString()} km`
      }
      // Count / trips
      if (key.toLowerCase().includes('count') || key.toLowerCase().includes('trips') || key.toLowerCase().includes('deliveries')) {
        return String(value)
      }
      // Avg
      if (key.startsWith('avg')) {
        if (key.toLowerCase().includes('distance')) return `${value.toFixed(1)} km`
        if (key.toLowerCase().includes('efficiency')) return `${value.toFixed(2)} km/L`
        if (key.toLowerCase().includes('revenue') || key.toLowerCase().includes('profit') || key.toLowerCase().includes('cost')) {
          return `${CURRENCY_SYMBOL}${value.toLocaleString('en-GH', { maximumFractionDigits: 0 })}`
        }
        return value.toFixed(2)
      }
      return value.toLocaleString()
    }
    return String(value)
  }

  // ─── Render ───

  return (
    <motion.div
      variants={containerVariants}
      animate="show"
      className="space-y-4 sm:space-y-6"
    >
      {/* Header */}
      <motion.div variants={itemVariants} className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight flex items-center gap-2">
            <BarChart3 className="h-6 w-6 text-amber-500" />
            Performance Reports
          </h1>
          <p className="text-muted-foreground">Analyze driver, truck, and zone performance</p>
        </div>
        <Button variant="outline" onClick={handleExport}>
          <Download className="mr-2 h-4 w-4" />
          Export
        </Button>
      </motion.div>

      {/* Filters */}
      <motion.div variants={itemVariants}>
        <Card>
          <CardContent className="p-4">
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <div className="space-y-1.5">
                <Label className="text-xs text-muted-foreground">Report Type</Label>
                <Select
                  value={reportType}
                  onValueChange={(v) => setReportType(v as ReportType)}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {REPORT_TYPES.map((rt) => {
                      const Icon = rt.icon
                      return (
                        <SelectItem key={rt.id} value={rt.id}>
                          <span className="flex items-center gap-2">
                            <Icon className="h-3.5 w-3.5" />
                            {rt.name}
                          </span>
                        </SelectItem>
                      )
                    })}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs text-muted-foreground">From Date</Label>
                <Input
                  type="date"
                  value={dateFrom}
                  onChange={(e) => setDateFrom(e.target.value)}
                />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs text-muted-foreground">To Date</Label>
                <Input
                  type="date"
                  value={dateTo}
                  onChange={(e) => setDateTo(e.target.value)}
                />
              </div>
            </div>
          </CardContent>
        </Card>
      </motion.div>

      {/* Report description */}
      <motion.div variants={itemVariants}>
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <FileText className="h-4 w-4" />
          <span>{currentConfig.description}</span>
        </div>
      </motion.div>

      {/* Results Table */}
      <motion.div variants={itemVariants}>
        <div className="rounded-lg border bg-card">
          {error ? (
            <div className="flex flex-col items-center justify-center py-12 text-center">
              <AlertCircle className="h-8 w-8 text-red-500 mb-3" />
              <p className="text-sm text-muted-foreground mb-3">{error}</p>
              <Button variant="outline" size="sm" onClick={loadReport}>
                <RefreshCw className="mr-2 h-3 w-3" /> Retry
              </Button>
            </div>
          ) : loading ? (
            <div className="p-4 space-y-3">
              {[1, 2, 3, 4, 5, 6].map((i) => (
                <Skeleton key={i} className="h-12 w-full rounded" />
              ))}
            </div>
          ) : rows.length === 0 && hasSearched ? (
            <div className="flex flex-col items-center justify-center py-12 text-center">
              <BarChart3 className="h-8 w-8 text-muted-foreground mb-3" />
              <p className="text-sm font-medium">No data found</p>
              <p className="text-xs text-muted-foreground mt-1">Try adjusting the date range or report type</p>
            </div>
          ) : (
            <>
              <div className="hidden md:block overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow className="bg-muted/50 border-b">
                      {currentConfig.columns.map((col) => (
                        <TableHead
                          key={col.key}
                          className={
                            col.key === currentConfig.columns[0].key
                              ? 'text-left'
                              : 'text-right'
                          }
                        >
                          {col.label}
                        </TableHead>
                      ))}
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {rows.map((row, idx) => (
                      <TableRow
                        key={idx}
                        className="border-b transition-colors hover:bg-muted/50"
                      >
                        {currentConfig.columns.map((col) => (
                          <TableCell
                            key={col.key}
                            className={
                              col.key === currentConfig.columns[0].key
                                ? 'font-medium text-sm'
                                : 'text-right text-sm'
                            }
                          >
                            {formatValue(row[col.key], col.key)}
                          </TableCell>
                        ))}
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>

              {/* Mobile Cards */}
              <div className="md:hidden divide-y">
                {rows.map((row, idx) => (
                  <div key={idx} className="p-4 space-y-2">
                    <p className="font-semibold text-sm">
                      {row[currentConfig.columns[0].key] as string || '—'}
                    </p>
                    <div className="grid grid-cols-2 gap-x-4 gap-y-1.5 text-xs">
                      {currentConfig.columns.slice(1).map((col) => (
                        <div key={col.key}>
                          <span className="text-muted-foreground">{col.label}: </span>
                          <span className="font-medium">{formatValue(row[col.key], col.key)}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                ))}
              </div>

              <div className="text-center text-xs text-muted-foreground py-3">
                Showing {rows.length} result{rows.length !== 1 ? 's' : ''}
              </div>
            </>
          )}
        </div>
      </motion.div>
    </motion.div>
  )
}

export default ReportsView
