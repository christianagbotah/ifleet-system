import { describe, expect, it } from 'vitest'

import { evaluateVideoRetention, type VideoRetentionPolicyInput, type VideoRetentionRecord } from '../retention'

const policy: VideoRetentionPolicyInput = {
  version: 3,
  effectiveAt: new Date('2026-10-01T00:00:00Z'),
  routineRetentionDays: 7,
  incidentRetentionDays: 30,
  applyToExisting: false,
}

function record(overrides: Partial<VideoRetentionRecord> = {}): VideoRetentionRecord {
  return {
    id: 'media-1',
    kind: 'routine',
    recordedAt: new Date('2026-10-01T00:00:00Z'),
    storageKind: 'cloud_copy',
    deletedAt: null,
    legalHoldUntil: null,
    auditHoldUntil: null,
    retentionPolicyVersion: 3,
    retainUntil: new Date('2026-10-08T00:00:00Z'),
    ...overrides,
  }
}

describe('video retention policy', () => {
  it('deletes expired non-incident cloud copies using the shorter retention period', () => {
    expect(evaluateVideoRetention(record(), policy, new Date('2026-10-09T00:00:00Z'))).toMatchObject({
      action: 'delete',
      reason: 'retention_expired',
    })
  })

  it('keeps incident media for the longer incident retention period', () => {
    const incident = record({
      kind: 'incident',
      retainUntil: new Date('2026-10-31T00:00:00Z'),
    })

    expect(evaluateVideoRetention(incident, policy, new Date('2026-10-09T00:00:00Z'))).toMatchObject({
      action: 'keep',
      reason: 'not_expired',
    })
  })

  it('keeps expired media while a legal hold is active', () => {
    const held = record({ legalHoldUntil: new Date('2026-11-01T00:00:00Z') })
    expect(evaluateVideoRetention(held, policy, new Date('2026-10-20T00:00:00Z'))).toEqual({
      action: 'keep', reason: 'legal_hold', retainUntil: new Date('2026-11-01T00:00:00Z'),
    })
  })

  it('keeps expired media while an audit hold is active', () => {
    const held = record({ auditHoldUntil: new Date('2026-10-25T00:00:00Z') })
    expect(evaluateVideoRetention(held, policy, new Date('2026-10-20T00:00:00Z'))).toEqual({
      action: 'keep', reason: 'audit_hold', retainUntil: new Date('2026-10-25T00:00:00Z'),
    })
  })

  it('does not attempt deletion again for already-deleted media', () => {
    expect(evaluateVideoRetention(record({ deletedAt: new Date('2026-10-08T01:00:00Z') }), policy, new Date('2026-10-20T00:00:00Z'))).toMatchObject({
      action: 'keep', reason: 'already_deleted',
    })
  })

  it('does not delete provider-only recordings because iFleetPro does not own the media', () => {
    expect(evaluateVideoRetention(record({ storageKind: 'provider_only' }), policy, new Date('2026-10-20T00:00:00Z'))).toMatchObject({
      action: 'keep', reason: 'provider_managed',
    })
  })

  it('keeps the original retain-until date when a newer policy applies prospectively', () => {
    const oldRecord = record({
      retentionPolicyVersion: 2,
      retainUntil: new Date('2026-10-15T00:00:00Z'),
    })
    const newerPolicy = { ...policy, version: 3, routineRetentionDays: 2, applyToExisting: false }

    expect(evaluateVideoRetention(oldRecord, newerPolicy, new Date('2026-10-10T00:00:00Z'))).toMatchObject({
      action: 'keep', reason: 'not_expired', retainUntil: new Date('2026-10-15T00:00:00Z'),
    })
  })

  it('can explicitly recalculate existing media when policy is configured to apply retroactively', () => {
    const oldRecord = record({
      retentionPolicyVersion: 2,
      retainUntil: new Date('2026-10-15T00:00:00Z'),
    })
    const retroactive = { ...policy, version: 3, routineRetentionDays: 2, applyToExisting: true }

    expect(evaluateVideoRetention(oldRecord, retroactive, new Date('2026-10-10T00:00:00Z'))).toEqual({
      action: 'delete', reason: 'retention_expired', retainUntil: new Date('2026-10-03T00:00:00Z'),
    })
  })
})
