import { NextResponse } from 'next/server'

/**
 * Legacy raw-ID shipment route.
 *
 * Shipment IDs are no longer sufficient to read public tracking data. Customers
 * must use the token-bound /api/portal/public/shipment/[tripId] endpoint with a
 * valid client portal share token.
 */
export async function GET() {
  return NextResponse.json(
    {
      error: 'Legacy shipment portal endpoint retired',
      replacement: '/api/portal/public/shipment/[tripId]',
    },
    { status: 410 },
  )
}
