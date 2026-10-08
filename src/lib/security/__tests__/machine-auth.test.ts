import { createHash, createHmac } from 'node:crypto'
import { describe, expect, it } from 'vitest'

import {
  type MachineNonceStore,
  verifyMachineRequest,
} from '@/lib/security/machine-auth'

const KEY_ID = 'provider-test'
const SECRET = 'machine-auth-test-secret-not-for-production'
const NOW = 1_796_000_000_000

class MemoryNonceStore implements MachineNonceStore {
  private readonly seen = new Set<string>()

  async claim(keyId: string, nonce: string): Promise<boolean> {
    const value = `${keyId}:${nonce}`
    if (this.seen.has(value)) return false
    this.seen.add(value)
    return true
  }
}

function signedRequest({
  body = JSON.stringify({ truckId: 'truck-1', latitude: 5.6, longitude: -0.2 }),
  signedBody = body,
  keyId = KEY_ID,
  timestamp = String(Math.floor(NOW / 1000)),
  nonce = 'nonce-001',
}: Partial<{
  body: string
  signedBody: string
  keyId: string
  timestamp: string
  nonce: string
}> = {}): Request {
  const bodyHash = createHash('sha256').update(signedBody).digest('hex')
  const canonical = ['POST', '/api/internal/ingest/health', timestamp, nonce, bodyHash].join('\n')
  const signature = createHmac('sha256', SECRET).update(canonical).digest('hex')

  return new Request('https://ifleetpro.example/api/internal/ingest/health', {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'x-ifleet-key-id': keyId,
      'x-ifleet-timestamp': timestamp,
      'x-ifleet-nonce': nonce,
      'x-ifleet-signature': `sha256=${signature}`,
    },
    body,
  })
}

function verify(request: Request, store = new MemoryNonceStore()) {
  return verifyMachineRequest(
    request,
    { keyId: KEY_ID, secret: SECRET },
    { nonceStore: store, now: () => NOW }
  )
}

describe('verifyMachineRequest', () => {
  it('accepts a valid signed request and returns only its key id', async () => {
    await expect(verify(signedRequest())).resolves.toEqual({ ok: true, keyId: KEY_ID })
  })

  it('rejects an unknown key id', async () => {
    await expect(verify(signedRequest({ keyId: 'unknown-device' }))).resolves.toEqual({
      ok: false,
      reason: 'unknown_key',
    })
  })

  it('rejects a stale timestamp', async () => {
    const stale = String(Math.floor((NOW - 6 * 60 * 1000) / 1000))
    await expect(verify(signedRequest({ timestamp: stale }))).resolves.toEqual({
      ok: false,
      reason: 'stale_timestamp',
    })
  })

  it('rejects a body changed after signing', async () => {
    const signedBody = JSON.stringify({ truckId: 'truck-1', latitude: 5.6 })
    const body = JSON.stringify({ truckId: 'truck-1', latitude: 99.9 })
    await expect(verify(signedRequest({ body, signedBody }))).resolves.toEqual({
      ok: false,
      reason: 'invalid_signature',
    })
  })

  it('rejects a replayed nonce for the same key', async () => {
    const store = new MemoryNonceStore()
    await expect(verify(signedRequest(), store)).resolves.toEqual({ ok: true, keyId: KEY_ID })
    await expect(verify(signedRequest(), store)).resolves.toEqual({
      ok: false,
      reason: 'replayed_nonce',
    })
  })
})
