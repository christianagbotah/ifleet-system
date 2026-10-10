import { evaluateVideoRetention, type VideoRetentionPolicyInput, type VideoRetentionRecord } from './retention'

export interface CleanupMediaRecord extends VideoRetentionRecord {
  storageBackend: string
  storageKey: string
}

export interface VideoRetentionCleanupSummary {
  scanned: number
  wouldDelete: number
  deleted: number
  skipped: number
  failed: number
}

export async function runVideoRetentionCleanup(input: {
  records: CleanupMediaRecord[]
  now: Date
  dryRun: boolean
  resolvePolicy: (record: CleanupMediaRecord) => Promise<VideoRetentionPolicyInput>
  deleteMedia: (record: CleanupMediaRecord) => Promise<void>
  markDeleted: (id: string, deletedAt: Date) => Promise<void>
}): Promise<VideoRetentionCleanupSummary> {
  const summary: VideoRetentionCleanupSummary = {
    scanned: 0,
    wouldDelete: 0,
    deleted: 0,
    skipped: 0,
    failed: 0,
  }

  for (const record of input.records) {
    summary.scanned += 1
    const policy = await input.resolvePolicy(record)
    const decision = evaluateVideoRetention(record, policy, input.now)

    if (decision.action !== 'delete') {
      summary.skipped += 1
      continue
    }

    if (input.dryRun) {
      summary.wouldDelete += 1
      continue
    }

    try {
      await input.deleteMedia(record)
      await input.markDeleted(record.id, input.now)
      summary.deleted += 1
    } catch {
      summary.failed += 1
    }
  }

  return summary
}
