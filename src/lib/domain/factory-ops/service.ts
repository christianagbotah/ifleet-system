import { recordGateEvent, type GateDirection } from '@/lib/domain/factory-ops/gate'
import {
  advanceQueue,
  calculateDetentionMinutes,
  type QueueAction,
  type QueueStatus,
} from '@/lib/domain/factory-ops/queue'

export interface PersistedGateEvent {
  id: string
  direction: GateDirection
  occurredAt: Date | string
  siteId?: string
  truckId?: string
  tripId?: string | null
  actorId?: string
  [key: string]: unknown
}

export interface QueueEntryRecord {
  id: string
  status: QueueStatus
  joinedAt: Date | string
  siteId: string | null
  bayId: string | null
  detentionFreeMinutes?: number | null
  [key: string]: unknown
}

export interface GateWriteInput {
  siteId: string
  truckId: string
  tripId: string | null
  direction: GateDirection
  occurredAt: Date
  actorId: string
  latitude?: number | null
  longitude?: number | null
  evidence?: Record<string, unknown> | null
}

export interface QueueUpdateInput {
  status: QueueStatus
  bayId?: string | null
  startedAt?: Date
  completedAt?: Date
  actualWait?: number
  detentionMinutes?: number
}

export interface FactoryOpsRepository {
  isVehicleAuthorized(input: { siteId: string; truckId: string; tripId: string | null }): Promise<boolean>
  findLatestGateEvent(input: { siteId: string; truckId: string }): Promise<PersistedGateEvent | null>
  createGateEvent(input: GateWriteInput): Promise<PersistedGateEvent>
  getQueueEntry(id: string): Promise<QueueEntryRecord | null>
  updateQueueEntry(id: string, update: QueueUpdateInput): Promise<Record<string, unknown>>
}

export class FactoryOpsError extends Error {
  constructor(public code: string, message = code) {
    super(message)
    this.name = 'FactoryOpsError'
  }
}

export interface RecordGateOperationInput {
  siteId: string
  truckId: string
  tripId?: string | null
  direction: GateDirection
  occurredAt: Date | string
  actorId: string
  latitude?: number | null
  longitude?: number | null
  evidence?: Record<string, unknown> | null
}

export function createGateService(repository: FactoryOpsRepository) {
  return {
    async record(input: RecordGateOperationInput) {
      const tripId = input.tripId ?? null
      const authorized = await repository.isVehicleAuthorized({
        siteId: input.siteId,
        truckId: input.truckId,
        tripId,
      })
      const previous = await repository.findLatestGateEvent({
        siteId: input.siteId,
        truckId: input.truckId,
      })

      const decision = recordGateEvent({
        direction: input.direction,
        occurredAt: input.occurredAt,
        isVehicleAuthorized: authorized,
        previousEvent: previous
          ? { direction: previous.direction, occurredAt: previous.occurredAt }
          : null,
      })

      if (!decision.accepted) {
        throw new FactoryOpsError(decision.reason ?? 'gate_event_rejected')
      }

      if (decision.duplicate && previous) {
        return { duplicate: true, event: previous }
      }

      const occurredAt = input.occurredAt instanceof Date
        ? new Date(input.occurredAt.getTime())
        : new Date(input.occurredAt)
      if (!Number.isFinite(occurredAt.getTime())) {
        throw new FactoryOpsError('invalid_timestamp')
      }

      const event = await repository.createGateEvent({
        siteId: input.siteId,
        truckId: input.truckId,
        tripId,
        direction: input.direction,
        occurredAt,
        actorId: input.actorId,
        latitude: input.latitude ?? null,
        longitude: input.longitude ?? null,
        evidence: input.evidence ?? null,
      })

      return { duplicate: false, event }
    },
  }
}

export interface AdvanceFactoryQueueInput {
  queueId: string
  action: QueueAction
  occurredAt: Date | string
  bayId?: string | null
}

export function createQueueService(repository: FactoryOpsRepository) {
  return {
    async advance(input: AdvanceFactoryQueueInput) {
      const entry = await repository.getQueueEntry(input.queueId)
      if (!entry) throw new FactoryOpsError('queue_not_found')

      const decision = advanceQueue({
        currentStatus: entry.status,
        action: input.action,
        occurredAt: input.occurredAt,
        joinedAt: entry.joinedAt,
      })
      if (!decision.allowed) throw new FactoryOpsError('invalid_transition')

      const update: QueueUpdateInput = {
        status: decision.nextStatus,
      }
      if (input.bayId !== undefined) update.bayId = input.bayId
      if (decision.startedAt) update.startedAt = decision.startedAt
      if (decision.completedAt) update.completedAt = decision.completedAt
      if (decision.actualWait !== undefined) update.actualWait = decision.actualWait
      if (decision.completedAt && entry.detentionFreeMinutes != null) {
        update.detentionMinutes = calculateDetentionMinutes(
          entry.joinedAt,
          decision.completedAt,
          entry.detentionFreeMinutes
        )
      }

      return repository.updateQueueEntry(input.queueId, update)
    },
  }
}
