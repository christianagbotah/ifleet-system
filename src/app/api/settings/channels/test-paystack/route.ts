import { NextRequest, NextResponse } from 'next/server'
import { requireRole, ROLES } from '@/lib/auth-server'
import { testConnection } from '@/lib/services/paystack'

// POST /api/settings/channels/test-paystack — Test Paystack connection
export async function POST(request: NextRequest) {
  try {
    const auth = requireRole(request, [ROLES.ADMIN, ROLES.MANAGER])
    if (auth instanceof NextResponse) return auth

    const result = await testConnection()
    return NextResponse.json(result)
  } catch (error) {
    console.error('Paystack test connection error:', error)
    return NextResponse.json(
      { success: false, message: 'Failed to test Paystack connection.' },
      { status: 500 }
    )
  }
}
