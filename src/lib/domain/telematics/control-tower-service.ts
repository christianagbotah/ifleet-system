import {
  classifyLiveState,
  redactControlTowerRecord,
  selectPreferredLocation,
  validateHistoryQuery,
  type ControlTowerPoint,
  type HistoryResolution,
} from './control-tower'

export interface ControlTowerCandidate extends ControlTowerPoint {
  assetType: string
  assetId: string
  deviceId: string | null
  tripId: string | null
  provider: string
  headingDeg?: number | null
  accuracyMeters?: number | null
  ignitionOn?: boolean | null
}

export interface ControlTowerAssetContext {
  assetType: string
  assetId: string
  label: string
  driverName: string | null
  tripId: string | null
  tripNumber: string | null
  tripStatus: string | null
  destination: string | null
  revenue?: number | null
  fuelCost?: number | null
}

export interface ControlTowerRepository {
  listLatestSnapshots(): Promise<ControlTowerCandidate[]>
  listRecentLocationCandidates(since: Date): Promise<ControlTowerCandidate[]>
  loadAssetContexts(keys: Array<{ assetType: string; assetId: string }>): Promise<ControlTowerAssetContext[]>
  listTripLocationHistory(tripId: string, from: Date, to: Date): Promise<ControlTowerCandidate[]>
}

function assetKey(assetType: string, assetId: string): string {
  return `${assetType}:${assetId}`
}

export async function loadControlTowerLive(
  repository: ControlTowerRepository,
  options: { now: Date; roleName: string },
): Promise<Array<Record<string, unknown>>> {
  const lookbackStart = new Date(options.now.getTime() - 30 * 60 * 1000)
  const [snapshots, recent] = await Promise.all([
    repository.listLatestSnapshots(),
    repository.listRecentLocationCandidates(lookbackStart),
  ])

  const snapshotByAsset = new Map(snapshots.map((item) => [assetKey(item.assetType, item.assetId), item]))
  const recentByAsset = new Map<string, ControlTowerCandidate[]>()
  for (const item of recent) {
    const key = assetKey(item.assetType, item.assetId)
    const bucket = recentByAsset.get(key) ?? []
    bucket.push(item)
    recentByAsset.set(key, bucket)
  }

  const keys = new Map<string, { assetType: string; assetId: string }>()
  for (const item of [...snapshots, ...recent]) {
    keys.set(assetKey(item.assetType, item.assetId), { assetType: item.assetType, assetId: item.assetId })
  }

  const contexts = await repository.loadAssetContexts([...keys.values()])
  const contextByAsset = new Map(contexts.map((item) => [assetKey(item.assetType, item.assetId), item]))
  const records: Array<Record<string, unknown>> = []

  for (const [key, identity] of keys) {
    const candidates = recentByAsset.get(key) ?? []
    const selected = selectPreferredLocation(candidates, options.now) ?? snapshotByAsset.get(key) ?? null
    if (!selected) continue

    const context = contextByAsset.get(key)
    const record: Record<string, unknown> = {
      assetType: identity.assetType,
      assetId: identity.assetId,
      label: context?.label ?? identity.assetId,
      driverName: context?.driverName ?? null,
      tripId: context?.tripId ?? selected.tripId,
      tripNumber: context?.tripNumber ?? null,
      tripStatus: context?.tripStatus ?? null,
      destination: context?.destination ?? null,
      revenue: context?.revenue ?? null,
      fuelCost: context?.fuelCost ?? null,
      latitude: selected.latitude,
      longitude: selected.longitude,
      speedKph: selected.speedKph ?? null,
      headingDeg: selected.headingDeg ?? null,
      accuracyMeters: selected.accuracyMeters ?? null,
      ignitionOn: selected.ignitionOn ?? null,
      source: selected.source,
      trust: selected.trust,
      provider: selected.provider,
      deviceId: selected.deviceId,
      deviceTimestamp: selected.deviceTimestamp,
      receivedAt: selected.receivedAt,
      connectionState: classifyLiveState(selected, options.now),
    }

    records.push(redactControlTowerRecord(record, options.roleName) as Record<string, unknown>)
  }

  return records.sort((a, b) => String(a.label).localeCompare(String(b.label)))
}

function resolutionMs(resolution: HistoryResolution): number {
  switch (resolution) {
    case '1m': return 60_000
    case '5m': return 5 * 60_000
    case '15m': return 15 * 60_000
    default: return 0
  }
}

function downsample(points: ControlTowerCandidate[], resolution: HistoryResolution): ControlTowerCandidate[] {
  const ordered = [...points].sort((a, b) => a.deviceTimestamp.getTime() - b.deviceTimestamp.getTime())
  const bucketMs = resolutionMs(resolution)
  if (bucketMs === 0) return ordered

  const buckets = new Map<number, ControlTowerCandidate>()
  for (const point of ordered) {
    const bucket = Math.floor(point.deviceTimestamp.getTime() / bucketMs)
    if (!buckets.has(bucket)) buckets.set(bucket, point)
  }
  return [...buckets.values()]
}

function capPoints(points: ControlTowerCandidate[], maxPoints: number): ControlTowerCandidate[] {
  if (points.length <= maxPoints) return points
  if (maxPoints <= 2) return [points[0], points[points.length - 1]].slice(0, maxPoints)

  const result: ControlTowerCandidate[] = []
  const lastIndex = points.length - 1
  for (let index = 0; index < maxPoints; index += 1) {
    const sourceIndex = Math.round((index * lastIndex) / (maxPoints - 1))
    result.push(points[sourceIndex])
  }
  return result
}

export async function loadControlTowerHistory(
  repository: ControlTowerRepository,
  input: Record<string, unknown>,
): Promise<{ tripId: string; resolution: HistoryResolution; points: ControlTowerCandidate[] }> {
  const query = validateHistoryQuery(input)
  const raw = await repository.listTripLocationHistory(query.tripId, query.from, query.to)
  const points = capPoints(downsample(raw, query.resolution), query.maxPoints)
  return { tripId: query.tripId, resolution: query.resolution, points }
}
