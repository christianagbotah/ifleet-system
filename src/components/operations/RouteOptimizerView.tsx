'use client'

import React, { useState, useMemo, useCallback } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { apiFetch } from '@/lib/api'
import { GHANA_CITIES } from '@/lib/ghana-routes'
import {
  MapPin,
  Navigation,
  Fuel,
  Clock,
  DollarSign,
  Truck,
  Plus,
  X,
  ChevronRight,
  ArrowRightLeft,
  Gauge,
  Route as RouteIcon,
  Loader2,
  AlertCircle,
  TrendingUp,
  MapPinned,
  Calculator,
  Zap,
  ArrowDown,
  Waypoints,
  Star,
  Phone,
  BadgeCheck,
} from 'lucide-react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
import { Separator } from '@/components/ui/separator'
import { Skeleton } from '@/components/ui/skeleton'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { toast } from 'sonner'

// ============ Types ============

interface RouteResult {
  from: string
  to: string
  stops: string[]
  totalDistance: number
  totalHours: number
  fuelCost: number
  tollCost: number
  totalCost: number
  legs?: Array<{
    from: string
    to: string
    distanceKm: number
    estimatedHours: number
    tollCost: number
    fuelCost: number
    totalCost: number
  }>
}

interface AlternativeRoute {
  from: string
  via: string
  to: string
  totalDistance: number
  totalCost: number
}

interface RecommendedTruck {
  truckId: string
  plateNumber: string
  make: string
  model: string
  driver: string
  currentLocation: string
  distanceToPickup: number | null
  fuelLevel: number | null
  tankCapacity: number | null
}

interface FuelEstimate {
  liters: number
  costAtCurrentPrice: number
  recommendedPricePerLiter: number
  fuelPer100km: number
  weightAdjustment: number
}

interface OptimizeResponse {
  route: RouteResult
  alternatives: AlternativeRoute[]
  recommendedTrucks: RecommendedTruck[]
  fuelEstimate: FuelEstimate
}

// ============ Constants ============

const POPULAR_ROUTES = [
  { from: 'Accra', to: 'Kumasi', label: 'Accra → Kumasi', tag: 'Major trunk' },
  { from: 'Accra', to: 'Tamale', label: 'Accra → Tamale', tag: 'Northern' },
  { from: 'Accra', to: 'Takoradi', label: 'Accra → Takoradi', tag: 'Coastal' },
  { from: 'Kumasi', to: 'Tamale', label: 'Kumasi → Tamale', tag: 'Ashanti' },
  { from: 'Accra', to: 'Cape Coast', label: 'Accra → Cape Coast', tag: 'Central' },
  { from: 'Tema', to: 'Kumasi', label: 'Tema → Kumasi', tag: 'Industrial' },
]

const CITY_NAMES = GHANA_CITIES.map(c => c.name)

// ============ Component ============

export function RouteOptimizerView() {
  // Form state
  const [origin, setOrigin] = useState('')
  const [destination, setDestination] = useState('')
  const [intermediateStops, setIntermediateStops] = useState<string[]>([])
  const [fuelPrice, setFuelPrice] = useState('15')
  const [cargoWeight, setCargoWeight] = useState('')

  // UI state
  const [loading, setLoading] = useState(false)
  const [result, setResult] = useState<OptimizeResponse | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [activeTab, setActiveTab] = useState<'planner' | 'calculator'>('planner')

  // Derived: all stops for the route
  const allStops = useMemo(() => {
    const stops = [origin, ...intermediateStops, destination].filter(Boolean)
    return stops
  }, [origin, intermediateStops, destination])

  // Add intermediate stop
  const addStop = useCallback(() => {
    if (intermediateStops.length >= 5) {
      toast.error('Maximum 5 intermediate stops allowed')
      return
    }
    setIntermediateStops(prev => [...prev, ''])
  }, [intermediateStops.length])

  // Remove intermediate stop
  const removeStop = useCallback((index: number) => {
    setIntermediateStops(prev => prev.filter((_, i) => i !== index))
  }, [])

  // Update intermediate stop
  const updateStop = useCallback((index: number, value: string) => {
    setIntermediateStops(prev => {
      const updated = [...prev]
      updated[index] = value
      return updated
    })
  }, [])

  // Swap origin and destination
  const swapRoute = useCallback(() => {
    setOrigin(destination)
    setDestination(origin)
    setIntermediateStops(prev => [...prev].reverse())
    setResult(null)
  }, [origin, destination])

  // Quick route selection
  const selectQuickRoute = useCallback((from: string, to: string) => {
    setOrigin(from)
    setDestination(to)
    setIntermediateStops([])
    setResult(null)
    setError(null)
  }, [])

  // Calculate route
  const calculateRoute = useCallback(async () => {
    if (!origin || !destination) {
      toast.error('Please select both origin and destination cities')
      return
    }
    if (origin === destination) {
      toast.error('Origin and destination cannot be the same')
      return
    }

    setLoading(true)
    setError(null)
    setResult(null)

    try {
      const params = new URLSearchParams({ from, to })
      if (intermediateStops.filter(Boolean).length > 0) {
        params.set('stops', intermediateStops.filter(Boolean).join(','))
      }
      if (cargoWeight) {
        params.set('weight', cargoWeight)
      }
      if (fuelPrice && parseFloat(fuelPrice) > 0) {
        params.set('fuelPrice', fuelPrice)
      }

      const data = await apiFetch<OptimizeResponse>(`/api/routes/optimize?${params.toString()}`)
      setResult(data)
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to calculate route'
      setError(message)
      toast.error(message)
    } finally {
      setLoading(false)
    }
  }, [origin, destination, intermediateStops, cargoWeight, fuelPrice])

  // Clear form
  const clearForm = useCallback(() => {
    setOrigin('')
    setDestination('')
    setIntermediateStops([])
    setCargoWeight('')
    setFuelPrice('15')
    setResult(null)
    setError(null)
  }, [])

  // Live cost calculator totals
  const calcTotals = useMemo(() => {
    if (!result) return null
    return {
      distance: result.route.totalDistance,
      hours: result.route.totalHours,
      fuelCost: result.fuelEstimate.costAtCurrentPrice,
      tollCost: result.route.tollCost,
      totalCost: result.fuelEstimate.costAtCurrentPrice + result.route.tollCost,
      fuelLiters: result.fuelEstimate.liters,
    }
  }, [result])

  return (
    <div className="space-y-6">
      {/* Page Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight flex items-center gap-2">
            <Navigation className="h-6 w-6 text-amber-500" />
            Route Optimizer
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            Plan optimized routes across Ghana with fuel cost estimation and truck recommendations
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            className={activeTab === 'planner' ? 'bg-amber-50 border-amber-200 text-amber-700 dark:bg-amber-950/30 dark:border-amber-800 dark:text-amber-400' : ''}
            onClick={() => setActiveTab('planner')}
          >
            <RouteIcon className="h-4 w-4 mr-1" />
            Route Planner
          </Button>
          <Button
            variant="outline"
            size="sm"
            className={activeTab === 'calculator' ? 'bg-amber-50 border-amber-200 text-amber-700 dark:bg-amber-950/30 dark:border-amber-800 dark:text-amber-400' : ''}
            onClick={() => setActiveTab('calculator')}
          >
            <Calculator className="h-4 w-4 mr-1" />
            Cost Calculator
          </Button>
        </div>
      </div>

      {/* Route Planner Tab */}
      {activeTab === 'planner' && (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Left Column: Route Input */}
          <div className="lg:col-span-1 space-y-4">
            {/* Route Selection Card */}
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-base flex items-center gap-2">
                  <MapPin className="h-4 w-4 text-amber-500" />
                  Plan Your Route
                </CardTitle>
                <CardDescription>Select origin, destination, and optional stops</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                {/* Origin */}
                <div className="space-y-2">
                  <Label className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Origin</Label>
                  <Select value={origin} onValueChange={(v) => { setOrigin(v); setResult(null) }}>
                    <SelectTrigger>
                      <SelectValue placeholder="Select origin city" />
                    </SelectTrigger>
                    <SelectContent>
                      {CITY_NAMES.map(city => (
                        <SelectItem key={city} value={city}>{city}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                {/* Swap Button */}
                <div className="flex justify-center">
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-8 w-8 rounded-full hover:bg-amber-50 hover:text-amber-600 dark:hover:bg-amber-950/30"
                    onClick={swapRoute}
                    disabled={!origin && !destination}
                  >
                    <ArrowRightLeft className="h-4 w-4" />
                  </Button>
                </div>

                {/* Destination */}
                <div className="space-y-2">
                  <Label className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Destination</Label>
                  <Select value={destination} onValueChange={(v) => { setDestination(v); setResult(null) }}>
                    <SelectTrigger>
                      <SelectValue placeholder="Select destination city" />
                    </SelectTrigger>
                    <SelectContent>
                      {CITY_NAMES.map(city => (
                        <SelectItem key={city} value={city}>{city}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <Separator />

                {/* Intermediate Stops */}
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <Label className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
                      Intermediate Stops ({intermediateStops.length}/5)
                    </Label>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-7 text-amber-600 hover:text-amber-700 dark:text-amber-400"
                      onClick={addStop}
                      disabled={intermediateStops.length >= 5}
                    >
                      <Plus className="h-3 w-3 mr-1" />
                      Add Stop
                    </Button>
                  </div>
                  <AnimatePresence>
                    {intermediateStops.map((stop, idx) => (
                      <motion.div
                        key={idx}
                        initial={{ opacity: 0, height: 0 }}
                        animate={{ opacity: 1, height: 'auto' }}
                        exit={{ opacity: 0, height: 0 }}
                        className="flex items-center gap-2"
                      >
                        <div className="flex flex-col items-center">
                          <div className="w-2 h-2 rounded-full bg-amber-400" />
                          <div className="w-0.5 h-6 bg-amber-200 dark:bg-amber-800" />
                        </div>
                        <Select
                          value={stop}
                          onValueChange={(v) => updateStop(idx, v)}
                        >
                          <SelectTrigger className="flex-1">
                            <SelectValue placeholder={`Stop ${idx + 1}`} />
                          </SelectTrigger>
                          <SelectContent>
                            {CITY_NAMES.map(city => (
                              <SelectItem key={city} value={city}>{city}</SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-9 w-9 text-muted-foreground hover:text-red-500 shrink-0"
                          onClick={() => removeStop(idx)}
                        >
                          <X className="h-4 w-4" />
                        </Button>
                      </motion.div>
                    ))}
                  </AnimatePresence>
                </div>

                <Separator />

                {/* Cost Parameters */}
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1">
                    <Label className="text-xs font-medium text-muted-foreground">Fuel Price (₵/L)</Label>
                    <Input
                      type="number"
                      value={fuelPrice}
                      onChange={(e) => setFuelPrice(e.target.value)}
                      placeholder="15"
                      min="0"
                      step="0.5"
                    />
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs font-medium text-muted-foreground">Cargo Weight (t)</Label>
                    <Input
                      type="number"
                      value={cargoWeight}
                      onChange={(e) => setCargoWeight(e.target.value)}
                      placeholder="0"
                      min="0"
                      step="0.5"
                    />
                  </div>
                </div>

                {/* Action Buttons */}
                <div className="flex gap-2 pt-2">
                  <Button
                    className="flex-1 bg-amber-600 hover:bg-amber-700 text-white"
                    onClick={calculateRoute}
                    disabled={loading || !origin || !destination}
                  >
                    {loading ? (
                      <>
                        <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                        Calculating...
                      </>
                    ) : (
                      <>
                        <Navigation className="h-4 w-4 mr-2" />
                        Calculate Route
                      </>
                    )}
                  </Button>
                  <Button variant="outline" onClick={clearForm} disabled={loading}>
                    Clear
                  </Button>
                </div>
              </CardContent>
            </Card>

            {/* Popular Routes */}
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-base flex items-center gap-2">
                  <Zap className="h-4 w-4 text-amber-500" />
                  Popular Routes
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-1 gap-2">
                  {POPULAR_ROUTES.map((route) => (
                    <button
                      key={route.label}
                      onClick={() => selectQuickRoute(route.from, route.to)}
                      className="flex items-center justify-between p-2.5 rounded-lg border hover:bg-amber-50 hover:border-amber-200 dark:hover:bg-amber-950/20 dark:hover:border-amber-800 transition-colors text-left"
                    >
                      <div className="flex items-center gap-2">
                        <div className="flex items-center gap-1 text-sm font-medium">
                          <MapPinned className="h-3.5 w-3.5 text-muted-foreground" />
                          {route.label}
                        </div>
                      </div>
                      <Badge variant="outline" className="text-[10px] font-normal shrink-0">
                        {route.tag}
                      </Badge>
                    </button>
                  ))}
                </div>
              </CardContent>
            </Card>
          </div>

          {/* Right Column: Results */}
          <div className="lg:col-span-2 space-y-4">
            {/* Loading State */}
            {loading && (
              <Card>
                <CardContent className="p-6">
                  <div className="space-y-4">
                    <Skeleton className="h-6 w-48" />
                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
                      {[...Array(4)].map((_, i) => (
                        <Skeleton key={i} className="h-24 rounded-lg" />
                      ))}
                    </div>
                    <Skeleton className="h-48 rounded-lg" />
                  </div>
                </CardContent>
              </Card>
            )}

            {/* Error State */}
            {error && !loading && (
              <Card className="border-red-200 dark:border-red-800">
                <CardContent className="p-6">
                  <div className="flex items-start gap-3">
                    <AlertCircle className="h-5 w-5 text-red-500 mt-0.5 shrink-0" />
                    <div>
                      <h3 className="font-medium text-red-700 dark:text-red-400">Route Error</h3>
                      <p className="text-sm text-muted-foreground mt-1">{error}</p>
                    </div>
                  </div>
                </CardContent>
              </Card>
            )}

            {/* Results */}
            {result && !loading && (
              <AnimatePresence mode="wait">
                <motion.div
                  key="results"
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -10 }}
                  className="space-y-4"
                >
                  {/* Route Summary KPIs */}
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                    <motion.div
                      initial={{ opacity: 0, scale: 0.95 }}
                      animate={{ opacity: 1, scale: 1 }}
                      transition={{ delay: 0.05 }}
                    >
                      <Card className="overflow-hidden">
                        <CardContent className="p-4">
                          <div className="flex items-center gap-2 mb-2">
                            <div className="h-8 w-8 rounded-lg bg-amber-100 dark:bg-amber-900/30 flex items-center justify-center">
                              <Gauge className="h-4 w-4 text-amber-600 dark:text-amber-400" />
                            </div>
                            <span className="text-xs text-muted-foreground font-medium">Distance</span>
                          </div>
                          <p className="text-2xl font-bold">{result.route.totalDistance.toLocaleString()}</p>
                          <p className="text-xs text-muted-foreground">kilometers</p>
                        </CardContent>
                      </Card>
                    </motion.div>

                    <motion.div
                      initial={{ opacity: 0, scale: 0.95 }}
                      animate={{ opacity: 1, scale: 1 }}
                      transition={{ delay: 0.1 }}
                    >
                      <Card className="overflow-hidden">
                        <CardContent className="p-4">
                          <div className="flex items-center gap-2 mb-2">
                            <div className="h-8 w-8 rounded-lg bg-emerald-100 dark:bg-emerald-900/30 flex items-center justify-center">
                              <Clock className="h-4 w-4 text-emerald-600 dark:text-emerald-400" />
                            </div>
                            <span className="text-xs text-muted-foreground font-medium">Est. Time</span>
                          </div>
                          <p className="text-2xl font-bold">{result.route.totalHours}</p>
                          <p className="text-xs text-muted-foreground">hours</p>
                        </CardContent>
                      </Card>
                    </motion.div>

                    <motion.div
                      initial={{ opacity: 0, scale: 0.95 }}
                      animate={{ opacity: 1, scale: 1 }}
                      transition={{ delay: 0.15 }}
                    >
                      <Card className="overflow-hidden">
                        <CardContent className="p-4">
                          <div className="flex items-center gap-2 mb-2">
                            <div className="h-8 w-8 rounded-lg bg-sky-100 dark:bg-sky-900/30 flex items-center justify-center">
                              <Fuel className="h-4 w-4 text-sky-600 dark:text-sky-400" />
                            </div>
                            <span className="text-xs text-muted-foreground font-medium">Fuel Cost</span>
                          </div>
                          <p className="text-2xl font-bold">₵{result.fuelEstimate.costAtCurrentPrice.toLocaleString()}</p>
                          <p className="text-xs text-muted-foreground">{result.fuelEstimate.liters}L @ ₵{fuelPrice}/L</p>
                        </CardContent>
                      </Card>
                    </motion.div>

                    <motion.div
                      initial={{ opacity: 0, scale: 0.95 }}
                      animate={{ opacity: 1, scale: 1 }}
                      transition={{ delay: 0.2 }}
                    >
                      <Card className="overflow-hidden border-amber-200 dark:border-amber-800">
                        <CardContent className="p-4 bg-gradient-to-br from-amber-50 to-transparent dark:from-amber-950/20 dark:to-transparent">
                          <div className="flex items-center gap-2 mb-2">
                            <div className="h-8 w-8 rounded-lg bg-amber-100 dark:bg-amber-900/30 flex items-center justify-center">
                              <DollarSign className="h-4 w-4 text-amber-600 dark:text-amber-400" />
                            </div>
                            <span className="text-xs text-muted-foreground font-medium">Total Cost</span>
                          </div>
                          <p className="text-2xl font-bold text-amber-700 dark:text-amber-400">
                            ₵{(result.fuelEstimate.costAtCurrentPrice + result.route.tollCost).toLocaleString()}
                          </p>
                          <p className="text-xs text-muted-foreground">incl. ₵{result.route.tollCost} tolls</p>
                        </CardContent>
                      </Card>
                    </motion.div>
                  </div>

                  {/* Route Visualization */}
                  <Card>
                    <CardHeader className="pb-3">
                      <CardTitle className="text-base flex items-center gap-2">
                        <Waypoints className="h-4 w-4 text-amber-500" />
                        Route Details
                      </CardTitle>
                    </CardHeader>
                    <CardContent>
                      {/* Route Path Visualization */}
                      <div className="flex items-center gap-1 flex-wrap mb-4">
                        <Badge variant="outline" className="border-emerald-300 bg-emerald-50 text-emerald-700 dark:border-emerald-700 dark:bg-emerald-950/30 dark:text-emerald-400 px-3 py-1">
                          <MapPin className="h-3 w-3 mr-1" />
                          {result.route.from}
                        </Badge>
                        {result.route.stops.map((stop, idx) => (
                          <React.Fragment key={idx}>
                            <ChevronRight className="h-4 w-4 text-muted-foreground shrink-0" />
                            <Badge variant="outline" className="border-amber-300 bg-amber-50 text-amber-700 dark:border-amber-700 dark:bg-amber-950/30 dark:text-amber-400 px-3 py-1">
                              {stop}
                            </Badge>
                          </React.Fragment>
                        ))}
                        <ChevronRight className="h-4 w-4 text-muted-foreground shrink-0" />
                        <Badge variant="outline" className="border-red-300 bg-red-50 text-red-700 dark:border-red-700 dark:bg-red-950/30 dark:text-red-400 px-3 py-1">
                          <MapPin className="h-3 w-3 mr-1" />
                          {result.route.to}
                        </Badge>
                      </div>

                      {/* Legs Table (for multi-stop) */}
                      {result.route.legs && result.route.legs.length > 1 && (
                        <>
                          <div className="rounded-lg border overflow-hidden mb-4">
                            <div className="overflow-x-auto max-h-60 overflow-y-auto hidden md:block">
                              <table className="w-full text-sm">
                                <thead className="bg-muted/50 sticky top-0">
                                  <tr>
                                    <th className="text-left px-4 py-2.5 font-medium text-xs uppercase tracking-wider text-muted-foreground">Leg</th>
                                    <th className="text-right px-4 py-2.5 font-medium text-xs uppercase tracking-wider text-muted-foreground">Distance</th>
                                    <th className="text-right px-4 py-2.5 font-medium text-xs uppercase tracking-wider text-muted-foreground">Time</th>
                                    <th className="text-right px-4 py-2.5 font-medium text-xs uppercase tracking-wider text-muted-foreground">Toll</th>
                                    <th className="text-right px-4 py-2.5 font-medium text-xs uppercase tracking-wider text-muted-foreground">Cost</th>
                                  </tr>
                                </thead>
                                <tbody>
                                  {result.route.legs.map((leg, idx) => (
                                    <tr key={idx} className="border-t">
                                      <td className="px-4 py-2.5">
                                        <span className="font-medium">{leg.from}</span>
                                        <ChevronRight className="h-3 w-3 inline mx-1 text-muted-foreground" />
                                        <span className="font-medium">{leg.to}</span>
                                      </td>
                                      <td className="text-right px-4 py-2.5 font-mono">{leg.distanceKm} km</td>
                                      <td className="text-right px-4 py-2.5">{leg.estimatedHours}h</td>
                                      <td className="text-right px-4 py-2.5">₵{leg.tollCost}</td>
                                      <td className="text-right px-4 py-2.5 font-medium">₵{leg.totalCost}</td>
                                    </tr>
                                  ))}
                                </tbody>
                              </table>
                            </div>
                          </div>
                          {/* Mobile legs cards */}
                          <div className="md:hidden divide-y rounded-lg border mb-4 overflow-hidden">
                            {result.route.legs.map((leg, idx) => (
                              <div key={idx} className="mobile-card p-4 space-y-2">
                                <p className="font-semibold text-sm">
                                  <MapPin className="h-3.5 w-3.5 inline mr-1 text-emerald-500" />
                                  {leg.from}
                                  <ChevronRight className="h-3 w-3 inline mx-1 text-muted-foreground" />
                                  {leg.to}
                                </p>
                                <div className="flex items-center gap-3 text-sm">
                                  <span className="text-muted-foreground">{leg.distanceKm} km</span>
                                  <span className="text-muted-foreground">{leg.estimatedHours}h</span>
                                  <span className="text-muted-foreground">Toll ₵{leg.tollCost}</span>
                                </div>
                                <p className="font-semibold text-sm">₵{leg.totalCost}</p>
                              </div>
                            ))}
                          </div>
                        </>
                      )}

                      {/* Cost Breakdown */}
                      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                        <div className="rounded-lg border p-3 space-y-1">
                          <div className="flex items-center gap-2">
                            <Fuel className="h-3.5 w-3.5 text-sky-500" />
                            <span className="text-xs font-medium text-muted-foreground">Fuel</span>
                          </div>
                          <p className="text-lg font-bold">₵{result.fuelEstimate.costAtCurrentPrice.toLocaleString()}</p>
                          <p className="text-[11px] text-muted-foreground">
                            {result.fuelEstimate.liters}L at ₵{fuelPrice}/L
                            {parseFloat(cargoWeight) > 0 && (
                              <span className="text-amber-600 dark:text-amber-400">
                                {' '}(+{result.fuelEstimate.weightAdjustment}L/100km for {cargoWeight}t)
                              </span>
                            )}
                          </p>
                        </div>
                        <div className="rounded-lg border p-3 space-y-1">
                          <div className="flex items-center gap-2">
                            <RouteIcon className="h-3.5 w-3.5 text-violet-500" />
                            <span className="text-xs font-medium text-muted-foreground">Tolls</span>
                          </div>
                          <p className="text-lg font-bold">₵{result.route.tollCost.toLocaleString()}</p>
                          <p className="text-[11px] text-muted-foreground">
                            {result.route.legs ? `${result.route.legs.length} toll point${result.route.legs.length > 1 ? 's' : ''}` : 'Ghana highway tolls'}
                          </p>
                        </div>
                        <div className="rounded-lg border p-3 space-y-1 bg-amber-50/50 dark:bg-amber-950/10">
                          <div className="flex items-center gap-2">
                            <DollarSign className="h-3.5 w-3.5 text-amber-500" />
                            <span className="text-xs font-medium text-muted-foreground">Total Trip Cost</span>
                          </div>
                          <p className="text-lg font-bold text-amber-700 dark:text-amber-400">
                            ₵{(result.fuelEstimate.costAtCurrentPrice + result.route.tollCost).toLocaleString()}
                          </p>
                          <p className="text-[11px] text-muted-foreground">
                            Fuel + Tolls (one-way)
                          </p>
                        </div>
                      </div>
                    </CardContent>
                  </Card>

                  {/* Alternative Routes */}
                  {result.alternatives.length > 0 && (
                    <Card>
                      <CardHeader className="pb-3">
                        <CardTitle className="text-base flex items-center gap-2">
                          <TrendingUp className="h-4 w-4 text-amber-500" />
                          Alternative Routes
                        </CardTitle>
                        <CardDescription>Other possible routes with cost comparison</CardDescription>
                      </CardHeader>
                      <CardContent>
                        <div className="space-y-2 max-h-48 overflow-y-auto">
                          {result.alternatives.map((alt, idx) => {
                            const costDiff = alt.totalCost - result.fuelEstimate.costAtCurrentPrice
                            const isCheaper = costDiff < 0
                            return (
                              <div
                                key={idx}
                                className="flex items-center justify-between p-3 rounded-lg border hover:bg-muted/50 transition-colors"
                              >
                                <div className="flex items-center gap-3">
                                  <span className="text-sm font-medium">
                                    {alt.from} → <span className="text-amber-600 dark:text-amber-400">{alt.via}</span> → {alt.to}
                                  </span>
                                  <Badge variant="outline" className="text-[10px]">
                                    via {alt.via}
                                  </Badge>
                                </div>
                                <div className="flex items-center gap-4 text-sm">
                                  <span className="text-muted-foreground">
                                    {alt.totalDistance} km
                                  </span>
                                  <div className="flex items-center gap-1">
                                    <span className="font-medium">₵{alt.totalCost.toLocaleString()}</span>
                                    {isCheaper && (
                                      <Badge variant="outline" className="text-[10px] text-emerald-600 border-emerald-300 dark:text-emerald-400 dark:border-emerald-700">
                                        -₵{Math.abs(costDiff).toLocaleString()}
                                      </Badge>
                                    )}
                                  </div>
                                </div>
                              </div>
                            )
                          })}
                        </div>
                      </CardContent>
                    </Card>
                  )}

                  {/* Recommended Trucks */}
                  {result.recommendedTrucks.length > 0 && (
                    <Card>
                      <CardHeader className="pb-3">
                        <CardTitle className="text-base flex items-center gap-2">
                          <Truck className="h-4 w-4 text-amber-500" />
                          Recommended Trucks
                        </CardTitle>
                        <CardDescription>
                          Available trucks sorted by proximity to {result.route.from}
                        </CardDescription>
                      </CardHeader>
                      <CardContent>
                        <div className="space-y-3 max-h-96 overflow-y-auto pr-1">
                          {result.recommendedTrucks.map((truck, idx) => (
                            <motion.div
                              key={truck.truckId}
                              initial={{ opacity: 0, x: -10 }}
                              animate={{ opacity: 1, x: 0 }}
                              transition={{ delay: idx * 0.05 }}
                              className="flex items-center gap-4 p-3 rounded-lg border hover:border-amber-200 dark:hover:border-amber-800 transition-colors"
                            >
                              {/* Rank badge */}
                              <div className={`h-8 w-8 rounded-full flex items-center justify-center text-xs font-bold shrink-0 ${
                                idx === 0
                                  ? 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400'
                                  : 'bg-muted text-muted-foreground'
                              }`}>
                                {idx + 1}
                              </div>

                              {/* Truck info */}
                              <div className="flex-1 min-w-0">
                                <div className="flex items-center gap-2">
                                  <span className="font-medium text-sm truncate">
                                    {truck.plateNumber}
                                  </span>
                                  <Badge variant="outline" className="text-[10px] shrink-0">
                                    {truck.make}
                                  </Badge>
                                </div>
                                <div className="flex items-center gap-3 mt-1 text-xs text-muted-foreground">
                                  <span className="flex items-center gap-1">
                                    <BadgeCheck className="h-3 w-3" />
                                    {truck.driver}
                                  </span>
                                  <span className="flex items-center gap-1">
                                    <MapPin className="h-3 w-3" />
                                    {truck.currentLocation}
                                  </span>
                                </div>
                              </div>

                              {/* Distance + Fuel */}
                              <div className="text-right shrink-0">
                                {truck.distanceToPickup !== null ? (
                                  <div>
                                    <p className={`text-sm font-semibold ${
                                      truck.distanceToPickup === 0
                                        ? 'text-emerald-600 dark:text-emerald-400'
                                        : truck.distanceToPickup <= 50
                                        ? 'text-amber-600 dark:text-amber-400'
                                        : 'text-muted-foreground'
                                    }`}>
                                      {truck.distanceToPickup === 0 ? 'At origin' : `${truck.distanceToPickup} km away`}
                                    </p>
                                    {truck.fuelLevel !== null && (
                                      <p className="text-[11px] text-muted-foreground">
                                        Fuel: {Math.round(truck.fuelLevel)}%
                                      </p>
                                    )}
                                  </div>
                                ) : (
                                  <p className="text-sm text-muted-foreground">Location unknown</p>
                                )}
                              </div>
                            </motion.div>
                          ))}
                        </div>
                      </CardContent>
                    </Card>
                  )}
                </motion.div>
              </AnimatePresence>
            )}

            {/* Empty State (no result yet, not loading) */}
            {!result && !loading && !error && (
              <Card>
                <CardContent className="p-12 flex flex-col items-center justify-center text-center">
                  <div className="h-16 w-16 rounded-full bg-amber-100 dark:bg-amber-900/20 flex items-center justify-center mb-4">
                    <Navigation className="h-8 w-8 text-amber-500" />
                  </div>
                  <h3 className="text-lg font-semibold mb-1">Plan a Route</h3>
                  <p className="text-sm text-muted-foreground max-w-sm">
                    Select an origin and destination to see distance, fuel costs, toll estimates, and recommended trucks for your trip.
                  </p>
                  <div className="flex flex-wrap gap-2 mt-4 justify-center">
                    {POPULAR_ROUTES.slice(0, 3).map((route) => (
                      <Button
                        key={route.label}
                        variant="outline"
                        size="sm"
                        className="text-xs"
                        onClick={() => selectQuickRoute(route.from, route.to)}
                      >
                        <MapPin className="h-3 w-3 mr-1" />
                        {route.label}
                      </Button>
                    ))}
                  </div>
                </CardContent>
              </Card>
            )}
          </div>
        </div>
      )}

      {/* Cost Calculator Tab */}
      {activeTab === 'calculator' && (
        <div className="max-w-3xl mx-auto">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Calculator className="h-5 w-5 text-amber-500" />
                Trip Cost Calculator
              </CardTitle>
              <CardDescription>
                Estimate trip costs based on distance, fuel price, and cargo weight
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Fuel Price per Liter (₵)</Label>
                  <Input
                    type="number"
                    value={fuelPrice}
                    onChange={(e) => setFuelPrice(e.target.value)}
                    placeholder="15"
                    min="0"
                    step="0.5"
                  />
                </div>
                <div className="space-y-2">
                  <Label className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Cargo Weight (tonnes)</Label>
                  <Input
                    type="number"
                    value={cargoWeight}
                    onChange={(e) => setCargoWeight(e.target.value)}
                    placeholder="0"
                    min="0"
                    max="50"
                    step="0.5"
                  />
                </div>
              </div>

              <Separator />

              {/* Formula explanation */}
              <div className="rounded-lg bg-muted/50 p-4 space-y-3">
                <h4 className="text-sm font-semibold">Fuel Consumption Formula</h4>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 text-sm">
                  <div className="space-y-1">
                    <p className="font-medium text-muted-foreground text-xs">Base Consumption</p>
                    <p className="font-mono font-bold">32 L/100km</p>
                    <p className="text-xs text-muted-foreground">Empty truck average</p>
                  </div>
                  <div className="space-y-1">
                    <p className="font-medium text-muted-foreground text-xs">Weight Adjustment</p>
                    <p className="font-mono font-bold">+{cargoWeight ? (parseFloat(cargoWeight) * 2).toFixed(1) : '0'} L/100km</p>
                    <p className="text-xs text-muted-foreground">2L extra per tonne</p>
                  </div>
                  <div className="space-y-1">
                    <p className="font-medium text-muted-foreground text-xs">Total Rate</p>
                    <p className="font-mono font-bold">{(32 + (parseFloat(cargoWeight) || 0) * 2).toFixed(1)} L/100km</p>
                    <p className="text-xs text-muted-foreground">With {cargoWeight || '0'}t cargo</p>
                  </div>
                </div>
              </div>

              {/* Quick Reference Table */}
              <div>
                <h4 className="text-sm font-semibold mb-3">Quick Cost Reference (Round Trip)</h4>
                <>
                  <div className="rounded-lg border overflow-hidden">
                    <div className="overflow-x-auto max-h-72 overflow-y-auto hidden md:block">
                      <table className="w-full text-sm">
                        <thead className="bg-muted/50 sticky top-0">
                          <tr>
                            <th className="text-left px-4 py-2.5 font-medium text-xs uppercase tracking-wider text-muted-foreground">Route</th>
                            <th className="text-right px-4 py-2.5 font-medium text-xs uppercase tracking-wider text-muted-foreground">One-way (km)</th>
                            <th className="text-right px-4 py-2.5 font-medium text-xs uppercase tracking-wider text-muted-foreground">One-way Cost</th>
                            <th className="text-right px-4 py-2.5 font-medium text-xs uppercase tracking-wider text-muted-foreground">Round Trip</th>
                          </tr>
                        </thead>
                        <tbody>
                          {POPULAR_ROUTES.map((route) => {
                            const fp = parseFloat(fuelPrice) || 15
                            const weight = parseFloat(cargoWeight) || 0
                            // Approximate distances from popular routes
                            const distances: Record<string, number> = {
                              'Accra → Kumasi': 254,
                              'Accra → Tamale': 670,
                              'Accra → Takoradi': 220,
                              'Kumasi → Tamale': 420,
                              'Accra → Cape Coast': 150,
                              'Tema → Kumasi': 225,
                            }
                            const dist = distances[route.label] || 200
                            const fuelPer100 = 32 + weight * 2
                            const fuelLiters = (dist * fuelPer100) / 100
                            const oneWayCost = fuelLiters * fp + dist * 0.06 // approximate tolls
                            const roundTrip = oneWayCost * 2
                            return (
                              <tr
                                key={route.label}
                                className="border-t hover:bg-muted/30 transition-colors cursor-pointer"
                                onClick={() => { setOrigin(route.from); setDestination(route.to); setActiveTab('planner') }}
                                title={`Plan route: ${route.label}`}
                              >
                                <td className="px-4 py-2.5 font-medium">{route.label} <span className="text-xs text-muted-foreground ml-1">→ Plan</span></td>
                                <td className="text-right px-4 py-2.5 font-mono">{dist} km</td>
                                <td className="text-right px-4 py-2.5 font-mono">₵{Math.round(oneWayCost).toLocaleString()}</td>
                                <td className="text-right px-4 py-2.5 font-mono font-semibold text-amber-700 dark:text-amber-400">
                                  ₵{Math.round(roundTrip).toLocaleString()}
                                </td>
                              </tr>
                            )
                          })}
                        </tbody>
                      </table>
                    </div>
                    {/* Mobile cost reference cards */}
                    <div className="md:hidden divide-y rounded-lg border overflow-hidden">
                      {POPULAR_ROUTES.map((route) => {
                        const fp = parseFloat(fuelPrice) || 15
                        const weight = parseFloat(cargoWeight) || 0
                        const distances: Record<string, number> = {
                          'Accra → Kumasi': 254,
                          'Accra → Tamale': 670,
                          'Accra → Takoradi': 220,
                          'Kumasi → Tamale': 420,
                          'Accra → Cape Coast': 150,
                          'Tema → Kumasi': 225,
                        }
                        const dist = distances[route.label] || 200
                        const fuelPer100 = 32 + weight * 2
                        const fuelLiters = (dist * fuelPer100) / 100
                        const oneWayCost = fuelLiters * fp + dist * 0.06
                        const roundTrip = oneWayCost * 2
                        return (
                          <div
                            key={route.label}
                            className="mobile-card p-4 space-y-2 cursor-pointer hover:bg-muted/50 transition-colors"
                            onClick={() => { setOrigin(route.from); setDestination(route.to); setActiveTab('planner') }}
                            title={`Plan route: ${route.label}`}
                          >
                            <p className="font-semibold text-sm">{route.label} <span className="text-xs text-muted-foreground font-normal">→ Plan</span></p>
                            <div className="flex items-center gap-3 text-sm text-muted-foreground">
                              <span>{dist} km</span>
                              <span>One-way ₵{Math.round(oneWayCost).toLocaleString()}</span>
                            </div>
                            <p className="font-semibold text-sm text-amber-700 dark:text-amber-400">Round Trip ₵{Math.round(roundTrip).toLocaleString()}</p>
                          </div>
                        )
                      })}
                    </div>
                  </div>
                </>
              </div>

              {/* Fuel price comparison */}
              <div className="rounded-lg bg-amber-50 dark:bg-amber-950/20 border border-amber-200 dark:border-amber-800 p-4">
                <div className="flex items-start gap-3">
                  <Star className="h-5 w-5 text-amber-500 mt-0.5 shrink-0" />
                  <div>
                    <h4 className="text-sm font-semibold text-amber-700 dark:text-amber-400">Ghana Fuel Price Tips</h4>
                    <ul className="text-xs text-muted-foreground mt-1 space-y-1 list-disc list-inside">
                      <li>Diesel prices typically range from ₵14-16/liter at major fuel stations</li>
                      <li>Tema and Accra industrial areas often have bulk pricing discounts</li>
                      <li>Fuel prices may be higher in northern regions (Tamale, Wa, Bolgatanga)</li>
                      <li>Consider carrying extra fuel for routes over 300km with limited stations</li>
                    </ul>
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>
      )}
    </div>
  )
}
