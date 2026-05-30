'use client'

import * as React from 'react'
import { motion } from 'framer-motion'
import {
  ShieldCheck,
  Truck,
  CalendarDays,
  Clock,
  User,
  Building2,
  Hash,
  CreditCard,
  AlertTriangle,
  XCircle,
  Pencil,
  Trash2,
  RefreshCw,
  History,
  FileText,
} from 'lucide-react'
import { ResponsiveSheet } from '@/components/ui/responsive-sheet'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Skeleton } from '@/components/ui/skeleton'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from '@/components/ui/alert-dialog'
import { useAuthStore } from '@/lib/store/auth'
import { apiFetch } from '@/lib/api'
import { CURRENCY_SYMBOL } from '@/lib/constants'
import { cn } from '@/lib/utils'
import { toast } from 'sonner'
import { InsuranceRenewalDialog } from './InsuranceRenewalDialog'

// ─── Types ──────────────────────────────────────────────────────────

interface InsuranceDetailSheetProps {
  insuranceId: string | null
  open: boolean
  onOpenChange: (open: boolean) => void
  onEdit?: (insurance: InsuranceFull) => void
  onDeleted?: () => void
}

interface InsuranceFull {
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
  documentUrl?: string | null
  notes?: string | null
  renewalReminderSent: boolean
  createdAt: string
  updatedAt: string
  truck: { id: string; plateNumber: string; make: string; model: string }
}

interface RenewalHistoryEntry {
  id: string
  previousData: string
  renewalFee?: number | null
  renewedByName?: string | null
  notes?: string | null
  createdAt: string
}

// ─── Status Colors ──────────────────────────────────────────────────

const STATUS_COLORS: Record<string, string> = {
  active: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400',
  expired: 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400',
  pending: 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400',
  cancelled: 'bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-400',
}

const TYPE_LABELS: Record<string, string> = {
  comprehensive: 'Comprehensive',
  'third-party': 'Third Party',
  'goods-in-transit': 'Goods in Transit',
}

// ─── Helpers ────────────────────────────────────────────────────────

function formatDate(dt: string) {
  try {
    return new Date(dt).toLocaleDateString('en-GB', {
      day: '2-digit', month: 'short', year: 'numeric',
    })
  } catch { return dt }
}

function formatDateTime(dt: string) {
  try {
    return new Date(dt).toLocaleString('en-GB', {
      day: '2-digit', month: 'short', year: 'numeric',
      hour: '2-digit', minute: '2-digit',
    })
  } catch { return dt }
}

function getExpiryInfo(endDate: string, status: string) {
  if (status === 'expired' || status === 'cancelled') {
    return { days: -1, label: 'Expired', color: 'text-red-600', icon: XCircle }
  }
  const now = new Date()
  const end = new Date(endDate)
  const diffMs = end.getTime() - now.getTime()
  const diffDays = Math.ceil(diffMs / (1000 * 60 * 60 * 24))

  if (diffDays < 0) return { days: -1, label: 'Expired', color: 'text-red-600', icon: XCircle }
  if (diffDays === 0) return { days: 0, label: 'Expires today', color: 'text-red-600', icon: AlertTriangle }
  if (diffDays <= 30) return { days: diffDays, label: `${diffDays} days`, color: 'text-amber-600', icon: AlertTriangle }
  return { days: diffDays, label: `${diffDays} days`, color: 'text-emerald-600', icon: ShieldCheck }
}

// ─── Main Component ────────────────────────────────────────────────

export function InsuranceDetailSheet({ insuranceId, open, onOpenChange, onEdit, onDeleted }: InsuranceDetailSheetProps) {
  const { user } = useAuthStore()
  const canWrite = user?.role !== 'Driver'

  const [insurance, setInsurance] = React.useState<InsuranceFull | null>(null)
  const [loading, setLoading] = React.useState(false)
  const [deleting, setDeleting] = React.useState(false)
  const [renewalOpen, setRenewalOpen] = React.useState(false)
  const [renewalHistory, setRenewalHistory] = React.useState<RenewalHistoryEntry[]>([])
  const [historyLoading, setHistoryLoading] = React.useState(false)

  React.useEffect(() => {
    if (open && insuranceId) {
      setLoading(true)
      Promise.all([
        apiFetch<InsuranceFull>(`/api/insurance/${insuranceId}`),
        apiFetch<{ data: RenewalHistoryEntry[] }>(`/api/insurance/${insuranceId}/renewals`).catch(() => ({ data: [] })),
      ])
        .then(([ins, hist]) => {
          setInsurance(ins)
          setRenewalHistory(hist.data || [])
        })
        .catch((err) => console.error('Failed to fetch insurance details:', err))
        .finally(() => setLoading(false))
    }
    if (!open) {
      setInsurance(null)
      setRenewalHistory([])
    }
  }, [open, insuranceId])

  const handleDelete = async () => {
    if (!insuranceId) return
    setDeleting(true)
    try {
      await apiFetch(`/api/insurance/${insuranceId}`, { method: 'DELETE' })
      toast.success('Insurance policy deleted successfully')
      onOpenChange(false)
      onDeleted?.()
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to delete insurance policy')
    } finally {
      setDeleting(false)
    }
  }

  const handleRenewalSuccess = () => {
    // Re-fetch insurance and history
    if (insuranceId) {
      Promise.all([
        apiFetch<InsuranceFull>(`/api/insurance/${insuranceId}`),
        apiFetch<{ data: RenewalHistoryEntry[] }>(`/api/insurance/${insuranceId}/renewals`).catch(() => ({ data: [] })),
      ]).then(([ins, hist]) => {
        setInsurance(ins)
        setRenewalHistory(hist.data || [])
      })
    }
    onOpenChange(false)
  }

  if (!insuranceId) return null

  const expiry = insurance ? getExpiryInfo(insurance.endDate, insurance.status) : null

  return (
    <>
      <ResponsiveSheet
        open={open}
        onOpenChange={onOpenChange}
        title={
          <span className="flex items-center gap-2">
            <ShieldCheck className="h-5 w-5 text-emerald-600 dark:text-emerald-400" />
            Insurance Policy Details
          </span>
        }
        description={insurance ? `${insurance.truck.plateNumber} — ${insurance.policyNumber}` : 'Loading...'}
        width="sm:max-w-xl"
      >
        {loading ? (
          <div className="space-y-4 p-4 md:p-6">
            {[1, 2, 3, 4].map(i => (
              <Skeleton key={i} className="h-24 w-full rounded-lg" />
            ))}
          </div>
        ) : insurance ? (
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            className="space-y-5 p-4 md:p-6"
          >
            {/* Hero Card: Status + Expiry */}
            <div className="rounded-xl border bg-gradient-to-br from-emerald-50 to-teal-50 dark:from-emerald-950/30 dark:to-teal-950/20 p-4 space-y-3">
              <div className="flex items-center justify-between">
                <Badge className={cn('border-transparent font-semibold text-sm px-3 py-1', STATUS_COLORS[insurance.status] || '')}>
                  {insurance.status.charAt(0).toUpperCase() + insurance.status.slice(1)}
                </Badge>
                {expiry && (
                  <div className={cn('flex items-center gap-1 text-xs font-semibold', expiry.color)}>
                    <expiry.icon className="h-3.5 w-3.5" />
                    {expiry.label}
                  </div>
                )}
              </div>
              <div>
                <p className="text-xl font-bold font-mono tracking-wide">{insurance.policyNumber}</p>
                <p className="text-xs text-muted-foreground mt-0.5">
                  {insurance.provider} — {TYPE_LABELS[insurance.type] || insurance.type.replace(/-/g, ' ')}
                </p>
              </div>
            </div>

            {/* Expired Warning */}
            {(insurance.status === 'expired' || (expiry && expiry.days < 0)) && (
              <div className="rounded-lg border border-red-200 bg-red-50 dark:bg-red-900/20 dark:border-red-800 p-3">
                <div className="flex items-center gap-2">
                  <AlertTriangle className="h-4 w-4 text-red-500 shrink-0" />
                  <div>
                    <p className="text-sm font-medium text-red-700 dark:text-red-400">Insurance Expired</p>
                    <p className="text-xs text-red-600 dark:text-red-300 mt-0.5">
                      Expired on {formatDate(insurance.endDate)}. Please renew immediately.
                    </p>
                  </div>
                </div>
              </div>
            )}

            {/* Expiring Soon Warning */}
            {expiry && expiry.days > 0 && expiry.days <= 30 && insurance.status === 'active' && (
              <div className="rounded-lg border border-amber-200 bg-amber-50 dark:bg-amber-900/20 dark:border-amber-800 p-3">
                <div className="flex items-center gap-2">
                  <AlertTriangle className="h-4 w-4 text-amber-500 shrink-0" />
                  <div>
                    <p className="text-sm font-medium text-amber-700 dark:text-amber-400">Expiring Soon</p>
                    <p className="text-xs text-amber-600 dark:text-amber-300 mt-0.5">
                      Policy expires in {expiry.days} days on {formatDate(insurance.endDate)}.
                    </p>
                  </div>
                </div>
              </div>
            )}

            {/* Vehicle & Policy Details */}
            <div>
              <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider mb-2">Policy & Vehicle</p>
              <div className="rounded-lg border">
                <div className="grid grid-cols-2">
                  <DetailCell
                    icon={<Truck className="h-3.5 w-3.5" />}
                    label="Truck"
                    value={insurance.truck.plateNumber}
                    sub={`${insurance.truck.make} ${insurance.truck.model}`}
                  />
                  <DetailCell
                    icon={<Building2 className="h-3.5 w-3.5" />}
                    label="Provider"
                    value={insurance.provider}
                  />
                  <DetailCell
                    icon={<Hash className="h-3.5 w-3.5" />}
                    label="Policy Number"
                    value={insurance.policyNumber}
                    mono
                  />
                  <DetailCell
                    icon={<ShieldCheck className="h-3.5 w-3.5" />}
                    label="Insurance Type"
                    value={TYPE_LABELS[insurance.type] || insurance.type.replace(/-/g, ' ')}
                  />
                </div>
              </div>
            </div>

            {/* Coverage & Premium */}
            <div>
              <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider mb-2">Coverage & Premium</p>
              <div className="rounded-lg border">
                <div className="grid grid-cols-2">
                  <DetailCell
                    icon={<CreditCard className="h-3.5 w-3.5" />}
                    label="Premium"
                    value={`${CURRENCY_SYMBOL}${insurance.premium.toLocaleString()}`}
                  />
                  <DetailCell
                    icon={<CreditCard className="h-3.5 w-3.5" />}
                    label="Cover Amount"
                    value={insurance.coverAmount ? `${CURRENCY_SYMBOL}${insurance.coverAmount.toLocaleString()}` : 'Not specified'}
                    muted={!insurance.coverAmount}
                  />
                </div>
              </div>
            </div>

            {/* Dates */}
            <div>
              <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider mb-2">Coverage Period</p>
              <div className="rounded-lg border">
                <div className="grid grid-cols-2">
                  <DetailCell
                    icon={<CalendarDays className="h-3.5 w-3.5" />}
                    label="Start Date"
                    value={formatDate(insurance.startDate)}
                  />
                  <DetailCell
                    icon={<CalendarDays className="h-3.5 w-3.5" />}
                    label="End Date"
                    value={formatDate(insurance.endDate)}
                  />
                </div>
              </div>
            </div>

            {/* Notes */}
            {insurance.notes && (
              <div>
                <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider mb-1.5">Notes</p>
                <div className="rounded-lg bg-muted/50 border p-3">
                  <p className="text-sm text-foreground whitespace-pre-wrap leading-relaxed">{insurance.notes}</p>
                </div>
              </div>
            )}

            {/* Renewal History */}
            <div>
              <div className="flex items-center gap-2 mb-2">
                <History className="h-3.5 w-3.5 text-muted-foreground" />
                <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
                  Renewal History ({renewalHistory.length})
                </p>
              </div>
              {renewalHistory.length === 0 ? (
                <div className="rounded-lg border border-dashed p-4 text-center">
                  <p className="text-xs text-muted-foreground">No renewals recorded yet</p>
                </div>
              ) : (
                <div className="space-y-2 max-h-64 overflow-y-auto">
                  {renewalHistory.map((entry) => {
                    let prevData: Record<string, unknown> | null = null
                    try { prevData = JSON.parse(entry.previousData) } catch { /* ignore */ }
                    return (
                      <div key={entry.id} className="rounded-lg border p-3 space-y-1.5">
                        <div className="flex items-center justify-between">
                          <span className="text-xs font-semibold text-foreground">
                            {formatDateTime(entry.createdAt)}
                          </span>
                          {entry.renewedByName && (
                            <span className="text-xs text-muted-foreground">by {entry.renewedByName}</span>
                          )}
                        </div>
                        {prevData && (
                          <div className="text-xs text-muted-foreground space-y-0.5">
                            <p>
                              Previous: {String(prevData.startDate || '—')} to {String(prevData.endDate ? new Date(String(prevData.endDate)).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' }) : '—')}
                            </p>
                            <p>Premium: {prevData.premium ? `${CURRENCY_SYMBOL}${Number(prevData.premium).toLocaleString()}` : '—'}</p>
                          </div>
                        )}
                        {entry.notes && (
                          <p className="text-xs text-muted-foreground italic">{entry.notes}</p>
                        )}
                      </div>
                    )
                  })}
                </div>
              )}
            </div>

            {/* System Info */}
            <div>
              <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider mb-2">System Info</p>
              <div className="rounded-lg border">
                <div className="grid grid-cols-2">
                  <DetailCell
                    icon={<Clock className="h-3.5 w-3.5" />}
                    label="Created"
                    value={formatDateTime(insurance.createdAt)}
                  />
                  <DetailCell
                    icon={<Clock className="h-3.5 w-3.5" />}
                    label="Last Updated"
                    value={formatDateTime(insurance.updatedAt)}
                  />
                </div>
              </div>
            </div>

            {/* Action Buttons */}
            {canWrite && (
              <div className="space-y-2 pt-2">
                <Button
                  variant="default"
                  className="w-full"
                  onClick={() => setRenewalOpen(true)}
                >
                  <RefreshCw className="h-4 w-4 mr-2" />
                  Renew Policy
                </Button>
                <Button
                  variant="outline"
                  className="w-full"
                  onClick={() => onEdit?.(insurance)}
                >
                  <Pencil className="h-4 w-4 mr-2" />
                  Edit Policy
                </Button>
                <AlertDialog>
                  <AlertDialogTrigger asChild>
                    <Button variant="destructive" className="w-full">
                      <Trash2 className="h-4 w-4 mr-2" />
                      Delete Policy
                    </Button>
                  </AlertDialogTrigger>
                  <AlertDialogContent>
                    <AlertDialogHeader>
                      <AlertDialogTitle>Delete this insurance policy?</AlertDialogTitle>
                      <AlertDialogDescription>
                        This will permanently delete policy{' '}
                        <span className="font-mono font-semibold">{insurance.policyNumber}</span>
                        {' '}({insurance.truck.plateNumber}). This action cannot be undone.
                      </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                      <AlertDialogCancel>Cancel</AlertDialogCancel>
                      <AlertDialogAction
                        onClick={handleDelete}
                        disabled={deleting}
                        className="bg-red-600 hover:bg-red-700"
                      >
                        {deleting ? 'Deleting...' : 'Delete Policy'}
                      </AlertDialogAction>
                    </AlertDialogFooter>
                  </AlertDialogContent>
                </AlertDialog>
              </div>
            )}
          </motion.div>
        ) : (
          <div className="flex flex-col items-center justify-center py-12 text-center p-4">
            <AlertTriangle className="h-8 w-8 text-amber-500 mb-3" />
            <p className="text-sm font-medium">Policy not found</p>
            <p className="text-xs text-muted-foreground mt-1">This insurance policy may have been deleted.</p>
          </div>
        )}
      </ResponsiveSheet>

      {/* Renewal Dialog */}
      <InsuranceRenewalDialog
        open={renewalOpen}
        onOpenChange={setRenewalOpen}
        insurance={insurance}
        onSuccess={handleRenewalSuccess}
      />
    </>
  )
}

// ─── Detail Cell ────────────────────────────────────────────────────

function DetailCell({
  icon,
  label,
  value,
  sub,
  mono,
  muted,
}: {
  icon: React.ReactNode
  label: string
  value: string
  sub?: string
  mono?: boolean
  muted?: boolean
}) {
  return (
    <div className="p-3 border-b border-r last:border-b-0 border-border/60 even:border-r-0">
      <div className="flex items-start gap-2">
        <div className="text-muted-foreground mt-0.5 shrink-0">{icon}</div>
        <div className="min-w-0">
          <p className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider leading-tight">{label}</p>
          <p className={cn(
            'text-xs font-semibold mt-0.5 leading-snug',
            mono && 'font-mono',
            muted && 'text-muted-foreground italic font-normal'
          )}>
            {value}
          </p>
          {sub && <p className="text-[10px] text-muted-foreground mt-0.5">{sub}</p>}
        </div>
      </div>
    </div>
  )
}
