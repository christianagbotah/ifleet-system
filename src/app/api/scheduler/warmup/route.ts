import { NextResponse } from 'next/server'
import { startScheduler, scheduler } from '@/lib/scheduler'
import { logger } from '@/lib/logger'

const WARMUP_SECRET = process.env.WARMUP_SECRET || 'warmup'

// GET: Warmup endpoint — starts the scheduler if not already running
// Called from the dashboard on mount to ensure the scheduler is active
// Requires ?secret=warmup query parameter or x-warmup-secret header
export async function GET(request: Request) {
  try {
    // Verify secret
    const url = new URL(request.url)
    const querySecret = url.searchParams.get('secret')
    const headerSecret = request.headers.get('x-warmup-secret')

    if (querySecret !== WARMUP_SECRET && headerSecret !== WARMUP_SECRET) {
      return NextResponse.json(
        { status: 'error', error: 'Invalid or missing warmup secret' },
        { status: 401 }
      )
    }

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
