'use client'

import * as React from 'react'
import { Clock3, Play, RotateCcw } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Slider } from '@/components/ui/slider'
import type { ReplayPoint } from './control-tower-types'

interface Props {
  tripId: string | null
  token: string | null
  onPointsChange: (points: ReplayPoint[], activeIndex: number) => void
}

export function RouteReplay({ tripId, token, onPointsChange }: Props) {
  const [points, setPoints] = React.useState<ReplayPoint[]>([])
  const [index, setIndex] = React.useState(0)
  const [loading, setLoading] = React.useState(false)
  const [error, setError] = React.useState<string | null>(null)

  const load = React.useCallback(async () => {
    if (!tripId || !token) return
    setLoading(true)
    setError(null)
    try {
      const to = new Date()
      const from = new Date(to.getTime() - 24 * 60 * 60 * 1000)
      const query = new URLSearchParams({
        tripId,
        from: from.toISOString(),
        to: to.toISOString(),
        resolution: '1m',
      })
      const response = await fetch(`/api/telematics/history?${query.toString()}`, {
        headers: { Authorization: `Bearer ${token}` },
      })
      const body = await response.json()
      if (!response.ok) throw new Error(body.error || 'Failed to load route replay')
      const next = (body.points || []) as ReplayPoint[]
      setPoints(next)
      setIndex(Math.max(0, next.length - 1))
      onPointsChange(next, Math.max(0, next.length - 1))
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load route replay')
      setPoints([])
      onPointsChange([], 0)
    } finally {
      setLoading(false)
    }
  }, [tripId, token, onPointsChange])

  React.useEffect(() => {
    setPoints([])
    setIndex(0)
    onPointsChange([], 0)
  }, [tripId, onPointsChange])

  const setReplayIndex = (next: number) => {
    setIndex(next)
    onPointsChange(points, next)
  }

  return (
    <div className="rounded-xl border bg-card p-4">
      <div className="flex items-center justify-between gap-3">
        <div>
          <div className="flex items-center gap-2 text-sm font-semibold"><Clock3 className="h-4 w-4 text-amber-500" /> Route replay</div>
          <p className="mt-1 text-[11px] text-muted-foreground">Selected trip · last 24 hours · 1-minute resolution</p>
        </div>
        <Button size="sm" variant="outline" disabled={!tripId || loading} onClick={load}>
          {points.length ? <RotateCcw className="mr-1.5 h-3.5 w-3.5" /> : <Play className="mr-1.5 h-3.5 w-3.5" />}
          {loading ? 'Loading…' : points.length ? 'Reload' : 'Load replay'}
        </Button>
      </div>

      {error && <p className="mt-3 text-xs text-red-600">{error}</p>}
      {!tripId && <p className="mt-3 text-xs text-muted-foreground">Select a vehicle with an active trip to replay its route.</p>}
      {points.length > 0 && (
        <div className="mt-4 space-y-2">
          <Slider
            min={0}
            max={Math.max(0, points.length - 1)}
            step={1}
            value={[index]}
            onValueChange={(value) => setReplayIndex(value[0] ?? 0)}
          />
          <div className="flex items-center justify-between text-[11px] text-muted-foreground">
            <span>{new Date(points[0].deviceTimestamp).toLocaleTimeString()}</span>
            <span className="font-medium text-foreground">{index + 1} / {points.length}</span>
            <span>{new Date(points[points.length - 1].deviceTimestamp).toLocaleTimeString()}</span>
          </div>
        </div>
      )}
    </div>
  )
}
