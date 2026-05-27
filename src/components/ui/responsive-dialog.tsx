'use client'

import * as React from 'react'
import * as DialogPrimitive from '@radix-ui/react-dialog'
import {
  Dialog,
  DialogBody,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import {
  Drawer,
  DrawerContent,
  DrawerDescription,
  DrawerFooter,
  DrawerHeader,
  DrawerTitle,
} from '@/components/ui/drawer'
import { cn } from '@/lib/utils'

// ────────────────────────────────────────────────────────────────────
// ResponsiveDialogContent
// A drop-in replacement for DialogContent that works inside a Dialog.
// On mobile it renders as a bottom-drawer-style dialog (rounded top,
// taller max-height), on desktop it behaves like a regular DialogContent.
// ────────────────────────────────────────────────────────────────────

export function ResponsiveDialogContent({
  className,
  children,
  showCloseButton = true,
  ...props
}: React.ComponentProps<typeof DialogPrimitive.Content> & {
  showCloseButton?: boolean
}) {
  return (
    <DialogContent className={cn('max-h-[85vh] flex flex-col overflow-hidden sm:max-h-[80vh]', className)} showCloseButton={showCloseButton} {...props}>
      {children}
    </DialogContent>
  )
}

// ────────────────────────────────────────────────────────────────────
// ResponsiveDialog
// Standalone component: Dialog on desktop (md+), Drawer on mobile.
// ────────────────────────────────────────────────────────────────────

interface ResponsiveDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  title?: React.ReactNode
  description?: React.ReactNode
  children: React.ReactNode
  footer?: React.ReactNode
  className?: string
  contentClassName?: string
  showCloseButton?: boolean
}

export function ResponsiveDialog({
  open,
  onOpenChange,
  title,
  description,
  children,
  footer,
  className,
  contentClassName,
  showCloseButton = true,
}: ResponsiveDialogProps) {
  const [isDesktop, setIsDesktop] = React.useState(false)

  React.useEffect(() => {
    const mql = window.matchMedia('(min-width: 768px)')
    const onChange = (e: MediaQueryListEvent) => setIsDesktop(e.matches)
    setIsDesktop(mql.matches)
    mql.addEventListener('change', onChange)
    return () => mql.removeEventListener('change', onChange)
  }, [])

  if (isDesktop) {
    return (
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent
          className={contentClassName}
          showCloseButton={showCloseButton}
        >
          {(title || description) && (
            <DialogHeader>
              {title && <DialogTitle>{title}</DialogTitle>}
              {description && (
                <DialogDescription>{description}</DialogDescription>
              )}
            </DialogHeader>
          )}
          <DialogBody className={className}>{children}</DialogBody>
          {footer && <DialogFooter>{footer}</DialogFooter>}
        </DialogContent>
      </Dialog>
    )
  }

  return (
    <Drawer open={open} onOpenChange={onOpenChange}>
      <DrawerContent>
        <DrawerHeader className="text-left">
          {title && <DrawerTitle>{title}</DrawerTitle>}
          {description && (
            <DrawerDescription>{description}</DrawerDescription>
          )}
        </DrawerHeader>
        <div className={`px-4 pb-4 ${className || ''}`}>{children}</div>
        {footer && (
          <DrawerFooter>{footer}</DrawerFooter>
        )}
      </DrawerContent>
    </Drawer>
  )
}
