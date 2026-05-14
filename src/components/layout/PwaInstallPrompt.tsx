'use client'

import * as React from 'react'
import { Download, X, Smartphone, Monitor } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { toast } from 'sonner'

// ── PWA Install Prompt ──────────────────────────────────────────────────────
// Listens for the browser's `beforeinstallprompt` event and shows an install
// prompt. On iOS/Safari (no beforeinstallprompt), shows manual instructions.

interface BeforeInstallPromptEvent extends Event {
  prompt(): Promise<void>
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>
}

export function PwaInstallPrompt() {
  const [deferredPrompt, setDeferredPrompt] = React.useState<BeforeInstallPromptEvent | null>(null)
  const [dismissed, setDismissed] = React.useState(false)
  const [showIosHint, setShowIosHint] = React.useState(false)

  const handleDismiss = React.useCallback(() => {
    setDismissed(true)
    setShowIosHint(false)
    localStorage.setItem('pwa-install-dismissed', String(Date.now()))
  }, [])

  React.useEffect(() => {
    // Check if user previously dismissed
    const wasDismissed = localStorage.getItem('pwa-install-dismissed')
    if (wasDismissed) {
      const timestamp = parseInt(wasDismissed, 10)
      // Re-show after 7 days
      if (Date.now() - timestamp < 7 * 24 * 60 * 60 * 1000) return
    }

    // Detect iOS
    const isIos = /iphone|ipad|ipod/.test(navigator.userAgent.toLowerCase())
    const isStandalone = window.matchMedia('(display-mode: standalone)').matches

    if (isStandalone) return // Already installed

    if (isIos) {
      // iOS doesn't fire beforeinstallprompt — show after a delay
      const timer = setTimeout(() => {
        if (!localStorage.getItem('pwa-install-dismissed')) {
          setShowIosHint(true)
        }
      }, 15000) // 15s after page load
      return () => clearTimeout(timer)
    }

    // Android/Chrome: wait for beforeinstallprompt
    const handler = (e: Event) => {
      e.preventDefault()
      setDeferredPrompt(e as BeforeInstallPromptEvent)
      // Show after a short delay
      setTimeout(() => {
        if (!localStorage.getItem('pwa-install-dismissed')) {
          toast.custom(
            (t) => (
              <div className="flex items-start gap-3 bg-white dark:bg-gray-900 border rounded-xl shadow-lg p-4 max-w-sm">
                <div className="rounded-full bg-amber-100 dark:bg-amber-900/30 p-2 shrink-0">
                  <Download className="h-5 w-5 text-amber-600 dark:text-amber-400" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-semibold">Install iFleetPro</p>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    Add to your home screen for quick access and offline support.
                  </p>
                  <div className="flex gap-2 mt-3">
                    <Button
                      size="sm"
                      className="h-8 text-xs bg-amber-600 hover:bg-amber-700"
                      onClick={async () => {
                        await (deferredPrompt as BeforeInstallPromptEvent)?.prompt()
                        toast.dismiss(t)
                      }}
                    >
                      Install App
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-8 text-xs"
                      onClick={() => {
                        toast.dismiss(t)
                        handleDismiss()
                      }}
                    >
                      Not now
                    </Button>
                  </div>
                </div>
                <button
                  onClick={() => { toast.dismiss(t) }}
                  className="text-muted-foreground hover:text-foreground shrink-0"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>
            ),
            { duration: 15000, position: 'bottom-center', id: 'pwa-install' }
          )
        }
      }, 5000)
    }

    window.addEventListener('beforeinstallprompt', handler)
    return () => window.removeEventListener('beforeinstallprompt', handler)
  }, [deferredPrompt, handleDismiss])

  // iOS hint — shown as a bottom banner
  if (showIosHint && !dismissed) {
    return (
      <div className="fixed bottom-[calc(68px+env(safe-area-inset-bottom,0px))] md:bottom-20 left-4 right-4 md:left-auto md:right-6 md:max-w-sm z-40 animate-in slide-in-from-bottom-4 fade-in duration-300">
        <div className="bg-white dark:bg-gray-900 border rounded-xl shadow-lg p-4">
          <div className="flex items-start gap-3">
            <div className="rounded-full bg-amber-100 dark:bg-amber-900/30 p-2 shrink-0">
              <Smartphone className="h-5 w-5 text-amber-600 dark:text-amber-400" />
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-semibold">Install iFleetPro</p>
              <p className="text-xs text-muted-foreground mt-0.5">
                Tap <strong>Share</strong> then <strong>Add to Home Screen</strong> to install the app.
              </p>
              <div className="flex gap-2 mt-3">
                <Button
                  size="sm"
                  variant="outline"
                  className="h-8 text-xs"
                  onClick={handleDismiss}
                >
                  Got it
                </Button>
              </div>
            </div>
            <button onClick={handleDismiss} className="text-muted-foreground hover:text-foreground shrink-0">
              <X className="h-4 w-4" />
            </button>
          </div>
        </div>
      </div>
    )
  }

  return null
}

// ── SW Update Notification ──────────────────────────────────────────────────
// Listens for service worker update messages and prompts user to refresh.

export function SwUpdateNotifier() {
  React.useEffect(() => {
    if (typeof window === 'undefined' || !('serviceWorker' in navigator)) return

    const handler = (event: MessageEvent) => {
      if (event.data?.type === 'SW_UPDATED') {
        toast('A new version of iFleetPro is available!', {
          description: 'Refresh the page to get the latest updates.',
          action: {
            label: 'Refresh Now',
            onClick: () => {
              // Tell SW to skip waiting, then reload
              if (navigator.serviceWorker.controller) {
                navigator.serviceWorker.controller.postMessage({ type: 'SKIP_WAITING' })
              }
              // Give SW a moment to activate, then reload
              setTimeout(() => window.location.reload(), 500)
            },
          },
          duration: 10000,
        })
      }
    }

    navigator.serviceWorker.addEventListener('message', handler)
    return () => navigator.serviceWorker.removeEventListener('message', handler)
  }, [])

  return null
}
