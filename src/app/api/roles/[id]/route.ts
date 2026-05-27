import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { Prisma } from '@/generated/client'
import { requireRole, ROLES } from '@/lib/auth-server'
import { createAuditLog, getClientIp } from '@/lib/audit'

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const auth = requireRole(request, [ROLES.ADMIN, ROLES.MANAGER])
    if (auth instanceof NextResponse) return auth
    const { id } = await params

    const role = await db.role.findUnique({
      where: { id },
      include: {
        _count: {
          select: { User: true },
        },
      },
    })

    if (!role) {
      return NextResponse.json({ error: 'Role not found' }, { status: 404 })
    }

    const roleWithParsedPermissions = {
      id: role.id,
      name: role.name,
      description: role.description,
      permissions: JSON.parse(role.permissions || '[]'),
      isSystem: role.isSystem,
      createdAt: role.createdAt,
      updatedAt: role.updatedAt,
      userCount: role._count.User,
    }

    return NextResponse.json(roleWithParsedPermissions)
  } catch (error) {
    console.error('Role detail error:', error)
    return NextResponse.json({ error: 'Failed to fetch role' }, { status: 500 })
  }
}

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const auth = requireRole(request, [ROLES.ADMIN, ROLES.MANAGER])
    if (auth instanceof NextResponse) return auth
    const { id } = await params
    const body = await request.json()

    const role = await db.role.findUnique({ where: { id } })
    if (!role) {
      return NextResponse.json({ error: 'Role not found' }, { status: 404 })
    }

    const { name, description, permissions } = body

    // Check name uniqueness if changing
    if (name && name !== role.name) {
      const existing = await db.role.findUnique({ where: { name } })
      if (existing) {
        return NextResponse.json(
          { error: 'A role with this name already exists' },
          { status: 400 }
        )
      }
    }

    // Validate permissions is array if provided
    if (permissions !== undefined && !Array.isArray(permissions)) {
      return NextResponse.json(
        { error: 'permissions must be an array of permission strings' },
        { status: 400 }
      )
    }

    // Collect changed fields for audit log
    const changes: Record<string, unknown> = {}
    if (name !== undefined && name !== role.name) changes.name = name
    if (description !== undefined && description !== role.description) changes.description = description
    if (permissions !== undefined) changes.permissions = permissions

    const updateData: Prisma.RoleUpdateInput = {}

    if (name !== undefined) updateData.name = name
    if (description !== undefined) updateData.description = description || null
    if (permissions !== undefined) updateData.permissions = JSON.stringify(permissions)

    const updatedRole = await db.role.update({
      where: { id },
      data: updateData,
    })

    // Audit log: role updated (fire-and-forget)
    if (Object.keys(changes).length > 0) {
      createAuditLog({
        userId: auth.userId,
        action: 'update',
        entity: 'Role',
        entityId: id,
        details: changes,
        ipAddress: getClientIp(request),
      }).catch(() => {})
    }

    const roleWithParsedPermissions = {
      id: updatedRole.id,
      name: updatedRole.name,
      description: updatedRole.description,
      permissions: JSON.parse(updatedRole.permissions || '[]'),
      isSystem: updatedRole.isSystem,
      createdAt: updatedRole.createdAt,
      updatedAt: updatedRole.updatedAt,
    }

    return NextResponse.json(roleWithParsedPermissions)
  } catch (error) {
    console.error('Role update error:', error)
    return NextResponse.json({ error: 'Failed to update role' }, { status: 500 })
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const auth = requireRole(request, [ROLES.ADMIN, ROLES.MANAGER])
    if (auth instanceof NextResponse) return auth
    const { id } = await params

    const role = await db.role.findUnique({
      where: { id },
      include: {
        _count: {
          select: { User: true },
        },
      },
    })

    if (!role) {
      return NextResponse.json({ error: 'Role not found' }, { status: 404 })
    }

    // Cannot delete system roles
    if (role.isSystem) {
      return NextResponse.json(
        { error: 'Cannot delete system roles' },
        { status: 400 }
      )
    }

    // Check if any users are assigned to this role
    if (role._count.User > 0) {
      return NextResponse.json(
        { error: `Cannot delete role: ${role._count.User} user(s) are assigned to this role. Reassign them first.` },
        { status: 400 }
      )
    }

    await db.role.delete({ where: { id } })

    // Audit log: role deleted (fire-and-forget)
    createAuditLog({
      userId: auth.userId,
      action: 'delete',
      entity: 'Role',
      entityId: id,
      details: { name: role.name, description: role.description },
      ipAddress: getClientIp(request),
    }).catch(() => {})

    return NextResponse.json({
      message: `Role "${role.name}" deleted successfully`,
    })
  } catch (error) {
    console.error('Role delete error:', error)
    return NextResponse.json({ error: 'Failed to delete role' }, { status: 500 })
  }
}
