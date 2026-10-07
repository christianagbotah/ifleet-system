import { NextRequest, NextResponse } from 'next/server'
import { requireRole, ROLES } from '@/lib/auth-server'
import { dispatchRecommendationRequestSchema } from '@/lib/ai/dispatch/request-schema'
import { explainDispatchRanking } from '@/lib/ai/dispatch/explainer-client'
import { getDispatchRecommendations } from '@/lib/services/dispatch-copilot-service'

export async function POST(request: NextRequest) {
  try {
    const auth = requireRole(request, [ROLES.ADMIN, ROLES.MANAGER])
    if (auth instanceof NextResponse) return auth

    const body = await request.json().catch(() => null)
    const parsed = dispatchRecommendationRequestSchema.safeParse(body)
    if (!parsed.success) {
      return NextResponse.json(
        { error: 'Invalid dispatch recommendation request', issues: parsed.error.issues },
        { status: 400 },
      )
    }

    const actor = { userId: auth.userId, role: auth.roleName }
    const recommendation = await getDispatchRecommendations(parsed.data, actor)

    const trip = 'tripDraft' in parsed.data
      ? {
          departureTime: parsed.data.tripDraft.departureTime.toISOString(),
          destinationZoneId: parsed.data.tripDraft.destinationZoneId ?? null,
          cargoUnit: parsed.data.tripDraft.cargoUnit ?? null,
          quantity: parsed.data.tripDraft.quantity ?? null,
        }
      : {}

    const explanations = await explainDispatchRanking({
      trip,
      rankedCandidates: recommendation.ranked,
    })

    return NextResponse.json({
      recommendationId: recommendation.recommendationId,
      candidates: explanations.candidates,
      blockedDrivers: recommendation.blockedDrivers,
      blockedTrucks: recommendation.blockedTrucks,
      confidence: recommendation.confidence,
      dataQuality: recommendation.dataQuality,
      explanationSource: explanations.explanationSource,
      summary: explanations.summary,
    })
  } catch (error) {
    console.error('[Dispatch Copilot] Recommendation error:', error)
    const message = error instanceof Error ? error.message : 'Dispatch recommendation failed'

    if (message === 'Trip not found') {
      return NextResponse.json({ error: message }, { status: 404 })
    }

    return NextResponse.json(
      { error: 'Failed to generate dispatch recommendations' },
      { status: 500 },
    )
  }
}
