import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

const root = process.cwd()
const read = (path: string) => readFileSync(join(root, path), 'utf8')

describe('video telematics capability integration', () => {
  it('persists additive camera capabilities without storing reusable provider media credentials', () => {
    const schema = read('prisma/models/telematics.prisma')

    expect(schema).toContain('videoEnabled')
    expect(schema).toContain('supportsLiveVideo')
    expect(schema).toContain('supportsVideoPlayback')
    expect(schema).toContain('supportsVideoSnapshot')
    expect(schema).toContain('model CameraChannel')
    expect(schema).toContain('privacyClass')
    expect(schema).toContain('@@unique([deviceId, channelKey])')
    expect(schema).not.toMatch(/streamUrl\s+String/)
    expect(schema).not.toMatch(/playbackUrl\s+String/)
    expect(schema).not.toMatch(/providerToken\s+String/)
  })

  it('keeps vendor video operations optional behind the telematics provider abstraction', () => {
    const provider = read('src/lib/domain/telematics/provider.ts')

    expect(provider).toContain('requestLiveVideo?')
    expect(provider).toContain('requestPlaybackClip?')
    expect(provider).toContain('requestSnapshot?')
    expect(provider).toContain('expiresAt')
  })

  it('exposes video configuration in the existing hash-routed Device Registry', () => {
    const view = read('src/components/telematics/DeviceRegistryView.tsx')
    const route = read('src/app/api/telematics/devices/[id]/route.ts')

    expect(view).toContain('Camera channels')
    expect(view).toContain('privacyClass')
    expect(view).toContain('supportsLiveVideo')
    expect(route).toContain("action === 'configure-video'")
    expect(route).toContain('normalizeVideoCapabilities')
  })

  it('does not introduce a disconnected App Router telematics page', () => {
    expect(existsSync(join(root, 'src/app/(dashboard)/telematics/devices/page.tsx'))).toBe(false)
  })
})
