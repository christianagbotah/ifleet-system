import fs from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'

const root = process.cwd()
const read = (file: string) => {
  const full = path.join(root, file)
  return fs.existsSync(full) ? fs.readFileSync(full, 'utf8') : ''
}

describe('telematics health and retention integration contract', () => {
  it('persists idempotent compaction summaries with useful replay indexes', () => {
    const schema = read('prisma/models/telematics.prisma')
    expect(schema).toContain('model TelematicsHistorySummary')
    expect(schema).toContain('idempotencyKey')
    expect(schema).toContain('@unique')
    expect(schema).toMatch(/@@index\(\[assetType, assetId, bucketStart\]\)/)
    expect(schema).toMatch(/@@index\(\[tripId, bucketStart\]\)/)
  })

  it('exposes device health only through an authenticated management route', () => {
    const route = read('src/app/api/telematics/health/route.ts')
    expect(route).toContain('requireRole')
    expect(route).toContain('ROLES.ADMIN')
    expect(route).toContain('ROLES.MANAGER')
    expect(route).toContain('computeDeviceHealth')
  })

  it('keeps dry-run mode write-free and commits summaries before location deletion', () => {
    const script = read('scripts/compact-location-history.ts')
    expect(script).toContain("--dry-run")
    expect(script).toContain('planLocationCompaction')
    expect(script).toContain('db.$transaction')
    expect(script).toContain('telematicsHistorySummary.upsert')
    expect(script).toContain('telematicsEvent.deleteMany')
    expect(script.indexOf('telematicsHistorySummary.upsert')).toBeLessThan(script.indexOf('telematicsEvent.deleteMany'))
  })

  it('schedules bounded periodic compaction from the deployed application path', () => {
    const cron = read('crontab')
    expect(cron).toContain('/home/lightworld/webapps/ifleetpro')
    expect(cron).toContain('.next/standalone/scripts/compact-location-history.ts')
  })
})
