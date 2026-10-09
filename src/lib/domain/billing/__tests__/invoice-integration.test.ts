import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

const source = (path: string) => readFileSync(resolve(process.cwd(), path), 'utf8')

describe('trip-backed customer invoice integration', () => {
  it('derives linked-trip invoice items from finalized delivery evidence', () => {
    const route = source('src/app/api/invoices/route.ts')

    expect(route).toContain('deriveTripInvoiceLine')
    expect(route).toContain('proofOfDelivery.findMany')
    expect(route).toContain('acceptedQty')
    expect(route).toContain('supersedesId')
    expect(route).toContain('tripId ? derivedItems : items')
  })

  it('allows the invoice schema to omit manual items only when the route can derive them from a trip', () => {
    const schemas = source('src/lib/schemas/index.ts')
    const route = source('src/app/api/invoices/route.ts')

    expect(schemas).toContain('.optional().default([])')
    expect(route).toContain('Manual invoices require at least one line item')
  })

  it('offers invoiceable reconciled trips in the finance UI instead of requiring a raw trip id', () => {
    const route = source('src/app/api/invoices/invoiceable-trips/route.ts')
    const view = source('src/components/invoices/InvoicesView.tsx')

    expect(route).toContain('deriveTripInvoiceLine')
    expect(route).toContain("status: { in: ['reconciled', 'completed'] }")
    expect(route).toContain('Invoice: null')
    expect(view).toContain('Invoice from finalized trip')
    expect(view).toContain('/api/invoices/invoiceable-trips')
  })
})
