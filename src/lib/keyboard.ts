'use client'

import { useEffect } from 'react'

export function useKeyboardNav(items: { key: string; action: () => void }[]) {
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (!e.altKey) return
      const matched = items.find((item) => item.key === e.key)
      if (matched) {
        e.preventDefault()
        matched.action()
      }
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [items])
}

/**
 * All registered keyboard shortcuts:
 * Alt+0: Trip Calendar
 * Alt+1: Dashboard
 * Alt+2: Drivers
 * Alt+3: Trucks
 * Alt+4: Warehouses
 * Alt+5: Zone Rates
 * Alt+6: Trips
 * Alt+7: Cash Advances
 * Alt+8: Incentives
 * Alt+9: Reports
 * Alt+K: Command Palette (registered in CommandPalette.tsx)
 */
