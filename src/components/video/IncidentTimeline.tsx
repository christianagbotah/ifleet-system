'use client'

import * as React from 'react'
import { AlertTriangle, Camera, Clock3, Loader2, MapPin, PlayCircle, RefreshCw } from 'lucide-react'

import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogBody,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import {
  ensureFreshVideoSession,
  requestUiVideoSession,
  type UiVideoSession,
  type UiVideoSessionState,
} from '@/lib/domain/video/ui-session'

interface VideoIncidentRow {
  id: string
  deviceId: string
  tripId: string | null
  assetType: string | null
  assetId: string | null
  incidentType: string
  severity: string
  status: string
  title: string
  message: string | null
  latitude: number | null
  longitude: number | null
  occurredAt: string
  channelKey: string | null
  provider: string
  providerAlarmCode: string
}

function severityClass(severity: string) {
  if (severity === 'critical') return 'bg-red-100 text-red-700 dark:bg-red-950/40 dark:text-red-300'
  if (severity === 'high') return 'bg-orange-100 text-orange-700 dark:bg-orange-950/40 dark:text-orange-300'
  if (severity === 'medium') return 'bg-amber-100 text-amber-700 dark:bg-amber-950/40 dark:text-amber-300'
  return 'bg-slate-100 text-slate-700 dark:bg-slate-900/40 dark:text-slate-300'
}

export function IncidentTimeline({
  token,
  deviceId,
  limit = 12,
  compact = false,
}: {
  token: string | null
  deviceId?: string | null
  limit?: number
  compact?: boolean
}) {
  const [incidents, setIncidents] = React.useState<VideoIncidentRow[]>([])
  const [loading, setLoading] = React.useState(true)
  const [error, setError] = React.useState<string | null>(null)
  const [selected, setSelected] = React.useState<VideoIncidentRow | null>(null)
  const [session, setSession] = React.useState<UiVideoSession | null>(null)
  const [sessionState, setSessionState] = React.useState<UiVideoSessionState | null>(null)
  const [requesting, setRequesting] = React.useState(false)

  const load = React.useCallback(async () => {
    if (!token) {
      setLoading(false)
      return
    }
    setLoading(true)
    try {
      const query = new URLSearchParams({ limit: String(limit) })
      if (deviceId) query.set('deviceId', deviceId)
      const response = await fetch(`/api/video/incidents?${query.toString()}`, {
        headers: { Authorization: `Bearer ${token}` },
        cache: 'no-store',
      })
      const body = await response.json().catch(() => null)
      if (!response.ok) throw new Error(body?.error || 'Unable to load video incidents')
      setIncidents(Array.isArray(body?.data) ? body.data : [])
      setError(null)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to load video incidents')
    } finally {
      setLoading(false)
    }
  }, [deviceId, limit, token])

  React.useEffect(() => { load() }, [load])

  async function requestClip(incident: VideoIncidentRow) {
    if (!token) return
    setSelected(incident)
    setRequesting(true)
    const result = await ensureFreshVideoSession({
      current: selected?.id === incident.id ? session : null,
      request: () => requestUiVideoSession(
        fetch,
        `/api/video/incidents/${encodeURIComponent(incident.id)}/playback`,
        incident.channelKey ? { channelKey: incident.channelKey } : {},
        token,
      ),
    })
    setSessionState(result)
    setSession(result.state === 'ready' ? result.session : null)
    setRequesting(false)
  }

  const visible = compact ? incidents.slice(0, 5) : incidents

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between gap-3">
        <div>
          <p className="text-sm font-semibold">Video incidents</p>
          <p className="text-[11px] text-muted-foreground">ADAS/DMS alarms and event-linked video evidence.</p>
        </div>
        <Button size="icon-sm" variant="ghost" onClick={load} disabled={loading} aria-label="Refresh video incidents">
          <RefreshCw className={`h-3.5 w-3.5 ${loading ? 'animate-spin' : ''}`} />
        </Button>
      </div>

      {error && <div className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-xs text-amber-800">{error}</div>}
      {loading && incidents.length === 0 && <div className="rounded-lg border border-dashed p-4 text-xs text-muted-foreground">Loading incidents…</div>}
      {!loading && incidents.length === 0 && !error && <div className="rounded-lg border border-dashed p-4 text-xs text-muted-foreground">No video incidents recorded.</div>}

      <div className="space-y-2">
        {visible.map((incident) => (
          <div key={incident.id} className="rounded-xl border bg-card p-3">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <div className="flex items-center gap-2">
                  <AlertTriangle className="h-3.5 w-3.5 shrink-0 text-amber-500" />
                  <p className="truncate text-xs font-semibold">{incident.title}</p>
                </div>
                <p className="mt-1 line-clamp-2 text-[11px] text-muted-foreground">{incident.message || incident.incidentType.replaceAll('-', ' ')}</p>
              </div>
              <Badge className={`${severityClass(incident.severity)} shrink-0 text-[9px]`}>{incident.severity}</Badge>
            </div>
            <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-[10px] text-muted-foreground">
              <span className="inline-flex items-center gap-1"><Clock3 className="h-3 w-3" /> {new Date(incident.occurredAt).toLocaleString()}</span>
              {incident.tripId && <span>Trip · {incident.tripId}</span>}
              {incident.latitude != null && incident.longitude != null && (
                <span className="inline-flex items-center gap-1"><MapPin className="h-3 w-3" /> {incident.latitude.toFixed(4)}, {incident.longitude.toFixed(4)}</span>
              )}
            </div>
            <Button size="sm" variant="outline" className="mt-3 w-full gap-2" onClick={() => requestClip(incident)} disabled={requesting && selected?.id === incident.id}>
              {requesting && selected?.id === incident.id ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <PlayCircle className="h-3.5 w-3.5" />}
              Request clip
            </Button>
          </div>
        ))}
      </div>

      <Dialog open={Boolean(selected)} onOpenChange={(open) => { if (!open) { setSelected(null); setSession(null); setSessionState(null) } }}>
        <DialogContent className="sm:max-w-3xl">
          <DialogHeader>
            <DialogTitle>{selected?.title || 'Incident playback'}</DialogTitle>
            <DialogDescription>Playback is requested on demand and uses a short-lived provider session.</DialogDescription>
          </DialogHeader>
          <DialogBody className="space-y-4">
            {selected && sessionState?.state === 'ready' && (
              <div className="space-y-3">
                <div className="overflow-hidden rounded-xl bg-black">
                  <video controls playsInline preload="metadata" src={sessionState.session.url} className="aspect-video w-full bg-black" />
                </div>
                <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-muted-foreground">
                  <span>{selected.incidentType.replaceAll('-', ' ')}</span>
                  <span>Session expires {new Date(sessionState.session.expiresAt).toLocaleTimeString()}</span>
                </div>
                <Button variant="outline" size="sm" className="gap-2" onClick={() => requestClip(selected)} disabled={requesting}>
                  <RefreshCw className={`h-3.5 w-3.5 ${requesting ? 'animate-spin' : ''}`} /> Refresh secure clip
                </Button>
              </div>
            )}
            {selected && !sessionState && requesting && <div className="flex min-h-64 items-center justify-center"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>}
            {selected && sessionState && sessionState.state !== 'ready' && (
              <div className="flex min-h-48 flex-col items-center justify-center rounded-xl border border-dashed p-6 text-center">
                <Camera className="mb-3 h-8 w-8 text-muted-foreground" />
                <p className="text-sm font-medium">{sessionState.message}</p>
                <Button className="mt-4" size="sm" onClick={() => requestClip(selected)}>Try again</Button>
              </div>
            )}
          </DialogBody>
        </DialogContent>
      </Dialog>
    </div>
  )
}
