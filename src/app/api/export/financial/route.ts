import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const from = searchParams.get('from') || ''
    const to = searchParams.get('to') || ''

    const where: Record<string, unknown> = {}

    if (from || to) {
      const dateFilter: Record<string, unknown> = {}
      if (from) dateFilter.gte = new Date(from)
      if (to) {
        const toDate = new Date(to)
        toDate.setHours(23, 59, 59, 999)
        dateFilter.lte = toDate
      }
      where.departureDate = dateFilter
    }

    const trips = await db.trip.findMany({
      where: Object.keys(where).length > 0 ? where : undefined,
      include: {
        driver: { select: { driverName: true } },
        truck: { select: { plateNumber: true } },
      },
      orderBy: { createdAt: 'desc' },
    })

    const exportData = trips.map((trip) => ({
      tripNumber: trip.tripNumber,
      driverName: trip.driver.driverName,
      truckPlate: trip.truck.plateNumber,
      status: trip.status,
      origin: trip.originAddress || trip.fromWarehouseId,
      destination: trip.destinationAddress || trip.toWarehouseId,
      departureDate: trip.departureDate ? trip.departureDate.toISOString().split('T')[0] : '',
      arrivalDate: trip.arrivalDate ? trip.arrivalDate.toISOString().split('T')[0] : '',
      distance: trip.distance,
      baseRate: trip.baseRate,
      waitingCharges: trip.waitingCharges,
      otherCharges: trip.otherCharges,
      totalAmount: trip.totalAmount,
      cargoDescription: trip.cargoDescription,
      cargoWeight: trip.cargoWeight,
    }))

    return NextResponse.json(exportData)
  } catch (error) {
    console.error('Error fetching financial summary:', error)
    return NextResponse.json(
      { error: 'Failed to fetch financial summary' },
      { status: 500 }
    )
  }
}
