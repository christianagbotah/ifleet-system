import { NextRequest, NextResponse } from 'next/server'
import { requireAuth } from '@/lib/auth-server'

const AI_SERVICE_URL = 'http://localhost:3007'
const INTERNAL_API_KEY = process.env.INTERNAL_API_KEY || 'ifleetpro-internal-key-change-me'

export async function POST(request: NextRequest) {
  try {
    const auth = requireAuth(request)
    if (auth instanceof NextResponse) return auth

    const body = await request.json()
    const { reportType, data, additionalContext } = body

    if (!reportType || !data) {
      return NextResponse.json(
        { error: 'reportType and data are required' },
        { status: 400 }
      )
    }

    // Forward to AI service
    const response = await fetch(`${AI_SERVICE_URL}/api/report-nl`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-internal-api-key': INTERNAL_API_KEY,
      },
      body: JSON.stringify({
        reportType,
        data,
        additionalContext,
      }),
    })

    const responseData = await response.json()

    if (!response.ok) {
      return NextResponse.json(
        { error: responseData.error || 'AI service error' },
        { status: response.status }
      )
    }

    return NextResponse.json(responseData)
  } catch (error) {
    console.error('[AI Report NL] Error:', error)
    return NextResponse.json(
      { error: 'Failed to communicate with AI service' },
      { status: 500 }
    )
  }
}
