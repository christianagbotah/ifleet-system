'use client'

import * as React from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { Loader2, User, DollarSign, FileText } from 'lucide-react'
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
  SheetFooter,
} from '@/components/ui/sheet'
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from '@/components/ui/form'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { SearchableSelect } from '@/components/ui/searchable-select'
import { Separator } from '@/components/ui/separator'
import { MONTHS, CURRENCY_SYMBOL } from '@/lib/constants'
import { type Driver, type PayrollRecord, fetchDrivers } from '@/lib/api'
import { toast } from 'sonner'

const payrollSchema = z.object({
  driverId: z.string().min(1, 'Driver is required'),
  month: z.string().min(1, 'Month is required'),
  year: z.coerce.number().min(2020).max(2099),
  baseSalary: z.coerce.number().min(0, 'Base salary must be 0 or more'),
  tripBonus: z.coerce.number().min(0).optional().or(z.nan()),
  overtimePay: z.coerce.number().min(0).optional().or(z.nan()),
  deductions: z.coerce.number().min(0).optional().or(z.nan()),
  notes: z.string().optional(),
})

type PayrollFormData = z.infer<typeof payrollSchema>

interface PayrollFormDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  onSaved: () => void
  editRecord?: PayrollRecord | null
}

const defaultFormValues = {
  driverId: '',
  month: String(new Date().getMonth() + 1),
  year: new Date().getFullYear(),
  baseSalary: undefined as number | undefined,
  tripBonus: 0,
  overtimePay: 0,
  deductions: 0,
  notes: '',
}

function SectionHeader({
  icon: Icon,
  title,
}: {
  icon: React.ComponentType<{ className?: string }>
  title: string
}) {
  return (
    <div className="flex items-center gap-2.5 mb-4">
      <div className="flex items-center justify-center h-7 w-7 rounded-md bg-primary/10">
        <Icon className="h-4 w-4 text-primary" />
      </div>
      <h3 className="text-sm font-semibold text-foreground">{title}</h3>
    </div>
  )
}

export function PayrollFormDialog({
  open,
  onOpenChange,
  onSaved,
  editRecord,
}: PayrollFormDialogProps) {
  const [submitting, setSubmitting] = React.useState(false)
  const [drivers, setDrivers] = React.useState<Driver[]>([])
  const [driversLoading, setDriversLoading] = React.useState(false)

  const isEditing = !!editRecord

  const form = useForm<PayrollFormData>({
    resolver: zodResolver(payrollSchema),
    defaultValues: defaultFormValues,
  })

  // Load drivers on mount
  React.useEffect(() => {
    if (open) {
      setDriversLoading(true)
      fetchDrivers({ status: 'active', limit: 100 })
        .then((res) => setDrivers(res.data))
        .catch(() => toast.error('Failed to load drivers'))
        .finally(() => setDriversLoading(false))
    }
  }, [open])

  // Reset or pre-fill form when sheet opens
  React.useEffect(() => {
    if (open) {
      if (editRecord) {
        form.reset({
          driverId: editRecord.driverId,
          month: String(editRecord.month),
          year: editRecord.year,
          baseSalary: editRecord.baseSalary,
          tripBonus: editRecord.tripBonus || 0,
          overtimePay: editRecord.overtimePay || 0,
          deductions: editRecord.deductions || 0,
          notes: editRecord.notes || '',
        })
      } else {
        form.reset({
          ...defaultFormValues,
          year: new Date().getFullYear(),
          month: String(new Date().getMonth() + 1),
        })
      }
    }
  }, [open, editRecord, form])

  // Use Number() conversion to prevent string concatenation
  const watchBaseSalary = form.watch('baseSalary')
  const watchTripBonus = form.watch('tripBonus')
  const watchOvertimePay = form.watch('overtimePay')
  const watchDeductions = form.watch('deductions')

  const netPay =
    (Number(watchBaseSalary) || 0) +
    (Number(watchTripBonus) || 0) +
    (Number(watchOvertimePay) || 0) -
    (Number(watchDeductions) || 0)

  async function onSubmit(data: PayrollFormData) {
    setSubmitting(true)
    try {
      const payload: Record<string, unknown> = {
        driverId: data.driverId,
        month: parseInt(data.month),
        year: data.year,
        baseSalary: data.baseSalary,
        tripBonus: Number(data.tripBonus) || 0,
        overtimePay: Number(data.overtimePay) || 0,
        deductions: Number(data.deductions) || 0,
        notes: data.notes || null,
      }

      if (isEditing && editRecord) {
        const res = await fetch(`/api/payroll/${editRecord.id}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        })
        if (!res.ok) {
          const err = await res.json().catch(() => ({ error: 'Failed' }))
          throw new Error(err.error || 'Failed to update')
        }
        toast.success('Payroll record updated successfully')
      } else {
        const res = await fetch('/api/payroll', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        })
        if (!res.ok) {
          const err = await res.json().catch(() => ({ error: 'Failed' }))
          throw new Error(err.error || 'Failed to create')
        }
        toast.success('Payroll record created successfully')
      }

      onSaved()
      onOpenChange(false)
    } catch (err) {
      toast.error(err instanceof Error ? err.message : `Failed to ${isEditing ? 'update' : 'create'} payroll record`)
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="bottom">
        {/* Header */}
        <SheetHeader className="px-6 sm:px-8 py-5 pb-0">
          <SheetTitle>
            {isEditing ? 'Edit Payroll Record' : 'Create Payroll Record'}
          </SheetTitle>
          <SheetDescription className="mt-1">
            {isEditing
              ? `Editing payroll for ${editRecord?.driver.firstName} ${editRecord?.driver.lastName}`
              : 'Set salary, bonuses, and deductions for a driver\'s payroll.'}
          </SheetDescription>
        </SheetHeader>

        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="px-6 sm:px-8 pt-5 pb-2 space-y-6">
            {/* Section: Driver & Pay Period */}
            <section>
              <SectionHeader icon={User} title="Driver & Pay Period" />

              {/* Driver Select */}
              <FormField
                control={form.control}
                name="driverId"
                render={({ field }) => (
                  <FormItem className="mb-4">
                    <FormLabel className="text-sm font-medium">Driver *</FormLabel>
                    <SearchableSelect
                      options={drivers.map(d => ({ value: d.id, label: `${d.firstName} ${d.lastName}`, description: d.phone }))}
                      value={field.value}
                      onValueChange={field.onChange}
                      placeholder={driversLoading ? 'Loading...' : 'Select a driver'}
                      disabled={driversLoading || isEditing}
                    />
                    <FormMessage />
                  </FormItem>
                )}
              />

              {/* Month & Year row */}
              <div className="grid grid-cols-2 gap-4">
                <FormField
                  control={form.control}
                  name="month"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel className="text-sm font-medium">Month *</FormLabel>
                      <Select value={field.value} onValueChange={field.onChange} disabled={isEditing}>
                        <FormControl>
                          <SelectTrigger className="w-full h-11">
                            <SelectValue placeholder="Select month" />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          {MONTHS.map((m, i) => (
                            <SelectItem key={m} value={String(i + 1)}>
                              {m}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="year"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel className="text-sm font-medium">Year *</FormLabel>
                      <FormControl>
                        <Input
                          type="number"
                          min={2020}
                          max={2099}
                          disabled={isEditing}
                          className="h-11"
                          {...field}
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>
            </section>

            <Separator />

            {/* Section: Compensation */}
            <section>
              <SectionHeader icon={DollarSign} title="Compensation" />

              {/* Base Salary */}
              <FormField
                control={form.control}
                name="baseSalary"
                render={({ field }) => (
                  <FormItem className="mb-4">
                    <FormLabel className="text-sm font-medium">Base Salary *</FormLabel>
                    <FormControl>
                      <div className="relative">
                        <span className="absolute left-3.5 top-1/2 -translate-y-1/2 text-sm font-medium text-muted-foreground">
                          {CURRENCY_SYMBOL}
                        </span>
                        <Input
                          type="number"
                          placeholder="0.00"
                          min="0"
                          className="pl-10 h-11"
                          {...field}
                          value={field.value ?? ''}
                        />
                      </div>
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              {/* Trip Bonus & Overtime */}
              <div className="grid grid-cols-2 gap-4">
                <FormField
                  control={form.control}
                  name="tripBonus"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel className="text-sm font-medium">Trip Bonus</FormLabel>
                      <FormControl>
                        <div className="relative">
                          <span className="absolute left-3.5 top-1/2 -translate-y-1/2 text-sm font-medium text-muted-foreground">
                            {CURRENCY_SYMBOL}
                          </span>
                          <Input
                            type="number"
                            placeholder="0.00"
                            min="0"
                            className="pl-10 h-11"
                            {...field}
                            value={field.value ?? ''}
                          />
                        </div>
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="overtimePay"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel className="text-sm font-medium">Overtime Pay</FormLabel>
                      <FormControl>
                        <div className="relative">
                          <span className="absolute left-3.5 top-1/2 -translate-y-1/2 text-sm font-medium text-muted-foreground">
                            {CURRENCY_SYMBOL}
                          </span>
                          <Input
                            type="number"
                            placeholder="0.00"
                            min="0"
                            className="pl-10 h-11"
                            {...field}
                            value={field.value ?? ''}
                          />
                        </div>
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>

              {/* Deductions */}
              <FormField
                control={form.control}
                name="deductions"
                render={({ field }) => (
                  <FormItem className="mt-4">
                    <FormLabel className="text-sm font-medium">Deductions</FormLabel>
                    <FormControl>
                      <div className="relative">
                        <span className="absolute left-3.5 top-1/2 -translate-y-1/2 text-sm font-medium text-muted-foreground">
                          {CURRENCY_SYMBOL}
                        </span>
                        <Input
                          type="number"
                          placeholder="0.00"
                          min="0"
                          className="pl-10 h-11"
                          {...field}
                          value={field.value ?? ''}
                        />
                      </div>
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </section>

            {/* Net Pay Summary Card */}
            <div className="rounded-xl border-2 border-primary/15 bg-gradient-to-br from-primary/5 to-primary/[0.02] p-5 space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-sm font-semibold text-foreground">Net Pay</span>
                <span className="text-2xl font-bold text-amber-600 tracking-tight">
                  {CURRENCY_SYMBOL}{netPay.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                </span>
              </div>
              <Separator />
              <div className="grid grid-cols-2 gap-y-2 gap-x-4 text-sm">
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Base</span>
                  <span className="font-medium">{CURRENCY_SYMBOL}{(Number(watchBaseSalary) || 0).toLocaleString()}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Bonus</span>
                  <span className="font-medium text-emerald-600">+{CURRENCY_SYMBOL}{(Number(watchTripBonus) || 0).toLocaleString()}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Overtime</span>
                  <span className="font-medium text-emerald-600">+{CURRENCY_SYMBOL}{(Number(watchOvertimePay) || 0).toLocaleString()}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Deductions</span>
                  <span className="font-medium text-red-500">-{CURRENCY_SYMBOL}{(Number(watchDeductions) || 0).toLocaleString()}</span>
                </div>
              </div>
            </div>

            <Separator />

            {/* Section: Notes */}
            <section>
              <SectionHeader icon={FileText} title="Notes" />

              <FormField
                control={form.control}
                name="notes"
                render={({ field }) => (
                  <FormItem>
                    <FormControl>
                      <Textarea
                        placeholder="Additional notes about this payroll entry..."
                        rows={3}
                        className="resize-none"
                        {...field}
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </section>

            {/* Hidden submit */}
            <button type="submit" className="sr-only" aria-hidden="true">
              Submit
            </button>
          </form>
        </Form>

        {/* Footer */}
        <SheetFooter className="px-6 sm:px-8 py-5 pb-8 flex-row gap-3 border-t bg-background">
          <Button
            type="button"
            variant="outline"
            className="flex-1 h-11"
            onClick={() => onOpenChange(false)}
            disabled={submitting}
          >
            Cancel
          </Button>
          <Button
            type="button"
            className="flex-1 h-11 bg-amber-500 hover:bg-amber-600 text-white text-sm font-semibold"
            disabled={submitting}
            onClick={() => form.handleSubmit(onSubmit)()}
          >
            {submitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            {isEditing ? 'Save Changes' : 'Create Payroll'}
          </Button>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  )
}
