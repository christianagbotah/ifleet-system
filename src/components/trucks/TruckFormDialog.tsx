'use client'

import * as React from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
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
import { TRUCK_MAKES, FUEL_TYPES } from '@/lib/constants'
import { createTruck, updateTruck } from '@/lib/api'
import { toast } from 'sonner'

const truckFormSchema = z.object({
  plateNumber: z.string().min(2, 'Plate number is required'),
  make: z.string().min(1, 'Make is required'),
  model: z.string().min(1, 'Model is required'),
  year: z.coerce.number().min(2000).max(2030),
  vinNumber: z.string().optional(),
  engineNumber: z.string().optional(),
  chassisNumber: z.string().optional(),
  fuelType: z.string().default('Diesel'),
  tankCapacity: z.coerce.number().optional(),
  status: z.string().default('active'),
})

type TruckFormValues = z.infer<typeof truckFormSchema>

interface TruckFormDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  onCreated?: () => void
  onUpdated?: () => void
  truck?: {
    id: string
    plateNumber: string
    make: string
    model: string
    year: number
    vinNumber?: string
    engineNumber?: string
    chassisNumber?: string
    fuelType: string
    tankCapacity?: number
    status: string
  } | null
}

export function TruckFormDialog({ open, onOpenChange, onCreated, onUpdated, truck }: TruckFormDialogProps) {
  const [submitting, setSubmitting] = React.useState(false)

  const normalizedTruck = truck ? {
    ...truck,
    vinNumber: truck.vinNumber ?? '',
    engineNumber: truck.engineNumber ?? '',
    chassisNumber: truck.chassisNumber ?? '',
  } : null

  const form = useForm<TruckFormValues>({
    resolver: zodResolver(truckFormSchema),
    defaultValues: normalizedTruck || {
      plateNumber: '',
      make: '',
      model: '',
      year: new Date().getFullYear(),
      vinNumber: '',
      engineNumber: '',
      chassisNumber: '',
      fuelType: 'Diesel',
      tankCapacity: '' as unknown as number,
      status: 'active',
    },
  })

  React.useEffect(() => {
    if (open) {
      if (truck) {
        form.reset(normalizedTruck)
      } else {
        form.reset({
          plateNumber: '',
          make: '',
          model: '',
          year: new Date().getFullYear(),
          vinNumber: '',
          engineNumber: '',
          chassisNumber: '',
          fuelType: 'Diesel',
          tankCapacity: '' as unknown as number,
          status: 'active',
        })
      }
    }
  }, [truck, form, open])

  async function onSubmit(data: TruckFormValues) {
    setSubmitting(true)
    try {
      const body = { ...data }
      // Remove empty strings
      if (!body.vinNumber) delete body.vinNumber
      if (!body.engineNumber) delete body.engineNumber
      if (!body.chassisNumber) delete body.chassisNumber

      if (truck) {
        await updateTruck(truck.id, body)
        toast.success('Truck updated successfully', {
          description: `${data.make} ${data.model} (${data.plateNumber})`,
        })
        onOpenChange(false)
        onUpdated?.()
      } else {
        await createTruck(body)
        toast.success('Truck added successfully', {
          description: `${data.make} ${data.model} (${data.plateNumber})`,
        })
        onOpenChange(false)
        onCreated?.()
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : truck ? 'Failed to update truck' : 'Failed to create truck')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-xl">
        <DialogHeader>
          <DialogTitle>{truck ? 'Edit Truck' : 'Add New Truck'}</DialogTitle>
          <DialogDescription>
            {truck ? 'Update truck information below.' : 'Fill in the details to register a new truck.'}
          </DialogDescription>
        </DialogHeader>

        <DialogBody>
        <Form {...form}>
          <form id="truck-form" onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <FormField
                control={form.control}
                name="plateNumber"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Plate Number *</FormLabel>
                    <FormControl>
                      <Input placeholder="GT-4521-A" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="make"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Make *</FormLabel>
                    <Select onValueChange={field.onChange} value={field.value}>
                      <FormControl>
                        <SelectTrigger>
                          <SelectValue placeholder="Select make" />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        {TRUCK_MAKES.map((make) => (
                          <SelectItem key={make} value={make}>{make}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <FormField
                control={form.control}
                name="model"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Model *</FormLabel>
                    <FormControl>
                      <Input placeholder="Actros" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="year"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Year *</FormLabel>
                    <FormControl>
                      <Input type="number" min={2000} max={2030} {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <FormField
                control={form.control}
                name="vinNumber"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>VIN Number</FormLabel>
                    <FormControl>
                      <Input placeholder="Vehicle Identification Number" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="engineNumber"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Engine Number</FormLabel>
                    <FormControl>
                      <Input placeholder="Engine serial number" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              <FormField
                control={form.control}
                name="fuelType"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Fuel Type</FormLabel>
                    <Select onValueChange={field.onChange} value={field.value}>
                      <FormControl>
                        <SelectTrigger>
                          <SelectValue />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        {FUEL_TYPES.map((type) => (
                          <SelectItem key={type} value={type}>{type}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="tankCapacity"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Tank Capacity (L)</FormLabel>
                    <FormControl>
                      <Input type="number" placeholder="400" {...field} value={field.value ?? ''} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="status"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Status</FormLabel>
                    <Select onValueChange={field.onChange} value={field.value}>
                      <FormControl>
                        <SelectTrigger>
                          <SelectValue />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        <SelectItem value="active">Active</SelectItem>
                        <SelectItem value="inactive">Inactive</SelectItem>
                        <SelectItem value="maintenance">Maintenance</SelectItem>
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>

          </form>
        </Form>
        </DialogBody>
        <DialogFooter className="gap-2 sm:gap-0">
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)} disabled={submitting}>
            Cancel
          </Button>
          <Button type="submit" form="truck-form" className="bg-amber-500 hover:bg-amber-600 text-white" disabled={submitting}>
            {submitting ? 'Saving...' : truck ? 'Update Truck' : 'Add Truck'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
