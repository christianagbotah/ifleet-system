import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

const read = (path: string) => readFileSync(resolve(process.cwd(), path), 'utf8')

describe('Paystack charge integrity contract', () => {
  it('persists a durable provider/reference idempotency authority', () => {
    const schema = read('prisma/schema.prisma')
    expect(schema).toContain('model PaymentTransaction')
    expect(schema).toContain('@@unique([provider, reference])')
  })

  it('initializes charges only against a server-validated invoice and records the pending transaction', () => {
    const source = read('src/app/api/payments/paystack/initialize/route.ts')
    expect(source).toContain('db.invoice.findUnique')
    expect(source).toContain('db.paymentTransaction.create')
    expect(source).not.toContain('settlementId')
  })

  it('uses one shared successful-charge processor without expense or settlement side effects', () => {
    for (const path of [
      'src/app/api/payments/paystack/verify/route.ts',
      'src/app/api/payments/paystack/webhook/route.ts',
    ]) {
      const source = read(path)
      expect(source, path).toContain('processSuccessfulPaystackCharge')
      expect(source, path).not.toContain('db.expense')
      expect(source, path).not.toContain('markDriverSettlementPaid')
      expect(source, path).not.toContain('async function processSuccessfulPayment')
    }
  })
})
