import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

const source = readFileSync(
  join(process.cwd(), 'src/lib/domain/route-intelligence/prisma-route-advisory-repository.ts'),
  'utf8',
)

describe('Prisma route advisory repository contract', () => {
  it('loads operational evidence in batches and uses server-owned eligibility', () => {
    expect(source).toContain('evaluateAssignmentEligibility')
    expect(source).toContain('db.truck.findMany')
    expect(source).toContain('db.vehicleLiveState.findMany')
    expect(source).toContain('db.trip.findMany')
    expect(source).toContain('receivedAt')
    expect(source).not.toContain('.findFirst(')
  })

  it('does not select sensitive driver identifiers for advisory output', () => {
    expect(source).not.toContain('phone: true')
    expect(source).not.toContain('licenseNumber: true')
    expect(source).not.toContain('ghanaCardNumber: true')
  })

  it('cannot mutate trip or assignment state', () => {
    expect(source).not.toMatch(/db\.trip\.(create|update|delete|upsert)/)
    expect(source).not.toMatch(/db\.loadOrder\.(create|update|delete|upsert)/)
    expect(source).not.toMatch(/db\.trailerCoupling\.(create|update|delete|upsert)/)
  })
})
