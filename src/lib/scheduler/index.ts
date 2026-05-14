import { scheduler } from './scheduler'
import { checkInsuranceExpiry, checkMaintenanceDue, checkLicenseExpiry, generateDailySummary, checkDvlaExpiry, checkRoadworthyExpiry, webDevReview } from './jobs'
import { logger } from '@/lib/logger'

export function startScheduler() {
  if (scheduler.isRunning) {
    logger.info('Scheduler already running — skipping registration')
    return
  }

  // Insurance check every 6 hours
  scheduler.register('insurance-expiry-check', 6 * 60 * 60 * 1000, checkInsuranceExpiry)
  // Maintenance check every 6 hours
  scheduler.register('maintenance-due-check', 6 * 60 * 60 * 1000, checkMaintenanceDue)
  // License check every 24 hours
  scheduler.register('license-expiry-check', 24 * 60 * 60 * 1000, checkLicenseExpiry)
  // DVLA registration expiry check every 6 hours
  scheduler.register('dvla-expiry-check', 6 * 60 * 60 * 1000, checkDvlaExpiry)
  // Roadworthy certificate expiry check every 6 hours
  scheduler.register('roadworthy-expiry-check', 6 * 60 * 60 * 1000, checkRoadworthyExpiry)
  // Daily summary every 24 hours
  scheduler.register('daily-summary', 24 * 60 * 60 * 1000, generateDailySummary)
  // Web dev review every 15 minutes
  scheduler.register('web-dev-review', 15 * 60 * 1000, webDevReview)

  scheduler.start()
  logger.info('Scheduler initialized with 7 jobs')
}

export { scheduler }
