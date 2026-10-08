import { NextRequest, NextResponse } from 'next/server'

import { createAuditLog, getClientIp } from '@/lib/audit'
import { requireAuth, requireWriteAccess } from '@/lib/auth-server'
import {
  type DispatchClearanceCheckKey,
} from '@/lib/domain/dispatch/clearance'
import {
  evaluateTripDispatchClearance,
  TripClearanceError,
} from '@/lib/domain/dispatch/trip-clearance'

const CLEARANCE_CHECKS = new Set<DispatchClearanceCheckKey>([
  'assignment', 'gate', 'weighing', 'documents', 'seal', 'compliance',
])

function parseOverrideChecks(value: unknown): DispatchClearanceCheckKey[] {
  if (!Array.isArray(value)) return []
  return [...new Set(
    value
      .map(String)
      .filter((item): item is DispatchClearanceCheckKey => CLEARANCE_CHECKS.has(item as DispatchClearanceCheckKey)),
  )]
}

export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const auth = requireAuth(request)
    if (auth instanceof NextResponse) return auth

    const { id } = await params
    const clearance = await evaluateTripDispatchClearance(id)
    return NextResponse.json({ clearance })
  } catch (error) {
    if (error instanceof TripClearanceError) {
      return NextResponse.json({ error: error.message, code: error.code }, { status: 404 })
    }
    console.error('Dispatch clearance GET error:', error)
    return NextResponse.json({ error: 'Failed to evaluate dispatch clearance' }, { status: 500 })
  }
}

export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const auth = requireAuth(request)
    if (auth instanceof NextResponse) return auth
    const writeGuard = requireWriteAccess(auth)
    if (writeGuard instanceof NextResponse) return writeGuard

    const { id } = await params
    const body = await request.json().catch(() => ({})) as Record<string, unknown>
    const source = body.override && typeof body.override === 'object' && !Array.isArray(body.override)
      ? body.override as Record<string, unknown>
      : body
    const reason = typeof source.reason === 'string' ? source.reason.trim() : ''
    const checks = parseOverrideChecks(source.checks)

    const override = {
      authorized: true,
      actorRole: auth.roleName,
      actorId: auth.userId,
      reason,
      checks,
    }
    const clearance = await evaluateTripDispatchClearance(id, override)

    createAuditLog({
      userId: auth.userId,
      action: 'dispatch_clearance_override_evaluated',
      entity: 'Trip',
      entityId: id,
      details: {
        passed: clearance.passed,
        requestedChecks: checks,
        overriddenChecks: clearance.overriddenChecks,
        reason,
      },
      ipAddress: getClientIp(request),
    }).catch(() => {})

    return NextResponse.json({ clearance })
  } catch (error) {
    if (error instanceof TripClearanceError) {
      return NextResponse.json({ error: error.message, code: error.code }, { status: 404 })
    }
    console.error('Dispatch clearance POST error:', error)
    return NextResponse.json({ error: 'Failed to evaluate dispatch clearance override' }, { status: 500 })
  }
}
