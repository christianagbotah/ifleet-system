import { NextResponse } from 'next/server'

import {
  FilesystemNonceStore,
  verifyMachineRequest,
} from '@/lib/security/machine-auth'

export async function POST(request: Request) {
  const keyId = process.env.MACHINE_INGEST_KEY_ID?.trim()
  const secret = process.env.MACHINE_INGEST_SECRET?.trim()

  if (!keyId || !secret) {
    return NextResponse.json(
      { error: 'Machine ingestion is not configured' },
      { status: 503 }
    )
  }

  const nonceStore = new FilesystemNonceStore(
    process.env.MACHINE_NONCE_DIR?.trim() || '/tmp/ifleetpro-machine-nonces'
  )

  const result = await verifyMachineRequest(
    request,
    { keyId, secret },
    { nonceStore }
  )

  if (!result.ok) {
    return NextResponse.json(
      { error: 'Unauthorized machine request' },
      { status: 401 }
    )
  }

  return NextResponse.json({
    ok: true,
    timestamp: new Date().toISOString(),
  })
}
