// @vitest-environment node
import { describe, expect, it } from 'vitest'

import {
  createPortalShareToken,
  verifyPortalShareToken,
  validatePortalShareTtlDays,
} from '../share-token'

const secret = new TextEncoder().encode('phase-8-test-secret-at-least-32-characters-long')
const issuedAt = new Date('2026-10-10T17:30:00.000Z')

describe('portal share token', () => {
  it('round-trips a client-scoped token with bounded expiry', async () => {
    const result = await createPortalShareToken({
      clientId: 'client-a',
      issuedBy: 'user-1',
      ttlDays: 7,
      secret,
      now: issuedAt,
    })

    expect(result.expiresAt.toISOString()).toBe('2026-10-17T17:30:00.000Z')

    const claims = await verifyPortalShareToken(result.token, {
      secret,
      now: new Date('2026-10-11T17:30:00.000Z'),
    })
    expect(claims.clientId).toBe('client-a')
    expect(claims.issuedBy).toBe('user-1')
    expect(claims.purpose).toBe('client_portal')
  })

  it('rejects an expired token', async () => {
    const result = await createPortalShareToken({
      clientId: 'client-a',
      issuedBy: 'user-1',
      ttlDays: 1,
      secret,
      now: issuedAt,
    })

    await expect(verifyPortalShareToken(result.token, {
      secret,
      now: new Date('2026-10-12T17:30:01.000Z'),
    })).rejects.toThrow()
  })

  it('rejects tampered tokens', async () => {
    const result = await createPortalShareToken({
      clientId: 'client-a',
      issuedBy: 'user-1',
      ttlDays: 7,
      secret,
      now: issuedAt,
    })
    const tampered = `${result.token.slice(0, -2)}xx`
    await expect(verifyPortalShareToken(tampered, { secret, now: issuedAt })).rejects.toThrow()
  })

  it('validates requested lifetime between one and thirty whole days', () => {
    expect(validatePortalShareTtlDays(1)).toBe(true)
    expect(validatePortalShareTtlDays(30)).toBe(true)
    expect(validatePortalShareTtlDays(0)).toBe(false)
    expect(validatePortalShareTtlDays(31)).toBe(false)
    expect(validatePortalShareTtlDays(1.5)).toBe(false)
    expect(validatePortalShareTtlDays(Number.NaN)).toBe(false)
  })
})
