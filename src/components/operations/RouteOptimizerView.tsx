'use client'

import { useCallback, useMemo, useState } from 'react'
import {
  AlertTriangle,
  ArrowRightLeft,
  Calculator,
  CheckCircle2,
  Clock,
  Database,
  Fuel,
  Gauge,
  MapPin,
  Navigation,
  Plus,
  Route as RouteIcon,
  Satellite,
  ShieldCheck,
  Sparkles,
  Truck,
  X,
} from 'lucide-react'
import { toast } from 'sonner'

import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { apiFetch } from '@/lib/api'
import { GHANA_CITIES } from '@/lib/ghana-routes'

interface RouteLeg {
  from: string
  to: string
  distanceKm: number
  estimatedHours: number
  tollCost: number
  fuelCost: number
  totalCost: number
}

interface RouteResult {
  from: string
  to: string
  stops: string[]
  totalDistance: number
  totalHours: number
  fuelCost: number
  tollCost: number
  totalCost: number
  legs?: RouteLeg[]
  source: 'static_fallback' | string
  dataQuality: number
  dataQualityGrade: 'trusted' | 'usable' | 'limited'
}

interface RecommendedTruck {
  truckId: string
  plateNumber: string
  make: string
  model: string
  driver: string
  currentLocation: string
  distanceToPickup: number | null
  fuelLevel: null
  tankCapacity: null
  locationSource: string
  locationFreshness: 'fresh' | 'stale' | 'unknown'
  locationReceivedAt: string | null
  confidence: number
  dataQuality: number
  dataQualityGrade: 'trusted' | 'usable' | 'limited'
  reasons: string[]
  warnings: string[]
  fuelEvidenceSource: 'truck_history' | 'fleet_history' | 'configured_default'
}

interface FuelEstimate {
  liters: number
  costAtCurrentPrice: number
  pricePerLiter: number
  priceSource: 'request' | 'configured_default'
  source: 'truck_history' | 'fleet_history' | 'configured_default'
  fuelPer100km: number
  weightAdjustment: number
  cargoAdjustmentFactor: number
  dataQuality: number
  assumptions: string[]
}

interface OptimizeResponse {
  advisoryVersion: string
  generatedAt: string
  recommendationsAvailable: boolean
  route: RouteResult
  alternatives: Array<{
    from: string
    via: string
    to: string
    totalDistance: number
    totalCost: number
  }>
  recommendedTrucks: RecommendedTruck[]
  fuelEstimate: FuelEstimate
  dataQuality: number
  dataQualityGrade: 'trusted' | 'usable' | 'limited'
  confidence: number
  notices: string[]
}

const CITY_NAMES = GHANA_CITIES.map((city) => city.name)
const POPULAR_ROUTES = [
  ['Accra', 'Kumasi'],
  ['Tema', 'Kumasi'],
  ['Accra', 'Takoradi'],
  ['Accra', 'Tamale'],
  ['Kumasi', 'Tamale'],
  ['Accra', 'Cape Coast'],
] as const

function percentage(value: number): string {
  return `${Math.round(value * 100)}%`
}

function qualityLabel(value: string): string {
  if (value === 'trusted') return 'Trusted evidence'
  if (value === 'usable') return 'Usable evidence'
  return 'Limited evidence'
}

function routeSourceLabel(source: string): string {
  if (source === 'static_fallback') return 'Static Ghana route fallback'
  return source.replaceAll('_', ' ')
}

function fuelSourceLabel(source: FuelEstimate['source'] | RecommendedTruck['fuelEvidenceSource']): string {
  if (source === 'truck_history') return 'Truck trip history'
  if (source === 'fleet_history') return 'Fleet trip history'
  return 'Configured conservative fallback'
}

function freshnessLabel(value: RecommendedTruck['locationFreshness']): string {
  if (value === 'fresh') return 'Fresh telematics'
  if (value === 'stale') return 'Stale telematics'
  return 'Location evidence unavailable'
}

function noticeLabel(value: string): string {
  const labels: Record<string, string> = {
    route_uses_static_ghana_graph: 'Distance and ETA use the built-in Ghana route graph, not live traffic.',
    fuel_price_default_used: 'Fuel price uses the configured fallback because no operator price was supplied.',
    truck_efficiency_history_insufficient: 'Truck-specific fuel history is not yet sufficient for this estimate.',
    fleet_efficiency_used: 'Fuel consumption is estimated from recent fleet trip evidence.',
    fleet_efficiency_history_insufficient: 'Fleet fuel history is not yet sufficient for a calibrated estimate.',
    configured_efficiency_default_used: 'Fuel consumption uses a conservative configured fallback.',
  }
  return labels[value] ?? value.replaceAll('_', ' ')
}

export function RouteOptimizerView() {
  const [origin, setOrigin] = useState('')
  const [destination, setDestination] = useState('')
  const [intermediateStops, setIntermediateStops] = useState<string[]>([])
  const [fuelPrice, setFuelPrice] = useState('')
  const [cargoWeight, setCargoWeight] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [result, setResult] = useState<OptimizeResponse | null>(null)
  const [mode, setMode] = useState<'planner' | 'cost'>('planner')

  const routePath = useMemo(
    () => [origin, ...intermediateStops.filter(Boolean), destination].filter(Boolean),
    [origin, intermediateStops, destination],
  )

  const addStop = useCallback(() => {
    if (intermediateStops.length >= 5) {
      toast.error('A route can contain up to five intermediate stops.')
      return
    }
    setIntermediateStops((current) => [...current, ''])
    setResult(null)
  }, [intermediateStops.length])

  const updateStop = useCallback((index: number, city: string) => {
    setIntermediateStops((current) => current.map((value, itemIndex) => itemIndex === index ? city : value))
    setResult(null)
  }, [])

  const removeStop = useCallback((index: number) => {
    setIntermediateStops((current) => current.filter((_, itemIndex) => itemIndex !== index))
    setResult(null)
  }, [])

  const swapEndpoints = useCallback(() => {
    setOrigin(destination)
    setDestination(origin)
    setIntermediateStops((current) => [...current].reverse())
    setResult(null)
  }, [destination, origin])

  const choosePopularRoute = useCallback((from: string, to: string) => {
    setOrigin(from)
    setDestination(to)
    setIntermediateStops([])
    setResult(null)
    setError(null)
  }, [])

  const clear = useCallback(() => {
    setOrigin('')
    setDestination('')
    setIntermediateStops([])
    setFuelPrice('')
    setCargoWeight('')
    setResult(null)
    setError(null)
  }, [])

  const calculate = useCallback(async () => {
    if (!origin || !destination) {
      toast.error('Select both an origin and destination.')
      return
    }
    if (origin === destination) {
      toast.error('Origin and destination must be different.')
      return
    }

    setLoading(true)
    setError(null)
    try {
      const params = new URLSearchParams({ from: origin, to: destination })
      const stops = intermediateStops.filter(Boolean)
      if (stops.length > 0) params.set('stops', stops.join(','))
      if (cargoWeight.trim()) params.set('weight', cargoWeight.trim())
      if (fuelPrice.trim()) params.set('fuelPrice', fuelPrice.trim())

      const data = await apiFetch<OptimizeResponse>(`/api/routes/optimize?${params.toString()}`)
      setResult(data)
    } catch (cause) {
      const message = cause instanceof Error ? cause.message : 'Route intelligence could not calculate this route.'
      setError(message)
      setResult(null)
      toast.error(message)
    } finally {
      setLoading(false)
    }
  }, [cargoWeight, destination, fuelPrice, intermediateStops, origin])

  const totalTripCost = result ? result.fuelEstimate.costAtCurrentPrice + result.route.tollCost : 0

  return (
    <div className="space-y-5">
      <div className="flex flex-col gap-4 xl:flex-row xl:items-end xl:justify-between">
        <div className="space-y-1">
          <div className="flex flex-wrap items-center gap-2">
            <h1 className="text-2xl font-bold tracking-tight">Route Intelligence</h1>
            <Badge variant="outline" className="gap-1">
              <Sparkles className="h-3 w-3" />
              Advisory only
            </Badge>
          </div>
          <p className="max-w-3xl text-sm text-muted-foreground">
            Plan Ghana haulage routes with evidence-labelled distance, fuel and eligible fleet recommendations. Dispatch authority remains in the guarded assignment workflow.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant={mode === 'planner' ? 'default' : 'outline'} size="sm" onClick={() => setMode('planner')}>
            <RouteIcon className="mr-2 h-4 w-4" />
            Planner
          </Button>
          <Button variant={mode === 'cost' ? 'default' : 'outline'} size="sm" onClick={() => setMode('cost')}>
            <Calculator className="mr-2 h-4 w-4" />
            Cost evidence
          </Button>
        </div>
      </div>

      <Card>
        <CardContent className="p-4 sm:p-5">
          <div className="grid gap-3 xl:grid-cols-[1fr_auto_1fr_0.7fr_0.7fr_auto] xl:items-end">
            <div className="space-y-2">
              <Label>Origin</Label>
              <Select value={origin} onValueChange={(value) => { setOrigin(value); setResult(null) }}>
                <SelectTrigger><SelectValue placeholder="Select origin" /></SelectTrigger>
                <SelectContent>
                  {CITY_NAMES.map((city) => <SelectItem key={city} value={city}>{city}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>

            <Button variant="outline" size="icon" className="hidden xl:inline-flex" onClick={swapEndpoints} aria-label="Swap origin and destination">
              <ArrowRightLeft className="h-4 w-4" />
            </Button>

            <div className="space-y-2">
              <Label>Destination</Label>
              <Select value={destination} onValueChange={(value) => { setDestination(value); setResult(null) }}>
                <SelectTrigger><SelectValue placeholder="Select destination" /></SelectTrigger>
                <SelectContent>
                  {CITY_NAMES.map((city) => <SelectItem key={city} value={city}>{city}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label>Fuel price (₵/L)</Label>
              <Input
                type="number"
                min="0.01"
                max="100"
                step="0.01"
                value={fuelPrice}
                onChange={(event) => { setFuelPrice(event.target.value); setResult(null) }}
                placeholder="Use configured fallback"
              />
            </div>

            <div className="space-y-2">
              <Label>Cargo (tonnes)</Label>
              <Input
                type="number"
                min="0"
                max="100"
                step="0.5"
                value={cargoWeight}
                onChange={(event) => { setCargoWeight(event.target.value); setResult(null) }}
                placeholder="Optional"
              />
            </div>

            <div className="flex gap-2">
              <Button className="flex-1 xl:flex-none" disabled={loading || !origin || !destination} onClick={calculate}>
                <Navigation className="mr-2 h-4 w-4" />
                {loading ? 'Calculating…' : 'Run advisory'}
              </Button>
              <Button variant="outline" onClick={clear}>Clear</Button>
            </div>
          </div>

          <div className="mt-4 flex flex-wrap items-center gap-2 border-t pt-4">
            <Button variant="outline" size="sm" onClick={addStop} disabled={intermediateStops.length >= 5}>
              <Plus className="mr-1 h-3.5 w-3.5" />
              Stop
            </Button>
            {intermediateStops.map((stop, index) => (
              <div key={index} className="flex min-w-[180px] items-center gap-1">
                <Select value={stop} onValueChange={(value) => updateStop(index, value)}>
                  <SelectTrigger className="h-9"><SelectValue placeholder={`Stop ${index + 1}`} /></SelectTrigger>
                  <SelectContent>
                    {CITY_NAMES.map((city) => <SelectItem key={city} value={city}>{city}</SelectItem>)}
                  </SelectContent>
                </Select>
                <Button variant="ghost" size="icon" className="h-9 w-9 shrink-0" onClick={() => removeStop(index)} aria-label={`Remove stop ${index + 1}`}>
                  <X className="h-4 w-4" />
                </Button>
              </div>
            ))}
            {intermediateStops.length === 0 && (
              <span className="text-xs text-muted-foreground">Add up to five intermediate delivery or transit cities.</span>
            )}
          </div>
        </CardContent>
      </Card>

      {!result && !loading && !error && (
        <div className="grid gap-4 lg:grid-cols-[1.4fr_1fr]">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-base">
                <ShieldCheck className="h-4 w-4" />
                Evidence-first planning
              </CardTitle>
              <CardDescription>No dispatch action is performed from this screen.</CardDescription>
            </CardHeader>
            <CardContent className="grid gap-3 sm:grid-cols-3">
              <EvidenceIntro icon={<RouteIcon className="h-4 w-4" />} title="Route provenance" text="Static route fallback is clearly separated from live road or traffic data." />
              <EvidenceIntro icon={<Satellite className="h-4 w-4" />} title="Live fleet evidence" text="Eligible fleet ranking uses telematics freshness and server-owned safety gates." />
              <EvidenceIntro icon={<Database className="h-4 w-4" />} title="Fuel evidence" text="Truck history is preferred, then fleet history, then a labelled conservative fallback." />
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-base">Common corridors</CardTitle>
              <CardDescription>Load a route without inventing live traffic conditions.</CardDescription>
            </CardHeader>
            <CardContent className="grid gap-2 sm:grid-cols-2 lg:grid-cols-1">
              {POPULAR_ROUTES.map(([from, to]) => (
                <button
                  key={`${from}-${to}`}
                  type="button"
                  onClick={() => choosePopularRoute(from, to)}
                  className="flex cursor-pointer items-center justify-between rounded-lg border px-3 py-2 text-left text-sm transition-colors hover:bg-muted/60"
                >
                  <span className="font-medium">{from} → {to}</span>
                  <Navigation className="h-3.5 w-3.5 text-muted-foreground" />
                </button>
              ))}
            </CardContent>
          </Card>
        </div>
      )}

      {loading && (
        <Card>
          <CardContent className="flex min-h-48 items-center justify-center p-8">
            <div className="space-y-2 text-center">
              <Navigation className="mx-auto h-7 w-7 animate-pulse" />
              <p className="font-medium">Building route advisory</p>
              <p className="text-sm text-muted-foreground">Checking route evidence, fuel history and eligible fleet signals.</p>
            </div>
          </CardContent>
        </Card>
      )}

      {error && !loading && (
        <Card className="border-destructive/40">
          <CardContent className="flex items-start gap-3 p-5">
            <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-destructive" />
            <div>
              <p className="font-medium">Route advisory unavailable</p>
              <p className="mt-1 text-sm text-muted-foreground">{error}</p>
            </div>
          </CardContent>
        </Card>
      )}

      {result && !loading && mode === 'planner' && (
        <div className="space-y-4">
          <Card>
            <CardContent className="p-4 sm:p-5">
              <div className="flex flex-col gap-4 xl:flex-row xl:items-center xl:justify-between">
                <div>
                  <div className="flex flex-wrap items-center gap-2">
                    <p className="text-lg font-semibold">{routePath.join(' → ')}</p>
                    <Badge variant="outline">{routeSourceLabel(result.route.source)}</Badge>
                    <Badge variant="outline">{qualityLabel(result.dataQualityGrade)}</Badge>
                  </div>
                  <p className="mt-1 text-xs text-muted-foreground">
                    Generated {new Date(result.generatedAt).toLocaleString()} · {result.advisoryVersion}
                  </p>
                </div>
                <div className="flex flex-wrap gap-2 text-xs">
                  <Badge variant="outline">Quality {percentage(result.dataQuality)}</Badge>
                  <Badge variant="outline">Confidence {percentage(result.confidence)}</Badge>
                </div>
              </div>
            </CardContent>
          </Card>

          <div className="grid grid-cols-2 gap-3 xl:grid-cols-4">
            <MetricCard icon={<Gauge className="h-4 w-4" />} label="Distance" value={`${result.route.totalDistance.toLocaleString()} km`} sublabel={routeSourceLabel(result.route.source)} />
            <MetricCard icon={<Clock className="h-4 w-4" />} label="Estimated time" value={`${result.route.totalHours} h`} sublabel="No live-traffic claim" />
            <MetricCard icon={<Fuel className="h-4 w-4" />} label="Fuel estimate" value={`₵${result.fuelEstimate.costAtCurrentPrice.toLocaleString()}`} sublabel={`${result.fuelEstimate.liters} L · ${fuelSourceLabel(result.fuelEstimate.source)}`} />
            <MetricCard icon={<Calculator className="h-4 w-4" />} label="Trip estimate" value={`₵${totalTripCost.toLocaleString()}`} sublabel={`Includes ₵${result.route.tollCost.toLocaleString()} route toll estimate`} />
          </div>

          <div className="grid gap-4 xl:grid-cols-[1.15fr_0.85fr]">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-base">
                  <RouteIcon className="h-4 w-4" />
                  Route legs
                </CardTitle>
                <CardDescription>Each leg uses the same evidence-labelled advisory calculation.</CardDescription>
              </CardHeader>
              <CardContent>
                {result.route.legs && result.route.legs.length > 0 ? (
                  <div className="space-y-2">
                    {result.route.legs.map((leg, index) => (
                      <div key={`${leg.from}-${leg.to}-${index}`} className="grid gap-3 rounded-lg border p-3 sm:grid-cols-[1.5fr_0.7fr_0.7fr_0.7fr] sm:items-center">
                        <div className="flex items-center gap-2 font-medium">
                          <MapPin className="h-4 w-4 text-muted-foreground" />
                          {leg.from} → {leg.to}
                        </div>
                        <div className="text-sm"><span className="text-muted-foreground">Distance </span>{leg.distanceKm} km</div>
                        <div className="text-sm"><span className="text-muted-foreground">Time </span>{leg.estimatedHours} h</div>
                        <div className="text-sm sm:text-right"><span className="text-muted-foreground">Estimate </span>₵{leg.totalCost.toLocaleString()}</div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="rounded-lg border p-4 text-sm text-muted-foreground">
                    Direct route: {result.route.from} → {result.route.to} · {result.route.totalDistance} km
                  </div>
                )}
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-base">
                  <ShieldCheck className="h-4 w-4" />
                  Evidence notes
                </CardTitle>
                <CardDescription>These assumptions limit how strongly the advisory should be used.</CardDescription>
              </CardHeader>
              <CardContent className="space-y-2">
                {result.notices.length > 0 ? result.notices.map((notice) => (
                  <div key={notice} className="flex items-start gap-2 rounded-lg border p-3 text-sm">
                    <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
                    <span>{noticeLabel(notice)}</span>
                  </div>
                )) : (
                  <div className="flex items-center gap-2 rounded-lg border p-3 text-sm">
                    <CheckCircle2 className="h-4 w-4" />
                    No additional fallback notices.
                  </div>
                )}
              </CardContent>
            </Card>
          </div>

          {result.recommendationsAvailable ? (
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-base">
                  <Truck className="h-4 w-4" />
                  Eligible fleet recommendations
                </CardTitle>
                <CardDescription>Hard eligibility blockers are excluded before ranking. This list does not assign or dispatch a vehicle.</CardDescription>
              </CardHeader>
              <CardContent>
                {result.recommendedTrucks.length > 0 ? (
                  <div className="grid gap-3 lg:grid-cols-2 2xl:grid-cols-3">
                    {result.recommendedTrucks.map((truck, index) => (
                      <div key={truck.truckId} className="rounded-xl border p-4">
                        <div className="flex items-start justify-between gap-3">
                          <div>
                            <div className="flex items-center gap-2">
                              <span className="font-semibold">#{index + 1} · {truck.plateNumber}</span>
                              <Badge variant="outline">{truck.make}</Badge>
                            </div>
                            <p className="mt-1 text-sm text-muted-foreground">{truck.driver} · {truck.model}</p>
                          </div>
                          <Badge variant="outline">{percentage(truck.confidence)} confidence</Badge>
                        </div>

                        <div className="mt-4 grid grid-cols-2 gap-3 text-sm">
                          <div>
                            <p className="text-xs text-muted-foreground">Deadhead</p>
                            <p className="font-medium">{truck.distanceToPickup == null ? 'Unknown' : `${truck.distanceToPickup} km`}</p>
                          </div>
                          <div>
                            <p className="text-xs text-muted-foreground">Evidence quality</p>
                            <p className="font-medium">{percentage(truck.dataQuality)} · {truck.dataQualityGrade}</p>
                          </div>
                          <div>
                            <p className="text-xs text-muted-foreground">Location</p>
                            <p className="font-medium">{freshnessLabel(truck.locationFreshness)}</p>
                          </div>
                          <div>
                            <p className="text-xs text-muted-foreground">Source</p>
                            <p className="font-medium">{truck.locationSource}</p>
                          </div>
                        </div>

                        <div className="mt-3 rounded-lg bg-muted/40 p-3 text-xs">
                          <p className="font-medium">Fuel evidence: {fuelSourceLabel(truck.fuelEvidenceSource)}</p>
                          {truck.locationReceivedAt && (
                            <p className="mt-1 text-muted-foreground">Telematics received {new Date(truck.locationReceivedAt).toLocaleString()}</p>
                          )}
                        </div>

                        <div className="mt-3 flex flex-wrap gap-1.5">
                          {truck.reasons.map((reason) => <Badge key={reason} variant="outline">{reason.replaceAll('_', ' ')}</Badge>)}
                          {truck.warnings.map((warning) => <Badge key={warning} variant="outline">{warning.replaceAll('_', ' ')}</Badge>)}
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="rounded-lg border p-5 text-sm text-muted-foreground">
                    No currently eligible fleet candidate has sufficient operational evidence for this advisory. Review dispatch blockers rather than bypassing them.
                  </div>
                )}
              </CardContent>
            </Card>
          ) : (
            <Card>
              <CardContent className="flex items-start gap-3 p-5">
                <ShieldCheck className="mt-0.5 h-5 w-5 shrink-0" />
                <div>
                  <p className="font-medium">Fleet recommendations are permission-scoped</p>
                  <p className="mt-1 text-sm text-muted-foreground">You can view the route advisory, but fleet-wide ranking requires assignment authority.</p>
                </div>
              </CardContent>
            </Card>
          )}
        </div>
      )}

      {result && !loading && mode === 'cost' && (
        <div className="grid gap-4 lg:grid-cols-[1.1fr_0.9fr]">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-base">
                <Fuel className="h-4 w-4" />
                Cost evidence
              </CardTitle>
              <CardDescription>Fuel consumption is evidence-based and its fallback source is explicit.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                <CostFact label="Fuel litres" value={`${result.fuelEstimate.liters} L`} />
                <CostFact label="Fuel estimate" value={`₵${result.fuelEstimate.costAtCurrentPrice.toLocaleString()}`} />
                <CostFact label="Toll estimate" value={`₵${result.route.tollCost.toLocaleString()}`} />
                <CostFact label="Total" value={`₵${totalTripCost.toLocaleString()}`} />
              </div>

              <div className="grid gap-3 sm:grid-cols-2">
                <EvidenceRow label="Fuel-efficiency evidence" value={fuelSourceLabel(result.fuelEstimate.source)} />
                <EvidenceRow label="Fuel price evidence" value={result.fuelEstimate.priceSource === 'request' ? `Operator input · ₵${result.fuelEstimate.pricePerLiter}/L` : `Configured fallback · ₵${result.fuelEstimate.pricePerLiter}/L`} />
                <EvidenceRow label="Estimated rate" value={`${result.fuelEstimate.fuelPer100km} L/100km`} />
                <EvidenceRow label="Cargo adjustment" value={`${result.fuelEstimate.cargoAdjustmentFactor.toFixed(3)}× bounded factor`} />
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-base">
                <Database className="h-4 w-4" />
                Assumptions
              </CardTitle>
              <CardDescription>Missing history reduces confidence instead of being hidden.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-2">
              <div className="flex items-center justify-between rounded-lg border p-3 text-sm">
                <span>Fuel evidence quality</span>
                <Badge variant="outline">{percentage(result.fuelEstimate.dataQuality)}</Badge>
              </div>
              {result.fuelEstimate.assumptions.length > 0 ? result.fuelEstimate.assumptions.map((assumption) => (
                <div key={assumption} className="flex items-start gap-2 rounded-lg border p-3 text-sm">
                  <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
                  {noticeLabel(assumption)}
                </div>
              )) : (
                <div className="flex items-center gap-2 rounded-lg border p-3 text-sm">
                  <CheckCircle2 className="h-4 w-4" />
                  Truck-specific fuel history is sufficient for the current estimate.
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      )}
    </div>
  )
}

function MetricCard({ icon, label, value, sublabel }: { icon: React.ReactNode; label: string; value: string; sublabel: string }) {
  return (
    <Card>
      <CardContent className="p-4">
        <div className="flex items-center gap-2 text-xs text-muted-foreground">{icon}{label}</div>
        <p className="mt-2 text-xl font-bold tracking-tight">{value}</p>
        <p className="mt-1 line-clamp-2 text-xs text-muted-foreground">{sublabel}</p>
      </CardContent>
    </Card>
  )
}

function EvidenceIntro({ icon, title, text }: { icon: React.ReactNode; title: string; text: string }) {
  return (
    <div className="rounded-lg border p-3">
      <div className="flex items-center gap-2 text-sm font-medium">{icon}{title}</div>
      <p className="mt-2 text-xs leading-5 text-muted-foreground">{text}</p>
    </div>
  )
}

function CostFact({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border p-3">
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className="mt-1 font-semibold">{value}</p>
    </div>
  )
}

function EvidenceRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border p-3">
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className="mt-1 text-sm font-medium">{value}</p>
    </div>
  )
}
