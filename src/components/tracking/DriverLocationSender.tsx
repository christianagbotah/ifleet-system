'use client'

import * as React from 'react'
import { motion } from 'framer-motion'
import dynamic from 'next/dynamic'
import {
  MapPin, Phone, Play, Square, Wifi, WifiOff, Navigation,
  Gauge, Satellite, ShieldAlert, Loader2, ArrowLeft,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Skeleton } from '@/components/ui/skeleton'
import { SearchableSelect, type SearchableOption } from '@/components/ui/searchable-select'
import { toast } from 'sonner'
// Tracking configs no longer needed - we load trucks directly
import { useAuthStore } from '@/lib/store/auth'
import { useDriverTruck } from '@/hooks/useDriverTruck'

// Dynamic imports for react-leaflet
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
const Circle = dynamic(
  () => import('react-leaflet').then(mod => mod.Circle),
  { ssr: false }
)

// Lazy load socket.io-client (requires window)
let _io: typeof import('socket.io-client')['io'] | null = null
async function getIo() {
  if (!_io) { const mod = await import('socket.io-client'); _io = mod.io }
  return _io
}
type Socket = import('socket.io-client').Socket

// Lazy load leaflet (requires window)
let _L: typeof import('leaflet')['default'] | null = null
async function getL() {
  if (!_L) { const mod = await import('leaflet'); _L = mod.default }
  return _L
}

const containerVariants = {
  show: { transition: { staggerChildren: 0.04 } },
}

const itemVariants = {
  show: { opacity: 1, y: 0 },
}

interface TruckOption {
  id: string
  plateNumber: string
  make: string
  model: string
  driverName?: string
}

export function DriverLocationSender() {
  const [allTrucks, setAllTrucks] = React.useState<TruckOption[]>([])
  const [selectedTruckId, setSelectedTruckId] = React.useState<string>('')
  const [isSharing, setIsSharing] = React.useState(false)
  const [socketConnected, setSocketConnected] = React.useState(false)
  const [permissionDenied, setPermissionDenied] = React.useState(false)
  const [currentPosition, setCurrentPosition] = React.useState<{ lat: number; lng: number } | null>(null)
  const [currentSpeed, setCurrentSpeed] = React.useState<number | null>(null)
  const [currentAccuracy, setCurrentAccuracy] = React.useState<number | null>(null)
  const [pointsSent, setPointsSent] = React.useState(0)
  const [loadingTrucks, setLoadingTrucks] = React.useState(true)

  // Get driver's assigned truck directly from truck assignment
  const { isDriver, driverId, truck: assignedTruck, loading: loadingDriverTruck } = useDriverTruck()

  const socketRef = React.useRef<Socket | null>(null)
  const watchIdRef = React.useRef<number | null>(null)
  const [driverMarkerIcon, setDriverMarkerIcon] = React.useState<any>(null)

  const truckOptions: SearchableOption[] = React.useMemo(
    () =>
      allTrucks.map((t) => ({
        value: t.id,
        label: `${t.plateNumber} ${t.make} ${t.model}`,
        description: t.driverName || undefined,
      })),
    [allTrucks]
  )

  const loading = isDriver ? loadingDriverTruck : loadingTrucks

  const { user } = useAuthStore()

  const [selectedTruckLabel, setSelectedTruckLabel] = React.useState<string>('')

  // Auto-select the driver's assigned truck once loaded
  React.useEffect(() => {
    if (isDriver && assignedTruck && !isSharing) {
      setSelectedTruckId(assignedTruck.id)
      setSelectedTruckLabel(`${assignedTruck.plateNumber} ${assignedTruck.make} ${assignedTruck.model}`)
    }
  }, [isDriver, assignedTruck, isSharing])

  // For non-drivers (admin/manager): load all active trucks
  React.useEffect(() => {
    if (isDriver) {
      setLoadingTrucks(false)
      return
    }
    async function loadTrucks() {
      try {
        const res = await fetch('/api/trucks?status=active')
        if (!res.ok) throw new Error('Failed to fetch')
        const data = await res.json()
        const trucks: TruckOption[] = (data.data || []).map((t: any) => ({
          id: t.id,
          plateNumber: t.plateNumber,
          make: t.make,
          model: t.model,
          driverName: t.driver ? `${t.driver.firstName} ${t.driver.lastName}` : undefined,
        }))
        setAllTrucks(trucks)
        if (trucks.length > 0) {
          setSelectedTruckId(trucks[0].id)
        }
      } catch (err) {
        toast.error('Failed to load truck list')
      } finally {
        setLoadingTrucks(false)
      }
    }
    if (user) {
      loadTrucks()
    }
  }, [user, isDriver])

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

  async function startSharing() {
    if (!selectedTruckId) {
      toast.error('Please select a truck')
      return
    }

    setPermissionDenied(false)

    // Connect to WebSocket (lazy load socket.io-client)
    const ioModule = await getIo()
    const socket = ioModule('/?XTransformPort=3003', {
      transports: ['websocket', 'polling'],
    })
    socketRef.current = socket

    socket.on('connect', () => {
      console.log('[DriverLocation] Connected')
      setSocketConnected(true)
      socket.emit('join-truck', { truckId: selectedTruckId })
    })

    socket.on('disconnect', () => {
      console.log('[DriverLocation] Disconnected')
      setSocketConnected(false)
    })

    // Start watching position
    if ('geolocation' in navigator) {
      const watchId = navigator.geolocation.watchPosition(
        (position) => {
          const { latitude, longitude, accuracy, speed } = position.coords

          setCurrentPosition({ lat: latitude, lng: longitude })
          setCurrentSpeed(speed)
          setCurrentAccuracy(accuracy)
          setPointsSent(prev => prev + 1)

          // Emit location update
          if (socket.connected) {
            socket.emit('location-update', {
              truckId: selectedTruckId,
              latitude,
              longitude,
              accuracy,
              speed: speed ?? 0,
              heading: position.coords.heading,
              timestamp: new Date().toISOString(),
              source: 'phone',
            })
          }
        },
        (error) => {
          console.error('[DriverLocation] Geolocation error:', error)
          if (error.code === error.PERMISSION_DENIED) {
            setPermissionDenied(true)
            toast.error('Location permission denied. Please allow location access in your browser settings.')
          } else {
            toast.error(`Location error: ${error.message}`)
          }
          stopSharing()
        },
        {
          enableHighAccuracy: true,
          timeout: 15000,
          maximumAge: 5000,
        }
      )
      watchIdRef.current = watchId
    } else {
      toast.error('Geolocation is not supported by this browser')
      return
    }

    setIsSharing(true)
    toast.success('Started sharing location')
  }

  function stopSharing() {
    // Stop watching position
    if (watchIdRef.current !== null) {
      navigator.geolocation.clearWatch(watchIdRef.current)
      watchIdRef.current = null
    }

    // Disconnect socket
    if (socketRef.current) {
      if (selectedTruckId) {
        socketRef.current.emit('leave-truck', { truckId: selectedTruckId })
      }
      socketRef.current.disconnect()
      socketRef.current = null
    }

    setIsSharing(false)
    setSocketConnected(false)
    toast.info('Stopped sharing location')
  }

  // Cleanup on unmount
  React.useEffect(() => {
    return () => {
      if (watchIdRef.current !== null) {
        navigator.geolocation.clearWatch(watchIdRef.current)
      }
      if (socketRef.current) {
        socketRef.current.disconnect()
      }
    }
  }, [])

  // Load leaflet marker icon on client
  React.useEffect(() => {
    getL().then(LL => {
      if (!LL) return
      const icon = LL.divIcon({
        html: `
          <div style="
            position: relative;
            width: 36px;
            height: 36px;
            display: flex;
            align-items: center;
            justify-content: center;
            border-radius: 50%;
            background: #fffbeb;
            border: 3px solid #f59e0b;
            box-shadow: 0 2px 8px rgba(0,0,0,0.3);
            font-size: 16px;
          ">
            📍
          </div>
        `,
        className: '',
        iconSize: [36, 36],
        iconAnchor: [18, 18],
      })
      setDriverMarkerIcon(icon)
    })
  }, [])

  return (
    <motion.div
      variants={containerVariants}
      animate="show"
      className="space-y-4 sm:space-y-6 max-w-2xl mx-auto"
    >
      {/* Header */}
      <motion.div variants={itemVariants} className="flex items-center gap-3">
        <Button variant="ghost" size="sm" onClick={() => {
          window.dispatchEvent(new CustomEvent('navigate-page', { detail: 'tracking' }))
        }}>
          <ArrowLeft className="h-4 w-4 mr-1" />
          Back
        </Button>
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Location Sharing</h1>
          <p className="text-muted-foreground">Share your GPS location from your phone for live tracking</p>
        </div>
      </motion.div>

      {/* Truck Selector */}
      <motion.div variants={itemVariants}>
        <Card>
          <CardContent className="p-4 sm:p-6">
            <div className="space-y-4">
              <div>
                <label className="text-sm font-medium mb-2 block">
                  {user?.role === 'Driver' ? 'Your Assigned Truck' : 'Select Your Truck'}
                </label>
                {loading ? (
                  <Skeleton className="h-10 w-full" />
                ) : isDriver && !assignedTruck ? (
                  <div className="text-sm text-muted-foreground py-2">
                    No truck is currently assigned to you. Contact your admin.
                  </div>
                ) : isDriver && assignedTruck ? (
                  <div className="flex items-center gap-3 py-2 px-3 bg-muted/50 rounded-md border">
                    <div className="flex items-center justify-center h-10 w-10 rounded-lg bg-amber-100 dark:bg-amber-900/30">
                      <Navigation className="h-5 w-5 text-amber-600 dark:text-amber-400" />
                    </div>
                    <div>
                      <p className="font-medium text-sm">{selectedTruckLabel}</p>
                      <p className="text-xs text-muted-foreground">Your assigned truck</p>
                    </div>
                  </div>
                ) : allTrucks.length === 0 ? (
                  <div className="text-sm text-muted-foreground py-2">
                    No active trucks found in the system.
                  </div>
                ) : (
                  <SearchableSelect
                    options={truckOptions}
                    value={selectedTruckId}
                    onValueChange={setSelectedTruckId}
                    placeholder="Select a truck..."
                    emptyMessage="No trucks found."
                    disabled={isSharing}
                  />
                )}
              </div>

              {/* Permission Denied Warning */}
              {permissionDenied && (
                <div className="flex items-start gap-3 bg-red-50 dark:bg-red-950/20 border border-red-200 dark:border-red-800 rounded-lg p-3">
                  <ShieldAlert className="h-5 w-5 text-red-500 flex-shrink-0 mt-0.5" />
                  <div>
                    <p className="text-sm font-medium text-red-700 dark:text-red-400">Location Access Denied</p>
                    <p className="text-xs text-red-600/80 dark:text-red-400/80 mt-0.5">
                      Please allow location access in your browser or phone settings, then try again.
                    </p>
                  </div>
                </div>
              )}

              {/* Start/Stop Button */}
              <Button
                size="lg"
                className="w-full h-14 text-base font-semibold"
                variant={isSharing ? 'destructive' : 'default'}
                onClick={isSharing ? stopSharing : startSharing}
                disabled={!selectedTruckId || loading}
              >
                {isSharing ? (
                  <>
                    <Square className="mr-2 h-5 w-5" />
                    Stop Sharing Location
                  </>
                ) : (
                  <>
                    <Play className="mr-2 h-5 w-5" />
                    Start Sharing Location
                  </>
                )}
              </Button>
            </div>
          </CardContent>
        </Card>
      </motion.div>

      {/* Live Info Panel */}
      {isSharing && (
        <motion.div
          variants={itemVariants}
          animate="show"
        >
          <Card className="overflow-hidden">
            <CardContent className="p-0">
              <div className="px-4 py-3 border-b flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <h3 className="font-semibold text-sm">Live Status</h3>
                  <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium ${socketConnected ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400' : 'bg-gray-100 text-gray-600'}`}>
                    <span className={`h-1.5 w-1.5 rounded-full ${socketConnected ? 'bg-emerald-500 animate-pulse' : 'bg-gray-400'}`} />
                    {socketConnected ? 'Connected' : 'Connecting...'}
                  </span>
                </div>
                <Badge variant="outline" className="text-xs">
                  {isDriver && assignedTruck ? assignedTruck.plateNumber : allTrucks.find(t => t.id === selectedTruckId)?.plateNumber}
                </Badge>
              </div>

              <div className="grid grid-cols-2 sm:grid-cols-4 gap-0 divide-x divide-y sm:divide-y-0">
                <div className="p-3 text-center">
                  <p className="text-xs text-muted-foreground mb-0.5">Latitude</p>
                  <p className="font-mono font-semibold text-sm">
                    {currentPosition ? currentPosition.lat.toFixed(6) : '---'}
                  </p>
                </div>
                <div className="p-3 text-center">
                  <p className="text-xs text-muted-foreground mb-0.5">Longitude</p>
                  <p className="font-mono font-semibold text-sm">
                    {currentPosition ? currentPosition.lng.toFixed(6) : '---'}
                  </p>
                </div>
                <div className="p-3 text-center">
                  <p className="text-xs text-muted-foreground mb-0.5">Speed</p>
                  <p className="font-semibold text-sm text-emerald-600">
                    {currentSpeed != null ? `${Math.round(currentSpeed)} km/h` : '0 km/h'}
                  </p>
                </div>
                <div className="p-3 text-center">
                  <p className="text-xs text-muted-foreground mb-0.5">Points Sent</p>
                  <p className="font-semibold text-sm text-amber-600">{pointsSent}</p>
                </div>
              </div>

              {/* Accuracy bar */}
              {currentAccuracy != null && (
                <div className="px-4 py-2 bg-muted/30 border-t flex items-center justify-between">
                  <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                    <Satellite className="h-3 w-3" />
                    GPS Accuracy: <span className="font-medium text-foreground">{Math.round(currentAccuracy)}m</span>
                  </div>
                  <Badge
                    variant="outline"
                    className={`text-[10px] ${
                      currentAccuracy < 20
                        ? 'text-emerald-600 border-emerald-300'
                        : currentAccuracy < 50
                        ? 'text-amber-600 border-amber-300'
                        : 'text-red-600 border-red-300'
                    }`}
                  >
                    {currentAccuracy < 20 ? 'Excellent' : currentAccuracy < 50 ? 'Good' : 'Low'}
                  </Badge>
                </div>
              )}
            </CardContent>
          </Card>
        </motion.div>
      )}

      {/* Map */}
      <motion.div variants={itemVariants}>
        <Card className="overflow-hidden">
          <CardContent className="p-0">
            <div className="h-[350px] sm:h-[400px]">
              {currentPosition ? (
                <MapContainer
                  center={[currentPosition.lat, currentPosition.lng]}
                  zoom={16}
                  style={{ height: '100%', width: '100%' }}
                  zoomControl={true}
                >
                  <TileLayer
                    attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
                    url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
                  />
                  <Marker position={[currentPosition.lat, currentPosition.lng]} icon={driverMarkerIcon} />
                  {currentAccuracy != null && (
                    <Circle
                      center={[currentPosition.lat, currentPosition.lng]}
                      radius={currentAccuracy}
                      pathOptions={{
                        color: '#f59e0b',
                        fillColor: '#fef3c7',
                        fillOpacity: 0.2,
                        weight: 1,
                      }}
                    />
                  )}
                </MapContainer>
              ) : (
                <div className="h-full flex items-center justify-center bg-muted/30">
                  <div className="text-center px-6">
                    {isSharing ? (
                      <>
                        <Loader2 className="h-8 w-8 text-amber-500 mx-auto mb-2 animate-spin" />
                        <p className="text-sm text-muted-foreground">Waiting for GPS signal...</p>
                      </>
                    ) : (
                      <>
                        <MapPin className="h-8 w-8 text-muted-foreground mx-auto mb-2" />
                        <p className="text-sm text-muted-foreground">Start sharing to see your location on the map</p>
                      </>
                    )}
                  </div>
                </div>
              )}
            </div>
          </CardContent>
        </Card>
      </motion.div>

      {/* Info */}
      <motion.div variants={itemVariants}>
        <Card>
          <CardContent className="p-4">
            <div className="flex items-start gap-3">
              <Phone className="h-5 w-5 text-amber-500 mt-0.5 flex-shrink-0" />
              <div className="text-xs text-muted-foreground space-y-1">
                <p className="font-medium text-foreground">How it works</p>
                <ul className="list-disc list-inside space-y-0.5">
                  <li>Select your assigned truck from the dropdown above</li>
                  <li>Click &quot;Start Sharing Location&quot; to begin GPS tracking</li>
                  <li>Your phone&apos;s GPS is used with high accuracy mode enabled</li>
                  <li>Keep this page open to continue sharing your location</li>
                  <li>Your admin/manager can see your live position on the tracking dashboard</li>
                </ul>
              </div>
            </div>
          </CardContent>
        </Card>
      </motion.div>
    </motion.div>
  )
}
