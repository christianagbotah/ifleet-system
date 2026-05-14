'use client'

import { useLoadingStore } from '@/lib/store/loading'
import { Loader2 } from 'lucide-react'
import { cn } from '@/lib/utils'

export function PageLoadingOverlay() {
  const isVisible = useLoadingStore((s) => s.isVisible)
  const message = useLoadingStore((s) => s.message)

  if (!isVisible) return null

  return (
    <div
      className={cn(
        'fixed inset-0 z-[99999] flex items-center justify-center',
        'bg-black/40 backdrop-blur-[2px]',
        'animate-in fade-in-0 duration-200',
      )}
      role="dialog"
      aria-busy="true"
      aria-label={message || 'Loading'}
    >
      <div
        className={cn(
          'flex flex-col items-center gap-4 rounded-2xl bg-background/95 px-8 py-6 shadow-2xl border',
          'animate-in zoom-in-95 fade-in-0 duration-300',
        )}
      >
        <div className="relative">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
          <div className="absolute inset-0 rounded-full bg-primary/10 animate-ping" />
        </div>
        {message && (
          <p className="text-sm font-medium text-muted-foreground animate-pulse">
            {message}
          </p>
        )}
      </div>
    </div>
  )
}
