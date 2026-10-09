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

export interface VideoSessionRequest {
  deviceId: string
  channelKey: string
  credentialRef?: string | null
}

export interface VideoPlaybackRequest extends VideoSessionRequest {
  from: Date
  to: Date
}

export interface VideoSessionDescriptor {
  provider: string
  channelKey: string
  url: string
  token?: string
  expiresAt: Date
}

export interface TelematicsProviderAdapter {
  readonly providerId: string
  normalizeLocation(payload: unknown, context: NormalizationContext): LocationEventInput
  normalizeIgnition(payload: unknown, context: NormalizationContext): IgnitionEventInput
  normalizeSensor(payload: unknown, context: NormalizationContext): SensorEventInput
  normalizeAlarm(payload: unknown, context: NormalizationContext): AlarmEventInput
  healthCheck(context: ProviderHealthContext): Promise<ProviderHealth>
  requestLiveVideo?(request: VideoSessionRequest): Promise<VideoSessionDescriptor>
  requestPlaybackClip?(request: VideoPlaybackRequest): Promise<VideoSessionDescriptor>
  requestSnapshot?(request: VideoSessionRequest): Promise<VideoSessionDescriptor>
}

export class TelematicsNormalizationError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'TelematicsNormalizationError'
  }
}
