import { NextRequest, NextResponse } from 'next/server'

import { createAuditLog, getClientIp } from '@/lib/audit'
import { requireAuth, requireWriteAccess } from '@/lib/auth-server'
import { db } from '@/lib/db'
import {
  DEFAULT_VIDEO_ALLOWED_ROLES,
  normalizeRetentionDays,
  parsePolicyList,
  retainUntilFor,
  serializePolicyList,
} from '@/lib/domain/video/privacy-policy'

function safePolicy(policy: {
  id: string
  deviceId: string
  videoEnabled: boolean
  supportsLive: boolean
  supportsPlayback: boolean
  supportsSnapshot: boolean
  policyVersion: number
  effectiveAt: Date
  routineRetentionDays: number
  incidentRetentionDays: number
  applyToExisting: boolean
  cloudUploadEnabled: boolean
  allowedRoles: string | null
  allowedChannels: string | null
  privacyNoticeVersion: string
  privacyNoticeText: string | null
} | null) {
  if (!policy) return null
  return {
    ...policy,
    effectiveAt: policy.effectiveAt.toISOString(),
    allowedRoles: parsePolicyList(policy.allowedRoles) ?? [...DEFAULT_VIDEO_ALLOWED_ROLES],
    allowedChannels: parsePolicyList(policy.allowedChannels),
  }
}

export async function GET(request: NextRequest) {
  const auth = requireAuth(request)
  if (auth instanceof NextResponse) return auth
  const guard = requireWriteAccess(auth)
  if (guard instanceof NextResponse) return guard

  const devices = await db.telematicsDevice.findMany({
    where: { status: { not: 'decommissioned' } },
    select: {
      id: true,
      name: true,
      provider: true,
      status: true,
      cameraChannels: {
        where: { enabled: true },
        orderBy: { key: 'asc' },
        select: { key: true, label: true, privacyClass: true },
      },
      videoRetentionPolicy: true,
    },
    orderBy: { name: 'asc' },
  })

  return NextResponse.json({
    data: devices.map((device) => ({
      ...device,
      videoRetentionPolicy: safePolicy(device.videoRetentionPolicy),
    })),
  })
}

export async function PATCH(request: NextRequest) {
  try {
    const auth = requireAuth(request)
    if (auth instanceof NextResponse) return auth
    const guard = requireWriteAccess(auth)
    if (guard instanceof NextResponse) return guard

    const body = (await request.json().catch(() => null)) as Record<string, unknown> | null
    const deviceId = typeof body?.deviceId === 'string' ? body.deviceId.trim() : ''
    if (!deviceId) return NextResponse.json({ error: 'deviceId is required' }, { status: 400 })

    const device = await db.telematicsDevice.findUnique({
      where: { id: deviceId },
      include: { cameraChannels: { where: { enabled: true } }, videoRetentionPolicy: true },
    })
    if (!device) return NextResponse.json({ error: 'Telematics device not found' }, { status: 404 })

    const current = device.videoRetentionPolicy
    const routineRetentionDays = normalizeRetentionDays(body.routineRetentionDays, current?.routineRetentionDays ?? 7)
    const incidentRetentionDays = normalizeRetentionDays(body.incidentRetentionDays, current?.incidentRetentionDays ?? 30)
    if (incidentRetentionDays < routineRetentionDays) {
      return NextResponse.json({ error: 'Incident retention cannot be shorter than routine retention' }, { status: 400 })
    }

    const allowedRoles = serializePolicyList(body.allowedRoles, parsePolicyList(current?.allowedRoles) ?? [...DEFAULT_VIDEO_ALLOWED_ROLES])
    const allowedChannels = serializePolicyList(body.allowedChannels, parsePolicyList(current?.allowedChannels))
    const parsedChannels = parsePolicyList(allowedChannels)
    const channelKeys = new Set(device.cameraChannels.map((channel) => channel.key))
    if (parsedChannels?.some((key) => !channelKeys.has(key))) {
      return NextResponse.json({ error: 'allowedChannels contains a channel not installed on this device' }, { status: 400 })
    }

    const privacyNoticeVersion = typeof body.privacyNoticeVersion === 'string'
      ? body.privacyNoticeVersion.trim()
      : current?.privacyNoticeVersion ?? '1'
    if (!privacyNoticeVersion) return NextResponse.json({ error: 'privacyNoticeVersion is required' }, { status: 400 })
    const privacyNoticeText = typeof body.privacyNoticeText === 'string'
      ? body.privacyNoticeText.trim() || null
      : current?.privacyNoticeText ?? null
    const applyToExisting = body.applyToExisting === undefined ? false : body.applyToExisting === true
    const cloudUploadEnabled = body.cloudUploadEnabled === undefined ? current?.cloudUploadEnabled ?? false : body.cloudUploadEnabled === true
    const newVersion = (current?.policyVersion ?? 0) + 1
    const effectiveAt = new Date()

    const policy = await db.$transaction(async (tx) => {
      const updated = await tx.videoRetentionPolicy.upsert({
        where: { deviceId },
        update: {
          policyVersion: newVersion,
          effectiveAt,
          routineRetentionDays,
          incidentRetentionDays,
          applyToExisting,
          cloudUploadEnabled,
          allowedRoles,
          allowedChannels,
          privacyNoticeVersion,
          privacyNoticeText,
        },
        create: {
          deviceId,
          policyVersion: newVersion,
          effectiveAt,
          routineRetentionDays,
          incidentRetentionDays,
          applyToExisting,
          cloudUploadEnabled,
          allowedRoles,
          allowedChannels,
          privacyNoticeVersion,
          privacyNoticeText,
        },
      })

      if (applyToExisting) {
        const records = await tx.videoMediaRecord.findMany({
          where: { deviceId, deletedAt: null },
          select: { id: true, kind: true, recordedAt: true },
        })
        for (const record of records) {
          const kind = record.kind === 'incident' ? 'incident' as const : 'routine' as const
          await tx.videoMediaRecord.update({
            where: { id: record.id },
            data: {
              retentionPolicyVersion: newVersion,
              retainUntil: retainUntilFor(record.recordedAt, kind, routineRetentionDays, incidentRetentionDays),
            },
          })
        }
      }

      return updated
    }, { isolationLevel: 'Serializable' })

    createAuditLog({
      userId: auth.userId,
      action: 'video_privacy_policy_update',
      entity: 'VideoRetentionPolicy',
      entityId: policy.id,
      details: { deviceId, policyVersion: newVersion, applyToExisting, cloudUploadEnabled },
      ipAddress: getClientIp(request),
    }).catch(() => {})

    return NextResponse.json(safePolicy(policy))
  } catch (error) {
    if (error instanceof Error && error.message.startsWith('Retention days')) {
      return NextResponse.json({ error: error.message }, { status: 400 })
    }
    console.error('[Video Privacy] Update failed:', error)
    return NextResponse.json({ error: 'Failed to update video privacy policy' }, { status: 500 })
  }
}
