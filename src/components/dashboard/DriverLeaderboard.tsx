'use client'

import { useQuery } from '@tanstack/react-query'
import { Trophy, Medal, Star } from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'
import { cn } from '@/lib/utils'
import { formatShortCurrency } from '@/lib/currency'
import { DriverAvatar } from '@/components/ui/driver-avatar'

interface DriverStats {
  driverName: string
  completedTrips: number
  totalRevenue: number
}

const rankConfig = [
  {
    rank: 1,
    icon: Trophy,
    color: 'text-yellow-500',
    bg: 'bg-yellow-50 dark:bg-yellow-950/30',
    badgeBg: 'bg-yellow-100 dark:bg-yellow-900/40',
    badgeText: 'text-yellow-700 dark:text-yellow-400',
    size: 'size-8',
  },
  {
    rank: 2,
    icon: Medal,
    color: 'text-slate-400',
    bg: 'bg-slate-50 dark:bg-slate-800/50',
    badgeBg: 'bg-slate-100 dark:bg-slate-800/50',
    badgeText: 'text-slate-600 dark:text-slate-300',
    size: 'size-7',
  },
  {
    rank: 3,
    icon: Medal,
    color: 'text-amber-600',
    bg: 'bg-amber-50 dark:bg-amber-950/30',
    badgeBg: 'bg-amber-100 dark:bg-amber-900/40',
    badgeText: 'text-amber-700 dark:text-amber-400',
    size: 'size-7',
  },
]

export function DriverLeaderboard() {
  const { data: leaderboard = [], isLoading } = useQuery<DriverStats[]>({
    queryKey: ['driver-leaderboard'],
    queryFn: async () => {
      const res = await fetch('/api/trips')
      if (!res.ok) return []
      const trips = await res.json()

      // Aggregate by driver
      const driverMap: Record<string, { driverName: string; completedTrips: number; totalRevenue: number }> = {}
      for (const trip of trips) {
        const driverName = trip.driver ? `${trip.driver.firstName} ${trip.driver.lastName}` : null
        if (!driverName) continue
        if (!driverMap[trip.driverId]) {
          driverMap[trip.driverId] = { driverName, completedTrips: 0, totalRevenue: 0 }
        }
        if (trip.status === 'completed') {
          driverMap[trip.driverId].completedTrips += 1
        }
        driverMap[trip.driverId].totalRevenue += trip.totalRevenue || 0
      }

      // Sort by totalRevenue descending and take top 5
      return Object.values(driverMap)
        .sort((a, b) => b.totalRevenue - a.totalRevenue)
        .slice(0, 5)
    },
    staleTime: 30_000,
  })

  if (isLoading) {
    return (
      <Card className="border-0 shadow-sm">
        <CardHeader className="pb-2">
          <Skeleton className="h-6 w-40" />
        </CardHeader>
        <CardContent className="p-4 space-y-3">
          {Array.from({ length: 5 }).map((_, i) => (
            <Skeleton key={i} className="h-14 w-full rounded-lg" />
          ))}
        </CardContent>
      </Card>
    )
  }

  return (
    <Card className="border-0 shadow-sm">
      <CardHeader className="pb-2">
        <CardTitle className="text-lg font-semibold flex items-center gap-2">
          <Trophy className="size-5 text-yellow-500" />
          Top Drivers
        </CardTitle>
      </CardHeader>
      <CardContent className="p-4 space-y-2">
        {leaderboard.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-8 text-muted-foreground">
            <Star className="size-8 opacity-30 mb-2" />
            <p className="text-sm">No trip data yet</p>
          </div>
        ) : (
          leaderboard.map((driver, idx) => {
            const rank = idx + 1
            const config = rank <= 3 ? rankConfig[rank - 1] : null
            const Icon = config?.icon || Star

            return (
              <div
                key={idx}
                className={cn(
                  'flex items-center gap-3 p-3 rounded-xl transition-all',
                  config?.bg || 'hover:bg-muted/50'
                )}
              >
                {/* Rank Badge */}
                <div className={cn('flex-shrink-0 flex items-center justify-center rounded-full', config?.badgeBg || 'bg-muted', config?.size || 'size-6')}>
                  {rank <= 3 ? (
                    <Icon className={cn(config?.size === 'size-8' ? 'size-4' : 'size-3.5', config?.color)} />
                  ) : (
                    <span className="text-xs font-bold text-muted-foreground">{rank}</span>
                  )}
                </div>

                {/* Driver Avatar */}
                <DriverAvatar name={driver.driverName} size="sm" />

                {/* Driver Info */}
                <div className="flex-1 min-w-0">
                  <div className="flex items-center justify-between">
                    <p className={cn('text-sm font-medium truncate', rank === 1 && 'text-yellow-700 dark:text-yellow-400')}>
                      {driver.driverName}
                    </p>
                    <p className={cn('text-sm font-bold ml-2', rank === 1 ? 'text-yellow-600 dark:text-yellow-400' : 'text-foreground')}>
                      {formatShortCurrency(driver.totalRevenue)}
                    </p>
                  </div>
                  <div className="flex items-center justify-between mt-0.5">
                    <p className="text-xs text-muted-foreground">
                      {driver.completedTrips} trip{driver.completedTrips !== 1 ? 's' : ''}
                    </p>
                  </div>
                </div>
              </div>
            )
          })
        )}
      </CardContent>
    </Card>
  )
}
