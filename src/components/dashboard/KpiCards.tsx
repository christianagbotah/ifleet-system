'use client'

import { useQuery } from '@tanstack/react-query'
import { TrendingUp, Fuel, Target, Route } from 'lucide-react'
import { Card, CardContent } from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'
import { cn } from '@/lib/utils'
import { formatCurrency } from '@/lib/currency'

// ─── KPI Data Interface ─────────────────────────────────────────────────
interface KpiData {
  avgTripRevenue: number
  avgTripDistance: number
  totalDistance: number
  fuelEfficiency: number
  costPerKm: number
  revenuePerTrip: number
  completionRate: number
  activeDriverCount: number
  activeTruckCount: number
  pendingCashAdvanceTotal: number
  pendingIncentiveTotal: number
  thisMonthTrips: number
  thisMonthRevenue: number
  totalTrips: number
  completedTrips: number
}

// ─── Circular Progress Ring ─────────────────────────────────────────────
function CircularProgress({ value, size = 64, strokeWidth = 5 }: { value: number; size?: number; strokeWidth?: number }) {
  const radius = (size - strokeWidth) / 2
  const circumference = radius * 2 * Math.PI
  const clampedValue = Math.min(100, Math.max(0, value))
  const offset = circumference - (clampedValue / 100) * circumference

  const getStrokeColor = () => {
    if (clampedValue >= 80) return '#22c55e' // emerald
    if (clampedValue >= 50) return '#f59e0b' // amber
    return '#ef4444' // red
  }

  return (
    <div className="relative inline-flex items-center justify-center" style={{ width: size, height: size }}>
      <svg width={size} height={size} className="-rotate-90">
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          stroke="currentColor"
          strokeWidth={strokeWidth}
          className="text-muted/30 dark:text-muted-foreground/20"
        />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          stroke={getStrokeColor()}
          strokeWidth={strokeWidth}
          strokeDasharray={circumference}
          strokeDashoffset={offset}
          strokeLinecap="round"
          className="transition-all duration-700 ease-out"
        />
      </svg>
      <span className="absolute text-xs font-bold tabular-nums">{Math.round(clampedValue)}%</span>
    </div>
  )
}

// ─── KPI Card Skeleton ──────────────────────────────────────────────────
function KpiCardSkeleton() {
  return (
    <Card className="border-0 shadow-sm">
      <CardContent className="p-5">
        <div className="flex items-center gap-3 mb-3">
          <Skeleton className="size-9 rounded-lg" />
          <Skeleton className="h-4 w-24" />
        </div>
        <Skeleton className="h-7 w-20 mb-2" />
        <Skeleton className="h-3 w-32" />
      </CardContent>
    </Card>
  )
}

// ─── Main KPI Cards Component ───────────────────────────────────────────
export default function KpiCards() {
  const { data, isLoading, error } = useQuery<KpiData>({
    queryKey: ['dashboard-kpi'],
    queryFn: async () => {
      const res = await fetch('/api/dashboard/kpi')
      if (!res.ok) throw new Error('Failed to fetch KPIs')
      return res.json()
    },
  })

  if (error) {
    return null
  }

  if (isLoading) {
    return (
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <KpiCardSkeleton key={i} />
        ))}
      </div>
    )
  }

  if (!data) return null

  const cards = [
    {
      label: 'Avg Trip Revenue',
      value: formatCurrency(data.avgTripRevenue),
      icon: <TrendingUp className="size-4" />,
      iconBg: 'bg-emerald-100 text-emerald-600 dark:bg-emerald-900/40 dark:text-emerald-400',
      gradient: 'from-emerald-500/5 to-green-500/5 dark:from-emerald-500/10 dark:to-green-500/10',
      subLabel: `${data.completedTrips} completed trips`,
      renderExtra: undefined,
    },
    {
      label: 'Fuel Efficiency',
      value: `${data.fuelEfficiency.toFixed(1)} km/L`,
      icon: <Fuel className="size-4" />,
      iconBg: 'bg-amber-100 text-amber-600 dark:bg-amber-900/40 dark:text-amber-400',
      gradient: 'from-amber-500/5 to-orange-500/5 dark:from-amber-500/10 dark:to-orange-500/10',
      subLabel: `${data.totalDistance.toLocaleString()} km total`,
      renderExtra: undefined,
    },
    {
      label: 'Completion Rate',
      value: `${data.completionRate}%`,
      icon: <Target className="size-4" />,
      iconBg: 'bg-blue-100 text-blue-600 dark:bg-blue-900/40 dark:text-blue-400',
      gradient: 'from-blue-500/5 to-sky-500/5 dark:from-blue-500/10 dark:to-sky-500/10',
      subLabel: `${data.completedTrips} of ${data.totalTrips} trips`,
      renderExtra: (
        <div className="flex justify-center mt-3">
          <CircularProgress value={data.completionRate} size={72} strokeWidth={6} />
        </div>
      ),
    },
    {
      label: 'Cost Per Km',
      value: `${formatCurrency(data.costPerKm)}/km`,
      icon: <Route className="size-4" />,
      iconBg: 'bg-purple-100 text-purple-600 dark:bg-purple-900/40 dark:text-purple-400',
      gradient: 'from-purple-500/5 to-violet-500/5 dark:from-purple-500/10 dark:to-violet-500/10',
      subLabel: `Total: ${formatCurrency(data.totalRevenue)}`,
      renderExtra: undefined,
    },
  ]

  return (
    <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
      {cards.map((card) => (
        <Card
          key={card.label}
          className={cn(
            'border-0 shadow-sm hover:shadow-md transition-all duration-300 overflow-hidden relative',
          )}
        >
          <div className={cn('absolute inset-0 bg-gradient-to-br', card.gradient)} />
          <CardContent className="p-5 relative">
            <div className="flex items-center gap-3 mb-3">
              <div className={cn('size-9 rounded-lg flex items-center justify-center', card.iconBg)}>
                {card.icon}
              </div>
              <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider">{card.label}</p>
            </div>
            <p className="text-2xl font-bold tracking-tight">{card.value}</p>
            <p className="text-xs text-muted-foreground mt-1">{card.subLabel}</p>
            {card.renderExtra}
          </CardContent>
        </Card>
      ))}
    </div>
  )
}
