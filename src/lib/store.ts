import { create } from 'zustand'

export type ViewName =
  | 'dashboard'
  | 'drivers'
  | 'trucks'
  | 'warehouses'
  | 'zone-rates'
  | 'trips'
  | 'trip-calendar'
  | 'cash-advances'
  | 'incentives'
  | 'reports'
  | 'settings'

interface AppState {
  currentView: ViewName
  sidebarOpen: boolean
  setCurrentView: (view: ViewName) => void
  setSidebarOpen: (open: boolean) => void
  toggleSidebar: () => void
}

export const useAppStore = create<AppState>((set) => ({
  currentView: 'dashboard',
  sidebarOpen: true,
  setCurrentView: (view) => set({ currentView: view }),
  setSidebarOpen: (open) => set({ sidebarOpen: open }),
  toggleSidebar: () => set((state) => ({ sidebarOpen: !state.sidebarOpen })),
}))
