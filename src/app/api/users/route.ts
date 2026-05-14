import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { Prisma } from '@prisma/client'
import { hashPassword } from '@/lib/auth-utils'
import { requireRole, ROLES } from '@/lib/auth-server'
import { createAuditLog, getClientIp } from '@/lib/audit'

export async function GET(request: NextRequest) {
  try {
    const auth = requireRole(request, [ROLES.ADMIN, ROLES.MANAGER])
    if (auth instanceof NextResponse) return auth
    const { searchParams } = new URL(request.url)
    const search = searchParams.get('search')
    const status = searchParams.get('status')
    const roleId = searchParams.get('roleId')
    const department = searchParams.get('department')
    const page = parseInt(searchParams.get('page') || '1')
    const limit = parseInt(searchParams.get('limit') || '20')

    const where: Prisma.UserWhereInput = {}

    if (search) {
      where.OR = [
        { name: { contains: search } },
        { email: { contains: search } },
        { phone: { contains: search } },
      ]
    }

    if (status) {
      where.isActive = status === 'active'
    }

    if (roleId) {
      where.roleId = roleId
    }

    if (department) {
      where.department = department
    }

    const [users, total] = await Promise.all([
      db.user.findMany({
        where,
        select: {
          id: true,
          email: true,
          name: true,
          phone: true,
          avatar: true,
          roleId: true,
          position: true,
          department: true,
          employeeNumber: true,
          isActive: true,
          lastLogin: true,
          createdAt: true,
          updatedAt: true,
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
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * limit,
        take: limit,
      }),
      db.user.count({ where }),
    ])

    // Parse permissions JSON for each user's role
    const usersWithParsedPermissions = users.map((user) => ({
      ...user,
      role: {
        ...user.role,
        permissions: user.role
          ? JSON.parse(user.role.permissions || '[]')
          : [],
      },
    }))

    return NextResponse.json({
      data: usersWithParsedPermissions,
      total,
      page,
      limit,
    })
  } catch (error) {
    console.error('Users list error:', error)
    return NextResponse.json({ error: 'Failed to fetch users' }, { status: 500 })
  }
}

export async function POST(request: NextRequest) {
  try {
    const auth = requireRole(request, [ROLES.ADMIN, ROLES.MANAGER])
    if (auth instanceof NextResponse) return auth
    const body = await request.json()

    const { name, email, phone, password, roleId, isActive, position, department, employeeNumber } = body

    if (!name || !email || !password || !roleId) {
      return NextResponse.json(
        { error: 'name, email, password, and roleId are required' },
        { status: 400 }
      )
    }

    if (employeeNumber) {
      const existingEmpNum = await db.user.findUnique({ where: { employeeNumber } })
      if (existingEmpNum) {
        return NextResponse.json(
          { error: 'A user with this employee number already exists' },
          { status: 400 }
        )
      }
    }

    if (password.length < 4) {
      return NextResponse.json(
        { error: 'Password must be at least 4 characters' },
        { status: 400 }
      )
    }

    // Check email uniqueness
    const existingEmail = await db.user.findUnique({ where: { email } })
    if (existingEmail) {
      return NextResponse.json(
        { error: 'A user with this email already exists' },
        { status: 400 }
      )
    }

    // Check roleId exists
    const role = await db.role.findUnique({ where: { id: roleId } })
    if (!role) {
      return NextResponse.json(
        { error: 'Role not found' },
        { status: 400 }
      )
    }

    const user = await db.user.create({
      data: {
        name,
        email,
        phone: phone || null,
        password: await hashPassword(password),
        roleId,
        position: position || null,
        department: department || null,
        employeeNumber: employeeNumber || null,
        isActive: isActive !== undefined ? isActive : true,
      },
      select: {
        id: true,
        email: true,
        name: true,
        phone: true,
        avatar: true,
        roleId: true,
        position: true,
        department: true,
        employeeNumber: true,
        isActive: true,
        lastLogin: true,
        createdAt: true,
        updatedAt: true,
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

    // Audit log: user created (fire-and-forget)
    createAuditLog({
      userId: auth.userId,
      action: 'create',
      entity: 'User',
      entityId: user.id,
      details: { email, roleName: role.name },
      ipAddress: getClientIp(request),
    }).catch(() => {})

    const userWithParsedPermissions = {
      ...user,
      role: {
        ...user.role,
        permissions: user.role
          ? JSON.parse(user.role.permissions || '[]')
          : [],
      },
    }

    return NextResponse.json(userWithParsedPermissions, { status: 201 })
  } catch (error) {
    console.error('User create error:', error)
    return NextResponse.json({ error: 'Failed to create user' }, { status: 500 })
  }
}
