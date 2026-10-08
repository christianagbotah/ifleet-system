import { createHash, createHmac, timingSafeEqual } from 'node:crypto'

export interface MachineNonceStore {
  claim(keyId: string, nonce: string, expiresAt: number): Promise<boolean>
}

export interface MachineCredential {
  keyId: string
  secret: string
}

export interface MachineAuthOptions {
  nonceStore: MachineNonceStore
  now?: () => number
  maxSkewMs?: number
}

export type MachineAuthResult =
  | { ok: true; keyId: string }
  | {
      ok: false
      reason:
        | 'missing_headers'
        | 'unknown_key'
        | 'invalid_timestamp'
        | 'stale_timestamp'
        | 'invalid_signature'
        | 'replayed_nonce'
    }

const DEFAULT_MAX_SKEW_MS = 5 * 60 * 1000
const SIGNATURE_PREFIX = 'sha256='

function canonicalPath(request: Request): string {
  const url = new URL(request.url)
  return `${url.pathname}${url.search}`
}

function signaturesMatch(expectedHex: string, supplied: string): boolean {
  if (!supplied.startsWith(SIGNATURE_PREFIX)) return false
  const suppliedHex = supplied.slice(SIGNATURE_PREFIX.length)
  if (!/^[a-f0-9]{64}$/i.test(suppliedHex)) return false

  const expected = Buffer.from(expectedHex, 'hex')
  const actual = Buffer.from(suppliedHex, 'hex')
  return expected.length === actual.length && timingSafeEqual(expected, actual)
}

export async function verifyMachineRequest(
  request: Request,
  credential: MachineCredential,
  options: MachineAuthOptions
): Promise<MachineAuthResult> {
  const keyId = request.headers.get('x-ifleet-key-id')?.trim() ?? ''
  const timestamp = request.headers.get('x-ifleet-timestamp')?.trim() ?? ''
  const nonce = request.headers.get('x-ifleet-nonce')?.trim() ?? ''
  const signature = request.headers.get('x-ifleet-signature')?.trim() ?? ''

  if (!keyId || !timestamp || !nonce || !signature) {
    return { ok: false, reason: 'missing_headers' }
  }

  if (keyId !== credential.keyId) {
    return { ok: false, reason: 'unknown_key' }
  }

  if (!/^\d+$/.test(timestamp)) {
    return { ok: false, reason: 'invalid_timestamp' }
  }

  const timestampMs = Number(timestamp) * 1000
  if (!Number.isSafeInteger(timestampMs)) {
    return { ok: false, reason: 'invalid_timestamp' }
  }

  const now = options.now?.() ?? Date.now()
  const maxSkewMs = options.maxSkewMs ?? DEFAULT_MAX_SKEW_MS
  if (Math.abs(now - timestampMs) > maxSkewMs) {
    return { ok: false, reason: 'stale_timestamp' }
  }

  const body = Buffer.from(await request.clone().arrayBuffer())
  const bodyHash = createHash('sha256').update(body).digest('hex')
  const canonical = [request.method.toUpperCase(), canonicalPath(request), timestamp, nonce, bodyHash].join('\n')
  const expectedSignature = createHmac('sha256', credential.secret).update(canonical).digest('hex')

  if (!signaturesMatch(expectedSignature, signature)) {
    return { ok: false, reason: 'invalid_signature' }
  }

  const expiresAt = timestampMs + maxSkewMs
  const claimed = await options.nonceStore.claim(keyId, nonce, expiresAt)
  if (!claimed) {
    return { ok: false, reason: 'replayed_nonce' }
  }

  return { ok: true, keyId }
}
