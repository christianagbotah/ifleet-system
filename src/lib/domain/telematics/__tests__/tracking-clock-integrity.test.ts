import fs from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'

const root = process.cwd()
const source = (file: string) => fs.readFileSync(path.join(root, file), 'utf8')

describe('tracking clock-integrity integration', () => {
  it('carries server receipt time through the legacy phone-location compatibility response', () => {
    const route = source('src/app/api/tracking/location/route.ts')
    expect(route).toContain('receivedAt: event.receivedAt.toISOString()')
    expect(route).toContain('receivedAt: latestLocation.createdAt.toISOString()')
  })

  it('expires socket cache entries using server receipt time instead of trusting device time', () => {
    const tracking = source('mini-services/tracking-service/index.ts')
    expect(tracking).toContain('receivedAt?: string')
    expect(tracking).toContain('location.receivedAt ?? location.timestamp')
  })
  it('scopes the legacy tracking GET endpoint to the assigned driver', () => {
    const route = source('src/app/api/tracking/location/route.ts')
    expect(route).toContain("auth.roleName === ROLES.DRIVER")
    expect(route).toContain('driverId: auth.driverId')
    expect(route).toContain('You can only view your assigned truck location.')
  })

})
