import { NextRequest, NextResponse } from 'next/server'

import { createAuditLog, getClientIp } from '@/lib/audit'
import { requireAuth, requireWriteAccess } from '@/lib/auth-server'
import { db } from '@/lib/db'
import { trailerUpdateSchema } from '@/lib/domain/fleet-assets/trailer'

const detailInclude = {
  transporter: { select: { id: true, name: true, code: true } },
  vehicleOwner: { select: { id: true, name: true, code: true } },
  Trip: {
    orderBy: { departureTime: 'desc' as const },
    take: 20,
    select: { id: true, tripNumber: true, status: true, destination: true, departureTime: true },
  },
  TrailerCoupling: {
    orderBy: { coupledAt: 'desc' as const },
    take: 50,
    include: {
      tractor: { select: { id: true, plateNumber: true, status: true } },
      driver: { select: { id: true, firstName: true, lastName: true, status: true } },
      trip: { select: { id: true, tripNumber: true, status: true } },
    },
  },
} as const

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params
    const trailer = await db.trailer.findUnique({ where: { id }, include: detailInclude })
    if (!trailer) return NextResponse.json({ error: 'Trailer not found' }, { status: 404 })
    return NextResponse.json(trailer)
  } catch (error) {
    console.error('Trailer detail error:', error)
    return NextResponse.json({ error: 'Failed to fetch trailer' }, { status: 500 })
  }
}

async function updateTrailer(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const auth = requireAuth(request)
    if (auth instanceof NextResponse) return auth
    const writeGuard = requireWriteAccess(auth)
    if (writeGuard instanceof NextResponse) return writeGuard

    const { id } = await params
    const existing = await db.trailer.findUnique({
      where: { id },
      include: { TrailerCoupling: { where: { decoupledAt: null }, take: 1 } },
    })
    if (!existing) return NextResponse.json({ error: 'Trailer not found' }, { status: 404 })

    const parsed = trailerUpdateSchema.safeParse(await request.json())
    if (!parsed.success) {
      return NextResponse.json(
        { error: 'Invalid trailer data', details: parsed.error.flatten() },
        { status: 400 }
      )
    }
    const data = parsed.data
    if (Object.keys(data).length === 0) {
      return NextResponse.json({ error: 'No trailer fields supplied' }, { status: 400 })
    }

    if (data.status && data.status !== 'active' && existing.TrailerCoupling.length > 0) {
      return NextResponse.json(
        { error: 'Decouple the trailer before changing it to a non-active status' },
        { status: 409 }
      )
    }

    if (data.plateNumber && data.plateNumber !== existing.plateNumber) {
      const duplicate = await db.trailer.findUnique({ where: { plateNumber: data.plateNumber }, select: { id: true } })
      if (duplicate) return NextResponse.json({ error: 'Trailer plate number already exists' }, { status: 409 })
    }
    if (data.vinNumber && data.vinNumber !== existing.vinNumber) {
      const duplicate = await db.trailer.findUnique({ where: { vinNumber: data.vinNumber }, select: { id: true } })
      if (duplicate) return NextResponse.json({ error: 'Trailer VIN already exists' }, { status: 409 })
    }
    if (data.chassisNumber && data.chassisNumber !== existing.chassisNumber) {
      const duplicate = await db.trailer.findUnique({ where: { chassisNumber: data.chassisNumber }, select: { id: true } })
      if (duplicate) return NextResponse.json({ error: 'Trailer chassis number already exists' }, { status: 409 })
    }

    const updated = await db.trailer.update({ where: { id }, data, include: detailInclude })

    createAuditLog({
      userId: auth.userId,
      action: 'update',
      entity: 'Trailer',
      entityId: id,
      details: { fields: Object.keys(data) },
      ipAddress: getClientIp(request),
    }).catch(() => {})

    return NextResponse.json(updated)
  } catch (error) {
    console.error('Trailer update error:', error)
    return NextResponse.json({ error: 'Failed to update trailer' }, { status: 500 })
  }
}

export const PUT = updateTrailer
export const PATCH = updateTrailer

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
    const existing = await db.trailer.findUnique({
      where: { id },
      include: { TrailerCoupling: { where: { decoupledAt: null }, take: 1 } },
    })
    if (!existing) return NextResponse.json({ error: 'Trailer not found' }, { status: 404 })
    if (existing.TrailerCoupling.length > 0) {
      return NextResponse.json({ error: 'Decouple the trailer before decommissioning it' }, { status: 409 })
    }

    const trailer = await db.trailer.update({ where: { id }, data: { status: 'decommissioned' } })

    createAuditLog({
      userId: auth.userId,
      action: 'delete',
      entity: 'Trailer',
      entityId: id,
      details: { plateNumber: existing.plateNumber, previousStatus: existing.status },
      ipAddress: getClientIp(request),
    }).catch(() => {})

    return NextResponse.json(trailer)
  } catch (error) {
    console.error('Trailer decommission error:', error)
    return NextResponse.json({ error: 'Failed to decommission trailer' }, { status: 500 })
  }
}
