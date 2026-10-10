import { existsSync, readFileSync } from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'

const root = process.cwd()
const read = (file: string) => {
  const full = path.join(root, file)
  return existsSync(full) ? readFileSync(full, 'utf8') : ''
}

describe('video privacy and retention integration', () => {
  it('persists policy, managed-media retention evidence, and privacy acknowledgements additively', () => {
    const schema = read('prisma/models/video.prisma')
    expect(schema).toContain('routineRetentionDays')
    expect(schema).toContain('incidentRetentionDays')
    expect(schema).toContain('applyToExisting')
    expect(schema).toContain('cloudUploadEnabled')
    expect(schema).toContain('allowedRoles')
    expect(schema).toContain('allowedChannels')
    expect(schema).toContain('privacyNoticeVersion')
    expect(schema).toContain('model VideoMediaRecord')
    expect(schema).toContain('retentionPolicyVersion')
    expect(schema).toContain('retainUntil')
    expect(schema).toContain('legalHoldUntil')
    expect(schema).toContain('auditHoldUntil')
    expect(schema).toContain('deletedAt')
    expect(schema).toContain('model VideoPrivacyAcknowledgement')
    expect(schema).toContain('acknowledgedAt')
  })

  it('provides authenticated policy settings and acknowledgement APIs', () => {
    const settings = read('src/app/api/video/privacy/route.ts')
    const acknowledge = read('src/app/api/video/privacy/acknowledge/route.ts')
    expect(settings).toContain('requireAuth')
    expect(settings).toContain('requireWriteAccess')
    expect(settings).toContain('routineRetentionDays')
    expect(settings).toContain('allowedRoles')
    expect(settings).toContain('createAuditLog')
    expect(acknowledge).toContain('requireAuth')
    expect(acknowledge).toContain('videoPrivacyAcknowledgement')
    expect(acknowledge).toContain('policyVersion')
  })

  it('enforces stored role/channel privacy rules in both live and playback brokers', () => {
    const live = read('src/app/api/video/devices/[deviceId]/live/route.ts')
    const playback = read('src/app/api/video/incidents/[incidentId]/playback/route.ts')
    for (const source of [live, playback]) {
      expect(source).toContain('allowedRoles')
      expect(source).toContain('allowedChannels')
      expect(source).toContain('allowedChannelKeys')
    }
  })

  it('ships a safe cleanup job that defaults to dry-run and requires explicit apply mode', () => {
    const script = read('scripts/video-retention-cleanup.ts')
    expect(script).toContain("process.argv.includes('--apply')")
    expect(script).toContain('runVideoRetentionCleanup')
    expect(script).toContain('VIDEO_MEDIA_ROOT')
    expect(script).toContain('videoMediaRecord')
    expect(script).toContain('deletedAt')
    expect(script).toContain('path.resolve')
    expect(script).toContain('startsWith')
  })

  it('exposes the privacy workspace through the existing hash-routed shell', () => {
    const view = read('src/components/video/VideoPrivacySettingsView.tsx')
    const page = read('src/app/page.tsx')
    const constants = read('src/lib/constants.ts')
    const auth = read('src/lib/store/auth.ts')
    expect(view).toContain('routineRetentionDays')
    expect(view).toContain('incidentRetentionDays')
    expect(view).toContain('allowedRoles')
    expect(view).toContain('privacyNoticeVersion')
    expect(page).toContain("case 'video-privacy'")
    expect(constants).toContain('video-privacy')
    expect(auth).toContain("'video-privacy'")
  })

  it('schedules the production cleanup in apply mode after the dry-run-safe script exists', () => {
    const cron = read('crontab')
    expect(cron).toContain('video-retention-cleanup.ts --apply')
  })
})
