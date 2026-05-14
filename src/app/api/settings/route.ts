import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { requireRole, ROLES } from '@/lib/auth-server'
import { createAuditLog, getClientIp } from '@/lib/audit'
import { APP_COMPANY } from '@/lib/constants'

// GET /api/settings — Return current system settings (create defaults if none exist)
export async function GET() {
  try {
    let settings = await db.systemSettings.findFirst()

    if (!settings) {
      // Create default settings row on first access
      settings = await db.systemSettings.create({ data: {} })
    }

    return NextResponse.json({
      id: settings.id,
      company: {
        name: settings.companyName,
        email: settings.companyEmail,
        phone: settings.companyPhone,
        address: settings.companyAddress,
        city: settings.companyCity,
        country: settings.companyCountry,
        website: settings.companyWebsite,
        registrationNumber: settings.registrationNumber,
      },
      notifications: {
        tripStarted: settings.notifyTripStarted,
        tripCompleted: settings.notifyTripCompleted,
        maintenanceDue: settings.notifyMaintenanceDue,
        insuranceExpiring: settings.notifyInsuranceExpiring,
        speedingAlert: settings.notifySpeedingAlert,
        geofenceAlert: settings.notifyGeofenceAlert,
        driverOffline: settings.notifyDriverOffline,
        dailyReport: settings.notifyDailyReport,
      },
      tracking: {
        defaultUpdateInterval: settings.defaultUpdateInterval,
        speedThreshold: settings.speedThreshold,
        enableGeofence: settings.enableGeofence,
        idleTimeout: settings.idleTimeout,
      },
      display: {
        currency: settings.currency,
        distanceUnit: settings.distanceUnit,
        fuelUnit: settings.fuelUnit,
        dateFormat: settings.dateFormat,
        timezone: settings.timezone,
        language: settings.language,
      },
      driverId: {
        prefix: settings.driverIdPrefix ?? 'FP-DRV-',
        counter: settings.driverIdCounter ?? 1,
        padding: settings.driverIdPadding ?? 3,
      },
    })
  } catch (error) {
    console.error('Settings GET error:', error)
    return NextResponse.json(
      { error: 'Failed to load settings. Please try again.' },
      { status: 500 }
    )
  }
}

// PUT /api/settings — Update system settings (restricted to Admin/Manager)
export async function PUT(request: NextRequest) {
  try {
    const auth = requireRole(request, [ROLES.ADMIN, ROLES.MANAGER])
    if (auth instanceof NextResponse) return auth

    const body = await request.json()
    const { company, notifications, tracking, display, driverId: driverIdCfg } = body

    // Find or create settings row
    let settings = await db.systemSettings.findFirst()
    if (!settings) {
      settings = await db.systemSettings.create({ data: {} })
    }

    // Update with explicitly typed fields — no dynamic object building
    settings = await db.systemSettings.update({
      where: { id: settings.id },
      data: {
        // Company
        companyName: company?.name,
        companyEmail: company?.email,
        companyPhone: company?.phone,
        companyAddress: company?.address,
        companyCity: company?.city,
        companyCountry: company?.country,
        companyWebsite: company?.website,
        registrationNumber: company?.registrationNumber,
        // Notifications
        notifyTripStarted: notifications?.tripStarted,
        notifyTripCompleted: notifications?.tripCompleted,
        notifyMaintenanceDue: notifications?.maintenanceDue,
        notifyInsuranceExpiring: notifications?.insuranceExpiring,
        notifySpeedingAlert: notifications?.speedingAlert,
        notifyGeofenceAlert: notifications?.geofenceAlert,
        notifyDriverOffline: notifications?.driverOffline,
        notifyDailyReport: notifications?.dailyReport,
        // Tracking
        defaultUpdateInterval: tracking?.defaultUpdateInterval,
        speedThreshold: tracking?.speedThreshold,
        enableGeofence: tracking?.enableGeofence,
        idleTimeout: tracking?.idleTimeout,
        // Display
        currency: display?.currency,
        distanceUnit: display?.distanceUnit,
        fuelUnit: display?.fuelUnit,
        dateFormat: display?.dateFormat,
        timezone: display?.timezone,
        language: display?.language,
        // Driver ID auto-generation
        driverIdPrefix: driverIdCfg?.prefix,
        driverIdCounter: driverIdCfg?.counter,
        driverIdPadding: driverIdCfg?.padding,
      },
    })

    // Audit log: settings changed (fire-and-forget)
    createAuditLog({
      userId: auth.userId,
      action: 'settings_change',
      entity: 'SystemSettings',
      entityId: settings.id,
      details: { company: !!company, notifications: !!notifications, tracking: !!tracking, display: !!display },
      ipAddress: getClientIp(request),
    }).catch(() => {})

    return NextResponse.json({
      id: settings.id,
      company: {
        name: settings.companyName,
        email: settings.companyEmail,
        phone: settings.companyPhone,
        address: settings.companyAddress,
        city: settings.companyCity,
        country: settings.companyCountry,
        website: settings.companyWebsite,
        registrationNumber: settings.registrationNumber,
      },
      notifications: {
        tripStarted: settings.notifyTripStarted,
        tripCompleted: settings.notifyTripCompleted,
        maintenanceDue: settings.notifyMaintenanceDue,
        insuranceExpiring: settings.notifyInsuranceExpiring,
        speedingAlert: settings.notifySpeedingAlert,
        geofenceAlert: settings.notifyGeofenceAlert,
        driverOffline: settings.notifyDriverOffline,
        dailyReport: settings.notifyDailyReport,
      },
      tracking: {
        defaultUpdateInterval: settings.defaultUpdateInterval,
        speedThreshold: settings.speedThreshold,
        enableGeofence: settings.enableGeofence,
        idleTimeout: settings.idleTimeout,
      },
      display: {
        currency: settings.currency,
        distanceUnit: settings.distanceUnit,
        fuelUnit: settings.fuelUnit,
        dateFormat: settings.dateFormat,
        timezone: settings.timezone,
        language: settings.language,
      },
      driverId: {
        prefix: settings.driverIdPrefix ?? 'FP-DRV-',
        counter: settings.driverIdCounter ?? 1,
        padding: settings.driverIdPadding ?? 3,
      },
    })
  } catch (error) {
    console.error('Settings PUT error:', error)
    const message = error instanceof Error
      ? `Failed to save settings: ${error.message}`
      : 'Failed to save settings due to a server error. Please try again.'
    return NextResponse.json(
      { error: message },
      { status: 500 }
    )
  }
}
