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
    const evidenceValidator = source('src/lib/domain/evidence/driver-evidence-server.ts')
    expect(route).toContain('clientMutationId')
    expect(route).toContain('db.operationalEvent.findUnique')
    expect(route).toContain('db.vehicleInspection.findUnique')
    expect(route).toContain('driver-inspection:${mutationId}')
    expect(route).toContain('db.$transaction')
    expect(route).toContain('replayed: true')
    expect(route).toContain("if (auth.roleName === ROLES.DRIVER && !mutationId)")
    expect(route).toContain('validateDriverEvidenceRefs')
    expect(evidenceValidator).toContain('driver-evidence-upload:${evidenceMutationId}')
    expect(evidenceValidator).toContain('event.actorId !== auth.userId')
  })

  it('binds inspection replay identity to the submitted inspection payload', () => {
    const route = source('src/app/api/inspections/route.ts')
    expect(route).toContain("createHash('sha256')")
    expect(route).toContain('payloadHash?: string')
    expect(route).toContain('payloadHash: string')
    expect(route).toContain('metadata.payloadHash === input.payloadHash')
    expect(route).toContain('clientMutationId has already been used for a different inspection')
  })

  it('binds driver status replay to payload content and validates owned evidence', () => {
    const route = source('src/app/api/trips/[id]/transition/route.ts')
    expect(route).toContain("clientMutationId is required for driver status updates")
    expect(route).toContain('driverReplay')
    expect(route).toContain('payloadHash')
    expect(route).toContain('validateDriverEvidenceRefs')
    expect(route).toContain("auth.roleName === ROLES.DRIVER ? {} : rawUserMetadata")
    expect(route).toContain('Driver status evidence only supports photo references')
    expect(route).toContain('clientMutationId has already been used for a different status update')
  })

  it('binds driver expense replay to amount and receipt while validating owned evidence', () => {
    const route = source('src/app/api/trips/[id]/expenses/route.ts')
    expect(route).toContain("clientMutationId is required for driver expenses")
    expect(route).toContain('receiptUrl')
    expect(route).toContain('validateDriverEvidenceRefs')
    expect(route).toContain('clientMutationId has already been used for a different expense')
    expect(route).toContain('receiptUrl: normalizedReceiptUrl')
    expect(route).toContain('normalizedAmount <= 0')
  })

  it('shares driver evidence ownership validation across inspections and trip writes', () => {
    const helperPath = 'src/lib/domain/evidence/driver-evidence-server.ts'
    expect(fs.existsSync(path.join(root, helperPath))).toBe(true)
    if (!fs.existsSync(path.join(root, helperPath))) return

    const helper = source(helperPath)
    const inspections = source('src/app/api/inspections/route.ts')
    expect(helper).toContain('driver-evidence-upload:')
    expect(helper).toContain('event.actorId !== auth.userId')
    expect(helper).toContain('metadata.driverId !== auth.driverId')
    expect(helper).toContain('(metadata.tripId ?? null) !== tripId')
    expect(inspections).toContain("from '@/lib/domain/evidence/driver-evidence-server'")
  })

  it('deduplicates driver evidence uploads and refuses mutation collisions', () => {
    const route = source('src/app/api/upload/route.ts')
    expect(route).toContain('driver-evidence-upload:')
    expect(route).toContain('db.operationalEvent.findUnique')
    expect(route).toContain('replayed: true')
    expect(route).toContain("flag: 'wx'")
    expect(route).toContain('mimeTypes')
    expect(route).toContain('contentHashes')
    expect(route).toContain("createHash('sha256')")
    expect(route).toContain('clientMutationId has already been used for different evidence')
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
    expect(detail).toContain("if (auth.roleName === ROLES.DRIVER && !auth.driverId)")
    expect(detail).toContain("auth.roleName === ROLES.DRIVER && record.driverId !== auth.driverId")
  })
})
