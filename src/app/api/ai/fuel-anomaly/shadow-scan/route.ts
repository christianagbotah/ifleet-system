import { NextRequest, NextResponse } from "next/server"
import { z } from "zod/v4"
import { requireRole, ROLES } from "@/lib/auth-server"
import { normalizeFuelAnomalyShadowScanInput, scanFuelAnomalySubjects } from "@/lib/services/fuel-anomaly-shadow-scan-service"
import type { FuelAnomalyActor } from "@/lib/services/fuel-anomaly-assessment-service"

const bodySchema = z.object({
  startDate: z.string().datetime({ offset: true }),
  endDate: z.string().datetime({ offset: true }),
  truckId: z.string().trim().min(1).optional(),
  limit: z.number().int().positive().optional(),
}).strict()

function authorize(request: NextRequest): FuelAnomalyActor | NextResponse {
  const expectedInternalKey = process.env.INTERNAL_API_KEY?.trim()
  const suppliedInternalKey = request.headers.get("x-internal-api-key")
  if (expectedInternalKey && suppliedInternalKey === expectedInternalKey) {
    return { userId: "system:fuel-anomaly-shadow-scan", roleName: "System" }
  }
  const auth = requireRole(request, ROLES.ADMIN)
  if (auth instanceof NextResponse) return auth
  return { userId: auth.userId, roleName: auth.roleName }
}

export async function POST(request: NextRequest) {
  const actor = authorize(request)
  if (actor instanceof NextResponse) return actor
  try {
    const body = bodySchema.parse(await request.json())
    const input = normalizeFuelAnomalyShadowScanInput({
      startDate: new Date(body.startDate),
      endDate: new Date(body.endDate),
      truckId: body.truckId,
      limit: body.limit,
    })
    const result = await scanFuelAnomalySubjects(input, actor)
    return NextResponse.json({ observerMode: true, ...result })
  } catch (error) {
    const message = error instanceof Error ? error.message : "invalid request"
    const clientError = message.startsWith("FUEL_ANOMALY_SCAN_") || (error as { name?: string }).name === "ZodError"
    return NextResponse.json({ error: clientError ? message : "Fuel anomaly observer scan failed" }, { status: clientError ? 400 : 500 })
  }
}
