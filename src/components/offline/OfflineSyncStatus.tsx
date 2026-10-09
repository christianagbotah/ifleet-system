'use client'

import * as React from 'react'
import { Cloud, CloudOff, RefreshCw, TriangleAlert } from 'lucide-react'

import { Button } from '@/components/ui/button'
import {
  DRIVER_OUTBOX_CHANGED_EVENT,
  getDriverOutboxItems,
  retryDriverOutbox,
} from '@/lib/offline/driver-sync'
import type { DriverOutboxItem } from '@/lib/offline/driver-outbox'

export function OfflineSyncStatus() {
  const [items, setItems] = React.useState<DriverOutboxItem[]>([])
  const [online, setOnline] = React.useState(true)
  const [retrying, setRetrying] = React.useState(false)

  const refresh = React.useCallback(async () => {
    setItems(await getDriverOutboxItems())
    if (typeof navigator !== 'undefined') setOnline(navigator.onLine)
  }, [])

  React.useEffect(() => {
    void refresh()
    const handle = () => void refresh()
    window.addEventListener(DRIVER_OUTBOX_CHANGED_EVENT, handle)
    window.addEventListener('online', handle)
    window.addEventListener('offline', handle)
    return () => {
      window.removeEventListener(DRIVER_OUTBOX_CHANGED_EVENT, handle)
      window.removeEventListener('online', handle)
      window.removeEventListener('offline', handle)
    }
  }, [refresh])

  const pending = items.filter((item) => item.status === 'pending')
  const permanent = items.filter((item) => item.status === 'failed_permanent')

  if (online && pending.length === 0 && permanent.length === 0) return null

  async function retry() {
    setRetrying(true)
    try {
      await retryDriverOutbox()
      await refresh()
    } finally {
      setRetrying(false)
    }
  }

  return (
    <div className="rounded-xl border border-amber-200 bg-amber-50/80 p-3 dark:border-amber-500/20 dark:bg-amber-500/10">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-start gap-2">
          {online ? <Cloud className="mt-0.5 h-4 w-4 text-amber-600" /> : <CloudOff className="mt-0.5 h-4 w-4 text-amber-600" />}
          <div>
            <div className="text-sm font-semibold text-amber-950 dark:text-amber-100">
              {online ? 'Driver sync pending' : 'Offline'}
            </div>
            <div className="mt-0.5 text-xs text-amber-800/80 dark:text-amber-200/70">
              {pending.length > 0 ? `${pending.length} pending submission${pending.length === 1 ? '' : 's'}` : 'No pending submissions'}
              {permanent.length > 0 ? ` · ${permanent.length} needs attention` : ''}
            </div>
          </div>
        </div>
        {online && items.length > 0 && (
          <Button type="button" variant="outline" size="sm" onClick={retry} disabled={retrying} className="h-8 gap-1.5">
            <RefreshCw className={`h-3.5 w-3.5 ${retrying ? 'animate-spin' : ''}`} /> Retry
          </Button>
        )}
      </div>
      {permanent.length > 0 && (
        <div className="mt-2 flex items-center gap-1.5 text-xs font-medium text-red-700 dark:text-red-300">
          <TriangleAlert className="h-3.5 w-3.5" />
          {permanent.length} failed_permanent submission{permanent.length === 1 ? '' : 's'} require correction.
        </div>
      )}
    </div>
  )
}
