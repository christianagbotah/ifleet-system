// @vitest-environment node
import { NextRequest } from 'next/server'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  comparePassword: vi.fn(),
  userFindUnique: vi.fn(),
  userUpdate: vi.fn(),
  createAuditLog: vi.fn(),
}))

vi.mock('@/lib/auth-utils', () => ({
  comparePassword: mocks.comparePassword,
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
  JWT_SECRET: 'phase-10-login-test-secret-not-for-production-1234567890',
}))

import { POST } from './route'

function user(email = 'operator@example.com') {
  return {
    id: 'user-1',
    email,
    name: 'Operations User',
    phone: null,
    avatar: null,
    password: '$2b$12$placeholder',
    isActive: true,
    role: { name: 'Dispatcher', permissions: JSON.stringify(['trips.view']) },
    driver: null,
  }
}

function request(ip: string, email = 'operator@example.com') {
  return new NextRequest('https://ifleetpro.example/api/auth/login', {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'x-real-ip': ip,
    },
    body: JSON.stringify({ email, password: 'wrong-password-123' }),
  })
}

beforeEach(() => {
  vi.clearAllMocks()
  mocks.userFindUnique.mockResolvedValue(user())
  mocks.userUpdate.mockResolvedValue(user())
  mocks.createAuditLog.mockResolvedValue(undefined)
  mocks.comparePassword.mockResolvedValue(false)
})

describe('POST /api/auth/login credential abuse protection', () => {
  it('returns generic credential failures for five attempts and blocks the next attempt before account/password work', async () => {
    const ip = '198.51.100.71'
    const email = 'threshold@example.com'

    for (let attempt = 0; attempt < 5; attempt += 1) {
      const response = await POST(request(ip, email))
      expect(response.status).toBe(401)
      await expect(response.json()).resolves.toEqual({ error: 'Invalid email or password' })
    }

    const blocked = await POST(request(ip, email))
    expect(blocked.status).toBe(429)
    expect(blocked.headers.get('retry-after')).toBeTruthy()
    expect(blocked.headers.get('x-ratelimit-limit')).toBe('5')
    expect(mocks.userFindUnique).toHaveBeenCalledTimes(5)
    expect(mocks.comparePassword).toHaveBeenCalledTimes(5)
  })

  it('clears accumulated credential-failure debt after successful authentication', async () => {
    const ip = '198.51.100.72'
    const email = 'reset@example.com'

    for (let attempt = 0; attempt < 4; attempt += 1) {
      expect((await POST(request(ip, email))).status).toBe(401)
    }

    mocks.comparePassword.mockResolvedValueOnce(true)
    const success = await POST(request(ip, email))
    expect(success.status).toBe(200)

    mocks.comparePassword.mockResolvedValue(false)
    for (let attempt = 0; attempt < 5; attempt += 1) {
      expect((await POST(request(ip, email))).status).toBe(401)
    }

    const blocked = await POST(request(ip, email))
    expect(blocked.status).toBe(429)
    expect(mocks.comparePassword).toHaveBeenCalledTimes(10)
  })

  it('normalizes mixed-case email before account lookup and failure-key construction', async () => {
    const ip = '198.51.100.73'
    const response = await POST(request(ip, 'Operator73@Example.COM'))
    expect(response.status).toBe(401)
    expect(mocks.userFindUnique).toHaveBeenCalledWith(expect.objectContaining({
      where: { email: 'operator73@example.com' },
    }))
  })
})
