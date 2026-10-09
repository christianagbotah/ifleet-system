import { db } from '@/lib/db'
import { TripStatus } from '@/generated/enums'

import type {
  ControlTowerAssetContext,
  ControlTowerCandidate,
  ControlTowerRepository,
} from './control-tower-service'
import type { ControlTowerSource } from './control-tower'

type RecentRow = {
  id: string
  assetType: string
  assetId: string
  deviceId: string | null
  tripId: string | null
  provider: string
  source: string
  trust: string
  deviceTimestamp: Date
  receivedAt: Date
  latitude: number
  longitude: number
  speedKph: number | null
  headingDeg: number | null
  accuracyMeters: number | null
  ignitionOn: boolean | null
}

function candidate(row: RecentRow): ControlTowerCandidate {
  return {
    ...row,
    source: row.source as ControlTowerSource,
  }
}

const TERMINAL_TRIP_STATUSES: TripStatus[] = [
  TripStatus.completed,
  TripStatus.cancelled,
]

export class PrismaControlTowerRepository implements ControlTowerRepository {
  async listLatestSnapshots(): Promise<ControlTowerCandidate[]> {
    const rows = await db.vehicleLiveState.findMany({
      where: {
        latitude: { not: null },
        longitude: { not: null },
      },
    })

    return rows.map((row) => candidate({
      id: row.latestEventId,
      assetType: row.assetType,
      assetId: row.assetId,
      deviceId: row.deviceId,
      tripId: row.tripId,
      provider: row.provider,
      source: row.source,
      trust: row.trust,
      deviceTimestamp: row.deviceTimestamp,
      receivedAt: row.receivedAt,
      latitude: row.latitude!,
      longitude: row.longitude!,
      speedKph: row.speedKph,
      headingDeg: row.headingDeg,
      accuracyMeters: row.accuracyMeters,
      ignitionOn: row.ignitionOn,
    }))
  }

  async listRecentLocationCandidates(since: Date): Promise<ControlTowerCandidate[]> {
    const rows = await db.$queryRaw<RecentRow[]>`
      SELECT id, assetType, assetId, deviceId, tripId, provider, source, trust,
             deviceTimestamp, receivedAt, latitude, longitude, speedKph,
             headingDeg, accuracyMeters, ignitionOn
      FROM (
        SELECT id, assetType, assetId, deviceId, tripId, provider, source, trust,
               deviceTimestamp, receivedAt, latitude, longitude, speedKph,
               headingDeg, accuracyMeters, ignitionOn,
               ROW_NUMBER() OVER (
                 PARTITION BY assetType, assetId, source
                 ORDER BY receivedAt DESC, deviceTimestamp DESC
               ) AS row_num
        FROM TelematicsEvent
        WHERE eventType = 'location'
          AND receivedAt >= ${since}
          AND assetType IS NOT NULL
          AND assetId IS NOT NULL
          AND latitude IS NOT NULL
          AND longitude IS NOT NULL
      ) ranked
      WHERE row_num = 1
    `

    return rows.map(candidate)
  }

  async loadAssetContexts(keys: Array<{ assetType: string; assetId: string }>): Promise<ControlTowerAssetContext[]> {
    if (keys.length === 0) return []

    const tractorIds = keys.filter((key) => key.assetType === 'tractor').map((key) => key.assetId)
    const trailerIds = keys.filter((key) => key.assetType === 'trailer').map((key) => key.assetId)

    const [trucks, trailers, trips] = await Promise.all([
      tractorIds.length
        ? db.truck.findMany({
            where: { id: { in: tractorIds } },
            select: {
              id: true,
              plateNumber: true,
              driver: { select: { firstName: true, lastName: true } },
            },
          })
        : Promise.resolve([]),
      trailerIds.length
        ? db.trailer.findMany({
            where: { id: { in: trailerIds } },
            select: { id: true, plateNumber: true },
          })
        : Promise.resolve([]),
      (tractorIds.length || trailerIds.length)
        ? db.trip.findMany({
            where: {
              status: { notIn: TERMINAL_TRIP_STATUSES },
              OR: [
                ...(tractorIds.length ? [{ truckId: { in: tractorIds } }] : []),
                ...(trailerIds.length ? [{ trailerId: { in: trailerIds } }] : []),
              ],
            },
            orderBy: { departureTime: 'desc' },
            select: {
              id: true,
              tripNumber: true,
              truckId: true,
              trailerId: true,
              status: true,
              destination: true,
              totalRevenue: true,
              fuelCost: true,
              driver: { select: { firstName: true, lastName: true } },
            },
          })
        : Promise.resolve([]),
    ])

    const tripByTractor = new Map<string, (typeof trips)[number]>()
    const tripByTrailer = new Map<string, (typeof trips)[number]>()
    for (const trip of trips) {
      if (!tripByTractor.has(trip.truckId)) tripByTractor.set(trip.truckId, trip)
      if (trip.trailerId && !tripByTrailer.has(trip.trailerId)) tripByTrailer.set(trip.trailerId, trip)
    }

    const contexts: ControlTowerAssetContext[] = []
    for (const truck of trucks) {
      const trip = tripByTractor.get(truck.id)
      contexts.push({
        assetType: 'tractor',
        assetId: truck.id,
        label: truck.plateNumber,
        driverName: trip?.driver
          ? `${trip.driver.firstName} ${trip.driver.lastName}`
          : truck.driver
            ? `${truck.driver.firstName} ${truck.driver.lastName}`
            : null,
        tripId: trip?.id ?? null,
        tripNumber: trip?.tripNumber ?? null,
        tripStatus: trip?.status ?? null,
        destination: trip?.destination ?? null,
        revenue: trip?.totalRevenue == null ? null : Number(trip.totalRevenue),
        fuelCost: trip?.fuelCost == null ? null : Number(trip.fuelCost),
      })
    }

    for (const trailer of trailers) {
      const trip = tripByTrailer.get(trailer.id)
      contexts.push({
        assetType: 'trailer',
        assetId: trailer.id,
        label: trailer.plateNumber,
        driverName: trip?.driver ? `${trip.driver.firstName} ${trip.driver.lastName}` : null,
        tripId: trip?.id ?? null,
        tripNumber: trip?.tripNumber ?? null,
        tripStatus: trip?.status ?? null,
        destination: trip?.destination ?? null,
        revenue: trip?.totalRevenue == null ? null : Number(trip.totalRevenue),
        fuelCost: trip?.fuelCost == null ? null : Number(trip.fuelCost),
      })
    }

    return contexts
  }

  async listTripLocationHistory(tripId: string, from: Date, to: Date): Promise<ControlTowerCandidate[]> {
    const rows = await db.telematicsEvent.findMany({
      where: {
        tripId,
        eventType: 'location',
        deviceTimestamp: { gte: from, lte: to },
        assetType: { not: null },
        assetId: { not: null },
        latitude: { not: null },
        longitude: { not: null },
      },
      orderBy: [{ deviceTimestamp: 'asc' }, { receivedAt: 'asc' }],
      take: 75_000,
      select: {
        id: true,
        assetType: true,
        assetId: true,
        deviceId: true,
        tripId: true,
        provider: true,
        source: true,
        trust: true,
        deviceTimestamp: true,
        receivedAt: true,
        latitude: true,
        longitude: true,
        speedKph: true,
        headingDeg: true,
        accuracyMeters: true,
        ignitionOn: true,
      },
    })

    return rows.map((row) => candidate({
      ...row,
      assetType: row.assetType!,
      assetId: row.assetId!,
      latitude: row.latitude!,
      longitude: row.longitude!,
    }))
  }
}
