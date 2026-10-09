import { NextRequest, NextResponse } from 'next/server'
import { requireAuth } from '@/lib/auth-server'
import { loadControlTowerLive } from '@/lib/domain/telematics/control-tower-service'
import { PrismaControlTowerRepository } from '@/lib/domain/telematics/prisma-control-tower-repository'

export async function GET(request: NextRequest) {
  const auth = requireAuth(request)
  if (auth instanceof NextResponse) return auth

  try {
    const data = await loadControlTowerLive(new PrismaControlTowerRepository(), {
      now: new Date(),
      roleName: auth.roleName,
    })
    return NextResponse.json({ data, generatedAt: new Date().toISOString() })
  } catch (error) {
    console.error('[Control Tower] Failed to load live telemetry:', error)
    return NextResponse.json({ error: 'Failed to load live telemetry' }, { status: 500 })
  }
}
