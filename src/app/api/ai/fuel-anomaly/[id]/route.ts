import { NextRequest, NextResponse } from "next/server"
import { requireRole, ROLES } from "@/lib/auth-server"
import { getFuelAnomalyAssessmentDetailView } from "@/lib/services/fuel-anomaly-query-service"

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const auth = requireRole(request, [ROLES.ADMIN, ROLES.MANAGER])
  if (auth instanceof NextResponse) return auth
  const { id } = await params
  if (!id?.trim()) return NextResponse.json({ error: "Assessment id is required" }, { status: 400 })
  try {
    const assessment = await getFuelAnomalyAssessmentDetailView(id.trim())
    if (!assessment) return NextResponse.json({ error: "Fuel anomaly assessment not found" }, { status: 404 })
    return NextResponse.json({ assessment })
  } catch (error) {
    console.error("[FuelAnomaly] detail retrieval failed", error instanceof Error ? error.message : "unknown")
    return NextResponse.json({ error: "Failed to load fuel anomaly assessment" }, { status: 500 })
  }
}
