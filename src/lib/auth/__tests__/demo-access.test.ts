import { describe, expect, it } from 'vitest'

import { canDemoAccessApi, canDemoAccessNav } from '../demo-access'

describe('demo access policy', () => {
  it('allows safe operational reads but blocks sensitive read namespaces', () => {
    expect(canDemoAccessApi('/api/dashboard', 'GET')).toBe(true)
    expect(canDemoAccessApi('/api/trips', 'GET')).toBe(true)
    expect(canDemoAccessApi('/api/users', 'GET')).toBe(false)
    expect(canDemoAccessApi('/api/audit-logs', 'GET')).toBe(false)
    expect(canDemoAccessApi('/api/payroll', 'GET')).toBe(false)
    expect(canDemoAccessApi('/api/invoices', 'GET')).toBe(false)
  })

  it('blocks every mutating API method for demo sessions', () => {
    for (const method of ['POST', 'PUT', 'PATCH', 'DELETE']) {
      expect(canDemoAccessApi('/api/trips', method)).toBe(false)
    }
  })

  it('hides sensitive navigation while keeping operational modules visible', () => {
    expect(canDemoAccessNav('dashboard')).toBe(true)
    expect(canDemoAccessNav('tracking')).toBe(true)
    expect(canDemoAccessNav('payroll')).toBe(false)
    expect(canDemoAccessNav('users')).toBe(false)
    expect(canDemoAccessNav('audit-log')).toBe(false)
  })
})
