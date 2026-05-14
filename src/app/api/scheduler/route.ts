import { NextRequest, NextResponse } from 'next/server'
import { requireRole, ROLES } from '@/lib/auth-server'
import { scheduler, startScheduler } from '@/lib/scheduler'
import { logger } from '@/lib/logger'

// GET: Return scheduler job status
export async function GET(request: NextRequest) {
  const auth = requireRole(request, [ROLES.ADMIN, ROLES.MANAGER])
  if (auth instanceof NextResponse) return auth

  try {
    const status = scheduler.getJobStatus()
    return NextResponse.json({
      isRunning: scheduler.isRunning,
      jobs: status,
    })
  } catch (error) {
    logger.error('Failed to get scheduler status:', error)
    return NextResponse.json({ error: 'Failed to get scheduler status' }, { status: 500 })
  }
}

// POST: Restart scheduler or trigger a specific job
export async function POST(request: NextRequest) {
  const auth = requireRole(request, [ROLES.ADMIN, ROLES.MANAGER])
  if (auth instanceof NextResponse) return auth

  try {
    const body = await request.json()
    const { action, jobName } = body as { action?: string; jobName?: string }

    if (!action || !['restart', 'trigger'].includes(action)) {
      return NextResponse.json(
        { error: 'Invalid action. Use "restart" or "trigger".' },
        { status: 400 }
      )
    }

    if (action === 'restart') {
      startScheduler()
      logger.info('Scheduler restarted via API', { userId: auth.userId })
      return NextResponse.json({
        message: 'Scheduler restarted successfully',
        isRunning: scheduler.isRunning,
        jobs: scheduler.getJobStatus(),
      })
    }

    if (action === 'trigger') {
      if (!jobName) {
        return NextResponse.json(
          { error: 'jobName is required for trigger action' },
          { status: 400 }
        )
      }

      const success = await scheduler.triggerJob(jobName)
      if (!success) {
        return NextResponse.json(
          { error: `Job "${jobName}" not found` },
          { status: 404 }
        )
      }

      logger.info(`Job "${jobName}" triggered manually`, { userId: auth.userId })
      return NextResponse.json({
        message: `Job "${jobName}" triggered successfully`,
        jobs: scheduler.getJobStatus(),
      })
    }

    return NextResponse.json({ error: 'Unknown action' }, { status: 400 })
  } catch (error) {
    logger.error('Scheduler POST request failed:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
