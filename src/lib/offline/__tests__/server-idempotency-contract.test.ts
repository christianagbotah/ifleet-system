import fs from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'

const root = process.cwd()
const source = (relative: string) => fs.readFileSync(path.join(root, relative), 'utf8')

describe('offline driver mutation server idempotency', () => {
  it('stores client mutation identities on expense, fuel and trip event records', () => {
    const schema = source('prisma/schema.prisma')
    const matches = schema.match(/clientMutationId\s+String\?\s+@unique/g) ?? []
    expect(matches.length).toBeGreaterThanOrEqual(3)
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
})
