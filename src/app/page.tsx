'use client'
import { APP_COPYRIGHT, APP_NAME, navigationGroups } from '@/lib/constants'

import dynamic from 'next/dynamic'
import { SidebarProvider, SidebarInset } from '@/components/ui/sidebar'
import { AppSidebar } from '@/components/layout/AppSidebar'
import { AppHeader } from '@/components/layout/AppHeader'
import { MobileBottomNav } from '@/components/layout/MobileBottomNav'
import { CommandPalette } from '@/components/layout/CommandPalette'
import { QuickActionsFab } from '@/components/layout/QuickActionsFab'
import { LoginView } from '@/components/auth/LoginView'
import { useAuthStore, canAccessNav } from '@/lib/store/auth'
import { useHighlightStore } from '@/lib/store/highlight'
import { useKeyboardShortcuts } from '@/lib/hooks/useKeyboardShortcuts'
import { ErrorBoundary } from '@/components/ui/error-boundary'
import React, { useState, useEffect, useCallback, useRef } from 'react'

// Lazy load ALL view components with ssr: false to prevent SSR hydration crashes
const DashboardView = dynamic(
  () => import('@/components/dashboard/DashboardView').then(m => ({ default: m.DashboardView })),
  { ssr: false, loading: () => <ViewLoader /> }
)
const TrucksView = dynamic(
  () => import('@/components/trucks/TrucksView').then(m => ({ default: m.TrucksView })),
  { ssr: false, loading: () => <ViewLoader /> }
)
const DriversView = dynamic(
  () => import('@/components/drivers/DriversView').then(m => ({ default: m.DriversView })),
  { ssr: false, loading: () => <ViewLoader /> }
)
const TripsView = dynamic(
  () => import('@/components/trips/TripsView').then(m => ({ default: m.TripsView })),
  { ssr: false, loading: () => <ViewLoader /> }
)
const ExpensesView = dynamic(
  () => import('@/components/expenses/ExpensesView').then(m => ({ default: m.ExpensesView })),
  { ssr: false, loading: () => <ViewLoader /> }
)
const MaintenanceView = dynamic(
  () => import('@/components/maintenance/MaintenanceView').then(m => ({ default: m.MaintenanceView })),
  { ssr: false, loading: () => <ViewLoader /> }
)
const PayrollView = dynamic(
  () => import('@/components/payroll/PayrollView').then(m => ({ default: m.PayrollView })),
  { ssr: false, loading: () => <ViewLoader /> }
)
const SettlementsView = dynamic(
  () => import('@/components/settlements/SettlementsView').then(m => ({ default: m.SettlementsView })),
  { ssr: false, loading: () => <ViewLoader /> }
)
const NotificationsView = dynamic(
  () => import('@/components/notifications/NotificationsView').then(m => ({ default: m.NotificationsView })),
  { ssr: false, loading: () => <ViewLoader /> }
)
const PricingView = dynamic(
  () => import('@/components/pricing/PricingView').then(m => ({ default: m.PricingView })),
  { ssr: false, loading: () => <ViewLoader /> }
)
const ItemsView = dynamic(
  () => import('@/components/items/ItemsView').then(m => ({ default: m.ItemsView })),
  { ssr: false, loading: () => <ViewLoader /> }
)
const LiveTrackingView = dynamic(
  () => import('@/components/tracking/LiveTrackingView').then(m => ({ default: m.LiveTrackingView })),
  { ssr: false, loading: () => <ViewLoader /> }
)
const DriverLocationSender = dynamic(
  () => import('@/components/tracking/DriverLocationSender').then(m => ({ default: m.DriverLocationSender })),
  { ssr: false, loading: () => <ViewLoader /> }
)
const WaybillsView = dynamic(
  () => import('@/components/waybills/WaybillsView').then(m => ({ default: m.WaybillsView })),
  { ssr: false, loading: () => <ViewLoader /> }
)
const TyresView = dynamic(
  () => import('@/components/tyres/TyresView').then(m => ({ default: m.TyresView })),
  { ssr: false, loading: () => <ViewLoader /> }
)
const InsuranceView = dynamic(
  () => import('@/components/insurance/InsuranceView').then(m => ({ default: m.InsuranceView })),
  { ssr: false, loading: () => <ViewLoader /> }
)
const UsersView = dynamic(
  () => import('@/components/users/UsersView').then(m => ({ default: m.UsersView })),
  { ssr: false, loading: () => <ViewLoader /> }
)
const SettingsView = dynamic(
  () => import('@/components/settings/SettingsView').then(m => ({ default: m.SettingsView })),
  { ssr: false, loading: () => <ViewLoader /> }
)
const ProfileView = dynamic(
  () => import('@/components/profile/ProfileView').then(m => ({ default: m.ProfileView })),
  { ssr: false, loading: () => <ViewLoader /> }
)
const DriverTripController = dynamic(
  () => import('@/components/trips/DriverTripController').then(m => ({ default: m.DriverTripController })),
  { ssr: false, loading: () => <ViewLoader /> }
)
const ClientsView = dynamic(
  () => import('@/components/clients/ClientsView').then(m => ({ default: m.ClientsView })),
  { ssr: false, loading: () => <ViewLoader /> }
)
const SuppliersView = dynamic(
  () => import('@/components/suppliers/SuppliersView').then(m => ({ default: m.SuppliersView })),
  { ssr: false, loading: () => <ViewLoader /> }
)
const AnalyticsView = dynamic(
  () => import('@/components/analytics/AnalyticsView').then(m => ({ default: m.AnalyticsView })),
  { ssr: false, loading: () => <ViewLoader /> }
)
const FuelLogsView = dynamic(
  () => import('@/components/fuel/FuelLogsView').then(m => ({ default: m.FuelLogsView })),
  { ssr: false, loading: () => <ViewLoader /> }
)
const FuelConsumptionView = dynamic(
  () => import('@/components/fuel/FuelConsumptionView').then(m => ({ default: m.FuelConsumptionView })),
  { ssr: false, loading: () => <ViewLoader /> }
)
const FuelAnalyticsView = dynamic(
  () => import('@/components/fuel/FuelAnalyticsView').then(m => ({ default: m.FuelAnalyticsView })),
  { ssr: false, loading: () => <ViewLoader /> }
)
const FuelBudgetView = dynamic(
  () => import('@/components/fuel/FuelBudgetView').then(m => ({ default: m.FuelBudgetView })),
  { ssr: false, loading: () => <ViewLoader /> }
)
const DriverPerformanceView = dynamic(
  () => import('@/components/drivers/DriverPerformanceView').then(m => ({ default: m.DriverPerformanceView })),
  { ssr: false, loading: () => <ViewLoader /> }
)
const DocumentsView = dynamic(
  () => import('@/components/documents/DocumentsView').then(m => ({ default: m.DocumentsView })),
  { ssr: false, loading: () => <ViewLoader /> }
)
const ReportsView = dynamic(
  () => import('@/components/reports/ReportsView').then(m => ({ default: m.ReportsView })),
  { ssr: false, loading: () => <ViewLoader /> }
)
const CostAnalyticsView = dynamic(
  () => import('@/components/analytics/CostAnalyticsView').then(m => ({ default: m.CostAnalyticsView })),
  { ssr: false, loading: () => <ViewLoader /> }
)
const InvoicesView = dynamic(
  () => import('@/components/invoices/InvoicesView').then(m => ({ default: m.InvoicesView })),
  { ssr: false, loading: () => <ViewLoader /> }
)
const DvlaView = dynamic(
  () => import('@/components/compliance/DvlaView').then(m => ({ default: m.DvlaView })),
  { ssr: false, loading: () => <ViewLoader /> }
)
const RoadworthyView = dynamic(
  () => import('@/components/compliance/RoadworthyView').then(m => ({ default: m.RoadworthyView })),
  { ssr: false, loading: () => <ViewLoader /> }
)
const ProfitabilityView = dynamic(
  () => import('@/components/analytics/ProfitabilityView').then(m => ({ default: m.ProfitabilityView })),
  { ssr: false, loading: () => <ViewLoader /> }
)
const ComplianceDashboardView = dynamic(
  () => import('@/components/compliance/ComplianceDashboardView').then(m => ({ default: m.ComplianceDashboardView })),
  { ssr: false, loading: () => <ViewLoader /> }
)
const MaintenanceSchedulerView = dynamic(
  () => import('@/components/maintenance/MaintenanceSchedulerView').then(m => ({ default: m.MaintenanceSchedulerView })),
  { ssr: false, loading: () => <ViewLoader /> }
)
const SafetyScoringView = dynamic(
  () => import('@/components/drivers/SafetyScoringView').then(m => ({ default: m.SafetyScoringView })),
  { ssr: false, loading: () => <ViewLoader /> }
)
const DriverIncentivesView = dynamic(
  () => import('@/components/drivers/DriverIncentivesView').then(m => ({ default: m.DriverIncentivesView })),
  { ssr: false, loading: () => <ViewLoader /> }
)
const FuelAnomalyDashboard = dynamic(
  () => import('@/components/fuel/FuelAnomalyDashboard').then(m => ({ default: m.FuelAnomalyDashboard })),
  { ssr: false, loading: () => <ViewLoader /> }
)
const RouteOptimizerView = dynamic(
  () => import('@/components/operations/RouteOptimizerView').then(m => ({ default: m.RouteOptimizerView })),
  { ssr: false, loading: () => <ViewLoader /> }
)
const AuditLogView = dynamic(
  () => import('@/components/admin/AuditLogView').then(m => ({ default: m.AuditLogView })),
  { ssr: false, loading: () => <ViewLoader /> }
)
const ClientPortalView = dynamic(
  () => import('@/components/portal/ClientPortalView').then(m => ({ default: m.ClientPortalView })),
  { ssr: false, loading: () => <ViewLoader /> }
)
const CashAdvancesView = dynamic(
  () => import('@/components/finance/CashAdvancesView').then(m => ({ default: m.CashAdvancesView })),
  { ssr: false, loading: () => <ViewLoader /> }
)
const VehicleInspectionsView = dynamic(
  () => import('@/components/maintenance/VehicleInspectionsView').then(m => ({ default: m.VehicleInspectionsView })),
  { ssr: false, loading: () => <ViewLoader /> }
)
const TollTrackerView = dynamic(
  () => import('@/components/finance/TollTrackerView').then(m => ({ default: m.TollTrackerView })),
  { ssr: false, loading: () => <ViewLoader /> }
)
const FuelPriceTrackerView = dynamic(
  () => import('@/components/fuel/FuelPriceTrackerView').then(m => ({ default: m.FuelPriceTrackerView })),
  { ssr: false, loading: () => <ViewLoader /> }
)
const RoadConditionsView = dynamic(
  () => import('@/components/operations/RoadConditionsView').then(m => ({ default: m.RoadConditionsView })),
  { ssr: false, loading: () => <ViewLoader /> }
)
const ExpenseApprovalsView = dynamic(
  () => import('@/components/finance/ExpenseApprovalsView').then(m => ({ default: m.ExpenseApprovalsView })),
  { ssr: false, loading: () => <ViewLoader /> }
)
const InsuranceClaimsView = dynamic(
  () => import('@/components/insurance/InsuranceClaimsView').then(m => ({ default: m.InsuranceClaimsView })),
  { ssr: false, loading: () => <ViewLoader /> }
)
const WarehouseInventoryView = dynamic(
  () => import('@/components/maintenance/WarehouseInventoryView').then(m => ({ default: m.WarehouseInventoryView })),
  { ssr: false, loading: () => <ViewLoader /> }
)
const LoadBoardView = dynamic(
  () => import('@/components/operations/LoadBoardView').then(m => ({ default: m.LoadBoardView })),
  { ssr: false, loading: () => <ViewLoader /> }
)
const BorderCrossingsView = dynamic(
  () => import('@/components/operations/BorderCrossingsView').then(m => ({ default: m.BorderCrossingsView })),
  { ssr: false, loading: () => <ViewLoader /> }
)
const WeightVerificationView = dynamic(
  () => import('@/components/operations/WeightVerificationView').then(m => ({ default: m.WeightVerificationView })),
  { ssr: false, loading: () => <ViewLoader /> }
)
const DepotQueueView = dynamic(
  () => import('@/components/operations/DepotQueueView').then(m => ({ default: m.DepotQueueView })),
  { ssr: false, loading: () => <ViewLoader /> }
)
const TruckFinancialsView = dynamic(
  () => import('@/components/financials/TruckFinancialsView').then(m => ({ default: m.TruckFinancialsView })),
  { ssr: false, loading: () => <ViewLoader /> }
)
const LoadingCitiesView = dynamic(
  () => import('@/components/locations/LoadingCitiesView').then(m => ({ default: m.LoadingCitiesView })),
  { ssr: false, loading: () => <ViewLoader /> }
)
const LoadingPointsView = dynamic(
  () => import('@/components/locations/LoadingPointsView').then(m => ({ default: m.LoadingPointsView })),
  { ssr: false, loading: () => <ViewLoader /> }
)
const DestinationCitiesView = dynamic(
  () => import('@/components/locations/DestinationCitiesView').then(m => ({ default: m.DestinationCitiesView })),
  { ssr: false, loading: () => <ViewLoader /> }
)
const DestinationZonesView = dynamic(
  () => import('@/components/locations/DestinationZonesView').then(m => ({ default: m.DestinationZonesView })),
  { ssr: false, loading: () => <ViewLoader /> }
)
const ZoneRatesView = dynamic(
  () => import('@/components/locations/ZoneRatesView').then(m => ({ default: m.ZoneRatesView })),
  { ssr: false, loading: () => <ViewLoader /> }
)


function ViewLoader() {
  return (
    <div className="flex items-center justify-center py-20">
      <div className="flex flex-col items-center gap-3">
        <div className="h-8 w-8 animate-spin rounded-full border-4 border-amber-200 border-t-amber-500" />
        <p className="text-sm text-muted-foreground">Loading...</p>
      </div>
    </div>
  )
}

function PageContent({ page, onNavigate }: { page: string; onNavigate: (page: string) => void }) {
  const { user } = useAuthStore()

  // Permission gate: check if user can access this page
  if (user && !canAccessNav(page)) {
    return (
      <div className="flex items-center justify-center py-20">
        <div className="text-center">
          <h2 className="text-xl font-semibold text-muted-foreground">Access Denied</h2>
          <p className="text-sm text-muted-foreground mt-1">You don't have permission to view this page.</p>
        </div>
      </div>
    )
  }

  switch (page) {
    case 'dashboard':
      return <DashboardView onNavigate={onNavigate} />
    case 'analytics':
      return <AnalyticsView />
    case 'driver-performance':
      return <DriverPerformanceView />
    case 'safety-scoring':
      return <SafetyScoringView />
    case 'driver-incentives':
      return <DriverIncentivesView />
    case 'trucks':
      return <TrucksView />
    case 'drivers':
      return <DriversView />
    case 'trips':
      return <TripsView />
    case 'active-trip':
      return <DriverTripController />
    case 'truck-financials':
      return <TruckFinancialsView />
    case 'expenses':
      return <ExpensesView />
    case 'maintenance':
      return <MaintenanceView />
    case 'maintenance-scheduler':
      return <MaintenanceSchedulerView />
    case 'payroll':
      return <PayrollView />
    case 'settlements':
      return <SettlementsView />
    case 'notifications':
      return <NotificationsView />
    case 'pricing':
      return <PricingView />
    case 'items':
      return <ItemsView />
    case 'fuel-logs':
      return <FuelLogsView />
    case 'fuel-consumption':
      return <FuelConsumptionView />
    case 'fuel-analytics':
      return <FuelAnalyticsView />
    case 'fuel-anomaly':
      return <FuelAnomalyDashboard />
    case 'fuel-budgets':
      return <FuelBudgetView />
    case 'tracking':
      return <LiveTrackingView />
    case 'driver-tracking':
      return <DriverLocationSender />
    case 'waybills':
      return <WaybillsView />
    case 'clients':
      return <ClientsView />
    case 'suppliers':
      return <SuppliersView />
    case 'route-optimizer':
      return <RouteOptimizerView />
    case 'documents':
      return <DocumentsView />
    case 'reports':
      return <ReportsView />
    case 'cost-analytics':
      return <CostAnalyticsView />
    case 'invoices':
      return <InvoicesView />
    case 'tyres':
      return <TyresView />
    case 'insurance':
      return <InsuranceView />
    case 'dvla':
      return <DvlaView />
    case 'roadworthy':
      return <RoadworthyView />
    case 'trip-profitability':
      return <ProfitabilityView />
    case 'compliance-center':
      return <ComplianceDashboardView />
    case 'users':
      return <UsersView />
    case 'audit-log':
      return <AuditLogView />
    case 'client-portal':
      return <ClientPortalView />
    case 'cash-advances':
      return <CashAdvancesView />
    case 'vehicle-inspections':
      return <VehicleInspectionsView />
    case 'toll-tracker':
      return <TollTrackerView />
    case 'fuel-prices':
      return <FuelPriceTrackerView />
    case 'road-conditions':
      return <RoadConditionsView />
    case 'expense-approvals':
      return <ExpenseApprovalsView />
    case 'insurance-claims':
      return <InsuranceClaimsView />
    case 'warehouse':
      return <WarehouseInventoryView />
    case 'load-board':
      return <LoadBoardView />
    case 'border-crossings':
      return <BorderCrossingsView />
    case 'weight-verifications':
      return <WeightVerificationView />
    case 'depot-queue':
      return <DepotQueueView />
    case 'loading-cities':
      return <LoadingCitiesView />
    case 'loading-points':
      return <LoadingPointsView />
    case 'destination-cities':
      return <DestinationCitiesView />
    case 'destination-zones':
      return <DestinationZonesView />
    case 'zone-rates':
      return <ZoneRatesView />
    case 'settings':
      return <SettingsView />
    case 'profile':
      return <ProfileView />
    default:
      return <DashboardView />
  }
}

function CommandPaletteWrapper({ onNavigate }: { currentPage: string; onNavigate: (page: string) => void }) {
  const [open, setOpen] = useState(false)

  const handleToggle = useCallback(() => {
    setOpen((prev) => !prev)
  }, [])

  const handleNavigate = useCallback(
    (page: string) => {
      onNavigate(page)
      setOpen(false)
    },
    [onNavigate]
  )

  useKeyboardShortcuts({
    onToggleCommandPalette: handleToggle,
    onGoHome: () => onNavigate('dashboard'),
    onNewTrip: () => handleNavigate('trips'),
    onNewTruck: () => handleNavigate('trucks'),
    onNewDriver: () => handleNavigate('drivers'),
    onRecordExpense: () => handleNavigate('expenses'),
  })

  return (
    <CommandPalette
      open={open}
      onOpenChange={setOpen}
      onNavigate={handleNavigate}
    />
  )
}

export default function Home() {
  // Read initial page from URL hash so browser back/forward and refresh work
  const getInitialPage = useCallback(() => {
    if (typeof window === 'undefined') return 'dashboard'
    const hash = window.location.hash.replace('#', '')
    return hash || 'dashboard'
  }, [])

  const [currentPage, setCurrentPage] = useState(getInitialPage)

  // Ref to avoid re-registering popstate listener on every render
  const navigationRef = useRef<(page: string) => void>()

  // Wrap setCurrentPage to also update browser history (hash)
  const navigateTo = useCallback((page: string | { page: string; entityId?: string; entityType?: string }) => {
    const pageId = typeof page === 'string' ? page : page.page

    // Entity-aware highlight (when navigated with entity info)
    if (typeof page === 'object' && page.entityId && page.entityType) {
      useHighlightStore.getState().setHighlight(page.entityId, page.entityType)
    }

    setCurrentPage(pageId)
    // Update URL hash without triggering a reload
    window.history.pushState({ page: pageId }, '', `#${pageId}`)
  }, [])

  // Keep ref in sync
  navigationRef.current = navigateTo

  // Synchronously hydrate auth state from localStorage on the very first client
  // render — BEFORE the isHydrated / isAuthenticated checks below.
  // This prevents the login page from flashing on page refresh because the
  // store is populated before React decides what to paint.
  // The ref guard ensures this only runs once (React may invoke the component
  // function multiple times in StrictMode, but hydrate() is idempotent).
  const hydrationRef = React.useRef(false)
  if (!hydrationRef.current && typeof window !== 'undefined') {
    hydrationRef.current = true
    useAuthStore.getState().hydrate()
  }

  const { isAuthenticated, isHydrated, user } = useAuthStore()

  // Listen to browser back/forward buttons via popstate
  useEffect(() => {
    function handlePopState(event: PopStateEvent) {
      const state = event.state
      if (state && typeof state.page === 'string') {
        setCurrentPage(state.page)
      } else {
        // Fallback: read from hash
        const hash = window.location.hash.replace('#', '')
        setCurrentPage(hash || 'dashboard')
      }
    }
    window.addEventListener('popstate', handlePopState)
    return () => window.removeEventListener('popstate', handlePopState)
  }, [])

  // Dynamic browser tab title based on current page
  useEffect(() => {
    const allItems = navigationGroups.flatMap(g => g.items)
    const specialTitles: Record<string, string> = {
      profile: 'Profile',
      login: 'Login',
      pricing: 'Zone Pricing',
      'driver-tracking': 'Driver Tracking',
    }
    const label = specialTitles[currentPage] ?? allItems.find(i => i.id === currentPage)?.label ?? 'Dashboard'
    document.title = `${label} — ${APP_NAME}`
  }, [currentPage])

  // Navigate via custom events (supports string page ID or { page, entityId, entityType } object)
  useEffect(() => {
    function handleNavigate(e: Event) {
      const detail = (e as CustomEvent).detail
      if (navigationRef.current) {
        navigationRef.current(detail)
      }
    }
    window.addEventListener('navigate-page', handleNavigate)
    return () => window.removeEventListener('navigate-page', handleNavigate)
  }, [])

  // Set initial history state on mount so back button doesn't leave the app
  useEffect(() => {
    const initialPage = getInitialPage()
    // Replace current state (not push) so we don't create a duplicate entry
    window.history.replaceState({ page: initialPage }, '', `#${initialPage}`)
  }, [getInitialPage])

  // Still hydrating (reading from localStorage) — show full-screen loader
  // to prevent flashing the login page on refresh when the user is already logged in.
  if (!isHydrated) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <div className="flex flex-col items-center gap-3">
          <div className="h-10 w-10 animate-spin rounded-full border-4 border-amber-200 border-t-amber-500" />
          <p className="text-sm text-muted-foreground">Loading...</p>
        </div>
      </div>
    )
  }

  // Hydration complete — not authenticated → show login page
  if (!isAuthenticated || !user) {
    return (
      <ErrorBoundary>
        <LoginView />
      </ErrorBoundary>
    )
  }

  return (
    <ErrorBoundary>
      <SidebarProvider>
        <AppSidebar currentPage={currentPage} onNavigate={navigateTo} />
        <SidebarInset>
          <AppHeader currentPage={currentPage} onNavigate={navigateTo} />
          <main className="flex-1 overflow-x-hidden overflow-y-auto p-3 sm:p-4 md:p-6 pb-20 md:pb-6">
            <PageContent page={currentPage} onNavigate={navigateTo} />
          </main>
          <footer className="hidden md:block mt-auto border-t px-4 py-3 text-center text-xs text-muted-foreground shrink-0">
            {APP_COPYRIGHT}
          </footer>
          {/* Mobile Bottom Tab Navigation */}
          <MobileBottomNav currentPage={currentPage} onNavigate={navigateTo} />
          {/* Command Palette & Quick Actions */}
          <CommandPaletteWrapper currentPage={currentPage} onNavigate={navigateTo} />
          <QuickActionsFab onNavigate={navigateTo} />
        </SidebarInset>
      </SidebarProvider>
    </ErrorBoundary>
  )
}
