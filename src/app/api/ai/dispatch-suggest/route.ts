import { NextRequest, NextResponse } from 'next/server'
import { requireRole, ROLES } from '@/lib/auth-server'
import { getAiServiceConfig } from '@/lib/config/ai-service'

export async function POST(request: NextRequest) {
  try {
    const auth = requireRole(request, [ROLES.ADMIN, ROLES.MANAGER])
    if (auth instanceof NextResponse) return auth

    const body = await request.json()
    const { tripDetails, availableDrivers, availableTrucks } = body

    if (!tripDetails) {
      return NextResponse.json(
        { error: 'tripDetails is required' },
        { status: 400 },
      )
    }

    const { url, internalApiKey } = getAiServiceConfig()
    const response = await fetch(`${url}/api/dispatch-suggest`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-internal-api-key': internalApiKey,
      },
      body: JSON.stringify({
        tripDetails,
        availableDrivers,
        availableTrucks,
      }),
    })

    const data = await response.json().catch(() => ({}))

    if (!response.ok) {
      return NextResponse.json(
        { error: data.error || 'AI service error' },
        { status: response.status },
      )
    }

    return NextResponse.json(data)
  } catch (error) {
    console.error('[AI Dispatch] Error:', error)
    const isConfigError = error instanceof Error
      && (error.message.includes('AI_SERVICE_URL') || error.message.includes('INTERNAL_API_KEY'))

    return NextResponse.json(
      { error: isConfigError ? 'AI service is not configured' : 'Failed to communicate with AI service' },
      { status: isConfigError ? 503 : 500 },
    )
  }
}
