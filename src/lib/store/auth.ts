import { create } from 'zustand'

export interface AuthUser {
  id: string
  email: string
  name: string
  phone: string | null
  avatar: string | null
  role: string           // 'Admin' | 'Manager' | 'Driver'
  permissions: string[]  // e.g. ['trucks.view', 'trucks.create', ...]
  driverId?: string | null   // linked Driver record ID (if role is Driver)
  isActive: boolean
}

interface AuthState {
  user: AuthUser | null
  isAuthenticated: boolean
  isLoading: boolean
  isHydrated: boolean  // true after initial localStorage check on mount
  token: string | null  // JWT token from server
  login: (email: string, password: string) => Promise<void>
  logout: () => void
  setUser: (user: AuthUser | null) => void
  setToken: (token: string | null) => void
  hydrate: () => void  // Restore session from localStorage
  hasPermission: (permission: string) => boolean
  hasAnyPermission: (permissions: string[]) => boolean
  canSeeFinancialData: () => boolean
  getToken: () => string | null
}

// ── Manual localStorage helpers ────────────────────────────────────────────

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

/** Decode JWT payload without verification (client-side only, for expiry check) */
function isJwtExpired(token: string): boolean {
  try {
    const base64 = token.split('.')[1]
    if (!base64) return true
    const payload = JSON.parse(atob(base64.replace(/-/g, '+').replace(/_/g, '/')))
    if (!payload.exp) return false
    // exp is in seconds, Date.now() is in ms — add 30s buffer for clock skew
    return payload.exp * 1000 < Date.now() - 30000
  } catch {
    return true
  }
}

// ── Store ────────────────────────────────────────────────────────────────

export const useAuthStore = create<AuthState>()((set, get) => ({
  user: null,
  isAuthenticated: false,
  isLoading: false,
  isHydrated: false,
  token: null,

  /**
   * Hydrate auth state from localStorage.
   * Safe to call multiple times. If a login already happened (token is set),
   * this is a no-op — the fresh login always wins over stale localStorage data.
   */
  hydrate: () => {
    // Mark hydration as complete (always, even if no stored session found)
    // This prevents showing the login page while we check localStorage.

    // If already authenticated (from a fresh login), never overwrite with
    // stale localStorage data. This eliminates the login→dashboard→login race.
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
      // Token expired — clear stale data
      clearStorage()
    }

    // No valid session found — mark hydration done
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

      // Write to localStorage for persistence across page refreshes
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
    if (user.role === 'Admin') return true
    if (user.role === 'Manager') return true
    return user.permissions.includes(permission)
  },

  hasAnyPermission: (permissions: string[]) => {
    const { user } = get()
    if (!user) return false
    if (user.role === 'Admin') return true
    if (user.role === 'Manager') return true
    return permissions.some((p) => user.permissions.includes(p))
  },

  /** Check if the current user can view financial data (revenue, costs, margins) */
  canSeeFinancialData: (): boolean => {
    const { user } = get()
    if (!user) return false
    return user.role === 'Admin' || user.role === 'Manager'
  },

  getToken: () => {
    return get().token
  },
}))

// Navigation item permission mapping
// Financial pages require `financial.view` — Drivers are blocked
export const NAV_PERMISSIONS: Record<string, string[]> = {
  dashboard: ['dashboard.view'],
  // FINANCIAL — Admin & Manager only
  'truck-financials': ['financial.view'],
  analytics: ['financial.view'],
  'cost-analytics': ['financial.view'],
  'trip-profitability': ['financial.view'],
  'fuel-analytics': ['financial.view'],
  'fuel-anomaly': ['financial.view'],
  'fuel-budgets': ['financial.view'],
  pricing: ['financial.view'],
  invoices: ['financial.view'],
  payroll: ['financial.view'],
  settlements: ['financial.view'],
  'expense-approvals': ['financial.view'],
  'fuel-prices': ['financial.view'],
  'driver-incentives': ['financial.view'],
  // OPERATIONS — all roles
  tracking: ['trucks.view'],
  'driver-tracking': ['trips.view'],
  trucks: ['trucks.view'],
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
  'reports': ['reports.view'],
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
  const required = NAV_PERMISSIONS[itemId]
  if (!required) return true
  const store = useAuthStore.getState()
  return store.hasAnyPermission(required)
}

// Initials helper
export function getUserInitials(name: string): string {
  return name
    .split(' ')
    .map((n) => n[0])
    .join('')
    .toUpperCase()
    .slice(0, 2)
}

// Role badge color
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
