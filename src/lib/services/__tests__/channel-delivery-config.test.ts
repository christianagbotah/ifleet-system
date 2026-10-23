import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  settingsFindFirst: vi.fn(),
  sendMail: vi.fn(),
  createTransport: vi.fn(),
}))

vi.mock('@/lib/db', () => ({
  db: { systemSettings: { findFirst: mocks.settingsFindFirst } },
}))

vi.mock('nodemailer', () => ({
  default: {
    createTransport: mocks.createTransport,
  },
}))

import { formatGhanaPhone, sendSMS } from '@/lib/services/sms'
import { sendEmail } from '@/lib/services/email'

const ORIGINAL_ENV = { ...process.env }

describe('Ghana SMS phone normalization', () => {
  it('preserves an E.164 Ghana number and converts a local 0-prefix number exactly once', () => {
    expect(formatGhanaPhone('+233240000000')).toBe('+233240000000')
    expect(formatGhanaPhone('0240000000')).toBe('+233240000000')
  })
})

describe('notification channel runtime configuration', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    process.env = { ...ORIGINAL_ENV }
    delete process.env.HUBTEL_CLIENT_ID
    delete process.env.HUBTEL_API_SECRET
    delete process.env.SMTP_HOST
    delete process.env.SMTP_PORT
    delete process.env.SMTP_USER
    delete process.env.SMTP_PASS
    delete process.env.SMTP_FROM
    mocks.sendMail.mockResolvedValue({ messageId: 'smtp-message-1' })
    mocks.createTransport.mockReturnValue({ sendMail: mocks.sendMail })
  })

  it('uses saved Hubtel credentials before stale environment credentials', async () => {
    process.env.HUBTEL_CLIENT_ID = 'env-client'
    process.env.HUBTEL_API_SECRET = 'env-secret'
    mocks.settingsFindFirst.mockResolvedValue({
      smsEnabled: true,
      smsProvider: 'hubtel',
      hubtelClientId: 'db-client',
      hubtelApiSecret: 'db-secret',
    })
    const provider = vi.fn(async (_url: string, init: RequestInit) => {
      const auth = new Headers(init.headers).get('authorization')
      expect(auth).toBe(`Basic ${Buffer.from('db-client:db-secret').toString('base64')}`)
      return new Response(JSON.stringify({ status: 0, messageId: 'hubtel-1' }), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      })
    })
    vi.stubGlobal('fetch', provider)

    const result = await sendSMS({ to: '+233240000000', message: 'Trip updated' })

    expect(result).toEqual({ success: true, messageId: 'hubtel-1' })
  })

  it('falls back to Hubtel environment credentials when saved credentials are absent', async () => {
    process.env.HUBTEL_CLIENT_ID = 'env-client'
    process.env.HUBTEL_API_SECRET = 'env-secret'
    mocks.settingsFindFirst.mockResolvedValue(null)
    vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({ status: 0, messageId: 'hubtel-env' }), {
      status: 200,
      headers: { 'content-type': 'application/json' },
    })))

    await expect(sendSMS({ to: '+233240000000', message: 'Trip updated' })).resolves.toEqual({
      success: true,
      messageId: 'hubtel-env',
    })
  })

  it('fails closed for a saved SMS provider that has no runtime adapter', async () => {
    mocks.settingsFindFirst.mockResolvedValue({
      smsEnabled: true,
      smsProvider: 'arkesel',
      arkeselApiKey: 'configured-key',
    })
    const provider = vi.fn()
    vi.stubGlobal('fetch', provider)

    const result = await sendSMS({ to: '+233240000000', message: 'Trip updated' })

    expect(result.success).toBe(false)
    expect(result.error).toContain('Unsupported SMS provider')
    expect(provider).not.toHaveBeenCalled()
  })

  it('uses saved SMTP settings before stale environment settings', async () => {
    process.env.SMTP_HOST = 'env.smtp.example'
    process.env.SMTP_PORT = '2525'
    process.env.SMTP_USER = 'env-user'
    process.env.SMTP_PASS = 'env-pass'
    process.env.SMTP_FROM = 'env-from@example.com'
    mocks.settingsFindFirst.mockResolvedValue({
      emailEnabled: true,
      smtpHost: 'db.smtp.example',
      smtpPort: 587,
      smtpUser: 'db-user',
      smtpPass: 'db-pass',
      smtpFrom: 'db-from@example.com',
      smtpSecure: true,
    })

    const result = await sendEmail({
      to: 'driver@example.com',
      subject: 'Trip update',
      html: '<p>Trip updated</p>',
    })

    expect(result).toEqual({ success: true, messageId: 'smtp-message-1' })
    expect(mocks.createTransport).toHaveBeenCalledWith(expect.objectContaining({
      host: 'db.smtp.example',
      port: 587,
      secure: false,
      requireTLS: true,
      auth: { user: 'db-user', pass: 'db-pass' },
    }))
    expect(mocks.sendMail).toHaveBeenCalledWith(expect.objectContaining({
      from: expect.stringContaining('<db-from@example.com>'),
      to: 'driver@example.com',
    }))
  })

  it('falls back to SMTP environment configuration when saved settings are absent', async () => {
    process.env.SMTP_HOST = 'env.smtp.example'
    process.env.SMTP_PORT = '465'
    process.env.SMTP_USER = 'env-user'
    process.env.SMTP_PASS = 'env-pass'
    process.env.SMTP_FROM = 'env-from@example.com'
    mocks.settingsFindFirst.mockResolvedValue(null)

    await expect(sendEmail({ to: 'driver@example.com', subject: 'Trip update', html: '<p>Trip updated</p>' }))
      .resolves.toEqual({ success: true, messageId: 'smtp-message-1' })

    expect(mocks.createTransport).toHaveBeenCalledWith(expect.objectContaining({
      host: 'env.smtp.example',
      port: 465,
      secure: true,
      auth: { user: 'env-user', pass: 'env-pass' },
    }))
  })
})
