import { NextRequest, NextResponse } from 'next/server'
import { requireAuth } from '@/lib/auth-server'

const AI_SERVICE_URL = 'http://localhost:3007'
const INTERNAL_API_KEY = process.env.INTERNAL_API_KEY || 'ifleetpro-internal-key-change-me'

export async function POST(request: NextRequest) {
  try {
    const auth = requireAuth(request)
    if (auth instanceof NextResponse) return auth

    const body = await request.json()
    const { invoiceId, disputeReason, invoiceData } = body

    if (!invoiceId || typeof invoiceId !== 'string') {
      return NextResponse.json(
        { error: 'invoiceId is required and must be a string' },
        { status: 400 }
      )
    }

    if (!disputeReason || typeof disputeReason !== 'string') {
      return NextResponse.json(
        { error: 'disputeReason is required and must be a string' },
        { status: 400 }
      )
    }

    if (!invoiceData || typeof invoiceData !== 'object') {
      return NextResponse.json(
        { error: 'invoiceData is required and must be an object' },
        { status: 400 }
      )
    }

    // Forward to AI service
    const response = await fetch(`${AI_SERVICE_URL}/api/invoice-dispute`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-internal-api-key': INTERNAL_API_KEY,
      },
      body: JSON.stringify({
        invoiceId,
        disputeReason,
        invoiceData,
        userId: auth.userId,
      }),
    })

    const data = await response.json()

    if (!response.ok) {
      return NextResponse.json(
        { error: data.error || 'AI invoice dispute service error' },
        { status: response.status }
      )
    }

    return NextResponse.json(data)
  } catch (error) {
    console.error('[AI Invoice Dispute] Error:', error)
    return NextResponse.json(
      { error: 'Failed to communicate with AI invoice dispute service' },
      { status: 500 }
    )
  }
}
