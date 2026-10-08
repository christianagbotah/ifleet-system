export type GateDirection = 'in' | 'out'

export interface PriorGateEvent {
  direction: GateDirection
  occurredAt: Date | string
}

export interface RecordGateEventInput {
  direction: GateDirection
  occurredAt: Date | string
  isVehicleAuthorized: boolean
  previousEvent: PriorGateEvent | null
  idempotencyWindowMinutes?: number
}

export interface GateEventDecision {
  accepted: boolean
  duplicate: boolean
  reason?: 'vehicle_not_authorized' | 'gate_in_required' | 'already_inside'
}

const DEFAULT_IDEMPOTENCY_WINDOW_MINUTES = 5

function asTime(value: Date | string): number {
  const time = value instanceof Date ? value.getTime() : new Date(value).getTime()
  if (!Number.isFinite(time)) throw new Error('Invalid gate event timestamp')
  return time
}

export function recordGateEvent(input: RecordGateEventInput): GateEventDecision {
  if (!input.isVehicleAuthorized) {
    return { accepted: false, duplicate: false, reason: 'vehicle_not_authorized' }
  }

  const now = asTime(input.occurredAt)
  const previous = input.previousEvent
  const windowMs = (input.idempotencyWindowMinutes ?? DEFAULT_IDEMPOTENCY_WINDOW_MINUTES) * 60_000

  if (previous) {
    const previousAt = asTime(previous.occurredAt)
    if (previous.direction === input.direction && now >= previousAt && now - previousAt <= windowMs) {
      return { accepted: true, duplicate: true }
    }
  }

  if (input.direction === 'out') {
    if (!previous || previous.direction !== 'in') {
      return { accepted: false, duplicate: false, reason: 'gate_in_required' }
    }
    return { accepted: true, duplicate: false }
  }

  if (previous?.direction === 'in') {
    return { accepted: false, duplicate: false, reason: 'already_inside' }
  }

  return { accepted: true, duplicate: false }
}
