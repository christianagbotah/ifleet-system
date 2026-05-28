'use client'

import * as React from 'react'
import {
  Phone,
  Calendar,
  DollarSign,
  TrendingUp,
  Clock,
  MinusCircle,
  Wallet,
  UserCheck,
  CreditCard,
  FileText,
  Pencil,
  CheckCircle,
  Trash2,
} from 'lucide-react'
import { ResponsiveSheet } from '@/components/ui/responsive-sheet'
import { Button } from '@/components/ui/button'
import { StatusBadge } from '@/components/ui/status-badge'
import { Separator } from '@/components/ui/separator'
import { MONTHS, CURRENCY_SYMBOL } from '@/lib/constants'
import { type PayrollRecord } from '@/lib/api'

interface PayrollDetailSheetProps {
  record: PayrollRecord | null
  open: boolean
  onOpenChange: (open: boolean) => void
  onEdit: (record: PayrollRecord) => void
  onStatusChange: (id: string, status: string) => void
  onDeleted: () => void
}

function DetailRow({
  icon: Icon,
  label,
  value,
  valueClassName,
}: {
  icon: React.ComponentType<{ className?: string }>
  label: string
  value: string | number
  valueClassName?: string
}) {
  return (
    <div className="flex items-center justify-between py-3">
      <div className="flex items-center gap-3 text-muted-foreground">
        <Icon className="h-4 w-4 shrink-0" />
        <span className="text-sm">{label}</span>
      </div>
      <span className={`text-sm font-medium ${valueClassName || ''}`}>{value}</span>
    </div>
  )
}

export function PayrollDetailSheet({
  record,
  open,
  onOpenChange,
  onEdit,
  onStatusChange,
  onDeleted,
}: PayrollDetailSheetProps) {
  if (!record) return null

  const monthLabel = MONTHS[record.month - 1] || String(record.month)
  const canDelete = record.status !== 'paid'

  const createdAtDate = record.createdAt
    ? new Date(record.createdAt).toLocaleDateString('en-GB', {
        day: 'numeric',
        month: 'short',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
      })
    : 'N/A'

  const paidAtDate = record.paidAt
    ? new Date(record.paidAt).toLocaleDateString('en-GB', {
        day: 'numeric',
        month: 'short',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
      })
    : null

  return (
    <ResponsiveSheet
      open={open}
      onOpenChange={onOpenChange}
      title={
        <span className="flex items-center gap-2">
          <Phone className="h-4 w-4 text-amber-500 shrink-0" />
          {record.driver.firstName} {record.driver.lastName}
        </span>
      }
      description={record.driver.phone}
    >
      <div className="space-y-5 p-4 md:p-6">
        {/* Status badge */}
        <div className="flex items-center justify-between">
          <StatusBadge status={record.status} variant="payroll" />
        </div>

        {/* Pay Period */}
        <div className="rounded-lg border bg-muted/40 px-4 py-3">
          <div className="flex items-center gap-2 text-sm">
            <Calendar className="h-4 w-4 text-muted-foreground" />
            <span className="font-medium">
              {monthLabel} {record.year}
            </span>
          </div>
        </div>

        {/* Payroll Breakdown */}
        <div>
          <h4 className="text-sm font-semibold text-muted-foreground mb-1">
            Payroll Breakdown
          </h4>
          <div className="rounded-lg border">
            <DetailRow
              icon={DollarSign}
              label="Base Salary"
              value={`${CURRENCY_SYMBOL}${record.baseSalary.toLocaleString()}`}
            />
            <Separator />
            <DetailRow
              icon={TrendingUp}
              label="Trip Bonus"
              value={`+${CURRENCY_SYMBOL}${record.tripBonus.toLocaleString()}`}
              valueClassName="text-emerald-600"
            />
            <Separator />
            <DetailRow
              icon={Clock}
              label="Overtime Pay"
              value={`+${CURRENCY_SYMBOL}${record.overtimePay.toLocaleString()}`}
              valueClassName="text-emerald-600"
            />
            <Separator />
            <DetailRow
              icon={MinusCircle}
              label="Deductions"
              value={`-${CURRENCY_SYMBOL}${record.deductions.toLocaleString()}`}
              valueClassName="text-red-600"
            />
            <Separator />
            <div className="flex items-center justify-between py-3 bg-muted/40 px-0">
              <div className="flex items-center gap-3 font-medium text-sm px-0">
                <Wallet className="h-4 w-4 text-amber-600 shrink-0" />
                <span>Net Pay</span>
              </div>
              <span className="text-base font-bold text-amber-600">
                {CURRENCY_SYMBOL}{record.netPay.toLocaleString()}
              </span>
            </div>
          </div>
        </div>

        {/* Additional Info */}
        <div>
          <h4 className="text-sm font-semibold text-muted-foreground mb-1">
            Details
          </h4>
          <div className="rounded-lg border">
            {record.approvedBy && (
              <>
                <DetailRow
                  icon={UserCheck}
                  label="Approved By"
                  value={record.approvedBy}
                />
                <Separator />
              </>
            )}
            {paidAtDate && (
              <>
                <DetailRow
                  icon={CreditCard}
                  label="Paid At"
                  value={paidAtDate}
                  valueClassName="text-emerald-600"
                />
                <Separator />
              </>
            )}
            <DetailRow
              icon={FileText}
              label="Created"
              value={createdAtDate}
            />
          </div>
        </div>

        {/* Notes */}
        {record.notes && (
          <div>
            <h4 className="text-sm font-semibold text-muted-foreground mb-1">
              Notes
            </h4>
            <div className="rounded-lg border bg-muted/30 px-4 py-3">
              <p className="text-sm whitespace-pre-wrap">{record.notes}</p>
            </div>
          </div>
        )}
      </div>

      <ResponsiveSheet.Footer>
        <div className="flex flex-row gap-2">
          <Button
            variant="outline"
            className="flex-1"
            onClick={() => onEdit(record)}
          >
            <Pencil className="mr-2 h-4 w-4" />
            Edit
          </Button>
          {record.status === 'pending' && (
            <Button
              className="flex-1 bg-amber-500 hover:bg-amber-600 text-white"
              onClick={() => onStatusChange(record.id, 'approved')}
            >
              <CheckCircle className="mr-2 h-4 w-4" />
              Approve
            </Button>
          )}
          {record.status === 'approved' && (
            <Button
              className="flex-1 bg-emerald-600 hover:bg-emerald-700 text-white"
              onClick={() => onStatusChange(record.id, 'paid')}
            >
              <CreditCard className="mr-2 h-4 w-4" />
              Mark as Paid
            </Button>
          )}
          {canDelete && (
            <Button
              variant="destructive"
              className="flex-1"
              onClick={() => {
                if (window.confirm('Are you sure you want to delete this payroll record? This action cannot be undone.')) {
                  onDeleted()
                }
              }}
            >
              <Trash2 className="mr-2 h-4 w-4" />
              Delete
            </Button>
          )}
        </div>
      </ResponsiveSheet.Footer>
    </ResponsiveSheet>
  )
}

// ────────────────────────────────────────────────────────────────────
// Namespace sub-component for convenience
// ────────────────────────────────────────────────────────────────────

ResponsiveSheet.Footer = function ResponsiveSheetFooter({
  children,
  className,
}: {
  children: React.ReactNode
  className?: string
}) {
  return <div className={className}>{children}</div>
}
