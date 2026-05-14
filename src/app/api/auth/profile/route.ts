import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { requireAuth } from '@/lib/auth-server'

export async function GET(request: NextRequest) {
  try {
    // SECURITY: Use JWT-authenticated user ID only
    const auth = requireAuth(request)
    if (auth instanceof NextResponse) return auth

    const user = await db.user.findUnique({
      where: { id: auth.userId },
      select: {
        id: true,
        email: true,
        name: true,
        phone: true,
        avatar: true,
        isActive: true,
        lastLogin: true,
        createdAt: true,
        updatedAt: true,
        roleId: true,
        role: {
          select: {
            id: true,
            name: true,
            permissions: true,
          },
        },
        driver: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
          },
        },
      },
    })

    if (!user) {
      return NextResponse.json({ error: 'User not found' }, { status: 401 })
    }

    // Parse permissions from JSON string
    let permissions: string[] = []
    try {
      permissions = JSON.parse((user.role as unknown as { permissions: string }).permissions || '[]')
    } catch {
      permissions = []
    }

    return NextResponse.json({
      ...user,
      role: {
        ...user.role,
        permissions,
      },
    })
  } catch (error) {
    console.error('Profile fetch error:', error)
    return NextResponse.json({ error: 'Failed to fetch profile' }, { status: 500 })
  }
}
