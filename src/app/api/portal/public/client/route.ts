import { NextRequest, NextResponse } from 'next/server'

import { loadClientPortalDashboard } from '@/lib/domain/client-portal/repository'
import { readPortalTokenHeader, verifyPortalShareToken } from '@/lib/portal/share-token'

export async function GET(request: NextRequest) {
  const token = readPortalTokenHeader(request.headers)
  if (!token) return NextResponse.json({ error: 'Portal access token required' }, { status: 401 })

  let clientId: string
  try {
    const claims = await verifyPortalShareToken(token)
    clientId = claims.clientId
  } catch {
    return NextResponse.json({ error: 'Portal link is invalid or expired' }, { status: 401 })
  }

  const result = await loadClientPortalDashboard(clientId)
  if (result.kind === 'not_found') return NextResponse.json({ error: 'Portal not found' }, { status: 404 })
  if (result.kind === 'inactive') return NextResponse.json({ error: 'Client portal is unavailable' }, { status: 403 })

  return NextResponse.json(result.data, {
    headers: {
      'Cache-Control': 'private, no-store',
      'Referrer-Policy': 'no-referrer',
    },
  })
}
