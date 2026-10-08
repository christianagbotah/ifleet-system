export type QueueStatus = 'waiting' | 'in_progress' | 'loading' | 'unloading' | 'completed' | 'cancelled'
export type QueueAction = 'call_to_bay' | 'start_loading' | 'start_unloading' | 'complete' | 'cancel'

export interface AdvanceQueueInput {
  currentStatus: QueueStatus
  action: QueueAction
  occurredAt: Date | string
  joinedAt: Date | string
}

export interface QueueTransitionDecision {
  allowed: boolean
  nextStatus: QueueStatus
  startedAt?: Date
  completedAt?: Date
  actualWait?: number
  reason?: 'invalid_transition'
}

function asDate(value: Date | string): Date {
  const date = value instanceof Date ? new Date(value.getTime()) : new Date(value)
  if (!Number.isFinite(date.getTime())) throw new Error('Invalid queue timestamp')
  return date
}

export function calculateDetentionMinutes(
  joinedAt: Date | string,
  endedAt: Date | string,
  freeMinutes: number
): number {
  const joined = asDate(joinedAt).getTime()
  const ended = asDate(endedAt).getTime()
  const elapsedMinutes = Math.max(0, Math.floor((ended - joined) / 60_000))
  return Math.max(0, elapsedMinutes - Math.max(0, freeMinutes))
}

export function advanceQueue(input: AdvanceQueueInput): QueueTransitionDecision {
  const occurredAt = asDate(input.occurredAt)
  const joinedAt = asDate(input.joinedAt)

  if (input.action === 'cancel' && input.currentStatus !== 'completed' && input.currentStatus !== 'cancelled') {
    return { allowed: true, nextStatus: 'cancelled', completedAt: occurredAt }
  }

  if (input.currentStatus === 'waiting' && input.action === 'call_to_bay') {
    return { allowed: true, nextStatus: 'in_progress', startedAt: occurredAt }
  }

  if (input.currentStatus === 'in_progress' && input.action === 'start_loading') {
    return { allowed: true, nextStatus: 'loading' }
  }

  if (input.currentStatus === 'in_progress' && input.action === 'start_unloading') {
    return { allowed: true, nextStatus: 'unloading' }
  }

  if ((input.currentStatus === 'loading' || input.currentStatus === 'unloading' || input.currentStatus === 'in_progress') && input.action === 'complete') {
    const actualWait = Math.max(0, Math.floor((occurredAt.getTime() - joinedAt.getTime()) / 60_000))
    return {
      allowed: true,
      nextStatus: 'completed',
      completedAt: occurredAt,
      actualWait,
    }
  }

  return { allowed: false, nextStatus: input.currentStatus, reason: 'invalid_transition' }
}
