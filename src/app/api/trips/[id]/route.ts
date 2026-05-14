import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { requireAuth, requireWriteAccess, ROLES } from '@/lib/auth-server'
import { createAuditLog, getClientIp } from '@/lib/audit'

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const auth = requireAuth(request)
    if (auth instanceof NextResponse) return auth

    const { id } = await params
    const isDriver = auth.roleName === ROLES.DRIVER

    const trip = await db.trip.findUnique({
      where: { id },
      include: {
        truck: { select: { id: true, plateNumber: true, make: true, model: true, tankCapacity: true } },
        driver: { select: { id: true, firstName: true, lastName: true, phone: true } },
        fuelLogs: { orderBy: { date: 'asc' } },
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
    })

    if (!trip) {
      return NextResponse.json({ error: 'Trip not found' }, { status: 404 })
    }

    // Drivers can only view their own trips
    if (isDriver && trip.driverId !== auth.driverId) {
      return NextResponse.json({ error: 'Access denied' }, { status: 403 })
    }

    // Strip sensitive fields for drivers
    if (isDriver) {
      const safe = { ...trip }
      delete (safe as Record<string, unknown>).totalRevenue
      delete (safe as Record<string, unknown>).unitPrice
      delete (safe as Record<string, unknown>).fuelCost
      delete (safe as Record<string, unknown>).fuelUsed
      delete (safe as Record<string, unknown>).customerPhone
      delete (safe as Record<string, unknown>).customerRef
      delete (safe as Record<string, unknown>).customerName
      // Remove fuel logs (contain cost data)
      ;(safe as Record<string, unknown>).fuelLogs = []
      // Remove driver phone from included driver
      if (safe.driver) {
        (safe as Record<string, unknown>).driver = {
          id: safe.driver.id,
          firstName: safe.driver.firstName,
          lastName: safe.driver.lastName,
        }
      }
      return NextResponse.json(safe)
    }

    return NextResponse.json(trip)
  } catch (error) {
    console.error('Trip detail error:', error)
    return NextResponse.json({ error: 'Failed to fetch trip' }, { status: 500 })
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

    const trip = await db.trip.findUnique({ where: { id } })
    if (!trip) {
      return NextResponse.json({ error: 'Trip not found' }, { status: 404 })
    }

    const {
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
      arrivalTime,
      status,
      customerName,
      customerPhone,
      customerRef,
      clientId,
      notes,
      startMileage,
      startMileageImage,
      endMileage,
      totalMileage,
      fuelLevelBefore,
      fuelLevelAfter,
      fuelUsed,
      fuelCost,
      loadingCityId,
      loadingPointId,
      destinationCityId,
      destinationZoneId,
      deliveryType,
      tripItems: bodyTripItems,
      deliveryDestinations: bodyDeliveryDestinations,
    } = body

    // Collect changed fields for audit log
    const changes: Record<string, unknown> = {}
    if (waybillNumber !== undefined && waybillNumber !== trip.waybillNumber) changes.waybillNumber = waybillNumber
    if (loadingLocation !== undefined && loadingLocation !== trip.loadingLocation) changes.loadingLocation = loadingLocation
    if (destination !== undefined && destination !== trip.destination) changes.destination = destination
    if (itemName !== undefined && itemName !== trip.itemName) changes.itemName = itemName
    if (quantity !== undefined && parseFloat(quantity) !== trip.quantity) changes.quantity = parseFloat(quantity)
    if (status !== undefined && status !== trip.status) changes.status = status
    if (totalRevenue !== undefined) changes.totalRevenue = totalRevenue ? parseFloat(totalRevenue) : null
    if (customerName !== undefined && customerName !== trip.customerName) changes.customerName = customerName
    if (notes !== undefined && notes !== trip.notes) changes.notes = notes

    // Calculate total mileage if start and end are provided
    const calcTotalMileage =
      totalMileage !== undefined
        ? parseFloat(totalMileage)
        : endMileage && startMileage
          ? parseFloat(endMileage) - parseFloat(startMileage)
          : undefined

    // Calculate actual duration if arrival time is provided
    let calcActualDuration: number | undefined
    if (arrivalTime && departureTime) {
      const dep = new Date(departureTime)
      const arr = new Date(arrivalTime)
      calcActualDuration = (arr.getTime() - dep.getTime()) / (1000 * 60 * 60)
    }

    // Update truck mileage if endMileage is provided
    if (endMileage !== undefined && trip.truckId) {
      await db.truck.update({
        where: { id: trip.truckId },
        data: { currentMileage: parseFloat(endMileage) },
      })
    }

    const updatedTrip = await db.trip.update({
      where: { id },
      data: {
        ...(waybillNumber !== undefined && { waybillNumber }),
        ...(loadingLocation !== undefined && { loadingLocation }),
        ...(loadingAddress !== undefined && { loadingAddress }),
        ...(destination !== undefined && { destination }),
        ...(destinationAddress !== undefined && { destinationAddress }),
        ...(itemName !== undefined && { itemName }),
        ...(quantity !== undefined && { quantity: parseFloat(quantity) }),
        ...(unit !== undefined && { unit }),
        ...(unitPrice !== undefined && { unitPrice: unitPrice ? parseFloat(unitPrice) : null }),
        ...(totalRevenue !== undefined && { totalRevenue: totalRevenue ? parseFloat(totalRevenue) : null }),
        ...(departureTime !== undefined && { departureTime: new Date(departureTime) }),
        ...(arrivalTime !== undefined && { arrivalTime: arrivalTime ? new Date(arrivalTime) : null }),
        ...(status !== undefined && { status }),
        ...(customerName !== undefined && { customerName }),
        ...(customerPhone !== undefined && { customerPhone }),
        ...(customerRef !== undefined && { customerRef }),
        ...(notes !== undefined && { notes }),
        ...(startMileage !== undefined && { startMileage: startMileage ? parseFloat(startMileage) : null }),
        ...(endMileage !== undefined && { endMileage: endMileage ? parseFloat(endMileage) : null }),
        ...(calcTotalMileage !== undefined && { totalMileage: calcTotalMileage }),
        ...(fuelLevelBefore !== undefined && { fuelLevelBefore: fuelLevelBefore ? parseFloat(fuelLevelBefore) : null }),
        ...(fuelLevelAfter !== undefined && { fuelLevelAfter: fuelLevelAfter ? parseFloat(fuelLevelAfter) : null }),
        ...(fuelUsed !== undefined && { fuelUsed: fuelUsed ? parseFloat(fuelUsed) : null }),
        ...(fuelCost !== undefined && { fuelCost: fuelCost ? parseFloat(fuelCost) : null }),
        ...(calcActualDuration !== undefined && { actualDuration: calcActualDuration }),
        ...(clientId !== undefined && { clientId }),
        ...(startMileageImage !== undefined && { startMileageImage }),
        ...(loadingCityId !== undefined && { loadingCityId }),
        ...(loadingPointId !== undefined && { loadingPointId }),
        ...(destinationCityId !== undefined && { destinationCityId }),
        ...(destinationZoneId !== undefined && { destinationZoneId }),
        ...(deliveryType !== undefined && { deliveryType }),
      },
      include: {
        truck: { select: { id: true, plateNumber: true, make: true, model: true } },
        driver: { select: { id: true, firstName: true, lastName: true } },
        fuelLogs: { orderBy: { date: 'asc' } },
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
    })

    // Update trip items if provided (delete old, create new)
    if (bodyTripItems && Array.isArray(bodyTripItems)) {
      await db.tripItem.deleteMany({ where: { tripId: id } })
      if (bodyTripItems.length > 0) {
        await db.tripItem.createMany({
          data: bodyTripItems.map((ti: Record<string, unknown>, index: number) => ({
            tripId: id,
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
    }

    // Update delivery destinations if provided (delete old, create new)
    if (bodyDeliveryDestinations !== undefined) {
      // Clear existing delivery destination references on tripItems
      await db.tripItem.updateMany({
        where: { tripId: id, deliveryDestinationId: { not: null } },
        data: { deliveryDestinationId: null },
      })
      // Delete all existing delivery destinations
      await db.tripDeliveryDestination.deleteMany({ where: { tripId: id } })

      if (bodyDeliveryDestinations && Array.isArray(bodyDeliveryDestinations) && bodyDeliveryDestinations.length > 0) {
        // Pre-fetch zone rates for all destinations that have a destinationZoneId
        const zoneIds = [...new Set(
          bodyDeliveryDestinations
            .filter((dd: Record<string, unknown>) => dd.destinationZoneId)
            .map((dd: Record<string, unknown>) => dd.destinationZoneId as string)
        )]
        const zoneRatesMap: Record<string, number | null> = {}
        if (zoneIds.length > 0) {
          const zoneRates = await db.zoneRate.findMany({
            where: { destinationZoneId: { in: zoneIds }, isActive: true },
            orderBy: { effectiveDate: 'desc' },
          })
          const seen: Set<string> = new Set()
          for (const zr of zoneRates) {
            if (!seen.has(zr.destinationZoneId)) {
              zoneRatesMap[zr.destinationZoneId] = zr.rateAmount
              seen.add(zr.destinationZoneId)
            }
          }
          for (const zid of zoneIds) {
            if (!(zid in zoneRatesMap)) zoneRatesMap[zid] = null
          }
        }

        // Build map from temp client-side IDs to DB UUIDs
        const ddIdMap: Record<string, string> = {}
        for (const dd of bodyDeliveryDestinations) {
          const generatedId = crypto.randomUUID()
          const ddData = dd as Record<string, unknown>
          ddIdMap[(ddData._tempId as string) || ddData.id] = generatedId
        }

        await db.tripDeliveryDestination.createMany({
          data: bodyDeliveryDestinations.map((dd: Record<string, unknown>, index: number) => {
            const zoneId = dd.destinationZoneId as string | undefined
            return {
              id: ddIdMap[(dd._tempId as string) || dd.id] || crypto.randomUUID(),
              tripId: id,
              stopOrder: dd.stopOrder !== undefined ? parseInt(String(dd.stopOrder)) : index,
              clientId: (dd.clientId as string) || null,
              customerName: (dd.customerName as string) || '',
              customerPhone: (dd.customerPhone as string) || null,
              destinationZoneId: zoneId || null,
              zoneRate: zoneId ? (zoneRatesMap[zoneId] ?? dd.zoneRate ? parseFloat(String(dd.zoneRate)) : null) : (dd.zoneRate ? parseFloat(String(dd.zoneRate)) : null),
              address: (dd.address as string) || null,
              notes: (dd.notes as string) || null,
              status: (dd.status as string) || 'pending',
              actualQty: dd.actualQty ? parseFloat(String(dd.actualQty)) : null,
            }
          }),
        })

        // Update tripItems that have a deliveryDestinationId reference
        const itemsWithDest = bodyTripItems?.filter((ti: Record<string, unknown>) => ti.deliveryDestinationId) || []
        if (itemsWithDest.length > 0 && bodyTripItems) {
          const createdItems = await db.tripItem.findMany({
            where: { tripId: id },
            select: { id: true, sortOrder: true },
            orderBy: { sortOrder: 'asc' },
          })
          for (let i = 0; i < bodyTripItems.length; i++) {
            const ti = bodyTripItems[i] as Record<string, unknown>
            if (ti.deliveryDestinationId && createdItems[i]) {
              const mappedDestId = ddIdMap[(ti.deliveryDestinationId as string) || ''] || (ti.deliveryDestinationId as string)
              // Only update if the destId refers to a newly created one (in ddIdMap)
              const isDestInMap = Object.values(ddIdMap).includes(mappedDestId)
              if (isDestInMap) {
                await db.tripItem.update({
                  where: { id: createdItems[i].id },
                  data: { deliveryDestinationId: mappedDestId },
                })
              }
            }
          }
        }
      }
    }

    // Track tripItems changes for audit
    if (bodyTripItems) changes.tripItems = `${bodyTripItems.length} item(s)`
    if (bodyDeliveryDestinations !== undefined) changes.deliveryDestinations = `${Array.isArray(bodyDeliveryDestinations) ? bodyDeliveryDestinations.length : 0} destination(s)`

    // Audit log: trip updated (fire-and-forget)
    if (Object.keys(changes).length > 0) {
      createAuditLog({
        userId: auth.userId,
        action: 'update',
        entity: 'Trip',
        entityId: id,
        details: changes,
        ipAddress: getClientIp(request),
      }).catch(() => {})
    }

    return NextResponse.json(updatedTrip)
  } catch (error) {
    console.error('Trip update error:', error)
    return NextResponse.json({ error: 'Failed to update trip' }, { status: 500 })
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

    const trip = await db.trip.findUnique({ where: { id } })
    if (!trip) {
      return NextResponse.json({ error: 'Trip not found' }, { status: 404 })
    }

    if (trip.status === 'completed') {
      return NextResponse.json(
        { error: 'Cannot cancel a completed trip' },
        { status: 400 }
      )
    }

    const updatedTrip = await db.trip.update({
      where: { id },
      data: { status: 'cancelled' },
    })

    // Audit log: trip cancelled (fire-and-forget)
    createAuditLog({
      userId: auth.userId,
      action: 'delete',
      entity: 'Trip',
      entityId: id,
      details: { tripNumber: trip.tripNumber, previousStatus: trip.status, newStatus: 'cancelled' },
      ipAddress: getClientIp(request),
    }).catch(() => {})

    return NextResponse.json(updatedTrip)
  } catch (error) {
    console.error('Trip delete error:', error)
    return NextResponse.json({ error: 'Failed to cancel trip' }, { status: 500 })
  }
}
