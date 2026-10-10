import { NextRequest, NextResponse } from 'next/server'

import { requireAuth } from '@/lib/auth-server'
import { db } from '@/lib/db'
import { preflightVideoRole, type VideoAccessActor } from '@/lib/domain/video/access'
import { parsePolicyList } from '@/lib/domain/video/privacy-policy'

interface RouteContext {
  params: Promise<{ deviceId: string }>
}

function actorFromAuth(auth: { userId: string; roleName: string; permissions: string[]; isDemo: boolean }): VideoAccessActor {
  return {
    userId: auth.userId,
    roleName: auth.roleName,
    permissions: auth.permissions,
    isDemo: auth.isDemo,
    clientId: null,
  }
}

export async function GET(request: NextRequest, context: RouteContext) {
  const auth = requireAuth(request)
  if (auth instanceof NextResponse) return auth

  const preflight = preflightVideoRole(actorFromAuth(auth), 'live')
  if (!preflight.allowed) {
    return NextResponse.json({ error: 'Video access is not permitted.' }, { status: 403 })
  }

  const { deviceId } = await context.params
  const device = await db.telematicsDevice.findUnique({
    where: { id: deviceId },
    select: {
      id: true,
      name: true,
      provider: true,
      status: true,
      cameraChannels: {
        where: { enabled: true },
        orderBy: { key: 'asc' },
        select: {
          key: true,
          label: true,
          orientation: true,
          privacyClass: true,
          enabled: true,
        },
      },
      videoRetentionPolicy: {
        select: {
          videoEnabled: true,
          supportsLive: true,
          supportsPlayback: true,
          supportsSnapshot: true,
          allowedRoles: true,
          allowedChannels: true,
        },
      },
    },
  })

  if (!device || device.status !== 'active' || !device.videoRetentionPolicy?.videoEnabled) {
    return NextResponse.json({ error: 'Video is unavailable.' }, { status: 404 })
  }

  const allowedRoles = parsePolicyList(device.videoRetentionPolicy.allowedRoles)
  if (allowedRoles != null && !allowedRoles.includes(auth.roleName)) {
    return NextResponse.json({ error: 'Video access is not permitted.' }, { status: 403 })
  }
  const allowedChannels = parsePolicyList(device.videoRetentionPolicy.allowedChannels)
  const canViewDriver = auth.roleName === 'Admin' || auth.permissions.includes('video.driver.view')
  const cameraChannels = device.cameraChannels.filter((channel) => {
    if (allowedChannels != null && !allowedChannels.includes(channel.key)) return false
    if (channel.privacyClass === 'driver' && !canViewDriver) return false
    return true
  })

  return NextResponse.json({
    deviceId: device.id,
    name: device.name,
    provider: device.provider,
    cameraChannels,
    videoRetentionPolicy: {
      videoEnabled: device.videoRetentionPolicy.videoEnabled,
      supportsLive: device.videoRetentionPolicy.supportsLive,
      supportsPlayback: device.videoRetentionPolicy.supportsPlayback,
      supportsSnapshot: device.videoRetentionPolicy.supportsSnapshot,
    },
  })
}
