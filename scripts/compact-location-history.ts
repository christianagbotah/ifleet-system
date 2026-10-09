import { db } from '../src/lib/db'
import { planLocationCompaction } from '../src/lib/domain/telematics/retention'

type Options = {
  dryRun: boolean
  retentionDays: number
  bucketMinutes: number
  batchSize: number
}

function positiveInt(value: string | undefined, fallback: number, name: string): number {
  const parsed = Number.parseInt(value ?? '', 10)
  const result = Number.isInteger(parsed) && parsed > 0 ? parsed : fallback
  if (!Number.isInteger(result) || result <= 0) throw new Error(`${name} must be a positive integer`)
  return result
}

function readArg(name: string): string | undefined {
  const prefix = `${name}=`
  const direct = process.argv.find((arg) => arg.startsWith(prefix))
  if (direct) return direct.slice(prefix.length)
  const index = process.argv.indexOf(name)
  return index >= 0 ? process.argv[index + 1] : undefined
}

function options(): Options {
  return {
    dryRun: process.argv.includes('--dry-run'),
    retentionDays: positiveInt(
      readArg('--retention-days') ?? process.env.TELEMATICS_RETENTION_DAYS,
      30,
      'retentionDays',
    ),
    bucketMinutes: positiveInt(
      readArg('--bucket-minutes') ?? process.env.TELEMATICS_COMPACTION_BUCKET_MINUTES,
      15,
      'bucketMinutes',
    ),
    batchSize: positiveInt(
      readArg('--batch-size') ?? process.env.TELEMATICS_COMPACTION_BATCH_SIZE,
      5000,
      'batchSize',
    ),
  }
}

function chunks<T>(items: T[], size: number): T[][] {
  const result: T[][] = []
  for (let i = 0; i < items.length; i += size) result.push(items.slice(i, i + size))
  return result
}

async function main() {
  const config = options()
  const cutoff = new Date(Date.now() - config.retentionDays * 24 * 60 * 60 * 1000)

  const events = await db.telematicsEvent.findMany({
    where: {
      eventType: 'location',
      deviceTimestamp: { lt: cutoff },
      assetType: { not: null },
      assetId: { not: null },
      latitude: { not: null },
      longitude: { not: null },
    },
    orderBy: { deviceTimestamp: 'asc' },
    take: config.batchSize,
    select: {
      id: true,
      eventType: true,
      assetType: true,
      assetId: true,
      tripId: true,
      deviceTimestamp: true,
      latitude: true,
      longitude: true,
      speedKph: true,
    },
  })

  const plan = planLocationCompaction(
    events.map((event) => ({
      id: event.id,
      eventType: event.eventType,
      assetType: event.assetType,
      assetId: event.assetId,
      tripId: event.tripId,
      occurredAt: event.deviceTimestamp,
      latitude: event.latitude,
      longitude: event.longitude,
      speedKph: event.speedKph,
    })),
    { bucketMinutes: config.bucketMinutes },
  )

  console.log(JSON.stringify({
    dryRun: config.dryRun,
    cutoff: cutoff.toISOString(),
    scanned: events.length,
    summaries: plan.summaries.length,
    preserved: plan.preserveIds.length,
    eligibleForDeletion: plan.deleteIds.length,
  }))

  if (config.dryRun || events.length === 0) return

  await db.$transaction(async (tx) => {
    for (const summary of plan.summaries) {
      const idempotencyKey = `v1:${config.bucketMinutes}:${summary.key}`
      await tx.telematicsHistorySummary.upsert({
        where: { idempotencyKey },
        update: {},
        create: {
          idempotencyKey,
          assetType: summary.assetType,
          assetId: summary.assetId,
          tripId: summary.tripId,
          bucketStart: summary.bucketStart,
          bucketEnd: summary.bucketEnd,
          bucketMinutes: config.bucketMinutes,
          pointCount: summary.pointCount,
          minSpeedKph: summary.minSpeedKph,
          maxSpeedKph: summary.maxSpeedKph,
          startLatitude: summary.startLatitude,
          startLongitude: summary.startLongitude,
          endLatitude: summary.endLatitude,
          endLongitude: summary.endLongitude,
        },
      })
    }

    for (const ids of chunks(plan.deleteIds, 500)) {
      if (ids.length === 0) continue
      await tx.telematicsEvent.deleteMany({
        where: {
          id: { in: ids },
          eventType: 'location',
        },
      })
    }
  })
}

main()
  .catch((error) => {
    console.error('[Telematics Compaction] Failed:', error instanceof Error ? error.message : error)
    process.exitCode = 1
  })
  .finally(async () => {
    await db.$disconnect()
  })
