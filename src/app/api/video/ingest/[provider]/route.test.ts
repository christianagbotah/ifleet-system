import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

let nonceDir = ''

beforeEach(async () => {
  nonceDir = await mkdtemp(join(tmpdir(), 'ifleetpro-video-ingest-route-'))
  process.env.MACHINE_INGEST_KEY_ID = 'video-route-test-key'
  process.env.MACHINE_INGEST_SECRET = 'video-route-test-secret-not-for-production'
  process.env.MACHINE_NONCE_DIR = nonceDir
  vi.resetModules()
})

afterEach(async () => {
  delete process.env.MACHINE_INGEST_KEY_ID
  delete process.env.MACHINE_INGEST_SECRET
  delete process.env.MACHINE_NONCE_DIR
  if (nonceDir) await rm(nonceDir, { recursive: true, force: true })
})

describe('machine video incident ingestion route', () => {
  it('rejects an unsigned provider request before device or incident persistence', async () => {
    const { POST } = await import('./route')
    const request = new Request('https://ifleetpro.example/api/video/ingest/generic-http', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ deviceId: 'device-001', alarmCode: 'DMS_FATIGUE' }),
    })

    const response = await POST(request, { params: Promise.resolve({ provider: 'generic-http' }) })

    expect(response.status).toBe(401)
    await expect(response.json()).resolves.toEqual({ error: 'Unauthorized machine request' })
  })
})
