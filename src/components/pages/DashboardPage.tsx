'use client'

import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { format } from 'date-fns'
import { motion } from 'framer-motion'
import {
  Users,
  Truck,
  Route,
  DollarSign,
  Plus,
  UserPlus,
  AlertCircle,
  RefreshCw,
  Banknote,
  CheckCircle2,
  Clock,
  XCircle,
  TrendingUp,
  TrendingDown,
  Wallet,
  Gift,
  ArrowRight,
  Download,
  ArrowUpRight,
  UserCheck,
} from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Skeleton } from '@/components/ui/skeleton'
import { Separator } from '@/components/ui/separator'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { useAppStore } from '@/lib/store'
import { formatCurrency } from '@/lib/currency'
import { cn } from '@/lib/utils'
import { toast } from '@/lib/toast-config'
import { exportToCSV } from '@/lib/export'
import { DriverAvatar } from '@/components/ui/driver-avatar'
import { DriverDetailSheet } from '@/components/ui/driver-detail-sheet'
import { RevenueChart } from '@/components/dashboard/RevenueChart'
import { DriverLeaderboard } from '@/components/dashboard/DriverLeaderboard'
import { DriverPerformanceCards } from '@/components/dashboard/DriverPerformanceCards'
import { ActivityFeed } from '@/components/dashboard/ActivityFeed'
import KpiCards from '@/components/dashboard/KpiCards'

// ─── Correct data interface matching API ────────────────────────────────────
interface DashboardData {
  drivers: { total: number; active: number }
  trucks: { total: number; active: number }
  trips: { total: number; pending: number; inProgress: number; completed: number; cancelled: number }
  revenue: { total: number; thisMonth: number }
  cashAdvances: { total: number; pending: number }
  incentives: { total: number; pending: number }
  tripsThisMonth: number
  recentTrips: Array<{
    id: string
    tripNumber: string
    driver: { id: string; driverName: string } | null
    truck: { id: string; plateNumber: string; truckName: string } | null
    originAddress: string
    destinationAddress: string
    status: string
    totalAmount: number
    departureDate: string
    createdAt: string
  }>
  generatedAt?: string
}

// ─── Animation variants ─────────────────────────────────────────────────────
const container = {
  hidden: { opacity: 0 },
  show: {
    opacity: 1,
    transition: { staggerChildren: 0.08 },
  },
}

const item = {
  hidden: { opacity: 0, y: 20 },
  show: { opacity: 1, y: 0, transition: { duration: 0.4, ease: 'easeOut' } },
}

const fadeUp = (delay = 0) => ({
  initial: { opacity: 0, y: 20 },
  animate: { opacity: 1, y: 0, transition: { duration: 0.5, delay, ease: 'easeOut' } },
})

// ─── Helpers ────────────────────────────────────────────────────────────────

const statusColors: Record<string, string> = {
  pending: 'bg-yellow-100 text-yellow-800 border-yellow-200 dark:bg-yellow-900/30 dark:text-yellow-400 dark:border-yellow-800/50',
  in_progress: 'bg-blue-100 text-blue-800 border-blue-200 dark:bg-blue-900/30 dark:text-blue-400 dark:border-blue-800/50',
  completed: 'bg-emerald-100 text-emerald-800 border-emerald-200 dark:bg-emerald-900/30 dark:text-emerald-400 dark:border-emerald-800/50',
  cancelled: 'bg-red-100 text-red-800 border-red-200 dark:bg-red-900/30 dark:text-red-400 dark:border-red-800/50',
}

const statusLabels: Record<string, string> = {
  pending: 'Pending',
  in_progress: 'In Progress',
  completed: 'Completed',
  cancelled: 'Cancelled',
}

// ─── Skeletons ──────────────────────────────────────────────────────────────
function StatSkeleton() {
  return (
    <Card>
      <CardContent className="p-5">
        <div className="flex items-center justify-between">
          <div className="space-y-2.5">
            <Skeleton className="h-4 w-28" />
            <Skeleton className="h-8 w-20" />
            <Skeleton className="h-3 w-20" />
          </div>
          <Skeleton className="size-12 rounded-xl" />
        </div>
      </CardContent>
    </Card>
  )
}

function TableSkeleton() {
  return (
    <Card>
      <CardHeader>
        <Skeleton className="h-6 w-40" />
      </CardHeader>
      <CardContent>
        <div className="space-y-3">
          {Array.from({ length: 5 }).map((_, i) => (
            <Skeleton key={i} className="h-12 w-full" />
          ))}
        </div>
      </CardContent>
    </Card>
  )
}

function DonutSkeleton() {
  return (
    <Card>
      <CardContent className="p-6">
        <div className="flex flex-col sm:flex-row items-center gap-6">
          <Skeleton className="size-40 rounded-full" />
          <div className="flex-1 space-y-3 w-full">
            {Array.from({ length: 4 }).map((_, i) => (
              <Skeleton key={i} className="h-6 w-full" />
            ))}
          </div>
        </div>
      </CardContent>
    </Card>
  )
}

// ─── Stat Card Component ────────────────────────────────────────────────────
interface StatCardProps {
  label: string
  value: string | number
  subLabel: string
  icon: React.ReactNode
  gradientFrom: string
  gradientTo: string
  iconBg: string
  trend?: { value: number; label: string }
  sparklineData?: number[]
}

function StatCard({ label, value, subLabel, icon, gradientFrom, gradientTo, iconBg, trend, sparklineData }: StatCardProps) {
  const isPositive = (trend?.value ?? 0) >= 0
  const maxSparkline = Math.max(...(sparklineData || [1]))
  return (
    <motion.div variants={item} whileHover={{ scale: 1.02 }} transition={{ duration: 0.2 }}>
      <Card className="rounded-xl border-0 shadow-sm hover:shadow-lg hover:shadow-black/5 ring-1 ring-border/50 transition-all duration-300 overflow-hidden cursor-default">
        <div className={cn('absolute inset-0 opacity-[0.04] bg-gradient-to-br', gradientFrom, gradientTo)} />
        <CardContent className="p-5 relative">
          <div className="flex items-center justify-between">
            <div className="space-y-1.5">
              <div className="flex items-center gap-2">
                <p className="text-sm font-medium text-muted-foreground">{label}</p>
                {trend && (
                  <span className={cn(
                    'inline-flex items-center gap-0.5 text-[11px] font-semibold px-1.5 py-0.5 rounded-full',
                    isPositive ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400' : 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400'
                  )}>
                    {isPositive ? <ArrowUpRight className="size-3" /> : <TrendingDown className="size-3" />}
                    {isPositive ? '+' : ''}{trend.value}%
                  </span>
                )}
              </div>
              <p className="text-2xl font-bold tracking-tight">{value}</p>
              <p className="text-xs text-muted-foreground">{subLabel}</p>
            </div>
            <div className={cn('size-12 rounded-xl flex items-center justify-center shadow-sm', iconBg)}>
              {icon}
            </div>
          </div>
          {sparklineData && sparklineData.length > 0 && (
            <div className="mt-3 flex items-end gap-[3px] h-6">
              {sparklineData.map((v, i) => (
                <div
                  key={i}
                  className="flex-1 rounded-full bg-current transition-all duration-300"
                  style={{
                    height: `${Math.max(15, (v / maxSparkline) * 100)}%`,
                    opacity: 0.15 + (i / sparklineData.length) * 0.55,
                    color: isPositive ? '#22c55e' : '#ef4444',
                  }}
                />
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </motion.div>
  )
}

// ─── Donut Chart Component ──────────────────────────────────────────────────
interface DonutChartProps {
  total: number
  segments: { label: string; value: number; color: string; icon: React.ReactNode }[]
}

function DonutChart({ total, segments }: DonutChartProps) {
  if (total === 0) {
    return (
      <div className="size-40 rounded-full bg-muted flex items-center justify-center">
        <span className="text-sm text-muted-foreground">No trips</span>
      </div>
    )
  }

  let gradientParts: string[] = []
  let currentDeg = 0

  for (const seg of segments) {
    const startDeg = currentDeg
    const endDeg = currentDeg + (seg.value / total) * 360
    gradientParts.push(`${seg.color} ${startDeg}deg ${endDeg}deg`)
    currentDeg = endDeg
  }

  return (
    <div className="relative size-40 flex-shrink-0">
      <div
        className="size-40 rounded-full"
        style={{ background: `conic-gradient(${gradientParts.join(', ')})` }}
      />
      <div className="absolute inset-0 flex items-center justify-center">
        <div className="size-24 rounded-full bg-white dark:bg-slate-800 shadow-inner flex flex-col items-center justify-center">
          <span className="text-2xl font-bold">{total}</span>
          <span className="text-[10px] text-muted-foreground uppercase tracking-wider">Total</span>
        </div>
      </div>
    </div>
  )
}

// ─── Main Dashboard Page ────────────────────────────────────────────────────
export default function DashboardPage() {
  const { setCurrentView } = useAppStore()
  const [detailDriverId, setDetailDriverId] = useState<string | null>(null)
  const [detailDriverName, setDetailDriverName] = useState<string | undefined>(undefined)
  const { data, isLoading, error, refetch } = useQuery<DashboardData>({
    queryKey: ['dashboard'],
    queryFn: async () => {
      const res = await fetch('/api/dashboard')
      if (!res.ok) throw new Error('Failed to fetch dashboard data')
      return res.json()
    },
  })

  const now = new Date()

  if (error) {
    return (
      <div className="flex flex-col items-center justify-center h-[60vh] gap-4">
        <AlertCircle className="size-12 text-destructive" />
        <p className="text-muted-foreground">Failed to load dashboard data</p>
        <Button variant="outline" onClick={() => refetch()}>
          <RefreshCw className="size-4" />
          Try Again
        </Button>
      </div>
    )
  }

  return (
    <div className="p-4 md:p-6 space-y-6">
      {/* ── Welcome Banner ─────────────────────────────────────────────── */}
      <motion.div
        {...fadeUp(0)}
        className="relative overflow-hidden rounded-2xl bg-gradient-to-r from-emerald-600 via-teal-600 to-cyan-600 p-6 md:p-8 text-white"
      >
        {/* Grid pattern background */}
        <div className="absolute inset-0 bg-[url('data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iNjAiIGhlaWdodD0iNjAiIHhtbG5zPSJodHRwOi8vd3d3LnczLm9yZy8yMDAwL3N2ZyI+PGRlZnM+PHBhdHRlcm4gaWQ9ImdyaWQiIHdpZHRoPSI2MCIgaGVpZ2h0PSI2MCIgcGF0dGVyblVuaXRzPSJ1c2VyU3BhY2VPblVzZSI+PHBhdGggZD0iTSA2MCAwIEwgMCAwIDAgNjAiIGZpbGw9Im5vbmUiIHN0cm9rZT0icmdiYSgyNTUsMjU1LDI1NSwwLjA4KSIgc3Ryb2tlLXdpZHRoPSIxIi8+PC9wYXR0ZXJuPjwvZGVmcz48cmVjdCB3aWR0aD0iMTAwJSIgaGVpZ2h0PSIxMDAlIiBmaWxsPSJ1cmwoI2dyaWQpIi8+PC9zdmc+')] opacity-50" />
        {/* Decorative circles */}
        <div className="absolute top-0 right-0 w-64 h-64 bg-white/10 rounded-full -translate-y-1/2 translate-x-1/3" />
        <div className="absolute bottom-0 left-1/3 w-32 h-32 bg-white/5 rounded-full translate-y-1/2" />
        {/* Shimmer sweep effect - every 5 seconds */}
        <div
          className="absolute inset-0 pointer-events-none"
          style={{
            background: 'linear-gradient(90deg, transparent 0%, rgba(255,255,255,0.08) 40%, rgba(255,255,255,0.15) 50%, rgba(255,255,255,0.08) 60%, transparent 100%)',
            animation: 'shimmer-slide 1.2s ease-in-out 5s infinite',
          }}
        />
        <div className="relative z-10 flex flex-col md:flex-row md:items-center md:justify-between gap-4">
          <div>
            <div className="flex items-center gap-2.5">
              <h1 className="text-2xl md:text-3xl font-bold">Dashboard</h1>
              {/* Live indicator dot */}
              <span className="relative flex size-2.5">
                <span className="absolute inset-0 rounded-full bg-emerald-300 animate-ping opacity-75" />
                <span className="relative rounded-full size-2.5 bg-emerald-300" />
              </span>
            </div>
            <h2 className="text-xl md:text-2xl font-semibold text-white/90 mt-0.5">Welcome to iFleetPro</h2>
            <p className="text-emerald-100 mt-1">
              {format(now, 'EEEE, MMMM d, yyyy')} — Here&apos;s your fleet overview
            </p>
            {/* Quick stat pills */}
            {!isLoading && data && (
              <div className="flex flex-wrap gap-2 mt-3">
                <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-white/15 text-sm font-medium backdrop-blur-sm">
                  <UserCheck className="size-3.5 text-emerald-200" />
                  {data.drivers.active} Active Drivers
                </span>
                <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-white/15 text-sm font-medium backdrop-blur-sm">
                  <Truck className="size-3.5 text-blue-200" />
                  {data.trucks.active} Trucks Available
                </span>
                <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-white/15 text-sm font-medium backdrop-blur-sm">
                  <DollarSign className="size-3.5 text-amber-200" />
                  {formatCurrency(data.revenue.thisMonth)} Revenue Today
                </span>
              </div>
            )}
          </div>
          <div className="flex gap-2 flex-shrink-0">
            <Button
              variant="outline"
              size="sm"
              className="border-white/40 text-white hover:bg-white/10 bg-transparent"
              onClick={async () => {
                try {
                  const res = await fetch('/api/export/financial')
                  if (!res.ok) throw new Error('Failed to fetch data')
                  const data = await res.json()
                  exportToCSV(data, `financial-summary-${new Date().toISOString().split('T')[0]}`)
                  toast.success('Financial summary exported successfully')
                } catch {
                  toast.error('Failed to export financial summary')
                }
              }}
            >
              <Download className="size-4" />
              Export Report
            </Button>
            <Button
              onClick={() => setCurrentView('trips')}
              size="sm"
              className="bg-white text-emerald-700 hover:bg-emerald-50 shadow-md"
            >
              <Plus className="size-4" />
              New Trip
            </Button>
            <Button
              variant="outline"
              onClick={() => setCurrentView('drivers')}
              size="sm"
              className="border-white/40 text-white hover:bg-white/10 bg-transparent"
            >
              <UserPlus className="size-4" />
              Add Driver
            </Button>
          </div>
        </div>
      </motion.div>

      {/* ── Stat Cards (6 in 3×2) ─────────────────────────────────────── */}
      <motion.div
        variants={container}
        initial="hidden"
        animate="show"
        className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4"
        data-tour="dashboard"
      >
        {isLoading ? (
          Array.from({ length: 6 }).map((_, i) => <StatSkeleton key={i} />)
        ) : data ? (
          <>
            <StatCard
              label="Total Drivers"
              value={`${data.drivers.active}/${data.drivers.total} active`}
              subLabel={`${data.drivers.total} registered`}
              icon={<Users className="size-6" />}
              gradientFrom="from-emerald-500"
              gradientTo="to-green-500"
              iconBg="bg-emerald-100 text-emerald-600 dark:bg-emerald-900/40 dark:text-emerald-400"
              trend={{ value: 12, label: 'vs last month' }}
              sparklineData={[3, 5, 4, 6, 5, 7, 8]}
            />
            <StatCard
              label="Active Trucks"
              value={`${data.trucks.active} / ${data.trucks.total}`}
              subLabel="on the road"
              icon={<Truck className="size-6" />}
              gradientFrom="from-blue-500"
              gradientTo="to-sky-500"
              iconBg="bg-blue-100 text-blue-600 dark:bg-blue-900/40 dark:text-blue-400"
              trend={{ value: -3, label: 'vs last month' }}
              sparklineData={[5, 4, 5, 3, 4, 3, 3]}
            />
            <StatCard
              label="Active Trips"
              value={data.trips.inProgress.toLocaleString()}
              subLabel="currently in progress"
              icon={<Route className="size-6" />}
              gradientFrom="from-amber-500"
              gradientTo="to-yellow-500"
              iconBg="bg-amber-100 text-amber-600 dark:bg-amber-900/40 dark:text-amber-400"
              trend={{ value: 8, label: 'vs last week' }}
              sparklineData={[2, 3, 1, 4, 2, 5, 4]}
            />
            <StatCard
              label="Completed Trips"
              value={data.trips.completed.toLocaleString()}
              subLabel={`out of ${data.trips.total} total`}
              icon={<CheckCircle2 className="size-6" />}
              gradientFrom="from-green-500"
              gradientTo="to-emerald-500"
              iconBg="bg-green-100 text-green-600 dark:bg-green-900/40 dark:text-green-400"
              trend={{ value: 15, label: 'vs last month' }}
              sparklineData={[8, 12, 10, 15, 14, 18, 20]}
            />
            <StatCard
              label="Monthly Revenue"
              value={formatCurrency(data.revenue.thisMonth)}
              subLabel={`${data.tripsThisMonth} trips this month`}
              icon={<TrendingUp className="size-6" />}
              gradientFrom="from-purple-500"
              gradientTo="to-violet-500"
              iconBg="bg-purple-100 text-purple-600 dark:bg-purple-900/40 dark:text-purple-400"
              trend={{ value: 22, label: 'vs last month' }}
              sparklineData={[15, 18, 12, 25, 20, 28, 30]}
            />
            <StatCard
              label="Pending Cash Advances"
              value={formatCurrency(data.cashAdvances.pending)}
              subLabel={`of ₵${data.cashAdvances.total.toLocaleString()} total`}
              icon={<Banknote className="size-6" />}
              gradientFrom="from-orange-500"
              gradientTo="to-amber-500"
              iconBg="bg-orange-100 text-orange-600 dark:bg-orange-900/40 dark:text-orange-400"
              trend={{ value: -5, label: 'vs last week' }}
              sparklineData={[8, 6, 7, 5, 6, 4, 4]}
            />
          </>
        ) : null}
      </motion.div>

      {/* ── KPI Metric Cards ───────────────────────────────────────────── */}
      <motion.div
        {...fadeUp(0.3)}
      >
        <KpiCards />
      </motion.div>

      {/* ── Trip Status Distribution + Revenue Overview ────────────────── */}
      <div className="grid grid-cols-1 lg:grid-cols-5 gap-4">
        {/* Trip Status Donut + Legend */}
        <motion.div {...fadeUp(0.35)} className="lg:col-span-3">
          {isLoading ? (
            <DonutSkeleton />
          ) : data ? (
            <Card className="rounded-xl border-0 shadow-sm ring-1 ring-border/50">
              <CardHeader className="pb-2">
                <CardTitle className="text-lg font-semibold">Trip Status Distribution</CardTitle>
              </CardHeader>
              <CardContent className="p-6">
                <div className="flex flex-col sm:flex-row items-center gap-6">
                  <DonutChart
                    total={data.trips.total}
                    segments={[
                      { label: 'Pending', value: data.trips.pending, color: '#eab308', icon: <Clock className="size-4" /> },
                      { label: 'In Progress', value: data.trips.inProgress, color: '#3b82f6', icon: <Route className="size-4" /> },
                      { label: 'Completed', value: data.trips.completed, color: '#22c55e', icon: <CheckCircle2 className="size-4" /> },
                      { label: 'Cancelled', value: data.trips.cancelled, color: '#ef4444', icon: <XCircle className="size-4" /> },
                    ]}
                  />
                  <div className="flex-1 space-y-3 w-full">
                    {[
                      { label: 'Pending', value: data.trips.pending, color: 'bg-yellow-500', textColor: 'text-yellow-700 dark:text-yellow-400', bg: 'bg-yellow-50 dark:bg-yellow-900/30', icon: <Clock className="size-4 text-yellow-600 dark:text-yellow-400" /> },
                      { label: 'In Progress', value: data.trips.inProgress, color: 'bg-blue-500', textColor: 'text-blue-700 dark:text-blue-400', bg: 'bg-blue-50 dark:bg-blue-900/30', icon: <Route className="size-4 text-blue-600 dark:text-blue-400" /> },
                      { label: 'Completed', value: data.trips.completed, color: 'bg-emerald-500', textColor: 'text-emerald-700 dark:text-emerald-400', bg: 'bg-emerald-50 dark:bg-emerald-900/30', icon: <CheckCircle2 className="size-4 text-emerald-600 dark:text-emerald-400" /> },
                      { label: 'Cancelled', value: data.trips.cancelled, color: 'bg-red-500', textColor: 'text-red-700 dark:text-red-400', bg: 'bg-red-50 dark:bg-red-900/30', icon: <XCircle className="size-4 text-red-600 dark:text-red-400" /> },
                    ].map((seg) => (
                      <div key={seg.label} className="flex items-center gap-3">
                        <div className={cn('size-8 rounded-lg flex items-center justify-center', seg.bg)}>
                          {seg.icon}
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center justify-between mb-1">
                            <span className="text-sm font-medium">{seg.label}</span>
                            <span className={cn('text-sm font-bold', seg.textColor)}>{seg.value}</span>
                          </div>
                          <div className="w-full h-2 bg-muted rounded-full overflow-hidden">
                            <motion.div
                              className={cn('h-full rounded-full', seg.color)}
                              initial={{ width: 0 }}
                              animate={{ width: `${data.trips.total > 0 ? (seg.value / data.trips.total) * 100 : 0}%` }}
                              transition={{ duration: 0.8, delay: 0.5, ease: 'easeOut' }}
                            />
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              </CardContent>
            </Card>
          ) : null}
        </motion.div>

        {/* Revenue Overview */}
        <motion.div {...fadeUp(0.4)} className="lg:col-span-2">
          {isLoading ? (
            <Card>
              <CardContent className="p-6 space-y-4">
                {Array.from({ length: 4 }).map((_, i) => (
                  <Skeleton key={i} className="h-16 w-full rounded-lg" />
                ))}
              </CardContent>
            </Card>
          ) : data ? (
            <Card className="rounded-xl border-0 shadow-sm h-full ring-1 ring-border/50">
              <CardHeader className="pb-2">
                <CardTitle className="text-lg font-semibold">Revenue Overview</CardTitle>
              </CardHeader>
              <CardContent className="p-4 space-y-3">
                <div className="bg-gradient-to-br from-purple-50 to-violet-50 dark:from-purple-950/40 dark:to-violet-950/40 rounded-xl p-4">
                  <div className="flex items-center gap-3">
                    <div className="size-10 rounded-lg bg-purple-100 dark:bg-purple-900/40 flex items-center justify-center">
                      <TrendingUp className="size-5 text-purple-600 dark:text-purple-400" />
                    </div>
                    <div>
                      <p className="text-xs text-muted-foreground">Total Revenue</p>
                      <p className="text-xl font-bold">{formatCurrency(data.revenue.total)}</p>
                    </div>
                  </div>
                </div>
                <div className="bg-gradient-to-br from-blue-50 to-sky-50 dark:from-blue-950/40 dark:to-sky-950/40 rounded-xl p-4">
                  <div className="flex items-center gap-3">
                    <div className="size-10 rounded-lg bg-blue-100 dark:bg-blue-900/40 flex items-center justify-center">
                      <DollarSign className="size-5 text-blue-600 dark:text-blue-400" />
                    </div>
                    <div>
                      <p className="text-xs text-muted-foreground">This Month</p>
                      <p className="text-xl font-bold">{formatCurrency(data.revenue.thisMonth)}</p>
                    </div>
                  </div>
                </div>
                <Separator />
                <div className="space-y-2.5 pt-1">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <Wallet className="size-4 text-muted-foreground" />
                      <span className="text-sm text-muted-foreground">Cash Advances</span>
                    </div>
                    <span className="text-sm font-semibold">{formatCurrency(data.cashAdvances.total)}</span>
                  </div>
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <Clock className="size-4 text-orange-500" />
                      <span className="text-sm text-muted-foreground">Pending Advances</span>
                    </div>
                    <span className="text-sm font-semibold text-orange-600">{formatCurrency(data.cashAdvances.pending)}</span>
                  </div>
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <Gift className="size-4 text-purple-500" />
                      <span className="text-sm text-muted-foreground">Incentives</span>
                    </div>
                    <span className="text-sm font-semibold">{formatCurrency(data.incentives.total)}</span>
                  </div>
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <Clock className="size-4 text-yellow-500" />
                      <span className="text-sm text-muted-foreground">Pending Incentives</span>
                    </div>
                    <span className="text-sm font-semibold text-yellow-600">{formatCurrency(data.incentives.pending)}</span>
                  </div>
                </div>
              </CardContent>
            </Card>
          ) : null}
        </motion.div>
      </div>

      {/* ── Revenue Chart + Driver Leaderboard ──────────────────────────── */}
      <div className="grid grid-cols-1 lg:grid-cols-5 gap-4">
        <motion.div {...fadeUp(0.45)} className="lg:col-span-3">
          <RevenueChart />
        </motion.div>
        <motion.div {...fadeUp(0.5)} className="lg:col-span-2">
          <DriverLeaderboard />
        </motion.div>
      </div>

      {/* ── Driver Performance Scorecard + Activity Feed ───────────────── */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <motion.div {...fadeUp(0.55)} className="lg:col-span-2">
          <DriverPerformanceCards />
        </motion.div>
        <motion.div {...fadeUp(0.6)}>
          <ActivityFeed />
        </motion.div>
      </div>

      {/* ── Recent Trips Table ─────────────────────────────────────────── */}
      <motion.div {...fadeUp(0.55)}>
        {isLoading ? (
          <TableSkeleton />
        ) : data ? (
          <Card className="rounded-xl border-0 shadow-sm ring-1 ring-border/50">
            <CardHeader className="flex flex-row items-center justify-between">
              <CardTitle className="text-lg font-semibold">Recent Trips</CardTitle>
              <Button
                variant="ghost"
                size="sm"
                className="text-emerald-600 hover:text-emerald-700 hover:bg-emerald-50 dark:text-emerald-400 dark:hover:text-emerald-300 dark:hover:bg-emerald-900/30"
                onClick={() => setCurrentView('trips')}
              >
                View All
                <ArrowRight className="size-4 ml-1" />
              </Button>
            </CardHeader>
            <CardContent className="px-0">
              {data.recentTrips && data.recentTrips.length > 0 ? (
                <div className="overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow className="hover:bg-transparent">
                        <TableHead className="pl-6">Trip #</TableHead>
                        <TableHead>Driver</TableHead>
                        <TableHead className="hidden md:table-cell">Route</TableHead>
                        <TableHead>Status</TableHead>
                        <TableHead className="hidden sm:table-cell">Date</TableHead>
                        <TableHead className="text-right pr-6">Amount</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {data.recentTrips.map((trip) => (
                        <TableRow key={trip.id} className="cursor-pointer hover:bg-muted/50">
                          <TableCell className="pl-6 font-medium">{trip.tripNumber}</TableCell>
                          <TableCell>
                            <div className="flex items-center gap-2">
                              <DriverAvatar name={trip.driver?.driverName} size="sm" />
                              <span
                                className="font-medium cursor-pointer hover:text-emerald-600 dark:hover:text-emerald-400 transition-colors"
                                onClick={(e) => { e.stopPropagation(); if (trip.driver?.id) { setDetailDriverId(trip.driver.id); setDetailDriverName(trip.driver?.driverName) } }}
                              >
                                {trip.driver?.driverName ?? 'Unassigned'}
                              </span>
                            </div>
                          </TableCell>
                          <TableCell className="hidden md:table-cell text-muted-foreground text-sm max-w-[200px] truncate">
                            {trip.originAddress} → {trip.destinationAddress}
                          </TableCell>
                          <TableCell>
                            <Badge variant="outline" className={cn('text-xs', statusColors[trip.status] || '')}>
                              {statusLabels[trip.status] ?? trip.status}
                            </Badge>
                          </TableCell>
                          <TableCell className="hidden sm:table-cell text-muted-foreground text-sm">
                            {trip.departureDate
                              ? format(new Date(trip.departureDate), 'MMM d, yyyy')
                              : '—'}
                          </TableCell>
                          <TableCell className="text-right pr-6 font-semibold">
                            {formatCurrency(trip.totalAmount)}
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              ) : (
                <div className="flex flex-col items-center justify-center py-12 text-muted-foreground">
                  <motion.div animate={{ y: [0, -8, 0] }} transition={{ duration: 3, repeat: Infinity, ease: 'easeInOut' }}>
                    <Route className="size-10 mb-3 opacity-40" />
                  </motion.div>
                  <p className="text-sm">No trips yet</p>
                  <Button
                    variant="outline"
                    size="sm"
                    className="mt-3"
                    onClick={() => setCurrentView('trips')}
                  >
                    Create Your First Trip
                  </Button>
                </div>
              )}
            </CardContent>
          </Card>
        ) : null}
      </motion.div>

      {/* ── Quick Actions ──────────────────────────────────────────────── */}
      <motion.div {...fadeUp(0.65)}>
        <Card className="rounded-xl border-0 shadow-sm ring-1 ring-border/50">
          <CardHeader>
            <CardTitle className="text-lg font-semibold">Quick Actions</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              {[
                { label: 'New Trip', view: 'trips' as const, icon: <Plus className="size-5" />, color: 'bg-emerald-50 text-emerald-600 hover:bg-emerald-100 dark:bg-emerald-900/30 dark:text-emerald-400 dark:hover:bg-emerald-900/50' },
                { label: 'Add Driver', view: 'drivers' as const, icon: <UserPlus className="size-5" />, color: 'bg-blue-50 text-blue-600 hover:bg-blue-100 dark:bg-blue-900/30 dark:text-blue-400 dark:hover:bg-blue-900/50' },
                { label: 'Add Truck', view: 'trucks' as const, icon: <Truck className="size-5" />, color: 'bg-amber-50 text-amber-600 hover:bg-amber-100 dark:bg-amber-900/30 dark:text-amber-400 dark:hover:bg-amber-900/50' },
                { label: 'Cash Advance', view: 'cash-advances' as const, icon: <DollarSign className="size-5" />, color: 'bg-purple-50 text-purple-600 hover:bg-purple-100 dark:bg-purple-900/30 dark:text-purple-400 dark:hover:bg-purple-900/50' },
              ].map((action) => (
                <Button
                  key={action.label}
                  variant="outline"
                  className={cn('h-auto py-4 flex-col gap-2 border-0 transition-all duration-200 shadow-sm hover:shadow-md', action.color)}
                  onClick={() => setCurrentView(action.view)}
                >
                  {action.icon}
                  <span className="text-xs font-medium">{action.label}</span>
                </Button>
              ))}
            </div>
          </CardContent>
        </Card>
      </motion.div>

      {/* Driver Detail Sheet */}
      <DriverDetailSheet
        driverId={detailDriverId}
        driverName={detailDriverName}
        open={!!detailDriverId}
        onOpenChange={(open) => { if (!open) setDetailDriverId(null) }}
      />
    </div>
  )
}
