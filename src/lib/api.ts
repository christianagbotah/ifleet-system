// ${APP_NAME} - API Helper Functions
// Simple fetch wrapper with error handling for all API endpoints

import { APP_NAME } from '@/lib/constants'
import * as React from 'react'
import { useAuthStore } from '@/lib/store/auth'
import { useLoadingStore } from '@/lib/store/loading'
import type { WaybillData } from '@/lib/utils/waybill'

interface ApiResponse<T> {
  data: T
  total?: number
  page?: number
  limit?: number
  unreadCount?: number
  summary?: Record<string, number>
}

interface ApiError {
  error: string
}

export async function apiFetch<T>(url: string, options?: RequestInit): Promise<T> {
  // Inject auth headers for server-side permission checks
  const { token } = useAuthStore.getState()
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...(options?.headers as Record<string, string> | undefined),
  }
  // Send JWT token as Bearer token (primary auth mechanism)
  if (token) headers['Authorization'] = `Bearer ${token}`

  // If no token is available, skip the request.
  // Do NOT call logout() here — a missing token can be a transient Zustand
  // rehydration race (not an expired session).
  if (!token) {
    throw new Error('Authentication required. Please log in.')
  }

  // Add aggressive cache-busting for GET requests to ensure fresh data on refresh.
  // Uses timestamp + random suffix to absolutely guarantee no cache hit.
  let fetchUrl = url
  const isGet = !options || options.method === undefined || options.method === 'GET'
  if (isGet) {
    const separator = url.includes('?') ? '&' : '?'
    fetchUrl = `${url}${separator}_t=${Date.now()}_${Math.random().toString(36).slice(2, 8)}`
  }

  // Detect mutating requests for global loading overlay
  const method = (options?.method || 'GET').toUpperCase()
  const isMutation = ['POST', 'PUT', 'PATCH', 'DELETE'].includes(method)
  if (isMutation) {
    useLoadingStore.getState().startLoading()
  }

  // Note: cache: 'no-store' is a Next.js server-side extension — silently ignored
  // on client-side fetch and may cause issues, so we omit it here.
  // Instead we rely on URL cache-busting and request headers.

  // Retry up to 2 times for GET requests on network/server errors (5xx, network failure)
  const maxRetries = isGet ? 2 : 0
  let lastError: Error | null = null

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      const res = await fetch(fetchUrl, {
        ...options,
        headers: isGet ? {
          ...headers,
          'Cache-Control': 'no-cache',
          'pragma': 'no-cache',
        } : headers,
      })

      if (!res.ok) {
        // 401 = unauthorized — check if the token that failed is still current.
        // If the user logged in since this request was sent (new token), the 401
        // is for a stale token and should be silently ignored.
        if (res.status === 401) {
          const currentToken = useAuthStore.getState().token
          if (currentToken !== token) {
            // Token changed since request was sent — stale 401, ignore silently
            return null as T
          }
          // Token is still current but server rejected it → session expired.
          // Auto-logout globally so the entire app redirects to login.
          try {
            const { toast } = await import('sonner')
            toast.error('Session expired. Please log in again.', { duration: 3000 })
          } catch { /* toast may not be available */ }
          useAuthStore.getState().logout()
          throw new Error('Session expired. Please log in again.')
        }
        // 403 = forbidden (insufficient permissions) — don't logout, just reject
        let message = `Request failed with status ${res.status}`
        try {
          const errorData = await res.json() as ApiError
          if (errorData?.error) message = errorData.error
        } catch {
          // Response wasn't JSON (e.g. HTML error page from proxy) — use default message
        }
        // Retry on 5xx server errors for GET requests
        if (isGet && res.status >= 500 && attempt < maxRetries) {
          lastError = new Error(message)
          await new Promise(r => setTimeout(r, 1000 * (attempt + 1)))
          continue
        }
        throw new Error(message)
      }

      return res.json()
    } catch (err) {
      lastError = err instanceof Error ? err : new Error(String(err))
      // Retry on network errors for GET requests
      if (isGet && attempt < maxRetries) {
        await new Promise(r => setTimeout(r, 1000 * (attempt + 1)))
        continue
      }
      throw lastError
    } finally {
      // Always stop loading overlay when request finishes (success or error)
      if (isMutation) {
        useLoadingStore.getState().stopLoading()
      }
    }
  }

  // If we exhausted retries without returning, stop loading before throwing
  if (isMutation) {
    useLoadingStore.getState().stopLoading()
  }
  throw lastError || new Error('Request failed')
}

// ============ DASHBOARD ============

export interface DashboardStats {
  totalTrucks: number
  activeTrucks: number
  totalDrivers: number
  activeTripsCount: number
  monthlyRevenue: number
  monthlyExpenses: number
  monthlyFuelCost: number
  monthlyFuelLiters: number
  monthlyFuelEntries: number
  monthlyAvgCostPerLiter: number
  recentTrips: DashboardTrip[]
  upcomingMaintenance: DashboardMaintenance[]
  activeTrips: DashboardTrip[]
  tripStatusDistribution: { status: string; count: number }[]
  monthlyData: { month: string; year: number; monthIndex: number; revenue: number; expenses: number; fuelCost: number; fuelLiters: number; fuelEntries: number }[]
}

export interface DashboardTrip {
  id: string
  tripNumber: string
  departureTime: string
  status: string
  loadingLocation: string
  destination: string
  itemName: string
  quantity: number
  unit: string
  totalRevenue: number | null
  truck: { id: string; plateNumber: string; make: string; model: string }
  driver: { id: string; firstName: string; lastName: string }
}

export interface DashboardMaintenance {
  id: string
  title: string
  status: string
  nextDueDate: string | null
  truck: { id: string; plateNumber: string; make: string; model: string }
}

export async function fetchDashboard(): Promise<DashboardStats> {
  return apiFetch<DashboardStats>('/api/dashboard')
}

// ============ FLEET HEALTH ============

export interface FleetHealthData {
  overallScore: number
  trucks: {
    total: number
    active: number
    idle: number
    maintenance: number
  }
  drivers: {
    total: number
    onTrip: number
    available: number
  }
  complianceAlerts: number
  overdueMaintenance: number
  fuelEfficiencyTrend: 'up' | 'down' | 'stable'
  fuelEfficiency: {
    thisMonth: number
    lastMonth: number
  }
  topIssues: {
    type: string
    title: string
    count: number
    page: string
    severity: 'high' | 'medium' | 'low'
  }[]
}

export async function fetchFleetHealth(): Promise<FleetHealthData> {
  return apiFetch<FleetHealthData>('/api/dashboard/fleet-health')
}

// ============ ACTIVITY FEED ============

export interface ActivityItem {
  id: string
  type: 'audit' | 'trip_event' | 'notification'
  title: string
  description: string
  timestamp: string
  userName?: string
  action?: string
  entity?: string
  entityType?: string
  entityId?: string
  link?: string
  details?: string
  ipAddress?: string
}

export async function fetchActivityFeed(): Promise<ActivityItem[]> {
  return apiFetch<ActivityItem[]>('/api/dashboard/activity')
}

// ============ ANALYTICS ============

export interface AnalyticsKpis {
  totalRevenuePeriod: number
  totalTripsPeriod: number
  avgTripRevenue: number
  fleetUtilizationPercent: number
  revenueTrend: number
  tripsTrend: number
  avgRevenueTrend: number
}

export interface AnalyticsData {
  revenueByMonth: { month: string; revenue: number }[]
  tripsByStatus: { status: string; count: number }[]
  topRoutes: { route: string; count: number }[]
  topDrivers: { driver: string; trips: number }[]
  revenueByDestination: { destination: string; revenue: number }[]
  tripsOverTime: { date: string; count: number }[]
  expenseSummary: { category: string; amount: number }[]
  fleetUtilization: { active: number; inactive: number; total: number }
  kpis: AnalyticsKpis
}

export async function fetchAnalytics(range?: string): Promise<AnalyticsData> {
  const params = range ? `?range=${range}` : ''
  return apiFetch<AnalyticsData>(`/api/dashboard${params}`)
}

// ============ TRUCKS ============

export interface Truck {
  id: string
  plateNumber: string
  make: string
  model: string
  year: number
  vinNumber?: string
  engineNumber?: string
  chassisNumber?: string
  color?: string
  fuelType: string
  tankCapacity?: number | null
  status: string
  currentMileage: number
  driverId?: string | null
  driver?: { id: string; firstName: string; lastName: string; phone: string; status: string } | null
  notes?: string
  insuranceStatus: string
  nextServiceDate?: string | null
  createdAt: string
}

export interface TruckDetail extends Truck {
  tyres: TruckTyre[]
  insurance: TruckInsurance[]
  maintenance: TruckMaintenanceRecord[]
  expenses: TruckExpense[]
  trips: TruckTrip[]
}

export interface TruckTyre {
  id: string
  serialNumber: string
  brand: string
  purchaseDate: string
  purchasePrice: number
  condition: string
}

export interface TruckInsurance {
  id: string
  provider: string
  policyNumber: string
  type: string
  premium: number
  startDate: string
  endDate: string
  status: string
}

export interface TruckMaintenanceRecord {
  id: string
  type: string
  title: string
  description?: string | null
  cost?: number | null
  performedAt: string
  nextDueDate?: string | null
  status: string
}

export interface TruckExpense {
  id: string
  category: string
  description: string
  amount: number
  date: string
  paymentMethod: string
  status: string
}

export interface TruckTrip {
  id: string
  tripNumber: string
  departureTime: string
  status: string
  loadingLocation: string
  destination: string
  itemName: string
  quantity: number
  unit: string
  totalRevenue: number | null
}

export async function fetchTrucks(params?: {
  search?: string
  status?: string
  make?: string
  driverId?: string
  page?: number
  limit?: number
}): Promise<ApiResponse<Truck[]>> {
  const searchParams = new URLSearchParams()
  if (params?.search) searchParams.set('search', params.search)
  if (params?.status) searchParams.set('status', params.status)
  if (params?.make) searchParams.set('make', params.make)
  if (params?.driverId) searchParams.set('driverId', params.driverId)
  if (params?.page) searchParams.set('page', String(params.page))
  if (params?.limit) searchParams.set('limit', String(params.limit))
  const qs = searchParams.toString()
  return apiFetch<ApiResponse<Truck[]>>(`/api/trucks${qs ? `?${qs}` : ''}`)
}

export async function fetchTruckDetail(id: string): Promise<TruckDetail> {
  return apiFetch<TruckDetail>(`/api/trucks/${id}`)
}

export async function createTruck(data: Record<string, unknown>): Promise<Truck> {
  return apiFetch<Truck>('/api/trucks', {
    method: 'POST',
    body: JSON.stringify(data),
  })
}

export async function updateTruck(id: string, data: Record<string, unknown>): Promise<Truck> {
  return apiFetch<Truck>(`/api/trucks/${id}`, {
    method: 'PUT',
    body: JSON.stringify(data),
  })
}

export async function bulkDeleteTrucks(ids: string[]): Promise<{ deleted: number }> {
  return apiFetch<{ deleted: number }>('/api/trucks/bulk-delete', { method: 'POST', body: JSON.stringify({ ids }) })
}

export async function bulkTruckAction(action: string, ids: string[]): Promise<{ success: number; failed: number; errors: { id: string; message: string }[] }> {
  return apiFetch('/api/trucks/bulk', { method: 'POST', body: JSON.stringify({ action, ids }) })
}

// ============ DRIVERS ============

export interface Driver {
  id: string
  firstName: string
  lastName: string
  phone: string
  email?: string | null
  licenseNumber: string
  licenseExpiry: string
  licenseClass: string
  rating: number
  status: string
  totalTrips: number
  hireDate: string
  employeeId: string
  photo?: string | null
  ghanaCardNumber?: string | null
  ghanaCardExpiry?: string | null
  licenseImage?: string | null
  ghanaCardFrontImage?: string | null
  ghanaCardBackImage?: string | null
  verificationStatus?: string  // pending | submitted | verified | rejected
  trucks: { id: string; plateNumber: string; make: string; model: string }[]
}

export async function fetchDrivers(params?: {
  search?: string
  status?: string
  page?: number
  limit?: number
}): Promise<ApiResponse<Driver[]>> {
  const searchParams = new URLSearchParams()
  if (params?.search) searchParams.set('search', params.search)
  if (params?.status) searchParams.set('status', params.status)
  if (params?.page) searchParams.set('page', String(params.page))
  if (params?.limit) searchParams.set('limit', String(params.limit))
  const qs = searchParams.toString()
  return apiFetch<ApiResponse<Driver[]>>(`/api/drivers${qs ? `?${qs}` : ''}`)
}

export interface DriverTrip {
  id: string
  tripNumber: string
  departureTime: string
  arrivalTime?: string | null
  status: string
  loadingLocation: string
  destination: string
  itemName: string
  quantity: number
  unit: string
  totalRevenue?: number | null
  truck: { id: string; plateNumber: string; make: string; model: string }
}

export interface DriverPayroll {
  id: string
  month: number
  year: number
  baseSalary: number
  tripBonus: number
  overtimePay: number
  deductions: number
  netPay: number
  status: string
  paidAt?: string | null
}

export interface DriverDetail extends Driver {
  emergencyName?: string | null
  emergencyPhone?: string | null
  address?: string | null
  dateOfBirth?: string | null
  totalMileage: number
  verificationStatus?: string | null
  verificationNotes?: string | null
  verifiedBy?: string | null
  verifiedAt?: string | null
  trips: DriverTrip[]
  payroll: DriverPayroll[]
}

export async function fetchDriverDetail(id: string): Promise<DriverDetail> {
  return apiFetch<DriverDetail>(`/api/drivers/${id}`)
}

export async function createDriver(data: Record<string, unknown>): Promise<Driver> {
  return apiFetch<Driver>('/api/drivers', {
    method: 'POST',
    body: JSON.stringify(data),
  })
}

export async function updateDriverVerification(id: string, data: { status: string; notes?: string }): Promise<Driver> {
  return apiFetch<Driver>(`/api/drivers/${id}`, {
    method: 'PUT',
    body: JSON.stringify(data),
  })
}

export async function bulkDeleteDrivers(ids: string[]): Promise<{ deleted: number }> {
  return apiFetch<{ deleted: number }>('/api/drivers/bulk-delete', { method: 'POST', body: JSON.stringify({ ids }) })
}

export async function bulkDriverAction(action: string, ids: string[]): Promise<{ success: number; failed: number; errors: { id: string; message: string }[] }> {
  return apiFetch('/api/drivers/bulk', { method: 'POST', body: JSON.stringify({ action, ids }) })
}

// ============ TRIPS ============

export interface DeliveryStop {
  id: string
  tripId: string
  stopOrder: number
  destination: string
  address?: string | null
  customerName?: string | null
  customerPhone?: string | null
  expectedQty: number
  actualQty?: number | null
  unit: string
  status: string // pending, arrived, offloading, completed
  arrivalTime?: string | null
  offloadStarted?: string | null
  offloadCompleted?: string | null
  notes?: string | null
}

export interface TripEvent {
  id: string
  tripId: string
  fromStatus?: string | null
  toStatus: string
  userId?: string | null
  notes?: string | null
  location?: string | null
  metadata?: string | null
  createdAt: string
  // Legacy fields for TripTimeline compatibility
  newStatus?: string
  oldStatus?: string
  driverNotes?: string | null
  triggerType?: string
}

export interface Trip {
  id: string
  tripNumber: string
  truckId: string
  driverId: string
  waybillNumber?: string | null
  loadingLocation: string
  destination: string
  itemName: string
  quantity: number
  unit: string
  unitPrice?: number | null
  totalRevenue?: number | null
  departureTime: string
  arrivalTime?: string | null
  status: string
  customerName?: string | null
  customerPhone?: string | null
  customerRef?: string | null
  // New lifecycle fields
  waitingReason?: string | null
  waitingSince?: string | null
  totalOffloaded: number
  offloadingStartedAt?: string | null
  offloadingCompletedAt?: string | null
  notes?: string | null
  truck: { id: string; plateNumber: string; make: string; model: string }
  driver: { id: string; firstName: string; lastName: string }
  client?: { id: string; companyName: string; contactPerson: string; phone: string } | null
  deliveryStops?: DeliveryStop[]
  tripItems?: TripItem[]
}

// ============ TRIP ITEMS ============

export interface TripItem {
  id: string
  tripId: string
  supplierId?: string | null
  supplier?: { id: string; name: string } | null
  loadingPointId?: string | null
  loadingPoint?: { id: string; name: string } | null
  itemId?: string | null
  item?: { id: string; name: string; unit: string } | null
  itemName: string
  unit: string
  quantity: number
  rate?: number | null
  total?: number | null
  sortOrder: number
}

// ============ SUPPLIERS ============

export interface Supplier {
  id: string
  name: string
  contactPerson?: string | null
  contactPhone?: string | null
  email?: string | null
  address?: string | null
  notes?: string | null
  isActive: boolean
  createdAt: string
  updatedAt: string
  loadingPoints?: { id: string; name: string; loadingCityId: string }[]
  items?: { id: string; name: string; unit: string }[]
}

export async function fetchSuppliers(includeInactive?: boolean): Promise<{ data: Supplier[] }> {
  const params = includeInactive ? '?includeInactive=true' : ''
  return apiFetch<{ data: Supplier[] }>(`/api/suppliers${params}`)
}

export async function fetchTrips(params?: {
  search?: string
  status?: string
  truckId?: string
  driverId?: string
  page?: number
  limit?: number
}): Promise<ApiResponse<Trip[]>> {
  const searchParams = new URLSearchParams()
  if (params?.search) searchParams.set('search', params.search)
  if (params?.status) searchParams.set('status', params.status)
  if (params?.truckId) searchParams.set('truckId', params.truckId)
  if (params?.driverId) searchParams.set('driverId', params.driverId)
  if (params?.page) searchParams.set('page', String(params.page))
  if (params?.limit) searchParams.set('limit', String(params.limit))
  const qs = searchParams.toString()
  return apiFetch<ApiResponse<Trip[]>>(`/api/trips${qs ? `?${qs}` : ''}`)
}

export async function createTrip(data: Record<string, unknown>): Promise<Trip> {
  return apiFetch<Trip>('/api/trips', {
    method: 'POST',
    body: JSON.stringify(data),
  })
}

export async function updateTrip(id: string, data: Record<string, unknown>): Promise<Trip> {
  return apiFetch<Trip>(`/api/trips/${id}`, {
    method: 'PUT',
    body: JSON.stringify(data),
  })
}

export async function bulkDeleteTrips(ids: string[]): Promise<{ deleted: number }> {
  return apiFetch<{ deleted: number }>('/api/trips/bulk-delete', { method: 'POST', body: JSON.stringify({ ids }) })
}

export async function fetchTripWaybill(tripId: string): Promise<WaybillData> {
  return apiFetch<WaybillData>(`/api/trips/${tripId}/waybill`)
}

// ============ TRIP COMMENTS ============

export interface TripComment {
  id: string
  tripId: string
  userId: string
  message: string
  createdAt: string
  updatedAt: string
  user: { id: string; name: string; role: string; avatar: string | null }
}

export async function fetchTripComments(tripId: string): Promise<TripComment[]> {
  return apiFetch<TripComment[]>(`/api/trips/${tripId}/comments`)
}

export async function addTripComment(tripId: string, message: string): Promise<TripComment> {
  return apiFetch<TripComment>(`/api/trips/${tripId}/comments`, {
    method: 'POST',
    body: JSON.stringify({ message }),
  })
}

/** Alias for addTripComment */
export const createTripComment = addTripComment

export async function deleteTripComment(tripId: string, commentId: string): Promise<void> {
  await apiFetch(`/api/trips/${tripId}/comments/${commentId}`, { method: 'DELETE' })
}

export async function fetchTripEvents(tripId: string): Promise<ApiResponse<TripEvent[]>> {
  return apiFetch<ApiResponse<TripEvent[]>>(`/api/trips/${tripId}/events`)
}

export async function createDeliveryStop(data: {
  tripId: string
  destination: string
  address?: string
  customerName?: string
  customerPhone?: string
  expectedQty: number
  unit?: string
}): Promise<DeliveryStop> {
  return apiFetch<DeliveryStop>('/api/delivery-stops', {
    method: 'POST',
    body: JSON.stringify(data),
  })
}

export async function updateDeliveryStop(id: string, data: {
  actualQty?: number
  status?: string
  notes?: string
}): Promise<DeliveryStop> {
  return apiFetch<DeliveryStop>('/api/delivery-stops', {
    method: 'PATCH',
    body: JSON.stringify({ id, ...data }),
  })
}

// ============ EXPENSES ============

export interface Expense {
  id: string
  truckId: string
  category: string
  description: string
  amount: number
  date: string
  paymentMethod: string
  reference?: string | null
  status: string
  truck: { id: string; plateNumber: string; make: string; model: string }
}

export async function fetchExpenses(params?: {
  search?: string
  category?: string
  status?: string
  dateFrom?: string
  dateTo?: string
  truckId?: string
  page?: number
  limit?: number
}): Promise<ApiResponse<Expense[]>> {
  const searchParams = new URLSearchParams()
  if (params?.search) searchParams.set('search', params.search)
  if (params?.category) searchParams.set('category', params.category)
  if (params?.status) searchParams.set('status', params.status)
  if (params?.dateFrom) searchParams.set('dateFrom', params.dateFrom)
  if (params?.dateTo) searchParams.set('dateTo', params.dateTo)
  if (params?.truckId) searchParams.set('truckId', params.truckId)
  if (params?.page) searchParams.set('page', String(params.page))
  if (params?.limit) searchParams.set('limit', String(params.limit))
  const qs = searchParams.toString()
  return apiFetch<ApiResponse<Expense[]>>(`/api/expenses${qs ? `?${qs}` : ''}`)
}

export async function bulkDeleteExpenses(ids: string[]): Promise<{ deleted: number }> {
  return apiFetch<{ deleted: number }>('/api/expenses/bulk-delete', { method: 'POST', body: JSON.stringify({ ids }) })
}

// ============ MAINTENANCE ============

export interface MaintenanceRecord {
  id: string
  truckId: string
  type: string
  title: string
  description?: string | null
  odometer?: number | null
  cost?: number | null
  performedBy?: string | null
  performedAt: string
  nextDueDate?: string | null
  nextDueMileage?: number | null
  status: string
  truck: { id: string; plateNumber: string; make: string; model: string }
}

export async function fetchMaintenance(params?: {
  truckId?: string
  type?: string
  status?: string
  page?: number
  limit?: number
}): Promise<ApiResponse<MaintenanceRecord[]>> {
  const searchParams = new URLSearchParams()
  if (params?.truckId) searchParams.set('truckId', params.truckId)
  if (params?.type) searchParams.set('type', params.type)
  if (params?.status) searchParams.set('status', params.status)
  if (params?.page) searchParams.set('page', String(params.page))
  if (params?.limit) searchParams.set('limit', String(params.limit))
  const qs = searchParams.toString()
  return apiFetch<ApiResponse<MaintenanceRecord[]>>(`/api/maintenance${qs ? `?${qs}` : ''}`)
}

// ============ PREDICTIVE MAINTENANCE ============

export interface MaintenancePrediction {
  truckId: string
  truckPlate: string
  predictedServiceDate: string
  confidence: 'high' | 'medium' | 'low'
  component: 'oil_change' | 'brake_service' | 'tire_rotation' | 'general_service'
  estimatedCost: number
  lastServiceDate: string
  avgIntervalDays: number
  totalServices: number
  riskLevel: 'critical' | 'warning' | 'info'
}

export interface PredictiveMaintenanceSummary {
  criticalCount: number
  warningCount: number
  infoCount: number
  totalEstimatedCost: number
}

export interface PredictiveMaintenanceResponse {
  predictions: MaintenancePrediction[]
  summary: PredictiveMaintenanceSummary
}

export async function fetchPredictiveMaintenance(): Promise<PredictiveMaintenanceResponse> {
  return apiFetch<PredictiveMaintenanceResponse>('/api/maintenance/predictive')
}

// ============ PAYROLL ============

export interface PayrollRecord {
  id: string
  driverId: string
  month: number
  year: number
  baseSalary: number
  tripBonus: number
  overtimePay: number
  deductions: number
  netPay: number
  status: string
  notes?: string | null
  approvedBy?: string | null
  paidAt?: string | null
  createdAt: string
  driver: { id: string; firstName: string; lastName: string; phone: string; status: string }
}

export interface PayrollSummary {
  totalBaseSalary: number
  totalTripBonus: number
  totalOvertimePay: number
  totalDeductions: number
  totalNetPay: number
}

export async function fetchPayroll(params?: {
  month?: number
  year?: number
  driverId?: string
  status?: string
  page?: number
  limit?: number
}): Promise<ApiResponse<PayrollRecord[]> & { summary: PayrollSummary }> {
  const searchParams = new URLSearchParams()
  if (params?.month) searchParams.set('month', String(params.month))
  if (params?.year) searchParams.set('year', String(params.year))
  if (params?.driverId) searchParams.set('driverId', params.driverId)
  if (params?.status) searchParams.set('status', params.status)
  if (params?.page) searchParams.set('page', String(params.page))
  if (params?.limit) searchParams.set('limit', String(params.limit))
  const qs = searchParams.toString()
  return apiFetch<ApiResponse<PayrollRecord[]> & { summary: PayrollSummary }>(`/api/payroll${qs ? `?${qs}` : ''}`)
}

// ============ PRICING ============

export interface PricingEntry {
  id: string
  itemName: string
  destination: string
  transportRate: number
  isActive: boolean
  createdAt: string
}

export async function fetchPricing(params?: {
  itemName?: string
  destination?: string
  activeOnly?: boolean
  page?: number
  limit?: number
}): Promise<ApiResponse<PricingEntry[]>> {
  const searchParams = new URLSearchParams()
  if (params?.itemName) searchParams.set('itemName', params.itemName)
  if (params?.destination) searchParams.set('destination', params.destination)
  if (params?.activeOnly) searchParams.set('activeOnly', String(params.activeOnly))
  if (params?.page) searchParams.set('page', String(params.page))
  if (params?.limit) searchParams.set('limit', String(params.limit))
  const qs = searchParams.toString()
  return apiFetch<ApiResponse<PricingEntry[]>>(`/api/pricing${qs ? `?${qs}` : ''}`)
}

// ============ NOTIFICATIONS ============

export interface Notification {
  id: string
  userId: string
  type: string
  title: string
  message: string
  channel: string
  isRead: boolean
  readAt?: string | null
  link?: string | null
  metadata?: string | null
  // Delivery tracking
  smsSent?: boolean
  smsSentAt?: string | null
  smsError?: string | null
  emailSent?: boolean
  emailSentAt?: string | null
  emailError?: string | null
  pushSent?: boolean
  pushSentAt?: string | null
  createdAt: string
}

export async function fetchNotifications(params?: {
  type?: string
  isRead?: string
  page?: number
  limit?: number
  userId?: string
  unreadOnly?: boolean
}): Promise<ApiResponse<Notification[]> & { unreadCount: number }> {
  const searchParams = new URLSearchParams()
  if (params?.type) searchParams.set('type', params.type)
  if (params?.unreadOnly) {
    searchParams.set('isRead', 'false')
  } else if (params?.isRead !== undefined) {
    searchParams.set('isRead', params.isRead)
  }
  if (params?.page) searchParams.set('page', String(params.page))
  if (params?.limit) searchParams.set('limit', String(params.limit))
  if (params?.userId) searchParams.set('userId', params.userId)
  const qs = searchParams.toString()
  return apiFetch<ApiResponse<Notification[]> & { unreadCount: number }>(`/api/notifications${qs ? `?${qs}` : ''}`)
}

export async function markNotificationRead(id: string): Promise<Notification> {
  return apiFetch<Notification>(`/api/notifications/${id}`, {
    method: 'PUT',
  })
}

export async function bulkMarkNotificationsRead(ids: string[]): Promise<{ updated: number }> {
  return apiFetch<{ updated: number }>('/api/notifications/bulk-read', {
    method: 'POST',
    body: JSON.stringify({ ids }),
  })
}

// ============ NOTIFICATION BULK DELETE ============

export async function bulkDeleteNotifications(ids: string[]): Promise<{ deleted: number }> {
  return apiFetch<{ deleted: number }>('/api/notifications/bulk-delete', {
    method: 'POST',
    body: JSON.stringify({ ids }),
  })
}

export async function clearAllNotifications(): Promise<{ deleted: number }> {
  return apiFetch<{ deleted: number }>('/api/notifications/bulk-delete', {
    method: 'POST',
    body: JSON.stringify({ deleteAll: true }),
  })
}

export async function deleteOldNotifications(olderThanDays: number): Promise<{ deleted: number }> {
  return apiFetch<{ deleted: number }>('/api/notifications/bulk-delete', {
    method: 'POST',
    body: JSON.stringify({ olderThanDays }),
  })
}

export async function cleanupOldNotifications(olderThanDays: number = 90): Promise<{ deleted: number }> {
  // Cleanup endpoint requires CRON_SECRET — only callable by server-side cron jobs
  // This client helper is kept for consistency but will fail without the secret header
  const res = await fetch('/api/notifications/cleanup', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ olderThanDays }),
  })
  if (!res.ok) throw new Error('Failed to cleanup notifications')
  return res.json()
}

// ============ TRACKING ============

export interface TruckLocation {
  truckId: string
  plateNumber?: string
  driverName?: string
  latitude: number
  longitude: number
  speed?: number | null
  heading?: number | null
  accuracy?: number | null
  source: string
  timestamp: string
}

export interface TrackingConfig {
  id: string
  truckId: string
  enablePhoneGps: boolean
  enableHardware: boolean
  updateInterval: number
  geofenceRadius: number
  isActive: boolean
  truck: { id: string; plateNumber: string; make: string; model: string; driver?: { firstName: string; lastName: string } | null }
}

export interface GeofenceZone {
  id: string
  name: string
  latitude: number
  longitude: number
  radius: number
  type: string
  address?: string | null
}

export interface TrackingAlert {
  id: string
  truckId: string
  type: string
  title: string
  message: string
  latitude?: number | null
  longitude?: number | null
  isRead: boolean
  createdAt: string
  truck: { plateNumber: string }
}

export async function fetchTrackingConfigs(): Promise<TrackingConfig[]> {
  return apiFetch<TrackingConfig[]>('/api/tracking/config')
}

export async function updateTrackingConfig(data: { truckId: string; enablePhoneGps?: boolean; enableHardware?: boolean; updateInterval?: number; geofenceRadius?: number; isActive?: boolean }): Promise<TrackingConfig> {
  return apiFetch<TrackingConfig>('/api/tracking/config', { method: 'PUT', body: JSON.stringify(data) })
}

export async function fetchLatestLocations(truckId?: string): Promise<TruckLocation[]> {
  const params = truckId ? `?truckId=${truckId}` : ''
  return apiFetch<TruckLocation[]>(`/api/tracking/location${params}`)
}

export async function fetchLocationHistory(params: { truckId: string; tripId?: string; dateFrom?: string; dateTo?: string; limit?: number }): Promise<TruckLocation[]> {
  const sp = new URLSearchParams()
  sp.set('truckId', params.truckId)
  if (params.tripId) sp.set('tripId', params.tripId)
  if (params.dateFrom) sp.set('dateFrom', params.dateFrom)
  if (params.dateTo) sp.set('dateTo', params.dateTo)
  if (params.limit) sp.set('limit', String(params.limit))
  return apiFetch<TruckLocation[]>(`/api/tracking/history?${sp.toString()}`)
}

export async function fetchGeofences(): Promise<GeofenceZone[]> {
  return apiFetch<GeofenceZone[]>('/api/tracking/geofences')
}

export async function createGeofence(data: { name: string; latitude: number; longitude: number; radius: number; type: string; address?: string }): Promise<GeofenceZone> {
  return apiFetch<GeofenceZone>('/api/tracking/geofences', { method: 'POST', body: JSON.stringify(data) })
}

export async function deleteGeofence(id: string): Promise<void> {
  return apiFetch<void>(`/api/tracking/geofences/${id}`, { method: 'DELETE' })
}

export async function fetchTrackingAlerts(params?: { truckId?: string; isRead?: string; type?: string; limit?: number }): Promise<TrackingAlert[]> {
  const sp = new URLSearchParams()
  if (params?.truckId) sp.set('truckId', params.truckId)
  if (params?.isRead !== undefined) sp.set('isRead', params.isRead)
  if (params?.type) sp.set('type', params.type)
  if (params?.limit) sp.set('limit', String(params.limit))
  return apiFetch<TrackingAlert[]>(`/api/tracking/alerts?${sp.toString()}`)
}

export async function markAlertRead(id: string): Promise<void> {
  return apiFetch<void>(`/api/tracking/alerts/${id}`, { method: 'PUT' })
}

// ============ SYSTEM SETTINGS ============

export interface SystemSettings {
  id: string
  company: {
    name: string
    email: string
    phone: string
    address: string
    city: string
    country: string
    website: string
    registrationNumber: string
  }
  notifications: {
    tripStarted: boolean
    tripCompleted: boolean
    maintenanceDue: boolean
    insuranceExpiring: boolean
    speedingAlert: boolean
    geofenceAlert: boolean
    driverOffline: boolean
    dailyReport: boolean
  }
  tracking: {
    defaultUpdateInterval: number
    speedThreshold: number
    enableGeofence: boolean
    idleTimeout: number
  }
  display: {
    currency: string
    distanceUnit: string
    fuelUnit: string
    dateFormat: string
    timezone: string
    language: string
  }
  driverId: {
    prefix: string
    counter: number
    padding: number
  }
}

export async function fetchSettings(): Promise<SystemSettings> {
  return apiFetch<SystemSettings>('/api/settings')
}

export async function saveSettings(data: SystemSettings): Promise<SystemSettings> {
  return apiFetch<SystemSettings>('/api/settings', {
    method: 'PUT',
    body: JSON.stringify(data),
  })
}

// ============ CHANNEL SETTINGS ============

export interface ChannelSettings {
  smsEnabled: boolean
  smsProvider: string
  hubtelClientId: string
  hubtelApiSecret: string
  arkeselApiKey: string
  arkeselSenderId: string
  emailEnabled: boolean
  smtpHost: string
  smtpPort: number
  smtpUser: string
  smtpFrom: string
  smtpSecure: boolean
  hasSmtpPass: boolean
  smtpPass?: string
  // Paystack
  paystackEnabled: boolean
  paystackSecretKey: string
  paystackPublicKey: string
  paystackMode: string
  mobileMoneyProvider: string
  paystackWebhookSecret: string
  hasPaystackSecret: boolean
  hasPaystackWebhookSecret: boolean
  paystackSecretKeyInput?: string
  paystackWebhookSecretInput?: string
}

export async function fetchChannelSettings(): Promise<ChannelSettings> {
  return apiFetch<ChannelSettings>('/api/settings/channels')
}

export async function updateChannelSettings(data: Partial<ChannelSettings>): Promise<ChannelSettings> {
  return apiFetch<ChannelSettings>('/api/settings/channels', {
    method: 'PUT',
    body: JSON.stringify(data),
  })
}

export async function testSmsChannel(phone?: string): Promise<{ success: boolean; message: string }> {
  return apiFetch<{ success: boolean; message: string }>('/api/settings/channels/test-sms', {
    method: 'POST',
    body: JSON.stringify({ phone }),
  })
}

export async function testEmailChannel(email?: string): Promise<{ success: boolean; message: string }> {
  return apiFetch<{ success: boolean; message: string }>('/api/settings/channels/test-email', {
    method: 'POST',
    body: JSON.stringify({ email }),
  })
}

export async function testPaystackChannel(): Promise<{ success: boolean; message: string }> {
  return apiFetch<{ success: boolean; message: string }>('/api/settings/channels/test-paystack', {
    method: 'POST',
  })
}

// ============ USERS ============

export interface UserItem {
  id: string
  name: string
  email: string | null
  phone: string | null
  avatar: string | null
  roleId: string
  role: { id: string; name: string; permissions: string[] } | null
  position: string | null
  department: string | null
  employeeNumber: string | null
  isActive: boolean
  lastLogin: string | null
  createdAt: string
  driverId: string | null
  driver: { id: string; firstName: string; lastName: string } | null
}

export async function fetchUsers(params?: {
  search?: string
  status?: string
  roleId?: string
  department?: string
  page?: number
  limit?: number
}): Promise<ApiResponse<UserItem[]>> {
  const searchParams = new URLSearchParams()
  if (params?.search) searchParams.set('search', params.search)
  if (params?.status) searchParams.set('status', params.status)
  if (params?.roleId) searchParams.set('roleId', params.roleId)
  if (params?.department) searchParams.set('department', params.department)
  if (params?.page) searchParams.set('page', String(params.page))
  if (params?.limit) searchParams.set('limit', String(params.limit))
  const qs = searchParams.toString()
  return apiFetch<ApiResponse<UserItem[]>>(`/api/users${qs ? `?${qs}` : ''}`)
}

export async function fetchUserDetail(id: string): Promise<UserItem> {
  return apiFetch<UserItem>(`/api/users/${id}`)
}

export async function createUser(data: {
  name: string
  email: string
  phone?: string
  password: string
  roleId: string
  driverId?: string
  position?: string
  department?: string
  employeeNumber?: string
}): Promise<UserItem> {
  return apiFetch<UserItem>('/api/users', {
    method: 'POST',
    body: JSON.stringify(data),
  })
}

export async function updateUser(id: string, data: {
  name?: string
  email?: string
  phone?: string
  password?: string
  roleId?: string
  isActive?: boolean
  driverId?: string
  position?: string
  department?: string
  employeeNumber?: string
}): Promise<UserItem> {
  return apiFetch<UserItem>(`/api/users/${id}`, {
    method: 'PUT',
    body: JSON.stringify(data),
  })
}

export async function deleteUser(id: string): Promise<{ success: boolean }> {
  return apiFetch<{ success: boolean }>(`/api/users/${id}`, {
    method: 'DELETE',
  })
}

// ============ ROLES ============

export interface RoleItem {
  id: string
  name: string
  description: string | null
  permissions: string[]
  isSystem: boolean
  userCount: number
  createdAt: string
}

export async function fetchRoles(): Promise<{ data: RoleItem[] }> {
  return apiFetch<{ data: RoleItem[] }>('/api/roles')
}

export async function createRole(data: {
  name: string
  description?: string
  permissions: string[]
}): Promise<RoleItem> {
  return apiFetch<RoleItem>('/api/roles', {
    method: 'POST',
    body: JSON.stringify(data),
  })
}

export async function updateRole(id: string, data: {
  name?: string
  description?: string
  permissions?: string[]
}): Promise<RoleItem> {
  return apiFetch<RoleItem>(`/api/roles/${id}`, {
    method: 'PUT',
    body: JSON.stringify(data),
  })
}

export async function deleteRole(id: string): Promise<{ success: boolean }> {
  return apiFetch<{ success: boolean }>(`/api/roles/${id}`, {
    method: 'DELETE',
  })
}

// ============ CLIENTS ============

export interface ClientZone {
  id: string
  destinationZoneId: string
  zoneName: string
  cityName: string
  branchName?: string | null
  isPrimary: boolean
}

export interface ClientZoneDetail extends ClientZone {
  cityId: string
  cityRegion?: string | null
  address?: string | null
  contactPerson?: string | null
  phone?: string | null
  createdAt: string
}

export interface Client {
  id: string
  companyName: string
  contactPerson: string
  email?: string | null
  phone: string
  address?: string | null
  city?: string | null
  region?: string | null
  notes?: string | null
  isActive: boolean
  createdAt: string
  updatedAt: string
  tripCount: number
  totalRevenue: number
  lastTripDate?: string | null
  firstTripDate?: string | null
  zones: ClientZone[]
}

export interface ClientDetail extends Client {
  stats: {
    totalTrips: number
    completedTrips: number
    totalRevenue: number
    avgTripValue: number
    firstTripDate?: string | null
    lastTripDate?: string | null
  }
  recentTrips: ClientTrip[]
  zones: ClientZoneDetail[]
}

export interface ClientTrip {
  id: string
  tripNumber: string
  status: string
  loadingLocation: string
  destination: string
  itemName: string
  quantity: number
  unit: string
  totalRevenue?: number | null
  departureTime: string
  arrivalTime?: string | null
  truck: { id: string; plateNumber: string; make: string; model: string }
  driver: { id: string; firstName: string; lastName: string }
}

export async function fetchClients(params?: {
  search?: string
  isActive?: string
  page?: number
  limit?: number
}): Promise<ApiResponse<Client[]>> {
  const searchParams = new URLSearchParams()
  if (params?.search) searchParams.set('search', params.search)
  if (params?.isActive) searchParams.set('isActive', params.isActive)
  if (params?.page) searchParams.set('page', String(params.page))
  if (params?.limit) searchParams.set('limit', String(params.limit))
  const qs = searchParams.toString()
  return apiFetch<ApiResponse<Client[]>>(`/api/clients${qs ? `?${qs}` : ''}`)
}

export async function fetchClientDetail(id: string): Promise<ClientDetail> {
  return apiFetch<ClientDetail>(`/api/clients/${id}`)
}

export async function createClient(data: {
  companyName: string
  contactPerson: string
  phone: string
  email?: string
  address?: string
  city?: string
  region?: string
  notes?: string
  linkExistingTrips?: boolean
}): Promise<Client & { linkedTrips?: number }> {
  return apiFetch<Client & { linkedTrips?: number }>('/api/clients', {
    method: 'POST',
    body: JSON.stringify(data),
  })
}

export async function updateClient(id: string, data: {
  companyName?: string
  contactPerson?: string
  phone?: string
  email?: string
  address?: string
  city?: string
  region?: string
  notes?: string
  isActive?: boolean
  linkExistingTrips?: boolean
}): Promise<Client & { linkedTrips?: number }> {
  return apiFetch<Client & { linkedTrips?: number }>(`/api/clients/${id}`, {
    method: 'PUT',
    body: JSON.stringify(data),
  })
}

export async function deleteClient(id: string): Promise<{ success: boolean; message: string }> {
  return apiFetch<{ success: boolean; message: string }>(`/api/clients/${id}`, {
    method: 'DELETE',
  })
}

export async function bulkClientAction(action: string, ids: string[]): Promise<{ success: number; failed: number; errors: { id: string; message: string }[] }> {
  return apiFetch('/api/clients/bulk', { method: 'POST', body: JSON.stringify({ action, ids }) })
}

// ============ DRIVER SETTLEMENTS ============

export interface SettlementLine {
  id: string
  settlementId: string
  tripId?: string | null
  description: string
  type: string // trip_revenue, fuel_deduction, expense_deduction, bonus, adjustment
  amount: number
  trip?: { tripNumber: string; loadingLocation: string; destination: string; itemName?: string; quantity?: number; unit?: string } | null
}

export interface DriverSettlement {
  id: string
  driverId: string
  period: string
  periodStart: string
  periodEnd: string
  grossEarnings: number
  fuelDeductions: number
  expenseDeductions: number
  bonusAmount: number
  netPay: number
  status: string
  approvedBy?: string | null
  approvedAt?: string | null
  paidAt?: string | null
  notes?: string | null
  createdAt: string
  updatedAt: string
  driver: { id: string; firstName: string; lastName: string; employeeId: string; photo?: string | null; phone?: string | null }
  lines?: SettlementLine[]
  _count?: { lines: number }
}

export interface SettlementSummary {
  pendingCount: number
  pendingTotal: number
  approvedCount: number
  approvedTotal: number
  paidThisMonth: number
  avgSettlement: number
}

export async function fetchSettlements(params?: {
  driverId?: string
  status?: string
  period?: string
  page?: number
  limit?: number
}): Promise<ApiResponse<DriverSettlement[]> & { summary: SettlementSummary }> {
  const searchParams = new URLSearchParams()
  if (params?.driverId) searchParams.set('driverId', params.driverId)
  if (params?.status) searchParams.set('status', params.status)
  if (params?.period) searchParams.set('period', params.period)
  if (params?.page) searchParams.set('page', String(params.page))
  if (params?.limit) searchParams.set('limit', String(params.limit))
  const qs = searchParams.toString()
  return apiFetch<ApiResponse<DriverSettlement[]> & { summary: SettlementSummary }>(`/api/settlements${qs ? `?${qs}` : ''}`)
}

export async function fetchSettlementDetail(id: string): Promise<{ data: DriverSettlement }> {
  return apiFetch<{ data: DriverSettlement }>(`/api/settlements/${id}`)
}

export async function generateSettlement(data: {
  driverId: string
  periodStart: string
  periodEnd: string
}): Promise<{ data: DriverSettlement }> {
  return apiFetch<{ data: DriverSettlement }>('/api/settlements/generate', {
    method: 'POST',
    body: JSON.stringify(data),
  })
}

export async function updateSettlement(id: string, data: {
  status?: string
  notes?: string
  bonusAmount?: number
  approvedBy?: string
}): Promise<{ data: DriverSettlement }> {
  return apiFetch<{ data: DriverSettlement }>(`/api/settlements/${id}`, {
    method: 'PUT',
    body: JSON.stringify(data),
  })
}

export async function deleteSettlement(id: string): Promise<{ success: boolean }> {
  return apiFetch<{ success: boolean }>(`/api/settlements/${id}`, {
    method: 'DELETE',
  })
}

// ============ COST ANALYTICS ============

export interface CostAnalyticsData {
  fleetAvg: {
    costPerKm: number
    costPerTon: number
    totalCosts: number
    totalDistance: number
    totalTonnage: number
    truckCount: number
  }
  byTruck: {
    truckId: string
    plateNumber: string
    make: string
    model: string
    totalDistance: number
    totalTonnage: number
    totalCosts: number
    costPerKm: number
    costPerTon: number
    fuelCost: number
    maintenanceCost: number
    otherCost: number
  }[]
  monthlyTrend: {
    month: string
    year: number
    totalCosts: number
    totalDistance: number
    avgCostPerKm: number
    avgCostPerTon: number
    tripCount: number
  }[]
}

export async function fetchCostAnalytics(params?: {
  truckId?: string
  dateFrom?: string
  dateTo?: string
}): Promise<CostAnalyticsData> {
  const searchParams = new URLSearchParams()
  if (params?.truckId) searchParams.set('truckId', params.truckId)
  if (params?.dateFrom) searchParams.set('dateFrom', params.dateFrom)
  if (params?.dateTo) searchParams.set('dateTo', params.dateTo)
  const qs = searchParams.toString()
  return apiFetch<CostAnalyticsData>(`/api/analytics/costs${qs ? `?${qs}` : ''}`)
}

// ============ DRIVER PERFORMANCE ============

export interface DriverPerformanceItem {
  id: string
  firstName: string
  lastName: string
  phone: string
  status: string
  licenseNumber: string | null
  totalTrips: number
  completedTrips: number
  activeTrips: number
  cancelledTrips: number
  totalRevenue: number
  avgTripRevenue: number
  completionRate: number
  lastActiveDate: string | null
  currentTrip: {
    id: string
    tripNumber: string
    status: string
    loadingLocation: string
    destination: string
  } | null
}

export interface DriverPerformanceSummary {
  totalDrivers: number
  avgCompletionRate: number
  totalRevenueGenerated: number
  totalTripsCompleted: number
  topPerformer: string | null
}

export interface DriverPerformanceData {
  drivers: DriverPerformanceItem[]
  summary: DriverPerformanceSummary
}

export async function fetchDriverPerformance(range?: string): Promise<DriverPerformanceData> {
  const params = range ? `?range=${range}` : ''
  return apiFetch<DriverPerformanceData>(`/api/drivers/performance${params}`)
}

// ============ HOOK HELPERS ============

export function useApi<T>(fetcher: () => Promise<T>, deps: unknown[] = []) {
  const [data, setData] = React.useState<T | null>(null)
  const [loading, setLoading] = React.useState(true)
  const [error, setError] = React.useState<string | null>(null)

  const fetchData = React.useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const result = await fetcher()
      setData(result)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'An error occurred')
    } finally {
      setLoading(false)
    }
  }, deps)

  React.useEffect(() => {
    fetchData()
  }, [fetchData])

  return { data, loading, error, refetch: fetchData }
}

// ============ FUEL LOGS ============

export interface FuelLog {
  id: string
  tripId: string
  truckId: string
  date: string
  odometer: number | null
  fuelLevelBefore: number | null
  fuelLevelAfter: number | null
  litersFilled: number
  costPerLiter: number | null
  totalCost: number
  stationName: string | null
  fuelType: string
  receiptNumber: string | null
  images?: string | null
  createdAt: string
  updatedAt: string
  truck?: { id: string; plateNumber: string; make: string; model: string }
  trip?: { id: string; tripNumber: string }
}

export interface FuelLogStats {
  totalLiters: number
  totalCost: number
  avgCostPerLiter: number
  count: number
}

export async function fetchFuelLogs(params?: {
  truckId?: string
  tripId?: string
  fuelType?: string
  dateFrom?: string
  dateTo?: string
  search?: string
  page?: number
  limit?: number
  stats?: boolean
}): Promise<{ data: FuelLog[]; total: number; page: number; limit: number; stats?: FuelLogStats }> {
  const query = new URLSearchParams()
  if (params?.truckId) query.set('truckId', params.truckId)
  if (params?.tripId) query.set('tripId', params.tripId)
  if (params?.fuelType) query.set('fuelType', params.fuelType)
  if (params?.dateFrom) query.set('dateFrom', params.dateFrom)
  if (params?.dateTo) query.set('dateTo', params.dateTo)
  if (params?.search) query.set('search', params.search)
  if (params?.page) query.set('page', String(params.page))
  if (params?.limit) query.set('limit', String(params.limit))
  if (params?.stats) query.set('stats', 'true')
  return apiFetch(`/api/fuel-logs?${query.toString()}`)
}

export async function createFuelLog(data: Partial<FuelLog>): Promise<FuelLog> {
  return apiFetch('/api/fuel-logs', {
    method: 'POST',
    body: JSON.stringify(data),
  })
}

export async function updateFuelLog(id: string, data: Partial<FuelLog>): Promise<FuelLog> {
  return apiFetch(`/api/fuel-logs/${id}`, {
    method: 'PUT',
    body: JSON.stringify(data),
  })
}

export async function deleteFuelLog(id: string): Promise<void> {
  return apiFetch(`/api/fuel-logs/${id}`, {
    method: 'DELETE',
  })
}

export async function bulkDeleteFuelLogs(ids: string[]): Promise<{ success: number; failed: number; errors: { id: string; message: string }[] }> {
  return apiFetch('/api/fuel-logs/bulk', { method: 'POST', body: JSON.stringify({ action: 'delete', ids }) })
}

export interface FuelAnalyticsData {
  summary: {
    totalLiters: number
    totalCost: number
    avgCostPerLiter: number
    avgEfficiency: number
    totalFillUps: number
  }
  byTruck: {
    truckId: string
    plateNumber: string
    make: string
    model: string
    totalLiters: number
    totalCost: number
    avgCostPerLiter: number
    fillCount: number
    avgEfficiency: number
    totalDistance: number
  }[]
  monthlyTrend: {
    month: string
    year: number
    monthIndex: number
    totalLiters: number
    totalCost: number
    avgCostPerLiter: number
    avgEfficiency: number
    fillCount: number
  }[]
  byFuelType: {
    fuelType: string
    totalLiters: number
    totalCost: number
    avgCostPerLiter: number
    fillCount: number
  }[]
  byStation: {
    stationName: string
    totalCost: number
    totalLiters: number
    fillCount: number
    avgCostPerLiter: number
  }[]
  topConsumers: {
    truckId: string
    plateNumber: string
    totalCost: number
    totalLiters: number
    fillCount: number
  }[]
  priceTrend: {
    month: string
    avgCostPerLiter: number
  }[]
}

export async function fetchFuelAnalytics(params?: {
  truckId?: string
  dateFrom?: string
  dateTo?: string
}): Promise<FuelAnalyticsData> {
  const sp = new URLSearchParams()
  if (params?.truckId) sp.set('truckId', params.truckId)
  if (params?.dateFrom) sp.set('dateFrom', params.dateFrom)
  if (params?.dateTo) sp.set('dateTo', params.dateTo)
  const qs = sp.toString()
  return apiFetch<FuelAnalyticsData>(`/api/fuel-logs/analytics${qs ? `?${qs}` : ''}`)
}

// ============ FUEL BUDGETS ============

export interface FuelBudget {
  id: string
  truckId: string | null
  month: number
  year: number
  budgetLimit: number
  litersLimit: number | null
  actualSpend: number
  actualLiters: number
  notes: string | null
  createdAt: string
  updatedAt: string
  truck?: { id: string; plateNumber: string; make: string; model: string } | null
}

export async function fetchFuelBudgets(params?: {
  year?: number
  month?: number
  truckId?: string
}): Promise<FuelBudget[]> {
  const sp = new URLSearchParams()
  if (params?.year) sp.set('year', String(params.year))
  if (params?.month) sp.set('month', String(params.month))
  if (params?.truckId) sp.set('truckId', params.truckId)
  const qs = sp.toString()
  return apiFetch<FuelBudget[]>(`/api/fuel-budgets${qs ? `?${qs}` : ''}`)
}

export async function createFuelBudget(data: {
  truckId?: string
  month: number
  year: number
  budgetLimit: number
  litersLimit?: number
  notes?: string
}): Promise<FuelBudget> {
  return apiFetch<FuelBudget>('/api/fuel-budgets', {
    method: 'POST',
    body: JSON.stringify(data),
  })
}

export async function updateFuelBudget(id: string, data: {
  budgetLimit?: number
  litersLimit?: number
  notes?: string
}): Promise<FuelBudget> {
  return apiFetch<FuelBudget>(`/api/fuel-budgets/${id}`, {
    method: 'PUT',
    body: JSON.stringify(data),
  })
}

export async function deleteFuelBudget(id: string): Promise<{ success: boolean }> {
  return apiFetch<{ success: boolean }>(`/api/fuel-budgets/${id}`, {
    method: 'DELETE',
  })
}

// ============ FUEL ANOMALY DETECTION ============

export interface FuelAnomaly {
  type: 'excessive_consumption' | 'unexpected_drop' | 'rapid_refuel' | 'odometer_rollback'
  fuelLogId: string
  date: string
  description: string
  severity: 'warning' | 'critical'
  details: Record<string, number | string>
}

export interface FlaggedTruck {
  truckId: string
  plateNumber: string
  make: string
  model: string
  anomalyCount: number
  riskLevel: 'low' | 'medium' | 'high'
  anomalies: FuelAnomaly[]
}

export interface FuelAnomalyDetection {
  flaggedTrucks: FlaggedTruck[]
  summary: {
    totalTrucks: number
    trucksAnalyzed: number
    trucksFlagged: number
    highRiskCount: number
    mediumRiskCount: number
  }
}

export async function fetchFuelAnomalies(): Promise<FuelAnomalyDetection> {
  return apiFetch<FuelAnomalyDetection>('/api/fuel-logs/anomaly-detection')
}

// ============ FUEL ANOMALY DASHBOARD ============

export interface AnomalyDashboardAnomaly {
  id: string
  type: 'consumption_anomaly' | 'fill_without_travel' | 'overfilling' | 'cost_anomaly' | 'frequency_anomaly' | 'station_pattern'
  severity: 'low' | 'medium' | 'high'
  truckId: string
  plateNumber: string
  driverName: string
  description: string
  fuelLogId: string
  details: Record<string, unknown>
  estimatedLoss: number
  detectedAt: string
}

export interface AnomalyDashboardByTruck {
  truckId: string
  plateNumber: string
  anomalyCount: number
  totalEstimatedLoss: number
  avgConsumption: number
  fleetAvgConsumption: number
  deviation: number
  riskLevel: 'low' | 'medium' | 'high'
}

export interface AnomalyDashboardData {
  summary: {
    totalAnomalies: number
    highSeverity: number
    mediumSeverity: number
    lowSeverity: number
    estimatedLoss: number
    trucksFlagged: number
    fleetAvgConsumption: number
  }
  anomalies: AnomalyDashboardAnomaly[]
  byTruck: AnomalyDashboardByTruck[]
  consumptionTrends: { month: string; avgConsumption: number; expectedConsumption: number }[]
  recommendations: string[]
}

export async function fetchAnomalyDashboard(params?: {
  truckId?: string
  period?: string
  severity?: string
}): Promise<AnomalyDashboardData> {
  const searchParams = new URLSearchParams()
  if (params?.truckId) searchParams.set('truckId', params.truckId)
  if (params?.period) searchParams.set('period', params.period)
  if (params?.severity) searchParams.set('severity', params.severity)
  const qs = searchParams.toString()
  return apiFetch<AnomalyDashboardData>(`/api/fuel-logs/anomaly-dashboard${qs ? `?${qs}` : ''}`)
}

// ============ DOCUMENTS ============

export interface Document {
  id: string
  title: string
  description: string | null
  category: string
  entityType: string | null
  entityId: string | null
  fileName: string
  filePath: string
  fileSize: number
  mimeType: string
  uploadedBy: string | null
  createdAt: string
  updatedAt: string
}

export async function fetchDocuments(params?: {
  category?: string
  entityType?: string
  entityId?: string
  search?: string
  page?: number
  limit?: number
}): Promise<ApiResponse<Document[]>> {
  const sp = new URLSearchParams()
  if (params?.category) sp.set('category', params.category)
  if (params?.entityType) sp.set('entityType', params.entityType)
  if (params?.entityId) sp.set('entityId', params.entityId)
  if (params?.search) sp.set('search', params.search)
  if (params?.page) sp.set('page', String(params.page))
  if (params?.limit) sp.set('limit', String(params.limit))
  const qs = sp.toString()
  return apiFetch<ApiResponse<Document[]>>(`/api/documents${qs ? `?${qs}` : ''}`)
}

export async function uploadDocument(formData: FormData): Promise<Document> {
  const { token } = useAuthStore.getState()
  if (!token) throw new Error('Authentication required')
  const res = await fetch('/api/documents/upload', {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}` },
    body: formData,
  })
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: 'Upload failed' }))
    throw new Error(err.error || `Upload failed with status ${res.status}`)
  }
  return res.json()
}

export async function uploadFiles(files: File[]): Promise<string[]> {
  const { token } = useAuthStore.getState()
  if (!token) throw new Error('Authentication required')
  const formData = new FormData()
  files.forEach(f => formData.append('files', f))
  const res = await fetch('/api/upload', {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}` },
    body: formData,
  })
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: 'Upload failed' }))
    throw new Error(err.error || 'Upload failed')
  }
  const data = await res.json()
  return data.urls
}

export async function deleteDocument(id: string): Promise<{ success: boolean }> {
  return apiFetch<{ success: boolean }>(`/api/documents/${id}`, { method: 'DELETE' })
}

// Document preview/download URL helpers
export function getDocumentPreviewUrl(documentId: string): string {
  return `/api/documents/${documentId}/preview`
}

export function getDocumentDownloadUrl(documentId: string): string {
  return `/api/documents/${documentId}/download`
}

// ============ DATA EXPORT ============

/**
 * Triggers a CSV data export download for the given export type.
 * Builds query params from type + optional filters, fetches CSV from the
 * unified /api/export endpoint, and triggers a browser file download.
 *
 * @param type - Export type: trucks, drivers, trips, fuel-logs, expenses, payroll, insurance, maintenance
 * @param filters - Optional key-value filter pairs appended to the query string
 * @throws Error if the fetch fails or returns non-OK status
 */
export async function exportData(type: string, filters?: Record<string, string>): Promise<void> {
  const params = new URLSearchParams({ type, format: 'csv', ...filters })
  const { token } = useAuthStore.getState()
  if (!token) throw new Error('Authentication required. Please log in.')

  const response = await fetch(`/api/export?${params.toString()}`, {
    headers: { Authorization: `Bearer ${token}` },
  })
  if (!response.ok) throw new Error('Export failed')

  const blob = await response.blob()
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = `fleetpro-${type}-${new Date().toISOString().slice(0, 10)}.csv`
  document.body.appendChild(a)
  a.click()
  document.body.removeChild(a)
  URL.revokeObjectURL(url)
}

export async function downloadDocument(documentId: string, fileName: string): Promise<void> {
  const response = await fetch(`/api/documents/${documentId}/download`)
  if (!response.ok) throw new Error('Download failed')
  const blob = await response.blob()
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = fileName
  document.body.appendChild(a)
  a.click()
  document.body.removeChild(a)
  URL.revokeObjectURL(url)
}

export async function updateDocumentMetadata(id: string, data: {
  title?: string
  description?: string
  category?: string
}): Promise<Document> {
  return apiFetch<Document>(`/api/documents/${id}`, {
    method: 'PATCH',
    body: JSON.stringify(data),
  })
}

// ============ REPORTS ============

export interface ReportHistoryItem {
  id: string
  type: string
  title: string
  format: string
  parameters?: string
  generatedBy: string
  fileSize: string | null
  status: string
  error?: string | null
  createdAt: string
}

export interface ReportGenerateParams {
  type: string
  format: 'pdf' | 'xlsx' | 'csv'
  params?: {
    dateFrom?: string
    dateTo?: string
    truckId?: string
    driverId?: string
    clientId?: string
    status?: string
    tripId?: string
    periodStart?: string
    periodEnd?: string
  }
}

export async function generateReport(params: ReportGenerateParams): Promise<void> {
  const { token } = useAuthStore.getState()
  const res = await fetch('/api/reports/generate', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: JSON.stringify(params),
  })
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: 'Report generation failed' })) as { error?: string }
    throw new Error(err.error || 'Report generation failed')
  }
  // Download the file
  const disposition = res.headers.get('content-disposition')
  const match = disposition?.match(/filename="(.+)"/)
  const filename = match?.[1] || `report.${params.format}`
  const blob = await res.blob()
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  document.body.appendChild(a)
  a.click()
  document.body.removeChild(a)
  URL.revokeObjectURL(url)
}

export async function fetchReportHistory(params?: {
  type?: string
  limit?: number
  page?: number
}): Promise<{ data: ReportHistoryItem[]; total: number; page: number; limit: number }> {
  const searchParams = new URLSearchParams()
  if (params?.type) searchParams.set('type', params.type)
  if (params?.limit) searchParams.set('limit', String(params.limit))
  if (params?.page) searchParams.set('page', String(params.page))
  const qs = searchParams.toString()
  return apiFetch<{ data: ReportHistoryItem[]; total: number; page: number; limit: number }>(`/api/reports/history${qs ? `?${qs}` : ''}`)
}

export async function downloadPayslip(payrollId: string): Promise<void> {
  const { token } = useAuthStore.getState()
  const res = await fetch(`/api/reports/payslip?payrollId=${payrollId}`, {
    headers: { ...(token ? { Authorization: `Bearer ${token}` } : {}) },
  })
  if (!res.ok) throw new Error('Failed to generate payslip')
  const blob = await res.blob()
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = `payslip_${payrollId}.pdf`
  document.body.appendChild(a)
  a.click()
  document.body.removeChild(a)
  URL.revokeObjectURL(url)
}

export async function downloadWaybill(tripId: string): Promise<void> {
  const { token } = useAuthStore.getState()
  const res = await fetch(`/api/reports/waybill?tripId=${tripId}`, {
    headers: { ...(token ? { Authorization: `Bearer ${token}` } : {}) },
  })
  if (!res.ok) throw new Error('Failed to generate waybill')
  const blob = await res.blob()
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = `waybill_${tripId.slice(-8)}.pdf`
  document.body.appendChild(a)
  a.click()
  document.body.removeChild(a)
  URL.revokeObjectURL(url)
}

// ============ INVOICES ============

export interface InvoiceItem {
  id: string
  invoiceId: string
  description: string
  quantity: number
  unitPrice: number
  total: number
  order: number
}

export interface Invoice {
  id: string
  invoiceNumber: string
  clientId: string
  tripId?: string | null
  issueDate: string
  dueDate: string
  status: string // draft, sent, paid, overdue, cancelled
  subtotal: number
  taxAmount: number
  taxRate: number
  totalAmount: number
  paidAmount: number
  notes?: string | null
  terms?: string | null
  createdAt: string
  updatedAt: string
  client: {
    id: string
    companyName: string
    contactPerson: string
    phone: string
    email?: string | null
    address?: string | null
    city?: string | null
    region?: string | null
  } | null
  trip?: { id: string; tripNumber: string } | null
  items: InvoiceItem[]
}

export interface InvoiceSummary {
  totalInvoices: number
  outstandingAmount: number
  overdueCount: number
  thisMonthRevenue: number
}

export interface InvoiceListResponse extends ApiResponse<Invoice[]> {
  summary: InvoiceSummary
}

export async function fetchInvoices(params?: string): Promise<InvoiceListResponse> {
  return apiFetch<InvoiceListResponse>(`/api/invoices${params || ''}`)
}

export async function createInvoice(data: {
  clientId: string
  tripId?: string
  issueDate?: string
  dueDate: string
  taxRate?: number
  notes?: string
  terms?: string
  items: {
    description: string
    quantity: number
    unitPrice: number
    total: number
    order: number
  }[]
}): Promise<Invoice> {
  return apiFetch<Invoice>('/api/invoices', {
    method: 'POST',
    body: JSON.stringify(data),
  })
}

export async function updateInvoice(id: string, data: {
  clientId?: string
  tripId?: string | null
  issueDate?: string
  dueDate?: string
  taxRate?: number
  status?: string
  notes?: string | null
  terms?: string | null
  items?: {
    description: string
    quantity: number
    unitPrice: number
    total: number
    order: number
  }[]
}): Promise<Invoice> {
  return apiFetch<Invoice>(`/api/invoices/${id}`, {
    method: 'PUT',
    body: JSON.stringify(data),
  })
}

export async function deleteInvoice(id: string): Promise<{ success: boolean }> {
  return apiFetch<{ success: boolean }>(`/api/invoices/${id}`, {
    method: 'DELETE',
  })
}

export async function bulkInvoiceAction(action: string, ids: string[]): Promise<{ success: number; failed: number; errors: { id: string; message: string }[] }> {
  return apiFetch('/api/invoices/bulk', { method: 'POST', body: JSON.stringify({ action, ids }) })
}

export async function downloadInvoicePdf(invoiceId: string, invoiceNumber?: string): Promise<void> {
  const { token } = useAuthStore.getState()
  const res = await fetch(`/api/invoices/${invoiceId}/pdf`, {
    headers: { ...(token ? { Authorization: `Bearer ${token}` } : {}) },
  })
  if (!res.ok) throw new Error('Failed to generate invoice PDF')
  const blob = await res.blob()
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  // Use filename from Content-Disposition if available, otherwise fallback
  const disposition = res.headers.get('Content-Disposition')
  const match = disposition?.match(/filename="?([^";\n]+)"?/)
  a.download = match ? match[1] : `invoice_${invoiceNumber || invoiceId.slice(-8)}_${new Date().toISOString().split('T')[0]}.pdf`
  document.body.appendChild(a)
  a.click()
  document.body.removeChild(a)
  URL.revokeObjectURL(url)
}

export async function previewInvoicePdf(invoiceId: string): Promise<void> {
  const { token } = useAuthStore.getState()
  const res = await fetch(`/api/invoices/${invoiceId}/pdf`, {
    headers: { ...(token ? { Authorization: `Bearer ${token}` } : {}) },
  })
  if (!res.ok) throw new Error('Failed to generate invoice PDF')
  const blob = await res.blob()
  const url = URL.createObjectURL(blob)
  window.open(url, '_blank')
  // Revoke after a delay to allow the PDF viewer to load
  setTimeout(() => URL.revokeObjectURL(url), 60_000)
}

// ============ DVLA REGISTRATIONS ============

export interface DvlaRegistration {
  id: string
  truckId: string
  registrationNumber: string
  certificateNumber: string
  vehicleClass: string
  bodyType?: string | null
  registeredOwner: string
  dvlaOffice?: string | null
  registrationDate: string
  expiryDate: string
  status: string
  truck: { id: string; plateNumber: string; make: string; model: string }
  lastRenewalDate?: string | null
  notes?: string | null
}

export async function fetchDvlaRegistrations(params?: { truckId?: string; status?: string; vehicleClass?: string; search?: string; page?: number; limit?: number }): Promise<ApiResponse<DvlaRegistration[]>> {
  const searchParams = new URLSearchParams()
  if (params?.truckId) searchParams.set('truckId', params.truckId)
  if (params?.status) searchParams.set('status', params.status)
  if (params?.vehicleClass) searchParams.set('vehicleClass', params.vehicleClass)
  if (params?.search) searchParams.set('search', params.search)
  if (params?.page) searchParams.set('page', String(params.page))
  if (params?.limit) searchParams.set('limit', String(params.limit))
  const qs = searchParams.toString()
  return apiFetch<ApiResponse<DvlaRegistration[]>>(`/api/dvla-registrations${qs ? `?${qs}` : ''}`)
}

export async function createDvlaRegistration(data: Record<string, unknown>): Promise<DvlaRegistration> {
  return apiFetch<DvlaRegistration>('/api/dvla-registrations', {
    method: 'POST',
    body: JSON.stringify(data),
  })
}

export async function updateDvlaRegistration(id: string, data: Record<string, unknown>): Promise<DvlaRegistration> {
  return apiFetch<DvlaRegistration>(`/api/dvla-registrations/${id}`, {
    method: 'PUT',
    body: JSON.stringify(data),
  })
}

export async function deleteDvlaRegistration(id: string): Promise<{ message: string }> {
  return apiFetch<{ message: string }>(`/api/dvla-registrations/${id}`, {
    method: 'DELETE',
  })
}

// ============ ROADWORTHY INSPECTIONS ============

export interface RoadworthyInspection {
  id: string
  truckId: string
  certificateNumber: string
  inspectionType: string
  inspectionDate: string
  inspectionStation?: string | null
  inspectorName?: string | null
  inspectorId?: string | null
  result: string
  vehicleFitness?: string | null
  brakesCheck?: string | null
  lightsCheck?: string | null
  tyresCheck?: string | null
  emissionsCheck?: string | null
  steeringCheck?: string | null
  suspensionCheck?: string | null
  bodyCheck?: string | null
  electricalCheck?: string | null
  odometerReading?: number | null
  defectsFound?: string | null
  advisories?: string | null
  recommendations?: string | null
  certificateIssued?: boolean | null
  certificateExpiry?: string | null
  inspectionFee?: number | null
  nextInspectionDue?: string | null
  status: string
  truck: { id: string; plateNumber: string; make: string; model: string }
}

export async function fetchRoadworthyInspections(params?: { truckId?: string; result?: string; vehicleFitness?: string; inspectionType?: string; status?: string; page?: number; limit?: number }): Promise<ApiResponse<RoadworthyInspection[]>> {
  const searchParams = new URLSearchParams()
  if (params?.truckId) searchParams.set('truckId', params.truckId)
  if (params?.result) searchParams.set('result', params.result)
  if (params?.vehicleFitness) searchParams.set('vehicleFitness', params.vehicleFitness)
  if (params?.inspectionType) searchParams.set('inspectionType', params.inspectionType)
  if (params?.status) searchParams.set('status', params.status)
  if (params?.page) searchParams.set('page', String(params.page))
  if (params?.limit) searchParams.set('limit', String(params.limit))
  const qs = searchParams.toString()
  return apiFetch<ApiResponse<RoadworthyInspection[]>>(`/api/roadworthy-inspections${qs ? `?${qs}` : ''}`)
}

export async function createRoadworthyInspection(data: Record<string, unknown>): Promise<RoadworthyInspection> {
  return apiFetch<RoadworthyInspection>('/api/roadworthy-inspections', {
    method: 'POST',
    body: JSON.stringify(data),
  })
}

export async function updateRoadworthyInspection(id: string, data: Record<string, unknown>): Promise<RoadworthyInspection> {
  return apiFetch<RoadworthyInspection>(`/api/roadworthy-inspections/${id}`, {
    method: 'PUT',
    body: JSON.stringify(data),
  })
}

export async function deleteRoadworthyInspection(id: string): Promise<{ message: string }> {
  return apiFetch<{ message: string }>(`/api/roadworthy-inspections/${id}`, {
    method: 'DELETE',
  })
}

// ============ INSURANCE ============

export interface InsurancePolicy {
  id: string
  truckId: string
  provider: string
  policyNumber: string
  type: string
  coverAmount?: number | null
  premium: number
  startDate: string
  endDate: string
  status: string
  notes?: string | null
  truck: { id: string; plateNumber: string; make: string; model: string }
}

export async function fetchInsurance(params?: { truckId?: string; status?: string; provider?: string; page?: number; limit?: number }): Promise<ApiResponse<InsurancePolicy[]>> {
  const searchParams = new URLSearchParams()
  if (params?.truckId) searchParams.set('truckId', params.truckId)
  if (params?.status) searchParams.set('status', params.status)
  if (params?.provider) searchParams.set('provider', params.provider)
  if (params?.page) searchParams.set('page', String(params.page))
  if (params?.limit) searchParams.set('limit', String(params.limit))
  const qs = searchParams.toString()
  return apiFetch<ApiResponse<InsurancePolicy[]>>(`/api/insurance${qs ? `?${qs}` : ''}`)
}

export async function createInsurance(data: Record<string, unknown>): Promise<InsurancePolicy> {
  return apiFetch<InsurancePolicy>('/api/insurance', {
    method: 'POST',
    body: JSON.stringify(data),
  })
}

export async function updateInsurance(id: string, data: Record<string, unknown>): Promise<InsurancePolicy> {
  return apiFetch<InsurancePolicy>(`/api/insurance/${id}`, {
    method: 'PUT',
    body: JSON.stringify(data),
  })
}

export async function deleteInsurance(id: string): Promise<{ message: string }> {
  return apiFetch<{ message: string }>(`/api/insurance/${id}`, {
    method: 'DELETE',
  })
}

// ============ TYRES ============

export interface Tyre {
  id: string
  truckId: string
  serialNumber: string
  brand: string
  purchaseDate: string
  purchasePrice: number
  condition: string
  lastInspection?: string | null
  retiredDate?: string | null
  retiredReason?: string | null
  notes?: string | null
  truck: { id: string; plateNumber: string; make: string; model: string }
}

export async function fetchTyres(params?: { truckId?: string; condition?: string; brand?: string; page?: number; limit?: number }): Promise<ApiResponse<Tyre[]>> {
  const searchParams = new URLSearchParams()
  if (params?.truckId) searchParams.set('truckId', params.truckId)
  if (params?.condition) searchParams.set('condition', params.condition)
  if (params?.brand) searchParams.set('brand', params.brand)
  if (params?.page) searchParams.set('page', String(params.page))
  if (params?.limit) searchParams.set('limit', String(params.limit))
  const qs = searchParams.toString()
  return apiFetch<ApiResponse<Tyre[]>>(`/api/tyres${qs ? `?${qs}` : ''}`)
}

export async function createTyre(data: Record<string, unknown>): Promise<Tyre> {
  return apiFetch<Tyre>('/api/tyres', {
    method: 'POST',
    body: JSON.stringify(data),
  })
}

export async function updateTyre(id: string, data: Record<string, unknown>): Promise<Tyre> {
  return apiFetch<Tyre>(`/api/tyres/${id}`, {
    method: 'PUT',
    body: JSON.stringify(data),
  })
}

export async function deleteTyre(id: string): Promise<{ message: string }> {
  return apiFetch<{ message: string }>(`/api/tyres/${id}`, {
    method: 'DELETE',
  })
}

// ============ AUDIT LOGS ============

export interface AuditLog {
  id: string
  userId: string
  action: string
  entity: string
  entityId?: string | null
  details: Record<string, unknown> | null
  ipAddress?: string | null
  createdAt: string
  user: {
    id: string
    name: string
    email: string
  } | null
}

export async function fetchAuditLogs(params?: { page?: number; limit?: number; entity?: string; entityId?: string; userId?: string; action?: string; startDate?: string; endDate?: string }): Promise<ApiResponse<AuditLog[]>> {
  const searchParams = new URLSearchParams()
  if (params?.entity) searchParams.set('entity', params.entity)
  if (params?.entityId) searchParams.set('entityId', params.entityId)
  if (params?.userId) searchParams.set('userId', params.userId)
  if (params?.action) searchParams.set('action', params.action)
  if (params?.page) searchParams.set('page', String(params.page))
 if (params?.limit) searchParams.set('limit', String(params.limit))
 if (params?.startDate) searchParams.set('startDate', params.startDate)
 if (params?.endDate) searchParams.set('endDate', params.endDate)
  const qs = searchParams.toString()
  return apiFetch<ApiResponse<AuditLog[]>>(`/api/audit-logs${qs ? `?${qs}` : ''}`)
}

// ============ PASSWORD RESET (unauthenticated — uses plain fetch) ============

/**
 * Request a password reset code. Uses plain fetch (no auth token required).
 */
export async function forgotPassword(email: string): Promise<{ success: boolean; message: string; devToken?: string }> {
  const res = await fetch('/api/auth/forgot-password', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email }),
  })
  const data = await res.json()
  if (!res.ok) throw new Error(data.error || 'Failed to request password reset')
  return data
}

/**
 * Reset a password using a reset code. Uses plain fetch (no auth token required).
 */
export async function resetPassword(token: string, newPassword: string): Promise<{ success: boolean; message: string }> {
  const res = await fetch('/api/auth/reset-password', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ token, newPassword }),
  })
  const data = await res.json()
  if (!res.ok) throw new Error(data.error || 'Failed to reset password')
  return data
}

/**
 * Admin reset: set a new password for another user. Requires auth token.
 */
export async function adminResetPassword(userId: string, newPassword: string): Promise<{ success: boolean; message: string }> {
  return apiFetch<{ success: boolean; message: string }>('/api/auth/admin-reset-password', {
    method: 'POST',
    body: JSON.stringify({ userId, newPassword }),
  })
}

// ============ VEHICLE INSPECTIONS ============

export interface CheckItem {
  name: string
  category: string
  status: 'ok' | 'warning' | 'fail'
  notes?: string
  severity?: string
}

export interface DefectDetail {
  item: string
  severity: string
  description: string
  photoUrl?: string
}

export interface VehicleInspection {
  id: string
  truckId: string
  truck: { id: string; plateNumber: string; make: string; model: string }
  driverId?: string | null
  driver?: { id: string; firstName: string; lastName: string; phone: string } | null
  tripId?: string | null
  trip?: { id: string; tripNumber: string } | null
  type: string // pre_trip, post_trip
  inspectionDate: string
  odometerReading?: number | null
  result: string // pass, conditional_pass, fail
  overallNotes?: string | null
  checkItems: string // JSON
  totalChecks: number
  passCount: number
  warningCount: number
  failCount: number
  defectsFound: boolean
  defectDetails?: string | null // JSON
  photos?: string | null // JSON
  inspectedBy?: string | null
  inspectorName?: string | null
  signature?: string | null
  location?: string | null
  latitude?: number | null
  longitude?: number | null
  requiresFollowUp: boolean
  followUpNotes?: string | null
  followUpCompletedAt?: string | null
  createdAt: string
  updatedAt: string
}

export interface InspectionSummary {
  thisMonth: {
    total: number
    pass: number
    conditionalPass: number
    fail: number
    defects: number
    passRate: number
  }
  allTime: {
    total: number
    pass: number
    fail: number
    passRate: number
  }
  failedRequiringFollowUp: number
  recentFails: VehicleInspection[]
  defectTrends: { category: string; count: number }[]
}

export async function fetchInspections(params?: {
  truckId?: string
  driverId?: string
  type?: string
  result?: string
  dateFrom?: string
  dateTo?: string
  page?: number
  limit?: number
}): Promise<ApiResponse<VehicleInspection[]>> {
  const searchParams = new URLSearchParams()
  if (params?.truckId) searchParams.set('truckId', params.truckId)
  if (params?.driverId) searchParams.set('driverId', params.driverId)
  if (params?.type) searchParams.set('type', params.type)
  if (params?.result) searchParams.set('result', params.result)
  if (params?.dateFrom) searchParams.set('dateFrom', params.dateFrom)
  if (params?.dateTo) searchParams.set('dateTo', params.dateTo)
  if (params?.page) searchParams.set('page', String(params.page))
  if (params?.limit) searchParams.set('limit', String(params.limit))
  const qs = searchParams.toString()
  return apiFetch<ApiResponse<VehicleInspection[]>>(`/api/inspections${qs ? `?${qs}` : ''}`)
}

export async function fetchInspection(id: string): Promise<VehicleInspection> {
  return apiFetch<VehicleInspection>(`/api/inspections/${id}`)
}

export async function createInspection(data: {
  truckId: string
  driverId?: string
  tripId?: string
  type: string
  odometerReading?: number
  overallNotes?: string
  checkItems: CheckItem[]
  photos?: string[]
  inspectorName?: string
  signature?: string
  location?: string
  latitude?: number
  longitude?: number
  requiresFollowUp?: boolean
  followUpNotes?: string
}): Promise<VehicleInspection> {
  return apiFetch<VehicleInspection>('/api/inspections', {
    method: 'POST',
    body: JSON.stringify(data),
  })
}

export async function updateInspection(id: string, data: Record<string, unknown>): Promise<VehicleInspection> {
  return apiFetch<VehicleInspection>(`/api/inspections/${id}`, {
    method: 'PUT',
    body: JSON.stringify(data),
  })
}

export async function deleteInspection(id: string): Promise<{ success: boolean }> {
  return apiFetch<{ success: boolean }>(`/api/inspections/${id}`, {
    method: 'DELETE',
  })
}

export async function fetchInspectionSummary(): Promise<InspectionSummary> {
  return apiFetch<InspectionSummary>('/api/inspections/summary')
}

// ============ TOLL FEE & CHECKPOINT COST TRACKER ============

export interface TollRecord {
  id: string
  truckId: string
  driverId?: string | null
  tripId?: string | null
  tollPoint: string
  tollType: string
  location?: string | null
  route?: string | null
  latitude?: number | null
  longitude?: number | null
  amount: number
  paymentMethod: string
  referenceNumber?: string | null
  tollDate: string
  direction?: string | null
  status: string
  disputeReason?: string | null
  resolvedBy?: string | null
  resolvedAt?: string | null
  vehicleWeight?: number | null
  overloaded: boolean
  overloadFine?: number | null
  notes?: string | null
  createdAt: string
  truck: { id: string; plateNumber: string; make: string; model: string }
  driver?: { id: string; firstName: string; lastName: string } | null
}

export interface TollAnalytics {
  summary: {
    totalSpend: number
    totalFines: number
    overloadCount: number
    recordCount: number
    avgPerTrip: number
    mostUsedRoute: string
    mostUsedRouteSpend: number
  }
  monthlyTrend: Array<{ month: string; year: number; total: number; count: number }>
  spendByRoute: Array<{ route: string; _sum: { amount: number }; _count: number }>
  spendByTruck: Array<{ truckId: string; plateNumber: string; totalSpend: number; totalFines: number; recordCount: number }>
  topTollPoints: Array<{ tollPoint: string; totalSpend: number; recordCount: number }>
  spendByType: Array<{ type: string; totalSpend: number; recordCount: number }>
}

export async function fetchTollRecords(params?: {
  truckId?: string
  driverId?: string
  tripId?: string
  tollType?: string
  dateFrom?: string
  dateTo?: string
  route?: string
  status?: string
  search?: string
  page?: number
  limit?: number
}): Promise<ApiResponse<TollRecord[]>> {
  const searchParams = new URLSearchParams()
  if (params?.truckId) searchParams.set('truckId', params.truckId)
  if (params?.driverId) searchParams.set('driverId', params.driverId)
  if (params?.tripId) searchParams.set('tripId', params.tripId)
  if (params?.tollType) searchParams.set('tollType', params.tollType)
  if (params?.dateFrom) searchParams.set('dateFrom', params.dateFrom)
  if (params?.dateTo) searchParams.set('dateTo', params.dateTo)
  if (params?.route) searchParams.set('route', params.route)
  if (params?.status) searchParams.set('status', params.status)
  if (params?.search) searchParams.set('search', params.search)
  if (params?.page) searchParams.set('page', String(params.page))
  if (params?.limit) searchParams.set('limit', String(params.limit))
  const qs = searchParams.toString()
  return apiFetch<ApiResponse<TollRecord[]>>(`/api/tolls${qs ? `?${qs}` : ''}`)
}

export async function createTollRecord(data: Record<string, unknown>): Promise<TollRecord> {
  return apiFetch<TollRecord>('/api/tolls', {
    method: 'POST',
    body: JSON.stringify(data),
  })
}

export async function updateTollRecord(id: string, data: Record<string, unknown>): Promise<TollRecord> {
  return apiFetch<TollRecord>(`/api/tolls/${id}`, {
    method: 'PUT',
    body: JSON.stringify(data),
  })
}

export async function deleteTollRecord(id: string): Promise<{ success: boolean }> {
  return apiFetch<{ success: boolean }>(`/api/tolls/${id}`, { method: 'DELETE' })
}

export async function fetchTollAnalytics(dateFrom?: string, dateTo?: string): Promise<TollAnalytics> {
  const params = new URLSearchParams()
  if (dateFrom) params.set('dateFrom', dateFrom)
  if (dateTo) params.set('dateTo', dateTo)
  const qs = params.toString()
  return apiFetch<TollAnalytics>(`/api/tolls/analytics${qs ? `?${qs}` : ''}`)
}

// ============ EXPENSE APPROVAL WORKFLOW ============

export interface ExpenseApproval {
  id: string
  expenseId: string
  status: string // pending, approved, rejected, partial
  requestedById: string
  requestedBy: { id: string; name: string; email: string }
  approvedById: string | null
  approvedBy: { id: string; name: string; email: string } | null
  approvalLevel: number
  amount: number
  approvedAmount: number | null
  notes: string | null
  rejectionReason: string | null
  reviewedAt: string | null
  createdAt: string
  updatedAt: string
  expense: {
    id: string
    category: string
    description: string
    amount: number
    date: string
    truck: { id: string; plateNumber: string; make: string; model: string }
    trip: { id: string; tripNumber: string; loadingLocation: string; destination: string } | null
  }
}

export interface ExpenseApprovalSummary {
  pendingCount: number
  pendingAmount: number
  approvedThisMonthCount: number
  approvedThisMonthAmount: number
  avgApprovalHours: number
  totalCount: number
}

export async function fetchExpenseApprovals(params?: {
  status?: string
  expenseId?: string
  requestedById?: string
  page?: number
  limit?: number
}): Promise<ApiResponse<ExpenseApproval[]> & { summary: ExpenseApprovalSummary }> {
  const searchParams = new URLSearchParams()
  if (params?.status) searchParams.set('status', params.status)
  if (params?.expenseId) searchParams.set('expenseId', params.expenseId)
  if (params?.requestedById) searchParams.set('requestedById', params.requestedById)
  if (params?.page) searchParams.set('page', String(params.page))
  if (params?.limit) searchParams.set('limit', String(params.limit))
  const qs = searchParams.toString()
  return apiFetch<ApiResponse<ExpenseApproval[]> & { summary: ExpenseApprovalSummary }>(
    `/api/expense-approvals${qs ? `?${qs}` : ''}`
  )
}

export async function fetchExpenseApproval(id: string): Promise<ExpenseApproval> {
  return apiFetch<ExpenseApproval>(`/api/expense-approvals/${id}`)
}

export async function createExpenseApproval(data: {
  expenseId: string
  approvalLevel?: number
  notes?: string
}): Promise<ExpenseApproval> {
  return apiFetch<ExpenseApproval>('/api/expense-approvals', {
    method: 'POST',
    body: JSON.stringify(data),
  })
}

export async function updateExpenseApproval(
  id: string,
  data: {
    status: 'approved' | 'rejected' | 'partial'
    approvedAmount?: number
    notes?: string
    rejectionReason?: string
  }
): Promise<ExpenseApproval> {
  return apiFetch<ExpenseApproval>(`/api/expense-approvals/${id}`, {
    method: 'PUT',
    body: JSON.stringify(data),
  })
}

// ============ FUEL STATIONS & PRICE TRACKER ============

export interface FuelStation {
  id: string
  name: string
  brand: string
  stationCode?: string | null
  address?: string | null
  city?: string | null
  region?: string | null
  latitude?: number | null
  longitude?: number | null
  route?: string | null
  phone?: string | null
  email?: string | null
  operatingHours?: string | null
  hasCardPayment: boolean
  hasLoyaltyProgram: boolean
  hasHGV: boolean
  hasAdBlue: boolean
  hasWorkshop: boolean
  corporateRatePerLiter?: number | null
  rating?: number | null
  totalRatings: number
  isActive: boolean
  notes?: string | null
  createdAt: string
  updatedAt: string
  fuelPrices?: FuelPrice[]
}

export interface FuelPrice {
  id: string
  stationId: string
  fuelType: string
  pricePerLiter: number
  effectiveDate: string
  source: string
  verified: boolean
  notes?: string | null
  createdAt: string
  updatedAt: string
  station?: { id: string; name: string; brand: string; city?: string | null; route?: string | null; latitude?: number | null; longitude?: number | null; isActive: boolean }
}

export interface FuelPriceAnalytics {
  summary: {
    overallAvg: number
    cheapestPrice: number
    priceChange: number | null
    priceChangePercent: number | null
    activeStations: number
    totalPrices: number
  }
  trends: { month: string; avgPrice: number; minPrice: number; maxPrice: number; entries: number }[]
  cheapest: (FuelPrice & { station: NonNullable<FuelPrice["station"]> })[]
  mostExpensive: (FuelPrice & { station: NonNullable<FuelPrice["station"]> })[]
  brandComparison: { brand: string; avgPrice: number; minPrice: number; maxPrice: number; stationCount: number }[]
}

export async function fetchFuelStations(params?: {
  brand?: string
  city?: string
  route?: string
  hasHGV?: string
  search?: string
  isActive?: string
  page?: number
  limit?: number
}): Promise<ApiResponse<FuelStation[]>> {
  const sp = new URLSearchParams()
  if (params?.brand) sp.set("brand", params.brand)
  if (params?.city) sp.set("city", params.city)
  if (params?.route) sp.set("route", params.route)
  if (params?.hasHGV) sp.set("hasHGV", params.hasHGV)
  if (params?.search) sp.set("search", params.search)
  if (params?.isActive) sp.set("isActive", params.isActive)
  if (params?.page) sp.set("page", String(params.page))
  if (params?.limit) sp.set("limit", String(params.limit))
  const qs = sp.toString()
  return apiFetch<ApiResponse<FuelStation[]>>(`/api/fuel-stations${qs ? `?${qs}` : ""}`)
}

export async function fetchFuelStation(id: string): Promise<FuelStation> {
  return apiFetch<FuelStation>(`/api/fuel-stations/${id}`)
}

export async function createFuelStation(data: Record<string, unknown>): Promise<FuelStation> {
  return apiFetch<FuelStation>("/api/fuel-stations", {
    method: "POST",
    body: JSON.stringify(data),
  })
}

export async function updateFuelStation(id: string, data: Record<string, unknown>): Promise<FuelStation> {
  return apiFetch<FuelStation>(`/api/fuel-stations/${id}`, {
    method: "PUT",
    body: JSON.stringify(data),
  })
}

export async function deleteFuelStation(id: string): Promise<{ success: boolean }> {
  return apiFetch<{ success: boolean }>(`/api/fuel-stations/${id}`, { method: "DELETE" })
}

export async function fetchFuelPrices(params?: {
  fuelType?: string
  stationId?: string
  brand?: string
  dateFrom?: string
  dateTo?: string
}): Promise<{ data: FuelPrice[]; latest: { stationId: string; fuelType: string; _max: { effectiveDate: string; pricePerLiter: number } }[] }> {
  const sp = new URLSearchParams()
  if (params?.fuelType) sp.set("fuelType", params.fuelType)
  if (params?.stationId) sp.set("stationId", params.stationId)
  if (params?.brand) sp.set("brand", params.brand)
  if (params?.dateFrom) sp.set("dateFrom", params.dateFrom)
  if (params?.dateTo) sp.set("dateTo", params.dateTo)
  const qs = sp.toString()
  return apiFetch(`/api/fuel-stations/prices${qs ? `?${qs}` : ""}`)
}

export async function createFuelPrice(data: {
  stationId: string
  fuelType: string
  pricePerLiter: number
  effectiveDate?: string
  source?: string
  verified?: boolean
  notes?: string
}): Promise<FuelPrice> {
  return apiFetch<FuelPrice>("/api/fuel-stations/prices", {
    method: "POST",
    body: JSON.stringify(data),
  })
}

export async function fetchFuelPriceAnalytics(params?: {
  fuelType?: string
  months?: number
}): Promise<FuelPriceAnalytics> {
  const sp = new URLSearchParams()
  if (params?.fuelType) sp.set("fuelType", params.fuelType)
  if (params?.months) sp.set("months", String(params.months))
  const qs = sp.toString()
  return apiFetch<FuelPriceAnalytics>(`/api/fuel-stations/analytics${qs ? `?${qs}` : ""}`)
}

// ============ ROAD CONDITION REPORTS ============

export interface RoadConditionReport {
  id: string
  reporterId: string
  roadName: string
  region: string
  condition: string // good, fair, poor, blocked
  hazardType: string // pothole, flood, accident, construction, erosion, none
  description?: string | null
  severity: string // low, medium, high, critical
  latitude?: number | null
  longitude?: number | null
  reportedAt: string
  resolvedAt?: string | null
  status: string // active, resolved, ignored
  imageUrl?: string | null
  tripId?: string | null
  createdAt: string
  updatedAt: string
  reporter: { id: string; name: string; email: string } | null
  trip: { id: string; tripNumber: string } | null
}

export interface RoadConditionAnalytics {
  totalReports: number
  activeReports: number
  resolvedReports: number
  reportsThisWeek: number
  criticalActive: number
  highActive: number
  avgResolutionHours: number | null
  byRegion: { region: string; count: number }[]
  byCondition: { condition: string; count: number }[]
  byHazardType: { hazardType: string; count: number }[]
  bySeverity: { severity: string; count: number }[]
  recentReports: { reportedAt: string; condition: string; severity: string }[]
}

export async function fetchRoadConditions(params?: {
  region?: string
  condition?: string
  severity?: string
  status?: string
  hazardType?: string
  page?: number
  limit?: number
}): Promise<ApiResponse<RoadConditionReport[]>> {
  const searchParams = new URLSearchParams()
  if (params?.region) searchParams.set('region', params.region)
  if (params?.condition) searchParams.set('condition', params.condition)
  if (params?.severity) searchParams.set('severity', params.severity)
  if (params?.status) searchParams.set('status', params.status)
  if (params?.hazardType) searchParams.set('hazardType', params.hazardType)
  if (params?.page) searchParams.set('page', String(params.page))
  if (params?.limit) searchParams.set('limit', String(params.limit))
  const qs = searchParams.toString()
  return apiFetch<ApiResponse<RoadConditionReport[]>>(`/api/road-conditions${qs ? `?${qs}` : ''}`)
}

export async function fetchRoadCondition(id: string): Promise<RoadConditionReport> {
  return apiFetch<RoadConditionReport>(`/api/road-conditions/${id}`)
}

export async function createRoadCondition(data: {
  roadName: string
  region: string
  condition: string
  hazardType?: string
  description?: string
  severity: string
  latitude?: number
  longitude?: number
  imageUrl?: string
  tripId?: string
}): Promise<RoadConditionReport> {
  return apiFetch<RoadConditionReport>('/api/road-conditions', {
    method: 'POST',
    body: JSON.stringify(data),
  })
}

export async function updateRoadCondition(id: string, data: {
  status?: string
  condition?: string
  severity?: string
  description?: string | null
  hazardType?: string
  imageUrl?: string | null
  latitude?: number | null
  longitude?: number | null
}): Promise<RoadConditionReport> {
  return apiFetch<RoadConditionReport>(`/api/road-conditions/${id}`, {
    method: 'PUT',
    body: JSON.stringify(data),
  })
}

export async function deleteRoadCondition(id: string): Promise<{ success: boolean }> {
  return apiFetch<{ success: boolean }>(`/api/road-conditions/${id}`, {
    method: 'DELETE',
  })
}

// Aliases used by RoadConditionsView
export const createRoadConditionReport = createRoadCondition
export const updateRoadConditionReport = (id: string, data: { status?: string; condition?: string; severity?: string; description?: string | null; hazardType?: string }) =>
  updateRoadCondition(id, data)
export const deleteRoadConditionReport = async (id: string): Promise<void> => {
  await deleteRoadCondition(id)
}

export async function fetchRoadConditionAnalytics(): Promise<RoadConditionAnalytics> {
  return apiFetch<RoadConditionAnalytics>('/api/road-conditions/analytics')
}

// ============ BORDER CROSSINGS ============

export interface BorderCrossing {
  id: string
  tripId: string
  truckId: string
  driverId: string
  borderName: string
  country: string
  direction: string
  status: string
  queuedAt: string
  processingAt?: string | null
  clearedAt?: string | null
  estimatedWait?: number | null
  actualWait?: number | null
  clearanceFee?: number | null
  documentStatus?: string | null
  notes?: string | null
  createdBy: string
  createdAt: string
  updatedAt: string
  truck: { id: string; plateNumber: string; make: string; model: string }
  driver: { id: string; firstName: string; lastName: string }
  trip: { id: string; tripNumber: string; destination: string; status: string }
}

export interface BorderCrossingSummary {
  activeCrossings: number
  avgWaitTime: number
  clearedToday: number
  pendingClearance: number
}

export async function fetchBorderCrossings(params?: {
  status?: string
  borderName?: string
  country?: string
  direction?: string
  truckId?: string
  driverId?: string
  dateFrom?: string
  dateTo?: string
  page?: number
  limit?: number
}): Promise<ApiResponse<BorderCrossing[]> & { summary: BorderCrossingSummary }> {
  const searchParams = new URLSearchParams()
  if (params?.status) searchParams.set('status', params.status)
  if (params?.borderName) searchParams.set('borderName', params.borderName)
  if (params?.country) searchParams.set('country', params.country)
  if (params?.direction) searchParams.set('direction', params.direction)
  if (params?.truckId) searchParams.set('truckId', params.truckId)
  if (params?.driverId) searchParams.set('driverId', params.driverId)
  if (params?.dateFrom) searchParams.set('dateFrom', params.dateFrom)
  if (params?.dateTo) searchParams.set('dateTo', params.dateTo)
  if (params?.page) searchParams.set('page', String(params.page))
  if (params?.limit) searchParams.set('limit', String(params.limit))
  const qs = searchParams.toString()
  return apiFetch<ApiResponse<BorderCrossing[]> & { summary: BorderCrossingSummary }>(`/api/border-crossings${qs ? `?${qs}` : ''}`)
}

export async function createBorderCrossing(data: Record<string, unknown>): Promise<BorderCrossing> {
  return apiFetch<BorderCrossing>('/api/border-crossings', {
    method: 'POST',
    body: JSON.stringify(data),
  })
}

export async function updateBorderCrossing(id: string, data: Record<string, unknown>): Promise<BorderCrossing> {
  return apiFetch<BorderCrossing>(`/api/border-crossings/${id}`, {
    method: 'PUT',
    body: JSON.stringify(data),
  })
}

export async function deleteBorderCrossing(id: string): Promise<void> {
  await apiFetch<void>(`/api/border-crossings/${id}`, { method: 'DELETE' })
}

// ============ DEPOT QUEUE ============

export interface DepotQueue {
  id: string
  truckId: string
  driverId?: string | null
  tripId?: string | null
  depotName: string
  queueType: string
  status: string
  position?: number | null
  estimatedWait?: number | null
  actualWait?: number | null
  joinedAt: string
  startedAt?: string | null
  completedAt?: string | null
  notes?: string | null
  createdBy: string
  createdAt: string
  updatedAt: string
  truck: { id: string; plateNumber: string; make: string; model: string }
  driver: { id: string; firstName: string; lastName: string } | null
  trip: { id: string; tripNumber: string; destination: string; status: string } | null
}

export interface DepotQueueSummary {
  inQueue: number
  inProgress: number
  avgWait: number
  completedToday: number
}

export async function fetchDepotQueue(params?: {
  status?: string
  depotName?: string
  queueType?: string
  truckId?: string
  driverId?: string
  dateFrom?: string
  dateTo?: string
  page?: number
  limit?: number
}): Promise<ApiResponse<DepotQueue[]> & { summary: DepotQueueSummary }> {
  const searchParams = new URLSearchParams()
  if (params?.status) searchParams.set('status', params.status)
  if (params?.depotName) searchParams.set('depotName', params.depotName)
  if (params?.queueType) searchParams.set('queueType', params.queueType)
  if (params?.truckId) searchParams.set('truckId', params.truckId)
  if (params?.driverId) searchParams.set('driverId', params.driverId)
  if (params?.dateFrom) searchParams.set('dateFrom', params.dateFrom)
  if (params?.dateTo) searchParams.set('dateTo', params.dateTo)
  if (params?.page) searchParams.set('page', String(params.page))
  if (params?.limit) searchParams.set('limit', String(params.limit))
  const qs = searchParams.toString()
  return apiFetch<ApiResponse<DepotQueue[]> & { summary: DepotQueueSummary }>(`/api/depot-queue${qs ? `?${qs}` : ''}`)
}

export async function createDepotQueue(data: Record<string, unknown>): Promise<DepotQueue> {
  return apiFetch<DepotQueue>('/api/depot-queue', {
    method: 'POST',
    body: JSON.stringify(data),
  })
}

export async function updateDepotQueue(id: string, data: Record<string, unknown>): Promise<DepotQueue> {
  return apiFetch<DepotQueue>(`/api/depot-queue/${id}`, {
    method: 'PUT',
    body: JSON.stringify(data),
  })
}

export async function deleteDepotQueue(id: string): Promise<void> {
  await apiFetch<void>(`/api/depot-queue/${id}`, { method: 'DELETE' })
}

// ============ LOAD BOARD ============

export interface LoadBoardItem {
  id: string; clientId?: string | null;
  client: { id: string; companyName: string } | null;
  title: string; pickupLocation: string; dropoffLocation: string;
  pickupRegion: string; dropoffRegion: string; commodityType: string;
  weight?: number | null; truckType?: string | null; truckCount: number;
  offeredRate?: number | null; budgetMin?: number | null; budgetMax?: number | null;
  pickupDate?: string | null; deliveryDate?: string | null; status: string;
  requirements?: string | null; contactName?: string | null; contactPhone?: string | null;
  assignedTruckId?: string | null;
  assignedTruck: { id: string; plateNumber: string; make: string; model: string } | null;
  assignedDriverId?: string | null;
  assignedDriver: { id: string; firstName: string; lastName: string } | null;
  createdBy: string; creator: { id: string; name: string };
  createdAt: string; updatedAt: string;
}

export async function fetchLoadBoard(params?: {
  status?: string; pickupRegion?: string; dropoffRegion?: string;
  commodityType?: string; truckType?: string; page?: number; limit?: number;
}): Promise<ApiResponse<LoadBoardItem[]>> {
  const sp = new URLSearchParams()
  if (params?.status) sp.set('status', params.status)
  if (params?.pickupRegion) sp.set('pickupRegion', params.pickupRegion)
  if (params?.dropoffRegion) sp.set('dropoffRegion', params.dropoffRegion)
  if (params?.commodityType) sp.set('commodityType', params.commodityType)
  if (params?.truckType) sp.set('truckType', params.truckType)
  if (params?.page) sp.set('page', String(params.page))
  if (params?.limit) sp.set('limit', String(params.limit))
  const qs = sp.toString()
  return apiFetch<ApiResponse<LoadBoardItem[]>>(`/api/load-board${qs ? `?${qs}` : ''}`)
}

export async function createLoadBoard(data: {
  clientId?: string; title: string; pickupLocation: string; dropoffLocation: string;
  pickupRegion: string; dropoffRegion: string; commodityType: string;
  weight?: number | null; truckType?: string; truckCount?: number;
  offeredRate?: number | null; budgetMin?: number | null; budgetMax?: number | null;
  pickupDate?: string; deliveryDate?: string; requirements?: string;
  contactName?: string; contactPhone?: string;
}): Promise<LoadBoardItem> {
  return apiFetch<LoadBoardItem>('/api/load-board', { method: 'POST', body: JSON.stringify(data) })
}

export async function updateLoadBoard(id: string, data: Record<string, unknown>): Promise<LoadBoardItem> {
  return apiFetch<LoadBoardItem>(`/api/load-board/${id}`, { method: 'PUT', body: JSON.stringify(data) })
}

export async function deleteLoadBoard(id: string): Promise<void> {
  await apiFetch<void>(`/api/load-board/${id}`, { method: 'DELETE' })
}

// ============ INSURANCE CLAIMS ============

export interface InsuranceClaim {
  id: string
  insuranceId: string
  truckId: string
  claimNumber: string
  claimType: string
  incidentDate: string
  incidentLocation: string
  description: string
  status: string
  claimAmount: number
  approvedAmount: number | null
  deductible: number | null
  assignedAdjuster: string | null
  policeReport: string | null
  thirdPartyDetails: string | null
  damagePhotos: string | null
  repairEstimate: number | null
  submittedAt: string | null
  reviewedAt: string | null
  approvedAt: string | null
  paidAt: string | null
  closedAt: string | null
  notes: string | null
  assessorNotes: string | null
  createdBy: string
  createdAt: string
  updatedAt: string
  truck: { id: string; plateNumber: string; make: string; model: string }
  insurance: { id: string; provider: string; policyNumber: string; type: string }
  creator: { id: string; name: string }
}

export interface InsuranceClaimSummary {
  openCount: number
  reviewCount: number
  totalClaimed: number
  totalApproved: number
}

export async function fetchInsuranceClaims(params?: {
  status?: string
  claimType?: string
  insuranceId?: string
  truckId?: string
  search?: string
  page?: number
  limit?: number
}): Promise<ApiResponse<InsuranceClaim[]> & { summary: InsuranceClaimSummary }> {
  const sp = new URLSearchParams()
  if (params?.status) sp.set('status', params.status)
  if (params?.claimType) sp.set('claimType', params.claimType)
  if (params?.insuranceId) sp.set('insuranceId', params.insuranceId)
  if (params?.truckId) sp.set('truckId', params.truckId)
  if (params?.search) sp.set('search', params.search)
  if (params?.page) sp.set('page', String(params.page))
  if (params?.limit) sp.set('limit', String(params.limit))
  const qs = sp.toString()
  return apiFetch<ApiResponse<InsuranceClaim[]> & { summary: InsuranceClaimSummary }>(
    `/api/insurance-claims${qs ? `?${qs}` : ''}`
  )
}

export async function fetchInsuranceClaim(id: string): Promise<InsuranceClaim> {
  return apiFetch<InsuranceClaim>(`/api/insurance-claims/${id}`)
}

export async function createInsuranceClaim(data: Record<string, unknown>): Promise<InsuranceClaim> {
  return apiFetch<InsuranceClaim>('/api/insurance-claims', {
    method: 'POST',
    body: JSON.stringify(data),
  })
}

export async function updateInsuranceClaim(id: string, data: Record<string, unknown>): Promise<InsuranceClaim> {
  return apiFetch<InsuranceClaim>(`/api/insurance-claims/${id}`, {
    method: 'PUT',
    body: JSON.stringify(data),
  })
}

export async function deleteInsuranceClaim(id: string): Promise<{ success: boolean }> {
  return apiFetch<{ success: boolean }>(`/api/insurance-claims/${id}`, { method: 'DELETE' })
}

// ============ WAREHOUSE INVENTORY ============

export interface WarehouseItem {
  id: string
  name: string
  category: string
  sku: string
  quantity: number
  minStock: number
  unitPrice: number
  unit: string
  warehouse: string
  location?: string | null
  supplier?: string | null
  lastRestocked?: string | null
  expiryDate?: string | null
  status: string // in_stock, low_stock, out_of_stock, expired
  notes?: string | null
  createdBy: string
  creator: { id: string; name: string }
  createdAt: string
  updatedAt: string
}

export interface WarehouseAnalytics {
  totalItems: number
  totalValue: number
  lowStockAlerts: number
  outOfStockCount: number
  categoryCount: number
  warehouseCount: number
  itemsByCategory: { category: string; count: number; value: number }[]
  statusDistribution: { status: string; count: number }[]
  restockTrends: { month: string; count: number }[]
}

export async function fetchWarehouseItems(params?: {
  search?: string
  category?: string
  warehouse?: string
  status?: string
  page?: number
  limit?: number
}): Promise<ApiResponse<WarehouseItem[]>> {
  const sp = new URLSearchParams()
  if (params?.search) sp.set('search', params.search)
  if (params?.category) sp.set('category', params.category)
  if (params?.warehouse) sp.set('warehouse', params.warehouse)
  if (params?.status) sp.set('status', params.status)
  if (params?.page) sp.set('page', String(params.page))
  if (params?.limit) sp.set('limit', String(params.limit))
  const qs = sp.toString()
  return apiFetch<ApiResponse<WarehouseItem[]>>(`/api/warehouse${qs ? `?${qs}` : ''}`)
}

export async function fetchWarehouseItem(id: string): Promise<WarehouseItem> {
  return apiFetch<WarehouseItem>(`/api/warehouse/${id}`)
}

export async function createWarehouseItem(data: {
  name: string
  category: string
  sku?: string
  quantity: number
  minStock?: number
  unitPrice: number
  unit?: string
  warehouse?: string
  location?: string
  supplier?: string
  expiryDate?: string
  notes?: string
}): Promise<WarehouseItem> {
  return apiFetch<WarehouseItem>('/api/warehouse', {
    method: 'POST',
    body: JSON.stringify(data),
  })
}

export async function updateWarehouseItem(id: string, data: Record<string, unknown>): Promise<WarehouseItem> {
  return apiFetch<WarehouseItem>(`/api/warehouse/${id}`, {
    method: 'PUT',
    body: JSON.stringify(data),
  })
}

export async function deleteWarehouseItem(id: string): Promise<{ success: boolean }> {
  return apiFetch<{ success: boolean }>(`/api/warehouse/${id}`, {
    method: 'DELETE',
  })
}

export async function fetchWarehouseAnalytics(): Promise<WarehouseAnalytics> {
  return apiFetch<WarehouseAnalytics>('/api/warehouse/analytics')
}
