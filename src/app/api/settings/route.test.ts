import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { NextRequest } from 'next/server'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const { findFirst, create } = vi.hoisted(() => ({
  findFirst: vi.fn(),
  create: vi.fn(),
}))

vi.mock('@/lib/jwt-secret', () => ({
  JWT_SECRET: 'unit-test-secret',
  getJwtSecretKey: () => new TextEncoder().encode('unit-test-secret'),
}))

vi.mock('@/lib/db', () => ({
  db: {
    systemSettings: { findFirst, create },
  },
}))

vi.mock('@/lib/audit', () => ({
  createAuditLog: vi.fn(async () => undefined),
  getClientIp: vi.fn(() => '127.0.0.1'),
}))

import { GET } from './route'

const settings = {
  id: 'settings-1',
  companyName: 'Private Fleet Co',
  companyEmail: 'ops@example.com',
  currency: 'USD',
  profitabilityMaintenanceCostPerKm: 2.5,
  driverIdPrefix: 'FP-DRV-',
  driverIdCounter: 7,
  driverIdPadding: 3,
}

function request(role?: string) {
  const headers = new Headers()
  if (role) {
    headers.set('x-auth-user-id', `qa-${role.toLowerCase()}`)
    headers.set('x-auth-user-role', role)
  }
  return new NextRequest('https://ifleetpro.example/api/settings', { headers })
}

describe('GET /api/settings security', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    findFirst.mockResolvedValue(settings)
  })

  it('rejects unauthenticated requests before reading private settings', async () => {
    const response = await GET(request())
    expect(response.status).toBe(401)
    expect(findFirst).not.toHaveBeenCalled()
    expect(create).not.toHaveBeenCalled()
  })

  it.each(['Admin', 'Manager', 'Driver'])('allows authenticated %s accounts to read settings', async (role) => {
    const response = await GET(request(role))
    expect(response.status).toBe(200)
    expect(findFirst).toHaveBeenCalledTimes(1)
  })

  it('is not public in the proxy while the currency-only endpoint is public', () => {
    const source = readFileSync(join(process.cwd(), 'src/proxy.ts'), 'utf8')
    expect(source).not.toContain("'/api/settings',")
    expect(source).toContain("'/api/settings/public',")
  })
})
