import {
  buildPodFingerprint,
  evaluateProofOfDelivery,
  type PodRequirement,
  type ProofOfDeliveryInput,
} from './proof-of-delivery'

export type PodSubmissionErrorCode = 'VALIDATION_FAILED' | 'IDEMPOTENCY_CONFLICT'

export class PodSubmissionError extends Error {
  constructor(public readonly code: PodSubmissionErrorCode, message: string, public readonly details?: unknown) {
    super(message)
    this.name = 'PodSubmissionError'
  }
}

export interface StoredPod extends ProofOfDeliveryInput {
  id: string
  tripId: string
  deliveryStopId: string | null
  deliveryDestinationId?: string | null
  idempotencyKey: string
  payloadFingerprint: string
  actorId: string
  discrepancyType: 'none' | 'shortage' | 'overage'
  discrepancyQuantity: number
}

export type CreatePodInput = Omit<StoredPod, 'id'>

export interface PodRepository {
  findByIdempotencyKey(key: string): Promise<StoredPod | null>
  create(input: CreatePodInput): Promise<StoredPod>
}

export interface SubmitPodInput {
  tripId: string
  deliveryStopId: string | null
  deliveryDestinationId: string | null
  idempotencyKey: string
  actorId: string
  proof: ProofOfDeliveryInput
  requirements: PodRequirement[]
}

export async function submitProofOfDelivery(input: SubmitPodInput, repository: PodRepository) {
  const key = input.idempotencyKey.trim()
  if (!key || key.length > 191) throw new PodSubmissionError('VALIDATION_FAILED', 'A valid idempotency key is required')

  const evaluation = evaluateProofOfDelivery(input.proof, input.requirements)
  if (!evaluation.valid) {
    throw new PodSubmissionError('VALIDATION_FAILED', 'Proof of delivery is incomplete', {
      missingRequirements: evaluation.missingRequirements,
      discrepancy: evaluation.discrepancy,
    })
  }

  const payloadFingerprint = buildPodFingerprint(input.proof)
  const existing = await repository.findByIdempotencyKey(key)
  if (existing) {
    if (existing.payloadFingerprint !== payloadFingerprint || existing.tripId !== input.tripId || existing.deliveryStopId !== input.deliveryStopId || existing.deliveryDestinationId !== (input.deliveryDestinationId ?? null)) {
      throw new PodSubmissionError('IDEMPOTENCY_CONFLICT', 'Idempotency key was already used for a different proof of delivery')
    }
    return { proof: existing, replayed: true }
  }

  const proof = await repository.create({
    ...input.proof,
    tripId: input.tripId,
    deliveryStopId: input.deliveryStopId,
    deliveryDestinationId: input.deliveryDestinationId ?? null,
    idempotencyKey: key,
    payloadFingerprint,
    actorId: input.actorId,
    discrepancyType: evaluation.discrepancy.type,
    discrepancyQuantity: evaluation.discrepancy.quantity,
  })
  return { proof, replayed: false }
}
