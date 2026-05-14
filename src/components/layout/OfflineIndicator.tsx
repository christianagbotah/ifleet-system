'use client'

import * as React from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { WifiOff, RefreshCw, CloudOff, CheckCircle2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { useOfflineAware } from '@/lib/offline-fetch'
import { OfflineStore } from '@/lib/offline-store'
import { toast } from 'sonner'

// ── Offline Banner ───────────────────────────────────────────────────────────
// A full-width banner that appears at the very top of the page when offline.

function OfflineBanner() {
  return (
    <motion.div
      initial={{ height: 0, opacity: 0 }}
      animate={{ height: 'auto', opacity: 1 }}
      exit={{ height: 0, opacity: 0 }}
      transition={{ duration: 0.25, ease: 'easeInOut' }}
      className="bg-amber-600 text-white px-4 py-2 text-center text-sm font-medium overflow-hidden"
    >
      <div className="flex items-center justify-center gap-2">
        <WifiOff className="h-4 w-4 shrink-0" />
        <span>You are offline. Some features may be unavailable.</span>
      </div>
    </motion.div>
  )
}

// ── Back Online Banner ───────────────────────────────────────────────────────
// Briefly shown when the connection is restored.

function BackOnlineBanner() {
  return (
    <motion.div
      initial={{ height: 0, opacity: 0 }}
      animate={{ height: 'auto', opacity: 1 }}
      exit={{ height: 0, opacity: 0 }}
      transition={{ duration: 0.2, ease: 'easeInOut' }}
      className="bg-emerald-600 text-white px-4 py-2 text-center text-sm font-medium overflow-hidden"
    >
      <div className="flex items-center justify-center gap-2">
        <CheckCircle2 className="h-4 w-4 shrink-0" />
        <span>You are back online!</span>
      </div>
    </motion.div>
  )
}

// ── Pending Actions Bar ──────────────────────────────────────────────────────
// Shows below the offline banner when there are queued actions.

function PendingActionsBar({ onSync }: { onSync: () => void }) {
  const [queueCount, setQueueCount] = React.useState(0)
  const [syncing, setSyncing] = React.useState(false)

  React.useEffect(() => {
    OfflineStore.getPendingQueue().then((items) => setQueueCount(items.length))
  }, [])

  const handleSync = async () => {
    setSyncing(true)
    try {
      const result = await OfflineStore.processQueue()
      if (result.processed > 0) {
        toast.success(`Synced ${result.processed} action${result.processed > 1 ? 's' : ''}.`)
      }
      if (result.failed > 0) {
        toast.warning(`${result.failed} action${result.failed > 1 ? 's' : ''} failed.`)
      }
      // Refresh count
      const remaining = await OfflineStore.getPendingQueue()
      setQueueCount(remaining.length)
      onSync()
    } catch {
      toast.error('Sync failed. Will retry when online.')
    } finally {
      setSyncing(false)
    }
  }

  if (queueCount === 0) return null

  return (
    <motion.div
      initial={{ height: 0, opacity: 0 }}
      animate={{ height: 'auto', opacity: 1 }}
      exit={{ height: 0, opacity: 0 }}
      transition={{ duration: 0.2, ease: 'easeInOut', delay: 0.1 }}
      className="bg-orange-700 text-white px-4 py-1.5 text-center text-xs font-medium overflow-hidden"
    >
      <div className="flex items-center justify-center gap-2">
        <CloudOff className="h-3.5 w-3.5 shrink-0" />
        <span>{queueCount} pending action{queueCount !== 1 ? 's' : ''}</span>
        <Button
          variant="ghost"
          size="sm"
          className="h-6 px-2 text-xs text-white hover:bg-white/20 hover:text-white"
          onClick={handleSync}
          disabled={syncing}
        >
          <RefreshCw className={`h-3 w-3 mr-1 ${syncing ? 'animate-spin' : ''}`} />
          Sync Now
        </Button>
      </div>
    </motion.div>
  )
}

// ── Connection Status Dot ────────────────────────────────────────────────────
// Small coloured dot for use in headers or sidebars.

export function ConnectionStatusDot() {
  const { isOnline } = useOfflineAware()

  return (
    <span
      className={`inline-block h-2 w-2 rounded-full shrink-0 ${
        isOnline
          ? 'bg-emerald-500 shadow-sm shadow-emerald-500/50'
          : 'bg-red-500 shadow-sm shadow-red-500/50 animate-pulse'
      }`}
      title={isOnline ? 'Online' : 'Offline'}
      aria-label={isOnline ? 'Online' : 'Offline'}
    />
  )
}

// ── Main OfflineIndicator ────────────────────────────────────────────────────
// Renders the banner stack at the top of the page.

export function OfflineIndicator() {
  const { isOnline, hasPendingActions, checkPendingQueue } = useOfflineAware()
  const [showBackOnline, setShowBackOnline] = React.useState(false)
  const [wasOffline, setWasOffline] = React.useState(false)

  React.useEffect(() => {
    if (!isOnline) {
      setWasOffline(true)
      setShowBackOnline(false)
    } else if (wasOffline) {
      // Just came back online — flash the "back online" banner
      setShowBackOnline(true)
      setWasOffline(false)
      const timer = setTimeout(() => setShowBackOnline(false), 3000)
      return () => clearTimeout(timer)
    }
  }, [isOnline, wasOffline])

  return (
    <AnimatePresence mode="wait">
      {!isOnline && (
        <motion.div key="offline-group" className="flex flex-col">
          <OfflineBanner />
          {hasPendingActions && (
            <PendingActionsBar onSync={checkPendingQueue} />
          )}
        </motion.div>
      )}

      {isOnline && showBackOnline && (
        <motion.div key="back-online" className="flex flex-col">
          <BackOnlineBanner />
        </motion.div>
      )}

      {isOnline && !showBackOnline && hasPendingActions && (
        <motion.div key="pending-only" className="flex flex-col">
          <PendingActionsBar onSync={checkPendingQueue} />
        </motion.div>
      )}
    </AnimatePresence>
  )
}
