import { NextRequest, NextResponse } from 'next/server'

import { createAuditLog, getClientIp } from '@/lib/audit'
import { requireAuth, requireWriteAccess } from '@/lib/auth-server'
import { db } from '@/lib/db'
import { trailerCreateSchema } from '@/lib/domain/fleet-assets/trailer'

const currentCouplingInclude = {
  tractor: { select: { id: true, plateNumber: true, status: true } },
  driver: { select: { id: true, firstName: true, lastName: true, status: true } },
  trip: { select: { id: true, tripNumber: true, status: true, destination: true } },
} as const

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const search = searchParams.get('search')?.trim()
    const status = searchParams.get('status')?.trim()
    const page = Math.max(1, Number.parseInt(searchParams.get('page') || '1', 10) || 1)
    const limit = Math.min(100, Math.max(1, Number.parseInt(searchParams.get('limit') || '20', 10) || 20))

    const where = {
      ...(status && status !== 'all' ? { status: status as never } : {}),
      ...(search
        ? {
            OR: [
              { plateNumber: { contains: search } },
              { vinNumber: { contains: search } },
              { chassisNumber: { contains: search } },
              { trailerType: { contains: search } },
              { bodyType: { contains: search } },
            ],
          }
        : {}),
    }

    const [trailers, total] = await Promise.all([
      db.trailer.findMany({
        where,
        include: {
          transporter: { select: { id: true, name: true, code: true } },
          vehicleOwner: { select: { id: true, name: true, code: true } },
          TrailerCoupling: {
            where: { decoupledAt: null },
            orderBy: { coupledAt: 'desc' },
            take: 1,
            include: currentCouplingInclude,
          },
        },
        orderBy: [{ status: 'asc' }, { plateNumber: 'asc' }],
        skip: (page - 1) * limit,
        take: limit,
      }),
      db.trailer.count({ where }),
    ])

    return NextResponse.json({
      data: trailers.map(({ TrailerCoupling, ...trailer }) => ({
        ...trailer,
        currentCoupling: TrailerCoupling[0] ?? null,
      })),
      total,
      page,
      limit,
    })
  } catch (error) {
    console.error('Trailer list error:', error)
    return NextResponse.json({ error: 'Failed to fetch trailers' }, { status: 500 })
  }
}

export async function POST(request: NextRequest) {
  try {
    const auth = requireAuth(request)
    if (auth instanceof NextResponse) return auth
    const writeGuard = requireWriteAccess(auth)
    if (writeGuard instanceof NextResponse) return writeGuard

    const parsed = trailerCreateSchema.safeParse(await request.json())
    if (!parsed.success) {
      return NextResponse.json(
        { error: 'Invalid trailer data', details: parsed.error.flatten() },
        { status: 400 }
      )
    }

    const data = parsed.data
    const [plateDuplicate, vinDuplicate, chassisDuplicate] = await Promise.all([
      db.trailer.findUnique({ where: { plateNumber: data.plateNumber }, select: { id: true } }),
      data.vinNumber
        ? db.trailer.findUnique({ where: { vinNumber: data.vinNumber }, select: { id: true } })
        : Promise.resolve(null),
      data.chassisNumber
        ? db.trailer.findUnique({ where: { chassisNumber: data.chassisNumber }, select: { id: true } })
        : Promise.resolve(null),
    ])

    if (plateDuplicate) return NextResponse.json({ error: 'Trailer plate number already exists' }, { status: 409 })
    if (vinDuplicate) return NextResponse.json({ error: 'Trailer VIN already exists' }, { status: 409 })
    if (chassisDuplicate) return NextResponse.json({ error: 'Trailer chassis number already exists' }, { status: 409 })

    const trailer = await db.trailer.create({ data })

    createAuditLog({
      userId: auth.userId,
      action: 'create',
      entity: 'Trailer',
      entityId: trailer.id,
      details: { plateNumber: trailer.plateNumber, trailerType: trailer.trailerType },
      ipAddress: getClientIp(request),
    }).catch(() => {})

    return NextResponse.json(trailer, { status: 201 })
  } catch (error) {
    console.error('Trailer create error:', error)
    return NextResponse.json({ error: 'Failed to create trailer' }, { status: 500 })
  }
}
