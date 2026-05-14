'use client'

import React, { useState, useEffect, useCallback, useMemo } from 'react'
import { motion } from 'framer-motion'
import {
  TrendingUp,
  TrendingDown,
  Calculator,
  Truck,
  Zap,
  Banknote,
  Award,
  ArrowUpDown,
  BarChart3,
} from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Input } from '@/components/ui/input'
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
  Pie,
  PieChart,
  Line,
  LineChart,
  ScatterChart,
  Scatter,
  ZAxis,
} from 'recharts'
import { fetchCostAnalytics, fetchTrucks, type CostAnalyticsData, type Truck } from '@/lib/api'
import { CURRENCY_SYMBOL } from '@/lib/constants'

// ============ COLORS ============

const COLORS = [
  'hsl(38, 92%, 50%)',   // amber-500
  'hsl(142, 71%, 45%)',  // emerald-500
  'hsl(25, 95%, 53%)',   // orange-500
  'hsl(0, 84%, 60%)',    // red-500
  'hsl(47, 96%, 53%)',   // yellow-500
  'hsl(173, 80%, 40%)',  // teal-600
  'hsl(340, 75%, 55%)',  // rose-500
  'hsl(200, 84%, 46%)',  // sky-500
  'hsl(262, 83%, 58%)',  // violet-500
  'hsl(15, 90%, 50%)',   // orange-600
]

const COMPOSITION_COLORS: Record<string, string> = {
  fuel: 'hsl(25, 95%, 53%)',
  maintenance: 'hsl(38, 92%, 50%)',
  insurance: 'hsl(199, 89%, 48%)',
  toll: 'hsl(262, 83%, 58%)',
  tyre: 'hsl(0, 0%, 45%)',
  fine: 'hsl(0, 84%, 60%)',
  permit: 'hsl(142, 71%, 45%)',
  washing: 'hsl(187, 85%, 53%)',
  miscellaneous: 'hsl(30, 10%, 50%)',
}

const COMPOSITION_LABELS: Record<string, string> = {
  fuel: 'Fuel',
  maintenance: 'Maintenance',
  insurance: 'Insurance',
  toll: 'Tolls',
  tyre: 'Tyres',
  fine: 'Fines',
  permit: 'Permits',
  washing: 'Washing',
  miscellaneous: 'Other',
}

// ============ CHART CONFIGS ============

const costPerKmConfig = {
  costPerKm: { label: 'Cost/km', color: 'hsl(38, 92%, 50%)' },
} satisfies ChartConfig

const costPerTonConfig = {
  costPerTon: { label: 'Cost/Ton', color: 'hsl(142, 71%, 45%)' },
} satisfies ChartConfig

const compositionConfig = {
  fuel: { label: 'Fuel', color: 'hsl(25, 95%, 53%)' },
  maintenance: { label: 'Maintenance', color: 'hsl(38, 92%, 50%)' },
  insurance: { label: 'Insurance', color: 'hsl(199, 89%, 48%)' },
  other: { label: 'Other', color: 'hsl(262, 83%, 58%)' },
} satisfies ChartConfig

const trendConfig = {
  avgCostPerKm: { label: 'Cost/km', color: 'hsl(38, 92%, 50%)' },
  avgCostPerTon: { label: 'Cost/Ton', color: 'hsl(142, 71%, 45%)' },
} satisfies ChartConfig

const scatterConfig = {
  distance: { label: 'Distance (km)', color: 'hsl(173, 80%, 40%)' },
} satisfies ChartConfig

// ============ HELPERS ============

function formatCurrency(value: number): string {
  return `${CURRENCY_SYMBOL}${value.toLocaleString('en-GH', { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`
}

function TrendArrow({ trend }: { trend: number }) {
  if (trend > 0) {
    return (
      <span className="inline-flex items-center gap-0.5 text-red-500 dark:text-red-400 text-sm font-medium">
        <TrendingUp className="h-3.5 w-3.5" />
        +{trend}%
      </span>
    )
  }
  if (trend < 0) {
    return (
      <span className="inline-flex items-center gap-0.5 text-emerald-600 dark:text-emerald-400 text-sm font-medium">
        <TrendingDown className="h-3.5 w-3.5" />
        {trend}%
      </span>
    )
  }
  return <span className="text-muted-foreground text-sm font-medium">--</span>
}

function EfficiencyBadge({ rating }: { rating: 'good' | 'average' | 'poor' }) {
  const styles = {
    good: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400',
    average: 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400',
    poor: 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400',
  }
  const labels = { good: 'Efficient', average: 'Average', poor: 'High Cost' }
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${styles[rating]}`}>
      {labels[rating]}
    </span>
  )
}

function getEfficiencyRating(costPerKm: number, avgCostPerKm: number): 'good' | 'average' | 'poor' {
  if (avgCostPerKm === 0) return 'average'
  if (costPerKm <= avgCostPerKm * 0.8) return 'good'
  if (costPerKm <= avgCostPerKm * 1.2) return 'average'
  return 'poor'
}

// ============ SUB-COMPONENTS ============

function KpiCard({
  title,
  value,
  trend,
  icon: Icon,
  colorClass,
  loading,
}: {
  title: string
  value: string
  trend: number
  icon: React.ComponentType<{ className?: string }>
  colorClass: string
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
              {!loading && <TrendArrow trend={trend} />}
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
        <Skeleton className="h-5 w-40" />
        <Skeleton className="h-4 w-56" />
      </CardHeader>
      <CardContent className="p-4 pt-0">
        <Skeleton className="h-[280px] w-full rounded-lg" />
      </CardContent>
    </Card>
  )
}

function EmptyChartMessage({ message }: { message: string }) {
  return (
    <div className="flex flex-col items-center justify-center h-[280px] text-muted-foreground">
      <BarChart3 className="h-10 w-10 mb-2 opacity-40" />
      <p className="text-sm">{message}</p>
    </div>
  )
}

// ============ MAIN COMPONENT ============

export function CostAnalyticsView() {
  const [data, setData] = useState<CostAnalyticsData | null>(null)
  const [trucks, setTrucks] = useState<Truck[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [selectedTruck, setSelectedTruck] = useState<string>('all')
  const [dateFrom, setDateFrom] = useState<string>('')
  const [dateTo, setDateTo] = useState<string>('')

  // Sorting for the truck comparison table
  const [sortKey, setSortKey] = useState<string>('plateNumber')
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('asc')

  const loadData = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const params: { truckId?: string; dateFrom?: string; dateTo?: string } = {}
      if (selectedTruck !== 'all') params.truckId = selectedTruck
      if (dateFrom) params.dateFrom = dateFrom
      if (dateTo) params.dateTo = dateTo
      const result = await fetchCostAnalytics(params)
      setData(result)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load cost analytics')
    } finally {
      setLoading(false)
    }
  }, [selectedTruck, dateFrom, dateTo])

  const loadTrucks = useCallback(async () => {
    try {
      const result = await fetchTrucks({ status: 'active', limit: 100 })
      setTrucks(result.data || [])
    } catch {
      // Silent fail — truck filter is optional
    }
  }, [])

  useEffect(() => {
    loadTrucks()
  }, [loadTrucks])

  useEffect(() => {
    loadData()
  }, [loadData])

  const handleSort = (key: string) => {
    if (sortKey === key) {
      setSortDir(d => d === 'asc' ? 'desc' : 'asc')
    } else {
      setSortKey(key)
      setSortDir('asc')
    }
  }

  // Prepare chart data
  const topCostPerKm = useMemo(() => {
    if (!data?.byTruck) return []
    return [...data.byTruck].sort((a, b) => b.costPerKm - a.costPerKm).slice(0, 10).map(t => ({
      plate: `${t.plateNumber} (${t.make})`,
      costPerKm: t.costPerKm,
      fill: COLORS[data.byTruck.indexOf(t) % COLORS.length],
    }))
  }, [data])

  const topCostPerTon = useMemo(() => {
    if (!data?.byTruck) return []
    return [...data.byTruck].sort((a, b) => b.costPerTon - a.costPerTon).slice(0, 10).map(t => ({
      plate: `${t.plateNumber} (${t.make})`,
      costPerTon: t.costPerTon,
      fill: COLORS[data.byTruck.indexOf(t) % COLORS.length],
    }))
  }, [data])

  const costComposition = useMemo(() => {
    if (!data?.byTruck) return []
    const totals: Record<string, number> = { fuel: 0, maintenance: 0, other: 0 }
    for (const t of data.byTruck) {
      totals.fuel += t.fuelCost
      totals.maintenance += t.maintenanceCost
      totals.other += t.otherCost
    }
    return [
      { name: 'Fuel', value: totals.fuel, fill: COMPOSITION_COLORS.fuel },
      { name: 'Maintenance', value: totals.maintenance, fill: COMPOSITION_COLORS.maintenance },
      { name: 'Other', value: totals.other, fill: 'hsl(262, 83%, 58%)' },
    ].filter(d => d.value > 0)
  }, [data])

  const monthlyTrendData = useMemo(() => {
    if (!data?.monthlyTrend) return []
    return data.monthlyTrend.map(t => ({
      label: `${t.month} ${t.year}`,
      avgCostPerKm: t.avgCostPerKm,
      avgCostPerTon: t.avgCostPerTon,
      totalCosts: t.totalCosts,
      tripCount: t.tripCount,
    }))
  }, [data])

  const scatterData = useMemo(() => {
    if (!data?.byTruck) return []
    return data.byTruck
      .filter(t => t.totalDistance > 0 && t.totalCosts > 0)
      .map((t, i) => ({
        x: t.totalDistance,
        y: t.totalCosts,
        z: 120,
        truck: t.plateNumber,
        fill: COLORS[i % COLORS.length],
      }))
  }, [data])

  // Sorted table data
  const sortedTrucks = useMemo(() => {
    if (!data?.byTruck) return []
    return [...data.byTruck].sort((a, b) => {
      const aVal = (a as Record<string, unknown>)[sortKey] as number | string
      const bVal = (b as Record<string, unknown>)[sortKey] as number | string
      if (typeof aVal === 'number' && typeof bVal === 'number') {
        return sortDir === 'asc' ? aVal - bVal : bVal - aVal
      }
      return sortDir === 'asc'
        ? String(aVal).localeCompare(String(bVal))
        : String(bVal).localeCompare(String(aVal))
    })
  }, [data, sortKey, sortDir])

  // Compute trends from monthly data
  const costPerKmTrend = useMemo(() => {
    if (!data?.monthlyTrend || data.monthlyTrend.length < 2) return 0
    const latest = data.monthlyTrend[data.monthlyTrend.length - 1].avgCostPerKm
    const prev = data.monthlyTrend[data.monthlyTrend.length - 2].avgCostPerKm
    if (prev === 0) return 0
    return Math.round(((latest - prev) / prev) * 100)
  }, [data])

  const costPerTonTrend = useMemo(() => {
    if (!data?.monthlyTrend || data.monthlyTrend.length < 2) return 0
    const latest = data.monthlyTrend[data.monthlyTrend.length - 1].avgCostPerTon
    const prev = data.monthlyTrend[data.monthlyTrend.length - 2].avgCostPerTon
    if (prev === 0) return 0
    return Math.round(((latest - prev) / prev) * 100)
  }, [data])

  const monthlyCostTrend = useMemo(() => {
    if (!data?.monthlyTrend || data.monthlyTrend.length < 2) return 0
    const latest = data.monthlyTrend[data.monthlyTrend.length - 1].totalCosts
    const prev = data.monthlyTrend[data.monthlyTrend.length - 2].totalCosts
    if (prev === 0) return 0
    return Math.round(((latest - prev) / prev) * 100)
  }, [data])

  const mostEfficientTruck = useMemo(() => {
    if (!data?.byTruck || data.byTruck.length === 0) return '--'
    const activeTrucks = data.byTruck.filter(t => t.totalDistance > 0)
    if (activeTrucks.length === 0) return '--'
    const best = activeTrucks.reduce((a, b) => a.costPerKm < b.costPerKm ? a : b)
    return best.plateNumber
  }, [data])

  const SortIcon = ({ column }: { column: string }) => (
    <ArrowUpDown className={`h-3.5 w-3.5 ml-1 inline ${sortKey === column ? 'opacity-100' : 'opacity-30'}`} />
  )

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
            <Calculator className="h-6 w-6 text-amber-500" />
            Cost Analytics
          </h1>
          <p className="text-muted-foreground mt-1">
            Cost per kilometer &amp; cost per ton analysis across your fleet
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
            <div className="flex flex-col sm:flex-row gap-3 items-end">
              <div className="flex-1 min-w-[180px]">
                <label className="text-xs font-medium text-muted-foreground mb-1.5 block">Truck</label>
                <Select value={selectedTruck} onValueChange={setSelectedTruck}>
                  <SelectTrigger>
                    <SelectValue placeholder="All Trucks" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All Trucks</SelectItem>
                    {trucks.map(t => (
                      <SelectItem key={t.id} value={t.id}>
                        {t.plateNumber} — {t.make} {t.model}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="min-w-[150px]">
                <label className="text-xs font-medium text-muted-foreground mb-1.5 block">From</label>
                <Input
                  type="date"
                  value={dateFrom}
                  onChange={e => setDateFrom(e.target.value)}
                />
              </div>
              <div className="min-w-[150px]">
                <label className="text-xs font-medium text-muted-foreground mb-1.5 block">To</label>
                <Input
                  type="date"
                  value={dateTo}
                  onChange={e => setDateTo(e.target.value)}
                />
              </div>
              <Button
                variant="outline"
                onClick={() => { setSelectedTruck('all'); setDateFrom(''); setDateTo('') }}
                className="shrink-0"
              >
                Reset
              </Button>
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
          title="Fleet Avg Cost/km"
          value={loading ? '' : `${CURRENCY_SYMBOL}${(data?.fleetAvg?.costPerKm ?? 0).toFixed(2)}`}
          trend={costPerKmTrend}
          icon={Zap}
          colorClass="bg-amber-500"
          loading={loading}
        />
        <KpiCard
          title="Fleet Avg Cost/Ton"
          value={loading ? '' : `${CURRENCY_SYMBOL}${(data?.fleetAvg?.costPerTon ?? 0).toFixed(2)}`}
          trend={costPerTonTrend}
          icon={Banknote}
          colorClass="bg-emerald-500"
          loading={loading}
        />
        <KpiCard
          title="Total Costs"
          value={loading ? '' : formatCurrency(data?.fleetAvg?.totalCosts ?? 0)}
          trend={monthlyCostTrend}
          icon={Truck}
          colorClass="bg-orange-500"
          loading={loading}
        />
        <KpiCard
          title="Most Efficient Truck"
          value={loading ? '' : mostEfficientTruck}
          trend={0}
          icon={Award}
          colorClass="bg-teal-500"
          loading={loading}
        />
      </div>

      {/* Charts Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* 1. Cost per Km by Truck — Horizontal Bar */}
        {loading ? <ChartSkeleton /> : (
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.4, delay: 0.1 }}
          >
            <Card className="gap-0 py-4">
              <CardHeader className="pb-2">
                <CardTitle className="text-base">Cost per Kilometer by Truck</CardTitle>
                <CardDescription>Top 10 trucks by cost efficiency</CardDescription>
              </CardHeader>
              <CardContent className="p-4 pt-0">
                {topCostPerKm.length === 0 ? (
                  <EmptyChartMessage message="No cost data available" />
                ) : (
                  <ChartContainer config={costPerKmConfig} className="h-[300px] w-full">
                    <BarChart data={topCostPerKm} layout="vertical" margin={{ top: 5, right: 40, left: 10, bottom: 5 }}>
                      <CartesianGrid horizontal={false} strokeDasharray="3 3" />
                      <XAxis type="number" tickLine={false} axisLine={false} fontSize={12} tickFormatter={v => `${CURRENCY_SYMBOL}${v}`} />
                      <YAxis
                        type="category"
                        dataKey="plate"
                        tickLine={false}
                        axisLine={false}
                        fontSize={11}
                        width={160}
                      />
                      <ChartTooltip content={<ChartTooltipContent formatter={(value) => `${CURRENCY_SYMBOL}${(value as number).toFixed(2)}`} />} />
                      <Bar dataKey="costPerKm" radius={[0, 4, 4, 0]} maxBarSize={28}>
                        {topCostPerKm.map((entry, index) => (
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

        {/* 2. Cost per Ton by Truck — Horizontal Bar */}
        {loading ? <ChartSkeleton /> : (
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.4, delay: 0.15 }}
          >
            <Card className="gap-0 py-4">
              <CardHeader className="pb-2">
                <CardTitle className="text-base">Cost per Ton by Truck</CardTitle>
                <CardDescription>Top 10 trucks by cost per tonne delivered</CardDescription>
              </CardHeader>
              <CardContent className="p-4 pt-0">
                {topCostPerTon.length === 0 ? (
                  <EmptyChartMessage message="No tonnage data available" />
                ) : (
                  <ChartContainer config={costPerTonConfig} className="h-[300px] w-full">
                    <BarChart data={topCostPerTon} layout="vertical" margin={{ top: 5, right: 40, left: 10, bottom: 5 }}>
                      <CartesianGrid horizontal={false} strokeDasharray="3 3" />
                      <XAxis type="number" tickLine={false} axisLine={false} fontSize={12} tickFormatter={v => `${CURRENCY_SYMBOL}${v}`} />
                      <YAxis
                        type="category"
                        dataKey="plate"
                        tickLine={false}
                        axisLine={false}
                        fontSize={11}
                        width={160}
                      />
                      <ChartTooltip content={<ChartTooltipContent formatter={(value) => `${CURRENCY_SYMBOL}${(value as number).toFixed(2)}`} />} />
                      <Bar dataKey="costPerTon" radius={[0, 4, 4, 0]} maxBarSize={28}>
                        {topCostPerTon.map((entry, index) => (
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

        {/* 3. Cost Composition Pie */}
        {loading ? <ChartSkeleton /> : (
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.4, delay: 0.2 }}
          >
            <Card className="gap-0 py-4">
              <CardHeader className="pb-2">
                <CardTitle className="text-base">Cost Composition</CardTitle>
                <CardDescription>Fuel vs Maintenance vs Other expenses</CardDescription>
              </CardHeader>
              <CardContent className="p-4 pt-0">
                {costComposition.length === 0 ? (
                  <EmptyChartMessage message="No cost breakdown data" />
                ) : (
                  <div className="flex flex-col lg:flex-row items-center gap-4">
                    <ChartContainer config={compositionConfig} className="h-[280px] w-full max-w-[280px]">
                      <PieChart>
                        <ChartTooltip content={<ChartTooltipContent nameKey="name" hideLabel />} />
                        <Pie
                          data={costComposition}
                          cx="50%"
                          cy="50%"
                          innerRadius={55}
                          outerRadius={90}
                          paddingAngle={2}
                          dataKey="value"
                          nameKey="name"
                        >
                          {costComposition.map((entry, index) => (
                            <Cell key={`cell-${index}`} fill={entry.fill} />
                          ))}
                        </Pie>
                        <ChartLegend content={<ChartLegendContent nameKey="name" />} />
                      </PieChart>
                    </ChartContainer>
                    <div className="flex-1 space-y-3 w-full">
                      {costComposition.map(d => {
                        const total = costComposition.reduce((s, c) => s + c.value, 0)
                        const pct = total > 0 ? ((d.value / total) * 100).toFixed(1) : '0'
                        return (
                          <div key={d.name} className="flex items-center justify-between">
                            <div className="flex items-center gap-2">
                              <div className="h-3 w-3 rounded-full shrink-0" style={{ backgroundColor: d.fill }} />
                              <span className="text-sm text-muted-foreground">{d.name}</span>
                            </div>
                            <div className="flex items-center gap-3">
                              <span className="text-sm font-medium tabular-nums">{formatCurrency(d.value)}</span>
                              <span className="text-xs text-muted-foreground w-12 text-right">{pct}%</span>
                            </div>
                          </div>
                        )
                      })}
                    </div>
                  </div>
                )}
              </CardContent>
            </Card>
          </motion.div>
        )}

        {/* 4. Monthly Cost Trend — Line Chart */}
        {loading ? <ChartSkeleton /> : (
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.4, delay: 0.25 }}
          >
            <Card className="gap-0 py-4">
              <CardHeader className="pb-2">
                <CardTitle className="text-base">Monthly Cost Trend</CardTitle>
                <CardDescription>Cost/km and cost/ton over the last 6 months</CardDescription>
              </CardHeader>
              <CardContent className="p-4 pt-0">
                {monthlyTrendData.length === 0 ? (
                  <EmptyChartMessage message="No trend data available" />
                ) : (
                  <ChartContainer config={trendConfig} className="h-[280px] w-full">
                    <LineChart data={monthlyTrendData} margin={{ top: 5, right: 10, left: 10, bottom: 0 }}>
                      <CartesianGrid vertical={false} strokeDasharray="3 3" />
                      <XAxis dataKey="label" tickLine={false} axisLine={false} fontSize={12} />
                      <YAxis tickLine={false} axisLine={false} fontSize={12} tickFormatter={v => `${CURRENCY_SYMBOL}${v}`} />
                      <ChartTooltip
                        content={<ChartTooltipContent formatter={(value) => `${CURRENCY_SYMBOL}${(value as number).toFixed(2)}`} />}
                      />
                      <ChartLegend />
                      <Line
                        type="monotone"
                        dataKey="avgCostPerKm"
                        stroke="hsl(38, 92%, 50%)"
                        strokeWidth={2}
                        dot={{ r: 4 }}
                        activeDot={{ r: 6 }}
                      />
                      <Line
                        type="monotone"
                        dataKey="avgCostPerTon"
                        stroke="hsl(142, 71%, 45%)"
                        strokeWidth={2}
                        dot={{ r: 4 }}
                        activeDot={{ r: 6 }}
                      />
                    </LineChart>
                  </ChartContainer>
                )}
              </CardContent>
            </Card>
          </motion.div>
        )}
      </div>

      {/* 5. Cost Efficiency Scatter Plot — Full Width */}
      {loading ? <ChartSkeleton /> : (
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.4, delay: 0.3 }}
        >
          <Card className="gap-0 py-4">
            <CardHeader className="pb-2">
              <CardTitle className="text-base">Cost Efficiency Scatter</CardTitle>
              <CardDescription>Distance (x) vs Total Costs (y) — each dot is a truck</CardDescription>
            </CardHeader>
            <CardContent className="p-4 pt-0">
              {scatterData.length === 0 ? (
                <EmptyChartMessage message="No distance/cost data for scatter plot" />
              ) : (
                <ChartContainer config={scatterConfig} className="h-[300px] w-full">
                  <ScatterChart margin={{ top: 5, right: 20, left: 10, bottom: 5 }}>
                    <CartesianGrid strokeDasharray="3 3" />
                    <XAxis
                      type="number"
                      dataKey="x"
                      name="Distance (km)"
                      tickLine={false}
                      axisLine={false}
                      fontSize={12}
                      label={{ value: 'Distance (km)', position: 'insideBottom', offset: -5, fontSize: 12 }}
                      tickFormatter={v => `${(v / 1000).toFixed(0)}k`}
                    />
                    <YAxis
                      type="number"
                      dataKey="y"
                      name="Costs"
                      tickLine={false}
                      axisLine={false}
                      fontSize={12}
                      tickFormatter={v => `${CURRENCY_SYMBOL}${(v / 1000).toFixed(0)}k`}
                    />
                    <ZAxis type="number" dataKey="z" range={[60, 120]} />
                    <ChartTooltip
                      content={({ payload }) => {
                        if (!payload?.length) return null
                        const d = payload[0]?.payload
                        return (
                          <div className="bg-background border rounded-lg shadow-lg p-2 text-sm">
                            <p className="font-medium">{d?.truck ?? ''}</p>
                            <p className="text-muted-foreground">Distance: {(d?.x ?? 0).toLocaleString()} km</p>
                            <p className="text-muted-foreground">Cost: {formatCurrency(d?.y ?? 0)}</p>
                          </div>
                        )
                      }}
                    />
                    <Scatter data={scatterData} fill="hsl(38, 92%, 50%)">
                      {scatterData.map((entry, index) => (
                        <Cell key={`cell-${index}`} fill={entry.fill} />
                      ))}
                    </Scatter>
                  </ScatterChart>
                </ChartContainer>
              )}
            </CardContent>
          </Card>
        </motion.div>
      )}

      {/* 6. Truck Comparison Table */}
      {loading ? <ChartSkeleton /> : (
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.4, delay: 0.35 }}
        >
          <Card className="gap-0 py-4">
            <CardHeader className="pb-2">
              <CardTitle className="text-base">Truck Comparison</CardTitle>
              <CardDescription>Detailed cost metrics per truck — click column headers to sort</CardDescription>
            </CardHeader>
            <CardContent className="p-4 pt-0">
              {sortedTrucks.length === 0 ? (
                <EmptyChartMessage message="No truck data available" />
              ) : (
                <>
                  <div className="hidden md:block overflow-x-auto rounded-lg border">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="bg-muted/50 border-b">
                          <th className="px-3 py-3 text-left font-medium cursor-pointer hover:bg-muted/80 whitespace-nowrap" onClick={() => handleSort('plateNumber')}>
                            Plate # <SortIcon column="plateNumber" />
                          </th>
                          <th className="px-3 py-3 text-left font-medium cursor-pointer hover:bg-muted/80 whitespace-nowrap" onClick={() => handleSort('make')}>
                            Make/Model <SortIcon column="make" />
                          </th>
                          <th className="px-3 py-3 text-right font-medium cursor-pointer hover:bg-muted/80 whitespace-nowrap" onClick={() => handleSort('totalDistance')}>
                            Distance (km) <SortIcon column="totalDistance" />
                          </th>
                          <th className="px-3 py-3 text-right font-medium cursor-pointer hover:bg-muted/80 whitespace-nowrap" onClick={() => handleSort('totalTonnage')}>
                            Tonnage <SortIcon column="totalTonnage" />
                          </th>
                          <th className="px-3 py-3 text-right font-medium cursor-pointer hover:bg-muted/80 whitespace-nowrap" onClick={() => handleSort('totalCosts')}>
                            Total Costs <SortIcon column="totalCosts" />
                          </th>
                          <th className="px-3 py-3 text-right font-medium cursor-pointer hover:bg-muted/80 whitespace-nowrap" onClick={() => handleSort('fuelCost')}>
                            Fuel Cost <SortIcon column="fuelCost" />
                          </th>
                          <th className="px-3 py-3 text-right font-medium cursor-pointer hover:bg-muted/80 whitespace-nowrap" onClick={() => handleSort('maintenanceCost')}>
                            Maint. Cost <SortIcon column="maintenanceCost" />
                          </th>
                          <th className="px-3 py-3 text-right font-medium cursor-pointer hover:bg-muted/80 whitespace-nowrap" onClick={() => handleSort('costPerKm')}>
                            Cost/km <SortIcon column="costPerKm" />
                          </th>
                          <th className="px-3 py-3 text-right font-medium cursor-pointer hover:bg-muted/80 whitespace-nowrap" onClick={() => handleSort('costPerTon')}>
                            Cost/Ton <SortIcon column="costPerTon" />
                          </th>
                          <th className="px-3 py-3 text-center font-medium whitespace-nowrap">
                            Efficiency
                          </th>
                        </tr>
                      </thead>
                      <tbody>
                        {sortedTrucks.map((t, i) => (
                          <tr key={t.truckId} className="border-b last:border-0 hover:bg-muted/30 transition-colors">
                            <td className="px-3 py-3 font-medium whitespace-nowrap">{t.plateNumber}</td>
                            <td className="px-3 py-3 text-muted-foreground whitespace-nowrap">{t.make} {t.model}</td>
                            <td className="px-3 py-3 text-right tabular-nums">{t.totalDistance.toLocaleString()}</td>
                            <td className="px-3 py-3 text-right tabular-nums">{t.totalTonnage.toFixed(1)}</td>
                            <td className="px-3 py-3 text-right tabular-nums font-medium">{formatCurrency(t.totalCosts)}</td>
                            <td className="px-3 py-3 text-right tabular-nums text-orange-600 dark:text-orange-400">{formatCurrency(t.fuelCost)}</td>
                            <td className="px-3 py-3 text-right tabular-nums text-amber-600 dark:text-amber-400">{formatCurrency(t.maintenanceCost)}</td>
                            <td className={`px-3 py-3 text-right tabular-nums font-semibold ${t.costPerKm > 0 ? 'text-foreground' : 'text-muted-foreground'}`}>
                              {t.costPerKm > 0 ? `${CURRENCY_SYMBOL}${t.costPerKm.toFixed(2)}` : '--'}
                            </td>
                            <td className={`px-3 py-3 text-right tabular-nums font-semibold ${t.costPerTon > 0 ? 'text-foreground' : 'text-muted-foreground'}`}>
                              {t.costPerTon > 0 ? `${CURRENCY_SYMBOL}${t.costPerTon.toFixed(2)}` : '--'}
                            </td>
                            <td className="px-3 py-3 text-center">
                              {t.costPerKm > 0 ? (
                                <EfficiencyBadge rating={getEfficiencyRating(t.costPerKm, data?.fleetAvg?.costPerKm ?? 0)} />
                              ) : (
                                <span className="text-muted-foreground text-xs">N/A</span>
                              )}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                  {/* Mobile card view */}
                  <div className="md:hidden divide-y">
                    {sortedTrucks.map(t => (
                      <div key={t.truckId} className="mobile-card p-4 space-y-2">
                        <div className="flex items-center justify-between">
                          <span className="font-semibold text-amber-700 dark:text-amber-400">{t.plateNumber}</span>
                          {t.costPerKm > 0 ? (
                            <EfficiencyBadge rating={getEfficiencyRating(t.costPerKm, data?.fleetAvg?.costPerKm ?? 0)} />
                          ) : null}
                        </div>
                        <p className="text-xs text-muted-foreground">{t.make} {t.model}</p>
                        <div className="grid grid-cols-2 gap-2 text-sm">
                          <div>
                            <p className="text-xs text-muted-foreground">Distance</p>
                            <p className="font-semibold">{t.totalDistance.toLocaleString()} km</p>
                          </div>
                          <div>
                            <p className="text-xs text-muted-foreground">Tonnage</p>
                            <p className="font-semibold">{t.totalTonnage.toFixed(1)} t</p>
                          </div>
                          <div>
                            <p className="text-xs text-muted-foreground">Total Costs</p>
                            <p className="font-semibold">{formatCurrency(t.totalCosts)}</p>
                          </div>
                          <div>
                            <p className="text-xs text-muted-foreground">Cost/km</p>
                            <p className="font-semibold">{t.costPerKm > 0 ? `${CURRENCY_SYMBOL}${t.costPerKm.toFixed(2)}` : '--'}</p>
                          </div>
                          <div>
                            <p className="text-xs text-muted-foreground">Fuel</p>
                            <p className="font-semibold text-orange-600 dark:text-orange-400">{formatCurrency(t.fuelCost)}</p>
                          </div>
                          <div>
                            <p className="text-xs text-muted-foreground">Maintenance</p>
                            <p className="font-semibold text-amber-600 dark:text-amber-400">{formatCurrency(t.maintenanceCost)}</p>
                          </div>
                          <div>
                            <p className="text-xs text-muted-foreground">Cost/Ton</p>
                            <p className="font-semibold">{t.costPerTon > 0 ? `${CURRENCY_SYMBOL}${t.costPerTon.toFixed(2)}` : '--'}</p>
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
  )
}

export default CostAnalyticsView
