import type { CameraPrivacyClass } from './capabilities'
import type { TelematicsProviderAdapter, VideoSessionDescriptor } from '../telematics/provider'

export type VideoAccessAction = 'live' | 'playback'
export type VideoAccessReason =
  | 'demo_not_allowed'
  | 'role_not_allowed'
  | 'privacy_restricted'
  | 'resource_scope_mismatch'
  | 'unavailable'
  | 'provider_session_invalid'
  | 'provider_unavailable'
  | 'policy_role_restricted'
  | 'policy_channel_restricted'

export interface VideoAccessActor {
  userId: string
  roleName: string
  permissions: string[]
  isDemo: boolean
  clientId: string | null
}

export interface VideoAccessResource {
  deviceId: string
  provider: string
  credentialRef: string | null
  channelKey: string
  privacyClass: CameraPrivacyClass
  clientId: string | null
  supportsLive: boolean
  supportsPlayback: boolean
  allowedRoles?: string[] | null
  allowedChannelKeys?: string[] | null
}

export type VideoAccessDecision =
  | { allowed: true }
  | { allowed: false; reason: VideoAccessReason }

export interface VideoAccessAuditEvent {
  actorId: string
  deviceId: string
  action: VideoAccessAction
  channelKey: string
  outcome: 'allowed' | 'denied' | 'failed'
  reason?: VideoAccessReason
}

export type VideoAccessAudit = (event: VideoAccessAuditEvent) => Promise<void> | void

export type VideoSessionResult =
  | { ok: true; session: VideoSessionDescriptor }
  | { ok: false; reason: VideoAccessReason }

const MAX_SESSION_LIFETIME_MS = 5 * 60 * 1000

function hasPermission(actor: VideoAccessActor, permission: string): boolean {
  return actor.roleName === 'Admin' || actor.permissions.includes(permission)
}

function canUseVideoAction(actor: VideoAccessActor, action: VideoAccessAction): boolean {
  if (actor.roleName === 'Admin' || actor.roleName === 'Manager') return true
  return hasPermission(actor, action === 'live' ? 'video.live' : 'video.playback')
}

export function preflightVideoRole(actor: VideoAccessActor, action: VideoAccessAction): VideoAccessDecision {
  if (actor.isDemo) return { allowed: false, reason: 'demo_not_allowed' }
  if (actor.roleName === 'Driver') return { allowed: false, reason: 'role_not_allowed' }
  if (!canUseVideoAction(actor, action)) return { allowed: false, reason: 'role_not_allowed' }
  return { allowed: true }
}

export function authorizeVideoAccess(
  actor: VideoAccessActor,
  resource: VideoAccessResource,
  action: VideoAccessAction,
): VideoAccessDecision {
  const preflight = preflightVideoRole(actor, action)
  if (!preflight.allowed) return preflight

  if (actor.clientId && resource.clientId && actor.clientId !== resource.clientId) {
    return { allowed: false, reason: 'resource_scope_mismatch' }
  }

  if (resource.allowedRoles != null && !resource.allowedRoles.includes(actor.roleName)) {
    return { allowed: false, reason: 'policy_role_restricted' }
  }

  if (resource.allowedChannelKeys != null && !resource.allowedChannelKeys.includes(resource.channelKey)) {
    return { allowed: false, reason: 'policy_channel_restricted' }
  }

  const capabilityAvailable = action === 'live' ? resource.supportsLive : resource.supportsPlayback
  if (!capabilityAvailable) return { allowed: false, reason: 'unavailable' }

  if (resource.privacyClass === 'driver' && !hasPermission(actor, 'video.driver.view')) {
    return { allowed: false, reason: 'privacy_restricted' }
  }

  return { allowed: true }
}

function validSessionDescriptor(
  descriptor: VideoSessionDescriptor,
  resource: VideoAccessResource,
  now: Date,
): boolean {
  if (descriptor.provider !== resource.provider || descriptor.channelKey !== resource.channelKey) return false
  if (!(descriptor.expiresAt instanceof Date) || Number.isNaN(descriptor.expiresAt.getTime())) return false

  const remainingMs = descriptor.expiresAt.getTime() - now.getTime()
  if (remainingMs <= 0 || remainingMs > MAX_SESSION_LIFETIME_MS) return false

  try {
    const url = new URL(descriptor.url)
    return url.protocol === 'https:' || url.protocol === 'wss:'
  } catch {
    return false
  }
}

async function recordAudit(
  audit: VideoAccessAudit,
  actor: VideoAccessActor,
  resource: VideoAccessResource,
  action: VideoAccessAction,
  outcome: VideoAccessAuditEvent['outcome'],
  reason?: VideoAccessReason,
): Promise<void> {
  await audit({
    actorId: actor.userId,
    deviceId: resource.deviceId,
    action,
    channelKey: resource.channelKey,
    outcome,
    ...(reason ? { reason } : {}),
  })
}

export async function requestAuthorizedVideoSession(input: {
  actor: VideoAccessActor
  resource: VideoAccessResource
  action: VideoAccessAction
  provider: TelematicsProviderAdapter
  audit: VideoAccessAudit
  now?: Date
  playbackRange?: { from: Date; to: Date }
}): Promise<VideoSessionResult> {
  const now = input.now ?? new Date()
  const decision = authorizeVideoAccess(input.actor, input.resource, input.action)
  if (!decision.allowed) {
    await recordAudit(input.audit, input.actor, input.resource, input.action, 'denied', decision.reason)
    return { ok: false, reason: decision.reason }
  }

  if (input.provider.providerId !== input.resource.provider) {
    await recordAudit(input.audit, input.actor, input.resource, input.action, 'failed', 'provider_unavailable')
    return { ok: false, reason: 'provider_unavailable' }
  }

  try {
    let session: VideoSessionDescriptor
    if (input.action === 'live') {
      if (!input.provider.requestLiveVideo) {
        await recordAudit(input.audit, input.actor, input.resource, input.action, 'failed', 'provider_unavailable')
        return { ok: false, reason: 'provider_unavailable' }
      }
      session = await input.provider.requestLiveVideo({
        deviceId: input.resource.deviceId,
        channelKey: input.resource.channelKey,
        credentialRef: input.resource.credentialRef,
      })
    } else {
      if (!input.provider.requestPlaybackClip || !input.playbackRange) {
        await recordAudit(input.audit, input.actor, input.resource, input.action, 'failed', 'provider_unavailable')
        return { ok: false, reason: 'provider_unavailable' }
      }
      session = await input.provider.requestPlaybackClip({
        deviceId: input.resource.deviceId,
        channelKey: input.resource.channelKey,
        credentialRef: input.resource.credentialRef,
        from: input.playbackRange.from,
        to: input.playbackRange.to,
      })
    }

    if (!validSessionDescriptor(session, input.resource, now)) {
      await recordAudit(input.audit, input.actor, input.resource, input.action, 'failed', 'provider_session_invalid')
      return { ok: false, reason: 'provider_session_invalid' }
    }

    await recordAudit(input.audit, input.actor, input.resource, input.action, 'allowed')
    return { ok: true, session }
  } catch {
    await recordAudit(input.audit, input.actor, input.resource, input.action, 'failed', 'provider_unavailable')
    return { ok: false, reason: 'provider_unavailable' }
  }
}
