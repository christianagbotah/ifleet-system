import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { dispatchNotification } from '@/lib/services/notification-dispatcher'
import { requireAuth, requireWriteAccess, ROLES } from '@/lib/auth-server'
import { createAuditLog, getClientIp } from '@/lib/audit'
import { APP_NAME } from '@/lib/constants'

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
      driverId = auth.driverId || undefined
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
          tripItems: {
            include: {
              supplier: { select: { id: true, name: true } },
              loadingPoint: { select: { id: true, name: true } },
              item: { select: { id: true, name: true, unit: true } },
            },
            orderBy: { sortOrder: 'asc' },
          },
          deliveryDestinations: {
            include: {
              client: { select: { id: true, companyName: true, phone: true } },
              destinationZone: { select: { id: true, name: true, destinationCity: { select: { id: true, name: true } } } },
              tripItems: {
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

    const body = await request.json()

    let {
      truckId,
      driverId,
      waybillNumber,
      loadingLocation,
      loadingAddress,
      destination,
      destinationAddress,
      itemName,
      quantity,
      unit,
      unitPrice,
      totalRevenue,
      departureTime,
      customerName,
      customerPhone,
      customerRef,
      notes,
      startMileage,
      fuelLevelBefore,
      destinationZoneId,
      loadingPointId,
      loadingCityId,
      destinationCityId,
      deliveryType,
      startMileageImage,
    } = body

    if (!truckId || !driverId || !departureTime) {
      return NextResponse.json(
        { error: 'truckId, driverId, and departureTime are required' },
        { status: 400 }
      )
    }

    // Generate trip number
    const year = new Date().getFullYear()
    const tripCount = await db.trip.count({
      where: {
        tripNumber: { startsWith: `TRP-${year}` },
      },
    })
    const tripNumber = `TRP-${year}-${String(tripCount + 1).padStart(3, '0')}`

    // Verify truck and driver exist
    const [truck, driver] = await Promise.all([
      db.truck.findUnique({ where: { id: truckId } }),
      db.driver.findUnique({
        where: { id: driverId },
        select: { id: true, firstName: true, lastName: true, phone: true, userId: true },
      }),
    ])

    if (!truck) {
      return NextResponse.json({ error: 'Truck not found' }, { status: 404 })
    }
    if (!driver) {
      return NextResponse.json({ error: 'Driver not found' }, { status: 404 })
    }

    // Auto-lookup zone rate for totalRevenue
    let autoRate: number | null = null
    if (destinationZoneId) {
      const zoneRate = await db.zoneRate.findFirst({
        where: { destinationZoneId, isActive: true },
        orderBy: { effectiveDate: 'desc' },
      })
      if (zoneRate) autoRate = zoneRate.rateAmount
    }

    // Auto-populate loadingLocation from loading point
    if (loadingPointId) {
      const lp = await db.loadingPoint.findUnique({ where: { id: loadingPointId }, select: { name: true } })
      if (lp) loadingLocation = lp.name
    }

    // Auto-populate destination from destination zone
    if (destinationZoneId) {
      const dz = await db.destinationZone.findUnique({
        where: { id: destinationZoneId },
        select: { name: true, destinationCity: { select: { name: true } } },
      })
      if (dz) destination = `${dz.name}, ${dz.destinationCity.name}`
    }

    // Validate that we have loadingLocation and destination after lookups
    if (!loadingLocation || !destination) {
      return NextResponse.json(
        { error: 'loadingLocation (or loadingPointId) and destination (or destinationZoneId) are required' },
        { status: 400 }
      )
    }

    const trip = await db.trip.create({
      data: {
        tripNumber,
        truckId,
        driverId,
        waybillNumber,
        loadingLocation,
        loadingAddress,
        destination,
        destinationAddress,
        itemName,
        quantity: parseFloat(quantity) || 0,
        unit: unit || 'bags',
        unitPrice: unitPrice ? parseFloat(unitPrice) : null,
        totalRevenue: totalRevenue ? parseFloat(totalRevenue) : (autoRate || null),
        departureTime: new Date(departureTime),
        ...(destinationZoneId && { destinationZoneId }),
        ...(loadingCityId && { loadingCityId }),
        ...(loadingPointId && { loadingPointId }),
        ...(destinationCityId && { destinationCityId }),
        ...(deliveryType && { deliveryType }),
        ...(startMileageImage && { startMileageImage }),
        customerName,
        customerPhone,
        customerRef,
        notes,
        startMileage: startMileage ? parseFloat(startMileage) : null,
        fuelLevelBefore: fuelLevelBefore ? parseFloat(fuelLevelBefore) : null,
      },
      include: {
        truck: { select: { id: true, plateNumber: true, make: true, model: true } },
        driver: { select: { id: true, firstName: true, lastName: true, phone: true } },
        loadingCity: { select: { id: true, name: true } },
        loadingPoint: { select: { id: true, name: true } },
        destinationCity: { select: { id: true, name: true } },
        destinationZone: { select: { id: true, name: true } },
      },
    })

    // Create trip items if provided
    if (body.tripItems && Array.isArray(body.tripItems) && body.tripItems.length > 0) {
      await db.tripItem.createMany({
        data: body.tripItems.map((ti: Record<string, unknown>, index: number) => ({
          tripId: trip.id,
          supplierId: (ti.supplierId as string) || null,
          loadingPointId: (ti.loadingPointId as string) || null,
          itemId: (ti.itemId as string) || null,
          itemName: (ti.itemName as string) || 'Unknown',
          unit: (ti.unit as string) || 'bags',
          quantity: parseFloat(String(ti.quantity || 0)),
          rate: ti.rate ? parseFloat(String(ti.rate)) : null,
          total: ti.total ? parseFloat(String(ti.total)) : null,
          sortOrder: index,
        })),
      })
    }

    // Create delivery destinations if provided (multi-customer delivery)
    if (body.deliveryDestinations && Array.isArray(body.deliveryDestinations) && body.deliveryDestinations.length > 0) {
      // Pre-fetch zone rates for all destinations that have a destinationZoneId
      const zoneIds = [...new Set(
        body.deliveryDestinations
          .filter((dd: Record<string, unknown>) => dd.destinationZoneId)
          .map((dd: Record<string, unknown>) => dd.destinationZoneId as string)
      )]
      const zoneRatesMap: Record<string, number | null> = {}
      if (zoneIds.length > 0) {
        const zoneRates = await db.zoneRate.findMany({
          where: { destinationZoneId: { in: zoneIds }, isActive: true },
          orderBy: { effectiveDate: 'desc' },
        })
        // For each zone, take the most recent active rate
        const seen: Set<string> = new Set()
        for (const zr of zoneRates) {
          if (!seen.has(zr.destinationZoneId)) {
            zoneRatesMap[zr.destinationZoneId] = zr.rateAmount
            seen.add(zr.destinationZoneId)
          }
        }
        // Ensure all requested zone IDs have an entry (null if no rate found)
        for (const zid of zoneIds) {
          if (!(zid in zoneRatesMap)) zoneRatesMap[zid] = null
        }
      }

      // Build map from temp client-side IDs to DB UUIDs for tripItems linking
      const ddIdMap: Record<string, string> = {}
      for (const dd of body.deliveryDestinations) {
        const generatedId = crypto.randomUUID()
        const ddData = dd as Record<string, unknown>
        ddIdMap[(ddData._tempId as string) || ddData.id] = generatedId
      }

      await db.tripDeliveryDestination.createMany({
        data: body.deliveryDestinations.map((dd: Record<string, unknown>, index: number) => {
          const zoneId = dd.destinationZoneId as string | undefined
          return {
            id: ddIdMap[(dd._tempId as string) || dd.id] || crypto.randomUUID(),
            tripId: trip.id,
            stopOrder: dd.stopOrder !== undefined ? parseInt(String(dd.stopOrder)) : (dd.sortOrder !== undefined ? parseInt(String(dd.sortOrder)) : index),
            clientId: (dd.clientId as string) || null,
            customerName: (dd.customerName as string) || '',
            customerPhone: (dd.customerPhone as string) || null,
            destinationZoneId: zoneId || null,
            zoneRate: zoneId ? (zoneRatesMap[zoneId] ?? (dd.zoneRate ? parseFloat(String(dd.zoneRate)) : null)) : (dd.zoneRate ? parseFloat(String(dd.zoneRate)) : null),
            address: (dd.address as string) || null,
            notes: (dd.notes as string) || null,
            status: (dd.status as string) || 'pending',
            actualQty: dd.actualQty ? parseFloat(String(dd.actualQty)) : null,
          }
        }),
      })

      // Update tripItems that have a deliveryDestinationId reference
      const itemsWithDest = body.tripItems?.filter((ti: Record<string, unknown>) => ti.deliveryDestinationId) || []
      if (itemsWithDest.length > 0) {
        // We need to update individual tripItems since createMany doesn't return IDs
        // Find the tripItems we just created by tripId
        const createdItems = await db.tripItem.findMany({
          where: { tripId: trip.id },
          select: { id: true, itemName: true, sortOrder: true },
          orderBy: { sortOrder: 'asc' },
        })
        for (let i = 0; i < body.tripItems.length; i++) {
          const ti = body.tripItems[i] as Record<string, unknown>
          if (ti.deliveryDestinationId && createdItems[i]) {
            const mappedDestId = ddIdMap[(ti.deliveryDestinationId as string) || '']
            if (mappedDestId) {
              await db.tripItem.update({
                where: { id: createdItems[i].id },
                data: { deliveryDestinationId: mappedDestId },
              })
            }
          }
        }
      }
    }

    // Audit log: trip created (fire-and-forget)
    createAuditLog({
      userId: auth.userId,
      action: 'create',
      entity: 'Trip',
      entityId: trip.id,
      details: { tripNumber: trip.tripNumber, loadingLocation, destination },
      ipAddress: getClientIp(request),
    }).catch(() => {})

    // ── Fire-and-forget: notify admins and driver about new trip ──
    const newTripId = trip.id
    const driverPhone = driver.phone
    const tripNum = trip.tripNumber
    const departureStr = new Date(departureTime).toLocaleString('en-GB', { timeZone: 'Africa/Accra' })
    const adminInAppMsg = `New Trip Scheduled: ${tripNum} — ${itemName} from ${loadingLocation} to ${destination}. Departure: ${departureStr}. Assigned to ${driver.firstName} ${driver.lastName}.`
    const smsMsg = `${APP_NAME}: New trip ${tripNum}, ${itemName}. ${loadingLocation} to ${destination}. Departure: ${departureStr}. Truck: ${truck.plateNumber}.`

    ;(async () => {
      try {
        // Collect all admin/manager user IDs
        const adminUsers = await db.user.findMany({
          where: { role: { name: { in: ['Admin', 'Manager'] } } },
          select: { id: true },
        })
        const adminIds = new Set(adminUsers.map((u) => u.id))

        // Deduplicate: skip driver if their user is already in admin set
        const driverAlreadyNotified = driver.userId ? adminIds.has(driver.userId) : false

        // Dispatch to all admin/manager users (in_app + push)
        await Promise.allSettled(
          adminUsers.map((u) =>
            dispatchNotification({
              userId: u.id,
              type: 'trip_started',
              title: `New Trip: ${tripNum}`,
              message: adminInAppMsg,
              channels: ['in_app', 'push'],
              link: `trips/${newTripId}`,
              tripId: newTripId,
              metadata: {
                tripNumber: tripNum,
                driverName: `${driver.firstName} ${driver.lastName}`,
                truckPlate: truck.plateNumber,
                origin: loadingLocation,
                destination,
                cargo: itemName,
                totalRevenue: totalRevenue ? parseFloat(totalRevenue) : null,
                customerName,
              },
            })
          )
        )

        // Dispatch to driver only if NOT already notified as admin
        // Do NOT include financial metadata (totalRevenue, customerName) in driver notifications
        if (!driverAlreadyNotified && driverPhone) {
          await dispatchNotification({
            userId: driver.userId || driverId,
            driverId,
            type: 'trip_started',
            title: `New Trip Assigned: ${tripNum}`,
            message: `New trip assigned: ${tripNum} — ${loadingLocation} → ${destination} on ${departureStr}. Truck: ${truck.plateNumber}.`,
            channels: ['in_app', 'sms', 'push'],
            smsMessage: smsMsg,
            link: `trips/${newTripId}`,
            tripId: newTripId,
            metadata: {
              tripNumber: tripNum,
              driverName: `${driver.firstName} ${driver.lastName}`,
              truckPlate: truck.plateNumber,
              origin: loadingLocation,
              destination,
              cargo: itemName,
            },
          })
        }
      } catch (err) {
        console.error('[Notification] Failed to dispatch trip creation notifications:', err)
      }
    })().catch(() => { /* fire-and-forget */ })

    return NextResponse.json(trip, { status: 201 })
  } catch (error) {
    console.error('Trip create error:', error)
    return NextResponse.json({ error: 'Failed to create trip' }, { status: 500 })
  }
}
