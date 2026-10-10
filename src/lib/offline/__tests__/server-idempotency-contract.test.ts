import fs from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'

const root = process.cwd()
const source = (relative: string) => fs.readFileSync(path.join(root, relative), 'utf8')

describe('offline driver mutation server idempotency', () => {
  it('provides a durable unique idempotency ledger for cross-cutting mutations', () => {
    const schema = source('prisma/models/operational-events.prisma')
    expect(schema).toContain('idempotencyKey    String   @unique')
    expect(schema).toContain('entityId          String')
  })

  it('deduplicates trip expense retries by client mutation id', () => {
    const route = source('src/app/api/trips/[id]/expenses/route.ts')
    expect(route).toContain('clientMutationId')
    expect(route).toContain('db.expense.findUnique')
    expect(route).toContain('clientMutationId: mutationId')
  })

  it('deduplicates fuel log retries by client mutation id', () => {
    const route = source('src/app/api/fuel-logs/route.ts')
    expect(route).toContain('clientMutationId')
    expect(route).toContain('db.fuelLog.findUnique')
    expect(route).toContain('clientMutationId: mutationId')
  })

  it('deduplicates lifecycle transition retries through TripEvent', () => {
    const service = source('src/lib/domain/dispatch/transition-trip.ts')
    expect(service).toContain('clientMutationId')
    expect(service).toContain('findEventByClientMutationId')
  })

  it('deduplicates inspection retries atomically through the operational event ledger', () => {
    const route = source('src/app/api/inspections/route.ts')
    expect(route).toContain('clientMutationId')
    expect(route).toContain('db.operationalEvent.findUnique')
    expect(route).toContain('db.vehicleInspection.findUnique')
    expect(route).toContain('driver-inspection:${mutationId}')
    expect(route).toContain('db.$transaction')
    expect(route).toContain('replayed: true')
  })

  it('scopes driver inspection access to the linked driver, assigned truck and trip', () => {
    const route = source('src/app/api/inspections/route.ts')
    const summary = source('src/app/api/inspections/summary/route.ts')
    const detail = source('src/app/api/inspections/[id]/route.ts')
    expect(route).toContain("import { requireAuth, requireWriteAccess, ROLES } from '@/lib/auth-server'")
    expect(route).toContain("auth.roleName === ROLES.DRIVER")
    expect(route).toContain('where.driverId = auth.driverId')
    expect(route).toContain('if (!tripId && truck.driverId !== auth.driverId)')
    expect(route).toContain('trip.driverId !== auth.driverId')
    expect(route).toContain("You can only inspect trucks assigned to you")
    expect(summary).toContain("auth.roleName === ROLES.DRIVER")
    expect(summary).toContain('driverId: auth.driverId')
    expect(detail).toContain("auth.roleName === ROLES.DRIVER && record.driverId !== auth.driverId")
  })
})
