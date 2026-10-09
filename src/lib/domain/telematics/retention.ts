export interface RetentionEvent {
  id: string
  eventType: string
  assetType: string | null
  assetId: string | null
  tripId: string | null
  occurredAt: Date
  latitude?: number | null
  longitude?: number | null
  speedKph?: number | null
}

export interface CompactionSummary {
  key: string
  assetType: string
  assetId: string
  tripId: string | null
  bucketStart: Date
  bucketEnd: Date
  pointCount: number
  minSpeedKph: number | null
  maxSpeedKph: number | null
  startLatitude: number
  startLongitude: number
  endLatitude: number
  endLongitude: number
}

export interface CompactionPlan {
  preserveIds: string[]
  deleteIds: string[]
  summaries: CompactionSummary[]
}

function finiteNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value)
}

export function planLocationCompaction(events: RetentionEvent[], options: { bucketMinutes: number }): CompactionPlan {
  if (!Number.isInteger(options.bucketMinutes) || options.bucketMinutes <= 0) {
    throw new Error('bucketMinutes must be a positive integer')
  }

  const bucketMs = options.bucketMinutes * 60 * 1000
  const groups = new Map<string, RetentionEvent[]>()

  for (const event of events) {
    if (event.eventType !== 'location') continue
    if (!event.assetType || !event.assetId) continue
    if (!finiteNumber(event.latitude) || !finiteNumber(event.longitude)) continue
    const timestamp = event.occurredAt.getTime()
    if (!Number.isFinite(timestamp)) continue
    const bucketStartMs = Math.floor(timestamp / bucketMs) * bucketMs
    const key = [event.assetType, event.assetId, event.tripId ?? '-', bucketStartMs].join(':')
    const bucket = groups.get(key) ?? []
    bucket.push(event)
    groups.set(key, bucket)
  }

  const preserveIds: string[] = []
  const deleteIds: string[] = []
  const summaries: CompactionSummary[] = []

  for (const [key, bucket] of [...groups.entries()].sort(([a], [b]) => a.localeCompare(b))) {
    const ordered = [...bucket].sort((a, b) => a.occurredAt.getTime() - b.occurredAt.getTime())
    const first = ordered[0]
    const last = ordered[ordered.length - 1]
    preserveIds.push(first.id)
    if (last.id !== first.id) preserveIds.push(last.id)
    for (const event of ordered.slice(1, -1)) deleteIds.push(event.id)

    const speeds = ordered.map((event) => event.speedKph).filter(finiteNumber)
    summaries.push({
      key,
      assetType: first.assetType!,
      assetId: first.assetId!,
      tripId: first.tripId,
      bucketStart: new Date(Math.floor(first.occurredAt.getTime() / bucketMs) * bucketMs),
      bucketEnd: new Date(Math.floor(first.occurredAt.getTime() / bucketMs) * bucketMs + bucketMs),
      pointCount: ordered.length,
      minSpeedKph: speeds.length ? Math.min(...speeds) : null,
      maxSpeedKph: speeds.length ? Math.max(...speeds) : null,
      startLatitude: first.latitude!,
      startLongitude: first.longitude!,
      endLatitude: last.latitude!,
      endLongitude: last.longitude!,
    })
  }

  return { preserveIds, deleteIds, summaries }
}
