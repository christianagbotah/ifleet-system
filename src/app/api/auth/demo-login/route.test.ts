// @vitest-environment node
import { NextRequest } from 'next/server'
import jwt from 'jsonwebtoken'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  roleFindUnique: vi.fn(),
  userUpsert: vi.fn(),
  userFindUnique: vi.fn(),
  driverUpsert: vi.fn(),
  createAuditLog: vi.fn(),
}))

vi.mock('@/lib/db', () => ({
  db: {
    role: { findUnique: mocks.roleFindUnique },
    user: { upsert: mocks.userUpsert, findUnique: mocks.userFindUnique },
    driver: { upsert: mocks.driverUpsert },
  },
}))

vi.mock('@/lib/audit', () => ({
  createAuditLog: mocks.createAuditLog,
  getClientIp: () => '127.0.0.1',
}))

vi.mock('@/lib/jwt-secret', () => ({
  JWT_SECRET: 'demo-route-test-secret-not-for-production-1234567890',
}))

import { GET, POST } from './route'

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
  mocks.roleFindUnique.mockResolvedValue({
    id: 'role-admin',
    name: 'Admin',
    permissions: JSON.stringify(['dashboard.view', 'trips.view']),
  })
  mocks.createAuditLog.mockResolvedValue(undefined)
  mocks.userUpsert.mockResolvedValue({
    id: 'demo-admin-user',
    email: 'demo.admin@ifleetpro.local',
    name: 'Demo Administrator',
    phone: null,
    avatar: null,
    isActive: true,
    role: {
      name: 'Admin',
      permissions: JSON.stringify(['dashboard.view', 'trips.view']),
    },
    driver: null,
  })
})

afterEach(() => {
  vi.unstubAllEnvs()
  delete process.env.DEMO_LOGIN_ALLOW_PRODUCTION
})

describe('GET /api/auth/demo-login', () => {
  it('reports demo access disabled unless explicitly enabled', async () => {
    delete process.env.DEMO_LOGIN_ENABLED
    const response = await GET()
    expect(response.status).toBe(200)
    await expect(response.json()).resolves.toEqual({ enabled: false })
  })

  it('reports demo access enabled when the server flag is true', async () => {
    process.env.DEMO_LOGIN_ENABLED = 'true'
    const response = await GET()
    expect(response.status).toBe(200)
    await expect(response.json()).resolves.toEqual({ enabled: true })
  })

  it('requires a second explicit opt-in before exposing demo access in production', async () => {
    vi.stubEnv('NODE_ENV', 'production')
    process.env.DEMO_LOGIN_ENABLED = 'true'
    delete process.env.DEMO_LOGIN_ALLOW_PRODUCTION

    const response = await GET()
    await expect(response.json()).resolves.toEqual({ enabled: false })
  })
})

describe('POST /api/auth/demo-login', () => {
  it('rejects demo login in production without the production opt-in', async () => {
    vi.stubEnv('NODE_ENV', 'production')
    process.env.DEMO_LOGIN_ENABLED = 'true'
    delete process.env.DEMO_LOGIN_ALLOW_PRODUCTION

    const response = await POST(request('manager'))
    expect(response.status).toBe(403)
    expect(mocks.roleFindUnique).not.toHaveBeenCalled()
  })

  it('rejects unknown demo profiles without touching the database', async () => {
    const response = await POST(request('owner'))
    expect(response.status).toBe(400)
    expect(mocks.roleFindUnique).not.toHaveBeenCalled()
  })

  it('issues a short-lived read-only demo session without a password', async () => {
    const response = await POST(request('admin'))
    expect(response.status).toBe(200)
    const body = await response.json()

    expect(body.user).toMatchObject({
      id: 'demo-admin-user',
      role: 'Admin',
      isDemo: true,
      demoProfile: 'admin',
    })
    expect(body.user).not.toHaveProperty('password')

    const token = jwt.verify(body.token, 'demo-route-test-secret-not-for-production-1234567890') as jwt.JwtPayload
    expect(token.isDemo).toBe(true)
    expect(token.demoProfile).toBe('admin')
    expect(Number(token.exp) - Number(token.iat)).toBeLessThanOrEqual(8 * 60 * 60)
  })
})
