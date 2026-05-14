'use client'

import React, { useState, useEffect, useCallback } from 'react'
import { motion } from 'framer-motion'
import {
  Trophy,
  Users,
  TrendingUp,
  DollarSign,
  Medal,
  Star,
  Download,
} from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Skeleton } from '@/components/ui/skeleton'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
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
} from 'recharts'
import { fetchDriverPerformance, type DriverPerformanceData, type DriverPerformanceItem } from '@/lib/api'
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

const MEDAL_STYLES: Record<number, { bg: string }> = {
  1: { bg: 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400' },
  2: { bg: 'bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-300' },
  3: { bg: 'bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-400' },
}

// ============ CHART CONFIGS ============

const topPerformersConfig = {
  completedTrips: { label: 'Completed Trips', color: 'hsl(38, 92%, 50%)' },
} satisfies ChartConfig

const revenueConfig = {
  revenue: { label: 'Revenue', color: 'hsl(142, 71%, 45%)' },
} satisfies ChartConfig

// ============ ANIMATION ============

const containerVariants = {
  hidden: { opacity: 0 },
  show: {
    opacity: 1,
    transition: { staggerChildren: 0.08 },
  },
}

const itemVariants = {
  hidden: { opacity: 0, y: 20 },
  show: { opacity: 1, y: 0, transition: { duration: 0.4 } },
}

// ============ HELPERS ============

function formatCurrency(value: number): string {
  return `${CURRENCY_SYMBOL}${value.toLocaleString('en-GH', { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`
}

function formatDate(dateStr: string | null): string {
  if (!dateStr) return 'N/A'
  const date = new Date(dateStr)
  return date.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })
}

function getCompletionBadge(rate: number) {
  if (rate >= 90) return <Badge className="bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400 border-0">{rate}%</Badge>
  if (rate >= 70) return <Badge className="bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400 border-0">{rate}%</Badge>
  return <Badge className="bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400 border-0">{rate}%</Badge>
}

function getDriverStatusBadge(status: string) {
  const styles: Record<string, string> = {
    active: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400',
    inactive: 'bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-400',
    suspended: 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400',
  }
  return (
    <Badge className={`${styles[status] || styles.inactive} border-0 capitalize`}>
      {status}
    </Badge>
  )
}

// ============ SUB-COMPONENTS ============

function KpiCard({
  title,
  value,
  icon: Icon,
  colorClass,
  loading,
  subtitle,
}: {
  title: string
  value: string
  icon: React.ComponentType<{ className?: string }>
  colorClass: string
  loading: boolean
  subtitle?: string
}) {
  return (
    <motion.div variants={itemVariants}>
      <Card className="gap-0 py-4">
        <CardContent className="p-4">
          <div className="flex items-start justify-between">
            <div className="space-y-1">
              <p className="text-sm text-muted-foreground">{title}</p>
              {loading ? (
                <Skeleton className="h-8 w-28" />
              ) : (
                <>
                  <p className="text-2xl font-bold tracking-tight">{value}</p>
                  {subtitle && <p className="text-xs text-muted-foreground">{subtitle}</p>}
                </>
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
        <Skeleton className="h-5 w-40" />
        <Skeleton className="h-4 w-56" />
      </CardHeader>
      <CardContent className="p-4 pt-0">
        <Skeleton className="h-[280px] w-full rounded-lg" />
      </CardContent>
    </Card>
  )
}

function LoadingSkeleton() {
  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <Card key={i} className="gap-0 py-4">
            <CardContent className="p-4">
              <div className="flex items-start justify-between">
                <div className="space-y-2">
                  <Skeleton className="h-4 w-24" />
                  <Skeleton className="h-8 w-28" />
                </div>
                <Skeleton className="h-10 w-10 rounded-lg" />
              </div>
            </CardContent>
          </Card>
        ))}
      </div>
      <Card className="gap-0 py-4">
        <CardHeader className="pb-2">
          <Skeleton className="h-6 w-48" />
          <Skeleton className="h-4 w-64" />
        </CardHeader>
        <CardContent className="p-4 pt-0">
          <div className="space-y-3">
            {Array.from({ length: 5 }).map((_, i) => (
              <Skeleton key={i} className="h-12 w-full" />
            ))}
          </div>
        </CardContent>
      </Card>
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <ChartSkeleton />
        <ChartSkeleton />
      </div>
    </div>
  )
}

// ============ MOBILE DRIVER CARD ============

function DriverMobileCard({ driver, rank }: { driver: DriverPerformanceItem; rank: number }) {
  const medal = MEDAL_STYLES[rank]
  return (
    <motion.div variants={itemVariants}>
      <Card className="gap-0 py-3">
        <CardContent className="p-4 space-y-3">
          <div className="flex items-start justify-between">
            <div className="flex items-center gap-3">
              {medal && (
                <div className={`flex items-center justify-center h-8 w-8 rounded-full text-sm font-bold ${medal.bg}`}>
                  {rank}
                </div>
              )}
              {!medal && (
                <div className="flex items-center justify-center h-8 w-8 rounded-full bg-muted text-sm font-medium text-muted-foreground">
                  {rank}
                </div>
              )}
              <div>
                <p className="font-semibold text-sm">{driver.firstName} {driver.lastName}</p>
                <p className="text-xs text-muted-foreground">{driver.phone}</p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              {getDriverStatusBadge(driver.status)}
              {getCompletionBadge(driver.completionRate)}
            </div>
          </div>
          {driver.currentTrip && (
            <div className="flex items-center gap-1.5 px-2 py-1 rounded-md bg-amber-50 dark:bg-amber-900/15 text-xs">
              <div className="h-1.5 w-1.5 rounded-full bg-amber-500 animate-pulse" />
              <span className="text-amber-700 dark:text-amber-400">
                {driver.currentTrip.tripNumber}: {driver.currentTrip.loadingLocation} → {driver.currentTrip.destination}
              </span>
            </div>
          )}
          <div className="grid grid-cols-3 gap-2">
            <div className="text-center p-2 rounded-lg bg-muted/50">
              <p className="text-lg font-bold">{driver.completedTrips}<span className="text-xs text-muted-foreground font-normal">/{driver.totalTrips}</span></p>
              <p className="text-xs text-muted-foreground">Trips</p>
            </div>
            <div className="text-center p-2 rounded-lg bg-muted/50">
              <p className="text-lg font-bold">{formatCurrency(driver.totalRevenue)}</p>
              <p className="text-xs text-muted-foreground">Revenue</p>
            </div>
            <div className="text-center p-2 rounded-lg bg-muted/50">
              <p className="text-lg font-bold">{formatCurrency(driver.avgTripRevenue)}</p>
              <p className="text-xs text-muted-foreground">Avg/Trip</p>
            </div>
          </div>
          <div className="flex items-center justify-between text-xs text-muted-foreground">
            <span>Last active: {formatDate(driver.lastActiveDate)}</span>
            {driver.licenseNumber && <span>License: {driver.licenseNumber}</span>}
          </div>
        </CardContent>
      </Card>
    </motion.div>
  )
}

// ============ MAIN COMPONENT ============

export function DriverPerformanceView() {
  const [range, setRange] = useState('this_month')
  const [data, setData] = useState<DriverPerformanceData | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const loadData = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const result = await fetchDriverPerformance(range)
      setData(result)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load driver performance')
    } finally {
      setLoading(false)
    }
  }, [range])

  useEffect(() => {
    loadData()
  }, [loadData])

  // Prepare chart data
  const topPerformersData = (data?.drivers || []).slice(0, 8).map((d) => ({
    name: `${d.firstName} ${d.lastName}`,
    completedTrips: d.completedTrips,
  }))

  const revenueDonutData = (data?.drivers || []).slice(0, 5).map((d, i) => ({
    name: `${d.firstName} ${d.lastName}`,
    revenue: d.totalRevenue,
    fill: COLORS[i % COLORS.length],
  }))

  // Total revenue for the rest (if more than 5 drivers)
  const allRevenue = (data?.drivers || []).reduce((sum, d) => sum + d.totalRevenue, 0)
  const top5Revenue = revenueDonutData.reduce((sum, d) => sum + d.revenue, 0)
  if (allRevenue > 0 && allRevenue > top5Revenue && data && data.drivers.length > 5) {
    revenueDonutData.push({
      name: 'Others',
      revenue: allRevenue - top5Revenue,
      fill: 'hsl(0, 0%, 75%)',
    })
  }

  // CSV Export
  function exportCSV() {
    if (!data) return
    try {
      const lines: string[] = []
      const rangeLabel = range.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase())
      const dateStr = new Date().toISOString().split('T')[0]

      lines.push(`${APP_NAME} - Driver Performance Scorecard`)
      lines.push(`Period: ${rangeLabel}`)
      lines.push(`Generated: ${new Date().toLocaleString()}`)
      lines.push('')
      lines.push('=== SUMMARY ===')
      lines.push(`Total Drivers,${data.summary.totalDrivers}`)
      lines.push(`Avg Completion Rate,${data.summary.avgCompletionRate}%`)
      lines.push(`Top Performer,${data.summary.topPerformer || 'N/A'}`)
      lines.push(`Total Revenue Generated,${data.summary.totalRevenueGenerated}`)
      lines.push(`Total Trips Completed,${data.summary.totalTripsCompleted}`)
      lines.push('')

      lines.push('=== DRIVER DETAILS ===')
      lines.push('Rank,Driver,Phone,Status,Total Trips,Completed Trips,Active Trips,Cancelled Trips,Revenue,Avg Trip Revenue,Completion Rate,Last Active,Current Trip')

      data.drivers.forEach((d, i) => {
        const rank = i + 1
        const currentTrip = d.currentTrip ? `${d.currentTrip.tripNumber} (${d.currentTrip.loadingLocation} → ${d.currentTrip.destination})` : 'None'
        lines.push(
          `${rank},"${d.firstName} ${d.lastName}",${d.phone},${d.status},${d.totalTrips},${d.completedTrips},${d.activeTrips},${d.cancelledTrips},${d.totalRevenue},${d.avgTripRevenue},${d.completionRate}%,"${formatDate(d.lastActiveDate)}","${currentTrip}"`
        )
      })

      const csvContent = lines.join('\n')
      const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' })
      const url = URL.createObjectURL(blob)
      const link = document.createElement('a')
      link.href = url
      link.download = `fleetpro-driver-performance-${range}-${dateStr}.csv`
      link.click()
      URL.revokeObjectURL(url)
      toast.success('CSV exported successfully')
    } catch {
      toast.error('Failed to export CSV')
    }
  }

  return (
    <motion.div
      variants={containerVariants}
      initial="hidden"
      animate="show"
      className="space-y-6"
    >
      {/* Header */}
      <motion.div
        variants={itemVariants}
        className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4"
      >
        <div>
          <h1 className="text-2xl font-bold tracking-tight flex items-center gap-2">
            <Trophy className="h-6 w-6 text-amber-500" />
            Driver Performance
          </h1>
          <p className="text-muted-foreground mt-1">
            Scorecard tracking driver efficiency, completion rates &amp; revenue contribution
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
          <Button variant="outline" size="sm" className="gap-2" onClick={exportCSV} disabled={loading}>
            <Download className="h-4 w-4" />
            <span className="hidden sm:inline">Export</span>
          </Button>
        </div>
      </motion.div>

      {/* Error state */}
      {error && (
        <motion.div variants={itemVariants}>
          <Card className="border-red-200 bg-red-50 dark:border-red-900/50 dark:bg-red-950/30">
            <CardContent className="p-4">
              <p className="text-sm text-red-600 dark:text-red-400">{error}</p>
            </CardContent>
          </Card>
        </motion.div>
      )}

      {/* Loading skeleton */}
      {loading && <LoadingSkeleton />}

      {/* Main content */}
      {!loading && data && (
        <>
          {/* KPI Cards */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            <KpiCard
              title="Total Drivers"
              value={String(data.summary.totalDrivers)}
              icon={Users}
              colorClass="bg-teal-500"
              loading={loading}
            />
            <KpiCard
              title="Avg Completion Rate"
              value={`${data.summary.avgCompletionRate}%`}
              icon={TrendingUp}
              colorClass="bg-emerald-500"
              loading={loading}
            />
            <KpiCard
              title="Top Performer"
              value={data.summary.topPerformer || 'N/A'}
              icon={Trophy}
              colorClass="bg-amber-500"
              loading={loading}
              subtitle={data.summary.topPerformer ? `${data.drivers[0]?.completedTrips || 0} trips completed` : undefined}
            />
            <KpiCard
              title="Total Revenue"
              value={formatCurrency(data.summary.totalRevenueGenerated)}
              icon={DollarSign}
              colorClass="bg-orange-500"
              loading={loading}
              subtitle={`${data.summary.totalTripsCompleted} trips completed`}
            />
          </div>

          {/* Performance Table (Desktop) / Cards (Mobile) */}
          <motion.div variants={itemVariants}>
            <Card className="gap-0 py-4">
              <CardHeader className="pb-2">
                <CardTitle className="text-base flex items-center gap-2">
                  <Medal className="h-4 w-4 text-amber-500" />
                  Driver Rankings
                </CardTitle>
                <CardDescription>
                  All drivers ranked by completed trips and revenue generated
                </CardDescription>
              </CardHeader>
              <CardContent className="p-4 pt-0">
                {data.drivers.length === 0 ? (
                  <div className="flex flex-col items-center justify-center py-12 text-muted-foreground">
                    <Users className="h-10 w-10 mb-2 opacity-40" />
                    <p className="text-sm">No driver data available for this period</p>
                  </div>
                ) : (
                  <>
                    {/* Desktop Table */}
                    <div className="hidden md:block overflow-x-auto max-h-[500px] overflow-y-auto rounded-lg border">
                      <Table>
                        <TableHeader>
                          <TableRow className="bg-muted/50 hover:bg-muted/50">
                            <TableHead className="w-[60px]">Rank</TableHead>
                            <TableHead>Driver</TableHead>
                            <TableHead className="text-center">Trips</TableHead>
                            <TableHead className="text-right">Revenue</TableHead>
                            <TableHead className="text-center">Completion</TableHead>
                            <TableHead>Last Active</TableHead>
                            <TableHead className="text-center">Status</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {data.drivers.map((driver, index) => {
                            const rank = index + 1
                            const medal = MEDAL_STYLES[rank]
                            return (
                              <TableRow key={driver.id}>
                                <TableCell>
                                  {medal ? (
                                    <div className={`flex items-center justify-center h-7 w-7 rounded-full text-xs font-bold ${medal.bg}`}>
                                      {rank}
                                    </div>
                                  ) : (
                                    <span className="flex items-center justify-center h-7 w-7 rounded-full bg-muted text-xs font-medium text-muted-foreground">
                                      {rank}
                                    </span>
                                  )}
                                </TableCell>
                                <TableCell>
                                  <div>
                                    <p className="font-medium">{driver.firstName} {driver.lastName}</p>
                                    <p className="text-xs text-muted-foreground">{driver.phone}</p>
                                    {driver.currentTrip && (
                                      <div className="flex items-center gap-1.5 mt-1 text-xs">
                                        <div className="h-1.5 w-1.5 rounded-full bg-amber-500 animate-pulse" />
                                        <span className="text-amber-700 dark:text-amber-400">
                                          {driver.currentTrip.tripNumber}: {driver.currentTrip.loadingLocation} → {driver.currentTrip.destination}
                                        </span>
                                      </div>
                                    )}
                                  </div>
                                </TableCell>
                                <TableCell className="text-center">
                                  <span className="font-semibold">{driver.completedTrips}</span>
                                  <span className="text-muted-foreground">/{driver.totalTrips}</span>
                                </TableCell>
                                <TableCell className="text-right font-medium tabular-nums">
                                  {formatCurrency(driver.totalRevenue)}
                                </TableCell>
                                <TableCell className="text-center">
                                  {getCompletionBadge(driver.completionRate)}
                                </TableCell>
                                <TableCell className="text-muted-foreground text-sm">
                                  {formatDate(driver.lastActiveDate)}
                                </TableCell>
                                <TableCell className="text-center">
                                  {getDriverStatusBadge(driver.status)}
                                </TableCell>
                              </TableRow>
                            )
                          })}
                        </TableBody>
                      </Table>
                    </div>

                    {/* Mobile Cards */}
                    <div className="md:hidden space-y-3">
                      {data.drivers.map((driver, index) => (
                        <DriverMobileCard key={driver.id} driver={driver} rank={index + 1} />
                      ))}
                    </div>
                  </>
                )}
              </CardContent>
            </Card>
          </motion.div>

          {/* Charts Row */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            {/* Top Performers - Horizontal Bar Chart */}
            <motion.div variants={itemVariants}>
              <Card className="gap-0 py-4">
                <CardHeader className="pb-2">
                  <CardTitle className="text-base flex items-center gap-2">
                    <Star className="h-4 w-4 text-amber-500" />
                    Top Performers
                  </CardTitle>
                  <CardDescription>Top 8 drivers by completed trips</CardDescription>
                </CardHeader>
                <CardContent className="p-4 pt-0">
                  {topPerformersData.length === 0 ? (
                    <div className="flex flex-col items-center justify-center h-[280px] text-muted-foreground">
                      <Trophy className="h-10 w-10 mb-2 opacity-40" />
                      <p className="text-sm">No performance data available</p>
                    </div>
                  ) : (
                    <ChartContainer config={topPerformersConfig} className="h-[280px] w-full">
                      <BarChart data={topPerformersData} layout="vertical" margin={{ top: 5, right: 20, left: 10, bottom: 5 }}>
                        <CartesianGrid horizontal={false} strokeDasharray="3 3" />
                        <XAxis type="number" tickLine={false} axisLine={false} fontSize={12} allowDecimals={false} />
                        <YAxis
                          type="category"
                          dataKey="name"
                          tickLine={false}
                          axisLine={false}
                          fontSize={11}
                          width={120}
                        />
                        <ChartTooltip content={<ChartTooltipContent />} />
                        <Bar dataKey="completedTrips" radius={[0, 4, 4, 0]} maxBarSize={28}>
                          {topPerformersData.map((_, index) => (
                            <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                          ))}
                        </Bar>
                      </BarChart>
                    </ChartContainer>
                  )}
                </CardContent>
              </Card>
            </motion.div>

            {/* Revenue Contribution - Donut Chart */}
            <motion.div variants={itemVariants}>
              <Card className="gap-0 py-4">
                <CardHeader className="pb-2">
                  <CardTitle className="text-base flex items-center gap-2">
                    <DollarSign className="h-4 w-4 text-emerald-500" />
                    Revenue Contribution
                  </CardTitle>
                  <CardDescription>Top 5 drivers by revenue generated</CardDescription>
                </CardHeader>
                <CardContent className="p-4 pt-0">
                  {revenueDonutData.length === 0 || allRevenue === 0 ? (
                    <div className="flex flex-col items-center justify-center h-[280px] text-muted-foreground">
                      <DollarSign className="h-10 w-10 mb-2 opacity-40" />
                      <p className="text-sm">No revenue data available</p>
                    </div>
                  ) : (
                    <div className="flex flex-col lg:flex-row items-center gap-4">
                      <ChartContainer config={revenueConfig} className="h-[280px] w-full max-w-[280px]">
                        <PieChart>
                          <ChartTooltip content={<ChartTooltipContent nameKey="name" hideLabel />} />
                          <Pie
                            data={revenueDonutData}
                            cx="50%"
                            cy="50%"
                            innerRadius={55}
                            outerRadius={90}
                            paddingAngle={2}
                            dataKey="revenue"
                            nameKey="name"
                          >
                            {revenueDonutData.map((entry, index) => (
                              <Cell key={`cell-${index}`} fill={entry.fill} />
                            ))}
                          </Pie>
                          <ChartLegend content={<ChartLegendContent nameKey="name" />} />
                        </PieChart>
                      </ChartContainer>
                      <div className="flex-1 max-h-[280px] overflow-y-auto w-full">
                        <div className="space-y-2">
                          {revenueDonutData.map((d) => (
                            <div key={d.name} className="flex items-center justify-between text-sm">
                              <div className="flex items-center gap-2">
                                <div
                                  className="h-2.5 w-2.5 rounded-full shrink-0"
                                  style={{ backgroundColor: d.fill }}
                                />
                                <span className="text-muted-foreground">{d.name}</span>
                              </div>
                              <span className="font-medium tabular-nums">
                                {formatCurrency(d.revenue)}
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
          </div>
        </>
      )}
    </motion.div>
  )
}

export default DriverPerformanceView
