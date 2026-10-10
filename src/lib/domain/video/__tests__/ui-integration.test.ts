import { existsSync, readFileSync } from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'

const root = process.cwd()
const read = (file: string) => {
  const full = path.join(root, file)
  return existsSync(full) ? readFileSync(full, 'utf8') : ''
}

describe('video Control Tower UI integration', () => {
  it('exposes protected device video capabilities without credentials', () => {
    const route = read('src/app/api/video/devices/[deviceId]/capabilities/route.ts')
    expect(route).toContain('requireAuth')
    expect(route).toContain('preflightVideoRole')
    expect(route).toContain('cameraChannels')
    expect(route).toContain('videoRetentionPolicy')
    expect(route).not.toContain('credentialRef')
  })

  it('exposes a protected metadata-only incident feed', () => {
    const route = read('src/app/api/video/incidents/route.ts')
    expect(route).toContain('requireAuth')
    expect(route).toContain("preflightVideoRole(actor, 'playback')")
    expect(route).toContain('videoIncident.findMany')
    expect(route).not.toContain('credentialRef')
    expect(route).not.toContain('requestPlaybackClip')
  })

  it('adds on-demand camera and incident controls to the existing telemetry drawer without autoplay', () => {
    const drawer = read('src/components/tracking/VehicleTelemetryDrawer.tsx')
    const camera = read('src/components/video/LiveCameraDialog.tsx')
    const incidents = read('src/components/video/IncidentTimeline.tsx')

    expect(drawer).toContain('LiveCameraDialog')
    expect(drawer).toContain('IncidentTimeline')
    expect(drawer).toContain('record.deviceId')
    expect(camera).toContain('requestUiVideoSession')
    expect(camera).toContain('Start live view')
    expect(incidents).toContain('Request clip')
    expect(camera).not.toContain('autoPlay')
    expect(incidents).not.toContain('autoPlay')
  })

  it('provides a fleet-wide video incidents workspace through the hash-routed app shell', () => {
    const view = read('src/components/video/VideoIncidentsView.tsx')
    const page = read('src/app/page.tsx')
    const constants = read('src/lib/constants.ts')
    const auth = read('src/lib/store/auth.ts')

    expect(view).toContain('IncidentTimeline')
    expect(page).toContain("case 'video-incidents'")
    expect(page).toContain('VideoIncidentsView')
    expect(constants).toContain('video-incidents')
    expect(auth).toContain("'video-incidents'")
  })
})
