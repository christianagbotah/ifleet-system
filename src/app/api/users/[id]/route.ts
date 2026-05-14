import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { Prisma } from '@prisma/client'
import { hashPassword } from '@/lib/auth-utils'
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

    const user = await db.user.findUnique({
      where: { id },
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

    if (!user) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 })
    }

    const userWithParsedPermissions = {
      ...user,
      role: {
        ...user.role,
        permissions: user.role
          ? JSON.parse(user.role.permissions || '[]')
          : [],
      },
    }

    return NextResponse.json(userWithParsedPermissions)
  } catch (error) {
    console.error('User detail error:', error)
    return NextResponse.json({ error: 'Failed to fetch user' }, { status: 500 })
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

    const user = await db.user.findUnique({ where: { id } })
    if (!user) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 })
    }

    const {
      name,
      email,
      phone,
      password,
      roleId,
      isActive,
      driverId,
      position,
      department,
      employeeNumber,
    } = body

    // Check email uniqueness if changing
    if (email && email !== user.email) {
      const existing = await db.user.findUnique({ where: { email } })
      if (existing) {
        return NextResponse.json(
          { error: 'A user with this email already exists' },
          { status: 400 }
        )
      }
    }

    // Check employeeNumber uniqueness if changing
    if (employeeNumber && employeeNumber !== user.employeeNumber) {
      const existingEmpNum = await db.user.findUnique({ where: { employeeNumber } })
      if (existingEmpNum) {
        return NextResponse.json(
          { error: 'A user with this employee number already exists' },
          { status: 400 }
        )
      }
    }

    // Check roleId exists if changing
    if (roleId && roleId !== user.roleId) {
      const role = await db.role.findUnique({ where: { id: roleId } })
      if (!role) {
        return NextResponse.json({ error: 'Role not found' }, { status: 400 })
      }
    }

    // Collect changed fields for audit log
    const changes: Record<string, unknown> = {}
    if (name !== undefined && name !== user.name) changes.name = name
    if (email !== undefined && email !== user.email) changes.email = email
    if (roleId !== undefined && roleId !== user.roleId) changes.roleId = roleId
    if (isActive !== undefined && isActive !== user.isActive) changes.isActive = isActive

    const updateData: Prisma.UserUpdateInput = {}

    if (name !== undefined) updateData.name = name
    if (email !== undefined) updateData.email = email
    if (phone !== undefined) updateData.phone = phone || null
    if (password !== undefined) updateData.password = await hashPassword(password)
    if (roleId !== undefined) updateData.role = { connect: { id: roleId } }
    if (isActive !== undefined) updateData.isActive = isActive
    if (position !== undefined) updateData.position = position || null
    if (department !== undefined) updateData.department = department || null
    if (employeeNumber !== undefined) updateData.employeeNumber = employeeNumber || null
    if (driverId !== undefined) {
      updateData.driver = driverId
        ? { connect: { id: driverId } }
        : { disconnect: true }
    }

    const updatedUser = await db.user.update({
      where: { id },
      data: updateData,
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

    // Audit log: user updated (fire-and-forget)
    if (Object.keys(changes).length > 0) {
      createAuditLog({
        userId: auth.userId,
        action: 'update',
        entity: 'User',
        entityId: id,
        details: changes,
        ipAddress: getClientIp(request),
      }).catch(() => {})
    }

    const userWithParsedPermissions = {
      ...updatedUser,
      role: {
        ...updatedUser.role,
        permissions: updatedUser.role
          ? JSON.parse(updatedUser.role.permissions || '[]')
          : [],
      },
    }

    return NextResponse.json(userWithParsedPermissions)
  } catch (error) {
    console.error('User update error:', error)
    return NextResponse.json({ error: 'Failed to update user' }, { status: 500 })
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

    const user = await db.user.findUnique({ where: { id } })
    if (!user) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 })
    }

    if (user.isActive) {
      // Soft delete: deactivate the user
      const deactivatedUser = await db.user.update({
        where: { id },
        data: { isActive: false },
        select: {
          id: true,
          email: true,
          name: true,
          phone: true,
          avatar: true,
          roleId: true,
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

      const userWithParsedPermissions = {
        ...deactivatedUser,
        role: {
          ...deactivatedUser.role,
          permissions: deactivatedUser.role
            ? JSON.parse(deactivatedUser.role.permissions || '[]')
            : [],
        },
      }

      // Audit log: user deactivated (fire-and-forget)
      createAuditLog({
        userId: auth.userId,
        action: 'delete',
        entity: 'User',
        entityId: id,
        details: { email: user.email, name: user.name, action: 'deactivated' },
        ipAddress: getClientIp(request),
      }).catch(() => {})

      return NextResponse.json({
        message: 'User deactivated successfully',
        user: userWithParsedPermissions,
      })
    } else {
      // Already inactive: hard delete
      // First disconnect the driver if linked
      const linkedDriver = await db.driver.findFirst({ where: { userId: id } })
      if (linkedDriver) {
        await db.driver.update({
          where: { id: linkedDriver.id },
          data: { userId: null },
        })
      }

      await db.user.delete({ where: { id } })

      // Audit log: user permanently deleted (fire-and-forget)
      createAuditLog({
        userId: auth.userId,
        action: 'delete',
        entity: 'User',
        entityId: id,
        details: { email: user.email, name: user.name, action: 'permanently_deleted' },
        ipAddress: getClientIp(request),
      }).catch(() => {})

      return NextResponse.json({
        message: 'User permanently deleted',
      })
    }
  } catch (error) {
    console.error('User delete error:', error)
    return NextResponse.json({ error: 'Failed to delete user' }, { status: 500 })
  }
}
