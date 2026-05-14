'use client'

import { useEffect } from 'react'

export function ServiceWorkerRegistration() {
  useEffect(() => {
    // In development, unregister any existing service workers to prevent
    // stale module caching (especially zustand/middleware HMR ghost references).
    // Service workers use cache-first for /_next/ chunks which breaks HMR.
    if (typeof window !== 'undefined' && 'serviceWorker' in navigator) {
      if (process.env.NODE_ENV === 'development') {
        navigator.serviceWorker.getRegistrations().then((registrations) => {
          registrations.forEach((reg) => {
            console.log('[SW] Unregistering service worker in dev mode:', reg.scope)
            reg.unregister()
          })
        })
        return
      }

      // Production only: register service worker
      window.addEventListener('load', () => {
        navigator.serviceWorker
          .register('/sw.js')
          .then((registration) => {
            console.log('SW registered:', registration.scope)
          })
          .catch((error) => {
            console.log('SW registration failed:', error)
          })
      })
    }
  }, [])

  return null
}
