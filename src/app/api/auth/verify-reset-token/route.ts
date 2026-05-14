import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { resetTokenStore } from '@/app/api/auth/forgot-password/route'

// ── GET: Verify a reset token (without consuming it) ─────────────────────
// Used by the frontend to provide real-time feedback on token validity.

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const token = searchParams.get('token')

    if (!token || !token.trim()) {
      return NextResponse.json(
        { valid: false, error: 'Token is required' },
        { status: 400 }
      )
    }

    const trimmedToken = token.trim()

    // Look up the token (supports both full token and 8-char short code)
    const entry = resetTokenStore.get(trimmedToken)

    if (!entry) {
      return NextResponse.json({
        valid: false,
        error: 'Invalid reset code',
      })
    }

    // Check if token has expired
    if (Date.now() >= entry.expiresAt) {
      return NextResponse.json({
        valid: false,
        error: 'Reset code has expired',
      })
    }

    // Find the associated user
    const user = await db.user.findUnique({
      where: { id: entry.userId },
      select: {
        id: true,
        email: true,
        name: true,
        isActive: true,
      },
    })

    if (!user || !user.isActive) {
      return NextResponse.json({
        valid: false,
        error: 'Account not found or inactive',
      })
    }

    return NextResponse.json({
      valid: true,
      user: {
        id: user.id,
        email: user.email,
        name: user.name,
      },
    })
  } catch (error) {
    console.error('Verify reset token error:', error)
    return NextResponse.json(
      { valid: false, error: 'Failed to verify token' },
      { status: 500 }
    )
  }
}
