import type {
  FinalizedWaybill,
  WaybillSnapshot,
} from '@/lib/domain/waybills/electronic-waybill'

export interface StoredWaybillVersionRecord {
  version: number
  snapshot: string
  contentHash: string
  supersedesVersion: number | null
  correctionReason: string | null
  finalizedBy: string
  finalizedAt: Date
}

export interface StoredElectronicWaybillRecord {
  waybillNumber: string
  verificationToken: string
  currentVersion: number
  status: string
  versions: StoredWaybillVersionRecord[]
}

function parseSnapshot(value: string): WaybillSnapshot {
  const parsed = JSON.parse(value) as WaybillSnapshot
  if (!parsed || typeof parsed !== 'object' || !parsed.id || !parsed.tripNumber || !parsed.weighingEventId) {
    throw new Error('Stored electronic waybill snapshot is invalid')
  }
  return parsed
}

export function storedElectronicWaybillToDomain(record: StoredElectronicWaybillRecord): FinalizedWaybill {
  const current = record.versions.find((version) => version.version === record.currentVersion)
    ?? [...record.versions].sort((a, b) => b.version - a.version)[0]

  if (!current) throw new Error('Electronic waybill has no finalized version')
  if (record.status !== 'finalized') throw new Error(`Electronic waybill is not finalized: ${record.status}`)

  const snapshot = parseSnapshot(current.snapshot)
  const seals = (snapshot.seals ?? []).map((seal) => Object.freeze({
    sealNumber: seal.sealNumber,
    type: seal.type ?? null,
  }))
  Object.freeze(seals)
  const immutableSnapshot = Object.freeze({ ...snapshot, seals })

  return Object.freeze({
    waybillNumber: record.waybillNumber,
    verificationToken: record.verificationToken,
    version: current.version,
    supersedesVersion: current.supersedesVersion,
    status: 'finalized' as const,
    snapshot: immutableSnapshot,
    contentHash: current.contentHash,
    finalizedBy: current.finalizedBy,
    finalizedAt: current.finalizedAt.toISOString(),
    correctionReason: current.correctionReason,
  })
}
