import { db } from '@/lib/db'
import { NextRequest, NextResponse } from 'next/server'
import { requireAuth, requireWriteAccess } from '@/lib/auth-server'

// GET /api/tracking/config - Return tracking config for trucks
// Supports ?driverId=xxx to filter to only trucks assigned to that driver
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const driverId = searchParams.get('driverId')

    let where: Record<string, unknown> = {}

    // If driverId is provided, only show trucks assigned to this driver
    if (driverId) {
      where = {
        truck: {
          driverId,
        },
      }
    }

    const configs = await db.trackingConfig.findMany({
      where,
      include: {
        truck: {
          select: {
            id: true,
            plateNumber: true,
            make: true,
            model: true,
            status: true,
            driverId: true,
            driver: { select: { id: true, firstName: true, lastName: true } },
          },
        },
      },
      orderBy: { createdAt: 'desc' },
    })

    return NextResponse.json(configs)
  } catch (error: unknown) {
    console.error('Error fetching tracking configs:', error)
    return NextResponse.json({ error: 'Failed to fetch tracking configs' }, { status: 500 })
  }
}

// PUT /api/tracking/config - Update tracking config for a truck
export async function PUT(request: NextRequest) {
  try {
    const auth = requireAuth(request)
    if (auth instanceof NextResponse) return auth
    const writeGuard = requireWriteAccess(auth)
    if (writeGuard instanceof NextResponse) return writeGuard

    const body = await request.json()
    const { truckId, enablePhoneGps, enableHardware, updateInterval, geofenceRadius, isActive } = body

    if (!truckId) {
      return NextResponse.json({ error: 'truckId is required' }, { status: 400 })
    }

    // Upsert the config
    const config = await db.trackingConfig.upsert({
      where: { truckId },
      create: {
        truckId,
        enablePhoneGps: enablePhoneGps ?? true,
        enableHardware: enableHardware ?? false,
        updateInterval: updateInterval ?? 5,
        geofenceRadius: geofenceRadius ?? 500,
        isActive: isActive ?? true,
      },
      update: {
        ...(enablePhoneGps !== undefined && { enablePhoneGps }),
        ...(enableHardware !== undefined && { enableHardware }),
        ...(updateInterval !== undefined && { updateInterval }),
        ...(geofenceRadius !== undefined && { geofenceRadius }),
        ...(isActive !== undefined && { isActive }),
      },
      include: {
        truck: {
          select: {
            id: true,
            plateNumber: true,
            make: true,
            model: true,
            status: true,
            driverId: true,
            driver: { select: { id: true, firstName: true, lastName: true } },
          },
        },
      },
    })

    return NextResponse.json(config)
  } catch (error: unknown) {
    console.error('Error updating tracking config:', error)
    return NextResponse.json({ error: 'Failed to update tracking config' }, { status: 500 })
  }
}
