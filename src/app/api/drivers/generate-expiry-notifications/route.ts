import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { requireRole, ROLES } from '@/lib/auth-server'

/**
 * POST /api/drivers/generate-expiry-notifications
 *
 * Automated endpoint (called by cron or manually) that:
 * 1. Checks all active drivers for expiring documents (license & Ghana Card)
 * 2. Creates in-app notifications for admin/manager users
 * 3. Deduplicates: skips if same alert was sent within 24 hours
 *
 * Expected body (optional): { daysAhead?: number }
 * Can also be called with GET for simplicity.
 */
export async function POST(request: NextRequest) {
  try {
    const auth = requireRole(request, [ROLES.ADMIN, ROLES.MANAGER])
    if (auth instanceof NextResponse) return auth
    const body = await request.json().catch(() => ({}))
    const daysAhead = body.daysAhead ?? 30
    const now = new Date()
    const cutoff = new Date(now.getTime() + daysAhead * 86400000)
    const dedupWindow = new Date(now.getTime() - 24 * 86400000) // 24h ago

    // Get admin and manager users
    const adminUsers = await db.user.findMany({
      where: {
        isActive: true,
        role: { name: { in: ['Admin', 'Manager'] } },
      },
      select: { id: true, name: true },
    })

    if (adminUsers.length === 0) {
      return NextResponse.json({ message: 'No admin users found', created: 0 })
    }

    // Get all active drivers with their document expiry dates
    const drivers = await db.driver.findMany({
      where: { status: { not: 'inactive' } },
      select: {
        id: true,
        firstName: true,
        lastName: true,
        employeeId: true,
        licenseExpiry: true,
        ghanaCardExpiry: true,
        ghanaCardNumber: true,
      },
    })

    let createdCount = 0
    const alertDetails: Array<{
      driverId: string
      driverName: string
      documentType: string
      expiryDate: string
      severity: string
      daysRemaining: number
    }> = []

    for (const driver of drivers) {
      // Check license expiry
      if (driver.licenseExpiry) {
        const daysRemaining = Math.ceil(
          (driver.licenseExpiry.getTime() - now.getTime()) / 86400000
        )

        if (daysRemaining <= daysAhead) {
          const severity =
            daysRemaining <= 0
              ? 'expired'
              : daysRemaining <= 7
                ? 'critical'
                : daysRemaining <= 14
                  ? 'warning'
                  : 'upcoming'

          alertDetails.push({
            driverId: driver.id,
            driverName: `${driver.firstName} ${driver.lastName}`,
            documentType: 'license',
            expiryDate: driver.licenseExpiry.toISOString(),
            severity,
            daysRemaining,
          })

          // Check for existing notification in dedup window
          const existingNotif = await db.notification.findFirst({
            where: {
              type: 'document_expiry',
              createdAt: { gte: dedupWindow },
              metadata: {
                contains: driver.id,
              },
            },
          })

          if (!existingNotif) {
            for (const user of adminUsers) {
              await db.notification.create({
                data: {
                  userId: user.id,
                  type: 'document_expiry',
                  title:
                    daysRemaining <= 0
                      ? `EXPIRED: ${driver.firstName}'s License`
                      : `${severity.toUpperCase()}: ${driver.firstName}'s License expires in ${daysRemaining}d`,
                  message: `Driver ${driver.firstName} ${driver.lastName} (${driver.employeeId}) has a ${severity} license expiry alert. Expires: ${driver.licenseExpiry.toLocaleDateString('en-GB')}.`,
                  channel: 'in_app',
                  link: '/drivers',
                  metadata: JSON.stringify({
                    driverName: `${driver.firstName} ${driver.lastName}`,
                    employeeId: driver.employeeId,
                    documentType: 'license',
                    severity,
                    daysRemaining,
                    expiresOn: driver.licenseExpiry.toLocaleDateString('en-GB'),
                  }),
                },
              })
              createdCount++
            }
          }
        }
      }

      // Check Ghana Card expiry
      if (driver.ghanaCardExpiry && driver.ghanaCardNumber) {
        const daysRemaining = Math.ceil(
          (driver.ghanaCardExpiry.getTime() - now.getTime()) / 86400000
        )

        if (daysRemaining <= daysAhead) {
          const severity =
            daysRemaining <= 0
              ? 'expired'
              : daysRemaining <= 7
                ? 'critical'
                : daysRemaining <= 14
                  ? 'warning'
                  : 'upcoming'

          alertDetails.push({
            driverId: driver.id,
            driverName: `${driver.firstName} ${driver.lastName}`,
            documentType: 'ghana_card',
            expiryDate: driver.ghanaCardExpiry.toISOString(),
            severity,
            daysRemaining,
          })

          const existingNotif = await db.notification.findFirst({
            where: {
              type: 'document_expiry_ghana_card',
              createdAt: { gte: dedupWindow },
              metadata: {
                contains: driver.id,
              },
            },
          })

          if (!existingNotif) {
            for (const user of adminUsers) {
              await db.notification.create({
                data: {
                  userId: user.id,
                  type: 'document_expiry_ghana_card',
                  title:
                    daysRemaining <= 0
                      ? `EXPIRED: ${driver.firstName}'s Ghana Card`
                      : `${severity.toUpperCase()}: ${driver.firstName}'s Ghana Card expires in ${daysRemaining}d`,
                  message: `Driver ${driver.firstName} ${driver.lastName} (${driver.employeeId}) has a ${severity} Ghana Card expiry alert. Card: ${driver.ghanaCardNumber}. Expires: ${driver.ghanaCardExpiry.toLocaleDateString('en-GB')}.`,
                  channel: 'in_app',
                  link: '/drivers',
                  metadata: JSON.stringify({
                    driverName: `${driver.firstName} ${driver.lastName}`,
                    employeeId: driver.employeeId,
                    documentType: 'ghana_card',
                    severity,
                    daysRemaining,
                    expiresOn: driver.ghanaCardExpiry.toLocaleDateString('en-GB'),
                  }),
                },
              })
              createdCount++
            }
          }
        }
      }
    }

    // Sort by severity
    const severityOrder = { expired: 0, critical: 1, warning: 2, upcoming: 3 }
    alertDetails.sort(
      (a, b) =>
        (severityOrder[a.severity] ?? 4) - (severityOrder[b.severity] ?? 4)
    )

    return NextResponse.json({
      success: true,
      scannedDrivers: drivers.length,
      alertsFound: alertDetails.length,
      notificationsCreated: createdCount,
      alerts: alertDetails,
    })
  } catch (error) {
    console.error('Generate expiry notifications error:', error)
    return NextResponse.json(
      { error: 'Failed to generate expiry notifications' },
      { status: 500 }
    )
  }
}

// Also support GET for easy testing
export async function GET(request: NextRequest) {
  const auth = requireRole(request, [ROLES.ADMIN, ROLES.MANAGER])
  if (auth instanceof NextResponse) return auth
  return POST(request)
}
