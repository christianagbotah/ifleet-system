import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { requireAuth, requireWriteAccess } from '@/lib/auth-server'
import { createAuditLog, getClientIp } from '@/lib/audit'

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const status = searchParams.get('status')
    const search = searchParams.get('search')
    const make = searchParams.get('make')
    const page = parseInt(searchParams.get('page') || '1')
    const limit = parseInt(searchParams.get('limit') || '20')

    const where: Record<string, unknown> = {}

    // If driverId is provided, only show trucks assigned to that driver
    const driverId = searchParams.get('driverId')
    if (driverId) where.driverId = driverId

    if (status) where.status = status
    if (make) where.make = { contains: make }
    if (search) {
      where.OR = [
        { plateNumber: { contains: search } },
        { vinNumber: { contains: search } },
        { chassisNumber: { contains: search } },
      ]
    }

    const [trucks, total] = await Promise.all([
      db.truck.findMany({
        where,
        include: {
          driver: { select: { id: true, firstName: true, lastName: true, phone: true, status: true } },
        },
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * limit,
        take: limit,
      }),
      db.truck.count({ where }),
    ])

    return NextResponse.json({ data: trucks, total, page, limit })
  } catch (error) {
    console.error('Trucks list error:', error)
    return NextResponse.json({ error: 'Failed to fetch trucks' }, { status: 500 })
  }
}

export async function POST(request: NextRequest) {
  try {
    const auth = requireAuth(request)
    if (auth instanceof NextResponse) return auth
    const writeGuard = requireWriteAccess(auth)
    if (writeGuard instanceof NextResponse) return writeGuard

    const body = await request.json()

    const {
      plateNumber,
      make,
      model,
      year,
      vinNumber,
      engineNumber,
      chassisNumber,
      color,
      fuelType,
      tankCapacity,
      status,
      notes,
    } = body

    if (!plateNumber || !make || !model || !year) {
      return NextResponse.json(
        { error: 'plateNumber, make, model, and year are required' },
        { status: 400 }
      )
    }

    // Check for duplicate plate number
    const existing = await db.truck.findUnique({ where: { plateNumber } })
    if (existing) {
      return NextResponse.json({ error: 'Truck with this plate number already exists' }, { status: 400 })
    }

    if (vinNumber) {
      const existingVin = await db.truck.findUnique({ where: { vinNumber } })
      if (existingVin) {
        return NextResponse.json({ error: 'Truck with this VIN number already exists' }, { status: 400 })
      }
    }

    const truck = await db.truck.create({
      data: {
        plateNumber,
        make,
        model,
        year,
        vinNumber,
        engineNumber,
        chassisNumber,
        color,
        fuelType: fuelType || 'Diesel',
        tankCapacity: tankCapacity ? parseFloat(tankCapacity) : null,
        status: status || 'active',
        notes,
      },
    })

    // Audit log: truck created (fire-and-forget)
    createAuditLog({
      userId: auth.userId,
      action: 'create',
      entity: 'Truck',
      entityId: truck.id,
      details: { plateNumber, make, model },
      ipAddress: getClientIp(request),
    }).catch(() => {})

    return NextResponse.json(truck, { status: 201 })
  } catch (error) {
    console.error('Truck create error:', error)
    return NextResponse.json({ error: 'Failed to create truck' }, { status: 500 })
  }
}
