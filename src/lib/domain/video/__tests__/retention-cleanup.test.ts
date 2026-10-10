import { describe, expect, it } from 'vitest'

import { runVideoRetentionCleanup, type CleanupMediaRecord } from '../retention-cleanup'
import type { VideoRetentionPolicyInput } from '../retention'

const policy: VideoRetentionPolicyInput = {
  version: 1,
  effectiveAt: new Date('2026-10-01T00:00:00Z'),
  routineRetentionDays: 7,
  incidentRetentionDays: 30,
  applyToExisting: false,
}

function expired(id = 'media-1'): CleanupMediaRecord {
  return {
    id,
    kind: 'routine',
    recordedAt: new Date('2026-10-01T00:00:00Z'),
    storageKind: 'cloud_copy',
    storageBackend: 'local',
    storageKey: `clips/${id}.mp4`,
    deletedAt: null,
    legalHoldUntil: null,
    auditHoldUntil: null,
    retentionPolicyVersion: 1,
    retainUntil: new Date('2026-10-08T00:00:00Z'),
  }
}

describe('video retention cleanup executor', () => {
  it('reports expired media in dry-run mode without deleting or marking it', async () => {
    const deleted: string[] = []
    const marked: string[] = []

    const summary = await runVideoRetentionCleanup({
      records: [expired()],
      now: new Date('2026-10-10T00:00:00Z'),
      dryRun: true,
      resolvePolicy: async () => policy,
      deleteMedia: async (record) => { deleted.push(record.id) },
      markDeleted: async (id) => { marked.push(id) },
    })

    expect(summary).toMatchObject({ scanned: 1, wouldDelete: 1, deleted: 0, failed: 0 })
    expect(deleted).toEqual([])
    expect(marked).toEqual([])
  })

  it('deletes and marks expired media exactly once in apply mode', async () => {
    const deleted: string[] = []
    const marked: string[] = []

    const summary = await runVideoRetentionCleanup({
      records: [expired()],
      now: new Date('2026-10-10T00:00:00Z'),
      dryRun: false,
      resolvePolicy: async () => policy,
      deleteMedia: async (record) => { deleted.push(record.id) },
      markDeleted: async (id) => { marked.push(id) },
    })

    expect(summary).toMatchObject({ scanned: 1, wouldDelete: 0, deleted: 1, failed: 0 })
    expect(deleted).toEqual(['media-1'])
    expect(marked).toEqual(['media-1'])
  })

  it('does not call the deleter for already-deleted media', async () => {
    const deleted: string[] = []
    const record = expired()
    record.deletedAt = new Date('2026-10-09T00:00:00Z')

    const summary = await runVideoRetentionCleanup({
      records: [record],
      now: new Date('2026-10-10T00:00:00Z'),
      dryRun: false,
      resolvePolicy: async () => policy,
      deleteMedia: async (item) => { deleted.push(item.id) },
      markDeleted: async () => undefined,
    })

    expect(summary).toMatchObject({ scanned: 1, deleted: 0, skipped: 1, failed: 0 })
    expect(deleted).toEqual([])
  })

  it('leaves a failed deletion unmarked so a later cleanup can retry it', async () => {
    const marked: string[] = []

    const summary = await runVideoRetentionCleanup({
      records: [expired()],
      now: new Date('2026-10-10T00:00:00Z'),
      dryRun: false,
      resolvePolicy: async () => policy,
      deleteMedia: async () => { throw new Error('storage unavailable') },
      markDeleted: async (id) => { marked.push(id) },
    })

    expect(summary).toMatchObject({ scanned: 1, deleted: 0, failed: 1 })
    expect(marked).toEqual([])
  })
})
