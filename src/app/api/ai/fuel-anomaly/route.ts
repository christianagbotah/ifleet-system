import { NextRequest, NextResponse } from "next/server"
import { requireRole, ROLES } from "@/lib/auth-server"
import { assessFuelAnomaly, recordFuelAnomalyExplanation } from "@/lib/services/fuel-anomaly-assessment-service"
import { explainFuelAnomalyAssessment } from "@/lib/ai/fuel-anomaly/explainer-client"
import { parseFuelAnomalySubject } from "./request-schema"
import { getFuelAnomalyDashboardSummary, listFuelAnomalyAssessments } from "@/lib/services/fuel-anomaly-query-service"

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
  try {
    const params = new URL(request.url).searchParams
    const startDate = params.get("startDate") ? new Date(params.get("startDate")!) : undefined
    const endDate = params.get("endDate") ? new Date(params.get("endDate")!) : undefined
    const truckId = params.get("truckId") ?? undefined
    if (params.get("view") === "summary") {
      const summary = await getFuelAnomalyDashboardSummary({ startDate, endDate, truckId })
      return NextResponse.json({ summary })
    }
    const result = await listFuelAnomalyAssessments({
      startDate,
      endDate,
      truckId,
      status: params.get("status") ?? undefined,
      severity: params.get("severity") ?? undefined,
      page: params.get("page") ? Number(params.get("page")) : undefined,
      pageSize: params.get("pageSize") ? Number(params.get("pageSize")) : undefined,
    })
    return NextResponse.json(result)
  } catch (error) {
    const message = error instanceof Error ? error.message : "invalid request"
    const clientError = message.startsWith("FUEL_ANOMALY_QUERY_")
    return NextResponse.json({ error: clientError ? message : "Failed to load fuel anomaly intelligence" }, { status: clientError ? 400 : 500 })
  }
}
