export type CameraOrientation = 'front' | 'cabin' | 'rear' | 'left' | 'right' | 'cargo' | 'unknown'
export type CameraPrivacyClass = 'road' | 'driver' | 'cargo' | 'exterior'

export interface CameraChannelInput {
  key: string
  label?: string
  orientation?: string
  privacyClass?: CameraPrivacyClass
  enabled?: boolean
}

export interface VideoCapabilityInput {
  videoEnabled?: boolean
  supportsLive?: boolean
  supportsPlayback?: boolean
  supportsSnapshot?: boolean
  channels?: CameraChannelInput[]
}

export interface CameraChannel {
  key: string
  label: string
  orientation: CameraOrientation
  privacyClass: CameraPrivacyClass
  enabled: boolean
}

export interface VideoCapabilities {
  supported: boolean
  liveView: boolean
  playback: boolean
  snapshot: boolean
  channels: CameraChannel[]
  availableChannels: string[]
}

export interface VideoRetentionPolicy {
  routineRetentionDays: number
  incidentRetentionDays: number
  cloudCopyEnabled: boolean
  legalHoldEnabled: boolean
  allowedPrivacyClasses: CameraPrivacyClass[]
  privacyNoticeVersion?: string | null
}

function normalizeOrientation(value: string | undefined): CameraOrientation {
  const normalized = value?.trim().toLowerCase().replace(/[_\s]+/g, '-') ?? ''

  if (['front', 'front-road', 'road', 'forward'].includes(normalized)) return 'front'
  if (['cabin', 'driver', 'driver-facing', 'inside', 'interior'].includes(normalized)) return 'cabin'
  if (['rear', 'back', 'rear-road'].includes(normalized)) return 'rear'
  if (['left', 'side-left', 'left-side', 'kerb', 'curb'].includes(normalized)) return 'left'
  if (['right', 'side-right', 'right-side'].includes(normalized)) return 'right'
  if (['cargo', 'load', 'trailer', 'cargo-area'].includes(normalized)) return 'cargo'
  return 'unknown'
}

function defaultPrivacyClass(orientation: CameraOrientation): CameraPrivacyClass {
  if (orientation === 'front') return 'road'
  if (orientation === 'cabin') return 'driver'
  if (orientation === 'cargo') return 'cargo'
  return 'exterior'
}

export function normalizeVideoCapabilities(input: VideoCapabilityInput): VideoCapabilities {
  if (input.videoEnabled !== true) {
    return {
      supported: false,
      liveView: false,
      playback: false,
      snapshot: false,
      channels: [],
      availableChannels: [],
    }
  }

  const channels = (input.channels ?? []).map((channel, index): CameraChannel => {
    const orientation = normalizeOrientation(channel.orientation)
    const key = channel.key.trim() || `channel-${index + 1}`
    return {
      key,
      label: channel.label?.trim() || key,
      orientation,
      privacyClass: channel.privacyClass ?? defaultPrivacyClass(orientation),
      enabled: channel.enabled !== false,
    }
  })

  return {
    supported: true,
    liveView: input.supportsLive === true,
    playback: input.supportsPlayback === true,
    snapshot: input.supportsSnapshot === true,
    channels,
    availableChannels: channels.filter((channel) => channel.enabled).map((channel) => channel.key),
  }
}
