'use client'

import React, { useState, useEffect, useCallback, useRef } from 'react'
import { motion } from 'framer-motion'
import {
  TrendingUp,
  TrendingDown,
  BarChart3,
  DollarSign,
  Truck,
  Route,
  Download,
  Activity,
  FileText,
  Printer,
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
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import {
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
  ChartLegend,
  ChartLegendContent,
  type ChartConfig,
} from '@/components/ui/chart'
import {
  Area,
  AreaChart,
  XAxis,
  YAxis,
  CartesianGrid,
  Bar,
  BarChart,
  Cell,
  Pie,
  PieChart,
} from 'recharts'
import { fetchAnalytics, type AnalyticsData } from '@/lib/api'
import { CURRENCY_SYMBOL, APP_NAME } from '@/lib/constants'
import { toast } from 'sonner'

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
]

const STATUS_COLORS: Record<string, string> = {
  scheduled: 'hsl(199, 89%, 48%)',
  loading: 'hsl(38, 92%, 50%)',
  loaded: 'hsl(47, 96%, 53%)',
  waiting_at_depot: 'hsl(25, 95%, 53%)',
  departed_depot: 'hsl(83, 78%, 44%)',
  in_transit: 'hsl(142, 71%, 45%)',
  arrived_destination: 'hsl(173, 80%, 40%)',
  waiting_to_offload: 'hsl(25, 95%, 53%)',
  offloading: 'hsl(262, 83%, 58%)',
  offloaded: 'hsl(217, 91%, 60%)',
  return_journey: 'hsl(340, 75%, 55%)',
  arrived_depot: 'hsl(187, 85%, 53%)',
  completed: 'hsl(0, 0%, 45%)',
  cancelled: 'hsl(0, 84%, 60%)',
}

const STATUS_LABELS: Record<string, string> = {
  scheduled: 'Scheduled',
  loading: 'Loading',
  loaded: 'Loaded & Ready',
  waiting_at_depot: 'Waiting at Depot',
  departed_depot: 'Departed Depot',
  in_transit: 'In Transit',
  arrived_destination: 'Arrived',
  waiting_to_offload: 'Waiting to Offload',
  offloading: 'Offloading',
  offloaded: 'Offloaded',
  return_journey: 'Return',
  arrived_depot: 'At Depot',
  completed: 'Completed',
  cancelled: 'Cancelled',
}

const CATEGORY_LABELS: Record<string, string> = {
  fuel: 'Fuel',
  maintenance: 'Maintenance',
  tyre: 'Tyres',
  insurance: 'Insurance',
  toll: 'Tolls & Fines',
  fine: 'Fines',
  permit: 'Permits',
  washing: 'Washing',
  miscellaneous: 'Miscellaneous',
}

const CATEGORY_COLORS: Record<string, string> = {
  fuel: 'hsl(25, 95%, 53%)',
  maintenance: 'hsl(38, 92%, 50%)',
  tyre: 'hsl(0, 0%, 45%)',
  insurance: 'hsl(199, 89%, 48%)',
  toll: 'hsl(262, 83%, 58%)',
  fine: 'hsl(0, 84%, 60%)',
  permit: 'hsl(142, 71%, 45%)',
  washing: 'hsl(187, 85%, 53%)',
  miscellaneous: 'hsl(30, 10%, 50%)',
}

// ============ CHART CONFIGS ============

const revenueChartConfig = {
  revenue: { label: 'Revenue', color: 'hsl(38, 92%, 50%)' },
} satisfies ChartConfig

const tripsOverTimeConfig = {
  count: { label: 'Trips', color: 'hsl(142, 71%, 45%)' },
} satisfies ChartConfig

const topRoutesConfig = {
  count: { label: 'Trips', color: 'hsl(25, 95%, 53%)' },
} satisfies ChartConfig

const topDriversConfig = {
  trips: { label: 'Completed Trips', color: 'hsl(38, 92%, 50%)' },
} satisfies ChartConfig

const revenueByDestConfig = {
  revenue: { label: 'Revenue', color: 'hsl(142, 71%, 45%)' },
} satisfies ChartConfig

const expenseConfig = {
  fuel: { label: 'Fuel', color: 'hsl(25, 95%, 53%)' },
  maintenance: { label: 'Maintenance', color: 'hsl(38, 92%, 50%)' },
  tyre: { label: 'Tyres', color: 'hsl(0, 0%, 45%)' },
  insurance: { label: 'Insurance', color: 'hsl(199, 89%, 48%)' },
  toll: { label: 'Tolls', color: 'hsl(262, 83%, 58%)' },
  fine: { label: 'Fines', color: 'hsl(0, 84%, 60%)' },
  permit: { label: 'Permits', color: 'hsl(142, 71%, 45%)' },
  washing: { label: 'Washing', color: 'hsl(187, 85%, 53%)' },
  miscellaneous: { label: 'Miscellaneous', color: 'hsl(30, 10%, 50%)' },
} satisfies ChartConfig

const pieConfig = {
  scheduled: { label: 'Scheduled', color: 'hsl(199, 89%, 48%)' },
  loading: { label: 'Loading', color: 'hsl(38, 92%, 50%)' },
  in_transit: { label: 'In Transit', color: 'hsl(142, 71%, 45%)' },
  completed: { label: 'Completed', color: 'hsl(0, 0%, 45%)' },
  cancelled: { label: 'Cancelled', color: 'hsl(0, 84%, 60%)' },
} satisfies ChartConfig

// ============ HELPERS ============

function formatCurrency(value: number): string {
  return `${CURRENCY_SYMBOL}${value.toLocaleString('en-GH', { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`
}

function TrendArrow({ trend }: { trend: number }) {
  if (trend > 0) {
    return (
      <span className="inline-flex items-center gap-0.5 text-emerald-600 dark:text-emerald-400 text-sm font-medium">
        <TrendingUp className="h-3.5 w-3.5" />
        +{trend}%
      </span>
    )
  }
  if (trend < 0) {
    return (
      <span className="inline-flex items-center gap-0.5 text-red-500 dark:text-red-400 text-sm font-medium">
        <TrendingDown className="h-3.5 w-3.5" />
        {trend}%
      </span>
    )
  }
  return (
    <span className="text-muted-foreground text-sm font-medium">0%</span>
  )
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

export function AnalyticsView() {
  const [range, setRange] = useState('this_month')
  const [data, setData] = useState<AnalyticsData | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const exportRef = useRef<HTMLDivElement>(null)

  const loadAnalytics = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const result = await fetchAnalytics(range)
      setData(result)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load analytics')
    } finally {
      setLoading(false)
    }
  }, [range])

  useEffect(() => {
    loadAnalytics()
  }, [loadAnalytics])

  // Prepare trips-by-status pie data
  const statusPieData = (data?.tripsByStatus || []).map(s => ({
    name: STATUS_LABELS[s.status] || s.status,
    value: s.count,
    fill: STATUS_COLORS[s.status] || 'hsl(0, 0%, 75%)',
  }))

  // Prepare expense donut data
  const expensePieData = (data?.expenseSummary || []).map(e => ({
    name: CATEGORY_LABELS[e.category] || e.category,
    value: e.amount,
    fill: CATEGORY_COLORS[e.category] || 'hsl(0, 0%, 75%)',
  }))

  // CSV Export
  function exportCSV() {
    if (!data) return
    try {
      const lines: string[] = []
      const rangeLabel = range.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase())
      const dateStr = new Date().toISOString().split('T')[0]

      // KPIs section
      lines.push(`${APP_NAME} - Analytics Report`)
      lines.push(`Period: ${rangeLabel}`)
      lines.push(`Generated: ${new Date().toLocaleString()}`)
      lines.push('')
      lines.push('=== KEY PERFORMANCE INDICATORS ===')
      lines.push(`Total Revenue,${data.kpis.totalRevenuePeriod}`)
      lines.push(`Total Trips,${data.kpis.totalTripsPeriod}`)
      lines.push(`Avg Trip Revenue,${Math.round(data.kpis.avgTripRevenue)}`)
      lines.push(`Fleet Utilization,${data.kpis.fleetUtilizationPercent}%`)
      lines.push(`Revenue Trend,${data.kpis.revenueTrend}%`)
      lines.push(`Trips Trend,${data.kpis.tripsTrend}%`)
      lines.push('')

      // Top Routes
      lines.push('=== TOP ROUTES ===')
      lines.push('Route,Trips')
      ;(data.topRoutes || []).forEach(r => lines.push(`"${r.route}",${r.count}`))
      lines.push('')

      // Top Drivers
      lines.push('=== TOP DRIVERS ===')
      lines.push('Driver,Completed Trips')
      ;(data.topDrivers || []).forEach(d => lines.push(`"${d.driver}",${d.trips}`))
      lines.push('')

      // Revenue by Destination
      lines.push('=== REVENUE BY DESTINATION ===')
      lines.push('Destination,Revenue')
      ;(data.revenueByDestination || []).forEach(d => lines.push(`"${d.destination}",${d.revenue}`))
      lines.push('')

      // Expense Breakdown
      lines.push('=== EXPENSE BREAKDOWN ===')
      lines.push('Category,Amount')
      ;(data.expenseSummary || []).forEach(e => lines.push(`"${CATEGORY_LABELS[e.category] || e.category}",${e.amount}`))

      const csvContent = lines.join('\n')
      const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' })
      const url = URL.createObjectURL(blob)
      const link = document.createElement('a')
      link.href = url
      link.download = `fleetpro-analytics-${range}-${dateStr}.csv`
      link.click()
      URL.revokeObjectURL(url)
      toast.success('CSV exported successfully')
    } catch {
      toast.error('Failed to export CSV')
    }
  }

  // PDF Export (Print)
  function exportPDF() {
    window.print()
  }

  return (
    <div ref={exportRef} className="space-y-6 print-analytics">
      {/* Header */}
      <motion.div
        initial={{ opacity: 0, y: -10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.3 }}
        className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4"
      >
        <div>
          <h1 className="text-2xl font-bold tracking-tight flex items-center gap-2">
            <BarChart3 className="h-6 w-6 text-amber-500" />
            Fleet Analytics
          </h1>
          <p className="text-muted-foreground mt-1">
            Performance insights &amp; trends across your fleet operations
          </p>
        </div>
        <div className="flex items-center gap-3">
          <Select value={range} onValueChange={setRange}>
            <SelectTrigger className="w-full sm:w-[160px]">
              <SelectValue placeholder="Select range" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="this_week">This Week</SelectItem>
              <SelectItem value="this_month">This Month</SelectItem>
              <SelectItem value="last_3_months">Last 3 Months</SelectItem>
              <SelectItem value="this_year">This Year</SelectItem>
            </SelectContent>
          </Select>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="outline" size="sm" className="gap-2 print:hidden">
                <Download className="h-4 w-4" />
                <span className="hidden sm:inline">Export</span>
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem onClick={exportCSV}>
                <FileText className="h-4 w-4 mr-2" />
                Export CSV
              </DropdownMenuItem>
              <DropdownMenuItem onClick={exportPDF}>
                <Printer className="h-4 w-4 mr-2" />
                Print / Save PDF
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
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
          value={formatCurrency(data?.kpis?.totalRevenuePeriod ?? 0)}
          trend={data?.kpis?.revenueTrend ?? 0}
          icon={DollarSign}
          colorClass="bg-amber-500"
          loading={loading}
        />
        <KpiCard
          title="Total Trips"
          value={String(data?.kpis?.totalTripsPeriod ?? 0)}
          trend={data?.kpis?.tripsTrend ?? 0}
          icon={Route}
          colorClass="bg-emerald-500"
          loading={loading}
        />
        <KpiCard
          title="Avg Trip Revenue"
          value={formatCurrency(data?.kpis?.avgTripRevenue ?? 0)}
          trend={data?.kpis?.avgRevenueTrend ?? 0}
          icon={Activity}
          colorClass="bg-orange-500"
          loading={loading}
        />
        <KpiCard
          title="Fleet Utilization"
          value={`${data?.kpis?.fleetUtilizationPercent ?? 0}%`}
          trend={0}
          icon={Truck}
          colorClass="bg-teal-500"
          loading={loading}
        />
      </div>

      {/* Charts Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* 1. Revenue Trend - Area Chart */}
        {loading ? (
          <ChartSkeleton />
        ) : (
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.4, delay: 0.1 }}
          >
            <Card className="gap-0 py-4">
              <CardHeader className="pb-2">
                <CardTitle className="text-base">Revenue Trend</CardTitle>
                <CardDescription>Monthly revenue over the last 6 months</CardDescription>
              </CardHeader>
              <CardContent className="p-4 pt-0">
                {(!data?.revenueByMonth || data.revenueByMonth.length === 0) ? (
                  <EmptyChartMessage message="No revenue data available" />
                ) : (
                  <ChartContainer config={revenueChartConfig} className="h-[280px] w-full">
                    <AreaChart data={data.revenueByMonth} margin={{ top: 5, right: 10, left: 10, bottom: 0 }}>
                      <defs>
                        <linearGradient id="fillRevenue" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="5%" stopColor="hsl(38, 92%, 50%)" stopOpacity={0.3} />
                          <stop offset="95%" stopColor="hsl(38, 92%, 50%)" stopOpacity={0.02} />
                        </linearGradient>
                      </defs>
                      <CartesianGrid vertical={false} strokeDasharray="3 3" />
                      <XAxis dataKey="month" tickLine={false} axisLine={false} fontSize={12} />
                      <YAxis
                        tickLine={false}
                        axisLine={false}
                        fontSize={12}
                        tickFormatter={(v) => `${(v / 1000).toFixed(0)}k`}
                      />
                      <ChartTooltip
                        content={
                          <ChartTooltipContent
                            formatter={(value) => formatCurrency(value as number)}
                          />
                        }
                      />
                      <Area
                        type="monotone"
                        dataKey="revenue"
                        stroke="hsl(38, 92%, 50%)"
                        strokeWidth={2}
                        fill="url(#fillRevenue)"
                      />
                    </AreaChart>
                  </ChartContainer>
                )}
              </CardContent>
            </Card>
          </motion.div>
        )}

        {/* 2. Trips by Status - Pie/Donut Chart */}
        {loading ? (
          <ChartSkeleton />
        ) : (
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.4, delay: 0.15 }}
          >
            <Card className="gap-0 py-4">
              <CardHeader className="pb-2">
                <CardTitle className="text-base">Trips by Status</CardTitle>
                <CardDescription>Current distribution of trips across statuses</CardDescription>
              </CardHeader>
              <CardContent className="p-4 pt-0">
                {statusPieData.length === 0 ? (
                  <EmptyChartMessage message="No trip data available" />
                ) : (
                  <ChartContainer config={pieConfig} className="h-[280px] w-full">
                    <PieChart>
                      <ChartTooltip content={<ChartTooltipContent nameKey="name" hideLabel />} />
                      <Pie
                        data={statusPieData}
                        cx="50%"
                        cy="50%"
                        innerRadius={60}
                        outerRadius={100}
                        paddingAngle={2}
                        dataKey="value"
                        nameKey="name"
                        label={({ name, value }) => `${name}: ${value}`}
                        labelLine={false}
                      >
                        {statusPieData.map((entry, index) => (
                          <Cell key={`cell-${index}`} fill={entry.fill} />
                        ))}
                      </Pie>
                      <ChartLegend content={<ChartLegendContent nameKey="name" />} />
                    </PieChart>
                  </ChartContainer>
                )}
              </CardContent>
            </Card>
          </motion.div>
        )}

        {/* 3. Top Routes - Horizontal Bar Chart */}
        {loading ? (
          <ChartSkeleton />
        ) : (
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.4, delay: 0.2 }}
          >
            <Card className="gap-0 py-4">
              <CardHeader className="pb-2">
                <CardTitle className="text-base">Top Routes</CardTitle>
                <CardDescription>Most frequently traveled routes</CardDescription>
              </CardHeader>
              <CardContent className="p-4 pt-0">
                {(!data?.topRoutes || data.topRoutes.length === 0) ? (
                  <EmptyChartMessage message="No route data available" />
                ) : (
                  <ChartContainer config={topRoutesConfig} className="h-[280px] w-full">
                    <BarChart data={data.topRoutes} layout="vertical" margin={{ top: 5, right: 30, left: 10, bottom: 5 }}>
                      <CartesianGrid horizontal={false} strokeDasharray="3 3" />
                      <XAxis type="number" tickLine={false} axisLine={false} fontSize={12} />
                      <YAxis
                        type="category"
                        dataKey="route"
                        tickLine={false}
                        axisLine={false}
                        fontSize={11}
                        width={130}
                      />
                      <ChartTooltip
                        content={<ChartTooltipContent />}
                      />
                      <Bar dataKey="count" radius={[0, 4, 4, 0]} maxBarSize={28}>
                        {data.topRoutes.map((_, index) => (
                          <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                        ))}
                      </Bar>
                    </BarChart>
                  </ChartContainer>
                )}
              </CardContent>
            </Card>
          </motion.div>
        )}

        {/* 4. Top Drivers - Bar Chart */}
        {loading ? (
          <ChartSkeleton />
        ) : (
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.4, delay: 0.25 }}
          >
            <Card className="gap-0 py-4">
              <CardHeader className="pb-2">
                <CardTitle className="text-base">Top Drivers</CardTitle>
                <CardDescription>Drivers with the most completed trips</CardDescription>
              </CardHeader>
              <CardContent className="p-4 pt-0">
                {(!data?.topDrivers || data.topDrivers.length === 0) ? (
                  <EmptyChartMessage message="No driver performance data" />
                ) : (
                  <ChartContainer config={topDriversConfig} className="h-[280px] w-full">
                    <BarChart data={data.topDrivers} margin={{ top: 5, right: 10, left: 10, bottom: 5 }}>
                      <CartesianGrid vertical={false} strokeDasharray="3 3" />
                      <XAxis dataKey="driver" tickLine={false} axisLine={false} fontSize={11} />
                      <YAxis tickLine={false} axisLine={false} fontSize={12} />
                      <ChartTooltip content={<ChartTooltipContent />} />
                      <Bar dataKey="trips" radius={[4, 4, 0, 0]} maxBarSize={48}>
                        {data.topDrivers.map((_, index) => (
                          <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                        ))}
                      </Bar>
                    </BarChart>
                  </ChartContainer>
                )}
              </CardContent>
            </Card>
          </motion.div>
        )}

        {/* 5. Revenue by Destination - Bar Chart */}
        {loading ? (
          <ChartSkeleton />
        ) : (
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.4, delay: 0.3 }}
          >
            <Card className="gap-0 py-4">
              <CardHeader className="pb-2">
                <CardTitle className="text-base">Revenue by Destination</CardTitle>
                <CardDescription>Top earning destinations across all trips</CardDescription>
              </CardHeader>
              <CardContent className="p-4 pt-0">
                {(!data?.revenueByDestination || data.revenueByDestination.length === 0) ? (
                  <EmptyChartMessage message="No destination revenue data" />
                ) : (
                  <ChartContainer config={revenueByDestConfig} className="h-[280px] w-full">
                    <BarChart data={data.revenueByDestination} margin={{ top: 5, right: 10, left: 10, bottom: 5 }}>
                      <CartesianGrid vertical={false} strokeDasharray="3 3" />
                      <XAxis dataKey="destination" tickLine={false} axisLine={false} fontSize={11} />
                      <YAxis
                        tickLine={false}
                        axisLine={false}
                        fontSize={12}
                        tickFormatter={(v) => `${(v / 1000).toFixed(0)}k`}
                      />
                      <ChartTooltip
                        content={
                          <ChartTooltipContent
                            formatter={(value) => formatCurrency(value as number)}
                          />
                        }
                      />
                      <Bar dataKey="revenue" radius={[4, 4, 0, 0]} maxBarSize={48}>
                        {data.revenueByDestination.map((_, index) => (
                          <Cell key={`cell-${index}`} fill={COLORS[(index + 2) % COLORS.length]} />
                        ))}
                      </Bar>
                    </BarChart>
                  </ChartContainer>
                )}
              </CardContent>
            </Card>
          </motion.div>
        )}

        {/* 6. Expense Breakdown - Donut Chart */}
        {loading ? (
          <ChartSkeleton />
        ) : (
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.4, delay: 0.35 }}
          >
            <Card className="gap-0 py-4">
              <CardHeader className="pb-2">
                <CardTitle className="text-base">Expense Breakdown</CardTitle>
                <CardDescription>Total expenses by category</CardDescription>
              </CardHeader>
              <CardContent className="p-4 pt-0">
                {expensePieData.length === 0 ? (
                  <EmptyChartMessage message="No expense data available" />
                ) : (
                  <div className="flex flex-col lg:flex-row items-center gap-4">
                    <ChartContainer config={expenseConfig} className="h-[280px] w-full max-w-[280px]">
                      <PieChart>
                        <ChartTooltip content={<ChartTooltipContent nameKey="name" hideLabel />} />
                        <Pie
                          data={expensePieData}
                          cx="50%"
                          cy="50%"
                          innerRadius={55}
                          outerRadius={90}
                          paddingAngle={2}
                          dataKey="value"
                          nameKey="name"
                        >
                          {expensePieData.map((entry, index) => (
                            <Cell key={`cell-${index}`} fill={entry.fill} />
                          ))}
                        </Pie>
                      </PieChart>
                    </ChartContainer>
                    <div className="flex-1 max-h-[280px] overflow-y-auto w-full">
                      <div className="space-y-2">
                        {data?.expenseSummary?.map((e) => (
                          <div
                            key={e.category}
                            className="flex items-center justify-between text-sm"
                          >
                            <div className="flex items-center gap-2">
                              <div
                                className="h-2.5 w-2.5 rounded-full shrink-0"
                                style={{
                                  backgroundColor:
                                    CATEGORY_COLORS[e.category] || 'hsl(0, 0%, 75%)',
                                }}
                              />
                              <span className="text-muted-foreground">
                                {CATEGORY_LABELS[e.category] || e.category}
                              </span>
                            </div>
                            <span className="font-medium tabular-nums">
                              {formatCurrency(e.amount)}
                            </span>
                          </div>
                        ))}
                      </div>
                    </div>
                  </div>
                )}
              </CardContent>
            </Card>
          </motion.div>
        )}
      </div>

      {/* Trips Over Time - Full Width */}
      {loading ? (
        <ChartSkeleton />
      ) : (
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.4, delay: 0.4 }}
        >
          <Card className="gap-0 py-4">
            <CardHeader className="pb-2">
              <CardTitle className="text-base">Trips Over Time</CardTitle>
              <CardDescription>Daily trip activity for the last 30 days</CardDescription>
            </CardHeader>
            <CardContent className="p-4 pt-0">
              {(!data?.tripsOverTime || data.tripsOverTime.length === 0) ? (
                <EmptyChartMessage message="No trip activity data" />
              ) : (
                <ChartContainer config={tripsOverTimeConfig} className="h-[240px] w-full">
                  <AreaChart data={data.tripsOverTime} margin={{ top: 5, right: 10, left: 10, bottom: 0 }}>
                    <defs>
                      <linearGradient id="fillTrips" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor="hsl(142, 71%, 45%)" stopOpacity={0.3} />
                        <stop offset="95%" stopColor="hsl(142, 71%, 45%)" stopOpacity={0.02} />
                      </linearGradient>
                    </defs>
                    <CartesianGrid vertical={false} strokeDasharray="3 3" />
                    <XAxis
                      dataKey="date"
                      tickLine={false}
                      axisLine={false}
                      fontSize={11}
                      interval="preserveStartEnd"
                    />
                    <YAxis tickLine={false} axisLine={false} fontSize={12} allowDecimals={false} />
                    <ChartTooltip content={<ChartTooltipContent />} />
                    <Area
                      type="monotone"
                      dataKey="count"
                      stroke="hsl(142, 71%, 45%)"
                      strokeWidth={2}
                      fill="url(#fillTrips)"
                    />
                  </AreaChart>
                </ChartContainer>
              )}
            </CardContent>
          </Card>
        </motion.div>
      )}
    </div>
  )
}

export default AnalyticsView
