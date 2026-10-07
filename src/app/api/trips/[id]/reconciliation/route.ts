import { NextRequest, NextResponse } from "next/server"
import { requireRole, ROLES } from "@/lib/auth-server"
import { calculateTripReconciliation, saveTripReconciliation, TripReconciliationError } from "@/lib/services/trip-reconciliation-service"

function domainResponse(error: unknown) {
  if (error instanceof TripReconciliationError) {
    return NextResponse.json({ error: error.message, code: error.code }, { status: error.code === "TRIP_NOT_FOUND" ? 404 : 400 })
  }
  return NextResponse.json({ error: "Trip reconciliation failed" }, { status: 500 })
}

export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = requireRole(request, [ROLES.ADMIN, ROLES.MANAGER])
  if (auth instanceof NextResponse) return auth
  try {
    const { id } = await params
    return NextResponse.json(await calculateTripReconciliation(id))
  } catch (error) {
    console.error("Trip reconciliation GET error:", error)
    return domainResponse(error)
  }
}

async function save(request: NextRequest, params: Promise<{ id: string }>) {
  const auth = requireRole(request, [ROLES.ADMIN, ROLES.MANAGER])
  if (auth instanceof NextResponse) return auth
  try {
    const { id } = await params
    return NextResponse.json(await saveTripReconciliation(id, auth))
  } catch (error) {
    console.error("Trip reconciliation save error:", error)
    return domainResponse(error)
  }
}

export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  return save(request, params)
}

export async function PUT(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  return save(request, params)
}
