import { NextRequest, NextResponse } from 'next/server'
import { requireAuth } from '@/lib/auth-server'

const AI_SERVICE_URL = 'http://localhost:3007'
const INTERNAL_API_KEY = process.env.INTERNAL_API_KEY || 'ifleetpro-internal-key-change-me'

export async function POST(request: NextRequest) {
  try {
    const auth = requireAuth(request)
    if (auth instanceof NextResponse) return auth

    const body = await request.json()
    const { truckId, mileage, lastMaintenanceDate, maintenanceHistory } = body

    if (!truckId || typeof truckId !== 'string') {
      return NextResponse.json(
        { error: 'truckId is required and must be a string' },
        { status: 400 }
      )
    }

    // Forward to AI service
    const response = await fetch(`${AI_SERVICE_URL}/api/maintenance-predict`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-internal-api-key': INTERNAL_API_KEY,
      },
      body: JSON.stringify({
        truckId,
        mileage,
        lastMaintenanceDate,
        maintenanceHistory: maintenanceHistory || [],
        userId: auth.userId,
      }),
    })

    const data = await response.json()

    if (!response.ok) {
      return NextResponse.json(
        { error: data.error || 'AI maintenance prediction service error' },
        { status: response.status }
      )
    }

    return NextResponse.json(data)
  } catch (error) {
    console.error('[AI Maintenance Predict] Error:', error)
    return NextResponse.json(
      { error: 'Failed to communicate with AI maintenance prediction service' },
      { status: 500 }
    )
  }
}
