'use client'

import { useState } from 'react'
import { useDebounce } from '@/hooks/use-debounce'
import { useQuery } from '@tanstack/react-query'
import { motion } from 'framer-motion'
import {
  BarChart3,
  TrendingUp,
  TrendingDown,
  DollarSign,
  Users,
  Truck,
  Download,
  Filter,
  ArrowUpDown,
  ChevronRight,
  AlertCircle,
  RefreshCw,
  Search,
  ChevronUp,
  ChevronDown,
  FileText,
  Loader2,
} from 'lucide-react'
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  PieChart,
  Pie,
  Cell,
  Legend,
  Line,
  ComposedChart,
} from 'recharts'
import { cn } from '@/lib/utils'
import { useAppStore } from '@/lib/store'
import { formatCurrency, formatShortCurrency } from '@/lib/currency'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import { ReportsSkeleton } from '@/components/ui/page-skeleton'
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
import { toast } from '@/lib/toast-config'
import { exportToCSV } from '@/lib/export'
import { buildReportHtml, type ReportData } from '@/lib/pdf-export'

// Re-export for local use
type ReportsData = ReportData

// ─── Helpers ────────────────────────────────────────────────────────────────

const CHART_COLORS = ['#10b981', '#3b82f6', '#f59e0b', '#ef4444', '#8b5cf6', '#06b6d4']

const fadeUp = (delay = 0) => ({
  initial: { opacity: 0, y: 20 },
  animate: { opacity: 1, y: 0, transition: { duration: 0.5, delay, ease: 'easeOut' } },
})

// ─── Helpers ────────────────────────────────────────────────────────────────

// ─── Summary Card ───────────────────────────────────────────────────────────
interface SummaryCardProps {
  label: string
  value: string
  subLabel?: string
  icon: React.ReactNode
  iconBg: string
  trend?: 'up' | 'down' | null
}

function SummaryCard({ label, value, subLabel, icon, iconBg, trend }: SummaryCardProps) {
  return (
    <Card className="hover:shadow-md transition-all duration-300">
      <CardContent className="p-5">
        <div className="flex items-center justify-between">
          <div className="space-y-1.5">
            <p className="text-sm font-medium text-muted-foreground">{label}</p>
            <p className="text-2xl font-bold tracking-tight">{value}</p>
            {subLabel && (
              <div className="flex items-center gap-1 text-xs text-muted-foreground">
                {trend === 'up' && <TrendingUp className="size-3 text-emerald-500" />}
                {trend === 'down' && <TrendingDown className="size-3 text-red-500" />}
                <span>{subLabel}</span>
              </div>
            )}
          </div>
          <div className={cn('size-12 rounded-xl flex items-center justify-center', iconBg)}>
            {icon}
          </div>
        </div>
      </CardContent>
    </Card>
  )
}

// ─── Custom Chart Tooltips ──────────────────────────────────────────────────
function MonthlyTooltip({ active, payload, label }: { active?: boolean; payload?: Array<{ name: string; value: number; color: string }>; label?: string }) {
  if (active && payload && payload.length) {
    return (
      <div className="bg-popover border rounded-lg shadow-lg p-3 text-sm space-y-1.5">
        <p className="font-medium">{label}</p>
        {payload.map((entry, idx) => (
          <div key={idx} className="flex items-center justify-between gap-4">
            <div className="flex items-center gap-1.5">
              <div className="size-2.5 rounded-full" style={{ backgroundColor: entry.color }} />
              <span className="text-muted-foreground">{entry.name}</span>
            </div>
            <span className="font-semibold">{entry.name === 'Trips' ? entry.value : formatShortCurrency(entry.value)}</span>
          </div>
        ))}
      </div>
    )
  }
  return null
}

function StatusTooltip({ active, payload }: { active?: boolean; payload?: Array<{ name: string; value: number; payload: { name: string; value: number } }> }) {
  if (active && payload && payload.length) {
    const data = payload[0].payload
    return (
      <div className="bg-popover border rounded-lg shadow-lg p-3 text-sm">
        <p className="font-medium capitalize">{data.name}</p>
        <p className="font-semibold">{data.value} trips</p>
      </div>
    )
  }
  return null
}

function DriverRevenueTooltip({ active, payload }: { active?: boolean; payload?: Array<{ payload: { driverName: string; totalRevenue: number; totalTrips: number } }> }) {
  if (active && payload && payload.length) {
    const data = payload[0].payload
    return (
      <div className="bg-popover border rounded-lg shadow-lg p-3 text-sm">
        <p className="font-medium">{data.driverName}</p>
        <p className="font-semibold text-emerald-600 dark:text-emerald-400">{formatShortCurrency(data.totalRevenue)}</p>
        <p className="text-muted-foreground">{data.totalTrips} trips</p>
      </div>
    )
  }
  return null
}

// ─── Main Component ─────────────────────────────────────────────────────────
export default function ReportsPage() {
  const { setCurrentView } = useAppStore()
  const [driverSearch, setDriverSearch] = useState('')
  const debouncedDriverSearch = useDebounce(driverSearch, 300)
  const [driverSortField, setDriverSortField] = useState<string>('totalRevenue')
  const [driverSortDir, setDriverSortDir] = useState<'asc' | 'desc'>('desc')
  const [isGeneratingPdf, setIsGeneratingPdf] = useState(false)

  const { data, isLoading, error, refetch } = useQuery<ReportsData>({
    queryKey: ['reports'],
    queryFn: async () => {
      const res = await fetch('/api/reports')
      if (!res.ok) throw new Error('Failed to fetch reports data')
      return res.json()
    },
  })

  // ── Derived data ──
  const fs = data?.financialSummary

  // Monthly chart data for last 6 months
  const monthlyChartData = data?.monthlyRevenue
    ? data.monthlyRevenue.slice(-6).map((m) => {
        const [year, month] = m.month.split('-')
        const monthLabel = new Date(parseInt(year), parseInt(month) - 1).toLocaleDateString('en-US', { month: 'short', year: '2-digit' })
        return {
          ...m,
          monthLabel,
        }
      })
    : []

  // Trip status pie chart data
  const statusChartData = data?.tripStatusBreakdown
    ? (() => {
        const statusLabels: Record<string, string> = {
          pending: 'Pending',
          in_progress: 'In Progress',
          completed: 'Completed',
          cancelled: 'Cancelled',
        }
        const colors: Record<string, string> = {
          pending: '#f59e0b',
          in_progress: '#3b82f6',
          completed: '#10b981',
          cancelled: '#ef4444',
        }
        return Object.entries(data.tripStatusBreakdown)
          .filter(([, value]) => value > 0)
          .map(([key, value]) => ({
            name: statusLabels[key] || key,
            value,
            color: colors[key] || '#6b7280',
          }))
      })()
    : []

  // Driver revenue top 5 horizontal bar
  const topDrivers = data?.driverPerformance
    ? [...data.driverPerformance]
        .sort((a, b) => b.totalRevenue - a.totalRevenue)
        .slice(0, 5)
    : []

  // Filtered & sorted driver table
  const filteredDrivers = (() => {
    if (!data?.driverPerformance) return []
    const list = [...data.driverPerformance]
      .filter((d) =>
        d.driverName.toLowerCase().includes(debouncedDriverSearch.toLowerCase())
      )
      .sort((a, b) => {
        const dir = driverSortDir === 'asc' ? 1 : -1
        const fieldMap: Record<string, (d: typeof a) => number | string> = {
          driverName: (d) => d.driverName,
          totalTrips: (d) => d.totalTrips,
          totalDistance: (d) => d.totalDistance,
          totalRevenue: (d) => d.totalRevenue,
          fuelEfficiency: (d) => d.fuelEfficiency,
          avgRevenuePerTrip: (d) => d.avgRevenuePerTrip,
        }
        const accessor = fieldMap[driverSortField]
        if (!accessor) return 0
        const aVal = accessor(a)
        const bVal = accessor(b)
        if (typeof aVal === 'string' && typeof bVal === 'string') {
          return dir * aVal.localeCompare(bVal)
        }
        return dir * ((aVal as number) - (bVal as number))
      })
    return list
  })()

  const toggleDriverSort = (field: string) => {
    if (driverSortField === field) {
      setDriverSortDir((d) => (d === 'asc' ? 'desc' : 'asc'))
    } else {
      setDriverSortField(field)
      setDriverSortDir('desc')
    }
  }

  // PDF export
  const handleExportPDF = () => {
    if (!data) return
    setIsGeneratingPdf(true)
    // Create a hidden container for the PDF report
    const container = document.createElement('div')
    container.className = 'pdf-report-content'
    container.style.cssText = 'position:fixed;left:-9999px;top:0;width:210mm;background:white;'
    container.innerHTML = buildReportHtml(data)
    document.body.appendChild(container)
    // Give the browser time to render, then print
    setTimeout(() => {
      window.print()
      // Clean up after print dialog closes
      setTimeout(() => {
        document.body.removeChild(container)
        setIsGeneratingPdf(false)
      }, 500)
    }, 200)
  }

  // CSV export
  const handleExportCSV = () => {
    if (!data) return
    try {
      const driverRows = data.driverPerformance.map((d) => ({
        Driver: d.driverName,
        TotalTrips: d.totalTrips,
        CompletedTrips: d.completedTrips,
        TotalDistance: `${d.totalDistance} km`,
        TotalRevenue: d.totalRevenue,
        FuelUsed: `${d.totalFuelUsed} L`,
        AvgRevenuePerTrip: d.avgRevenuePerTrip,
        FuelEfficiency: `${d.fuelEfficiency} km/L`,
      }))
      const truckRows = data.truckUtilization.map((t) => ({
        PlateNumber: t.plateNumber,
        TruckName: t.truckName,
        TotalTrips: t.totalTrips,
        TotalDistance: `${t.totalDistance} km`,
        TotalRevenue: t.totalRevenue,
        ActiveDays: t.activeDays,
      }))
      const exportData = [
        ...driverRows.map((r) => ({ ...r, _type: 'Driver' })),
        ...truckRows.map((r) => ({ ...r, _type: 'Truck' })),
      ] as Record<string, unknown>[]
      exportToCSV(exportData, `fleet-report-${new Date().toISOString().split('T')[0]}`)
      toast.success('Report exported successfully')
    } catch {
      toast.error('Failed to export report')
    }
  }

  if (isLoading) return <ReportsSkeleton />

  if (error) {
    return (
      <div className="flex flex-col items-center justify-center h-[60vh] gap-4">
        <AlertCircle className="size-12 text-destructive" />
        <p className="text-muted-foreground">Failed to load reports data</p>
        <Button variant="outline" onClick={() => refetch()}>
          <RefreshCw className="size-4" />
          Try Again
        </Button>
      </div>
    )
  }

  return (
    <div className="p-4 md:p-6 space-y-6">
      {/* ── Header ───────────────────────────────────────────────────────── */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 pb-4 border-b">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <button onClick={() => setCurrentView('dashboard')} className="text-sm text-muted-foreground hover:text-foreground transition-colors">Dashboard</button>
            <ChevronRight className="size-3.5 text-muted-foreground" />
            <span className="text-sm font-medium">Reports</span>
          </div>
          <div className="flex items-center gap-3">
            <h1 className="text-2xl font-bold">Reports & Analytics</h1>
            {!isLoading && data && (
              <span className="text-sm font-medium text-muted-foreground bg-muted rounded-full px-2.5 py-0.5">
                {data.driverPerformance.length} drivers · {data.truckUtilization.length} trucks
              </span>
            )}
          </div>
          <p className="text-muted-foreground text-sm">Comprehensive financial and operational insights for your fleet</p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={handleExportCSV} disabled={isLoading}>
            <Download className="size-4" />
            Export CSV
          </Button>
          <Button variant="outline" size="sm" onClick={handleExportPDF} disabled={isLoading || isGeneratingPdf}>
            {isGeneratingPdf ? (
              <Loader2 className="size-4 animate-spin" />
            ) : (
              <FileText className="size-4" />
            )}
            {isGeneratingPdf ? 'Generating PDF...' : 'Export PDF'}
          </Button>
          <Button variant="outline" size="sm" onClick={() => refetch()} disabled={isLoading}>
            <RefreshCw className={cn('size-4', isLoading && 'animate-spin')} />
            Refresh
          </Button>
        </div>
      </div>

      {/* ── Financial Summary Cards (2x3 grid) ──────────────────────────── */}
      <motion.div {...fadeUp(0.1)}>
        {fs ? (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            <SummaryCard
              label="Total Revenue"
              value={formatCurrency(fs.totalRevenue)}
              subLabel="All trips combined"
              icon={<TrendingUp className="size-6 text-emerald-600" />}
              iconBg="bg-emerald-100 text-emerald-600 dark:bg-emerald-950 dark:text-emerald-400"
              trend={fs.totalRevenue > 0 ? 'up' : null}
            />
            <SummaryCard
              label="Net Income"
              value={formatCurrency(fs.netIncome)}
              subLabel={fs.netIncome >= 0 ? 'Revenue minus expenses' : 'Expenses exceed revenue'}
              icon={<DollarSign className="size-6 text-emerald-600" />}
              iconBg="bg-emerald-100 text-emerald-600 dark:bg-emerald-950 dark:text-emerald-400"
              trend={fs.netIncome >= 0 ? 'up' : 'down'}
            />
            <SummaryCard
              label="Total Expenses"
              value={formatCurrency(fs.totalCashAdvances + fs.totalIncentives)}
              subLabel="Cash advances + incentives"
              icon={<TrendingDown className="size-6 text-red-600" />}
              iconBg="bg-red-100 text-red-600 dark:bg-red-950 dark:text-red-400"
              trend="down"
            />
            <SummaryCard
              label="Cash Advances Outstanding"
              value={formatCurrency(fs.pendingCashAdvances)}
              subLabel={`of ${formatShortCurrency(fs.totalCashAdvances)} total`}
              icon={<DollarSign className="size-6 text-amber-600" />}
              iconBg="bg-amber-100 text-amber-600 dark:bg-amber-950 dark:text-amber-400"
            />
            <SummaryCard
              label="Incentives Pending"
              value={formatCurrency(fs.pendingIncentives)}
              subLabel={`of ${formatShortCurrency(fs.totalIncentives)} total`}
              icon={<DollarSign className="size-6 text-yellow-600" />}
              iconBg="bg-yellow-100 text-yellow-600 dark:bg-yellow-950 dark:text-yellow-400"
            />
            <SummaryCard
              label="Completed Trips Revenue"
              value={formatCurrency(fs.completedTripsRevenue)}
              subLabel={`${formatShortCurrency(fs.pendingTripsRevenue)} pending`}
              icon={<BarChart3 className="size-6 text-blue-600" />}
              iconBg="bg-blue-100 text-blue-600 dark:bg-blue-950 dark:text-blue-400"
              trend="up"
            />
          </div>
        ) : null}
      </motion.div>

      {/* ── Charts Section ──────────────────────────────────────────────── */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        {/* Monthly Revenue Bar Chart */}
        <motion.div {...fadeUp(0.2)} className="lg:col-span-2">
          {monthlyChartData.length > 0 ? (
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-lg font-semibold flex items-center gap-2">
                  <BarChart3 className="size-5 text-emerald-600" />
                  Monthly Revenue & Expenses
                </CardTitle>
              </CardHeader>
              <CardContent className="p-6">
                <ResponsiveContainer width="100%" height={300}>
                  <ComposedChart data={monthlyChartData} margin={{ top: 5, right: 10, left: 10, bottom: 5 }}>
                    <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                    <XAxis dataKey="monthLabel" tick={{ fontSize: 12 }} axisLine={false} tickLine={false} />
                    <YAxis
                      yAxisId="revenue"
                      tickFormatter={(value) => formatShortCurrency(value)}
                      tick={{ fontSize: 11 }}
                      axisLine={false}
                      tickLine={false}
                      width={80}
                    />
                    <YAxis
                      yAxisId="trips"
                      orientation="right"
                      tick={{ fontSize: 11 }}
                      axisLine={false}
                      tickLine={false}
                      width={50}
                      label={{ value: 'Trips', angle: -90, position: 'insideRight', style: { fontSize: 11, fill: '#3b82f6' } }}
                    />
                    <Tooltip content={<MonthlyTooltip />} />
                    <Legend
                      wrapperStyle={{ fontSize: '12px', paddingTop: '12px' }}
                      formatter={(value) => <span className="text-xs">{value}</span>}
                    />
                    <Bar yAxisId="revenue" dataKey="revenue" name="Revenue" fill="#10b981" radius={[4, 4, 0, 0]} maxBarSize={40} />
                    <Bar yAxisId="revenue" dataKey="expenses" name="Expenses" fill="#ef4444" radius={[4, 4, 0, 0]} maxBarSize={40} />
                    <Line
                      type="monotone"
                      dataKey="trips"
                      name="Trips"
                      stroke="#3b82f6"
                      strokeWidth={2}
                      dot={{ r: 4, fill: '#3b82f6' }}
                      yAxisId="trips"
                    />
                  </ComposedChart>
                </ResponsiveContainer>
              </CardContent>
            </Card>
          ) : (
            <Card>
              <CardContent className="flex flex-col items-center justify-center py-16 text-muted-foreground">
                <BarChart3 className="size-10 opacity-30 mb-3" />
                <p className="text-sm">No monthly data available yet</p>
              </CardContent>
            </Card>
          )}
        </motion.div>

        {/* Trip Status Pie/Donut Chart */}
        <motion.div {...fadeUp(0.25)}>
          {statusChartData.length > 0 ? (
            <Card className="h-full">
              <CardHeader className="pb-2">
                <CardTitle className="text-lg font-semibold flex items-center gap-2">
                  <Filter className="size-5 text-blue-600" />
                  Trip Status Breakdown
                </CardTitle>
              </CardHeader>
              <CardContent className="p-6">
                <ResponsiveContainer width="100%" height={250}>
                  <PieChart>
                    <Pie
                      data={statusChartData}
                      cx="50%"
                      cy="50%"
                      innerRadius={55}
                      outerRadius={90}
                      paddingAngle={3}
                      dataKey="value"
                      stroke="none"
                    >
                      {statusChartData.map((entry, index) => (
                        <Cell key={`cell-${index}`} fill={entry.color} />
                      ))}
                    </Pie>
                    <Tooltip content={<StatusTooltip />} />
                    <Legend
                      wrapperStyle={{ fontSize: '12px', paddingTop: '8px' }}
                      formatter={(value) => <span className="text-xs">{value}</span>}
                    />
                  </PieChart>
                </ResponsiveContainer>
              </CardContent>
            </Card>
          ) : (
            <Card className="h-full">
              <CardContent className="flex flex-col items-center justify-center py-16 text-muted-foreground">
                <Filter className="size-10 opacity-30 mb-3" />
                <p className="text-sm">No trip status data available</p>
              </CardContent>
            </Card>
          )}
        </motion.div>
      </div>

      {/* ── Driver Revenue Top 5 Chart ──────────────────────────────────── */}
      <motion.div {...fadeUp(0.3)}>
        {topDrivers.length > 0 ? (
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-lg font-semibold flex items-center gap-2">
                <Users className="size-5 text-violet-600" />
                Top 5 Drivers by Revenue
              </CardTitle>
            </CardHeader>
            <CardContent className="p-6">
              <ResponsiveContainer width="100%" height={250}>
                <BarChart
                  data={topDrivers}
                  layout="vertical"
                  margin={{ top: 5, right: 30, left: 10, bottom: 5 }}
                >
                  <CartesianGrid strokeDasharray="3 3" className="stroke-muted" horizontal={false} />
                  <XAxis
                    type="number"
                    tickFormatter={(value) => formatShortCurrency(value)}
                    tick={{ fontSize: 11 }}
                    axisLine={false}
                    tickLine={false}
                    width={80}
                  />
                  <YAxis
                    type="category"
                    dataKey="driverName"
                    tick={{ fontSize: 12 }}
                    axisLine={false}
                    tickLine={false}
                    width={100}
                  />
                  <Tooltip content={<DriverRevenueTooltip />} cursor={{ fill: 'hsl(var(--muted) / 0.3)' }} />
                  <Bar dataKey="totalRevenue" name="Revenue" radius={[0, 6, 6, 0]} maxBarSize={30}>
                    {topDrivers.map((_, index) => (
                      <Cell key={`driver-${index}`} fill={CHART_COLORS[index % CHART_COLORS.length]} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>
        ) : (
          <Card>
            <CardContent className="flex flex-col items-center justify-center py-16 text-muted-foreground">
              <Users className="size-10 opacity-30 mb-3" />
              <p className="text-sm">No driver data available</p>
            </CardContent>
          </Card>
        )}
      </motion.div>

      {/* ── Driver Performance Table ────────────────────────────────────── */}
      <motion.div {...fadeUp(0.35)}>
        <Card>
          <CardHeader className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
            <CardTitle className="text-lg font-semibold flex items-center gap-2">
              <Users className="size-5 text-emerald-600" />
              Driver Performance
            </CardTitle>
            <div className="flex flex-col sm:flex-row gap-2">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 size-4 text-muted-foreground" />
                <Input
                  placeholder="Search driver..."
                  value={driverSearch}
                  onChange={(e) => setDriverSearch(e.target.value)}
                  className="pl-9 w-full sm:w-48"
                />
              </div>
              <Button
                variant="outline"
                size="sm"
                onClick={() => {
                  const rows = filteredDrivers.map((d) => ({
                    Driver: d.driverName,
                    TotalTrips: d.totalTrips,
                    CompletedTrips: d.completedTrips,
                    Distance_km: d.totalDistance,
                    Revenue: d.totalRevenue,
                    FuelUsed_L: d.totalFuelUsed,
                    AvgRevenueTrip: d.avgRevenuePerTrip,
                    FuelEfficiency: d.fuelEfficiency,
                  }))
                  exportToCSV(rows as Record<string, unknown>[], `driver-performance-${new Date().toISOString().split('T')[0]}`)
                  toast.success('Driver data exported')
                }}
              >
                <Download className="size-3.5" />
                Export
              </Button>
            </div>
          </CardHeader>
          <CardContent className="p-0">
            {filteredDrivers.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-16 text-muted-foreground">
                <Users className="size-10 opacity-30 mb-3" />
                <p className="text-sm">
                  {driverSearch ? 'No drivers match your search' : 'No driver performance data available'}
                </p>
              </div>
            ) : (
              <div className="overflow-x-auto max-h-96 overflow-y-auto">
                <Table>
                  <TableHeader>
                    <TableRow className="hover:bg-transparent">
                      {[
                        { key: 'driverName', label: 'Driver' },
                        { key: 'totalTrips', label: 'Trips' },
                        { key: 'totalDistance', label: 'Distance' },
                        { key: 'totalRevenue', label: 'Revenue' },
                        { key: 'fuelEfficiency', label: 'Fuel Eff.' },
                        { key: 'avgRevenuePerTrip', label: 'Avg Rev/Trip' },
                      ].map((col) => (
                        <TableHead
                          key={col.key}
                          className="cursor-pointer select-none"
                          onClick={() => toggleDriverSort(col.key)}
                        >
                          <span className="inline-flex items-center gap-1">
                            {col.label}
                            <ArrowUpDown className="size-3 opacity-40" />
                            {driverSortField === col.key && (
                              driverSortDir === 'asc'
                                ? <ChevronUp className="size-3" />
                                : <ChevronDown className="size-3" />
                            )}
                          </span>
                        </TableHead>
                      ))}
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {filteredDrivers.map((driver, idx) => (
                      <TableRow key={driver.driverId} className={cn(idx % 2 === 1 ? 'bg-muted/30' : '')}>
                        <TableCell>
                          <div className="flex items-center gap-2">
                            <div className="size-8 rounded-full bg-emerald-100 dark:bg-emerald-950 flex items-center justify-center">
                              <span className="text-xs font-bold text-emerald-700 dark:text-emerald-400">
                                {driver.driverName.charAt(0)}
                              </span>
                            </div>
                            <span className="font-medium">{driver.driverName}</span>
                          </div>
                        </TableCell>
                        <TableCell>
                          <div className="flex items-center gap-1.5">
                            <span className="font-semibold">{driver.totalTrips}</span>
                            <span className="text-xs text-muted-foreground">({driver.completedTrips} done)</span>
                          </div>
                        </TableCell>
                        <TableCell>{driver.totalDistance.toLocaleString()} km</TableCell>
                        <TableCell className="font-semibold text-emerald-600 dark:text-emerald-400">
                          {formatCurrency(driver.totalRevenue)}
                        </TableCell>
                        <TableCell>
                          {driver.fuelEfficiency > 0 ? (
                            <Badge variant="outline" className="bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-950 dark:text-emerald-400 dark:border-emerald-800">
                              {driver.fuelEfficiency} km/L
                            </Badge>
                          ) : (
                            <span className="text-muted-foreground">—</span>
                          )}
                        </TableCell>
                        <TableCell className="font-medium">
                          {formatCurrency(driver.avgRevenuePerTrip)}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            )}
          </CardContent>
        </Card>
      </motion.div>

      {/* ── Truck Utilization Table ──────────────────────────────────────── */}
      <motion.div {...fadeUp(0.4)}>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-lg font-semibold flex items-center gap-2">
              <Truck className="size-5 text-amber-600" />
              Truck Utilization
            </CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            {!data?.truckUtilization.length ? (
              <div className="flex flex-col items-center justify-center py-16 text-muted-foreground">
                <Truck className="size-10 opacity-30 mb-3" />
                <p className="text-sm">No truck utilization data available</p>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow className="hover:bg-transparent">
                      <TableHead>Plate</TableHead>
                      <TableHead>Name</TableHead>
                      <TableHead className="hidden sm:table-cell">Trips</TableHead>
                      <TableHead className="hidden md:table-cell">Distance</TableHead>
                      <TableHead>Revenue</TableHead>
                      <TableHead className="hidden sm:table-cell">Active Days</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {data.truckUtilization.map((truck, idx) => {
                      const maxTrips = Math.max(...data.truckUtilization.map((t) => t.totalTrips), 1)
                      const utilizationPct = Math.round((truck.totalTrips / maxTrips) * 100)
                      const badgeColor = utilizationPct >= 75
                        ? 'bg-emerald-100 text-emerald-700 border-emerald-200 dark:bg-emerald-950 dark:text-emerald-400 dark:border-emerald-800'
                        : utilizationPct >= 50
                          ? 'bg-amber-100 text-amber-700 border-amber-200 dark:bg-amber-950 dark:text-amber-400 dark:border-amber-800'
                          : 'bg-gray-100 text-gray-700 border-gray-200 dark:bg-gray-800 dark:text-gray-400 dark:border-gray-700'
                      return (
                        <TableRow key={truck.truckId} className={cn(idx % 2 === 1 ? 'bg-muted/30' : '')}>
                          <TableCell>
                            <div className="flex items-center gap-2">
                              <div className="size-8 rounded-lg bg-amber-100 dark:bg-amber-950 flex items-center justify-center">
                                <Truck className="size-4 text-amber-600 dark:text-amber-400" />
                              </div>
                              <span className="font-mono text-sm font-semibold">{truck.plateNumber}</span>
                            </div>
                          </TableCell>
                          <TableCell>{truck.truckName}</TableCell>
                          <TableCell className="hidden sm:table-cell">
                            <Badge variant="outline" className={badgeColor}>
                              {truck.totalTrips}
                            </Badge>
                          </TableCell>
                          <TableCell className="hidden md:table-cell">
                            {truck.totalDistance.toLocaleString()} km
                          </TableCell>
                          <TableCell className="font-semibold text-emerald-600 dark:text-emerald-400">
                            {formatCurrency(truck.totalRevenue)}
                          </TableCell>
                          <TableCell className="hidden sm:table-cell">
                            <span className="text-muted-foreground">{truck.activeDays} days</span>
                          </TableCell>
                        </TableRow>
                      )
                    })}
                  </TableBody>
                </Table>
              </div>
            )}
          </CardContent>
        </Card>
      </motion.div>

      {/* ── Cargo Stats Card ─────────────────────────────────────────────── */}
      <motion.div {...fadeUp(0.45)}>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-lg font-semibold flex items-center gap-2">
              <Truck className="size-5 text-violet-600" />
              Cargo Statistics
            </CardTitle>
          </CardHeader>
          <CardContent>
            {data?.cargoStats ? (
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                <div className="bg-gradient-to-br from-violet-50 to-purple-50 dark:from-violet-950 dark:to-purple-950 rounded-xl p-4">
                  <p className="text-sm text-muted-foreground">Total Weight</p>
                  <p className="text-xl font-bold">{data.cargoStats.totalWeight.toLocaleString()} kg</p>
                </div>
                <div className="bg-gradient-to-br from-blue-50 to-sky-50 dark:from-blue-950 dark:to-sky-950 rounded-xl p-4">
                  <p className="text-sm text-muted-foreground">Avg Weight / Trip</p>
                  <p className="text-xl font-bold">{data.cargoStats.avgWeightPerTrip.toLocaleString()} kg</p>
                </div>
                <div className="bg-gradient-to-br from-emerald-50 to-teal-50 dark:from-emerald-950 dark:to-teal-950 rounded-xl p-4">
                  <p className="text-sm text-muted-foreground">Most Common Cargo</p>
                  <p className="text-xl font-bold truncate">{data.cargoStats.mostCommonCargo}</p>
                </div>
              </div>
            ) : null}
          </CardContent>
        </Card>
      </motion.div>
    </div>
  )
}
