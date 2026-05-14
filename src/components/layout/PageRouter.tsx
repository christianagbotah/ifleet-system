'use client'

import { type ViewName } from '@/lib/store'
import { lazy, Suspense } from 'react'
import { Loader2 } from 'lucide-react'
import { useAppStore } from '@/lib/store'
import { AnimatePresence, motion } from 'framer-motion'

const DashboardPage = lazy(() => import('@/components/pages/DashboardPage'))
const DriversPage = lazy(() => import('@/components/pages/DriversPage'))
const TrucksPage = lazy(() => import('@/components/pages/TrucksPage'))
const WarehousesPage = lazy(() => import('@/components/pages/WarehousesPage'))
const ZoneRatesPage = lazy(() => import('@/components/pages/ZoneRatesPage'))
const TripsPage = lazy(() => import('@/components/pages/TripsPage'))
const TripCalendarPage = lazy(() => import('@/components/pages/TripCalendarPage'))
const CashAdvancesPage = lazy(() => import('@/components/pages/CashAdvancesPage'))
const IncentivesPage = lazy(() => import('@/components/pages/IncentivesPage'))
const ReportsPage = lazy(() => import('@/components/pages/ReportsPage'))
const SettingsPage = lazy(() => import('@/components/pages/SettingsPage'))

function PageLoader() {
  return (
    <div className="flex items-center justify-center h-[50vh]">
      <Loader2 className="size-8 animate-spin text-muted-foreground" />
    </div>
  )
}

const pageComponents: Record<ViewName, React.ComponentType> = {
  dashboard: DashboardPage,
  drivers: DriversPage,
  trucks: TrucksPage,
  warehouses: WarehousesPage,
  'zone-rates': ZoneRatesPage,
  trips: TripsPage,
  'trip-calendar': TripCalendarPage,
  'cash-advances': CashAdvancesPage,
  incentives: IncentivesPage,
  reports: ReportsPage,
  settings: SettingsPage,
}

export function PageRouter() {
  const { currentView } = useAppStore()
  const PageComponent = pageComponents[currentView]

  return (
    <AnimatePresence mode="wait">
      <motion.div
        key={currentView}
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        exit={{ opacity: 0, y: -8 }}
        transition={{ duration: 0.2, ease: 'easeOut' }}
      >
        <Suspense fallback={<PageLoader />}>
          <PageComponent />
        </Suspense>
      </motion.div>
    </AnimatePresence>
  )
}
