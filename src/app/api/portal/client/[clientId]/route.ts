import { NextResponse } from 'next/server'

/**
 * Legacy raw-ID portal route.
 *
 * Client IDs are no longer public credentials. Staff must issue a signed share
 * link through POST /api/portal/share/client/[clientId], while customers use
 * GET /api/portal/public/client with X-Portal-Token.
 */
export async function GET() {
  return NextResponse.json(
    {
      error: 'Legacy client portal endpoint retired',
      replacement: '/api/portal/public/client',
    },
    { status: 410 },
  )
}
