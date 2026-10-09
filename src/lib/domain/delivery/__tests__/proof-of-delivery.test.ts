import { describe, expect, it } from 'vitest'
import {
  buildPodFingerprint,
  evaluateProofOfDelivery,
  parsePodRequirements,
  redactProofOfDelivery,
} from '../proof-of-delivery'

const base = {
  receiverName: 'Ama Mensah',
  receiverPhone: '+233000000000',
  expectedQty: 600,
  receivedQty: 600,
  unit: 'bags',
  latitude: 5.6037,
  longitude: -0.1870,
  completedAt: '2026-10-09T09:00:00.000Z',
  signatureRef: 'private://pod/signature-1.png',
  pinVerified: false,
  evidence: [
    { type: 'delivery_photo', ref: 'private://pod/delivery-1.jpg' },
    { type: 'receiver_photo', ref: 'private://pod/receiver-1.jpg' },
  ],
  discrepancyNotes: null,
}

describe('electronic proof of delivery', () => {
  it('normalizes configurable POD requirement names', () => {
    expect(parsePodRequirements('["signature", "photo", "receiver ID", "gps"]')).toEqual([
      'signature', 'delivery_photo', 'receiver_identity', 'location',
    ])
    expect(parsePodRequirements('signature, delivery photo, receiver photo')).toEqual([
      'signature', 'delivery_photo', 'receiver_photo',
    ])
  })

  it('blocks completion when required receiver/evidence fields are missing', () => {
    const result = evaluateProofOfDelivery({
      ...base,
      receiverName: '',
      signatureRef: null,
      latitude: null,
      longitude: null,
      evidence: [],
    }, ['signature', 'receiver_identity', 'delivery_photo', 'location'])

    expect(result.valid).toBe(false)
    expect(result.missingRequirements).toEqual([
      'receiver_identity', 'signature', 'delivery_photo', 'location',
    ])
  })

  it('accepts PIN as proof when signature is not required', () => {
    const result = evaluateProofOfDelivery({
      ...base,
      signatureRef: null,
      pinVerified: true,
    }, ['pin', 'receiver_identity', 'delivery_photo', 'location'])

    expect(result.valid).toBe(true)
    expect(result.missingRequirements).toEqual([])
  })

  it('classifies shortages and requires discrepancy notes', () => {
    const missingNotes = evaluateProofOfDelivery({
      ...base,
      receivedQty: 590,
      discrepancyNotes: null,
    }, ['signature'])
    expect(missingNotes.discrepancy.type).toBe('shortage')
    expect(missingNotes.discrepancy.quantity).toBe(10)
    expect(missingNotes.valid).toBe(false)
    expect(missingNotes.missingRequirements).toContain('discrepancy_notes')

    const explained = evaluateProofOfDelivery({
      ...base,
      receivedQty: 590,
      discrepancyNotes: '10 bags damaged in transit',
    }, ['signature'])
    expect(explained.valid).toBe(true)
  })

  it('rejects non-positive, negative and over-received quantities', () => {
    expect(() => evaluateProofOfDelivery({ ...base, expectedQty: 0 }, [])).toThrow(/expected quantity/i)
    expect(() => evaluateProofOfDelivery({ ...base, receivedQty: -1 }, [])).toThrow(/received quantity/i)
    expect(() => evaluateProofOfDelivery({ ...base, receivedQty: 601 }, [])).toThrow(/cannot exceed dispatched/i)
  })

  it('accounts for damaged and rejected quantities without allowing impossible totals', () => {
    const result = evaluateProofOfDelivery({
      ...base,
      receivedQty: 600,
      damagedQty: 5,
      rejectedQty: 3,
      discrepancyNotes: 'Five bags damaged and three rejected by receiver',
    }, ['signature'])

    expect(result.valid).toBe(true)
    expect(result.damagedQty).toBe(5)
    expect(result.rejectedQty).toBe(3)
    expect(result.acceptedQty).toBe(592)
    expect(result.hasException).toBe(true)

    expect(() => evaluateProofOfDelivery({
      ...base,
      receivedQty: 10,
      damagedQty: 8,
      rejectedQty: 4,
      discrepancyNotes: 'invalid',
    }, [])).toThrow(/damaged and rejected/i)
  })

  it('creates a stable retry fingerprint and changes it when the payload changes', () => {
    const first = buildPodFingerprint(base)
    const retry = buildPodFingerprint({ ...base, evidence: [...base.evidence].reverse() })
    const changed = buildPodFingerprint({ ...base, receivedQty: 599 })

    expect(retry).toBe(first)
    expect(changed).not.toBe(first)
  })

  it('redacts sensitive evidence for driver/low-privilege summaries', () => {
    const redacted = redactProofOfDelivery({
      id: 'pod-1',
      ...base,
      evidence: base.evidence,
    })

    expect(redacted).toMatchObject({
      id: 'pod-1',
      receiverName: 'Ama Mensah',
      expectedQty: 600,
      receivedQty: 600,
      evidenceCount: 2,
      hasSignature: true,
    })
    expect(redacted).not.toHaveProperty('signatureRef')
    expect(redacted).not.toHaveProperty('evidence')
    expect(JSON.stringify(redacted)).not.toContain('private://')
  })
})
