import { db } from '@/lib/db'
import { logger } from '@/lib/logger'

// ============ Helpers ============

/** In-memory dedup sets — reset every 24 hours to allow re-notifications */
const notifiedMaintenanceIds = new Set<string>()
const notifiedLicenseIds = new Set<string>()
const notifiedDvlaIds = new Set<string>()
const notifiedRoadworthyIds = new Set<string>()
let lastDedupReset = Date.now()

const DEDUP_RESET_MS = 24 * 60 * 60 * 1000 // 24 hours

function resetDedupSets() {
  const now = Date.now()
  if (now - lastDedupReset >= DEDUP_RESET_MS) {
    const prevMaintenance = notifiedMaintenanceIds.size
    const prevLicense = notifiedLicenseIds.size
    const prevDvla = notifiedDvlaIds.size
    const prevRoadworthy = notifiedRoadworthyIds.size
    notifiedMaintenanceIds.clear()
    notifiedLicenseIds.clear()
    notifiedDvlaIds.clear()
    notifiedRoadworthyIds.clear()
    lastDedupReset = now
    logger.info('Reset notification dedup sets', { maintenanceCleared: prevMaintenance, licenseCleared: prevLicense, dvlaCleared: prevDvla, roadworthyCleared: prevRoadworthy })
  }
}

/** Find all active Admin/Manager users for notifications */
async function getAdminManagerUsers() {
  return db.user.findMany({
    where: {
      role: { name: { in: ['Admin', 'Manager'] } },
      isActive: true,
    },
  })
}

/** Create in_app notifications for all admin/manager users */
async function notifyAdminManagers(data: {
  type: string
  title: string
  message: string
  link?: string
  metadata?: Record<string, unknown>
}) {
  resetDedupSets()
  const users = await getAdminManagerUsers()
  if (users.length === 0) {
    logger.info('No active Admin/Manager users to notify')
    return 0
  }

  let count = 0
  for (const user of users) {
    try {
      await db.notification.create({
        data: {
          userId: user.id,
          type: data.type,
          title: data.title,
          message: data.message,
          channel: 'in_app',
          link: data.link,
          metadata: data.metadata ? JSON.stringify(data.metadata) : undefined,
        },
      })
      count++
    } catch (error) {
      logger.error(`Failed to create notification for user ${user.id}:`, error)
    }
  }
  return count
}

// ============ Job 1: Insurance Expiry Check ============

export async function checkInsuranceExpiry() {
  logger.info('Running insurance expiry check job')
  try {
    const now = new Date()
    const thirtyDaysFromNow = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000)

    const expiringInsurances = await db.insurance.findMany({
      where: {
        endDate: {
          lte: thirtyDaysFromNow,
          gte: now,
        },
        renewalReminderSent: false,
      },
      include: {
        truck: {
          select: { plateNumber: true },
        },
      },
    })

    if (expiringInsurances.length === 0) {
      logger.info('No expiring insurance policies found')
      return
    }

    logger.info(`Found ${expiringInsurances.length} expiring insurance policies`)

    let notified = 0
    for (const insurance of expiringInsurances) {
      try {
        const count = await notifyAdminManagers({
          type: 'insurance_expiring',
          title: 'Insurance Expiring Soon',
          message: `Policy ${insurance.policyNumber} for truck ${insurance.truck.plateNumber} expires on ${insurance.endDate.toLocaleDateString()}`,
          link: '/insurance',
          metadata: { insuranceId: insurance.id, truckId: insurance.truckId, endDate: insurance.endDate.toISOString() },
        })
        notified += count

        // Mark reminder as sent
        await db.insurance.update({
          where: { id: insurance.id },
          data: { renewalReminderSent: true },
        })
      } catch (error) {
        logger.error(`Failed to process insurance expiry for ${insurance.policyNumber}:`, error)
      }
    }

    logger.info(`Insurance expiry check complete: ${notified} notifications sent`)
  } catch (error) {
    logger.error('Insurance expiry check job failed:', error)
  }
}

// ============ Job 2: Maintenance Due Check ============

export async function checkMaintenanceDue() {
  logger.info('Running maintenance due check job')
  resetDedupSets()
  try {
    const now = new Date()
    const fourteenDaysFromNow = new Date(now.getTime() + 14 * 24 * 60 * 60 * 1000)

    // Check completed maintenance records with upcoming nextDueDate
    const maintenanceRecords = await db.maintenanceRecord.findMany({
      where: {
        status: 'completed',
        nextDueDate: {
          lte: fourteenDaysFromNow,
          gte: now,
        },
      },
      include: {
        truck: {
          select: { plateNumber: true },
        },
      },
    })

    // Check trucks with upcoming nextServiceDate
    const trucksNeedingService = await db.truck.findMany({
      where: {
        nextServiceDate: {
          lte: fourteenDaysFromNow,
          gte: now,
        },
      },
      select: {
        id: true,
        plateNumber: true,
        nextServiceDate: true,
      },
    })

    const totalItems = maintenanceRecords.length + trucksNeedingService.length
    if (totalItems === 0) {
      logger.info('No upcoming maintenance found')
      return
    }

    logger.info(`Found ${maintenanceRecords.length} maintenance records + ${trucksNeedingService.length} truck service dates due`)

    let notified = 0

    // Notify for maintenance records
    for (const record of maintenanceRecords) {
      if (notifiedMaintenanceIds.has(record.id)) continue
      try {
        const count = await notifyAdminManagers({
          type: 'maintenance_due',
          title: 'Maintenance Due Soon',
          message: `${record.title} for truck ${record.truck.plateNumber} is due by ${record.nextDueDate!.toLocaleDateString()}`,
          link: '/maintenance',
          metadata: { maintenanceId: record.id, truckId: record.truckId, nextDueDate: record.nextDueDate!.toISOString() },
        })
        notified += count
        notifiedMaintenanceIds.add(record.id)
      } catch (error) {
        logger.error(`Failed to process maintenance due for ${record.id}:`, error)
      }
    }

    // Notify for truck service dates
    for (const truck of trucksNeedingService) {
      const dedupKey = `truck-service-${truck.id}`
      if (notifiedMaintenanceIds.has(dedupKey)) continue
      try {
        const count = await notifyAdminManagers({
          type: 'maintenance_due',
          title: 'Scheduled Service Due Soon',
          message: `${truck.plateNumber} has a scheduled service due by ${truck.nextServiceDate!.toLocaleDateString()}`,
          link: '/trucks',
          metadata: { truckId: truck.id, nextServiceDate: truck.nextServiceDate!.toISOString() },
        })
        notified += count
        notifiedMaintenanceIds.add(dedupKey)
      } catch (error) {
        logger.error(`Failed to process truck service due for ${truck.id}:`, error)
      }
    }

    logger.info(`Maintenance due check complete: ${notified} notifications sent`)
  } catch (error) {
    logger.error('Maintenance due check job failed:', error)
  }
}

// ============ Job 3: Driver License Expiry Check ============

export async function checkLicenseExpiry() {
  logger.info('Running driver license expiry check job')
  resetDedupSets()
  try {
    const now = new Date()
    const thirtyDaysFromNow = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000)

    const drivers = await db.driver.findMany({
      where: {
        licenseExpiry: {
          lte: thirtyDaysFromNow,
          gte: now,
        },
        status: 'active',
      },
    })

    if (drivers.length === 0) {
      logger.info('No expiring driver licenses found')
      return
    }

    logger.info(`Found ${drivers.length} drivers with expiring licenses`)

    let notified = 0
    for (const driver of drivers) {
      if (notifiedLicenseIds.has(driver.id)) continue
      try {
        const count = await notifyAdminManagers({
          type: 'driver_license_expiring',
          title: 'Driver License Expiring',
          message: `${driver.firstName} ${driver.lastName}'s license expires on ${driver.licenseExpiry.toLocaleDateString()}`,
          link: '/drivers',
          metadata: { driverId: driver.id, licenseExpiry: driver.licenseExpiry.toISOString() },
        })
        notified += count
        notifiedLicenseIds.add(driver.id)
      } catch (error) {
        logger.error(`Failed to process license expiry for driver ${driver.id}:`, error)
      }
    }

    logger.info(`License expiry check complete: ${notified} notifications sent`)
  } catch (error) {
    logger.error('License expiry check job failed:', error)
  }
}

// ============ Job 4: Daily Summary Report ============

export async function generateDailySummary() {
  logger.info('Running daily summary report job')
  try {
    // Check if daily report notifications are enabled
    const settings = await db.systemSettings.findFirst()
    if (!settings || !settings.notifyDailyReport) {
      logger.info('Daily report notifications are disabled in settings — skipping')
      return
    }

    const todayStart = new Date()
    todayStart.setHours(0, 0, 0, 0)
    const todayEnd = new Date()
    todayEnd.setHours(23, 59, 59, 999)

    // Run all queries in parallel
    const [
      activeTrips,
      completedTripsToday,
      revenueToday,
      expensesToday,
      activeTrucks,
      overdueMaintenance,
    ] = await Promise.all([
      // Total active trips (non-completed, non-cancelled)
      db.trip.count({
        where: {
          status: { notIn: ['completed', 'cancelled'] },
        },
      }),
      // Completed trips today
      db.trip.count({
        where: {
          status: 'completed',
          updatedAt: { gte: todayStart, lte: todayEnd },
        },
      }),
      // Total revenue today (from completed trips or trips with revenue)
      db.trip.aggregate({
        _sum: { totalRevenue: true },
        where: {
          status: 'completed',
          updatedAt: { gte: todayStart, lte: todayEnd },
        },
      }),
      // Total expenses today
      db.expense.aggregate({
        _sum: { amount: true },
        where: {
          date: { gte: todayStart, lte: todayEnd },
          status: { in: ['approved', 'pending'] },
        },
      }),
      // Active trucks count
      db.truck.count({
        where: { status: 'active' },
      }),
      // Overdue maintenance (nextDueDate in the past or within 7 days)
      db.maintenanceRecord.count({
        where: {
          status: 'completed',
          nextDueDate: { lte: new Date() },
        },
      }),
    ])

    const totalRevenue = revenueToday._sum.totalRevenue ?? 0
    const totalExpenses = expensesToday._sum.amount ?? 0

    const summary = [
      `📊 Daily Fleet Summary — ${todayStart.toLocaleDateString()}`,
      ``,
      `🚛 Active Trucks: ${activeTrucks}`,
      `🛣️ Active Trips: ${activeTrips}`,
      `✅ Completed Today: ${completedTripsToday}`,
      `💰 Revenue Today: ₵${totalRevenue.toLocaleString()}`,
      `💸 Expenses Today: ₵${totalExpenses.toLocaleString()}`,
      `🔧 Overdue Maintenance: ${overdueMaintenance}`,
    ].join('\n')

    const notified = await notifyAdminManagers({
      type: 'daily_report',
      title: 'Daily Fleet Summary',
      message: summary,
      metadata: {
        activeTrips,
        completedTripsToday,
        totalRevenue,
        totalExpenses,
        activeTrucks,
        overdueMaintenance,
        date: todayStart.toISOString(),
      },
    })

    logger.info(`Daily summary report complete: ${notified} notifications sent`, {
      activeTrips,
      completedTripsToday,
      totalRevenue,
      totalExpenses,
      activeTrucks,
      overdueMaintenance,
    })
  } catch (error) {
    logger.error('Daily summary report job failed:', error)
  }
}

// ============ Job 5: DVLA Registration Expiry Check ============

export async function checkDvlaExpiry() {
  logger.info('Running DVLA registration expiry check job')
  resetDedupSets()
  try {
    const now = new Date()
    const thirtyDaysFromNow = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000)

    const expiringRegistrations = await db.dvlaRegistration.findMany({
      where: {
        expiryDate: {
          lte: thirtyDaysFromNow,
          gte: now,
        },
        status: 'active',
        reminderSent: false,
      },
      include: {
        truck: {
          select: { plateNumber: true },
        },
      },
    })

    if (expiringRegistrations.length === 0) {
      logger.info('No expiring DVLA registrations found')
      return
    }

    logger.info(`Found ${expiringRegistrations.length} expiring DVLA registrations`)

    let notified = 0
    for (const registration of expiringRegistrations) {
      if (notifiedDvlaIds.has(registration.id)) continue
      try {
        const daysUntilExpiry = Math.ceil((registration.expiryDate.getTime() - now.getTime()) / (1000 * 60 * 60 * 24))
        const urgency = daysUntilExpiry <= 7 ? 'URGENT: ' : ''
        const count = await notifyAdminManagers({
          type: 'dvla_expiring',
          title: `${urgency}DVLA Registration Expiring`,
          message: `Registration ${registration.registrationNumber} for truck ${registration.truck.plateNumber} expires in ${daysUntilExpiry} days (${registration.expiryDate.toLocaleDateString()})`,
          link: '/dvla',
          metadata: {
            dvlaId: registration.id,
            truckId: registration.truckId,
            registrationNumber: registration.registrationNumber,
            expiryDate: registration.expiryDate.toISOString(),
            daysUntilExpiry,
          },
        })
        notified += count
        notifiedDvlaIds.add(registration.id)

        // Mark reminder as sent
        await db.dvlaRegistration.update({
          where: { id: registration.id },
          data: { reminderSent: true },
        })
      } catch (error) {
        logger.error(`Failed to process DVLA expiry for ${registration.registrationNumber}:`, error)
      }
    }

    logger.info(`DVLA registration expiry check complete: ${notified} notifications sent`)
  } catch (error) {
    logger.error('DVLA registration expiry check job failed:', error)
  }
}

// ============ Job 6: Roadworthy Certificate Expiry Check ============

export async function checkRoadworthyExpiry() {
  logger.info('Running roadworthy certificate expiry check job')
  resetDedupSets()
  try {
    const now = new Date()
    const thirtyDaysFromNow = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000)

    const expiringCertificates = await db.roadworthyInspection.findMany({
      where: {
        certificateExpiry: {
          lte: thirtyDaysFromNow,
          gte: now,
        },
        certificateIssued: true,
        result: { in: ['passed', 'conditional_pass'] },
      },
      include: {
        truck: {
          select: { plateNumber: true },
        },
      },
    })

    if (expiringCertificates.length === 0) {
      logger.info('No expiring roadworthy certificates found')
      return
    }

    logger.info(`Found ${expiringCertificates.length} expiring roadworthy certificates`)

    let notified = 0
    for (const inspection of expiringCertificates) {
      if (notifiedRoadworthyIds.has(inspection.id)) continue
      try {
        const daysUntilExpiry = Math.ceil((inspection.certificateExpiry!.getTime() - now.getTime()) / (1000 * 60 * 60 * 24))
        const urgency = daysUntilExpiry <= 7 ? 'URGENT: ' : ''
        const fitnessLabel = inspection.vehicleFitness === 'fit' ? 'fit' : 'conditionally fit'
        const count = await notifyAdminManagers({
          type: 'roadworthy_expiring',
          title: `${urgency}Roadworthy Certificate Expiring`,
          message: `Roadworthy certificate ${inspection.certificateNumber} for truck ${inspection.truck.plateNumber} (${fitnessLabel}) expires in ${daysUntilExpiry} days (${inspection.certificateExpiry!.toLocaleDateString()})`,
          link: '/roadworthy',
          metadata: {
            inspectionId: inspection.id,
            truckId: inspection.truckId,
            certificateNumber: inspection.certificateNumber,
            certificateExpiry: inspection.certificateExpiry!.toISOString(),
            daysUntilExpiry,
            vehicleFitness: inspection.vehicleFitness,
          },
        })
        notified += count
        notifiedRoadworthyIds.add(inspection.id)
      } catch (error) {
        logger.error(`Failed to process roadworthy expiry for ${inspection.certificateNumber}:`, error)
      }
    }

    logger.info(`Roadworthy certificate expiry check complete: ${notified} notifications sent`)
  } catch (error) {
    logger.error('Roadworthy certificate expiry check job failed:', error)
  }
}

// ============ Job 7: Web Dev Review (Auto-review every 15 min) ============

export async function webDevReview() {
  logger.info('Running web dev review job')
  try {
    const now = new Date()
    const fifteenMinutesAgo = new Date(now.getTime() - 15 * 60 * 1000)

    // 1. Check recent trip activity
    const recentTrips = await db.trip.count({
      where: { createdAt: { gte: fifteenMinutesAgo } },
    })

    // 2. Check active in-transit trips (should be monitored)
    const inTransitTrips = await db.trip.count({
      where: { status: { in: ['in_transit', 'loading', 'offloading'] } },
    })

    // 3. Check for trucks with expired insurance
    const expiredInsuranceCount = await db.insurance.count({
      where: { status: 'expired' },
    })

    // 4. Check for inactive trucks assigned to active trips
    const inactiveTruckTrips = await db.trip.count({
      where: {
        status: { notIn: ['completed', 'cancelled'] },
        truck: { status: { not: 'active' } },
      },
    })

    // 5. Check for overdue maintenance (nextDueDate in the past)
    const overdueMaintenance = await db.maintenanceRecord.count({
      where: {
        status: 'completed',
        nextDueDate: { lt: now },
      },
    })

    // Build review summary
    const reviewData = {
      timestamp: now.toISOString(),
      recentTrips,
      inTransitTrips,
      expiredInsuranceCount,
      inactiveTruckTrips,
      overdueMaintenance,
    }

    logger.info('Web dev review complete', reviewData)

    // Notify if there are critical issues
    const issues: string[] = []
    if (inactiveTruckTrips > 0) {
      issues.push(`${inactiveTruckTrips} active trip(s) assigned to inactive trucks`)
    }
    if (expiredInsuranceCount > 0) {
      issues.push(`${expiredInsuranceCount} expired insurance policy(ies)`)
    }
    if (overdueMaintenance > 0) {
      issues.push(`${overdueMaintenance} overdue maintenance(s)`)
    }

    if (issues.length > 0) {
      const message = `Web Review Alert:\n${issues.map(i => `⚠️ ${i}`).join('\n')}`
      await notifyAdminManagers({
        type: 'alert',
        title: 'System Review Alert',
        message,
        metadata: reviewData,
      })
      logger.info(`Review alerts sent: ${issues.length} issue(s) found`)
    }
  } catch (error) {
    logger.error('Web dev review job failed:', error)
  }
}
