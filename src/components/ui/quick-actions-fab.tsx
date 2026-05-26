'use client'

import { useState, useEffect, useSyncExternalStore } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { Plus, Route, UserPlus, Truck, Wallet, BarChart3 } from 'lucide-react'
import { useAppStore, type ViewName } from '@/lib/store'
import { cn } from '@/lib/utils'
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip'

interface FabAction {
  label: string
  icon: React.ReactNode
  view: ViewName
  color: string
  hoverColor: string
  shadowColor: string
}

const fabActions: FabAction[] = [
  {
    label: 'New Trip',
    icon: <Route className="size-4" />,
    view: 'trips',
    color: 'bg-emerald-500 text-white',
    hoverColor: 'hover:bg-emerald-600',
    shadowColor: 'shadow-emerald-500/30',
  },
  {
    label: 'Add Driver',
    icon: <UserPlus className="size-4" />,
    view: 'drivers',
    color: 'bg-blue-500 text-white',
    hoverColor: 'hover:bg-blue-600',
    shadowColor: 'shadow-blue-500/30',
  },
  {
    label: 'Add Truck',
    icon: <Truck className="size-4" />,
    view: 'trucks',
    color: 'bg-amber-500 text-white',
    hoverColor: 'hover:bg-amber-600',
    shadowColor: 'shadow-amber-500/30',
  },
  {
    label: 'New Cash Advance',
    icon: <Wallet className="size-4" />,
    view: 'cash-advances',
    color: 'bg-violet-500 text-white',
    hoverColor: 'hover:bg-violet-600',
    shadowColor: 'shadow-violet-500/30',
  },
  {
    label: 'View Reports',
    icon: <BarChart3 className="size-4" />,
    view: 'reports',
    color: 'bg-rose-500 text-white',
    hoverColor: 'hover:bg-rose-600',
    shadowColor: 'shadow-rose-500/30',
  },
]

function QuickActionsFab() {
  const [isOpen, setIsOpen] = useState(false)
  const [isMobile, setIsMobile] = useState(false)
  const { setCurrentView } = useAppStore()

  // Avoid hydration mismatch for fixed positioning
  const mounted = useSyncExternalStore(
    () => () => {},
    () => true,
    () => false
  )

  useEffect(() => {
    const check = () => setIsMobile(window.innerWidth < 768)
    check()
    window.addEventListener('resize', check)
    return () => window.removeEventListener('resize', check)
  }, [])

  // Close when clicking outside or pressing Escape
  useEffect(() => {
    if (!isOpen) return
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setIsOpen(false)
    }
    document.addEventListener('keydown', handleKeyDown)
    return () => document.removeEventListener('keydown', handleKeyDown)
  }, [isOpen])

  const handleAction = (view: ViewName) => {
    setIsOpen(false)
    setCurrentView(view)
  }

  // Calculate positions for the fan-out arc
  const getItemPosition = (index: number, total: number) => {
    // Fan out upward in an arc from bottom-right
    const startAngle = -15 // slight left lean at bottom
    const endAngle = -105 // more left lean at top
    const angle = startAngle + (index / (total - 1)) * (endAngle - startAngle)
    const radius = 80 // distance from FAB center
    const rad = (angle * Math.PI) / 180
    return {
      x: Math.cos(rad) * radius,
      y: Math.sin(rad) * radius,
    }
  }

  if (!mounted) return null

  return (
    <TooltipProvider delayDuration={150}>
      <div className="fixed bottom-20 right-5 z-50 flex flex-col items-end">
        {/* Semi-transparent backdrop overlay */}
        <AnimatePresence>
          {isOpen && (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.2 }}
              className="fixed inset-0 bg-black/20 backdrop-blur-[2px] z-[-1]"
              onClick={() => setIsOpen(false)}
            />
          )}
        </AnimatePresence>

        {/* Speed dial items */}
        <AnimatePresence>
          {isOpen && (
            <div className="relative flex flex-col items-end mb-3">
              {fabActions.map((action, index) => {
                const pos = getItemPosition(index, fabActions.length)
                return (
                  <motion.div
                    key={action.label}
                    initial={{ opacity: 0, scale: 0.3, x: 0, y: 0 }}
                    animate={{
                      opacity: 1,
                      scale: 1,
                      x: pos.x,
                      y: pos.y,
                    }}
                    exit={{ opacity: 0, scale: 0.3, x: 0, y: 0 }}
                    transition={{
                      duration: 0.25,
                      delay: index * 0.05,
                      ease: [0.4, 0, 0.2, 1],
                    }}
                    className="absolute right-0 bottom-0"
                  >
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <button
                          onClick={() => handleAction(action.view)}
                          className={cn(
                            'size-11 rounded-full flex items-center justify-center shadow-lg transition-all duration-200 cursor-pointer',
                            action.color,
                            action.hoverColor,
                            action.shadowColor,
                            'dark:shadow-none',
                            'active:scale-90'
                          )}
                          aria-label={action.label}
                        >
                          {action.icon}
                        </button>
                      </TooltipTrigger>
                      <TooltipContent
                        side="left"
                        className="font-medium text-xs dark:bg-slate-800 dark:text-slate-100"
                      >
                        {action.label}
                      </TooltipContent>
                    </Tooltip>
                  </motion.div>
                )
              })}
            </div>
          )}
        </AnimatePresence>

        {/* Main FAB button */}
        <motion.button
          whileHover={{ scale: 1.05 }}
          whileTap={{ scale: 0.95 }}
          onClick={() => setIsOpen(!isOpen)}
          className={cn(
            'size-14 rounded-full flex items-center justify-center shadow-xl transition-all duration-300 cursor-pointer',
            'bg-emerald-600 hover:bg-emerald-700 text-white',
            'dark:bg-emerald-600 dark:hover:bg-emerald-700',
            isOpen ? 'shadow-emerald-600/40' : 'shadow-emerald-600/25',
            'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-400 focus-visible:ring-offset-2'
          )}
          aria-label={isOpen ? 'Close quick actions' : 'Open quick actions'}
          data-tour="quick-actions"
        >
          <motion.div
            animate={{ rotate: isOpen ? 45 : 0 }}
            transition={{ duration: 0.25, ease: [0.4, 0, 0.2, 1] }}
          >
            <Plus className="size-6" />
          </motion.div>
        </motion.button>
      </div>
    </TooltipProvider>
  )
}

export default QuickActionsFab
