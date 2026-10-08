// @vitest-environment node
import { NextRequest } from 'next/server'
import jwt from 'jsonwebtoken'
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'

let proxy: (request: NextRequest) => Promise<Response>

function request(path: string, options?: { method?: string; token?: string }): NextRequest {
  const headers = new Headers({ 'content-type': 'application/json' })
  if (options?.token) headers.set('authorization', `Bearer ${options.token}`)
  return new NextRequest(`https://ifleetpro.example${path}`, {
    method: options?.method ?? 'POST',
    headers,
  })
}

async function demoToken(): Promise<string> {
  const { JWT_SECRET } = await import('./lib/jwt-secret')
  return jwt.sign(
    {
      userId: 'demo-admin-user',
      email: 'demo.admin@ifleetpro.local',
      name: 'Demo Administrator',
      roleName: 'Admin',
      permissions: ['dashboard.view'],
      driverId: null,
      isActive: true,
      isDemo: true,
    },
    JWT_SECRET,
    { expiresIn: '1h' },
  )
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

  it('blocks all mutating API requests from demo sessions', async () => {
    const token = await demoToken()
    const response = await proxy(request('/api/trips', { method: 'POST', token }))

    expect(response.status).toBe(403)
    await expect(response.json()).resolves.toEqual({
      error: 'Demo mode is read-only. Sign in with a standard account to make changes.',
    })
  })

  it('blocks sensitive read namespaces from demo sessions', async () => {
    const token = await demoToken()
    const response = await proxy(request('/api/payroll', { method: 'GET', token }))

    expect(response.status).toBe(403)
    await expect(response.json()).resolves.toEqual({
      error: 'This area is not available in public demo mode.',
    })
  })

  it('allows authenticated demo sessions to browse safe GET APIs', async () => {
    const token = await demoToken()
    const response = await proxy(request('/api/dashboard', { method: 'GET', token }))

    expect(response.status).toBe(200)
    expect(response.headers.get('x-middleware-next')).toBe('1')
  })

  it('does not make neighboring demo-auth paths public', async () => {
    const response = await proxy(request('/api/auth/demo-login-extra', { method: 'POST' }))

    expect(response.status).toBe(401)
  })

  it('does not open neighboring internal ingest routes', async () => {
    const response = await proxy(request('/api/internal/ingest/admin'))

    expect(response.status).toBe(401)
    await expect(response.json()).resolves.toEqual({
      error: 'Authentication required. Please log in.',
    })
  })
})
