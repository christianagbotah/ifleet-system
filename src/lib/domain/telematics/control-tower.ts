export type ControlTowerSource = 'hardwired' | 'mdvr' | 'phone' | 'manual'

export interface ControlTowerPoint {
  id: string
  source: ControlTowerSource
  trust: string
  deviceTimestamp: Date
  receivedAt: Date
  latitude: number
  longitude: number
  speedKph?: number | null
}

const SOURCE_PRIORITY: Record<ControlTowerSource, number> = {
  hardwired: 4,
  mdvr: 3,
  phone: 2,
  manual: 1,
}

const SOURCE_FRESHNESS_MS: Record<ControlTowerSource, number> = {
  hardwired: 5 * 60 * 1000,
  mdvr: 5 * 60 * 1000,
  phone: 3 * 60 * 1000,
  manual: 10 * 60 * 1000,
}

export function selectPreferredLocation(points: ControlTowerPoint[], now: Date): ControlTowerPoint | null {
  if (points.length === 0) return null

  const fresh = points.filter((point) => {
    const age = Math.max(0, now.getTime() - point.deviceTimestamp.getTime())
    return age <= SOURCE_FRESHNESS_MS[point.source]
  })

  if (fresh.length > 0) {
    return [...fresh].sort((a, b) => {
      const priority = SOURCE_PRIORITY[b.source] - SOURCE_PRIORITY[a.source]
      if (priority !== 0) return priority
      return b.deviceTimestamp.getTime() - a.deviceTimestamp.getTime()
    })[0]
  }

  return [...points].sort((a, b) => b.deviceTimestamp.getTime() - a.deviceTimestamp.getTime())[0]
}

export function classifyLiveState(point: ControlTowerPoint, now: Date): 'online' | 'stale' | 'offline' {
  const ageMs = Math.max(0, now.getTime() - point.deviceTimestamp.getTime())
  if (ageMs <= 2 * 60 * 1000) return 'online'
  if (ageMs <= 30 * 60 * 1000) return 'stale'
  return 'offline'
}

const DRIVER_FINANCIAL_FIELDS = new Set([
  'revenue',
  'estimatedMargin',
  'margin',
  'fuelCost',
  'totalRevenue',
  'tripRevenue',
  'transportRate',
  'offeredRate',
  'haulierRate',
])

export function redactControlTowerRecord<T extends Record<string, unknown>>(record: T, roleName: string): Partial<T> {
  if (roleName === 'Admin' || roleName === 'Manager') return { ...record }

  const redacted: Record<string, unknown> = { ...record }
  for (const field of DRIVER_FINANCIAL_FIELDS) delete redacted[field]
  return redacted as Partial<T>
}

export type HistoryResolution = 'raw' | '1m' | '5m' | '15m'

export interface HistoryQuery {
  tripId: string
  from: Date
  to: Date
  resolution: HistoryResolution
  maxPoints: number
}

export function validateHistoryQuery(input: Record<string, unknown>): HistoryQuery {
  const tripId = typeof input.tripId === 'string' ? input.tripId.trim() : ''
  if (!tripId) throw new Error('tripId is required')
  if (!input.from || !input.to) throw new Error('from and to are required')

  const from = new Date(String(input.from))
  const to = new Date(String(input.to))
  if (!Number.isFinite(from.getTime()) || !Number.isFinite(to.getTime())) {
    throw new Error('from and to must be valid timestamps')
  }
  if (to <= from) throw new Error('history window must end after it starts')

  const maxWindowMs = 7 * 24 * 60 * 60 * 1000
  if (to.getTime() - from.getTime() > maxWindowMs) {
    throw new Error('history window cannot exceed 7 days')
  }

  const resolution = (input.resolution ?? '1m') as HistoryResolution
  if (!['raw', '1m', '5m', '15m'].includes(resolution)) {
    throw new Error('unsupported history resolution')
  }

  return { tripId, from, to, resolution, maxPoints: 5000 }
}
