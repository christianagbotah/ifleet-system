'use client'

import React, { useState, useEffect, useMemo, useCallback } from 'react'
import {
  Fuel, MapPin, Star, Plus, Search, Filter, TrendingDown, TrendingUp,
  DollarSign, Building2, Phone, Clock, Navigation, Truck, CreditCard, Award,
  Wrench, Droplets, ChevronDown, ExternalLink, RefreshCw, Loader2, X, Calculator, BarChart3,
  Globe, CheckCircle2, AlertTriangle
} from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import {
  Dialog, DialogBody, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter, DialogClose
} from '@/components/ui/dialog'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Textarea } from '@/components/ui/textarea'
import { Checkbox } from '@/components/ui/checkbox'
import { Separator } from '@/components/ui/separator'
import { toast } from 'sonner'
import { motion, AnimatePresence } from 'framer-motion'
import {
  fetchFuelStations, fetchFuelPriceAnalytics, createFuelStation, createFuelPrice,
  updateFuelStation, deleteFuelStation, fetchLiveFuelPrices, applyLivePrices,
  type FuelStation, type FuelPriceAnalytics
} from '@/lib/api'
import { DatePicker } from '@/components/ui/date-picker'
import { CURRENCY_SYMBOL } from '@/lib/constants'

// ============ DATA ============

const GHANA_FUEL_BRANDS = [
  'GOIL', 'Shell', 'TotalEnergies', 'Zenith', 'Star Oil', 'Engen',
  'Allied Oil', 'AvEnergy', 'Piston', 'Frimps', 'Puma Energy', 'Gasoil', 'Florence', 'Goodness', 'Naft Oil'
]

const COMMON_ROUTES = [
  'Accra-Kumasi', 'Accra-Tema', 'Accra-Cape Coast', 'Accra-Takoradi',
  'Accra-Ho', 'Accra-Aflao', 'Kumasi-Tamale', 'Tema-Akosombo', 'Takoradi-Tarkwa'
]

const FUEL_TYPES = ['Diesel', 'Petrol', 'Gas', 'AdBlue']

// ============ COMPONENT ============

export function FuelPriceTrackerView() {
  const [activeTab, setActiveTab] = useState('directory')
  const [analytics, setAnalytics] = useState<FuelPriceAnalytics | null>(null)
  const [stations, setStations] = useState<FuelStation[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [filterBrand, setFilterBrand] = useState('')
  const [filterRoute, setFilterRoute] = useState('')

  // Dialogs
  const [addStationOpen, setAddStationOpen] = useState(false)
  const [updatePriceOpen, setUpdatePriceOpen] = useState(false)
  const [selectedStation, setSelectedStation] = useState<FuelStation | null>(null)
  const [submitting, setSubmitting] = useState(false)

  // Savings calculator
  const [calcLiters, setCalcLiters] = useState(5000)
  const [calcCurrentPrice, setCalcCurrentPrice] = useState(0)

  // Live prices
  const [livePricesOpen, setLivePricesOpen] = useState(false)
  const [liveData, setLiveData] = useState<{ lastUpdated: string; source: string; prices: Record<string, number>; brandPrices: { brand: string; petrol?: number; diesel?: number }[] } | null>(null)
  const [liveLoading, setLiveLoading] = useState(false)
  const [applyingLive, setApplyingLive] = useState(false)
  const [selectedBrands, setSelectedBrands] = useState<Set<string>>(new Set())

  const loadAnalytics = useCallback(async () => {
    try {
      const data = await fetchFuelPriceAnalytics({ fuelType: 'Diesel', months: 12 })
      setAnalytics(data)
      if (data.summary.overallAvg > 0) setCalcCurrentPrice(data.summary.overallAvg)
    } catch { /* empty */ }
  }, [])

  const loadStations = useCallback(async () => {
    setLoading(true)
    try {
      const res = await fetchFuelStations({ search, brand: filterBrand, route: filterRoute, limit: 100 })
      setStations(res.data || [])
    } catch { /* empty */ }
    setLoading(false)
  }, [search, filterBrand, filterRoute])

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void loadAnalytics()
  }, [loadAnalytics])

  useEffect(() => {
    if (activeTab === 'directory') {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      void loadStations()
    }
  }, [activeTab, loadStations])

  // Get latest diesel price for a station
  const getLatestPrice = useCallback((station: FuelStation, fuelType: string) => {
    const price = station.fuelPrices?.find(p => p.fuelType === fuelType)
    return price?.pricePerLiter ?? null
  }, [])

  const filteredStations = useMemo(() => {
    return stations.filter(s => s.isActive !== false)
  }, [stations])

  // Savings calc
  const cheapestPrice = analytics?.summary.cheapestPrice ?? 0
  const monthlySavings = (calcCurrentPrice - cheapestPrice) * calcLiters

  // Summary cards
  const avgPrice = analytics?.summary.overallAvg ?? 0
  const cheapestStation = analytics?.cheapest?.[0]?.fuelStation
  const priceChange = analytics?.summary.priceChange
  const priceChangePercent = analytics?.summary.priceChangePercent
  const activeStationsCount = analytics?.summary.activeStations ?? 0

  // Brand comparison for Tab 4
  const brandComparison = analytics?.brandComparison ?? []

  // Handlers
  const handleCreateStation = async (data: Record<string, unknown>) => {
    setSubmitting(true)
    try {
      await createFuelStation(data)
      toast.success('Station added successfully')
      setAddStationOpen(false)
      loadStations()
      loadAnalytics()
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to add station')
    }
    setSubmitting(false)
  }

  const handleCreatePrice = async (data: { stationId: string; fuelType: string; pricePerLiter: number; effectiveDate?: string; source?: string; notes?: string }) => {
    setSubmitting(true)
    try {
      await createFuelPrice(data)
      toast.success('Price updated successfully')
      setUpdatePriceOpen(false)
      loadStations()
      loadAnalytics()
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to update price')
    }
    setSubmitting(false)
  }

  const handleDeleteStation = async (id: string) => {
    if (!window.confirm('Delete this station? This cannot be undone.')) return
    try {
      await deleteFuelStation(id)
      toast.success('Station deleted')
      loadStations()
      loadAnalytics()
    } catch { toast.error('Failed to delete') }
  }

  const handleFetchLivePrices = async () => {
    setLiveLoading(true)
    setLivePricesOpen(true)
    try {
      const data = await fetchLiveFuelPrices()
      setLiveData(data)
      // Auto-select brands that exist in our station list
      const ourBrands = new Set(stations.map(s => s.brand))
      const matched = data.brandPrices
        .filter(bp => ourBrands.has(bp.brand))
        .map(bp => bp.brand)
      setSelectedBrands(new Set(matched))
    } catch {
      toast.error('Failed to fetch live prices')
    }
    setLiveLoading(false)
  }

  const handleApplyLivePrices = async () => {
    if (!liveData || selectedBrands.size === 0) return
    setApplyingLive(true)
    try {
      const updates = liveData.brandPrices
        .filter(bp => selectedBrands.has(bp.brand))
        .map(bp => ({ brand: bp.brand, diesel: bp.diesel, petrol: bp.petrol }))
      const result = await applyLivePrices({ brandUpdates: updates })
      toast.success(`Updated ${result.updated} prices across ${selectedBrands.size} brand(s)`)
      setLivePricesOpen(false)
      loadStations()
      loadAnalytics()
    } catch {
      toast.error('Failed to apply live prices')
    }
    setApplyingLive(false)
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Fuel Price Tracker</h1>
          <p className="text-sm text-muted-foreground">Track diesel & petrol prices across Ghana fuel stations</p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={() => { loadAnalytics(); loadStations(); }}>
            <RefreshCw className="h-4 w-4 mr-1" /> Refresh
          </Button>
          <Dialog open={livePricesOpen} onOpenChange={open => { setLivePricesOpen(open); if (!open) { setLiveData(null); setSelectedBrands(new Set()) } }}>
            <DialogTrigger asChild>
              <Button variant="outline" size="sm" onClick={handleFetchLivePrices}>
                <Globe className="h-4 w-4 mr-1" /> Live Prices
              </Button>
            </DialogTrigger>
            <DialogContent className="max-w-xl">
              <LivePriceReview
                data={liveData}
                loading={liveLoading}
                applying={applyingLive}
                selectedBrands={selectedBrands}
                onToggleBrand={(brand) => {
                  setSelectedBrands(prev => {
                    const next = new Set(prev)
                    if (next.has(brand)) next.delete(brand)
                    else next.add(brand)
                    return next
                  })
                }}
                onSelectAll={() => {
                  if (liveData) setSelectedBrands(new Set(liveData.brandPrices.map(b => b.brand)))
                }}
                onDeselectAll={() => setSelectedBrands(new Set())}
                onApply={handleApplyLivePrices}
                onRetry={handleFetchLivePrices}
              />
            </DialogContent>
          </Dialog>
          <Dialog open={addStationOpen} onOpenChange={setAddStationOpen}>
            <DialogTrigger asChild>
              <Button size="sm"><Plus className="h-4 w-4 mr-1" /> Add Station</Button>
            </DialogTrigger>
            <DialogContent className="max-w-lg">
              <AddStationForm onSubmit={handleCreateStation} loading={submitting} />
            </DialogContent>
          </Dialog>
        </div>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0 }}>
          <Card className="border-amber-200 dark:border-amber-900/40">
            <CardContent className="p-4">
              <div className="flex items-center gap-2 text-muted-foreground mb-1">
                <DollarSign className="h-4 w-4" />
                <span className="text-xs font-medium">Avg Diesel Price</span>
              </div>
              <p className="text-2xl font-bold">{avgPrice > 0 ? `${CURRENCY_SYMBOL}${avgPrice.toFixed(2)}` : '--'}</p>
              <p className="text-xs text-muted-foreground">per liter</p>
            </CardContent>
          </Card>
        </motion.div>

        <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.05 }}>
          <Card className="border-emerald-200 dark:border-emerald-900/40">
            <CardContent className="p-4">
              <div className="flex items-center gap-2 text-muted-foreground mb-1">
                <TrendingDown className="h-4 w-4 text-emerald-600" />
                <span className="text-xs font-medium">Cheapest Station</span>
              </div>
              <p className="text-lg font-bold truncate">{cheapestStation?.name || '--'}</p>
              <p className="text-xs text-emerald-600 font-medium">{cheapestPrice > 0 ? `${CURRENCY_SYMBOL}${cheapestPrice.toFixed(2)}/L` : ''}</p>
            </CardContent>
          </Card>
        </motion.div>

        <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.1 }}>
          <Card className="border-sky-200 dark:border-sky-900/40">
            <CardContent className="p-4">
              <div className="flex items-center gap-2 text-muted-foreground mb-1">
                <BarChart3 className="h-4 w-4" />
                <span className="text-xs font-medium">Monthly Change</span>
              </div>
              <div className="flex items-center gap-1">
                {priceChange != null && priceChange !== 0 ? (
                  priceChange > 0 ? (
                    <TrendingUp className="h-5 w-5 text-red-500" />
                  ) : (
                    <TrendingDown className="h-5 w-5 text-emerald-500" />
                  )
                ) : null}
                <p className={`text-2xl font-bold ${priceChange == null ? '' : priceChange > 0 ? 'text-red-600' : priceChange < 0 ? 'text-emerald-600' : ''}`}>
                  {priceChange != null ? `${priceChange > 0 ? '+' : ''}${CURRENCY_SYMBOL}${priceChange.toFixed(2)}` : '--'}
                </p>
              </div>
              <p className="text-xs text-muted-foreground">{priceChangePercent != null ? `${priceChangePercent > 0 ? '+' : ''}${priceChangePercent}%` : 'No data'}</p>
            </CardContent>
          </Card>
        </motion.div>

        <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.15 }}>
          <Card className="border-stone-200 dark:border-stone-700">
            <CardContent className="p-4">
              <div className="flex items-center gap-2 text-muted-foreground mb-1">
                <Building2 className="h-4 w-4" />
                <span className="text-xs font-medium">Active Stations</span>
              </div>
              <p className="text-2xl font-bold">{activeStationsCount}</p>
              <p className="text-xs text-muted-foreground">tracked</p>
            </CardContent>
          </Card>
        </motion.div>
      </div>

      {/* Main Tabs */}
      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList className="grid w-full grid-cols-4">
          <TabsTrigger value="directory" className="text-xs sm:text-sm">Station Directory</TabsTrigger>
          <TabsTrigger value="trends" className="text-xs sm:text-sm">Price Trends</TabsTrigger>
          <TabsTrigger value="savings" className="text-xs sm:text-sm">Savings Calculator</TabsTrigger>
          <TabsTrigger value="brands" className="text-xs sm:text-sm">Brand Comparison</TabsTrigger>
        </TabsList>

        {/* Tab 1: Station Directory */}
        <TabsContent value="directory" className="space-y-4">
          {/* Filters */}
          <div className="flex flex-col sm:flex-row gap-3">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input placeholder="Search stations..." value={search} onChange={e => setSearch(e.target.value)} className="pl-9" />
            </div>
            <Select value={filterBrand} onValueChange={v => setFilterBrand(v === '__all__' ? '' : v)}>
              <SelectTrigger className="w-full sm:w-44"><SelectValue placeholder="All Brands" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="__all__">All Brands</SelectItem>
                {GHANA_FUEL_BRANDS.map(b => <SelectItem key={b} value={b}>{b}</SelectItem>)}
              </SelectContent>
            </Select>
            <Select value={filterRoute} onValueChange={v => setFilterRoute(v === '__all__' ? '' : v)}>
              <SelectTrigger className="w-full sm:w-52"><SelectValue placeholder="All Routes" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="__all__">All Routes</SelectItem>
                {COMMON_ROUTES.map(r => <SelectItem key={r} value={r}>{r}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>

          {/* Station Grid */}
          {loading ? (
            <div className="flex items-center justify-center py-20">
              <Loader2 className="h-8 w-8 animate-spin text-amber-500" />
            </div>
          ) : filteredStations.length === 0 ? (
            <Card>
              <CardContent className="py-16 text-center">
                <Fuel className="h-12 w-12 mx-auto mb-4 text-muted-foreground/40" />
                <p className="text-lg font-medium text-muted-foreground">No stations found</p>
                <p className="text-sm text-muted-foreground mb-4">Add your first fuel station to start tracking prices.</p>
                <Button onClick={() => setAddStationOpen(true)}><Plus className="h-4 w-4 mr-1" /> Add Station</Button>
              </CardContent>
            </Card>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
              {filteredStations.map((station, i) => {
                const diesel = getLatestPrice(station, 'Diesel')
                const petrol = getLatestPrice(station, 'Petrol')
                return (
                  <motion.div key={station.id} initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.03 }}>
                    <Card className="hover:shadow-md transition-shadow h-full flex flex-col">
                      <CardContent className="p-4 space-y-3 flex flex-col flex-1">
                        {/* Header */}
                        <div className="flex items-start justify-between">
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2 mb-1">
                              <Badge variant="outline" className="font-semibold text-amber-700 border-amber-300 bg-amber-50 dark:bg-amber-900/20 dark:text-amber-400 dark:border-amber-800 shrink-0">
                                {station.brand}
                              </Badge>
                              {station.rating && station.totalRatings > 0 && (
                                <div className="flex items-center gap-0.5 text-xs text-muted-foreground">
                                  <Star className="h-3 w-3 fill-amber-400 text-amber-400" />
                                  <span>{station.rating.toFixed(1)}</span>
                                </div>
                              )}
                            </div>
                            <h3 className="font-semibold text-sm truncate">{station.name}</h3>
                          </div>
                          <Dialog>
                            <DialogTrigger asChild>
                              <Button variant="ghost" size="icon" className="h-8 w-8 shrink-0" onClick={() => setSelectedStation(station)}>
                                <ExternalLink className="h-4 w-4" />
                              </Button>
                            </DialogTrigger>
                            <DialogContent className="max-w-lg">
                              <StationDetailPanel station={station} onDelete={() => handleDeleteStation(station.id)} onRefresh={() => { loadStations(); loadAnalytics() }} />
                            </DialogContent>
                          </Dialog>
                        </div>

                        {/* Prices */}
                        <div className="grid grid-cols-2 gap-2">
                          <div className="bg-stone-50 dark:bg-stone-900/30 rounded-lg p-2.5">
                            <p className="text-[10px] uppercase font-medium text-muted-foreground mb-0.5">Diesel</p>
                            <p className="text-lg font-bold">{diesel ? `${CURRENCY_SYMBOL}${diesel.toFixed(2)}` : '--'}</p>
                          </div>
                          <div className="bg-stone-50 dark:bg-stone-900/30 rounded-lg p-2.5">
                            <p className="text-[10px] uppercase font-medium text-muted-foreground mb-0.5">Petrol</p>
                            <p className="text-lg font-bold">{petrol ? `${CURRENCY_SYMBOL}${petrol.toFixed(2)}` : '--'}</p>
                          </div>
                        </div>

                        {/* Location */}
                        <div className="flex items-center gap-1.5 text-xs text-muted-foreground flex-wrap">
                          {station.city && <span className="flex items-center gap-1"><MapPin className="h-3 w-3" />{station.city}</span>}
                          {station.city && station.route && <span>·</span>}
                          {station.route && <span className="flex items-center gap-1"><Navigation className="h-3 w-3" />{station.route}</span>}
                        </div>

                        {/* Services */}
                        <div className="flex flex-wrap gap-1.5">
                          {station.hasHGV && <Badge variant="secondary" className="text-[10px] px-1.5 py-0 gap-0.5"><Truck className="h-3 w-3" />HGV</Badge>}
                          {station.hasCardPayment && <Badge variant="secondary" className="text-[10px] px-1.5 py-0 gap-0.5"><CreditCard className="h-3 w-3" />Card</Badge>}
                          {station.hasLoyaltyProgram && <Badge variant="secondary" className="text-[10px] px-1.5 py-0 gap-0.5"><Award className="h-3 w-3" />Loyalty</Badge>}
                          {station.hasAdBlue && <Badge variant="secondary" className="text-[10px] px-1.5 py-0 gap-0.5"><Droplets className="h-3 w-3" />AdBlue</Badge>}
                          {station.hasWorkshop && <Badge variant="secondary" className="text-[10px] px-1.5 py-0 gap-0.5"><Wrench className="h-3 w-3" />Workshop</Badge>}
                        </div>

                        {/* Actions */}
                        <div className="flex gap-2 pt-1 mt-auto">
                          <Dialog open={updatePriceOpen && selectedStation?.id === station.id} onOpenChange={open => { if (open) { setSelectedStation(station); setUpdatePriceOpen(true); } else { setUpdatePriceOpen(false); } }}>
                            <DialogTrigger asChild>
                              <Button variant="outline" size="sm" className="flex-1 text-xs" onClick={() => { setSelectedStation(station); setUpdatePriceOpen(true); }}>
                                <DollarSign className="h-3.5 w-3.5 mr-1" /> Update Price
                              </Button>
                            </DialogTrigger>
                            <DialogContent>
                              <UpdatePriceForm station={station} onSubmit={handleCreatePrice} loading={submitting} />
                            </DialogContent>
                          </Dialog>
                          {station.latitude && station.longitude && (
                            <Button variant="outline" size="sm" className="text-xs" asChild>
                              <a href={`https://www.google.com/maps?q=${station.latitude},${station.longitude}`} target="_blank" rel="noopener noreferrer">
                                <Navigation className="h-3.5 w-3.5 mr-1" /> Directions
                              </a>
                            </Button>
                          )}
                        </div>
                      </CardContent>
                    </Card>
                  </motion.div>
                )
              })}
            </div>
          )}
        </TabsContent>

        {/* Tab 2: Price Trends */}
        <TabsContent value="trends">
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base">Diesel Price Trend (Last 12 Months)</CardTitle>
            </CardHeader>
            <CardContent>
              {analytics?.trends && analytics.trends.length > 0 ? (
                <>
                  <div className="hidden md:block overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="border-b">
                          <th className="text-left py-2 px-3 font-medium text-muted-foreground">Month</th>
                          <th className="text-right py-2 px-3 font-medium text-muted-foreground">Avg Price</th>
                          <th className="text-right py-2 px-3 font-medium text-muted-foreground">Min</th>
                          <th className="text-right py-2 px-3 font-medium text-muted-foreground">Max</th>
                          <th className="text-right py-2 px-3 font-medium text-muted-foreground">Entries</th>
                        </tr>
                      </thead>
                      <tbody>
                        {analytics.trends.map((t, i) => (
                          <tr key={i} className="border-b last:border-0 hover:bg-stone-50 dark:hover:bg-stone-900/20">
                            <td className="py-2 px-3 font-medium">{t.month}</td>
                            <td className="py-2 px-3 text-right font-bold">{`${CURRENCY_SYMBOL}${t.avgPrice.toFixed(2)}`}</td>
                            <td className="py-2 px-3 text-right text-emerald-600">{`${CURRENCY_SYMBOL}${t.minPrice.toFixed(2)}`}</td>
                            <td className="py-2 px-3 text-right text-red-600">{`${CURRENCY_SYMBOL}${t.maxPrice.toFixed(2)}`}</td>
                            <td className="py-2 px-3 text-right text-muted-foreground">{t.entries}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                  {/* Mobile card view */}
                  <div className="md:hidden divide-y">
                    {analytics.trends.map((t, i) => (
                      <div key={i} className="mobile-card p-4 space-y-2">
                        <span className="font-semibold text-sm">{t.month}</span>
                        <div className="grid grid-cols-2 gap-2 text-sm">
                          <div>
                            <p className="text-xs text-muted-foreground">Avg Price</p>
                            <p className="font-semibold">{`${CURRENCY_SYMBOL}${t.avgPrice.toFixed(2)}`}</p>
                          </div>
                          <div>
                            <p className="text-xs text-muted-foreground">Min</p>
                            <p className="font-semibold text-emerald-600">{`${CURRENCY_SYMBOL}${t.minPrice.toFixed(2)}`}</p>
                          </div>
                          <div>
                            <p className="text-xs text-muted-foreground">Max</p>
                            <p className="font-semibold text-red-600">{`${CURRENCY_SYMBOL}${t.maxPrice.toFixed(2)}`}</p>
                          </div>
                          <div>
                            <p className="text-xs text-muted-foreground">Entries</p>
                            <p className="font-semibold">{t.entries}</p>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                </>
              ) : (
                <div className="py-12 text-center text-muted-foreground">
                  <BarChart3 className="h-10 w-10 mx-auto mb-3 opacity-30" />
                  <p>No price trend data available yet.</p>
                  <p className="text-xs">Add fuel prices to stations to see trends.</p>
                </div>
              )}
            </CardContent>
          </Card>

          {/* Cheapest Stations */}
          {analytics?.cheapest && analytics.cheapest.length > 0 && (
            <Card className="mt-4">
              <CardHeader className="pb-3">
                <CardTitle className="text-base">Top 10 Cheapest Diesel Stations</CardTitle>
              </CardHeader>
              <CardContent>
                <>
                  <div className="hidden md:block overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="border-b">
                          <th className="text-left py-2 px-3 font-medium text-muted-foreground">#</th>
                          <th className="text-left py-2 px-3 font-medium text-muted-foreground">Station</th>
                          <th className="text-left py-2 px-3 font-medium text-muted-foreground">Brand</th>
                          <th className="text-left py-2 px-3 font-medium text-muted-foreground">City</th>
                          <th className="text-right py-2 px-3 font-medium text-muted-foreground">Price/L</th>
                        </tr>
                      </thead>
                      <tbody>
                        {analytics.cheapest.map((p, i) => (
                          <tr key={i} className="border-b last:border-0 hover:bg-stone-50 dark:hover:bg-stone-900/20">
                            <td className="py-2 px-3 text-muted-foreground">{i + 1}</td>
                            <td className="py-2 px-3 font-medium">{p.fuelStation?.name || 'Unknown'}</td>
                            <td className="py-2 px-3">
                              <Badge variant="outline" className="text-xs">{p.fuelStation?.brand}</Badge>
                            </td>
                            <td className="py-2 px-3 text-muted-foreground">{p.fuelStation?.city || '--'}</td>
                            <td className="py-2 px-3 text-right font-bold text-emerald-600">{`${CURRENCY_SYMBOL}${p.pricePerLiter.toFixed(2)}`}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                  {/* Mobile card view */}
                  <div className="md:hidden divide-y">
                    {analytics.cheapest.map((p, i) => (
                      <div key={i} className="mobile-card p-4 space-y-2">
                        <div className="flex items-center justify-between">
                          <div>
                            <span className="text-xs text-muted-foreground">#{i + 1}</span>
                            <p className="font-semibold text-sm">{p.fuelStation?.name || 'Unknown'}</p>
                          </div>
                          <span className="font-semibold text-emerald-600">{`${CURRENCY_SYMBOL}${p.pricePerLiter.toFixed(2)}/L`}</span>
                        </div>
                        <div className="flex items-center gap-2 text-xs text-muted-foreground">
                          <Badge variant="outline" className="text-[10px]">{p.fuelStation?.brand}</Badge>
                          <span>{p.fuelStation?.city || '--'}</span>
                        </div>
                      </div>
                    ))}
                  </div>
                </>
              </CardContent>
            </Card>
          )}
        </TabsContent>

        {/* Tab 3: Savings Calculator */}
        <TabsContent value="savings">
          <div className="grid md:grid-cols-2 gap-6">
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-base flex items-center gap-2"><Calculator className="h-5 w-5" /> Savings Calculator</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="space-y-2">
                  <Label>Monthly Fuel Consumption (liters)</Label>
                  <Input type="number" value={calcLiters} onChange={e => setCalcLiters(Number(e.target.value) || 0)} min={0} />
                </div>
                <div className="space-y-2">
                  <Label>Current Average Diesel Price ({CURRENCY_SYMBOL}/L)</Label>
                  <Input type="number" value={calcCurrentPrice} onChange={e => setCalcCurrentPrice(Number(e.target.value) || 0)} step="0.01" min={0} />
                  <p className="text-xs text-muted-foreground">Set this to your fleet&apos;s current average fuel price</p>
                </div>
                <Separator />
                <div className="bg-emerald-50 dark:bg-emerald-900/20 rounded-lg p-4 space-y-2">
                  <div className="flex justify-between text-sm">
                    <span className="text-muted-foreground">Cheapest available price</span>
                    <span className="font-bold text-emerald-600">{`${CURRENCY_SYMBOL}${cheapestPrice.toFixed(2)}/L`}</span>
                  </div>
                  <div className="flex justify-between text-sm">
                    <span className="text-muted-foreground">Price difference</span>
                    <span className="font-medium">{calcCurrentPrice > cheapestPrice ? `${CURRENCY_SYMBOL}${(calcCurrentPrice - cheapestPrice).toFixed(2)}/L` : 'N/A'}</span>
                  </div>
                  <Separator />
                  <div className="flex justify-between">
                    <span className="font-medium">Monthly Savings</span>
                    <span className={`text-xl font-bold ${monthlySavings > 0 ? 'text-emerald-600' : 'text-muted-foreground'}`}>
                      {monthlySavings > 0 ? `${CURRENCY_SYMBOL}${monthlySavings.toLocaleString('en-GH', { minimumFractionDigits: 2 })}` : `${CURRENCY_SYMBOL}0.00`}
                    </span>
                  </div>
                  <div className="flex justify-between text-sm">
                    <span className="text-muted-foreground">Annual Savings</span>
                    <span className="font-bold text-emerald-600">
                      {monthlySavings > 0 ? `${CURRENCY_SYMBOL}${(monthlySavings * 12).toLocaleString('en-GH', { minimumFractionDigits: 2 })}` : `${CURRENCY_SYMBOL}0.00`}
                    </span>
                  </div>
                </div>
              </CardContent>
            </Card>
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-base flex items-center gap-2"><TrendingDown className="h-5 w-5" /> How Savings Are Calculated</CardTitle>
              </CardHeader>
              <CardContent className="text-sm text-muted-foreground space-y-3">
                <div className="bg-stone-50 dark:bg-stone-900/30 rounded-lg p-4 font-mono text-xs space-y-1">
                  <p>Monthly Savings = ({CURRENCY_SYMBOL}X - {CURRENCY_SYMBOL}Y) x Liters</p>
                  <p className="text-muted-foreground">Where X = current price, Y = cheapest price</p>
                </div>
                <p><strong className="text-foreground">Tip:</strong> Switching to the cheapest station can save your fleet significantly. Consider factors like route proximity and HGV availability when choosing stations.</p>
                <p><strong className="text-foreground">Corporate Rates:</strong> Some stations offer negotiated corporate rates. Add corporate rate data to stations for more accurate calculations.</p>
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        {/* Tab 4: Brand Comparison */}
        <TabsContent value="brands">
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base">Brand Comparison — Diesel Prices</CardTitle>
            </CardHeader>
            <CardContent>
              {brandComparison.length > 0 ? (
                <>
                  <div className="hidden md:block overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="border-b">
                          <th className="text-left py-2 px-3 font-medium text-muted-foreground">Brand</th>
                          <th className="text-right py-2 px-3 font-medium text-muted-foreground">Avg Diesel</th>
                          <th className="text-right py-2 px-3 font-medium text-muted-foreground">Min Price</th>
                          <th className="text-right py-2 px-3 font-medium text-muted-foreground">Max Price</th>
                          <th className="text-right py-2 px-3 font-medium text-muted-foreground">Stations</th>
                        </tr>
                      </thead>
                      <tbody>
                        {brandComparison.map((b, i) => {
                          const isCheapest = i === 0
                          return (
                            <tr key={b.brand} className={`border-b last:border-0 hover:bg-stone-50 dark:hover:bg-stone-900/20 ${isCheapest ? 'bg-emerald-50/50 dark:bg-emerald-900/10' : ''}`}>
                              <td className="py-2 px-3">
                                <div className="flex items-center gap-2">
                                  <span className="font-semibold">{b.brand}</span>
                                  {isCheapest && <Badge className="bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400 text-[10px] px-1.5">Best Price</Badge>}
                                </div>
                              </td>
                              <td className="py-2 px-3 text-right font-bold">{`${CURRENCY_SYMBOL}${b.avgPrice.toFixed(2)}`}</td>
                              <td className="py-2 px-3 text-right text-emerald-600">{`${CURRENCY_SYMBOL}${b.minPrice.toFixed(2)}`}</td>
                              <td className="py-2 px-3 text-right text-red-600">{`${CURRENCY_SYMBOL}${b.maxPrice.toFixed(2)}`}</td>
                              <td className="py-2 px-3 text-right text-muted-foreground">{b.stationCount}</td>
                            </tr>
                          )
                        })}
                      </tbody>
                    </table>
                  </div>
                  {/* Mobile card view */}
                  <div className="md:hidden divide-y">
                    {brandComparison.map((b, i) => {
                      const isCheapest = i === 0
                      return (
                        <div key={b.brand} className={`mobile-card p-4 space-y-2 ${isCheapest ? 'bg-emerald-50/50 dark:bg-emerald-900/10' : ''}`}>
                          <div className="flex items-center justify-between">
                            <div className="flex items-center gap-2">
                              <span className="font-semibold text-sm">{b.brand}</span>
                              {isCheapest && <Badge className="bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400 text-[10px] px-1.5">Best Price</Badge>}
                            </div>
                            <span className="font-semibold text-sm">{b.stationCount} stations</span>
                          </div>
                          <div className="grid grid-cols-3 gap-2 text-sm">
                            <div>
                              <p className="text-xs text-muted-foreground">Avg</p>
                              <p className="font-semibold">{`${CURRENCY_SYMBOL}${b.avgPrice.toFixed(2)}`}</p>
                            </div>
                            <div>
                              <p className="text-xs text-muted-foreground">Min</p>
                              <p className="font-semibold text-emerald-600">{`${CURRENCY_SYMBOL}${b.minPrice.toFixed(2)}`}</p>
                            </div>
                            <div>
                              <p className="text-xs text-muted-foreground">Max</p>
                              <p className="font-semibold text-red-600">{`${CURRENCY_SYMBOL}${b.maxPrice.toFixed(2)}`}</p>
                            </div>
                          </div>
                        </div>
                      )
                    })}
                  </div>
                </>
              ) : (
                <div className="py-12 text-center text-muted-foreground">
                  <Building2 className="h-10 w-10 mx-auto mb-3 opacity-30" />
                  <p>No brand comparison data available yet.</p>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  )
}

// ============ LIVE PRICE REVIEW ============

function LivePriceReview({
  data,
  loading,
  applying,
  selectedBrands,
  onToggleBrand,
  onSelectAll,
  onDeselectAll,
  onApply,
  onRetry,
}: {
  data: { lastUpdated: string; source: string; prices: Record<string, number>; brandPrices: { brand: string; petrol?: number; diesel?: number }[] } | null
  loading: boolean
  applying: boolean
  selectedBrands: Set<string>
  onToggleBrand: (brand: string) => void
  onSelectAll: () => void
  onDeselectAll: () => void
  onApply: () => void
  onRetry: () => void
}) {
  if (loading) {
    return (
      <>
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2"><Globe className="h-5 w-5" /> Fetching Live Prices...</DialogTitle>
        </DialogHeader>
        <DialogBody className="flex items-center justify-center py-12">
          <div className="text-center space-y-3">
            <Loader2 className="h-8 w-8 animate-spin text-amber-500 mx-auto" />
            <p className="text-sm text-muted-foreground">Fetching current fuel prices from NPA Ghana...</p>
          </div>
        </DialogBody>
      </>
    )
  }

  if (!data) {
    return (
      <>
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2"><AlertTriangle className="h-5 w-5 text-amber-500" /> Failed to Fetch</DialogTitle>
        </DialogHeader>
        <DialogBody className="py-8 text-center space-y-4">
          <p className="text-sm text-muted-foreground">Could not retrieve live prices. This may be due to a network issue.</p>
          <Button variant="outline" onClick={onRetry}><RefreshCw className="h-4 w-4 mr-1" /> Try Again</Button>
        </DialogBody>
      </>
    )
  }

  return (
    <>
      <DialogHeader>
        <DialogTitle className="flex items-center gap-2"><Globe className="h-5 w-5" /> Live Fuel Prices</DialogTitle>
      </DialogHeader>
      <DialogBody className="space-y-4 py-2">
        {/* Source info */}
        <div className="bg-amber-50 dark:bg-amber-900/20 rounded-lg p-3 space-y-1">
          <div className="flex items-center gap-2">
            <Badge variant="outline" className="text-[10px]"><Globe className="h-3 w-3 mr-1" />{data.source}</Badge>
            <span className="text-[10px] text-muted-foreground">Updated: {new Date(data.lastUpdated).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' })}</span>
          </div>
        </div>

        {/* Indicative prices */}
        <div className="grid grid-cols-2 gap-2">
          {Object.entries(data.prices).filter(([k]) => ['Diesel', 'Petrol', 'LPG'].includes(k)).map(([type, price]) => (
            <div key={type} className="bg-stone-50 dark:bg-stone-900/30 rounded-lg p-2.5 text-center">
              <p className="text-[10px] uppercase font-medium text-muted-foreground">{type}</p>
              <p className="text-lg font-bold">{CURRENCY_SYMBOL}{price.toFixed(2)}<span className="text-xs font-normal text-muted-foreground">/L</span></p>
            </div>
          ))}
        </div>

        <Separator />

        {/* Brand prices with selection */}
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <p className="text-xs font-medium text-muted-foreground">Brand Prices — select to apply</p>
            <div className="flex gap-1">
              <Button variant="ghost" size="sm" className="text-[10px] h-6 px-2" onClick={onSelectAll}>Select all</Button>
              <Button variant="ghost" size="sm" className="text-[10px] h-6 px-2" onClick={onDeselectAll}>Clear</Button>
            </div>
          </div>
          <div className="max-h-48 overflow-y-auto rounded-lg border divide-y">
            {data.brandPrices.map(bp => (
              <label key={bp.brand} className="flex items-center gap-3 px-3 py-2 hover:bg-stone-50 dark:hover:bg-stone-900/20 cursor-pointer">
                <Checkbox
                  checked={selectedBrands.has(bp.brand)}
                  onCheckedChange={() => onToggleBrand(bp.brand)}
                />
                <span className="text-sm font-medium flex-1">{bp.brand}</span>
                <span className="text-xs text-muted-foreground">{bp.petrol ? `${CURRENCY_SYMBOL}${bp.petrol.toFixed(2)}` : '--'}</span>
                <span className="text-[10px] text-muted-foreground">P</span>
                <span className="text-xs font-medium">{bp.diesel ? `${CURRENCY_SYMBOL}${bp.diesel.toFixed(2)}` : '--'}</span>
                <span className="text-[10px] text-muted-foreground">D</span>
              </label>
            ))}
          </div>
        </div>

        <div className="bg-blue-50 dark:bg-blue-900/20 rounded-lg p-3">
          <p className="text-[11px] text-muted-foreground flex items-start gap-1.5">
            <AlertTriangle className="h-3.5 w-3.5 mt-0.5 shrink-0 text-blue-500" />
            Applying live prices will create new price entries for all stations matching the selected brands. Prices marked as unverified and should be confirmed by your team.
          </p>
        </div>
      </DialogBody>
      <DialogFooter className="pt-2">
        <DialogClose asChild><Button variant="outline">Cancel</Button></DialogClose>
        <Button onClick={onApply} disabled={applying || selectedBrands.size === 0}>
          {applying ? <Loader2 className="h-4 w-4 mr-1 animate-spin" /> : <CheckCircle2 className="h-4 w-4 mr-1" />}
          Apply {selectedBrands.size > 0 ? `(${selectedBrands.size})` : ''}
        </Button>
      </DialogFooter>
    </>
  )
}

// ============ ADD STATION FORM ============

function AddStationForm({ onSubmit, loading }: { onSubmit: (data: Record<string, unknown>) => void; loading: boolean }) {
  const [form, setForm] = useState({
    name: '', brand: '', stationCode: '', address: '', city: '', region: '',
    latitude: '', longitude: '', route: '', phone: '', email: '', operatingHours: '',
    hasCardPayment: false, hasLoyaltyProgram: false, hasHGV: true, hasAdBlue: false, hasWorkshop: false,
    corporateRatePerLiter: '', notes: ''
  })

  const handleSubmit = () => {
    if (!form.name.trim() || !form.brand.trim()) {
      toast.error('Station name and brand are required')
      return
    }
    onSubmit({
      ...form,
      latitude: form.latitude ? parseFloat(form.latitude) : null,
      longitude: form.longitude ? parseFloat(form.longitude) : null,
      corporateRatePerLiter: form.corporateRatePerLiter ? parseFloat(form.corporateRatePerLiter) : null,
    })
  }

  return (
    <>
      <DialogHeader>
        <DialogTitle>Add Fuel Station</DialogTitle>
      </DialogHeader>
      <DialogBody className="grid gap-3 py-2">
        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-1.5">
            <Label className="text-xs">Station Name *</Label>
            <Input placeholder="e.g. GOIL Accra Central" value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} />
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs">Brand *</Label>
            <Select value={form.brand} onValueChange={v => setForm(f => ({ ...f, brand: v }))}>
              <SelectTrigger><SelectValue placeholder="Select brand" /></SelectTrigger>
              <SelectContent>{GHANA_FUEL_BRANDS.map(b => <SelectItem key={b} value={b}>{b}</SelectItem>)}</SelectContent>
            </Select>
          </div>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-1.5">
            <Label className="text-xs">Station Code</Label>
            <Input placeholder="Optional unique code" value={form.stationCode} onChange={e => setForm(f => ({ ...f, stationCode: e.target.value }))} />
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs">Route</Label>
            <Select value={form.route} onValueChange={v => setForm(f => ({ ...f, route: v }))}>
              <SelectTrigger><SelectValue placeholder="Select route" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="__none__">None</SelectItem>
                {COMMON_ROUTES.map(r => <SelectItem key={r} value={r}>{r}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
        </div>
        <div className="grid grid-cols-3 gap-3">
          <div className="space-y-1.5">
            <Label className="text-xs">City</Label>
            <Input placeholder="e.g. Accra" value={form.city} onChange={e => setForm(f => ({ ...f, city: e.target.value }))} />
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs">Region</Label>
            <Input placeholder="e.g. Greater Accra" value={form.region} onChange={e => setForm(f => ({ ...f, region: e.target.value }))} />
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs">Phone</Label>
            <Input placeholder="+233..." value={form.phone} onChange={e => setForm(f => ({ ...f, phone: e.target.value }))} />
          </div>
        </div>
        <div className="space-y-1.5">
          <Label className="text-xs">Address</Label>
          <Input placeholder="Full street address" value={form.address} onChange={e => setForm(f => ({ ...f, address: e.target.value }))} />
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-1.5">
            <Label className="text-xs">Latitude</Label>
            <Input type="number" step="0.0001" placeholder="5.6037" value={form.latitude} onChange={e => setForm(f => ({ ...f, latitude: e.target.value }))} />
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs">Longitude</Label>
            <Input type="number" step="0.0001" placeholder="-0.1870" value={form.longitude} onChange={e => setForm(f => ({ ...f, longitude: e.target.value }))} />
          </div>
        </div>
        <div className="space-y-1.5">
          <Label className="text-xs">Corporate Rate (GHS/L)</Label>
          <Input type="number" step="0.01" placeholder="Negotiated rate" value={form.corporateRatePerLiter} onChange={e => setForm(f => ({ ...f, corporateRatePerLiter: e.target.value }))} />
        </div>
        <div className="space-y-1.5">
          <Label className="text-xs flex items-center gap-2">Services</Label>
          <div className="flex flex-wrap gap-4">
            {([['hasHGV', 'HGV Pumps'], ['hasCardPayment', 'Card Payment'], ['hasLoyaltyProgram', 'Loyalty Program'], ['hasAdBlue', 'AdBlue'], ['hasWorkshop', 'Workshop']] as const).map(([key, label]) => (
              <label key={key} className="flex items-center gap-2 cursor-pointer">
                <Checkbox checked={form[key] as boolean} onCheckedChange={v => setForm(f => ({ ...f, [key]: v }))} />
                <span className="text-sm">{label}</span>
              </label>
            ))}
          </div>
        </div>
        <div className="space-y-1.5">
          <Label className="text-xs">Operating Hours</Label>
          <Input placeholder="e.g. 6:00 AM - 10:00 PM" value={form.operatingHours} onChange={e => setForm(f => ({ ...f, operatingHours: e.target.value }))} />
        </div>
        <div className="space-y-1.5">
          <Label className="text-xs">Notes</Label>
          <Textarea placeholder="Any additional notes..." value={form.notes} onChange={e => setForm(f => ({ ...f, notes: e.target.value }))} rows={2} />
        </div>
      </DialogBody>
      <DialogFooter className="pt-2">
        <DialogClose asChild><Button variant="outline">Cancel</Button></DialogClose>
        <Button onClick={handleSubmit} disabled={loading}>
          {loading && <Loader2 className="h-4 w-4 mr-1 animate-spin" />}
          Add Station
        </Button>
      </DialogFooter>
    </>
  )
}

// ============ UPDATE PRICE FORM ============

function UpdatePriceForm({ station, onSubmit, loading }: { station: FuelStation; onSubmit: (data: { stationId: string; fuelType: string; pricePerLiter: number; effectiveDate?: string; source?: string; notes?: string }) => void; loading: boolean }) {
  const [fuelType, setFuelType] = useState('Diesel')
  const [price, setPrice] = useState('')
  const [date, setDate] = useState(new Date().toISOString().split('T')[0])
  const [source, setSource] = useState('manual')
  const [notes, setNotes] = useState('')

  const handleSubmit = () => {
    if (!price || parseFloat(price) <= 0) {
      toast.error('Please enter a valid price')
      return
    }
    onSubmit({
      stationId: station.id,
      fuelType,
      pricePerLiter: parseFloat(price),
      effectiveDate: date,
      source,
      notes: notes || undefined,
    })
  }

  return (
    <>
      <DialogHeader>
        <DialogTitle>Update Fuel Price</DialogTitle>
      </DialogHeader>
      <DialogBody className="py-2 space-y-4">
        <div className="bg-stone-50 dark:bg-stone-900/30 rounded-lg p-3">
          <p className="font-semibold text-sm">{station.name}</p>
          <p className="text-xs text-muted-foreground">{station.brand} · {station.city || station.route || 'Ghana'}</p>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-1.5">
            <Label className="text-xs">Fuel Type</Label>
            <Select value={fuelType} onValueChange={setFuelType}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>{FUEL_TYPES.map(t => <SelectItem key={t} value={t}>{t}</SelectItem>)}</SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs">Price per Liter (GHS)</Label>
            <Input type="number" step="0.01" placeholder="0.00" value={price} onChange={e => setPrice(e.target.value)} />
          </div>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-1.5">
            <Label className="text-xs">Effective Date</Label>
            <DatePicker value={date} onChange={(val) => setDate(val)} />
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs">Source</Label>
            <Select value={source} onValueChange={setSource}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="manual">Manual Entry</SelectItem>
                <SelectItem value="npa">NPA (National Petroleum Authority)</SelectItem>
                <SelectItem value="scraped">Web Scraped</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>
        <div className="space-y-1.5">
          <Label className="text-xs">Notes</Label>
          <Textarea placeholder="Any notes..." value={notes} onChange={e => setNotes(e.target.value)} rows={2} />
        </div>
      </DialogBody>
      <DialogFooter className="pt-2">
        <DialogClose asChild><Button variant="outline">Cancel</Button></DialogClose>
        <Button onClick={handleSubmit} disabled={loading}>
          {loading && <Loader2 className="h-4 w-4 mr-1 animate-spin" />}
          Update Price
        </Button>
      </DialogFooter>
    </>
  )
}

// ============ STATION DETAIL PANEL ============

function StationDetailPanel({ station, onDelete, onRefresh }: { station: FuelStation; onDelete: () => void; onRefresh: () => void }) {
  return (
    <>
      <DialogHeader>
        <DialogTitle className="flex items-center gap-2">{station.name}</DialogTitle>
      </DialogHeader>
      <div className="space-y-4 max-h-[60vh] overflow-y-auto pr-1">
        <div className="flex items-center gap-2">
          <Badge className="bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400">{station.brand}</Badge>
          {station.stationCode && <Badge variant="outline">{station.stationCode}</Badge>}
          {!station.isActive && <Badge variant="destructive">Inactive</Badge>}
          {station.rating && <div className="flex items-center gap-1 text-sm"><Star className="h-4 w-4 fill-amber-400 text-amber-400" />{station.rating.toFixed(1)} <span className="text-muted-foreground">({station.totalRatings})</span></div>}
        </div>

        <Separator />

        <div className="grid grid-cols-2 gap-4 text-sm">
          <div className="space-y-1">
            <p className="text-xs text-muted-foreground flex items-center gap-1"><MapPin className="h-3 w-3" />Location</p>
            <p>{station.city || '--'}{station.city && station.region ? `, ${station.region}` : ''}</p>
          </div>
          <div className="space-y-1">
            <p className="text-xs text-muted-foreground flex items-center gap-1"><Navigation className="h-3 w-3" />Route</p>
            <p>{station.route || '--'}</p>
          </div>
          <div className="space-y-1">
            <p className="text-xs text-muted-foreground flex items-center gap-1"><Phone className="h-3 w-3" />Phone</p>
            <p>{station.phone || '--'}</p>
          </div>
          <div className="space-y-1">
            <p className="text-xs text-muted-foreground flex items-center gap-1"><Clock className="h-3 w-3" />Hours</p>
            <p>{station.operatingHours || '--'}</p>
          </div>
        </div>

        {station.address && (
          <div className="text-sm">
            <p className="text-xs text-muted-foreground mb-1">Address</p>
            <p>{station.address}</p>
          </div>
        )}

        {station.corporateRatePerLiter && (
          <div className="bg-amber-50 dark:bg-amber-900/20 rounded-lg p-3">
            <p className="text-xs text-muted-foreground">Corporate Rate</p>
            <p className="text-lg font-bold text-amber-700 dark:text-amber-400">{`${CURRENCY_SYMBOL}${station.corporateRatePerLiter.toFixed(2)}`}/L</p>
          </div>
        )}

        <div>
          <p className="text-xs text-muted-foreground mb-2">Services</p>
          <div className="flex flex-wrap gap-2">
            {station.hasHGV && <Badge variant="secondary"><Truck className="h-3 w-3 mr-1" />HGV</Badge>}
            {station.hasCardPayment && <Badge variant="secondary"><CreditCard className="h-3 w-3 mr-1" />Card</Badge>}
            {station.hasLoyaltyProgram && <Badge variant="secondary"><Award className="h-3 w-3 mr-1" />Loyalty</Badge>}
            {station.hasAdBlue && <Badge variant="secondary"><Droplets className="h-3 w-3 mr-1" />AdBlue</Badge>}
            {station.hasWorkshop && <Badge variant="secondary"><Wrench className="h-3 w-3 mr-1" />Workshop</Badge>}
          </div>
        </div>

        {/* Price History */}
        {station.fuelPrices && station.fuelPrices.length > 0 && (
          <div>
            <p className="text-xs text-muted-foreground mb-2">Price History</p>
            <div className="space-y-1">
              {station.fuelPrices.slice(0, 5).map(p => (
                <div key={p.id} className="flex items-center justify-between text-sm bg-stone-50 dark:bg-stone-900/20 rounded px-3 py-1.5">
                  <div className="flex items-center gap-2">
                    <Badge variant="outline" className="text-xs">{p.fuelType}</Badge>
                    <span className="text-xs text-muted-foreground">{new Date(p.effectiveDate).toLocaleDateString()}</span>
                  </div>
                  <span className="font-bold">{`${CURRENCY_SYMBOL}${p.pricePerLiter.toFixed(2)}`}</span>
                </div>
              ))}
            </div>
          </div>
        )}

        {station.notes && (
          <div>
            <p className="text-xs text-muted-foreground mb-1">Notes</p>
            <p className="text-sm text-muted-foreground">{station.notes}</p>
          </div>
        )}

        {station.latitude && station.longitude && (
          <div className="text-center">
            <Button variant="outline" size="sm" asChild>
              <a href={`https://www.google.com/maps?q=${station.latitude},${station.longitude}`} target="_blank" rel="noopener noreferrer">
                <Navigation className="h-4 w-4 mr-1" /> Open in Google Maps
              </a>
            </Button>
          </div>
        )}
      </div>
      <DialogFooter className="pt-2 justify-between">
        <Button variant="destructive" size="sm" onClick={onDelete}>Delete Station</Button>
        <DialogClose asChild><Button variant="outline">Close</Button></DialogClose>
      </DialogFooter>
    </>
  )
}
