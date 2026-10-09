'use client'

import * as React from 'react'
import dynamic from 'next/dynamic'
import { LocateFixed, Map, Mountain, RadioTower, RefreshCw, Satellite, Truck, Wifi, WifiOff } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent } from '@/components/ui/card'
import { useAuthStore } from '@/lib/store/auth'
import { AlarmFeed } from './AlarmFeed'
import { RouteReplay } from './RouteReplay'
import { VehicleTelemetryDrawer } from './VehicleTelemetryDrawer'
import type { ControlTowerLiveRecord, ReplayPoint } from './control-tower-types'

const MapContainer = dynamic(() => import('react-leaflet').then((mod) => mod.MapContainer), { ssr: false })
const TileLayer = dynamic(() => import('react-leaflet').then((mod) => mod.TileLayer), { ssr: false })
const CircleMarker = dynamic(() => import('react-leaflet').then((mod) => mod.CircleMarker), { ssr: false })
const Popup = dynamic(() => import('react-leaflet').then((mod) => mod.Popup), { ssr: false })
const Polyline = dynamic(() => import('react-leaflet').then((mod) => mod.Polyline), { ssr: false })

const GHANA_CENTER: [number, number] = [7.9465, -1.0232]

type MapMode = 'Road' | 'Terrain' | 'Satellite'
const MAP_LAYERS: Record<MapMode, { url: string; attribution: string }> = {
  Road: {
    url: 'https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png',
    attribution: '&copy; OpenStreetMap contributors',
  },
  Terrain: {
    url: 'https://{s}.tile.opentopomap.org/{z}/{x}/{y}.png',
    attribution: 'Map data &copy; OpenStreetMap contributors, SRTM | Map style &copy; OpenTopoMap',
  },
  Satellite: {
    url: 'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}',
    attribution: 'Tiles &copy; Esri',
  },
}

function stateColor(state: ControlTowerLiveRecord['connectionState']) {
  if (state === 'online') return '#10b981'
  if (state === 'stale') return '#f59e0b'
  return '#ef4444'
}

export function ControlTower() {
  const { token } = useAuthStore()
  const [records, setRecords] = React.useState<ControlTowerLiveRecord[]>([])
  const [selectedId, setSelectedId] = React.useState<string | null>(null)
  const [mapMode, setMapMode] = React.useState<MapMode>('Road')
  const [loading, setLoading] = React.useState(true)
  const [error, setError] = React.useState<string | null>(null)
  const [generatedAt, setGeneratedAt] = React.useState<string | null>(null)
  const [replayPoints, setReplayPoints] = React.useState<ReplayPoint[]>([])
  const [replayIndex, setReplayIndex] = React.useState(0)

  const loadLive = React.useCallback(async () => {
    if (!token) return
    try {
      const response = await fetch('/api/telematics/live', {
        headers: { Authorization: `Bearer ${token}` },
        cache: 'no-store',
      })
      const body = await response.json()
      if (!response.ok) throw new Error(body.error || 'Failed to load Control Tower')
      setRecords(body.data || [])
      setGeneratedAt(body.generatedAt || null)
      setError(null)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load Control Tower')
    } finally {
      setLoading(false)
    }
  }, [token])

  React.useEffect(() => {
    loadLive()
    const timer = window.setInterval(loadLive, 15_000)
    return () => window.clearInterval(timer)
  }, [loadLive])

  React.useEffect(() => {
    const link = document.createElement('link')
    link.rel = 'stylesheet'
    link.href = 'https://unpkg.com/leaflet@1.9.4/dist/leaflet.css'
    document.head.appendChild(link)
    return () => link.remove()
  }, [])

  React.useEffect(() => {
    if (selectedId && !records.some((record) => record.assetId === selectedId)) setSelectedId(null)
  }, [records, selectedId])

  const selected = records.find((record) => record.assetId === selectedId) ?? null
  const online = records.filter((record) => record.connectionState === 'online').length
  const stale = records.filter((record) => record.connectionState === 'stale').length
  const offline = records.filter((record) => record.connectionState === 'offline').length
  const replayPath = replayPoints.slice(0, Math.max(0, replayIndex) + 1).map((point) => [point.latitude, point.longitude] as [number, number])
  const replayActive = replayPoints[replayIndex] ?? null

  const handleReplay = React.useCallback((points: ReplayPoint[], activeIndex: number) => {
    setReplayPoints(points)
    setReplayIndex(activeIndex)
  }, [])

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-3 xl:flex-row xl:items-end xl:justify-between">
        <div>
          <div className="flex items-center gap-2">
            <div className="rounded-xl bg-amber-500 p-2 text-white shadow-lg shadow-amber-500/20"><RadioTower className="h-5 w-5" /></div>
            <div>
              <h1 className="text-2xl font-bold tracking-tight">Control Tower</h1>
              <p className="text-sm text-muted-foreground">Trusted live telemetry, route intelligence and fleet exceptions.</p>
            </div>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {(['Road', 'Terrain', 'Satellite'] as MapMode[]).map((mode) => (
            <Button key={mode} size="sm" variant={mapMode === mode ? 'default' : 'outline'} onClick={() => setMapMode(mode)}>
              {mode === 'Road' ? <Map className="mr-1.5 h-3.5 w-3.5" /> : mode === 'Terrain' ? <Mountain className="mr-1.5 h-3.5 w-3.5" /> : <Satellite className="mr-1.5 h-3.5 w-3.5" />}
              {mode}
            </Button>
          ))}
          <Button size="sm" variant="outline" onClick={loadLive}><RefreshCw className="mr-1.5 h-3.5 w-3.5" /> Refresh</Button>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Card><CardContent className="p-4"><p className="text-xs text-muted-foreground">Tracked assets</p><p className="mt-1 text-2xl font-bold">{records.length}</p></CardContent></Card>
        <Card><CardContent className="p-4"><div className="flex items-center gap-2 text-xs text-muted-foreground"><Wifi className="h-3.5 w-3.5 text-emerald-500" /> Online</div><p className="mt-1 text-2xl font-bold text-emerald-600">{online}</p></CardContent></Card>
        <Card><CardContent className="p-4"><div className="flex items-center gap-2 text-xs text-muted-foreground"><LocateFixed className="h-3.5 w-3.5 text-amber-500" /> Stale</div><p className="mt-1 text-2xl font-bold text-amber-600">{stale}</p></CardContent></Card>
        <Card><CardContent className="p-4"><div className="flex items-center gap-2 text-xs text-muted-foreground"><WifiOff className="h-3.5 w-3.5 text-red-500" /> Offline</div><p className="mt-1 text-2xl font-bold text-red-600">{offline}</p></CardContent></Card>
      </div>

      {error && <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{error}</div>}

      <div className="grid min-h-[680px] grid-cols-1 gap-4 xl:grid-cols-[280px_minmax(0,1fr)_330px]">
        <div className="space-y-4">
          <div className="overflow-hidden rounded-xl border bg-card">
            <div className="border-b px-4 py-3 text-sm font-semibold">Active fleet</div>
            <div className="max-h-[430px] overflow-y-auto divide-y">
              {loading ? <div className="p-5 text-xs text-muted-foreground">Loading telemetry…</div> : records.length === 0 ? <div className="p-5 text-xs text-muted-foreground">No normalized telemetry has arrived yet.</div> : records.map((record) => (
                <button key={`${record.assetType}:${record.assetId}`} onClick={() => setSelectedId(record.assetId)} className={`flex w-full items-center gap-3 px-3 py-3 text-left transition-colors hover:bg-muted/60 ${selectedId === record.assetId ? 'bg-amber-50 dark:bg-amber-950/20' : ''}`}>
                  <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ background: stateColor(record.connectionState) }} />
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2"><span className="truncate text-sm font-medium">{record.label}</span><Badge variant="outline" className="px-1.5 text-[9px] capitalize">{record.source}</Badge></div>
                    <p className="truncate text-[11px] text-muted-foreground">{record.driverName || record.assetType} · {record.speedKph == null ? '—' : `${Math.round(record.speedKph)} km/h`}</p>
                  </div>
                </button>
              ))}
            </div>
          </div>
          <AlarmFeed records={records} />
        </div>

        <div className="overflow-hidden rounded-xl border bg-muted/20">
          <div className="h-[680px]">
            <MapContainer center={GHANA_CENTER} zoom={7} style={{ height: '100%', width: '100%' }}>
              <TileLayer key={mapMode} url={MAP_LAYERS[mapMode].url} attribution={MAP_LAYERS[mapMode].attribution} />
              {records.map((record) => (
                <CircleMarker key={`${record.assetType}:${record.assetId}`} center={[record.latitude, record.longitude]} radius={selectedId === record.assetId ? 10 : 7} pathOptions={{ color: stateColor(record.connectionState), fillColor: stateColor(record.connectionState), fillOpacity: 0.8, weight: selectedId === record.assetId ? 4 : 2 }} eventHandlers={{ click: () => setSelectedId(record.assetId) }}>
                  <Popup><div className="text-xs"><strong>{record.label}</strong><br />{record.source} · {record.connectionState}<br />{record.speedKph == null ? '—' : `${Math.round(record.speedKph)} km/h`}</div></Popup>
                </CircleMarker>
              ))}
              {replayPath.length > 1 && <Polyline positions={replayPath} pathOptions={{ weight: 4, opacity: 0.75 }} />}
              {replayActive && <CircleMarker center={[replayActive.latitude, replayActive.longitude]} radius={8} pathOptions={{ weight: 4, fillOpacity: 0.9 }} />}
            </MapContainer>
          </div>
        </div>

        <div className="space-y-4">
          <VehicleTelemetryDrawer record={selected} />
          <RouteReplay tripId={selected?.tripId ?? null} token={token} onPointsChange={handleReplay} />
          <div className="rounded-xl border bg-card px-4 py-3 text-[11px] text-muted-foreground">
            <div className="flex items-center gap-2"><Truck className="h-3.5 w-3.5" /> Source priority: hardwired GNSS → MDVR → phone → manual.</div>
            {generatedAt && <div className="mt-1">Snapshot generated {new Date(generatedAt).toLocaleTimeString()}.</div>}
          </div>
        </div>
      </div>
    </div>
  )
}
