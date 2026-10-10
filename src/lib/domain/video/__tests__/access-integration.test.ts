import { existsSync, readFileSync } from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'

const root = process.cwd()
const read = (file: string) => {
  const full = path.join(root, file)
  return existsSync(full) ? readFileSync(full, 'utf8') : ''
}

describe('video access API integration', () => {
  it('protects live view with auth, preflight authorization, the shared broker and auditing', () => {
    const route = read('src/app/api/video/devices/[deviceId]/live/route.ts')

    expect(route).toContain('requireAuth')
    expect(route).toContain('preflightVideoRole')
    expect(route).toContain('requestAuthorizedVideoSession')
    expect(route).toContain('createVideoAccessAudit')
    expect(route).toContain('resolveVideoProvider')
    expect(route.indexOf('preflightVideoRole')).toBeLessThan(route.indexOf('db.telematicsDevice.findUnique'))
    expect(route).toContain("outcome: 'denied'")
    expect(route).toContain("outcome: 'failed'")
  })

  it('protects incident playback with the same broker and derives a bounded incident clip window', () => {
    const route = read('src/app/api/video/incidents/[incidentId]/playback/route.ts')

    expect(route).toContain('requireAuth')
    expect(route).toContain('preflightVideoRole')
    expect(route).toContain('requestAuthorizedVideoSession')
    expect(route).toContain('playbackRangeForIncident')
    expect(route).toContain('createVideoAccessAudit')
    expect(route.indexOf('preflightVideoRole')).toBeLessThan(route.indexOf('db.videoIncident.findUnique'))
    expect(route).toContain("outcome: 'denied'")
    expect(route).toContain("outcome: 'failed'")
  })

  it('records video access outcomes without persisting provider URLs or tokens', () => {
    const audit = read('src/lib/domain/video/audit.ts')

    expect(audit).toContain("action: 'access'")
    expect(audit).toContain('outcome')
    expect(audit).not.toMatch(/details:\s*\{[^}]*url/s)
    expect(audit).not.toMatch(/details:\s*\{[^}]*token/s)
  })

  it('keeps provider selection server-side and degrades unsupported video providers cleanly', () => {
    const resolver = read('src/lib/domain/video/provider-resolver.ts')

    expect(resolver).toContain('resolveVideoProvider')
    expect(resolver).toContain('GenericHttpVideoProvider')
    expect(resolver).not.toContain('credentialRef')
  })
})
