import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { dispatchNotification } from '@/lib/services/notification-dispatcher'
import { generateInvoiceForTrip } from '@/lib/services/invoice-generator'
import { requireAuth, requireWriteAccess, ROLES } from '@/lib/auth-server'
import { createAuditLog, getClientIp } from '@/lib/audit'
import { APP_NAME } from '@/lib/constants'
import { validateBody, tripCreateSchema } from '@/lib/validations'
import { createTrip, TripDomainError } from '@/lib/services/trip-service'
import { OdometerDomainError } from '@/lib/services/odometer-service'

// Fields that drivers should NOT see in trip responses
const DRIVER_EXCLUDE_FIELDS = {
  totalRevenue: true,
  unitPrice: true,
  fuelCost: true,
  fuelUsed: true,
  customerPhone: true,
  customerRef: true,
  customerName: true,
} as const

type DriverSafeTrip = Omit<
  Awaited<ReturnType<typeof db.trip.findMany>>[0],
  keyof typeof DRIVER_EXCLUDE_FIELDS
>

export async function GET(request: NextRequest) {
  try {
    const auth = requireAuth(request)
    if (auth instanceof NextResponse) return auth

    const { searchParams } = new URL(request.url)
    const status = searchParams.get('status')
    const truckId = searchParams.get('truckId')
    let driverId = searchParams.get('driverId')
    const dateFrom = searchParams.get('dateFrom')
    const dateTo = searchParams.get('dateTo')
    const search = searchParams.get('search')
    const page = parseInt(searchParams.get('page') || '1')
    const limit = parseInt(searchParams.get('limit') || '20')

    // Drivers can only see their own trips
    const isDriver = auth.roleName === ROLES.DRIVER
    if (isDriver) {
      driverId = auth.driverId
    }

    const where: Record<string, unknown> = {}

    if (status) where.status = status
    if (truckId) where.truckId = truckId
    if (driverId) where.driverId = driverId
    if (search) {
      where.OR = [
        { tripNumber: { contains: search } },
        { waybillNumber: { contains: search } },
        { customerName: { contains: search } },
        { itemName: { contains: search } },
      ]
    }

    if (dateFrom || dateTo) {
      where.departureTime = {}
      if (dateFrom) (where.departureTime as Record<string, unknown>).gte = new Date(dateFrom)
      if (dateTo) (where.departureTime as Record<string, unknown>).lte = new Date(dateTo)
    }

    const [trips, total] = await Promise.all([
      db.trip.findMany({
        where,
        include: {
          truck: { select: { id: true, plateNumber: true, make: true, model: true } },
          driver: { select: { id: true, firstName: true, lastName: true } },
          client: { select: { id: true, companyName: true, contactPerson: true, phone: true } },
          TripItem: {
            include: {
              supplier: { select: { id: true, name: true } },
              loadingPoint: { select: { id: true, name: true } },
              item: { select: { id: true, name: true, unit: true } },
            },
            orderBy: { sortOrder: 'asc' },
          },
          TripDeliveryDestination: {
            include: {
              client: { select: { id: true, companyName: true, phone: true } },
              destinationZone: { select: { id: true, name: true, destinationCity: { select: { id: true, name: true } } } },
              TripItem: {
                include: {
                  item: { select: { id: true, name: true, unit: true } },
                },
              },
            },
            orderBy: { stopOrder: 'asc' },
          },
        },
        orderBy: { departureTime: 'desc' },
        skip: (page - 1) * limit,
        take: limit,
      }),
      db.trip.count({ where }),
    ])

    // Strip sensitive fields for drivers
    const safeTrips = isDriver
      ? trips.map((trip) => {
          const safe = { ...trip }
          delete (safe as Record<string, unknown>).totalRevenue
          delete (safe as Record<string, unknown>).unitPrice
          delete (safe as Record<string, unknown>).fuelCost
          delete (safe as Record<string, unknown>).fuelUsed
          delete (safe as Record<string, unknown>).customerPhone
          delete (safe as Record<string, unknown>).customerRef
          delete (safe as Record<string, unknown>).customerName
          delete (safe as Record<string, unknown>).clientId
          ;(safe as Record<string, unknown>).client = undefined
          return safe
        })
      : trips

    return NextResponse.json({ data: safeTrips, total, page, limit }, {
      headers: {
        'Cache-Control': 'no-store, no-cache, must-revalidate, proxy-revalidate',
        'Pragma': 'no-cache',
        'Expires': '0',
        'Surrogate-Control': 'no-store',
      },
    })
  } catch (error) {
    console.error('Trips list error:', error)
    return NextResponse.json({ error: 'Failed to fetch trips' }, { status: 500 })
  }
}

export async function POST(request: NextRequest) {
  try {
    const auth = requireAuth(request)
    if (auth instanceof NextResponse) return auth
    const writeGuard = requireWriteAccess(auth)
    if (writeGuard instanceof NextResponse) return writeGuard

    const validation = validateBody(tripCreateSchema, await request.json())
    if (!validation.success) return validation.response

    const result = await createTrip(validation.data, auth)
    const { trip, truck, driver, loadingLocation, destination } = result
    const input = validation.data

    // Post-commit audit: a failure here must never roll back the committed trip.
    createAuditLog({
      userId: auth.userId,
      action: 'create',
      entity: 'Trip',
      entityId: trip.id,
      details: { tripNumber: trip.tripNumber, loadingLocation, destination },
      ipAddress: getClientIp(request),
    }).catch(() => {})

    // Post-commit invoice generation. This is intentionally outside the trip DB transaction.
    let generatedInvoice: Record<string, unknown> | null = null
    try {
      const invoice = await generateInvoiceForTrip(trip.id, auth.userId)
      if (invoice) {
        const full = await db.invoice.findUnique({
          where: { id: invoice.id },
          include: {
            client: { select: { id: true, companyName: true, contactPerson: true, phone: true, email: true } },
            InvoiceItem: { orderBy: { order: 'asc' } },
          },
        })
        if (full) {
          generatedInvoice = {
            ...(full as Record<string, unknown>),
            items: (full as Record<string, unknown>).InvoiceItem,
          }
        }
      }
    } catch (error) {
      console.warn('[Trip] Auto-invoice generation failed (non-blocking):', error)
    }

    const itemName = input.itemName || 'Goods'
    const departureStr = input.departureTime.toLocaleString('en-GB', { timeZone: 'Africa/Accra' })
    const adminInAppMsg = `New Trip Scheduled: ${trip.tripNumber} — ${itemName} from ${loadingLocation} to ${destination}. Departure: ${departureStr}. Assigned to ${driver.firstName} ${driver.lastName}.`
    const smsMsg = `${APP_NAME}: New trip ${trip.tripNumber}, ${itemName}. ${loadingLocation} to ${destination}. Departure: ${departureStr}. Truck: ${truck.plateNumber}.`
    const rawRevenue = input.totalRevenue === undefined ? null : Number(input.totalRevenue)
    const notificationRevenue = rawRevenue !== null && Number.isFinite(rawRevenue) ? rawRevenue : null

    // Post-commit notifications. Driver payload intentionally excludes customer/financial fields.
    ;(async () => {
      try {
        const adminUsers = await db.user.findMany({
          where: { role: { name: { in: ['Admin', 'Manager'] } } },
          select: { id: true },
        })
        const adminIds = new Set(adminUsers.map((user) => user.id))
        const driverAlreadyNotified = driver.userId ? adminIds.has(driver.userId) : false

        await Promise.allSettled(
          adminUsers.map((user) =>
            dispatchNotification({
              userId: user.id,
              type: 'trip_started',
              title: `New Trip: ${trip.tripNumber}`,
              message: adminInAppMsg,
              channels: ['in_app', 'push'],
              link: `trips/${trip.id}`,
              tripId: trip.id,
              metadata: {
                tripNumber: trip.tripNumber,
                driverName: `${driver.firstName} ${driver.lastName}`,
                truckPlate: truck.plateNumber,
                origin: loadingLocation,
                destination,
                cargo: itemName,
                totalRevenue: notificationRevenue,
                customerName: input.customerName,
              },
            }),
          ),
        )

        if (!driverAlreadyNotified && driver.phone) {
          await dispatchNotification({
            userId: driver.userId || driver.id,
            driverId: driver.id,
            type: 'trip_started',
            title: `New Trip Assigned: ${trip.tripNumber}`,
            message: `New trip assigned: ${trip.tripNumber} — ${loadingLocation} → ${destination} on ${departureStr}. Truck: ${truck.plateNumber}.`,
            channels: ['in_app', 'sms', 'push'],
            smsMessage: smsMsg,
            link: `trips/${trip.id}`,
            tripId: trip.id,
            metadata: {
              tripNumber: trip.tripNumber,
              driverName: `${driver.firstName} ${driver.lastName}`,
              truckPlate: truck.plateNumber,
              origin: loadingLocation,
              destination,
              cargo: itemName,
            },
          })
        }
      } catch (error) {
        console.error('[Notification] Failed to dispatch trip creation notifications:', error)
      }
    })().catch(() => {})

    // Return current committed state including nested records created transactionally.
    const fullTrip = await db.trip.findUnique({
      where: { id: trip.id },
      include: {
        truck: { select: { id: true, plateNumber: true, make: true, model: true } },
        driver: { select: { id: true, firstName: true, lastName: true, phone: true } },
        loadingCity: { select: { id: true, name: true } },
        loadingPoint: { select: { id: true, name: true } },
        destinationCity: { select: { id: true, name: true } },
        destinationZone: { select: { id: true, name: true } },
        TripItem: { orderBy: { sortOrder: 'asc' } },
        TripDeliveryDestination: { orderBy: { stopOrder: 'asc' } },
      },
    })

    return NextResponse.json({ ...(fullTrip || trip), invoice: generatedInvoice }, { status: 201 })
  } catch (error) {
    if (error instanceof TripDomainError) {
      const status = error.code === 'TRUCK_NOT_FOUND' || error.code === 'DRIVER_NOT_FOUND' ? 404 : 400
      return NextResponse.json({ error: error.message, code: error.code }, { status })
    }
    if (error instanceof OdometerDomainError) {
      const status = error.code === 'TRIP_NOT_FOUND' ? 404 : error.code === 'TRIP_TRUCK_MISMATCH' ? 409 : 400
      return NextResponse.json({ error: error.message, code: error.code }, { status })
    }

    console.error('Trip create error:', error)
    return NextResponse.json({ error: 'Failed to create trip' }, { status: 500 })
  }
}
