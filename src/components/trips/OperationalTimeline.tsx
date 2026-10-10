'use client'

import * as React from 'react'
import { AlertTriangle, CheckCircle2, Clock3, Factory, MapPin, PackageCheck, RefreshCw, Route, Scale, ShieldCheck, Truck, WalletCards } from 'lucide-react'

import { apiFetch } from '@/lib/api'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'

interface OperationalEvent {
  id: string
  eventKey: string
  type: string
  occurredAt: string
  receivedAt: string
  source: string
  latitude: number | null
  longitude: number | null
  metadata: Record<string, unknown>
  evidenceRefs: string[]
  legacy?: boolean
}

const ICONS: Array<[RegExp, React.ComponentType<{ className?: string }>]> = [
  [/gate|queue|factory/, Factory],
  [/weigh/, Scale],
  [/waybill|document/, ShieldCheck],
  [/pod|delivery/, PackageCheck],
  [/settlement|reconcil/, WalletCards],
  [/exception|alert|hold/, AlertTriangle],
  [/depart|transit|arriv|trip\./, Route],
  [/assign|truck|dispatch/, Truck],
]

function iconFor(event: OperationalEvent) {
  return ICONS.find(([pattern]) => pattern.test(`${event.eventKey} ${event.type}`))?.[1] ?? CheckCircle2
}

function titleFor(event: OperationalEvent) {
  return event.eventKey.replace(/[._-]+/g, ' ').replace(/\b\w/g, (letter) => letter.toUpperCase())
}

function time(value: string) {
  return new Date(value).toLocaleString('en-GB', { timeZone: 'Africa/Accra', day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit', hour12: false })
}

function usefulMetadata(metadata: Record<string, unknown>) {
  const preferred = ['fromStatus','toStatus','status','direction','stage','siteId','truckId','driverId','waybillNumber','version','receivedQty','damagedQty','rejectedQty','clearancePassed','overrideApplied','reason','notes']
  return preferred.flatMap((key) => {
    const value = metadata[key]
    if (value == null || value === '' || typeof value === 'object') return []
    return [[key, String(value)] as const]
  }).slice(0, 4)
}

export function OperationalTimeline({ tripId }: { tripId: string }) {
  const [events, setEvents] = React.useState<OperationalEvent[]>([])
  const [loading, setLoading] = React.useState(true)
  const [error, setError] = React.useState<string | null>(null)

  const load = React.useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const result = await apiFetch<{ data: OperationalEvent[] }>(`/api/trips/${tripId}/timeline`)
      setEvents(result.data ?? [])
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load operational timeline')
    } finally {
      setLoading(false)
    }
  }, [tripId])

  React.useEffect(() => { void load() }, [load])

  if (loading) return <div className="py-8 text-center text-sm text-muted-foreground"><Clock3 className="mx-auto mb-2 h-5 w-5 animate-pulse" />Loading operational history…</div>
  if (error) return <div className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700 dark:border-red-900/50 dark:bg-red-950/20 dark:text-red-300"><div>{error}</div><Button variant="ghost" size="sm" className="mt-2" onClick={() => void load()}><RefreshCw className="mr-2 h-3.5 w-3.5" />Retry</Button></div>
  if (events.length === 0) return <div className="rounded-xl border border-dashed p-6 text-center text-sm text-muted-foreground">No operational events recorded yet.</div>

  return <div className="space-y-0">
    {events.map((event, index) => {
      const Icon = iconFor(event)
      const metadata = usefulMetadata(event.metadata)
      const delayedMinutes = Math.max(0, Math.floor((new Date(event.receivedAt).getTime() - new Date(event.occurredAt).getTime()) / 60000))
      return <div key={event.id} className="relative flex gap-3 pb-4">
        {index < events.length - 1 && <div className="absolute left-[15px] top-8 h-[calc(100%-20px)] w-px bg-border" />}
        <div className="relative z-10 flex h-8 w-8 shrink-0 items-center justify-center rounded-full border bg-background"><Icon className="h-4 w-4 text-amber-600" /></div>
        <div className="min-w-0 flex-1 rounded-xl border bg-muted/15 p-3">
          <div className="flex flex-wrap items-start justify-between gap-2"><div><div className="text-sm font-semibold">{titleFor(event)}</div><div className="mt-0.5 text-[11px] text-muted-foreground">{time(event.occurredAt)} · {event.source}</div></div><div className="flex gap-1">{event.legacy && <Badge variant="outline" className="text-[10px]">Legacy</Badge>}{delayedMinutes >= 5 && <Badge variant="secondary" className="text-[10px]">Received +{delayedMinutes}m</Badge>}</div></div>
          {metadata.length > 0 && <div className="mt-2 flex flex-wrap gap-1.5">{metadata.map(([key, value]) => <Badge key={`${event.id}-${key}`} variant="secondary" className="max-w-full text-[10px] font-normal"><span className="mr-1 opacity-60">{key.replace(/([A-Z])/g, ' $1')}:</span><span className="truncate">{value.replace(/_/g, ' ')}</span></Badge>)}</div>}
          {(event.latitude != null && event.longitude != null) && <div className="mt-2 flex items-center gap-1 text-[11px] text-muted-foreground"><MapPin className="h-3 w-3" />{event.latitude.toFixed(5)}, {event.longitude.toFixed(5)}</div>}
          {event.evidenceRefs.length > 0 && <div className="mt-2 text-[11px] text-muted-foreground">Evidence: {event.evidenceRefs.length} item{event.evidenceRefs.length === 1 ? '' : 's'}</div>}
        </div>
      </div>
    })}
  </div>
}
