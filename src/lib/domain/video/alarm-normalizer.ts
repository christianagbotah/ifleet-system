import { createHash } from 'node:crypto'

export type VideoAlarmType =
  | 'collision'
  | 'harsh_braking'
  | 'harsh_acceleration'
  | 'speeding'
  | 'fatigue'
  | 'distraction'
  | 'route_deviation'
  | 'panic_sos'
  | 'cargo_door'
  | 'unauthorized_stop'
  | 'power_tamper'
  | 'unknown'

export type VideoAlarmSeverity = 'info' | 'warning' | 'critical'

export interface VideoAlarmInput {
  provider: string
  deviceId: string
  providerEventId?: string | null
  alarmCode: string
  severity?: unknown
  occurredAt: string | Date
  message?: string | null
  latitude?: number | null
  longitude?: number | null
  channelKey?: string | null
  recordingRef?: string | null
}

export interface VideoAlarmContext {
  receivedAt: Date
  assetType: 'tractor' | 'trailer'
  assetId: string
  tripId: string | null
}

export interface NormalizedVideoAlarm {
  provider: string
  deviceId: string
  providerEventId: string | null
  dedupeKey: string
  alarmType: VideoAlarmType
  rawAlarmCode: string
  severity: VideoAlarmSeverity
  message: string | null
  occurredAt: Date
  receivedAt: Date
  assetType: 'tractor' | 'trailer'
  assetId: string
  tripId: string | null
  latitude: number | null
  longitude: number | null
  channelKey: string | null
  recordingRef: string | null
}

const ALARM_ALIASES: Record<string, VideoAlarmType> = {
  adas_collision_warning: 'collision',
  collision: 'collision',
  collision_warning: 'collision',
  hard_brake: 'harsh_braking',
  harsh_brake: 'harsh_braking',
  harsh_braking: 'harsh_braking',
  harsh_acceleration: 'harsh_acceleration',
  rapid_acceleration: 'harsh_acceleration',
  overspeed: 'speeding',
  over_speed: 'speeding',
  speeding: 'speeding',
  driver_fatigue: 'fatigue',
  fatigue: 'fatigue',
  drowsiness: 'fatigue',
  phone_use: 'distraction',
  distracted_driver: 'distraction',
  distraction: 'distraction',
  route_deviation: 'route_deviation',
  route_deviated: 'route_deviation',
  sos: 'panic_sos',
  panic: 'panic_sos',
  panic_sos: 'panic_sos',
  cargo_door_open: 'cargo_door',
  cargo_door: 'cargo_door',
  unauthorized_stop: 'unauthorized_stop',
  device_power_cut: 'power_tamper',
  power_cut: 'power_tamper',
  power_tamper: 'power_tamper',
}

function normalizeCode(value: string): string {
  return value.trim().toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '')
}

function normalizeSeverity(value: unknown): VideoAlarmSeverity {
  if (typeof value === 'number' && Number.isFinite(value)) {
    if (value >= 4) return 'critical'
    if (value >= 2) return 'warning'
    return 'info'
  }

  if (typeof value === 'string') {
    const normalized = value.trim().toLowerCase()
    if (['critical', 'high', 'severe', 'emergency', 'fatal'].includes(normalized)) return 'critical'
    if (['warning', 'medium', 'moderate', 'warn'].includes(normalized)) return 'warning'
    if (['info', 'low', 'minor', 'informational'].includes(normalized)) return 'info'
    const numeric = Number(normalized)
    if (Number.isFinite(numeric)) return normalizeSeverity(numeric)
  }

  return 'warning'
}

function asDate(value: string | Date): Date {
  const date = value instanceof Date ? new Date(value) : new Date(value)
  if (!Number.isFinite(date.getTime())) throw new Error('Video alarm occurredAt is invalid')
  return date
}

function optionalText(value: string | null | undefined): string | null {
  const normalized = value?.trim()
  return normalized ? normalized : null
}

export function createVideoAlarmDedupeKey(input: VideoAlarmInput): string {
  const provider = input.provider.trim().toLowerCase()
  const deviceId = input.deviceId.trim()
  const providerEventId = optionalText(input.providerEventId)

  const identity = providerEventId
    ? `event:${providerEventId}`
    : [
        'alarm',
        normalizeCode(input.alarmCode),
        asDate(input.occurredAt).toISOString(),
        input.latitude ?? '',
        input.longitude ?? '',
        optionalText(input.channelKey) ?? '',
        optionalText(input.recordingRef) ?? '',
        optionalText(input.message) ?? '',
      ].join(':')

  return createHash('sha256')
    .update(`${provider}\0${deviceId}\0${identity}`)
    .digest('hex')
}

export function normalizeVideoAlarm(
  input: VideoAlarmInput,
  context: VideoAlarmContext,
): NormalizedVideoAlarm {
  const provider = input.provider.trim().toLowerCase()
  const deviceId = input.deviceId.trim()
  const rawAlarmCode = input.alarmCode.trim()

  if (!provider) throw new Error('Video alarm provider is required')
  if (!deviceId) throw new Error('Video alarm deviceId is required')
  if (!rawAlarmCode) throw new Error('Video alarm code is required')
  if (!Number.isFinite(context.receivedAt.getTime())) throw new Error('Video alarm receivedAt is invalid')

  const normalizedCode = normalizeCode(rawAlarmCode)

  return {
    provider,
    deviceId,
    providerEventId: optionalText(input.providerEventId),
    dedupeKey: createVideoAlarmDedupeKey(input),
    alarmType: ALARM_ALIASES[normalizedCode] ?? 'unknown',
    rawAlarmCode,
    severity: normalizeSeverity(input.severity),
    message: optionalText(input.message),
    occurredAt: asDate(input.occurredAt),
    receivedAt: new Date(context.receivedAt),
    assetType: context.assetType,
    assetId: context.assetId,
    tripId: context.tripId,
    latitude: typeof input.latitude === 'number' && Number.isFinite(input.latitude) ? input.latitude : null,
    longitude: typeof input.longitude === 'number' && Number.isFinite(input.longitude) ? input.longitude : null,
    channelKey: optionalText(input.channelKey),
    recordingRef: optionalText(input.recordingRef),
  }
}
