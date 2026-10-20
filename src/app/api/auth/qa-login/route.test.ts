// @vitest-environment node
import { NextRequest } from 'next/server'
import { hashPassword } from '@/lib/auth-utils'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  userFindUnique: vi.fn(),
  userUpdate: vi.fn(),
  createAuditLog: vi.fn(),
}))

vi.mock('@/lib/db', () => ({
  db: {
    user: {
      findUnique: mocks.userFindUnique,
      update: mocks.userUpdate,
    },
  },
}))

vi.mock('@/lib/audit', () => ({
  createAuditLog: mocks.createAuditLog,
}))

vi.mock('@/lib/jwt-secret', () => ({
  JWT_SECRET: 'qa-route-test-secret-not-for-production-1234567890',
}))

vi.mock('@/lib/rate-limit', () => ({
  getClientIp: () => '127.0.0.1',
  rateLimit: () => ({ success: true, remaining: 10, reset: Date.now() + 60_000 }),
  RATE_LIMITS: { loginRequest: { windowMs: 60_000, maxRequests: 20 } },
}))

import { POST } from './route'

const profile = {
  key: 'admin',
  label: 'QA Admin',
  email: 'qa.admin@ifleetpro.test',
  roleName: 'Admin',
  description: 'Full QA administration',
  capability: 'System Admin',
  position: 'QA Administrator',
  department: 'Technology',
  driverId: null,
  order: 0,
}

function request(accessCode?: string) {
  return new NextRequest('https://ifleetpro.example/api/auth/qa-login', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ profile: profile.key, accessCode }),
  })
}

beforeEach(async () => {
  vi.clearAllMocks()
  process.env.QA_LOGIN_ENABLED = 'true'
  process.env.QA_LOGIN_ALLOW_PRODUCTION = 'true'
  process.env.QA_PROFILES_JSON = JSON.stringify([profile])
  process.env.QA_LOGIN_ACCESS_CODE_HASH = await hashPassword('correct-qa-access-code')

  mocks.userFindUnique.mockResolvedValue({
    id: 'qa-admin-user',
    email: profile.email,
    name: profile.label,
    phone: null,
    avatar: null,
    position: profile.position,
    department: profile.department,
    isActive: true,
    role: {
      name: 'Admin',
      permissions: JSON.stringify(['dashboard.view', 'trips.view', 'trips.create']),
    },
    driver: null,
  })
  mocks.userUpdate.mockResolvedValue({ id: 'qa-admin-user' })
  mocks.createAuditLog.mockResolvedValue(undefined)
})

afterEach(() => {
  vi.unstubAllEnvs()
  delete process.env.QA_LOGIN_ENABLED
  delete process.env.QA_LOGIN_ALLOW_PRODUCTION
  delete process.env.QA_PROFILES_JSON
  delete process.env.QA_LOGIN_ACCESS_CODE_HASH
})

describe('POST /api/auth/qa-login access gate', () => {
  it('requires a valid QA access code before looking up the configured user', async () => {
    const missing = await POST(request())
    expect(missing.status).toBe(403)
    expect(mocks.userFindUnique).not.toHaveBeenCalled()

    const wrong = await POST(request('wrong-code'))
    expect(wrong.status).toBe(403)
    expect(mocks.userFindUnique).not.toHaveBeenCalled()

    const valid = await POST(request('correct-qa-access-code'))
    expect(valid.status).toBe(200)
    expect(mocks.userFindUnique).toHaveBeenCalledTimes(1)
  })
})
