import { rm } from 'node:fs/promises'
import path from 'node:path'

import { db } from '../src/lib/db'
import { runVideoRetentionCleanup, type CleanupMediaRecord } from '../src/lib/domain/video/retention-cleanup'
import type { VideoRetentionPolicyInput } from '../src/lib/domain/video/retention'

const apply = process.argv.includes('--apply')
const mediaRoot = path.resolve(process.env.VIDEO_MEDIA_ROOT || '/home/lightworld/data/ifleetpro-video')

function managedPath(record: CleanupMediaRecord): string {
  if (record.storageBackend !== 'local') throw new Error(`Unsupported managed storage backend: ${record.storageBackend}`)
  const resolved = path.resolve(mediaRoot, record.storageKey)
  const prefix = `${mediaRoot}${path.sep}`
  if (resolved !== mediaRoot && !resolved.startsWith(prefix)) throw new Error('Media path escapes VIDEO_MEDIA_ROOT')
  return resolved
}

async function main() {
  const now = new Date()
  const rows = await db.videoMediaRecord.findMany({
    where: { deletedAt: null },
    include: { device: { include: { videoRetentionPolicy: true } } },
    orderBy: { retainUntil: 'asc' },
    take: 5000,
  })

  const policies = new Map<string, VideoRetentionPolicyInput>()
  const records: CleanupMediaRecord[] = rows.map((row) => {
    const policy = row.device.videoRetentionPolicy
    if (!policy) throw new Error(`Video retention policy missing for device ${row.deviceId}`)
    policies.set(row.deviceId, {
      version: policy.policyVersion,
      effectiveAt: policy.effectiveAt,
      routineRetentionDays: policy.routineRetentionDays,
      incidentRetentionDays: policy.incidentRetentionDays,
      applyToExisting: policy.applyToExisting,
    })
    return {
      id: row.id,
      kind: row.kind === 'incident' ? 'incident' : 'routine',
      recordedAt: row.recordedAt,
      storageKind: row.storageKind === 'cloud_copy' ? 'cloud_copy' : 'provider_only',
      storageBackend: row.storageBackend,
      storageKey: row.storageKey,
      deletedAt: row.deletedAt,
      legalHoldUntil: row.legalHoldUntil,
      auditHoldUntil: row.auditHoldUntil,
      retentionPolicyVersion: row.retentionPolicyVersion,
      retainUntil: row.retainUntil,
      deviceId: row.deviceId,
    } as CleanupMediaRecord & { deviceId: string }
  })

  const summary = await runVideoRetentionCleanup({
    records,
    now,
    dryRun: !apply,
    resolvePolicy: async (record) => {
      const deviceId = (record as CleanupMediaRecord & { deviceId: string }).deviceId
      const policy = policies.get(deviceId)
      if (!policy) throw new Error(`Policy missing for media ${record.id}`)
      return policy
    },
    deleteMedia: async (record) => {
      if (record.storageKind !== 'cloud_copy') return
      await rm(managedPath(record), { force: true })
    },
    markDeleted: async (id, deletedAt) => {
      await db.videoMediaRecord.update({
        where: { id },
        data: { deletedAt, deletionReason: 'retention_expired' },
      })
    },
  })

  console.log(JSON.stringify({ mode: apply ? 'apply' : 'dry-run', mediaRoot, ...summary }))
  if (apply && summary.failed > 0) process.exitCode = 1
}

main()
  .catch((error) => {
    console.error('[Video Retention Cleanup] Failed:', error instanceof Error ? error.message : error)
    process.exitCode = 1
  })
  .finally(async () => {
    await db.$disconnect()
  })
