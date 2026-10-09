import type {
  AlarmEventInput,
  IgnitionEventInput,
  LocationEventInput,
  NormalizationContext,
  NormalizedEventBase,
  SensorEventInput,
} from '../events'
import type { ProviderHealth, ProviderHealthContext, TelematicsProviderAdapter } from '../provider'
import { TelematicsNormalizationError } from '../provider'

function record(payload: unknown): Record<string, unknown> {
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
    throw new TelematicsNormalizationError('Provider payload must be an object')
  }
  return payload as Record<string, unknown>
}

function stringValue(value: unknown, field: string): string {
  if (typeof value !== 'string' || !value.trim()) throw new TelematicsNormalizationError(`${field} is required`)
  return value.trim()
}

function optionalString(value: unknown): string | null {
  return typeof value === 'string' && value.trim() ? value.trim() : null
}

function numberValue(value: unknown, field: string, options?: { min?: number; max?: number; nullable?: boolean }): number | null {
  if (value === null || value === undefined) {
    if (options?.nullable) return null
    throw new TelematicsNormalizationError(`${field} is required`)
  }
  if (typeof value !== 'number' || !Number.isFinite(value)) throw new TelematicsNormalizationError(`${field} must be finite`)
  if (options?.min !== undefined && value < options.min) throw new TelematicsNormalizationError(`${field} must be at least ${options.min}`)
  if (options?.max !== undefined && value > options.max) throw new TelematicsNormalizationError(`${field} must be at most ${options.max}`)
  return value
}

function base(payload: Record<string, unknown>, context: NormalizationContext): NormalizedEventBase {
  const assetRef = optionalString(payload.assetRef) ?? context.deviceId ?? 'unresolved-device'
  if (!(context.receivedAt instanceof Date) || Number.isNaN(context.receivedAt.getTime())) {
    throw new TelematicsNormalizationError('receivedAt is invalid')
  }
  if (!context.rawEventRef?.trim()) throw new TelematicsNormalizationError('rawEventRef is required')
  const timeValue = payload.deviceTime ?? payload.timestamp
  const timestamp = timeValue ? new Date(String(timeValue)) : context.receivedAt
  if (Number.isNaN(timestamp.getTime())) throw new TelematicsNormalizationError('deviceTime is invalid')

  return {
    provider: 'generic-http',
    deviceId: context.deviceId ?? null,
    providerEventId: optionalString(payload.eventId) ?? context.providerEventId ?? null,
    source: 'hardwired',
    trust: 'hardwired',
    externalAssetRef: assetRef,
    deviceTimestamp: timestamp,
    receivedAt: context.receivedAt,
    rawEventRef: context.rawEventRef,
  }
}

export class GenericHttpTelematicsProvider implements TelematicsProviderAdapter {
  readonly providerId = 'generic-http'

  normalizeLocation(payload: unknown, context: NormalizationContext): LocationEventInput {
    const input = record(payload)
    return {
      ...base(input, context),
      kind: 'location',
      latitude: numberValue(input.lat, 'latitude', { min: -90, max: 90 })!,
      longitude: numberValue(input.lon, 'longitude', { min: -180, max: 180 })!,
      speedKph: numberValue(input.speedKph, 'speedKph', { min: 0, nullable: true }),
      headingDeg: numberValue(input.headingDeg, 'headingDeg', { min: 0, max: 360, nullable: true }),
      accuracyMeters: numberValue(input.accuracyMeters, 'accuracyMeters', { min: 0, nullable: true }),
    }
  }

  normalizeIgnition(payload: unknown, context: NormalizationContext): IgnitionEventInput {
    const input = record(payload)
    if (typeof input.ignitionOn !== 'boolean') throw new TelematicsNormalizationError('ignitionOn must be boolean')
    return { ...base(input, context), kind: 'ignition', ignitionOn: input.ignitionOn }
  }

  normalizeSensor(payload: unknown, context: NormalizationContext): SensorEventInput {
    const input = record(payload)
    const sensorType = stringValue(input.sensorType, 'sensorType')
    const value = input.value
    if (value !== null && !['number', 'string', 'boolean'].includes(typeof value)) {
      throw new TelematicsNormalizationError('sensor value must be scalar')
    }
    return {
      ...base(input, context),
      kind: 'sensor',
      sensorType,
      value: value as number | string | boolean | null,
      unit: optionalString(input.unit),
    }
  }

  normalizeAlarm(payload: unknown, context: NormalizationContext): AlarmEventInput {
    const input = record(payload)
    const severity = optionalString(input.severity) ?? 'warning'
    if (!['info', 'warning', 'critical'].includes(severity)) throw new TelematicsNormalizationError('alarm severity is invalid')
    return {
      ...base(input, context),
      kind: 'alarm',
      alarmType: stringValue(input.alarmType, 'alarmType'),
      severity: severity as AlarmEventInput['severity'],
      message: optionalString(input.message),
    }
  }

  async healthCheck(context: ProviderHealthContext): Promise<ProviderHealth> {
    return { provider: this.providerId, healthy: true, checkedAt: context.checkedAt }
  }
}
