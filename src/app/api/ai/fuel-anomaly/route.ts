import { NextRequest, NextResponse } from "next/server"
import { requireRole, ROLES } from "@/lib/auth-server"
import { assessFuelAnomaly, getFuelAnomalyAssessment, recordFuelAnomalyExplanation } from "@/lib/services/fuel-anomaly-assessment-service"
import { explainFuelAnomalyAssessment } from "@/lib/ai/fuel-anomaly/explainer-client"
import { parseFuelAnomalySubject } from "./request-schema"

export async function POST(request: NextRequest) {
  const auth = requireRole(request, [ROLES.ADMIN, ROLES.MANAGER])
  if (auth instanceof NextResponse) return auth

  let subject
  try {
    subject = parseFuelAnomalySubject(await request.json())
  } catch {
    return NextResponse.json({ error: "Invalid fuel anomaly assessment request" }, { status: 400 })
  }

  try {
    const assessment = await assessFuelAnomaly(subject, { userId: auth.userId, roleName: auth.roleName })
    const explanation = await explainFuelAnomalyAssessment(assessment)
    const persisted = await recordFuelAnomalyExplanation(assessment.id, {
      source: explanation.source,
      provider: explanation.provider,
      model: explanation.model,
      output: JSON.stringify({
        summary: explanation.summary,
        findingExplanations: explanation.findingExplanations,
        investigationQuestions: explanation.investigationQuestions,
      }),
    })
    return NextResponse.json({ assessment: persisted })
  } catch (error) {
    console.error("[FuelAnomaly] assessment request failed", error instanceof Error ? error.message : "unknown")
    return NextResponse.json({ error: "Fuel anomaly assessment failed" }, { status: 500 })
  }
}

export async function GET(request: NextRequest) {
  const auth = requireRole(request, [ROLES.ADMIN, ROLES.MANAGER])
  if (auth instanceof NextResponse) return auth
  const id = new URL(request.url).searchParams.get("id")?.trim()
  if (!id) return NextResponse.json({ error: "Assessment id is required" }, { status: 400 })
  try {
    const assessment = await getFuelAnomalyAssessment(id)
    if (!assessment) return NextResponse.json({ error: "Fuel anomaly assessment not found" }, { status: 404 })
    return NextResponse.json({ assessment })
  } catch (error) {
    console.error("[FuelAnomaly] assessment retrieval failed", error instanceof Error ? error.message : "unknown")
    return NextResponse.json({ error: "Failed to load fuel anomaly assessment" }, { status: 500 })
  }
}
