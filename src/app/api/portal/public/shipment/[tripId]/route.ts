import { NextRequest, NextResponse } from 'next/server'

import { loadClientShipmentDetail } from '@/lib/domain/client-portal/repository'
import { readPortalTokenHeader, verifyPortalShareToken } from '@/lib/portal/share-token'

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ tripId: string }> },
) {
  const token = readPortalTokenHeader(request.headers)
  if (!token) return NextResponse.json({ error: 'Portal access token required' }, { status: 401 })

  let clientId: string
  try {
    const claims = await verifyPortalShareToken(token)
    clientId = claims.clientId
  } catch {
    return NextResponse.json({ error: 'Portal link is invalid or expired' }, { status: 401 })
  }

  const { tripId } = await params
  const detail = await loadClientShipmentDetail(clientId, tripId)
  if (!detail) return NextResponse.json({ error: 'Shipment not found' }, { status: 404 })

  return NextResponse.json(detail, {
    headers: {
      'Cache-Control': 'private, no-store',
      'Referrer-Policy': 'no-referrer',
    },
  })
}
