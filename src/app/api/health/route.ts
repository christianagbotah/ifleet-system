import { NextResponse } from "next/server"
import { db } from "@/lib/db"

export async function GET() {
  try {
    await db.$queryRaw`SELECT 1`
    return NextResponse.json({
      status: "ok",
      service: "ifleetpro",
      database: "ok",
      timestamp: new Date().toISOString(),
    })
  } catch {
    console.error("Health check failed: database unavailable")
    return NextResponse.json(
      { status: "error", service: "ifleetpro", database: "unavailable" },
      { status: 503 },
    )
  }
}
