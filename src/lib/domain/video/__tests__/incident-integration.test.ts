import { existsSync, readFileSync } from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'

const root = process.cwd()
const read = (file: string) => {
  const full = path.join(root, file)
  return existsSync(full) ? readFileSync(full, 'utf8') : ''
}

describe('video incident integration contract', () => {
  it('stores immutable normalized alarm events and one incident per dedupe key', () => {
    const schema = read('prisma/models/video.prisma')

    expect(schema).toContain('model VideoAlarmEvent')
    expect(schema).toContain('model VideoIncident')
    expect(schema).toMatch(/dedupeKey\s+String\s+@unique/)
    expect(schema).toMatch(/alarmEventId\s+String\s+@unique/)
    expect(schema).toContain('providerAlarmCode')
    expect(schema).toContain('tripId')
    expect(schema).toContain('latitude')
    expect(schema).toContain('longitude')
  })

  it('uses machine auth and Phase 3 device/install/trip resolution before incident persistence', () => {
    const route = read('src/app/api/video/ingest/[provider]/route.ts')

    expect(route).toContain('verifyMachineRequest')
    expect(route).toContain('PrismaTelematicsIngestRepository')
    expect(route).toContain('resolveInstallation')
    expect(route).toContain('resolveTrip')
    expect(route).toContain('normalizeVideoAlarm')
    expect(route).toContain('persistVideoIncident')
  })

  it('persists through a dedicated repository with a unique dedupe boundary', () => {
    const repository = read('src/lib/domain/video/prisma-incident-repository.ts')

    expect(repository).toContain('class PrismaVideoIncidentRepository')
    expect(repository).toContain('videoAlarmEvent')
    expect(repository).toContain('videoIncident')
    expect(repository).toContain("isolationLevel: 'Serializable'")
  })
})
