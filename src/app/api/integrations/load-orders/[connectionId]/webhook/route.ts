import { createHash } from 'node:crypto'
import { NextRequest, NextResponse } from 'next/server'

import { db } from '@/lib/db'
import {
  deriveLoadOrderImportBatchId,
  importLoadOrders,
  type ExternalRow,
  type LoadOrderImportMapping,
} from '@/lib/domain/integrations/load-order-import'
import { persistImportedLoadOrder } from '@/lib/domain/integrations/load-order-persistence'
import { FilesystemNonceStore, verifyMachineRequest } from '@/lib/security/machine-auth'

function parseJsonObject(value: string): Record<string, unknown> {
  const parsed = JSON.parse(value)
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) throw new Error('Connection config must be a JSON object.')
  return parsed as Record<string, unknown>
}

async function verifyMachine(request: NextRequest) {
  const keyId = process.env.MACHINE_INGEST_KEY_ID?.trim()
  const secret = process.env.MACHINE_INGEST_SECRET?.trim()
  if (!keyId || !secret) return false
  const store = new FilesystemNonceStore(process.env.MACHINE_NONCE_DIR?.trim() || '/tmp/ifleetpro-machine-nonces')
  const result = await verifyMachineRequest(request, { keyId, secret }, { nonceStore: store })
  return result.ok
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ connectionId: string }> },
) {
  try {
    if (!(await verifyMachine(request))) {
      return NextResponse.json({ error: 'Unauthorized machine request.' }, { status: 401 })
    }

    const { connectionId } = await params
    const idempotencyKey = request.headers.get('x-idempotency-key')?.trim()
    if (!idempotencyKey || idempotencyKey.length > 160) {
      return NextResponse.json({ error: 'A valid x-idempotency-key header is required.' }, { status: 400 })
    }

    const connection = await db.integrationConnection.findUnique({ where: { id: connectionId } })
    if (!connection || connection.status !== 'active') {
      return NextResponse.json({ error: 'Active integration connection not found.' }, { status: 404 })
    }

    const config = parseJsonObject(connection.config)
    const mapping = config.mapping as LoadOrderImportMapping | undefined
    if (!mapping?.defaults?.shipperProfileId || !mapping.defaults.loadingPointId) {
      return NextResponse.json({ error: 'Integration connection is missing a valid load-order mapping.' }, { status: 503 })
    }

    const body = (await request.json()) as { rows?: ExternalRow[] } | ExternalRow[]
    const rows = Array.isArray(body) ? body : body.rows
    if (!Array.isArray(rows) || rows.length === 0 || rows.length > 5000) {
      return NextResponse.json({ error: 'Webhook payload must contain 1 to 5000 rows.' }, { status: 400 })
    }

    const existingReceipt = await db.integrationImportReceipt.findUnique({
      where: { connectionId_idempotencyKey: { connectionId, idempotencyKey } },
    })
    if (existingReceipt) {
      if (existingReceipt.status === 'completed' && existingReceipt.resultJson) {
        return NextResponse.json({ ...JSON.parse(existingReceipt.resultJson), replayed: true })
      }
      return NextResponse.json({ error: 'This webhook delivery is already being processed.' }, { status: 409 })
    }

    const batchId = deriveLoadOrderImportBatchId(rows, mapping)
    const payloadHash = createHash('sha256').update(JSON.stringify(rows)).digest('hex')
    try {
      await db.integrationImportReceipt.create({
        data: { connectionId, idempotencyKey, batchId, payloadHash, status: 'processing' },
      })
    } catch {
      const race = await db.integrationImportReceipt.findUnique({
        where: { connectionId_idempotencyKey: { connectionId, idempotencyKey } },
      })
      if (race?.status === 'completed' && race.resultJson) {
        return NextResponse.json({ ...JSON.parse(race.resultJson), replayed: true })
      }
      return NextResponse.json({ error: 'This webhook delivery is already being processed.' }, { status: 409 })
    }

    const existingOrders = await db.loadOrder.findMany({
      where: { shipperProfileId: mapping.defaults.shipperProfileId, externalReference: { not: null } },
      select: { shipperProfileId: true, externalReference: true },
    })

    const result = await importLoadOrders({
      rows,
      mapping,
      existingOrders,
      persist: (draft) => persistImportedLoadOrder(draft, {
        createdBy: connection.createdBy || 'machine',
        sourceType: `integration:${connection.provider}`,
      }),
    })

    await Promise.all([
      db.integrationImportReceipt.update({
        where: { connectionId_idempotencyKey: { connectionId, idempotencyKey } },
        data: {
          status: 'completed',
          acceptedCount: result.acceptedCount,
          rejectedCount: result.rejectedRowCount,
          resultJson: JSON.stringify(result),
        },
      }),
      db.integrationConnection.update({
        where: { id: connectionId },
        data: { lastSuccessAt: new Date(), lastErrorAt: null, lastError: null },
      }),
    ])

    return NextResponse.json(result)
  } catch (error) {
    console.error('[Load Order Webhook] Failed:', error instanceof Error ? error.message : error)
    return NextResponse.json({ error: 'Webhook import failed.' }, { status: 500 })
  }
}
