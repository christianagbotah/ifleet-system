import { NextRequest, NextResponse } from 'next/server'
import { requireAuth } from '@/lib/auth-server'

const AI_SERVICE_URL = 'http://localhost:3007'
const INTERNAL_API_KEY = process.env.INTERNAL_API_KEY || 'ifleetpro-internal-key-change-me'
/** Server-side timeout for the AI service call (90 seconds) */
const AI_TIMEOUT_MS = 90_000

export async function POST(request: NextRequest) {
  try {
    const auth = requireAuth(request)
    if (auth instanceof NextResponse) return auth

    const body = await request.json()
    const { message, conversationHistory } = body

    if (!message || typeof message !== 'string') {
      return NextResponse.json(
        { error: 'message is required and must be a string' },
        { status: 400 }
      )
    }

    // Forward to AI service with server-side timeout
    const controller = new AbortController()
    const timeoutId = setTimeout(() => controller.abort(), AI_TIMEOUT_MS)

    let response: Response
    try {
      response = await fetch(`${AI_SERVICE_URL}/api/chat`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-internal-api-key': INTERNAL_API_KEY,
        },
        body: JSON.stringify({
          userId: auth.userId,
          message,
          conversationHistory: conversationHistory || [],
        }),
        signal: controller.signal,
      })
    } finally {
      clearTimeout(timeoutId)
    }

    const data = await response.json()

    if (!response.ok) {
      return NextResponse.json(
        { error: data.error || 'AI service error' },
        { status: response.status }
      )
    }

    return NextResponse.json(data)
  } catch (error) {
    if (error instanceof DOMException && error.name === 'AbortError') {
      console.error('[AI Chat] Timed out after', AI_TIMEOUT_MS, 'ms')
      return NextResponse.json(
        { error: 'AI service took too long to respond. Please try again.' },
        { status: 504 }
      )
    }
    console.error('[AI Chat] Error:', error)
    return NextResponse.json(
      { error: 'Failed to communicate with AI service. Is it running on port 3007?' },
      { status: 500 }
    )
  }
}
