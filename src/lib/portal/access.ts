import { db } from '@/lib/db'
import { verifyPortalShareToken, type PortalShareClaims } from '@/lib/portal/share-token'

export async function verifyActivePortalShareToken(token: string): Promise<PortalShareClaims> {
  const claims = await verifyPortalShareToken(token)
  const client = await db.client.findUnique({
    where: { id: claims.clientId },
    select: { id: true, isActive: true, portalShareVersion: true },
  })

  if (!client || !client.isActive) throw new Error('portal_share_client_unavailable')
  if (claims.shareVersion !== client.portalShareVersion) throw new Error('portal_share_token_revoked')
  return claims
}
