'use client'

import React, { useState, useEffect, useCallback } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import {
  Shield,
  Trophy,
  AlertTriangle,
  TrendingUp,
  TrendingDown,
  Minus,
  ChevronRight,
  ChevronDown,
  Download,
  Users,
  Medal,
  Star,
  Clock,
  Route,
  CarFront,
  FileCheck,
  BarChart3,
  X,
} from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Skeleton } from '@/components/ui/skeleton'
import { Progress } from '@/components/ui/progress'
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
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
  Radar,
  RadarChart,
  PolarGrid,
  PolarAngleAxis,
  PolarRadiusAxis,
  ResponsiveContainer,
} from 'recharts'
import { apiFetch } from '@/lib/api'
import { MONTHS, APP_NAME } from '@/lib/constants'
import { toast } from 'sonner'

// ============ TYPES ============

interface ScoreBreakdownItem {
  score: number
  maxPoints: number
  label: string
  alerts?: number
  instances?: number
  details?: string
  completionRate?: number
}

interface DriverSafetyScore {
  driverId: string
  driverName: string
  employeeId: string
  phone: string
  photo: string | null
  totalScore: number
  breakdown: {
    speeding: ScoreBreakdownItem
    routeCompliance: ScoreBreakdownItem
    idleTime: ScoreBreakdownItem
    lateNightDriving: ScoreBreakdownItem
    compliance: ScoreBreakdownItem
    tripPerformance: ScoreBreakdownItem
  }
  grade: string
  tripsCompleted: number
  totalKm: number
  trend: 'improving' | 'stable' | 'declining'
  recentAlerts?: { id: string; type: string; title: string; message: string; createdAt: string }[]
}

interface SafetyScoresSummary {
  avgScore: number
  highestScorer: string
  lowestScorer: string
  gradeDistribution: Record<string, number>
  improving: number
  declining: number
}

interface SafetyScoresData {
  drivers: DriverSafetyScore[]
  summary: SafetyScoresSummary
  leaderboard: DriverSafetyScore[]
}

// ============ CONSTANTS ============

const GRADE_COLORS: Record<string, string> = {
  'A+': 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400',
  'A': 'bg-teal-100 text-teal-700 dark:bg-teal-900/30 dark:text-teal-400',
  'B+': 'bg-sky-100 text-sky-700 dark:bg-sky-900/30 dark:text-sky-400',
  'B': 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400',
  'C': 'bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-400',
  'D': 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400',
  'F': 'bg-red-200 text-red-800 dark:bg-red-900/40 dark:text-red-300 font-bold',
}

const GRADE_BAR_COLORS: Record<string, string> = {
  'A+': 'hsl(142, 71%, 45%)',
  'A': 'hsl(173, 80%, 40%)',
  'B+': 'hsl(200, 84%, 46%)',
  'B': 'hsl(38, 92%, 50%)',
  'C': 'hsl(25, 95%, 53%)',
  'D': 'hsl(0, 84%, 60%)',
  'F': 'hsl(0, 84%, 40%)',
}

const MEDAL_STYLES: Record<number, { bg: string; icon: string }> = {
  1: { bg: 'bg-amber-50 dark:bg-amber-900/15 border-amber-200 dark:border-amber-800', icon: 'text-amber-500' },
  2: { bg: 'bg-gray-50 dark:bg-gray-800/50 border-gray-300 dark:border-gray-600', icon: 'text-gray-400' },
  3: { bg: 'bg-orange-50 dark:bg-orange-900/15 border-orange-200 dark:border-orange-700', icon: 'text-orange-500' },
}

const RADAR_COLORS = [
  'hsl(142, 71%, 45%)',  // Speeding - emerald
  'hsl(200, 84%, 46%)',  // Route Compliance - sky
  'hsl(25, 95%, 53%)',   // Idle Time - orange
  'hsl(262, 83%, 58%)',  // Late Night - violet
  'hsl(173, 80%, 40%)',  // Compliance - teal
  'hsl(38, 92%, 50%)',   // Trip Performance - amber
]

const radarConfig = {
  score: { label: 'Score', color: 'hsl(142, 71%, 45%)' },
} satisfies ChartConfig

const gradeBarConfig = {
  count: { label: 'Drivers', color: 'hsl(38, 92%, 50%)' },
} satisfies ChartConfig

// ============ ANIMATION ============

const containerVariants = {
  hidden: { opacity: 0 },
  show: { opacity: 1, transition: { staggerChildren: 0.08 } },
}
const itemVariants = {
  hidden: { opacity: 0, y: 20 },
  show: { opacity: 1, y: 0, transition: { duration: 0.4 } },
}

// ============ HELPERS ============

function getTrendIcon(trend: string) {
  if (trend === 'improving') return <TrendingUp className="h-4 w-4 text-emerald-500" />
  if (trend === 'declining') return <TrendingDown className="h-4 w-4 text-red-500" />
  return <Minus className="h-4 w-4 text-gray-400" />
}

function getTrendBadge(trend: string) {
  if (trend === 'improving') return <Badge className="bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400 border-0 gap-1"><TrendingUp className="h-3 w-3" />Improving</Badge>
  if (trend === 'declining') return <Badge className="bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400 border-0 gap-1"><TrendingDown className="h-3 w-3" />Declining</Badge>
  return <Badge className="bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-400 border-0 gap-1"><Minus className="h-3 w-3" />Stable</Badge>
}

function getScoreColor(score: number): string {
  if (score >= 80) return 'text-emerald-600 dark:text-emerald-400'
  if (score >= 60) return 'text-amber-600 dark:text-amber-400'
  if (score >= 40) return 'text-orange-600 dark:text-orange-400'
  return 'text-red-600 dark:text-red-400'
}

function getScoreBg(score: number): string {
  if (score >= 80) return 'bg-emerald-500'
  if (score >= 60) return 'bg-amber-500'
  if (score >= 40) return 'bg-orange-500'
  return 'bg-red-500'
}

function getInitials(name: string): string {
  return name.split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2)
}

function getAlertTypeLabel(type: string): string {
  const labels: Record<string, string> = {
    speeding: 'Speeding',
    route_deviation: 'Route Deviation',
    idle: 'Excessive Idle',
  }
  return labels[type] || type
}

function getAlertTypeColor(type: string): string {
  const colors: Record<string, string> = {
    speeding: 'text-red-600 bg-red-100 dark:bg-red-900/30 dark:text-red-400',
    route_deviation: 'text-amber-600 bg-amber-100 dark:bg-amber-900/30 dark:text-amber-400',
    idle: 'text-sky-600 bg-sky-100 dark:bg-sky-900/30 dark:text-sky-400',
  }
  return colors[type] || 'text-gray-600 bg-gray-100'
}

function formatDate(dateStr: string): string {
  try {
    return new Date(dateStr).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })
  } catch {
    return dateStr
  }
}

// ============ SUB-COMPONENTS ============

function KpiCard({
  title,
  value,
  icon: Icon,
  colorClass,
  loading,
  subtitle,
  trendIcon,
}: {
  title: string
  value: string
  icon: React.ComponentType<{ className?: string }>
  colorClass: string
  loading: boolean
  subtitle?: string
  trendIcon?: React.ReactNode
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
                  <div className="flex items-center gap-2">
                    <p className="text-2xl font-bold tracking-tight">{value}</p>
                    {trendIcon}
                  </div>
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
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <ChartSkeleton />
        <ChartSkeleton />
        <ChartSkeleton />
      </div>
    </div>
  )
}

// ============ RADAR CHART ============

function DriverRadarChart({ breakdown }: { breakdown: DriverSafetyScore['breakdown'] }) {
  const data = Object.entries(breakdown).map(([key, item], i) => ({
    category: item.label,
    score: item.score,
    max: item.maxPoints,
    fill: RADAR_COLORS[i % RADAR_COLORS.length],
  }))

  return (
    <ChartContainer config={radarConfig} className="h-[280px] w-full">
      <RadarChart data={data} cx="50%" cy="50%" outerRadius="70%">
        <PolarGrid strokeDasharray="3 3" />
        <PolarAngleAxis
          dataKey="category"
          tick={{ fontSize: 10 }}
        />
        <PolarRadiusAxis
          angle={90}
          domain={[0, 25]}
          tick={{ fontSize: 9 }}
        />
        <Radar
          name="Score"
          dataKey="score"
          stroke="hsl(38, 92%, 50%)"
          fill="hsl(38, 92%, 50%)"
          fillOpacity={0.2}
          strokeWidth={2}
        />
        <ChartTooltip content={<ChartTooltipContent />} />
      </RadarChart>
    </ChartContainer>
  )
}

// ============ DRIVER DETAIL PANEL ============

function DriverDetailPanel({
  driver,
  onClose,
}: {
  driver: DriverSafetyScore
  onClose: () => void
}) {
  const breakdownEntries = Object.entries(driver.breakdown) as [string, ScoreBreakdownItem][]

  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: 10 }}
      transition={{ duration: 0.3 }}
    >
      <Card className="border-amber-200 dark:border-amber-800">
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <Avatar className="h-10 w-10">
                <AvatarImage src={driver.photo || undefined} />
                <AvatarFallback>{getInitials(driver.driverName)}</AvatarFallback>
              </Avatar>
              <div>
                <CardTitle className="text-base">{driver.driverName}</CardTitle>
                <CardDescription>{driver.employeeId} &middot; {driver.phone}</CardDescription>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <Badge className={GRADE_COLORS[driver.grade] || ''}>{driver.grade}</Badge>
              {getTrendBadge(driver.trend)}
              <Button variant="ghost" size="icon" className="h-8 w-8" onClick={onClose}>
                <X className="h-4 w-4" />
              </Button>
            </div>
          </div>
        </CardHeader>
        <CardContent className="p-4 pt-0 space-y-4">
          {/* Radar Chart + Score */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <p className="text-sm font-medium mb-2 flex items-center gap-1.5">
                <Star className="h-4 w-4 text-amber-500" />
                Performance Radar
              </p>
              <DriverRadarChart breakdown={driver.breakdown} />
            </div>

            {/* Breakdown Table */}
            <div>
              <p className="text-sm font-medium mb-2 flex items-center gap-1.5">
                <BarChart3 className="h-4 w-4 text-sky-500" />
                Score Breakdown
              </p>
              <div className="space-y-2 max-h-[250px] overflow-y-auto pr-1">
                {breakdownEntries.map(([key, item]) => (
                  <div key={key} className="rounded-lg border p-2.5">
                    <div className="flex items-center justify-between mb-1">
                      <span className="text-sm font-medium">{item.label}</span>
                      <span className={`text-sm font-bold ${getScoreColor(Math.round((item.score / item.maxPoints) * 100))}`}>
                        {item.score}/{item.maxPoints}
                      </span>
                    </div>
                    <Progress value={(item.score / item.maxPoints) * 100} className="h-1.5" />
                    <div className="flex items-center justify-between mt-1">
                      <span className="text-xs text-muted-foreground">
                        {Math.round((item.score / item.maxPoints) * 100)}%
                      </span>
                      {item.alerts !== undefined && (
                        <span className="text-xs text-muted-foreground">{item.alerts} alerts</span>
                      )}
                      {item.instances !== undefined && (
                        <span className="text-xs text-muted-foreground">{item.instances} instances</span>
                      )}
                      {item.completionRate !== undefined && (
                        <span className="text-xs text-muted-foreground">{item.completionRate}% on-time</span>
                      )}
                      {item.details && (
                        <span className="text-xs text-muted-foreground truncate max-w-[160px]">{item.details}</span>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>

          {/* Trip Stats */}
          <div className="grid grid-cols-3 gap-3">
            <div className="text-center p-3 rounded-lg bg-muted/50">
              <p className="text-lg font-bold">{driver.totalScore}</p>
              <p className="text-xs text-muted-foreground">Total Score</p>
            </div>
            <div className="text-center p-3 rounded-lg bg-muted/50">
              <p className="text-lg font-bold">{driver.tripsCompleted}</p>
              <p className="text-xs text-muted-foreground">Trips Completed</p>
            </div>
            <div className="text-center p-3 rounded-lg bg-muted/50">
              <p className="text-lg font-bold">{driver.totalKm.toLocaleString()}</p>
              <p className="text-xs text-muted-foreground">Total Km</p>
            </div>
          </div>

          {/* Recent Alerts */}
          {driver.recentAlerts && driver.recentAlerts.length > 0 && (
            <div>
              <p className="text-sm font-medium mb-2 flex items-center gap-1.5">
                <AlertTriangle className="h-4 w-4 text-red-500" />
                Recent Alerts
              </p>
              <div className="space-y-2 max-h-[160px] overflow-y-auto">
                {driver.recentAlerts.map((alert) => (
                  <div key={alert.id} className="flex items-start gap-2 p-2 rounded-lg bg-muted/50 text-sm">
                    <Badge className={`shrink-0 border-0 text-[10px] px-1.5 py-0 ${getAlertTypeColor(alert.type)}`}>
                      {getAlertTypeLabel(alert.type)}
                    </Badge>
                    <div className="flex-1 min-w-0">
                      <p className="font-medium truncate">{alert.title}</p>
                      <p className="text-xs text-muted-foreground truncate">{alert.message}</p>
                    </div>
                    <span className="text-xs text-muted-foreground shrink-0">{formatDate(alert.createdAt)}</span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </CardContent>
      </Card>
    </motion.div>
  )
}

// ============ MOBILE DRIVER CARD ============

function DriverMobileCard({
  driver,
  rank,
  onClick,
}: {
  driver: DriverSafetyScore
  rank: number
  onClick: () => void
}) {
  const medal = MEDAL_STYLES[rank]
  return (
    <motion.div variants={itemVariants}>
      <div
        className={`mobile-card p-4 space-y-2 cursor-pointer transition-shadow hover:shadow-md ${medal ? medal.bg + ' border' : ''}`}
        onClick={onClick}
      >
          <div className="flex items-start justify-between">
            <div className="flex items-center gap-3">
              {medal ? (
                <div className="flex items-center justify-center h-8 w-8 rounded-full">
                  <Medal className={`h-5 w-5 ${medal.icon}`} />
                </div>
              ) : (
                <div className="flex items-center justify-center h-8 w-8 rounded-full bg-muted text-sm font-medium text-muted-foreground">
                  {rank}
                </div>
              )}
              <div>
                <p className="font-semibold text-sm">{driver.driverName}</p>
                <p className="text-xs text-muted-foreground">{driver.employeeId}</p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <span className={`text-2xl font-bold ${getScoreColor(driver.totalScore)}`}>
                {driver.totalScore}
              </span>
              <Badge className={GRADE_COLORS[driver.grade] || ''}>{driver.grade}</Badge>
            </div>
          </div>
          <div className="grid grid-cols-3 gap-2">
            <div className="text-center p-2 rounded-lg bg-muted/50">
              <p className="text-sm font-bold">{driver.tripsCompleted}</p>
              <p className="text-xs text-muted-foreground">Trips</p>
            </div>
            <div className="text-center p-2 rounded-lg bg-muted/50">
              <p className="text-sm font-bold">{driver.totalKm.toLocaleString()}</p>
              <p className="text-xs text-muted-foreground">Km</p>
            </div>
            <div className="text-center p-2 rounded-lg bg-muted/50 flex items-center justify-center">
              {getTrendIcon(driver.trend)}
            </div>
          </div>
      </div>
    </motion.div>
  )
}

// ============ GRADE DISTRIBUTION TAB ============

function GradeDistributionTab({ distribution }: { distribution: Record<string, number> }) {
  const gradeOrder = ['A+', 'A', 'B+', 'B', 'C', 'D', 'F']
  const chartData = gradeOrder
    .filter(g => (distribution[g] || 0) > 0)
    .map(g => ({
      grade: g,
      count: distribution[g] || 0,
      fill: GRADE_BAR_COLORS[g],
    }))

  return (
    <div className="space-y-4">
      <Card className="gap-0 py-4">
        <CardHeader className="pb-2">
          <CardTitle className="text-base flex items-center gap-2">
            <BarChart3 className="h-4 w-4 text-amber-500" />
            Grade Distribution
          </CardTitle>
        </CardHeader>
        <CardContent className="p-4 pt-0">
          {chartData.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-[280px] text-muted-foreground">
              <Users className="h-10 w-10 mb-2 opacity-40" />
              <p className="text-sm">No data available</p>
            </div>
          ) : (
            <ChartContainer config={gradeBarConfig} className="h-[280px] w-full">
              <BarChart data={chartData} margin={{ top: 5, right: 20, left: 10, bottom: 5 }}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} />
                <XAxis dataKey="grade" tickLine={false} axisLine={false} fontSize={12} />
                <YAxis tickLine={false} axisLine={false} fontSize={12} allowDecimals={false} />
                <ChartTooltip content={<ChartTooltipContent />} />
                <Bar dataKey="count" radius={[4, 4, 0, 0]} maxBarSize={60}>
                  {chartData.map((entry, index) => (
                    <Cell key={`cell-${index}`} fill={entry.fill} />
                  ))}
                </Bar>
              </BarChart>
            </ChartContainer>
          )}
        </CardContent>
      </Card>

      {/* Distribution Table */}
      <Card className="gap-0 py-4">
        <CardContent className="p-4">
          <div className="grid grid-cols-4 sm:grid-cols-7 gap-3">
            {gradeOrder.map(grade => {
              const count = distribution[grade] || 0
              return (
                <div key={grade} className="text-center p-3 rounded-lg border">
                  <Badge className={`${GRADE_COLORS[grade] || ''} border-0 mb-1`}>{grade}</Badge>
                  <p className="text-lg font-bold">{count}</p>
                  <p className="text-xs text-muted-foreground">drivers</p>
                </div>
              )
            })}
          </div>
        </CardContent>
      </Card>
    </div>
  )
}

// ============ MAIN COMPONENT ============

export function SafetyScoringView() {
  const now = new Date()
  const [month, setMonth] = useState(String(now.getMonth() + 1))
  const [year, setYear] = useState(String(now.getFullYear()))
  const [tab, setTab] = useState<'leaderboard' | 'distribution'>('leaderboard')
  const [data, setData] = useState<SafetyScoresData | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [selectedDriver, setSelectedDriver] = useState<DriverSafetyScore | null>(null)

  const loadData = useCallback(async () => {
    setLoading(true)
    setError(null)
    setSelectedDriver(null)
    try {
      const params = new URLSearchParams({ month, year })
      const result = await apiFetch<SafetyScoresData>(`/api/drivers/safety-scores?${params.toString()}`)
      setData(result)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load safety scores')
    } finally {
      setLoading(false)
    }
  }, [month, year])

  useEffect(() => {
    loadData()
  }, [loadData])

  // CSV Export
  function exportCSV() {
    if (!data) return
    try {
      const lines: string[] = []
      const monthName = MONTHS[parseInt(month) - 1]
      const dateStr = new Date().toISOString().split('T')[0]

      lines.push(`${APP_NAME} - Driver Safety Scorecard`)
      lines.push(`Period: ${monthName} ${year}`)
      lines.push(`Generated: ${new Date().toLocaleString()}`)
      lines.push('')
      lines.push('=== SUMMARY ===')
      lines.push(`Average Fleet Score,${data.summary.avgScore}`)
      lines.push(`Highest Scorer,${data.summary.highestScorer}`)
      lines.push(`Lowest Scorer,${data.summary.lowestScorer}`)
      lines.push(`Improving,${data.summary.improving}`)
      lines.push(`Declining,${data.summary.declining}`)
      lines.push('')

      lines.push('=== LEADERBOARD ===')
      lines.push('Rank,Driver,Employee ID,Phone,Score,Grade,Speeding,Route Compliance,Idle Time,Late Night,Compliance,Trip Performance,Trips,Km,Trend')

      data.leaderboard.forEach((d, i) => {
        const b = d.breakdown
        lines.push(
          `${i + 1},"${d.driverName}",${d.employeeId},${d.phone},${d.totalScore},${d.grade},${b.speeding.score}/${b.speeding.maxPoints},${b.routeCompliance.score}/${b.routeCompliance.maxPoints},${b.idleTime.score}/${b.idleTime.maxPoints},${b.lateNightDriving.score}/${b.lateNightDriving.maxPoints},${b.compliance.score}/${b.compliance.maxPoints},${b.tripPerformance.score}/${b.tripPerformance.maxPoints},${d.tripsCompleted},${d.totalKm},${d.trend}`
        )
      })

      const csvContent = lines.join('\n')
      const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' })
      const url = URL.createObjectURL(blob)
      const link = document.createElement('a')
      link.href = url
      link.download = `fleetpro-safety-scores-${monthName}-${year}-${dateStr}.csv`
      link.click()
      URL.revokeObjectURL(url)
      toast.success('Safety scores exported successfully')
    } catch {
      toast.error('Failed to export CSV')
    }
  }

  // Grade distribution data
  const gradeChartData = data
    ? Object.entries(data.summary.gradeDistribution)
        .filter(([, count]) => count > 0)
        .map(([grade, count]) => ({
          grade,
          count,
          fill: GRADE_BAR_COLORS[grade],
        }))
    : []

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
            <Shield className="h-6 w-6 text-amber-500" />
            Driver Safety Scorecard
          </h1>
          <p className="text-muted-foreground mt-1">
            Monthly safety scores based on driving behaviour, compliance &amp; trip performance
          </p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <Select value={month} onValueChange={setMonth}>
            <SelectTrigger className="w-full sm:w-[130px]">
              <SelectValue placeholder="Month" />
            </SelectTrigger>
            <SelectContent>
              {MONTHS.map((m, i) => (
                <SelectItem key={m} value={String(i + 1)}>{m}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select value={year} onValueChange={setYear}>
            <SelectTrigger className="w-full sm:w-[90px]">
              <SelectValue placeholder="Year" />
            </SelectTrigger>
            <SelectContent>
              {[2024, 2025, 2026].map(y => (
                <SelectItem key={y} value={String(y)}>{y}</SelectItem>
              ))}
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
          {/* Summary KPI Cards */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            <KpiCard
              title="Average Fleet Score"
              value={String(data.summary.avgScore)}
              icon={Shield}
              colorClass="bg-amber-500"
              loading={loading}
              subtitle={`${data.drivers.length} drivers evaluated`}
            />
            <KpiCard
              title="Top Performer"
              value={data.summary.highestScorer || 'N/A'}
              icon={Trophy}
              colorClass="bg-emerald-500"
              loading={loading}
              subtitle={data.leaderboard.length > 0 ? `Score: ${data.leaderboard[0].totalScore}` : undefined}
            />
            <KpiCard
              title="Needs Attention"
              value={String(data.drivers.filter(d => d.totalScore < 60).length)}
              icon={AlertTriangle}
              colorClass="bg-red-500"
              loading={loading}
              subtitle={data.summary.declining > 0 ? `${data.summary.declining} declining` : undefined}
            />
            <KpiCard
              title="Monthly Trend"
              value={data.summary.improving > data.summary.declining ? 'Improving' : data.summary.improving < data.summary.declining ? 'Declining' : 'Stable'}
              icon={TrendingUp}
              colorClass={data.summary.improving > data.summary.declining ? 'bg-emerald-500' : data.summary.improving < data.summary.declining ? 'bg-red-500' : 'bg-gray-500'}
              loading={loading}
              subtitle={`${data.summary.improving} improving, ${data.summary.declining} declining`}
              trendIcon={data.summary.improving > data.summary.declining
                ? <TrendingUp className="h-5 w-5 text-emerald-500" />
                : data.summary.improving < data.summary.declining
                  ? <TrendingDown className="h-5 w-5 text-red-500" />
                  : <Minus className="h-5 w-5 text-gray-400" />
              }
            />
          </div>

          {/* Tabs */}
          <div className="flex items-center gap-1 border-b">
            <button
              className={`px-4 py-2 text-sm font-medium transition-colors relative ${tab === 'leaderboard' ? 'text-amber-600 dark:text-amber-400' : 'text-muted-foreground hover:text-foreground'}`}
              onClick={() => setTab('leaderboard')}
            >
              <span className="flex items-center gap-1.5">
                <Trophy className="h-4 w-4" />
                Leaderboard
              </span>
              {tab === 'leaderboard' && (
                <motion.div
                  layoutId="safety-tab"
                  className="absolute bottom-0 left-0 right-0 h-0.5 bg-amber-500"
                />
              )}
            </button>
            <button
              className={`px-4 py-2 text-sm font-medium transition-colors relative ${tab === 'distribution' ? 'text-amber-600 dark:text-amber-400' : 'text-muted-foreground hover:text-foreground'}`}
              onClick={() => setTab('distribution')}
            >
              <span className="flex items-center gap-1.5">
                <BarChart3 className="h-4 w-4" />
                Grade Distribution
              </span>
              {tab === 'distribution' && (
                <motion.div
                  layoutId="safety-tab"
                  className="absolute bottom-0 left-0 right-0 h-0.5 bg-amber-500"
                />
              )}
            </button>
          </div>

          {/* Tab Content */}
          {tab === 'leaderboard' && (
            <div className="space-y-4">
              {/* Desktop Table */}
              <motion.div variants={itemVariants}>
                <Card className="gap-0 py-4">
                  <CardContent className="p-4">
                    {data.leaderboard.length === 0 ? (
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
                                <TableHead className="text-center">Score</TableHead>
                                <TableHead className="text-center">Grade</TableHead>
                                <TableHead className="text-center hidden lg:table-cell">Speeding</TableHead>
                                <TableHead className="text-center hidden lg:table-cell">Route</TableHead>
                                <TableHead className="text-center hidden lg:table-cell">Idle</TableHead>
                                <TableHead className="text-center hidden xl:table-cell">Compliance</TableHead>
                                <TableHead className="text-center hidden xl:table-cell">Trips</TableHead>
                                <TableHead className="text-center">Trend</TableHead>
                              </TableRow>
                            </TableHeader>
                            <TableBody>
                              {data.leaderboard.map((driver, index) => {
                                const rank = index + 1
                                const medal = MEDAL_STYLES[rank]
                                const isSelected = selectedDriver?.driverId === driver.driverId
                                return (
                                  <TableRow
                                    key={driver.driverId}
                                    className={`cursor-pointer transition-colors ${medal ? medal.bg + ' border' : ''} ${isSelected ? 'bg-amber-50/50 dark:bg-amber-900/10' : ''}`}
                                    onClick={() => setSelectedDriver(isSelected ? null : driver)}
                                  >
                                    <TableCell>
                                      {medal ? (
                                        <div className="flex items-center justify-center">
                                          <Medal className={`h-5 w-5 ${medal.icon}`} />
                                        </div>
                                      ) : (
                                        <span className="flex items-center justify-center h-7 w-7 rounded-full bg-muted text-xs font-medium text-muted-foreground">
                                          {rank}
                                        </span>
                                      )}
                                    </TableCell>
                                    <TableCell>
                                      <div className="flex items-center gap-2">
                                        <Avatar className="h-8 w-8">
                                          <AvatarImage src={driver.photo || undefined} />
                                          <AvatarFallback className="text-xs">{getInitials(driver.driverName)}</AvatarFallback>
                                        </Avatar>
                                        <div>
                                          <p className="font-medium text-sm">{driver.driverName}</p>
                                          <p className="text-xs text-muted-foreground">{driver.employeeId}</p>
                                        </div>
                                      </div>
                                    </TableCell>
                                    <TableCell className="text-center">
                                      <span className={`text-xl font-bold ${getScoreColor(driver.totalScore)}`}>
                                        {driver.totalScore}
                                      </span>
                                    </TableCell>
                                    <TableCell className="text-center">
                                      <Badge className={`${GRADE_COLORS[driver.grade] || ''} border-0 text-sm px-2.5`}>
                                        {driver.grade}
                                      </Badge>
                                    </TableCell>
                                    <TableCell className="text-center hidden lg:table-cell">
                                      <span className="text-sm">{driver.breakdown.speeding.score}/{driver.breakdown.speeding.maxPoints}</span>
                                      {(driver.breakdown.speeding.alerts ?? 0) > 0 && (
                                        <span className="text-xs text-red-500 ml-1">({driver.breakdown.speeding.alerts})</span>
                                      )}
                                    </TableCell>
                                    <TableCell className="text-center hidden lg:table-cell">
                                      <span className="text-sm">{driver.breakdown.routeCompliance.score}/{driver.breakdown.routeCompliance.maxPoints}</span>
                                    </TableCell>
                                    <TableCell className="text-center hidden lg:table-cell">
                                      <span className="text-sm">{driver.breakdown.idleTime.score}/{driver.breakdown.idleTime.maxPoints}</span>
                                    </TableCell>
                                    <TableCell className="text-center hidden xl:table-cell">
                                      <span className="text-sm">{driver.breakdown.compliance.score}/{driver.breakdown.compliance.maxPoints}</span>
                                    </TableCell>
                                    <TableCell className="text-center hidden xl:table-cell text-sm">
                                      {driver.tripsCompleted} <span className="text-muted-foreground">({driver.totalKm.toLocaleString()} km)</span>
                                    </TableCell>
                                    <TableCell className="text-center">
                                      {getTrendIcon(driver.trend)}
                                    </TableCell>
                                  </TableRow>
                                )
                              })}
                            </TableBody>
                          </Table>
                        </div>

                        {/* Mobile Cards */}
                        <div className="md:hidden divide-y">
                          {data.leaderboard.map((driver, index) => (
                            <DriverMobileCard
                              key={driver.driverId}
                              driver={driver}
                              rank={index + 1}
                              onClick={() => setSelectedDriver(selectedDriver?.driverId === driver.driverId ? null : driver)}
                            />
                          ))}
                        </div>
                      </>
                    )}
                  </CardContent>
                </Card>
              </motion.div>

              {/* Driver Detail Panel */}
              <AnimatePresence mode="wait">
                {selectedDriver && (
                  <DriverDetailPanel
                    key={selectedDriver.driverId}
                    driver={selectedDriver}
                    onClose={() => setSelectedDriver(null)}
                  />
                )}
              </AnimatePresence>
            </div>
          )}

          {tab === 'distribution' && (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ duration: 0.3 }}
            >
              <GradeDistributionTab distribution={data.summary.gradeDistribution} />
            </motion.div>
          )}

          {/* Scoring Legend */}
          <motion.div variants={itemVariants}>
            <Card className="gap-0 py-4">
              <CardHeader className="pb-2">
                <CardTitle className="text-base flex items-center gap-2">
                  <FileCheck className="h-4 w-4 text-amber-500" />
                  Scoring Criteria
                </CardTitle>
                <CardDescription>
                  How safety scores are calculated (0-100 points)
                </CardDescription>
              </CardHeader>
              <CardContent className="p-4 pt-0">
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                  <div className="flex items-start gap-3 p-3 rounded-lg border">
                    <div className="rounded-lg p-2 bg-red-100 dark:bg-red-900/30 shrink-0">
                      <CarFront className="h-4 w-4 text-red-600 dark:text-red-400" />
                    </div>
                    <div>
                      <p className="text-sm font-medium">Speeding (0-25 pts)</p>
                      <p className="text-xs text-muted-foreground">0 alerts = 25, 1-3 = 20, 4-6 = 15, 7-10 = 10, &gt;10 = 0</p>
                    </div>
                  </div>
                  <div className="flex items-start gap-3 p-3 rounded-lg border">
                    <div className="rounded-lg p-2 bg-sky-100 dark:bg-sky-900/30 shrink-0">
                      <Route className="h-4 w-4 text-sky-600 dark:text-sky-400" />
                    </div>
                    <div>
                      <p className="text-sm font-medium">Route Compliance (0-20 pts)</p>
                      <p className="text-xs text-muted-foreground">0 deviations = 20, 1-2 = 15, 3-5 = 10, &gt;5 = 0</p>
                    </div>
                  </div>
                  <div className="flex items-start gap-3 p-3 rounded-lg border">
                    <div className="rounded-lg p-2 bg-orange-100 dark:bg-orange-900/30 shrink-0">
                      <Clock className="h-4 w-4 text-orange-600 dark:text-orange-400" />
                    </div>
                    <div>
                      <p className="text-sm font-medium">Idle Time (0-15 pts)</p>
                      <p className="text-xs text-muted-foreground">0-2 alerts = 15, 3-5 = 10, 6-10 = 5, &gt;10 = 0</p>
                    </div>
                  </div>
                  <div className="flex items-start gap-3 p-3 rounded-lg border">
                    <div className="rounded-lg p-2 bg-violet-100 dark:bg-violet-900/30 shrink-0">
                      <Star className="h-4 w-4 text-violet-600 dark:text-violet-400" />
                    </div>
                    <div>
                      <p className="text-sm font-medium">Late Night Driving (0-10 pts)</p>
                      <p className="text-xs text-muted-foreground">0 instances = 10, 1-3 = 7, 4-7 = 4, &gt;7 = 0</p>
                    </div>
                  </div>
                  <div className="flex items-start gap-3 p-3 rounded-lg border">
                    <div className="rounded-lg p-2 bg-teal-100 dark:bg-teal-900/30 shrink-0">
                      <FileCheck className="h-4 w-4 text-teal-600 dark:text-teal-400" />
                    </div>
                    <div>
                      <p className="text-sm font-medium">Compliance (0-20 pts)</p>
                      <p className="text-xs text-muted-foreground">License, Ghana Card, verification &amp; truck status</p>
                    </div>
                  </div>
                  <div className="flex items-start gap-3 p-3 rounded-lg border">
                    <div className="rounded-lg p-2 bg-amber-100 dark:bg-amber-900/30 shrink-0">
                      <BarChart3 className="h-4 w-4 text-amber-600 dark:text-amber-400" />
                    </div>
                    <div>
                      <p className="text-sm font-medium">Trip Performance (0-10 pts)</p>
                      <p className="text-xs text-muted-foreground">&gt;95% on-time = 10, &gt;80% = 7, &gt;60% = 4, else = 0</p>
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>
          </motion.div>
        </>
      )}
    </motion.div>
  )
}

export default SafetyScoringView
