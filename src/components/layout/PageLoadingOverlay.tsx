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
        'bg-black/50 backdrop-blur-[3px]',
        'transition-opacity duration-200',
      )}
      role="dialog"
      aria-busy="true"
      aria-modal="true"
      aria-label={message || 'Processing'}
    >
      <div
        className={cn(
          'relative flex flex-col items-center justify-center gap-5',
          'rounded-2xl bg-background px-10 py-8 shadow-2xl border border-border/50',
          'min-w-[180px]',
        )}
      >
        {/* Spinning loader with glow ring */}
        <div className="relative flex items-center justify-center">
          <div className="absolute h-14 w-14 rounded-full border-2 border-primary/20 animate-[ping_2s_ease-in-out_infinite]" />
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
        </div>

        {/* Message */}
        <div className="flex flex-col items-center gap-1">
          <p className="text-sm font-semibold text-foreground">
            {message || 'Processing...'}
          </p>
          <p className="text-xs text-muted-foreground">
            Please wait
          </p>
        </div>

        {/* Subtle progress indicator bar */}
        <div className="w-full h-1 rounded-full bg-muted overflow-hidden">
          <div className="h-full w-1/3 rounded-full bg-primary animate-[loading-slide_1.5s_ease-in-out_infinite]" />
        </div>
      </div>
    </div>
  )
}
