import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

const root = process.cwd()
const source = (path: string) => readFileSync(join(root, path), 'utf8')

describe('routing intelligence integration contract', () => {
  it('extends legacy geofences additively and adds durable route/geofence event models', () => {
    const legacySchema = source('prisma/schema.prisma')
    const routingSchema = source('prisma/models/routing.prisma')

    expect(legacySchema).toContain('geometryType')
    expect(legacySchema).toContain('geometryJson')
    expect(legacySchema).toContain('dwellThresholdMinutes')
    expect(routingSchema).toContain('model PlannedRoute')
    expect(routingSchema).toContain('model GeofenceAssetState')
    expect(routingSchema).toContain('model GeofenceTransitionEvent')
    expect(routingSchema).toContain('model RouteDeviationEvent')
    expect(routingSchema).toContain('idempotencyKey')
    expect(routingSchema).toContain('@unique')
  })

  it('provides authenticated write-gated route plan CRUD APIs', () => {
    const collection = source('src/app/api/routes/route.ts')
    const item = source('src/app/api/routes/[id]/route.ts')

    for (const route of [collection, item]) {
      expect(route).toContain('requireAuth')
    }
    expect(collection).toContain('requireWriteAccess')
    expect(item).toContain('requireWriteAccess')
    expect(collection).toContain('validateRoutePoints')
    expect(item).toContain('validateRoutePoints')
  })

  it('keeps existing geofence APIs compatible while accepting polygon geometry', () => {
    const collection = source('src/app/api/tracking/geofences/route.ts')
    const item = source('src/app/api/tracking/geofences/[id]/route.ts')

    expect(collection).toContain('geometryType')
    expect(collection).toContain('geometryJson')
    expect(collection).toContain('polygon')
    expect(item).toContain('geometryType')
    expect(item).toContain('geometryJson')
  })

  it('keeps exactly one active planned route per trip when a route is reactivated', () => {
    const item = source('src/app/api/routes/[id]/route.ts')
    expect(item).toContain("new Set(['active', 'inactive', 'superseded'])")
    expect(item).toContain("requestedStatus === 'active'")
    expect(item).toContain('db.$transaction')
    expect(item).toContain('plannedRoute.updateMany')
    expect(item).toContain('id: { not: id }')
  })

  it('hooks persisted normalized locations into the routing intelligence repository', () => {
    const repository = source('src/lib/domain/telematics/prisma-ingest-repository.ts')
    expect(repository).toContain('processLocationRoutingIntelligence')
    expect(repository).toContain('PrismaRoutingIntelligenceRepository')
    expect(repository.indexOf('const event = await tx.telematicsEvent.create')).toBeLessThan(
      repository.indexOf('processLocationRoutingIntelligence({'),
    )
  })

  it('does not let out-of-order historical locations mutate current routing state', () => {
    const repository = source('src/lib/domain/telematics/prisma-ingest-repository.ts')
    expect(repository).toContain("input.event.kind === 'location' && liveStateUpdated")
  })
})
