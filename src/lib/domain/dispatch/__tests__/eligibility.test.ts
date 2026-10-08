import { describe, expect, it } from 'vitest'

import { evaluateAssignmentEligibility, type EligibilityInput } from '@/lib/domain/dispatch/eligibility'

const NOW = new Date('2026-10-08T07:00:00Z')

function input(overrides: Partial<EligibilityInput> = {}): EligibilityInput {
  return {
    now: NOW,
    driver: {
      id: 'driver-1',
      status: 'active',
      verificationStatus: 'verified',
      licenseExpiry: '2027-08-01T00:00:00Z',
      licenseClass: 'C',
    },
    tractor: {
      id: 'truck-1',
      status: 'active',
    },
    insurance: {
      status: 'active',
      endDate: '2027-06-01T00:00:00Z',
    },
    roadworthy: {
      status: 'completed',
      result: 'passed',
      vehicleFitness: 'fit',
      certificateIssued: true,
      certificateExpiry: '2027-04-01T00:00:00Z',
    },
    maintenance: { blocking: false },
    trailer: null,
    requirements: {
      requiresTrailer: false,
      allowedLicenseClasses: ['C', 'D'],
      allowedTrailerTypes: [],
      requiredDocuments: [],
    },
    documents: [],
    ...overrides,
  }
}

describe('evaluateAssignmentEligibility', () => {
  it('blocks a suspended driver', () => {
    const result = evaluateAssignmentEligibility(input({
      driver: { ...input().driver, status: 'suspended' },
    }))
    expect(result.passed).toBe(false)
    expect(result.blocking).toContain('driver_status')
  })

  it('blocks an expired driver licence', () => {
    const result = evaluateAssignmentEligibility(input({
      driver: { ...input().driver, licenseExpiry: '2026-10-01T00:00:00Z' },
    }))
    expect(result.passed).toBe(false)
    expect(result.blocking).toContain('driver_license_expired')
  })

  it('blocks a driver with the wrong licence class', () => {
    const result = evaluateAssignmentEligibility(input({
      driver: { ...input().driver, licenseClass: 'B' },
      requirements: { ...input().requirements, allowedLicenseClasses: ['C'] },
    }))
    expect(result.blocking).toContain('driver_license_class')
  })

  it('blocks expired roadworthy and insurance', () => {
    const result = evaluateAssignmentEligibility(input({
      insurance: { status: 'expired', endDate: '2026-09-01T00:00:00Z' },
      roadworthy: {
        status: 'completed', result: 'passed', vehicleFitness: 'fit', certificateIssued: true, certificateExpiry: '2026-09-01T00:00:00Z',
      },
    }))
    expect(result.blocking).toContain('tractor_insurance_expired')
    expect(result.blocking).toContain('tractor_roadworthy_expired')
  })

  it('blocks a tractor with a maintenance stop', () => {
    const result = evaluateAssignmentEligibility(input({ maintenance: { blocking: true } }))
    expect(result.blocking).toContain('tractor_maintenance_block')
  })

  it('blocks a roadworthy inspection when no certificate was issued', () => {
    const result = evaluateAssignmentEligibility(input({
      roadworthy: { ...input().roadworthy!, certificateIssued: false },
    }))
    expect(result.blocking).toContain('tractor_roadworthy_invalid')
  })

  it('blocks an expired shipper-required document', () => {
    const result = evaluateAssignmentEligibility(input({
      requirements: { ...input().requirements, requiredDocuments: ['ghana_card'] },
      documents: [{ category: 'ghana_card', validUntil: '2026-10-01T00:00:00Z' }],
    }))
    expect(result.blocking).toContain('document_expired:ghana_card')
  })

  it('blocks an inactive trailer when a trailer is required', () => {
    const result = evaluateAssignmentEligibility(input({
      trailer: { id: 'trailer-1', status: 'maintenance', trailerType: 'flatbed' },
      requirements: { ...input().requirements, requiresTrailer: true, allowedTrailerTypes: ['flatbed'] },
    }))
    expect(result.blocking).toContain('trailer_unavailable')
  })

  it('allows a rigid truck assignment without a trailer', () => {
    const result = evaluateAssignmentEligibility(input())
    expect(result.passed).toBe(true)
    expect(result.blocking).toEqual([])
  })

  it('returns warning-only conditions without failing eligibility', () => {
    const result = evaluateAssignmentEligibility(input({
      driver: { ...input().driver, licenseExpiry: '2026-10-25T00:00:00Z' },
    }))
    expect(result.passed).toBe(true)
    expect(result.warnings).toContain('driver_license_expiring_soon')
  })

  it('blocks a missing required document', () => {
    const result = evaluateAssignmentEligibility(input({
      requirements: { ...input().requirements, requiredDocuments: ['ghana_card'] },
    }))
    expect(result.blocking).toContain('missing_document:ghana_card')
  })

  it('accepts an audited privileged override only for shipper-policy exceptions', () => {
    const result = evaluateAssignmentEligibility(input({
      trailer: { id: 'trailer-1', status: 'active', trailerType: 'lowbed' },
      requirements: { ...input().requirements, requiresTrailer: true, allowedTrailerTypes: ['flatbed'] },
      override: { authorized: true, actorRole: 'Manager', reason: 'Shipper approved substitute trailer for this movement' },
    }))
    expect(result.passed).toBe(true)
    expect(result.overrideApplied).toBe(true)
    expect(result.blocking).toContain('trailer_type')
    expect(result.warnings).toContain('override_applied')
  })

  it('never overrides statutory driver or vehicle compliance blockers', () => {
    const result = evaluateAssignmentEligibility(input({
      driver: { ...input().driver, licenseExpiry: '2026-10-01T00:00:00Z' },
      override: { authorized: true, actorRole: 'Admin', reason: 'Operations director requested emergency dispatch' },
    }))
    expect(result.passed).toBe(false)
    expect(result.overrideApplied).toBe(false)
    expect(result.blocking).toContain('driver_license_expired')
  })

  it('matches configured licence, trailer and document categories case-insensitively', () => {
    const result = evaluateAssignmentEligibility(input({
      driver: { ...input().driver, licenseClass: 'c' },
      trailer: { id: 'trailer-1', status: 'active', trailerType: 'FlatBed' },
      requirements: {
        requiresTrailer: true,
        allowedLicenseClasses: [' C '],
        allowedTrailerTypes: ['flatbed'],
        requiredDocuments: ['Loading_Permit'],
      },
      documents: [{ category: 'loading_permit' }],
    }))
    expect(result.passed).toBe(true)
  })

  it('rejects an unprivileged or reasonless override', () => {
    const result = evaluateAssignmentEligibility(input({
      driver: { ...input().driver, status: 'suspended' },
      override: { authorized: true, actorRole: 'Driver', reason: '' },
    }))
    expect(result.passed).toBe(false)
    expect(result.overrideApplied).toBe(false)
  })
})
