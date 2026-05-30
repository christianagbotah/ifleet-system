import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { hashPassword } from '@/lib/auth-utils'
import { rateLimit, RATE_LIMITS, getClientIp } from '@/lib/rate-limit'
import { createAuditLog } from '@/lib/audit'
import { requireRole } from '@/lib/auth-server'
import { adminResetPasswordSchema, parseBody } from '@/lib/schemas'

const ENDPOINT_KEY = 'auth/admin-reset-password'

// ── POST: Admin resets another user's password ──────────────────────────

export async function POST(request: NextRequest) {
  try {
    // Require Admin role
    const auth = requireRole(request, 'Admin')
    if (auth instanceof NextResponse) return auth

    const raw = await request.json()
    const parsed = parseBody(adminResetPasswordSchema, raw)
    if (!parsed.success) {
      return NextResponse.json({ error: parsed.errors.join(', ') }, { status: 400 })
    }
    const { userId, newPassword } = parsed.data

    // Rate limiting
    const clientIp = getClientIp(request)
    const rateResult = rateLimit(`${auth.userId}:${ENDPOINT_KEY}`, RATE_LIMITS.sensitive)

    if (!rateResult.success) {
      const retryAfterSecs = rateResult.retryAfter ?? Math.ceil(RATE_LIMITS.sensitive.blockDurationMs! / 1000)
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

    // Password strength already validated by Zod schema

    // Find the target user
    const targetUser = await db.user.findUnique({
      where: { id: userId },
      select: {
        id: true,
        email: true,
        name: true,
        isActive: true,
      },
    })

    if (!targetUser) {
      return NextResponse.json(
        { error: 'User not found' },
        { status: 404 }
      )
    }

    if (!targetUser.isActive) {
      return NextResponse.json(
        { error: 'Cannot reset password for an inactive account' },
        { status: 400 }
      )
    }

    // Hash the new password and update the user
    const hashedPassword = await hashPassword(newPassword)
    await db.user.update({
      where: { id: targetUser.id },
      data: { password: hashedPassword },
    })

    // Audit log — record both the admin action and the password change
    createAuditLog({
      userId: auth.userId,
      action: 'password_change',
      entity: 'User',
      entityId: targetUser.id,
      details: {
        targetEmail: targetUser.email,
        targetName: targetUser.name,
        method: 'admin_reset',
        adminEmail: auth.email,
      },
      ipAddress: clientIp,
    }).catch(() => {})

    console.log(
      `[Auth] Admin ${auth.email} reset password for user: ${targetUser.email}`
    )

    return NextResponse.json({
      success: true,
      message: `Password has been reset for ${targetUser.name || targetUser.email}.`,
    })
  } catch (error) {
    console.error('Admin reset password error:', error)
    return NextResponse.json(
      { error: 'Failed to reset password. Please try again.' },
      { status: 500 }
    )
  }
}
