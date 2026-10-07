import { NextRequest, NextResponse } from 'next/server'
import { requireAuth } from '@/lib/auth-server'
import { getAiServiceConfig } from '@/lib/config/ai-service'

export async function POST(request: NextRequest) {
  try {
    const auth = requireAuth(request)
    if (auth instanceof NextResponse) return auth

    const body = await request.json()
    const { fuelLogs, vehicleInfo } = body

    if (!fuelLogs || !Array.isArray(fuelLogs) || fuelLogs.length === 0) {
      return NextResponse.json(
        { error: 'fuelLogs array is required and must not be empty' },
        { status: 400 }
      )
    }

    const ai = getAiServiceConfig()
    // Legacy route remains non-authoritative; the mini-service rejects raw candidate evidence.
    const response = await fetch(`${ai.url}/api/fuel-anomaly`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-internal-api-key': ai.internalApiKey,
      },
      body: JSON.stringify({
        fuelLogs,
        vehicleInfo,
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
    console.error('[AI Fuel Anomaly] Error:', error)
    return NextResponse.json(
      { error: 'Failed to communicate with AI service' },
      { status: 500 }
    )
  }
}
