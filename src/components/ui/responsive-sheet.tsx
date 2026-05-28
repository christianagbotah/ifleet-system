'use client'

import * as React from 'react'
import * as DialogPrimitive from '@radix-ui/react-dialog'
import { XIcon, ArrowLeftIcon } from 'lucide-react'
import { cn } from '@/lib/utils'

// ────────────────────────────────────────────────────────────────────
// ResponsiveSheet
//
// A universal sheet component that adapts to viewport:
//   • Desktop (md+): slides in from the right like a traditional Sheet
//   • Mobile (<md): full-screen page-push view with a header bar
//
// Built on top of Radix UI Dialog primitives (same foundation as
// shadcn/ui Sheet).
// ────────────────────────────────────────────────────────────────────

export interface ResponsiveSheetProps {
  /** Controlled open state */
  open: boolean
  /** Callback when open state changes */
  onOpenChange: (open: boolean) => void
  /** Title displayed in the header area (required for accessibility) */
  title: React.ReactNode
  /** Optional description below the title */
  description?: React.ReactNode
  /** Sheet body content */
  children: React.ReactNode
  /** Optional footer content pinned to the bottom */
  footer?: React.ReactNode
  /** Additional class names for the content container */
  className?: string
  /** Desktop max-width (Tailwind width class), default "sm:max-w-lg" */
  width?: string
}

export function ResponsiveSheet({
  open,
  onOpenChange,
  title,
  description,
  children,
  footer,
  className,
  width = 'sm:max-w-lg',
}: ResponsiveSheetProps) {
  const [isDesktop, setIsDesktop] = React.useState(false)

  React.useEffect(() => {
    const mql = window.matchMedia('(min-width: 768px)')
    const onChange = (e: MediaQueryListEvent) => setIsDesktop(e.matches)
    setIsDesktop(mql.matches)
    mql.addEventListener('change', onChange)
    return () => mql.removeEventListener('change', onChange)
  }, [])

  // ── Desktop: right-side sliding sheet ──
  if (isDesktop) {
    return (
      <DialogPrimitive.Root open={open} onOpenChange={onOpenChange}>
        <DialogPrimitive.Portal>
          <DialogPrimitive.Overlay
            className={cn(
              'data-[state=open]:animate-in data-[state=closed]:animate-out',
              'data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0',
              'fixed inset-0 z-50 bg-black/50',
            )}
          />
          <DialogPrimitive.Content
            data-slot="responsive-sheet-content"
            className={cn(
              'bg-background',
              'data-[state=open]:animate-in data-[state=closed]:animate-out',
              'data-[state=closed]:slide-out-to-right data-[state=open]:slide-in-from-right',
              'data-[state=closed]:duration-300 data-[state=open]:duration-500',
              'fixed z-50 flex flex-col gap-0 shadow-lg',
              'inset-y-0 right-0 h-full w-3/4 border-l',
              width,
              'overflow-hidden',
              className,
            )}
          >
            {/* Header */}
            <div className="flex items-center justify-between border-b px-6 py-4 shrink-0">
              <div className="min-w-0 flex-1">
                <DialogPrimitive.Title className="text-foreground text-base font-semibold leading-tight truncate">
                  {title}
                </DialogPrimitive.Title>
                {description && (
                  <DialogPrimitive.Description className="text-muted-foreground text-sm mt-1">
                    {description}
                  </DialogPrimitive.Description>
                )}
              </div>
              <DialogPrimitive.Close
                className="ring-offset-background focus:ring-ring data-[state=open]:bg-secondary rounded-xs opacity-70 transition-opacity hover:opacity-100 focus:ring-2 focus:ring-offset-2 focus:outline-hidden disabled:pointer-events-none ml-4 shrink-0"
              >
                <XIcon className="size-4" />
                <span className="sr-only">Close</span>
              </DialogPrimitive.Close>
            </div>

            {/* Scrollable body */}
            <div className="flex-1 min-h-0 overflow-y-auto">
              {children}
            </div>

            {/* Footer */}
            {footer && (
              <div className="shrink-0 border-t px-6 py-4">
                {footer}
              </div>
            )}
          </DialogPrimitive.Content>
        </DialogPrimitive.Portal>
      </DialogPrimitive.Root>
    )
  }

  // ── Mobile: full-screen page-push ──
  return (
    <DialogPrimitive.Root open={open} onOpenChange={onOpenChange}>
      <DialogPrimitive.Portal>
        <DialogPrimitive.Content
          data-slot="responsive-sheet-content"
          className={cn(
            'bg-background',
            'data-[state=open]:animate-in data-[state=closed]:animate-out',
            'data-[state=closed]:slide-out-to-bottom data-[state=open]:slide-in-from-bottom',
            'data-[state=closed]:duration-200 data-[state=open]:duration-300',
            'fixed z-50 flex flex-col',
            'inset-0 h-full w-full',
            'overflow-hidden',
            className,
          )}
        >
          {/* Mobile header bar – looks like a native nav bar */}
          <div className="flex items-center gap-3 border-b bg-background px-4 py-3 shrink-0 safe-area-inset-top">
            <DialogPrimitive.Close
              className="flex items-center justify-center size-9 rounded-lg hover:bg-muted transition-colors focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2 disabled:pointer-events-none"
            >
              <ArrowLeftIcon className="size-5" />
              <span className="sr-only">Go back</span>
            </DialogPrimitive.Close>
            <div className="min-w-0 flex-1">
              <DialogPrimitive.Title className="text-foreground text-sm font-semibold leading-tight truncate">
                {title}
              </DialogPrimitive.Title>
              {description && (
                <DialogPrimitive.Description className="text-muted-foreground text-xs mt-0.5 truncate">
                  {description}
                </DialogPrimitive.Description>
              )}
            </div>
          </div>

          {/* Scrollable body */}
          <div className="flex-1 min-h-0 overflow-y-auto">
            {children}
          </div>

          {/* Footer */}
          {footer && (
            <div className="shrink-0 border-t px-4 py-3 bg-background safe-area-inset-bottom">
              {footer}
            </div>
          )}
        </DialogPrimitive.Content>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  )
}
