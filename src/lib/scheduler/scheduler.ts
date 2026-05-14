import { logger } from '@/lib/logger'

interface ScheduledJob {
  name: string
  intervalMs: number
  lastRun: number
  enabled: boolean
  execute: () => Promise<void>
}

class TaskScheduler {
  private jobs: Map<string, ScheduledJob> = new Map()
  private timer: ReturnType<typeof setInterval> | null = null
  private _isRunning = false

  register(name: string, intervalMs: number, execute: () => Promise<void>) {
    this.jobs.set(name, { name, intervalMs, lastRun: 0, enabled: true, execute })
    logger.info(`Registered scheduled job: ${name} (every ${intervalMs / 1000}s)`)
  }

  start() {
    if (this._isRunning) return
    this._isRunning = true
    // Check every 60 seconds
    this.timer = setInterval(() => this.tick(), 60_000)
    logger.info('Task scheduler started', { jobCount: this.jobs.size })
    // Skip running jobs on start in dev to avoid DB connection error cascade
    // Jobs will run on their first scheduled interval
    if (process.env.NODE_ENV === 'production') {
      this.tick()
    }
  }

  stop() {
    if (this.timer) clearInterval(this.timer)
    this._isRunning = false
    this.timer = null
    logger.info('Task scheduler stopped')
  }

  get isRunning() {
    return this._isRunning
  }

  private async tick() {
    const now = Date.now()
    for (const [, job] of this.jobs) {
      if (!job.enabled) continue
      if (now - job.lastRun < job.intervalMs) continue
      job.lastRun = now
      try {
        await job.execute()
      } catch (error) {
        logger.error(`Scheduled job "${job.name}" failed:`, error)
      }
    }
  }

  getJobStatus() {
    return Array.from(this.jobs.entries()).map(([name, job]) => ({
      name,
      enabled: job.enabled,
      intervalMs: job.intervalMs,
      lastRun: new Date(job.lastRun).toISOString(),
      nextRun: job.lastRun > 0 ? new Date(job.lastRun + job.intervalMs).toISOString() : 'Pending',
    }))
  }

  async triggerJob(jobName: string): Promise<boolean> {
    const job = this.jobs.get(jobName)
    if (!job) return false
    try {
      await job.execute()
      return true
    } catch (error) {
      logger.error(`Manual trigger of job "${jobName}" failed:`, error)
      return false
    }
  }

  restart() {
    this.stop()
    // Reset lastRun so all jobs run immediately on restart
    for (const [, job] of this.jobs) {
      job.lastRun = 0
    }
    this.start()
  }
}

export const scheduler = new TaskScheduler()
