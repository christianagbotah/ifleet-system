import { NextRequest, NextResponse } from 'next/server'

import { createAuditLog, getClientIp } from '@/lib/audit'
import { requireAuth, requireWriteAccess } from '@/lib/auth-server'
import { db } from '@/lib/db'
import { validateDeviceIdentity } from '@/lib/domain/telematics/device-registry'

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
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false
  return Object.keys(value as Record<string, unknown>).some((key) => RAW_CREDENTIAL_FIELDS.has(key.toLowerCase()))
}

function optionalText(value: unknown): string | null {
  if (typeof value !== 'string') return null
  const text = value.trim()
  return text || null
}

function parseCameraChannels(value: unknown) {
  if (!Array.isArray(value)) return []
  return value
    .map((entry) => {
      if (!entry || typeof entry !== 'object') return null
      const row = entry as Record<string, unknown>
      const key = optionalText(row.key)
      if (!key) return null
      return {
        key,
        label: optionalText(row.label) ?? key,
        orientation: optionalText(row.orientation) ?? 'unknown',
        privacyClass: optionalText(row.privacyClass) ?? 'exterior',
        enabled: row.enabled !== false,
      }
    })
    .filter((entry): entry is NonNullable<typeof entry> => Boolean(entry))
}

function parseVideoRetentionPolicy(value: unknown) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null
  const policy = value as Record<string, unknown>
  return {
    videoEnabled: policy.videoEnabled === true,
    supportsLive: policy.supportsLive === true,
    supportsPlayback: policy.supportsPlayback === true,
    supportsSnapshot: policy.supportsSnapshot === true,
  }
}

export async function GET(request: NextRequest) {
  const auth = requireAuth(request)
  if (auth instanceof NextResponse) return auth

  const { searchParams } = new URL(request.url)
  const search = searchParams.get('search')?.trim()
  const status = searchParams.get('status')?.trim()
  const provider = searchParams.get('provider')?.trim()
  const limit = Math.min(200, Math.max(1, Number.parseInt(searchParams.get('limit') || '100', 10) || 100))

  const where = {
    ...(status && status !== 'all' ? { status } : {}),
    ...(provider && provider !== 'all' ? { provider } : {}),
    ...(search
      ? {
          OR: [
            { name: { contains: search } },
            { imei: { contains: search } },
            { serialNumber: { contains: search } },
            { provider: { contains: search } },
          ],
        }
      : {}),
  }

  const [devices, total] = await Promise.all([
    db.telematicsDevice.findMany({
      where,
      include: {
        installations: {
          where: { uninstalledAt: null },
          orderBy: { installedAt: 'desc' },
          take: 1,
        },
        cameraChannels: { orderBy: { key: 'asc' } },
        videoRetentionPolicy: true,
      },
      orderBy: [{ status: 'asc' }, { name: 'asc' }],
      take: limit,
    }),
    db.telematicsDevice.count({ where }),
  ])

  return NextResponse.json({
    data: devices.map(({ installations, ...device }) => ({
      ...device,
      currentInstallation: installations[0] ?? null,
    })),
    total,
  })
}

export async function POST(request: NextRequest) {
  try {
    const auth = requireAuth(request)
    if (auth instanceof NextResponse) return auth
    const writeGuard = requireWriteAccess(auth)
    if (writeGuard instanceof NextResponse) return writeGuard

    const body = (await request.json().catch(() => null)) as Record<string, unknown> | null
    if (!body) return NextResponse.json({ error: 'Device payload is required' }, { status: 400 })
    if (containsRawCredential(body)) {
      return NextResponse.json(
        { error: 'Raw device credentials are not accepted. Store the provider secret server-side and submit credentialRef only.' },
        { status: 400 },
      )
    }

    const name = optionalText(body.name)
    const provider = optionalText(body.provider)
    const deviceType = optionalText(body.deviceType)
    const imei = optionalText(body.imei)
    const serialNumber = optionalText(body.serialNumber)
    const credentialRef = optionalText(body.credentialRef)
    const metadata = typeof body.metadata === 'string' ? body.metadata : body.metadata ? JSON.stringify(body.metadata) : null
    const cameraChannels = parseCameraChannels(body.cameraChannels)
    const videoRetentionPolicy = parseVideoRetentionPolicy(body.videoRetentionPolicy)

    if (!name || !provider || !deviceType) {
      return NextResponse.json({ error: 'name, provider and deviceType are required' }, { status: 400 })
    }
    if (!imei && !serialNumber) {
      return NextResponse.json({ error: 'IMEI or serial number is required' }, { status: 400 })
    }

    const existing = await db.telematicsDevice.findMany({
      select: { id: true, imei: true, serialNumber: true },
    })
    const identity = validateDeviceIdentity({ imei, serialNumber }, existing)
    if (!identity.valid) {
      return NextResponse.json(
        { error: `Device identity already exists: ${identity.conflicts.join(', ')}` },
        { status: 409 },
      )
    }

    const device = await db.telematicsDevice.create({
      data: {
        name,
        provider,
        deviceType,
        imei,
        serialNumber,
        credentialRef,
        metadata,
        status: 'active',
        ...(cameraChannels.length > 0 ? { cameraChannels: { create: cameraChannels } } : {}),
        ...(videoRetentionPolicy ? { videoRetentionPolicy: { create: videoRetentionPolicy } } : {}),
      },
      include: {
        cameraChannels: { orderBy: { key: 'asc' } },
        videoRetentionPolicy: true,
      },
    })

    createAuditLog({
      userId: auth.userId,
      action: 'create',
      entity: 'TelematicsDevice',
      entityId: device.id,
      details: { provider, deviceType, imei, serialNumber, hasCredentialRef: Boolean(credentialRef) },
      ipAddress: getClientIp(request),
    }).catch(() => {})

    return NextResponse.json(device, { status: 201 })
  } catch (error) {
    console.error('[Telematics Devices] Create error:', error)
    return NextResponse.json({ error: 'Failed to create telematics device' }, { status: 500 })
  }
}
