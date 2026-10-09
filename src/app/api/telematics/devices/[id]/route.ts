import { NextRequest, NextResponse } from 'next/server'

import { createAuditLog, getClientIp } from '@/lib/audit'
import { requireAuth, requireWriteAccess } from '@/lib/auth-server'
import { db } from '@/lib/db'
import { installDevice, validateDeviceIdentity } from '@/lib/domain/telematics/device-registry'
import {
  normalizeVideoCapabilities,
  type CameraPrivacyClass,
} from '@/lib/domain/video/capabilities'

const RAW_CREDENTIAL_FIELDS = new Set([
  'credential',
  'credentialvalue',
  'credentialsecret',
  'apisecret',
  'apikey',
  'password',
  'token',
  'accesskey',
  'secret',
])

function containsRawCredential(value: unknown): boolean {
  if (!value || typeof value !== 'object') return false
  if (Array.isArray(value)) return value.some(containsRawCredential)
  return Object.entries(value as Record<string, unknown>).some(([key, nested]) => (
    RAW_CREDENTIAL_FIELDS.has(key.toLowerCase()) || containsRawCredential(nested)
  ))
}

function optionalText(value: unknown): string | null {
  if (typeof value !== 'string') return null
  const text = value.trim()
  return text || null
}

function privacyClass(value: unknown): CameraPrivacyClass | undefined {
  return value === 'road' || value === 'driver' || value === 'cargo' || value === 'exterior'
    ? value
    : undefined
}

function parseCameraChannels(value: unknown) {
  if (!Array.isArray(value)) return []
  return value.flatMap((raw, index) => {
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return []
    const channel = raw as Record<string, unknown>
    return [{
      key: optionalText(channel.channelKey) ?? optionalText(channel.key) ?? `channel-${index + 1}`,
      label: optionalText(channel.label) ?? undefined,
      orientation: optionalText(channel.orientation) ?? undefined,
      privacyClass: privacyClass(channel.privacyClass),
      enabled: channel.enabled !== false && channel.isEnabled !== false,
    }]
  })
}

async function ensureAssetExists(assetType: 'tractor' | 'trailer', assetId: string) {
  if (assetType === 'tractor') {
    return db.truck.findUnique({ where: { id: assetId }, select: { id: true, plateNumber: true } })
  }
  return db.trailer.findUnique({ where: { id: assetId }, select: { id: true, plateNumber: true } })
}

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const auth = requireAuth(request)
  if (auth instanceof NextResponse) return auth
  const { id } = await params
  const device = await db.telematicsDevice.findUnique({
    where: { id },
    include: {
      installations: { orderBy: { installedAt: 'desc' }, take: 100 },
      cameraChannels: { orderBy: [{ isEnabled: 'desc' }, { channelKey: 'asc' }] },
    },
  })
  if (!device) return NextResponse.json({ error: 'Telematics device not found' }, { status: 404 })
  return NextResponse.json(device)
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const auth = requireAuth(request)
    if (auth instanceof NextResponse) return auth
    const writeGuard = requireWriteAccess(auth)
    if (writeGuard instanceof NextResponse) return writeGuard

    const { id } = await params
    const body = (await request.json().catch(() => null)) as Record<string, unknown> | null
    if (!body) return NextResponse.json({ error: 'Device payload is required' }, { status: 400 })
    if (containsRawCredential(body)) {
      return NextResponse.json(
        { error: 'Raw device credentials are not accepted. Store the provider secret server-side and submit credentialRef only.' },
        { status: 400 },
      )
    }

    const existingDevice = await db.telematicsDevice.findUnique({ where: { id }, select: { id: true } })
    if (!existingDevice) return NextResponse.json({ error: 'Telematics device not found' }, { status: 404 })

    if (body.action === 'configure-video') {
      const capabilities = normalizeVideoCapabilities({
        videoEnabled: body.videoEnabled === true,
        supportsLive: body.supportsLiveVideo === true,
        supportsPlayback: body.supportsVideoPlayback === true,
        supportsSnapshot: body.supportsVideoSnapshot === true,
        channels: parseCameraChannels(body.channels),
      })

      const configured = await db.$transaction(async (tx) => {
        await tx.telematicsDevice.update({
          where: { id },
          data: {
            videoEnabled: capabilities.supported,
            supportsLiveVideo: capabilities.liveView,
            supportsVideoPlayback: capabilities.playback,
            supportsVideoSnapshot: capabilities.snapshot,
          },
        })

        const configuredKeys = capabilities.channels.map((channel) => channel.key)
        if (configuredKeys.length > 0) {
          await tx.cameraChannel.updateMany({
            where: { deviceId: id, channelKey: { notIn: configuredKeys } },
            data: { isEnabled: false },
          })
        } else {
          await tx.cameraChannel.updateMany({ where: { deviceId: id }, data: { isEnabled: false } })
        }

        for (const channel of capabilities.channels) {
          await tx.cameraChannel.upsert({
            where: { deviceId_channelKey: { deviceId: id, channelKey: channel.key } },
            update: {
              label: channel.label,
              orientation: channel.orientation,
              privacyClass: channel.privacyClass,
              isEnabled: channel.enabled,
              supportsLive: capabilities.liveView,
              supportsPlayback: capabilities.playback,
              supportsSnapshot: capabilities.snapshot,
            },
            create: {
              deviceId: id,
              channelKey: channel.key,
              label: channel.label,
              orientation: channel.orientation,
              privacyClass: channel.privacyClass,
              isEnabled: channel.enabled,
              supportsLive: capabilities.liveView,
              supportsPlayback: capabilities.playback,
              supportsSnapshot: capabilities.snapshot,
            },
          })
        }

        return tx.telematicsDevice.findUnique({
          where: { id },
          include: { cameraChannels: { orderBy: [{ isEnabled: 'desc' }, { channelKey: 'asc' }] } },
        })
      }, { isolationLevel: 'Serializable' })

      createAuditLog({
        userId: auth.userId,
        action: 'configure_video',
        entity: 'TelematicsDevice',
        entityId: id,
        details: {
          videoEnabled: capabilities.supported,
          supportsLiveVideo: capabilities.liveView,
          supportsVideoPlayback: capabilities.playback,
          supportsVideoSnapshot: capabilities.snapshot,
          channelCount: capabilities.channels.length,
        },
        ipAddress: getClientIp(request),
      }).catch(() => {})

      return NextResponse.json(configured)
    }

    if (body.action === 'install') {
      const assetType = body.assetType === 'tractor' || body.assetType === 'trailer' ? body.assetType : null
      const assetId = optionalText(body.assetId)
      const installedAt = body.installedAt ? new Date(String(body.installedAt)) : new Date()
      if (!assetType || !assetId || Number.isNaN(installedAt.getTime())) {
        return NextResponse.json({ error: 'Valid assetType, assetId and installedAt are required' }, { status: 400 })
      }

      const asset = await ensureAssetExists(assetType, assetId)
      if (!asset) return NextResponse.json({ error: `${assetType} asset not found` }, { status: 404 })

      const result = await db.$transaction(async (tx) => {
        const history = await tx.deviceInstallationHistory.findMany({
          where: { deviceId: id },
          orderBy: { installedAt: 'asc' },
        })
        const decision = installDevice(
          { deviceId: id, assetType, assetId, installedAt },
          history,
        )
        if (!decision.accepted) return { kind: 'conflict' as const, decision }

        if (decision.binding?.installationId) {
          const installation = await tx.deviceInstallationHistory.findUnique({
            where: { id: decision.binding.installationId },
          })
          return { kind: 'existing' as const, installation }
        }

        if (decision.closeInstallationId && decision.closeAt) {
          await tx.deviceInstallationHistory.update({
            where: { id: decision.closeInstallationId },
            data: { uninstalledAt: decision.closeAt },
          })
        }

        const installation = await tx.deviceInstallationHistory.create({
          data: {
            deviceId: id,
            assetType,
            assetId,
            installedAt,
            installedById: auth.userId,
            notes: optionalText(body.notes),
          },
        })
        await tx.telematicsDevice.update({ where: { id }, data: { status: 'active' } })
        return { kind: 'created' as const, installation }
      }, { isolationLevel: 'Serializable' })

      if (result.kind === 'conflict') {
        return NextResponse.json({ error: 'Installation overlaps existing device history' }, { status: 409 })
      }

      createAuditLog({
        userId: auth.userId,
        action: 'install',
        entity: 'TelematicsDevice',
        entityId: id,
        details: { assetType, assetId, installedAt: installedAt.toISOString() },
        ipAddress: getClientIp(request),
      }).catch(() => {})
      return NextResponse.json(result.installation)
    }

    if (body.action === 'uninstall') {
      const uninstalledAt = body.uninstalledAt ? new Date(String(body.uninstalledAt)) : new Date()
      if (Number.isNaN(uninstalledAt.getTime())) {
        return NextResponse.json({ error: 'Invalid uninstalledAt value' }, { status: 400 })
      }
      const installation = await db.$transaction(async (tx) => {
        const active = await tx.deviceInstallationHistory.findFirst({
          where: { deviceId: id, uninstalledAt: null },
          orderBy: { installedAt: 'desc' },
        })
        if (!active) return null
        if (uninstalledAt < active.installedAt) throw new Error('UNINSTALL_BEFORE_INSTALL')
        return tx.deviceInstallationHistory.update({
          where: { id: active.id },
          data: { uninstalledAt },
        })
      }, { isolationLevel: 'Serializable' })
      if (!installation) return NextResponse.json({ error: 'Device has no active installation' }, { status: 409 })

      createAuditLog({
        userId: auth.userId,
        action: 'uninstall',
        entity: 'TelematicsDevice',
        entityId: id,
        details: { installationId: installation.id, uninstalledAt: uninstalledAt.toISOString() },
        ipAddress: getClientIp(request),
      }).catch(() => {})
      return NextResponse.json(installation)
    }

    const current = await db.telematicsDevice.findUnique({ where: { id } })
    if (!current) return NextResponse.json({ error: 'Telematics device not found' }, { status: 404 })

    const imei = body.imei === undefined ? current.imei : optionalText(body.imei)
    const serialNumber = body.serialNumber === undefined ? current.serialNumber : optionalText(body.serialNumber)
    if (!imei && !serialNumber) return NextResponse.json({ error: 'IMEI or serial number is required' }, { status: 400 })

    const identities = await db.telematicsDevice.findMany({ select: { id: true, imei: true, serialNumber: true } })
    const identity = validateDeviceIdentity({ id, imei, serialNumber }, identities)
    if (!identity.valid) {
      return NextResponse.json({ error: `Device identity already exists: ${identity.conflicts.join(', ')}` }, { status: 409 })
    }

    const update = {
      ...(body.name !== undefined ? { name: optionalText(body.name) ?? current.name } : {}),
      ...(body.provider !== undefined ? { provider: optionalText(body.provider) ?? current.provider } : {}),
      ...(body.deviceType !== undefined ? { deviceType: optionalText(body.deviceType) ?? current.deviceType } : {}),
      ...(body.imei !== undefined ? { imei } : {}),
      ...(body.serialNumber !== undefined ? { serialNumber } : {}),
      ...(body.credentialRef !== undefined ? { credentialRef: optionalText(body.credentialRef) } : {}),
      ...(body.status !== undefined ? { status: optionalText(body.status) ?? current.status } : {}),
      ...(body.metadata !== undefined
        ? { metadata: typeof body.metadata === 'string' ? body.metadata : body.metadata ? JSON.stringify(body.metadata) : null }
        : {}),
    }
    const updated = await db.telematicsDevice.update({ where: { id }, data: update })

    createAuditLog({
      userId: auth.userId,
      action: 'update',
      entity: 'TelematicsDevice',
      entityId: id,
      details: { fields: Object.keys(update) },
      ipAddress: getClientIp(request),
    }).catch(() => {})
    return NextResponse.json(updated)
  } catch (error) {
    if (error instanceof Error && error.message === 'UNINSTALL_BEFORE_INSTALL') {
      return NextResponse.json({ error: 'Uninstall time cannot precede install time' }, { status: 409 })
    }
    console.error('[Telematics Device] Update error:', error)
    return NextResponse.json({ error: 'Failed to update telematics device' }, { status: 500 })
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const auth = requireAuth(request)
    if (auth instanceof NextResponse) return auth
    const writeGuard = requireWriteAccess(auth)
    if (writeGuard instanceof NextResponse) return writeGuard
    const { id } = await params
    const now = new Date()

    const result = await db.$transaction(async (tx) => {
      const device = await tx.telematicsDevice.findUnique({ where: { id } })
      if (!device) return null
      await tx.deviceInstallationHistory.updateMany({
        where: { deviceId: id, uninstalledAt: null },
        data: { uninstalledAt: now },
      })
      return tx.telematicsDevice.update({ where: { id }, data: { status: 'decommissioned' } })
    }, { isolationLevel: 'Serializable' })

    if (!result) return NextResponse.json({ error: 'Telematics device not found' }, { status: 404 })
    createAuditLog({
      userId: auth.userId,
      action: 'decommission',
      entity: 'TelematicsDevice',
      entityId: id,
      details: { at: now.toISOString() },
      ipAddress: getClientIp(request),
    }).catch(() => {})
    return NextResponse.json(result)
  } catch (error) {
    console.error('[Telematics Device] Delete error:', error)
    return NextResponse.json({ error: 'Failed to decommission telematics device' }, { status: 500 })
  }
}
