import { describe, expect, it } from 'vitest'

import { canDemoAccessApi } from '../demo-access'

describe('demo access policy', () => {
  it('blocks every protected production API read for public demo sessions', () => {
    for (const path of [
      '/api/dashboard',
      '/api/trips',
      '/api/trucks',
      '/api/users',
      '/api/audit-logs',
      '/api/payroll',
      '/api/invoices',
      '/api/tracking',
      '/api/drivers',
      '/api/clients',
      '/api/pricing',
      '/api/fuel-budgets',
      '/api/trip-expenses',
      '/api/tolls/analytics',
    ]) {
      expect(canDemoAccessApi(path, 'GET')).toBe(false)
    }
  })

  it('blocks every mutating API method for demo sessions', () => {
    for (const method of ['POST', 'PUT', 'PATCH', 'DELETE']) {
      expect(canDemoAccessApi('/api/trips', method)).toBe(false)
    }
  })

  it('keeps all production navigation behind the isolated demo workspace', () => {
    expect(canDemoAccessApi('/api/dashboard', 'GET')).toBe(false)
    expect(canDemoAccessApi('/api/tracking', 'GET')).toBe(false)
    expect(canDemoAccessApi('/api/drivers', 'GET')).toBe(false)
  })
})
