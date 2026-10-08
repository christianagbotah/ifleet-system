import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

const source = readFileSync('src/app/api/load-orders/[id]/assign/route.ts', 'utf8')

describe('dispatch assignment transaction contract', () => {
  it('rechecks resource conflicts, trailer coupling, and live allocation inside the serializable transaction', () => {
    const txStart = source.indexOf('db.$transaction(async (tx) =>')
    expect(txStart).toBeGreaterThan(-1)
    const transaction = source.slice(txStart)

    expect(transaction).toContain('tx.trip.findFirst')
    expect(transaction).toContain('tx.trailerCoupling.findMany')
    expect(transaction).toContain('allocateLoadOrderQuantity')
    expect(transaction).toContain('liveRemainingByLine')
    expect(transaction).toContain("isolationLevel: 'Serializable'")
    expect(transaction).toContain("existing.status !== 'scheduled'")
    expect(transaction).not.toContain("['draft', 'scheduled'].includes(existing.status)")
  })

  it('maps serialization/deadlock conflicts to a retryable 409 instead of a generic 500', () => {
    expect(source).toContain("code === 'P2034'")
    expect(source).toContain("status: 409")
  })
})
