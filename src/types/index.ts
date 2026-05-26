// API response types
export interface ApiResponse<T> {
  data: T
  message?: string
}

export interface PaginatedResponse<T> {
  data: T[]
  total: number
  page: number
  pageSize: number
}

// Entity types (matching Prisma models)
export interface City {
  id: string
  name: string
  isActive: boolean
  createdAt: string
  updatedAt: string
}

export interface Zone {
  id: string
  name: string
  cityId: string
  rate: number
  isActive: boolean
  city?: City
}

export interface Supplier {
  id: string
  name: string
  contactPerson?: string
  phone?: string
  email?: string
  cityId: string
  isActive: boolean
}

export interface LoadingPoint {
  id: string
  name: string
  supplierId: string
  cityId: string
  address?: string
  isActive: boolean
  supplier?: Supplier
}

export interface Customer {
  id: string
  name: string
  phone: string
  email?: string
  zoneId?: string
  isActive: boolean
  zone?: Zone
}

export interface Item {
  id: string
  name: string
  unit: string
  isActive: boolean
}

export interface Truck {
  id: string
  plateNumber: string
  model?: string
  capacity?: number
  currentMileage?: number
  isActive: boolean
  driverId?: string
  driver?: Driver
}

export interface Driver {
  id: string
  name: string
  phone: string
  licenseNumber?: string
  isActive: boolean
}

// Trip types
export interface TripDeliveryDestinationInput {
  id?: string // for existing
  zoneId: string
  customerId: string
  phone: string
  rate: number
}

export interface TripItemInput {
  id?: string
  itemId: string
  quantity: number
  unit: string
  deliveryDestinationId: string
}

export interface TripFormData {
  loadingCityId: string
  loadingSupplierIds: string[]
  loadingPointId?: string
  departureTime?: string
  destinationCityId: string
  truckId: string
  notes?: string
  deliveryDestinations: TripDeliveryDestinationInput[]
  items: TripItemInput[]
}

export interface Trip extends Record<string, unknown> {
  id: string
  tripNumber: string
  loadingCityId: string
  loadingSupplierIds: string
  loadingPointId?: string
  departureTime?: string
  destinationCityId: string
  truckId: string
  driverId?: string
  status: string
  totalAmount: number
  totalBags: number
  notes?: string
  loadingCity?: City
  loadingPoint?: LoadingPoint
  destinationCity?: City
  truck?: Truck
  driver?: Driver
  deliveryDestinations?: TripDeliveryDestination[]
  items?: TripItem[]
  createdAt: string
  updatedAt: string
}

export interface TripDeliveryDestination {
  id: string
  tripId: string
  zoneId: string
  customerId: string
  phone: string
  rate: number
  zone?: Zone
  customer?: Customer
  items?: TripItem[]
}

export interface TripItem {
  id: string
  tripId: string
  itemId: string
  quantity: number
  unit: string
  rate: number
  amount: number
  deliveryDestinationId: string
  item?: Item
  deliveryDestination?: TripDeliveryDestination
}
