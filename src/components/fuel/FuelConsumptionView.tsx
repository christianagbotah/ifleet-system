'use client'

import * as React from 'react'
import { motion } from 'framer-motion'
import { apiFetch } from '@/lib/api'
import { CURRENCY_SYMBOL } from '@/lib/constants'
import { cn } from '@/lib/utils'
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
} from '@/components/ui/card'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Input } from '@/components/ui/input'
import { DatePicker } from '@/components/ui/date-picker'
import {
  Banknote,
  Route,
  TrendingUp,
  PieChart,
  Fuel,
  Truck,
  MapPin,
  Calendar,
  RefreshCw,
  Loader2,
  ArrowUpRight,
  ArrowDownRight,
  AlertCircle,
} from 'lucide-react'

// ──────────────────────────────────────────────
// Types
// ──────────────────────────────────────────────

interface FuelConsumptionData {
  summary: {
    totalFuelCost: number
    totalTrips: number
    avgFuelCostPerTrip: number
    avgFuelCostPerKm: number
    fuelAsPercentageOfRevenue: number
    totalRevenue: number
  }
  byTruck: Array<{
    truckId: string
    plateNumber: string
    make: string
    model: string
    totalFuelCost: number
    tripCount: number
    avgCostPerTrip: number
    avgCostPerKm: number
    totalDistance: number
    totalRevenue: number
    fuelCostRatio: number
  }>
  byZone: Array<{
    zoneId: string
    zoneName: string
    cityId: string
    cityName: string
    expectedFuelCost: number | null
    actualFuelCost: number
    tripCount: number
    deviation: number
    deviationPercent: number
  }>
  monthlyTrend: Array<{
    month: string
    year: number
    monthIndex: number
    totalFuelCost: number
    totalRevenue: number
    tripCount: number
    avgCostPerTrip: number
    fuelCostRatio: number
  }>
}

interface TruckOption {
  id: string
  plateNumber: string
}

// ──────────────────────────────────────────────
// Helpers
// ──────────────────────────────────────────────

const fmtCurrency = (val: number): string =>
  `${CURRENCY_SYMBOL} ${val.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`

const fmtNumber = (val: number): string =>
  val.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })

function getDateOffset(months: number): string {
  const d = new Date()
  d.setMonth(d.getMonth() - months)
  return d.toISOString().slice(0, 10)
}

function todayISO(): string {
  return new Date().toISOString().slice(0, 10)
}

// ──────────────────────────────────────────────
// Animation variants
// ──────────────────────────────────────────────

const containerVariants = {
  hidden: { opacity: 0 },
  visible: {
    opacity: 1,
    transition: { staggerChildren: 0.06 },
  },
}

const itemVariants = {
  hidden: { opacity: 0, y: 16 },
  visible: { opacity: 1, y: 0, transition: { duration: 0.35, ease: 'easeOut' } },
}

// ──────────────────────────────────────────────
// Period options
// ──────────────────────────────────────────────

const PERIOD_OPTIONS = [
  { label: '1M', months: 1 },
  { label: '3M', months: 3 },
  { label: '6M', months: 6 },
  { label: '12M', months: 12 },
] as const

// ──────────────────────────────────────────────
// Component
// ──────────────────────────────────────────────

export function FuelConsumptionView() {
  // Filters
  const [dateFrom, setDateFrom] = React.useState(() => getDateOffset(6))
  const [dateTo, setDateTo] = React.useState(() => todayISO())
  const [truckId, setTruckId] = React.useState<string>('all')
  const [activePeriod, setActivePeriod] = React.useState('6M')

  // Data
  const [data, setData] = React.useState<FuelConsumptionData | null>(null)
  const [trucks, setTrucks] = React.useState<TruckOption[]>([])
  const [loading, setLoading] = React.useState(true)
  const [error, setError] = React.useState<string | null>(null)

  // ── Fetch trucks ──
  React.useEffect(() => {
    let cancelled = false
    ;(async () => {
      try {
        const res = await apiFetch<{ data: TruckOption[] }>('/api/trucks?status=active&limit=200')
        if (!cancelled) setTrucks(res.data ?? [])
      } catch {
        // non-critical — just leave trucks empty
      }
    })()
    return () => { cancelled = true }
  }, [])

  // ── Fetch consumption data ──
  const fetchData = React.useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const params = new URLSearchParams()
      if (dateFrom) params.set('dateFrom', dateFrom)
      if (dateTo) params.set('dateTo', dateTo)
      if (truckId && truckId !== 'all') params.set('truckId', truckId)
      const result = await apiFetch<FuelConsumptionData>(`/api/fuel-consumption?${params.toString()}`)
      setData(result)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load data')
    } finally {
      setLoading(false)
    }
  }, [dateFrom, dateTo, truckId])

  React.useEffect(() => {
    fetchData()
  }, [fetchData])

  // ── Period preset handler ──
  const handlePeriodChange = (label: string, months: number) => {
    setActivePeriod(label)
    setDateFrom(getDateOffset(months))
    setDateTo(todayISO())
  }

  // ── Computed ──
  const hasData = data && !loading && !error
  const maxMonthlyCost = data?.monthlyTrend.length
    ? Math.max(...data.monthlyTrend.map((m) => m.totalFuelCost), 1)
    : 1

  // ────────────────────────────────────────────
  // Render
  // ────────────────────────────────────────────

  return (
    <div className="w-full max-w-7xl mx-auto space-y-6 p-4 md:p-6">
      {/* ── Header ── */}
      <motion.div
        initial={{ opacity: 0, y: -12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4 }}
        className="flex flex-col sm:flex-row sm:items-end sm:justify-between gap-2"
      >
        <div>
          <h1 className="text-2xl md:text-3xl font-bold tracking-tight flex items-center gap-2">
            <Fuel className="size-7 text-amber-500" />
            Fuel Consumption
          </h1>
          <p className="text-muted-foreground text-sm mt-1">
            Track fuel spending across trips, zones, and trucks
          </p>
        </div>
        <button
          onClick={fetchData}
          disabled={loading}
          className="inline-flex items-center gap-1.5 rounded-md border border-input bg-background px-3 py-2 text-sm font-medium hover:bg-accent transition-colors disabled:opacity-50"
        >
          <RefreshCw className={cn('size-4', loading && 'animate-spin')} />
          Refresh
        </button>
      </motion.div>

      {/* ── Filters ── */}
      <motion.div
        variants={itemVariants}
        initial="hidden"
        animate="visible"
        className="flex flex-col md:flex-row flex-wrap items-start md:items-center gap-3"
      >
        {/* Date From */}
        <div className="flex items-center gap-2">
          <Calendar className="size-4 text-muted-foreground" />
          <DatePicker value={dateFrom} onChange={(val) => setDateFrom(val)} className="w-[150px]" />
          <span className="text-muted-foreground text-sm">to</span>
          <DatePicker value={dateTo} onChange={(val) => setDateTo(val)} className="w-[150px]" />
        </div>

        {/* Truck Filter */}
        <Select value={truckId} onValueChange={setTruckId}>
          <SelectTrigger className="w-[200px]">
            <Truck className="size-4 mr-1 text-muted-foreground" />
            <SelectValue placeholder="All Trucks" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Trucks</SelectItem>
            {trucks.map((t) => (
              <SelectItem key={t.id} value={t.id}>
                {t.plateNumber}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        {/* Period presets */}
        <div className="flex items-center gap-1 rounded-lg border border-input p-1">
          {PERIOD_OPTIONS.map((p) => (
            <button
              key={p.label}
              onClick={() => handlePeriodChange(p.label, p.months)}
              className={cn(
                'rounded-md px-3 py-1 text-sm font-medium transition-colors',
                activePeriod === p.label
                  ? 'bg-primary text-primary-foreground shadow-sm'
                  : 'text-muted-foreground hover:bg-accent'
              )}
            >
              {p.label}
            </button>
          ))}
        </div>
      </motion.div>

      {/* ── Error ── */}
      {error && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          className="flex items-center gap-2 rounded-lg border border-destructive/50 bg-destructive/5 p-4 text-destructive text-sm"
        >
          <AlertCircle className="size-5 shrink-0" />
          {error}
        </motion.div>
      )}

      {/* ── KPI Cards ── */}
      <motion.div
        variants={containerVariants}
        initial="hidden"
        animate="visible"
        className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4"
      >
        {loading ? (
          Array.from({ length: 4 }).map((_, i) => (
            <motion.div key={i} variants={itemVariants}>
              <Card>
                <CardHeader>
                  <Skeleton className="h-4 w-24" />
                  <Skeleton className="h-7 w-32 mt-2" />
                </CardHeader>
                <CardContent>
                  <Skeleton className="h-4 w-20" />
                </CardContent>
              </Card>
            </motion.div>
          ))
        ) : (
          <>
            {/* Total Fuel Spend */}
            <motion.div variants={itemVariants}>
              <Card className="border-amber-200 dark:border-amber-900/50">
                <CardHeader>
                  <CardDescription className="flex items-center gap-1.5">
                    <Banknote className="size-4 text-amber-500" />
                    Total Fuel Spend
                  </CardDescription>
                  <CardTitle className="text-2xl font-bold text-amber-600 dark:text-amber-400">
                    {data ? fmtCurrency(data.summary.totalFuelCost) : '—'}
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <p className="text-xs text-muted-foreground">
                    {data?.summary.totalTrips ?? 0} trips in period
                  </p>
                </CardContent>
              </Card>
            </motion.div>

            {/* Avg Cost Per Trip */}
            <motion.div variants={itemVariants}>
              <Card className="border-emerald-200 dark:border-emerald-900/50">
                <CardHeader>
                  <CardDescription className="flex items-center gap-1.5">
                    <Route className="size-4 text-emerald-500" />
                    Avg Cost Per Trip
                  </CardDescription>
                  <CardTitle className="text-2xl font-bold text-emerald-600 dark:text-emerald-400">
                    {data ? fmtCurrency(data.summary.avgFuelCostPerTrip) : '—'}
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <p className="text-xs text-muted-foreground">
                    Per completed trip
                  </p>
                </CardContent>
              </Card>
            </motion.div>

            {/* Avg Cost Per Km */}
            <motion.div variants={itemVariants}>
              <Card className="border-sky-200 dark:border-sky-900/50">
                <CardHeader>
                  <CardDescription className="flex items-center gap-1.5">
                    <TrendingUp className="size-4 text-sky-500" />
                    Avg Cost Per Km
                  </CardDescription>
                  <CardTitle className="text-2xl font-bold text-sky-600 dark:text-sky-400">
                    {data ? fmtCurrency(data.summary.avgFuelCostPerKm) : '—'}
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <p className="text-xs text-muted-foreground">
                    Fuel cost per kilometre
                  </p>
                </CardContent>
              </Card>
            </motion.div>

            {/* Fuel % of Revenue */}
            <motion.div variants={itemVariants}>
              <Card className="border-violet-200 dark:border-violet-900/50">
                <CardHeader>
                  <CardDescription className="flex items-center gap-1.5">
                    <PieChart className="size-4 text-violet-500" />
                    Fuel % of Revenue
                  </CardDescription>
                  <CardTitle className="text-2xl font-bold text-violet-600 dark:text-violet-400">
                    {data ? `${fmtNumber(data.summary.fuelAsPercentageOfRevenue)}%` : '—'}
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <p className="text-xs text-muted-foreground">
                    Revenue: {data ? fmtCurrency(data.summary.totalRevenue) : '—'}
                  </p>
                </CardContent>
              </Card>
            </motion.div>
          </>
        )}
      </motion.div>

      {/* ── Loading spinner (no skeleton) ── */}
      {loading && (
        <div className="flex items-center justify-center py-12">
          <Loader2 className="size-6 animate-spin text-muted-foreground" />
          <span className="ml-2 text-sm text-muted-foreground">Loading data…</span>
        </div>
      )}

      {/* ── Main content ── */}
      {hasData && (
        <motion.div
          variants={containerVariants}
          initial="hidden"
          animate="visible"
          className="space-y-6"
        >
          {/* ── Monthly Trend ── */}
          <motion.div variants={itemVariants}>
            <Card>
              <CardHeader>
                <CardTitle className="text-lg">Monthly Fuel Spend</CardTitle>
                <CardDescription>
                  Fuel cost per month in {CURRENCY_SYMBOL}
                </CardDescription>
              </CardHeader>
              <CardContent>
                {data.monthlyTrend.length === 0 ? (
                  <EmptyState message="No monthly trend data available" />
                ) : (
                  <div className="space-y-2 max-h-80 overflow-y-auto pr-1">
                    {data.monthlyTrend.map((entry) => {
                      const pct = Math.max((entry.totalFuelCost / maxMonthlyCost) * 100, 2)
                      return (
                        <div key={entry.month} className="flex items-center gap-3 group">
                          <span className="text-xs text-muted-foreground w-20 shrink-0 text-right font-medium">
                            {entry.month}
                          </span>
                          <div className="flex-1 h-7 bg-muted rounded-md overflow-hidden relative">
                            <motion.div
                              initial={{ width: 0 }}
                              animate={{ width: `${pct}%` }}
                              transition={{ duration: 0.6, ease: 'easeOut' }}
                              className="h-full bg-gradient-to-r from-amber-400 to-amber-500 rounded-md"
                            />
                          </div>
                          <span className="text-xs font-semibold w-28 shrink-0 text-right tabular-nums">
                            {fmtCurrency(entry.totalFuelCost)}
                          </span>
                        </div>
                      )
                    })}
                  </div>
                )}
              </CardContent>
            </Card>
          </motion.div>

          {/* ── Tabs: By Truck / By Zone ── */}
          <motion.div variants={itemVariants}>
            <Tabs defaultValue="byTruck">
              <TabsList>
                <TabsTrigger value="byTruck" className="gap-1.5">
                  <Truck className="size-4" />
                  By Truck
                </TabsTrigger>
                <TabsTrigger value="byZone" className="gap-1.5">
                  <MapPin className="size-4" />
                  By Zone
                </TabsTrigger>
              </TabsList>

              {/* ─── By Truck ─── */}
              <TabsContent value="byTruck">
                <Card>
                  <CardHeader>
                    <CardTitle className="text-lg">Fuel Cost by Truck</CardTitle>
                    <CardDescription>
                      Spending breakdown per truck for the selected period
                    </CardDescription>
                  </CardHeader>
                  <CardContent>
                    {data.byTruck.length === 0 ? (
                      <EmptyState message="No truck data available" />
                    ) : (
                      <>
                        {/* Desktop Table */}
                        <div className="hidden md:block">
                          <Table>
                            <TableHeader>
                              <TableRow>
                                <TableHead>Plate #</TableHead>
                                <TableHead>Make / Model</TableHead>
                                <TableHead className="text-right">Total Fuel Cost</TableHead>
                                <TableHead className="text-right">Trips</TableHead>
                                <TableHead className="text-right">Cost / Trip</TableHead>
                                <TableHead className="text-right">Cost / Km</TableHead>
                                <TableHead className="text-right">Revenue</TableHead>
                                <TableHead className="text-right">Fuel %</TableHead>
                              </TableRow>
                            </TableHeader>
                            <TableBody>
                              {data.byTruck.map((row) => (
                                <TableRow key={row.truckId}>
                                  <TableCell className="font-medium">{row.plateNumber}</TableCell>
                                  <TableCell className="text-muted-foreground">
                                    {row.make} {row.model}
                                  </TableCell>
                                  <TableCell className="text-right font-medium">
                                    {fmtCurrency(row.totalFuelCost)}
                                  </TableCell>
                                  <TableCell className="text-right">{row.tripCount}</TableCell>
                                  <TableCell className="text-right">
                                    {fmtCurrency(row.avgCostPerTrip)}
                                  </TableCell>
                                  <TableCell className="text-right">
                                    {fmtCurrency(row.avgCostPerKm)}
                                  </TableCell>
                                  <TableCell className="text-right">
                                    {fmtCurrency(row.totalRevenue)}
                                  </TableCell>
                                  <TableCell className="text-right">
                                    <FuelPercentBadge percent={row.fuelCostRatio} />
                                  </TableCell>
                                </TableRow>
                              ))}
                            </TableBody>
                          </Table>
                        </div>

                        {/* Mobile Card List */}
                        <div className="md:hidden space-y-3 max-h-96 overflow-y-auto">
                          {data.byTruck.map((row) => (
                            <div
                              key={row.truckId}
                              className="rounded-lg border p-4 space-y-2"
                            >
                              <div className="flex items-center justify-between">
                                <span className="font-semibold text-sm">{row.plateNumber}</span>
                                <FuelPercentBadge percent={row.fuelCostRatio} />
                              </div>
                              <p className="text-xs text-muted-foreground">
                                {row.make} {row.model}
                              </p>
                              <div className="grid grid-cols-2 gap-2 text-xs">
                                <div>
                                  <span className="text-muted-foreground">Fuel Cost</span>
                                  <p className="font-medium">{fmtCurrency(row.totalFuelCost)}</p>
                                </div>
                                <div>
                                  <span className="text-muted-foreground">Trips</span>
                                  <p className="font-medium">{row.tripCount}</p>
                                </div>
                                <div>
                                  <span className="text-muted-foreground">Cost / Trip</span>
                                  <p className="font-medium">{fmtCurrency(row.avgCostPerTrip)}</p>
                                </div>
                                <div>
                                  <span className="text-muted-foreground">Cost / Km</span>
                                  <p className="font-medium">{fmtCurrency(row.avgCostPerKm)}</p>
                                </div>
                                <div>
                                  <span className="text-muted-foreground">Revenue</span>
                                  <p className="font-medium">{fmtCurrency(row.totalRevenue)}</p>
                                </div>
                              </div>
                            </div>
                          ))}
                        </div>
                      </>
                    )}
                  </CardContent>
                </Card>
              </TabsContent>

              {/* ─── By Zone ─── */}
              <TabsContent value="byZone">
                <Card>
                  <CardHeader>
                    <CardTitle className="text-lg">Fuel Cost by Zone</CardTitle>
                    <CardDescription>
                      Zone-level spending with budget deviation tracking
                    </CardDescription>
                  </CardHeader>
                  <CardContent>
                    {data.byZone.length === 0 ? (
                      <EmptyState message="No zone data available" />
                    ) : (
                      <>
                        {/* Desktop Table */}
                        <div className="hidden md:block">
                          <Table>
                            <TableHeader>
                              <TableRow>
                                <TableHead>Zone Name</TableHead>
                                <TableHead>City</TableHead>
                                <TableHead className="text-right">Expected Cost</TableHead>
                                <TableHead className="text-right">Actual Cost</TableHead>
                                <TableHead className="text-right">Deviation</TableHead>
                                <TableHead className="text-right">Trips</TableHead>
                              </TableRow>
                            </TableHeader>
                            <TableBody>
                              {data.byZone.map((row) => (
                                <TableRow key={row.zoneId}>
                                  <TableCell className="font-medium">{row.zoneName}</TableCell>
                                  <TableCell className="text-muted-foreground">{row.cityName}</TableCell>
                                  <TableCell className="text-right">
                                    {row.expectedFuelCost != null
                                      ? fmtCurrency(row.expectedFuelCost)
                                      : '—'}
                                  </TableCell>
                                  <TableCell className="text-right font-medium">
                                    {fmtCurrency(row.actualFuelCost)}
                                  </TableCell>
                                  <TableCell className="text-right">
                                    <DeviationBadge
                                      deviation={row.deviation}
                                      deviationPercent={row.deviationPercent}
                                    />
                                  </TableCell>
                                  <TableCell className="text-right">{row.tripCount}</TableCell>
                                </TableRow>
                              ))}
                            </TableBody>
                          </Table>
                        </div>

                        {/* Mobile Card List */}
                        <div className="md:hidden space-y-3 max-h-96 overflow-y-auto">
                          {data.byZone.map((row) => (
                            <div
                              key={row.zoneId}
                              className="rounded-lg border p-4 space-y-2"
                            >
                              <div className="flex items-center justify-between">
                                <span className="font-semibold text-sm">{row.zoneName}</span>
                                <DeviationBadge
                                  deviation={row.deviation}
                                  deviationPercent={row.deviationPercent}
                                />
                              </div>
                              <p className="text-xs text-muted-foreground">{row.cityName}</p>
                              <div className="grid grid-cols-2 gap-2 text-xs">
                                <div>
                                  <span className="text-muted-foreground">Expected</span>
                                  <p className="font-medium">
                                    {row.expectedFuelCost != null
                                      ? fmtCurrency(row.expectedFuelCost)
                                      : '—'}
                                  </p>
                                </div>
                                <div>
                                  <span className="text-muted-foreground">Actual</span>
                                  <p className="font-medium">{fmtCurrency(row.actualFuelCost)}</p>
                                </div>
                                <div>
                                  <span className="text-muted-foreground">Trips</span>
                                  <p className="font-medium">{row.tripCount}</p>
                                </div>
                              </div>
                            </div>
                          ))}
                        </div>
                      </>
                    )}
                  </CardContent>
                </Card>
              </TabsContent>
            </Tabs>
          </motion.div>
        </motion.div>
      )}

      {/* ── No data ── */}
      {!loading && !error && data && (
        data.summary.totalTrips === 0 &&
        data.byTruck.length === 0 &&
        data.byZone.length === 0 &&
        data.monthlyTrend.every((m) => m.totalFuelCost === 0) && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
            <EmptyState message="No fuel consumption data found for the selected period." />
          </motion.div>
        )
      )}
    </div>
  )
}

// ──────────────────────────────────────────────
// Sub-components
// ──────────────────────────────────────────────

function FuelPercentBadge({ percent }: { percent: number }) {
  const color =
    percent > 40
      ? 'destructive'
      : percent > 25
        ? 'bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-400 border-amber-200 dark:border-amber-800'
        : 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-400 border-emerald-200 dark:border-emerald-800'

  if (percent > 40) {
    return (
      <Badge variant="destructive" className="tabular-nums">
        {fmtNumber(percent)}%
      </Badge>
    )
  }

  return (
    <Badge variant="outline" className={cn('tabular-nums', color)}>
      {fmtNumber(percent)}%
    </Badge>
  )
}

function DeviationBadge({
  deviation,
  deviationPercent,
}: {
  deviation: number
  deviationPercent: number
}) {
  const isOver = deviation > 0
  const isOnTrack = Math.abs(deviationPercent) <= 5

  if (isOnTrack) {
    return (
      <Badge
        variant="outline"
        className="bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-400 border-amber-200 dark:border-amber-800 tabular-nums"
      >
        <ArrowUpRight className="size-3" />
        {isOver ? '+' : ''}{fmtNumber(deviationPercent)}%
      </Badge>
    )
  }

  if (isOver) {
    return (
      <Badge variant="destructive" className="tabular-nums">
        <ArrowUpRight className="size-3" />
        +{fmtNumber(deviationPercent)}%
      </Badge>
    )
  }

  return (
    <Badge
      variant="outline"
      className="bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-400 border-emerald-200 dark:border-emerald-800 tabular-nums"
    >
      <ArrowDownRight className="size-3" />
      {fmtNumber(deviationPercent)}%
    </Badge>
  )
}

function EmptyState({ message }: { message: string }) {
  return (
    <div className="flex flex-col items-center justify-center py-12 text-center">
      <div className="rounded-full bg-muted p-4 mb-3">
        <Fuel className="size-6 text-muted-foreground" />
      </div>
      <p className="text-sm text-muted-foreground">{message}</p>
    </div>
  )
}
