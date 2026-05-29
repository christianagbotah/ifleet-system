'use client'

import * as React from 'react'
import {
  Bell,
  Route,
  Wrench,
  ShieldCheck,
  DollarSign,
  FileText,
  Smartphone,
  Check,
  MessageSquare,
  Mail,
  Clock,
  MapPin,
  CircleDot,
  Wifi,
  User,
  Truck,
} from 'lucide-react'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Separator } from '@/components/ui/separator'
import { NOTIFICATION_TYPES } from '@/lib/constants'
import { type Notification } from '@/lib/api'

interface NotificationDetailDialogProps {
  notification: Notification | null
  open: boolean
  onOpenChange: (open: boolean) => void
  onMarkAsRead?: (id: string) => void
}

// --- Icon component (declared outside render) ---

function NotificationTypeIcon({ type, className }: { type: string; className?: string }) {
  switch (type) {
    case 'trip_assigned':
      return <Smartphone className={className} />
    case 'trip_loading':
    case 'trip_loaded':
    case 'trip_offloaded':
    case 'trip_return':
    case 'trip_started':
    case 'trip_departed':
    case 'trip_in_transit':
    case 'trip_arrived':
    case 'trip_offloading':
    case 'trip_waiting':
    case 'trip_completed':
      return <Route className={className} />
    case 'maintenance_due':
      return <Wrench className={className} />
    case 'insurance_expiring':
      return <ShieldCheck className={className} />
    case 'payment_received':
      return <DollarSign className={className} />
    case 'alert':
      return <Bell className={className} />
    default:
      return <FileText className={className} />
  }
}

// --- Helpers ---

function getNotificationColor(type: string) {
  const config = NOTIFICATION_TYPES[type as keyof typeof NOTIFICATION_TYPES]
  return config?.color || 'bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-400'
}

function getTypeLabel(type: string): string {
  const config = NOTIFICATION_TYPES[type as keyof typeof NOTIFICATION_TYPES]
  return config?.label || type.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase())
}

function getTypeSeverity(type: string): 'info' | 'success' | 'warning' | 'danger' {
  if (type.includes('alert') || type.includes('insurance')) return 'danger'
  if (type.includes('maintenance') || type.includes('waiting')) return 'warning'
  if (type.includes('completed') || type.includes('payment')) return 'success'
  return 'info'
}

function getSeverityAccent(severity: 'info' | 'success' | 'warning' | 'danger') {
  switch (severity) {
    case 'danger': return 'border-l-red-500'
    case 'warning': return 'border-l-amber-500'
    case 'success': return 'border-l-emerald-500'
    default: return 'border-l-blue-500'
  }
}

function formatFullDate(dateStr: string): string {
  const date = new Date(dateStr)
  return date.toLocaleString('en-GH', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: true,
  })
}

function formatTimeAgo(dateStr: string): string {
  const date = new Date(dateStr)
  const now = new Date()
  const diffMs = now.getTime() - date.getTime()
  const diffMins = Math.floor(diffMs / 60000)
  const diffHours = Math.floor(diffMs / 3600000)
  const diffDays = Math.floor(diffMs / 86400000)

  if (diffMins < 1) return 'Just now'
  if (diffMins < 60) return `${diffMins}m ago`
  if (diffHours < 24) return `${diffHours}h ago`
  if (diffDays < 7) return `${diffDays}d ago`
  return date.toLocaleDateString()
}

/** Parse metadata JSON safely */
function parseMetadata(metadata: string | null): Record<string, unknown> | null {
  if (!metadata) return null
  try {
    return JSON.parse(metadata)
  } catch {
    return null
  }
}

// --- Metadata Detail Renderer ---

function MetadataSection({ metadata, type }: { metadata: Record<string, unknown>; type: string }) {
  // Only hide purely internal dispatch metadata — keep all user-meaningful data
  const entries = Object.entries(metadata).filter(
    ([key]) => !['notificationId', 'userId', 'tripId', 'truckId', 'driverId', 'maintenanceId', 'insuranceId', 'dispatchedAt', 'channels', 'suppressed', 'reason'].includes(key)
  )

  if (entries.length === 0) return null

  // Label mapping for known metadata keys
  const labelMap: Record<string, string> = {
    tripNumber: 'Trip',
    truckId: 'Truck',
    driverId: 'Driver',
    driverName: 'Driver',
    truckPlate: 'Truck Plate',
    truckRegNumber: 'Truck Plate',
    origin: 'Origin',
    destination: 'Destination',
    cargo: 'Cargo',
    itemName: 'Cargo',
    amount: 'Amount (₵)',
    totalRevenue: 'Revenue (₵)',
    status: 'Status',
    route: 'Route',
    distance: 'Distance',
    estimatedArrival: 'ETA',
    customerName: 'Customer',
    plateNumber: 'Truck Plate',
    quantity: 'Quantity',
    unit: 'Unit',
    departureTime: 'Departure',
    loadingLocation: 'Loading Location',
    waitingReason: 'Waiting Reason',
    waitingLocation: 'Waiting Location',
    from: 'From',
    to: 'To',
    documentType: 'Document',
    severity: 'Severity',
    daysRemaining: 'Days Remaining',
    expiresOn: 'Expires On',
    employeeId: 'Employee ID',
  }

  return (
    <div className="space-y-2">
      <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Details</p>
      <div className="grid grid-cols-2 gap-2">
        {entries.map(([key, value]) => {
          if (value === null || value === undefined || value === '') return null

          // Safety: hide any value that looks like a raw CUID (25+ alphanumeric chars)
          if (typeof value === 'string' && /^[a-z0-9]{25,}$/.test(value)) return null

          const label = labelMap[key] || key.replace(/([A-Z])/g, ' $1').replace(/^./, s => s.toUpperCase())

          // Render route as origin → destination
          if (key === 'origin' && metadata.destination) {
            return (
              <div key={key} className="col-span-2 bg-muted/50 rounded-md px-3 py-2.5">
                <div className="flex items-center gap-2">
                  <MapPin className="h-3.5 w-3.5 text-emerald-600 shrink-0" />
                  <span className="text-xs text-muted-foreground">{String(value)}</span>
                </div>
                <div className="ml-1.5 border-l-2 border-dashed border-muted-foreground/30 h-3" />
                <div className="flex items-center gap-2">
                  <CircleDot className="h-3.5 w-3.5 text-red-500 shrink-0" />
                  <span className="text-xs text-muted-foreground">{String(metadata.destination)}</span>
                </div>
              </div>
            )
          }
          if (key === 'destination' && metadata.origin) return null // handled above

          // Render amount / revenue with ₵ symbol
          if (key === 'amount' || key === 'totalRevenue') {
            return (
              <div key={key} className="bg-muted/50 rounded-md px-3 py-2">
                <p className="text-[10px] text-muted-foreground mb-0.5">{label}</p>
                <p className="text-sm font-semibold text-emerald-700 dark:text-emerald-400">
                  ₵{Number(value).toLocaleString('en-GH', { minimumFractionDigits: 2 })}
                </p>
              </div>
            )
          }

          // Render driverName with user icon
          if (key === 'driverName') {
            return (
              <div key={key} className="bg-blue-50 dark:bg-blue-900/20 rounded-md px-3 py-2 border border-blue-200 dark:border-blue-800/30">
                <p className="text-[10px] text-blue-600 dark:text-blue-400 mb-0.5">{label}</p>
                <div className="flex items-center gap-1.5">
                  <User className="h-3.5 w-3.5 text-blue-500" />
                  <p className="text-sm font-semibold text-blue-800 dark:text-blue-300">{String(value)}</p>
                </div>
              </div>
            )
          }

          // Render truckPlate with truck icon
          if (key === 'truckPlate' || key === 'plateNumber') {
            return (
              <div key={key} className="bg-purple-50 dark:bg-purple-900/20 rounded-md px-3 py-2 border border-purple-200 dark:border-purple-800/30">
                <p className="text-[10px] text-purple-600 dark:text-purple-400 mb-0.5">{label}</p>
                <div className="flex items-center gap-1.5">
                  <Truck className="h-3.5 w-3.5 text-purple-500" />
                  <p className="text-sm font-semibold text-purple-800 dark:text-purple-300">{String(value)}</p>
                </div>
              </div>
            )
          }

          // Render status as a styled badge
          if (key === 'status') {
            return (
              <div key={key} className="bg-muted/50 rounded-md px-3 py-2">
                <p className="text-[10px] text-muted-foreground mb-0.5">{label}</p>
                <Badge variant="outline" className="text-xs font-medium capitalize">
                  {String(value).replace(/_/g, ' ')}
                </Badge>
              </div>
            )
          }

          // Render tripNumber prominently
          if (key === 'tripNumber') {
            return (
              <div key={key} className="bg-amber-50 dark:bg-amber-900/20 rounded-md px-3 py-2 border border-amber-200 dark:border-amber-800/30">
                <p className="text-[10px] text-amber-600 dark:text-amber-400 mb-0.5">{label}</p>
                <p className="text-sm font-bold text-amber-800 dark:text-amber-300">{String(value)}</p>
              </div>
            )
          }

          return (
            <div key={key} className="bg-muted/50 rounded-md px-3 py-2">
              <p className="text-[10px] text-muted-foreground mb-0.5">{label}</p>
              <p className="text-xs font-medium capitalize">{String(value)}</p>
            </div>
          )
        })}
      </div>
    </div>
  )
}

// --- Main Component ---

export function NotificationDetailDialog({
  notification,
  open,
  onOpenChange,
  onMarkAsRead,
}: NotificationDetailDialogProps) {
  const colorClass = notification ? getNotificationColor(notification.type) : ''
  const typeLabel = notification ? getTypeLabel(notification.type) : ''
  const severity = notification ? getTypeSeverity(notification.type) : 'info'
  const severityAccent = notification ? getSeverityAccent(severity) : ''
  const metadata = notification ? parseMetadata(notification.metadata) : null

  // Track local isRead state for optimistic updates
  const [localIsRead, setLocalIsRead] = React.useState(notification?.isRead ?? true)

  // Sync when notification prop changes
  React.useEffect(() => {
    setLocalIsRead(notification?.isRead ?? true)
  }, [notification?.isRead])

  const handleMarkRead = async () => {
    if (!localIsRead && onMarkAsRead && notification) {
      setLocalIsRead(true)
      try {
        await onMarkAsRead(notification.id)
      } catch {
        setLocalIsRead(false)
      }
    }
  }

  // Check delivery channels
  const notif = notification as Record<string, unknown> | null
  const smsSent = notif?.smsSent === true
  const emailSent = notif?.emailSent === true
  const pushSent = notif?.pushSent === true

  return (
    <Dialog open={open && !!notification} onOpenChange={onOpenChange}>
      <DialogContent
        className={`sm:max-w-md !p-0 !gap-0 md:border-l-4 ${severityAccent}`}
        showCloseButton={false}
      >
        {/* Color accent header strip */}
        <div className={`${colorClass} px-6 pt-5 pb-4 shrink-0`}>
            <div className="flex items-start gap-3">
              <div className={`rounded-xl p-2.5 bg-white/80 dark:bg-black/20 shrink-0`}>
                <NotificationTypeIcon type={notification?.type || ''} className="h-5 w-5" />
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 mb-1">
                  <Badge variant="outline" className="text-[10px] font-semibold px-1.5 py-0 bg-white/60 dark:bg-black/20 border-current/20">
                    {typeLabel}
                  </Badge>
                  {!localIsRead && (
                    <Badge className="text-[10px] font-bold px-1.5 py-0 bg-amber-500 text-white border-0">
                      New
                    </Badge>
                  )}
                </div>
                <DialogTitle className="text-base font-bold leading-snug text-foreground pr-6">
                  {notification?.title || ''}
                </DialogTitle>
                <DialogDescription className="text-[11px] text-foreground/60 mt-0.5">
                  {notification?.createdAt ? formatTimeAgo(notification.createdAt) : ''}
                </DialogDescription>
              </div>
            </div>
          </div>

          {/* Scrollable body */}
          <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-6 py-4 space-y-4">
            {/* Full message */}
            <div>
              <p className="text-sm leading-relaxed text-foreground/90 whitespace-pre-wrap">
                {notification?.message || ''}
              </p>
            </div>

            {/* Metadata details (if available) */}
            {metadata && (
              <MetadataSection metadata={metadata} type={notification?.type || ''} />
            )}

            <Separator />

            {/* Delivery channel badges */}
            <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
              <span className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">Delivered via</span>
              <div className="flex items-center gap-2">
                <span className="flex items-center gap-1 text-xs font-medium text-muted-foreground bg-muted/60 rounded-full px-2 py-0.5">
                  <Bell className="h-2.5 w-2.5" />
                  App
                </span>
                {pushSent && (
                  <span className="flex items-center gap-1 text-xs font-medium text-blue-600 bg-blue-50 dark:bg-blue-900/20 dark:text-blue-400 rounded-full px-2 py-0.5">
                    <Wifi className="h-2.5 w-2.5" />
                    Push
                  </span>
                )}
                {smsSent && (
                  <span className="flex items-center gap-1 text-xs font-medium text-emerald-600 bg-emerald-50 dark:bg-emerald-900/20 dark:text-emerald-400 rounded-full px-2 py-0.5">
                    <MessageSquare className="h-2.5 w-2.5" />
                    SMS
                  </span>
                )}
                {emailSent && (
                  <span className="flex items-center gap-1 text-xs font-medium text-violet-600 bg-violet-50 dark:bg-violet-900/20 dark:text-violet-400 rounded-full px-2 py-0.5">
                    <Mail className="h-2.5 w-2.5" />
                    Email
                  </span>
                )}
              </div>
            </div>

            <Separator />

            {/* Timestamp */}
            <div className="flex items-center gap-2 text-xs text-muted-foreground">
              <Clock className="h-3 w-3 shrink-0" />
              <span title={notification?.createdAt ? formatFullDate(notification.createdAt) : ''}>
                {notification?.createdAt ? formatFullDate(notification.createdAt) : ''}
              </span>
              {!localIsRead && (
                <Badge variant="outline" className="text-[9px] font-bold px-1.5 py-0 border-amber-300 text-amber-700 dark:text-amber-400">
                  Unread
                </Badge>
              )}
            </div>
          </div>

          {/* Footer actions — pinned to bottom */}
          <div className="shrink-0 px-6 py-4 pb-[max(1rem,env(safe-area-inset-bottom))] bg-muted/30 border-t flex items-center gap-2">
            {!localIsRead && (
              <Button
                variant="outline"
                size="sm"
                className="h-8 text-xs"
                onClick={handleMarkRead}
              >
                <Check className="mr-1.5 h-3 w-3" />
                Mark as read
              </Button>
            )}
            <Button
              variant="ghost"
              size="sm"
              className="h-8 text-xs"
              onClick={() => onOpenChange(false)}
            >
              Close
            </Button>
        </div>
      </DialogContent>
    </Dialog>
  )
}
