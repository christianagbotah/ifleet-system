import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { comparePassword, hashPassword } from '@/lib/auth-utils'
import { requireAuth } from '@/lib/auth-server'
import { createAuditLog, getClientIp } from '@/lib/audit'
import { rateLimit, RATE_LIMITS, getClientIp as getClientIpFromRateLimit } from '@/lib/rate-limit'

const ENDPOINT_KEY = 'auth/change-password'

export async function POST(request: NextRequest) {
  try {
    // Rate limiting by client IP (sensitive config: 20/min, block 15min)
    const clientIp = getClientIpFromRateLimit(request)
    const rateResult = rateLimit(`${clientIp}:${ENDPOINT_KEY}`, RATE_LIMITS.sensitive)

    if (!rateResult.success) {
      const retryAfterSecs = rateResult.retryAfter ?? 60
      return NextResponse.json(
        {
          error: `Too many password change attempts. Please try again in ${retryAfterSecs} seconds.`,
          retryAfter: retryAfterSecs,
        },
        {
          status: 429,
          headers: { 'Retry-After': String(retryAfterSecs) },
        }
      )
    }

    // SECURITY: Use JWT-authenticated user ID, NOT body-provided userId
    const auth = requireAuth(request)
    if (auth instanceof NextResponse) return auth

    const body = await request.json()
    const { currentPassword, newPassword } = body

    if (!currentPassword || !newPassword) {
      return NextResponse.json({ error: 'Current password and new password are required' }, { status: 400 })
    }

    if (newPassword.length < 6) {
      return NextResponse.json({ error: 'New password must be at least 6 characters' }, { status: 400 })
    }

    // SECURITY: Always use the authenticated user's ID — ignore any userId from body
    const userId = auth.userId

    // Find user with password
    const user = await db.user.findUnique({
      where: { id: userId },
      select: { id: true, password: true },
    })

    if (!user) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 })
    }

    if (!user.password) {
      return NextResponse.json({ error: 'No password set for this account' }, { status: 400 })
    }

    // Verify current password using bcrypt
    const isCurrentPasswordValid = await comparePassword(currentPassword, user.password)

    if (!isCurrentPasswordValid) {
      return NextResponse.json({ error: 'Current password is incorrect' }, { status: 400 })
    }

    // Hash the new password before saving
    const hashedNewPassword = await hashPassword(newPassword)

    // Update password
    await db.user.update({
      where: { id: userId },
      data: { password: hashedNewPassword },
    })

    // Audit log: password change (fire-and-forget)
    createAuditLog({
      userId,
      action: 'password_change',
      entity: 'User',
      entityId: userId,
      ipAddress: getClientIp(request),
    }).catch(() => {})

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('Password change error:', error)
    return NextResponse.json({ error: 'Failed to change password' }, { status: 500 })
  }
}
