import { NextResponse } from 'next/server'

import { normalizeVideoAlarm } from '@/lib/domain/video/alarm-normalizer'
import { persistVideoIncident } from '@/lib/domain/video/incident-service'
import { FilesystemNonceStore, verifyMachineRequest } from '@/lib/security/machine-auth'

interface RouteContext {
  params: Promise<{ provider: string }>
}

function machineCredential() {
  const keyId = process.env.MACHINE_INGEST_KEY_ID?.trim()
  const secret = process.env.MACHINE_INGEST_SECRET?.trim()
  return keyId && secret ? { keyId, secret } : null
}

function optionalString(value: unknown): string | null {
  return typeof value === 'string' && value.trim() ? value.trim() : null
}

function optionalCoordinate(value: unknown, min: number, max: number): number | null {
  if (value === undefined || value === null || value === '') return null
  const number = typeof value === 'number' ? value : Number(value)
  if (!Number.isFinite(number) || number < min || number > max) {
    throw new Error('Invalid video alarm coordinates')
  }
  return number
}

function deviceReference(payload: Record<string, unknown>): string | null {
  return [payload.deviceId, payload.imei, payload.serialNumber, payload.deviceRef]
    .find((value): value is string => typeof value === 'string' && value.trim().length > 0)
    ?.trim() ?? null
}

function alarmTimestamp(payload: Record<string, unknown>, receivedAt: Date): Date {
  const source = payload.occurredAt ?? payload.deviceTime ?? payload.timestamp
  if (source === undefined || source === null || source === '') return receivedAt
  const timestamp = new Date(String(source))
  if (Number.isNaN(timestamp.getTime())) throw new Error('Invalid video alarm timestamp')
  return timestamp
}

function isUniqueConflict(error: unknown): boolean {
  return Boolean(error && typeof error === 'object' && 'code' in error && error.code === 'P2002')
}

export async function POST(request: Request, context: RouteContext) {
  const { provider } = await context.params
  if (provider !== 'generic-http') {
    return NextResponse.json({ error: 'Unsupported video provider' }, { status: 404 })
  }

  const credential = machineCredential()
  if (!credential) {
    return NextResponse.json({ error: 'Machine ingestion is not configured' }, { status: 503 })
  }

  const nonceStore = new FilesystemNonceStore(
    process.env.MACHINE_NONCE_DIR?.trim() || '/tmp/ifleetpro-machine-nonces',
  )
  const auth = await verifyMachineRequest(request, credential, { nonceStore })
  if (!auth.ok) {
    return NextResponse.json({ error: 'Unauthorized machine request' }, { status: 401 })
  }

  try {
    const [databaseModule, telematicsModule, incidentModule] = await Promise.all([
      import('@/lib/db'),
      import('@/lib/domain/telematics/prisma-ingest-repository'),
      import('@/lib/domain/video/prisma-incident-repository'),
    ])
    const { db } = databaseModule
    const { PrismaTelematicsIngestRepository } = telematicsModule
    const { PrismaVideoIncidentRepository } = incidentModule

    const payload = JSON.parse(await request.text()) as Record<string, unknown>
    const deviceRef = deviceReference(payload)
    if (!deviceRef) {
      return NextResponse.json({ error: 'deviceId, imei, serialNumber or deviceRef is required' }, { status: 400 })
    }

    const providerCode = optionalString(payload.alarmCode)
      ?? optionalString(payload.alarmType)
      ?? optionalString(payload.code)
    if (!providerCode) {
      return NextResponse.json({ error: 'alarmCode, alarmType or code is required' }, { status: 400 })
    }

    const receivedAt = new Date()
    const occurredAt = alarmTimestamp(payload, receivedAt)
    const telematics = new PrismaTelematicsIngestRepository()
    const device = await telematics.findDevice(deviceRef)
    if (!device || device.status !== 'active') {
      return NextResponse.json({ error: 'Unknown device or inactive device' }, { status: 422 })
    }
    if (device.provider !== provider) {
      return NextResponse.json({ error: 'Device provider does not match ingestion provider' }, { status: 422 })
    }

    const installation = await telematics.resolveInstallation(device.id, occurredAt)
    if (!installation) {
      return NextResponse.json({ error: 'Device has no installation at the event timestamp' }, { status: 422 })
    }

    const tripId = await telematics.resolveTrip(installation.assetType, installation.assetId, occurredAt)
    let latitude = optionalCoordinate(payload.lat ?? payload.latitude, -90, 90)
    let longitude = optionalCoordinate(payload.lon ?? payload.lng ?? payload.longitude, -180, 180)

    if (latitude === null || longitude === null) {
      const live = await db.vehicleLiveState.findUnique({
        where: {
          assetType_assetId: {
            assetType: installation.assetType,
            assetId: installation.assetId,
          },
        },
        select: { latitude: true, longitude: true },
      })
      latitude ??= live?.latitude ?? null
      longitude ??= live?.longitude ?? null
    }

    const event = normalizeVideoAlarm({
      provider,
      deviceId: device.id,
      providerEventId: optionalString(payload.eventId) ?? optionalString(payload.providerEventId),
      providerCode,
      occurredAt,
      receivedAt,
      assetType: installation.assetType,
      assetId: installation.assetId,
      tripId,
      latitude,
      longitude,
      message: optionalString(payload.message),
      severity: optionalString(payload.severity),
      channelKey: optionalString(payload.channelKey) ?? optionalString(payload.channel),
    })

    const repository = new PrismaVideoIncidentRepository()
    let result
    try {
      result = await persistVideoIncident(event, repository)
    } catch (error) {
      if (!isUniqueConflict(error)) throw error
      result = await persistVideoIncident(event, repository)
    }

    return NextResponse.json({
      ok: true,
      duplicate: result.duplicate,
      alarmEventId: result.alarmEventId,
      incidentId: result.incidentId,
      alarmType: event.alarmType,
      severity: event.severity,
      assetType: event.assetType,
      assetId: event.assetId,
      tripId: event.tripId,
    }, { status: result.duplicate ? 200 : 201 })
  } catch (error) {
    if (error instanceof SyntaxError) {
      return NextResponse.json({ error: 'Invalid JSON payload' }, { status: 400 })
    }
    const message = error instanceof Error ? error.message : 'Video alarm ingestion failed'
    if (/invalid video alarm/i.test(message)) {
      return NextResponse.json({ error: message }, { status: 400 })
    }
    console.error('[VideoAlarmIngest] Failed:', message)
    return NextResponse.json({ error: 'Video alarm ingestion failed' }, { status: 500 })
  }
}
