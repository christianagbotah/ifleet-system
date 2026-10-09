// @vitest-environment node
import { NextRequest } from 'next/server'
import jwt from 'jsonwebtoken'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  roleFindUnique: vi.fn(),
}))

vi.mock('@/lib/db', () => ({
  db: {
    role: { findUnique: mocks.roleFindUnique },
  },
}))

vi.mock('@/lib/jwt-secret', () => ({
  JWT_SECRET: 'demo-route-test-secret-not-for-production-1234567890',
}))

import { GET, POST } from './route'

const configuredProfiles = [
  {
    key: 'ops-preview',
    label: 'Operations Preview',
    name: 'Demo Operations User',
    roleName: 'Dispatcher',
    description: 'Read-only operations preview',
    capability: 'Dispatch operations',
    position: 'Demo Operator',
    department: 'Operations',
    order: 10,
  },
  {
    key: 'finance-preview',
    label: 'Finance Preview',
    name: 'Demo Finance User',
    roleName: 'Accountant',
    description: 'Read-only finance preview',
    capability: 'Finance reporting',
    order: 20,
  },
]

function request(profile: unknown) {
  return new NextRequest('https://ifleetpro.example/api/auth/demo-login', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ profile }),
  })
}

beforeEach(() => {
  vi.clearAllMocks()
  process.env.DEMO_LOGIN_ENABLED = 'true'
  process.env.DEMO_PROFILES_JSON = JSON.stringify(configuredProfiles)
  process.env.DEMO_SESSION_TTL = '90m'
  mocks.roleFindUnique.mockImplementation(async ({ where }: { where: { name: string } }) => ({
    id: `role-${where.name.toLowerCase()}`,
    name: where.name,
    permissions: JSON.stringify(['dashboard.view', 'trips.view', 'trips.create']),
  }))
})

afterEach(() => {
  vi.unstubAllEnvs()
  delete process.env.DEMO_LOGIN_ENABLED
  delete process.env.DEMO_LOGIN_ALLOW_PRODUCTION
  delete process.env.DEMO_PROFILES_JSON
  delete process.env.DEMO_SESSION_TTL
})

describe('GET /api/auth/demo-login', () => {
  it('reports demo access disabled unless explicitly enabled', async () => {
    delete process.env.DEMO_LOGIN_ENABLED
    const response = await GET()
    expect(response.status).toBe(200)
    await expect(response.json()).resolves.toEqual({ enabled: false, profiles: [] })
  })

  it('returns only safe runtime-configured profile metadata', async () => {
    const response = await GET()
    expect(response.status).toBe(200)
    const body = await response.json()
    expect(body.enabled).toBe(true)
    expect(body.profiles).toHaveLength(2)
    expect(body.profiles[0]).toMatchObject({
      key: 'ops-preview',
      label: 'Operations Preview',
      role: 'Dispatcher',
    })
    expect(JSON.stringify(body.profiles)).not.toMatch(/password|email|secret|token/i)
  })

  it('fails closed when demo profile configuration is missing', async () => {
    delete process.env.DEMO_PROFILES_JSON
    const response = await GET()
    expect(response.status).toBe(503)
    await expect(response.json()).resolves.toEqual({ enabled: false, profiles: [] })
  })

  it('requires a second explicit opt-in before exposing demo access in production', async () => {
    vi.stubEnv('NODE_ENV', 'production')
    process.env.DEMO_LOGIN_ENABLED = 'true'
    delete process.env.DEMO_LOGIN_ALLOW_PRODUCTION

    const response = await GET()
    await expect(response.json()).resolves.toEqual({ enabled: false, profiles: [] })
  })
})

describe('POST /api/auth/demo-login', () => {
  it('rejects demo login in production without the production opt-in', async () => {
    vi.stubEnv('NODE_ENV', 'production')
    process.env.DEMO_LOGIN_ENABLED = 'true'
    delete process.env.DEMO_LOGIN_ALLOW_PRODUCTION

    const response = await POST(request('ops-preview'))
    expect(response.status).toBe(403)
    expect(mocks.roleFindUnique).not.toHaveBeenCalled()
  })

  it('rejects profiles that are not present in runtime configuration', async () => {
    const response = await POST(request('not-configured'))
    expect(response.status).toBe(400)
    expect(mocks.roleFindUnique).not.toHaveBeenCalled()
  })

  it('issues a configured short-lived isolated demo session without creating a database user', async () => {
    const response = await POST(request('ops-preview'))
    expect(response.status).toBe(200)
    const body = await response.json()

    expect(body.user).toMatchObject({
      role: 'Dispatcher',
      isDemo: true,
      demoProfile: 'ops-preview',
      name: 'Demo Operations User',
      position: 'Demo Operator',
      department: 'Operations',
    })
    expect(body.user.email).toBe('')
    expect(body.user).not.toHaveProperty('password')

    const token = jwt.verify(body.token, 'demo-route-test-secret-not-for-production-1234567890') as jwt.JwtPayload
    expect(token.isDemo).toBe(true)
    expect(token.demoProfile).toBe('ops-preview')
    expect(Number(token.exp) - Number(token.iat)).toBeLessThanOrEqual(90 * 60)
  })

  it('fails closed when the configured role does not exist', async () => {
    mocks.roleFindUnique.mockResolvedValueOnce(null)
    const response = await POST(request('ops-preview'))
    expect(response.status).toBe(503)
  })
})
