import { describe, expect, it } from 'vitest'

import {
  evaluateDispatchClearance,
  type DispatchClearanceInput,
} from '@/lib/domain/dispatch/clearance'

function base(overrides: Partial<DispatchClearanceInput> = {}): DispatchClearanceInput {
  return {
    assignment: { passed: true, blocking: [], warnings: [] },
    gate: { gateInRecorded: true, queueCompleted: true },
    weighing: { passed: true, eventId: 'weight-2', correctedFromEventId: 'weight-1' },
    documents: { waybillRequired: true, waybillFinalized: true, missingRequired: [] },
    seal: { required: true, present: true },
    compliance: { passed: true, blocking: [], warnings: [] },
    override: null,
    ...overrides,
  }
}

describe('evaluateDispatchClearance', () => {
  it('clears a trip only when every required dispatch check passes', () => {
    const result = evaluateDispatchClearance(base())

    expect(result.passed).toBe(true)
    expect(result.blocking).toEqual([])
    expect(result.checks.every((check) => check.status === 'pass')).toBe(true)
  })

  it('blocks dispatch when the effective weighing is overweight', () => {
    const result = evaluateDispatchClearance(base({
      weighing: {
        passed: false,
        eventId: 'weight-over',
        correctedFromEventId: null,
        blocking: ['Gross weight exceeds configured limit'],
      },
    }))

    expect(result.passed).toBe(false)
    expect(result.blocking).toContain('Gross weight exceeds configured limit')
    expect(result.checks.find((check) => check.key === 'weighing')?.status).toBe('block')
  })

  it('blocks when a required waybill or required document is missing', () => {
    const result = evaluateDispatchClearance(base({
      documents: {
        waybillRequired: true,
        waybillFinalized: false,
        missingRequired: ['loading-ticket', 'driver-license-copy'],
      },
    }))

    expect(result.passed).toBe(false)
    expect(result.blocking).toContain('Finalized waybill is required before dispatch')
    expect(result.blocking).toContain('Missing required document: loading-ticket')
    expect(result.blocking).toContain('Missing required document: driver-license-copy')
  })

  it('allows dispatch when only warning-level compliance findings remain', () => {
    const result = evaluateDispatchClearance(base({
      compliance: {
        passed: true,
        blocking: [],
        warnings: ['Driver hours approaching threshold'],
      },
    }))

    expect(result.passed).toBe(true)
    expect(result.warnings).toContain('Driver hours approaching threshold')
    expect(result.checks.find((check) => check.key === 'compliance')?.status).toBe('warning')
  })

  it('allows a privileged reasoned override for overrideable operational blocks', () => {
    const result = evaluateDispatchClearance(base({
      documents: {
        waybillRequired: false,
        waybillFinalized: false,
        missingRequired: ['shipper-release-note'],
      },
      override: {
        authorized: true,
        actorRole: 'Admin',
        actorId: 'admin-1',
        reason: 'Factory release approved by duty manager; scan pending',
        checks: ['documents'],
      },
    }))

    expect(result.passed).toBe(true)
    expect(result.overriddenChecks).toEqual(['documents'])
    expect(result.checks.find((check) => check.key === 'documents')?.status).toBe('overridden')
  })

  it('does not let an override suppress a failed weight or blocking compliance rule', () => {
    const result = evaluateDispatchClearance(base({
      weighing: { passed: false, eventId: 'weight-3', blocking: ['Axle group exceeds limit'] },
      compliance: { passed: false, blocking: ['Axle-load compliance failed'], warnings: [] },
      override: {
        authorized: true,
        actorRole: 'Admin',
        actorId: 'admin-1',
        reason: 'Attempted operational override',
        checks: ['weighing', 'compliance'],
      },
    }))

    expect(result.passed).toBe(false)
    expect(result.overriddenChecks).toEqual([])
    expect(result.blocking).toContain('Axle group exceeds limit')
    expect(result.blocking).toContain('Axle-load compliance failed')
  })

  it('recovers after a corrected weighing supersedes the failed weighing', () => {
    const failed = evaluateDispatchClearance(base({
      weighing: { passed: false, eventId: 'weight-1', blocking: ['Overweight'] },
    }))
    const corrected = evaluateDispatchClearance(base({
      weighing: { passed: true, eventId: 'weight-2', correctedFromEventId: 'weight-1' },
    }))

    expect(failed.passed).toBe(false)
    expect(corrected.passed).toBe(true)
    expect(corrected.checks.find((check) => check.key === 'weighing')).toEqual(
      expect.objectContaining({ status: 'pass', evidenceId: 'weight-2' }),
    )
  })
})
