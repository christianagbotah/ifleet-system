import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { requireAuth } from '@/lib/auth-server'

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const auth = requireAuth(request)
    if (auth instanceof NextResponse) return auth

    const { id } = await params

    const trip = await db.trip.findUnique({
      where: { id },
      include: {
        truck: {
          select: {
            id: true,
            plateNumber: true,
            make: true,
            model: true,
            year: true,
            color: true,
          },
        },
        driver: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
            phone: true,
            licenseNumber: true,
            licenseClass: true,
          },
        },
        deliveryStops: {
          orderBy: { stopOrder: 'asc' },
        },
      },
    })

    if (!trip) {
      return NextResponse.json({ error: 'Trip not found' }, { status: 404 })
    }

    const waybillData = {
      trip: {
        tripNumber: trip.tripNumber,
        waybillNumber: trip.waybillNumber,
        status: trip.status,
        itemName: trip.itemName,
        quantity: trip.quantity,
        unit: trip.unit,
        totalRevenue: trip.totalRevenue,
        departureTime: trip.departureTime,
        estimatedArrival: trip.arrivalTime,
        createdAt: trip.createdAt,
        loadingLocation: trip.loadingLocation,
        loadingAddress: trip.loadingAddress,
        destination: trip.destination,
        destinationAddress: trip.destinationAddress,
        customerName: trip.customerName,
        customerPhone: trip.customerPhone,
        notes: trip.notes,
      },
      driver: {
        firstName: trip.driver.firstName,
        lastName: trip.driver.lastName,
        phone: trip.driver.phone,
        licenseNumber: trip.driver.licenseNumber,
        licenseClass: trip.driver.licenseClass,
      },
      truck: {
        plateNumber: trip.truck.plateNumber,
        make: trip.truck.make,
        model: trip.truck.model,
        year: trip.truck.year,
        color: trip.truck.color,
      },
      deliveryStops: trip.deliveryStops.map((stop) => ({
        destination: stop.destination,
        expectedQty: stop.expectedQty,
        actualQty: stop.actualQty,
        unit: stop.unit,
        status: stop.status,
        customerName: stop.customerName,
      })),
    }

    return NextResponse.json(waybillData)
  } catch (error) {
    console.error('Waybill fetch error:', error)
    return NextResponse.json({ error: 'Failed to fetch waybill data' }, { status: 500 })
  }
}
