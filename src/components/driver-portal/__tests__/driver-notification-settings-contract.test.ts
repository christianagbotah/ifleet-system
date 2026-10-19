import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

const root = process.cwd()
const read = (path: string) => readFileSync(join(root, path), 'utf8')

describe('driver notification settings contract', () => {
  it('lets a Driver update only their own delivery-channel preferences alongside existing self-service fields', () => {
    const source = read('src/app/api/drivers/[id]/route.ts')
    expect(source).toContain('auth.driverId !== id')
    expect(source).toContain('notifySMS')
    expect(source).toContain('notifyEmail')
    expect(source).toContain('notifyPush')
  })

  it('replaces the Driver Portal notification placeholder with real controls', () => {
    const source = read('src/components/driver-portal/DriverPortalProfile.tsx')
    expect(source).not.toContain('Notification settings coming soon')
    expect(source).toContain('notifySMS')
    expect(source).toContain('notifyEmail')
    expect(source).toContain('notifyPush')
    expect(source).toContain('Notification Settings')
  })

  it('makes the central dispatcher enforce driver channel preferences', () => {
    const source = read('src/lib/services/notification-dispatcher.ts')
    expect(source).toContain('notifySMS')
    expect(source).toContain('notifyEmail')
    expect(source).toContain('notifyPush')
    expect(source).toContain('driverPreferenceSuppressedChannels')
  })
})
