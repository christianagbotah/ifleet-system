'use client'

import * as React from 'react'
import { motion } from 'framer-motion'
import {
  Fuel,
  TrendingUp,
  TrendingDown,
  DollarSign,
  Droplets,
  Gauge,
  AlertCircle,
  RefreshCw,
  ArrowUpDown,
  BarChart3,
  PieChart as PieChartIcon,
  Building2,
  ShieldAlert,
  ChevronDown,
  ChevronUp,
} from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { StatsCard } from '@/components/ui/stats-card'
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
  LineChart, Line, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, Legend, PieChart, Pie, Cell,
} from 'recharts'
import { DatePicker } from '@/components/ui/date-picker'
import { CURRENCY_SYMBOL } from '@/lib/constants'
import { fetchFuelAnalytics, fetchTrucks, fetchFuelAnomalies, type FuelAnalyticsData, type FuelAnomalyDetection, type Truck } from '@/lib/api'

const containerVariants = {
  show: { transition: { staggerChildren: 0.04 } },
}

const itemVariants = {
  show: { opacity: 1, y: 0 },
}

const FUEL_COLORS = ['#f59e0b', '#ef4444', '#10b981', '#6366f1', '#ec4899', '#14b8a6', '#f97316', '#8b5cf6']
const PIE_COLORS = ['#f59e0b', '#3b82f6', '#ef4444', '#10b981']

const tooltipStyle = {
  backgroundColor: 'hsl(var(--card))',
  border: '1px solid hsl(var(--border))',
  borderRadius: '8px',
  fontSize: '12px',
}

function formatCurrency(amount: number): string {
  return `${CURRENCY_SYMBOL}${amount.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
}

function formatCurrencyShort(amount: number): string {
  if (amount >= 1000000) return `${CURRENCY_SYMBOL}${(amount / 1000000).toFixed(1)}M`
  if (amount >= 1000) return `${CURRENCY_SYMBOL}${(amount / 1000).toFixed(1)}K`
  return `${CURRENCY_SYMBOL}${amount.toFixed(0)}`
}

type SortKey = 'plateNumber' | 'totalLiters' | 'totalCost' | 'avgEfficiency' | 'fillCount'
type SortDir = 'asc' | 'desc'

export function FuelAnalyticsView() {
  const [data, setData] = React.useState<FuelAnalyticsData | null>(null)
  const [trucks, setTrucks] = React.useState<Truck[]>([])
  const [loading, setLoading] = React.useState(true)
  const [error, setError] = React.useState<string | null>(null)
  const [truckFilter, setTruckFilter] = React.useState('all')
  const [dateFrom, setDateFrom] = React.useState('')
  const [dateTo, setDateTo] = React.useState('')
  const [sortKey, setSortKey] = React.useState<SortKey>('totalCost')
  const [sortDir, setSortDir] = React.useState<SortDir>('desc')
  const [anomalyData, setAnomalyData] = React.useState<FuelAnomalyDetection | null>(null)
  const [anomalyLoading, setAnomalyLoading] = React.useState(true)
  const [expandedTruck, setExpandedTruck] = React.useState<string | null>(null)

  const loadAnalytics = React.useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const params: { truckId?: string; dateFrom?: string; dateTo?: string } = {}
      if (truckFilter !== 'all') params.truckId = truckFilter
      if (dateFrom) params.dateFrom = dateFrom
      if (dateTo) params.dateTo = dateTo
      const result = await fetchFuelAnalytics(params)
      setData(result)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load fuel analytics')
    } finally {
      setLoading(false)
    }
  }, [truckFilter, dateFrom, dateTo])

  React.useEffect(() => {
    loadAnalytics()
  }, [loadAnalytics])

  React.useEffect(() => {
    fetchTrucks({ status: 'active', limit: 100 })
      .then(result => setTrucks(result.data))
      .catch(() => {})
  }, [])

  React.useEffect(() => {
    setAnomalyLoading(true)
    fetchFuelAnomalies()
      .then(result => setAnomalyData(result))
      .catch(() => {})
      .finally(() => setAnomalyLoading(false))
  }, [])

  const handleSort = (key: SortKey) => {
    if (sortKey === key) {
      setSortDir(d => d === 'asc' ? 'desc' : 'asc')
    } else {
      setSortKey(key)
      setSortDir('desc')
    }
  }

  const sortedTruckData = React.useMemo(() => {
    if (!data?.byTruck) return []
    return [...data.byTruck].sort((a, b) => {
      const aVal = a[sortKey] || 0
      const bVal = b[sortKey] || 0
      if (typeof aVal === 'string' && typeof bVal === 'string') {
        return sortDir === 'asc' ? aVal.localeCompare(bVal) : bVal.localeCompare(aVal)
      }
      return sortDir === 'asc' ? (aVal as number) - (bVal as number) : (bVal as number) - (aVal as number)
    })
  }, [data?.byTruck, sortKey, sortDir])

  const SortableHeader = ({ label, sortField }: { label: string; sortField: SortKey }) => (
    <TableHead
      className="cursor-pointer select-none hover:text-amber-600 dark:hover:text-amber-400 transition-colors"
      onClick={() => handleSort(sortField)}
    >
      <div className="flex items-center gap-1">
        {label}
        <ArrowUpDown className="h-3 w-3 opacity-50" />
      </div>
    </TableHead>
  )

  if (error && !data) {
    return (
      <motion.div variants={containerVariants} animate="show" className="space-y-6">
        <div className="flex flex-col items-center justify-center py-16 text-center">
          <div className="rounded-full bg-red-100 dark:bg-red-900/30 p-4 mb-4">
            <AlertCircle className="h-8 w-8 text-red-600" />
          </div>
          <h2 className="text-lg font-semibold mb-2">Failed to load analytics</h2>
          <p className="text-sm text-muted-foreground mb-4">{error}</p>
          <Button onClick={loadAnalytics} variant="outline">
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
      className="space-y-4 sm:space-y-6"
    >
      {/* Header */}
      <motion.div variants={itemVariants} className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Fuel Analytics</h1>
          <p className="text-muted-foreground">Comprehensive fuel consumption insights and cost analysis</p>
        </div>
        <Button
          onClick={loadAnalytics}
          variant="outline"
          disabled={loading}
        >
          <RefreshCw className={`mr-2 h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
          Refresh
        </Button>
      </motion.div>

      {/* Filters */}
      <motion.div variants={itemVariants} className="flex flex-col sm:flex-row gap-3">
        <Select value={truckFilter} onValueChange={setTruckFilter}>
          <SelectTrigger className="w-full sm:w-48">
            <SelectValue placeholder="All Trucks" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Trucks</SelectItem>
            {trucks.map(truck => (
              <SelectItem key={truck.id} value={truck.id}>
                {truck.plateNumber} ({truck.make} {truck.model})
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <DatePicker value={dateFrom} onChange={(val) => setDateFrom(val)} className="w-full sm:w-40" />
        <DatePicker value={dateTo} onChange={(val) => setDateTo(val)} className="w-full sm:w-40" />
        {(truckFilter !== 'all' || dateFrom || dateTo) && (
          <Button
            variant="ghost"
            size="sm"
            onClick={() => {
              setTruckFilter('all')
              setDateFrom('')
              setDateTo('')
            }}
          >
            Clear Filters
          </Button>
        )}
      </motion.div>

      {/* KPI Cards */}
      <motion.div variants={itemVariants} className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
        {loading ? (
          <>
            {[1, 2, 3, 4].map(i => (
              <div key={i} className="rounded-lg border bg-card p-4 sm:p-6">
                <Skeleton className="h-4 w-24 mb-3" />
                <Skeleton className="h-8 w-20" />
              </div>
            ))}
          </>
        ) : data ? (
          <>
            <StatsCard
              icon={Gauge}
              title="Avg Fuel Efficiency"
              value={data.summary.avgEfficiency > 0 ? `${data.summary.avgEfficiency.toFixed(1)} km/L` : 'N/A'}
              description="fleet average"
            />
            <StatsCard
              icon={DollarSign}
              title="Total Fuel Cost"
              value={formatCurrencyShort(data.summary.totalCost)}
              change={data.monthlyTrend.length >= 2
                ? (() => {
                    const curr = data.monthlyTrend[data.monthlyTrend.length - 1]?.totalCost || 0
                    const prev = data.monthlyTrend[data.monthlyTrend.length - 2]?.totalCost || 0
                    return prev > 0 ? Math.round(((curr - prev) / prev) * 100) : 0
                  })()
                : undefined}
              changeLabel="vs last month"
            />
            <StatsCard
              icon={Fuel}
              title="Avg Cost/Liter"
              value={formatCurrency(data.summary.avgCostPerLiter)}
              description="across all fuel types"
            />
            <StatsCard
              icon={Droplets}
              title="Total Fill-ups"
              value={String(data.summary.totalFillUps)}
              description={`${data.summary.totalLiters.toLocaleString()} L total`}
            />
          </>
        ) : null}
      </motion.div>

      {/* Charts Row 1: Trend + Efficiency */}
      <motion.div variants={itemVariants} className="grid grid-cols-1 lg:grid-cols-2 gap-4 sm:gap-6">
        {/* Fuel Consumption Trend */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              <BarChart3 className="h-4 w-4 text-amber-500" />
              Fuel Consumption Trend
            </CardTitle>
            <CardDescription>Monthly liters and cost (last 6 months)</CardDescription>
          </CardHeader>
          <CardContent>
            {loading ? (
              <div className="h-[280px] w-full"><Skeleton className="h-full w-full rounded-lg" /></div>
            ) : (
              <div className="h-[280px] w-full">
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={data?.monthlyTrend || []} margin={{ top: 5, right: 5, left: 5, bottom: 5 }}>
                    <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                    <XAxis dataKey="month" className="text-xs" tick={{ fill: 'hsl(var(--muted-foreground))' }} />
                    <YAxis yAxisId="left" className="text-xs" tick={{ fill: 'hsl(var(--muted-foreground))' }} />
                    <YAxis yAxisId="right" orientation="right" className="text-xs" tick={{ fill: 'hsl(var(--muted-foreground))' }} tickFormatter={v => formatCurrencyShort(v)} />
                    <Tooltip
                      contentStyle={tooltipStyle}
                      formatter={(value: number, name: string) => [
                        name === 'Liters' ? `${value.toLocaleString()} L` : formatCurrency(value),
                        name,
                      ]}
                    />
                    <Legend />
                    <Line yAxisId="left" type="monotone" dataKey="totalLiters" name="Liters" stroke="#f59e0b" strokeWidth={2} dot={{ r: 4 }} />
                    <Line yAxisId="right" type="monotone" dataKey="totalCost" name="Cost" stroke="#ef4444" strokeWidth={2} dot={{ r: 4 }} />
                  </LineChart>
                </ResponsiveContainer>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Truck Efficiency Comparison */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              <Gauge className="h-4 w-4 text-emerald-500" />
              Truck Efficiency Comparison
            </CardTitle>
            <CardDescription>Top 10 trucks by km/L efficiency</CardDescription>
          </CardHeader>
          <CardContent>
            {loading ? (
              <div className="h-[280px] w-full"><Skeleton className="h-full w-full rounded-lg" /></div>
            ) : (
              <div className="h-[280px] w-full">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart
                    data={(data?.byTruck || [])
                      .filter(t => t.avgEfficiency > 0)
                      .sort((a, b) => b.avgEfficiency - a.avgEfficiency)
                      .slice(0, 10)
                      .map(t => ({ name: t.plateNumber, efficiency: Number(t.avgEfficiency.toFixed(1)) }))}
                    margin={{ top: 5, right: 5, left: 5, bottom: 5 }}
                    layout="vertical"
                  >
                    <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                    <XAxis type="number" className="text-xs" tick={{ fill: 'hsl(var(--muted-foreground))' }} unit=" km/L" />
                    <YAxis type="category" dataKey="name" className="text-xs" tick={{ fill: 'hsl(var(--muted-foreground))' }} width={90} />
                    <Tooltip
                      contentStyle={tooltipStyle}
                      formatter={(value: number) => [`${value} km/L`, 'Efficiency']}
                    />
                    <Bar dataKey="efficiency" name="km/L" fill="#10b981" radius={[0, 4, 4, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            )}
          </CardContent>
        </Card>
      </motion.div>

      {/* Charts Row 2: Fuel Type + Station */}
      <motion.div variants={itemVariants} className="grid grid-cols-1 lg:grid-cols-2 gap-4 sm:gap-6">
        {/* Fuel Cost by Type */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              <PieChartIcon className="h-4 w-4 text-amber-500" />
              Fuel Cost by Type
            </CardTitle>
            <CardDescription>Diesel vs Petrol cost split</CardDescription>
          </CardHeader>
          <CardContent>
            {loading ? (
              <div className="h-[280px] w-full"><Skeleton className="h-full w-full rounded-lg" /></div>
            ) : (data?.byFuelType || []).length === 0 ? (
              <div className="h-[280px] w-full flex items-center justify-center">
                <p className="text-sm text-muted-foreground">No fuel type data available</p>
              </div>
            ) : (
              <div className="h-[280px] w-full flex items-center justify-center">
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie
                      data={(data?.byFuelType || []).map((f, i) => ({
                        name: f.fuelType,
                        value: Number(f.totalCost.toFixed(0)),
                        fill: PIE_COLORS[i % PIE_COLORS.length],
                      }))}
                      cx="50%"
                      cy="45%"
                      innerRadius={50}
                      outerRadius={80}
                      paddingAngle={3}
                      dataKey="value"
                    >
                      {(data?.byFuelType || []).map((_, index) => (
                        <Cell key={`cell-${index}`} fill={PIE_COLORS[index % PIE_COLORS.length]} />
                      ))}
                    </Pie>
                    <Tooltip
                      contentStyle={tooltipStyle}
                      formatter={(value: number) => [formatCurrency(value), 'Total Cost']}
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

        {/* Station Spend Analysis */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              <Building2 className="h-4 w-4 text-violet-500" />
              Station Spend Analysis
            </CardTitle>
            <CardDescription>Top 10 fueling stations by spend</CardDescription>
          </CardHeader>
          <CardContent>
            {loading ? (
              <div className="h-[280px] w-full"><Skeleton className="h-full w-full rounded-lg" /></div>
            ) : (data?.byStation || []).length === 0 ? (
              <div className="h-[280px] w-full flex items-center justify-center">
                <p className="text-sm text-muted-foreground">No station data available</p>
              </div>
            ) : (
              <div className="h-[280px] w-full">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart
                    data={(data?.byStation || []).slice(0, 10).map(s => ({
                      name: s.stationName.length > 20 ? `${s.stationName.slice(0, 18)}...` : s.stationName,
                      fullName: s.stationName,
                      spend: Number(s.totalCost.toFixed(0)),
                    }))}
                    margin={{ top: 5, right: 5, left: 5, bottom: 5 }}
                    layout="vertical"
                  >
                    <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                    <XAxis type="number" className="text-xs" tick={{ fill: 'hsl(var(--muted-foreground))' }} tickFormatter={v => formatCurrencyShort(v)} />
                    <YAxis type="category" dataKey="name" className="text-xs" tick={{ fill: 'hsl(var(--muted-foreground))' }} width={120} />
                    <Tooltip
                      contentStyle={tooltipStyle}
                      formatter={(value: number, name: string, props: { payload?: { fullName?: string } }) => [formatCurrency(value), 'Spend']}
                      labelFormatter={(_, payload) => payload?.[0]?.payload?.fullName || _}
                    />
                    <Bar dataKey="spend" name="Spend" fill="#8b5cf6" radius={[0, 4, 4, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            )}
          </CardContent>
        </Card>
      </motion.div>

      {/* Charts Row 3: Price Trend */}
      <motion.div variants={itemVariants}>
        <Card>
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              <TrendingUp className="h-4 w-4 text-orange-500" />
              Fuel Price Trend
            </CardTitle>
            <CardDescription>Average cost per liter per month</CardDescription>
          </CardHeader>
          <CardContent>
            {loading ? (
              <div className="h-[250px] w-full"><Skeleton className="h-full w-full rounded-lg" /></div>
            ) : (
              <div className="h-[250px] w-full">
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={data?.priceTrend || []} margin={{ top: 5, right: 5, left: 5, bottom: 5 }}>
                    <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                    <XAxis dataKey="month" className="text-xs" tick={{ fill: 'hsl(var(--muted-foreground))' }} />
                    <YAxis className="text-xs" tick={{ fill: 'hsl(var(--muted-foreground))' }} tickFormatter={v => `${CURRENCY_SYMBOL}${v.toFixed(1)}`} />
                    <Tooltip
                      contentStyle={tooltipStyle}
                      formatter={(value: number) => [formatCurrency(value), 'Avg Cost/Liter']}
                    />
                    <Line type="monotone" dataKey="avgCostPerLiter" name="Avg Cost/Liter" stroke="#f97316" strokeWidth={2} dot={{ r: 4, fill: '#f97316' }} />
                  </LineChart>
                </ResponsiveContainer>
              </div>
            )}
          </CardContent>
        </Card>
      </motion.div>

      {/* Truck Fuel Table */}
      <motion.div variants={itemVariants}>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between">
            <div>
              <CardTitle className="text-base">Truck Fuel Analysis</CardTitle>
              <CardDescription>Per-truck fuel consumption and efficiency breakdown</CardDescription>
            </div>
            <Badge variant="secondary" className="bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400">
              {sortedTruckData.length} trucks
            </Badge>
          </CardHeader>
          <CardContent>
            {loading ? (
              <div className="space-y-3">
                {[1, 2, 3, 4, 5].map(i => (
                  <Skeleton key={i} className="h-12 w-full rounded" />
                ))}
              </div>
            ) : sortedTruckData.length === 0 ? (
              <p className="text-sm text-muted-foreground text-center py-8">No truck fuel data available</p>
            ) : (
              <>
                {/* Desktop Table */}
                <div className="hidden md:block overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <SortableHeader label="Truck" sortField="plateNumber" />
                        <TableHead>Type</TableHead>
                        <SortableHeader label="Liters" sortField="totalLiters" />
                        <SortableHeader label="Total Cost" sortField="totalCost" />
                        <TableHead>Avg Cost/L</TableHead>
                        <SortableHeader label="km/L" sortField="avgEfficiency" />
                        <SortableHeader label="Fill-ups" sortField="fillCount" />
                        <TableHead>Distance</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {sortedTruckData.map((truck) => (
                        <TableRow key={truck.truckId}>
                          <TableCell className="font-medium">
                            <div>
                              <p className="text-sm">{truck.plateNumber}</p>
                              <p className="text-xs text-muted-foreground">{truck.make} {truck.model}</p>
                            </div>
                          </TableCell>
                          <TableCell>
                            <Badge
                              variant="outline"
                              className={`text-xs border-transparent ${
                                truck.fuelType === 'Diesel'
                                  ? 'bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-400'
                                  : 'bg-sky-100 text-sky-700 dark:bg-sky-900/30 dark:text-sky-400'
                              }`}
                            >
                              {truck.fuelType || 'Diesel'}
                            </Badge>
                          </TableCell>
                          <TableCell className="text-sm">
                            {truck.totalLiters.toLocaleString()} L
                          </TableCell>
                          <TableCell className="text-sm font-semibold">
                            {formatCurrency(truck.totalCost)}
                          </TableCell>
                          <TableCell className="text-sm">
                            {formatCurrency(truck.avgCostPerLiter)}
                          </TableCell>
                          <TableCell className="text-sm">
                            {truck.avgEfficiency > 0 ? (
                              <span className={truck.avgEfficiency >= 4 ? 'text-emerald-600 dark:text-emerald-400 font-medium' : truck.avgEfficiency >= 2 ? 'text-amber-600 dark:text-amber-400 font-medium' : 'text-red-600 dark:text-red-400 font-medium'}>
                                {truck.avgEfficiency.toFixed(1)}
                              </span>
                            ) : (
                              <span className="text-muted-foreground">—</span>
                            )}
                          </TableCell>
                          <TableCell className="text-sm">{truck.fillCount}</TableCell>
                          <TableCell className="text-sm text-muted-foreground">
                            {truck.totalDistance > 0 ? `${(truck.totalDistance / 1000).toFixed(1)}K km` : '—'}
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>

                {/* Mobile Cards */}
                <div className="md:hidden space-y-3 max-h-96 overflow-y-auto">
                  {sortedTruckData.map((truck) => (
                    <div key={truck.truckId} className="p-3 rounded-lg border bg-card space-y-2">
                      <div className="flex items-center justify-between">
                        <div>
                          <p className="text-sm font-medium">{truck.plateNumber}</p>
                          <p className="text-xs text-muted-foreground">{truck.make} {truck.model}</p>
                        </div>
                        {truck.avgEfficiency > 0 && (
                          <Badge
                            variant="outline"
                            className={`text-xs font-medium border-transparent ${
                              truck.avgEfficiency >= 4
                                ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400'
                                : truck.avgEfficiency >= 2
                                  ? 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400'
                                  : 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400'
                            }`}
                          >
                            {truck.avgEfficiency.toFixed(1)} km/L
                          </Badge>
                        )}
                      </div>
                      <div className="grid grid-cols-3 gap-2 text-xs">
                        <div>
                          <p className="text-muted-foreground">Cost</p>
                          <p className="font-medium">{formatCurrency(truck.totalCost)}</p>
                        </div>
                        <div>
                          <p className="text-muted-foreground">Liters</p>
                          <p className="font-medium">{truck.totalLiters.toLocaleString()} L</p>
                        </div>
                        <div>
                          <p className="text-muted-foreground">Fill-ups</p>
                          <p className="font-medium">{truck.fillCount}</p>
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

      {/* Anomaly Detection */}
      <motion.div variants={itemVariants}>
        <Card className={anomalyData && anomalyData.flaggedTrucks.length > 0 ? 'border-red-200' : ''}>
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              <ShieldAlert className={`h-4 w-4 ${anomalyData && anomalyData.flaggedTrucks.length > 0 ? 'text-red-500' : 'text-emerald-500'}`} />
              Fuel Anomaly Detection
            </CardTitle>
            <CardDescription>
              Automated analysis for fuel theft, excessive consumption, and unusual patterns
            </CardDescription>
          </CardHeader>
          <CardContent>
            {anomalyLoading ? (
              <div className="space-y-3">
                {[1, 2, 3].map(i => (
                  <Skeleton key={i} className="h-16 w-full rounded" />
                ))}
              </div>
            ) : anomalyData && anomalyData.flaggedTrucks.length > 0 ? (
              <div className="space-y-4">
                {/* Summary */}
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                  <div className="rounded-lg bg-muted p-3 text-center">
                    <p className="text-2xl font-bold">{anomalyData.summary.trucksAnalyzed}</p>
                    <p className="text-xs text-muted-foreground">Trucks Analyzed</p>
                  </div>
                  <div className="rounded-lg bg-red-50 dark:bg-red-900/20 p-3 text-center">
                    <p className="text-2xl font-bold text-red-600">{anomalyData.summary.trucksFlagged}</p>
                    <p className="text-xs text-muted-foreground">Flagged</p>
                  </div>
                  <div className="rounded-lg bg-red-100 dark:bg-red-900/30 p-3 text-center">
                    <p className="text-2xl font-bold text-red-700">{anomalyData.summary.highRiskCount}</p>
                    <p className="text-xs text-muted-foreground">High Risk</p>
                  </div>
                  <div className="rounded-lg bg-amber-100 dark:bg-amber-900/30 p-3 text-center">
                    <p className="text-2xl font-bold text-amber-700">{anomalyData.summary.mediumRiskCount}</p>
                    <p className="text-xs text-muted-foreground">Medium Risk</p>
                  </div>
                </div>

                {/* Flagged Trucks */}
                <div className="space-y-2">
                  {anomalyData.flaggedTrucks.map((truck) => (
                    <div key={truck.truckId} className="rounded-lg border bg-card">
                      <button
                        className="w-full flex items-center justify-between p-3 text-left hover:bg-muted/50 transition-colors rounded-lg"
                        onClick={() => setExpandedTruck(expandedTruck === truck.truckId ? null : truck.truckId)}
                      >
                        <div className="flex items-center gap-3">
                          <div className={`rounded-full p-1.5 ${
                            truck.riskLevel === 'high' ? 'bg-red-100 dark:bg-red-900/30' :
                            truck.riskLevel === 'medium' ? 'bg-amber-100 dark:bg-amber-900/30' :
                            'bg-yellow-100 dark:bg-yellow-900/30'
                          }`}>
                            <ShieldAlert className={`h-4 w-4 ${
                              truck.riskLevel === 'high' ? 'text-red-600' :
                              truck.riskLevel === 'medium' ? 'text-amber-600' :
                              'text-yellow-600'
                            }`} />
                          </div>
                          <div>
                            <p className="text-sm font-medium">{truck.plateNumber}</p>
                            <p className="text-xs text-muted-foreground">
                              {truck.make} {truck.model} &middot; {truck.anomalyCount} anomal{truck.anomalyCount !== 1 ? 'ies' : 'y'}
                            </p>
                          </div>
                        </div>
                        <div className="flex items-center gap-2">
                          <Badge className={`text-xs ${
                            truck.riskLevel === 'high' ? 'bg-red-100 text-red-700 border-red-200' :
                            truck.riskLevel === 'medium' ? 'bg-amber-100 text-amber-700 border-amber-200' :
                            'bg-yellow-100 text-yellow-700 border-yellow-200'
                          }`}>
                            {truck.riskLevel.toUpperCase()} RISK
                          </Badge>
                          {expandedTruck === truck.truckId
                            ? <ChevronUp className="h-4 w-4 text-muted-foreground" />
                            : <ChevronDown className="h-4 w-4 text-muted-foreground" />
                          }
                        </div>
                      </button>

                      {expandedTruck === truck.truckId && (
                        <motion.div
                          initial={{ opacity: 0, height: 0 }}
                          animate={{ opacity: 1, height: 'auto' }}
                          exit={{ opacity: 0, height: 0 }}
                          className="border-t px-3 py-2 space-y-2"
                        >
                          {truck.anomalies.map((anomaly, idx) => (
                            <div
                              key={idx}
                              className={`rounded-md p-2 text-xs ${
                                anomaly.severity === 'critical'
                                  ? 'bg-red-50 dark:bg-red-900/10 border border-red-200 dark:border-red-800'
                                  : 'bg-amber-50 dark:bg-amber-900/10 border border-amber-200 dark:border-amber-800'
                              }`}
                            >
                              <div className="flex items-center gap-2 mb-1">
                                <Badge variant="outline" className="text-[10px] px-1.5 py-0">
                                  {anomaly.type.replace(/_/g, ' ')}
                                </Badge>
                                <Badge variant="outline" className={`text-[10px] px-1.5 py-0 ${
                                  anomaly.severity === 'critical'
                                    ? 'border-red-300 text-red-600'
                                    : 'border-amber-300 text-amber-600'
                                }`}>
                                  {anomaly.severity}
                                </Badge>
                                <span className="text-muted-foreground ml-auto">
                                  {new Date(anomaly.date).toLocaleDateString()}
                                </span>
                              </div>
                              <p className="text-sm">{anomaly.description}</p>
                            </div>
                          ))}
                        </motion.div>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            ) : (
              <div className="flex flex-col items-center justify-center py-8 text-center">
                <div className="rounded-full bg-emerald-100 dark:bg-emerald-900/30 p-4 mb-3">
                  <ShieldAlert className="h-8 w-8 text-emerald-600" />
                </div>
                <h4 className="text-sm font-medium">No Anomalies Detected</h4>
                <p className="text-xs text-muted-foreground mt-1">
                  All trucks are operating within normal fuel consumption parameters
                </p>
              </div>
            )}
          </CardContent>
        </Card>
      </motion.div>

      {/* Fuel Type Summary Cards */}
      {data?.byFuelType && data.byFuelType.length > 0 && (
        <motion.div variants={itemVariants} className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          {data.byFuelType.map((ft) => (
            <Card key={ft.fuelType}>
              <CardContent className="p-4 sm:p-6">
                <div className="flex items-center gap-3 mb-4">
                  <div className={`rounded-lg p-2 ${
                    ft.fuelType === 'Diesel'
                      ? 'bg-orange-100 dark:bg-orange-900/30'
                      : 'bg-sky-100 dark:bg-sky-900/30'
                  }`}>
                    <Fuel className={`h-5 w-5 ${
                      ft.fuelType === 'Diesel'
                        ? 'text-orange-600 dark:text-orange-400'
                        : 'text-sky-600 dark:text-sky-400'
                    }`} />
                  </div>
                  <div>
                    <p className="font-semibold">{ft.fuelType}</p>
                    <p className="text-xs text-muted-foreground">{ft.fillCount} fill-ups</p>
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <p className="text-xs text-muted-foreground">Total Cost</p>
                    <p className="text-sm font-semibold">{formatCurrency(ft.totalCost)}</p>
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground">Total Liters</p>
                    <p className="text-sm font-semibold">{ft.totalLiters.toLocaleString()} L</p>
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground">Avg Cost/Liter</p>
                    <p className="text-sm font-medium">{formatCurrency(ft.avgCostPerLiter)}</p>
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground">% of Total</p>
                    <p className="text-sm font-medium">
                      {data.summary.totalCost > 0
                        ? ((ft.totalCost / data.summary.totalCost) * 100).toFixed(1)
                        : 0}%
                    </p>
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </motion.div>
      )}

      {/* Error Banner */}
      {error && data && (
        <motion.div variants={itemVariants}>
          <div className="rounded-lg border border-red-200 dark:border-red-800 bg-red-50 dark:bg-red-900/10 p-3 flex items-center gap-2">
            <AlertCircle className="h-4 w-4 text-red-500 shrink-0" />
            <p className="text-sm text-red-700 dark:text-red-400">{error}</p>
          </div>
        </motion.div>
      )}
    </motion.div>
  )
}
