import { createHash } from 'node:crypto'

export type PodRequirement = 'receiver_identity' | 'signature' | 'pin' | 'delivery_photo' | 'receiver_photo' | 'location' | 'discrepancy_notes'
export type PodEvidenceType = 'delivery_photo' | 'receiver_photo' | 'document'

export interface PodEvidenceInput { type: PodEvidenceType; ref: string }
export interface ProofOfDeliveryInput {
  receiverName: string
  receiverPhone?: string | null
  expectedQty: number
  receivedQty: number
  damagedQty?: number
  rejectedQty?: number
  unit: string
  latitude?: number | null
  longitude?: number | null
  completedAt: string
  signatureRef?: string | null
  pinVerified?: boolean
  evidence: PodEvidenceInput[]
  discrepancyNotes?: string | null
}

export interface PodEvaluation {
  valid: boolean
  missingRequirements: PodRequirement[]
  discrepancy: { type: 'none' | 'shortage'; quantity: number }
  damagedQty: number
  rejectedQty: number
  acceptedQty: number
  hasException: boolean
}


const REQUIREMENT_ALIASES: Record<string, PodRequirement> = {
  receiver: 'receiver_identity',
  'receiver id': 'receiver_identity',
  'receiver identity': 'receiver_identity',
  receiver_identity: 'receiver_identity',
  signature: 'signature',
  pin: 'pin',
  'receiver pin': 'pin',
  photo: 'delivery_photo',
  'delivery photo': 'delivery_photo',
  delivery_photo: 'delivery_photo',
  'receiver photo': 'receiver_photo',
  receiver_photo: 'receiver_photo',
  gps: 'location',
  location: 'location',
  'gps location': 'location',
  discrepancy_notes: 'discrepancy_notes',
  'discrepancy notes': 'discrepancy_notes',
}

export function parsePodRequirements(value: string | null | undefined): PodRequirement[] {
  if (!value?.trim()) return []
  let raw: unknown = value
  try { raw = JSON.parse(value) } catch { raw = value.split(',') }
  const values = Array.isArray(raw) ? raw : [raw]
  const requirements: PodRequirement[] = []
  for (const item of values) {
    const key = String(item).trim().toLowerCase().replace(/\s+/g, ' ')
    const normalized = REQUIREMENT_ALIASES[key]
    if (normalized && !requirements.includes(normalized)) requirements.push(normalized)
  }
  return requirements
}

function hasEvidence(input: ProofOfDeliveryInput, type: PodEvidenceType): boolean {
  return input.evidence.some((item) => item.type === type && item.ref.trim().length > 0)
}

export function evaluateProofOfDelivery(input: ProofOfDeliveryInput, requirements: PodRequirement[]): PodEvaluation {
  if (!Number.isFinite(input.expectedQty) || input.expectedQty <= 0) throw new Error('Expected quantity must be greater than zero')
  if (!Number.isFinite(input.receivedQty) || input.receivedQty < 0) throw new Error('Received quantity cannot be negative')
  if (input.receivedQty > input.expectedQty) throw new Error('Received quantity cannot exceed dispatched quantity')
  const damagedQty = input.damagedQty ?? 0
  const rejectedQty = input.rejectedQty ?? 0
  if (!Number.isFinite(damagedQty) || damagedQty < 0) throw new Error('Damaged quantity cannot be negative')
  if (!Number.isFinite(rejectedQty) || rejectedQty < 0) throw new Error('Rejected quantity cannot be negative')
  if (damagedQty + rejectedQty > input.receivedQty) throw new Error('Damaged and rejected quantities cannot exceed received quantity')
  const acceptedQty = Number((input.receivedQty - damagedQty - rejectedQty).toFixed(6))

  const missing: PodRequirement[] = []
  const required = new Set(requirements)
  if (required.has('receiver_identity') && !input.receiverName.trim()) missing.push('receiver_identity')
  if (required.has('signature') && !input.signatureRef?.trim()) missing.push('signature')
  if (required.has('pin') && input.pinVerified !== true) missing.push('pin')
  if (required.has('delivery_photo') && !hasEvidence(input, 'delivery_photo')) missing.push('delivery_photo')
  if (required.has('receiver_photo') && !hasEvidence(input, 'receiver_photo')) missing.push('receiver_photo')
  if (required.has('location') && !(Number.isFinite(input.latitude) && Number.isFinite(input.longitude))) missing.push('location')

  const shortage = Number((input.expectedQty - input.receivedQty).toFixed(6))
  const discrepancy: PodEvaluation['discrepancy'] = shortage === 0
    ? { type: 'none', quantity: 0 }
    : { type: 'shortage', quantity: shortage }
  const hasException = discrepancy.type !== 'none' || damagedQty > 0 || rejectedQty > 0

  if (hasException && !input.discrepancyNotes?.trim()) missing.push('discrepancy_notes')

  return {
    valid: missing.length === 0,
    missingRequirements: missing,
    discrepancy,
    damagedQty,
    rejectedQty,
    acceptedQty,
    hasException,
  }
}

function canonicalInput(input: ProofOfDeliveryInput) {
  return {
    receiverName: input.receiverName.trim(),
    receiverPhone: input.receiverPhone?.trim() || null,
    expectedQty: input.expectedQty,
    receivedQty: input.receivedQty,
    damagedQty: input.damagedQty ?? 0,
    rejectedQty: input.rejectedQty ?? 0,
    unit: input.unit.trim().toLowerCase(),
    latitude: input.latitude ?? null,
    longitude: input.longitude ?? null,
    completedAt: input.completedAt,
    signatureRef: input.signatureRef?.trim() || null,
    pinVerified: input.pinVerified === true,
    discrepancyNotes: input.discrepancyNotes?.trim() || null,
    evidence: [...input.evidence]
      .map((item) => ({ type: item.type, ref: item.ref.trim() }))
      .sort((a, b) => `${a.type}:${a.ref}`.localeCompare(`${b.type}:${b.ref}`)),
  }
}

export function buildPodFingerprint(input: ProofOfDeliveryInput): string {
  return createHash('sha256').update(JSON.stringify(canonicalInput(input))).digest('hex')
}

export function redactProofOfDelivery(input: { id: string } & ProofOfDeliveryInput) {
  return {
    id: input.id,
    receiverName: input.receiverName,
    receiverPhone: input.receiverPhone ?? null,
    expectedQty: input.expectedQty,
    receivedQty: input.receivedQty,
    damagedQty: input.damagedQty ?? 0,
    rejectedQty: input.rejectedQty ?? 0,
    unit: input.unit,
    completedAt: input.completedAt,
    discrepancyNotes: input.discrepancyNotes ?? null,
    evidenceCount: input.evidence.length,
    hasSignature: Boolean(input.signatureRef),
    pinVerified: input.pinVerified === true,
    hasLocation: Number.isFinite(input.latitude) && Number.isFinite(input.longitude),
  }
}
