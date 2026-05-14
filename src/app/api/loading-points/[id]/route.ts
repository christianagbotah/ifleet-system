import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { requireAuth, requireWriteAccess } from '@/lib/auth-server'
import { createAuditLog, getClientIp } from '@/lib/audit'

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const auth = requireAuth(request)
    if (auth instanceof NextResponse) return auth

    const { id } = await params

    const record = await db.loadingPoint.findUnique({
      where: { id },
      include: {
        loadingCity: { select: { id: true, name: true, region: true } },
        _count: { select: { trips: true } },
      },
    })

    if (!record) {
      return NextResponse.json({ error: 'Loading point not found' }, { status: 404 })
    }

    return NextResponse.json(record)
  } catch (error) {
    console.error('Loading point detail error:', error)
    return NextResponse.json({ error: 'Failed to fetch loading point' }, { status: 500 })
  }
}

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const auth = requireAuth(request)
    if (auth instanceof NextResponse) return auth
    const writeGuard = requireWriteAccess(auth)
    if (writeGuard instanceof NextResponse) return writeGuard

    const { id } = await params
    const body = await request.json()
    const { name, loadingCityId, address, contactPerson, contactPhone, isActive } = body

    const existing = await db.loadingPoint.findUnique({ where: { id } })
    if (!existing) {
      return NextResponse.json({ error: 'Loading point not found' }, { status: 404 })
    }

    // Check uniqueness if changing name or city
    if ((name && name.trim() !== existing.name) || (loadingCityId && loadingCityId !== existing.loadingCityId)) {
      const checkName = (name?.trim() || existing.name)
      const checkCityId = loadingCityId || existing.loadingCityId
      const duplicate = await db.loadingPoint.findUnique({
        where: { name_loadingCityId: { name: checkName, loadingCityId: checkCityId } },
      })
      if (duplicate) {
        return NextResponse.json(
          { error: 'Loading point with this name already exists in this city' },
          { status: 400 }
        )
      }
    }

    if (loadingCityId) {
      const city = await db.loadingCity.findUnique({ where: { id: loadingCityId } })
      if (!city) {
        return NextResponse.json({ error: 'Loading city not found' }, { status: 400 })
      }
    }

    const changes: Record<string, unknown> = {}
    if (name !== undefined && name !== existing.name) changes.name = name
    if (loadingCityId !== undefined && loadingCityId !== existing.loadingCityId) changes.loadingCityId = loadingCityId
    if (address !== undefined && address !== existing.address) changes.address = address
    if (contactPerson !== undefined && contactPerson !== existing.contactPerson) changes.contactPerson = contactPerson
    if (contactPhone !== undefined && contactPhone !== existing.contactPhone) changes.contactPhone = contactPhone
    if (isActive !== undefined && isActive !== existing.isActive) changes.isActive = isActive

    const updated = await db.loadingPoint.update({
      where: { id },
      data: {
        ...(name !== undefined && { name: name.trim() }),
        ...(loadingCityId !== undefined && { loadingCityId }),
        ...(address !== undefined && { address: address?.trim() || null }),
        ...(contactPerson !== undefined && { contactPerson: contactPerson?.trim() || null }),
        ...(contactPhone !== undefined && { contactPhone: contactPhone?.trim() || null }),
        ...(isActive !== undefined && { isActive: Boolean(isActive) }),
      },
      include: {
        loadingCity: { select: { id: true, name: true, region: true } },
      },
    })

    if (Object.keys(changes).length > 0) {
      createAuditLog({
        userId: auth.userId,
        action: 'update',
        entity: 'LoadingPoint',
        entityId: id,
        details: changes,
        ipAddress: getClientIp(request),
      }).catch(() => {})
    }

    return NextResponse.json(updated)
  } catch (error) {
    console.error('Loading point update error:', error)
    return NextResponse.json({ error: 'Failed to update loading point' }, { status: 500 })
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const auth = requireAuth(request)
    if (auth instanceof NextResponse) return auth
    const writeGuard = requireWriteAccess(auth)
    if (writeGuard instanceof NextResponse) return writeGuard

    const { id } = await params

    const existing = await db.loadingPoint.findUnique({ where: { id } })
    if (!existing) {
      return NextResponse.json({ error: 'Loading point not found' }, { status: 404 })
    }

    const updated = await db.loadingPoint.update({
      where: { id },
      data: { isActive: false },
    })

    createAuditLog({
      userId: auth.userId,
      action: 'delete',
      entity: 'LoadingPoint',
      entityId: id,
      details: { name: existing.name, softDeleted: true },
      ipAddress: getClientIp(request),
    }).catch(() => {})

    return NextResponse.json(updated)
  } catch (error) {
    console.error('Loading point delete error:', error)
    return NextResponse.json({ error: 'Failed to delete loading point' }, { status: 500 })
  }
}
