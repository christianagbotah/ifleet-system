import {
  canTransition,
  type TripStatusValue,
} from '@/lib/domain/dispatch/trip-state-machine'

export interface TransitionTripInput {
  tripId: string
  to: TripStatusValue
  actorId: string
  clientMutationId?: string | null
  notes?: string | null
  location?: string | null
  evidence?: Record<string, unknown> | null
  metadata?: Record<string, unknown> | null
}

export interface TransitionCommitInput extends TransitionTripInput {
  fromStatus: string
  toStatus: TripStatusValue
  driverId: string
}

export interface TransitionRepository {
  findEventByClientMutationId?(id: string): Promise<{
    trip: { id: string; status: string; [key: string]: unknown }
    event: { id: string; fromStatus: string | null; toStatus: string; [key: string]: unknown }
  } | null>
  getTrip(id: string): Promise<{ id: string; status: string; driverId: string } | null>
  commitTransition(input: TransitionCommitInput): Promise<{
    trip: { id: string; status: string; [key: string]: unknown }
    event: { id: string; fromStatus: string | null; toStatus: string; [key: string]: unknown }
  }>
}

export interface TripTransitionTimestamps {
  loadingStartedAt?: Date | null
  loadingCompletedAt?: Date | null
  offloadingStartedAt?: Date | null
  offloadingCompletedAt?: Date | null
  arrivalTime?: Date | null
}

export function buildTripTransitionUpdate(
  toStatus: TripStatusValue,
  current: TripTransitionTimestamps,
  now = new Date()
): Record<string, unknown> {
  const data: Record<string, unknown> = { status: toStatus }
  if (toStatus === 'loading' && !current.loadingStartedAt) data.loadingStartedAt = now
  if (toStatus === 'loaded' && !current.loadingCompletedAt) data.loadingCompletedAt = now
  if (toStatus === 'arrived_destination' && !current.arrivalTime) data.arrivalTime = now
  if (toStatus === 'offloading' && !current.offloadingStartedAt) data.offloadingStartedAt = now
  if (toStatus === 'delivered' && !current.offloadingCompletedAt) data.offloadingCompletedAt = now
  if (toStatus === 'completed' && !current.arrivalTime) data.arrivalTime = now
  return data
}

export class TripTransitionError extends Error {
  constructor(
    public code: 'NOT_FOUND' | 'INVALID_TRANSITION' | 'CONFLICT',
    message: string
  ) {
    super(message)
    this.name = 'TripTransitionError'
  }
}

async function createPrismaRepository(): Promise<TransitionRepository> {
  const { db } = await import('@/lib/db')
  return {
    async findEventByClientMutationId(id) {
      const event = await db.tripEvent.findUnique({
        where: { clientMutationId: id },
        include: { trip: true },
      })
      if (!event) return null
      return { trip: event.trip, event }
    },

    async getTrip(id) {
      return db.trip.findUnique({
        where: { id },
        select: { id: true, status: true, driverId: true },
      })
    },

    async commitTransition(input) {
      return db.$transaction(async (tx) => {
        const current = await tx.trip.findUnique({
          where: { id: input.tripId },
          select: {
            id: true,
            status: true,
            driverId: true,
            totalMileage: true,
            arrivalTime: true,
            loadingStartedAt: true,
            loadingCompletedAt: true,
            offloadingStartedAt: true,
            offloadingCompletedAt: true,
          },
        })
        if (!current) throw new TripTransitionError('NOT_FOUND', 'Trip not found')
        if (current.status !== input.fromStatus) {
          throw new TripTransitionError(
            'CONFLICT',
            `Trip status changed from ${input.fromStatus} to ${current.status}; reload before retrying`
          )
        }

        const trip = await tx.trip.update({
          where: { id: input.tripId },
          data: buildTripTransitionUpdate(input.toStatus, current) as never,
        })

        if (input.toStatus === 'completed') {
          await tx.driver.update({
            where: { id: input.driverId },
            data: {
              totalTrips: { increment: 1 },
              totalMileage: { increment: current.totalMileage ?? 0 },
            },
          })
        }

        const metadata = {
          ...(input.metadata ?? {}),
          ...(input.evidence ? { evidence: input.evidence } : {}),
        }
        const event = await tx.tripEvent.create({
          data: {
            clientMutationId: input.clientMutationId?.trim() || null,
            tripId: input.tripId,
            fromStatus: input.fromStatus,
            toStatus: input.toStatus,
            userId: input.actorId,
            notes: input.notes ?? null,
            location: input.location ?? null,
            metadata: Object.keys(metadata).length ? JSON.stringify(metadata) : null,
          },
        })

        return { trip, event }
      }, { isolationLevel: 'Serializable' })
    },
  }
}


export async function transitionTrip(
  input: TransitionTripInput,
  repository?: TransitionRepository
) {
  const activeRepository = repository ?? await createPrismaRepository()
  const mutationId = input.clientMutationId?.trim() || null
  if (mutationId && activeRepository.findEventByClientMutationId) {
    const existing = await activeRepository.findEventByClientMutationId(mutationId)
    if (existing) {
      if (existing.trip.id !== input.tripId) {
        throw new TripTransitionError('CONFLICT', 'clientMutationId was already used for another trip')
      }
      return { ...existing, replayed: true }
    }
  }

  const trip = await activeRepository.getTrip(input.tripId)
  if (!trip) throw new TripTransitionError('NOT_FOUND', 'Trip not found')

  const decision = canTransition(trip.status as TripStatusValue, input.to)
  if (!decision.allowed) {
    throw new TripTransitionError(
      'INVALID_TRANSITION',
      decision.reason ?? `Transition from ${trip.status} to ${input.to} is not allowed`
    )
  }

  const committed = await activeRepository.commitTransition({
    ...input,
    clientMutationId: mutationId,
    fromStatus: trip.status,
    toStatus: decision.canonicalTo,
    driverId: trip.driverId,
  })
  return { ...committed, replayed: false }
}
