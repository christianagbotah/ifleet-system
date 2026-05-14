'use client'

import React, { useState, useEffect, useRef, useCallback } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import {
  Plus,
  Route,
  Truck,
  Users,
  Receipt,
  Fuel,
  Camera,
  X,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { ReceiptScanner, type ScannedReceiptData } from '@/components/scanner/ReceiptScanner'

// ─── Types ───────────────────────────────────────────────────────────────────

interface QuickAction {
  id: string
  label: string
  icon: React.ElementType
  page: string
  color: string
  bgHover: string
}

interface QuickActionsFabProps {
  onNavigate: (page: string) => void
  onScanReceipt?: (data: ScannedReceiptData, imageDataUrl: string) => void
}

// ─── Quick Actions Config ───────────────────────────────────────────────────

const ACTIONS: QuickAction[] = [
  {
    id: 'new-trip',
    label: 'New Trip',
    icon: Route,
    page: 'trips',
    color: 'text-emerald-600 dark:text-emerald-400',
    bgHover: 'hover:bg-emerald-50 dark:hover:bg-emerald-950/50',
  },
  {
    id: 'new-truck',
    label: 'New Truck',
    icon: Truck,
    page: 'trucks',
    color: 'text-amber-600 dark:text-amber-400',
    bgHover: 'hover:bg-amber-50 dark:hover:bg-amber-950/50',
  },
  {
    id: 'new-driver',
    label: 'New Driver',
    icon: Users,
    page: 'drivers',
    color: 'text-sky-600 dark:text-sky-400',
    bgHover: 'hover:bg-sky-50 dark:hover:bg-sky-950/50',
  },
  {
    id: 'record-expense',
    label: 'Record Expense',
    icon: Receipt,
    page: 'expenses',
    color: 'text-rose-600 dark:text-rose-400',
    bgHover: 'hover:bg-rose-50 dark:hover:bg-rose-950/50',
  },
  {
    id: 'log-fuel',
    label: 'Log Fuel',
    icon: Fuel,
    page: 'fuel-logs',
    color: 'text-orange-600 dark:text-orange-400',
    bgHover: 'hover:bg-orange-50 dark:hover:bg-orange-950/50',
  },
  {
    id: 'scan-receipt',
    label: 'Scan Receipt',
    icon: Camera,
    page: 'documents',
    color: 'text-violet-600 dark:text-violet-400',
    bgHover: 'hover:bg-violet-50 dark:hover:bg-violet-950/50',
  },
]

// ─── Animation Variants ─────────────────────────────────────────────────────

const fabButtonVariants = {
  idle: { rotate: 0, scale: 1 },
  expanded: { rotate: 45, scale: 1 },
}

const actionItemVariants = {
  hidden: { opacity: 0, y: 20, scale: 0.8 },
  visible: (i: number) => ({
    opacity: 1,
    y: 0,
    scale: 1,
    transition: {
      delay: i * 0.05,
      type: 'spring',
      stiffness: 350,
      damping: 25,
    },
  }),
  exit: (i: number) => ({
    opacity: 0,
    y: 10,
    scale: 0.8,
    transition: {
      delay: (ACTIONS.length - 1 - i) * 0.03,
      duration: 0.15,
    },
  }),
}

const backdropVariants = {
  hidden: { opacity: 0 },
  visible: { opacity: 1 },
  exit: { opacity: 0 },
}

// ─── Component ──────────────────────────────────────────────────────────────

export function QuickActionsFab({ onNavigate, onScanReceipt }: QuickActionsFabProps) {
  const [isExpanded, setIsExpanded] = useState(false)
  const [scannerOpen, setScannerOpen] = useState(false)
  const containerRef = useRef<HTMLDivElement>(null)

  // Close on outside click
  useEffect(() => {
    if (!isExpanded) return

    function handleClickOutside(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setIsExpanded(false)
      }
    }

    function handleEscape(e: KeyboardEvent) {
      if (e.key === 'Escape') {
        setIsExpanded(false)
      }
    }

    // Delay the listener to prevent immediate close on the same click that opened it
    const timer = setTimeout(() => {
      document.addEventListener('mousedown', handleClickOutside)
      document.addEventListener('keydown', handleEscape)
    }, 0)

    return () => {
      clearTimeout(timer)
      document.removeEventListener('mousedown', handleClickOutside)
      document.removeEventListener('keydown', handleEscape)
    }
  }, [isExpanded])

  const handleAction = useCallback(
    (actionId: string, page: string) => {
      setIsExpanded(false)
      // Scan Receipt opens the scanner instead of navigating
      if (actionId === 'scan-receipt') {
        setScannerOpen(true)
        return
      }
      // Slight delay so the close animation plays before navigation
      setTimeout(() => {
        onNavigate(page)
      }, 150)
    },
    [onNavigate]
  )

  const handleScanComplete = useCallback(
    (data: ScannedReceiptData, imageDataUrl: string) => {
      setScannerOpen(false)
      onScanReceipt?.(data, imageDataUrl)
    },
    [onScanReceipt]
  )

  return (
    <div ref={containerRef} className="fixed z-40 md:bottom-20 md:right-6 bottom-[calc(68px+env(safe-area-inset-bottom,0px))] right-4">
      {/* Backdrop overlay */}
      <AnimatePresence>
        {isExpanded && (
          <motion.div
            className="fixed inset-0 z-[-1]"
            variants={backdropVariants}
            initial="hidden"
            animate="visible"
            exit="exit"
            transition={{ duration: 0.2 }}
            onClick={() => setIsExpanded(false)}
          />
        )}
      </AnimatePresence>

      {/* Speed Dial Actions */}
      <AnimatePresence>
        {isExpanded && (
          <div className="absolute bottom-full right-0 mb-3 flex flex-col-reverse items-end gap-2">
            {ACTIONS.map((action, index) => (
              <motion.button
                key={action.id}
                custom={index}
                variants={actionItemVariants}
                initial="hidden"
                animate="visible"
                exit="exit"
                whileTap={{ scale: 0.95 }}
                onClick={() => handleAction(action.id, action.page)}
                className={cn(
                  'flex items-center gap-2.5 rounded-full pl-3.5 pr-4 py-2.5',
                  'bg-white dark:bg-gray-900 border shadow-lg',
                  'transition-colors duration-150',
                  action.bgHover,
                  'active:shadow-sm'
                )}
              >
                <action.icon className={cn('h-4 w-4 shrink-0', action.color)} />
                <span className="text-sm font-medium whitespace-nowrap">
                  {action.label}
                </span>
              </motion.button>
            ))}
          </div>
        )}
      </AnimatePresence>

      {/* Main FAB Button */}
      <motion.button
        variants={fabButtonVariants}
        animate={isExpanded ? 'expanded' : 'idle'}
        whileTap={{ scale: 0.9 }}
        onClick={() => setIsExpanded((prev) => !prev)}
        className={cn(
          'flex h-14 w-14 items-center justify-center rounded-full shadow-xl',
          'transition-colors duration-200',
          'focus:outline-none focus:ring-2 focus:ring-amber-400 focus:ring-offset-2',
          'dark:focus:ring-offset-gray-900',
          isExpanded
            ? 'bg-gray-700 dark:bg-gray-600 text-white'
            : 'bg-amber-500 hover:bg-amber-600 text-white'
        )}
        aria-label={isExpanded ? 'Close quick actions' : 'Open quick actions'}
        aria-expanded={isExpanded}
      >
        <AnimatePresence mode="wait">
          {isExpanded ? (
            <motion.span
              key="close"
              initial={{ rotate: -90, opacity: 0 }}
              animate={{ rotate: 0, opacity: 1 }}
              exit={{ rotate: 90, opacity: 0 }}
              transition={{ duration: 0.15 }}
            >
              <X className="h-6 w-6" />
            </motion.span>
          ) : (
            <motion.span
              key="plus"
              initial={{ rotate: 90, opacity: 0 }}
              animate={{ rotate: 0, opacity: 1 }}
              exit={{ rotate: -90, opacity: 0 }}
              transition={{ duration: 0.15 }}
            >
              <Plus className="h-6 w-6" />
            </motion.span>
          )}
        </AnimatePresence>
      </motion.button>

      {/* Receipt Scanner (opened from FAB) */}
      <ReceiptScanner
        open={scannerOpen}
        onOpenChange={setScannerOpen}
        onScanComplete={handleScanComplete}
      />
    </div>
  )
}
