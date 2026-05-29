'use client'

import * as React from 'react'
import { motion } from 'framer-motion'
import {
  FileCheck,
  Truck,
  CalendarDays,
  Clock,
  Car,
  User,
  Building2,
  Hash,
  Weight,
  Gauge,
  AlertTriangle,
  XCircle,
  Pencil,
  Trash2,
  ArrowRight,
  ShieldCheck,
  History,
  CreditCard,
  MapPin,
  Phone,
  FileText,
  RefreshCw,
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
import { cn } from '@/lib/utils'
import { toast } from 'sonner'
import { DVLA_REGISTRATION_STATUSES, VEHICLE_BODY_TYPES } from '@/lib/constants'
import { DvlaRenewalDialog } from './DvlaRenewalDialog'

// ─── Types ──────────────────────────────────────────────────────────

interface RenewalHistoryEntry {
  id: string
  previousData: string
  renewalFee?: number | null
  renewedByName?: string | null
  notes?: string | null
  createdAt: string
}

interface DvlaDetailSheetProps {
  registrationId: string | null
  open: boolean
  onOpenChange: (open: boolean) => void
  onEdit?: (registration: DvlaRegistrationFull) => void
  onDeleted?: () => void
}

interface DvlaRegistrationFull {
  id: string
  truckId: string
  registrationNumber: string
  certificateNumber: string
  vehicleClass: string
  bodyType?: string | null
  axleConfiguration?: string | null
  grossVehicleWeight?: number | null
  unladenWeight?: number | null
  seatingCapacity?: number | null
  engineCapacity?: string | null
  yearOfManufacture?: number | null
  countryOfOrigin?: string | null
  registeredOwner: string
  ownerAddress?: string | null
  ownerContact?: string | null
  dvlaOffice?: string | null
  registrationDate: string
  expiryDate: string
  lastRenewalDate?: string | null
  nextRenewalDue?: string | null
  registrationFee?: number | null
  renewalFee?: number | null
  status: string
  documentUrl?: string | null
  transferHistory?: unknown
  notes?: string | null
  createdAt: string
  updatedAt: string
  truck: { id: string; plateNumber: string; make: string; model: string }
}

// ─── Status Colors ──────────────────────────────────────────────────

const STATUS_COLORS: Record<string, string> = {
  active: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400',
  expired: 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400',
  suspended: 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400',
  transferred: 'bg-sky-100 text-sky-700 dark:bg-sky-900/30 dark:text-sky-400',
  revoked: 'bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-400',
}

const VEHICLE_CLASS_LABELS: Record<string, string> = {
  heavy_goods: 'Heavy Goods Vehicle',
  medium_goods: 'Medium Goods Vehicle',
  light_goods: 'Light Goods Vehicle',
  articulated: 'Articulated Truck',
  trailer: 'Trailer / Semi-Trailer',
}

const BODY_TYPE_LABELS: Record<string, string> = {
  flatbed: 'Flatbed',
  tanker: 'Tanker',
  tipper: 'Tipper',
  container: 'Container Carrier',
  tanker_trailer: 'Tanker Trailer',
  drop_side: 'Drop Side',
  low_bed: 'Low Bed',
  refrigerated: 'Refrigerated',
  other: 'Other',
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

function getExpiryInfo(expiryDate: string, status: string) {
  if (status === 'expired' || status === 'revoked') {
    return { days: -1, label: 'Expired', color: 'text-red-600', icon: XCircle }
  }
  const now = new Date()
  const end = new Date(expiryDate)
  const diffMs = end.getTime() - now.getTime()
  const diffDays = Math.ceil(diffMs / (1000 * 60 * 60 * 24))

  if (diffDays < 0) return { days: -1, label: 'Expired', color: 'text-red-600', icon: XCircle }
  if (diffDays === 0) return { days: 0, label: 'Expires today', color: 'text-red-600', icon: AlertTriangle }
  if (diffDays <= 30) return { days: diffDays, label: `${diffDays} days`, color: 'text-amber-600', icon: AlertTriangle }
  return { days: diffDays, label: `${diffDays} days`, color: 'text-emerald-600', icon: ShieldCheck }
}

// ─── Main Component ────────────────────────────────────────────────

export function DvlaDetailSheet({ registrationId, open, onOpenChange, onEdit, onDeleted }: DvlaDetailSheetProps) {
  const { user } = useAuthStore()
  const canWrite = user?.role !== 'Driver'

  const [registration, setRegistration] = React.useState<DvlaRegistrationFull | null>(null)
  const [loading, setLoading] = React.useState(false)
  const [deleting, setDeleting] = React.useState(false)
  const [renewalOpen, setRenewalOpen] = React.useState(false)
  const [renewalHistory, setRenewalHistory] = React.useState<RenewalHistoryEntry[]>([])

  React.useEffect(() => {
    if (open && registrationId) {
      setLoading(true)
      Promise.all([
        apiFetch<DvlaRegistrationFull>(`/api/dvla-registrations/${registrationId}`),
        apiFetch<{ data: RenewalHistoryEntry[] }>(`/api/dvla-registrations/${registrationId}/renewals`).catch(() => ({ data: [] })),
      ])
        .then(([data, hist]) => {
          setRegistration(data)
          setRenewalHistory(hist.data || [])
        })
        .catch((err) => console.error('Failed to fetch DVLA details:', err))
        .finally(() => setLoading(false))
    }
    if (!open) {
      setRegistration(null)
      setRenewalHistory([])
    }
  }, [open, registrationId])

  const handleDelete = async () => {
    if (!registrationId) return
    setDeleting(true)
    try {
      await apiFetch(`/api/dvla-registrations/${registrationId}`, { method: 'DELETE' })
      toast.success('DVLA registration deleted successfully')
      onOpenChange(false)
      onDeleted?.()
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to delete registration')
    } finally {
      setDeleting(false)
    }
  }

  const handleRenewalSuccess = () => {
    if (registrationId) {
      Promise.all([
        apiFetch<DvlaRegistrationFull>(`/api/dvla-registrations/${registrationId}`),
        apiFetch<{ data: RenewalHistoryEntry[] }>(`/api/dvla-registrations/${registrationId}/renewals`).catch(() => ({ data: [] })),
      ]).then(([data, hist]) => {
        setRegistration(data)
        setRenewalHistory(hist.data || [])
      })
    }
  }

  if (!registrationId) return null

  const expiry = registration ? getExpiryInfo(registration.expiryDate, registration.status) : null

  return (
    <>
    <ResponsiveSheet
      open={open}
      onOpenChange={onOpenChange}
      title={
        <span className="flex items-center gap-2">
          <FileCheck className="h-5 w-5 text-teal-600 dark:text-teal-400" />
          DVLA Registration Details
        </span>
      }
      description={registration ? `${registration.truck.plateNumber} — ${registration.registrationNumber}` : 'Loading...'}
    >
      {loading ? (
        <div className="space-y-4 p-4 md:p-6">
          {[1, 2, 3, 4].map(i => (
            <Skeleton key={i} className="h-24 w-full rounded-lg" />
          ))}
        </div>
      ) : registration ? (
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          className="space-y-5 p-4 md:p-6"
        >
          {/* Hero Card: Status + Expiry */}
          <div className="rounded-xl border bg-gradient-to-br from-teal-50 to-emerald-50 dark:from-teal-950/30 dark:to-emerald-950/20 p-4 space-y-3">
            <div className="flex items-center justify-between">
              <Badge className={cn('border-transparent font-semibold text-sm px-3 py-1', STATUS_COLORS[registration.status] || '')}>
                {registration.status.charAt(0).toUpperCase() + registration.status.slice(1)}
              </Badge>
              {expiry && (
                <div className={cn('flex items-center gap-1 text-xs font-semibold', expiry.color)}>
                  <expiry.icon className="h-3.5 w-3.5" />
                  {expiry.label}
                </div>
              )}
            </div>
            <div>
              <p className="text-xl font-bold font-mono tracking-wide">{registration.registrationNumber}</p>
              <p className="text-xs text-muted-foreground mt-0.5">
                Certificate: <span className="font-mono">{registration.certificateNumber}</span>
              </p>
            </div>
          </div>

          {/* Expired Warning */}
          {(registration.status === 'expired' || expiry?.days !== undefined && expiry.days < 0) && (
            <div className="rounded-lg border border-red-200 bg-red-50 dark:bg-red-900/20 dark:border-red-800 p-3">
              <div className="flex items-center gap-2">
                <AlertTriangle className="h-4 w-4 text-red-500 shrink-0" />
                <div>
                  <p className="text-sm font-medium text-red-700 dark:text-red-400">Registration Expired</p>
                  <p className="text-xs text-red-600 dark:text-red-300 mt-0.5">
                    Expired on {formatDate(registration.expiryDate)}. Please renew immediately.
                  </p>
                </div>
              </div>
            </div>
          )}

          {/* Expiring Soon Warning */}
          {expiry && expiry.days > 0 && expiry.days <= 30 && registration.status === 'active' && (
            <div className="rounded-lg border border-amber-200 bg-amber-50 dark:bg-amber-900/20 dark:border-amber-800 p-3">
              <div className="flex items-center gap-2">
                <AlertTriangle className="h-4 w-4 text-amber-500 shrink-0" />
                <div>
                  <p className="text-sm font-medium text-amber-700 dark:text-amber-400">Expiring Soon</p>
                  <p className="text-xs text-amber-600 dark:text-amber-300 mt-0.5">
                    Registration expires in {expiry.days} days on {formatDate(registration.expiryDate)}.
                  </p>
                </div>
              </div>
            </div>
          )}

          {/* Vehicle & Registration Details */}
          <div>
            <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider mb-2">Vehicle & Registration</p>
            <div className="rounded-lg border">
              <div className="grid grid-cols-2">
                <DetailCell
                  icon={<Truck className="h-3.5 w-3.5" />}
                  label="Truck"
                  value={registration.truck.plateNumber}
                  sub={`${registration.truck.make} ${registration.truck.model}`}
                />
                <DetailCell
                  icon={<Car className="h-3.5 w-3.5" />}
                  label="Vehicle Class"
                  value={VEHICLE_CLASS_LABELS[registration.vehicleClass] || registration.vehicleClass}
                />
                <DetailCell
                  icon={<Car className="h-3.5 w-3.5" />}
                  label="Body Type"
                  value={registration.bodyType ? (BODY_TYPE_LABELS[registration.bodyType] || registration.bodyType) : 'Not specified'}
                  muted={!registration.bodyType}
                />
                <DetailCell
                  icon={<Hash className="h-3.5 w-3.5" />}
                  label="Reg. Number"
                  value={registration.registrationNumber}
                  mono
                />
                <DetailCell
                  icon={<Hash className="h-3.5 w-3.5" />}
                  label="Certificate #"
                  value={registration.certificateNumber}
                  mono
                />
                <DetailCell
                  icon={<User className="h-3.5 w-3.5" />}
                  label="Registered Owner"
                  value={registration.registeredOwner}
                />
              </div>
            </div>
          </div>

          {/* Technical Specifications */}
          <div>
            <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider mb-2">Technical Specifications</p>
            <div className="rounded-lg border">
              <div className="grid grid-cols-2">
                <DetailCell
                  icon={<Weight className="h-3.5 w-3.5" />}
                  label="Gross Vehicle Weight"
                  value={registration.grossVehicleWeight ? `${registration.grossVehicleWeight.toLocaleString()} kg` : 'Not specified'}
                  muted={!registration.grossVehicleWeight}
                />
                <DetailCell
                  icon={<Weight className="h-3.5 w-3.5" />}
                  label="Unladen Weight"
                  value={registration.unladenWeight ? `${registration.unladenWeight.toLocaleString()} kg` : 'Not specified'}
                  muted={!registration.unladenWeight}
                />
                <DetailCell
                  icon={<Car className="h-3.5 w-3.5" />}
                  label="Axle Configuration"
                  value={registration.axleConfiguration || 'Not specified'}
                  muted={!registration.axleConfiguration}
                />
                <DetailCell
                  icon={<Gauge className="h-3.5 w-3.5" />}
                  label="Engine Capacity"
                  value={registration.engineCapacity || 'Not specified'}
                  muted={!registration.engineCapacity}
                />
                <DetailCell
                  icon={<Car className="h-3.5 w-3.5" />}
                  label="Year of Manufacture"
                  value={registration.yearOfManufacture ? String(registration.yearOfManufacture) : 'Not specified'}
                  muted={!registration.yearOfManufacture}
                />
                <DetailCell
                  icon={<Car className="h-3.5 w-3.5" />}
                  label="Seating Capacity"
                  value={registration.seatingCapacity ? `${registration.seatingCapacity} seats` : 'Not specified'}
                  muted={!registration.seatingCapacity}
                />
                <DetailCell
                  icon={<MapPin className="h-3.5 w-3.5" />}
                  label="Country of Origin"
                  value={registration.countryOfOrigin || 'Not specified'}
                  muted={!registration.countryOfOrigin}
                />
              </div>
            </div>
          </div>

          {/* Date & Renewal Info */}
          <div>
            <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider mb-2">Dates & Renewal</p>
            <div className="rounded-lg border">
              <div className="grid grid-cols-2">
                <DetailCell
                  icon={<CalendarDays className="h-3.5 w-3.5" />}
                  label="Registration Date"
                  value={formatDate(registration.registrationDate)}
                />
                <DetailCell
                  icon={<CalendarDays className="h-3.5 w-3.5" />}
                  label="Expiry Date"
                  value={formatDate(registration.expiryDate)}
                />
                <DetailCell
                  icon={<History className="h-3.5 w-3.5" />}
                  label="Last Renewal"
                  value={registration.lastRenewalDate ? formatDate(registration.lastRenewalDate) : 'No renewals'}
                  muted={!registration.lastRenewalDate}
                />
                <DetailCell
                  icon={<CalendarDays className="h-3.5 w-3.5" />}
                  label="Next Renewal Due"
                  value={registration.nextRenewalDue ? formatDate(registration.nextRenewalDue) : 'Not scheduled'}
                  muted={!registration.nextRenewalDue}
                />
              </div>
            </div>
          </div>

          {/* Owner & Contact */}
          <div>
            <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider mb-2">Owner & Contact</p>
            <div className="rounded-lg border">
              <div className="grid grid-cols-2">
                <DetailCell
                  icon={<User className="h-3.5 w-3.5" />}
                  label="Registered Owner"
                  value={registration.registeredOwner}
                />
                <DetailCell
                  icon={<Phone className="h-3.5 w-3.5" />}
                  label="Owner Contact"
                  value={registration.ownerContact || 'Not provided'}
                  muted={!registration.ownerContact}
                />
                <DetailCell
                  icon={<MapPin className="h-3.5 w-3.5" />}
                  label="Owner Address"
                  value={registration.ownerAddress || 'Not provided'}
                  muted={!registration.ownerAddress}
                />
                <DetailCell
                  icon={<Building2 className="h-3.5 w-3.5" />}
                  label="DVLA Office"
                  value={registration.dvlaOffice || 'Not specified'}
                  muted={!registration.dvlaOffice}
                />
              </div>
            </div>
          </div>

          {/* Fees */}
          <div>
            <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider mb-2">Fees</p>
            <div className="rounded-lg border">
              <div className="grid grid-cols-2">
                <DetailCell
                  icon={<CreditCard className="h-3.5 w-3.5" />}
                  label="Registration Fee"
                  value={registration.registrationFee ? `₵${registration.registrationFee.toLocaleString()}` : 'Not recorded'}
                  muted={!registration.registrationFee}
                />
                <DetailCell
                  icon={<CreditCard className="h-3.5 w-3.5" />}
                  label="Renewal Fee"
                  value={registration.renewalFee ? `₵${registration.renewalFee.toLocaleString()}` : 'Not recorded'}
                  muted={!registration.renewalFee}
                />
              </div>
            </div>
          </div>

          {/* Notes */}
          {registration.notes && (
            <div>
              <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider mb-1.5">Notes</p>
              <div className="rounded-lg bg-muted/50 border p-3">
                <p className="text-sm text-foreground whitespace-pre-wrap leading-relaxed">{registration.notes}</p>
              </div>
            </div>
          )}

          {/* System Info */}
          <div>
            <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider mb-2">System Info</p>
            <div className="rounded-lg border">
              <div className="grid grid-cols-2">
                <DetailCell
                  icon={<Clock className="h-3.5 w-3.5" />}
                  label="Created"
                  value={formatDateTime(registration.createdAt)}
                />
                <DetailCell
                  icon={<Clock className="h-3.5 w-3.5" />}
                  label="Last Updated"
                  value={formatDateTime(registration.updatedAt)}
                />
              </div>
            </div>
          </div>

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
                            Previous expiry:{' '}
                            {prevData.expiryDate ? new Date(String(prevData.expiryDate)).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' }) : '—'}
                          </p>
                          <p>
                            Certificate: {String(prevData.certificateNumber || '—')}
                          </p>
                          {prevData.renewalFee != null && (
                            <p>Fee: {Number(prevData.renewalFee).toLocaleString()}</p>
                          )}
                        </div>
                      )}
                      {entry.renewalFee != null && (
                        <p className="text-xs font-medium text-emerald-600">
                          New renewal fee: {entry.renewalFee.toLocaleString()}
                        </p>
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

          {/* Action Buttons */}
          {canWrite && (
            <div className="space-y-2 pt-2">
              <Button
                variant="default"
                className="w-full"
                onClick={() => setRenewalOpen(true)}
              >
                <RefreshCw className="h-4 w-4 mr-2" />
                Renew Registration
              </Button>
              <Button
                variant="outline"
                className="w-full"
                onClick={() => onEdit?.(registration)}
              >
                <Pencil className="h-4 w-4 mr-2" />
                Edit Registration
              </Button>
              <AlertDialog>
                <AlertDialogTrigger asChild>
                  <Button variant="destructive" className="w-full">
                    <Trash2 className="h-4 w-4 mr-2" />
                    Delete Registration
                  </Button>
                </AlertDialogTrigger>
                <AlertDialogContent>
                  <AlertDialogHeader>
                    <AlertDialogTitle>Delete this DVLA registration?</AlertDialogTitle>
                    <AlertDialogDescription>
                      This will permanently delete the registration record for{' '}
                      <span className="font-mono font-semibold">{registration.registrationNumber}</span>
                      {' '}({registration.truck.plateNumber}). This action cannot be undone.
                    </AlertDialogDescription>
                  </AlertDialogHeader>
                  <AlertDialogFooter>
                    <AlertDialogCancel>Cancel</AlertDialogCancel>
                    <AlertDialogAction
                      onClick={handleDelete}
                      disabled={deleting}
                      className="bg-red-600 hover:bg-red-700"
                    >
                      {deleting ? 'Deleting...' : 'Delete Registration'}
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
          <p className="text-sm font-medium">Registration not found</p>
          <p className="text-xs text-muted-foreground mt-1">This DVLA registration may have been deleted.</p>
        </div>
      )}
    </ResponsiveSheet>

      {/* Renewal Dialog */}
      <DvlaRenewalDialog
        open={renewalOpen}
        onOpenChange={setRenewalOpen}
        registration={registration}
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
