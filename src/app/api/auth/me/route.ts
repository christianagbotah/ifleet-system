import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { requireAuth } from '@/lib/auth-server'

// GET /api/auth/me - Validate session and return current user
export async function POST(request: NextRequest) {
  try {
    // SECURITY: Use JWT-authenticated user ID only
    const auth = requireAuth(request)
    if (auth instanceof NextResponse) return auth

    const user = await db.user.findUnique({
      where: { id: auth.userId },
      include: {
        role: { select: { name: true, permissions: true } },
        driver: { select: { id: true } },
      },
    })

    if (!user || !user.isActive) {
      return NextResponse.json({ user: null }, { status: 200 })
    }

    let permissions: string[] = []
    try {
      permissions = JSON.parse(user.role.permissions)
    } catch {
      permissions = []
    }

    const userData = {
      id: user.id,
      email: user.email,
      name: user.name,
      phone: user.phone,
      avatar: user.avatar,
      role: user.role.name,
      permissions,
      driverId: user.driver?.id ?? null,
      isActive: user.isActive,
    }

    return NextResponse.json({ user: userData })
  } catch (error) {
    console.error('Auth me error:', error)
    return NextResponse.json({ user: null }, { status: 200 })
  }
}
