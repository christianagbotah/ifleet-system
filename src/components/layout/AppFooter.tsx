'use client'

import { useAppStore } from '@/lib/store'
import { Settings, BarChart3 } from 'lucide-react'

export function AppFooter() {
  const { setCurrentView } = useAppStore()

  return (
    <footer className="hidden md:flex items-center justify-between border-t backdrop-blur-sm bg-muted/30 px-6 py-3 h-11 text-xs text-muted-foreground shrink-0">
      <div className="flex items-center gap-3">
        <span>© 2025 LightWorld Tech</span>
        <span className="text-border">·</span>
        <span className="text-muted-foreground/70">iFleetPro v1.0.0</span>
      </div>
      <div className="flex items-center gap-3">
        <button
          onClick={() => setCurrentView('reports')}
          className="hover:text-foreground transition-colors inline-flex items-center gap-1"
        >
          <BarChart3 className="size-3" />
          Reports
        </button>
        <span className="text-border">·</span>
        <button
          onClick={() => setCurrentView('settings')}
          className="hover:text-foreground transition-colors inline-flex items-center gap-1"
        >
          <Settings className="size-3" />
          Settings
        </button>
        <span className="text-border">·</span>
        <span className="text-muted-foreground/50">LightWorld Tech</span>
      </div>
    </footer>
  )
}
