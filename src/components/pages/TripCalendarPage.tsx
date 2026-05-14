'use client'

import { useState, useMemo } from 'react'
import { useQuery } from '@tanstack/react-query'
import {
  format,
  startOfMonth,
  endOfMonth,
  startOfWeek,
  endOfWeek,
  addDays,
  addMonths,
  subMonths,
  isSameMonth,
  isSameDay,
  isToday,
} from 'date-fns'
import { ChevronLeft, ChevronRight, Calendar, Route } from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { CalendarSkeleton } from '@/components/ui/page-skeleton'
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover'
import { cn } from '@/lib/utils'
import { formatCurrency } from '@/lib/currency'
import { DriverAvatar } from '@/components/ui/driver-avatar'

// ─── Types ──────────────────────────────────────────────────────────────────
interface TripData {
  id: string
  tripNumber: string
  driver?: { id: string; driverName: string } | null
  status: string
  totalAmount: number
  originAddress: string
  destinationAddress: string
  departureDate: string
  createdAt: string
}

// ─── Status config ──────────────────────────────────────────────────────────
const statusColors: Record<string, string> = {
  pending: 'bg-yellow-100 text-yellow-800 border-yellow-200 dark:bg-yellow-900/30 dark:text-yellow-400 dark:border-yellow-800/50',
  in_progress: 'bg-blue-100 text-blue-800 border-blue-200 dark:bg-blue-900/30 dark:text-blue-400 dark:border-blue-800/50',
  completed: 'bg-emerald-100 text-emerald-800 border-emerald-200 dark:bg-emerald-900/30 dark:text-emerald-400 dark:border-emerald-800/50',
  cancelled: 'bg-red-100 text-red-800 border-red-200 dark:bg-red-900/30 dark:text-red-400 dark:border-red-800/50',
}

const statusDotColors: Record<string, string> = {
  pending: 'bg-yellow-500',
  in_progress: 'bg-blue-500',
  completed: 'bg-emerald-500',
  cancelled: 'bg-red-500',
}

const statusBarColors: Record<string, string> = {
  pending: 'bg-yellow-400 dark:bg-yellow-500',
  in_progress: 'bg-blue-400 dark:bg-blue-500',
  completed: 'bg-emerald-400 dark:bg-emerald-500',
  cancelled: 'bg-red-400 dark:bg-red-500',
}

const statusLabels: Record<string, string> = {
  pending: 'Pending',
  in_progress: 'In Progress',
  completed: 'Completed',
  cancelled: 'Cancelled',
}

const legendItems = [
  { status: 'pending', label: 'Pending' },
  { status: 'in_progress', label: 'In Progress' },
  { status: 'completed', label: 'Completed' },
  { status: 'cancelled', label: 'Cancelled' },
]

const dayNames = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']

// ─── Calendar Page ──────────────────────────────────────────────────────────
export default function TripCalendarPage() {
  const [currentMonth, setCurrentMonth] = useState(new Date())
  const [selectedDay, setSelectedDay] = useState<Date | null>(null)

  const { data: trips = [], isLoading } = useQuery<TripData[]>({
    queryKey: ['trips'],
    queryFn: async () => {
      const res = await fetch('/api/trips')
      if (!res.ok) throw new Error('Failed to fetch trips')
      return res.json()
    },
    staleTime: 30_000,
  })

  // Filter trips for selected month
  const monthTrips = useMemo(() => {
    const monthStart = startOfMonth(currentMonth)
    const monthEnd = endOfMonth(currentMonth)
    return trips.filter((trip) => {
      const date = trip.departureDate ? new Date(trip.departureDate) : new Date(trip.createdAt)
      return date >= monthStart && date <= monthEnd
    })
  }, [trips, currentMonth])

  // Group trips by day
  const tripsByDay = useMemo(() => {
    const map: Record<string, TripData[]> = {}
    for (const trip of monthTrips) {
      const date = trip.departureDate ? new Date(trip.departureDate) : new Date(trip.createdAt)
      const key = format(date, 'yyyy-MM-dd')
      if (!map[key]) map[key] = []
      map[key].push(trip)
    }
    return map
  }, [monthTrips])

  // Get trips for a specific day
  const getTripsForDay = (day: Date): TripData[] => {
    const key = format(day, 'yyyy-MM-dd')
    return tripsByDay[key] || []
  }

  // Calendar grid calculation
  const calendarDays = useMemo(() => {
    const monthStart = startOfMonth(currentMonth)
    const monthEnd = endOfMonth(currentMonth)
    const calStart = startOfWeek(monthStart)
    const calEnd = endOfWeek(monthEnd)

    const days: Date[] = []
    let day = calStart
    while (day <= calEnd) {
      days.push(day)
      day = addDays(day, 1)
    }
    return days
  }, [currentMonth])

  const goToPrevMonth = () => setCurrentMonth((m) => subMonths(m, 1))
  const goToNextMonth = () => setCurrentMonth((m) => addMonths(m, 1))
  const goToToday = () => {
    setCurrentMonth(new Date())
    setSelectedDay(new Date())
  }

  // Trips for selected day popover
  const selectedDayTrips = selectedDay ? getTripsForDay(selectedDay) : []

  if (isLoading) return <CalendarSkeleton />

  return (
    <div className="p-4 md:p-6 space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 pb-4 border-b">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <Route className="size-4 text-muted-foreground" />
            <span className="text-sm text-muted-foreground">Operations</span>
          </div>
          <div className="flex items-center gap-3">
            <h1 className="text-2xl font-bold">Trip Calendar</h1>
            <span className="text-sm font-medium text-muted-foreground bg-muted rounded-full px-2.5 py-0.5">
              {monthTrips.length} trip{monthTrips.length !== 1 ? 's' : ''}
            </span>
          </div>
          <p className="text-muted-foreground text-sm">Monthly overview of transport trips</p>
        </div>
      </div>

      {/* Calendar Card */}
      <Card className="border-0 shadow-sm">
        <CardHeader className="pb-4">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
            {/* Month Navigation */}
            <div className="flex items-center gap-3">
              <Button variant="outline" size="icon" className="size-9" onClick={goToPrevMonth}>
                <ChevronLeft className="size-4" />
              </Button>
              <h2 className="text-lg font-semibold min-w-[160px] text-center">
                <Calendar className="inline size-4 mr-2 text-muted-foreground" />
                {format(currentMonth, 'MMMM yyyy')}
              </h2>
              <Button variant="outline" size="icon" className="size-9" onClick={goToNextMonth}>
                <ChevronRight className="size-4" />
              </Button>
            </div>
            <div className="flex items-center gap-4">
              {/* Legend */}
              <div className="hidden sm:flex items-center gap-3">
                {legendItems.map((item) => (
                  <div key={item.status} className="flex items-center gap-1.5">
                    <span className={cn('size-2.5 rounded-full', statusDotColors[item.status])} />
                    <span className="text-xs text-muted-foreground">{item.label}</span>
                  </div>
                ))}
              </div>
              <Button variant="outline" size="sm" onClick={goToToday}>
                Today
              </Button>
            </div>
          </div>
          {/* Mobile Legend */}
          <div className="flex sm:hidden items-center gap-3 pt-2">
            {legendItems.map((item) => (
              <div key={item.status} className="flex items-center gap-1.5">
                <span className={cn('size-2.5 rounded-full', statusDotColors[item.status])} />
                <span className="text-xs text-muted-foreground">{item.label}</span>
              </div>
            ))}
          </div>
        </CardHeader>
        <CardContent className="pb-6">
          {/* Day Names Header */}
          <div className="grid grid-cols-7 gap-1 mb-1">
            {dayNames.map((name) => (
              <div key={name} className="text-center text-xs font-medium text-muted-foreground py-2">
                {name}
              </div>
            ))}
          </div>

          {/* Calendar Grid */}
          <div className="grid grid-cols-7 gap-1">
            {calendarDays.map((day, idx) => {
              const dayTrips = getTripsForDay(day)
              const inMonth = isSameMonth(day, currentMonth)
              const today = isToday(day)
              const isSelected = selectedDay && isSameDay(day, selectedDay)

              return (
                <Popover
                  key={idx}
                  open={isSelected && dayTrips.length > 0 ? true : undefined}
                  onOpenChange={(open) => {
                    if (open) {
                      setSelectedDay(day)
                    } else {
                      setSelectedDay(null)
                    }
                  }}
                >
                  <PopoverTrigger asChild>
                    <button
                      className={cn(
                        'relative aspect-square flex flex-col items-center justify-start pt-1.5 rounded-lg text-sm transition-all duration-150 cursor-pointer',
                        inMonth
                          ? today
                            ? 'bg-emerald-50 dark:bg-emerald-900/20 ring-2 ring-emerald-500 ring-offset-1 dark:ring-offset-background'
                            : 'hover:bg-muted/80'
                          : 'text-muted-foreground/40 hover:bg-muted/30',
                        isSelected && 'bg-muted'
                      )}
                      disabled={!inMonth}
                    >
                      <span
                        className={cn(
                          'text-xs font-medium',
                          today && 'text-emerald-600 dark:text-emerald-400 font-bold',
                          !inMonth && 'opacity-40'
                        )}
                      >
                        {format(day, 'd')}
                      </span>
                      {/* Trip indicators */}
                      {dayTrips.length > 0 && (
                        <div className="flex items-center gap-[2px] mt-1 flex-wrap justify-center">
                          {dayTrips.slice(0, 3).map((trip, tripIdx) => (
                            <span
                              key={trip.id}
                              className={cn(
                                'rounded-full',
                                dayTrips.length <= 2 ? 'size-2' : 'size-1.5',
                                statusBarColors[trip.status] || 'bg-gray-400'
                              )}
                            />
                          ))}
                          {dayTrips.length > 3 && (
                            <span className="text-[8px] text-muted-foreground leading-none ml-0.5">
                              +{dayTrips.length - 3}
                            </span>
                          )}
                        </div>
                      )}
                    </button>
                  </PopoverTrigger>
                  <PopoverContent className="w-72 p-0" align="start">
                    <div className="p-3 border-b">
                      <p className="text-sm font-semibold">
                        {format(day, 'EEEE, MMMM d, yyyy')}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        {dayTrips.length} trip{dayTrips.length !== 1 ? 's' : ''}
                      </p>
                    </div>
                    {dayTrips.length > 0 ? (
                      <div className="max-h-64 overflow-y-auto">
                        {dayTrips.map((trip) => (
                          <div
                            key={trip.id}
                            className="flex items-start gap-3 px-3 py-2.5 hover:bg-muted/50 transition-colors border-b last:border-b-0"
                          >
                            <DriverAvatar
                              name={trip.driver?.driverName}
                              size="sm"
                            />
                            <div className="flex-1 min-w-0">
                              <div className="flex items-center justify-between gap-2">
                                <p className="text-sm font-medium truncate">
                                  {trip.tripNumber}
                                </p>
                                <Badge
                                  variant="outline"
                                  className={cn('text-[10px] px-1.5 py-0 flex-shrink-0', statusColors[trip.status] || '')}
                                >
                                  {statusLabels[trip.status] || trip.status}
                                </Badge>
                              </div>
                              <p className="text-xs text-muted-foreground truncate">
                                {trip.driver?.driverName || 'Unassigned'}
                              </p>
                              <p className="text-[10px] text-muted-foreground truncate">
                                {trip.originAddress || '—'} → {trip.destinationAddress || '—'}
                              </p>
                              <p className="text-xs font-semibold text-emerald-600 dark:text-emerald-400 mt-0.5">
                                {formatCurrency(trip.totalAmount)}
                              </p>
                            </div>
                          </div>
                        ))}
                      </div>
                    ) : (
                      <div className="p-6 text-center text-muted-foreground">
                        <Route className="size-6 opacity-30 mx-auto mb-1" />
                        <p className="text-xs">No trips this day</p>
                      </div>
                    )}
                  </PopoverContent>
                </Popover>
              )
            })}
          </div>
        </CardContent>
      </Card>

      {/* Month Summary */}
      <Card className="border-0 shadow-sm">
        <CardContent className="p-4">
          <div className="flex flex-wrap gap-4">
            {legendItems.map((item) => {
              const count = monthTrips.filter((t) => t.status === item.status).length
              const total = monthTrips.filter((t) => t.status === item.status).reduce((s, t) => s + t.totalAmount, 0)
              return (
                <div key={item.status} className="flex items-center gap-2.5">
                  <span className={cn('size-3 rounded-full', statusDotColors[item.status])} />
                  <div>
                    <p className="text-xs text-muted-foreground">
                      {item.label} ({count})
                    </p>
                    <p className="text-sm font-semibold">{formatCurrency(total)}</p>
                  </div>
                </div>
              )
            })}
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
