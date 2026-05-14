'use client'

import * as React from 'react'
import { motion } from 'framer-motion'
import {
  AlertTriangle,
  ShieldAlert,
  Truck,
  Wallet,
  RefreshCw,
  ChevronDown,
  ChevronUp,
  AlertCircle,
  Fuel,
  TrendingUp,
  TrendingDown,
  Gauge,
  MapPin,
  CreditCard,
  Clock,
  BarChart3,
  Eye,
  FileWarning,
  Lightbulb,
  Zap,
} from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Skeleton } from '@/components/ui/skeleton'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
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
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  ReferenceLine,
  ReferenceArea,
} from 'recharts'
import { CURRENCY_SYMBOL } from '@/lib/constants'
import { fetchAnomalyDashboard, fetchTrucks, type AnomalyDashboardData, type AnomalyDashboardAnomaly, type AnomalyDashboardByTruck, type Truck } from '@/lib/api'

// ============ Constants ============

const containerVariants = {
  show: { transition: { staggerChildren: 0.04 } },
}

const itemVariants = {
  show: { opacity: 1, y: 0 },
}

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

// ============ Anomaly Type Helpers ============

function getAnomalyTypeInfo(type: string) {
  switch (type) {
    case 'consumption_anomaly':
      return { icon: Gauge, label: 'Consumption', color: 'text-red-500' }
    case 'fill_without_travel':
      return { icon: MapPin, label: 'Fill No Travel', color: 'text-amber-500' }
    case 'overfilling':
      return { icon: Fuel, label: 'Overfilling', color: 'text-red-600' }
    case 'cost_anomaly':
      return { icon: CreditCard, label: 'Cost Anomaly', color: 'text-orange-500' }
    case 'frequency_anomaly':
      return { icon: Clock, label: 'Frequency', color: 'text-amber-600' }
    case 'station_pattern':
      return { icon: FileWarning, label: 'Station', color: 'text-yellow-500' }
    default:
      return { icon: AlertTriangle, label: 'Unknown', color: 'text-gray-500' }
  }
}

function getSeverityConfig(severity: string) {
  switch (severity) {
    case 'high':
      return {
        badge: 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400 border-red-200 dark:border-red-800',
        border: 'border-l-4 border-l-red-500',
        bg: 'bg-red-50 dark:bg-red-900/10',
      }
    case 'medium':
      return {
        badge: 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400 border-amber-200 dark:border-amber-800',
        border: 'border-l-4 border-l-amber-500',
        bg: 'bg-amber-50 dark:bg-amber-900/10',
      }
    case 'low':
      return {
        badge: 'bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-400 border-yellow-200 dark:border-yellow-800',
        border: 'border-l-4 border-l-yellow-400',
        bg: '',
      }
    default:
      return {
        badge: 'bg-gray-100 text-gray-700 dark:bg-gray-800 dark:text-gray-400',
        border: '',
        bg: '',
      }
  }
}

function getRiskBadge(riskLevel: string) {
  switch (riskLevel) {
    case 'high':
      return 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400'
    case 'medium':
      return 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400'
    case 'low':
      return 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400'
    default:
      return 'bg-gray-100 text-gray-700 dark:bg-gray-800 dark:text-gray-400'
  }
}

// ============ Main Component ============

export function FuelAnomalyDashboard() {
  const [data, setData] = React.useState<AnomalyDashboardData | null>(null)
  const [trucks, setTrucks] = React.useState<Truck[]>([])
  const [loading, setLoading] = React.useState(true)
  const [error, setError] = React.useState<string | null>(null)
  const [period, setPeriod] = React.useState('this_year')
  const [severity, setSeverity] = React.useState('all')
  const [truckFilter, setTruckFilter] = React.useState('all')
  const [typeFilter, setTypeFilter] = React.useState('all')
  const [expandedAnomaly, setExpandedAnomaly] = React.useState<string | null>(null)
  const [activeTab, setActiveTab] = React.useState('anomalies')

  // Load data
  const loadData = React.useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const params: { truckId?: string; period?: string; severity?: string } = {}
      if (truckFilter !== 'all') params.truckId = truckFilter
      if (period !== 'this_year') params.period = period
      if (severity !== 'all') params.severity = severity
      const result = await fetchAnomalyDashboard(params)
      setData(result)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load anomaly dashboard')
    } finally {
      setLoading(false)
    }
  }, [truckFilter, period, severity])

  React.useEffect(() => {
    loadData()
  }, [loadData])

  React.useEffect(() => {
    fetchTrucks({ status: 'active', limit: 100 })
      .then(result => setTrucks(result.data))
      .catch(() => {})
  }, [])

  // Filter anomalies by type
  const filteredAnomalies = React.useMemo(() => {
    if (!data) return []
    if (typeFilter === 'all') return data.anomalies
    return data.anomalies.filter(a => {
      switch (typeFilter) {
        case 'consumption': return a.type === 'consumption_anomaly'
        case 'fill_without_travel': return a.type === 'fill_without_travel'
        case 'overfilling': return a.type === 'overfilling'
        case 'cost': return a.type === 'cost_anomaly'
        case 'frequency': return a.type === 'frequency_anomaly'
        case 'station': return a.type === 'station_pattern'
        default: return true
      }
    })
  }, [data, typeFilter])

  // ============ Error State ============
  if (error && !data) {
    return (
      <motion.div variants={containerVariants} animate="show" className="space-y-6">
        <div className="flex flex-col items-center justify-center py-16 text-center">
          <div className="rounded-full bg-red-100 dark:bg-red-900/30 p-4 mb-4">
            <AlertCircle className="h-8 w-8 text-red-600" />
          </div>
          <h2 className="text-lg font-semibold mb-2">Failed to load anomaly dashboard</h2>
          <p className="text-sm text-muted-foreground mb-4">{error}</p>
          <Button onClick={loadData} variant="outline">
            <RefreshCw className="mr-2 h-4 w-4" />
            Try Again
          </Button>
        </div>
      </motion.div>
    )
  }

  // ============ Anomaly Card ============
  const AnomalyCard = ({ anomaly }: { anomaly: AnomalyDashboardAnomaly }) => {
    const severityConfig = getSeverityConfig(anomaly.severity)
    const typeInfo = getAnomalyTypeInfo(anomaly.type)
    const TypeIcon = typeInfo.icon
    const isExpanded = expandedAnomaly === anomaly.id

    return (
      <motion.div
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        className={`rounded-lg border bg-card ${severityConfig.border}`}
      >
        <button
          className="w-full flex items-start gap-3 p-4 text-left hover:bg-muted/30 transition-colors"
          onClick={() => setExpandedAnomaly(isExpanded ? null : anomaly.id)}
        >
          <div className="mt-0.5">
            <TypeIcon className={`h-5 w-5 ${typeInfo.color} shrink-0`} />
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex flex-wrap items-center gap-2 mb-1">
              <Badge variant="outline" className={`text-[10px] px-1.5 py-0 ${severityConfig.badge}`}>
                {anomaly.severity.toUpperCase()}
              </Badge>
              <span className="text-xs font-medium text-muted-foreground">{typeInfo.label}</span>
              {anomaly.estimatedLoss > 0 && (
                <span className="text-xs font-semibold text-red-600 dark:text-red-400">
                  ~{formatCurrency(anomaly.estimatedLoss)}
                </span>
              )}
            </div>
            <p className="text-sm leading-relaxed mb-1">{anomaly.description}</p>
            <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
              <span className="font-medium">{anomaly.plateNumber}</span>
              <span>•</span>
              <span>{anomaly.driverName}</span>
              <span>•</span>
              <span>{new Date(anomaly.detectedAt).toLocaleDateString()}</span>
            </div>
          </div>
          <div className="mt-1 shrink-0">
            {isExpanded
              ? <ChevronUp className="h-4 w-4 text-muted-foreground" />
              : <ChevronDown className="h-4 w-4 text-muted-foreground" />
            }
          </div>
        </button>

        {isExpanded && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            className="border-t px-4 py-3"
          >
            <div className="rounded-md bg-muted/50 p-3 space-y-1.5">
              <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Details</p>
              {Object.entries(anomaly.details).map(([key, value]) => (
                <div key={key} className="flex justify-between text-xs">
                  <span className="text-muted-foreground capitalize">{key.replace(/([A-Z])/g, ' $1')}</span>
                  <span className="font-medium">{typeof value === 'number' ? value.toLocaleString() : String(value)}</span>
                </div>
              ))}
              {anomaly.estimatedLoss > 0 && (
                <div className="flex justify-between text-xs pt-1 border-t">
                  <span className="text-red-600 dark:text-red-400 font-medium">Est. Loss</span>
                  <span className="font-bold text-red-600 dark:text-red-400">{formatCurrency(anomaly.estimatedLoss)}</span>
                </div>
              )}
            </div>
          </motion.div>
        )}
      </motion.div>
    )
  }

  // ============ Loading Skeleton ============
  const SummarySkeleton = () => (
    <div className="grid grid-cols-2 lg:grid-cols-5 gap-3 sm:gap-4">
      {Array.from({ length: 5 }).map((_, i) => (
        <div key={i} className="rounded-lg border bg-card p-4">
          <Skeleton className="h-4 w-20 mb-3" />
          <Skeleton className="h-8 w-16" />
        </div>
      ))}
    </div>
  )

  const ListSkeleton = () => (
    <div className="space-y-3">
      {Array.from({ length: 4 }).map((_, i) => (
        <Skeleton key={i} className="h-24 w-full rounded-lg" />
      ))}
    </div>
  )

  // ============ Render ============
  return (
    <motion.div
      variants={containerVariants}
      animate="show"
      className="space-y-4 sm:space-y-6"
    >
      {/* Header */}
      <motion.div variants={itemVariants} className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Fuel Anomaly Detection</h1>
          <p className="text-muted-foreground">Detect suspicious fuel patterns, consumption outliers, and potential theft</p>
        </div>
        <Button onClick={loadData} variant="outline" disabled={loading}>
          <RefreshCw className={`mr-2 h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
          Refresh
        </Button>
      </motion.div>

      {/* Summary Cards */}
      <motion.div variants={itemVariants}>
        {loading && !data ? (
          <SummarySkeleton />
        ) : data ? (
          <div className="grid grid-cols-2 lg:grid-cols-5 gap-3 sm:gap-4">
            {/* Total Anomalies */}
            <Card className={`${data.summary.totalAnomalies > 0 ? 'border-amber-200 dark:border-amber-800' : ''}`}>
              <CardContent className="p-4">
                <div className="flex items-center gap-2 mb-2">
                  <div className="rounded-md bg-amber-100 dark:bg-amber-900/30 p-1.5">
                    <AlertTriangle className="h-4 w-4 text-amber-600 dark:text-amber-400" />
                  </div>
                </div>
                <p className="text-2xl font-bold">{data.summary.totalAnomalies}</p>
                <p className="text-xs text-muted-foreground">Total Anomalies</p>
              </CardContent>
            </Card>

            {/* High Severity */}
            <Card className={data.summary.highSeverity > 0 ? 'border-red-200 dark:border-red-800' : ''}>
              <CardContent className="p-4">
                <div className="flex items-center gap-2 mb-2">
                  <div className="rounded-md bg-red-100 dark:bg-red-900/30 p-1.5">
                    <ShieldAlert className="h-4 w-4 text-red-600 dark:text-red-400" />
                  </div>
                </div>
                <p className="text-2xl font-bold text-red-600 dark:text-red-400">{data.summary.highSeverity}</p>
                <p className="text-xs text-muted-foreground">High Severity</p>
              </CardContent>
            </Card>

            {/* Medium Severity */}
            <Card className={data.summary.mediumSeverity > 0 ? 'border-amber-200 dark:border-amber-800' : ''}>
              <CardContent className="p-4">
                <div className="flex items-center gap-2 mb-2">
                  <div className="rounded-md bg-amber-100 dark:bg-amber-900/30 p-1.5">
                    <Zap className="h-4 w-4 text-amber-600 dark:text-amber-400" />
                  </div>
                </div>
                <p className="text-2xl font-bold text-amber-600 dark:text-amber-400">{data.summary.mediumSeverity}</p>
                <p className="text-xs text-muted-foreground">Medium Severity</p>
              </CardContent>
            </Card>

            {/* Est. Fuel Loss */}
            <Card className={data.summary.estimatedLoss > 1000 ? 'border-red-200 dark:border-red-800' : ''}>
              <CardContent className="p-4">
                <div className="flex items-center gap-2 mb-2">
                  <div className="rounded-md bg-red-100 dark:bg-red-900/30 p-1.5">
                    <Wallet className="h-4 w-4 text-red-600 dark:text-red-400" />
                  </div>
                </div>
                <p className="text-2xl font-bold">{formatCurrencyShort(data.summary.estimatedLoss)}</p>
                <p className="text-xs text-muted-foreground">Est. Fuel Loss</p>
              </CardContent>
            </Card>

            {/* Trucks Flagged */}
            <Card>
              <CardContent className="p-4">
                <div className="flex items-center gap-2 mb-2">
                  <div className="rounded-md bg-orange-100 dark:bg-orange-900/30 p-1.5">
                    <Truck className="h-4 w-4 text-orange-600 dark:text-orange-400" />
                  </div>
                </div>
                <p className="text-2xl font-bold">{data.summary.trucksFlagged}</p>
                <p className="text-xs text-muted-foreground">Trucks Flagged</p>
              </CardContent>
            </Card>
          </div>
        ) : null}
      </motion.div>

      {/* Filter Bar */}
      <motion.div variants={itemVariants} className="flex flex-col sm:flex-row gap-3">
        <Select value={period} onValueChange={setPeriod}>
          <SelectTrigger className="w-full sm:w-44">
            <SelectValue placeholder="Period" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="this_month">This Month</SelectItem>
            <SelectItem value="last_month">Last Month</SelectItem>
            <SelectItem value="last_3_months">Last 3 Months</SelectItem>
            <SelectItem value="this_year">This Year</SelectItem>
          </SelectContent>
        </Select>

        <Select value={severity} onValueChange={setSeverity}>
          <SelectTrigger className="w-full sm:w-36">
            <SelectValue placeholder="Severity" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Severity</SelectItem>
            <SelectItem value="high">High</SelectItem>
            <SelectItem value="medium">Medium</SelectItem>
            <SelectItem value="low">Low</SelectItem>
          </SelectContent>
        </Select>

        <Select value={truckFilter} onValueChange={setTruckFilter}>
          <SelectTrigger className="w-full sm:w-48">
            <SelectValue placeholder="All Trucks" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Trucks</SelectItem>
            {trucks.map(truck => (
              <SelectItem key={truck.id} value={truck.id}>
                {truck.plateNumber}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Select value={typeFilter} onValueChange={setTypeFilter}>
          <SelectTrigger className="w-full sm:w-44">
            <SelectValue placeholder="All Types" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Types</SelectItem>
            <SelectItem value="consumption">Consumption</SelectItem>
            <SelectItem value="fill_without_travel">Fill No Travel</SelectItem>
            <SelectItem value="overfilling">Overfilling</SelectItem>
            <SelectItem value="cost">Cost</SelectItem>
            <SelectItem value="frequency">Frequency</SelectItem>
            <SelectItem value="station">Station</SelectItem>
          </SelectContent>
        </Select>
      </motion.div>

      {/* Main Content Tabs */}
      <motion.div variants={itemVariants}>
        <Tabs value={activeTab} onValueChange={setActiveTab}>
          <TabsList className="grid w-full grid-cols-3">
            <TabsTrigger value="anomalies" className="text-xs sm:text-sm">
              <AlertTriangle className="h-4 w-4 mr-1 sm:mr-2" />
              Anomalies
              {data && <Badge variant="secondary" className="ml-1 h-5 min-w-5 text-[10px] px-1">{data.summary.totalAnomalies}</Badge>}
            </TabsTrigger>
            <TabsTrigger value="risk" className="text-xs sm:text-sm">
              <ShieldAlert className="h-4 w-4 mr-1 sm:mr-2" />
              Truck Risk
              {data && <Badge variant="secondary" className="ml-1 h-5 min-w-5 text-[10px] px-1">{data.byTruck.length}</Badge>}
            </TabsTrigger>
            <TabsTrigger value="trends" className="text-xs sm:text-sm">
              <BarChart3 className="h-4 w-4 mr-1 sm:mr-2" />
              Trends
            </TabsTrigger>
          </TabsList>

          {/* Tab: Anomaly List */}
          <TabsContent value="anomalies" className="mt-4">
            {loading && !data ? (
              <ListSkeleton />
            ) : filteredAnomalies.length === 0 ? (
              <Card>
                <CardContent className="flex flex-col items-center justify-center py-12 text-center">
                  <div className="rounded-full bg-emerald-100 dark:bg-emerald-900/30 p-4 mb-3">
                    <ShieldAlert className="h-8 w-8 text-emerald-600" />
                  </div>
                  <h4 className="text-sm font-medium">No Anomalies Found</h4>
                  <p className="text-xs text-muted-foreground mt-1">
                    All fuel activity appears normal for the selected filters
                  </p>
                </CardContent>
              </Card>
            ) : (
              <div className="space-y-3 max-h-[500px] overflow-y-auto pr-1">
                {filteredAnomalies.map(anomaly => (
                  <AnomalyCard key={anomaly.id} anomaly={anomaly} />
                ))}
              </div>
            )}
          </TabsContent>

          {/* Tab: Truck Risk Analysis */}
          <TabsContent value="risk" className="mt-4">
            {loading && !data ? (
              <ListSkeleton />
            ) : data && data.byTruck.length === 0 ? (
              <Card>
                <CardContent className="flex flex-col items-center justify-center py-12 text-center">
                  <div className="rounded-full bg-emerald-100 dark:bg-emerald-900/30 p-4 mb-3">
                    <ShieldAlert className="h-8 w-8 text-emerald-600" />
                  </div>
                  <h4 className="text-sm font-medium">No Flagged Trucks</h4>
                  <p className="text-xs text-muted-foreground mt-1">
                    No trucks have anomaly flags for the selected period
                  </p>
                </CardContent>
              </Card>
            ) : (
              <Card>
                <CardContent className="p-0">
                  {/* Desktop Table */}
                  <div className="hidden md:block overflow-x-auto">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Truck</TableHead>
                          <TableHead>Risk</TableHead>
                          <TableHead className="text-right">Anomalies</TableHead>
                          <TableHead className="text-right">Est. Loss</TableHead>
                          <TableHead className="text-right">Avg L/100km</TableHead>
                          <TableHead>Fleet Avg</TableHead>
                          <TableHead className="text-right">Deviation</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {data.byTruck.map(truck => (
                          <TableRow key={truck.truckId}>
                            <TableCell className="font-medium">{truck.plateNumber}</TableCell>
                            <TableCell>
                              <Badge className={`text-xs ${getRiskBadge(truck.riskLevel)}`}>
                                {truck.riskLevel.toUpperCase()}
                              </Badge>
                            </TableCell>
                            <TableCell className="text-right text-sm">{truck.anomalyCount}</TableCell>
                            <TableCell className="text-right text-sm font-semibold text-red-600 dark:text-red-400">
                              {formatCurrencyShort(truck.totalEstimatedLoss)}
                            </TableCell>
                            <TableCell className="text-right text-sm">{truck.avgConsumption}</TableCell>
                            <TableCell className="text-sm text-muted-foreground">{truck.fleetAvgConsumption}</TableCell>
                            <TableCell className="text-right">
                              <div className="flex items-center justify-end gap-2">
                                <div className="w-16 h-2 rounded-full bg-muted overflow-hidden">
                                  <div
                                    className={`h-full rounded-full ${
                                      truck.deviation > 30 ? 'bg-red-500' : truck.deviation > 15 ? 'bg-amber-500' : 'bg-green-500'
                                    }`}
                                    style={{ width: `${Math.min(truck.deviation * 2, 100)}%` }}
                                  />
                                </div>
                                <span className={`text-xs font-medium ${
                                  truck.deviation > 30 ? 'text-red-600' : truck.deviation > 15 ? 'text-amber-600' : 'text-green-600'
                                }`}>
                                  {truck.deviation > 0 ? '+' : ''}{truck.deviation}%
                                </span>
                              </div>
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </div>

                  {/* Mobile Cards */}
                  <div className="md:hidden space-y-3 max-h-[500px] overflow-y-auto">
                    {data.byTruck.map(truck => (
                      <div key={truck.truckId} className="p-3 rounded-lg border bg-card space-y-2">
                        <div className="flex items-center justify-between">
                          <span className="text-sm font-medium">{truck.plateNumber}</span>
                          <Badge className={`text-xs ${getRiskBadge(truck.riskLevel)}`}>
                            {truck.riskLevel.toUpperCase()}
                          </Badge>
                        </div>
                        <div className="grid grid-cols-2 gap-2 text-xs">
                          <div>
                            <p className="text-muted-foreground">Anomalies</p>
                            <p className="font-medium">{truck.anomalyCount}</p>
                          </div>
                          <div>
                            <p className="text-muted-foreground">Est. Loss</p>
                            <p className="font-medium text-red-600">{formatCurrencyShort(truck.totalEstimatedLoss)}</p>
                          </div>
                          <div>
                            <p className="text-muted-foreground">Avg L/100km</p>
                            <p className="font-medium">{truck.avgConsumption}</p>
                          </div>
                          <div>
                            <p className="text-muted-foreground">Deviation</p>
                            <p className={`font-medium ${truck.deviation > 30 ? 'text-red-600' : truck.deviation > 15 ? 'text-amber-600' : 'text-green-600'}`}>
                              {truck.deviation > 0 ? '+' : ''}{truck.deviation}%
                            </p>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                </CardContent>
              </Card>
            )}
          </TabsContent>

          {/* Tab: Consumption Trends */}
          <TabsContent value="trends" className="mt-4">
            {loading && !data ? (
              <div className="h-[320px]"><Skeleton className="h-full w-full rounded-lg" /></div>
            ) : data && data.consumptionTrends.length > 0 ? (
              <Card>
                <CardHeader>
                  <CardTitle className="text-base flex items-center gap-2">
                    <TrendingUp className="h-4 w-4 text-amber-500" />
                    Consumption Trends
                  </CardTitle>
                  <CardDescription>
                    Fleet average consumption vs expected baseline — highlighted months show significant deviation
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="h-[300px] w-full">
                    <ResponsiveContainer width="100%" height="100%">
                      <LineChart data={data.consumptionTrends} margin={{ top: 5, right: 10, left: 0, bottom: 5 }}>
                        <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                        <XAxis dataKey="month" className="text-xs" tick={{ fill: 'hsl(var(--muted-foreground))' }} />
                        <YAxis
                          className="text-xs"
                          tick={{ fill: 'hsl(var(--muted-foreground))' }}
                          label={{ value: 'L/100km', position: 'insideTopLeft', offset: -5, className: 'text-xs text-muted-foreground' }}
                        />
                        <Tooltip
                          contentStyle={tooltipStyle}
                          formatter={(value: number) => [`${value.toFixed(1)} L/100km`, 'Avg Consumption']}
                        />
                        <ReferenceLine
                          y={data.summary.fleetAvgConsumption}
                          stroke="#f59e0b"
                          strokeDasharray="6 3"
                          strokeWidth={1.5}
                        />
                        <Line
                          type="monotone"
                          dataKey="avgConsumption"
                          name="Actual Consumption"
                          stroke="#3b82f6"
                          strokeWidth={2}
                          dot={{ r: 4 }}
                          activeDot={{ r: 6, fill: '#3b82f6' }}
                        />
                        <Line
                          type="monotone"
                          dataKey="expectedConsumption"
                          name="Expected Baseline"
                          stroke="#f59e0b"
                          strokeWidth={2}
                          strokeDasharray="8 4"
                          dot={{ r: 3 }}
                        />
                      </LineChart>
                    </ResponsiveContainer>
                  </div>
                  <div className="flex items-center gap-4 mt-3 text-xs text-muted-foreground">
                    <div className="flex items-center gap-1.5">
                      <div className="w-4 h-0.5 bg-blue-500 rounded" />
                      <span>Actual</span>
                    </div>
                    <div className="flex items-center gap-1.5">
                      <div className="w-4 h-0.5 bg-amber-500 rounded" style={{ borderTop: '2px dashed #f59e0b' }} />
                      <span>Baseline</span>
                    </div>
                    <span className="ml-auto">Fleet Avg: {data.summary.fleetAvgConsumption} L/100km</span>
                  </div>
                </CardContent>
              </Card>
            ) : (
              <Card>
                <CardContent className="flex flex-col items-center justify-center py-12 text-center">
                  <p className="text-sm text-muted-foreground">No trend data available for the selected period</p>
                </CardContent>
              </Card>
            )}
          </TabsContent>
        </Tabs>
      </motion.div>

      {/* Investigation Recommendations */}
      {data && data.recommendations.length > 0 && (
        <motion.div variants={itemVariants}>
          <div className="flex items-center gap-2 mb-3">
            <Lightbulb className="h-4 w-4 text-amber-500" />
            <h3 className="text-base font-semibold">Investigation Recommendations</h3>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
            {data.recommendations.map((rec, idx) => (
              <motion.div
                key={idx}
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: idx * 0.05 }}
              >
                <Card className={`border-amber-200 dark:border-amber-800 ${idx === 0 && data.summary.estimatedLoss >= 5000 ? 'bg-red-50 dark:bg-red-900/10 border-red-200 dark:border-red-800' : ''}`}>
                  <CardContent className="p-4">
                    <div className="flex items-start gap-2">
                      <Eye className="h-4 w-4 text-amber-600 dark:text-amber-400 mt-0.5 shrink-0" />
                      <p className="text-sm leading-relaxed">{rec}</p>
                    </div>
                  </CardContent>
                </Card>
              </motion.div>
            ))}
          </div>
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
