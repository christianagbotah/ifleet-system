'use client'

import * as React from 'react'
import dynamic from 'next/dynamic'
import {
  Route, Calendar, MapPin, Gauge, Clock, Navigation, Activity, Loader2,
} from 'lucide-react'
import {
  Dialog, DialogBody, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { toast } from 'sonner'
import { fetchLocationHistory, type TruckLocation } from '@/lib/api'

// Dynamic imports for react-leaflet (SSR incompatible)
const MapContainer = dynamic(
  () => import('react-leaflet').then(mod => mod.MapContainer),
  { ssr: false }
)
const TileLayer = dynamic(
  () => import('react-leaflet').then(mod => mod.TileLayer),
  { ssr: false }
)
const Polyline = dynamic(
  () => import('react-leaflet').then(mod => mod.Polyline),
  { ssr: false }
)
const Marker = dynamic(
  () => import('react-leaflet').then(mod => mod.Marker),
  { ssr: false }
)

let _L: typeof import('leaflet')['default'] | null = null
async function getLeaflet() {
  if (!_L) { const m = await import('leaflet'); _L = m.default }
  return _L
}

interface RouteHistoryDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  truckId: string
  plateNumber: string
}

function haversineDistance(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 6371000
  const dLat = ((lat2 - lat1) * Math.PI) / 180
  const dLon = ((lon2 - lon1) * Math.PI) / 180
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos((lat1 * Math.PI) / 180) * Math.cos((lat2 * Math.PI) / 180) *
    Math.sin(dLon / 2) * Math.sin(dLon / 2)
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a))
  return R * c
}

function formatDuration(ms: number): string {
  const totalSeconds = Math.floor(ms / 1000)
  const hours = Math.floor(totalSeconds / 3600)
  const minutes = Math.floor((totalSeconds % 3600) / 60)
  if (hours > 0) return `${hours}h ${minutes}m`
  return `${minutes}m`
}

function formatDistance(meters: number): string {
  if (meters >= 1000) return `${(meters / 1000).toFixed(1)} km`
  return `${Math.round(meters)} m`
}

export function RouteHistoryDialog({ open, onOpenChange, truckId, plateNumber }: RouteHistoryDialogProps) {
  const [dateFrom, setDateFrom] = React.useState('')
  const [dateTo, setDateTo] = React.useState('')
  const [history, setHistory] = React.useState<TruckLocation[]>([])
  const [loading, setLoading] = React.useState(false)
  const mapRef = React.useRef<any>(null)
  const [startIcon, setStartIcon] = React.useState<any>(null)
  const [endIcon, setEndIcon] = React.useState<any>(null)

  // Set default date range
  React.useEffect(() => {
    if (open) {
      const now = new Date()
      const yesterday = new Date(now.getTime() - 24 * 60 * 60 * 1000)
      const fmt = (d: Date) => d.toISOString().split('T')[0]
      setDateFrom(fmt(yesterday))
      setDateTo(fmt(now))
      setHistory([])
    }
  }, [open, truckId])

  // Load Leaflet CSS and icons on client
  React.useEffect(() => {
    if (!open) return
    const link = document.createElement('link')
    link.rel = 'stylesheet'
    link.href = 'https://unpkg.com/leaflet@1.9.4/dist/leaflet.css'
    document.head.appendChild(link)
    getLeaflet().then(LL => {
      if (!LL) return
      setStartIcon(LL.divIcon({
        html: `<div style="background:#10b981;color:white;border-radius:50%;width:24px;height:24px;display:flex;align-items:center;justify-content:center;font-size:12px;font-weight:bold;">A</div>`,
        className: '',
        iconSize: [24, 24],
        iconAnchor: [12, 12],
      }))
      setEndIcon(LL.divIcon({
        html: `<div style="background:#ef4444;color:white;border-radius:50%;width:24px;height:24px;display:flex;align-items:center;justify-content:center;font-size:12px;font-weight:bold;">B</div>`,
        className: '',
        iconSize: [24, 24],
        iconAnchor: [12, 12],
      }))
    })
    return () => {
      if (link.parentNode) document.head.removeChild(link)
    }
  }, [open])

  async function loadHistory() {
    if (!truckId || !dateFrom || !dateTo) {
      toast.error('Please select date range')
      return
    }
    const L = await getLeaflet()
    setLoading(true)
    try {
      const data = await fetchLocationHistory({
        truckId,
        dateFrom: new Date(dateFrom).toISOString(),
        dateTo: new Date(dateTo + 'T23:59:59').toISOString(),
        limit: 5000,
      })
      setHistory(data)
      if (data.length === 0) {
        toast.info('No route history found for this period')
      } else if (mapRef.current) {
        const bounds = L.latLngBounds(
          data.map(loc => [loc.latitude, loc.longitude] as [number, number])
        )
        mapRef.current.fitBounds(bounds, { padding: [30, 30] })
      }
    } catch (err) {
      toast.error('Failed to load route history')
    } finally {
      setLoading(false)
    }
  }

  const stats = React.useMemo(() => {
    if (history.length < 2) return { totalDistance: 0, duration: 0, avgSpeed: 0, maxSpeed: 0, points: history.length }
    let totalDistance = 0, maxSpeed = 0, speedSum = 0, speedCount = 0
    for (let i = 0; i < history.length; i++) {
      const loc = history[i]
      if (loc.speed != null) { speedSum += loc.speed; speedCount++; if (loc.speed > maxSpeed) maxSpeed = loc.speed }
      if (i > 0) {
        totalDistance += haversineDistance(history[i - 1].latitude, history[i - 1].longitude, loc.latitude, loc.longitude)
      }
    }
    const firstTime = new Date(history[0].timestamp).getTime()
    const lastTime = new Date(history[history.length - 1].timestamp).getTime()
    const duration = lastTime - firstTime
    return { totalDistance, duration, avgSpeed: speedCount > 0 ? speedSum / speedCount : 0, maxSpeed, points: history.length }
  }, [history])

  const routePositions: [number, number][] = history.map(loc => [loc.latitude, loc.longitude])

  const handleRouteMapRef = React.useCallback((mapInstance: any) => {
    if (mapInstance && !mapRef.current) {
      mapRef.current = mapInstance
      setTimeout(() => {
        getLeaflet().then(LL => {
          if (LL && mapRef.current && routePositions.length > 0) {
            mapRef.current.fitBounds(LL.latLngBounds(routePositions), { padding: [30, 30] })
          }
        })
      }, 500)
    }
  }, [])

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-4xl p-0">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Route className="h-5 w-5 text-amber-500" />
            Route History — {plateNumber}
          </DialogTitle>
          <DialogDescription>
            View the route history for this truck over a selected date range.
          </DialogDescription>
        </DialogHeader>

        {/* Date pickers */}
        <DialogBody className="flex flex-col sm:flex-row items-end gap-3">
          <div className="flex-1 w-full">
            <Label className="text-xs text-muted-foreground">From</Label>
            <Input type="date" value={dateFrom} onChange={(e) => setDateFrom(e.target.value)} className="mt-1" />
          </div>
          <div className="flex-1 w-full">
            <Label className="text-xs text-muted-foreground">To</Label>
            <Input type="date" value={dateTo} onChange={(e) => setDateTo(e.target.value)} className="mt-1" />
          </div>
          <Button onClick={loadHistory} disabled={loading || !truckId}>
            {loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            <Route className="mr-2 h-4 w-4" />
            Load Route
          </Button>
        </DialogBody>

        {history.length >= 2 && (
        <DialogBody className="grid grid-cols-2 sm:grid-cols-5 gap-2">
            <div className="bg-muted/50 rounded-lg p-3 text-center">
              <MapPin className="h-4 w-4 text-amber-500 mx-auto mb-1" />
              <p className="text-xs text-muted-foreground">Distance</p>
              <p className="font-bold text-sm">{formatDistance(stats.totalDistance)}</p>
            </div>
            <div className="bg-muted/50 rounded-lg p-3 text-center">
              <Clock className="h-4 w-4 text-emerald-500 mx-auto mb-1" />
              <p className="text-xs text-muted-foreground">Duration</p>
              <p className="font-bold text-sm">{formatDuration(stats.duration)}</p>
            </div>
            <div className="bg-muted/50 rounded-lg p-3 text-center">
              <Gauge className="h-4 w-4 text-sky-500 mx-auto mb-1" />
              <p className="text-xs text-muted-foreground">Avg Speed</p>
              <p className="font-bold text-sm">{Math.round(stats.avgSpeed)} km/h</p>
            </div>
            <div className="bg-muted/50 rounded-lg p-3 text-center">
              <Activity className="h-4 w-4 text-red-500 mx-auto mb-1" />
              <p className="text-xs text-muted-foreground">Max Speed</p>
              <p className="font-bold text-sm">{Math.round(stats.maxSpeed)} km/h</p>
            </div>
            <div className="bg-muted/50 rounded-lg p-3 text-center">
              <Navigation className="h-4 w-4 text-orange-500 mx-auto mb-1" />
              <p className="text-xs text-muted-foreground">Data Points</p>
              <p className="font-bold text-sm">{stats.points}</p>
            </div>
        </DialogBody>
        )}

        <DialogBody className="flex-1 min-h-0">
          {loading ? (
            <div className="h-[350px] flex items-center justify-center bg-muted/30 rounded-lg">
              <div className="text-center">
                <Loader2 className="h-8 w-8 text-amber-500 mx-auto mb-2 animate-spin" />
                <p className="text-sm text-muted-foreground">Loading route...</p>
              </div>
            </div>
          ) : history.length === 0 ? (
            <div className="h-[350px] flex items-center justify-center bg-muted/30 rounded-lg">
              <div className="text-center">
                <Route className="h-8 w-8 text-muted-foreground mx-auto mb-2" />
                <p className="text-sm text-muted-foreground">
                  Select a date range and click &quot;Load Route&quot; to view history
                </p>
              </div>
            </div>
          ) : (
            <div className="h-[350px] rounded-lg overflow-hidden border">
              <MapContainer
                center={routePositions[0]}
                zoom={12}
                style={{ height: '100%', width: '100%' }}
                ref={handleRouteMapRef}
                zoomControl={true}
              >
                <TileLayer
                  attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
                  url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
                />
                {routePositions.length > 1 && (
                  <Polyline
                    positions={routePositions}
                    pathOptions={{ color: '#f59e0b', weight: 4, opacity: 0.8 }}
                  />
                )}
                {startIcon && routePositions.length >= 1 && (
                  <Marker position={routePositions[0]} icon={startIcon} />
                )}
                {endIcon && routePositions.length > 1 && (
                  <Marker position={routePositions[routePositions.length - 1]} icon={endIcon} />
                )}
              </MapContainer>
            </div>
          )}
        </DialogBody>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Close
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
