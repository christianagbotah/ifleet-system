import type {
  AlarmEventInput,
  IgnitionEventInput,
  LocationEventInput,
  NormalizationContext,
  SensorEventInput,
} from './events'

export interface ProviderHealthContext {
  checkedAt: Date
}

export interface ProviderHealth {
  provider: string
  healthy: boolean
  checkedAt: Date
  message?: string
}

export interface VideoDeviceRequest {
  deviceId: string
  channelKey: string
  credentialRef?: string | null
}

export interface LiveVideoRequest extends VideoDeviceRequest {}

export interface PlaybackClipRequest extends VideoDeviceRequest {
  startAt: Date
  endAt: Date
}

export interface SnapshotRequest extends VideoDeviceRequest {
  capturedAt?: Date
}

export interface VideoSessionDescriptor {
  url: string
  expiresAt: Date
  token?: string
  providerSessionId?: string
  contentType?: string
}

export interface TelematicsProviderAdapter {
  readonly providerId: string
  normalizeLocation(payload: unknown, context: NormalizationContext): LocationEventInput
  normalizeIgnition(payload: unknown, context: NormalizationContext): IgnitionEventInput
  normalizeSensor(payload: unknown, context: NormalizationContext): SensorEventInput
  normalizeAlarm(payload: unknown, context: NormalizationContext): AlarmEventInput
  healthCheck(context: ProviderHealthContext): Promise<ProviderHealth>
  requestLiveVideo?(request: LiveVideoRequest): Promise<VideoSessionDescriptor>
  requestPlaybackClip?(request: PlaybackClipRequest): Promise<VideoSessionDescriptor>
  requestSnapshot?(request: SnapshotRequest): Promise<VideoSessionDescriptor>
}

export class TelematicsNormalizationError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'TelematicsNormalizationError'
  }
}
