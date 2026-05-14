'use client'

import * as React from 'react'
import { motion } from 'framer-motion'
import {
  BarChart3, Search, AlertCircle, RefreshCw, Loader2,
  Gauge, Fuel, Route, Users, TrendingDown, TrendingUp, Minus,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
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

interface PerformanceEntry {
  driverId: string
  driverName: string
  zoneId: string
  zoneName: string
  totalDistance: number
  expectedRange: { min: number; max: number } | null
  status: 'GREEN' | 'YELLOW' | 'RED'
  totalFuelUsed: number
  fuelEfficiency: number // km per litre
  tripCount: number
}

interface PerformanceSummary {
  totalDrivers: number
  greenCount: number
  yellowCount: number
  redCount: number
  avgFuelEfficiency: number
  totalDistance: number
  totalFuelUsed: number
}

interface PerformanceDashboardData {
  summary: PerformanceSummary
  entries: PerformanceEntry[]
}

// ─── Status helpers ───

function getStatusConfig(status: string) {
  switch (status) {
    case 'GREEN':
      return {
        bg: 'bg-emerald-100 dark:bg-emerald-900/30',
        text: 'text-emerald-700 dark:text-emerald-400',
        border: 'border-emerald-200 dark:border-emerald-800',
        icon: TrendingUp,
        label: 'Good',
      }
    case 'YELLOW':
      return {
        bg: 'bg-amber-100 dark:bg-amber-900/30',
        text: 'text-amber-700 dark:text-amber-400',
        border: 'border-amber-200 dark:border-amber-800',
        icon: Minus,
        label: 'Fair',
      }
    case 'RED':
      return {
        bg: 'bg-red-100 dark:bg-red-900/30',
        text: 'text-red-700 dark:text-red-400',
        border: 'border-red-200 dark:border-red-800',
        icon: TrendingDown,
        label: 'Poor',
      }
    default:
      return {
        bg: 'bg-gray-100 dark:bg-gray-800',
        text: 'text-gray-600 dark:text-gray-400',
        border: 'border-gray-200 dark:border-gray-700',
        icon: Minus,
        label: 'N/A',
      }
  }
}

const containerVariants = {
  show: { transition: { staggerChildren: 0.04 } },
}

const itemVariants = {
  show: { opacity: 1, y: 0 },
}

// ─── Component ───

export function PerformanceDashboard() {
  const [dateFrom, setDateFrom] = React.useState(
    new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0]
  )
  const [dateTo, setDateTo] = React.useState(
    new Date().toISOString().split('T')[0]
  )
  const [zoneFilter, setZoneFilter] = React.useState<string>('all')

  const [data, setData] = React.useState<PerformanceDashboardData | null>(null)
  const [zones, setZones] = React.useState<{ id: string; name: string }[]>([])
  const [loading, setLoading] = React.useState(true)
  const [loadingZones, setLoadingZones] = React.useState(false)
  const [error, setError] = React.useState<string | null>(null)

  // ─── Fetch zones for filter ───

  React.useEffect(() => {
    setLoadingZones(true)
    apiFetch<{ data: { id: string; name: string }[] }>('/api/destination-zones?limit=100')
      .then((res) => setZones(res.data || []))
      .catch(() => setZones([]))
      .finally(() => setLoadingZones(false))
  }, [])

  // ─── Fetch performance data ───

  const loadPerformance = React.useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const params = new URLSearchParams()
      if (dateFrom) params.set('dateFrom', dateFrom)
      if (dateTo) params.set('dateTo', dateTo)
      if (zoneFilter && zoneFilter !== 'all') params.set('zoneId', zoneFilter)
      const qs = params.toString()
      const res = await apiFetch<PerformanceDashboardData>(`/api/performance-dashboard${qs ? `?${qs}` : ''}`)
      setData(res)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to fetch performance data')
    } finally {
      setLoading(false)
    }
  }, [dateFrom, dateTo, zoneFilter])

  React.useEffect(() => {
    loadPerformance()
  }, [loadPerformance])

  const summary = data?.summary
  const entries = data?.entries || []

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
            <Gauge className="h-6 w-6 text-amber-500" />
            Performance Dashboard
          </h1>
          <p className="text-muted-foreground">Monitor driver performance by zone</p>
        </div>
        <Button variant="outline" onClick={loadPerformance} disabled={loading}>
          <RefreshCw className={`mr-2 h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
          Refresh
        </Button>
      </motion.div>

      {/* Filters */}
      <motion.div variants={itemVariants}>
        <Card>
          <CardContent className="p-4">
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
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
              <div className="space-y-1.5">
                <Label className="text-xs text-muted-foreground">Zone</Label>
                <Select value={zoneFilter} onValueChange={setZoneFilter} disabled={loadingZones}>
                  <SelectTrigger>
                    <SelectValue placeholder={loadingZones ? 'Loading...' : 'All zones'} />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All Zones</SelectItem>
                    {zones.map((z) => (
                      <SelectItem key={z.id} value={z.id}>
                        {z.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
          </CardContent>
        </Card>
      </motion.div>

      {/* Summary Cards */}
      <motion.div variants={itemVariants} className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        {loading ? (
          Array.from({ length: 4 }).map((_, i) => (
            <Card key={i}>
              <CardContent className="p-4">
                <Skeleton className="h-3 w-20 mb-2" />
                <Skeleton className="h-7 w-12" />
              </CardContent>
            </Card>
          ))
        ) : summary ? (
          <>
            <Card className="hover:shadow-md transition-shadow">
              <CardContent className="p-4">
                <div className="flex items-center gap-1.5 mb-2">
                  <Users className="h-3.5 w-3.5 text-amber-500" />
                  <span className="text-xs text-muted-foreground">Total Drivers</span>
                </div>
                <p className="text-2xl font-bold">{summary.totalDrivers}</p>
              </CardContent>
            </Card>
            <Card className="hover:shadow-md transition-shadow">
              <CardContent className="p-4">
                <div className="flex items-center gap-1.5 mb-2">
                  <TrendingUp className="h-3.5 w-3.5 text-emerald-500" />
                  <span className="text-xs text-muted-foreground">Good (Green)</span>
                </div>
                <p className="text-2xl font-bold text-emerald-600">{summary.greenCount}</p>
              </CardContent>
            </Card>
            <Card className="hover:shadow-md transition-shadow">
              <CardContent className="p-4">
                <div className="flex items-center gap-1.5 mb-2">
                  <Minus className="h-3.5 w-3.5 text-amber-500" />
                  <span className="text-xs text-muted-foreground">Fair (Yellow)</span>
                </div>
                <p className="text-2xl font-bold text-amber-600">{summary.yellowCount}</p>
              </CardContent>
            </Card>
            <Card className="hover:shadow-md transition-shadow">
              <CardContent className="p-4">
                <div className="flex items-center gap-1.5 mb-2">
                  <TrendingDown className="h-3.5 w-3.5 text-red-500" />
                  <span className="text-xs text-muted-foreground">Poor (Red)</span>
                </div>
                <p className="text-2xl font-bold text-red-600">{summary.redCount}</p>
              </CardContent>
            </Card>
          </>
        ) : null}
      </motion.div>

      {/* Performance Cards */}
      {!loading && !error && entries.length > 0 && (
        <motion.div variants={itemVariants}>
          <h2 className="text-lg font-semibold mb-3">Driver Performance by Zone</h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
            {entries.map((entry) => {
              const statusConf = getStatusConfig(entry.status)
              const StatusIcon = statusConf.icon
              return (
                <Card key={`${entry.driverId}-${entry.zoneId}`} className={`hover:shadow-md transition-shadow border ${statusConf.border}`}>
                  <CardContent className="p-4 space-y-3">
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <p className="text-sm font-semibold truncate">{entry.driverName}</p>
                        <p className="text-xs text-muted-foreground">{entry.zoneName}</p>
                      </div>
                      <div className={`rounded-full p-1.5 ${statusConf.bg}`}>
                        <StatusIcon className={`h-4 w-4 ${statusConf.text}`} />
                      </div>
                    </div>
                    <div className="space-y-1.5">
                      <div className="flex items-center justify-between text-xs">
                        <span className="text-muted-foreground">Status</span>
                        <Badge
                          variant="outline"
                          className={`border-transparent text-[10px] font-medium ${statusConf.bg} ${statusConf.text}`}
                        >
                          {statusConf.label}
                        </Badge>
                      </div>
                      <div className="flex items-center justify-between text-xs">
                        <span className="text-muted-foreground">Distance</span>
                        <span className="font-medium">{entry.totalDistance.toLocaleString()} km</span>
                      </div>
                      {entry.expectedRange && (
                        <div className="flex items-center justify-between text-xs">
                          <span className="text-muted-foreground">Expected Range</span>
                          <span className="font-medium">
                            {entry.expectedRange.min} – {entry.expectedRange.max} km
                          </span>
                        </div>
                      )}
                      <div className="flex items-center justify-between text-xs">
                        <span className="text-muted-foreground">Fuel Used</span>
                        <span className="font-medium">{entry.totalFuelUsed.toFixed(1)} L</span>
                      </div>
                      <div className="flex items-center justify-between text-xs">
                        <span className="text-muted-foreground">Efficiency</span>
                        <span className={`font-medium ${statusConf.text}`}>
                          {entry.fuelEfficiency.toFixed(2)} km/L
                        </span>
                      </div>
                      <div className="flex items-center justify-between text-xs">
                        <span className="text-muted-foreground">Trips</span>
                        <span className="font-medium">{entry.tripCount}</span>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              )
            })}
          </div>
        </motion.div>
      )}

      {/* Summary Table */}
      <motion.div variants={itemVariants}>
        <div className="rounded-lg border bg-card">
          {error ? (
            <div className="flex flex-col items-center justify-center py-12 text-center">
              <AlertCircle className="h-8 w-8 text-red-500 mb-3" />
              <p className="text-sm text-muted-foreground mb-3">{error}</p>
              <Button variant="outline" size="sm" onClick={loadPerformance}>
                <RefreshCw className="mr-2 h-3 w-3" /> Retry
              </Button>
            </div>
          ) : loading ? (
            <div className="p-4 space-y-3">
              {[1, 2, 3, 4, 5].map((i) => (
                <Skeleton key={i} className="h-12 w-full rounded" />
              ))}
            </div>
          ) : entries.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-12 text-center">
              <BarChart3 className="h-8 w-8 text-muted-foreground mb-3" />
              <p className="text-sm font-medium">No performance data</p>
              <p className="text-xs text-muted-foreground mt-1">Adjust the filters or date range</p>
            </div>
          ) : (
            <>
              <div className="hidden md:block overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow className="bg-muted/50 border-b">
                      <TableHead>Driver</TableHead>
                      <TableHead>Zone</TableHead>
                      <TableHead className="text-right">Distance</TableHead>
                      <TableHead className="text-right">Expected Range</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead className="text-right">Fuel Used</TableHead>
                      <TableHead className="text-right">Fuel Efficiency</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {entries.map((entry) => {
                      const statusConf = getStatusConfig(entry.status)
                      return (
                        <TableRow key={`${entry.driverId}-${entry.zoneId}`} className="border-b transition-colors hover:bg-muted/50">
                          <TableCell className="font-medium text-sm">{entry.driverName}</TableCell>
                          <TableCell className="text-sm text-muted-foreground">{entry.zoneName}</TableCell>
                          <TableCell className="text-right text-sm">{entry.totalDistance.toLocaleString()} km</TableCell>
                          <TableCell className="text-right text-sm">
                            {entry.expectedRange
                              ? `${entry.expectedRange.min} – ${entry.expectedRange.max} km`
                              : '—'}
                          </TableCell>
                          <TableCell>
                            <Badge
                              variant="outline"
                              className={`border-transparent text-[10px] font-medium ${statusConf.bg} ${statusConf.text}`}
                            >
                              {statusConf.label}
                            </Badge>
                          </TableCell>
                          <TableCell className="text-right text-sm">{entry.totalFuelUsed.toFixed(1)} L</TableCell>
                          <TableCell className="text-right text-sm font-medium">
                            {entry.fuelEfficiency.toFixed(2)} km/L
                          </TableCell>
                        </TableRow>
                      )
                    })}
                  </TableBody>
                </Table>
              </div>

              {/* Mobile Cards */}
              <div className="md:hidden divide-y">
                {entries.map((entry) => {
                  const statusConf = getStatusConfig(entry.status)
                  return (
                    <div key={`${entry.driverId}-${entry.zoneId}`} className="p-4 space-y-2">
                      <div className="flex items-start justify-between gap-2">
                        <div className="min-w-0">
                          <p className="font-semibold text-sm">{entry.driverName}</p>
                          <p className="text-xs text-muted-foreground">{entry.zoneName}</p>
                        </div>
                        <Badge
                          variant="outline"
                          className={`border-transparent text-[10px] font-medium shrink-0 ${statusConf.bg} ${statusConf.text}`}
                        >
                          {statusConf.label}
                        </Badge>
                      </div>
                      <div className="grid grid-cols-2 gap-2 text-xs">
                        <div>
                          <span className="text-muted-foreground">Distance: </span>
                          <span className="font-medium">{entry.totalDistance.toLocaleString()} km</span>
                        </div>
                        <div>
                          <span className="text-muted-foreground">Fuel: </span>
                          <span className="font-medium">{entry.totalFuelUsed.toFixed(1)} L</span>
                        </div>
                        <div>
                          <span className="text-muted-foreground">Efficiency: </span>
                          <span className={`font-medium ${statusConf.text}`}>{entry.fuelEfficiency.toFixed(2)} km/L</span>
                        </div>
                        <div>
                          <span className="text-muted-foreground">Expected: </span>
                          <span className="font-medium">
                            {entry.expectedRange
                              ? `${entry.expectedRange.min} – ${entry.expectedRange.max} km`
                              : '—'}
                          </span>
                        </div>
                      </div>
                    </div>
                  )
                })}
              </div>

              <div className="text-center text-xs text-muted-foreground py-3">
                Showing {entries.length} driver{entries.length !== 1 ? 's' : ''}
              </div>
            </>
          )}
        </div>
      </motion.div>
    </motion.div>
  )
}
