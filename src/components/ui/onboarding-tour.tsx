'use client'

import { useEffect, useRef, useState, useCallback, type ReactNode } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { useTourStore } from '@/lib/tour-store'
import { useAppStore } from '@/lib/store'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'

// ─── Types ──────────────────────────────────────────────────────────────────

type Placement = 'bottom' | 'top' | 'left' | 'right'

interface TourStep {
  target?: string // CSS selector, omit for centered
  title: string
  content: ReactNode
  placement: Placement
  action?: () => void // optional action on step enter (e.g., navigate)
}

// ─── Steps Definition ──────────────────────────────────────────────────────

const tourSteps: TourStep[] = [
  {
    title: 'Welcome to iFleetPro!',
    content: (
      <div className="space-y-2">
        <p>Your all-in-one fleet management solution. Let us show you around so you can get the most out of the platform.</p>
        <p className="text-xs text-muted-foreground">This quick tour takes about 1 minute.</p>
      </div>
    ),
    placement: 'bottom',
  },
  {
    target: '[data-tour="sidebar"]',
    title: 'Navigation Panel',
    content: (
      <div className="space-y-2">
        <p>Use the sidebar to navigate between pages. Items are grouped into:</p>
        <ul className="list-disc list-inside text-xs space-y-1 text-muted-foreground">
          <li><strong className="text-foreground">Overview</strong> — Dashboard</li>
          <li><strong className="text-foreground">Master Data</strong> — Drivers, Trucks, Warehouses, Zone Rates</li>
          <li><strong className="text-foreground">Operations</strong> — Trips, Calendar, Cash Advances, Incentives</li>
          <li><strong className="text-foreground">Analytics</strong> — Reports</li>
        </ul>
        <p className="text-xs text-muted-foreground">You can also search using the search bar or press <kbd className="px-1.5 py-0.5 rounded bg-muted font-mono text-[10px]">Alt+K</kbd> for the command palette.</p>
      </div>
    ),
    placement: 'right',
  },
  {
    target: '[data-tour="dashboard"]',
    title: 'Your Command Center',
    content: (
      <div className="space-y-2">
        <p>The dashboard gives you an instant overview of your fleet: active drivers, trucks on the road, live trip status, and revenue at a glance.</p>
        <p className="text-xs text-muted-foreground">Stat cards include trend indicators and 7-day sparklines.</p>
      </div>
    ),
    placement: 'bottom',
    action: undefined, // handled via setCurrentView
  },
  {
    target: '[data-tour="drivers-nav"]',
    title: 'Manage Your Fleet',
    content: (
      <div className="space-y-2">
        <p>Add, edit, and manage your drivers here. Track licenses, contact info, and performance metrics.</p>
        <p className="text-xs text-muted-foreground">Driver profiles include license expiry tracking and activity history.</p>
      </div>
    ),
    placement: 'right',
  },
  {
    target: '[data-tour="trips-nav"]',
    title: 'Track Deliveries',
    content: (
      <div className="space-y-2">
        <p>Create and track trips from origin to destination. Monitor status in real-time: Pending → In Progress → Completed.</p>
        <p className="text-xs text-muted-foreground">Trip amounts auto-calculate from zone rates. You can also view trips on a calendar.</p>
      </div>
    ),
    placement: 'right',
  },
  {
    target: '[data-tour="quick-actions"]',
    title: 'Quick Actions',
    content: (
      <div className="space-y-2">
        <p>Click this button to quickly create new trips, add drivers or trucks, request cash advances, and more.</p>
        <p className="text-xs text-muted-foreground">The speed-dial fans out for fast access to common actions.</p>
      </div>
    ),
    placement: 'left',
  },
  {
    target: '[data-tour="notifications"]',
    title: 'Stay Informed',
    content: (
      <div className="space-y-2">
        <p>The notification bell alerts you about expiring licenses, pending approvals, and important status changes.</p>
        <p className="text-xs text-muted-foreground">Click to open the full notifications panel.</p>
      </div>
    ),
    placement: 'left',
  },
  {
    title: "You're All Set!",
    content: (
      <div className="space-y-3">
        <p>You now know the basics of iFleetPro. Here are some tips to get started:</p>
        <ul className="list-disc list-inside text-xs space-y-1 text-muted-foreground">
          <li>Add your drivers and trucks in <strong className="text-foreground">Master Data</strong></li>
          <li>Set up <strong className="text-foreground">Zone Rates</strong> for auto-calculated trip amounts</li>
          <li>Create your first <strong className="text-foreground">Trip</strong> and track it through completion</li>
        </ul>
        <p className="font-medium text-emerald-600 dark:text-emerald-400">Happy fleet managing! 🚛</p>
      </div>
    ),
    placement: 'bottom',
  },
]

// ─── Position Calculation ──────────────────────────────────────────────────

interface Position {
  top?: number
  left?: number
  arrowStyle: React.CSSProperties
}

const GAP = 12
const ARROW_SIZE = 10

function getTooltipPosition(
  targetRect: DOMRect | null,
  placement: Placement,
  tooltipW: number,
  tooltipH: number,
  viewW: number,
  viewH: number,
): Position {
  // Centered overlay — no target
  if (!targetRect) {
    return {
      top: viewH / 2 - tooltipH / 2,
      left: viewW / 2 - tooltipW / 2,
      arrowStyle: { display: 'none' },
    }
  }

  let top: number
  let left: number
  let arrowStyle: React.CSSProperties = {}

  const centerX = targetRect.left + targetRect.width / 2
  const centerY = targetRect.top + targetRect.height / 2

  switch (placement) {
    case 'bottom': {
      top = targetRect.bottom + GAP
      left = centerX - tooltipW / 2
      // Clamp horizontally
      left = Math.max(GAP, Math.min(left, viewW - tooltipW - GAP))
      // Arrow points up
      const arrowLeft = centerX - left
      arrowStyle = {
        top: -ARROW_SIZE,
        left: arrowLeft - ARROW_SIZE,
        borderTopWidth: 0,
        borderBottomWidth: ARROW_SIZE,
        borderLeftWidth: ARROW_SIZE,
        borderRightWidth: ARROW_SIZE,
        borderLeftColor: 'transparent',
        borderRightColor: 'transparent',
        borderBottomColor: 'white',
      }
      break
    }
    case 'top': {
      top = targetRect.top - tooltipH - GAP
      left = centerX - tooltipW / 2
      left = Math.max(GAP, Math.min(left, viewW - tooltipW - GAP))
      const arrowLeft = centerX - left
      arrowStyle = {
        bottom: -ARROW_SIZE,
        left: arrowLeft - ARROW_SIZE,
        borderBottomWidth: 0,
        borderTopWidth: ARROW_SIZE,
        borderLeftWidth: ARROW_SIZE,
        borderRightWidth: ARROW_SIZE,
        borderLeftColor: 'transparent',
        borderRightColor: 'transparent',
        borderTopColor: 'white',
      }
      break
    }
    case 'left': {
      left = targetRect.left - tooltipW - GAP
      top = centerY - tooltipH / 2
      top = Math.max(GAP, Math.min(top, viewH - tooltipH - GAP))
      const arrowTop = centerY - top
      arrowStyle = {
        right: -ARROW_SIZE,
        top: arrowTop - ARROW_SIZE,
        borderRightWidth: 0,
        borderLeftWidth: ARROW_SIZE,
        borderTopWidth: ARROW_SIZE,
        borderBottomWidth: ARROW_SIZE,
        borderTopColor: 'transparent',
        borderBottomColor: 'transparent',
        borderLeftColor: 'white',
      }
      break
    }
    case 'right': {
      left = targetRect.right + GAP
      top = centerY - tooltipH / 2
      top = Math.max(GAP, Math.min(top, viewH - tooltipH - GAP))
      const arrowTop = centerY - top
      arrowStyle = {
        left: -ARROW_SIZE,
        top: arrowTop - ARROW_SIZE,
        borderLeftWidth: 0,
        borderRightWidth: ARROW_SIZE,
        borderTopWidth: ARROW_SIZE,
        borderBottomWidth: ARROW_SIZE,
        borderTopColor: 'transparent',
        borderBottomColor: 'transparent',
        borderRightColor: 'white',
      }
      break
    }
  }

  return { top, left, arrowStyle }
}

// ─── Onboarding Tour Component ─────────────────────────────────────────────

export function OnboardingTour() {
  const {
    isActive,
    currentStep,
    startTour,
    nextStep,
    prevStep,
    endTour,
    completeStep,
    isTourCompleted,
  } = useTourStore()
  const { setCurrentView } = useAppStore()

  const tooltipRef = useRef<HTMLDivElement>(null)
  const [position, setPosition] = useState<Position>({ arrowStyle: { display: 'none' } })
  const [targetRect, setTargetRect] = useState<DOMRect | null>(null)
  const hasAutoStarted = useRef(false)

  // Auto-start tour for first-time users
  useEffect(() => {
    if (!hasAutoStarted.current && !isTourCompleted()) {
      hasAutoStarted.current = true
      // Small delay so layout is ready
      const timer = setTimeout(() => {
        startTour()
      }, 1500)
      return () => clearTimeout(timer)
    }
  }, [isTourCompleted, startTour])

  const step = tourSteps[currentStep]

  // Execute step actions (e.g., navigate to a view)
  useEffect(() => {
    if (!isActive || !step) return
    if (currentStep === 2) {
      // Dashboard step: navigate to dashboard
      setCurrentView('dashboard')
    } else if (currentStep === 3) {
      // Drivers step: navigate to drivers
      setCurrentView('drivers')
    } else if (currentStep === 4) {
      // Trips step: navigate to trips
      setCurrentView('trips')
    }
    completeStep(`step-${currentStep}`)
  }, [currentStep, isActive])

  // Calculate tooltip position based on target element
  const updatePosition = useCallback(() => {
    if (!step || !tooltipRef.current) return

    const tooltipW = tooltipRef.current.offsetWidth
    const tooltipH = tooltipRef.current.offsetHeight
    const viewW = window.innerWidth
    const viewH = window.innerHeight

    let rect: DOMRect | null = null
    if (step.target) {
      const el = document.querySelector(step.target)
      if (el) {
        rect = el.getBoundingClientRect()
      }
    }

    setTargetRect(rect)
    const pos = getTooltipPosition(rect, step.placement, tooltipW, tooltipH, viewW, viewH)
    setPosition(pos)
  }, [step])

  // Update position on step change, resize, and scroll
  useEffect(() => {
    if (!isActive) return

    // Use a small delay so the DOM has rendered
    const timer = setTimeout(updatePosition, 50)

    window.addEventListener('resize', updatePosition)
    window.addEventListener('scroll', updatePosition, true)

    return () => {
      clearTimeout(timer)
      window.removeEventListener('resize', updatePosition)
      window.removeEventListener('scroll', updatePosition, true)
    }
  }, [isActive, currentStep, updatePosition])

  // Highlight ring styles for the target element
  useEffect(() => {
    if (!isActive || !step?.target) return
    const el = document.querySelector(step.target) as HTMLElement | null
    if (!el) return

    const originalPosition = el.style.position
    const originalZIndex = el.style.zIndex

    el.style.position = 'relative'
    el.style.zIndex = '50'

    return () => {
      el.style.position = originalPosition
      el.style.zIndex = originalZIndex
    }
  }, [isActive, currentStep, step?.target])

  // Handle Escape key
  useEffect(() => {
    if (!isActive) return
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') endTour()
    }
    document.addEventListener('keydown', handleKeyDown)
    return () => document.removeEventListener('keydown', handleKeyDown)
  }, [isActive, endTour])

  if (!isActive || !step) return null

  const totalSteps = tourSteps.length
  const isLastStep = currentStep === totalSteps - 1
  const isFirstStep = currentStep === 0
  const isCentered = !step.target

  return (
    <div className="fixed inset-0 z-[100]">
      {/* Backdrop */}
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        transition={{ duration: 0.2 }}
        className="absolute inset-0 bg-black/50 backdrop-blur-sm"
      />

      {/* Highlight ring around target */}
      {!isCentered && targetRect && (
        <motion.div
          initial={{ opacity: 0, scale: 0.9 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ duration: 0.25, ease: 'easeOut' }}
          className="absolute rounded-xl ring-4 ring-emerald-400 pointer-events-none"
          style={{
            top: targetRect.top - 6,
            left: targetRect.left - 6,
            width: targetRect.width + 12,
            height: targetRect.height + 12,
            boxShadow: '0 0 20px rgba(16, 185, 129, 0.4), 0 0 40px rgba(16, 185, 129, 0.15)',
          }}
        />
      )}

      {/* Centered overlay for welcome/complete steps */}
      <AnimatePresence mode="wait">
        {isCentered && (
          <motion.div
            key={`centered-${currentStep}`}
            initial={{ opacity: 0, scale: 0.9 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.95 }}
            transition={{ duration: 0.3, ease: 'easeOut' }}
            className="absolute inset-0 flex items-center justify-center p-4"
          >
            <div className="bg-white dark:bg-slate-800 rounded-2xl shadow-2xl max-w-sm w-full p-6 relative">
              {/* Decorative gradient blob */}
              <div className="absolute -top-16 left-1/2 -translate-x-1/2 w-32 h-32 bg-emerald-400/20 rounded-full blur-3xl pointer-events-none" />

              {/* Step counter */}
              <div className="flex items-center justify-between mb-4">
                <span className="text-xs text-muted-foreground font-medium">
                  {currentStep + 1} of {totalSteps}
                </span>
              </div>

              {/* Title */}
              <h2 className="text-xl font-bold mb-3">{step.title}</h2>

              {/* Content */}
              <div className="text-sm text-muted-foreground mb-6">
                {step.content}
              </div>

              {/* Navigation */}
              <div className="flex items-center justify-between">
                {!isLastStep ? (
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={endTour}
                    className="text-muted-foreground hover:text-foreground"
                  >
                    Skip
                  </Button>
                ) : (
                  <div />
                )}

                {isLastStep ? (
                  <Button
                    onClick={endTour}
                    className="bg-emerald-600 hover:bg-emerald-700 text-white shadow-md shadow-emerald-600/20"
                  >
                    Got it!
                  </Button>
                ) : (
                  <Button
                    onClick={nextStep}
                    className="bg-emerald-600 hover:bg-emerald-700 text-white shadow-md shadow-emerald-600/20"
                  >
                    Next
                  </Button>
                )}
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Tooltip for targeted steps */}
      <AnimatePresence mode="wait">
        {!isCentered && (
          <motion.div
            key={`tooltip-${currentStep}`}
            ref={tooltipRef}
            initial={{ opacity: 0, scale: 0.92 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.92 }}
            transition={{ duration: 0.25, ease: 'easeOut' }}
            className="absolute bg-white dark:bg-slate-800 rounded-xl shadow-2xl max-w-sm w-[calc(100vw-3rem)] pointer-events-auto"
            style={{
              top: position.top,
              left: position.left,
            }}
          >
            {/* Arrow */}
            <div
              className="absolute w-0 h-0 border-solid pointer-events-none"
              style={{
                ...position.arrowStyle,
              }}
            />

            <div className="p-4">
              {/* Header */}
              <div className="flex items-start justify-between mb-2">
                <h3 className="font-semibold text-lg pr-2">{step.title}</h3>
                <span className="text-xs text-muted-foreground font-medium whitespace-nowrap mt-1">
                  {currentStep + 1} of {totalSteps}
                </span>
              </div>

              {/* Content */}
              <div className="text-sm text-muted-foreground mb-4">
                {step.content}
              </div>

              {/* Navigation */}
              <div className="flex items-center justify-between pt-2 border-t border-border/50">
                <div className="flex items-center gap-1">
                  {!isFirstStep && (
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={prevStep}
                      className="h-7 px-2 text-xs"
                    >
                      Previous
                    </Button>
                  )}
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={endTour}
                    className="h-7 px-2 text-xs text-muted-foreground hover:text-foreground"
                  >
                    Skip
                  </Button>
                </div>
                {isLastStep ? (
                  <Button
                    onClick={endTour}
                    size="sm"
                    className="bg-emerald-600 hover:bg-emerald-700 text-white shadow-sm"
                  >
                    Got it!
                  </Button>
                ) : (
                  <Button
                    onClick={nextStep}
                    size="sm"
                    className="bg-emerald-600 hover:bg-emerald-700 text-white shadow-sm"
                  >
                    Next
                  </Button>
                )}
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}
