'use client'

import * as React from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { Settings, Truck, Phone, Cpu, Clock, MapPin, Play, Pause, Search, X } from 'lucide-react'
import {
  Dialog, DialogBody, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Switch } from '@/components/ui/switch'
import { Badge } from '@/components/ui/badge'
import { Skeleton } from '@/components/ui/skeleton'
import { ScrollArea } from '@/components/ui/scroll-area'
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select'
import { toast } from 'sonner'
import { useAuthStore } from '@/lib/store/auth'
import {
  fetchTrackingConfigs,
  updateTrackingConfig,
  type TrackingConfig,
} from '@/lib/api'

interface TrackingSettingsDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
}

const INTERVAL_OPTIONS = [
  { value: '5', label: '5 seconds' },
  { value: '10', label: '10 seconds' },
  { value: '30', label: '30 seconds' },
  { value: '60', label: '60 seconds' },
]

const GEOFENCE_RADIUS_OPTIONS = [
  { value: '200', label: '200m' },
  { value: '500', label: '500m' },
  { value: '1000', label: '1 km' },
  { value: '2000', label: '2 km' },
]

const MODE_FILTERS = [
  { value: 'all', label: 'All' },
  { value: 'both', label: 'Both' },
  { value: 'phone', label: 'Phone' },
  { value: 'hardware', label: 'Hardware' },
  { value: 'none', label: 'None' },
] as const

const STATUS_FILTERS = [
  { value: 'all', label: 'All' },
  { value: 'active', label: 'Active' },
  { value: 'paused', label: 'Paused' },
] as const

export function TrackingSettingsDialog({ open, onOpenChange }: TrackingSettingsDialogProps) {
  const [configs, setConfigs] = React.useState<TrackingConfig[]>([])
  const [loading, setLoading] = React.useState(false)
  const [updatingId, setUpdatingId] = React.useState<string | null>(null)
  const [search, setSearch] = React.useState('')
  const [modeFilter, setModeFilter] = React.useState<string>('all')
  const [statusFilter, setStatusFilter] = React.useState<string>('all')

  const { user } = useAuthStore()

  const loadConfigs = React.useCallback(async () => {
    setLoading(true)
    setSearch('')
    setModeFilter('all')
    setStatusFilter('all')
    try {
      const driverId = user?.role === 'Driver' && user.driverId ? user.driverId : undefined
      const url = driverId
        ? `/api/tracking/config?driverId=${driverId}`
        : '/api/tracking/config'
      const res = await fetch(url)
      if (!res.ok) throw new Error('Failed to fetch')
      const data: TrackingConfig[] = await res.json()
      setConfigs(data)
    } catch (err) {
      toast.error('Failed to load tracking configurations')
    } finally {
      setLoading(false)
    }
  }, [user])

  React.useEffect(() => {
    if (open) {
      loadConfigs()
    }
  }, [open, loadConfigs])

  async function handleUpdateConfig(
    config: TrackingConfig,
    field: string,
    value: boolean | number
  ) {
    setUpdatingId(config.id)
    try {
      await updateTrackingConfig({
        truckId: config.truckId,
        [field]: value,
      })
      setConfigs(prev =>
        prev.map(c => c.id === config.id ? { ...c, [field]: value } : c)
      )
      toast.success(`Updated ${config.truck.plateNumber} tracking setting`)
    } catch (err) {
      toast.error('Failed to update tracking configuration')
    } finally {
      setUpdatingId(null)
    }
  }

  // Filtered configs
  const filteredConfigs = React.useMemo(() => {
    const q = search.trim().toLowerCase()
    return configs.filter(c => {
      const plate = c.truck.plateNumber.toLowerCase()
      const makeModel = `${c.truck.make} ${c.truck.model}`.toLowerCase()
      const driver = c.truck.driver
        ? `${c.truck.driver.firstName} ${c.truck.driver.lastName}`.toLowerCase()
        : ''
      if (q && !plate.includes(q) && !makeModel.includes(q) && !driver.includes(q)) return false
      if (modeFilter === 'both' && !(c.enablePhoneGps && c.enableHardware)) return false
      if (modeFilter === 'phone' && !c.enablePhoneGps) return false
      if (modeFilter === 'hardware' && !c.enableHardware) return false
      if (modeFilter === 'none' && (c.enablePhoneGps || c.enableHardware)) return false
      if (statusFilter === 'active' && !c.isActive) return false
      if (statusFilter === 'paused' && c.isActive) return false
      return true
    })
  }, [configs, search, modeFilter, statusFilter])

  // Mode counts for filter badges
  const modeCounts = React.useMemo(() => ({
    both: configs.filter(c => c.enablePhoneGps && c.enableHardware).length,
    phone: configs.filter(c => c.enablePhoneGps && !c.enableHardware).length,
    hardware: configs.filter(c => !c.enablePhoneGps && c.enableHardware).length,
    none: configs.filter(c => !c.enablePhoneGps && !c.enableHardware).length,
  }), [configs])

  const hasActiveFilters = search || modeFilter !== 'all' || statusFilter !== 'all'

  const clearFilters = React.useCallback(() => {
    setSearch('')
    setModeFilter('all')
    setStatusFilter('all')
  }, [])

  function getTrackingMode(config: TrackingConfig): { label: string; className: string } {
    if (config.enablePhoneGps && config.enableHardware) {
      return { label: 'Both', className: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400' }
    }
    if (config.enablePhoneGps) {
      return { label: 'Phone', className: 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400' }
    }
    if (config.enableHardware) {
      return { label: 'Hardware', className: 'bg-sky-100 text-sky-700 dark:bg-sky-900/30 dark:text-sky-400' }
    }
    return { label: 'None', className: 'bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-400' }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-3xl p-0">
        {/* Header */}
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Settings className="h-5 w-5 text-amber-500" />
            Tracking Settings
            {!loading && (
              <span className="text-sm font-normal text-muted-foreground">
                ({configs.length} trucks)
              </span>
            )}
          </DialogTitle>
          <DialogDescription>
            Configure GPS tracking for each truck. Changes take effect immediately.
          </DialogDescription>
        </DialogHeader>

        {/* Search + Filters */}
        <DialogBody className="space-y-2">
          {/* Search bar */}
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Search by plate number, make, model, or driver..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-9 pr-9 h-9 text-sm"
            />
            {search && (
              <button
                onClick={() => setSearch('')}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors"
              >
                <X className="h-4 w-4" />
              </button>
            )}
          </div>

          {/* Filter chips */}
          <div className="flex flex-wrap items-center gap-1.5">
            <span className="text-[11px] text-muted-foreground font-medium uppercase tracking-wide mr-0.5">Mode</span>
            {MODE_FILTERS.map(({ value, label }) => (
              <button
                key={value}
                onClick={() => setModeFilter(value)}
                className={`text-xs px-2.5 py-1 rounded-full border transition-colors ${
                  modeFilter === value
                    ? 'bg-amber-100 text-amber-700 border-amber-200 dark:bg-amber-900/30 dark:text-amber-400 dark:border-amber-800'
                    : 'border-transparent text-muted-foreground hover:bg-muted'
                }`}
              >
                {label}
                {value !== 'all' && modeCounts[value as keyof typeof modeCounts] > 0
                  ? ` (${modeCounts[value as keyof typeof modeCounts]})`
                  : ''}
              </button>
            ))}
            <span className="text-muted-foreground mx-1 opacity-30">|</span>
            <span className="text-[11px] text-muted-foreground font-medium uppercase tracking-wide mr-0.5">Status</span>
            {STATUS_FILTERS.map(({ value, label }) => (
              <button
                key={value}
                onClick={() => setStatusFilter(value)}
                className={`text-xs px-2.5 py-1 rounded-full border transition-colors ${
                  statusFilter === value
                    ? 'bg-amber-100 text-amber-700 border-amber-200 dark:bg-amber-900/30 dark:text-amber-400 dark:border-amber-800'
                    : 'border-transparent text-muted-foreground hover:bg-muted'
                }`}
              >
                {label}
              </button>
            ))}
            {hasActiveFilters && (
              <button
                onClick={clearFilters}
                className="text-xs px-2.5 py-1 rounded-full text-red-600 hover:bg-red-50 dark:hover:bg-red-950/20 border border-red-200 dark:border-red-900/30 transition-colors font-medium"
              >
                Clear all
              </button>
            )}
          </div>
        </DialogBody>

        {/* Truck list */}
        <DialogBody>
          {loading ? (
            <div className="space-y-3 py-4">
              {Array.from({ length: 3 }).map((_, i) => (
                <Skeleton key={i} className="h-20 w-full rounded-lg" />
              ))}
            </div>
          ) : configs.length === 0 ? (
            <div className="py-12 text-center">
              <Truck className="h-8 w-8 text-muted-foreground mx-auto mb-2" />
              <p className="text-sm text-muted-foreground">No trucks configured for tracking</p>
            </div>
          ) : filteredConfigs.length === 0 ? (
            <div className="py-12 text-center">
              <Search className="h-8 w-8 text-muted-foreground mx-auto mb-2" />
              <p className="text-sm text-muted-foreground mb-1">No trucks match your search</p>
              <p className="text-xs text-muted-foreground mb-3">
                Showing 0 of {configs.length} trucks
              </p>
              <button
                onClick={clearFilters}
                className="text-xs text-amber-600 hover:text-amber-700 dark:text-amber-400 font-medium"
              >
                Clear all filters
              </button>
            </div>
          ) : (
            <div className="pb-4">
              {/* Result count */}
              <div className="py-2 mb-1">
                <span className="text-xs text-muted-foreground">
                  {hasActiveFilters
                    ? `Showing ${filteredConfigs.length} of ${configs.length} trucks`
                    : `${configs.length} truck${configs.length !== 1 ? 's' : ''}`}
                </span>
              </div>

              {/* Truck cards */}
              <AnimatePresence mode="popLayout">
                <div className="space-y-3">
                  {filteredConfigs.map(config => {
                    const mode = getTrackingMode(config)
                    const isUpdating = updatingId === config.id
                    const isFiltered = hasActiveFilters
                    // Highlight matching text in plate number
                    const plate = config.truck.plateNumber
                    const q = search.trim().toLowerCase()
                    let plateDisplay: React.ReactNode = plate
                    if (q && plate.toLowerCase().includes(q)) {
                      const idx = plate.toLowerCase().indexOf(q)
                      plateDisplay = (
                        <>
                          {plate.slice(0, idx)}
                          <span className="bg-amber-200 dark:bg-amber-800 text-amber-900 dark:text-amber-100 rounded px-0.5">
                            {plate.slice(idx, idx + q.length)}
                          </span>
                          {plate.slice(idx + q.length)}
                        </>
                      )
                    }

                    return (
                      <motion.div
                        key={config.id}
                        layout
                        initial={{ opacity: 0, y: 8 }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={{ opacity: 0, y: -8 }}
                        transition={{ duration: 0.15 }}
                        className="border rounded-lg p-4 space-y-3 hover:border-amber-200 dark:hover:border-amber-900/50 transition-colors"
                      >
                        {/* Truck header */}
                        <div className="flex items-center justify-between gap-2">
                          <div className="flex items-center gap-2 min-w-0">
                            <Truck className="h-4 w-4 text-amber-500 flex-shrink-0" />
                            <span className="font-semibold text-sm truncate">{plateDisplay}</span>
                            <span className="text-xs text-muted-foreground hidden sm:inline">
                              {config.truck.make} {config.truck.model}
                            </span>
                          </div>
                          <div className="flex items-center gap-2 flex-shrink-0">
                            <Badge variant="outline" className={`text-[10px] ${mode.className}`}>
                              {mode.label}
                            </Badge>
                            {config.isActive ? (
                              <Badge className="bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400 text-[10px] gap-1">
                                <Play className="h-2.5 w-2.5" /> Active
                              </Badge>
                            ) : (
                              <Badge className="bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-400 text-[10px] gap-1">
                                <Pause className="h-2.5 w-2.5" /> Paused
                              </Badge>
                            )}
                          </div>
                        </div>

                        {config.truck.driver && (
                          <p className="text-xs text-muted-foreground">
                            Driver: {config.truck.driver.firstName} {config.truck.driver.lastName}
                          </p>
                        )}

                        {/* Settings Grid */}
                        <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
                          {/* Phone GPS */}
                          <div className="flex items-center gap-2">
                            <Phone className="h-3.5 w-3.5 text-muted-foreground flex-shrink-0" />
                            <span className="text-xs text-muted-foreground flex-1">Phone GPS</span>
                            <Switch
                              checked={config.enablePhoneGps}
                              disabled={isUpdating}
                              onCheckedChange={(checked) =>
                                handleUpdateConfig(config, 'enablePhoneGps', checked)
                              }
                            />
                          </div>

                          {/* Hardware Tracker */}
                          <div className="flex items-center gap-2">
                            <Cpu className="h-3.5 w-3.5 text-muted-foreground flex-shrink-0" />
                            <span className="text-xs text-muted-foreground flex-1">Hardware</span>
                            <Switch
                              checked={config.enableHardware}
                              disabled={isUpdating}
                              onCheckedChange={(checked) =>
                                handleUpdateConfig(config, 'enableHardware', checked)
                              }
                            />
                          </div>

                          {/* Update Interval */}
                          <div className="flex items-center gap-1.5">
                            <Clock className="h-3.5 w-3.5 text-muted-foreground flex-shrink-0" />
                            <Select
                              value={String(config.updateInterval)}
                              disabled={isUpdating}
                              onValueChange={(val) =>
                                handleUpdateConfig(config, 'updateInterval', parseInt(val))
                              }
                            >
                              <SelectTrigger className="h-7 text-xs w-full" size="sm">
                                <SelectValue />
                              </SelectTrigger>
                              <SelectContent>
                                {INTERVAL_OPTIONS.map(opt => (
                                  <SelectItem key={opt.value} value={opt.value} className="text-xs">
                                    {opt.label}
                                  </SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                          </div>

                          {/* Geofence Radius */}
                          <div className="flex items-center gap-1.5">
                            <MapPin className="h-3.5 w-3.5 text-muted-foreground flex-shrink-0" />
                            <Select
                              value={String(config.geofenceRadius)}
                              disabled={isUpdating}
                              onValueChange={(val) =>
                                handleUpdateConfig(config, 'geofenceRadius', parseInt(val))
                              }
                            >
                              <SelectTrigger className="h-7 text-xs w-full" size="sm">
                                <SelectValue />
                              </SelectTrigger>
                              <SelectContent>
                                {GEOFENCE_RADIUS_OPTIONS.map(opt => (
                                  <SelectItem key={opt.value} value={opt.value} className="text-xs">
                                    {opt.label}
                                  </SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                          </div>

                          {/* Active/Paused */}
                          <div className="flex items-center gap-2">
                            <span className="text-xs text-muted-foreground flex-1">Status</span>
                            <Switch
                              checked={config.isActive}
                              disabled={isUpdating}
                              onCheckedChange={(checked) =>
                                handleUpdateConfig(config, 'isActive', checked)
                              }
                            />
                          </div>
                        </div>
                      </motion.div>
                    )
                  })}
                </div>
              </AnimatePresence>
            </div>
          )}
        </DialogBody>

        {/* Footer */}
        <DialogFooter>
          <div className="flex items-center justify-between w-full">
            {hasActiveFilters && (
              <span className="text-xs text-muted-foreground">
                {filteredConfigs.length} result{filteredConfigs.length !== 1 ? 's' : ''}
              </span>
            )}
            <Button variant="outline" onClick={() => onOpenChange(false)}>
              Close
            </Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
