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
import { SearchableSelect } from '@/components/ui/searchable-select'
import { GHANA_LOCATIONS, CURRENCY_SYMBOL } from '@/lib/constants'
import { type PricingEntry } from '@/lib/api'
import { toast } from 'sonner'

const COMMON_ITEMS = [
  '50kg Cement',
  '32.5 Cement',
  '42.5 Grade Cement',
  'Iron Rods 12mm',
  'Iron Rods 16mm',
  'Iron Rods 20mm',
  'Flour',
  'Rice',
  'Sugar',
  'Salt',
]

const pricingSchema = z.object({
  itemName: z.string().min(1, 'Item name is required'),
  destination: z.string().min(1, 'Destination is required'),
  transportRate: z.coerce.number().min(0, 'Transport rate must be 0 or more'),
})

type PricingFormData = z.infer<typeof pricingSchema>

interface PricingFormDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  pricing?: PricingEntry
  onCreated?: () => void
  onUpdated?: () => void
}

export function PricingFormDialog({
  open,
  onOpenChange,
  pricing,
  onCreated,
  onUpdated,
}: PricingFormDialogProps) {
  const [submitting, setSubmitting] = React.useState(false)

  const form = useForm<PricingFormData>({
    resolver: zodResolver(pricingSchema),
    defaultValues: {
      itemName: '',
      destination: '',
      transportRate: '' as unknown as number,
    },
  })

  // Populate form when editing
  React.useEffect(() => {
    if (pricing) {
      form.reset({
        itemName: pricing.itemName,
        destination: pricing.destination,
        transportRate: pricing.transportRate,
      })
    } else {
      form.reset({
        itemName: '',
        destination: '',
        transportRate: '' as unknown as number,
      })
    }
  }, [pricing, form, open])

  async function onSubmit(data: PricingFormData) {
    setSubmitting(true)
    try {
      const payload: Record<string, unknown> = {
        itemName: data.itemName,
        destination: data.destination,
        transportRate: data.transportRate,
      }

      if (pricing) {
        await fetch(`/api/pricing/${pricing.id}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        })
        toast.success('Pricing entry updated successfully')
        onUpdated?.()
      } else {
        await fetch('/api/pricing', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        })
        toast.success('Pricing entry created successfully')
        onCreated?.()
      }
      onOpenChange(false)
    } catch {
      toast.error(pricing ? 'Failed to update pricing' : 'Failed to create pricing')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-xl">
        <DialogHeader>
          <DialogTitle>
            {pricing ? 'Edit Pricing Entry' : 'Add Pricing Entry'}
          </DialogTitle>
          <DialogDescription>
            {pricing
              ? 'Update the transport rate for this pricing entry.'
              : 'Set the transport rate for a new pricing entry.'}
          </DialogDescription>
        </DialogHeader>

        <DialogBody>
        <Form {...form}>
          <form id="pricing-form" onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
            {/* Item Name */}
            <FormField
              control={form.control}
              name="itemName"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Item Name *</FormLabel>
                  <SearchableSelect
                    options={COMMON_ITEMS.map(item => ({ value: item, label: item }))}
                    value={field.value}
                    onValueChange={field.onChange}
                    placeholder="Select or type item name"
                  />
                  <FormMessage />
                </FormItem>
              )}
            />

            {/* Destination */}
            <FormField
              control={form.control}
              name="destination"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Destination *</FormLabel>
                  <SearchableSelect
                    options={GHANA_LOCATIONS.map(loc => ({ value: loc, label: loc }))}
                    value={field.value}
                    onValueChange={field.onChange}
                    placeholder="Select destination"
                  />
                  <FormMessage />
                </FormItem>
              )}
            />

            {/* Transport Rate */}
            <FormField
              control={form.control}
              name="transportRate"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Transport Rate *</FormLabel>
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
            form="pricing-form"
            className="bg-amber-500 hover:bg-amber-600 text-white"
            disabled={submitting}
          >
            {submitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            {pricing ? 'Update Pricing' : 'Create Pricing'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
