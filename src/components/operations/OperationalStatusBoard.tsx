import * as React from 'react'
import { GripVertical, Loader2 } from 'lucide-react'
import { toast } from 'sonner'

import { apiFetch } from '@/lib/api'
import { canTransition, type TripStatusValue } from '@/lib/domain/dispatch/trip-state-machine'
import { useAuthStore } from '@/lib/store/auth'
import { Badge } from '@/components/ui/badge'
import { StatusBadge } from '@/components/ui/status-badge'

export interface OperationalBoardTrip {
  id: string
  tripNumber: string
  status: string
  loadingLocation: string
  destination: string
  truck: { id: string; plateNumber: string }
  driver: { id: string; firstName: string; lastName: string }
}

const FLOW_STATUSES: TripStatusValue[] = [
  'scheduled',
  'assigned',
  'eligibility_check',
  'authorized_for_loading',
  'en_route_to_loading_point',
  'gate_in',
  'queued',
  'preload_weighing',
  'loading',
  'loaded',
  'postload_weighing',
  'awaiting_dispatch_clearance',
  'departed_loading_point',
  'in_transit',
  'arrived_destination',
  'offloading',
  'delivered',
  'return_journey',
  'arrived_base',
  'awaiting_reconciliation',
  'reconciled',
]

function label(status: string) {
  return status.replace(/_/g, ' ').replace(/\b\w/g, (letter) => letter.toUpperCase())
}

export function OperationalStatusBoard({
  trips,
  onChanged,
}: {
  trips: OperationalBoardTrip[]
  onChanged: () => Promise<void> | void
}) {
  const user = useAuthStore((state) => state.user)
  const canManage = user?.role === 'Admin' || user?.role === 'Manager'
  const [movingTripId, setMovingTripId] = React.useState<string | null>(null)
  const [draggedTripId, setDraggedTripId] = React.useState<string | null>(null)

  async function moveTrip(trip: OperationalBoardTrip, target: TripStatusValue) {
    const decision = canTransition(trip.status as TripStatusValue, target)
    if (!decision.allowed) {
      toast.error(decision.reason || `Cannot move ${trip.tripNumber} to ${label(target)}`)
      return
    }

    setMovingTripId(trip.id)
    try {
      await apiFetch(`/api/trips/${trip.id}/transition`, {
        method: 'POST',
        body: JSON.stringify({
          to: target,
          notes: 'Operations Center drag transition',
          metadata: { source: 'operations_status_board' },
        }),
      })
      toast.success(`${trip.tripNumber} moved to ${label(target)}`)
      await onChanged()
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Trip transition failed')
    } finally {
      setMovingTripId(null)
      setDraggedTripId(null)
    }
  }

  function onDrop(event: React.DragEvent<HTMLDivElement>, target: TripStatusValue) {
    event.preventDefault()
    if (!canManage) return
    const id = event.dataTransfer.getData('text/trip-id') || draggedTripId
    const trip = trips.find((candidate) => candidate.id === id)
    if (!trip || trip.status === target) return
    void moveTrip(trip, target)
  }

  const visibleStatuses = FLOW_STATUSES.filter((status) =>
    trips.some((trip) => trip.status === status)
    || trips.some((trip) => canTransition(trip.status as TripStatusValue, status).allowed),
  )

  return (
    <div className="rounded-2xl border bg-card">
      <div className="flex flex-col gap-2 border-b px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 className="text-sm font-semibold">Operational status board</h2>
          <p className="text-xs text-muted-foreground">
            {canManage ? 'Drag a trip only to an allowed next lifecycle state.' : 'Read-only lifecycle view. Admin or Manager access is required to move trips.'}
          </p>
        </div>
        <Badge variant={canManage ? 'secondary' : 'outline'}>{canManage ? 'Guarded drag enabled' : 'Read only'}</Badge>
      </div>

      <div className="overflow-x-auto p-3">
        <div className="flex min-w-max gap-3">
          {visibleStatuses.map((status) => {
            const stageTrips = trips.filter((trip) => trip.status === status)
            return (
              <div
                key={status}
                className="w-[250px] shrink-0 rounded-xl border bg-muted/20 p-2"
                onDragOver={(event) => { if (canManage) event.preventDefault() }}
                onDrop={(event) => onDrop(event, status)}
              >
                <div className="mb-2 flex items-center justify-between gap-2 px-1">
                  <StatusBadge status={status} variant="trip" />
                  <span className="text-xs font-bold tabular-nums text-muted-foreground">{stageTrips.length}</span>
                </div>
                <div className="space-y-2">
                  {stageTrips.map((trip) => (
                    <div
                      key={trip.id}
                      draggable={canManage && movingTripId !== trip.id}
                      onDragStart={(event) => {
                        if (!canManage) return
                        setDraggedTripId(trip.id)
                        event.dataTransfer.effectAllowed = 'move'
                        event.dataTransfer.setData('text/trip-id', trip.id)
                      }}
                      onDragEnd={() => setDraggedTripId(null)}
                      className={`rounded-lg border bg-background p-2.5 shadow-sm ${canManage ? 'cursor-grab active:cursor-grabbing' : ''}`}
                    >
                      <div className="flex items-start gap-2">
                        {movingTripId === trip.id
                          ? <Loader2 className="mt-0.5 h-3.5 w-3.5 shrink-0 animate-spin text-amber-600" />
                          : <GripVertical className="mt-0.5 h-3.5 w-3.5 shrink-0 text-muted-foreground/60" />}
                        <div className="min-w-0 flex-1">
                          <div className="truncate text-xs font-semibold">{trip.tripNumber}</div>
                          <div className="mt-1 truncate text-[11px] text-muted-foreground">{trip.truck.plateNumber} · {trip.driver.firstName} {trip.driver.lastName}</div>
                          <div className="mt-1 truncate text-[10px] text-muted-foreground/80">{trip.loadingLocation} → {trip.destination}</div>
                        </div>
                      </div>
                    </div>
                  ))}
                  {stageTrips.length === 0 && <div className="rounded-lg border border-dashed px-2 py-5 text-center text-[11px] text-muted-foreground">Drop allowed trips here</div>}
                </div>
              </div>
            )
          })}
        </div>
      </div>
    </div>
  )
}
