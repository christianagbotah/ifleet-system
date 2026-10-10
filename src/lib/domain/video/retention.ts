export type VideoRetentionStorageKind = 'provider_only' | 'cloud_copy'
export type VideoRetentionKind = 'routine' | 'incident'

export interface VideoRetentionPolicyInput {
  version: number
  effectiveAt: Date
  routineRetentionDays: number
  incidentRetentionDays: number
  applyToExisting: boolean
}

export interface VideoRetentionRecord {
  id: string
  kind: VideoRetentionKind
  recordedAt: Date
  storageKind: VideoRetentionStorageKind
  deletedAt: Date | null
  legalHoldUntil: Date | null
  auditHoldUntil: Date | null
  retentionPolicyVersion: number
  retainUntil: Date
}

export type RetentionDecision =
  | { action: 'keep'; reason: 'not_expired' | 'legal_hold' | 'audit_hold' | 'already_deleted' | 'provider_managed'; retainUntil: Date }
  | { action: 'delete'; reason: 'retention_expired'; retainUntil: Date }

const DAY_MS = 24 * 60 * 60 * 1000

function calculatedRetainUntil(record: VideoRetentionRecord, policy: VideoRetentionPolicyInput): Date {
  if (!policy.applyToExisting || record.retentionPolicyVersion === policy.version) {
    return record.retainUntil
  }

  const days = record.kind === 'incident' ? policy.incidentRetentionDays : policy.routineRetentionDays
  return new Date(record.recordedAt.getTime() + Math.max(0, days) * DAY_MS)
}

function activeHold(until: Date | null, now: Date): boolean {
  return !!until && until.getTime() > now.getTime()
}

export function evaluateVideoRetention(
  record: VideoRetentionRecord,
  policy: VideoRetentionPolicyInput,
  now: Date,
): RetentionDecision {
  const retainUntil = calculatedRetainUntil(record, policy)

  if (record.deletedAt) {
    return { action: 'keep', reason: 'already_deleted', retainUntil }
  }

  if (record.storageKind === 'provider_only') {
    return { action: 'keep', reason: 'provider_managed', retainUntil }
  }

  if (activeHold(record.legalHoldUntil, now)) {
    return { action: 'keep', reason: 'legal_hold', retainUntil: record.legalHoldUntil! }
  }

  if (activeHold(record.auditHoldUntil, now)) {
    return { action: 'keep', reason: 'audit_hold', retainUntil: record.auditHoldUntil! }
  }

  if (now.getTime() >= retainUntil.getTime()) {
    return { action: 'delete', reason: 'retention_expired', retainUntil }
  }

  return { action: 'keep', reason: 'not_expired', retainUntil }
}
