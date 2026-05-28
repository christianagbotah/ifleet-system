'use client'

import * as React from 'react'
import { Wrench, Truck, Clock, DollarSign, MapPin, Calendar, Tag, User, Hash, FileText } from 'lucide-react'
import { ResponsiveSheet } from '@/components/ui/responsive-sheet'
import { Badge } from '@/components/ui/badge'
import { Separator } from '@/components/ui/separator'
import { StatusBadge } from '@/components/ui/status-badge'
import { CURRENCY_SYMBOL } from '@/lib/constants'
import type { MaintenanceRecord } from '@/lib/api'

interface MaintenanceDetailSheetProps {
  record: MaintenanceRecord | null
  open: boolean
  onOpenChange: (open: boolean) => void
}

function formatDateTime(dt: string) {
  try {
    return new Date(dt).toLocaleString('en-GB', {
      day: '2-digit', month: 'short', year: 'numeric',
      hour: '2-digit', minute: '2-digit',
    })
  } catch { return dt }
}

function formatDate(dt: string) {
  try {
    return new Date(dt).toLocaleDateString('en-GB', {
      day: '2-digit', month: 'short', year: 'numeric',
    })
  } catch { return dt }
}

export function MaintenanceDetailSheet({ record, open, onOpenChange }: MaintenanceDetailSheetProps) {
  if (!record) return null

  const statusColor = record.status === 'completed'
    ? 'text-emerald-600 dark:text-emerald-400'
    : record.status === 'in_progress'
      ? 'text-sky-600 dark:text-sky-400'
      : 'text-amber-600 dark:text-amber-400'

  return (
    <ResponsiveSheet
      open={open}
      onOpenChange={onOpenChange}
      title={
        <span className="flex items-center gap-2">
          <Wrench className="h-5 w-5 text-amber-500" />
          {record.title}
        </span>
      }
      description="Maintenance record details"
      width="sm:max-w-md"
    >
      <div className="space-y-5 p-4 md:p-6">
        {/* Status + Type */}
        <div className="flex items-center gap-2">
          <StatusBadge status={record.status} variant="payroll" />
          <StatusBadge status={record.type} variant="maintenance" />
          {record.cost && (
            <span className="ml-auto text-sm font-bold text-emerald-600 dark:text-emerald-400">
              {CURRENCY_SYMBOL}{record.cost.toLocaleString()}
            </span>
          )}
        </div>

        {/* Truck Info */}
        <div className="p-3 rounded-lg bg-muted/50">
          <div className="flex items-center gap-2">
            <Truck className="h-4 w-4 text-amber-500 shrink-0" />
            <span className="text-sm font-medium">{record.truck.plateNumber}</span>
            <span className="text-xs text-muted-foreground">
              {record.truck.make} {record.truck.model}
            </span>
          </div>
        </div>

        <Separator />

        {/* Details Grid */}
        <div className="space-y-3">
          <h4 className="text-sm font-semibold text-amber-600 dark:text-amber-400">Record Information</h4>
          <div className="grid grid-cols-2 gap-3">
            <InfoItem
              icon={Calendar}
              label="Performed On"
              value={formatDateTime(record.performedAt)}
            />
            {record.nextDueDate && (
              <InfoItem
                icon={Calendar}
                label="Next Due"
                value={formatDate(record.nextDueDate)}
                valueClassName={record.status !== 'completed' ? 'text-amber-600 dark:text-amber-400 font-semibold' : undefined}
              />
            )}
            {record.odometer != null && (
              <InfoItem
                icon={MapPin}
                label="Odometer"
                value={`${record.odometer.toLocaleString()} km`}
              />
            )}
            {record.nextDueMileage != null && (
              <InfoItem
                icon={MapPin}
                label="Next Due At"
                value={`${record.nextDueMileage.toLocaleString()} km`}
              />
            )}
            {record.performedBy && (
              <InfoItem
                icon={User}
                label="Performed By"
                value={record.performedBy}
              />
            )}
            {record.reference && (
              <InfoItem
                icon={Hash}
                label="Reference"
                value={record.reference}
              />
            )}
          </div>
        </div>

        {/* Description */}
        {record.description && (
          <>
            <Separator />
            <div className="space-y-2">
              <h4 className="text-sm font-semibold text-amber-600 dark:text-amber-400">Description</h4>
              <p className="text-sm text-muted-foreground bg-muted/50 rounded-md p-3 whitespace-pre-wrap">
                {record.description}
              </p>
            </div>
          </>
        )}

        {record.status === 'completed' && (
          <div className="text-center py-2">
            <Badge variant="outline" className="bg-emerald-50 text-emerald-700 dark:bg-emerald-900/20 dark:text-emerald-400 border-emerald-200">
              Service Completed
            </Badge>
          </div>
        )}
      </div>
    </ResponsiveSheet>
  )
}

function InfoItem({
  icon: Icon,
  label,
  value,
  valueClassName,
}: {
  icon: React.ComponentType<{ className?: string }>
  label: string
  value: string
  valueClassName?: string
}) {
  return (
    <div className="space-y-0.5">
      <div className="flex items-center gap-1 text-xs text-muted-foreground">
        <Icon className="h-3 w-3" />
        {label}
      </div>
      <div className={`text-sm font-medium ${valueClassName || ''}`}>{value}</div>
    </div>
  )
}
