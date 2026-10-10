import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

function read(path: string): string {
  return readFileSync(join(process.cwd(), path), 'utf8')
}

describe('trip AI advisory integration contract', () => {
  it('uses a Prisma fact repository and the canonical dispatch clearance result', () => {
    const source = read('src/lib/domain/ai-ops/prisma-trip-advisory-repository.ts')

    expect(source).toContain('evaluateTripDispatchClearance')
    expect(source).toContain('vehicleLiveState')
    expect(source).toContain('factoryQueueEntry')
    expect(source).toContain('weighingEvent')
    expect(source).toContain('actualDuration')
  })

  it('anchors live-data freshness to server receipt time instead of the device clock', () => {
    const source = read('src/lib/domain/ai-ops/prisma-trip-advisory-repository.ts')

    expect(source).toContain('receivedAt: true')
    expect(source).toContain('observedAt: liveState.receivedAt')
    expect(source).not.toContain('observedAt: liveState.deviceTimestamp')
  })

  it('exposes an authenticated GET-only route with driver own-trip scoping', () => {
    const source = read('src/app/api/ai-ops/trips/[id]/advisory/route.ts')

    expect(source).toContain('requireAuth')
    expect(source).toContain('ROLES.DRIVER')
    expect(source).toContain('auth.driverId')
    expect(source).toContain('buildTripAdvisory')
    expect(source).toContain('PrismaTripAdvisoryRepository')
    expect(source).not.toContain('export async function POST')
    expect(source).not.toContain('totalRevenue')
    expect(source).not.toContain('fuelCost')
  })
})
