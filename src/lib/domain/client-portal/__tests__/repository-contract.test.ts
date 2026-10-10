import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

const source = readFileSync(
  join(process.cwd(), 'src/lib/domain/client-portal/repository.ts'),
  'utf8',
)

describe('client portal repository contract', () => {
  it('batches live and fallback shipment location evidence rather than querying per trip', () => {
    expect(source).toContain('db.vehicleLiveState.findMany')
    expect(source).toContain("assetType: 'tractor'")
    expect(source).toContain('receivedAt: true')
    expect(source).toContain('db.truckLocation.findMany')
    expect(source).not.toContain('db.truckLocation.findFirst')
    expect(source).toContain('tripId: { in: activeTripIds }')
  })

  it('exposes only driver display names and omits driver PII/internal trip notes', () => {
    expect(source).toContain("driver: { select: { firstName: true, lastName: true } }")
    expect(source).not.toMatch(/driver:\s*\{\s*select:\s*\{[^}]*phone:\s*true/s)
    expect(source).not.toContain('employeeId: true')
    expect(source).not.toContain('licenseNumber: true')
    expect(source).not.toContain('ghanaCardNumber: true')
    expect(source).not.toContain('notes: true')
  })

  it('binds shipment detail lookup to both trip and token client id', () => {
    expect(source).toContain('where: { id: tripId, clientId }')
  })
})
