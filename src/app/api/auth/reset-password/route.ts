import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { hashPassword } from '@/lib/auth-utils'
import { rateLimit, RATE_LIMITS, getClientIp } from '@/lib/rate-limit'
import { createAuditLog } from '@/lib/audit'
import { resetTokenStore } from '@/app/api/auth/forgot-password/route'
import { resetPasswordSchema, parseBody } from '@/lib/schemas'

const ENDPOINT_KEY = 'auth/reset-password'

// ── POST: Reset password using token ─────────────────────────────────────

export async function POST(request: NextRequest) {
  try {
    const raw = await request.json()
    const parsed = parseBody(resetPasswordSchema, raw)
    if (!parsed.success) {
      return NextResponse.json({ error: parsed.errors.join(', ') }, { status: 400 })
    }
    const { token, newPassword } = parsed.data

    // Rate limiting
    const clientIp = getClientIp(request)
    const rateResult = rateLimit(`${clientIp}:${ENDPOINT_KEY}`, RATE_LIMITS.sensitive)

    if (!rateResult.success) {
      const retryAfterSecs = rateResult.retryAfter ?? Math.ceil(RATE_LIMITS.sensitive.blockDurationMs! / 1000)
      const retryAfterMin = Math.ceil(retryAfterSecs / 60)

      return NextResponse.json(
        {
          error: `Too many reset attempts. Please try again in ${retryAfterMin} minute${retryAfterMin !== 1 ? 's' : ''}.`,
          retryAfter: retryAfterSecs,
        },
        {
          status: 429,
          headers: { 'Retry-After': String(retryAfterSecs) },
        }
      )
    }

    // Validate password strength (double-check — Zod already enforces this)
    if (newPassword.length < 6) {
      return NextResponse.json(
        { error: 'New password is too short' },
        { status: 400 }
      )
    }

    const trimmedToken = token.trim()

    // Look up the token (supports both full token and 8-char short code)
    const entry = resetTokenStore.get(trimmedToken)

    if (!entry) {
      return NextResponse.json(
        { error: 'Invalid or expired reset code' },
        { status: 400 }
      )
    }

    // Check if token has expired
    if (Date.now() >= entry.expiresAt) {
      // Clean up expired token
      resetTokenStore.delete(trimmedToken)
      // Also clean up the other entry (full token or short code)
      if (entry.token !== trimmedToken) {
        resetTokenStore.delete(entry.token)
      } else {
        // Also delete the short code entry
        resetTokenStore.delete(entry.token.slice(0, 8))
      }

      return NextResponse.json(
        { error: 'Reset code has expired. Please request a new one.' },
        { status: 400 }
      )
    }

    // Find the user
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
      // Clean up token
      resetTokenStore.delete(trimmedToken)
      if (entry.token !== trimmedToken) resetTokenStore.delete(entry.token)

      return NextResponse.json(
        { error: 'Account not found or inactive. Please contact your administrator.' },
        { status: 400 }
      )
    }

    // Hash the new password and update the user
    const hashedPassword = await hashPassword(newPassword)
    await db.user.update({
      where: { id: user.id },
      data: { password: hashedPassword },
    })

    // Clean up all token entries (full token + short code)
    resetTokenStore.delete(entry.token) // full token
    resetTokenStore.delete(entry.token.slice(0, 8)) // short code

    // Audit log (fire-and-forget)
    createAuditLog({
      userId: user.id,
      action: 'password_change',
      entity: 'User',
      entityId: user.id,
      details: {
        email: user.email,
        method: 'reset_token',
      },
      ipAddress: clientIp,
    }).catch(() => {})

    console.log(`[Auth] Password reset successfully for user: ${user.email}`)

    return NextResponse.json({
      success: true,
      message: 'Password has been reset successfully. You can now sign in with your new password.',
    })
  } catch (error) {
    console.error('Reset password error:', error)
    return NextResponse.json(
      { error: 'Failed to reset password. Please try again.' },
      { status: 500 }
    )
  }
}
