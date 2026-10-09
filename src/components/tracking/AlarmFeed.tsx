'use client'

import { AlertTriangle, Gauge, WifiOff } from 'lucide-react'
import type { ControlTowerLiveRecord } from './control-tower-types'

export function AlarmFeed({ records }: { records: ControlTowerLiveRecord[] }) {
  const alarms = records.flatMap((record) => {
    const items: Array<{ key: string; title: string; detail: string; level: 'critical' | 'warning'; kind: 'offline' | 'speed' }> = []
    if (record.connectionState === 'offline' || record.connectionState === 'stale') {
      items.push({
        key: `${record.assetId}-connection`,
        title: `${record.label} ${record.connectionState}`,
        detail: `Last trusted ${record.source} position is no longer live.`,
        level: record.connectionState === 'offline' ? 'critical' : 'warning',
        kind: 'offline',
      })
    }
    if ((record.speedKph ?? 0) > 80) {
      items.push({
        key: `${record.assetId}-speed`,
        title: `${record.label} speeding`,
        detail: `${Math.round(record.speedKph ?? 0)} km/h from ${record.source} telemetry.`,
        level: 'critical',
        kind: 'speed',
      })
    }
    return items
  })

  return (
    <div className="rounded-xl border bg-card">
      <div className="flex items-center justify-between border-b px-4 py-3">
        <div className="flex items-center gap-2 text-sm font-semibold"><AlertTriangle className="h-4 w-4 text-amber-500" /> Alarm feed</div>
        <span className="text-xs text-muted-foreground">{alarms.length} active</span>
      </div>
      <div className="max-h-48 overflow-y-auto divide-y">
        {alarms.length === 0 ? (
          <div className="px-4 py-6 text-center text-xs text-muted-foreground">No active telemetry alarms.</div>
        ) : alarms.map((alarm) => (
          <div key={alarm.key} className="flex gap-3 px-4 py-3">
            <div className={`mt-0.5 rounded-md p-1.5 ${alarm.level === 'critical' ? 'bg-red-100 text-red-600 dark:bg-red-950/40' : 'bg-amber-100 text-amber-600 dark:bg-amber-950/40'}`}>
              {alarm.kind === 'speed' ? <Gauge className="h-3.5 w-3.5" /> : <WifiOff className="h-3.5 w-3.5" />}
            </div>
            <div className="min-w-0">
              <p className="text-xs font-medium">{alarm.title}</p>
              <p className="mt-0.5 text-[11px] text-muted-foreground">{alarm.detail}</p>
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
