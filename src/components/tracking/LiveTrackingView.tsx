'use client'

import * as React from 'react'
import dynamic from 'next/dynamic'
import { motion } from 'framer-motion'
import {
  Truck, Wifi, WifiOff, Bell, MapPin, Navigation, Gauge,
  AlertTriangle, Clock, Radio, Settings, Eye, CheckCircle,
  ArrowUp, Compass, Phone, Cpu, X, ChevronRight, Smartphone
} from 'lucide-react'

type Socket = import('socket.io-client').Socket

// Lazy load socket.io-client (requires window)
let _io: typeof import('socket.io-client')['io'] | null = null
async function getIo() {
  if (!_io) { const mod = await import('socket.io-client'); _io = mod.io }
  return _io
}
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Skeleton } from '@/components/ui/skeleton'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Separator } from '@/components/ui/separator'
import { toast } from 'sonner'
import {
  fetchLatestLocations,
  fetchGeofences,
  fetchTrackingAlerts,
  markAlertRead,
  type TruckLocation,
  type GeofenceZone,
  type TrackingAlert,
} from '@/lib/api'
import { TrackingSettingsDialog } from './TrackingSettingsDialog'
import { RouteHistoryDialog } from './RouteHistoryDialog'

let L: typeof import('leaflet')['default'] | null = null

// Dynamic imports for react-leaflet (SSR incompatible)
const MapContainer = dynamic(
  () => import('react-leaflet').then(mod => mod.MapContainer),
  { ssr: false }
)
const TileLayer = dynamic(
  () => import('react-leaflet').then(mod => mod.TileLayer),
  { ssr: false }
)
const Marker = dynamic(
  () => import('react-leaflet').then(mod => mod.Marker),
  { ssr: false }
)
const Popup = dynamic(
  () => import('react-leaflet').then(mod => mod.Popup),
  { ssr: false }
)
const Circle = dynamic(
  () => import('react-leaflet').then(mod => mod.Circle),
  { ssr: false }
)
const Polyline = dynamic(
  () => import('react-leaflet').then(mod => mod.Polyline),
  { ssr: false }
)

// ======================== CONSTANTS ========================

const GHANA_CENTER: [number, number] = [7.9465, -1.0232]
const GHANA_ZOOM = 7
const SPEEDING_THRESHOLD = 80

const containerVariants = {
  show: { transition: { staggerChildren: 0.04 } },
}

const itemVariants = {
  show: { opacity: 1, y: 0 },
}

// ======================== HELPERS ========================

function timeAgo(dateStr: string): string {
  const now = Date.now()
  const then = new Date(dateStr).getTime()
  const diff = now - then
  const seconds = Math.floor(diff / 1000)
  if (seconds < 60) return 'Just now'
  const minutes = Math.floor(seconds / 60)
  if (minutes < 60) return `${minutes}m ago`
  const hours = Math.floor(minutes / 60)
  if (hours < 24) return `${hours}h ago`
  const days = Math.floor(hours / 24)
  return `${days}d ago`
}

function headingToCardinal(heading?: number | null): string {
  if (heading == null) return 'N/A'
  const dirs = ['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW']
  const idx = Math.round(heading / 45) % 8
  return `${dirs[idx]} (${Math.round(heading)}°)`
}

function getGeofenceColor(type: string): string {
  switch (type) {
    case 'depot': return '#f59e0b'
    case 'customer': return '#10b981'
    case 'restricted': return '#ef4444'
    case 'checkpoint': return '#8b5cf6'
    default: return '#6b7280'
  }
}

function getGeofenceFill(type: string): string {
  switch (type) {
    case 'depot': return '#fef3c7'
    case 'customer': return '#d1fae5'
    case 'restricted': return '#fee2e2'
    case 'checkpoint': return '#ede9fe'
    default: return '#f3f4f6'
  }
}

function getAlertIcon(type: string) {
  switch (type) {
    case 'speeding': return <AlertTriangle className="h-4 w-4 text-red-500" />
    case 'geofence_exit': return <MapPin className="h-4 w-4 text-orange-500" />
    case 'geofence_enter': return <MapPin className="h-4 w-4 text-emerald-500" />
    case 'offline': return <WifiOff className="h-4 w-4 text-gray-500" />
    case 'sos': return <AlertTriangle className="h-4 w-4 text-red-600" />
    default: return <Bell className="h-4 w-4 text-amber-500" />
  }
}

// ======================== CUSTOM MAP MARKER ========================

async function loadL() {
  if (!L) {
    const mod = await import('leaflet')
    L = mod.default
  }
  return L
}

function createTruckMarker(isOnline: boolean, isSelected: boolean, isSpeeding: boolean, plateNumber?: string) {
  if (!L) return null as any
  let borderColor = isOnline ? '#10b981' : '#9ca3af'
  let bgColor = isOnline ? '#ecfdf5' : '#f9fafb'
  if (isSpeeding) {
    borderColor = '#ef4444'
    bgColor = '#fef2f2'
  }
  if (isSelected) {
    borderColor = '#f59e0b'
    bgColor = '#fffbeb'
  }

  return L.divIcon({
    html: `
      <div style="
        position: relative;
        width: 40px;
        height: 40px;
        display: flex;
        align-items: center;
        justify-content: center;
        border-radius: 50%;
        background: ${bgColor};
        border: 3px solid ${borderColor};
        box-shadow: 0 2px 8px rgba(0,0,0,0.2);
        font-size: 18px;
      ">
        🚛
        ${isSpeeding ? '<div style="position:absolute;top:-2px;right:-2px;background:#ef4444;color:white;border-radius:50%;width:14px;height:14px;font-size:8px;display:flex;align-items:center;justify-content:center;">!</div>' : ''}
      </div>
      <div style="
        position: absolute;
        bottom: -20px;
        left: 50%;
        transform: translateX(-50%);
        background: ${borderColor};
        color: white;
        font-size: 9px;
        font-weight: 700;
        padding: 1px 5px;
        border-radius: 4px;
        white-space: nowrap;
        font-family: system-ui, sans-serif;
      ">${plateNumber || '...'}</div>
    `,
    className: '',
    iconSize: [40, 60],
    iconAnchor: [20, 20],
    popupAnchor: [0, -24],
  })
}

// ======================== MAIN COMPONENT ========================

export function LiveTrackingView() {
  // State
  const [truckLocations, setTruckLocations] = React.useState<Map<string, TruckLocation>>(new Map())
  const [onlineTrucks, setOnlineTrucks] = React.useState<Set<string>>(new Set())
  const [geofences, setGeofences] = React.useState<GeofenceZone[]>([])
  const [alerts, setAlerts] = React.useState<TrackingAlert[]>([])
  const [selectedTruckId, setSelectedTruckId] = React.useState<string | null>(null)
  const [settingsOpen, setSettingsOpen] = React.useState(false)
  const [routeHistoryOpen, setRouteHistoryOpen] = React.useState(false)
  const [mapReady, setMapReady] = React.useState(false)
  const [loading, setLoading] = React.useState(true)
  const [socketConnected, setSocketConnected] = React.useState(false)

  const socketRef = React.useRef<Socket | null>(null)
  const mapRef = React.useRef<any>(null)

  // Load Leaflet on client side
  React.useEffect(() => {
    loadL()
  }, [])

  // Fetch initial data
  React.useEffect(() => {
    async function loadInitialData() {
      try {
        const [locations, geofenceData, alertData] = await Promise.all([
          fetchLatestLocations().catch(() => []),
          fetchGeofences().catch(() => []),
          fetchTrackingAlerts({ limit: 20 }).catch(() => []),
        ])

        const locMap = new Map<string, TruckLocation>()
        const onlineSet = new Set<string>()
        locations.forEach((loc) => {
          locMap.set(loc.truckId, loc)
          onlineSet.add(loc.truckId)
        })

        setTruckLocations(locMap)
        setOnlineTrucks(onlineSet)
        setGeofences(geofenceData)
        setAlerts(alertData)
      } catch (err) {
        console.error('Failed to load initial tracking data:', err)
      } finally {
        setLoading(false)
      }
    }
    loadInitialData()
  }, [])

  // Load Leaflet CSS
  React.useEffect(() => {
    const link = document.createElement('link')
    link.rel = 'stylesheet'
    link.href = 'https://unpkg.com/leaflet@1.9.4/dist/leaflet.css'
    document.head.appendChild(link)
    return () => {
      if (link.parentNode) document.head.removeChild(link)
    }
  }, [])

  // WebSocket connection
  React.useEffect(() => {
    let cancelled = false
    async function connect() {
      const ioModule = await getIo()
      if (cancelled) return
      const socket = ioModule('/?XTransformPort=3003', {
        transports: ['websocket', 'polling'],
      })
      socketRef.current = socket

      socket.on('connect', () => {
        console.log('[Tracking] Connected to tracking service')
        setSocketConnected(true)
        socket.emit('join-all-trucks')
        socket.emit('get-active-trucks')
      })

      socket.on('disconnect', () => {
        console.log('[Tracking] Disconnected from tracking service')
        setSocketConnected(false)
      })

      socket.on('truck-location', (data: TruckLocation) => {
        setTruckLocations(prev => {
          const next = new Map(prev)
          next.set(data.truckId, data)
          return next
        })
        setOnlineTrucks(prev => {
          const next = new Set(prev)
          next.add(data.truckId)
          return next
        })
      })

      socket.on('truck-offline', (data: { truckId: string }) => {
        setOnlineTrucks(prev => {
          const next = new Set(prev)
          next.delete(data.truckId)
          return next
        })
      })

      socket.on('tracking-alert', (data: TrackingAlert) => {
        setAlerts(prev => [data, ...prev].slice(0, 20))
        toast.warning(`${data.truck.plateNumber}: ${data.title}`)
      })
    }
    connect()

    return () => {
      cancelled = true
      if (socketRef.current) {
        socketRef.current.disconnect()
        socketRef.current = null
      }
    }
  }, [])

  // Handlers
  const handleSelectTruck = React.useCallback((truckId: string) => {
    setSelectedTruckId(prev => prev === truckId ? null : truckId)
    const loc = truckLocations.get(truckId)
    if (loc && mapRef.current) {
      mapRef.current.setView([loc.latitude, loc.longitude], 14, { animate: true })
    }
  }, [truckLocations])

  const handleMapRef = React.useCallback((mapInstance: any) => {
    if (mapInstance && !mapRef.current) {
      mapRef.current = mapInstance
      setMapReady(true)
    }
  }, [])

  const handleMarkAlertRead = React.useCallback(async (alertId: string) => {
    try {
      await markAlertRead(alertId)
      setAlerts(prev => prev.map(a => a.id === alertId ? { ...a, isRead: true } : a))
    } catch (err) {
      toast.error('Failed to mark alert as read')
    }
  }, [])

  const selectedLocation = selectedTruckId ? truckLocations.get(selectedTruckId) : null
  const selectedPlate = selectedLocation?.plateNumber
  const selectedDriver = selectedLocation?.driverName
  const trucksOnlineCount = onlineTrucks.size
  const trucksTotalCount = truckLocations.size
  const trucksOfflineCount = trucksTotalCount - trucksOnlineCount
  const unreadAlerts = alerts.filter(a => !a.isRead).length
  const selectedTruckAlerts = selectedTruckId
    ? alerts.filter(a => a.truckId === selectedTruckId).slice(0, 5)
    : []

  // Convert truckLocations map to array for rendering
  const truckArray = Array.from(truckLocations.values())

  // Memoize truck markers to avoid re-creating icon objects every render
  const truckMarkers = React.useMemo(() => {
    return new Map(truckArray.map(loc => {
      const isOnline = onlineTrucks.has(loc.truckId)
      const isSelected = selectedTruckId === loc.truckId
      const isSpeeding = (loc.speed ?? 0) > SPEEDING_THRESHOLD
      return [loc.truckId, createTruckMarker(isOnline, isSelected, isSpeeding, loc.plateNumber)]
    }))
  }, [truckArray, onlineTrucks, selectedTruckId])

  return (
    <motion.div
      variants={containerVariants}
      animate="show"
      className="space-y-4 sm:space-y-6"
    >
      {/* Header */}
      <motion.div variants={itemVariants} className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-2xl font-bold tracking-tight">Live Tracking</h1>
            <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium ${socketConnected ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400' : 'bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-400'}`}>
              <span className={`h-1.5 w-1.5 rounded-full ${socketConnected ? 'bg-emerald-500 animate-pulse' : 'bg-gray-400'}`} />
              {socketConnected ? 'Live' : 'Disconnected'}
            </span>
          </div>
          <p className="text-muted-foreground">Real-time fleet monitoring</p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={() => {
            window.dispatchEvent(new CustomEvent('navigate-page', { detail: 'driver-tracking' }))
          }}>
            <Smartphone className="mr-2 h-4 w-4" />
            Driver Mode
          </Button>
          <Button variant="outline" onClick={() => setSettingsOpen(true)}>
            <Settings className="mr-2 h-4 w-4" />
            Tracking Settings
          </Button>
        </div>
      </motion.div>

      {/* Stats Bar */}
      <motion.div variants={itemVariants} className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <Card className="overflow-hidden">
          <CardContent className="p-4">
            <div className="flex items-center gap-3">
              <div className="rounded-lg bg-emerald-100 dark:bg-emerald-900/30 p-2">
                <Wifi className="h-4 w-4 text-emerald-600 dark:text-emerald-400" />
              </div>
              <div>
                <p className="text-xs text-muted-foreground">Trucks Online</p>
                <div className="text-xl font-bold text-emerald-600 dark:text-emerald-400">
                  {loading ? <Skeleton className="h-6 w-8 inline-block" /> : trucksOnlineCount}
                </div>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card className="overflow-hidden">
          <CardContent className="p-4">
            <div className="flex items-center gap-3">
              <div className="rounded-lg bg-gray-100 dark:bg-gray-800 p-2">
                <WifiOff className="h-4 w-4 text-gray-500 dark:text-gray-400" />
              </div>
              <div>
                <p className="text-xs text-muted-foreground">Trucks Offline</p>
                <div className="text-xl font-bold text-gray-500">
                  {loading ? <Skeleton className="h-6 w-8 inline-block" /> : trucksOfflineCount}
                </div>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card className="overflow-hidden">
          <CardContent className="p-4">
            <div className="flex items-center gap-3">
              <div className="rounded-lg bg-amber-100 dark:bg-amber-900/30 p-2">
                <Bell className="h-4 w-4 text-amber-600 dark:text-amber-400" />
              </div>
              <div>
                <p className="text-xs text-muted-foreground">Active Alerts</p>
                <div className="text-xl font-bold text-amber-600 dark:text-amber-400">
                  {loading ? <Skeleton className="h-6 w-8 inline-block" /> : unreadAlerts}
                </div>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card className="overflow-hidden">
          <CardContent className="p-4">
            <div className="flex items-center gap-3">
              <div className="rounded-lg bg-orange-100 dark:bg-orange-900/30 p-2">
                <MapPin className="h-4 w-4 text-orange-600 dark:text-orange-400" />
              </div>
              <div>
                <p className="text-xs text-muted-foreground">Total Geofences</p>
                <div className="text-xl font-bold text-orange-600 dark:text-orange-400">
                  {loading ? <Skeleton className="h-6 w-8 inline-block" /> : geofences.length}
                </div>
              </div>
            </div>
          </CardContent>
        </Card>
      </motion.div>

      {/* Main Map + Sidebar */}
      <motion.div variants={itemVariants} className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        {/* Map Area */}
        <Card className="lg:col-span-2 overflow-hidden">
          <CardContent className="p-0">
            {!mapReady && (
              <div className="h-[500px] sm:h-[600px] flex items-center justify-center bg-muted/30">
                <div className="text-center">
                  <Radio className="h-8 w-8 text-amber-500 mx-auto mb-2 animate-pulse" />
                  <p className="text-sm text-muted-foreground">Loading map...</p>
                </div>
              </div>
            )}
            <div className={`h-[500px] sm:h-[600px] ${!mapReady ? 'hidden' : ''}`}>
              <MapContainer
                center={GHANA_CENTER}
                zoom={GHANA_ZOOM}
                style={{ height: '100%', width: '100%' }}
                ref={handleMapRef}
                zoomControl={true}
              >
                <TileLayer
                  attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
                  url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
                />

                {/* Geofence Circles */}
                {geofences.map(gf => (
                  <Circle
                    key={gf.id}
                    center={[gf.latitude, gf.longitude]}
                    radius={gf.radius}
                    pathOptions={{
                      color: getGeofenceColor(gf.type),
                      fillColor: getGeofenceFill(gf.type),
                      fillOpacity: 0.25,
                      weight: 2,
                      dashArray: gf.type === 'restricted' ? '6 4' : undefined,
                    }}
                  />
                ))}

                {/* Truck Markers */}
                {truckArray.map(loc => {
                  const icon = truckMarkers.get(loc.truckId)
                  if (!icon) return null

                  return (
                    <Marker
                      key={loc.truckId}
                      position={[loc.latitude, loc.longitude]}
                      icon={icon}
                      eventHandlers={{
                        click: () => handleSelectTruck(loc.truckId),
                      }}
                    >
                      <Popup>
                        <div className="text-xs font-sans p-1 min-w-[140px]">
                          <div className="font-bold text-sm mb-1">{loc.plateNumber || 'Unknown'}</div>
                          {loc.driverName && <div className="text-gray-500 mb-1">Driver: {loc.driverName}</div>}
                          {loc.speed != null && (
                            <div className={`font-medium ${(loc.speed ?? 0) > SPEEDING_THRESHOLD ? 'text-red-600' : 'text-emerald-600'}`}>
                              {Math.round(loc.speed)} km/h
                              {(loc.speed ?? 0) > SPEEDING_THRESHOLD && ' ⚠️ Speeding'}
                            </div>
                          )}
                          <div className="text-gray-400">{timeAgo(loc.timestamp)}</div>
                        </div>
                      </Popup>
                    </Marker>
                  )
                })}
              </MapContainer>
            </div>
          </CardContent>
        </Card>

        {/* Sidebar */}
        <Card className="overflow-hidden flex flex-col">
          <CardContent className="p-0 flex flex-col h-full">
            {/* Truck List Header */}
            <div className="px-4 py-3 border-b flex items-center justify-between flex-shrink-0">
              <h3 className="font-semibold text-sm flex items-center gap-2">
                <Truck className="h-4 w-4 text-amber-500" />
                Fleet Trucks ({truckArray.length})
              </h3>
            </div>

            {/* Truck List */}
            <ScrollArea className="flex-1" style={{ maxHeight: '320px' }}>
              <div className="divide-y">
                {loading ? (
                  Array.from({ length: 4 }).map((_, i) => (
                    <div key={i} className="px-4 py-3">
                      <div className="flex items-center gap-3">
                        <Skeleton className="h-8 w-8 rounded-full flex-shrink-0" />
                        <div className="flex-1">
                          <Skeleton className="h-4 w-24 mb-1" />
                          <Skeleton className="h-3 w-16" />
                        </div>
                      </div>
                    </div>
                  ))
                ) : truckArray.length === 0 ? (
                  <div className="px-4 py-8 text-center">
                    <Truck className="h-8 w-8 text-muted-foreground mx-auto mb-2" />
                    <p className="text-sm text-muted-foreground">No trucks with tracking data</p>
                  </div>
                ) : (
                  truckArray.map(loc => {
                    const isOnline = onlineTrucks.has(loc.truckId)
                    const isSelected = selectedTruckId === loc.truckId
                    const isSpeeding = (loc.speed ?? 0) > SPEEDING_THRESHOLD

                    return (
                      <button
                        key={loc.truckId}
                        onClick={() => handleSelectTruck(loc.truckId)}
                        className={`w-full px-4 py-3 flex items-center gap-3 text-left hover:bg-muted/50 transition-colors ${isSelected ? 'bg-amber-50 dark:bg-amber-950/20 border-l-2 border-l-amber-500' : ''}`}
                      >
                        <div className={`h-8 w-8 rounded-full flex items-center justify-center flex-shrink-0 ${isOnline ? 'bg-emerald-100 dark:bg-emerald-900/30' : 'bg-gray-100 dark:bg-gray-800'}`}>
                          <Truck className={`h-4 w-4 ${isOnline ? 'text-emerald-600 dark:text-emerald-400' : 'text-gray-400'}`} />
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2">
                            <p className="font-medium text-sm truncate">{loc.plateNumber || 'Unknown'}</p>
                            {isSpeeding && (
                              <AlertTriangle className="h-3 w-3 text-red-500 flex-shrink-0" />
                            )}
                          </div>
                          <p className="text-xs text-muted-foreground truncate">
                            {loc.driverName || 'No driver'}
                            {loc.speed != null && ` · ${Math.round(loc.speed)} km/h`}
                          </p>
                        </div>
                        <div className="flex flex-col items-end gap-1 flex-shrink-0">
                          <span className={`h-2 w-2 rounded-full ${isOnline ? 'bg-emerald-500' : 'bg-gray-300'}`} />
                          <span className="text-[10px] text-muted-foreground">{timeAgo(loc.timestamp)}</span>
                        </div>
                      </button>
                    )
                  })
                )}
              </div>
            </ScrollArea>

            {/* Detail Panel */}
            {selectedTruckId && selectedLocation && (
              <div className="border-t flex-shrink-0">
                <div className="px-4 py-3">
                  <div className="flex items-center justify-between mb-3">
                    <div className="flex items-center gap-2">
                      <span className={`h-2.5 w-2.5 rounded-full ${onlineTrucks.has(selectedTruckId) ? 'bg-emerald-500' : 'bg-gray-300'}`} />
                      <span className="font-semibold text-sm">{selectedPlate || 'Unknown'}</span>
                    </div>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => setSelectedTruckId(null)}
                      className="h-7 w-7 p-0"
                    >
                      <X className="h-3.5 w-3.5" />
                    </Button>
                  </div>

                  <div className="grid grid-cols-2 gap-2 text-xs mb-3">
                    <div className="bg-muted/50 rounded-md p-2">
                      <div className="text-muted-foreground flex items-center gap-1 mb-0.5">
                        <Gauge className="h-3 w-3" /> Speed
                      </div>
                      <div className={`font-semibold ${((selectedLocation.speed ?? 0) > SPEEDING_THRESHOLD) ? 'text-red-600' : ''}`}>
                        {selectedLocation.speed != null ? `${Math.round(selectedLocation.speed)} km/h` : 'N/A'}
                      </div>
                    </div>
                    <div className="bg-muted/50 rounded-md p-2">
                      <div className="text-muted-foreground flex items-center gap-1 mb-0.5">
                        <Compass className="h-3 w-3" /> Heading
                      </div>
                      <div className="font-semibold">{headingToCardinal(selectedLocation.heading)}</div>
                    </div>
                    <div className="bg-muted/50 rounded-md p-2">
                      <div className="text-muted-foreground flex items-center gap-1 mb-0.5">
                        <Navigation className="h-3 w-3" /> Accuracy
                      </div>
                      <div className="font-semibold">{selectedLocation.accuracy != null ? `${Math.round(selectedLocation.accuracy)}m` : 'N/A'}</div>
                    </div>
                    <div className="bg-muted/50 rounded-md p-2">
                      <div className="text-muted-foreground flex items-center gap-1 mb-0.5">
                        <Clock className="h-3 w-3" /> Updated
                      </div>
                      <div className="font-semibold">{timeAgo(selectedLocation.timestamp)}</div>
                    </div>
                  </div>

                  {/* Source Badge */}
                  <div className="flex items-center gap-2 mb-3">
                    <span className="text-xs text-muted-foreground">Source:</span>
                    <Badge variant="outline" className="text-xs gap-1">
                      {selectedLocation.source === 'phone' && <Phone className="h-3 w-3" />}
                      {selectedLocation.source === 'hardware' && <Cpu className="h-3 w-3" />}
                      {selectedLocation.source === 'both' && <><Phone className="h-3 w-3" />+<Cpu className="h-3 w-3" /></>}
                      {selectedLocation.source === 'phone' ? 'Phone GPS' : selectedLocation.source === 'hardware' ? 'Hardware' : selectedLocation.source === 'both' ? 'Both' : selectedLocation.source}
                    </Badge>
                  </div>

                  {/* View Route History Button */}
                  <Button
                    variant="outline"
                    size="sm"
                    className="w-full mb-3"
                    onClick={() => setRouteHistoryOpen(true)}
                  >
                    <Eye className="mr-2 h-3.5 w-3.5" />
                    View Route History
                  </Button>

                  {/* Recent alerts for selected truck */}
                  {selectedTruckAlerts.length > 0 && (
                    <div>
                      <p className="text-xs font-medium text-muted-foreground mb-1.5">Recent Alerts</p>
                      <div className="space-y-1.5">
                        {selectedTruckAlerts.slice(0, 3).map(alert => (
                          <div
                            key={alert.id}
                            className={`flex items-start gap-2 text-xs p-1.5 rounded ${alert.isRead ? 'opacity-60' : ''}`}
                          >
                            {getAlertIcon(alert.type)}
                            <div className="flex-1 min-w-0">
                              <p className="font-medium truncate">{alert.title}</p>
                              <p className="text-muted-foreground">{timeAgo(alert.createdAt)}</p>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Coordinates */}
                  <div className="mt-2 text-[10px] text-muted-foreground font-mono">
                    {selectedLocation.latitude.toFixed(6)}, {selectedLocation.longitude.toFixed(6)}
                  </div>
                </div>
              </div>
            )}

            {/* Geofence Legend */}
            {!selectedTruckId && geofences.length > 0 && (
              <div className="border-t px-4 py-3 flex-shrink-0">
                <p className="text-xs font-medium text-muted-foreground mb-2">Geofence Zones</p>
                <div className="flex flex-wrap gap-2">
                  {['depot', 'customer', 'restricted', 'checkpoint'].map(type => {
                    const count = geofences.filter(g => g.type === type).length
                    if (count === 0) return null
                    return (
                      <div key={type} className="flex items-center gap-1 text-xs">
                        <span
                          className="h-2.5 w-2.5 rounded-full border"
                          style={{ borderColor: getGeofenceColor(type), background: getGeofenceFill(type) }}
                        />
                        <span className="capitalize text-muted-foreground">{type}</span>
                        <span className="font-medium">({count})</span>
                      </div>
                    )
                  })}
                </div>
              </div>
            )}
          </CardContent>
        </Card>
      </motion.div>

      {/* Alerts Panel */}
      <motion.div variants={itemVariants}>
        <Card className="overflow-hidden">
          <CardContent className="p-0">
            <div className="px-4 py-3 border-b flex items-center justify-between">
              <h3 className="font-semibold text-sm flex items-center gap-2">
                <Bell className="h-4 w-4 text-amber-500" />
                Latest Alerts
                {unreadAlerts > 0 && (
                  <Badge variant="destructive" className="text-[10px] px-1.5">{unreadAlerts}</Badge>
                )}
              </h3>
            </div>
            <div className="divide-y">
              {alerts.length === 0 ? (
                <div className="px-4 py-6 text-center">
                  <CheckCircle className="h-6 w-6 text-emerald-500 mx-auto mb-1" />
                  <p className="text-sm text-muted-foreground">No alerts</p>
                </div>
              ) : (
                alerts.slice(0, 5).map(alert => (
                  <div
                    key={alert.id}
                    className={`px-4 py-3 flex items-start gap-3 hover:bg-muted/50 transition-colors ${!alert.isRead ? 'bg-amber-50/50 dark:bg-amber-950/10' : ''}`}
                  >
                    {getAlertIcon(alert.type)}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-0.5">
                        <p className="text-sm font-medium truncate">{alert.truck.plateNumber}</p>
                        <Badge variant="outline" className="text-[10px] px-1.5 capitalize">{alert.type.replace('_', ' ')}</Badge>
                      </div>
                      <p className="text-xs text-muted-foreground truncate">{alert.message}</p>
                      <p className="text-[10px] text-muted-foreground mt-0.5">{timeAgo(alert.createdAt)}</p>
                    </div>
                    {!alert.isRead && (
                      <Button
                        variant="ghost"
                        size="sm"
                        className="h-6 w-6 p-0 flex-shrink-0"
                        onClick={() => handleMarkAlertRead(alert.id)}
                      >
                        <CheckCircle className="h-3.5 w-3.5 text-muted-foreground" />
                      </Button>
                    )}
                  </div>
                ))
              )}
            </div>
          </CardContent>
        </Card>
      </motion.div>

      {/* Dialogs */}
      <TrackingSettingsDialog open={settingsOpen} onOpenChange={setSettingsOpen} />
      <RouteHistoryDialog
        open={routeHistoryOpen}
        onOpenChange={setRouteHistoryOpen}
        truckId={selectedTruckId ?? ''}
        plateNumber={selectedPlate ?? ''}
      />
    </motion.div>
  )
}
