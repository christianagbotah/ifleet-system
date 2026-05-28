'use client'

import React, { useState, useEffect, useCallback, useMemo } from 'react'
import { motion } from 'framer-motion'
import {
  TrendingUp,
  TrendingDown,
  DollarSign,
  Wallet,
  PiggyBank,
  Percent,
  ArrowUpDown,
  BarChart3,
  AlertTriangle,
  ChevronLeft,
  ChevronRight,
  CircleDollarSign,
} from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import { Badge } from '@/components/ui/badge'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { DatePicker } from '@/components/ui/date-picker'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import {
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
  ChartLegend,
  ChartLegendContent,
  type ChartConfig,
} from '@/components/ui/chart'
import {
  Bar,
  BarChart,
  XAxis,
  YAxis,
  CartesianGrid,
  Cell,
  Line,
  LineChart,
} from 'recharts'
import { apiFetch } from '@/lib/api'
import { CURRENCY_SYMBOL } from '@/lib/constants'

// ============ TYPES ============

interface ProfitabilityTrip {
  id: string
  tripNumber: string
  departureTime: string
  truck: { id: string; plateNumber: string; make: string; model: string }
  driver: { id: string; firstName: string; lastName: string }
  loadingLocation: string
  destination: string
  clientName: string | null
  revenue: number
  fuelCost: number
  expenses: number
  totalCost: number
  netProfit: number
  margin: number
}

interface ProfitabilitySummary {
  totalRevenue: number
  totalCost: number
  totalProfit: number
  avgMargin: number
  profitableTrips: number
  lossTrips: number
  bestRoute: string
  worstRoute: string
}

interface RouteAggregate {
  route: string
  trips: number
  revenue: number
  cost: number
  profit: number
  margin: number
}

interface TruckAggregate {
  truckId: string
  plateNumber: string
  trips: number
  revenue: number
  cost: number
  profit: number
  margin: number
}

interface ClientAggregate {
  clientName: string
  trips: number
  revenue: number
  cost: number
  profit: number
  margin: number
}

interface MonthlyTrendItem {
  month: string
  revenue: number
  cost: number
  profit: number
}

interface ProfitabilityResponse {
  trips: ProfitabilityTrip[]
  pagination: { page: number; limit: number; total: number; totalPages: number }
  summary: ProfitabilitySummary
  byRoute: RouteAggregate[]
  byTruck: TruckAggregate[]
  byClient: ClientAggregate[]
  monthlyTrend: MonthlyTrendItem[]
}

// ============ CHART CONFIGS ============

const revenueCostConfig = {
  revenue: { label: 'Revenue', color: 'hsl(38, 92%, 50%)' },
  cost: { label: 'Cost', color: 'hsl(0, 84%, 60%)' },
} satisfies ChartConfig

const profitByTruckConfig = {
  profit: { label: 'Net Profit', color: 'hsl(142, 71%, 45%)' },
} satisfies ChartConfig

const trendLineConfig = {
  revenue: { label: 'Revenue', color: 'hsl(38, 92%, 50%)' },
  cost: { label: 'Cost', color: 'hsl(0, 84%, 60%)' },
  profit: { label: 'Profit', color: 'hsl(142, 71%, 45%)' },
} satisfies ChartConfig

// ============ COLORS ============

const COLORS = [
  'hsl(38, 92%, 50%)',
  'hsl(142, 71%, 45%)',
  'hsl(25, 95%, 53%)',
  'hsl(0, 84%, 60%)',
  'hsl(47, 96%, 53%)',
  'hsl(173, 80%, 40%)',
  'hsl(340, 75%, 55%)',
  'hsl(200, 84%, 46%)',
  'hsl(262, 83%, 58%)',
  'hsl(15, 90%, 50%)',
]

// ============ HELPERS ============

function formatCurrency(value: number): string {
  return `${CURRENCY_SYMBOL}${value.toLocaleString('en-GH', { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`
}

function formatCurrencyFull(value: number): string {
  return `${CURRENCY_SYMBOL}${value.toLocaleString('en-GH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
}

function ProfitBadge({ profit }: { profit: number }) {
  if (profit > 0) {
    return (
      <Badge variant="outline" className="bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-900/30 dark:text-emerald-400 dark:border-emerald-800">
        +{formatCurrency(profit)}
      </Badge>
    )
  }
  if (profit < 0) {
    return (
      <Badge variant="outline" className="bg-red-50 text-red-700 border-red-200 dark:bg-red-900/30 dark:text-red-400 dark:border-red-800">
        {formatCurrency(profit)}
      </Badge>
    )
  }
  return (
    <Badge variant="outline" className="bg-gray-50 text-gray-600 border-gray-200 dark:bg-gray-900/30 dark:text-gray-400 dark:border-gray-800">
      {CURRENCY_SYMBOL}0
    </Badge>
  )
}

function MarginCell({ margin }: { margin: number }) {
  const color = margin > 0
    ? 'text-emerald-600 dark:text-emerald-400'
    : margin < 0
      ? 'text-red-600 dark:text-red-400'
      : 'text-muted-foreground'
  return (
    <span className={`font-semibold tabular-nums ${color}`}>
      {margin > 0 ? '+' : ''}{margin.toFixed(1)}%
    </span>
  )
}

function ProfitLossCell({ profit }: { profit: number }) {
  const color = profit > 0
    ? 'text-emerald-600 dark:text-emerald-400'
    : profit < 0
      ? 'text-red-600 dark:text-red-400'
      : 'text-muted-foreground'
  return (
    <span className={`font-semibold tabular-nums ${color}`}>
      {profit > 0 ? '+' : ''}{formatCurrency(profit)}
    </span>
  )
}

// ============ SUB-COMPONENTS ============

function KpiCard({
  title,
  value,
  icon: Icon,
  colorClass,
  subtext,
  loading,
}: {
  title: string
  value: string
  icon: React.ComponentType<{ className?: string }>
  colorClass: string
  subtext?: string
  loading: boolean
}) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4 }}
    >
      <Card className="gap-0 py-4">
        <CardContent className="p-4">
          <div className="flex items-start justify-between">
            <div className="space-y-1">
              <p className="text-sm text-muted-foreground">{title}</p>
              {loading ? (
                <Skeleton className="h-8 w-28" />
              ) : (
                <p className="text-2xl font-bold tracking-tight">{value}</p>
              )}
              {subtext && !loading && (
                <p className="text-xs text-muted-foreground">{subtext}</p>
              )}
            </div>
            <div className={`rounded-lg p-2.5 ${colorClass}`}>
              <Icon className="h-5 w-5 text-white" />
            </div>
          </div>
        </CardContent>
      </Card>
    </motion.div>
  )
}

function ChartSkeleton() {
  return (
    <Card className="gap-0 py-4">
      <CardHeader className="pb-2">
        <Skeleton className="h-5 w-48" />
        <Skeleton className="h-4 w-64" />
      </CardHeader>
      <CardContent className="p-4 pt-0">
        <Skeleton className="h-[300px] w-full rounded-lg" />
      </CardContent>
    </Card>
  )
}

function EmptyState({ message }: { message: string }) {
  return (
    <div className="flex flex-col items-center justify-center h-[280px] text-muted-foreground">
      <BarChart3 className="h-10 w-10 mb-2 opacity-40" />
      <p className="text-sm">{message}</p>
    </div>
  )
}

function SortIcon({ active }: { active: boolean }) {
  return <ArrowUpDown className={`h-3.5 w-3.5 ml-1 inline ${active ? 'opacity-100' : 'opacity-30'}`} />
}

// ============ MAIN COMPONENT ============

export function ProfitabilityView() {
  const [data, setData] = useState<ProfitabilityResponse | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  // Filters
  const [period, setPeriod] = useState('this_month')
  const [dateFrom, setDateFrom] = useState('')
  const [dateTo, setDateTo] = useState('')
  const [page, setPage] = useState(1)

  // Sorting
  const [sortKey, setSortKey] = useState<string>('departureTime')
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('desc')

  // Route sort
  const [routeSortKey, setRouteSortKey] = useState<string>('revenue')
  const [routeSortDir, setRouteSortDir] = useState<'asc' | 'desc'>('desc')

  // Truck sort
  const [truckSortKey, setTruckSortKey] = useState<string>('profit')
  const [truckSortDir, setTruckSortDir] = useState<'asc' | 'desc'>('desc')

  const limit = 15

  const loadData = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const params: Record<string, string> = {
        period,
        page: String(page),
        limit: String(limit),
      }
      if (period === 'custom' && dateFrom) params.dateFrom = dateFrom
      if (period === 'custom' && dateTo) params.dateTo = dateTo

      const sp = new URLSearchParams(params)
      const result = await apiFetch<ProfitabilityResponse>(`/api/trips/profitability?${sp}`)
      setData(result)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load profitability data')
    } finally {
      setLoading(false)
    }
  }, [period, dateFrom, dateTo, page])

  useEffect(() => {
    loadData()
  }, [loadData])

  // Reset page when filters change
  useEffect(() => {
    setPage(1)
  }, [period, dateFrom, dateTo])

  // ─── Sort helpers ───
  function handleSort(key: string, currentKey: string, currentDir: 'asc' | 'desc', setKey: (k: string) => void, setDir: (d: 'asc' | 'desc') => void) {
    if (currentKey === key) {
      setDir(d => d === 'asc' ? 'desc' : 'asc')
    } else {
      setKey(key)
      setDir('asc')
    }
  }

  function genericSort<T>(items: T[], key: string, dir: 'asc' | 'desc'): T[] {
    return [...items].sort((a, b) => {
      const aVal = (a as Record<string, unknown>)[key] as number | string
      const bVal = (b as Record<string, unknown>)[key] as number | string
      if (typeof aVal === 'number' && typeof bVal === 'number') {
        return dir === 'asc' ? aVal - bVal : bVal - aVal
      }
      return dir === 'asc'
        ? String(aVal).localeCompare(String(bVal))
        : String(bVal).localeCompare(String(aVal))
    })
  }

  // ─── Processed data ───
  const sortedTrips = useMemo(() => {
    if (!data?.trips) return []
    return genericSort(data.trips, sortKey, sortDir)
  }, [data, sortKey, sortDir])

  const sortedRoutes = useMemo(() => {
    if (!data?.byRoute) return []
    return genericSort(data.byRoute, routeSortKey, routeSortDir)
  }, [data, routeSortKey, routeSortDir])

  const sortedTrucks = useMemo(() => {
    if (!data?.byTruck) return []
    return genericSort(data.byTruck, truckSortKey, truckSortDir)
  }, [data, truckSortKey, truckSortDir])

  // Chart data
  const routeBarData = useMemo(() => {
    if (!data?.byRoute) return []
    return data.byRoute.slice(0, 10).map(r => ({
      name: r.route.length > 20 ? r.route.substring(0, 20) + '…' : r.route,
      revenue: r.revenue,
      cost: r.cost,
      profit: r.profit,
    }))
  }, [data])

  const truckBarData = useMemo(() => {
    if (!data?.byTruck) return []
    return data.byTruck.map(t => ({
      name: t.plateNumber,
      profit: t.profit,
      fill: t.profit >= 0 ? 'hsl(142, 71%, 45%)' : 'hsl(0, 84%, 60%)',
    }))
  }, [data])

  const trendData = useMemo(() => {
    if (!data?.monthlyTrend) return []
    return data.monthlyTrend.map(t => ({
      month: t.month,
      revenue: t.revenue,
      cost: t.cost,
      profit: t.profit,
    }))
  }, [data])

  // ─── Period display label ───
  const periodLabel = useMemo(() => {
    if (period === 'custom' && dateFrom && dateTo) {
      return `${dateFrom} to ${dateTo}`
    }
    const labels: Record<string, string> = {
      this_month: 'This Month',
      last_month: 'Last Month',
      this_quarter: 'This Quarter',
      this_year: 'This Year',
      custom: 'Custom',
    }
    return labels[period] || 'This Month'
  }, [period, dateFrom, dateTo])

  return (
    <div className="space-y-6">
      {/* Header */}
      <motion.div
        initial={{ opacity: 0, y: -10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.3 }}
        className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4"
      >
        <div>
          <h1 className="text-2xl font-bold tracking-tight flex items-center gap-2">
            <CircleDollarSign className="h-6 w-6 text-amber-500" />
            Trip Profitability
          </h1>
          <p className="text-muted-foreground mt-1">
            Per-trip &amp; per-route P&amp;L analysis with net profit and margin breakdowns
          </p>
        </div>
      </motion.div>

      {/* Filters */}
      <motion.div
        initial={{ opacity: 0, y: -5 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.3, delay: 0.05 }}
      >
        <Card className="gap-0 py-4">
          <CardContent className="p-4">
            <div className="flex flex-col sm:flex-row gap-3 items-end flex-wrap">
              <div className="min-w-[160px]">
                <label className="text-xs font-medium text-muted-foreground mb-1.5 block">Period</label>
                <Select value={period} onValueChange={setPeriod}>
                  <SelectTrigger>
                    <SelectValue placeholder="Select period" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="this_month">This Month</SelectItem>
                    <SelectItem value="last_month">Last Month</SelectItem>
                    <SelectItem value="this_quarter">This Quarter</SelectItem>
                    <SelectItem value="this_year">This Year</SelectItem>
                    <SelectItem value="custom">Custom Range</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              {period === 'custom' && (
                <>
                  <div className="min-w-[150px]">
                    <label className="text-xs font-medium text-muted-foreground mb-1.5 block">From</label>
                    <DatePicker value={dateFrom} onChange={(val) => setDateFrom(val)} />
                  </div>
                  <div className="min-w-[150px]">
                    <label className="text-xs font-medium text-muted-foreground mb-1.5 block">To</label>
                    <DatePicker value={dateTo} onChange={(val) => setDateTo(val)} />
                  </div>
                </>
              )}
              <Button
                variant="outline"
                onClick={() => { setPeriod('this_month'); setDateFrom(''); setDateTo('') }}
                className="shrink-0"
              >
                Reset
              </Button>
              <div className="ml-auto text-sm text-muted-foreground">
                Showing: <span className="font-medium text-foreground">{periodLabel}</span>
              </div>
            </div>
          </CardContent>
        </Card>
      </motion.div>

      {/* Error state */}
      {error && (
        <Card className="border-red-200 bg-red-50 dark:border-red-900/50 dark:bg-red-950/30">
          <CardContent className="p-4">
            <p className="text-sm text-red-600 dark:text-red-400">{error}</p>
          </CardContent>
        </Card>
      )}

      {/* KPI Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <KpiCard
          title="Total Revenue"
          value={loading ? '' : formatCurrency(data?.summary?.totalRevenue ?? 0)}
          icon={DollarSign}
          colorClass="bg-amber-500"
          subtext={`${data?.summary?.profitableTrips ?? 0} profitable trips`}
          loading={loading}
        />
        <KpiCard
          title="Total Cost"
          value={loading ? '' : formatCurrency(data?.summary?.totalCost ?? 0)}
          icon={Wallet}
          colorClass="bg-red-500"
          subtext="Fuel + Expenses"
          loading={loading}
        />
        <KpiCard
          title="Net Profit"
          value={loading ? '' : formatCurrency(data?.summary?.totalProfit ?? 0)}
          icon={PiggyBank}
          colorClass={(data?.summary?.totalProfit ?? 0) >= 0 ? 'bg-emerald-500' : 'bg-red-500'}
          subtext={(data?.summary?.totalProfit ?? 0) >= 0 ? 'Profitable' : 'Loss-making'}
          loading={loading}
        />
        <KpiCard
          title="Avg Margin"
          value={loading ? '' : `${(data?.summary?.avgMargin ?? 0).toFixed(1)}%`}
          icon={Percent}
          colorClass={(data?.summary?.avgMargin ?? 0) >= 0 ? 'bg-emerald-500' : 'bg-red-500'}
          subtext={`${data?.summary?.lossTrips ?? 0} loss-making trips`}
          loading={loading}
        />
      </div>

      {/* Best / Worst Route cards */}
      {!loading && data?.summary && (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.3, delay: 0.1 }}
          >
            <Card className="border-emerald-200 bg-emerald-50/50 dark:border-emerald-900/50 dark:bg-emerald-950/20 gap-0 py-4">
              <CardContent className="p-4">
                <div className="flex items-center gap-2">
                  <TrendingUp className="h-5 w-5 text-emerald-600 dark:text-emerald-400" />
                  <div>
                    <p className="text-xs text-muted-foreground">Most Profitable Route</p>
                    <p className="font-semibold text-emerald-700 dark:text-emerald-400">{data.summary.bestRoute}</p>
                  </div>
                </div>
              </CardContent>
            </Card>
          </motion.div>
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.3, delay: 0.15 }}
          >
            <Card className="border-red-200 bg-red-50/50 dark:border-red-900/50 dark:bg-red-950/20 gap-0 py-4">
              <CardContent className="p-4">
                <div className="flex items-center gap-2">
                  <TrendingDown className="h-5 w-5 text-red-600 dark:text-red-400" />
                  <div>
                    <p className="text-xs text-muted-foreground">Least Profitable Route</p>
                    <p className="font-semibold text-red-700 dark:text-red-400">{data.summary.worstRoute}</p>
                  </div>
                </div>
              </CardContent>
            </Card>
          </motion.div>
        </div>
      )}

      {/* Tabs */}
      <Tabs defaultValue="trips" className="w-full">
        <TabsList className="w-full sm:w-auto">
          <TabsTrigger value="trips">Trip Breakdown</TabsTrigger>
          <TabsTrigger value="routes">By Route</TabsTrigger>
          <TabsTrigger value="trucks">By Truck</TabsTrigger>
          <TabsTrigger value="trend">Monthly Trend</TabsTrigger>
        </TabsList>

        {/* ─── Tab 1: Trip Breakdown ─── */}
        <TabsContent value="trips">
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.3 }}
          >
            <Card className="gap-0 py-4">
              <CardHeader className="pb-2">
                <CardTitle className="text-base">Per-Trip Profitability</CardTitle>
                <CardDescription>
                  Revenue, cost, and profit for each completed trip — click column headers to sort
                </CardDescription>
              </CardHeader>
              <CardContent className="p-4 pt-0">
                {loading ? (
                  <div className="space-y-3">
                    {Array.from({ length: 5 }).map((_, i) => (
                      <Skeleton key={i} className="h-12 w-full rounded" />
                    ))}
                  </div>
                ) : sortedTrips.length === 0 ? (
                  <EmptyState message="No completed trips found for this period" />
                ) : (
                  <>
                    <div className="hidden md:block overflow-x-auto rounded-lg border max-h-[500px] overflow-y-auto">
                      <table className="w-full text-sm">
                        <thead className="sticky top-0 z-10">
                          <tr className="bg-muted/50 border-b backdrop-blur-sm">
                            <th className="px-3 py-3 text-left font-medium cursor-pointer hover:bg-muted/80 whitespace-nowrap" onClick={() => handleSort('tripNumber', sortKey, sortDir, setSortKey, setSortDir)}>
                              Trip # <SortIcon active={sortKey === 'tripNumber'} />
                            </th>
                            <th className="px-3 py-3 text-left font-medium cursor-pointer hover:bg-muted/80 whitespace-nowrap" onClick={() => handleSort('departureTime', sortKey, sortDir, setSortKey, setSortDir)}>
                              Date <SortIcon active={sortKey === 'departureTime'} />
                            </th>
                            <th className="px-3 py-3 text-left font-medium whitespace-nowrap hidden lg:table-cell">Truck</th>
                            <th className="px-3 py-3 text-left font-medium whitespace-nowrap hidden md:table-cell">Driver</th>
                            <th className="px-3 py-3 text-left font-medium whitespace-nowrap hidden xl:table-cell">Route</th>
                            <th className="px-3 py-3 text-right font-medium cursor-pointer hover:bg-muted/80 whitespace-nowrap" onClick={() => handleSort('revenue', sortKey, sortDir, setSortKey, setSortDir)}>
                              Revenue <SortIcon active={sortKey === 'revenue'} />
                            </th>
                            <th className="px-3 py-3 text-right font-medium cursor-pointer hover:bg-muted/80 whitespace-nowrap hidden sm:table-cell" onClick={() => handleSort('fuelCost', sortKey, sortDir, setSortKey, setSortDir)}>
                              Fuel <SortIcon active={sortKey === 'fuelCost'} />
                            </th>
                            <th className="px-3 py-3 text-right font-medium cursor-pointer hover:bg-muted/80 whitespace-nowrap hidden sm:table-cell" onClick={() => handleSort('expenses', sortKey, sortDir, setSortKey, setSortDir)}>
                              Expenses <SortIcon active={sortKey === 'expenses'} />
                            </th>
                            <th className="px-3 py-3 text-right font-medium cursor-pointer hover:bg-muted/80 whitespace-nowrap" onClick={() => handleSort('totalCost', sortKey, sortDir, setSortKey, setSortDir)}>
                              Total Cost <SortIcon active={sortKey === 'totalCost'} />
                            </th>
                            <th className="px-3 py-3 text-right font-medium cursor-pointer hover:bg-muted/80 whitespace-nowrap" onClick={() => handleSort('netProfit', sortKey, sortDir, setSortKey, setSortDir)}>
                              Net Profit <SortIcon active={sortKey === 'netProfit'} />
                            </th>
                            <th className="px-3 py-3 text-right font-medium cursor-pointer hover:bg-muted/80 whitespace-nowrap" onClick={() => handleSort('margin', sortKey, sortDir, setSortKey, setSortDir)}>
                              Margin % <SortIcon active={sortKey === 'margin'} />
                            </th>
                          </tr>
                        </thead>
                        <tbody>
                          {sortedTrips.map(trip => (
                            <tr key={trip.id} className="border-b last:border-0 hover:bg-muted/30 transition-colors">
                              <td className="px-3 py-3 font-medium whitespace-nowrap text-amber-700 dark:text-amber-400">
                                {trip.tripNumber}
                              </td>
                              <td className="px-3 py-3 whitespace-nowrap text-muted-foreground">
                                {new Date(trip.departureTime).toLocaleDateString('en-GB', { day: '2-digit', month: 'short' })}
                              </td>
                              <td className="px-3 py-3 whitespace-nowrap hidden lg:table-cell">
                                {trip.truck.plateNumber}
                              </td>
                              <td className="px-3 py-3 whitespace-nowrap hidden md:table-cell">
                                {trip.driver.firstName} {trip.driver.lastName}
                              </td>
                              <td className="px-3 py-3 whitespace-nowrap hidden xl:table-cell text-muted-foreground">
                                {trip.loadingLocation} → {trip.destination}
                              </td>
                              <td className="px-3 py-3 text-right tabular-nums">
                                {trip.revenue > 0 ? formatCurrency(trip.revenue) : <span className="text-muted-foreground">—</span>}
                              </td>
                              <td className="px-3 py-3 text-right tabular-nums text-orange-600 dark:text-orange-400 hidden sm:table-cell">
                                {formatCurrency(trip.fuelCost)}
                              </td>
                              <td className="px-3 py-3 text-right tabular-nums text-amber-600 dark:text-amber-400 hidden sm:table-cell">
                                {formatCurrency(trip.expenses)}
                              </td>
                              <td className="px-3 py-3 text-right tabular-nums font-medium">
                                {formatCurrency(trip.totalCost)}
                              </td>
                              <td className="px-3 py-3 text-right">
                                <ProfitLossCell profit={trip.netProfit} />
                              </td>
                              <td className="px-3 py-3 text-right">
                                <MarginCell margin={trip.margin} />
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                    {/* Mobile card view */}
                    <div className="md:hidden divide-y max-h-[500px] overflow-y-auto">
                      {sortedTrips.map(trip => (
                        <div key={trip.id} className="mobile-card p-4 space-y-2">
                          <div className="flex items-center justify-between">
                            <span className="font-semibold text-amber-700 dark:text-amber-400">{trip.tripNumber}</span>
                            <MarginCell margin={trip.margin} />
                          </div>
                          <p className="text-xs text-muted-foreground">
                            {new Date(trip.departureTime).toLocaleDateString('en-GB', { day: '2-digit', month: 'short' })} · {trip.truck.plateNumber}
                          </p>
                          <p className="text-xs text-muted-foreground truncate">
                            {trip.loadingLocation} → {trip.destination}
                          </p>
                          <div className="grid grid-cols-2 gap-2 text-sm">
                            <div>
                              <p className="text-xs text-muted-foreground">Revenue</p>
                              <p className="font-semibold">{trip.revenue > 0 ? formatCurrency(trip.revenue) : '—'}</p>
                            </div>
                            <div>
                              <p className="text-xs text-muted-foreground">Total Cost</p>
                              <p className="font-semibold">{formatCurrency(trip.totalCost)}</p>
                            </div>
                            <div>
                              <p className="text-xs text-muted-foreground">Fuel</p>
                              <p className="font-semibold text-orange-600 dark:text-orange-400">{formatCurrency(trip.fuelCost)}</p>
                            </div>
                            <div>
                              <p className="text-xs text-muted-foreground">Net Profit</p>
                              <p className="font-semibold"><ProfitLossCell profit={trip.netProfit} /></p>
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>

                    {/* Pagination */}
                    {data?.pagination && data.pagination.totalPages > 1 && (
                      <div className="flex items-center justify-between mt-4">
                        <p className="text-sm text-muted-foreground">
                          Page {data.pagination.page} of {data.pagination.totalPages} ({data.pagination.total} trips)
                        </p>
                        <div className="flex items-center gap-2">
                          <Button
                            variant="outline"
                            size="sm"
                            disabled={page <= 1}
                            onClick={() => setPage(p => p - 1)}
                          >
                            <ChevronLeft className="h-4 w-4" />
                          </Button>
                          <span className="text-sm font-medium">{page}</span>
                          <Button
                            variant="outline"
                            size="sm"
                            disabled={page >= data.pagination.totalPages}
                            onClick={() => setPage(p => p + 1)}
                          >
                            <ChevronRight className="h-4 w-4" />
                          </Button>
                        </div>
                      </div>
                    )}
                  </>
                )}
              </CardContent>
            </Card>
          </motion.div>
        </TabsContent>

        {/* ─── Tab 2: By Route ─── */}
        <TabsContent value="routes">
          <div className="grid grid-cols-1 gap-4">
            {/* Bar Chart */}
            {loading ? <ChartSkeleton /> : (
              <motion.div
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.4, delay: 0.1 }}
              >
                <Card className="gap-0 py-4">
                  <CardHeader className="pb-2">
                    <CardTitle className="text-base">Revenue vs Cost by Route</CardTitle>
                    <CardDescription>Top 10 routes by revenue — red bars indicate loss-making routes</CardDescription>
                  </CardHeader>
                  <CardContent className="p-4 pt-0">
                    {routeBarData.length === 0 ? (
                      <EmptyState message="No route data available" />
                    ) : (
                      <ChartContainer config={revenueCostConfig} className="h-[350px] w-full">
                        <BarChart data={routeBarData} margin={{ top: 5, right: 20, left: 10, bottom: 5 }}>
                          <CartesianGrid vertical={false} strokeDasharray="3 3" />
                          <XAxis
                            dataKey="name"
                            tickLine={false}
                            axisLine={false}
                            fontSize={11}
                            interval={0}
                            angle={-30}
                            textAnchor="end"
                            height={80}
                          />
                          <YAxis
                            tickLine={false}
                            axisLine={false}
                            fontSize={12}
                            tickFormatter={v => v >= 1000 ? `${(v / 1000).toFixed(0)}k` : String(v)}
                            domain={[0, 'auto']}
                            allowDecimals={false}
                          />
                          <ChartTooltip
                            content={<ChartTooltipContent formatter={(value) => formatCurrency(value as number)} />}
                          />
                          <ChartLegend />
                          <Bar dataKey="revenue" fill="hsl(38, 92%, 50%)" radius={[4, 4, 0, 0]} maxBarSize={32} />
                          <Bar dataKey="cost" fill="hsl(0, 84%, 60%)" radius={[4, 4, 0, 0]} maxBarSize={32} />
                        </BarChart>
                      </ChartContainer>
                    )}
                  </CardContent>
                </Card>
              </motion.div>
            )}

            {/* Route Table */}
            {loading ? <ChartSkeleton /> : (
              <motion.div
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.4, delay: 0.15 }}
              >
                <Card className="gap-0 py-4">
                  <CardHeader className="pb-2">
                    <CardTitle className="text-base">Route Profitability Summary</CardTitle>
                    <CardDescription>Aggregate P&amp;L per route — click column headers to sort</CardDescription>
                  </CardHeader>
                  <CardContent className="p-4 pt-0">
                    {sortedRoutes.length === 0 ? (
                      <EmptyState message="No route data available" />
                    ) : (
                      <>
                        <div className="hidden md:block overflow-x-auto rounded-lg border">
                          <table className="w-full text-sm">
                            <thead>
                              <tr className="bg-muted/50 border-b">
                                <th className="px-3 py-3 text-left font-medium cursor-pointer hover:bg-muted/80 whitespace-nowrap" onClick={() => handleSort('route', routeSortKey, routeSortDir, setRouteSortKey, setRouteSortDir)}>
                                  Route <SortIcon active={routeSortKey === 'route'} />
                                </th>
                                <th className="px-3 py-3 text-right font-medium cursor-pointer hover:bg-muted/80 whitespace-nowrap" onClick={() => handleSort('trips', routeSortKey, routeSortDir, setRouteSortKey, setRouteSortDir)}>
                                  Trips <SortIcon active={routeSortKey === 'trips'} />
                                </th>
                                <th className="px-3 py-3 text-right font-medium cursor-pointer hover:bg-muted/80 whitespace-nowrap" onClick={() => handleSort('revenue', routeSortKey, routeSortDir, setRouteSortKey, setRouteSortDir)}>
                                  Revenue <SortIcon active={routeSortKey === 'revenue'} />
                                </th>
                                <th className="px-3 py-3 text-right font-medium cursor-pointer hover:bg-muted/80 whitespace-nowrap" onClick={() => handleSort('cost', routeSortKey, routeSortDir, setRouteSortKey, setRouteSortDir)}>
                                  Cost <SortIcon active={routeSortKey === 'cost'} />
                                </th>
                                <th className="px-3 py-3 text-right font-medium cursor-pointer hover:bg-muted/80 whitespace-nowrap" onClick={() => handleSort('profit', routeSortKey, routeSortDir, setRouteSortKey, setRouteSortDir)}>
                                  Net Profit <SortIcon active={routeSortKey === 'profit'} />
                                </th>
                                <th className="px-3 py-3 text-right font-medium cursor-pointer hover:bg-muted/80 whitespace-nowrap" onClick={() => handleSort('margin', routeSortKey, routeSortDir, setRouteSortKey, setRouteSortDir)}>
                                  Margin % <SortIcon active={routeSortKey === 'margin'} />
                                </th>
                              </tr>
                            </thead>
                            <tbody>
                              {sortedRoutes.map(r => {
                                const isLoss = r.profit < 0
                                return (
                                  <tr
                                    key={r.route}
                                    className={`border-b last:border-0 hover:bg-muted/30 transition-colors ${isLoss ? 'bg-red-50/50 dark:bg-red-950/10' : ''}`}
                                  >
                                    <td className="px-3 py-3 font-medium whitespace-nowrap">
                                      {isLoss && <AlertTriangle className="h-3.5 w-3.5 text-red-500 inline mr-1.5" />}
                                      {r.route}
                                    </td>
                                    <td className="px-3 py-3 text-right tabular-nums">{r.trips}</td>
                                    <td className="px-3 py-3 text-right tabular-nums">{formatCurrency(r.revenue)}</td>
                                    <td className="px-3 py-3 text-right tabular-nums text-orange-600 dark:text-orange-400">{formatCurrency(r.cost)}</td>
                                    <td className="px-3 py-3 text-right">
                                      <ProfitLossCell profit={r.profit} />
                                    </td>
                                    <td className="px-3 py-3 text-right">
                                      <MarginCell margin={r.margin} />
                                    </td>
                                  </tr>
                                )
                              })}
                            </tbody>
                          </table>
                        </div>
                        {/* Mobile card view */}
                        <div className="md:hidden divide-y">
                          {sortedRoutes.map(r => (
                            <div key={r.route} className={`mobile-card p-4 space-y-2 ${r.profit < 0 ? 'bg-red-50/50 dark:bg-red-950/10' : ''}`}>
                              <div className="flex items-center justify-between">
                                <span className="font-semibold text-sm truncate pr-2">
                                  {r.profit < 0 && <AlertTriangle className="h-3.5 w-3.5 text-red-500 inline mr-1" />}
                                  {r.route}
                                </span>
                                <MarginCell margin={r.margin} />
                              </div>
                              <p className="text-xs text-muted-foreground">{r.trips} trips</p>
                              <div className="grid grid-cols-3 gap-2 text-sm">
                                <div>
                                  <p className="text-xs text-muted-foreground">Revenue</p>
                                  <p className="font-semibold">{formatCurrency(r.revenue)}</p>
                                </div>
                                <div>
                                  <p className="text-xs text-muted-foreground">Cost</p>
                                  <p className="font-semibold text-orange-600 dark:text-orange-400">{formatCurrency(r.cost)}</p>
                                </div>
                                <div>
                                  <p className="text-xs text-muted-foreground">Profit</p>
                                  <p className="font-semibold"><ProfitLossCell profit={r.profit} /></p>
                                </div>
                              </div>
                            </div>
                          ))}
                        </div>
                      </>
                    )}
                  </CardContent>
                </Card>
              </motion.div>
            )}
          </div>
        </TabsContent>

        {/* ─── Tab 3: By Truck ─── */}
        <TabsContent value="trucks">
          <div className="grid grid-cols-1 gap-4">
            {/* Horizontal Bar Chart */}
            {loading ? <ChartSkeleton /> : (
              <motion.div
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.4, delay: 0.1 }}
              >
                <Card className="gap-0 py-4">
                  <CardHeader className="pb-2">
                    <CardTitle className="text-base">Profit by Truck</CardTitle>
                    <CardDescription>Net profit per truck — green for profit, red for loss</CardDescription>
                  </CardHeader>
                  <CardContent className="p-4 pt-0">
                    {truckBarData.length === 0 ? (
                      <EmptyState message="No truck data available" />
                    ) : (
                      <ChartContainer config={profitByTruckConfig} className="h-[300px] w-full">
                        <BarChart data={truckBarData} layout="vertical" margin={{ top: 5, right: 40, left: 10, bottom: 5 }}>
                          <CartesianGrid horizontal={false} strokeDasharray="3 3" />
                          <XAxis
                            type="number"
                            tickLine={false}
                            axisLine={false}
                            fontSize={12}
                            tickFormatter={v => v >= 1000 ? `${(v / 1000).toFixed(0)}k` : String(v)}
                          />
                          <YAxis
                            type="category"
                            dataKey="name"
                            tickLine={false}
                            axisLine={false}
                            fontSize={12}
                            width={110}
                          />
                          <ChartTooltip
                            content={<ChartTooltipContent formatter={(value) => formatCurrency(value as number)} />}
                          />
                          <Bar dataKey="profit" radius={[0, 4, 4, 0]} maxBarSize={28}>
                            {truckBarData.map((entry, index) => (
                              <Cell key={`cell-${index}`} fill={entry.fill} />
                            ))}
                          </Bar>
                        </BarChart>
                      </ChartContainer>
                    )}
                  </CardContent>
                </Card>
              </motion.div>
            )}

            {/* Truck Table */}
            {loading ? <ChartSkeleton /> : (
              <motion.div
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.4, delay: 0.15 }}
              >
                <Card className="gap-0 py-4">
                  <CardHeader className="pb-2">
                    <CardTitle className="text-base">Truck Profitability Summary</CardTitle>
                    <CardDescription>Aggregate P&amp;L per truck</CardDescription>
                  </CardHeader>
                  <CardContent className="p-4 pt-0">
                    {sortedTrucks.length === 0 ? (
                      <EmptyState message="No truck data available" />
                    ) : (
                      <>
                        <div className="hidden md:block overflow-x-auto rounded-lg border">
                          <table className="w-full text-sm">
                            <thead>
                              <tr className="bg-muted/50 border-b">
                                <th className="px-3 py-3 text-left font-medium cursor-pointer hover:bg-muted/80 whitespace-nowrap" onClick={() => handleSort('plateNumber', truckSortKey, truckSortDir, setTruckSortKey, setTruckSortDir)}>
                                  Truck <SortIcon active={truckSortKey === 'plateNumber'} />
                                </th>
                                <th className="px-3 py-3 text-right font-medium cursor-pointer hover:bg-muted/80 whitespace-nowrap" onClick={() => handleSort('trips', truckSortKey, truckSortDir, setTruckSortKey, setTruckSortDir)}>
                                  Trips <SortIcon active={truckSortKey === 'trips'} />
                                </th>
                                <th className="px-3 py-3 text-right font-medium cursor-pointer hover:bg-muted/80 whitespace-nowrap" onClick={() => handleSort('revenue', truckSortKey, truckSortDir, setTruckSortKey, setTruckSortDir)}>
                                  Revenue <SortIcon active={truckSortKey === 'revenue'} />
                                </th>
                                <th className="px-3 py-3 text-right font-medium cursor-pointer hover:bg-muted/80 whitespace-nowrap" onClick={() => handleSort('cost', truckSortKey, truckSortDir, setTruckSortKey, setTruckSortDir)}>
                                  Cost <SortIcon active={truckSortKey === 'cost'} />
                                </th>
                                <th className="px-3 py-3 text-right font-medium cursor-pointer hover:bg-muted/80 whitespace-nowrap" onClick={() => handleSort('profit', truckSortKey, truckSortDir, setTruckSortKey, setTruckSortDir)}>
                                  Net Profit <SortIcon active={truckSortKey === 'profit'} />
                                </th>
                                <th className="px-3 py-3 text-right font-medium cursor-pointer hover:bg-muted/80 whitespace-nowrap" onClick={() => handleSort('margin', truckSortKey, truckSortDir, setTruckSortKey, setTruckSortDir)}>
                                  Margin % <SortIcon active={truckSortKey === 'margin'} />
                                </th>
                              </tr>
                            </thead>
                            <tbody>
                              {sortedTrucks.map(t => {
                                const isLoss = t.profit < 0
                                return (
                                  <tr
                                    key={t.truckId}
                                    className={`border-b last:border-0 hover:bg-muted/30 transition-colors ${isLoss ? 'bg-red-50/50 dark:bg-red-950/10' : ''}`}
                                  >
                                    <td className="px-3 py-3 font-medium whitespace-nowrap">
                                      {isLoss && <AlertTriangle className="h-3.5 w-3.5 text-red-500 inline mr-1.5" />}
                                      {t.plateNumber}
                                    </td>
                                    <td className="px-3 py-3 text-right tabular-nums">{t.trips}</td>
                                    <td className="px-3 py-3 text-right tabular-nums">{formatCurrency(t.revenue)}</td>
                                    <td className="px-3 py-3 text-right tabular-nums text-orange-600 dark:text-orange-400">{formatCurrency(t.cost)}</td>
                                    <td className="px-3 py-3 text-right">
                                      <ProfitLossCell profit={t.profit} />
                                    </td>
                                    <td className="px-3 py-3 text-right">
                                      <MarginCell margin={t.margin} />
                                    </td>
                                  </tr>
                                )
                              })}
                            </tbody>
                          </table>
                        </div>
                        {/* Mobile card view */}
                        <div className="md:hidden divide-y">
                          {sortedTrucks.map(t => (
                            <div key={t.truckId} className={`mobile-card p-4 space-y-2 ${t.profit < 0 ? 'bg-red-50/50 dark:bg-red-950/10' : ''}`}>
                              <div className="flex items-center justify-between">
                                <span className="font-semibold text-sm">
                                  {t.profit < 0 && <AlertTriangle className="h-3.5 w-3.5 text-red-500 inline mr-1" />}
                                  {t.plateNumber}
                                </span>
                                <MarginCell margin={t.margin} />
                              </div>
                              <p className="text-xs text-muted-foreground">{t.trips} trips</p>
                              <div className="grid grid-cols-3 gap-2 text-sm">
                                <div>
                                  <p className="text-xs text-muted-foreground">Revenue</p>
                                  <p className="font-semibold">{formatCurrency(t.revenue)}</p>
                                </div>
                                <div>
                                  <p className="text-xs text-muted-foreground">Cost</p>
                                  <p className="font-semibold text-orange-600 dark:text-orange-400">{formatCurrency(t.cost)}</p>
                                </div>
                                <div>
                                  <p className="text-xs text-muted-foreground">Profit</p>
                                  <p className="font-semibold"><ProfitLossCell profit={t.profit} /></p>
                                </div>
                              </div>
                            </div>
                          ))}
                        </div>
                      </>
                    )}
                  </CardContent>
                </Card>
              </motion.div>
            )}
          </div>
        </TabsContent>

        {/* ─── Tab 4: Monthly Trend ─── */}
        <TabsContent value="trend">
          {loading ? <ChartSkeleton /> : (
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.4 }}
            >
              <Card className="gap-0 py-4">
                <CardHeader className="pb-2">
                  <CardTitle className="text-base">Monthly Revenue, Cost &amp; Profit Trend</CardTitle>
                  <CardDescription>Track profitability over time — revenue (amber), cost (red), profit (green)</CardDescription>
                </CardHeader>
                <CardContent className="p-4 pt-0">
                  {trendData.length === 0 ? (
                    <EmptyState message="No trend data available" />
                  ) : (
                    <ChartContainer config={trendLineConfig} className="h-[350px] w-full">
                      <LineChart data={trendData} margin={{ top: 5, right: 20, left: 10, bottom: 5 }}>
                        <CartesianGrid vertical={false} strokeDasharray="3 3" />
                        <XAxis
                          dataKey="month"
                          tickLine={false}
                          axisLine={false}
                          fontSize={12}
                        />
                        <YAxis
                          tickLine={false}
                          axisLine={false}
                          fontSize={12}
                          tickFormatter={v => v >= 1000 ? `${(v / 1000).toFixed(0)}k` : String(v)}
                          domain={[0, 'auto']}
                          allowDecimals={false}
                        />
                        <ChartTooltip
                          content={<ChartTooltipContent formatter={(value) => formatCurrency(value as number)} />}
                        />
                        <ChartLegend />
                        <Line
                          type="monotone"
                          dataKey="revenue"
                          stroke="hsl(38, 92%, 50%)"
                          strokeWidth={2}
                          dot={{ r: 4, fill: 'hsl(38, 92%, 50%)' }}
                          activeDot={{ r: 6 }}
                        />
                        <Line
                          type="monotone"
                          dataKey="cost"
                          stroke="hsl(0, 84%, 60%)"
                          strokeWidth={2}
                          dot={{ r: 4, fill: 'hsl(0, 84%, 60%)' }}
                          activeDot={{ r: 6 }}
                        />
                        <Line
                          type="monotone"
                          dataKey="profit"
                          stroke="hsl(142, 71%, 45%)"
                          strokeWidth={2}
                          dot={{ r: 4, fill: 'hsl(142, 71%, 45%)' }}
                          activeDot={{ r: 6 }}
                        />
                      </LineChart>
                    </ChartContainer>
                  )}
                </CardContent>
              </Card>
            </motion.div>
          )}

          {/* Client Breakdown (below trend) */}
          {!loading && data?.byClient && data.byClient.length > 0 && (
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.4, delay: 0.1 }}
              className="mt-4"
            >
              <Card className="gap-0 py-4">
                <CardHeader className="pb-2">
                  <CardTitle className="text-base">By Client</CardTitle>
                  <CardDescription>Profitability breakdown per client/company</CardDescription>
                </CardHeader>
                <CardContent className="p-4 pt-0">
                  <>
                    <div className="hidden md:block overflow-x-auto rounded-lg border">
                      <table className="w-full text-sm">
                        <thead>
                          <tr className="bg-muted/50 border-b">
                            <th className="px-3 py-3 text-left font-medium">Client</th>
                            <th className="px-3 py-3 text-right font-medium">Trips</th>
                            <th className="px-3 py-3 text-right font-medium">Revenue</th>
                            <th className="px-3 py-3 text-right font-medium">Cost</th>
                            <th className="px-3 py-3 text-right font-medium">Net Profit</th>
                            <th className="px-3 py-3 text-right font-medium">Margin %</th>
                          </tr>
                        </thead>
                        <tbody>
                          {data.byClient.map(c => (
                            <tr
                              key={c.clientName}
                              className={`border-b last:border-0 hover:bg-muted/30 transition-colors ${c.profit < 0 ? 'bg-red-50/50 dark:bg-red-950/10' : ''}`}
                            >
                              <td className="px-3 py-3 font-medium whitespace-nowrap">
                                {c.profit < 0 && <AlertTriangle className="h-3.5 w-3.5 text-red-500 inline mr-1.5" />}
                                {c.clientName}
                              </td>
                              <td className="px-3 py-3 text-right tabular-nums">{c.trips}</td>
                              <td className="px-3 py-3 text-right tabular-nums">{formatCurrency(c.revenue)}</td>
                              <td className="px-3 py-3 text-right tabular-nums text-orange-600 dark:text-orange-400">{formatCurrency(c.cost)}</td>
                              <td className="px-3 py-3 text-right">
                                <ProfitLossCell profit={c.profit} />
                              </td>
                              <td className="px-3 py-3 text-right">
                                <MarginCell margin={c.margin} />
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                    {/* Mobile card view */}
                    <div className="md:hidden divide-y">
                      {data.byClient.map(c => (
                        <div key={c.clientName} className={`mobile-card p-4 space-y-2 ${c.profit < 0 ? 'bg-red-50/50 dark:bg-red-950/10' : ''}`}>
                          <div className="flex items-center justify-between">
                            <span className="font-semibold text-sm truncate pr-2">
                              {c.profit < 0 && <AlertTriangle className="h-3.5 w-3.5 text-red-500 inline mr-1" />}
                              {c.clientName}
                            </span>
                            <MarginCell margin={c.margin} />
                          </div>
                          <p className="text-xs text-muted-foreground">{c.trips} trips</p>
                          <div className="grid grid-cols-3 gap-2 text-sm">
                            <div>
                              <p className="text-xs text-muted-foreground">Revenue</p>
                              <p className="font-semibold">{formatCurrency(c.revenue)}</p>
                            </div>
                            <div>
                              <p className="text-xs text-muted-foreground">Cost</p>
                              <p className="font-semibold text-orange-600 dark:text-orange-400">{formatCurrency(c.cost)}</p>
                            </div>
                            <div>
                              <p className="text-xs text-muted-foreground">Profit</p>
                              <p className="font-semibold"><ProfitLossCell profit={c.profit} /></p>
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  </>
                </CardContent>
              </Card>
            </motion.div>
          )}
        </TabsContent>
      </Tabs>
    </div>
  )
}
