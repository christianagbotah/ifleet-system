'use client'

import * as React from 'react'
import { motion } from 'framer-motion'
import {
  Truck, Users, AlertTriangle, Wrench, Fuel, ArrowUp, ArrowDown, Minus, ShieldAlert, ChevronRight,
} from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Skeleton } from '@/components/ui/skeleton'
import { fetchFleetHealth, type FleetHealthData } from '@/lib/api'

// ─── Types ───────────────────────────────────────────────

interface FleetHealthWidgetProps {
  onNavigate?: (page: string) => void
}

// ─── Animation variants ─────────────────────────────────

const containerVariants = {
  show: { transition: { staggerChildren: 0.08 } },
}

const itemVariants = {
  show: { opacity: 1, y: 0 },
}

// ─── Health Score Ring ──────────────────────────────────

function HealthScoreRing({ score, size = 120 }: { score: number; size?: number }) {
  const strokeWidth = 10
  const radius = (size - strokeWidth) / 2
  const circumference = 2 * Math.PI * radius
  const progress = (score / 100) * circumference
  const center = size / 2

  // Color thresholds
  const color =
    score >= 80
      ? '#22c55e' // green
      : score >= 60
        ? '#f59e0b' // amber
        : '#ef4444' // red

  const label =
    score >= 80
      ? 'Excellent'
      : score >= 60
        ? 'Fair'
        : 'Needs Attention'

  return (
    <div className="relative inline-flex items-center justify-center">
      <svg width={size} height={size} className="transform -rotate-90">
        {/* Background circle */}
        <circle
          cx={center}
          cy={center}
          r={radius}
          fill="none"
          stroke="hsl(var(--muted))"
          strokeWidth={strokeWidth}
          className="opacity-20"
        />
        {/* Progress circle */}
        <motion.circle
          cx={center}
          cy={center}
          r={radius}
          fill="none"
          stroke={color}
          strokeWidth={strokeWidth}
          strokeLinecap="round"
          strokeDasharray={circumference}
          initial={{ strokeDashoffset: circumference }}
          animate={{ strokeDashoffset: circumference - progress }}
          transition={{ duration: 1.2, ease: 'easeOut', delay: 0.3 }}
        />
      </svg>
      {/* Center text */}
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <motion.span
          className="text-2xl sm:text-3xl font-bold"
          style={{ color }}
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.8 }}
        >
          {score}
        </motion.span>
        <span className="text-[10px] sm:text-xs text-muted-foreground font-medium leading-none mt-0.5">
          {label}
        </span>
      </div>
    </div>
  )
}

// ─── Quick Stat Pill ────────────────────────────────────

function QuickStat({
  icon: Icon,
  label,
  value,
  subValue,
  color,
}: {
  icon: React.ElementType
  label: string
  value: string | number
  subValue?: string
  color: string
}) {
  return (
    <div className="flex items-center gap-2.5 p-2 rounded-lg bg-muted/40">
      <div className={`rounded-md p-1.5 ${color}`}>
        <Icon className="h-3.5 w-3.5" />
      </div>
      <div className="min-w-0">
        <p className="text-xs font-semibold leading-tight">{value}</p>
        <p className="text-[10px] text-muted-foreground truncate">{label}</p>
        {subValue && (
          <p className="text-[10px] text-muted-foreground truncate">{subValue}</p>
        )}
      </div>
    </div>
  )
}

// ─── Issue Row ──────────────────────────────────────────

function IssueRow({
  issue,
  onClick,
}: {
  issue: FleetHealthData['topIssues'][number]
  onClick?: () => void
}) {
  const severityConfig = {
    high: {
      bg: 'bg-red-100 dark:bg-red-900/25',
      icon: AlertTriangle,
      iconColor: 'text-red-600 dark:text-red-400',
    },
    medium: {
      bg: 'bg-amber-100 dark:bg-amber-900/25',
      icon: ShieldAlert,
      iconColor: 'text-amber-600 dark:text-amber-400',
    },
    low: {
      bg: 'bg-sky-100 dark:bg-sky-900/25',
      icon: AlertTriangle,
      iconColor: 'text-sky-600 dark:text-sky-400',
    },
  }

  const config = severityConfig[issue.severity]
  const IconComp = config.icon

  return (
    <button
      type="button"
      onClick={onClick}
      className="flex items-center gap-3 p-2.5 rounded-lg hover:bg-muted/60 transition-colors w-full text-left group cursor-pointer min-h-[44px]"
    >
      <div className={`rounded-md p-1.5 ${config.bg} shrink-0`}>
        <IconComp className={`h-3.5 w-3.5 ${config.iconColor}`} />
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium truncate">{issue.title}</p>
      </div>
      <ChevronRight className="h-4 w-4 text-muted-foreground shrink-0 opacity-0 group-hover:opacity-100 transition-opacity" />
    </button>
  )
}

// ─── Loading Skeleton ───────────────────────────────────

function FleetHealthSkeleton() {
  return (
    <Card>
      <CardHeader className="pb-3">
        <Skeleton className="h-5 w-36" />
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Score ring skeleton */}
        <div className="flex justify-center">
          <Skeleton className="h-[120px] w-[120px] rounded-full" />
        </div>
        {/* Stats skeleton */}
        <div className="grid grid-cols-2 gap-2">
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} className="h-14 w-full rounded-lg" />
          ))}
        </div>
        {/* Issues skeleton */}
        <div className="space-y-2">
          <Skeleton className="h-4 w-24" />
          {Array.from({ length: 2 }).map((_, i) => (
            <Skeleton key={i} className="h-11 w-full rounded-lg" />
          ))}
        </div>
      </CardContent>
    </Card>
  )
}

// ─── Main Widget ────────────────────────────────────────

export function FleetHealthWidget({ onNavigate }: FleetHealthWidgetProps) {
  const [data, setData] = React.useState<FleetHealthData | null>(null)
  const [loading, setLoading] = React.useState(true)
  const [error, setError] = React.useState<string | null>(null)

  const loadHealth = React.useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const result = await fetchFleetHealth()
      setData(result)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load fleet health')
    } finally {
      setLoading(false)
    }
  }, [])

  React.useEffect(() => {
    loadHealth()
  }, [loadHealth])

  if (loading) return <FleetHealthSkeleton />

  if (error) {
    return (
      <Card>
        <CardContent className="py-8 text-center">
          <p className="text-sm text-muted-foreground">{error}</p>
        </CardContent>
      </Card>
    )
  }

  if (!data) return null

  const fuelTrendIcon =
    data.fuelEfficiencyTrend === 'up' ? (
      <ArrowUp className="h-3 w-3 text-emerald-500" />
    ) : data.fuelEfficiencyTrend === 'down' ? (
      <ArrowDown className="h-3 w-3 text-red-500" />
    ) : (
      <Minus className="h-3 w-3 text-amber-500" />
    )

  const fuelTrendLabel =
    data.fuelEfficiencyTrend === 'up'
      ? 'Improving'
      : data.fuelEfficiencyTrend === 'down'
        ? 'Declining'
        : 'Stable'

  return (
    <motion.div variants={containerVariants} animate="show" className="h-full">
      <Card className="h-full flex flex-col">
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between">
            <CardTitle className="text-base">Fleet Health</CardTitle>
            <Badge
              variant="secondary"
              className={
                data.overallScore >= 80
                  ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400'
                  : data.overallScore >= 60
                    ? 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400'
                    : 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400'
              }
            >
              {data.overallScore >= 80 ? 'Healthy' : data.overallScore >= 60 ? 'Fair' : 'At Risk'}
            </Badge>
          </div>
        </CardHeader>

        <CardContent className="space-y-5">
          {/* Health Score Ring */}
          <motion.div variants={itemVariants} className="flex justify-center">
            <HealthScoreRing score={data.overallScore} />
          </motion.div>

          {/* Quick Stats Grid */}
          <motion.div variants={itemVariants} className="grid grid-cols-2 gap-2">
            <QuickStat
              icon={Truck}
              label="Active Trucks"
              value={data.trucks.active}
              subValue={`${data.trucks.idle} idle`}
              color="bg-emerald-100 text-emerald-600 dark:bg-emerald-900/30 dark:text-emerald-400"
            />
            <QuickStat
              icon={Users}
              label="Drivers Available"
              value={data.drivers.available}
              subValue={`${data.drivers.onTrip} on trip`}
              color="bg-sky-100 text-sky-600 dark:bg-sky-900/30 dark:text-sky-400"
            />
            <QuickStat
              icon={ShieldAlert}
              label="Compliance Alerts"
              value={data.complianceAlerts}
              subValue={data.complianceAlerts === 0 ? 'All clear' : 'Expiring soon'}
              color={
                data.complianceAlerts > 0
                  ? 'bg-amber-100 text-amber-600 dark:bg-amber-900/30 dark:text-amber-400'
                  : 'bg-emerald-100 text-emerald-600 dark:bg-emerald-900/30 dark:text-emerald-400'
              }
            />
            <QuickStat
              icon={Wrench}
              label="Overdue Service"
              value={data.overdueMaintenance}
              subValue={
                data.overdueMaintenance === 0
                  ? 'Up to date'
                  : `${data.trucks.maintenance} in shop`
              }
              color={
                data.overdueMaintenance > 0
                  ? 'bg-red-100 text-red-600 dark:bg-red-900/30 dark:text-red-400'
                  : 'bg-emerald-100 text-emerald-600 dark:bg-emerald-900/30 dark:text-emerald-400'
              }
            />
          </motion.div>

          {/* Fuel Efficiency Trend */}
          <motion.div variants={itemVariants}>
            <div className="flex items-center gap-2 p-2.5 rounded-lg bg-muted/40">
              <div className="rounded-md p-1.5 bg-orange-100 dark:bg-orange-900/25">
                <Fuel className="h-3.5 w-3.5 text-orange-600 dark:text-orange-400" />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-xs font-medium">Fuel Efficiency</p>
                <p className="text-[10px] text-muted-foreground">
                  {data.fuelEfficiency.thisMonth > 0
                    ? `${data.fuelEfficiency.thisMonth} km/L this month`
                    : 'No data this month'}
                  {data.fuelEfficiency.lastMonth > 0 && ` · ${data.fuelEfficiency.lastMonth} km/L last`}
                </p>
              </div>
              <div className="flex items-center gap-1 shrink-0">
                {fuelTrendIcon}
                <span className="text-xs font-medium text-muted-foreground">{fuelTrendLabel}</span>
              </div>
            </div>
          </motion.div>

          {/* Top Issues */}
          {data.topIssues.length > 0 && (
            <motion.div variants={itemVariants}>
              <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2">
                Top Issues
              </p>
              <div className="space-y-1">
                {data.topIssues.map((issue) => (
                  <IssueRow
                    key={issue.type}
                    issue={issue}
                    onClick={() => onNavigate?.(issue.page)}
                  />
                ))}
              </div>
            </motion.div>
          )}
        </CardContent>
      </Card>
    </motion.div>
  )
}
