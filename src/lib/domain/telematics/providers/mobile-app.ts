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

function finiteNumber(value: unknown, field: string, options?: { min?: number; max?: number; nullable?: boolean }): number | null {
  if (value === null || value === undefined) {
    if (options?.nullable) return null
    throw new TelematicsNormalizationError(`${field} is required`)
  }
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    throw new TelematicsNormalizationError(`${field} must be a finite number`)
  }
  if (options?.min !== undefined && value < options.min) {
    throw new TelematicsNormalizationError(`${field} must be at least ${options.min}`)
  }
  if (options?.max !== undefined && value > options.max) {
    throw new TelematicsNormalizationError(`${field} must be at most ${options.max}`)
  }
  return value
}

function optionalString(value: unknown): string | null {
  if (typeof value !== 'string') return null
  const text = value.trim()
  return text || null
}

function deviceTime(payload: Record<string, unknown>, context: NormalizationContext): Date {
  if (payload.timestamp === null || payload.timestamp === undefined || payload.timestamp === '') return context.receivedAt
  const timestamp = new Date(String(payload.timestamp))
  if (Number.isNaN(timestamp.getTime())) throw new TelematicsNormalizationError('timestamp is invalid')
  return timestamp
}

function base(payload: Record<string, unknown>, context: NormalizationContext): NormalizedEventBase {
  const assetRef = optionalString(payload.truckId)
  if (!assetRef) throw new TelematicsNormalizationError('truckId is required')
  if (!(context.receivedAt instanceof Date) || Number.isNaN(context.receivedAt.getTime())) {
    throw new TelematicsNormalizationError('receivedAt is invalid')
  }
  if (!context.rawEventRef?.trim()) throw new TelematicsNormalizationError('rawEventRef is required')

  return {
    provider: 'mobile-app',
    deviceId: context.deviceId ?? null,
    providerEventId: context.providerEventId ?? null,
    source: 'phone',
    trust: 'phone',
    externalAssetRef: assetRef,
    deviceTimestamp: deviceTime(payload, context),
    receivedAt: context.receivedAt,
    rawEventRef: context.rawEventRef,
  }
}

export class MobileAppTelematicsProvider implements TelematicsProviderAdapter {
  readonly providerId = 'mobile-app'

  normalizeLocation(payload: unknown, context: NormalizationContext): LocationEventInput {
    const input = record(payload)
    const latitude = finiteNumber(input.latitude, 'latitude', { min: -90, max: 90 })!
    const longitude = finiteNumber(input.longitude, 'longitude', { min: -180, max: 180 })!
    const speedMps = finiteNumber(input.speed, 'speed', { min: 0, nullable: true })
    const heading = finiteNumber(input.heading, 'heading', { min: 0, max: 360, nullable: true })
    const accuracy = finiteNumber(input.accuracy, 'accuracy', { min: 0, nullable: true })

    return {
      ...base(input, context),
      kind: 'location',
      latitude,
      longitude,
      speedKph: speedMps === null ? null : Math.round(speedMps * 3.6 * 1000) / 1000,
      headingDeg: heading,
      accuracyMeters: accuracy,
    }
  }

  normalizeIgnition(payload: unknown, context: NormalizationContext): IgnitionEventInput {
    const input = record(payload)
    if (typeof input.ignitionOn !== 'boolean') throw new TelematicsNormalizationError('ignitionOn must be boolean')
    return { ...base(input, context), kind: 'ignition', ignitionOn: input.ignitionOn }
  }

  normalizeSensor(payload: unknown, context: NormalizationContext): SensorEventInput {
    const input = record(payload)
    const sensorType = optionalString(input.sensorType)
    if (!sensorType) throw new TelematicsNormalizationError('sensorType is required')
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
    const alarmType = optionalString(input.alarmType)
    if (!alarmType) throw new TelematicsNormalizationError('alarmType is required')
    const severity = optionalString(input.severity) ?? 'warning'
    if (!['info', 'warning', 'critical'].includes(severity)) {
      throw new TelematicsNormalizationError('alarm severity is invalid')
    }
    return {
      ...base(input, context),
      kind: 'alarm',
      alarmType,
      severity: severity as AlarmEventInput['severity'],
      message: optionalString(input.message),
    }
  }

  async healthCheck(context: ProviderHealthContext): Promise<ProviderHealth> {
    return { provider: this.providerId, healthy: true, checkedAt: context.checkedAt }
  }
}
