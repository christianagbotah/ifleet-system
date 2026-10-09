import { describe, expect, it } from 'vitest'
import { PodSubmissionError, submitProofOfDelivery, type PodRepository, type StoredPod } from '../proof-of-delivery-service'

const proof = {
  receiverName: 'Ama Mensah', receiverPhone: null, expectedQty: 100, receivedQty: 100, unit: 'bags',
  latitude: 5.6, longitude: -0.18, completedAt: '2026-10-09T10:00:00.000Z',
  signatureRef: 'private://sig', pinVerified: false,
  evidence: [{ type: 'delivery_photo' as const, ref: 'private://photo' }], discrepancyNotes: null,
}

function repo(existing: StoredPod | null = null) {
  const created: StoredPod[] = []
  const implementation: PodRepository = {
    findByIdempotencyKey: async () => existing,
    create: async (input) => {
      const value: StoredPod = { id: 'pod-new', ...input }
      created.push(value)
      return value
    },
  }
  return { implementation, created }
}

describe('submitProofOfDelivery', () => {
  it('creates a valid POD once with its stable fingerprint', async () => {
    const r = repo()
    const result = await submitProofOfDelivery({
      tripId: 'trip-1', deliveryStopId: 'stop-1', idempotencyKey: 'offline-queue-1', actorId: 'user-1',
      proof, requirements: ['signature', 'delivery_photo', 'location', 'receiver_identity'],
    }, r.implementation)

    expect(result.replayed).toBe(false)
    expect(r.created).toHaveLength(1)
    expect(r.created[0]).toMatchObject({ tripId: 'trip-1', deliveryStopId: 'stop-1', idempotencyKey: 'offline-queue-1' })
    expect(r.created[0].payloadFingerprint).toMatch(/^[a-f0-9]{64}$/)
  })

  it('returns the stored POD for an identical offline retry without creating another row', async () => {
    const firstRepo = repo()
    const first = await submitProofOfDelivery({
      tripId: 'trip-1', deliveryStopId: null, idempotencyKey: 'offline-queue-2', actorId: 'user-1', proof, requirements: [],
    }, firstRepo.implementation)
    const retryRepo = repo(first.proof)

    const retry = await submitProofOfDelivery({
      tripId: 'trip-1', deliveryStopId: null, idempotencyKey: 'offline-queue-2', actorId: 'user-1', proof, requirements: [],
    }, retryRepo.implementation)

    expect(retry.replayed).toBe(true)
    expect(retry.proof.id).toBe(first.proof.id)
    expect(retryRepo.created).toHaveLength(0)
  })

  it('rejects reuse of an idempotency key for a different payload', async () => {
    const firstRepo = repo()
    const first = await submitProofOfDelivery({
      tripId: 'trip-1', deliveryStopId: null, idempotencyKey: 'offline-queue-3', actorId: 'user-1', proof, requirements: [],
    }, firstRepo.implementation)
    const conflictRepo = repo(first.proof)

    await expect(submitProofOfDelivery({
      tripId: 'trip-1', deliveryStopId: null, idempotencyKey: 'offline-queue-3', actorId: 'user-1',
      proof: { ...proof, receivedQty: 99, discrepancyNotes: 'one bag short' }, requirements: [],
    }, conflictRepo.implementation)).rejects.toMatchObject({ code: 'IDEMPOTENCY_CONFLICT' })
  })

  it('rejects reuse of an idempotency key for a different delivery destination', async () => {
    const firstRepo = repo()
    const first = await submitProofOfDelivery({
      tripId: 'trip-1', deliveryStopId: null, deliveryDestinationId: 'destination-1', idempotencyKey: 'offline-queue-destination', actorId: 'user-1', proof, requirements: [],
    }, firstRepo.implementation)
    const conflictRepo = repo(first.proof)

    await expect(submitProofOfDelivery({
      tripId: 'trip-1', deliveryStopId: null, deliveryDestinationId: 'destination-2', idempotencyKey: 'offline-queue-destination', actorId: 'user-1', proof, requirements: [],
    }, conflictRepo.implementation)).rejects.toMatchObject({ code: 'IDEMPOTENCY_CONFLICT' })
  })

  it('does not persist incomplete required evidence', async () => {
    const r = repo()
    await expect(submitProofOfDelivery({
      tripId: 'trip-1', deliveryStopId: null, idempotencyKey: 'offline-queue-4', actorId: 'user-1',
      proof: { ...proof, signatureRef: null }, requirements: ['signature'],
    }, r.implementation)).rejects.toBeInstanceOf(PodSubmissionError)
    expect(r.created).toHaveLength(0)
  })
})
