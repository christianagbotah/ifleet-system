'use client'

import * as React from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { Loader2 } from 'lucide-react'
import {
  Dialog,
  DialogBody,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog'
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
import { DatePicker } from '@/components/ui/date-picker'
import { Textarea } from '@/components/ui/textarea'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { SearchableSelect } from '@/components/ui/searchable-select'
import { MAINTENANCE_TYPES, CURRENCY_SYMBOL } from '@/lib/constants'
import { type MaintenanceRecord, type Truck, fetchTrucks } from '@/lib/api'
import { useAuthStore } from '@/lib/store/auth'
import { toast } from 'sonner'

const maintenanceSchema = z.object({
  truckId: z.string().min(1, 'Truck is required'),
  type: z.enum(['routine', 'repair', 'emergency', 'inspection'], {
    required_error: 'Type is required',
  }),
  title: z.string().min(1, 'Title is required'),
  description: z.string().optional(),
  odometer: z.coerce.number().positive().optional().or(z.nan()),
  cost: z.coerce.number().min(0).optional().or(z.nan()),
  performedBy: z.string().optional(),
  performedAt: z.string().min(1, 'Performed date is required'),
  nextDueDate: z.string().optional(),
  status: z.enum(['pending', 'in_progress', 'completed'], {
    required_error: 'Status is required',
  }),
})

type MaintenanceFormData = z.infer<typeof maintenanceSchema>

interface MaintenanceFormDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  record?: MaintenanceRecord
  onCreated?: () => void
  onUpdated?: () => void
}

export function MaintenanceFormDialog({
  open,
  onOpenChange,
  record,
  onCreated,
  onUpdated,
}: MaintenanceFormDialogProps) {
  const [submitting, setSubmitting] = React.useState(false)
  const [trucks, setTrucks] = React.useState<Truck[]>([])
  const [trucksLoading, setTrucksLoading] = React.useState(false)

  const form = useForm<MaintenanceFormData>({
    resolver: zodResolver(maintenanceSchema),
    defaultValues: {
      truckId: '',
      type: 'routine',
      title: '',
      description: '',
      odometer: '' as unknown as number,
      cost: '' as unknown as number,
      performedBy: '',
      performedAt: '',
      nextDueDate: '',
      status: 'pending',
    },
  })

  // Load trucks on mount (filtered by driver if applicable)
  React.useEffect(() => {
    if (open) {
      const { user } = useAuthStore.getState()
      const driverId = user?.role === 'Driver' && user.driverId ? user.driverId : undefined
      setTrucksLoading(true)
      fetchTrucks({ limit: 100, status: 'active', driverId })
        .then((res) => setTrucks(res.data))
        .catch(() => toast.error('Failed to load trucks'))
        .finally(() => setTrucksLoading(false))
    }
  }, [open])

  // Populate form when editing
  React.useEffect(() => {
    if (record) {
      form.reset({
        truckId: record.truckId,
        type: record.type as 'routine' | 'repair' | 'emergency' | 'inspection',
        title: record.title,
        description: record.description || '',
        odometer: record.odometer ?? ('' as unknown as number),
        cost: record.cost ?? ('' as unknown as number),
        performedBy: record.performedBy || '',
        performedAt: record.performedAt?.split('T')[0] || '',
        nextDueDate: record.nextDueDate?.split('T')[0] || '',
        status: record.status as 'pending' | 'in_progress' | 'completed',
      })
    } else {
      form.reset({
        truckId: '',
        type: 'routine',
        title: '',
        description: '',
        odometer: '' as unknown as number,
        cost: '' as unknown as number,
        performedBy: '',
        performedAt: new Date().toISOString().split('T')[0],
        nextDueDate: '',
        status: 'pending',
      })
    }
  }, [record, form, open])

  async function onSubmit(data: MaintenanceFormData) {
    setSubmitting(true)
    try {
      const payload: Record<string, unknown> = {
        truckId: data.truckId,
        type: data.type,
        title: data.title,
        description: data.description || null,
        odometer: data.odometer && !isNaN(data.odometer) ? data.odometer : null,
        cost: data.cost && !isNaN(data.cost) ? data.cost : null,
        performedBy: data.performedBy || null,
        performedAt: data.performedAt,
        nextDueDate: data.nextDueDate || null,
        status: data.status,
      }

      if (record) {
        await fetch(`/api/maintenance/${record.id}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        })
        toast.success('Maintenance record updated successfully')
        onUpdated?.()
      } else {
        await fetch('/api/maintenance', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        })
        toast.success('Maintenance record created successfully')
        onCreated?.()
      }
      onOpenChange(false)
    } catch {
      toast.error(record ? 'Failed to update record' : 'Failed to create record')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-xl">
        <DialogHeader>
          <DialogTitle>
            {record ? 'Edit Maintenance Record' : 'Add Maintenance Record'}
          </DialogTitle>
          <DialogDescription>
            {record
              ? 'Update the details of this maintenance record.'
              : 'Fill in the details to create a new maintenance record.'}
          </DialogDescription>
        </DialogHeader>

        <DialogBody>
        <Form {...form}>
          <form id="maintenance-form" onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
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
                    placeholder={trucksLoading ? 'Loading...' : 'Select a truck'}
                    disabled={trucksLoading}
                  />
                  <FormMessage />
                </FormItem>
              )}
            />

            {/* Type & Status */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <FormField
                control={form.control}
                name="type"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Type *</FormLabel>
                    <Select value={field.value} onValueChange={field.onChange}>
                      <FormControl>
                        <SelectTrigger className="w-full">
                          <SelectValue placeholder="Select type" />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        {Object.entries(MAINTENANCE_TYPES).map(([key, val]) => (
                          <SelectItem key={key} value={key}>
                            {val.label}
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
                name="status"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Status *</FormLabel>
                    <Select value={field.value} onValueChange={field.onChange}>
                      <FormControl>
                        <SelectTrigger className="w-full">
                          <SelectValue placeholder="Select status" />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        <SelectItem value="pending">Pending</SelectItem>
                        <SelectItem value="in_progress">In Progress</SelectItem>
                        <SelectItem value="completed">Completed</SelectItem>
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>

            {/* Title */}
            <FormField
              control={form.control}
              name="title"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Title *</FormLabel>
                  <FormControl>
                    <Input placeholder="e.g. Oil change, Brake replacement" {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            {/* Description */}
            <FormField
              control={form.control}
              name="description"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Description</FormLabel>
                  <FormControl>
                    <Textarea
                      placeholder="Details about the maintenance work..."
                      rows={3}
                      {...field}
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            {/* Odometer & Cost */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <FormField
                control={form.control}
                name="odometer"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Odometer (km)</FormLabel>
                    <FormControl>
                      <Input
                        type="number"
                        placeholder="0"
                        min="0"
                        {...field}
                        value={field.value ?? ''}
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="cost"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Cost</FormLabel>
                    <FormControl>
                      <div className="relative">
                        <span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm text-muted-foreground">
                          {CURRENCY_SYMBOL}
                        </span>
                        <Input
                          type="number"
                          placeholder="0.00"
                          min="0"
                          className="pl-12"
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

            {/* Performed By & Performed Date */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <FormField
                control={form.control}
                name="performedBy"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Performed By</FormLabel>
                    <FormControl>
                      <Input placeholder="Mechanic or garage name" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="performedAt"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Performed Date *</FormLabel>
                    <FormControl>
                      <DatePicker value={field.value} onChange={(val) => field.onChange(val)} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>

            {/* Next Due Date */}
            <FormField
              control={form.control}
              name="nextDueDate"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Next Due Date</FormLabel>
                  <FormControl>
                    <DatePicker value={field.value} onChange={(val) => field.onChange(val)} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

          </form>
        </Form>
        </DialogBody>
        <DialogFooter className="pt-4">
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
            form="maintenance-form"
            className="bg-amber-500 hover:bg-amber-600 text-white"
            disabled={submitting}
          >
            {submitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            {record ? 'Update Record' : 'Create Record'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
