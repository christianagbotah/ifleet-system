'use client'

import * as React from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import {
  Brain,
  Wrench,
  AlertTriangle,
  Clock,
  DollarSign,
  Filter,
  Truck,
  Zap,
  Info,
  RefreshCw,
  Droplets,
  CircleDot,
  Settings2,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Skeleton } from '@/components/ui/skeleton'
import { EmptyState } from '@/components/ui/empty-state'
import { CURRENCY_SYMBOL } from '@/lib/constants'
import {
  fetchPredictiveMaintenance,
  type MaintenancePrediction,
  type PredictiveMaintenanceSummary,
} from '@/lib/api'

const COMPONENT_LABELS: Record<string, { label: string; icon: React.ElementType; color: string }> = {
  oil_change: { label: 'Oil Change', icon: Droplets, color: 'text-amber-500' },
  brake_service: { label: 'Brake Service', icon: Zap, color: 'text-red-500' },
  tire_rotation: { label: 'Tire Rotation', icon: CircleDot, color: 'text-emerald-500' },
  general_service: { label: 'General Service', icon: Settings2, color: 'text-sky-500' },
}

const RISK_STYLES: Record<string, { bg: string; border: string; badge: string; icon: React.ElementType }> = {
  critical: {
    bg: 'bg-red-50 dark:bg-red-950/30',
    border: 'border-l-4 border-l-red-500',
    badge: 'bg-red-100 text-red-700 dark:bg-red-900 dark:text-red-300',
    icon: AlertTriangle,
  },
  warning: {
    bg: 'bg-amber-50 dark:bg-amber-950/30',
    border: 'border-l-4 border-l-amber-500',
    badge: 'bg-amber-100 text-amber-700 dark:bg-amber-900 dark:text-amber-300',
    icon: Clock,
  },
  info: {
    bg: 'bg-sky-50 dark:bg-sky-950/30',
    border: 'border-l-4 border-l-sky-400',
    badge: 'bg-sky-100 text-sky-700 dark:bg-sky-900 dark:text-sky-300',
    icon: Info,
  },
}

const CONFIDENCE_STYLES: Record<string, string> = {
  high: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900 dark:text-emerald-300',
  medium: 'bg-amber-100 text-amber-700 dark:bg-amber-900 dark:text-amber-300',
  low: 'bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-400',
}

const containerVariants = {
  show: { transition: { staggerChildren: 0.04 } },
}

const itemVariants = {
  show: { opacity: 1, y: 0 },
  hidden: { opacity: 0, y: 8 },
}

interface PredictiveMaintenancePanelProps {
  onNavigate?: (page: string) => void
}

export function PredictiveMaintenancePanel({ onNavigate }: PredictiveMaintenancePanelProps) {
  const [predictions, setPredictions] = React.useState<MaintenancePrediction[]>([])
  const [summary, setSummary] = React.useState<PredictiveMaintenanceSummary | null>(null)
  const [loading, setLoading] = React.useState(true)
  const [error, setError] = React.useState<string | null>(null)
  const [riskFilter, setRiskFilter] = React.useState<'all' | 'critical' | 'warning' | 'info'>('all')

  const loadData = React.useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const result = await fetchPredictiveMaintenance()
      setPredictions(result.predictions)
      setSummary(result.summary)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load predictions')
    } finally {
      setLoading(false)
    }
  }, [])

  React.useEffect(() => {
    loadData()
  }, [loadData])

  const filteredPredictions = React.useMemo(() => {
    if (riskFilter === 'all') return predictions
    return predictions.filter((p) => p.riskLevel === riskFilter)
  }, [predictions, riskFilter])

  return (
    <motion.div
      variants={containerVariants}
      animate="show"
      className="space-y-4 sm:space-y-6"
    >
      {/* Section Header */}
      <motion.div variants={itemVariants} className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div className="flex items-center gap-2.5">
          <div className="flex items-center justify-center h-9 w-9 rounded-lg bg-purple-100 dark:bg-purple-900/40">
            <Brain className="h-5 w-5 text-purple-600 dark:text-purple-400" />
          </div>
          <div>
            <h2 className="text-lg font-semibold tracking-tight">Predictive Maintenance</h2>
            <p className="text-xs text-muted-foreground">AI-powered service predictions based on fleet history</p>
          </div>
        </div>
        <Button variant="outline" size="sm" onClick={loadData} className="gap-1.5 self-start">
          <RefreshCw className={`h-3.5 w-3.5 ${loading ? 'animate-spin' : ''}`} />
          Refresh
        </Button>
      </motion.div>

      {/* Summary KPIs */}
      <motion.div variants={itemVariants} className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {loading ? (
          Array.from({ length: 4 }).map((_, i) => (
            <Card key={i}>
              <CardContent className="p-4">
                <Skeleton className="h-3 w-16 mb-2" />
                <Skeleton className="h-7 w-10" />
              </CardContent>
            </Card>
          ))
        ) : summary ? (
          <>
            <Card className="hover:shadow-md transition-shadow border-l-4 border-l-red-500">
              <CardContent className="p-4">
                <div className="flex items-center gap-1.5 mb-1">
                  <AlertTriangle className="h-3.5 w-3.5 text-red-500" />
                  <p className="text-xs text-muted-foreground">Critical</p>
                </div>
                <p className="text-xl font-bold text-red-600">{summary.criticalCount}</p>
              </CardContent>
            </Card>
            <Card className="hover:shadow-md transition-shadow border-l-4 border-l-amber-500">
              <CardContent className="p-4">
                <div className="flex items-center gap-1.5 mb-1">
                  <Clock className="h-3.5 w-3.5 text-amber-500" />
                  <p className="text-xs text-muted-foreground">Warning</p>
                </div>
                <p className="text-xl font-bold text-amber-600">{summary.warningCount}</p>
              </CardContent>
            </Card>
            <Card className="hover:shadow-md transition-shadow border-l-4 border-l-sky-400">
              <CardContent className="p-4">
                <div className="flex items-center gap-1.5 mb-1">
                  <Info className="h-3.5 w-3.5 text-sky-500" />
                  <p className="text-xs text-muted-foreground">Info</p>
                </div>
                <p className="text-xl font-bold text-sky-600">{summary.infoCount}</p>
              </CardContent>
            </Card>
            <Card className="hover:shadow-md transition-shadow">
              <CardContent className="p-4">
                <div className="flex items-center gap-1.5 mb-1">
                  <DollarSign className="h-3.5 w-3.5 text-emerald-500" />
                  <p className="text-xs text-muted-foreground">Est. Cost</p>
                </div>
                <p className="text-xl font-bold">{CURRENCY_SYMBOL}{summary.totalEstimatedCost.toLocaleString()}</p>
              </CardContent>
            </Card>
          </>
        ) : null}
      </motion.div>

      {/* Filter Buttons */}
      <motion.div variants={itemVariants} className="flex items-center gap-2 flex-wrap">
        <Filter className="h-4 w-4 text-muted-foreground" />
        <span className="text-xs text-muted-foreground mr-1">Filter:</span>
        {(['all', 'critical', 'warning', 'info'] as const).map((level) => (
          <Button
            key={level}
            variant={riskFilter === level ? 'default' : 'outline'}
            size="sm"
            className={`h-8 text-xs gap-1.5 ${
              riskFilter === level && level === 'critical'
                ? 'bg-red-600 hover:bg-red-700 text-white'
                : riskFilter === level && level === 'warning'
                  ? 'bg-amber-500 hover:bg-amber-600 text-white'
                  : riskFilter === level && level === 'info'
                    ? 'bg-sky-500 hover:bg-sky-600 text-white'
                    : ''
            }`}
            onClick={() => setRiskFilter(level)}
          >
            {level === 'all' && 'All'}
            {level === 'critical' && <AlertTriangle className="h-3 w-3" />}
            {level === 'warning' && <Clock className="h-3 w-3" />}
            {level === 'info' && <Info className="h-3 w-3" />}
            {level === 'all' && summary
              ? `${summary.criticalCount + summary.warningCount + summary.infoCount}`
              : level === 'critical'
                ? summary?.criticalCount ?? 0
                : level === 'warning'
                  ? summary?.warningCount ?? 0
                  : summary?.infoCount ?? 0}
          </Button>
        ))}
      </motion.div>

      {/* Error State */}
      {error && (
        <motion.div variants={itemVariants} className="flex flex-col items-center justify-center py-8 text-center">
          <AlertTriangle className="h-8 w-8 text-red-500 mb-3" />
          <p className="text-sm text-muted-foreground mb-3">{error}</p>
          <Button variant="outline" size="sm" onClick={loadData}>
            <RefreshCw className="mr-2 h-3 w-3" /> Retry
          </Button>
        </motion.div>
      )}

      {/* Loading State */}
      {loading && !error && (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {Array.from({ length: 6 }).map((_, i) => (
            <Card key={i}>
              <CardContent className="p-4 space-y-3">
                <div className="flex items-center justify-between">
                  <Skeleton className="h-5 w-24" />
                  <Skeleton className="h-5 w-16" />
                </div>
                <Skeleton className="h-4 w-32" />
                <div className="flex items-center gap-2">
                  <Skeleton className="h-5 w-14" />
                  <Skeleton className="h-5 w-14" />
                </div>
                <Skeleton className="h-3 w-full" />
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {/* Predictions Grid */}
      {!loading && !error && (
        <AnimatePresence mode="wait">
          {filteredPredictions.length === 0 ? (
            <motion.div
              key="empty"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
            >
              <div className="rounded-lg border bg-card">
                <EmptyState
                  icon={Brain}
                  title="No predictions found"
                  description={
                    riskFilter !== 'all'
                      ? `No ${riskFilter} risk predictions available`
                      : 'Maintenance predictions will appear when trucks have service history'
                  }
                />
              </div>
            </motion.div>
          ) : (
            <motion.div
              key="grid"
              variants={containerVariants}
              initial="hidden"
              animate="show"
              className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3"
            >
              {filteredPredictions.map((prediction) => (
                <PredictionCard
                  key={`${prediction.truckId}-${prediction.component}`}
                  prediction={prediction}
                  onNavigate={onNavigate}
                />
              ))}
            </motion.div>
          )}
        </AnimatePresence>
      )}
    </motion.div>
  )
}

function PredictionCard({
  prediction,
  onNavigate,
}: {
  prediction: MaintenancePrediction
  onNavigate?: (page: string) => void
}) {
  const risk = RISK_STYLES[prediction.riskLevel]
  const compInfo = COMPONENT_LABELS[prediction.component] ?? COMPONENT_LABELS.general_service
  const CompIcon = compInfo.icon
  const RiskIcon = risk.icon

  const daysUntil = Math.round(
    (new Date(prediction.predictedServiceDate).getTime() - Date.now()) / (1000 * 60 * 60 * 24)
  )
  const isOverdue = daysUntil < 0
  const daysLabel = isOverdue
    ? `${Math.abs(daysUntil)}d overdue`
    : daysUntil === 0
      ? 'Due today'
      : `${daysUntil}d remaining`

  const handleCardClick = () => {
    onNavigate?.(`trucks?id=${prediction.truckId}`)
  }

  return (
    <motion.div variants={itemVariants} layout>
      <Card
        className={`${risk.bg} ${risk.border} hover:shadow-md transition-all cursor-pointer group`}
        onClick={handleCardClick}
      >
        <CardContent className="p-4 space-y-3">
          {/* Header: Truck plate + Risk icon */}
          <div className="flex items-start justify-between gap-2">
            <div className="flex items-center gap-2 min-w-0">
              <Truck className="h-4 w-4 text-muted-foreground flex-shrink-0" />
              <span className="text-sm font-bold truncate">{prediction.truckPlate}</span>
            </div>
            <div className="flex items-center gap-1 flex-shrink-0">
              <RiskIcon className="h-3.5 w-3.5" />
              <Badge variant="secondary" className={`text-[10px] px-1.5 py-0 ${risk.badge}`}>
                {prediction.riskLevel}
              </Badge>
            </div>
          </div>

          {/* Component + Date */}
          <div className="flex items-center gap-2">
            <CompIcon className={`h-4 w-4 flex-shrink-0 ${compInfo.color}`} />
            <span className="text-sm font-medium">{compInfo.label}</span>
          </div>

          {/* Predicted Date */}
          <div className="flex items-center justify-between">
            <div>
              <p className="text-xs text-muted-foreground">Predicted Service</p>
              <p className="text-sm font-semibold">
                {new Date(prediction.predictedServiceDate).toLocaleDateString('en-US', {
                  month: 'short',
                  day: 'numeric',
                  year: 'numeric',
                })}
              </p>
            </div>
            <div className="text-right">
              <p className="text-xs text-muted-foreground">
                {isOverdue ? 'Overdue' : daysUntil === 0 ? 'Today' : 'Due In'}
              </p>
              <p className={`text-sm font-semibold ${isOverdue ? 'text-red-600' : daysUntil <= 7 ? 'text-amber-600' : 'text-muted-foreground'}`}>
                {daysLabel}
              </p>
            </div>
          </div>

          {/* Badges Row */}
          <div className="flex items-center gap-2 flex-wrap">
            <Badge variant="outline" className={`text-[10px] ${CONFIDENCE_STYLES[prediction.confidence]}`}>
              {prediction.confidence} confidence
            </Badge>
            <Badge variant="outline" className="text-[10px]">
              {prediction.totalServices} service{prediction.totalServices !== 1 ? 's' : ''}
            </Badge>
            <Badge variant="outline" className="text-[10px]">
              ~{prediction.avgIntervalDays}d interval
            </Badge>
          </div>

          {/* Cost */}
          <div className="flex items-center justify-between pt-1 border-t border-border/50">
            <span className="text-xs text-muted-foreground">Est. Cost</span>
            <span className="text-sm font-bold">
              {CURRENCY_SYMBOL}{prediction.estimatedCost.toLocaleString()}
            </span>
          </div>
        </CardContent>
      </Card>
    </motion.div>
  )
}
