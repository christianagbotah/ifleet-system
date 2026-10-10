import { create } from 'zustand'

export interface AuthUser {
  id: string
  email: string
  name: string
  phone: string | null
  avatar: string | null
  role: string
  permissions: string[]
  driverId?: string | null
  isActive: boolean
  isDemo?: boolean
  demoProfile?: string | null
  demoLabel?: string | null
  demoDescription?: string | null
  demoCapability?: string | null
  position?: string | null
  department?: string | null
}

interface AuthState {
  user: AuthUser | null
  isAuthenticated: boolean
  isLoading: boolean
  isHydrated: boolean
  token: string | null
  login: (email: string, password: string) => Promise<void>
  demoLogin: (profile: string) => Promise<void>
  logout: () => void
  setUser: (user: AuthUser | null) => void
  setToken: (token: string | null) => void
  hydrate: () => void
  hasPermission: (permission: string) => boolean
  hasAnyPermission: (permissions: string[]) => boolean
  canSeeFinancialData: () => boolean
  getToken: () => string | null
}

const STORAGE_KEY = 'fleetpro-auth'

interface PersistedAuth {
  user: AuthUser | null
  token: string | null
  isAuthenticated: boolean
}

function readStorage(): PersistedAuth | null {
  if (typeof window === 'undefined') return null
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return null
    const parsed = JSON.parse(raw)
    const user = parsed.user ?? parsed.state?.user ?? null
    const token = parsed.token ?? parsed.state?.token ?? null
    const isAuthenticated = parsed.isAuthenticated ?? parsed.state?.isAuthenticated ?? false
    if (!user || !token || !isAuthenticated) return null
    return { user, token, isAuthenticated }
  } catch {
    return null
  }
}

function writeStorage(user: AuthUser | null, token: string | null, isAuthenticated: boolean): void {
  if (typeof window === 'undefined') return
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ user, token, isAuthenticated }))
  } catch {
    // localStorage full or unavailable — ignore
  }
}

function clearStorage(): void {
  if (typeof window === 'undefined') return
  try {
    localStorage.removeItem(STORAGE_KEY)
  } catch {
    // ignore
  }
}

function isJwtExpired(token: string): boolean {
  try {
    const base64 = token.split('.')[1]
    if (!base64) return true
    const payload = JSON.parse(atob(base64.replace(/-/g, '+').replace(/_/g, '/')))
    if (!payload.exp) return false
    return payload.exp * 1000 < Date.now() - 30000
  } catch {
    return true
  }
}

export const useAuthStore = create<AuthState>()((set, get) => ({
  user: null,
  isAuthenticated: false,
  isLoading: false,
  isHydrated: false,
  token: null,

  hydrate: () => {
    if (get().isAuthenticated && get().token) {
      set({ isHydrated: true })
      return
    }

    const stored = readStorage()
    if (stored?.token && stored?.user && stored.isAuthenticated) {
      if (!isJwtExpired(stored.token)) {
        set({
          user: stored.user,
          token: stored.token,
          isAuthenticated: true,
          isHydrated: true,
        })
        return
      }
      clearStorage()
    }

    set({ isHydrated: true })
  },

  login: async (email: string, password: string) => {
    set({ isLoading: true })
    try {
      const res = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password }),
      })

      if (!res.ok) {
        const err = await res.json().catch(() => ({ error: 'Login failed' }))
        throw new Error(err.error || 'Login failed')
      }

      const data = await res.json()
      const token = data.token || null
      writeStorage(data.user, token, true)
      set({
        user: data.user,
        token,
        isAuthenticated: true,
        isLoading: false,
      })
    } catch (error) {
      set({ isLoading: false })
      throw error
    }
  },

  demoLogin: async (profile: string) => {
    set({ isLoading: true })
    try {
      const res = await fetch('/api/auth/demo-login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ profile }),
      })

      if (!res.ok) {
        const err = await res.json().catch(() => ({ error: 'Demo login failed' }))
        throw new Error(err.error || 'Demo login failed')
      }

      const data = await res.json()
      const token = data.token || null
      writeStorage(data.user, token, true)
      set({
        user: data.user,
        token,
        isAuthenticated: true,
        isLoading: false,
      })
    } catch (error) {
      set({ isLoading: false })
      throw error
    }
  },

  logout: () => {
    clearStorage()
    set({ user: null, token: null, isAuthenticated: false })
  },

  setUser: (user) => {
    set({ user, isAuthenticated: !!user })
  },

  setToken: (token) => {
    set({ token })
  },

  hasPermission: (permission: string) => {
    const { user } = get()
    if (!user) return false
    if (user.isDemo) {
      return permission.endsWith('.view') && user.permissions.includes(permission)
    }
    if (user.role === 'Admin' || user.role === 'Manager') return true
    return user.permissions.includes(permission)
  },

  hasAnyPermission: (permissions: string[]) => {
    const { user } = get()
    if (!user) return false
    if (user.isDemo) {
      return permissions.some((permission) => permission.endsWith('.view') && user.permissions.includes(permission))
    }
    if (user.role === 'Admin' || user.role === 'Manager') return true
    return permissions.some((permission) => user.permissions.includes(permission))
  },

  canSeeFinancialData: () => {
    const { user } = get()
    if (!user || user.isDemo) return false
    return user.role === 'Admin' || user.role === 'Manager'
  },

  getToken: () => get().token,
}))

export const NAV_PERMISSIONS: Record<string, string[]> = {
  dashboard: ['dashboard.view'],
  'operations-center': ['trips.view'],
  'truck-financials': ['financial.view'],
  analytics: ['financial.view'],
  'model-health': ['reports.view'],
  'cost-analytics': ['financial.view'],
  'trip-profitability': ['financial.view'],
  'fuel-analytics': ['financial.view'],
  'fuel-anomaly': ['financial.view'],
  'fuel-budgets': ['financial.view'],
  pricing: ['financial.view'],
  invoices: ['financial.view'],
  payroll: ['financial.view'],
  settlements: ['financial.view'],
  'haulier-settlements': ['financial.view'],
  'expense-approvals': ['financial.view'],
  'fuel-prices': ['financial.view'],
  'driver-incentives': ['financial.view'],
  tracking: ['trucks.view'],
  'control-tower': ['trucks.view'],
  'driver-tracking': ['trips.view'],
  trucks: ['trucks.view'],
  trailers: ['trucks.view'],
  'telematics-devices': ['trucks.view'],
  'video-incidents': ['trucks.view'],
  'video-privacy': ['admin.settings'],
  'load-orders': ['trips.view'],
  dispatch: ['trips.create'],
  'shipper-profiles': ['trips.view'],
  drivers: ['drivers.view'],
  'driver-performance': ['drivers.view'],
  'safety-scoring': ['drivers.view'],
  trips: ['trips.view'],
  'active-trip': ['trips.view'],
  waybills: ['trips.view'],
  clients: ['trips.view'],
  expenses: ['expenses.view'],
  'cash-advances': ['expenses.view'],
  'toll-tracker': ['expenses.view'],
  tyres: ['maintenance.view'],
  insurance: ['insurance.view'],
  maintenance: ['maintenance.view'],
  'maintenance-scheduler': ['maintenance.view'],
  dvla: ['dvla.view'],
  roadworthy: ['roadworthy.view'],
  'compliance-center': ['dvla.view'],
  documents: ['expenses.view'],
  users: ['users.view'],
  notifications: ['notifications.view'],
  reports: ['reports.view'],
  'haulage-reports': ['reports.view'],
  'fuel-logs': ['expenses.view'],
  'client-portal': ['trips.view'],
  'vehicle-inspections': ['maintenance.view'],
  'load-board': ['trips.view'],
  'insurance-claims': ['maintenance.view'],
  warehouse: ['maintenance.view'],
  'border-crossings': ['trips.view'],
  'depot-queue': ['trips.view'],
  'road-conditions': ['trips.view'],
  'route-optimizer': ['trips.view'],
  settings: ['admin.settings'],
  profile: ['trips.view'],
  'audit-log': ['users.view'],
}

export function canAccessNav(itemId: string): boolean {
  const store = useAuthStore.getState()
  if (store.user?.isDemo) return false
  const required = NAV_PERMISSIONS[itemId]
  if (!required) return true
  return store.hasAnyPermission(required)
}

export function getUserInitials(name: string): string {
  return name
    .split(' ')
    .map((part) => part[0])
    .join('')
    .toUpperCase()
    .slice(0, 2)
}

export function getRoleBadgeColor(role: string): string {
  switch (role) {
    case 'Admin':
      return 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400'
    case 'Manager':
      return 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400'
    case 'Driver':
      return 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400'
    default:
      return 'bg-gray-100 text-gray-700 dark:bg-gray-800 dark:text-gray-400'
  }
}
