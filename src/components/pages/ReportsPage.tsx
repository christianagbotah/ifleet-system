'use client'

import { useState, useEffect, useCallback, useMemo, useRef } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import {
  DollarSign,
  Receipt,
  TrendingUp,
  Banknote,
  Wallet,
  CreditCard,
  Activity,
  UserCheck,
  Award,
  FileText,
  ClipboardList,
  Globe,
  Building2,
  Truck,
  Wrench,
  CircleDot,
  Shield,
  AlertTriangle,
  ShieldCheck,
  PieChart,
  Target,
  Fuel,
  BarChart3,
  Zap,
  Package,
  Search,
  Download,
  Loader2,
  Printer,
  FileSpreadsheet,
  Filter,
  X,
  ChevronDown,
  CalendarDays,
  Eye,
  type LucideIcon,
} from 'lucide-react'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import { Skeleton } from '@/components/ui/skeleton'
import { DatePicker } from '@/components/ui/date-picker'
import { SearchableSelect } from '@/components/ui/searchable-select'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { useAuthStore } from '@/lib/store/auth'
import { toast } from 'sonner'
import { triggerDownload } from '@/lib/export'
import type { ReportType, ExportFormat, ReportParams } from '@/lib/reports/types'

// ─── Report Category Definitions ─────────────────────────────────────────

interface ReportDefinition {
  type: ReportType
  name: string
  description: string
  icon: LucideIcon
  category: 'financial' | 'operations' | 'fleet' | 'analytics' | 'other'
  params?: Partial<ReportParams>
}

interface CategoryGroup {
  id: string
  name: string
  description: string
  icon: LucideIcon
  color: string
  bgColor: string
  borderColor: string
  reports: ReportDefinition[]
}

const REPORTS: ReportDefinition[] = [
  // ── Financial ──
  { type: 'trip_summary', name: 'Trip Summary', description: 'Comprehensive trip data including revenue, expenses, and profitability per trip.', icon: FileText, category: 'financial' },
  { type: 'expense_report', name: 'Expense Report', description: 'Itemized expenses grouped by category, truck, and trip.', icon: Receipt, category: 'financial' },
  { type: 'fleet_profit_loss', name: 'Fleet Profit & Loss', description: 'Full P&L statement for the entire fleet operation.', icon: TrendingUp, category: 'financial' },
  { type: 'payroll_report', name: 'Payroll Report', description: 'Driver payroll calculations, deductions, and net pay.', icon: Banknote, category: 'financial' },
  { type: 'cash_advances_report', name: 'Cash Advances', description: 'All cash advance transactions with outstanding balances.', icon: Wallet, category: 'financial' },
  { type: 'toll_report', name: 'Toll & Checkpoint', description: 'Toll fees and checkpoint costs across all routes.', icon: CreditCard, category: 'financial' },

  // ── Operations ──
  { type: 'daily_summary', name: 'Daily Operations Summary', description: 'Snapshot of daily fleet activity, trips, and key metrics.', icon: Activity, category: 'operations' },
  { type: 'driver_performance', name: 'Driver Performance', description: 'Individual driver KPIs including trips, revenue, and efficiency.', icon: UserCheck, category: 'operations' },
  { type: 'driver_incentives_report', name: 'Driver Incentives', description: 'Incentive calculations, bonuses earned, and payment status.', icon: Award, category: 'operations' },
  { type: 'waybill_report', name: 'Waybill Report', description: 'Detailed waybill data for shipment tracking and documentation.', icon: ClipboardList, category: 'operations', params: { tripId: '' } },
  { type: 'load_board_report', name: 'Load Board Report', description: 'Available loads, matching history, and utilization rates.', icon: FileSpreadsheet, category: 'operations' },
  { type: 'border_crossings_report', name: 'Border Crossings', description: 'Cross-border trip data with documentation and clearance status.', icon: Globe, category: 'operations' },
  { type: 'depot_queue_report', name: 'Depot Queue', description: 'Depot loading/unloading queue status and wait times.', icon: Building2, category: 'operations' },

  // ── Fleet ──
  { type: 'fleet_overview', name: 'Fleet Overview', description: 'Complete fleet status including availability, utilization, and location.', icon: Truck, category: 'fleet' },
  { type: 'maintenance_report', name: 'Maintenance Report', description: 'Maintenance records, upcoming services, and cost breakdown.', icon: Wrench, category: 'fleet' },
  { type: 'tyre_report', name: 'Tyre Management', description: 'Tyre lifecycle tracking, replacements, and cost per kilometer.', icon: CircleDot, category: 'fleet' },
  { type: 'compliance_report', name: 'Compliance & Documents', description: 'Document expiry alerts, license renewals, and compliance status.', icon: Shield, category: 'fleet' },
  { type: 'insurance_claims_report', name: 'Insurance Claims', description: 'Active claims, claim history, and settlement status.', icon: AlertTriangle, category: 'fleet' },
  { type: 'safety_report', name: 'Safety Inspections', description: 'Vehicle inspection results, defect reports, and safety scores.', icon: ShieldCheck, category: 'fleet' },

  // ── Analytics ──
  { type: 'cost_analytics', name: 'Cost Analytics', description: 'Breakdown of operational costs with trend analysis.', icon: PieChart, category: 'analytics' },
  { type: 'trip_profitability', name: 'Trip Profitability', description: 'Profit margins per trip with revenue vs cost breakdown.', icon: Target, category: 'analytics' },
  { type: 'fuel_report', name: 'Fuel Report', description: 'Fuel consumption data by truck, driver, and period.', icon: Fuel, category: 'analytics' },
  { type: 'fuel_anomaly_report', name: 'Fuel Anomalies', description: 'Flagged fuel transactions with unusual patterns.', icon: AlertTriangle, category: 'analytics' },
  { type: 'fuel_analytics', name: 'Fuel Analytics', description: 'Deep analysis of fuel efficiency trends and optimization opportunities.', icon: BarChart3, category: 'analytics' },
  { type: 'safety_scoring', name: 'Safety Scoring', description: 'Driver and fleet safety scores with risk assessment.', icon: ShieldCheck, category: 'analytics' },

  // ── Other ──
  { type: 'warehouse_report', name: 'Warehouse Inventory', description: 'Current stock levels, movements, and storage utilization.', icon: Package, category: 'other' },
]

const CATEGORIES: CategoryGroup[] = [
  {
    id: 'financial',
    name: 'Financial Reports',
    description: 'Revenue, expenses, payroll, and financial statements',
    icon: DollarSign,
    color: 'text-emerald-700 dark:text-emerald-400',
    bgColor: 'bg-emerald-100 dark:bg-emerald-950/50',
    borderColor: 'border-emerald-200 dark:border-emerald-800',
    reports: REPORTS.filter((r) => r.category === 'financial'),
  },
  {
    id: 'operations',
    name: 'Operations Reports',
    description: 'Daily activities, driver performance, and trip documentation',
    icon: Activity,
    color: 'text-amber-700 dark:text-amber-400',
    bgColor: 'bg-amber-100 dark:bg-amber-950/50',
    borderColor: 'border-amber-200 dark:border-amber-800',
    reports: REPORTS.filter((r) => r.category === 'operations'),
  },
  {
    id: 'fleet',
    name: 'Fleet Reports',
    description: 'Vehicle status, maintenance, compliance, and safety',
    icon: Truck,
    color: 'text-sky-700 dark:text-sky-400',
    bgColor: 'bg-sky-100 dark:bg-sky-950/50',
    borderColor: 'border-sky-200 dark:border-sky-800',
    reports: REPORTS.filter((r) => r.category === 'fleet'),
  },
  {
    id: 'analytics',
    name: 'Analytics Reports',
    description: 'Deep insights into costs, profitability, and fuel efficiency',
    icon: BarChart3,
    color: 'text-violet-700 dark:text-violet-400',
    bgColor: 'bg-violet-100 dark:bg-violet-950/50',
    borderColor: 'border-violet-200 dark:border-violet-800',
    reports: REPORTS.filter((r) => r.category === 'analytics'),
  },
  {
    id: 'other',
    name: 'Other Reports',
    description: 'Inventory and warehouse management reports',
    icon: Package,
    color: 'text-rose-700 dark:text-rose-400',
    bgColor: 'bg-rose-100 dark:bg-rose-950/50',
    borderColor: 'border-rose-200 dark:border-rose-800',
    reports: REPORTS.filter((r) => r.category === 'other'),
  },
]

// ─── File extension map ─────────────────────────────────────────────────

const FORMAT_EXTENSIONS: Record<ExportFormat, string> = {
  pdf: 'pdf',
  xlsx: 'xlsx',
  csv: 'csv',
}

const FORMAT_MIME: Record<ExportFormat, string> = {
  pdf: 'application/pdf',
  xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  csv: 'text/csv',
}

// ─── Animation helpers ──────────────────────────────────────────────────

const containerVariants = {
  hidden: { opacity: 0 },
  visible: {
    opacity: 1,
    transition: { staggerChildren: 0.04 },
  },
}

const cardVariants = {
  hidden: { opacity: 0, y: 12 },
  visible: { opacity: 1, y: 0, transition: { duration: 0.35, ease: 'easeOut' } },
}

// ─── Report Preview Dialog ──────────────────────────────────────────────

interface PreviewState {
  report: ReportDefinition
  pdfUrl: string | null
  blob: Blob | null
  loading: boolean
  error: string | null
}

function ReportPreviewDialog({
  state,
  onClose,
  onDownload,
  onDownloadExcel,
  onPrint,
}: {
  state: PreviewState
  onClose: () => void
  onDownload: () => void
  onDownloadExcel: () => void
  onPrint: () => void
}) {
  const { report, pdfUrl, loading, error } = state
  const Icon = report.icon

  return (
    <Dialog open onOpenChange={(open) => { if (!open) onClose() }}>
      <DialogContent className="max-w-[95vw] w-full h-[90vh] sm:h-[92vh] flex flex-col p-0 gap-0 overflow-hidden">
        {/* Header */}
        <DialogHeader className="px-4 sm:px-6 pt-4 sm:pt-5 pb-3 border-b shrink-0">
          <div className="flex items-center justify-between gap-3">
            <div className="flex items-center gap-3 min-w-0">
              <div className="size-9 rounded-xl bg-muted flex items-center justify-center shrink-0">
                <Icon className="size-5 text-muted-foreground" />
              </div>
              <div className="min-w-0">
                <DialogTitle className="text-base font-semibold truncate">{report.name}</DialogTitle>
                <p className="text-xs text-muted-foreground mt-0.5">Preview — review before downloading</p>
              </div>
            </div>
            <div className="flex items-center gap-2 shrink-0">
              <Button
                size="sm"
                variant="outline"
                className="h-8 text-xs gap-1.5"
                onClick={onDownloadExcel}
                disabled={loading}
              >
                <FileSpreadsheet className="size-3.5 text-emerald-600 dark:text-emerald-400" />
                <span className="hidden sm:inline">Excel</span>
              </Button>
              <Button
                size="sm"
                variant="outline"
                className="h-8 text-xs gap-1.5"
                onClick={onDownload}
                disabled={!pdfUrl}
              >
                <Download className="size-3.5 text-red-500 dark:text-red-400" />
                <span className="hidden sm:inline">PDF</span>
              </Button>
              <Button
                size="sm"
                variant="default"
                className="h-8 text-xs gap-1.5"
                onClick={onPrint}
                disabled={!pdfUrl}
              >
                <Printer className="size-3.5" />
                <span className="hidden sm:inline">Print</span>
              </Button>
            </div>
          </div>
        </DialogHeader>

        {/* PDF Viewer */}
        <div className="flex-1 min-h-0 relative bg-muted/30">
          {loading && (
            <div className="absolute inset-0 z-10 flex flex-col items-center justify-center bg-background/80 backdrop-blur-sm gap-3">
              <div className="size-12 rounded-full border-4 border-muted border-t-emerald-500 animate-spin" />
              <div className="text-center">
                <p className="text-sm font-medium">Generating Preview</p>
                <p className="text-xs text-muted-foreground mt-1">Building your {report.name.toLowerCase()}...</p>
              </div>
            </div>
          )}

          {error && (
            <div className="flex flex-col items-center justify-center h-full gap-3 text-center p-6">
              <div className="size-12 rounded-full bg-red-100 dark:bg-red-950/50 flex items-center justify-center">
                <AlertTriangle className="size-6 text-red-500" />
              </div>
              <div>
                <p className="text-sm font-medium">Failed to generate preview</p>
                <p className="text-xs text-muted-foreground mt-1 max-w-sm">{error}</p>
              </div>
              <Button size="sm" variant="outline" onClick={onClose}>
                <X className="size-3.5 mr-1" />
                Close
              </Button>
            </div>
          )}

          {!loading && !error && pdfUrl && (
            <iframe
              src={pdfUrl}
              className="w-full h-full border-0"
              title={`${report.name} Preview`}
            />
          )}
        </div>
      </DialogContent>
    </Dialog>
  )
}

// ─── Report Card Component ──────────────────────────────────────────────

interface ReportCardProps {
  report: ReportDefinition
  dateFrom: string
  dateTo: string
  truckId: string
  driverId: string
  zoneId: string
  loadingKey: string
  onGenerate: (type: ReportType, format: ExportFormat, params: ReportParams, loadingKey: string) => void
  onPreview: (report: ReportDefinition) => void
}

function ReportCard({ report, dateFrom, dateTo, truckId, driverId, zoneId, loadingKey, onGenerate, onPreview }: ReportCardProps) {
  const Icon = report.icon
  const isLoading = !!loadingKey
  const isPreviewLoading = loadingKey === `${report.type}-preview`

  const buildParams = useCallback((): ReportParams => {
    const params: ReportParams = {}
    if (dateFrom) params.dateFrom = dateFrom
    if (dateTo) params.dateTo = dateTo
    if (truckId) params.truckId = truckId
    if (driverId) params.driverId = driverId
    if (zoneId) params.zoneId = zoneId
    if (report.params) Object.assign(params, report.params)
    return params
  }, [dateFrom, dateTo, truckId, driverId, zoneId, report.params])

  return (
    <motion.div variants={cardVariants} className="h-full">
      <Card className="group h-full hover:shadow-md transition-all duration-300 border-border/60 hover:border-border">
        <CardContent className="p-4 sm:p-5 flex flex-col h-full gap-3">
          {/* Icon + Title */}
          <div className="flex items-start gap-3.5">
            <div className="size-10 rounded-xl bg-muted flex items-center justify-center shrink-0 group-hover:scale-105 transition-transform duration-200">
              <Icon className="size-5 text-muted-foreground" />
            </div>
            <div className="min-w-0 flex-1">
              <h3 className="text-sm font-semibold leading-tight truncate">{report.name}</h3>
              <p className="text-xs text-muted-foreground mt-1 leading-relaxed line-clamp-2">{report.description}</p>
            </div>
          </div>

          {/* Export buttons row */}
          <div className="flex items-center gap-2 mt-auto">
            <Button
              size="sm"
              variant="outline"
              className="flex-1 h-8 text-xs gap-1.5 font-medium"
              onClick={() => onGenerate(report.type, 'pdf', buildParams(), `${report.type}-pdf`)}
              disabled={isLoading}
            >
              {isLoading && loadingKey === `${report.type}-pdf` ? (
                <Loader2 className="size-3.5 animate-spin" />
              ) : (
                <FileText className="size-3.5 text-red-500 dark:text-red-400" />
              )}
              PDF
            </Button>
            <Button
              size="sm"
              variant="outline"
              className="flex-1 h-8 text-xs gap-1.5 font-medium"
              onClick={() => onGenerate(report.type, 'xlsx', buildParams(), `${report.type}-xlsx`)}
              disabled={isLoading}
            >
              {isLoading && loadingKey === `${report.type}-xlsx` ? (
                <Loader2 className="size-3.5 animate-spin" />
              ) : (
                <FileSpreadsheet className="size-3.5 text-emerald-600 dark:text-emerald-400" />
              )}
              Excel
            </Button>
            <Button
              size="sm"
              variant="outline"
              className="h-8 w-8 p-0"
              onClick={() => onGenerate(report.type, 'pdf', buildParams(), `${report.type}-print`)}
              disabled={isLoading}
              title="Print report"
            >
              {isLoading && loadingKey === `${report.type}-print` ? (
                <Loader2 className="size-3.5 animate-spin" />
              ) : (
                <Printer className="size-3.5 text-muted-foreground" />
              )}
            </Button>
          </div>

          {/* Preview button */}
          <Button
            size="sm"
            variant="secondary"
            className="w-full h-8 text-xs gap-1.5 font-medium"
            onClick={() => onPreview(report)}
            disabled={isLoading}
          >
            {isPreviewLoading ? (
              <Loader2 className="size-3.5 animate-spin" />
            ) : (
              <Eye className="size-3.5" />
            )}
            {isPreviewLoading ? 'Generating Preview...' : 'Preview'}
          </Button>
        </CardContent>
      </Card>
    </motion.div>
  )
}

// ─── Category Section Component ─────────────────────────────────────────

interface CategorySectionProps {
  category: CategoryGroup
  dateFrom: string
  dateTo: string
  truckId: string
  driverId: string
  zoneId: string
  loadingKey: string | null
  onGenerate: (type: ReportType, format: ExportFormat, params: ReportParams, loadingKey: string) => void
  onPreview: (report: ReportDefinition) => void
  searchQuery: string
}

function CategorySection({ category, dateFrom, dateTo, truckId, driverId, zoneId, loadingKey, onGenerate, onPreview, searchQuery }: CategorySectionProps) {
  const filteredReports = category.reports.filter((r) => {
    if (!searchQuery) return true
    const q = searchQuery.toLowerCase()
    return r.name.toLowerCase().includes(q) || r.description.toLowerCase().includes(q)
  })

  if (filteredReports.length === 0) return null

  const CatIcon = category.icon

  return (
    <section className="space-y-4">
      {/* Category header */}
      <div className="flex items-center gap-3">
        <div className={`size-9 rounded-lg ${category.bgColor} flex items-center justify-center`}>
          <CatIcon className={`size-4.5 ${category.color}`} />
        </div>
        <div>
          <h2 className="text-base font-semibold">{category.name}</h2>
          <p className="text-xs text-muted-foreground">{category.description}</p>
        </div>
        <Badge variant="secondary" className="ml-auto text-xs font-medium tabular-nums">
          {filteredReports.length}
        </Badge>
      </div>

      {/* Report cards grid */}
      <motion.div
        variants={containerVariants}
        initial="hidden"
        animate="visible"
        className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4"
      >
        {filteredReports.map((report) => (
          <ReportCard
            key={report.type}
            report={report}
            dateFrom={dateFrom}
            dateTo={dateTo}
            truckId={truckId}
            driverId={driverId}
            zoneId={zoneId}
            loadingKey={loadingKey ?? ''}
            onGenerate={onGenerate}
            onPreview={onPreview}
          />
        ))}
      </motion.div>
    </section>
  )
}

// ─── Loading Skeleton ───────────────────────────────────────────────────

function ReportsHubSkeleton() {
  return (
    <div className="p-4 md:p-6 space-y-6">
      {/* Filters skeleton */}
      <div className="flex flex-col md:flex-row gap-4">
        <div className="flex-1">
          <Skeleton className="h-9 w-full max-w-md rounded-lg" />
        </div>
        <div className="flex gap-3">
          <Skeleton className="h-9 w-40 rounded-lg" />
          <Skeleton className="h-9 w-40 rounded-lg" />
        </div>
      </div>

      {/* Category sections skeleton */}
      {[1, 2, 3].map((i) => (
        <div key={i} className="space-y-4">
          <div className="flex items-center gap-3">
            <Skeleton className="size-9 rounded-lg" />
            <div className="space-y-1.5">
              <Skeleton className="h-4 w-40" />
              <Skeleton className="h-3 w-64" />
            </div>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {[1, 2, 3].map((j) => (
              <Skeleton key={j} className="h-48 rounded-xl" />
            ))}
          </div>
        </div>
      ))}
    </div>
  )
}

// ─── Main Reports Hub Page ──────────────────────────────────────────────

export default function ReportsPage() {
  const [searchQuery, setSearchQuery] = useState('')
  const [dateFrom, setDateFrom] = useState('')
  const [dateTo, setDateTo] = useState('')
  const [truckId, setTruckId] = useState('')
  const [driverId, setDriverId] = useState('')
  const [zoneId, setZoneId] = useState('')
  const [loadingKey, setLoadingKey] = useState<string | null>(null)
  const [showFilters, setShowFilters] = useState(false)
  const [activeCategory, setActiveCategory] = useState<string>('all')
  const token = useAuthStore((s) => s.token)

  // ── Fetch filter options on mount ──
  const [truckOptions, setTruckOptions] = useState<{ value: string; label: string }[]>([])
  const [driverOptions, setDriverOptions] = useState<{ value: string; label: string }[]>([])
  const [zoneOptions, setZoneOptions] = useState<{ value: string; label: string }[]>([])

  useEffect(() => {
    if (!token) return
    const headers = { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' }

    const safeFetch = async <T,>(url: string): Promise<T[]> => {
      try {
        const res = await fetch(url, { headers })
        if (!res.ok) return []
        const json = await res.json()
        // APIs return paginated response: { data: [...], total, page, limit }
        const items = Array.isArray(json) ? json : (json.data ?? [])
        return items as T[]
      } catch {
        return []
      }
    }

    Promise.all([
      safeFetch<{ id: string; plateNumber: string; make: string; model: string }>('/api/trucks?limit=500').then((data) =>
        setTruckOptions(data.map((t) => ({ value: t.id, label: `${t.plateNumber} — ${t.make} ${t.model}` })))
      ),
      safeFetch<{ id: string; firstName: string; lastName: string; employeeId: string }>('/api/drivers?limit=500').then((data) =>
        setDriverOptions(data.map((d) => ({ value: d.id, label: `${d.firstName} ${d.lastName}${d.employeeId ? ` (${d.employeeId})` : ''}` })))
      ),
      safeFetch<{ id: string; name: string }>('/api/destination-zones?limit=500').then((data) =>
        setZoneOptions(data.map((z) => ({ value: z.id, label: z.name })))
      ),
    ])
  }, [token])

  // Preview state
  const [preview, setPreview] = useState<PreviewState | null>(null)
  const previewBlobRef = useRef<Blob | null>(null)
  const previewUrlRef = useRef<string | null>(null)

  // Set document title on mount
  useEffect(() => {
    document.title = 'Reports Hub — iFleetPro'
  }, [])

  // ── Build common params from current filters ──
  const buildCommonParams = useCallback((): ReportParams => {
    const params: ReportParams = {}
    if (dateFrom) params.dateFrom = dateFrom
    if (dateTo) params.dateTo = dateTo
    if (truckId) params.truckId = truckId
    if (driverId) params.driverId = driverId
    if (zoneId) params.zoneId = zoneId
    return params
  }, [dateFrom, dateTo, truckId, driverId, zoneId])

  // ── Report generation handler (download/print) ──
  const handleGenerate = useCallback(
    async (type: ReportType, format: ExportFormat, params: ReportParams, key: string) => {
      if (!token) {
        toast.error('Authentication required. Please sign in.')
        return
      }

      setLoadingKey(key)

      try {
        const res = await fetch('/api/reports/generate', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify({ type, format, params }),
        })

        if (!res.ok) {
          const errData = await res.json().catch(() => ({ error: 'Generation failed' }))
          throw new Error(errData.error || `Failed to generate ${type} report`)
        }

        // Determine filename from Content-Disposition or construct one
        const contentDisposition = res.headers.get('Content-Disposition')
        let filename = `${type}-${new Date().toISOString().split('T')[0]}.${FORMAT_EXTENSIONS[format]}`

        if (contentDisposition) {
          const match = contentDisposition.match(/filename[^;=\n]*=((['"]).*?\2|[^;\n]*)/)
          if (match && match[1]) {
            filename = match[1].replace(/['"]/g, '')
          }
        }

        const blob = await res.blob()

        // Print action: open in new tab
        if (key.endsWith('-print')) {
          const url = URL.createObjectURL(blob)
          const printWindow = window.open(url, '_blank')
          if (printWindow) {
            printWindow.addEventListener('load', () => {
              printWindow.print()
            })
          } else {
            toast.warning('Pop-up blocked. Please allow pop-ups for this site.')
            URL.revokeObjectURL(url)
          }
          toast.success(`${formatReportName(type)} opened for printing`)
        } else {
          triggerDownload(blob, filename)
          const formatLabel = format === 'xlsx' ? 'Excel' : format.toUpperCase()
          toast.success(`${formatReportName(type)} (${formatLabel}) downloaded successfully`)
        }
      } catch (error) {
        const message = error instanceof Error ? error.message : 'An unexpected error occurred'
        toast.error(message)
      } finally {
        setLoadingKey(null)
      }
    },
    [token]
  )

  // ── Preview handler ──
  const handlePreview = useCallback(
    async (report: ReportDefinition) => {
      if (!token) {
        toast.error('Authentication required. Please sign in.')
        return
      }

      const params: ReportParams = { ...buildCommonParams() }
      if (report.params) Object.assign(params, report.params)

      // Cleanup previous preview
      if (previewUrlRef.current) {
        URL.revokeObjectURL(previewUrlRef.current)
        previewUrlRef.current = null
      }
      previewBlobRef.current = null

      setPreview({ report, pdfUrl: null, blob: null, loading: true, error: null })
      setLoadingKey(`${report.type}-preview`)

      try {
        const res = await fetch('/api/reports/generate', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify({ type: report.type, format: 'pdf', params }),
        })

        if (!res.ok) {
          const errData = await res.json().catch(() => ({ error: 'Generation failed' }))
          throw new Error(errData.error || `Failed to generate ${report.name}`)
        }

        const blob = await res.blob()
        const url = URL.createObjectURL(blob)

        previewBlobRef.current = blob
        previewUrlRef.current = url

        setPreview({ report, pdfUrl: url, blob, loading: false, error: null })
      } catch (error) {
        const message = error instanceof Error ? error.message : 'An unexpected error occurred'
        setPreview((prev) => prev ? { ...prev, loading: false, error: message } : null)
        toast.error(message)
      } finally {
        setLoadingKey(null)
      }
    },
    [token, buildCommonParams]
  )

  // ── Preview close / download / print ──
  const closePreview = useCallback(() => {
    if (previewUrlRef.current) {
      URL.revokeObjectURL(previewUrlRef.current)
      previewUrlRef.current = null
    }
    previewBlobRef.current = null
    setPreview(null)
  }, [])

  const downloadPreviewPdf = useCallback(() => {
    if (!previewBlobRef.current || !preview) return
    const filename = `${preview.report.type}-${new Date().toISOString().split('T')[0]}.pdf`
    triggerDownload(previewBlobRef.current, filename)
    toast.success(`${preview.report.name} (PDF) downloaded`)
  }, [preview])

  const downloadPreviewExcel = useCallback(async () => {
    if (!preview || !token) return
    const params: ReportParams = { ...buildCommonParams() }
    if (preview.report.params) Object.assign(params, preview.report.params)

    toast.loading('Generating Excel file...')
    try {
      const res = await fetch('/api/reports/generate', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ type: preview.report.type, format: 'xlsx', params }),
      })

      if (!res.ok) {
        const errData = await res.json().catch(() => ({ error: 'Generation failed' }))
        throw new Error(errData.error || 'Failed to generate Excel')
      }

      const blob = await res.blob()
      const filename = `${preview.report.type}-${new Date().toISOString().split('T')[0]}.xlsx`
      triggerDownload(blob, filename)
      toast.dismiss()
      toast.success(`${preview.report.name} (Excel) downloaded`)
    } catch (error) {
      toast.dismiss()
      const message = error instanceof Error ? error.message : 'Failed to generate Excel'
      toast.error(message)
    }
  }, [preview, token, buildCommonParams])

  const printPreview = useCallback(() => {
    if (!previewUrlRef.current) return
    const printWindow = window.open(previewUrlRef.current, '_blank')
    if (printWindow) {
      printWindow.addEventListener('load', () => {
        printWindow.print()
      })
    } else {
      toast.warning('Pop-up blocked. Please allow pop-ups for this site.')
    }
  }, [])

  // ── Filtered categories ──
  const filteredCategories = useMemo(() => {
    if (activeCategory === 'all') return CATEGORIES
    return CATEGORIES.filter((c) => c.id === activeCategory)
  }, [activeCategory])

  // ── Total filtered report count ──
  const totalFilteredCount = useMemo(() => {
    return filteredCategories.reduce((sum, cat) => {
      return sum + cat.reports.filter((r) => {
        if (!searchQuery) return true
        const q = searchQuery.toLowerCase()
        return r.name.toLowerCase().includes(q) || r.description.toLowerCase().includes(q)
      }).length
    }, 0)
  }, [filteredCategories, searchQuery])

  return (
    <div className="p-4 md:p-6 space-y-6 max-w-7xl mx-auto">
      {/* ── Page Header ─────────────────────────────────────────────────── */}
      <motion.div
        initial={{ opacity: 0, y: -8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4 }}
      >
        <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-4">
          <div className="space-y-1">
            <div className="flex items-center gap-2">
              <div className="size-9 rounded-xl bg-emerald-100 dark:bg-emerald-950/50 flex items-center justify-center">
                <BarChart3 className="size-5 text-emerald-700 dark:text-emerald-400" />
              </div>
              <h1 className="text-xl sm:text-2xl font-bold tracking-tight">Reports Hub</h1>
            </div>
            <p className="text-sm text-muted-foreground">
              Generate and download {REPORTS.length} report types across {CATEGORIES.length} categories
            </p>
          </div>
          <div className="flex items-center gap-2">
            <Button
              size="sm"
              variant="outline"
              onClick={() => {
                setDateFrom('')
                setDateTo('')
                setTruckId('')
                setDriverId('')
                setZoneId('')
                setSearchQuery('')
                setActiveCategory('all')
                toast.info('Filters cleared')
              }}
              className="h-8 text-xs"
            >
              <X className="size-3.5 mr-1" />
              Clear All
            </Button>
          </div>
        </div>
      </motion.div>

      {/* ── Filters Bar ────────────────────────────────────────────────── */}
      <motion.div
        initial={{ opacity: 0, y: -4 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4, delay: 0.05 }}
        className="space-y-3"
      >
        {/* Search + Toggle filters */}
        <div className="flex flex-col sm:flex-row gap-3">
          <div className="relative flex-1 max-w-md">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 size-4 text-muted-foreground" />
            <Input
              placeholder="Search reports..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-9 h-9"
            />
          </div>

          <div className="flex items-center gap-2">
            <div className="flex gap-1.5 items-center bg-muted/50 rounded-lg p-1">
              {(['all', ...CATEGORIES.map((c) => c.id)] as const).map((catId) => {
                const cat = catId === 'all' ? null : CATEGORIES.find((c) => c.id === catId)
                const label = catId === 'all' ? 'All' : cat?.name.split(' ')[0] ?? catId
                return (
                  <button
                    key={catId}
                    type="button"
                    onClick={() => setActiveCategory(catId)}
                    className={`px-2.5 py-1 rounded-md text-xs font-medium transition-all duration-200 cursor-pointer border-none outline-none ${
                      activeCategory === catId
                        ? 'bg-background shadow-sm text-foreground'
                        : 'text-muted-foreground hover:text-foreground'
                    }`}
                  >
                    {label}
                  </button>
                )
              })}
            </div>

            <Button
              variant="outline"
              size="sm"
              onClick={() => setShowFilters(!showFilters)}
              className={`h-9 gap-1.5 text-xs ${showFilters ? 'bg-muted' : ''}`}
            >
              <Filter className="size-3.5" />
              <span className="hidden sm:inline">Filters</span>
              {(dateFrom || dateTo || truckId || driverId || zoneId) && (
                <Badge variant="secondary" className="ml-1 h-4 min-w-4 px-1 text-[10px] font-bold">
                  {[dateFrom, dateTo, truckId, driverId, zoneId].filter(Boolean).length}
                </Badge>
              )}
              <ChevronDown className={`size-3 transition-transform ${showFilters ? 'rotate-180' : ''}`} />
            </Button>
          </div>
        </div>

        {/* Expandable filter panel */}
        <AnimatePresence>
          {showFilters && (
            <motion.div
              initial={{ height: 0, opacity: 0 }}
              animate={{ height: 'auto', opacity: 1 }}
              exit={{ height: 0, opacity: 0 }}
              transition={{ duration: 0.25 }}
              className="overflow-hidden"
            >
              <Card className="border-dashed">
                <CardContent className="p-4">
                  <div className="flex items-center gap-2 mb-3">
                    <CalendarDays className="size-4 text-muted-foreground" />
                    <span className="text-sm font-medium">Date Range</span>
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3">
                    <div className="space-y-1.5">
                      <label className="text-xs text-muted-foreground font-medium">From</label>
                      <DatePicker value={dateFrom} onChange={setDateFrom} placeholder="Start date" />
                    </div>
                    <div className="space-y-1.5">
                      <label className="text-xs text-muted-foreground font-medium">To</label>
                      <DatePicker value={dateTo} onChange={setDateTo} placeholder="End date" />
                    </div>
                    <div className="space-y-1.5">
                      <label className="text-xs text-muted-foreground font-medium">Truck</label>
                      <SearchableSelect
                        placeholder="All trucks"
                        searchPlaceholder="Search trucks..."
                        emptyMessage="No trucks found."
                        value={truckId}
                        onValueChange={setTruckId}
                        options={[{ value: '', label: 'All trucks' }, ...truckOptions]}
                      />
                    </div>
                    <div className="space-y-1.5">
                      <label className="text-xs text-muted-foreground font-medium">Driver</label>
                      <SearchableSelect
                        placeholder="All drivers"
                        searchPlaceholder="Search drivers..."
                        emptyMessage="No drivers found."
                        value={driverId}
                        onValueChange={setDriverId}
                        options={[{ value: '', label: 'All drivers' }, ...driverOptions]}
                      />
                    </div>
                    <div className="space-y-1.5">
                      <label className="text-xs text-muted-foreground font-medium">Destination Zone</label>
                      <SearchableSelect
                        placeholder="All zones"
                        searchPlaceholder="Search zones..."
                        emptyMessage="No zones found."
                        value={zoneId}
                        onValueChange={setZoneId}
                        options={[{ value: '', label: 'All zones' }, ...zoneOptions]}
                      />
                    </div>
                  </div>

                  {/* Quick date presets */}
                  <div className="flex flex-wrap gap-2 mt-3 pt-3 border-t border-border/50">
                    <span className="text-xs text-muted-foreground self-center mr-1">Quick:</span>
                    {[
                      { label: 'Today', from: 'today', to: 'today' },
                      { label: 'This Week', from: 'week', to: 'today' },
                      { label: 'This Month', from: 'month', to: 'today' },
                      { label: 'Last 30 Days', from: '30d', to: 'today' },
                      { label: 'This Year', from: 'year', to: 'today' },
                    ].map((preset) => (
                      <Button
                        key={preset.label}
                        variant="ghost"
                        size="sm"
                        className="h-7 text-xs px-2.5"
                        onClick={() => {
                          const now = new Date()
                          let from: Date

                          switch (preset.from) {
                            case 'today':
                              from = now
                              break
                            case 'week':
                              from = new Date(now)
                              from.setDate(now.getDate() - now.getDay())
                              break
                            case 'month':
                              from = new Date(now.getFullYear(), now.getMonth(), 1)
                              break
                            case '30d':
                              from = new Date(now)
                              from.setDate(now.getDate() - 30)
                              break
                            case 'year':
                              from = new Date(now.getFullYear(), 0, 1)
                              break
                            default:
                              from = now
                          }

                          const fmt = (d: Date) =>
                            `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`

                          setDateFrom(fmt(from))
                          setDateTo(fmt(now))
                          toast.info(`Date range set to ${preset.label}`)
                        }}
                      >
                        {preset.label}
                      </Button>
                    ))}
                  </div>
                </CardContent>
              </Card>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Active filters display */}
        {(dateFrom || dateTo || truckId || driverId || zoneId) && !showFilters && (
          <div className="flex flex-wrap gap-2">
            {dateFrom && (
              <Badge variant="secondary" className="text-xs gap-1 px-2.5 py-1">
                From: {dateFrom}
                <button onClick={() => setDateFrom('')} className="ml-1 hover:text-destructive cursor-pointer border-none bg-transparent p-0">
                  <X className="size-3" />
                </button>
              </Badge>
            )}
            {dateTo && (
              <Badge variant="secondary" className="text-xs gap-1 px-2.5 py-1">
                To: {dateTo}
                <button onClick={() => setDateTo('')} className="ml-1 hover:text-destructive cursor-pointer border-none bg-transparent p-0">
                  <X className="size-3" />
                </button>
              </Badge>
            )}
            {truckId && truckId !== '__all__' && (
              <Badge variant="secondary" className="text-xs gap-1 px-2.5 py-1">
                Truck: {truckOptions.find((t) => t.value === truckId)?.label ?? truckId}
                <button onClick={() => setTruckId('')} className="ml-1 hover:text-destructive cursor-pointer border-none bg-transparent p-0">
                  <X className="size-3" />
                </button>
              </Badge>
            )}
            {driverId && driverId !== '__all__' && (
              <Badge variant="secondary" className="text-xs gap-1 px-2.5 py-1">
                Driver: {driverOptions.find((d) => d.value === driverId)?.label ?? driverId}
                <button onClick={() => setDriverId('')} className="ml-1 hover:text-destructive cursor-pointer border-none bg-transparent p-0">
                  <X className="size-3" />
                </button>
              </Badge>
            )}
            {zoneId && (
              <Badge variant="secondary" className="text-xs gap-1 px-2.5 py-1">
                Zone: {zoneOptions.find((z) => z.value === zoneId)?.label ?? zoneId}
                <button onClick={() => setZoneId('')} className="ml-1 hover:text-destructive cursor-pointer border-none bg-transparent p-0">
                  <X className="size-3" />
                </button>
              </Badge>
            )}
          </div>
        )}
      </motion.div>

      {/* ── Global loading indicator ────────────────────────────────────── */}
      {loadingKey && !loadingKey.endsWith('-preview') && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="flex items-center gap-2 text-sm text-muted-foreground bg-muted/50 rounded-lg px-3 py-2"
        >
          <Loader2 className="size-4 animate-spin text-emerald-600" />
          <span>Generating {formatReportName(loadingKey.split('-').slice(0, -1).join('-'))}...</span>
        </motion.div>
      )}

      {/* ── Results count ───────────────────────────────────────────────── */}
      {searchQuery && (
        <div className="flex items-center justify-between">
          <p className="text-sm text-muted-foreground">
            {totalFilteredCount} report{totalFilteredCount !== 1 ? 's' : ''} found
            {searchQuery && (
              <span>
                {' '}
                matching &ldquo;<span className="font-medium text-foreground">{searchQuery}</span>&rdquo;
              </span>
            )}
          </p>
        </div>
      )}

      {/* ── Report Categories ──────────────────────────────────────────── */}
      <div className="space-y-8">
        {filteredCategories.map((category, idx) => (
          <motion.div
            key={category.id}
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.4, delay: 0.08 * idx }}
          >
            <CategorySection
              category={category}
              dateFrom={dateFrom}
              dateTo={dateTo}
              truckId={truckId}
              driverId={driverId}
              zoneId={zoneId}
              loadingKey={loadingKey}
              onGenerate={handleGenerate}
              onPreview={handlePreview}
              searchQuery={searchQuery}
            />
          </motion.div>
        ))}

        {/* No results */}
        {searchQuery && totalFilteredCount === 0 && (
          <motion.div
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            className="flex flex-col items-center justify-center py-16 text-center"
          >
            <div className="size-16 rounded-2xl bg-muted flex items-center justify-center mb-4">
              <Search className="size-7 text-muted-foreground/50" />
            </div>
            <h3 className="text-sm font-semibold mb-1">No reports found</h3>
            <p className="text-xs text-muted-foreground max-w-xs">
              No reports match &ldquo;{searchQuery}&rdquo;. Try a different search term or{' '}
              <button
                onClick={() => setSearchQuery('')}
                className="text-emerald-600 dark:text-emerald-400 hover:underline cursor-pointer bg-transparent border-none p-0 font-medium"
              >
                clear the search
              </button>
              .
            </p>
          </motion.div>
        )}
      </div>

      {/* ── Preview Dialog ──────────────────────────────────────────────── */}
      {preview && (
        <ReportPreviewDialog
          state={preview}
          onClose={closePreview}
          onDownload={downloadPreviewPdf}
          onDownloadExcel={downloadPreviewExcel}
          onPrint={printPreview}
        />
      )}

      {/* ── Footer info ─────────────────────────────────────────────────── */}
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ delay: 0.4 }}
        className="pt-4 border-t border-border/50"
      >
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-2">
          <div className="flex items-center gap-4 text-xs text-muted-foreground">
            <span className="flex items-center gap-1">
              <Eye className="size-3" />
              Preview (view first)
            </span>
            <span className="flex items-center gap-1">
              <FileText className="size-3" />
              PDF
            </span>
            <span className="flex items-center gap-1">
              <FileSpreadsheet className="size-3" />
              Excel
            </span>
            <span className="flex items-center gap-1">
              <Printer className="size-3" />
              Print
            </span>
          </div>
          <p className="text-xs text-muted-foreground">
            {REPORTS.length} report types available &middot; Reports apply the date range and filters set above
          </p>
        </div>
      </motion.div>
    </div>
  )
}

// ─── Helpers ────────────────────────────────────────────────────────────

function formatReportName(type: string): string {
  const report = REPORTS.find((r) => r.type === type)
  if (report) return report.name

  return type
    .split('_')
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(' ')
}
