import { createHash } from 'node:crypto'

export type VideoAlarmType =
  | 'collision'
  | 'harsh-braking'
  | 'harsh-acceleration'
  | 'speeding'
  | 'fatigue'
  | 'distraction'
  | 'phone-use'
  | 'route-deviation'
  | 'panic-sos'
  | 'cargo-door'
  | 'unauthorized-stop'
  | 'device-power-tamper'
  | 'unknown'

export type VideoAlarmSeverity = 'info' | 'warning' | 'critical'

export interface VideoAlarmNormalizationInput {
  provider: string
  deviceId: string
  providerEventId: string | null
  providerCode: string
  occurredAt: Date
  receivedAt: Date
  assetType: 'tractor' | 'trailer' | null
  assetId: string | null
  tripId: string | null
  latitude?: number | null
  longitude?: number | null
  message?: string | null
  severity?: string | null
  channelKey?: string | null
}

export interface VideoAlarmEvent {
  provider: string
  deviceId: string
  providerEventId: string | null
  providerAlarmCode: string
  alarmType: VideoAlarmType
  severity: VideoAlarmSeverity
  occurredAt: Date
  receivedAt: Date
  assetType: 'tractor' | 'trailer' | null
  assetId: string | null
  tripId: string | null
  latitude: number | null
  longitude: number | null
  message: string | null
  channelKey: string | null
  dedupeKey: string
}

function canonicalCode(value: string): string {
  return value.trim().toLowerCase().replace(/[^a-z0-9]+/g, '-')
}

const TYPE_ALIASES: ReadonlyArray<[VideoAlarmType, readonly string[]]> = [
  ['collision', ['collision', 'crash', 'impact', 'adas-crash', 'adas-collision']],
  ['harsh-braking', ['hard-brake', 'hard-braking', 'harsh-brake', 'harsh-braking', 'emergency-brake']],
  ['harsh-acceleration', ['hard-acceleration', 'harsh-acceleration', 'rapid-acceleration']],
  ['speeding', ['speeding', 'overspeed', 'over-speed', 'speed-limit']],
  ['fatigue', ['fatigue', 'dms-fatigue', 'drowsy', 'drowsiness', 'driver-fatigue', 'yawn']],
  ['distraction', ['distraction', 'driver-distraction', 'dms-distraction', 'eyes-off-road']],
  ['phone-use', ['phone-use', 'mobile-phone', 'mobile-phone-use', 'phone', 'driver-phone']],
  ['route-deviation', ['route-deviation', 'off-route', 'route-violation']],
  ['panic-sos', ['panic', 'sos', 'panic-sos', 'emergency-sos']],
  ['cargo-door', ['cargo-door', 'cargo-door-open', 'door-open', 'trailer-door-open']],
  ['unauthorized-stop', ['unauthorized-stop', 'unplanned-stop', 'illegal-stop']],
  ['device-power-tamper', ['device-power-tamper', 'power-cut', 'power-disconnect', 'tamper', 'device-tamper']],
]

function normalizeType(providerCode: string): VideoAlarmType {
  const code = canonicalCode(providerCode)
  for (const [type, aliases] of TYPE_ALIASES) {
    if (aliases.includes(code)) return type
  }
  return 'unknown'
}

function defaultSeverity(type: VideoAlarmType): VideoAlarmSeverity {
  if (type === 'collision' || type === 'panic-sos' || type === 'fatigue' || type === 'device-power-tamper') {
    return 'critical'
  }
  return 'warning'
}

function normalizeSeverity(value: string | null | undefined, type: VideoAlarmType): VideoAlarmSeverity {
  const normalized = value?.trim().toLowerCase()
  if (normalized === 'info' || normalized === 'informational' || normalized === 'low') return 'info'
  if (normalized === 'warning' || normalized === 'warn' || normalized === 'medium') return 'warning'
  if (normalized === 'critical' || normalized === 'high' || normalized === 'severe') return 'critical'
  return defaultSeverity(type)
}

export function createVideoAlarmDedupeKey(
  provider: string,
  deviceId: string,
  providerEventId: string | null,
  occurredAt: Date,
  providerCode: string,
): string {
  const providerIdentity = providerEventId?.trim()
    ? `event:${providerEventId.trim()}`
    : `fallback:${occurredAt.toISOString()}:${canonicalCode(providerCode)}`
  return createHash('sha256')
    .update(`${provider.trim().toLowerCase()}\0${deviceId.trim()}\0${providerIdentity}`)
    .digest('hex')
}

export function normalizeVideoAlarm(input: VideoAlarmNormalizationInput): VideoAlarmEvent {
  const alarmType = normalizeType(input.providerCode)
  return {
    provider: input.provider.trim().toLowerCase(),
    deviceId: input.deviceId.trim(),
    providerEventId: input.providerEventId?.trim() || null,
    providerAlarmCode: input.providerCode.trim(),
    alarmType,
    severity: normalizeSeverity(input.severity, alarmType),
    occurredAt: input.occurredAt,
    receivedAt: input.receivedAt,
    assetType: input.assetType,
    assetId: input.assetId,
    tripId: input.tripId,
    latitude: input.latitude ?? null,
    longitude: input.longitude ?? null,
    message: input.message?.trim() || null,
    channelKey: input.channelKey?.trim() || null,
    dedupeKey: createVideoAlarmDedupeKey(
      input.provider,
      input.deviceId,
      input.providerEventId,
      input.occurredAt,
      input.providerCode,
    ),
  }
}
