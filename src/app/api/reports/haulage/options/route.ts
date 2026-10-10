import { NextRequest, NextResponse } from 'next/server'

import { requireAuth } from '@/lib/auth-server'
import { db } from '@/lib/db'

export async function GET(request: NextRequest) {
  try {
    const auth = requireAuth(request)
    if (auth instanceof NextResponse) return auth

    const [shippers, transporters, trucks, drivers, trips] = await Promise.all([
      db.shipperProfile.findMany({
        where: { isActive: true },
        select: { id: true, name: true },
        orderBy: { name: 'asc' },
      }),
      db.transporter.findMany({
        where: { isActive: true },
        select: { id: true, name: true },
        orderBy: { name: 'asc' },
      }),
      db.truck.findMany({
        select: { id: true, plateNumber: true },
        orderBy: { plateNumber: 'asc' },
      }),
      db.driver.findMany({
        where: { status: 'active' },
        select: { id: true, firstName: true, lastName: true },
        orderBy: [{ firstName: 'asc' }, { lastName: 'asc' }],
      }),
      db.trip.findMany({
        select: { loadingLocation: true, destination: true },
        orderBy: { departureTime: 'desc' },
        take: 1500,
      }),
    ])

    const routes = [...new Set(trips.map((trip) => `${trip.loadingLocation} → ${trip.destination}`))].sort()
    return NextResponse.json({
      shippers,
      transporters,
      vehicles: trucks.map((truck) => ({ id: truck.id, name: truck.plateNumber })),
      drivers: drivers.map((driver) => ({
        id: driver.id,
        name: `${driver.firstName} ${driver.lastName}`.trim(),
      })),
      routes,
    })
  } catch (error) {
    console.error('[Haulage Reports] Failed to load filter options:', error)
    return NextResponse.json({ error: 'Failed to load report filters.' }, { status: 500 })
  }
}
