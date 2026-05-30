import { NextRequest, NextResponse } from 'next/server'
import { requireRole } from '@/lib/auth-server'
import { ROLES } from '@/lib/auth-server'

const AI_SERVICE_URL = 'http://localhost:3007'
const INTERNAL_API_KEY = process.env.INTERNAL_API_KEY || 'ifleetpro-internal-key-change-me'

export async function POST(request: NextRequest) {
  try {
    // Require Admin or Manager role
    const auth = requireRole(request, [ROLES.ADMIN, ROLES.MANAGER])
    if (auth instanceof NextResponse) return auth

    const body = await request.json()
    const { tripDetails, availableDrivers, availableTrucks } = body

    if (!tripDetails) {
      return NextResponse.json(
        { error: 'tripDetails is required' },
        { status: 400 }
      )
    }

    // Forward to AI service
    const response = await fetch(`${AI_SERVICE_URL}/api/dispatch-suggest`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-internal-api-key': INTERNAL_API_KEY,
      },
      body: JSON.stringify({
        tripDetails,
        availableDrivers,
        availableTrucks,
      }),
    })

    const data = await response.json()

    if (!response.ok) {
      return NextResponse.json(
        { error: data.error || 'AI service error' },
        { status: response.status }
      )
    }

    return NextResponse.json(data)
  } catch (error) {
    console.error('[AI Dispatch] Error:', error)
    return NextResponse.json(
      { error: 'Failed to communicate with AI service' },
      { status: 500 }
    )
  }
}
