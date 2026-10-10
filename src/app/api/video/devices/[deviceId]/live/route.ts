import { NextRequest, NextResponse } from 'next/server'

import { getClientIp } from '@/lib/audit'
import { requireAuth } from '@/lib/auth-server'
import { db } from '@/lib/db'
import {
  preflightVideoRole,
  requestAuthorizedVideoSession,
  type VideoAccessActor,
  type VideoAccessReason,
} from '@/lib/domain/video/access'
import { createVideoAccessAudit } from '@/lib/domain/video/audit'
import type { CameraPrivacyClass } from '@/lib/domain/video/capabilities'
import { resolveVideoProvider } from '@/lib/domain/video/provider-resolver'
import { parsePolicyList } from '@/lib/domain/video/privacy-policy'

interface RouteContext {
  params: Promise<{ deviceId: string }>
}

function actorFromAuth(auth: {
  userId: string
  roleName: string
  permissions: string[]
  isDemo: boolean
}): VideoAccessActor {
  return {
    userId: auth.userId,
    roleName: auth.roleName,
    permissions: auth.permissions,
    isDemo: auth.isDemo,
    clientId: null,
  }
}

function privacyClass(value: string): CameraPrivacyClass {
  return value === 'road' || value === 'cargo' || value === 'exterior' ? value : 'driver'
}

function failureStatus(reason: VideoAccessReason): number {
  if (reason === 'provider_session_invalid') return 502
  if (reason === 'provider_unavailable' || reason === 'unavailable') return 503
  return 403
}

export async function POST(request: NextRequest, context: RouteContext) {
  const auth = requireAuth(request)
  if (auth instanceof NextResponse) return auth

  const { deviceId } = await context.params
  const actor = actorFromAuth(auth)
  const audit = createVideoAccessAudit(auth.userId, getClientIp(request))
  const preflight = preflightVideoRole(actor, 'live')
  if (!preflight.allowed) {
    await audit({
      actorId: auth.userId,
      deviceId,
      action: 'live',
      channelKey: 'unresolved',
      outcome: 'denied',
      reason: preflight.reason,
    })
    return NextResponse.json({ error: 'Video access is not permitted.' }, { status: 403 })
  }

  const body = (await request.json().catch(() => null)) as { channelKey?: unknown } | null
  const channelKey = typeof body?.channelKey === 'string' ? body.channelKey.trim() : ''
  if (!channelKey) {
    await audit({ actorId: auth.userId, deviceId, action: 'live', channelKey: 'unresolved', outcome: 'failed', reason: 'unavailable' })
    return NextResponse.json({ error: 'channelKey is required' }, { status: 400 })
  }

  const device = await db.telematicsDevice.findUnique({
    where: { id: deviceId },
    include: { cameraChannels: true, videoRetentionPolicy: true },
  })
  const channel = device?.cameraChannels.find((candidate) => candidate.enabled && candidate.key === channelKey)
  if (!device || device.status !== 'active' || !channel || !device.videoRetentionPolicy?.videoEnabled) {
    await audit({ actorId: auth.userId, deviceId, action: 'live', channelKey, outcome: 'failed', reason: 'unavailable' })
    return NextResponse.json({ error: 'Video is unavailable.' }, { status: 404 })
  }

  const provider = resolveVideoProvider(device.provider)
  if (!provider) {
    await audit({ actorId: auth.userId, deviceId, action: 'live', channelKey, outcome: 'failed', reason: 'provider_unavailable' })
    return NextResponse.json({ error: 'Video is unavailable.' }, { status: 503 })
  }

  const result = await requestAuthorizedVideoSession({
    actor,
    resource: {
      deviceId: device.id,
      provider: device.provider,
      credentialRef: device.credentialRef,
      channelKey: channel.key,
      privacyClass: privacyClass(channel.privacyClass),
      clientId: null,
      supportsLive: device.videoRetentionPolicy.supportsLive,
      supportsPlayback: device.videoRetentionPolicy.supportsPlayback,
      allowedRoles: parsePolicyList(device.videoRetentionPolicy.allowedRoles),
      allowedChannelKeys: parsePolicyList(device.videoRetentionPolicy.allowedChannels),
    },
    action: 'live',
    provider,
    audit,
  })

  if (!result.ok) {
    return NextResponse.json(
      { error: 'Video is unavailable or access is not permitted.' },
      { status: failureStatus(result.reason) },
    )
  }

  return NextResponse.json({
    provider: result.session.provider,
    url: result.session.url,
    token: result.session.token ?? null,
    expiresAt: result.session.expiresAt.toISOString(),
  })
}
