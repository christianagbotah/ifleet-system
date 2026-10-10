import { readFileSync } from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'

const root = process.cwd()
const read = (file: string) => readFileSync(path.join(root, file), 'utf8')

describe('video capability integration contract', () => {
  it('adds camera channels and retention policy additively to telematics devices', () => {
    const schema = read('prisma/models/video.prisma')
    const telematics = read('prisma/models/telematics.prisma')

    expect(schema).toContain('model CameraChannel')
    expect(schema).toContain('model VideoRetentionPolicy')
    expect(schema).toContain('privacyClass')
    expect(schema).toContain('orientation')
    expect(schema).toContain('enabled')
    expect(telematics).toContain('cameraChannels')
    expect(telematics).toContain('videoRetentionPolicy')
  })

  it('extends provider adapters with optional live, playback and snapshot methods', () => {
    const provider = read('src/lib/domain/telematics/provider.ts')

    expect(provider).toContain('requestLiveVideo?')
    expect(provider).toContain('requestPlaybackClip?')
    expect(provider).toContain('requestSnapshot?')
    expect(provider).toContain('VideoSessionDescriptor')
  })

  it('lets operators configure channel capability and privacy without storing vendor URLs', () => {
    const view = read('src/components/telematics/DeviceRegistryView.tsx')
    const api = read('src/app/api/telematics/devices/route.ts')

    expect(view).toContain('Camera channels')
    expect(view).toContain('privacyClass')
    expect(view).toContain('supportsLive')
    expect(view).toContain('supportsPlayback')
    expect(api).toContain('cameraChannels')
    expect(api).toContain('videoRetentionPolicy')
    expect(api).not.toMatch(/streamUrl|playbackUrl|vendorUrl/)
  })
})
