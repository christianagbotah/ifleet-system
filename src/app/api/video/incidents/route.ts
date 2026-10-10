import { NextRequest, NextResponse } from 'next/server'

import { requireAuth } from '@/lib/auth-server'
import { db } from '@/lib/db'
import { preflightVideoRole, type VideoAccessActor } from '@/lib/domain/video/access'

function actorFromAuth(auth: { userId: string; roleName: string; permissions: string[]; isDemo: boolean }): VideoAccessActor {
  return {
    userId: auth.userId,
    roleName: auth.roleName,
    permissions: auth.permissions,
    isDemo: auth.isDemo,
    clientId: null,
  }
}

export async function GET(request: NextRequest) {
  const auth = requireAuth(request)
  if (auth instanceof NextResponse) return auth

  const actor = actorFromAuth(auth)
  const preflight = preflightVideoRole(actor, 'playback')
  if (!preflight.allowed) {
    return NextResponse.json({ error: 'Video access is not permitted.' }, { status: 403 })
  }

  const { searchParams } = new URL(request.url)
  const deviceId = searchParams.get('deviceId')?.trim()
  const tripId = searchParams.get('tripId')?.trim()
  const severity = searchParams.get('severity')?.trim()
  const status = searchParams.get('status')?.trim()
  const limit = Math.min(100, Math.max(1, Number.parseInt(searchParams.get('limit') || '30', 10) || 30))

  const incidents = await db.videoIncident.findMany({
    where: {
      ...(deviceId ? { deviceId } : {}),
      ...(tripId ? { tripId } : {}),
      ...(severity && severity !== 'all' ? { severity } : {}),
      ...(status && status !== 'all' ? { status } : {}),
    },
    include: {
      alarmEvent: {
        select: {
          channelKey: true,
          provider: true,
          providerAlarmCode: true,
          latitude: true,
          longitude: true,
          message: true,
        },
      },
    },
    orderBy: { occurredAt: 'desc' },
    take: limit,
  })

  return NextResponse.json({
    data: incidents.map((incident) => ({
      id: incident.id,
      deviceId: incident.deviceId,
      tripId: incident.tripId,
      assetType: incident.assetType,
      assetId: incident.assetId,
      incidentType: incident.incidentType,
      severity: incident.severity,
      status: incident.status,
      title: incident.title,
      message: incident.message,
      latitude: incident.latitude ?? incident.alarmEvent.latitude,
      longitude: incident.longitude ?? incident.alarmEvent.longitude,
      occurredAt: incident.occurredAt.toISOString(),
      channelKey: incident.alarmEvent.channelKey,
      provider: incident.alarmEvent.provider,
      providerAlarmCode: incident.alarmEvent.providerAlarmCode,
    })),
  })
}
