'use client'

import * as React from 'react'
import { motion } from 'framer-motion'
import { Truck, Route, DollarSign, Receipt, Clock, AlertTriangle, ArrowRight, AlertCircle, RefreshCw, Fuel, Gauge } from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { StatsCard } from '@/components/ui/stats-card'
import { StatusBadge } from '@/components/ui/status-badge'
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
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend,
  PieChart, Pie, Cell,
} from 'recharts'
import { CURRENCY_SYMBOL } from '@/lib/constants'
import { fetchDashboard, type DashboardStats, type DashboardTrip } from '@/lib/api'
import { FleetHealthWidget } from '@/components/dashboard/FleetHealthWidget'
import { MAINTENANCE_TYPES } from '@/lib/constants'
import { ActivityFeed } from '@/components/dashboard/ActivityFeed'
import { TripDetailSheet } from '@/components/trips/TripDetailSheet'
import { useAuthStore } from '@/lib/store/auth'

interface DashboardViewProps {
  onNavigate?: (page: string) => void
}

// Unique colors for every known trip status — visually distinct hues
const STATUS_COLORS: Record<string, string> = {
  scheduled:         '#0ea5e9', // sky blue
  loading:           '#f59e0b', // amber
  loaded:            '#d97706', // dark amber
  waiting_at_depot:  '#6366f1', // indigo
  departed_depot:    '#3b82f6', // blue
  in_transit:        '#10b981', // emerald
  arrived_destination:'#06b6d4', // cyan
  waiting_to_offload:'#14b8a6', // teal
  offloading:        '#8b5cf6', // violet
  offloaded:         '#a855f7', // purple
  return_journey:    '#ec4899', // pink
  arrived_depot:     '#f43f5e', // rose
  completed:         '#22c55e', // green (success)
  cancelled:         '#ef4444', // red
}

// Fallback palette for any status not in the map
const FALLBACK_COLORS = [
  '#84cc16', '#22d3ee', '#f472b6', '#a78bfa',
  '#fb923c', '#34d399', '#fbbf24', '#818cf8',
  '#f87171', '#2dd4bf', '#c084fc', '#fcd34d',
]

// Generate a deterministic color for unknown statuses
function getStatusColor(status: string, index: number): string {
  if (STATUS_COLORS[status]) return STATUS_COLORS[status]
  return FALLBACK_COLORS[index % FALLBACK_COLORS.length]
}

const containerVariants = {
  show: {
    transition: { staggerChildren: 0.06 },
  },
}

const itemVariants = {
  show: { opacity: 1, y: 0 },
}

export function DashboardView({ onNavigate }: DashboardViewProps) {
  const [data, setData] = React.useState<DashboardStats | null>(null)
  const [loading, setLoading] = React.useState(true)
  const [error, setError] = React.useState<string | null>(null)

  // Trip detail sheet state (from Recent Trips / Active Trips clicks)
  const [detailTrip, setDetailTrip] = React.useState<DashboardTrip | null>(null)
  const [detailOpen, setDetailOpen] = React.useState(false)

  const isFinancialUser = useAuthStore((s) => s.canSeeFinancialData())

  const openTripDetail = React.useCallback((trip: DashboardTrip) => {
    setDetailTrip(trip)
    setDetailOpen(true)
  }, [])

  const loadDashboard = React.useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const result = await fetchDashboard()
      setData(result)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load dashboard')
    } finally {
      setLoading(false)
    }
  }, [])

  React.useEffect(() => {
    loadDashboard()
  }, [loadDashboard])

  // Fire-and-forget: warm up the background scheduler on dashboard mount
  React.useEffect(() => {
    fetch('/api/scheduler/warmup').catch(() => {
      // Silently ignore — scheduler warmup is non-critical
    })
  }, [])

  const revenueExpenseData = React.useMemo(() => {
    if (!data?.monthlyData) return []
    return data.monthlyData.map(m => ({
      month: m.month,
      revenue: m.revenue,
      expenses: m.expenses,
      fuelCost: m.fuelCost || 0,
    }))
  }, [data])

  // Calculate avg fuel efficiency from monthly data
  const avgFuelEfficiency = React.useMemo(() => {
    if (!data?.monthlyData || data.monthlyData.length === 0) return null
    // Get latest month with both fuel liters and some trips for distance context
    const latestFuelEntries = data.monthlyData[data.monthlyData.length - 1]?.fuelEntries || 0
    const latestFuelLiters = data.monthlyData[data.monthlyData.length - 1]?.fuelLiters || 0
    if (latestFuelEntries === 0 || latestFuelLiters === 0) return null
    // Use the dashboard-level avg cost/liter as a proxy indicator
    // Real efficiency requires trip mileage data — we show the cost metric
    return data.monthlyAvgCostPerLiter || null
  }, [data])

  const tripStatusData = React.useMemo(() => {
    if (!data?.tripStatusDistribution) return []
    return data.tripStatusDistribution.map((s, index) => ({
      name: s.status.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase()),
      value: s.count,
      color: getStatusColor(s.status, index),
    }))
  }, [data])

  const activeTransitTrips = React.useMemo(() => {
    if (!data?.activeTrips) return []
    return data.activeTrips
  }, [data])

  const recentTrips = React.useMemo(() => {
    if (!data?.recentTrips) return []
    return data.recentTrips
  }, [data])

  const upcomingMaintenance = React.useMemo(() => {
    if (!data?.upcomingMaintenance) return []
    return data.upcomingMaintenance
  }, [data])

  const kpiTrends = React.useMemo(() => {
    if (!data?.monthlyData || data.monthlyData.length < 2) {
      return { revenueTrend: 0, expensesTrend: 0, fuelTrend: 0 }
    }
    const sorted = [...data.monthlyData].sort((a, b) => b.monthIndex - a.monthIndex)
    const current = sorted[0]
    const previous = sorted[1]

    const revenueTrend = previous.revenue > 0
      ? Math.round(((current.revenue - previous.revenue) / previous.revenue) * 100)
      : current.revenue > 0 ? 100 : 0

    const expensesTrend = previous.expenses > 0
      ? Math.round(((current.expenses - previous.expenses) / previous.expenses) * 100)
      : current.expenses > 0 ? 100 : 0

    const fuelTrend = previous.fuelCost > 0
      ? Math.round(((current.fuelCost - previous.fuelCost) / previous.fuelCost) * 100)
      : current.fuelCost > 0 ? 100 : 0

    return { revenueTrend, expensesTrend, fuelTrend }
  }, [data])

  if (error) {
    return (
      <motion.div variants={containerVariants} animate="show" className="space-y-6">
        <div className="flex flex-col items-center justify-center py-16 text-center">
          <div className="rounded-full bg-red-100 dark:bg-red-900/30 p-4 mb-4">
            <AlertCircle className="h-8 w-8 text-red-600" />
          </div>
          <h2 className="text-lg font-semibold mb-2">Failed to load dashboard</h2>
          <p className="text-sm text-muted-foreground mb-4">{error}</p>
          <Button onClick={loadDashboard} variant="outline">
            <RefreshCw className="mr-2 h-4 w-4" />
            Try Again
          </Button>
        </div>
      </motion.div>
    )
  }

  return (
    <motion.div
      variants={containerVariants}
      animate="show"
      className="space-y-6"
    >
      {/* Page Header */}
      <motion.div variants={itemVariants}>
        <h1 className="text-2xl font-bold tracking-tight">Dashboard</h1>
        <p className="text-muted-foreground hidden md:block">Overview of your fleet operations and financial performance.</p>
      </motion.div>

      {/* Stats Cards */}
      <motion.div variants={itemVariants} className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-4 items-stretch">
        {loading ? (
          <>
            {[1, 2, 3, 4, 5, 6].map(i => (
              <Card key={i} className="h-full flex flex-col">
                <CardContent className="p-4 sm:p-6 flex flex-col flex-1">
                  <Skeleton className="h-4 w-24 mb-3" />
                  <div className="mt-auto flex flex-col gap-2">
                    <Skeleton className="h-8 w-20" />
                    <Skeleton className="h-3 w-28" />
                  </div>
                </CardContent>
              </Card>
            ))}
          </>
        ) : (
          <>
            <StatsCard
              icon={Truck}
              title="Active Trucks"
              value={data?.activeTrucks ?? 0}
              change={data?.totalTrucks ? Math.round(((data.activeTrucks || 0) / data.totalTrucks) * 100) : 0}
              changeLabel="active"
              onClick={() => onNavigate?.('trucks')}
            />
            <StatsCard
              icon={Route}
              title="Active Trips"
              value={data?.activeTrips?.length ?? 0}
              change={0}
              changeLabel="in progress"
              onClick={() => onNavigate?.('trips')}
            />
            {isFinancialUser && (
              <StatsCard
                icon={DollarSign}
                title="Revenue"
                value={`${CURRENCY_SYMBOL}${((data?.monthlyRevenue || 0) / 1000).toFixed(1)}K`}
                change={kpiTrends.revenueTrend}
                changeLabel="vs last month"
                onClick={() => onNavigate?.('analytics')}
              />
            )}
            {isFinancialUser && (
              <StatsCard
                icon={Receipt}
                title="Expenses"
                value={`${CURRENCY_SYMBOL}${((data?.monthlyExpenses || 0) / 1000).toFixed(1)}K`}
                change={kpiTrends.expensesTrend}
                changeLabel="vs last month"
                onClick={() => onNavigate?.('expenses')}
              />
            )}
            {isFinancialUser && (
              <StatsCard
                icon={Fuel}
                title="Fuel Cost"
                value={`${CURRENCY_SYMBOL}${((data?.monthlyFuelCost || 0) / 1000).toFixed(1)}K`}
                change={kpiTrends.fuelTrend}
                changeLabel={`${data?.monthlyFuelEntries || 0} fill-ups`}
                onClick={() => onNavigate?.('fuel-analytics')}
              />
            )}
            {isFinancialUser && (
              <StatsCard
                icon={Gauge}
                title="Avg Cost/Liter"
                value={data?.monthlyAvgCostPerLiter ? `${CURRENCY_SYMBOL}${data.monthlyAvgCostPerLiter.toFixed(2)}` : 'N/A'}
                change={0}
                changeLabel={`${(data?.monthlyFuelLiters || 0).toLocaleString()} L this month`}
                onClick={() => onNavigate?.('fuel-analytics')}
              />
            )}
          </>
        )}
      </motion.div>

      {/* Charts Row */}
      <motion.div variants={itemVariants} className="grid grid-cols-1 lg:grid-cols-2 gap-4 sm:gap-6">
        {/* Revenue vs Expenses */}
          {isFinancialUser && (
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Revenue vs Expenses</CardTitle>
              <CardDescription>Last 6 months financial overview</CardDescription>
            </CardHeader>
            <CardContent>
              {loading ? (
                <div className="h-[220px] md:h-[280px] w-full flex items-center justify-center">
                  <Skeleton className="h-full w-full rounded-lg" />
                </div>
              ) : (
                <div className="h-[220px] md:h-[280px] w-full">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={revenueExpenseData} margin={{ top: 5, right: 5, left: 5, bottom: 5 }}>
                      <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                      <XAxis dataKey="month" className="text-xs" tick={{ fill: 'hsl(var(--muted-foreground))' }} />
                      <YAxis className="text-xs" tick={{ fill: 'hsl(var(--muted-foreground))' }} tickFormatter={(v) => `${v / 1000}K`} />
                      <Tooltip
                        formatter={(value: number) => [`${CURRENCY_SYMBOL}${value.toLocaleString()}`, '']}
                        contentStyle={{
                          backgroundColor: 'hsl(var(--card))',
                          border: '1px solid hsl(var(--border))',
                          borderRadius: '8px',
                          fontSize: '12px',
                        }}
                      />
                      <Legend />
                      <Bar dataKey="revenue" name="Revenue" fill="#f59e0b" radius={[4, 4, 0, 0]} />
                      <Bar dataKey="fuelCost" name="Fuel Cost" fill="#f97316" radius={[4, 4, 0, 0]} />
                      <Bar dataKey="expenses" name="Expenses" fill="#ef4444" radius={[4, 4, 0, 0]} />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              )}
            </CardContent>
          </Card>
          )}

          {/* Trip Status Pie */}
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Trip Distribution</CardTitle>
              <CardDescription>Current trip statuses</CardDescription>
            </CardHeader>
            <CardContent>
              {loading ? (
                <div className="h-[220px] md:h-[280px] w-full flex items-center justify-center">
                  <Skeleton className="h-full w-full rounded-lg" />
                </div>
              ) : (
                <div className="h-[220px] md:h-[280px] w-full flex items-center justify-center">
                  <ResponsiveContainer width="100%" height="100%">
                    <PieChart>
                      <Pie
                        data={tripStatusData}
                        cx="50%"
                        cy="45%"
                        innerRadius={50}
                        outerRadius={80}
                        paddingAngle={3}
                        dataKey="value"
                      >
                        {tripStatusData.map((entry, index) => (
                          <Cell key={`cell-${index}`} fill={entry.color} />
                        ))}
                      </Pie>
                      <Tooltip
                        contentStyle={{
                          backgroundColor: 'hsl(var(--card))',
                          border: '1px solid hsl(var(--border))',
                          borderRadius: '8px',
                          fontSize: '12px',
                        }}
                      />
                      <Legend
                        verticalAlign="bottom"
                        height={36}
                        formatter={(value) => <span className="text-xs text-muted-foreground">{value}</span>}
                      />
                    </PieChart>
                  </ResponsiveContainer>
                </div>
              )}
            </CardContent>
          </Card>

      </motion.div>

      {/* Activity Feed Row */}
      <motion.div variants={itemVariants}>
        <ActivityFeed onNavigate={onNavigate} />
      </motion.div>

      {/* Fleet Health Row */}
      <motion.div variants={itemVariants}>
        <FleetHealthWidget onNavigate={onNavigate} />
      </motion.div>

      {/* Bottom Row */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 sm:gap-6 items-start">
        {/* Recent Trips */}
        <motion.div variants={itemVariants}>
          <Card>
            <CardHeader className="flex flex-row items-center justify-between gap-2">
              <div className="min-w-0">
                <CardTitle className="text-base">Recent Trips</CardTitle>
                <CardDescription>Latest trip activity</CardDescription>
              </div>
              <Button variant="ghost" size="sm" className="shrink-0 text-amber-600 dark:text-amber-400" onClick={() => onNavigate?.('trips')}>
                View All <ArrowRight className="ml-1 h-3 w-3" />
              </Button>
            </CardHeader>
            <CardContent>
              {loading ? (
                <div className="space-y-3">
                  {[1, 2, 3].map(i => (
                    <Skeleton key={i} className="h-10 w-full rounded" />
                  ))}
                </div>
              ) : (
                <>
                  {/* Desktop: Table */}
                  <div className="hidden md:block max-h-96 overflow-y-auto">
                    <Table className="[&_table]:table-fixed [&_table]:w-full">
                      <TableHeader>
                        <TableRow>
                          <TableHead className="w-[90px]">Trip #</TableHead>
                          <TableHead>Route</TableHead>
                          <TableHead>Status</TableHead>
                          {isFinancialUser && (<TableHead className="text-right w-[75px]">Revenue</TableHead>)}
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {recentTrips.slice(0, 5).map((trip) => (
                          <TableRow key={trip.id} className="cursor-pointer hover:bg-muted/50" onClick={() => openTripDetail(trip)}>
                            <TableCell className="font-medium text-xs">{trip.tripNumber}</TableCell>
                            <TableCell className="text-xs">
                              <span className="block truncate" title={`${trip.loadingLocation} → ${trip.destination}`}>
                                {trip.loadingLocation} → {trip.destination}
                              </span>
                            </TableCell>
                            <TableCell className="max-w-[120px]">
                              <span className="block truncate">
                                <StatusBadge status={trip.status} variant="trip" />
                              </span>
                            </TableCell>
                            {isFinancialUser && (
                            <TableCell className="text-right text-xs font-medium whitespace-nowrap">
                              {trip.totalRevenue ? `${CURRENCY_SYMBOL}${trip.totalRevenue.toLocaleString()}` : '-'}
                            </TableCell>
                            )}
                          </TableRow>
                        ))}
                        {recentTrips.length === 0 && (
                          <TableRow>
                            <TableCell colSpan={isFinancialUser ? 4 : 3} className="text-center text-muted-foreground text-sm py-8">
                              No recent trips
                            </TableCell>
                          </TableRow>
                        )}
                      </TableBody>
                    </Table>
                  </div>
                  {/* Mobile: Card List */}
                  <div className="md:hidden space-y-3">
                    {recentTrips.slice(0, 5).map((trip) => (
                      <div
                        key={trip.id}
                        onClick={() => openTripDetail(trip)}
                        className="rounded-lg border bg-card p-3 space-y-2 active:bg-muted/80 cursor-pointer transition-colors"
                      >
                        <div className="flex items-center justify-between gap-2">
                          <span className="text-sm font-semibold truncate">{trip.tripNumber}</span>
                          <StatusBadge status={trip.status} variant="trip" />
                        </div>
                        <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                          <Route className="h-3 w-3 shrink-0" />
                          <span className="truncate">{trip.loadingLocation} → {trip.destination}</span>
                        </div>
                        <div className="flex items-center justify-between gap-2">
                          <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                            <Truck className="h-3 w-3 shrink-0" />
                            <span>{trip.truck?.plateNumber || '-'}</span>
                          </div>
                          {isFinancialUser && trip.totalRevenue && (
                            <span className="text-xs font-semibold">{CURRENCY_SYMBOL}{trip.totalRevenue.toLocaleString()}</span>
                          )}
                        </div>
                      </div>
                    ))}
                    {recentTrips.length === 0 && (
                      <p className="text-sm text-muted-foreground text-center py-8">No recent trips</p>
                    )}
                  </div>
                </>
              )}
            </CardContent>
          </Card>
        </motion.div>

        {/* Upcoming Maintenance & Active Trips */}
        <motion.div variants={itemVariants} className="space-y-4 sm:space-y-6">
          {/* Upcoming Maintenance */}
          <Card>
            <CardHeader className="flex flex-row items-center justify-between gap-2">
              <div className="min-w-0">
                <CardTitle className="text-base">Upcoming Maintenance</CardTitle>
                <CardDescription>Scheduled service reminders</CardDescription>
              </div>
              <Button variant="ghost" size="sm" className="shrink-0 text-amber-600 dark:text-amber-400" onClick={() => onNavigate?.('maintenance')}>
                View All <ArrowRight className="ml-1 h-3 w-3" />
              </Button>
            </CardHeader>
            <CardContent>
              {loading ? (
                <div className="space-y-3">
                  {[1, 2, 3].map(i => (
                    <Skeleton key={i} className="h-12 w-full rounded" />
                  ))}
                </div>
              ) : (
                <div className="space-y-3 max-h-48 overflow-y-auto">
                  {upcomingMaintenance.length === 0 ? (
                    <p className="text-sm text-muted-foreground text-center py-4">No upcoming maintenance</p>
                  ) : (
                    upcomingMaintenance.map((m) => (
                      <div key={m.id} className="flex items-center gap-3 p-2 rounded-lg hover:bg-muted/50 transition-colors cursor-pointer min-h-[48px]" onClick={() => onNavigate?.('maintenance')}>
                        <div className="rounded-full p-1.5 bg-amber-100 dark:bg-amber-900/30">
                          <AlertTriangle className="h-3.5 w-3.5 text-amber-600 dark:text-amber-400" />
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-medium truncate">{m.title}</p>
                          <p className="text-xs text-muted-foreground">{m.truck?.plateNumber} • {m.nextDueDate ? new Date(m.nextDueDate).toLocaleDateString() : 'TBD'}</p>
                        </div>
                        <StatusBadge status={m.status} variant="maintenance" />
                      </div>
                    ))
                  )}
                </div>
              )}
            </CardContent>
          </Card>

          {/* Active Trips */}
          <Card>
            <CardHeader className="flex flex-row items-center justify-between gap-2">
              <div className="min-w-0">
                <CardTitle className="text-base">Active Trips</CardTitle>
                <CardDescription>Currently in progress</CardDescription>
              </div>
              <Badge variant="secondary" className="bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400">
                {loading ? '-' : `${activeTransitTrips.length} active`}
              </Badge>
            </CardHeader>
            <CardContent>
              {loading ? (
                <div className="space-y-3">
                  {[1, 2, 3].map(i => (
                    <Skeleton key={i} className="h-12 w-full rounded" />
                  ))}
                </div>
              ) : (
                <div className="space-y-3 max-h-48 overflow-y-auto">
                  {activeTransitTrips.length === 0 ? (
                    <p className="text-sm text-muted-foreground text-center py-4">No active trips</p>
                  ) : (
                    activeTransitTrips.map((trip) => (
                      <div key={trip.id} className="flex items-center gap-3 p-2 rounded-lg hover:bg-muted/50 transition-colors cursor-pointer min-h-[48px]" onClick={() => openTripDetail(trip)}>
                        <div className="rounded-full p-1.5 bg-emerald-100 dark:bg-emerald-900/30">
                          <Truck className="h-3.5 w-3.5 text-emerald-600 dark:text-emerald-400" />
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-medium truncate">
                            {trip.loadingLocation} → {trip.destination}
                          </p>
                          <p className="text-xs text-muted-foreground">
                            {trip.truck?.plateNumber} • {trip.driver?.firstName} {trip.driver?.lastName} • {trip.itemName}
                          </p>
                        </div>
                        <div className="flex items-center gap-1 text-xs text-muted-foreground shrink-0">
                          <Clock className="h-3 w-3" />
                          {trip.status.replace(/_/g, ' ')}
                        </div>
                      </div>
                    ))
                  )}
                </div>
              )}
            </CardContent>
          </Card>
        </motion.div>
      </div>

      {/* Trip Detail Sheet (opened from Recent Trips / Active Trips) */}
      <TripDetailSheet
        trip={detailTrip as any}
        open={detailOpen}
        onOpenChange={setDetailOpen}
      />
    </motion.div>
  )
}
