import { NextResponse } from "next/server"

export async function GET() {
  return NextResponse.json({ status: "ok", service: "ifleetpro", timestamp: new Date().toISOString() })
}
