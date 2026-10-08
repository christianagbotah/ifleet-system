import { readFileSync } from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'

const root = process.cwd()
const read = (file: string) => readFileSync(path.join(root, file), 'utf8')

describe('device registry integration contract', () => {
  it('adds additive telematics device and installation history models without raw credential storage', () => {
    const schema = read('prisma/models/telematics.prisma')
    expect(schema).toContain('model TelematicsDevice')
    expect(schema).toContain('model DeviceInstallationHistory')
    expect(schema).toMatch(/imei\s+String\?\s+@unique/)
    expect(schema).toMatch(/serialNumber\s+String\?\s+@unique/)
    expect(schema).toContain('credentialRef')
    expect(schema).not.toMatch(/credential(Value|Secret)|apiSecret|password\s+String/i)
  })

  it('guards device writes and routes install decisions through the registry domain', () => {
    const collection = read('src/app/api/telematics/devices/route.ts')
    const item = read('src/app/api/telematics/devices/[id]/route.ts')
    expect(collection).toContain('requireWriteAccess')
    expect(collection).toContain('validateDeviceIdentity')
    expect(collection).toContain('Raw device credentials are not accepted')
    expect(item).toContain('requireWriteAccess')
    expect(item).toContain('installDevice')
    expect(item).toContain('export async function DELETE')
    expect(item).toContain("isolationLevel: 'Serializable'")
    expect(item).toMatch(/truck\.findUnique|trailer\.findUnique/)
  })

  it('exposes Device Registry through the existing hash-routed shell', () => {
    const view = read('src/components/telematics/DeviceRegistryView.tsx')
    const constants = read('src/lib/constants.ts')
    const page = read('src/app/page.tsx')
    expect(view).toContain('Device Registry')
    expect(view).toContain('/api/telematics/devices')
    expect(constants).toContain('telematics-devices')
    expect(page).toContain('DeviceRegistryView')
    expect(page).toContain("case 'telematics-devices'")
  })
})
