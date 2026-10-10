import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  operationalEventFindUnique: vi.fn(),
}))

vi.mock('@/lib/db', () => ({
  db: {
    operationalEvent: { findUnique: mocks.operationalEventFindUnique },
  },
}))

import { validateDriverEvidenceRefs } from '@/lib/domain/evidence/driver-evidence-server'

const auth = { userId: 'user-driver-1', driverId: 'driver-1' }
const mutationId = 'evidence-12345678'
const ref = `/uploads/images/driver-evidence-${mutationId}-0.jpg`

function evidenceEvent(overrides: Partial<{
  actorId: string
  entityType: string
  metadata: string
  evidenceRefs: string
}> = {}) {
  return {
    actorId: auth.userId,
    entityType: 'driver_evidence_upload',
    metadata: JSON.stringify({ driverId: auth.driverId, tripId: 'trip-1' }),
    evidenceRefs: JSON.stringify([ref]),
    ...overrides,
  }
}

describe('validateDriverEvidenceRefs', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.operationalEventFindUnique.mockResolvedValue(evidenceEvent())
  })

  it('accepts evidence recorded for the same authenticated driver, actor and trip', async () => {
    await expect(validateDriverEvidenceRefs(auth, 'trip-1', [ref])).resolves.toBe(true)
    expect(mocks.operationalEventFindUnique).toHaveBeenCalledWith({
      where: { idempotencyKey: `driver-evidence-upload:${mutationId}` },
    })
  })

  it.each([
    ['different actor', { actorId: 'other-user' }],
    ['different driver', { metadata: JSON.stringify({ driverId: 'driver-2', tripId: 'trip-1' }) }],
    ['different trip', { metadata: JSON.stringify({ driverId: auth.driverId, tripId: 'trip-2' }) }],
    ['wrong event type', { entityType: 'other_event' }],
    ['unrecorded reference', { evidenceRefs: JSON.stringify(['/uploads/images/other.jpg']) }],
  ])('rejects %s evidence ownership', async (_label, overrides) => {
    mocks.operationalEventFindUnique.mockResolvedValue(evidenceEvent(overrides))
    await expect(validateDriverEvidenceRefs(auth, 'trip-1', [ref])).resolves.toBe(false)
  })

  it('rejects malformed evidence URLs before consulting the event ledger', async () => {
    await expect(validateDriverEvidenceRefs(auth, 'trip-1', ['/uploads/images/not-driver-evidence.jpg'])).resolves.toBe(false)
    expect(mocks.operationalEventFindUnique).not.toHaveBeenCalled()
  })
})
