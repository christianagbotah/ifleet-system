import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { requireAuth } from '@/lib/auth-server'

type Severity = 'expired' | 'critical' | 'warning' | 'upcoming'

function getSeverityInfo(expiryDate: Date, daysAhead: number): {
  severity: Severity | 'valid'
  daysRemaining: number
} {
  const now = new Date()
  const diffMs = expiryDate.getTime() - now.getTime()
  const daysRemaining = Math.ceil(diffMs / (1000 * 60 * 60 * 24))

  if (daysRemaining < 0) {
    return { severity: 'expired', daysRemaining }
  } else if (daysRemaining <= 7) {
    return { severity: 'critical', daysRemaining }
  } else if (daysRemaining <= 14) {
    return { severity: 'warning', daysRemaining }
  } else if (daysRemaining <= daysAhead) {
    return { severity: 'upcoming', daysRemaining }
  }

  return { severity: 'valid', daysRemaining }
}

export async function GET(request: NextRequest) {
  try {
    const auth = requireAuth(request)
    if (auth instanceof NextResponse) return auth

    const { searchParams } = new URL(request.url)
    const daysAhead = parseInt(searchParams.get('daysAhead') || '30', 10)

    if (isNaN(daysAhead) || daysAhead <= 0) {
      return NextResponse.json(
        { error: 'daysAhead must be a positive number' },
        { status: 400 }
      )
    }

    // Get all non-inactive drivers with their expiry dates
    const drivers = await db.driver.findMany({
      where: {
        status: { not: 'inactive' },
      },
      select: {
        id: true,
        firstName: true,
        lastName: true,
        employeeId: true,
        phone: true,
        licenseExpiry: true,
        ghanaCardExpiry: true,
      },
    })

    const alerts: {
      driverId: string
      driverName: string
      employeeId: string
      phone: string
      documentType: 'license' | 'ghana_card'
      expiryDate: Date
      severity: Severity
      daysRemaining: number
    }[] = []

    for (const driver of drivers) {
      // Check license expiry
      if (driver.licenseExpiry) {
        const { severity, daysRemaining } = getSeverityInfo(
          driver.licenseExpiry,
          daysAhead
        )

        if (severity !== 'valid') {
          alerts.push({
            driverId: driver.id,
            driverName: `${driver.firstName} ${driver.lastName}`,
            employeeId: driver.employeeId,
            phone: driver.phone,
            documentType: 'license',
            expiryDate: driver.licenseExpiry,
            severity,
            daysRemaining,
          })
        }
      }

      // Check Ghana Card expiry
      if (driver.ghanaCardExpiry) {
        const { severity, daysRemaining } = getSeverityInfo(
          driver.ghanaCardExpiry,
          daysAhead
        )

        if (severity !== 'valid') {
          alerts.push({
            driverId: driver.id,
            driverName: `${driver.firstName} ${driver.lastName}`,
            employeeId: driver.employeeId,
            phone: driver.phone,
            documentType: 'ghana_card',
            expiryDate: driver.ghanaCardExpiry,
            severity,
            daysRemaining,
          })
        }
      }
    }

    // Sort by severity priority then by days remaining
    const severityOrder: Record<Severity, number> = {
      expired: 0,
      critical: 1,
      warning: 2,
      upcoming: 3,
    }

    alerts.sort((a, b) => {
      const orderDiff = severityOrder[a.severity] - severityOrder[b.severity]
      if (orderDiff !== 0) return orderDiff
      return a.daysRemaining - b.daysRemaining
    })

    const summary = {
      total: alerts.length,
      expired: alerts.filter((a) => a.severity === 'expired').length,
      critical: alerts.filter((a) => a.severity === 'critical').length,
      warning: alerts.filter((a) => a.severity === 'warning').length,
      upcoming: alerts.filter((a) => a.severity === 'upcoming').length,
    }

    return NextResponse.json({ alerts, summary })
  } catch (error) {
    console.error('Expiry alerts error:', error)
    return NextResponse.json(
      { error: 'Failed to fetch expiry alerts' },
      { status: 500 }
    )
  }
}
