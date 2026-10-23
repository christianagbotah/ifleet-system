import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { NextRequest } from 'next/server'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const { findFirst, create, upsert } = vi.hoisted(() => ({
  findFirst: vi.fn(),
  create: vi.fn(),
  upsert: vi.fn(),
}))

vi.mock('@/lib/db', () => ({
  db: {
    systemSettings: { findFirst, create, upsert },
  },
}))

vi.mock('@/lib/audit', () => ({
  createAuditLog: vi.fn(async () => undefined),
  getClientIp: vi.fn(() => '127.0.0.1'),
}))

import { GET, PUT } from './route'

const settings = {
  smsEnabled: true,
  smsProvider: 'hubtel',
  hubtelClientId: 'client-id',
  hubtelApiSecret: 'secret-value',
  arkeselApiKey: 'arkesel-secret',
  arkeselSenderId: 'iFleetPro',
  emailEnabled: true,
  smtpHost: 'smtp.example.com',
  smtpPort: 587,
  smtpUser: 'mailer@example.com',
  smtpPass: 'smtp-secret',
  smtpFrom: 'mailer@example.com',
  smtpSecure: true,
  paystackEnabled: true,
  paystackSecretKey: 'paystack-secret',
  paystackPublicKey: 'pk_test_example',
  paystackMode: 'test',
  mobileMoneyProvider: 'mtn',
  paystackWebhookSecret: 'webhook-secret',
}

function request(role?: string) {
  const headers = new Headers()
  if (role) {
    headers.set('x-auth-user-id', `qa-${role.toLowerCase()}`)
    headers.set('x-auth-user-role', role)
  }
  return new NextRequest('https://ifleetpro.example/api/settings/channels', { headers })
}

function putRequest(body: Record<string, unknown>) {
  return new NextRequest('https://ifleetpro.example/api/settings/channels', {
    method: 'PUT',
    headers: {
      'content-type': 'application/json',
      'x-auth-user-id': 'qa-admin',
      'x-auth-user-role': 'Admin',
    },
    body: JSON.stringify(body),
  })
}

describe('GET /api/settings/channels authorization', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    findFirst.mockResolvedValue(settings)
  })

  it('rejects unauthenticated requests before reading integration settings', async () => {
    const response = await GET(request())
    expect(response.status).toBe(401)
    expect(findFirst).not.toHaveBeenCalled()
  })

  it('rejects Driver accounts before reading integration settings', async () => {
    const response = await GET(request('Driver'))
    expect(response.status).toBe(403)
    expect(findFirst).not.toHaveBeenCalled()
  })

  it.each(['Admin', 'Manager'])('allows %s accounts to read masked integration settings', async (role) => {
    const response = await GET(request(role))
    expect(response.status).toBe(200)
    const body = await response.json()
    expect(body.hubtelApiSecret).not.toBe(settings.hubtelApiSecret)
    expect(body.paystackSecretKey).not.toBe(settings.paystackSecretKey)
    expect(body).not.toHaveProperty('paystackWebhookSecret')
    expect(body).not.toHaveProperty('hasPaystackWebhookSecret')
    expect(findFirst).toHaveBeenCalledTimes(1)
  })

  it('is not listed as a public GET route in the proxy', () => {
    const source = readFileSync(join(process.cwd(), 'src/proxy.ts'), 'utf8')
    expect(source).not.toContain("'/api/settings/channels'")
  })
})

describe('PUT /api/settings/channels Paystack mode safety', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('rejects enabling test mode with a live secret key', async () => {
    findFirst.mockResolvedValue({ ...settings, paystackEnabled: false, paystackSecretKey: 'sk_live_example', paystackMode: 'test' })

    const response = await PUT(putRequest({ paystackEnabled: true }))

    expect(response.status).toBe(400)
    expect(await response.json()).toEqual({ error: 'Paystack test mode requires an sk_test_ secret key.' })
    expect(upsert).not.toHaveBeenCalled()
  })

  it('rejects enabling Paystack without an effective secret key', async () => {
    findFirst.mockResolvedValue({ ...settings, paystackEnabled: false, paystackSecretKey: '', paystackMode: 'test' })

    const response = await PUT(putRequest({ paystackEnabled: true }))

    expect(response.status).toBe(400)
    expect(await response.json()).toEqual({ error: 'Paystack secret key is required when Paystack is enabled.' })
    expect(upsert).not.toHaveBeenCalled()
  })
})
