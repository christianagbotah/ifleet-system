import { createHash, createHmac } from 'node:crypto'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'

const KEY_ID = 'health-test-key'
const SECRET = 'health-route-test-secret-not-for-production'
const createdDirs: string[] = []

function signedRequest(nonce: string, body = '{}', signedBody = body): Request {
  const timestamp = String(Math.floor(Date.now() / 1000))
  const bodyHash = createHash('sha256').update(signedBody).digest('hex')
  const canonical = ['POST', '/api/internal/ingest/health', timestamp, nonce, bodyHash].join('\n')
  const signature = createHmac('sha256', SECRET).update(canonical).digest('hex')

  return new Request('https://ifleetpro.example/api/internal/ingest/health', {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'x-ifleet-key-id': KEY_ID,
      'x-ifleet-timestamp': timestamp,
      'x-ifleet-nonce': nonce,
      'x-ifleet-signature': `sha256=${signature}`,
    },
    body,
  })
}

async function configure(): Promise<void> {
  const dir = await mkdtemp(join(tmpdir(), 'ifleetpro-health-'))
  createdDirs.push(dir)
  process.env.MACHINE_INGEST_KEY_ID = KEY_ID
  process.env.MACHINE_INGEST_SECRET = SECRET
  process.env.MACHINE_NONCE_DIR = dir
}

afterEach(async () => {
  delete process.env.MACHINE_INGEST_KEY_ID
  delete process.env.MACHINE_INGEST_SECRET
  delete process.env.MACHINE_NONCE_DIR
  await Promise.all(createdDirs.splice(0).map((dir) => rm(dir, { recursive: true, force: true })))
})

describe('POST /api/internal/ingest/health', () => {
  it('accepts a valid signed request without returning credential metadata', async () => {
    await configure()
    const { POST } = await import('./route')

    const response = await POST(signedRequest('route-valid'))
    const payload = await response.json()

    expect(response.status).toBe(200)
    expect(payload.ok).toBe(true)
    expect(payload.timestamp).toMatch(/^\d{4}-\d{2}-\d{2}T/)
    expect(Object.keys(payload).sort()).toEqual(['ok', 'timestamp'])
  })

  it('returns a generic unauthorized response for a tampered body', async () => {
    await configure()
    const { POST } = await import('./route')

    const response = await POST(signedRequest('route-tampered', '{"changed":true}', '{}'))
    const payload = await response.json()

    expect(response.status).toBe(401)
    expect(payload).toEqual({ error: 'Unauthorized machine request' })
  })

  it('fails closed when machine ingestion credentials are not configured', async () => {
    const { POST } = await import('./route')
    const response = await POST(new Request('https://ifleetpro.example/api/internal/ingest/health', { method: 'POST' }))

    expect(response.status).toBe(503)
    expect(await response.json()).toEqual({ error: 'Machine ingestion is not configured' })
  })
})
