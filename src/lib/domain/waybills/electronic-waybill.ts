import { createHash } from 'node:crypto'

export interface WaybillTripSnapshotInput {
  id: string
  tripNumber: string
  tractorId: string
  tractorPlate: string
  trailerId?: string | null
  trailerPlate?: string | null
  origin: string
  destination: string
  product: string
  quantity: number
  unit: string
  driverName: string
  driverPhone?: string | null
  driverLicense?: string | null
  customerName?: string | null
  customerPhone?: string | null
  offeredRate?: number | null
}

export interface WaybillWeighingInput {
  id: string
  tripId: string
  tractorId: string
  trailerId?: string | null
  tareWeightKg: number
  grossWeightKg: number
  netWeightKg: number
  clearancePassed: boolean
}

export interface WaybillSealInput {
  sealNumber: string
  type?: string | null
}

export interface WaybillFinalizationInput {
  trip: WaybillTripSnapshotInput
  weighing: WaybillWeighingInput
  seals: WaybillSealInput[]
  finalizedBy: string
  finalizedAt: Date | string
  entropy: string
}

export interface WaybillSnapshot extends WaybillTripSnapshotInput {
  weighingEventId: string
  tareWeightKg: number
  grossWeightKg: number
  netWeightKg: number
  seals: WaybillSealInput[]
}

export interface FinalizedWaybill {
  waybillNumber: string
  verificationToken: string
  version: number
  supersedesVersion: number | null
  status: 'finalized'
  snapshot: Readonly<WaybillSnapshot>
  contentHash: string
  finalizedBy: string
  finalizedAt: string
  correctionReason: string | null
}

export interface WaybillCorrection {
  correctionReason: string
  correctedBy: string
  correctedAt: Date | string
  snapshot: Partial<WaybillSnapshot>
}

function date(value: Date | string): Date {
  const parsed = value instanceof Date ? new Date(value.getTime()) : new Date(value)
  if (!Number.isFinite(parsed.getTime())) throw new Error('Waybill timestamp is invalid')
  return parsed
}

function normalizedEntropy(value: string): string {
  const token = value.toUpperCase().replace(/[^A-Z0-9]/g, '')
  if (token.length < 4) throw new Error('Waybill entropy must contain at least four alphanumeric characters')
  return token.slice(0, 16)
}

function cloneSeal(seal: WaybillSealInput): WaybillSealInput {
  return { sealNumber: seal.sealNumber, type: seal.type ?? null }
}

function deepFreezeSnapshot(snapshot: WaybillSnapshot): Readonly<WaybillSnapshot> {
  snapshot.seals.forEach(Object.freeze)
  Object.freeze(snapshot.seals)
  return Object.freeze(snapshot)
}

function sha256(value: string): string {
  return createHash('sha256').update(value).digest('hex')
}

function hashSnapshot(snapshot: WaybillSnapshot): string {
  return sha256(JSON.stringify(snapshot))
}

function assertConsistent(input: WaybillFinalizationInput) {
  const { trip, weighing } = input
  if (weighing.tripId !== trip.id) throw new Error('Waybill weighing trip does not match the trip')
  if (weighing.tractorId !== trip.tractorId) throw new Error('Waybill tractor does not match the cleared weighing')
  if ((weighing.trailerId ?? null) !== (trip.trailerId ?? null)) {
    throw new Error('Waybill trailer does not match the cleared weighing')
  }
  if (!weighing.clearancePassed) throw new Error('Waybill cannot be finalized without passed weight clearance')
  if (!Number.isFinite(weighing.tareWeightKg) || weighing.tareWeightKg < 0) throw new Error('Invalid tare weight')
  if (!Number.isFinite(weighing.grossWeightKg) || weighing.grossWeightKg < weighing.tareWeightKg) throw new Error('Invalid gross weight')
  const expectedNet = weighing.grossWeightKg - weighing.tareWeightKg
  if (!Number.isFinite(weighing.netWeightKg) || Math.abs(weighing.netWeightKg - expectedNet) > 0.001) {
    throw new Error('Waybill net weight is inconsistent with tare and gross weight')
  }
  if (!trip.product.trim()) throw new Error('Waybill product is required')
  if (!Number.isFinite(trip.quantity) || trip.quantity <= 0) throw new Error('Waybill quantity must be positive')
}

export function finalizeWaybill(input: WaybillFinalizationInput): FinalizedWaybill {
  assertConsistent(input)
  const finalizedAt = date(input.finalizedAt)
  const entropy = normalizedEntropy(input.entropy)
  const datePart = finalizedAt.toISOString().slice(0, 10).replaceAll('-', '')
  const waybillNumber = `EWB-${datePart}-${entropy}`
  const verificationToken = sha256(`${input.trip.id}|${waybillNumber}|${finalizedAt.toISOString()}|${entropy}`)

  const snapshot: WaybillSnapshot = {
    ...input.trip,
    trailerId: input.trip.trailerId ?? null,
    trailerPlate: input.trip.trailerPlate ?? null,
    driverPhone: input.trip.driverPhone ?? null,
    driverLicense: input.trip.driverLicense ?? null,
    customerName: input.trip.customerName ?? null,
    customerPhone: input.trip.customerPhone ?? null,
    offeredRate: input.trip.offeredRate ?? null,
    weighingEventId: input.weighing.id,
    tareWeightKg: input.weighing.tareWeightKg,
    grossWeightKg: input.weighing.grossWeightKg,
    netWeightKg: input.weighing.netWeightKg,
    seals: input.seals.map(cloneSeal),
  }
  const immutableSnapshot = deepFreezeSnapshot(snapshot)

  return Object.freeze({
    waybillNumber,
    verificationToken,
    version: 1,
    supersedesVersion: null,
    status: 'finalized' as const,
    snapshot: immutableSnapshot,
    contentHash: hashSnapshot(snapshot),
    finalizedBy: input.finalizedBy,
    finalizedAt: finalizedAt.toISOString(),
    correctionReason: null,
  })
}

export function supersedeWaybill(previous: FinalizedWaybill, correction: WaybillCorrection): FinalizedWaybill {
  const reason = correction.correctionReason.trim()
  if (reason.length < 8) throw new Error('Waybill correction reason must contain at least eight characters')
  const correctedAt = date(correction.correctedAt)
  const mergedSnapshot: WaybillSnapshot = {
    ...previous.snapshot,
    ...correction.snapshot,
    seals: (correction.snapshot.seals ?? previous.snapshot.seals).map(cloneSeal),
  }
  const immutableSnapshot = deepFreezeSnapshot(mergedSnapshot)

  return Object.freeze({
    waybillNumber: previous.waybillNumber,
    verificationToken: previous.verificationToken,
    version: previous.version + 1,
    supersedesVersion: previous.version,
    status: 'finalized' as const,
    snapshot: immutableSnapshot,
    contentHash: hashSnapshot(mergedSnapshot),
    finalizedBy: correction.correctedBy,
    finalizedAt: correctedAt.toISOString(),
    correctionReason: reason,
  })
}

export function publicWaybillVerification(waybill: FinalizedWaybill) {
  const snapshot = waybill.snapshot
  return {
    waybillNumber: waybill.waybillNumber,
    version: waybill.version,
    status: waybill.status,
    finalizedAt: waybill.finalizedAt,
    tripNumber: snapshot.tripNumber,
    origin: snapshot.origin,
    destination: snapshot.destination,
    tractorPlate: snapshot.tractorPlate,
    trailerPlate: snapshot.trailerPlate,
    product: snapshot.product,
    quantity: snapshot.quantity,
    unit: snapshot.unit,
    tareWeightKg: snapshot.tareWeightKg,
    grossWeightKg: snapshot.grossWeightKg,
    netWeightKg: snapshot.netWeightKg,
    seals: snapshot.seals.map((seal) => ({ sealNumber: seal.sealNumber, type: seal.type ?? null })),
    contentHash: waybill.contentHash,
  }
}
