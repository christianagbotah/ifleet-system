'use client'

import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { motion } from 'framer-motion'
import {
  Trophy,
  Route,
  Fuel,
  CheckCircle,
  Medal,
  Users,
  ChevronRight,
  TrendingUp,
} from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { useAppStore } from '@/lib/store'
import { cn } from '@/lib/utils'
import { formatShortCurrency } from '@/lib/currency'
import { DriverAvatar } from '@/components/ui/driver-avatar'

// ─── Types ──────────────────────────────────────────────────────────────────
interface DriverMetrics {
  driverId: string
  driverName: string
  phone: string
  status: string
  totalTrips: number
  completedTrips: number
  inProgressTrips: number
  cancelledTrips: number
  totalDistance: number
  totalRevenue: number
  totalFuelUsed: number
  avgRevenuePerTrip: number
  avgDistancePerTrip: number
  fuelEfficiency: number
  completionRate: number
  lastTripDate: string | null
  totalCargoWeight: number
  totalCashAdvances: number
  totalIncentives: number
  netEarnings: number
}

interface Rankings {
  topRevenue: Array<{ driverId: string; driverName: string; value: number }>
  mostTrips: Array<{ driverId: string; driverName: string; value: number }>
  bestEfficiency: Array<{ driverId: string; driverName: string; value: number }>
  highestCompletion: Array<{ driverId: string; driverName: string; value: number }>
}

interface PerformanceData {
  drivers: DriverMetrics[]
  rankings: Rankings
}

// ─── Helpers ────────────────────────────────────────────────────────────────
const PAGE_SIZE = 10

// ─── Mini Ranking Card ─────────────────────────────────────────────────────
interface MiniRankCardProps {
  title: string
  icon: React.ReactNode
  iconBg: string
  borderAccent: string
  driverName: string
  value: string
  unit: string
  isLoading: boolean
}

function MiniRankCard({
  title,
  icon,
  iconBg,
  borderAccent,
  driverName,
  value,
  unit,
  isLoading,
}: MiniRankCardProps) {
  if (isLoading) {
    return (
      <Card className="border-0 shadow-sm">
        <CardContent className="p-4">
          <div className="space-y-3">
            <Skeleton className="h-4 w-24" />
            <div className="flex items-center gap-3">
              <Skeleton className="size-10 rounded-xl" />
              <div className="space-y-2 flex-1">
                <Skeleton className="h-5 w-32" />
                <Skeleton className="h-4 w-20" />
              </div>
            </div>
          </div>
        </CardContent>
      </Card>
    )
  }

  return (
    <Card className="border-0 shadow-sm hover:shadow-md transition-all duration-300">
      <CardContent className="p-4">
        <div className="flex items-center gap-2 mb-3">
          <div className={cn('size-8 rounded-lg flex items-center justify-center', iconBg)}>
            {icon}
          </div>
          <span className="text-xs font-medium text-muted-foreground uppercase tracking-wider">{title}</span>
        </div>
        <div className={cn('pl-4 border-l-[3px] rounded-sm', borderAccent)}>
          <p className="text-sm font-semibold truncate">{driverName}</p>
          <div className="flex items-baseline gap-1 mt-0.5">
            <span className="text-lg font-bold">{value}</span>
            <span className="text-xs text-muted-foreground">{unit}</span>
          </div>
        </div>
      </CardContent>
    </Card>
  )
}

// ─── Skeleton for table ────────────────────────────────────────────────────
function TableSkeletonRows() {
  return (
    <>
      {Array.from({ length: 5 }).map((_, i) => (
        <TableRow key={i}>
          <TableCell><Skeleton className="h-5 w-5" /></TableCell>
          <TableCell><Skeleton className="h-5 w-32" /></TableCell>
          <TableCell><Skeleton className="h-5 w-12" /></TableCell>
          <TableCell><Skeleton className="h-5 w-20" /></TableCell>
          <TableCell><Skeleton className="h-5 w-16" /></TableCell>
          <TableCell><Skeleton className="h-5 w-16" /></TableCell>
        </TableRow>
      ))}
    </>
  )
}

// ─── Main Component ─────────────────────────────────────────────────────────
export function DriverPerformanceCards() {
  const { setCurrentView } = useAppStore()
  const [page, setPage] = useState(1)

  const { data, isLoading } = useQuery<PerformanceData>({
    queryKey: ['driver-performance'],
    queryFn: async () => {
      const res = await fetch('/api/drivers/performance')
      if (!res.ok) throw new Error('Failed to fetch driver performance')
      return res.json()
    },
    staleTime: 30_000,
  })

  // Sort drivers by total revenue descending for the leaderboard
  const sortedDrivers = data
    ? [...data.drivers].sort((a, b) => b.totalRevenue - a.totalRevenue)
    : []

  const totalPages = Math.max(1, Math.ceil(sortedDrivers.length / PAGE_SIZE))
  const paginatedDrivers = sortedDrivers.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE)

  const topEarner = data?.rankings.topRevenue[0]
  const topTrips = data?.rankings.mostTrips[0]
  const topEfficiency = data?.rankings.bestEfficiency[0]
  const topCompletion = data?.rankings.highestCompletion[0]

  return (
    <div className="space-y-4">
      {/* ── Title ───────────────────────────────────────────────────────── */}
      <div className="flex items-center gap-3">
        <div className="size-10 rounded-xl bg-emerald-100 dark:bg-emerald-900/40 flex items-center justify-center">
          <Trophy className="size-5 text-emerald-600 dark:text-emerald-400" />
        </div>
        <div>
          <h3 className="text-lg font-semibold">Driver Performance Scorecard</h3>
          <p className="text-xs text-muted-foreground">Top performers across key metrics</p>
        </div>
      </div>

      {/* ── 4 Mini Ranking Cards (2x2) ─────────────────────────────────── */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
        <MiniRankCard
          title="Top Earner"
          icon={<Medal className="size-4 text-yellow-600 dark:text-yellow-400" />}
          iconBg="bg-yellow-100 dark:bg-yellow-900/40"
          borderAccent="border-yellow-400"
          driverName={topEarner?.driverName ?? '—'}
          value={topEarner ? formatShortCurrency(topEarner.value) : '—'}
          unit="revenue"
          isLoading={isLoading}
        />
        <MiniRankCard
          title="Most Trips"
          icon={<Route className="size-4 text-blue-600 dark:text-blue-400" />}
          iconBg="bg-blue-100 dark:bg-blue-900/40"
          borderAccent="border-blue-400"
          driverName={topTrips?.driverName ?? '—'}
          value={topTrips?.value?.toString() ?? '—'}
          unit="trips"
          isLoading={isLoading}
        />
        <MiniRankCard
          title="Best Fuel Efficiency"
          icon={<Fuel className="size-4 text-emerald-600 dark:text-emerald-400" />}
          iconBg="bg-emerald-100 dark:bg-emerald-900/40"
          borderAccent="border-emerald-400"
          driverName={topEfficiency?.driverName ?? '—'}
          value={topEfficiency?.value?.toFixed(1) ?? '—'}
          unit="km/L"
          isLoading={isLoading}
        />
        <MiniRankCard
          title="Highest Completion"
          icon={<CheckCircle className="size-4 text-purple-600 dark:text-purple-400" />}
          iconBg="bg-purple-100 dark:bg-purple-900/40"
          borderAccent="border-purple-400"
          driverName={topCompletion?.driverName ?? '—'}
          value={topCompletion?.value?.toFixed(1) ?? '—'}
          unit="%"
          isLoading={isLoading}
        />
      </div>

      {/* ── Leaderboard Table ──────────────────────────────────────────── */}
      <motion.div
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4, delay: 0.1 }}
      >
        <Card className="border-0 shadow-sm">
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-base font-semibold flex items-center gap-2">
              <Users className="size-4 text-muted-foreground" />
              Driver Leaderboard
            </CardTitle>
            <Button
              variant="ghost"
              size="sm"
              className="text-emerald-600 hover:text-emerald-700 hover:bg-emerald-50 dark:hover:bg-emerald-950/30"
              onClick={() => setCurrentView('reports')}
            >
              View All
              <ChevronRight className="size-4 ml-1" />
            </Button>
          </CardHeader>
          <CardContent className="px-0">
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow className="hover:bg-transparent">
                    <TableHead className="pl-6 w-12">Rank</TableHead>
                    <TableHead>Driver</TableHead>
                    <TableHead className="text-center">Trips</TableHead>
                    <TableHead className="hidden sm:table-cell text-right">Revenue</TableHead>
                    <TableHead className="hidden md:table-cell text-center">Completion</TableHead>
                    <TableHead className="hidden md:table-cell text-center">Fuel Eff.</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {isLoading ? (
                    <TableSkeletonRows />
                  ) : paginatedDrivers.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={6} className="h-24 text-center text-muted-foreground">
                        <div className="flex flex-col items-center gap-2">
                          <Trophy className="size-8 opacity-20" />
                          <p className="text-sm">No driver data available</p>
                        </div>
                      </TableCell>
                    </TableRow>
                  ) : (
                    paginatedDrivers.map((driver, idx) => {
                      const rank = (page - 1) * PAGE_SIZE + idx + 1

                      return (
                        <TableRow
                          key={driver.driverId}
                          className="hover:bg-muted/50 cursor-pointer"
                        >
                          {/* Rank Badge */}
                          <TableCell className="pl-6">
                            <div className="flex items-center justify-center">
                              {rank === 1 ? (
                                <Badge className="bg-yellow-100 text-yellow-700 border-yellow-200 hover:bg-yellow-100 dark:bg-yellow-900/40 dark:text-yellow-400 dark:border-yellow-800">
                                  <Trophy className="size-3 mr-1" />
                                  1
                                </Badge>
                              ) : rank === 2 ? (
                                <Badge className="bg-slate-100 text-slate-600 border-slate-200 hover:bg-slate-100 dark:bg-slate-800/50 dark:text-slate-300 dark:border-slate-700">
                                  <Medal className="size-3 mr-1" />
                                  2
                                </Badge>
                              ) : rank === 3 ? (
                                <Badge className="bg-amber-100 text-amber-700 border-amber-200 hover:bg-amber-100 dark:bg-amber-900/40 dark:text-amber-400 dark:border-amber-800">
                                  <Medal className="size-3 mr-1" />
                                  3
                                </Badge>
                              ) : (
                                <span className="text-sm font-medium text-muted-foreground w-6 text-center">{rank}</span>
                              )}
                            </div>
                          </TableCell>

                          {/* Driver Name with Avatar */}
                          <TableCell>
                            <div className="flex items-center gap-2.5">
                              <DriverAvatar name={driver.driverName} size="sm" />
                              <div className="min-w-0">
                                <p className="text-sm font-medium truncate">{driver.driverName}</p>
                                <p className="text-xs text-muted-foreground sm:hidden">
                                  {formatShortCurrency(driver.totalRevenue)}
                                </p>
                              </div>
                            </div>
                          </TableCell>

                          {/* Trips */}
                          <TableCell className="text-center">
                            <span className="text-sm font-medium">
                              {driver.completedTrips}
                              <span className="text-muted-foreground">/{driver.totalTrips}</span>
                            </span>
                          </TableCell>

                          {/* Revenue */}
                          <TableCell className="hidden sm:table-cell text-right">
                            <span className="text-sm font-semibold text-emerald-700 dark:text-emerald-400">
                              {formatShortCurrency(driver.totalRevenue)}
                            </span>
                          </TableCell>

                          {/* Completion Rate */}
                          <TableCell className="hidden md:table-cell">
                            <div className="flex items-center justify-center gap-1.5">
                              <div className="w-16 h-1.5 bg-muted rounded-full overflow-hidden">
                                <motion.div
                                  className={cn(
                                    'h-full rounded-full',
                                    driver.completionRate >= 80
                                      ? 'bg-emerald-500'
                                      : driver.completionRate >= 50
                                        ? 'bg-amber-500'
                                        : 'bg-red-400'
                                  )}
                                  initial={{ width: 0 }}
                                  animate={{ width: `${Math.min(driver.completionRate, 100)}%` }}
                                  transition={{ duration: 0.6, delay: 0.2 }}
                                />
                              </div>
                              <span className="text-xs font-medium w-10 text-right">
                                {driver.completionRate.toFixed(0)}%
                              </span>
                            </div>
                          </TableCell>

                          {/* Fuel Efficiency */}
                          <TableCell className="hidden md:table-cell text-center">
                            <div className="flex items-center justify-center gap-1">
                              <Fuel className="size-3 text-muted-foreground" />
                              <span className="text-sm font-medium">
                                {driver.fuelEfficiency > 0 ? `${driver.fuelEfficiency.toFixed(1)}` : '—'}
                                <span className="text-xs text-muted-foreground ml-0.5">km/L</span>
                              </span>
                            </div>
                          </TableCell>
                        </TableRow>
                      )
                    })
                  )}
                </TableBody>
              </Table>
            </div>

            {/* Pagination */}
            {totalPages > 1 && (
              <div className="flex items-center justify-between px-6 pt-4 border-t mt-2">
                <p className="text-xs text-muted-foreground">
                  Showing {(page - 1) * PAGE_SIZE + 1}–{Math.min(page * PAGE_SIZE, sortedDrivers.length)} of{' '}
                  {sortedDrivers.length} drivers
                </p>
                <div className="flex gap-1">
                  <Button
                    variant="outline"
                    size="sm"
                    className="h-7 px-2.5 text-xs"
                    disabled={page <= 1}
                    onClick={() => setPage(page - 1)}
                  >
                    Previous
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    className="h-7 px-2.5 text-xs"
                    disabled={page >= totalPages}
                    onClick={() => setPage(page + 1)}
                  >
                    Next
                  </Button>
                </div>
              </div>
            )}
          </CardContent>
        </Card>
      </motion.div>
    </div>
  )
}
