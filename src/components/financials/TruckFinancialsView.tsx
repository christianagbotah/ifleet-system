'use client'

import React, { useState, useEffect, useCallback, useMemo } from 'react'
import { motion } from 'framer-motion'
import {
  TrendingUp,
  TrendingDown,
  DollarSign,
  Wallet,
  PiggyBank,
  Truck,
  ArrowUpDown,
  BarChart3,
  Calendar,
  Download,
  Filter,
  CircleDollarSign,
  Fuel,
  Wrench,
  AlertTriangle,
  CheckCircle2,
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
import { SearchableSelect, type SearchableOption } from '@/components/ui/searchable-select'
import { Input } from '@/components/ui/input'
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
  PieChart,
  Pie,
} from 'recharts'
import { apiFetch } from '@/lib/api'
import { CURRENCY_SYMBOL } from '@/lib/constants'

// ============ TYPES ============

interface TruckPLRow {
  truckId: string
  plateNumber: string
  make: string
  model: string
  driverName: string
  trips: number
  revenue: number
  fuelCost: number
  maintenanceCost: number
  tollCost: number
  otherExpenses: number
  totalExpenses: number
  netIncome: number
  margin: number
}

interface DailyPLRow {
  date: string
  revenue: number
  fuelCost: number
  maintenanceCost: number
  tollCost: number
  otherExpenses: number
  totalExpenses: number
  netIncome: number
  trips: number
}

interface PLSummary {
  totalRevenue: number
  totalExpenses: number
  netIncome: number
  totalTrips: number
  profitableTrucks: number
  lossTrucks: number
  avgMargin: number
}

interface TruckOption {
  id: string
  plateNumber: string
}

interface TruckPLResponse {
  summary: PLSummary
  trucks: TruckPLRow[]
  daily: DailyPLRow[]
  trucksList: TruckOption[]
}

// ============ CHART CONFIGS ============

const dailyTrendConfig = {
  revenue: { label: 'Revenue', color: 'hsl(38, 92%, 50%)' },
  expenses: { label: 'Expenses', color: 'hsl(0, 84%, 60%)' },
  net: { label: 'Net P&L', color: 'hsl(142, 71%, 45%)' },
} satisfies ChartConfig

const truckProfitConfig = {
  profit: { label: 'Net P&L', color: 'hsl(142, 71%, 45%)' },
} satisfies ChartConfig

const expensePieConfig = {
  fuel: { label: 'Fuel', color: 'hsl(25, 95%, 53%)' },
  maintenance: { label: 'Maintenance', color: 'hsl(38, 92%, 50%)' },
  tolls: { label: 'Tolls', color: 'hsl(262, 83%, 58%)' },
  other: { label: 'Other', color: 'hsl(200, 84%, 46%)' },
} satisfies ChartConfig

// ============ COLORS ============

const PROFIT_COLORS = [
  'hsl(142, 71%, 45%)',
  'hsl(38, 92%, 50%)',
  'hsl(173, 80%, 40%)',
  'hsl(25, 95%, 53%)',
  'hsl(47, 96%, 53%)',
  'hsl(15, 90%, 50%)',
  'hsl(340, 75%, 55%)',
  'hsl(200, 84%, 46%)',
  'hsl(305, 48%, 50%)',
  'hsl(90, 60%, 45%)',
]

// ============ HELPERS ============

function formatCurrency(value: number): string {
  return `${CURRENCY_SYMBOL}${value.toLocaleString('en-GH', { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`
}

function formatPct(value: number): string {
  return `${value > 0 ? '+' : ''}${value.toFixed(1)}%`
}

function ProfitLossCell({ profit, showIcon }: { profit: number; showIcon?: boolean }) {
  const color = profit > 0
    ? 'text-emerald-600 dark:text-emerald-400'
    : profit < 0
      ? 'text-red-600 dark:text-red-400'
      : 'text-muted-foreground'
  return (
    <span className={`font-semibold tabular-nums ${color}`}>
      {showIcon && profit > 0 && <TrendingUp className="h-3 w-3 inline mr-1" />}
      {showIcon && profit < 0 && <TrendingDown className="h-3 w-3 inline mr-1" />}
      {profit > 0 ? '+' : ''}{formatCurrency(profit)}
    </span>
  )
}

function MarginCell({ margin }: { margin: number }) {
  const color = margin > 0
    ? 'text-emerald-600 dark:text-emerald-400'
    : margin < 0
      ? 'text-red-600 dark:text-red-400'
      : 'text-muted-foreground'
  return (
    <Badge
      variant="outline"
      className={`font-semibold tabular-nums ${margin > 0
        ? 'bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-900/30 dark:text-emerald-400 dark:border-emerald-800'
        : margin < 0
          ? 'bg-red-50 text-red-700 border-red-200 dark:bg-red-900/30 dark:text-red-400 dark:border-red-800'
          : 'bg-gray-50 text-gray-600 border-gray-200 dark:bg-gray-800 dark:text-gray-400 dark:border-gray-700'
        }`}
    >
      {formatPct(margin)}
    </Badge>
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
      <Card className="h-full gap-0 py-4">
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

export function TruckFinancialsView() {
  const [data, setData] = useState<TruckPLResponse | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  // Filters
  const [period, setPeriod] = useState('this_month')
  const [dateFrom, setDateFrom] = useState('')
  const [dateTo, setDateTo] = useState('')
  const [truckFilter, setTruckFilter] = useState('all')

  // Sorting
  const [truckSortKey, setTruckSortKey] = useState<string>('netIncome')
  const [truckSortDir, setTruckSortDir] = useState<'asc' | 'desc'>('desc')
  const [dailySortKey, setDailySortKey] = useState<string>('date')
  const [dailySortDir, setDailySortDir] = useState<'asc' | 'desc'>('desc')

  const loadData = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const params: Record<string, string> = { period }
      if (period === 'custom' && dateFrom) params.dateFrom = dateFrom
      if (period === 'custom' && dateTo) params.dateTo = dateTo
      if (truckFilter !== 'all') params.truckId = truckFilter

      const sp = new URLSearchParams(params)
      const result = await apiFetch<TruckPLResponse>(`/api/financials/truck-pl?${sp}`)
      setData(result)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load financial data')
    } finally {
      setLoading(false)
    }
  }, [period, dateFrom, dateTo, truckFilter])

  useEffect(() => {
    loadData()
  }, [loadData])

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
  const sortedTrucks = useMemo(() => {
    if (!data?.trucks) return []
    return genericSort(data.trucks, truckSortKey, truckSortDir)
  }, [data, truckSortKey, truckSortDir])

  const sortedDaily = useMemo(() => {
    if (!data?.daily) return []
    return genericSort(data.daily, dailySortKey, dailySortDir)
  }, [data, dailySortKey, dailySortDir])

  // Chart data
  const dailyTrendData = useMemo(() => {
    if (!data?.daily) return []
    return data.daily.map(d => ({
      date: new Date(d.date).toLocaleDateString('en-GB', { day: '2-digit', month: 'short' }),
      revenue: d.revenue,
      expenses: d.totalExpenses,
      net: d.netIncome,
    }))
  }, [data])

  const truckBarData = useMemo(() => {
    if (!data?.trucks) return []
    return data.trucks.map((t, i) => ({
      name: t.plateNumber,
      profit: t.netIncome,
      fill: t.netIncome >= 0 ? PROFIT_COLORS[i % PROFIT_COLORS.length] : 'hsl(0, 84%, 60%)',
    }))
  }, [data])

  const expensePieData = useMemo(() => {
    if (!data?.summary) return []
    const s = data.summary
    const items = [
      { name: 'Fuel', value: s.fuelTotal || 0 },
      { name: 'Maintenance', value: s.maintenanceTotal || 0 },
      { name: 'Tolls', value: s.tollsTotal || 0 },
      { name: 'Other', value: (s.totalExpenses || 0) - (s.fuelTotal || 0) - (s.maintenanceTotal || 0) - (s.tollsTotal || 0) },
    ].filter(i => i.value > 0)
    return items.length > 0 ? items : [{ name: 'No Data', value: 1 }]
  }, [data])

  const pieColors = ['hsl(25, 95%, 53%)', 'hsl(38, 92%, 50%)', 'hsl(262, 83%, 58%)', 'hsl(200, 84%, 46%)']

  // ─── Period display label ───
  const periodLabel = useMemo(() => {
    if (period === 'custom' && dateFrom && dateTo) {
      const fromStr = new Date(dateFrom).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })
      const toStr = new Date(dateTo).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })
      return `${fromStr} - ${toStr}`
    }
    const labels: Record<string, string> = {
      today: 'Today',
      this_week: 'This Week',
      this_month: 'This Month',
      last_month: 'Last Month',
      this_quarter: 'This Quarter',
      this_year: 'This Year',
      custom: 'Custom',
    }
    return labels[period] || 'This Month'
  }, [period, dateFrom, dateTo])

  // ─── Generate Report (PDF/Excel) ───
  async function generateReport(format: 'pdf' | 'xlsx') {
    try {
      const body: Record<string, unknown> = {
        type: 'fleet_profit_loss',
        format,
        params: {
          period,
          ...(truckFilter !== 'all' ? { truckId: truckFilter } : {}),
          ...(period === 'custom' && dateFrom ? { dateFrom } : {}),
          ...(period === 'custom' && dateTo ? { dateTo } : {}),
        },
      }
      const token = getStoredToken()
      const res = await fetch('/api/reports/generate', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`,
        },
        body: JSON.stringify(body),
      })
      if (!res.ok) throw new Error('Failed to generate report')

      const blob = await res.blob()
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `fleet-pl-${period}-${new Date().toISOString().slice(0, 10)}.${format === 'pdf' ? 'pdf' : 'xlsx'}`
      document.body.appendChild(a)
      a.click()
      document.body.removeChild(a)
      URL.revokeObjectURL(url)
    } catch (err) {
      // Silently fail — report generation is a nice-to-have
      console.error('Report generation failed:', err)
    }
  }

  function getStoredToken() {
    // Inline token getter to avoid importing zustand store directly
    try {
      const stored = localStorage.getItem('fleetpro-auth')
      if (!stored) return ''
      const parsed = JSON.parse(stored)
      return parsed.token || parsed.state?.token || ''
    } catch {
      return ''
    }
  }

  // Build SearchableSelect options from trucksList
  const truckOptions: SearchableOption[] = useMemo(() => {
    if (!data?.trucksList) return []
    return [
      { value: 'all', label: 'All Trucks' },
      ...data.trucksList.map(t => ({ value: t.id, label: t.plateNumber })),
    ]
  }, [data?.trucksList])

  return (
    <div className="space-y-6">
      {/* Header */}
      <motion.div
        initial={{ opacity: 0, y: -10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.3 }}
        className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-4"
      >
        <div>
          <h1 className="text-2xl font-bold tracking-tight flex items-center gap-2">
            <CircleDollarSign className="h-6 w-6 text-amber-500" />
            Truck Revenue &amp; Expense Tracker
          </h1>
          <p className="text-muted-foreground mt-1">
            Track daily revenue, expenses, and net income/loss per truck — filter by period and export reports
          </p>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <Button variant="outline" size="sm" onClick={() => generateReport('pdf')} disabled={loading}>
            <Download className="h-4 w-4 mr-1.5" />
            PDF
          </Button>
          <Button variant="outline" size="sm" onClick={() => generateReport('xlsx')} disabled={loading}>
            <Download className="h-4 w-4 mr-1.5" />
            Excel
          </Button>
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
            <div className="grid grid-cols-2 gap-3 sm:flex sm:flex-row sm:items-end sm:flex-wrap">
              <div className="col-span-2 sm:col-span-auto sm:min-w-[150px]">
                <label className="text-xs font-medium text-muted-foreground mb-1.5 block">Period</label>
                <Select value={period} onValueChange={setPeriod}>
                  <SelectTrigger>
                    <SelectValue placeholder="Select period" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="today">Today</SelectItem>
                    <SelectItem value="this_week">This Week</SelectItem>
                    <SelectItem value="this_month">This Month</SelectItem>
                    <SelectItem value="last_month">Last Month</SelectItem>
                    <SelectItem value="this_quarter">This Quarter</SelectItem>
                    <SelectItem value="this_year">This Year</SelectItem>
                    <SelectItem value="custom">Custom Range</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="col-span-2 sm:col-span-auto sm:min-w-[160px]">
                <label className="text-xs font-medium text-muted-foreground mb-1.5 block">Truck</label>
                <SearchableSelect
                  options={truckOptions}
                  value={truckFilter}
                  onValueChange={setTruckFilter}
                  placeholder="All Trucks"
                  alwaysSearchable
                />
              </div>
              {period === 'custom' && (
                <>
                  <div className="col-span-1 sm:col-span-auto sm:min-w-[150px]">
                    <label className="text-xs font-medium text-muted-foreground mb-1.5 block">From</label>
                    <DatePicker value={dateFrom} onChange={(val) => setDateFrom(val)} />
                  </div>
                  <div className="col-span-1 sm:col-span-auto sm:min-w-[150px]">
                    <label className="text-xs font-medium text-muted-foreground mb-1.5 block">To</label>
                    <DatePicker value={dateTo} onChange={(val) => setDateTo(val)} />
                  </div>
                </>
              )}
              <div className="col-span-2 sm:col-span-auto flex items-center justify-between sm:justify-start gap-2">
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => { setPeriod('this_month'); setDateFrom(''); setDateTo(''); setTruckFilter('all') }}
                  className="shrink-0"
                >
                  Reset
                </Button>
                <span className="text-xs text-muted-foreground sm:hidden">
                  {periodLabel}
                </span>
                <span className="text-sm text-muted-foreground hidden sm:inline-flex sm:ml-auto sm:items-center">
                  <Filter className="h-3.5 w-3.5 mr-1" />
                  <span className="font-medium text-foreground">{periodLabel}</span>
                </span>
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
          subtext={`${data?.summary?.totalTrips ?? 0} trips`}
          loading={loading}
        />
        <KpiCard
          title="Total Expenses"
          value={loading ? '' : formatCurrency(data?.summary?.totalExpenses ?? 0)}
          icon={Wallet}
          colorClass="bg-red-500"
          subtext="Fuel + Maint + Tolls + Other"
          loading={loading}
        />
        <KpiCard
          title="Net Income / Loss"
          value={loading ? '' : formatCurrency(data?.summary?.netIncome ?? 0)}
          icon={PiggyBank}
          colorClass={(data?.summary?.netIncome ?? 0) >= 0 ? 'bg-emerald-500' : 'bg-red-500'}
          subtext={(data?.summary?.netIncome ?? 0) >= 0 ? 'Net Profit' : 'Net Loss'}
          loading={loading}
        />
        <KpiCard
          title="Profitable Trucks"
          value={loading ? '' : `${data?.summary?.profitableTrucks ?? 0} / ${data?.trucks?.length ?? 0}`}
          icon={Truck}
          colorClass={(data?.summary?.profitableTrucks ?? 0) > 0 ? 'bg-emerald-500' : 'bg-orange-500'}
          subtext={`${data?.summary?.lossTrucks ?? 0} trucks in loss`}
          loading={loading}
        />
      </div>

      {/* Margin Summary Strip */}
      {!loading && data?.summary && (
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.3, delay: 0.1 }}
        >
          <Card className={`gap-0 py-3 ${(data.summary.netIncome ?? 0) >= 0
            ? 'border-emerald-200 bg-emerald-50/50 dark:border-emerald-900/50 dark:bg-emerald-950/20'
            : 'border-red-200 bg-red-50/50 dark:border-red-900/50 dark:bg-red-950/20'
            }`}
          >
            <CardContent className="p-4 flex flex-col sm:flex-row items-start sm:items-center gap-3">
              {(data.summary.netIncome ?? 0) >= 0 ? (
                <CheckCircle2 className="h-5 w-5 text-emerald-600 dark:text-emerald-400 shrink-0" />
              ) : (
                <AlertTriangle className="h-5 w-5 text-red-600 dark:text-red-400 shrink-0" />
              )}
              <div className="text-sm">
                <span className="font-semibold">
                  Fleet Margin: {formatPct(data.summary.avgMargin ?? 0)}
                </span>
                <span className="text-muted-foreground ml-2">
                  — {(data.summary.netIncome ?? 0) >= 0
                    ? `The fleet is profitable with ${formatCurrency(data.summary.netIncome)} net income`
                    : `The fleet is operating at a loss of ${formatCurrency(Math.abs(data.summary.netIncome))}`
                  }
                </span>
              </div>
            </CardContent>
          </Card>
        </motion.div>
      )}

      {/* Main Tabs */}
      <Tabs defaultValue="trucks" className="w-full">
        <TabsList className="w-full sm:w-auto">
          <TabsTrigger value="trucks">
            <Truck className="h-3.5 w-3.5 mr-1.5 hidden sm:inline" />
            Truck P&L
          </TabsTrigger>
          <TabsTrigger value="daily">
            <Calendar className="h-3.5 w-3.5 mr-1.5 hidden sm:inline" />
            Daily Ledger
          </TabsTrigger>
          <TabsTrigger value="charts">
            <BarChart3 className="h-3.5 w-3.5 mr-1.5 hidden sm:inline" />
            Charts
          </TabsTrigger>
        </TabsList>

        {/* ─── Tab 1: Truck P&L Summary ─── */}
        <TabsContent value="trucks">
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.3 }}
          >
            <Card className="gap-0 py-4">
              <CardHeader className="pb-2">
                <CardTitle className="text-base">Truck Profit & Loss Summary</CardTitle>
                <CardDescription>
                  Revenue, expense breakdown, and net income/loss per truck for {periodLabel}
                </CardDescription>
              </CardHeader>
              <CardContent className="p-4 pt-0">
                {loading ? (
                  <div className="space-y-3">
                    {Array.from({ length: 5 }).map((_, i) => (
                      <Skeleton key={i} className="h-12 w-full rounded" />
                    ))}
                  </div>
                ) : sortedTrucks.length === 0 ? (
                  <EmptyState message="No trucks found for this period" />
                ) : (
                  <>
                    <div className="hidden md:block overflow-x-auto rounded-lg border max-h-[600px] overflow-y-auto">
                      <table className="w-full text-sm">
                        <thead className="sticky top-0 z-10">
                          <tr className="bg-muted/50 border-b backdrop-blur-sm">
                            <th className="px-3 py-3 text-left font-medium cursor-pointer hover:bg-muted/80 whitespace-nowrap" onClick={() => handleSort('plateNumber', truckSortKey, truckSortDir, setTruckSortKey, setTruckSortDir)}>
                              Truck <SortIcon active={truckSortKey === 'plateNumber'} />
                            </th>
                            <th className="px-3 py-3 text-left font-medium whitespace-nowrap hidden lg:table-cell">Driver</th>
                            <th className="px-3 py-3 text-right font-medium cursor-pointer hover:bg-muted/80 whitespace-nowrap" onClick={() => handleSort('trips', truckSortKey, truckSortDir, setTruckSortKey, setTruckSortDir)}>
                              Trips <SortIcon active={truckSortKey === 'trips'} />
                            </th>
                            <th className="px-3 py-3 text-right font-medium cursor-pointer hover:bg-muted/80 whitespace-nowrap" onClick={() => handleSort('revenue', truckSortKey, truckSortDir, setTruckSortKey, setTruckSortDir)}>
                              Revenue <SortIcon active={truckSortKey === 'revenue'} />
                            </th>
                            <th className="px-3 py-3 text-right font-medium cursor-pointer hover:bg-muted/80 whitespace-nowrap hidden md:table-cell" onClick={() => handleSort('fuelCost', truckSortKey, truckSortDir, setTruckSortKey, setTruckSortDir)}>
                              <span className="flex items-center justify-end gap-1"><Fuel className="h-3 w-3 text-orange-500" />Fuel <SortIcon active={truckSortKey === 'fuelCost'} /></span>
                            </th>
                            <th className="px-3 py-3 text-right font-medium cursor-pointer hover:bg-muted/80 whitespace-nowrap hidden xl:table-cell" onClick={() => handleSort('maintenanceCost', truckSortKey, truckSortDir, setTruckSortKey, setTruckSortDir)}>
                              <span className="flex items-center justify-end gap-1"><Wrench className="h-3 w-3 text-amber-500" />Maint <SortIcon active={truckSortKey === 'maintenanceCost'} /></span>
                            </th>
                            <th className="px-3 py-3 text-right font-medium cursor-pointer hover:bg-muted/80 whitespace-nowrap hidden xl:table-cell" onClick={() => handleSort('tollCost', truckSortKey, truckSortDir, setTruckSortKey, setTruckSortDir)}>
                              Tolls <SortIcon active={truckSortKey === 'tollCost'} />
                            </th>
                            <th className="px-3 py-3 text-right font-medium cursor-pointer hover:bg-muted/80 whitespace-nowrap hidden lg:table-cell" onClick={() => handleSort('otherExpenses', truckSortKey, truckSortDir, setTruckSortKey, setTruckSortDir)}>
                              Other <SortIcon active={truckSortKey === 'otherExpenses'} />
                            </th>
                            <th className="px-3 py-3 text-right font-medium cursor-pointer hover:bg-muted/80 whitespace-nowrap" onClick={() => handleSort('totalExpenses', truckSortKey, truckSortDir, setTruckSortKey, setTruckSortDir)}>
                              Total Cost <SortIcon active={truckSortKey === 'totalExpenses'} />
                            </th>
                            <th className="px-3 py-3 text-right font-medium cursor-pointer hover:bg-muted/80 whitespace-nowrap" onClick={() => handleSort('netIncome', truckSortKey, truckSortDir, setTruckSortKey, setTruckSortDir)}>
                              Net P&L <SortIcon active={truckSortKey === 'netIncome'} />
                            </th>
                            <th className="px-3 py-3 text-right font-medium cursor-pointer hover:bg-muted/80 whitespace-nowrap" onClick={() => handleSort('margin', truckSortKey, truckSortDir, setTruckSortKey, setTruckSortDir)}>
                              Margin <SortIcon active={truckSortKey === 'margin'} />
                            </th>
                          </tr>
                        </thead>
                        <tbody>
                          {sortedTrucks.map(truck => {
                            const isLoss = truck.netIncome < 0
                            return (
                              <tr
                                key={truck.truckId}
                                className={`border-b last:border-0 hover:bg-muted/30 transition-colors ${isLoss ? 'bg-red-50/30 dark:bg-red-950/10' : ''}`}
                              >
                                <td className="px-3 py-3 font-medium whitespace-nowrap">
                                  <div className="flex items-center gap-1.5">
                                    {isLoss && <AlertTriangle className="h-3.5 w-3.5 text-red-500 shrink-0" />}
                                    <span className="text-amber-700 dark:text-amber-400">{truck.plateNumber}</span>
                                  </div>
                                  <div className="text-xs text-muted-foreground">{truck.make} {truck.model}</div>
                                </td>
                                <td className="px-3 py-3 whitespace-nowrap hidden lg:table-cell text-muted-foreground">
                                  {truck.driverName || 'Unassigned'}
                                </td>
                                <td className="px-3 py-3 text-right tabular-nums">{truck.trips}</td>
                                <td className="px-3 py-3 text-right tabular-nums font-medium text-amber-700 dark:text-amber-400">
                                  {truck.revenue > 0 ? formatCurrency(truck.revenue) : <span className="text-muted-foreground">-</span>}
                                </td>
                                <td className="px-3 py-3 text-right tabular-nums text-orange-600 dark:text-orange-400 hidden md:table-cell">
                                  {formatCurrency(truck.fuelCost)}
                                </td>
                                <td className="px-3 py-3 text-right tabular-nums text-amber-600 dark:text-amber-400 hidden xl:table-cell">
                                  {formatCurrency(truck.maintenanceCost)}
                                </td>
                                <td className="px-3 py-3 text-right tabular-nums text-violet-600 dark:text-violet-400 hidden xl:table-cell">
                                  {formatCurrency(truck.tollCost)}
                                </td>
                                <td className="px-3 py-3 text-right tabular-nums text-muted-foreground hidden lg:table-cell">
                                  {formatCurrency(truck.otherExpenses)}
                                </td>
                                <td className="px-3 py-3 text-right tabular-nums font-medium">
                                  {formatCurrency(truck.totalExpenses)}
                                </td>
                                <td className="px-3 py-3 text-right">
                                  <ProfitLossCell profit={truck.netIncome} />
                                </td>
                                <td className="px-3 py-3 text-right">
                                  <MarginCell margin={truck.margin} />
                                </td>
                              </tr>
                            )
                          })}
                        </tbody>
                        {/* Fleet Totals */}
                        {data?.summary && (
                          <tfoot>
                            <tr className="bg-muted/60 border-t-2 border-amber-300 dark:border-amber-700 font-bold">
                              <td className="px-3 py-3 whitespace-nowrap" colSpan={2}>
                                <span className="text-amber-700 dark:text-amber-400">FLEET TOTAL</span>
                              </td>
                              <td className="px-3 py-3 text-right tabular-nums">{data.summary.totalTrips}</td>
                              <td className="px-3 py-3 text-right tabular-nums text-amber-700 dark:text-amber-400">
                                {formatCurrency(data.summary.totalRevenue)}
                              </td>
                              <td className="px-3 py-3 text-right tabular-nums text-orange-600 dark:text-orange-400 hidden md:table-cell">
                                {formatCurrency(data.summary.fuelTotal || 0)}
                              </td>
                              <td className="px-3 py-3 text-right tabular-nums text-amber-600 dark:text-amber-400 hidden xl:table-cell">
                                {formatCurrency(data.summary.maintenanceTotal || 0)}
                              </td>
                              <td className="px-3 py-3 text-right tabular-nums text-violet-600 dark:text-violet-400 hidden xl:table-cell">
                                {formatCurrency(data.summary.tollsTotal || 0)}
                              </td>
                              <td className="px-3 py-3 text-right tabular-nums hidden lg:table-cell">
                                {formatCurrency((data.summary.totalExpenses || 0) - (data.summary.fuelTotal || 0) - (data.summary.maintenanceTotal || 0) - (data.summary.tollsTotal || 0))}
                              </td>
                              <td className="px-3 py-3 text-right tabular-nums">
                                {formatCurrency(data.summary.totalExpenses)}
                              </td>
                              <td className="px-3 py-3 text-right">
                                <ProfitLossCell profit={data.summary.netIncome} showIcon />
                              </td>
                              <td className="px-3 py-3 text-right">
                                <MarginCell margin={data.summary.avgMargin} />
                              </td>
                            </tr>
                          </tfoot>
                        )}
                      </table>
                    </div>
                    {/* Mobile card view */}
                    <div className="md:hidden divide-y">
                      {sortedTrucks.map(truck => (
                        <div key={truck.truckId} className={`mobile-card p-4 space-y-2 ${truck.netIncome < 0 ? 'bg-red-50/30 dark:bg-red-950/10' : ''}`}>
                          <div className="flex items-center justify-between">
                            <div className="flex items-center gap-1.5">
                              {truck.netIncome < 0 && <AlertTriangle className="h-3.5 w-3.5 text-red-500 shrink-0" />}
                              <span className="font-semibold text-amber-700 dark:text-amber-400">{truck.plateNumber}</span>
                            </div>
                            <MarginCell margin={truck.margin} />
                          </div>
                          <p className="text-xs text-muted-foreground">{truck.make} {truck.model} · {truck.driverName || 'Unassigned'}</p>
                          <div className="grid grid-cols-2 gap-2 text-sm">
                            <div>
                              <p className="text-xs text-muted-foreground">Revenue</p>
                              <p className="font-semibold">{truck.revenue > 0 ? formatCurrency(truck.revenue) : '-'}</p>
                            </div>
                            <div>
                              <p className="text-xs text-muted-foreground">Total Cost</p>
                              <p className="font-semibold">{formatCurrency(truck.totalExpenses)}</p>
                            </div>
                            <div>
                              <p className="text-xs text-muted-foreground">Fuel</p>
                              <p className="font-semibold text-orange-600 dark:text-orange-400">{formatCurrency(truck.fuelCost)}</p>
                            </div>
                            <div>
                              <p className="text-xs text-muted-foreground">Maintenance</p>
                              <p className="font-semibold text-amber-600 dark:text-amber-400">{formatCurrency(truck.maintenanceCost)}</p>
                            </div>
                            <div>
                              <p className="text-xs text-muted-foreground">Tolls + Other</p>
                              <p className="font-semibold">{formatCurrency(truck.tollCost + truck.otherExpenses)}</p>
                            </div>
                            <div>
                              <p className="text-xs text-muted-foreground">Net P&L</p>
                              <p className="font-semibold"><ProfitLossCell profit={truck.netIncome} /></p>
                            </div>
                          </div>
                          <p className="text-xs text-muted-foreground">{truck.trips} trips</p>
                        </div>
                      ))}
                    </div>
                  </>
                )}
              </CardContent>
            </Card>
          </motion.div>
        </TabsContent>

        {/* ─── Tab 2: Daily Ledger ─── */}
        <TabsContent value="daily">
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.3 }}
          >
            <Card className="gap-0 py-4">
              <CardHeader className="pb-2">
                <CardTitle className="text-base">Daily Revenue & Expense Ledger</CardTitle>
                <CardDescription>
                  Day-by-day breakdown of revenue and expenses {truckFilter !== 'all' ? `(filtered to selected truck)` : '(fleet-wide)'}
                </CardDescription>
              </CardHeader>
              <CardContent className="p-4 pt-0">
                {loading ? (
                  <div className="space-y-3">
                    {Array.from({ length: 7 }).map((_, i) => (
                      <Skeleton key={i} className="h-11 w-full rounded" />
                    ))}
                  </div>
                ) : sortedDaily.length === 0 ? (
                  <EmptyState message="No daily data found for this period" />
                ) : (
                  <>
                    <div className="hidden md:block overflow-x-auto rounded-lg border max-h-[600px] overflow-y-auto">
                      <table className="w-full text-sm">
                        <thead className="sticky top-0 z-10">
                          <tr className="bg-muted/50 border-b backdrop-blur-sm">
                            <th className="px-3 py-3 text-left font-medium cursor-pointer hover:bg-muted/80 whitespace-nowrap" onClick={() => handleSort('date', dailySortKey, dailySortDir, setDailySortKey, setDailySortDir)}>
                              Date <SortIcon active={dailySortKey === 'date'} />
                            </th>
                            <th className="px-3 py-3 text-right font-medium cursor-pointer hover:bg-muted/80 whitespace-nowrap" onClick={() => handleSort('trips', dailySortKey, dailySortDir, setDailySortKey, setDailySortDir)}>
                              Trips <SortIcon active={dailySortKey === 'trips'} />
                            </th>
                            <th className="px-3 py-3 text-right font-medium cursor-pointer hover:bg-muted/80 whitespace-nowrap" onClick={() => handleSort('revenue', dailySortKey, dailySortDir, setDailySortKey, setDailySortDir)}>
                              Revenue <SortIcon active={dailySortKey === 'revenue'} />
                            </th>
                            <th className="px-3 py-3 text-right font-medium cursor-pointer hover:bg-muted/80 whitespace-nowrap hidden md:table-cell" onClick={() => handleSort('fuelCost', dailySortKey, dailySortDir, setDailySortKey, setDailySortDir)}>
                              Fuel <SortIcon active={dailySortKey === 'fuelCost'} />
                            </th>
                            <th className="px-3 py-3 text-right font-medium cursor-pointer hover:bg-muted/80 whitespace-nowrap hidden lg:table-cell" onClick={() => handleSort('maintenanceCost', dailySortKey, dailySortDir, setDailySortKey, setDailySortDir)}>
                              Maint <SortIcon active={dailySortKey === 'maintenanceCost'} />
                            </th>
                            <th className="px-3 py-3 text-right font-medium cursor-pointer hover:bg-muted/80 whitespace-nowrap hidden lg:table-cell" onClick={() => handleSort('tollCost', dailySortKey, dailySortDir, setDailySortKey, setDailySortDir)}>
                              Tolls <SortIcon active={dailySortKey === 'tollCost'} />
                            </th>
                            <th className="px-3 py-3 text-right font-medium cursor-pointer hover:bg-muted/80 whitespace-nowrap hidden md:table-cell" onClick={() => handleSort('otherExpenses', dailySortKey, dailySortDir, setDailySortKey, setDailySortDir)}>
                              Other <SortIcon active={dailySortKey === 'otherExpenses'} />
                            </th>
                            <th className="px-3 py-3 text-right font-medium cursor-pointer hover:bg-muted/80 whitespace-nowrap" onClick={() => handleSort('totalExpenses', dailySortKey, dailySortDir, setDailySortKey, setDailySortDir)}>
                              Total Cost <SortIcon active={dailySortKey === 'totalExpenses'} />
                            </th>
                            <th className="px-3 py-3 text-right font-medium cursor-pointer hover:bg-muted/80 whitespace-nowrap" onClick={() => handleSort('netIncome', dailySortKey, dailySortDir, setDailySortKey, setDailySortDir)}>
                              Net P&L <SortIcon active={dailySortKey === 'netIncome'} />
                            </th>
                          </tr>
                        </thead>
                        <tbody>
                          {sortedDaily.map(day => {
                            const isLoss = day.netIncome < 0
                            return (
                              <tr
                                key={day.date}
                                className={`border-b last:border-0 hover:bg-muted/30 transition-colors ${isLoss ? 'bg-red-50/30 dark:bg-red-950/10' : ''}`}
                              >
                                <td className="px-3 py-3 font-medium whitespace-nowrap">
                                  <div className="flex items-center gap-1.5">
                                    {isLoss && <TrendingDown className="h-3.5 w-3.5 text-red-500 shrink-0" />}
                                    {!isLoss && day.netIncome > 0 && <TrendingUp className="h-3.5 w-3.5 text-emerald-500 shrink-0" />}
                                    {new Date(day.date + 'T00:00:00').toLocaleDateString('en-GB', {
                                      weekday: 'short',
                                      day: '2-digit',
                                      month: 'short',
                                    })}
                                  </div>
                                </td>
                                <td className="px-3 py-3 text-right tabular-nums">{day.trips}</td>
                                <td className="px-3 py-3 text-right tabular-nums font-medium text-amber-700 dark:text-amber-400">
                                  {day.revenue > 0 ? formatCurrency(day.revenue) : <span className="text-muted-foreground">-</span>}
                                </td>
                                <td className="px-3 py-3 text-right tabular-nums text-orange-600 dark:text-orange-400 hidden md:table-cell">
                                  {formatCurrency(day.fuelCost)}
                                </td>
                                <td className="px-3 py-3 text-right tabular-nums text-amber-600 dark:text-amber-400 hidden lg:table-cell">
                                  {formatCurrency(day.maintenanceCost)}
                                </td>
                                <td className="px-3 py-3 text-right tabular-nums text-violet-600 dark:text-violet-400 hidden lg:table-cell">
                                  {formatCurrency(day.tollCost)}
                                </td>
                                <td className="px-3 py-3 text-right tabular-nums text-muted-foreground hidden md:table-cell">
                                  {formatCurrency(day.otherExpenses)}
                                </td>
                                <td className="px-3 py-3 text-right tabular-nums font-medium">
                                  {formatCurrency(day.totalExpenses)}
                                </td>
                                <td className="px-3 py-3 text-right">
                                  <ProfitLossCell profit={day.netIncome} />
                                </td>
                              </tr>
                            )
                          })}
                        </tbody>
                        {/* Period Totals */}
                        {data?.summary && (
                          <tfoot>
                            <tr className="bg-muted/60 border-t-2 border-amber-300 dark:border-amber-700 font-bold">
                              <td className="px-3 py-3 whitespace-nowrap">
                                <span className="text-amber-700 dark:text-amber-400">PERIOD TOTAL</span>
                              </td>
                              <td className="px-3 py-3 text-right tabular-nums">{data.summary.totalTrips}</td>
                              <td className="px-3 py-3 text-right tabular-nums text-amber-700 dark:text-amber-400">
                                {formatCurrency(data.summary.totalRevenue)}
                              </td>
                              <td className="px-3 py-3 text-right tabular-nums text-orange-600 dark:text-orange-400 hidden md:table-cell">
                                {formatCurrency(data.summary.fuelTotal || 0)}
                              </td>
                              <td className="px-3 py-3 text-right tabular-nums text-amber-600 dark:text-amber-400 hidden lg:table-cell">
                                {formatCurrency(data.summary.maintenanceTotal || 0)}
                              </td>
                              <td className="px-3 py-3 text-right tabular-nums text-violet-600 dark:text-violet-400 hidden lg:table-cell">
                                {formatCurrency(data.summary.tollsTotal || 0)}
                              </td>
                              <td className="px-3 py-3 text-right tabular-nums hidden md:table-cell">
                                {formatCurrency((data.summary.totalExpenses || 0) - (data.summary.fuelTotal || 0) - (data.summary.maintenanceTotal || 0) - (data.summary.tollsTotal || 0))}
                              </td>
                              <td className="px-3 py-3 text-right tabular-nums">
                                {formatCurrency(data.summary.totalExpenses)}
                              </td>
                              <td className="px-3 py-3 text-right">
                                <ProfitLossCell profit={data.summary.netIncome} showIcon />
                              </td>
                            </tr>
                          </tfoot>
                        )}
                      </table>
                    </div>
                    {/* Mobile card view */}
                    <div className="md:hidden divide-y">
                      {sortedDaily.map(day => (
                        <div key={day.date} className={`mobile-card p-4 space-y-2 ${day.netIncome < 0 ? 'bg-red-50/30 dark:bg-red-950/10' : ''}`}>
                          <div className="flex items-center justify-between">
                            <div className="flex items-center gap-1.5">
                              {day.netIncome < 0 ? (
                                <TrendingDown className="h-3.5 w-3.5 text-red-500 shrink-0" />
                              ) : day.netIncome > 0 ? (
                                <TrendingUp className="h-3.5 w-3.5 text-emerald-500 shrink-0" />
                              ) : null}
                              <span className="font-semibold text-sm">
                                {new Date(day.date + 'T00:00:00').toLocaleDateString('en-GB', {
                                  weekday: 'short',
                                  day: '2-digit',
                                  month: 'short',
                                })}
                              </span>
                            </div>
                            <ProfitLossCell profit={day.netIncome} />
                          </div>
                          <p className="text-xs text-muted-foreground">{day.trips} trips</p>
                          <div className="grid grid-cols-2 gap-2 text-sm">
                            <div>
                              <p className="text-xs text-muted-foreground">Revenue</p>
                              <p className="font-semibold">{day.revenue > 0 ? formatCurrency(day.revenue) : '-'}</p>
                            </div>
                            <div>
                              <p className="text-xs text-muted-foreground">Total Cost</p>
                              <p className="font-semibold">{formatCurrency(day.totalExpenses)}</p>
                            </div>
                            <div>
                              <p className="text-xs text-muted-foreground">Fuel</p>
                              <p className="font-semibold text-orange-600 dark:text-orange-400">{formatCurrency(day.fuelCost)}</p>
                            </div>
                            <div>
                              <p className="text-xs text-muted-foreground">Other Costs</p>
                              <p className="font-semibold">{formatCurrency(day.maintenanceCost + day.tollCost + day.otherExpenses)}</p>
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
        </TabsContent>

        {/* ─── Tab 3: Charts ─── */}
        <TabsContent value="charts">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            {/* Daily Revenue vs Expenses Trend */}
            {loading ? <ChartSkeleton /> : (
              <motion.div
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.4, delay: 0.1 }}
                className="lg:col-span-2"
              >
                <Card className="gap-0 py-4">
                  <CardHeader className="pb-2">
                    <CardTitle className="text-base">Daily Revenue vs Expenses</CardTitle>
                    <CardDescription>Trend line showing daily revenue, expenses, and net P&L</CardDescription>
                  </CardHeader>
                  <CardContent className="p-4 pt-0">
                    {dailyTrendData.length === 0 ? (
                      <EmptyState message="No trend data available" />
                    ) : (
                      <ChartContainer config={dailyTrendConfig} className="h-[350px] w-full">
                        <LineChart data={dailyTrendData} margin={{ top: 5, right: 20, left: 10, bottom: 5 }}>
                          <CartesianGrid vertical={false} strokeDasharray="3 3" />
                          <XAxis
                            dataKey="date"
                            tickLine={false}
                            axisLine={false}
                            fontSize={11}
                            interval="preserveStartEnd"
                          />
                          <YAxis
                            tickLine={false}
                            axisLine={false}
                            fontSize={12}
                            tickFormatter={v => v >= 1000 ? `${(v / 1000).toFixed(0)}k` : String(v)}
                          />
                          <ChartTooltip
                            content={<ChartTooltipContent formatter={(value) => formatCurrency(value as number)} />}
                          />
                          <ChartLegend />
                          <Line type="monotone" dataKey="revenue" stroke="hsl(38, 92%, 50%)" strokeWidth={2} dot={false} />
                          <Line type="monotone" dataKey="expenses" stroke="hsl(0, 84%, 60%)" strokeWidth={2} dot={false} />
                          <Line type="monotone" dataKey="net" stroke="hsl(142, 71%, 45%)" strokeWidth={2} dot={false} strokeDasharray="5 5" />
                        </LineChart>
                      </ChartContainer>
                    )}
                  </CardContent>
                </Card>
              </motion.div>
            )}

            {/* Truck P&L Bar Chart */}
            {loading ? <ChartSkeleton /> : (
              <motion.div
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.4, delay: 0.15 }}
              >
                <Card className="gap-0 py-4">
                  <CardHeader className="pb-2">
                    <CardTitle className="text-base">Net P&L by Truck</CardTitle>
                    <CardDescription>Profit (green) vs Loss (red) comparison across trucks</CardDescription>
                  </CardHeader>
                  <CardContent className="p-4 pt-0">
                    {truckBarData.length === 0 ? (
                      <EmptyState message="No truck comparison data" />
                    ) : (
                      <ChartContainer config={truckProfitConfig} className="h-[300px] w-full">
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

            {/* Expense Breakdown Pie */}
            {loading ? <ChartSkeleton /> : (
              <motion.div
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.4, delay: 0.2 }}
              >
                <Card className="gap-0 py-4">
                  <CardHeader className="pb-2">
                    <CardTitle className="text-base">Expense Breakdown</CardTitle>
                    <CardDescription>Distribution of total expenses by category</CardDescription>
                  </CardHeader>
                  <CardContent className="p-4 pt-0">
                    {expensePieData.length <= 1 && expensePieData[0]?.name === 'No Data' ? (
                      <EmptyState message="No expense data available" />
                    ) : (
                      <ChartContainer config={expensePieConfig} className="h-[300px] w-full">
                        <PieChart>
                          <ChartTooltip
                            content={<ChartTooltipContent formatter={(value) => formatCurrency(value as number)} />}
                          />
                          <Pie
                            data={expensePieData}
                            cx="50%"
                            cy="50%"
                            innerRadius={60}
                            outerRadius={100}
                            paddingAngle={3}
                            dataKey="value"
                            label={({ name, percent }) => `${name} ${(percent * 100).toFixed(0)}%`}
                            labelLine={false}
                            fontSize={11}
                          >
                            {expensePieData.map((_, index) => (
                              <Cell key={`cell-${index}`} fill={pieColors[index % pieColors.length]} />
                            ))}
                          </Pie>
                          <ChartLegend />
                        </PieChart>
                      </ChartContainer>
                    )}
                  </CardContent>
                </Card>
              </motion.div>
            )}
          </div>
        </TabsContent>
      </Tabs>
    </div>
  )
}
