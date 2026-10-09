'use client'

import { Badge } from '@/components/ui/badge'
import { Card, CardContent } from '@/components/ui/card'
import { Gauge, MapPin, Navigation, Radio, Truck, Wifi, WifiOff } from 'lucide-react'
import type { ControlTowerLiveRecord } from './control-tower-types'

function stateBadge(state: ControlTowerLiveRecord['connectionState']) {
  if (state === 'online') return 'bg-emerald-100 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300'
  if (state === 'stale') return 'bg-amber-100 text-amber-700 dark:bg-amber-950/40 dark:text-amber-300'
  return 'bg-red-100 text-red-700 dark:bg-red-950/40 dark:text-red-300'
}

export function VehicleTelemetryDrawer({ record }: { record: ControlTowerLiveRecord | null }) {
  if (!record) {
    return (
      <Card className="border-dashed">
        <CardContent className="flex min-h-56 flex-col items-center justify-center p-6 text-center">
          <Truck className="mb-3 h-8 w-8 text-muted-foreground" />
          <p className="font-medium">Select a vehicle</p>
          <p className="mt-1 text-xs text-muted-foreground">Telemetry, route and source trust will appear here.</p>
        </CardContent>
      </Card>
    )
  }

  return (
    <Card className="overflow-hidden">
      <CardContent className="space-y-4 p-4">
        <div className="flex items-start justify-between gap-3">
          <div>
            <div className="flex items-center gap-2">
              <Truck className="h-4 w-4 text-amber-500" />
              <h3 className="font-semibold">{record.label}</h3>
            </div>
            <p className="mt-1 text-xs text-muted-foreground">{record.driverName || 'No driver assigned'}</p>
          </div>
          <Badge className={stateBadge(record.connectionState)}>{record.connectionState}</Badge>
        </div>

        <div className="grid grid-cols-2 gap-2 text-xs">
          <div className="rounded-lg bg-muted/50 p-3">
            <Gauge className="mb-1 h-3.5 w-3.5 text-muted-foreground" />
            <p className="text-muted-foreground">Speed</p>
            <p className="font-semibold">{record.speedKph == null ? '—' : `${Math.round(record.speedKph)} km/h`}</p>
          </div>
          <div className="rounded-lg bg-muted/50 p-3">
            <Navigation className="mb-1 h-3.5 w-3.5 text-muted-foreground" />
            <p className="text-muted-foreground">Heading</p>
            <p className="font-semibold">{record.headingDeg == null ? '—' : `${Math.round(record.headingDeg)}°`}</p>
          </div>
          <div className="rounded-lg bg-muted/50 p-3">
            <MapPin className="mb-1 h-3.5 w-3.5 text-muted-foreground" />
            <p className="text-muted-foreground">Trip</p>
            <p className="truncate font-semibold">{record.tripNumber || 'No active trip'}</p>
          </div>
          <div className="rounded-lg bg-muted/50 p-3">
            {record.connectionState === 'online' ? <Wifi className="mb-1 h-3.5 w-3.5 text-emerald-500" /> : <WifiOff className="mb-1 h-3.5 w-3.5 text-muted-foreground" />}
            <p className="text-muted-foreground">Ignition</p>
            <p className="font-semibold">{record.ignitionOn == null ? 'Unknown' : record.ignitionOn ? 'On' : 'Off'}</p>
          </div>
        </div>

        <div className="rounded-lg border p-3 text-xs">
          <div className="mb-2 flex items-center gap-2 font-medium"><Radio className="h-3.5 w-3.5" /> Telemetry source</div>
          <div className="grid grid-cols-2 gap-y-2">
            <span className="text-muted-foreground">Source</span><span className="text-right font-medium capitalize">{record.source}</span>
            <span className="text-muted-foreground">Trust</span><span className="text-right font-medium capitalize">{record.trust}</span>
            <span className="text-muted-foreground">Provider</span><span className="truncate text-right font-medium">{record.provider}</span>
            <span className="text-muted-foreground">Accuracy</span><span className="text-right font-medium">{record.accuracyMeters == null ? '—' : `${Math.round(record.accuracyMeters)} m`}</span>
          </div>
        </div>

        {record.destination && (
          <div className="text-xs">
            <span className="text-muted-foreground">Destination · </span>
            <span className="font-medium">{record.destination}</span>
          </div>
        )}
      </CardContent>
    </Card>
  )
}
