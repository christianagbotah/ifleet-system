import { apiFetch } from '@/lib/api'
import { getDefaultNextStatus, type TripStatusValue } from '@/lib/domain/dispatch/trip-state-machine'

export async function advanceTripLifecycle<T extends { status: string }>(tripId: string, currentStatus: string): Promise<T> {
  const next = getDefaultNextStatus(currentStatus as TripStatusValue)
  if (!next) throw new Error(`Trip in ${currentStatus} requires an explicit transition`)
  return apiFetch<T>(`/api/trips/${tripId}/transition`, {
    method: 'POST',
    body: JSON.stringify({ to: next }),
  })
}

export async function transitionTripLifecycle<T extends { status: string }>(tripId: string, to: TripStatusValue, payload: Record<string, unknown> = {}): Promise<T> {
  return apiFetch<T>(`/api/trips/${tripId}/transition`, {
    method: 'POST',
    body: JSON.stringify({ ...payload, to }),
  })
}
