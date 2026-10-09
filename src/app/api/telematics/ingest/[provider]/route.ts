import { createHash } from 'node:crypto'
import { NextResponse } from 'next/server'

import { ingestTelematicsEvent, createTelematicsIdempotencyKey } from '@/lib/domain/telematics/ingest'
import { GenericHttpTelematicsProvider } from '@/lib/domain/telematics/providers/generic-http'
import { TelematicsNormalizationError } from '@/lib/domain/telematics/provider'
import { FilesystemNonceStore, verifyMachineRequest } from '@/lib/security/machine-auth'

interface RouteContext {
  params: Promise<{ provider: string }>
}

function machineCredential() {
  const keyId = process.env.MACHINE_INGEST_KEY_ID?.trim()
  const secret = process.env.MACHINE_INGEST_SECRET?.trim()
  return keyId && secret ? { keyId, secret } : null
}

function providerAdapter(provider: string) {
  if (provider === 'generic-http') return new GenericHttpTelematicsProvider()
  return null
}

function eventType(value: unknown): 'location' | 'ignition' | 'sensor' | 'alarm' | null {
  return value === 'location' || value === 'ignition' || value === 'sensor' || value === 'alarm' ? value : null
}

export async function POST(request: Request, context: RouteContext) {
  const { provider } = await context.params
  const adapter = providerAdapter(provider)
  if (!adapter) return NextResponse.json({ error: 'Unsupported telematics provider' }, { status: 404 })

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
    const payloadText = await request.text()
    const payload = JSON.parse(payloadText) as Record<string, unknown>
    const kind = eventType(payload.eventType ?? payload.type)
    if (!kind) return NextResponse.json({ error: 'Unsupported telematics event type' }, { status: 400 })

    const deviceRef = [payload.deviceId, payload.imei, payload.serialNumber, payload.deviceRef]
      .find((value): value is string => typeof value === 'string' && value.trim().length > 0)
      ?.trim() ?? ''
    if (!deviceRef) {
      return NextResponse.json({ error: 'deviceId, imei, serialNumber or deviceRef is required' }, { status: 400 })
    }

    const providerEventId = typeof payload.eventId === 'string' && payload.eventId.trim()
      ? payload.eventId.trim()
      : null
    const receivedAt = new Date()
    const payloadHash = createHash('sha256').update(payloadText).digest('hex')
    const idempotencyKey = createTelematicsIdempotencyKey(provider, deviceRef, providerEventId, payloadHash)
    const rawEventRef = `raw_${idempotencyKey}`
    const normalizationContext = { receivedAt, rawEventRef, deviceId: deviceRef, providerEventId }

    const normalized = kind === 'location'
      ? adapter.normalizeLocation(payload, normalizationContext)
      : kind === 'ignition'
        ? adapter.normalizeIgnition(payload, normalizationContext)
        : kind === 'sensor'
          ? adapter.normalizeSensor(payload, normalizationContext)
          : adapter.normalizeAlarm(payload, normalizationContext)

    const { PrismaTelematicsIngestRepository } = await import('@/lib/domain/telematics/prisma-ingest-repository')
    const repository = new PrismaTelematicsIngestRepository()
    const result = await ingestTelematicsEvent(
      normalized as Parameters<typeof ingestTelematicsEvent>[0],
      {
        rawEventRef,
        provider,
        deviceId: deviceRef,
        providerEventId,
        payloadHash,
        payload: payloadText,
        receivedAt,
      },
      repository,
    )

    return NextResponse.json(
      {
        ok: true,
        duplicate: result.duplicate,
        eventId: result.eventId,
        assetType: result.assetType,
        assetId: result.assetId,
        tripId: result.tripId,
        liveStateUpdated: result.liveStateUpdated,
      },
      { status: result.duplicate ? 200 : 201 },
    )
  } catch (error) {
    if (error instanceof SyntaxError || error instanceof TelematicsNormalizationError) {
      return NextResponse.json({ error: error.message }, { status: 400 })
    }
    const message = error instanceof Error ? error.message : 'Telematics ingestion failed'
    if (/unknown device|inactive device|no installation/i.test(message)) {
      return NextResponse.json({ error: message }, { status: 422 })
    }
    console.error('[TelematicsIngest] Failed:', message)
    return NextResponse.json({ error: 'Telematics ingestion failed' }, { status: 500 })
  }
}
