'use client'

import * as React from 'react'
import { Receipt, Truck, Clock, DollarSign, Calendar, Tag, Hash, CreditCard, FileText } from 'lucide-react'
import { ResponsiveSheet } from '@/components/ui/responsive-sheet'
import { Separator } from '@/components/ui/separator'
import { StatusBadge } from '@/components/ui/status-badge'
import { Badge } from '@/components/ui/badge'
import { CURRENCY_SYMBOL } from '@/lib/constants'
import type { Expense } from '@/lib/api'

interface ExpenseDetailSheetProps {
  expense: Expense | null
  open: boolean
  onOpenChange: (open: boolean) => void
}

function formatDate(dt: string) {
  try {
    return new Date(dt).toLocaleDateString('en-GB', {
      day: '2-digit', month: 'short', year: 'numeric',
    })
  } catch { return dt }
}

export function ExpenseDetailSheet({ expense, open, onOpenChange }: ExpenseDetailSheetProps) {
  if (!expense) return null

  return (
    <ResponsiveSheet
      open={open}
      onOpenChange={onOpenChange}
      title={
        <span className="flex items-center gap-2">
          <Receipt className="h-5 w-5 text-amber-500" />
          Expense Details
        </span>
      }
      description={expense.description}
      width="sm:max-w-md"
    >
      {/* ── Body ── */}
      <div className="space-y-5 p-4 md:p-6">
          {/* Status + Amount */}
          <div className="flex items-center gap-2">
            <StatusBadge status={expense.status} variant="expense" />
            <Badge variant="outline" className="text-xs capitalize">
              {expense.category}
            </Badge>
            <span className="ml-auto text-sm font-bold text-emerald-600 dark:text-emerald-400">
              {CURRENCY_SYMBOL}{expense.amount.toLocaleString()}
            </span>
          </div>

          {/* Truck Info */}
          <div className="p-3 rounded-lg bg-muted/50">
            <div className="flex items-center gap-2">
              <Truck className="h-4 w-4 text-amber-500 shrink-0" />
              <span className="text-sm font-medium">{expense.truck.plateNumber}</span>
              <span className="text-xs text-muted-foreground">
                {expense.truck.make} {expense.truck.model}
              </span>
            </div>
          </div>

          <Separator />

          {/* Details Grid */}
          <div className="space-y-3">
            <h4 className="text-sm font-semibold text-amber-600 dark:text-amber-400">Expense Information</h4>
            <div className="grid grid-cols-2 gap-3">
              <InfoItem
                icon={Calendar}
                label="Date"
                value={formatDate(expense.date)}
              />
              <InfoItem
                icon={Tag}
                label="Category"
                value={expense.category.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase())}
              />
              <InfoItem
                icon={CreditCard}
                label="Payment"
                value={expense.paymentMethod.replace(/_/g, ' ')}
              />
              {expense.reference && (
                <InfoItem
                  icon={Hash}
                  label="Reference"
                  value={expense.reference}
                />
              )}
            </div>
          </div>

          {expense.status === 'completed' && (
            <div className="text-center py-2">
              <Badge variant="outline" className="bg-emerald-50 text-emerald-700 dark:bg-emerald-900/20 dark:text-emerald-400 border-emerald-200">
                Expense Completed
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
}: {
  icon: React.ComponentType<{ className?: string }>
  label: string
  value: string
}) {
  return (
    <div className="space-y-0.5">
      <div className="flex items-center gap-1 text-xs text-muted-foreground">
        <Icon className="h-3 w-3" />
        {label}
      </div>
      <div className="text-sm font-medium">{value}</div>
    </div>
  )
}
