import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { requireRole, ROLES } from '@/lib/auth-server'
import { createAuditLog, getClientIp } from '@/lib/audit'

export async function GET(request: NextRequest) {
  try {
    const auth = requireRole(request, [ROLES.ADMIN, ROLES.MANAGER])
    if (auth instanceof NextResponse) return auth
    const roles = await db.role.findMany({
      include: {
        _count: {
          select: { users: true },
        },
      },
      orderBy: [
        { isSystem: 'desc' },
        { name: 'asc' },
      ],
    })

    const rolesWithParsedPermissions = roles.map((role) => ({
      id: role.id,
      name: role.name,
      description: role.description,
      permissions: JSON.parse(role.permissions || '[]'),
      isSystem: role.isSystem,
      createdAt: role.createdAt,
      updatedAt: role.updatedAt,
      userCount: role._count.users,
    }))

    return NextResponse.json({ data: rolesWithParsedPermissions })
  } catch (error) {
    console.error('Roles list error:', error)
    return NextResponse.json({ error: 'Failed to fetch roles' }, { status: 500 })
  }
}

export async function POST(request: NextRequest) {
  try {
    const auth = requireRole(request, [ROLES.ADMIN, ROLES.MANAGER])
    if (auth instanceof NextResponse) return auth
    const body = await request.json()

    const { name, description, permissions, isSystem } = body

    if (!name) {
      return NextResponse.json(
        { error: 'name is required' },
        { status: 400 }
      )
    }

    if (!Array.isArray(permissions)) {
      return NextResponse.json(
        { error: 'permissions must be an array of permission strings' },
        { status: 400 }
      )
    }

    // Check name uniqueness
    const existingRole = await db.role.findUnique({ where: { name } })
    if (existingRole) {
      return NextResponse.json(
        { error: 'A role with this name already exists' },
        { status: 400 }
      )
    }

    const role = await db.role.create({
      data: {
        name,
        description: description || null,
        permissions: JSON.stringify(permissions),
        isSystem: isSystem || false,
      },
    })

    // Audit log: role created (fire-and-forget)
    createAuditLog({
      userId: auth.userId,
      action: 'create',
      entity: 'Role',
      entityId: role.id,
      details: { name, description: description || null, permissionCount: permissions.length },
      ipAddress: getClientIp(request),
    }).catch(() => {})

    const roleWithParsedPermissions = {
      id: role.id,
      name: role.name,
      description: role.description,
      permissions: JSON.parse(role.permissions || '[]'),
      isSystem: role.isSystem,
      createdAt: role.createdAt,
      updatedAt: role.updatedAt,
    }

    return NextResponse.json(roleWithParsedPermissions, { status: 201 })
  } catch (error) {
    console.error('Role create error:', error)
    return NextResponse.json({ error: 'Failed to create role' }, { status: 500 })
  }
}
