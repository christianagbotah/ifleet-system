import { NextResponse } from 'next/server'
import { startScheduler, scheduler } from '@/lib/scheduler'
import { logger } from '@/lib/logger'

// GET: Warmup endpoint — starts the scheduler if not already running
// Called from the dashboard on mount to ensure the scheduler is active
export async function GET() {
  try {
    if (scheduler.isRunning) {
      return NextResponse.json({
        status: 'already_running',
        isRunning: true,
        jobs: scheduler.getJobStatus(),
      })
    }

    startScheduler()

    return NextResponse.json({
      status: 'started',
      isRunning: true,
      jobs: scheduler.getJobStatus(),
    })
  } catch (error) {
    logger.error('Scheduler warmup failed:', error)
    return NextResponse.json(
      { status: 'error', error: 'Failed to start scheduler' },
      { status: 500 }
    )
  }
}
