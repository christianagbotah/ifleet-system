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
import { fetchDrivers, updateTruck } from '@/lib/api'
import { loadDriverAssignmentOptions, type DriverAssignmentOption } from '@/lib/auth/driver-assignment-options'
import { useAuthStore } from '@/lib/store/auth'
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
  const [drivers, setDrivers] = React.useState<DriverAssignmentOption[]>([])
  const { user } = useAuthStore()
  const [selectedDriverId, setSelectedDriverId] = React.useState<string>('')
  const [loading, setLoading] = React.useState(false)
  const [submitting, setSubmitting] = React.useState(false)

  React.useEffect(() => {
    if (open && truckId) {
      setLoading(true)
      setSelectedDriverId(user?.isDemo ? 'none' : (currentDriverId || 'none'))

      loadDriverAssignmentOptions(
        user?.isDemo === true,
        async () => (await fetchDrivers({ status: 'active', limit: 100 })).data,
      )
        .then(setDrivers)
        .catch((error) => {
          toast.error(error instanceof Error ? error.message : 'Failed to load drivers')
        })
        .finally(() => setLoading(false))
    }
  }, [open, truckId, currentDriverId, user?.isDemo])

  async function onSubmit() {
    if (!truckId) return
    if (user?.isDemo) {
      toast.info('Demo mode is read-only. Driver assignment changes are disabled.')
      return
    }
    setSubmitting(true)
    try {
      const driverId = selectedDriverId === 'none' ? null : selectedDriverId
      await updateTruck(truckId, { driverId })

      if (driverId) {
        const driver = drivers.find((d) => d.id === driverId)
        toast.success(`Driver assigned to ${truckPlateNumber}`, {
          description: driver?.label,
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
          {user?.isDemo && (
            <div className="rounded-xl border border-amber-500/25 bg-amber-500/10 px-3 py-2.5 text-sm">
              <div className="font-semibold text-amber-700 dark:text-amber-300">Demo Mode · Read Only</div>
              <div className="mt-0.5 text-muted-foreground">Synthetic drivers are shown for workflow preview. Real employee records remain protected.</div>
            </div>
          )}

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
                  ...drivers.map(d => ({ value: d.id, label: d.label, description: d.description }))
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
            disabled={submitting || loading || user?.isDemo}
            onClick={onSubmit}
          >
            {user?.isDemo ? 'Demo · Read Only' : submitting ? 'Saving...' : 'Assign Driver'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
