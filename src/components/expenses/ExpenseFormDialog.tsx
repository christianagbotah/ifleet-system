'use client'

import * as React from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { Loader2, Camera } from 'lucide-react'
import {
  Dialog,
  DialogBody,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { DatePicker } from '@/components/ui/date-picker'
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from '@/components/ui/form'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { SearchableSelect } from '@/components/ui/searchable-select'
import { EXPENSE_CATEGORIES, PAYMENT_METHODS, CURRENCY_SYMBOL } from '@/lib/constants'
import { fetchTrucks, type Truck, type Expense } from '@/lib/api'
import { useAuthStore } from '@/lib/store/auth'
import { toast } from 'sonner'
import { ReceiptScanner, type ScannedReceiptData } from '@/components/scanner/ReceiptScanner'

const expenseFormSchema = z.object({
  truckId: z.string().min(1, 'Truck is required'),
  category: z.string().min(1, 'Category is required'),
  description: z.string().min(1, 'Description is required'),
  amount: z.coerce.number().min(0.01, 'Amount must be greater than 0'),
  date: z.string().min(1, 'Date is required'),
  paymentMethod: z.string().default('cash'),
  reference: z.string().optional(),
})

type ExpenseFormValues = z.infer<typeof expenseFormSchema>

interface ExpenseFormDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  expense?: Expense | null
  onCreated?: () => void
  onUpdated?: () => void
}

export function ExpenseFormDialog({
  open,
  onOpenChange,
  expense,
  onCreated,
  onUpdated,
}: ExpenseFormDialogProps) {
  const [submitting, setSubmitting] = React.useState(false)
  const [trucks, setTrucks] = React.useState<Truck[]>([])
  const [loadingTrucks, setLoadingTrucks] = React.useState(false)
  const [scannerOpen, setScannerOpen] = React.useState(false)

  const form = useForm<ExpenseFormValues>({
    resolver: zodResolver(expenseFormSchema),
    defaultValues: {
      truckId: '',
      category: '',
      description: '',
      amount: '' as unknown as number,
      date: '',
      paymentMethod: 'cash',
      reference: '',
    },
  })

  React.useEffect(() => {
    if (open) {
      if (expense) {
        form.reset({
          truckId: expense.truckId,
          category: expense.category,
          description: expense.description,
          amount: expense.amount,
          date: expense.date ? expense.date.split('T')[0] : '',
          paymentMethod: expense.paymentMethod,
          reference: expense.reference || '',
        })
      } else {
        form.reset({
          truckId: '',
          category: '',
          description: '',
          amount: '' as unknown as number,
          date: new Date().toISOString().split('T')[0],
          paymentMethod: 'cash',
          reference: '',
        })
      }

      const { user } = useAuthStore.getState()
      const driverId = user?.role === 'Driver' && user.driverId ? user.driverId : undefined
      setLoadingTrucks(true)
      fetchTrucks({ status: 'active', limit: 100, driverId })
        .then((result) => setTrucks(result.data))
        .catch(() => toast.error('Failed to load trucks'))
        .finally(() => setLoadingTrucks(false))
    }
  }, [expense, form, open])

  function handleScanComplete(data: ScannedReceiptData) {
    const updates: Partial<ExpenseFormValues> = {}
    if (data.totalAmount != null) updates.amount = data.totalAmount
    if (data.date) updates.date = data.date
    if (data.description) updates.description = data.description
    if (data.category) updates.category = data.category
    if (data.reference) updates.reference = data.reference
    if (data.paymentMethod) updates.paymentMethod = data.paymentMethod
    if (data.merchant && !data.description) updates.description = data.merchant
    // Apply updates to form
    Object.entries(updates).forEach(([key, value]) => {
      if (value !== undefined && value !== null) {
        form.setValue(key as keyof ExpenseFormValues, value as never, { shouldValidate: true })
      }
    })
    toast.success('Receipt scanned! Review the auto-filled data.')
  }

  async function onSubmit(data: ExpenseFormValues) {
    setSubmitting(true)
    try {
      const body: Record<string, unknown> = { ...data }
      if (!body.reference) delete body.reference

      if (expense) {
        const res = await fetch(`/api/expenses/${expense.id}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(body),
        })
        if (!res.ok) {
          const err = await res.json().catch(() => ({ error: 'Update failed' }))
          throw new Error(err.error || 'Failed to update expense')
        }
        toast.success('Expense updated successfully')
        onUpdated?.()
      } else {
        const res = await fetch('/api/expenses', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(body),
        })
        if (!res.ok) {
          const err = await res.json().catch(() => ({ error: 'Create failed' }))
          throw new Error(err.error || 'Failed to create expense')
        }
        toast.success('Expense added successfully', {
          description: `${CURRENCY_SYMBOL}${data.amount.toLocaleString()} - ${data.description}`,
        })
        onCreated?.()
      }
      onOpenChange(false)
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'An error occurred')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-xl">
        <DialogHeader>
          <div className="flex items-center justify-between">
            <div>
              <DialogTitle>{expense ? 'Edit Expense' : 'Add New Expense'}</DialogTitle>
              <DialogDescription>
                {expense
                  ? 'Update the expense details below.'
                  : 'Record a new fleet expense.'}
              </DialogDescription>
            </div>
            {!expense && (
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="flex-shrink-0"
                onClick={() => setScannerOpen(true)}
              >
                <Camera className="h-4 w-4 mr-1.5" />
                Scan Receipt
              </Button>
            )}
          </div>
        </DialogHeader>

        <DialogBody>
        <Form {...form}>
          <form id="expense-form" onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
            {/* Truck */}
            <FormField
              control={form.control}
              name="truckId"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Truck *</FormLabel>
                  <SearchableSelect
                    options={trucks.map(t => ({ value: t.id, label: `${t.plateNumber} (${t.make} ${t.model})` }))}
                    value={field.value}
                    onValueChange={field.onChange}
                    placeholder={loadingTrucks ? 'Loading...' : 'Select truck'}
                    disabled={loadingTrucks}
                  />
                  <FormMessage />
                </FormItem>
              )}
            />

            {/* Category & Date */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <FormField
                control={form.control}
                name="category"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Category *</FormLabel>
                    <Select onValueChange={field.onChange} value={field.value}>
                      <FormControl>
                        <SelectTrigger>
                          <SelectValue placeholder="Select category" />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        {EXPENSE_CATEGORIES.map((cat) => (
                          <SelectItem key={cat.value} value={cat.value}>
                            {cat.icon} {cat.label}
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
                name="date"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Date *</FormLabel>
                    <FormControl>
                      <DatePicker value={field.value} onChange={(val) => field.onChange(val)} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>

            {/* Description */}
            <FormField
              control={form.control}
              name="description"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Description *</FormLabel>
                  <FormControl>
                    <Input
                      placeholder="e.g., Diesel refill - Kumasi route"
                      {...field}
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            {/* Amount & Payment Method */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <FormField
                control={form.control}
                name="amount"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Amount *</FormLabel>
                    <FormControl>
                      <div className="relative">
                        <span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm text-muted-foreground">
                          {CURRENCY_SYMBOL}
                        </span>
                        <Input
                          type="number"
                          step="0.01"
                          min="0"
                          placeholder="0.00"
                          className="pl-10"
                          {...field}
                        />
                      </div>
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="paymentMethod"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Payment Method *</FormLabel>
                    <Select onValueChange={field.onChange} value={field.value}>
                      <FormControl>
                        <SelectTrigger>
                          <SelectValue placeholder="Select method" />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        {PAYMENT_METHODS.map((method) => (
                          <SelectItem key={method.value} value={method.value}>
                            {method.label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>

            {/* Reference */}
            <FormField
              control={form.control}
              name="reference"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Reference / Receipt #</FormLabel>
                  <FormControl>
                    <Input placeholder="Optional receipt or reference number" {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

          </form>
        </Form>
        </DialogBody>
        <DialogFooter className="gap-2 sm:gap-0">
          <Button
            type="button"
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={submitting}
          >
            Cancel
          </Button>
          <Button
            type="submit"
            form="expense-form"
            className="bg-amber-500 hover:bg-amber-600 text-white"
            disabled={submitting}
          >
            {submitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            {submitting
              ? 'Saving...'
              : expense
                ? 'Update Expense'
                : 'Add Expense'}
          </Button>
        </DialogFooter>
      </DialogContent>

      {/* Receipt Scanner */}
      {!expense && (
        <ReceiptScanner
          open={scannerOpen}
          onOpenChange={setScannerOpen}
          scanType="expense"
          onScanComplete={handleScanComplete}
        />
      )}
    </Dialog>
  )
}
