import { NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { addDays, differenceInDays } from 'date-fns'

export async function GET() {
  try {
    const now = new Date()
    const thirtyDaysFromNow = addDays(now, 30)
    const threeDaysAgo = addDays(now, -3)
    const sevenDaysAgo = addDays(now, -7)
    const notifications: Array<{
      type: string
      message: string
      severity: 'warning' | 'error' | 'info'
      entityId: string
      entityName: string
    }> = []

    // 1. Drivers with expiring licenses (within 30 days)
    const driversExpiring = await db.driver.findMany({
      where: {
        licenseExpiry: {
          lte: thirtyDaysFromNow,
          gte: now,
        },
      },
      select: { id: true, driverName: true, licenseExpiry: true },
    })

    for (const driver of driversExpiring) {
      const daysLeft = differenceInDays(new Date(driver.licenseExpiry), now)
      const severity = daysLeft <= 7 ? 'error' : 'warning'
      notifications.push({
        type: 'license_expiry',
        message: `${driver.driverName}'s license expires in ${daysLeft} day${daysLeft === 1 ? '' : 's'}`,
        severity,
        entityId: driver.id,
        entityName: driver.driverName,
      })
    }

    // Also check for already expired licenses
    const driversExpired = await db.driver.findMany({
      where: {
        licenseExpiry: { lt: now },
      },
      select: { id: true, driverName: true, licenseExpiry: true },
    })

    for (const driver of driversExpired) {
      const daysAgo = Math.abs(differenceInDays(new Date(driver.licenseExpiry), now))
      notifications.push({
        type: 'license_expired',
        message: `${driver.driverName}'s license expired ${daysAgo} day${daysAgo === 1 ? '' : 's'} ago`,
        severity: 'error',
        entityId: driver.id,
        entityName: driver.driverName,
      })
    }

    // 2. Trucks with expired or expiring insurance (within 30 days)
    const trucksExpiring = await db.truck.findMany({
      where: {
        insuranceExpiry: {
          lte: thirtyDaysFromNow,
          gte: now,
        },
      },
      select: { id: true, plateNumber: true, insuranceExpiry: true },
    })

    for (const truck of trucksExpiring) {
      if (!truck.insuranceExpiry) continue
      const daysLeft = differenceInDays(new Date(truck.insuranceExpiry), now)
      const severity = daysLeft <= 7 ? 'error' : 'warning'
      notifications.push({
        type: 'insurance_expiry',
        message: `Truck ${truck.plateNumber} insurance expires in ${daysLeft} day${daysLeft === 1 ? '' : 's'}`,
        severity,
        entityId: truck.id,
        entityName: truck.plateNumber,
      })
    }

    const trucksExpired = await db.truck.findMany({
      where: {
        insuranceExpiry: { lt: now },
      },
      select: { id: true, plateNumber: true, insuranceExpiry: true },
    })

    for (const truck of trucksExpired) {
      if (!truck.insuranceExpiry) continue
      const daysAgo = Math.abs(differenceInDays(new Date(truck.insuranceExpiry), now))
      notifications.push({
        type: 'insurance_expired',
        message: `Truck ${truck.plateNumber} insurance expired ${daysAgo} day${daysAgo === 1 ? '' : 's'} ago`,
        severity: 'error',
        entityId: truck.id,
        entityName: truck.plateNumber,
      })
    }

    // 3. Trips pending more than 3 days
    const pendingTrips = await db.trip.findMany({
      where: {
        status: 'pending',
        createdAt: { lte: threeDaysAgo },
      },
      include: { driver: { select: { driverName: true } } },
      orderBy: { createdAt: 'asc' },
    })

    for (const trip of pendingTrips) {
      const daysPending = differenceInDays(now, new Date(trip.createdAt))
      notifications.push({
        type: 'trip_pending',
        message: `Trip ${trip.tripNumber} has been pending for ${daysPending} day${daysPending === 1 ? '' : 's'}`,
        severity: 'info',
        entityId: trip.id,
        entityName: trip.tripNumber,
      })
    }

    // 4. Cash advances pending more than 7 days
    const pendingAdvances = await db.cashAdvance.findMany({
      where: {
        status: 'pending',
        createdAt: { lte: sevenDaysAgo },
      },
      include: { driver: { select: { driverName: true } } },
      orderBy: { createdAt: 'asc' },
    })

    for (const advance of pendingAdvances) {
      const daysPending = differenceInDays(now, new Date(advance.createdAt))
      notifications.push({
        type: 'cash_advance_pending',
        message: `Cash advance for ${advance.driver.driverName} (\u20B5${advance.amount.toLocaleString()}) pending ${daysPending} day${daysPending === 1 ? '' : 's'}`,
        severity: 'warning',
        entityId: advance.id,
        entityName: advance.driver.driverName,
      })
    }

    // Sort by severity (error first, then warning, then info)
    const severityOrder = { error: 0, warning: 1, info: 2 }
    notifications.sort((a, b) => severityOrder[a.severity] - severityOrder[b.severity])

    return NextResponse.json(notifications)
  } catch (error) {
    console.error('Error checking notifications:', error)
    return NextResponse.json(
      { error: 'Failed to check notifications' },
      { status: 500 }
    )
  }
}
