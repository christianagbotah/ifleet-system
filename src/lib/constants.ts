import {
  Truck,
  MapPin,
  Route,
  Navigation,
  Users,
  FileText,
  Receipt,
  DollarSign,
  CircleDot,
  Bell,
  Settings,
  LayoutDashboard,
  CreditCard,
  Wallet,
  WalletCards,
  Wrench,
  ShieldCheck,
  ClipboardList,
  BarChart3,
  Calculator,
  Building2,
  Globe,
  Warehouse,
  Trophy,
  Fuel,
  PiggyBank,
  TrendingUp,
  ShieldAlert,
  FileCheck,
  CarFront,
  Banknote,
  CalendarClock,
  AlertTriangle,
  Compass,
  ScrollText,
  CheckSquare,
  Ticket,
  ClipboardCheck,
  Package,
  Award,
  CalendarDays,
  CircleDollarSign,
  Scale,
  Store,
  RadioTower,
  Camera,
  type LucideIcon,
} from "lucide-react"

// ============ APP BRANDING ============
// Change the name here to rebrand the entire app.

export const APP_NAME = "iFleetPro"
export const APP_COMPANY = `${APP_NAME} Ltd.`
export const APP_TAGLINE = "Fleet Management System"
export const APP_TITLE = `${APP_NAME} - ${APP_TAGLINE}`
export const APP_COPYRIGHT = `© ${new Date().getFullYear()} ${APP_NAME} — ${APP_TAGLINE}`
export const APP_SMS_SENDER = APP_NAME

// ============ NAVIGATION ============

// Color schemes for each navigation group — used by Sidebar & mobile nav
export const GROUP_COLORS: Record<string, { bg: string; text: string; icon: string }> = {
  Main: {
    bg: 'bg-amber-100 dark:bg-amber-900/25',
    text: 'text-amber-700 dark:text-amber-400',
    icon: 'text-amber-600 dark:text-amber-400',
  },
  Operations: {
    bg: 'bg-emerald-100 dark:bg-emerald-900/25',
    text: 'text-emerald-700 dark:text-emerald-400',
    icon: 'text-emerald-600 dark:text-emerald-400',
  },
  Finance: {
    bg: 'bg-sky-100 dark:bg-sky-900/25',
    text: 'text-sky-700 dark:text-sky-400',
    icon: 'text-sky-600 dark:text-sky-400',
  },
  Maintenance: {
    bg: 'bg-orange-100 dark:bg-orange-900/25',
    text: 'text-orange-700 dark:text-orange-400',
    icon: 'text-orange-600 dark:text-orange-400',
  },
  Compliance: {
    bg: 'bg-teal-100 dark:bg-teal-900/25',
    text: 'text-teal-700 dark:text-teal-400',
    icon: 'text-teal-600 dark:text-teal-400',
  },
  Admin: {
    bg: 'bg-violet-100 dark:bg-violet-900/25',
    text: 'text-violet-700 dark:text-violet-400',
    icon: 'text-violet-600 dark:text-violet-400',
  },
}

export interface NavItem {
  id: string
  label: string
  icon: LucideIcon
  href?: string
  badge?: number
}

export interface NavGroup {
  label: string
  items: NavItem[]
}

export const navigationGroups: NavGroup[] = [
  {
    label: "Main",
    items: [
      { id: "dashboard", label: "Dashboard", icon: LayoutDashboard },
      { id: "operations-center", label: "Operations Center", icon: RadioTower },
      { id: "analytics", label: "Analytics", icon: BarChart3 },
      { id: "reports", label: "Reports", icon: FileText },
      { id: "haulage-reports", label: "Haulage Reports", icon: BarChart3 },
      { id: "cost-analytics", label: "Cost Analytics", icon: Calculator },
      { id: "tracking", label: "Live Tracking", icon: MapPin },
      { id: "control-tower", label: "Control Tower", icon: RadioTower },
      { id: "client-portal", label: "Client Portal", icon: Globe },
    ],
  },
  {
    label: "Operations",
    items: [
      { id: "trucks", label: "Trucks", icon: Truck },
      { id: "trailers", label: "Trailers", icon: Truck },
      { id: "telematics-devices", label: "Device Registry", icon: RadioTower },
      { id: "video-incidents", label: "Video Incidents", icon: Camera },
      { id: "load-orders", label: "Load Orders", icon: Truck },
      { id: "dispatch", label: "Dispatch Control", icon: Route },
      { id: "shipper-profiles", label: "Shipper Profiles", icon: Truck },
      { id: "driver-performance", label: "Driver Performance", icon: Trophy },
      { id: "safety-scoring", label: "Safety Scoring", icon: ShieldAlert },
      { id: "driver-incentives", label: "Driver Incentives", icon: Award },
      { id: "drivers", label: "Drivers", icon: Users },
      { id: "trips", label: "Trips", icon: Route },
      { id: "active-trip", label: "Active Trip", icon: Navigation },
      { id: "waybills", label: "Waybills", icon: FileText },
      { id: "clients", label: "Clients", icon: Building2 },
      { id: "suppliers", label: "Suppliers", icon: Store },
      { id: "route-optimizer", label: "Route Optimizer", icon: Compass },
      { id: "road-conditions", label: "Road Conditions", icon: AlertTriangle },
      { id: "load-board", label: "Load Board", icon: Package },
      { id: "documents", label: "Documents", icon: FileText },
      { id: "border-crossings", label: "Border Crossings", icon: Globe },
      { id: "weight-verifications", label: "Weight Verification", icon: Scale },
      { id: "depot-queue", label: "Depot Queue", icon: Warehouse },
      { id: "loading-cities", label: "Loading Cities", icon: MapPin },
      { id: "loading-points", label: "Loading Points", icon: MapPin },
      { id: "destination-cities", label: "Destination Cities", icon: MapPin },
      { id: "destination-zones", label: "Destination Zones", icon: MapPin },
    ],
  },
  {
    label: "Finance",
    items: [
      { id: "truck-financials", label: "Truck P&L Tracker", icon: CircleDollarSign },
      { id: "expenses", label: "Expenses", icon: Receipt },
      { id: "cash-advances", label: "Cash Advances", icon: Banknote },
      { id: "payroll", label: "Payroll", icon: CreditCard },
      { id: "settlements", label: "Settlements", icon: Wallet },
      { id: "haulier-settlements", label: "Haulier Settlements", icon: WalletCards },
      { id: "items", label: "Items & Products", icon: Package },
      { id: "fuel-logs", label: "Fuel Management", icon: Fuel },
      { id: "fuel-consumption", label: "Fuel Consumption", icon: TrendingUp },
      { id: "fuel-analytics", label: "Fuel Analytics", icon: BarChart3 },
      { id: "fuel-anomaly", label: "Fuel Anomaly", icon: AlertTriangle },
      { id: "fuel-budgets", label: "Fuel Budgets", icon: PiggyBank },
      { id: "invoices", label: "Invoices", icon: Receipt },
      { id: "trip-profitability", label: "Trip Profitability", icon: TrendingUp },
      { id: "toll-tracker", label: "Toll Tracker", icon: Ticket },
      { id: "fuel-prices", label: "Fuel Prices", icon: Fuel },
      { id: "expense-approvals", label: "Expense Approvals", icon: ClipboardCheck },
      { id: "zone-rates", label: "Zone Rates", icon: DollarSign },
    ],
  },
  {
    label: "Maintenance",
    items: [
      { id: "tyres", label: "Tyres", icon: CircleDot },
      { id: "insurance", label: "Insurance", icon: ShieldCheck },
      { id: "maintenance", label: "Service Records", icon: ClipboardList },
      { id: "maintenance-scheduler", label: "Maintenance Scheduler", icon: CalendarClock },
      { id: "vehicle-inspections", label: "Vehicle Inspections", icon: CheckSquare },
      { id: "insurance-claims", label: "Insurance Claims", icon: ShieldAlert },
      { id: "warehouse", label: "Warehouse Inventory", icon: Package },
    ],
  },
  {
    label: "Compliance",
    items: [
      { id: "compliance-center", label: "Compliance Center", icon: ShieldAlert },
      { id: "dvla", label: "DVLA Registration", icon: FileCheck },
      { id: "roadworthy", label: "Roadworthy", icon: CarFront },
    ],
  },
  {
    label: "Admin",
    items: [
      { id: "users", label: "Users & Roles", icon: Users },
      { id: "audit-log", label: "Audit Log", icon: ScrollText },
      { id: "notifications", label: "Notifications", icon: Bell },
      { id: "settings", label: "Settings", icon: Settings },
    ],
  },
]

// ============ TRUCK STATUSES ============

export const TRUCK_STATUSES = {
  active: { label: "Active", color: "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400" },
  maintenance: { label: "Maintenance", color: "bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400" },
  inactive: { label: "Inactive", color: "bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-400" },
  decommissioned: { label: "Decommissioned", color: "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400" },
} as const

// ============ TRIP STATUSES ============

export const TRIP_STATUSES = {
  draft: { label: "Draft", color: "bg-slate-100 text-slate-700 dark:bg-slate-900/30 dark:text-slate-300" },
  scheduled: { label: "Scheduled", color: "bg-sky-100 text-sky-700 dark:bg-sky-900/30 dark:text-sky-400" },
  assigned: { label: "Assigned", color: "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300" },
  eligibility_check: { label: "Eligibility Check", color: "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300" },
  authorized_for_loading: { label: "Authorized for Loading", color: "bg-cyan-100 text-cyan-700 dark:bg-cyan-900/30 dark:text-cyan-300" },
  en_route_to_loading_point: { label: "En Route to Loading", color: "bg-cyan-100 text-cyan-700 dark:bg-cyan-900/30 dark:text-cyan-300" },
  gate_in: { label: "Gate In", color: "bg-teal-100 text-teal-700 dark:bg-teal-900/30 dark:text-teal-300" },
  queued: { label: "Queued", color: "bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-300" },
  preload_weighing: { label: "Pre-load Weighing", color: "bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-300" },
  loading: { label: "Loading", color: "bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400" },
  loaded: { label: "Loaded", color: "bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-400" },
  postload_weighing: { label: "Post-load Weighing", color: "bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-300" },
  awaiting_dispatch_clearance: { label: "Awaiting Dispatch Clearance", color: "bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-300" },
  departed_loading_point: { label: "Departed Loading Point", color: "bg-lime-100 text-lime-700 dark:bg-lime-900/30 dark:text-lime-300" },
  in_transit: { label: "In Transit", color: "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400" },
  arrived_destination: { label: "Arrived Destination", color: "bg-teal-100 text-teal-700 dark:bg-teal-900/30 dark:text-teal-400" },
  offloading: { label: "Offloading", color: "bg-violet-100 text-violet-700 dark:bg-violet-900/30 dark:text-violet-400" },
  delivered: { label: "Delivered", color: "bg-indigo-100 text-indigo-700 dark:bg-indigo-900/30 dark:text-indigo-300" },
  return_journey: { label: "Return Journey", color: "bg-rose-100 text-rose-700 dark:bg-rose-900/30 dark:text-rose-400" },
  arrived_base: { label: "Arrived at Base", color: "bg-cyan-100 text-cyan-700 dark:bg-cyan-900/30 dark:text-cyan-300" },
  awaiting_reconciliation: { label: "Awaiting Reconciliation", color: "bg-sky-100 text-sky-700 dark:bg-sky-900/30 dark:text-sky-300" },
  reconciled: { label: "Reconciled", color: "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300" },
  completed: { label: "Completed", color: "bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-400" },
  delayed: { label: "Delayed", color: "bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300" },
  cancelled: { label: "Cancelled", color: "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400" },
  exception_hold: { label: "Exception Hold", color: "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-300" },
  // Legacy aliases retained for historical rows.
  departed_depot: { label: "Departed Loading Point", color: "bg-lime-100 text-lime-700 dark:bg-lime-900/30 dark:text-lime-300" },
  offloaded: { label: "Delivered", color: "bg-indigo-100 text-indigo-700 dark:bg-indigo-900/30 dark:text-indigo-300" },
  arrived_depot: { label: "Arrived at Base", color: "bg-cyan-100 text-cyan-700 dark:bg-cyan-900/30 dark:text-cyan-300" },
  waiting_at_depot: { label: "Waiting at Depot (Legacy)", color: "bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-300" },
  waiting_to_offload: { label: "Waiting to Offload (Legacy)", color: "bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-300" },
} as const

// ============ EXPENSE CATEGORIES ============

export const EXPENSE_CATEGORIES = [
  { value: "fuel", label: "Fuel", icon: "⛽" },
  { value: "maintenance", label: "Maintenance", icon: "🔧" },
  { value: "tyre", label: "Tyre", icon: "🛞" },
  { value: "insurance", label: "Insurance", icon: "🛡️" },
  { value: "toll", label: "Toll", icon: "🛣️" },
  { value: "fine", label: "Fine", icon: "📋" },
  { value: "permit", label: "Permit", icon: "📄" },
  { value: "washing", label: "Washing", icon: "🧹" },
  { value: "miscellaneous", label: "Miscellaneous", icon: "📦" },
] as const

export const EXPENSE_CATEGORY_COLORS: Record<string, string> = {
  fuel: "bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-400",
  maintenance: "bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400",
  tyre: "bg-gray-100 text-gray-700 dark:bg-gray-800 dark:text-gray-400",
  insurance: "bg-sky-100 text-sky-700 dark:bg-sky-900/30 dark:text-sky-400",
  toll: "bg-violet-100 text-violet-700 dark:bg-violet-900/30 dark:text-violet-400",
  fine: "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400",
  permit: "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400",
  washing: "bg-cyan-100 text-cyan-700 dark:bg-cyan-900/30 dark:text-cyan-400",
  miscellaneous: "bg-stone-100 text-stone-700 dark:bg-stone-800 dark:text-stone-400",
}

// ============ MAINTENANCE TYPES ============

export const MAINTENANCE_TYPES = {
  routine: { label: "Routine", color: "bg-sky-100 text-sky-700 dark:bg-sky-900/30 dark:text-sky-400" },
  repair: { label: "Repair", color: "bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-400" },
  emergency: { label: "Emergency", color: "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400" },
  inspection: { label: "Inspection", color: "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400" },
} as const

// ============ PAYROLL STATUSES ============

export const PAYROLL_STATUSES = {
  pending: { label: "Pending", color: "bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400" },
  approved: { label: "Approved", color: "bg-sky-100 text-sky-700 dark:bg-sky-900/30 dark:text-sky-400" },
  paid: { label: "Paid", color: "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400" },
} as const

// ============ EXPENSE STATUSES ============

export const EXPENSE_STATUSES = {
  pending: { label: "Pending", color: "bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400" },
  approved: { label: "Approved", color: "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400" },
  rejected: { label: "Rejected", color: "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400" },
} as const

// ============ NOTIFICATION TYPES ============

export const NOTIFICATION_TYPES = {
  trip_assigned:       { label: "Trip", color: "bg-blue-100 text-blue-700", icon: Route },
  trip_started:        { label: "Trip", color: "bg-emerald-100 text-emerald-700", icon: Route },
  trip_loading:        { label: "Trip", color: "bg-amber-100 text-amber-700", icon: Route },
  trip_loaded:         { label: "Trip", color: "bg-yellow-100 text-yellow-700", icon: Route },
  trip_departed:       { label: "Trip", color: "bg-lime-100 text-lime-700", icon: Route },
  trip_in_transit:     { label: "Trip", color: "bg-cyan-100 text-cyan-700", icon: Route },
  trip_arrived:        { label: "Trip", color: "bg-sky-100 text-sky-700", icon: Route },
  trip_offloading:     { label: "Trip", color: "bg-orange-100 text-orange-700", icon: Route },
  trip_offloaded:      { label: "Trip", color: "bg-orange-100 text-orange-700", icon: Route },
  trip_return:         { label: "Trip", color: "bg-rose-100 text-rose-700", icon: Route },
  trip_waiting:        { label: "Trip", color: "bg-amber-100 text-amber-700", icon: Bell },
  trip_completed:      { label: "Trip", color: "bg-green-100 text-green-700", icon: Route },
  maintenance_due:     { label: "Maintenance", color: "bg-amber-100 text-amber-700", icon: Wrench },
  insurance_expiring:  { label: "Insurance", color: "bg-red-100 text-red-700", icon: ShieldCheck },
  dvla_expiring:       { label: "DVLA", color: "bg-teal-100 text-teal-700", icon: FileCheck },
  roadworthy_due:      { label: "Roadworthy", color: "bg-orange-100 text-orange-700", icon: CarFront },
  payment_received:    { label: "Payment", color: "bg-emerald-100 text-emerald-700", icon: DollarSign },
  alert:               { label: "Alert", color: "bg-red-100 text-red-700", icon: Bell },
  info:                { label: "Info", color: "bg-gray-100 text-gray-600", icon: FileText },
} as const

// ============ FUEL TYPES ============

export const FUEL_TYPES = ["Diesel", "Petrol", "Gas"] as const

// ============ TRUCK MAKES ============

export const TRUCK_MAKES = [
  "Mercedes-Benz",
  "MAN",
  "DAF",
  "Volvo",
  "Scania",
  "Iveco",
  "Ford",
  "Isuzu",
  "Mitsubishi",
  "Hino",
  "Tata",
  "Ashok Leyland",
] as const

// ============ GHANA LOCATIONS ============

export const GHANA_LOCATIONS = [
  "Accra",
  "Kumasi",
  "Tamale",
  "Takoradi",
  "Tema",
  "Cape Coast",
  "Sunyani",
  "Ho",
  "Koforidua",
  "Wa",
  "Bolgatanga",
  "Sekondi",
  "Obuasi",
  "Dunkwa",
  "Techiman",
  "Winneba",
  "Nkawkaw",
  "Aflao",
] as const

// ============ CURRENCY ============

export const CURRENCY = "GHS"
/** Ghana Cedi sign U+20B5 — runtime generation avoids encoding issues */
export const CURRENCY_SYMBOL: string = String.fromCodePoint(0x20B5)

// ============ PAYMENT METHODS ============

export const PAYMENT_METHODS = [
  { value: "cash", label: "Cash" },
  { value: "mobile_money", label: "Mobile Money" },
  { value: "bank_transfer", label: "Bank Transfer" },
] as const

// ============ TYRE CONDITIONS ============

export const TYRE_CONDITIONS = {
  new: { label: "New", color: "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400" },
  good: { label: "Good", color: "bg-sky-100 text-sky-700 dark:bg-sky-900/30 dark:text-sky-400" },
  fair: { label: "Fair", color: "bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400" },
  worn: { label: "Worn", color: "bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-400" },
  damaged: { label: "Damaged", color: "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400" },
  replaced: { label: "Replaced", color: "bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-400" },
} as const

// ============ INSURANCE TYPES ============

export const INSURANCE_TYPES = [
  "comprehensive",
  "third-party",
  "goods-in-transit",
] as const

// ============ DVLA VEHICLE CLASSES ============

export const DVLA_VEHICLE_CLASSES = [
  { value: "heavy_goods", label: "Heavy Goods Vehicle" },
  { value: "medium_goods", label: "Medium Goods Vehicle" },
  { value: "light_goods", label: "Light Goods Vehicle" },
  { value: "articulated", label: "Articulated Truck" },
  { value: "trailer", label: "Trailer / Semi-Trailer" },
] as const

export const DVLA_BODY_TYPES = [
  { value: "flatbed", label: "Flatbed" },
  { value: "tanker", label: "Tanker" },
  { value: "tipper", label: "Tipper" },
  { value: "container", label: "Container Carrier" },
  { value: "tanker_trailer", label: "Tanker Trailer" },
  { value: "drop_side", label: "Drop Side" },
  { value: "low_bed", label: "Low Bed" },
  { value: "refrigerated", label: "Refrigerated" },
  { value: "other", label: "Other" },
] as const

export const DVLA_REGISTRATION_STATUSES = {
  active: { label: "Active", color: "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400" },
  expired: { label: "Expired", color: "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400" },
  suspended: { label: "Suspended", color: "bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400" },
  transferred: { label: "Transferred", color: "bg-sky-100 text-sky-700 dark:bg-sky-900/30 dark:text-sky-400" },
  revoked: { label: "Revoked", color: "bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-400" },
} as const

// ============ ROADWORTHY INSPECTION ============

export const ROADWORTHY_INSPECTION_TYPES = [
  { value: "annual", label: "Annual Inspection" },
  { value: "quarterly", label: "Quarterly Inspection" },
  { value: "special", label: "Special Inspection" },
  { value: "pre_trip", label: "Pre-Trip Check" },
  { value: "transfer", label: "Transfer Inspection" },
] as const

export const ROADWORTHY_RESULTS = {
  passed: { label: "Passed", color: "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400" },
  failed: { label: "Failed", color: "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400" },
  conditional_pass: { label: "Conditional Pass", color: "bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400" },
  pending: { label: "Pending", color: "bg-sky-100 text-sky-700 dark:bg-sky-900/30 dark:text-sky-400" },
} as const

export const ROADWORTHY_FITNESS = {
  fit: { label: "Fit", color: "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400" },
  conditional: { label: "Conditional", color: "bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400" },
  unfit: { label: "Unfit", color: "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400" },
} as const

export const INSPECTION_CHECK_OPTIONS = [
  { value: "pass", label: "Pass" },
  { value: "fail", label: "Fail" },
  { value: "advisory", label: "Advisory" },
] as const

// ============ PERMISSIONS ============

export const PERMISSIONS = {
  // Trucks
  "trucks.view": "View Trucks",
  "trucks.create": "Create Trucks",
  "trucks.edit": "Edit Trucks",
  "trucks.delete": "Delete Trucks",

  // Drivers
  "drivers.view": "View Drivers",
  "drivers.create": "Create Drivers",
  "drivers.edit": "Edit Drivers",
  "drivers.delete": "Delete Drivers",

  // Trips
  "trips.view": "View Trips",
  "trips.create": "Create Trips",
  "trips.edit": "Edit Trips",
  "trips.delete": "Delete Trips",

  // Expenses
  "expenses.view": "View Expenses",
  "expenses.create": "Create Expenses",
  "expenses.edit": "Edit Expenses",
  "expenses.approve": "Approve Expenses",

  // Payroll
  "payroll.view": "View Payroll",
  "payroll.create": "Create Payroll",
  "payroll.approve": "Approve Payroll",
  "payroll.pay": "Process Payments",

  // Maintenance
  "maintenance.view": "View Maintenance",
  "maintenance.create": "Create Maintenance",
  "maintenance.edit": "Edit Maintenance",

  // Compliance (DVLA & Roadworthy)
  "dvla.view": "View DVLA Registrations",
  "dvla.create": "Create DVLA Registrations",
  "dvla.edit": "Edit DVLA Registrations",
  "roadworthy.view": "View Roadworthy Inspections",
  "roadworthy.create": "Create Roadworthy Inspections",
  "roadworthy.edit": "Edit Roadworthy Inspections",

  // Video telematics
  "video.live": "View Live Camera",
  "video.playback": "View Incident Playback",
  "video.driver.view": "View Driver-Facing Camera",

  // Reports
  "reports.view": "View Reports",
  "reports.export": "Export Reports",

  // Admin
  "admin.users": "Manage Users",
  "admin.roles": "Manage Roles",
  "admin.settings": "System Settings",
} as const

// ============ MONTHS ============

export const MONTHS = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
] as const

