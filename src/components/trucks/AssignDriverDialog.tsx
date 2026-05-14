'use client'

import * as React from 'react'
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
import { SearchableSelect } from '@/components/ui/searchable-select'
import { Skeleton } from '@/components/ui/skeleton'
import { fetchDrivers, updateTruck, type Driver } from '@/lib/api'
import { toast } from 'sonner'
import { UserPlus } from 'lucide-react'

interface AssignDriverDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  truckId: string | null
  truckPlateNumber: string | null
  currentDriverId?: string | null
  onAssigned?: () => void
}

export function AssignDriverDialog({
  open,
  onOpenChange,
  truckId,
  truckPlateNumber,
  currentDriverId,
  onAssigned,
}: AssignDriverDialogProps) {
  const [drivers, setDrivers] = React.useState<Driver[]>([])
  const [selectedDriverId, setSelectedDriverId] = React.useState<string>('')
  const [loading, setLoading] = React.useState(false)
  const [submitting, setSubmitting] = React.useState(false)

  React.useEffect(() => {
    if (open && truckId) {
      setLoading(true)
      setSelectedDriverId(currentDriverId || 'none')

      fetchDrivers({ status: 'active', limit: 100 })
        .then((result) => {
          setDrivers(result.data)
        })
        .catch(() => {
          toast.error('Failed to load drivers')
        })
        .finally(() => setLoading(false))
    }
  }, [open, truckId, currentDriverId])

  async function onSubmit() {
    if (!truckId) return
    setSubmitting(true)
    try {
      const driverId = selectedDriverId === 'none' ? null : selectedDriverId
      await updateTruck(truckId, { driverId })

      if (driverId) {
        const driver = drivers.find((d) => d.id === driverId)
        toast.success(`Driver assigned to ${truckPlateNumber}`, {
          description: driver ? `${driver.firstName} ${driver.lastName}` : undefined,
        })
      } else {
        toast.success(`Driver removed from ${truckPlateNumber}`)
      }

      onOpenChange(false)
      onAssigned?.()
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to assign driver')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <UserPlus className="h-5 w-5 text-amber-500" />
            Assign Driver
          </DialogTitle>
          <DialogDescription>
            Assign or reassign a driver to truck{' '}
            <span className="font-semibold text-foreground">{truckPlateNumber}</span>.
          </DialogDescription>
        </DialogHeader>

        <DialogBody className="space-y-4 py-2">
          {loading ? (
            <div className="space-y-2">
              <Skeleton className="h-4 w-24" />
              <Skeleton className="h-10 w-full" />
            </div>
          ) : (
            <div className="space-y-2">
              <label className="text-sm font-medium">Driver</label>
              <SearchableSelect
                options={[
                  { value: 'none', label: 'Unassigned', description: 'Remove current driver' },
                  ...drivers.map(d => ({ value: d.id, label: `${d.firstName} ${d.lastName}`, description: d.phone }))
                ]}
                value={selectedDriverId}
                onValueChange={setSelectedDriverId}
                placeholder="Select a driver"
                disabled={loading}
              />
            </div>
          )}
        </DialogBody>

        <DialogFooter className="gap-2 sm:gap-0">
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)} disabled={submitting}>
            Cancel
          </Button>
          <Button
            type="button"
            className="bg-amber-500 hover:bg-amber-600 text-white"
            disabled={submitting || loading}
            onClick={onSubmit}
          >
            {submitting ? 'Saving...' : 'Assign Driver'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
