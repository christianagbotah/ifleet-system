'use client'

import * as React from 'react'
import { motion } from 'framer-motion'
import {
  CalendarClock,
  AlertTriangle,
  Activity,
  Calculator,
  Search,
  RefreshCw,
  Wrench,
  Plus,
  ChevronUp,
  ChevronDown,
  History,
  Truck,
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
} from 'recharts'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Skeleton } from '@/components/ui/skeleton'
import { Progress } from '@/components/ui/progress'
import { StatsCard } from '@/components/ui/stats-card'
import { EmptyState } from '@/components/ui/empty-state'
import {
  Dialog,
  DialogBody,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogDescription,
} from '@/components/ui/dialog'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { apiFetch } from '@/lib/api'
import { DatePicker } from '@/components/ui/date-picker'
import { CURRENCY_SYMBOL } from '@/lib/constants'
import { toast } from 'sonner'
import { TruckHistorySheet } from '@/components/maintenance/TruckHistorySheet'

// ============ Types ============

interface ScheduleItem {
  truckId: string
  plateNumber: string
  make: string
  model: string
  currentMileage: number
  lastServiceDate: string | null
  lastServiceMileage: number | null
  nextDueDate: string | null
  nextDueMileage: number | null
  daysUntilDue: number | null
  kmUntilDue: number | null
  status: 'upcoming' | 'due_soon' | 'overdue' | 'no_history'
  healthScore: number
  lastCost: number | null
  estimatedNextCost: number | null
  lastServiceType: string | null
}

interface ScheduleSummary {
  totalTrucks: number
  servicedRecently: number
  dueSoon: number
  overdue: number
  noHistory: number
  avgHealthScore: number
  totalEstimatedCost: number
}

type SortKey = 'plateNumber' | 'daysUntilDue' | 'kmUntilDue' | 'healthScore' | 'status'
type SortDir = 'asc' | 'desc'

const STATUS_ORDER = { overdue: 0, due_soon: 1, upcoming: 2, no_history: 3 } as const

// ============ Animation ============

const containerVariants = {
  show: { transition: { staggerChildren: 0.04 } },
}

const itemVariants = {
  show: { opacity: 1, y: 0 },
}

// ============ Colors ============

const STATUS_CONFIG: Record<string, { label: string; className: string; dotClass: string }> = {
  overdue: {
    label: 'Overdue',
    className: 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400',
    dotClass: 'bg-red-500',
  },
  due_soon: {
    label: 'Due Soon',
    className: 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400',
    dotClass: 'bg-amber-500',
  },
  upcoming: {
    label: 'Upcoming',
    className: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400',
    dotClass: 'bg-emerald-500',
  },
  no_history: {
    label: 'No History',
    className: 'bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-400',
    dotClass: 'bg-gray-400',
  },
}

const PIE_COLORS = ['#ef4444', '#f59e0b', '#10b981', '#9ca3af']

function getHealthColor(score: number): string {
  if (score >= 70) return 'bg-emerald-500'
  if (score >= 40) return 'bg-amber-500'
  return 'bg-red-500'
}

function getHealthGradient(score: number): string {
  if (score >= 70) return '[&>div]:bg-emerald-500'
  if (score >= 40) return '[&>div]:bg-amber-500'
  return '[&>div]:bg-red-500'
}

// ============ Main Component ============

export function MaintenanceSchedulerView() {
  const [data, setData] = React.useState<{ summary: ScheduleSummary; schedule: ScheduleItem[] } | null>(null)
  const [loading, setLoading] = React.useState(true)
  const [error, setError] = React.useState<string | null>(null)
  const [statusFilter, setStatusFilter] = React.useState('all')
  const [searchQuery, setSearchQuery] = React.useState('')
  const [daysAhead, setDaysAhead] = React.useState('30')
  const [sortKey, setSortKey] = React.useState<SortKey>('status')
  const [sortDir, setSortDir] = React.useState<SortDir>('asc')
  const [dialogOpen, setDialogOpen] = React.useState(false)
  const [selectedTruck, setSelectedTruck] = React.useState<ScheduleItem | null>(null)
  const [historyTruck, setHistoryTruck] = React.useState<ScheduleItem | null>(null)
  const [submitting, setSubmitting] = React.useState(false)

  const loadData = React.useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const params = new URLSearchParams()
      params.set('daysAhead', daysAhead)
      if (statusFilter !== 'all') params.set('status', statusFilter)
      const result = await apiFetch<{ summary: ScheduleSummary; schedule: ScheduleItem[] }>(
        `/api/maintenance/schedule?${params.toString()}`
      )
      setData(result)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load schedule')
    } finally {
      setLoading(false)
    }
  }, [daysAhead, statusFilter])

  React.useEffect(() => {
    loadData()
  }, [loadData])

  // Sorting and filtering
  const filteredSchedule = React.useMemo(() => {
    if (!data) return []
    let items = [...data.schedule]

    if (searchQuery) {
      const q = searchQuery.toLowerCase()
      items = items.filter(
        (item) =>
          item.plateNumber.toLowerCase().includes(q) ||
          item.make.toLowerCase().includes(q) ||
          item.model.toLowerCase().includes(q)
      )
    }

    items.sort((a, b) => {
      let cmp = 0
      switch (sortKey) {
        case 'plateNumber':
          cmp = a.plateNumber.localeCompare(b.plateNumber)
          break
        case 'daysUntilDue':
          cmp = (a.daysUntilDue ?? 9999) - (b.daysUntilDue ?? 9999)
          break
        case 'kmUntilDue':
          cmp = (a.kmUntilDue ?? 999999) - (b.kmUntilDue ?? 999999)
          break
        case 'healthScore':
          cmp = a.healthScore - b.healthScore
          break
        case 'status':
          cmp = STATUS_ORDER[a.status] - STATUS_ORDER[b.status]
          break
      }
      return sortDir === 'asc' ? cmp : -cmp
    })

    return items
  }, [data, searchQuery, sortKey, sortDir])

  // Chart data
  const healthChartData = React.useMemo(() => {
    if (!data) return []
    return data.schedule
      .slice(0, 20)
      .map((item) => ({
        name: item.plateNumber,
        health: item.healthScore,
        fill: item.healthScore >= 70 ? '#10b981' : item.healthScore >= 40 ? '#f59e0b' : '#ef4444',
      }))
  }, [data])

  const pieChartData = React.useMemo(() => {
    if (!data) return []
    return [
      { name: 'Overdue', value: data.summary.overdue },
      { name: 'Due Soon', value: data.summary.dueSoon },
      { name: 'Upcoming', value: data.summary.servicedRecently },
      { name: 'No History', value: data.summary.noHistory },
    ].filter((d) => d.value > 0)
  }, [data])

  const handleSort = (key: SortKey) => {
    if (sortKey === key) {
      setSortDir((prev) => (prev === 'asc' ? 'desc' : 'asc'))
    } else {
      setSortKey(key)
      setSortDir('asc')
    }
  }

  const SortIcon = ({ column }: { column: SortKey }) => {
    if (sortKey !== column) return <ChevronUp className="h-3 w-3 opacity-30" />
    return sortDir === 'asc' ? (
      <ChevronUp className="h-3 w-3 text-amber-600" />
    ) : (
      <ChevronDown className="h-3 w-3 text-amber-600" />
    )
  }

  const handleScheduleService = (truck?: ScheduleItem) => {
    setSelectedTruck(truck || null)
    setDialogOpen(true)
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
          <h1 className="text-2xl font-bold tracking-tight">Maintenance Scheduler</h1>
          <p className="text-muted-foreground">Predictive alerts &amp; fleet health dashboard</p>
        </div>
        <div className="flex items-center gap-2">
          <Select value={daysAhead} onValueChange={setDaysAhead}>
            <SelectTrigger className="w-full sm:w-[130px]">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="7">Next 7 days</SelectItem>
              <SelectItem value="14">Next 14 days</SelectItem>
              <SelectItem value="30">Next 30 days</SelectItem>
              <SelectItem value="60">Next 60 days</SelectItem>
              <SelectItem value="90">Next 90 days</SelectItem>
            </SelectContent>
          </Select>
          <Button
            variant="outline"
            size="icon"
            onClick={loadData}
            disabled={loading}
          >
            <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
          </Button>
          <Button
            className="bg-amber-500 hover:bg-amber-600 text-white"
            onClick={() => handleScheduleService()}
          >
            <Plus className="mr-2 h-4 w-4" />
            Schedule Service
          </Button>
        </div>
      </motion.div>

      {/* Summary Cards */}
      <motion.div variants={itemVariants} className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
        {loading ? (
          Array.from({ length: 4 }).map((_, i) => (
            <Card key={i}>
              <CardContent className="p-4 sm:p-6">
                <Skeleton className="h-3 w-20 mb-2" />
                <Skeleton className="h-7 w-12" />
              </CardContent>
            </Card>
          ))
        ) : data ? (
          <>
            <StatsCard
              icon={CalendarClock}
              title="Due Soon"
              value={data.summary.dueSoon}
              changeLabel="within window"
            />
            <StatsCard
              icon={AlertTriangle}
              title="Overdue"
              value={data.summary.overdue}
              className="border-red-200 dark:border-red-900/50"
            />
            <StatsCard
              icon={Activity}
              title="Avg Fleet Health"
              value={`${data.summary.avgHealthScore}%`}
            />
            <StatsCard
              icon={Calculator}
              title="Est. Monthly Cost"
              value={`${CURRENCY_SYMBOL}${data.summary.totalEstimatedCost.toLocaleString()}`}
            />
          </>
        ) : null}
      </motion.div>

      {/* Search & Filters */}
      <motion.div variants={itemVariants} className="flex flex-col sm:flex-row gap-3">
        <div className="relative flex-1">
          <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Search by plate number, make, or model..."
            className="pl-8"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
          />
        </div>
        <Tabs value={statusFilter} onValueChange={setStatusFilter}>
          <TabsList className="flex-wrap h-auto">
            <TabsTrigger value="all">All</TabsTrigger>
            <TabsTrigger value="overdue">Overdue</TabsTrigger>
            <TabsTrigger value="due_soon">Due Soon</TabsTrigger>
            <TabsTrigger value="upcoming">Upcoming</TabsTrigger>
            <TabsTrigger value="no_history">No History</TabsTrigger>
          </TabsList>
        </Tabs>
      </motion.div>

      {/* Error State */}
      {error && (
        <motion.div variants={itemVariants} className="flex flex-col items-center justify-center py-12 text-center">
          <AlertTriangle className="h-8 w-8 text-red-500 mb-3" />
          <p className="text-sm text-muted-foreground mb-3">{error}</p>
          <Button variant="outline" size="sm" onClick={loadData}>
            <RefreshCw className="mr-2 h-3 w-3" /> Retry
          </Button>
        </motion.div>
      )}

      {/* Loading Skeleton */}
      {loading && !error && (
        <motion.div variants={itemVariants} className="space-y-3">
          {Array.from({ length: 5 }).map((_, i) => (
            <Skeleton key={i} className="h-14 w-full rounded" />
          ))}
        </motion.div>
      )}

      {/* Main Content */}
      {!loading && !error && data && (
        <>
          {/* Schedule Table */}
          <motion.div variants={itemVariants}>
            {filteredSchedule.length === 0 ? (
              <Card>
                <EmptyState
                  icon={Wrench}
                  title="No trucks match your criteria"
                  description={
                    statusFilter !== 'all'
                      ? `No trucks with "${STATUS_CONFIG[statusFilter]?.label || statusFilter}" status found.`
                      : 'No maintenance schedule data available.'
                  }
                />
              </Card>
            ) : (
              <Card>
                <CardContent className="p-0">
                  {/* Desktop Table */}
                  <div className="hidden md:block overflow-x-auto max-h-[500px] overflow-y-auto">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead
                            className="cursor-pointer select-none"
                            onClick={() => handleSort('plateNumber')}
                          >
                            <div className="flex items-center gap-1">
                              Truck <SortIcon column="plateNumber" />
                            </div>
                          </TableHead>
                          <TableHead className="hidden lg:table-cell">Last Service</TableHead>
                          <TableHead>Next Due</TableHead>
                          <TableHead
                            className="cursor-pointer select-none text-right"
                            onClick={() => handleSort('daysUntilDue')}
                          >
                            <div className="flex items-center justify-end gap-1">
                              Days Until <SortIcon column="daysUntilDue" />
                            </div>
                          </TableHead>
                          <TableHead
                            className="cursor-pointer select-none text-right hidden lg:table-cell"
                            onClick={() => handleSort('kmUntilDue')}
                          >
                            <div className="flex items-center justify-end gap-1">
                              Km Until <SortIcon column="kmUntilDue" />
                            </div>
                          </TableHead>
                          <TableHead
                            className="cursor-pointer select-none"
                            onClick={() => handleSort('healthScore')}
                          >
                            <div className="flex items-center gap-1">
                              Health <SortIcon column="healthScore" />
                            </div>
                          </TableHead>
                          <TableHead
                            className="cursor-pointer select-none"
                            onClick={() => handleSort('status')}
                          >
                            <div className="flex items-center gap-1">
                              Status <SortIcon column="status" />
                            </div>
                          </TableHead>
                          <TableHead className="text-right">Actions</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {filteredSchedule.map((item) => (
                          <TableRow key={item.truckId} className="group">
                            <TableCell>
                              <div>
                                <p className="font-semibold text-sm">{item.plateNumber}</p>
                                <p className="text-xs text-muted-foreground">
                                  {item.make} {item.model}
                                </p>
                              </div>
                            </TableCell>
                            <TableCell className="hidden lg:table-cell">
                              <div className="text-sm">
                                {item.lastServiceDate ? (
                                  <>
                                    <p>{new Date(item.lastServiceDate).toLocaleDateString()}</p>
                                    <p className="text-xs text-muted-foreground">
                                      {item.lastServiceMileage?.toLocaleString()} km
                                    </p>
                                  </>
                                ) : (
                                  <span className="text-muted-foreground">-</span>
                                )}
                              </div>
                            </TableCell>
                            <TableCell>
                              <div className="text-sm">
                                {item.nextDueDate || item.nextDueMileage ? (
                                  <>
                                    {item.nextDueDate && (
                                      <p>{new Date(item.nextDueDate).toLocaleDateString()}</p>
                                    )}
                                    {item.nextDueMileage && (
                                      <p className="text-xs text-muted-foreground">
                                        {item.nextDueMileage.toLocaleString()} km
                                      </p>
                                    )}
                                  </>
                                ) : (
                                  <span className="text-muted-foreground">-</span>
                                )}
                              </div>
                            </TableCell>
                            <TableCell className="text-right">
                              <span
                                className={`text-sm font-medium ${
                                  item.daysUntilDue !== null && item.daysUntilDue <= 7
                                    ? 'text-red-600 dark:text-red-400'
                                    : item.daysUntilDue !== null && item.daysUntilDue <= 14
                                      ? 'text-amber-600 dark:text-amber-400'
                                      : ''
                                }`}
                              >
                                {item.daysUntilDue !== null ? `${item.daysUntilDue}d` : '-'}
                              </span>
                            </TableCell>
                            <TableCell className="text-right hidden lg:table-cell">
                              <span
                                className={`text-sm font-medium ${
                                  item.kmUntilDue !== null && item.kmUntilDue <= 1000
                                    ? 'text-red-600 dark:text-red-400'
                                    : item.kmUntilDue !== null && item.kmUntilDue <= 3000
                                      ? 'text-amber-600 dark:text-amber-400'
                                      : ''
                                }`}
                              >
                                {item.kmUntilDue !== null ? `${item.kmUntilDue.toLocaleString()} km` : '-'}
                              </span>
                            </TableCell>
                            <TableCell>
                              <div className="flex items-center gap-2 min-w-[80px]">
                                <Progress
                                  value={item.healthScore}
                                  className={`h-2 w-16 ${getHealthGradient(item.healthScore)}`}
                                />
                                <span className="text-xs font-medium w-8 text-right">
                                  {item.healthScore}%
                                </span>
                              </div>
                            </TableCell>
                            <TableCell>
                              <Badge className={STATUS_CONFIG[item.status].className} variant="outline">
                                {STATUS_CONFIG[item.status].label}
                              </Badge>
                            </TableCell>
                            <TableCell className="text-right">
                              <div className="flex items-center justify-end gap-1">
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  className="h-8 text-xs"
                                  onClick={() => handleScheduleService(item)}
                                >
                                  <Plus className="mr-1 h-3 w-3" />
                                  Schedule
                                </Button>
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  className="h-8 text-xs"
                                  onClick={() => setHistoryTruck(item)}
                                >
                                  <History className="mr-1 h-3 w-3" />
                                  History
                                </Button>
                              </div>
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </div>

                  {/* Mobile Cards */}
                  <div className="md:hidden max-h-[600px] overflow-y-auto p-3 space-y-3">
                    {filteredSchedule.map((item) => (
                      <div
                        key={item.truckId}
                        className="rounded-lg border p-3 space-y-2 bg-card hover:shadow-sm transition-shadow"
                      >
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-2">
                            <Truck className="h-4 w-4 text-muted-foreground" />
                            <div>
                              <p className="font-semibold text-sm">{item.plateNumber}</p>
                              <p className="text-xs text-muted-foreground">
                                {item.make} {item.model}
                              </p>
                            </div>
                          </div>
                          <Badge className={STATUS_CONFIG[item.status].className} variant="outline">
                            {STATUS_CONFIG[item.status].label}
                          </Badge>
                        </div>

                        <div className="flex items-center gap-2">
                          <Progress
                            value={item.healthScore}
                            className={`h-2 flex-1 ${getHealthGradient(item.healthScore)}`}
                          />
                          <span className="text-xs font-medium">{item.healthScore}%</span>
                        </div>

                        <div className="grid grid-cols-2 gap-2 text-xs">
                          <div>
                            <span className="text-muted-foreground">Next Due:</span>
                            <span className="ml-1 font-medium">
                              {item.nextDueDate
                                ? new Date(item.nextDueDate).toLocaleDateString()
                                : item.nextDueMileage
                                  ? `${item.nextDueMileage.toLocaleString()} km`
                                  : '-'}
                            </span>
                          </div>
                          <div>
                            <span className="text-muted-foreground">Days Left:</span>
                            <span className="ml-1 font-medium">
                              {item.daysUntilDue !== null ? `${item.daysUntilDue}d` : '-'}
                            </span>
                          </div>
                          <div>
                            <span className="text-muted-foreground">Km Left:</span>
                            <span className="ml-1 font-medium">
                              {item.kmUntilDue !== null ? `${item.kmUntilDue.toLocaleString()}` : '-'}
                            </span>
                          </div>
                          <div>
                            <span className="text-muted-foreground">Last Cost:</span>
                            <span className="ml-1 font-medium">
                              {item.lastCost ? `${CURRENCY_SYMBOL}${item.lastCost.toLocaleString()}` : '-'}
                            </span>
                          </div>
                        </div>

                        <div className="flex gap-2 pt-1">
                          <Button
                            variant="outline"
                            size="sm"
                            className="flex-1 h-8 text-xs"
                            onClick={() => handleScheduleService(item)}
                          >
                            <Plus className="mr-1 h-3 w-3" />
                            Schedule
                          </Button>
                          <Button
                            variant="ghost"
                            size="sm"
                            className="h-8 text-xs"
                            onClick={() => setHistoryTruck(item)}
                          >
                            <History className="mr-1 h-3 w-3" />
                            History
                          </Button>
                        </div>
                      </div>
                    ))}
                  </div>
                </CardContent>
              </Card>
            )}
          </motion.div>

          {/* Fleet Health Overview Charts */}
          <motion.div variants={itemVariants} className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            {/* Health Score Bar Chart */}
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-base">Fleet Health Scores</CardTitle>
              </CardHeader>
              <CardContent>
                {healthChartData.length === 0 ? (
                  <div className="flex items-center justify-center h-[280px] text-muted-foreground text-sm">
                    No data available
                  </div>
                ) : (
                  <ResponsiveContainer width="100%" height={280}>
                    <BarChart data={healthChartData} margin={{ top: 5, right: 10, left: -10, bottom: 5 }}>
                      <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                      <XAxis
                        dataKey="name"
                        tick={{ fontSize: 11 }}
                        className="text-muted-foreground"
                        angle={-35}
                        textAnchor="end"
                        height={60}
                      />
                      <YAxis domain={[0, 100]} tick={{ fontSize: 11 }} className="text-muted-foreground" />
                      <Tooltip
                        contentStyle={{
                          backgroundColor: 'hsl(var(--card))',
                          border: '1px solid hsl(var(--border))',
                          borderRadius: '8px',
                          fontSize: '12px',
                        }}
                        formatter={(value: number) => [`${value}%`, 'Health Score']}
                      />
                      <Bar dataKey="health" radius={[4, 4, 0, 0]}>
                        {healthChartData.map((entry, index) => (
                          <Cell key={index} fill={entry.fill} />
                        ))}
                      </Bar>
                    </BarChart>
                  </ResponsiveContainer>
                )}
              </CardContent>
            </Card>

            {/* Status Distribution Pie Chart */}
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-base">Maintenance Status Distribution</CardTitle>
              </CardHeader>
              <CardContent>
                {pieChartData.length === 0 ? (
                  <div className="flex items-center justify-center h-[280px] text-muted-foreground text-sm">
                    No data available
                  </div>
                ) : (
                  <ResponsiveContainer width="100%" height={280}>
                    <PieChart>
                      <Pie
                        data={pieChartData}
                        cx="50%"
                        cy="50%"
                        innerRadius={60}
                        outerRadius={100}
                        paddingAngle={3}
                        dataKey="value"
                        label={({ name, value }) => `${name}: ${value}`}
                      >
                        {pieChartData.map((_, index) => (
                          <Cell key={index} fill={PIE_COLORS[index % PIE_COLORS.length]} />
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
                        iconType="circle"
                        iconSize={8}
                        formatter={(value) => <span className="text-xs">{value}</span>}
                      />
                    </PieChart>
                  </ResponsiveContainer>
                )}
              </CardContent>
            </Card>
          </motion.div>

          {/* Fleet Summary Stats */}
          <motion.div variants={itemVariants}>
            <Card>
              <CardContent className="p-4">
                <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-4 text-center">
                  <div>
                    <p className="text-2xl font-bold">{data.summary.totalTrucks}</p>
                    <p className="text-xs text-muted-foreground">Total Trucks</p>
                  </div>
                  <div>
                    <p className="text-2xl font-bold text-emerald-600 dark:text-emerald-400">
                      {data.summary.servicedRecently}
                    </p>
                    <p className="text-xs text-muted-foreground">Serviced Recently</p>
                  </div>
                  <div>
                    <p className="text-2xl font-bold text-amber-600 dark:text-amber-400">
                      {data.summary.dueSoon}
                    </p>
                    <p className="text-xs text-muted-foreground">Due Soon</p>
                  </div>
                  <div>
                    <p className="text-2xl font-bold text-red-600 dark:text-red-400">
                      {data.summary.overdue}
                    </p>
                    <p className="text-xs text-muted-foreground">Overdue</p>
                  </div>
                  <div>
                    <p className="text-2xl font-bold text-gray-500 dark:text-gray-400">
                      {data.summary.noHistory}
                    </p>
                    <p className="text-xs text-muted-foreground">No History</p>
                  </div>
                  <div>
                    <p className="text-2xl font-bold">
                      {CURRENCY_SYMBOL}{data.summary.totalEstimatedCost.toLocaleString()}
                    </p>
                    <p className="text-xs text-muted-foreground">Est. Cost (Due + Overdue)</p>
                  </div>
                </div>
              </CardContent>
            </Card>
          </motion.div>
        </>
      )}

      {/* Truck History Sheet */}
      <TruckHistorySheet
        item={historyTruck}
        open={!!historyTruck}
        onOpenChange={(open) => { if (!open) setHistoryTruck(null) }}
      />

      {/* Schedule Service Dialog */}
      <ScheduleServiceDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        selectedTruck={selectedTruck}
        onSubmitted={() => {
          setDialogOpen(false)
          setSelectedTruck(null)
          loadData()
        }}
      />
    </motion.div>
  )
}

// ============ Schedule Service Dialog ============

interface ScheduleServiceDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  selectedTruck: ScheduleItem | null
  onSubmitted: () => void
}

function ScheduleServiceDialog({
  open,
  onOpenChange,
  selectedTruck,
  onSubmitted,
}: ScheduleServiceDialogProps) {
  const [type, setType] = React.useState('routine')
  const [title, setTitle] = React.useState('')
  const [description, setDescription] = React.useState('')
  const [scheduledDate, setScheduledDate] = React.useState('')
  const [scheduledMileage, setScheduledMileage] = React.useState('')
  const [submitting, setSubmitting] = React.useState(false)
  const [truckOptions, setTruckOptions] = React.useState<ScheduleItem[]>([])

  // Load truck options when dialog opens
  React.useEffect(() => {
    if (open) {
      // Load all trucks for the dropdown
      apiFetch<{ schedule: ScheduleItem[] }>('/api/maintenance/schedule?daysAhead=90&status=all')
        .then((result) => {
          setTruckOptions(result.schedule)
        })
        .catch(() => {
          // Ignore error, truck options already loaded from parent
        })

      // Reset form
      setType('routine')
      setTitle('')
      setDescription('')
      setScheduledDate('')
      setScheduledMileage('')
    }
  }, [open])

  // Auto-fill date/mileage when truck is pre-selected
  React.useEffect(() => {
    if (selectedTruck) {
      setTitle('')
      if (selectedTruck.nextDueDate) {
        setScheduledDate(new Date(selectedTruck.nextDueDate).toISOString().split('T')[0])
      } else {
        setScheduledDate('')
      }
      if (selectedTruck.nextDueMileage) {
        setScheduledMileage(String(selectedTruck.nextDueMileage))
      } else {
        setScheduledMileage('')
      }
    } else {
      setTitle('')
      setScheduledDate('')
      setScheduledMileage('')
    }
  }, [selectedTruck])

  const handleSubmit = async () => {
    if (!title.trim()) {
      toast.error('Please enter a title')
      return
    }

    const truckId = selectedTruck?.truckId
    if (!truckId) {
      toast.error('No truck selected')
      return
    }

    setSubmitting(true)
    try {
      await apiFetch('/api/maintenance/schedule', {
        method: 'POST',
        body: JSON.stringify({
          truckId,
          type,
          title: title.trim(),
          description: description.trim() || undefined,
          scheduledDate: scheduledDate || undefined,
          scheduledMileage: scheduledMileage || undefined,
        }),
      })
      toast.success(`Maintenance scheduled for ${selectedTruck?.plateNumber || 'truck'}`)
      onSubmitted()
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to schedule maintenance')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[480px]">
        <DialogHeader>
          <DialogTitle>Schedule Maintenance</DialogTitle>
          <DialogDescription>
            Create a pending maintenance record for a truck.
          </DialogDescription>
        </DialogHeader>

        <DialogBody className="grid gap-4 py-4">
          {/* Truck Info */}
          {selectedTruck ? (
            <div className="rounded-lg border p-3 bg-muted/30">
              <p className="text-sm font-semibold">{selectedTruck.plateNumber}</p>
              <p className="text-xs text-muted-foreground">
                {selectedTruck.make} {selectedTruck.model}
              </p>
              {selectedTruck.currentMileage > 0 && (
                <p className="text-xs text-muted-foreground mt-1">
                  Current mileage: {selectedTruck.currentMileage.toLocaleString()} km
                </p>
              )}
            </div>
          ) : null}

          {/* Type */}
          <div className="grid gap-2">
            <Label className="text-sm font-medium">Type</Label>
            <Select value={type} onValueChange={setType}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="routine">Routine</SelectItem>
                <SelectItem value="inspection">Inspection</SelectItem>
                <SelectItem value="repair">Repair</SelectItem>
                <SelectItem value="emergency">Emergency</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {/* Title */}
          <div className="grid gap-2">
            <Label className="text-sm font-medium">Title *</Label>
            <Input
              placeholder="e.g., 90-day Routine Service"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
            />
          </div>

          {/* Description */}
          <div className="grid gap-2">
            <Label className="text-sm font-medium">Description</Label>
            <Textarea
              placeholder="Additional notes about this service..."
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={3}
            />
          </div>

          {/* Scheduled Date & Mileage */}
          <div className="grid grid-cols-2 gap-3">
            <div className="grid gap-2">
              <Label className="text-sm font-medium">Scheduled Date</Label>
              <DatePicker value={scheduledDate} onChange={(val) => setScheduledDate(val)} />
            </div>
            <div className="grid gap-2">
              <Label className="text-sm font-medium">Due Mileage (km)</Label>
              <Input
                type="number"
                placeholder="e.g., 150000"
                value={scheduledMileage}
                onChange={(e) => setScheduledMileage(e.target.value)}
              />
            </div>
          </div>
        </DialogBody>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button
            className="bg-amber-500 hover:bg-amber-600 text-white"
            onClick={handleSubmit}
            disabled={submitting || !title.trim() || !selectedTruck}
          >
            {submitting ? (
              <RefreshCw className="mr-2 h-4 w-4 animate-spin" />
            ) : (
              <Plus className="mr-2 h-4 w-4" />
            )}
            Schedule Service
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
