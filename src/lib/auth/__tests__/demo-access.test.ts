import { describe, expect, it } from 'vitest'

import { canDemoAccessApi, canDemoAccessNav } from '../demo-access'

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

  it('hides sensitive navigation while keeping operational modules visible', () => {
    expect(canDemoAccessNav('dashboard')).toBe(true)
    expect(canDemoAccessNav('tracking')).toBe(false)
    expect(canDemoAccessNav('drivers')).toBe(false)
    expect(canDemoAccessNav('clients')).toBe(false)
    expect(canDemoAccessNav('payroll')).toBe(false)
    expect(canDemoAccessNav('users')).toBe(false)
    expect(canDemoAccessNav('audit-log')).toBe(false)
  })
})
