import { NextRequest, NextResponse } from "next/server"
import { requireRole, ROLES } from "@/lib/auth-server"
import { recordFuelAnomalyReview } from "@/lib/services/fuel-anomaly-assessment-service"
import { parseFuelAnomalyReviewInput } from "../../request-schema"

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const auth = requireRole(request, [ROLES.ADMIN, ROLES.MANAGER])
  if (auth instanceof NextResponse) return auth
  let input
  try {
    input = parseFuelAnomalyReviewInput(await request.json())
  } catch {
    return NextResponse.json({ error: "Invalid fuel anomaly review request" }, { status: 400 })
  }
  try {
    const { id } = await params
    const assessment = await recordFuelAnomalyReview(id, input, { userId: auth.userId, roleName: auth.roleName })
    return NextResponse.json({ assessment })
  } catch (error) {
    const message = error instanceof Error ? error.message : "unknown"
    if (message === "ASSESSMENT_NOT_FOUND") return NextResponse.json({ error: "Fuel anomaly assessment not found" }, { status: 404 })
    if (message === "INVALID_REVIEW_TRANSITION" || message === "OUTCOME_REQUIRED" || message === "INVALID_OUTCOME") {
      return NextResponse.json({ error: message }, { status: 409 })
    }
    console.error("[FuelAnomaly] review failed", message)
    return NextResponse.json({ error: "Fuel anomaly review failed" }, { status: 500 })
  }
}
