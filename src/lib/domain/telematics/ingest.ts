import { createHash } from 'node:crypto'

import type { LocationEventInput } from './events'

export function createTelematicsIdempotencyKey(
  provider: string,
  deviceId: string | null,
  providerEventId: string | null,
  payloadHash: string,
): string {
  const identity = providerEventId?.trim()
    ? `event:${providerEventId.trim()}`
    : `payload:${payloadHash.trim().toLowerCase()}`
  return createHash('sha256')
    .update(`${provider.trim().toLowerCase()}\0${deviceId ?? 'anonymous'}\0${identity}`)
    .digest('hex')
}

export interface IngestDevice {
  id: string
  provider: string
  status: string
}

export interface IngestInstallation {
  id: string
  deviceId: string
  assetType: 'tractor' | 'trailer'
  assetId: string
  installedAt: Date
  uninstalledAt: Date | null
}

export interface DuplicateTelematicsEvent {
  eventId: string
  rawEventRef: string
}

export interface PersistTelematicsInput {
  event: LocationEventInput
  raw: TelematicsRawEnvelope
  assetType: 'tractor' | 'trailer'
  assetId: string
  tripId: string | null
  updateLiveState: boolean
}

export interface PersistTelematicsResult {
  eventId: string
  rawEventRef: string
  liveStateUpdated: boolean
  legacyLocationId: string | null
}

export interface TelematicsRawEnvelope {
  rawEventRef: string
  provider: string
  deviceId: string | null
  providerEventId: string | null
  payloadHash: string
  payload: string
  receivedAt: Date
}

export interface TelematicsIngestRepository {
  findDevice(deviceId: string): Promise<IngestDevice | null>
  resolveInstallation(deviceId: string, at: Date): Promise<IngestInstallation | null>
  resolveTrip(assetType: 'tractor' | 'trailer', assetId: string, at: Date): Promise<string | null>
  findDuplicate(raw: TelematicsRawEnvelope, event: LocationEventInput): Promise<DuplicateTelematicsEvent | null>
  getLiveStateTimestamp?(assetType: 'tractor' | 'trailer', assetId: string): Promise<Date | null>
  persist(input: PersistTelematicsInput): Promise<PersistTelematicsResult>
}

export interface IngestOptions {
  authoritativeAsset?: { assetType: 'tractor' | 'trailer'; assetId: string }
}

export interface IngestResult extends PersistTelematicsResult {
  duplicate: boolean
  assetType: 'tractor' | 'trailer'
  assetId: string
  tripId: string | null
}

function assertEnvelopeMatchesEvent(event: LocationEventInput, raw: TelematicsRawEnvelope): void {
  if (raw.provider !== event.provider) throw new Error('Raw provider does not match normalized provider')
  if (raw.deviceId !== event.deviceId) throw new Error('Raw device does not match normalized device')
  if (raw.providerEventId !== event.providerEventId) throw new Error('Raw provider event does not match normalized event')
  if (raw.rawEventRef !== event.rawEventRef) throw new Error('Raw event reference does not match normalized event')
  if (raw.receivedAt.getTime() !== event.receivedAt.getTime()) throw new Error('Raw received time does not match normalized event')
}

export async function ingestTelematicsEvent(
  event: LocationEventInput,
  raw: TelematicsRawEnvelope,
  repository: TelematicsIngestRepository,
  options: IngestOptions = {},
): Promise<IngestResult> {
  assertEnvelopeMatchesEvent(event, raw)

  let assetType: 'tractor' | 'trailer'
  let assetId: string

  if (options.authoritativeAsset) {
    assetType = options.authoritativeAsset.assetType
    assetId = options.authoritativeAsset.assetId
    if (event.deviceId) {
      throw new Error('Authoritative phone asset cannot be combined with a registered machine device')
    }
  } else {
    if (!event.deviceId) throw new Error('Unknown device: registered device identity is required')
    const device = await repository.findDevice(event.deviceId)
    if (!device || device.status !== 'active') throw new Error('Unknown device or inactive device')
    if (device.provider !== event.provider) throw new Error('Device provider does not match ingestion provider')

    const installation = await repository.resolveInstallation(event.deviceId, event.deviceTimestamp)
    if (!installation) throw new Error('Device has no installation at the event timestamp')
    assetType = installation.assetType
    assetId = installation.assetId
  }

  const duplicate = await repository.findDuplicate(raw, event)
  const tripId = await repository.resolveTrip(assetType, assetId, event.deviceTimestamp)
  if (duplicate) {
    return {
      duplicate: true,
      eventId: duplicate.eventId,
      rawEventRef: duplicate.rawEventRef,
      liveStateUpdated: false,
      legacyLocationId: null,
      assetType,
      assetId,
      tripId,
    }
  }

  const liveTimestamp = repository.getLiveStateTimestamp
    ? await repository.getLiveStateTimestamp(assetType, assetId)
    : null
  const updateLiveState = !liveTimestamp || event.deviceTimestamp.getTime() > liveTimestamp.getTime()

  const persisted = await repository.persist({
    event,
    raw,
    assetType,
    assetId,
    tripId,
    updateLiveState,
  })

  return {
    ...persisted,
    duplicate: false,
    assetType,
    assetId,
    tripId,
  }
}
