import { NextRequest } from 'next/server'
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'

let proxy: (request: NextRequest) => Promise<Response>

function request(path: string): NextRequest {
  return new NextRequest(`https://ifleetpro.example${path}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
  })
}

beforeAll(async () => {
  process.env.NEXTAUTH_SECRET = 'proxy-test-secret-not-for-production-1234567890'
  vi.resetModules()
  ;({ proxy } = await import('./proxy'))
})

afterAll(() => {
  delete process.env.NEXTAUTH_SECRET
})

describe('API authentication proxy', () => {
  it('lets the HMAC-authenticated machine health route reach its handler', async () => {
    const response = await proxy(request('/api/internal/ingest/health'))

    expect(response.status).toBe(200)
    expect(response.headers.get('x-middleware-next')).toBe('1')
  })

  it('does not open neighboring internal ingest routes', async () => {
    const response = await proxy(request('/api/internal/ingest/admin'))

    expect(response.status).toBe(401)
    await expect(response.json()).resolves.toEqual({
      error: 'Authentication required. Please log in.',
    })
  })
})
