import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  findFirst: vi.fn(),
}))

vi.mock('@/lib/db', () => ({
  db: {
    systemSettings: {
      findFirst: mocks.findFirst,
    },
  },
}))

import { getPaystackConfig } from '@/lib/services/paystack'

describe('Paystack mode safety', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('rejects a live secret key configured as test mode', async () => {
    mocks.findFirst.mockResolvedValue({
      paystackEnabled: true,
      paystackSecretKey: 'sk_live_example',
      paystackPublicKey: 'pk_live_example',
      paystackMode: 'test',
    })

    await expect(getPaystackConfig()).rejects.toThrow('Paystack test mode requires an sk_test_ secret key.')
  })

  it('rejects a secret key without an official Paystack environment prefix', async () => {
    mocks.findFirst.mockResolvedValue({
      paystackEnabled: true,
      paystackSecretKey: 'secret-example',
      paystackPublicKey: '',
      paystackMode: 'test',
    })

    await expect(getPaystackConfig()).rejects.toThrow('Paystack secret key must start with sk_test_ or sk_live_.')
  })

  it('returns a matching live configuration', async () => {
    mocks.findFirst.mockResolvedValue({
      paystackEnabled: true,
      paystackSecretKey: 'sk_live_example',
      paystackPublicKey: 'pk_live_example',
      paystackMode: 'live',
    })

    await expect(getPaystackConfig()).resolves.toEqual({
      secretKey: 'sk_live_example',
      publicKey: 'pk_live_example',
      mode: 'live',
    })
  })
})
