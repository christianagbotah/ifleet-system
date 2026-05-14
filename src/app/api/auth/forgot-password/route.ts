import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { generateResetToken } from '@/lib/auth-utils'
import { rateLimit, RATE_LIMITS, getClientIp } from '@/lib/rate-limit'
import { sendEmail } from '@/lib/services/email'
import { APP_NAME } from '@/lib/constants'

// ── In-memory reset token store ──────────────────────────────────────────
// In production this would be a database table (PasswordReset).
// Keyed by token → { email, userId, expiresAt }

interface ResetTokenEntry {
  email: string
  userId: string
  token: string
  expiresAt: number
  createdAt: number
}

// Re-export the store so other routes (reset-password, verify-reset-token) can use it
export const resetTokenStore = new Map<string, ResetTokenEntry>()

// Periodic cleanup of expired tokens (every 10 minutes)
const CLEANUP_INTERVAL_MS = 10 * 60 * 1000

if (typeof globalThis !== 'undefined') {
  setInterval(() => {
    const now = Date.now()
    for (const [key, entry] of resetTokenStore.entries()) {
      if (now >= entry.expiresAt) {
        resetTokenStore.delete(key)
      }
    }
  }, CLEANUP_INTERVAL_MS).unref()
}

const ENDPOINT_KEY = 'auth/forgot-password'

// ── POST: Initiate password reset ────────────────────────────────────────

export async function POST(request: NextRequest) {
  try {
    const { email } = await request.json()

    if (!email || typeof email !== 'string' || !email.trim()) {
      return NextResponse.json(
        { error: 'Email is required' },
        { status: 400 }
      )
    }

    // Rate limiting by client IP
    const clientIp = getClientIp(request)
    const rateResult = rateLimit(`${clientIp}:${ENDPOINT_KEY}`, RATE_LIMITS.login)

    if (!rateResult.success) {
      const retryAfterSecs = rateResult.retryAfter ?? Math.ceil(RATE_LIMITS.login.blockDurationMs! / 1000)
      const retryAfterMin = Math.ceil(retryAfterSecs / 60)

      return NextResponse.json(
        {
          error: `Too many password reset attempts. Please try again in ${retryAfterMin} minute${retryAfterMin !== 1 ? 's' : ''}.`,
          retryAfter: retryAfterSecs,
        },
        {
          status: 429,
          headers: { 'Retry-After': String(retryAfterSecs) },
        }
      )
    }

    const normalizedEmail = email.trim().toLowerCase()

    // Find user by email
    const user = await db.user.findUnique({
      where: { email: normalizedEmail },
      select: {
        id: true,
        email: true,
        name: true,
        isActive: true,
      },
    })

    // Generic response regardless of whether user exists (prevent email enumeration)
    // But only generate and send token if user actually exists
    let devToken: string | undefined

    if (user && user.isActive) {
      // Generate a secure reset token
      const token = generateResetToken()
      const shortCode = token.slice(0, 8) // 8-char short code for convenience
      const expiresAt = Date.now() + 60 * 60 * 1000 // 1 hour from now

      // Store the token (keyed by both full token AND short code for convenience)
      resetTokenStore.set(token, {
        email: user.email,
        userId: user.id,
        token,
        expiresAt,
        createdAt: Date.now(),
      })
      // Also store by short code for easier lookup
      resetTokenStore.set(shortCode, {
        email: user.email,
        userId: user.id,
        token,
        expiresAt,
        createdAt: Date.now(),
      })

      // Send password reset email (graceful degradation if SMTP not configured)
      try {
        const resetMessage = `
          <p>Hello ${user.name || 'User'},</p>
          <p>We received a request to reset your password for your ${APP_NAME} account.
          If you did not make this request, you can safely ignore this email.</p>
          <p><strong>Your reset code: ${shortCode}</strong></p>
          <p>This code will expire in 1 hour. Enter it on the password reset page to set a new password.</p>
          <p>If the link above doesn't work, you can use the full token instead.</p>
        `

        await sendEmail({
          to: user.email,
          subject: `${APP_NAME} — Password Reset Request`,
          html: resetMessage,
        })

        console.log(`[Auth] Password reset email sent to ${user.email}`)
      } catch (emailError) {
        console.error('[Auth] Failed to send password reset email:', emailError)
        // Don't fail the request — token is still stored in memory for dev/testing
      }

      // In development, return the token for testing convenience
      if (process.env.NODE_ENV === 'development') {
        devToken = shortCode
      }
    }

    // Always return the same generic success message
    return NextResponse.json({
      success: true,
      message: 'If an account with that email exists, a reset code has been sent.',
      ...(devToken && { devToken }),
    })
  } catch (error) {
    console.error('Forgot password error:', error)
    return NextResponse.json(
      { error: 'Failed to process request. Please try again.' },
      { status: 500 }
    )
  }
}
