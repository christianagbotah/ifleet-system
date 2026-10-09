import { db } from '@/lib/db'

export interface DeliveryReadinessResult {
  passed: boolean
  requiredTargets: number
  completedTargets: number
  missingTargetIds: string[]
}

export async function evaluateTripDeliveryReadiness(tripId: string): Promise<DeliveryReadinessResult> {
  const trip = await db.trip.findUnique({
    where: { id: tripId },
    select: {
      id: true,
      TripDeliveryDestination: { select: { id: true } },
      deliveryStops: { select: { id: true } },
    },
  })

  if (!trip) return { passed: false, requiredTargets: 0, completedTargets: 0, missingTargetIds: ['trip-not-found'] }

  if (trip.TripDeliveryDestination.length > 0) {
    const required = trip.TripDeliveryDestination.map((target) => target.id)
    const proofs = await db.proofOfDelivery.findMany({
      where: { tripId, deliveryDestinationId: { in: required } },
      select: { deliveryDestinationId: true },
      orderBy: { createdAt: 'desc' },
    })
    const completed = new Set(proofs.map((proof) => proof.deliveryDestinationId).filter((value): value is string => Boolean(value)))
    const missing = required.filter((id) => !completed.has(id))
    return { passed: missing.length === 0, requiredTargets: required.length, completedTargets: required.length - missing.length, missingTargetIds: missing }
  }

  if (trip.deliveryStops.length > 0) {
    const required = trip.deliveryStops.map((target) => target.id)
    const proofs = await db.proofOfDelivery.findMany({
      where: { tripId, deliveryStopId: { in: required } },
      select: { deliveryStopId: true },
      orderBy: { createdAt: 'desc' },
    })
    const completed = new Set(proofs.map((proof) => proof.deliveryStopId).filter((value): value is string => Boolean(value)))
    const missing = required.filter((id) => !completed.has(id))
    return { passed: missing.length === 0, requiredTargets: required.length, completedTargets: required.length - missing.length, missingTargetIds: missing }
  }

  const proof = await db.proofOfDelivery.findFirst({
    where: { tripId, deliveryStopId: null, deliveryDestinationId: null },
    select: { id: true },
    orderBy: { createdAt: 'desc' },
  })
  return { passed: Boolean(proof), requiredTargets: 1, completedTargets: proof ? 1 : 0, missingTargetIds: proof ? [] : ['trip'] }
}
