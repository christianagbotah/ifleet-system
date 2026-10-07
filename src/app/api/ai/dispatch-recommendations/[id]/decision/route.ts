import { NextRequest, NextResponse } from 'next/server'
import { requireRole, ROLES } from '@/lib/auth-server'
import { dispatchDecisionSchema } from '@/lib/ai/dispatch/request-schema'
import { recordDispatchDecision } from '@/lib/services/dispatch-copilot-service'

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const auth = requireRole(request, [ROLES.ADMIN, ROLES.MANAGER])
    if (auth instanceof NextResponse) return auth

    const { id } = await params
    const body = await request.json().catch(() => null)
    const parsed = dispatchDecisionSchema.safeParse(body)
    if (!parsed.success) {
      return NextResponse.json(
        { error: 'Invalid dispatch decision', issues: parsed.error.issues },
        { status: 400 },
      )
    }

    const decision = await recordDispatchDecision(
      id,
      parsed.data,
      { userId: auth.userId, role: auth.roleName },
    )

    return NextResponse.json({
      recommendationId: decision.id,
      decision: decision.decision,
      selectedDriverId: decision.selectedDriverId ?? null,
      selectedTruckId: decision.selectedTruckId ?? null,
      stale: decision.stale,
      status: decision.status,
    })
  } catch (error) {
    console.error('[Dispatch Copilot] Decision error:', error)
    const message = error instanceof Error ? error.message : 'Dispatch decision failed'

    if (message === 'Dispatch recommendation not found') {
      return NextResponse.json({ error: message }, { status: 404 })
    }
    if (message.includes('not recommended') || message.includes('requires driver and truck')) {
      return NextResponse.json({ error: message }, { status: 409 })
    }

    return NextResponse.json({ error: 'Failed to record dispatch decision' }, { status: 500 })
  }
}
