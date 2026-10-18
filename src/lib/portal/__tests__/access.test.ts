// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({ clientFindUnique: vi.fn() }))

vi.mock('@/lib/db', () => ({
  db: { client: { findUnique: mocks.clientFindUnique } },
}))

vi.mock('@/lib/jwt-secret', () => ({
  getJwtSecretKey: () => new TextEncoder().encode('portal-access-test-secret-at-least-32-characters'),
}))

import { createPortalShareToken } from '../share-token'
import { verifyActivePortalShareToken } from '../access'

beforeEach(() => {
  vi.clearAllMocks()
  mocks.clientFindUnique.mockResolvedValue({ id: 'client-a', isActive: true, portalShareVersion: 2 })
})

describe('verifyActivePortalShareToken', () => {
  it('accepts an active client when the token share version matches', async () => {
    const issued = await createPortalShareToken({ clientId: 'client-a', issuedBy: 'user-1', shareVersion: 2 })
    const claims = await verifyActivePortalShareToken(issued.token)
    expect(claims.clientId).toBe('client-a')
    expect(claims.shareVersion).toBe(2)
  })

  it('rejects a previously issued token after the client share version changes', async () => {
    const issued = await createPortalShareToken({ clientId: 'client-a', issuedBy: 'user-1', shareVersion: 1 })
    await expect(verifyActivePortalShareToken(issued.token)).rejects.toThrow('portal_share_token_revoked')
  })

  it('rejects inactive or missing clients without reviving portal access', async () => {
    const issued = await createPortalShareToken({ clientId: 'client-a', issuedBy: 'user-1', shareVersion: 2 })
    mocks.clientFindUnique.mockResolvedValueOnce({ id: 'client-a', isActive: false, portalShareVersion: 2 })
    await expect(verifyActivePortalShareToken(issued.token)).rejects.toThrow('portal_share_client_unavailable')
    mocks.clientFindUnique.mockResolvedValueOnce(null)
    await expect(verifyActivePortalShareToken(issued.token)).rejects.toThrow('portal_share_client_unavailable')
  })
})
