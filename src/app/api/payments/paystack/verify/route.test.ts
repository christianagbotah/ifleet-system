import { NextRequest } from 'next/server'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  paymentFindUnique: vi.fn(),
  verifyPayment: vi.fn(),
  processSuccessfulPaystackCharge: vi.fn(),
}))

vi.mock('@/lib/db', () => ({
  db: {
    paymentTransaction: {
      findUnique: mocks.paymentFindUnique,
    },
  },
}))

vi.mock('@/lib/services/paystack', () => ({
  verifyPayment: mocks.verifyPayment,
}))

vi.mock('@/lib/domain/payments/process-paystack-charge', () => ({
  processSuccessfulPaystackCharge: mocks.processSuccessfulPaystackCharge,
}))

vi.mock('@/lib/audit', () => ({
  createAuditLog: vi.fn(async () => undefined),
  getClientIp: vi.fn(() => '127.0.0.1'),
}))

import { POST } from './route'

function adminRequest(reference: string) {
  return new NextRequest('https://ifleetpro.example/api/payments/paystack/verify', {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'x-auth-user-id': 'admin-1',
      'x-auth-user-role': 'Admin',
    },
    body: JSON.stringify({ reference }),
  })
}

describe('POST /api/payments/paystack/verify', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('rejects an unknown local reference before querying Paystack', async () => {
    mocks.paymentFindUnique.mockResolvedValue(null)

    const response = await POST(adminRequest('PSK-UNKNOWN'))

    expect(response.status).toBe(404)
    expect(await response.json()).toEqual({
      error: 'Payment reference was not initialized by Fleetivo.',
    })
    expect(mocks.paymentFindUnique).toHaveBeenCalledWith({
      where: { provider_reference: { provider: 'paystack', reference: 'PSK-UNKNOWN' } },
      select: { id: true },
    })
    expect(mocks.verifyPayment).not.toHaveBeenCalled()
    expect(mocks.processSuccessfulPaystackCharge).not.toHaveBeenCalled()
  })
})
