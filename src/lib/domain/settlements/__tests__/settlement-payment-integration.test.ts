import { existsSync, readFileSync } from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'

const root = process.cwd()
const source = (relative: string) => {
  const file = path.join(root, relative)
  return existsSync(file) ? readFileSync(file, 'utf8') : ''
}

describe('driver settlement payment integration', () => {
  it('centralizes paid-state accounting in one service', () => {
    const service = source('src/lib/domain/settlements/mark-driver-settlement-paid.ts')
    expect(service).toContain('deriveSettlementPaymentEffects')
    expect(service).toContain("status: 'paid'")
    expect(service).toContain('cashAdvance.update')
    expect(service).toContain('driverIncentive.updateMany')
    expect(service).toContain("isolationLevel: 'Serializable'")
  })

  it('uses the central payment service from manual settlement updates', () => {
    const route = source('src/app/api/settlements/[id]/route.ts')
    expect(route).toContain('markDriverSettlementPaid')
  })

  it('keeps driver settlement payout accounting out of Paystack customer charge processing', () => {
    const verify = source('src/app/api/payments/paystack/verify/route.ts')
    const webhook = source('src/app/api/payments/paystack/webhook/route.ts')
    expect(verify).toContain('processSuccessfulPaystackCharge')
    expect(webhook).toContain('processSuccessfulPaystackCharge')
    expect(verify).not.toContain('markDriverSettlementPaid')
    expect(webhook).not.toContain('markDriverSettlementPaid')
    expect(verify).not.toContain('settlementId')
    expect(webhook).not.toContain('settlementId')
  })
})
