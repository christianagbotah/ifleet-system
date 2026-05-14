'use client'

import { useEffect, useState, useCallback } from 'react'
import { motion } from 'framer-motion'
import { Clock, MapPin, User, RefreshCw } from 'lucide-react'
import { Skeleton } from '@/components/ui/skeleton'
import { Badge } from '@/components/ui/badge'
import { TRIP_STATUS_META } from '@/lib/trip-lifecycle'
import { fetchTripEvents, type TripEvent } from '@/lib/api'

interface TripTimelineProps {
  tripId: string
}

// ── helpers ──────────────────────────────────────────────────────────────────

const ACCRA_TZ = 'Africa/Accra'

function formatTimestamp(iso: string): string {
  const d = new Date(iso)
  const time = d.toLocaleTimeString('en-GB', {
    hour: '2-digit',
    minute: '2-digit',
    timeZone: ACCRA_TZ,
    hour12: false,
  })
  const day = d.toLocaleDateString('en-GB', {
    day: '2-digit',
    month: 'short',
    timeZone: ACCRA_TZ,
  })
  return `${time} · ${day}`
}

function formatElapsed(from: string, to: string): string | null {
  const ms = new Date(to).getTime() - new Date(from).getTime()
  if (ms < 0) return null
  const totalMin = Math.floor(ms / 60000)
  if (totalMin < 1) return 'just now'
  const h = Math.floor(totalMin / 60)
  const m = totalMin % 60
  if (h === 0) return `${m}m after`
  if (m === 0) return `${h}h after`
  return `${h}h ${m}m after`
}

function getTriggerBadge(triggerType: string) {
  switch (triggerType) {
    case 'geofence_auto':
      return (
        <Badge className="bg-amber-100 text-amber-700 border-amber-200 dark:bg-amber-900/30 dark:text-amber-400 dark:border-amber-800 text-[10px] px-1.5 py-0">
          Auto (Geofence)
        </Badge>
      )
    case 'gps_auto':
      return (
        <Badge className="bg-sky-100 text-sky-700 border-sky-200 dark:bg-sky-900/30 dark:text-sky-400 dark:border-sky-800 text-[10px] px-1.5 py-0">
          Auto (GPS)
        </Badge>
      )
    default:
      return (
        <Badge className="bg-gray-100 text-gray-600 border-gray-200 dark:bg-gray-800 dark:text-gray-400 dark:border-gray-700 text-[10px] px-1.5 py-0">
          Manual
        </Badge>
      )
  }
}

function getDotIcon(triggerType: string) {
  if (triggerType === 'geofence_auto') return <MapPin className="h-2.5 w-2.5 text-white" />
  if (triggerType === 'manual') return <User className="h-2.5 w-2.5 text-white" />
  return null
}

function getDotColor(status: string): string {
  const meta = TRIP_STATUS_META[status]
  if (!meta) return 'bg-gray-400'
  // Extract the base color from the bg class — we map to border-safe Tailwind classes
  const colorMap: Record<string, string> = {
    scheduled: 'bg-sky-500',
    loading: 'bg-amber-500',
    loaded: 'bg-yellow-500',
    waiting_at_depot: 'bg-orange-500',
    departed_depot: 'bg-lime-500',
    in_transit: 'bg-emerald-500',
    arrived_destination: 'bg-teal-500',
    waiting_to_offload: 'bg-orange-500',
    offloading: 'bg-violet-500',
    offloaded: 'bg-indigo-500',
    return_journey: 'bg-rose-500',
    arrived_depot: 'bg-cyan-500',
    completed: 'bg-gray-500',
    cancelled: 'bg-red-500',
  }
  return colorMap[status] || 'bg-gray-400'
}

// ── skeleton ─────────────────────────────────────────────────────────────────

function TimelineSkeleton() {
  return (
    <div className="space-y-0">
      {Array.from({ length: 3 }).map((_, i) => (
        <div key={i} className="flex items-start gap-3 py-3">
          <div className="relative flex flex-col items-center">
            <Skeleton className="h-7 w-7 rounded-full shrink-0" />
            {i < 2 && <Skeleton className="w-0.5 flex-1 mt-1 min-h-[32px]" />}
          </div>
          <div className="flex-1 pt-0.5 space-y-1.5">
            <Skeleton className="h-3.5 w-28" />
            <Skeleton className="h-3 w-40" />
          </div>
          <div className="shrink-0 space-y-1.5">
            <Skeleton className="h-3 w-20 ml-auto" />
            <Skeleton className="h-4 w-16 ml-auto rounded-full" />
          </div>
        </div>
      ))}
    </div>
  )
}

// ── single event row ─────────────────────────────────────────────────────────

interface EventRowProps {
  event: TripEvent
  isLatest: boolean
  prevEvent: TripEvent | null
  isLast: boolean
}

function EventRow({ event, isLatest, prevEvent, isLast }: EventRowProps) {
  const status = event.newStatus || event.toStatus
  const meta = TRIP_STATUS_META[status]
  const dotColor = getDotColor(status)
  const dotIcon = getDotIcon(event.triggerType)
  const elapsed = prevEvent
    ? formatElapsed(prevEvent.createdAt, event.createdAt)
    : null
  const prevLabel = prevEvent
    ? TRIP_STATUS_META[prevEvent.newStatus || prevEvent.toStatus]?.label
    : null

  return (
    <div className="flex items-start gap-3 relative">
      {/* Left: dot + connecting line */}
      <div className="flex flex-col items-center shrink-0 relative z-10">
        <div className="relative">
          {isLatest && (
            <span className="absolute inset-0 rounded-full animate-ping opacity-25 bg-current" style={{ color: 'var(--color-ring)' }} />
          )}
          <div
            className={`relative h-7 w-7 rounded-full flex items-center justify-center ${dotColor} ring-2 ring-background`}
          >
            {dotIcon}
          </div>
        </div>
        {!isLast && (
          <div className="w-0.5 flex-1 bg-border min-h-[32px]" />
        )}
      </div>

      {/* Middle: status info */}
      <div className="flex-1 min-w-0 pt-0.5">
        <div className="flex items-center gap-1.5">
          {meta?.icon && <span className="text-sm leading-none">{meta.icon}</span>}
          <span className="text-sm font-semibold leading-tight">
            {meta?.label ?? status}
          </span>
        </div>
        {elapsed && prevLabel && (
          <p className="text-[11px] text-muted-foreground mt-0.5">
            {elapsed}{' '}
            <span className="font-medium">{prevLabel}</span>
          </p>
        )}
        {!elapsed && !prevEvent && (
          <p className="text-[11px] text-muted-foreground mt-0.5">
            Trip created
          </p>
        )}
        {event.notes && (
          <p className="text-[11px] italic text-muted-foreground mt-0.5 line-clamp-2">
            &ldquo;{event.notes}&rdquo;
          </p>
        )}
      </div>

      {/* Right: timestamp + badge */}
      <div className="shrink-0 flex flex-col items-end gap-1 pt-0.5">
        <span className="text-[11px] text-muted-foreground whitespace-nowrap">
          {formatTimestamp(event.createdAt)}
        </span>
        {getTriggerBadge(event.triggerType || 'manual')}
      </div>
    </div>
  )
}

// ── main component ───────────────────────────────────────────────────────────

const containerVariants = {
  hidden: {},
  visible: {
    transition: {
      staggerChildren: 0.07,
    },
  },
}

const rowVariants = {
  hidden: { opacity: 0, y: 8 },
  visible: { opacity: 1, y: 0, transition: { duration: 0.25, ease: 'easeOut' } },
}

export function TripTimeline({ tripId }: TripTimelineProps) {
  const [events, setEvents] = useState<TripEvent[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const loadEvents = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const res = await fetchTripEvents(tripId)
      // Events come newest-first from the API; reverse for chronological display
      setEvents((res.data ?? []).slice().reverse())
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load trip events')
    } finally {
      setLoading(false)
    }
  }, [tripId])

  useEffect(() => {
    loadEvents()
  }, [loadEvents])

  // ── states ──

  if (loading) {
    return (
      <div className="py-1 px-1">
        <TimelineSkeleton />
      </div>
    )
  }

  if (error) {
    return (
      <div className="flex flex-col items-center justify-center gap-3 py-8 text-center">
        <Clock className="h-8 w-8 text-muted-foreground/50" />
        <p className="text-sm text-muted-foreground">{error}</p>
        <button
          type="button"
          onClick={loadEvents}
          className="inline-flex items-center gap-1.5 text-xs font-medium text-primary hover:underline"
        >
          <RefreshCw className="h-3 w-3" />
          Retry
        </button>
      </div>
    )
  }

  if (events.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center gap-2 py-8 text-center">
        <Clock className="h-8 w-8 text-muted-foreground/40" />
        <p className="text-sm text-muted-foreground">No events recorded yet</p>
      </div>
    )
  }

  // ── timeline ──

  return (
    <motion.div
      className="py-1 px-1"
      variants={containerVariants}
      initial="hidden"
      animate="visible"
    >
      {events.map((event, idx) => {
        const isLatest = idx === events.length - 1
        const isLast = idx === events.length - 1
        const prevEvent = idx > 0 ? events[idx - 1] : null

        return (
          <motion.div
            key={event.id}
            variants={rowVariants}
            className={isLast ? '' : 'pb-1'}
          >
            <EventRow
              event={event}
              isLatest={isLatest}
              prevEvent={prevEvent}
              isLast={isLast}
            />
          </motion.div>
        )
      })}
    </motion.div>
  )
}
