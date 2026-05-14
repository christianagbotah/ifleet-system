'use client'

import * as React from 'react'
import { Wrench, Truck, Clock, DollarSign, MapPin, Calendar, Gauge, Activity } from 'lucide-react'
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
} from '@/components/ui/sheet'
import { Badge } from '@/components/ui/badge'
import { Separator } from '@/components/ui/separator'
import { Progress } from '@/components/ui/progress'
import { CURRENCY_SYMBOL } from '@/lib/constants'

interface ScheduleItem {
  truckId: string
  plateNumber: string
  make: string
  model: string
  currentMileage: number
  lastServiceDate: string | null
  lastServiceMileage: number | null
  nextDueDate: string | null
  nextDueMileage: number | null
  daysUntilDue: number | null
  kmUntilDue: number | null
  status: 'upcoming' | 'due_soon' | 'overdue' | 'no_history'
  healthScore: number
  lastCost: number | null
  estimatedNextCost: number | null
  lastServiceType: string | null
}

interface TruckHistorySheetProps {
  item: ScheduleItem | null
  open: boolean
  onOpenChange: (open: boolean) => void
}

const STATUS_LABELS: Record<string, { label: string; className: string }> = {
  overdue: { label: 'Overdue', className: 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400' },
  due_soon: { label: 'Due Soon', className: 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400' },
  upcoming: { label: 'Upcoming', className: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400' },
  no_history: { label: 'No History', className: 'bg-gray-100 text-gray-700 dark:bg-gray-900/30 dark:text-gray-400' },
}

function formatDate(dt: string) {
  try {
    return new Date(dt).toLocaleDateString('en-GB', {
      day: '2-digit', month: 'short', year: 'numeric',
    })
  } catch { return dt }
}

function getHealthColor(score: number) {
  if (score >= 80) return 'text-emerald-600 dark:text-emerald-400'
  if (score >= 50) return 'text-amber-600 dark:text-amber-400'
  return 'text-red-600 dark:text-red-400'
}

export function TruckHistorySheet({ item, open, onOpenChange }: TruckHistorySheetProps) {
  if (!item) return null

  const statusInfo = STATUS_LABELS[item.status] || STATUS_LABELS.no_history

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="sm:max-w-md">
        <SheetHeader className="shrink-0 px-5 sm:px-6 pt-5 sm:pt-5">
          <SheetTitle className="flex items-center gap-2">
            <Truck className="h-5 w-5 text-amber-500" />
            {item.plateNumber}
          </SheetTitle>
          <SheetDescription>
            {item.make} {item.model} — Maintenance History
          </SheetDescription>
        </SheetHeader>

        <div className="mt-4 sm:mt-6 space-y-5 px-5 sm:px-6 overflow-y-auto flex-1 min-h-0 pb-8 sm:pb-6">
          {/* Status + Health */}
          <div className="flex items-center gap-2">
            <Badge className={statusInfo.className} variant="outline">
              {statusInfo.label}
            </Badge>
            <span className={`ml-auto text-sm font-bold ${getHealthColor(item.healthScore)}`}>
              {item.healthScore}% health
            </span>
          </div>

          {/* Health progress bar */}
          <div className="space-y-1">
            <div className="flex items-center justify-between text-xs text-muted-foreground">
              <span>Health Score</span>
              <span className="font-medium">{item.healthScore}/100</span>
            </div>
            <Progress value={item.healthScore} className="h-2" />
          </div>

          {/* Truck Info Card */}
          <div className="p-3 rounded-lg bg-muted/50 space-y-2">
            <div className="flex items-center gap-2">
              <Truck className="h-4 w-4 text-amber-500 shrink-0" />
              <span className="text-sm font-medium">{item.plateNumber}</span>
              <span className="text-xs text-muted-foreground">
                {item.make} {item.model}
              </span>
            </div>
            {item.currentMileage > 0 && (
              <div className="flex items-center gap-2 text-xs text-muted-foreground">
                <Gauge className="h-3 w-3" />
                <span>Current: {item.currentMileage.toLocaleString()} km</span>
              </div>
            )}
          </div>

          <Separator />

          {/* Details Grid */}
          <div className="space-y-3">
            <h4 className="text-sm font-semibold text-amber-600 dark:text-amber-400">Service Information</h4>
            <div className="grid grid-cols-2 gap-3">
              {item.lastServiceDate && (
                <InfoItem
                  icon={Calendar}
                  label="Last Service"
                  value={formatDate(item.lastServiceDate)}
                />
              )}
              {item.lastServiceType && (
                <InfoItem
                  icon={Wrench}
                  label="Service Type"
                  value={item.lastServiceType.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase())}
                />
              )}
              {item.lastServiceMileage != null && (
                <InfoItem
                  icon={MapPin}
                  label="Service Mileage"
                  value={`${item.lastServiceMileage.toLocaleString()} km`}
                />
              )}
              {item.lastCost != null && (
                <InfoItem
                  icon={DollarSign}
                  label="Last Cost"
                  value={`${CURRENCY_SYMBOL}${item.lastCost.toLocaleString()}`}
                />
              )}
              {item.nextDueDate && (
                <InfoItem
                  icon={Calendar}
                  label="Next Due"
                  value={formatDate(item.nextDueDate)}
                  valueClassName={item.status === 'overdue' ? 'text-red-600 dark:text-red-400 font-semibold' : item.status === 'due_soon' ? 'text-amber-600 dark:text-amber-400 font-semibold' : undefined}
                />
              )}
              {item.nextDueMileage != null && (
                <InfoItem
                  icon={MapPin}
                  label="Due At Mileage"
                  value={`${item.nextDueMileage.toLocaleString()} km`}
                />
              )}
              {item.daysUntilDue != null && (
                <InfoItem
                  icon={Clock}
                  label="Days Until Due"
                  value={`${item.daysUntilDue} days`}
                  valueClassName={item.daysUntilDue < 0 ? 'text-red-600 dark:text-red-400 font-semibold' : item.daysUntilDue <= 7 ? 'text-amber-600 dark:text-amber-400 font-semibold' : undefined}
                />
              )}
              {item.kmUntilDue != null && (
                <InfoItem
                  icon={Gauge}
                  label="KM Until Due"
                  value={`${item.kmUntilDue.toLocaleString()} km`}
                  valueClassName={item.kmUntilDue < 0 ? 'text-red-600 dark:text-red-400 font-semibold' : undefined}
                />
              )}
              {item.estimatedNextCost != null && (
                <InfoItem
                  icon={DollarSign}
                  label="Est. Next Cost"
                  value={`${CURRENCY_SYMBOL}${item.estimatedNextCost.toLocaleString()}`}
                  valueClassName="text-muted-foreground"
                />
              )}
            </div>
          </div>

          {item.status === 'no_history' && (
            <div className="text-center py-2">
              <Badge variant="outline" className="bg-gray-50 text-gray-600 dark:bg-gray-900/20 dark:text-gray-400 border-gray-200">
                No Service History Available
              </Badge>
            </div>
          )}
        </div>
      </SheetContent>
    </Sheet>
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
