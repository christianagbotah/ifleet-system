'use client'

import React, { useState, useEffect, useCallback, useMemo } from 'react'
import { motion } from 'framer-motion'
import {
  ShieldCheck,
  CarFront,
  FileCheck,
  Users,
  CreditCard,
  AlertTriangle,
  XCircle,
  CheckCircle2,
  Clock,
  RefreshCw,
  Filter,
  ChevronDown,
  Eye,
  ArrowRight,
  ShieldAlert,
} from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Skeleton } from '@/components/ui/skeleton'
import { Progress } from '@/components/ui/progress'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Input } from '@/components/ui/input'
import { EmptyState } from '@/components/ui/empty-state'
import { apiFetch } from '@/lib/api'
import { cn } from '@/lib/utils'

// ============ Types ============

type ExpiryStatus = 'expired' | 'critical' | 'warning' | 'valid'

interface ExpiryItem {
  type: string
  id: string
  entityId: string
  name: string
  description: string
  expiryDate: string
  daysRemaining: number
  status: ExpiryStatus
  entityLabel: string
  actionUrl: string
}

interface CategorySummary {
  total: number
  expired: number
  critical: number
  warning: number
  valid: number
  items: ExpiryItem[]
}

interface ComplianceDashboardData {
  summary: {
    total: number
    expired: number
    critical: number
    warning: number
    valid: number
  }
  categories: {
    insurance: CategorySummary
    roadworthy: CategorySummary
    dvla: CategorySummary
    driverLicenses: CategorySummary
    ghanaCards: CategorySummary
  }
  allItems: ExpiryItem[]
}

// ============ Constants ============

const STATUS_CONFIG: Record<ExpiryStatus, {
  label: string
  color: string
  bg: string
  border: string
  dot: string
  text: string
  icon: React.ComponentType<{ className?: string }>
}> = {
  expired: {
    label: 'Expired',
    color: 'bg-red-500',
    bg: 'bg-red-50 dark:bg-red-950/30',
    border: 'border-l-red-500',
    dot: 'bg-red-500',
    text: 'text-red-600 dark:text-red-400',
    icon: XCircle,
  },
  critical: {
    label: 'Critical',
    color: 'bg-orange-500',
    bg: 'bg-orange-50 dark:bg-orange-950/30',
    border: 'border-l-orange-500',
    dot: 'bg-orange-500',
    text: 'text-orange-600 dark:text-orange-400',
    icon: AlertTriangle,
  },
  warning: {
    label: 'Warning',
    color: 'bg-amber-500',
    bg: 'bg-amber-50 dark:bg-amber-950/30',
    border: 'border-l-amber-500',
    dot: 'bg-amber-500',
    text: 'text-amber-600 dark:text-amber-400',
    icon: Clock,
  },
  valid: {
    label: 'Valid',
    color: 'bg-emerald-500',
    bg: 'bg-emerald-50 dark:bg-emerald-950/30',
    border: 'border-l-emerald-500',
    dot: 'bg-emerald-500',
    text: 'text-emerald-600 dark:text-emerald-400',
    icon: CheckCircle2,
  },
}

const TYPE_CONFIG: Record<string, {
  label: string
  icon: React.ComponentType<{ className?: string }>
  color: string
}> = {
  insurance: { label: 'Insurance', icon: ShieldCheck, color: 'text-amber-600' },
  roadworthy: { label: 'Roadworthy', icon: CarFront, color: 'text-sky-600' },
  dvla: { label: 'DVLA Registration', icon: FileCheck, color: 'text-violet-600' },
  driverLicenses: { label: 'Driver License', icon: Users, color: 'text-teal-600' },
  ghanaCards: { label: 'Ghana Card', icon: CreditCard, color: 'text-rose-600' },
}

const CATEGORY_KEYS = ['insurance', 'roadworthy', 'dvla', 'driverLicenses', 'ghanaCards'] as const

const ANIMATION_CONTAINER = { show: { transition: { staggerChildren: 0.04 } } }
const ANIMATION_ITEM = { show: { opacity: 1, y: 0 } }

// ============ Sub-Components ============

function SummaryCard({
  title,
  count,
  icon: Icon,
  bgColor,
  textColor,
  borderColor,
  loading,
  onClick,
  active,
}: {
  title: string
  count: number
  icon: React.ComponentType<{ className?: string }>
  bgColor: string
  textColor: string
  borderColor: string
  loading: boolean
  onClick: () => void
  active: boolean
}) {
  return (
    <motion.div variants={ANIMATION_ITEM} initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }}>
      <Card
        className={cn(
          'cursor-pointer transition-all hover:shadow-md border-l-4',
          borderColor,
          active && 'ring-2 ring-primary ring-offset-2 ring-offset-background'
        )}
        onClick={onClick}
      >
        <CardContent className="p-4">
          <div className="flex items-center justify-between">
            <div className="space-y-1">
              <p className="text-sm text-muted-foreground">{title}</p>
              {loading ? (
                <Skeleton className="h-8 w-12" />
              ) : (
                <p className={cn('text-3xl font-bold', textColor)}>{count}</p>
              )}
            </div>
            <div className={cn('rounded-lg p-2.5', bgColor)}>
              <Icon className={cn('h-5 w-5', textColor)} />
            </div>
          </div>
        </CardContent>
      </Card>
    </motion.div>
  )
}

function DaysBadge({ days, status }: { days: number; status: ExpiryStatus }) {
  if (days < 0) {
    return (
      <Badge variant="outline" className="border-red-300 dark:border-red-800 bg-red-50 dark:bg-red-950/30 text-red-600 dark:text-red-400 font-semibold">
        <XCircle className="h-3 w-3 mr-1" />
        Expired {Math.abs(days)}d ago
      </Badge>
    )
  }
  if (days === 0) {
    return (
      <Badge variant="outline" className="border-red-300 dark:border-red-800 bg-red-50 dark:bg-red-950/30 text-red-600 dark:text-red-400 font-semibold">
        <XCircle className="h-3 w-3 mr-1" />
        Today
      </Badge>
    )
  }
  if (status === 'critical') {
    return (
      <Badge variant="outline" className="border-orange-300 dark:border-orange-800 bg-orange-50 dark:bg-orange-950/30 text-orange-600 dark:text-orange-400 font-semibold">
        <AlertTriangle className="h-3 w-3 mr-1" />
        {days}d left
      </Badge>
    )
  }
  if (status === 'warning') {
    return (
      <Badge variant="outline" className="border-amber-300 dark:border-amber-800 bg-amber-50 dark:bg-amber-950/30 text-amber-600 dark:text-amber-400">
        <Clock className="h-3 w-3 mr-1" />
        {days}d left
      </Badge>
    )
  }
  return (
    <Badge variant="outline" className="border-emerald-300 dark:border-emerald-800 bg-emerald-50 dark:bg-emerald-950/30 text-emerald-600 dark:text-emerald-400">
      <CheckCircle2 className="h-3 w-3 mr-1" />
      {days}d
    </Badge>
  )
}

function ExpiryCard({ item, index }: { item: ExpiryItem; index: number }) {
  const typeConfig = TYPE_CONFIG[item.type] || TYPE_CONFIG.insurance
  const statusConfig = STATUS_CONFIG[item.status]
  const TypeIcon = typeConfig.icon

  const formattedDate = new Date(item.expiryDate).toLocaleDateString('en-GB', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  })

  return (
    <motion.div
      key={`${item.type}-${item.id}`}
      variants={ANIMATION_ITEM}
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: Math.min(index * 0.03, 0.5) }}
    >
      <Card
        className={cn(
          'border-l-4 transition-all hover:shadow-md',
          statusConfig.border,
          item.status === 'expired' && 'bg-red-50/50 dark:bg-red-950/10',
        )}
      >
        <CardContent className="p-4">
          <div className="flex items-start gap-3">
            {/* Traffic light dot */}
            <div className="flex flex-col items-center gap-1 pt-0.5">
              <div className={cn('h-2.5 w-2.5 rounded-full', statusConfig.dot)} />
            </div>

            {/* Type icon */}
            <div className={cn('rounded-md bg-muted p-2 shrink-0')}>
              <TypeIcon className={cn('h-4 w-4', typeConfig.color)} />
            </div>

            {/* Content */}
            <div className="flex-1 min-w-0">
              <div className="flex items-center justify-between gap-2">
                <div className="min-w-0">
                  <p className="text-sm font-semibold truncate">{item.entityLabel}</p>
                  <p className="text-xs text-muted-foreground truncate mt-0.5">{item.description}</p>
                </div>
                <DaysBadge days={item.daysRemaining} status={item.status} />
              </div>

              <div className="flex items-center justify-between mt-2.5">
                <div className="flex items-center gap-2">
                  <Badge variant="secondary" className="text-xs font-normal">
                    {typeConfig.label}
                  </Badge>
                  <span className="text-xs text-muted-foreground">
                    Expires: {formattedDate}
                  </span>
                </div>
                <Button variant="ghost" size="sm" className="h-7 text-xs gap-1 text-muted-foreground hover:text-foreground">
                  <Eye className="h-3 w-3" />
                  View
                </Button>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>
    </motion.div>
  )
}

function CategoryHealthBar({
  categoryKey,
  category,
}: {
  categoryKey: string
  category: CategorySummary
}) {
  const typeConfig = TYPE_CONFIG[categoryKey]
  if (!typeConfig) return null

  const Icon = typeConfig.icon
  const total = category.total
  const validCount = category.valid
  const problemCount = category.expired + category.critical + category.warning
  const compliancePct = total > 0 ? Math.round((validCount / total) * 100) : 100

  const barColor = compliancePct >= 80
    ? 'bg-emerald-500'
    : compliancePct >= 50
      ? 'bg-amber-500'
      : 'bg-red-500'

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Icon className={cn('h-4 w-4', typeConfig.color)} />
          <span className="text-sm font-medium">{typeConfig.label}</span>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-xs text-muted-foreground">
            {validCount}/{total} valid
          </span>
          <span className={cn('text-sm font-semibold tabular-nums', compliancePct >= 80 ? 'text-emerald-600' : compliancePct >= 50 ? 'text-amber-600' : 'text-red-600')}>
            {compliancePct}%
          </span>
        </div>
      </div>
      <div className="flex gap-0.5">
        <div className={cn('h-2 rounded-full transition-all', barColor)} style={{ width: `${compliancePct}%` }} />
        {problemCount > 0 && (
          <div className="h-2 rounded-full bg-red-200 dark:bg-red-900/40 transition-all" style={{ width: `${100 - compliancePct}%` }} />
        )}
      </div>
      {problemCount > 0 && (
        <div className="flex gap-3 text-xs text-muted-foreground">
          {category.expired > 0 && (
            <span className="text-red-600 dark:text-red-400">{category.expired} expired</span>
          )}
          {category.critical > 0 && (
            <span className="text-orange-600 dark:text-orange-400">{category.critical} critical</span>
          )}
          {category.warning > 0 && (
            <span className="text-amber-600 dark:text-amber-400">{category.warning} warning</span>
          )}
        </div>
      )}
    </div>
  )
}

function DashboardSkeleton() {
  return (
    <div className="space-y-6">
      {/* Header skeleton */}
      <div>
        <Skeleton className="h-8 w-72 mb-2" />
        <Skeleton className="h-4 w-96" />
      </div>
      {/* Summary cards skeleton */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
        {[1, 2, 3, 4].map(i => (
          <Skeleton key={i} className="h-24 w-full rounded-lg" />
        ))}
      </div>
      {/* Filter bar skeleton */}
      <Skeleton className="h-14 w-full rounded-lg" />
      {/* Items skeleton */}
      <div className="space-y-3">
        {[1, 2, 3, 4, 5].map(i => (
          <Skeleton key={i} className="h-24 w-full rounded-lg" />
        ))}
      </div>
    </div>
  )
}

// ============ Main Component ============

export function ComplianceDashboardView() {
  const [data, setData] = useState<ComplianceDashboardData | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  // Filters
  const [categoryFilter, setCategoryFilter] = useState<string>('all')
  const [statusFilter, setStatusFilter] = useState<string>('all')
  const [daysAhead, setDaysAhead] = useState<number>(90)
  const [daysInput, setDaysInput] = useState<string>('90')
  const [summaryStatusFilter, setSummaryStatusFilter] = useState<string | null>(null)

  const loadData = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const result = await apiFetch<ComplianceDashboardData>(
        `/api/compliance/expiry-dashboard?daysAhead=${daysAhead}`
      )
      setData(result)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load compliance data')
    } finally {
      setLoading(false)
    }
  }, [daysAhead])

  useEffect(() => {
    loadData()
  }, [loadData])

  // Filtered items
  const filteredItems = useMemo(() => {
    if (!data) return []

    let items = data.allItems

    // Category filter
    if (categoryFilter !== 'all') {
      items = items.filter(i => i.type === categoryFilter)
    }

    // Status filter (from filter bar)
    if (statusFilter !== 'all') {
      items = items.filter(i => i.status === statusFilter)
    }

    // Status filter from summary card click
    if (summaryStatusFilter) {
      items = items.filter(i => i.status === summaryStatusFilter)
    }

    return items
  }, [data, categoryFilter, statusFilter, summaryStatusFilter])

  // Handle summary card click
  function handleSummaryClick(status: string | null) {
    setSummaryStatusFilter(prev => prev === status ? null : status)
    // Clear the filter bar status when clicking summary
    if (status) setStatusFilter('all')
  }

  // Handle days ahead change
  function handleDaysChange(value: string) {
    const parsed = parseInt(value, 10)
    if (!isNaN(parsed) && parsed > 0) {
      setDaysAhead(parsed)
      setDaysInput(value)
    }
  }

  // Reset all filters
  function resetFilters() {
    setCategoryFilter('all')
    setStatusFilter('all')
    setSummaryStatusFilter(null)
    setDaysAhead(90)
    setDaysInput('90')
  }

  const hasActiveFilters = categoryFilter !== 'all' || statusFilter !== 'all' || summaryStatusFilter !== null || daysAhead !== 90

  // Compliance health percentage
  const overallCompliance = useMemo(() => {
    if (!data) return 100
    const total = data.summary.total
    if (total === 0) return 100
    const valid = data.summary.valid
    return Math.round((valid / total) * 100)
  }, [data])

  return (
    <motion.div
      variants={ANIMATION_CONTAINER}
      animate="show"
      className="space-y-4 sm:space-y-6"
    >
      {/* Header */}
      <motion.div variants={ANIMATION_ITEM} initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }}>
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold tracking-tight flex items-center gap-2">
              <ShieldAlert className="h-6 w-6 text-amber-500" />
              Compliance Dashboard
            </h1>
            <p className="text-muted-foreground mt-1">
              Monitor all expiring documents across your fleet — insurance, roadworthy, DVLA, licenses &amp; Ghana Cards
            </p>
          </div>
          <Button variant="outline" size="sm" onClick={loadData} disabled={loading} className="shrink-0">
            <RefreshCw className={cn('h-4 w-4 mr-2', loading && 'animate-spin')} />
            Refresh
          </Button>
        </div>
      </motion.div>

      {loading && !data ? (
        <DashboardSkeleton />
      ) : error ? (
        <Card className="border-red-200 bg-red-50 dark:border-red-900/50 dark:bg-red-950/30">
          <CardContent className="p-6 text-center">
            <XCircle className="h-8 w-8 text-red-500 mx-auto mb-3" />
            <p className="text-sm text-red-600 dark:text-red-400 mb-3">{error}</p>
            <Button variant="outline" size="sm" onClick={loadData}>
              <RefreshCw className="h-3.5 w-3.5 mr-2" />
              Retry
            </Button>
          </CardContent>
        </Card>
      ) : (
        <>
          {/* Summary Cards */}
          <motion.div variants={ANIMATION_ITEM}>
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
              <SummaryCard
                title="Expired"
                count={data?.summary.expired ?? 0}
                icon={XCircle}
                bgColor="bg-red-500/10"
                textColor="text-red-600 dark:text-red-400"
                borderColor="border-l-red-500"
                loading={loading}
                onClick={() => handleSummaryClick('expired')}
                active={summaryStatusFilter === 'expired'}
              />
              <SummaryCard
                title="Critical (≤7 days)"
                count={data?.summary.critical ?? 0}
                icon={AlertTriangle}
                bgColor="bg-orange-500/10"
                textColor="text-orange-600 dark:text-orange-400"
                borderColor="border-l-orange-500"
                loading={loading}
                onClick={() => handleSummaryClick('critical')}
                active={summaryStatusFilter === 'critical'}
              />
              <SummaryCard
                title="Warning (≤30 days)"
                count={data?.summary.warning ?? 0}
                icon={Clock}
                bgColor="bg-amber-500/10"
                textColor="text-amber-600 dark:text-amber-400"
                borderColor="border-l-amber-500"
                loading={loading}
                onClick={() => handleSummaryClick('warning')}
                active={summaryStatusFilter === 'warning'}
              />
              <SummaryCard
                title="Valid"
                count={data?.summary.valid ?? 0}
                icon={CheckCircle2}
                bgColor="bg-emerald-500/10"
                textColor="text-emerald-600 dark:text-emerald-400"
                borderColor="border-l-emerald-500"
                loading={loading}
                onClick={() => handleSummaryClick('valid')}
                active={summaryStatusFilter === 'valid'}
              />
            </div>
          </motion.div>

          {/* Filter Bar */}
          <motion.div variants={ANIMATION_ITEM}>
            <Card className="gap-0 py-3">
              <CardContent className="p-4">
                <div className="flex flex-col sm:flex-row gap-3 items-start sm:items-end">
                  <div className="flex-1 min-w-[160px]">
                    <label className="text-xs font-medium text-muted-foreground mb-1.5 block">
                      <Filter className="h-3 w-3 inline mr-1" />
                      Category
                    </label>
                    <Select value={categoryFilter} onValueChange={setCategoryFilter}>
                      <SelectTrigger className="w-full sm:w-48">
                        <SelectValue placeholder="All Categories" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="all">All Categories</SelectItem>
                        {CATEGORY_KEYS.map(key => (
                          <SelectItem key={key} value={key}>
                            {TYPE_CONFIG[key]?.label || key}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>

                  <div className="min-w-[140px]">
                    <label className="text-xs font-medium text-muted-foreground mb-1.5 block">Status</label>
                    <Select value={statusFilter} onValueChange={setStatusFilter}>
                      <SelectTrigger className="w-full sm:w-36">
                        <SelectValue placeholder="All Statuses" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="all">All Statuses</SelectItem>
                        <SelectItem value="expired">
                          <span className="flex items-center gap-1.5">
                            <span className="h-2 w-2 rounded-full bg-red-500" /> Expired
                          </span>
                        </SelectItem>
                        <SelectItem value="critical">
                          <span className="flex items-center gap-1.5">
                            <span className="h-2 w-2 rounded-full bg-orange-500" /> Critical
                          </span>
                        </SelectItem>
                        <SelectItem value="warning">
                          <span className="flex items-center gap-1.5">
                            <span className="h-2 w-2 rounded-full bg-amber-500" /> Warning
                          </span>
                        </SelectItem>
                        <SelectItem value="valid">
                          <span className="flex items-center gap-1.5">
                            <span className="h-2 w-2 rounded-full bg-emerald-500" /> Valid
                          </span>
                        </SelectItem>
                      </SelectContent>
                    </Select>
                  </div>

                  <div className="min-w-[120px]">
                    <label className="text-xs font-medium text-muted-foreground mb-1.5 block">Days Ahead</label>
                    <Input
                      type="number"
                      min="1"
                      max="365"
                      value={daysInput}
                      onChange={e => setDaysInput(e.target.value)}
                      onBlur={e => handleDaysChange(e.target.value)}
                      onKeyDown={e => { if (e.key === 'Enter') handleDaysChange(daysInput) }}
                      className="w-full sm:w-28"
                    />
                  </div>

                  {hasActiveFilters && (
                    <Button variant="ghost" size="sm" onClick={resetFilters} className="shrink-0">
                      Clear Filters
                    </Button>
                  )}
                </div>
              </CardContent>
            </Card>
          </motion.div>

          {/* Main Content - Expiry List */}
          <motion.div variants={ANIMATION_ITEM}>
            <div className="space-y-3">
              {/* List header */}
              <div className="flex items-center justify-between px-1">
                <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider">
                  Expiring Documents
                  <span className="ml-2 text-xs font-normal normal-case">
                    ({filteredItems.length} item{filteredItems.length !== 1 ? 's' : ''})
                  </span>
                </h2>
                {(summaryStatusFilter || statusFilter !== 'all') && (
                  <Badge variant="outline" className="text-xs">
                    {summaryStatusFilter || statusFilter}
                  </Badge>
                )}
              </div>

              {/* Item list */}
              <div className="max-h-[600px] overflow-y-auto space-y-2 pr-1">
                {filteredItems.length === 0 ? (
                  <EmptyState
                    icon={CheckCircle2}
                    title={data?.summary.total === 0 ? 'No Documents Tracked' : 'All Clear!'}
                    description={
                      data?.summary.total === 0
                        ? 'No expiring documents found. Add insurance policies, roadworthy certificates, DVLA registrations, and driver documents to start tracking.'
                        : hasActiveFilters
                          ? 'No documents match the selected filters. Try adjusting your criteria.'
                          : 'All fleet documents are compliant and within their validity periods. Great work!'
                    }
                    action={hasActiveFilters ? { label: 'Clear Filters', onClick: resetFilters } : undefined}
                  />
                ) : (
                  filteredItems.map((item, index) => (
                    <ExpiryCard key={`${item.type}-${item.id}-${index}`} item={item} index={index} />
                  ))
                )}
              </div>
            </div>
          </motion.div>

          {/* Bottom Section - Category Breakdown */}
          <motion.div variants={ANIMATION_ITEM}>
            <Card className="gap-0 py-4">
              <CardHeader className="pb-2 px-4">
                <CardTitle className="text-base">Compliance Health by Category</CardTitle>
                <CardDescription>
                  Overall fleet compliance: <span className={cn('font-semibold', overallCompliance >= 80 ? 'text-emerald-600' : overallCompliance >= 50 ? 'text-amber-600' : 'text-red-600')}>{overallCompliance}%</span>
                </CardDescription>
              </CardHeader>
              <CardContent className="p-4 pt-0 space-y-4">
                {/* Overall compliance bar */}
                <div className="space-y-1.5">
                  <Progress
                    value={overallCompliance}
                    className={cn(
                      'h-3',
                      overallCompliance >= 80 && '[&>div]:bg-emerald-500',
                      overallCompliance >= 50 && overallCompliance < 80 && '[&>div]:bg-amber-500',
                      overallCompliance < 50 && '[&>div]:bg-red-500',
                    )}
                  />
                </div>

                {/* Per-category breakdown */}
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 mt-4">
                  {CATEGORY_KEYS.map(key => {
                    const cat = data?.categories[key]
                    if (!cat || cat.total === 0) return null
                    return (
                      <CategoryHealthBar
                        key={key}
                        categoryKey={key}
                        category={cat}
                      />
                    )
                  })}
                </div>
              </CardContent>
            </Card>
          </motion.div>
        </>
      )}
    </motion.div>
  )
}

export default ComplianceDashboardView
