import { db } from '@/lib/db'
import { evaluateTripDispatchClearance } from '@/lib/domain/dispatch/trip-clearance'

import type { TripAdvisoryFacts, TripAdvisoryRepository } from './trip-advisory'

function percentile90(values: number[]): number | null {
  const finite = values.filter(Number.isFinite).sort((a, b) => a - b)
  if (finite.length === 0) return null
  const index = Math.max(0, Math.ceil(finite.length * 0.9) - 1)
  return finite[index]
}

export class PrismaTripAdvisoryRepository implements TripAdvisoryRepository {
  async loadFacts(tripId: string): Promise<TripAdvisoryFacts | null> {
    const trip = await db.trip.findUnique({
      where: { id: tripId },
      select: {
        id: true,
        driverId: true,
        truckId: true,
        trailerId: true,
        status: true,
        estimatedDuration: true,
        loadingLat: true,
        loadingLng: true,
        destLat: true,
        destLng: true,
        loadingCityId: true,
        destinationCityId: true,
        loadingLocation: true,
        destination: true,
        startMileage: true,
        driver: {
          select: {
            licenseExpiry: true,
            ghanaCardExpiry: true,
          },
        },
        truck: {
          select: {
            currentMileage: true,
            Insurance: {
              select: { endDate: true },
              orderBy: { endDate: 'desc' },
              take: 1,
            },
            RoadworthyInspection: {
              select: { certificateExpiry: true },
              orderBy: { inspectionDate: 'desc' },
              take: 1,
            },
          },
        },
        trailer: {
          select: {
            registrationExpiry: true,
            roadworthyExpiry: true,
          },
        },
      },
    })
    if (!trip) return null

    const [liveState, queue, weighings, similarTrips, clearance] = await Promise.all([
      db.vehicleLiveState.findUnique({
        where: { assetType_assetId: { assetType: 'tractor', assetId: trip.truckId } },
        select: {
          source: true,
          deviceTimestamp: true,
          receivedAt: true,
          latitude: true,
          longitude: true,
          speedKph: true,
        },
      }),
      db.factoryQueueEntry.findFirst({
        where: {
          tripId,
          status: { in: ['waiting', 'in_progress', 'loading', 'unloading'] },
        },
        orderBy: [{ joinedAt: 'desc' }, { createdAt: 'desc' }],
        select: {
          siteId: true,
          queueType: true,
          joinedAt: true,
          estimatedWait: true,
          detentionFreeMinutes: true,
        },
      }),
      db.weighingEvent.findMany({
        where: { tripId },
        orderBy: [{ recordedAt: 'desc' }, { createdAt: 'desc' }],
        select: {
          id: true,
          grossWeightKg: true,
          tareWeightKg: true,
          recordedAt: true,
          supersedesEventId: true,
        },
        take: 20,
      }),
      db.trip.findMany({
        where: {
          id: { not: trip.id },
          status: 'completed',
          actualDuration: { not: null },
          ...(trip.loadingCityId && trip.destinationCityId
            ? {
                loadingCityId: trip.loadingCityId,
                destinationCityId: trip.destinationCityId,
              }
            : {
                loadingLocation: trip.loadingLocation,
                destination: trip.destination,
              }),
        },
        select: { actualDuration: true },
        orderBy: { arrivalTime: 'desc' },
        take: 20,
      }),
      evaluateTripDispatchClearance(tripId),
    ])

    const queueHistory = queue
      ? await db.factoryQueueEntry.findMany({
          where: {
            siteId: queue.siteId,
            queueType: queue.queueType,
            status: 'completed',
            actualWait: { not: null },
          },
          select: { actualWait: true },
          orderBy: { completedAt: 'desc' },
          take: 50,
        })
      : []

    const supersededIds = new Set(
      weighings.map((event) => event.supersedesEventId).filter((id): id is string => Boolean(id)),
    )
    const effectiveWeight = weighings.find((event) =>
      !supersededIds.has(event.id)
      && event.grossWeightKg != null
      && event.tareWeightKg != null,
    ) ?? null

    const historyMinutes = similarTrips
      .map((item) => item.actualDuration == null ? null : item.actualDuration * 60)
      .filter((value): value is number => value != null && Number.isFinite(value) && value >= 0)
    const routeHistory = historyMinutes.length > 0
      ? {
          averageTripMinutes: historyMinutes.reduce((sum, value) => sum + value, 0) / historyMinutes.length,
          sampleCount: historyMinutes.length,
        }
      : null

    const complianceCheck = clearance.checks.find((check) => check.key === 'compliance')
    const documents: TripAdvisoryFacts['documents'] = []
    documents.push({ type: 'driver_license', expiresAt: trip.driver.licenseExpiry })
    if (trip.driver.ghanaCardExpiry) documents.push({ type: 'ghana_card', expiresAt: trip.driver.ghanaCardExpiry })
    const insuranceExpiry = trip.truck.Insurance[0]?.endDate
    if (insuranceExpiry) documents.push({ type: 'insurance', expiresAt: insuranceExpiry })
    const roadworthyExpiry = trip.truck.RoadworthyInspection[0]?.certificateExpiry
    if (roadworthyExpiry) documents.push({ type: 'roadworthy', expiresAt: roadworthyExpiry })
    if (trip.trailer?.registrationExpiry) documents.push({ type: 'trailer_registration', expiresAt: trip.trailer.registrationExpiry })
    if (trip.trailer?.roadworthyExpiry) documents.push({ type: 'trailer_roadworthy', expiresAt: trip.trailer.roadworthyExpiry })

    return {
      tripId: trip.id,
      driverId: trip.driverId,
      status: trip.status,
      estimatedDurationMinutes: trip.estimatedDuration == null ? null : trip.estimatedDuration * 60,
      destination: trip.destLat != null && trip.destLng != null
        ? { latitude: trip.destLat, longitude: trip.destLng }
        : null,
      loading: trip.loadingLat != null && trip.loadingLng != null
        ? { latitude: trip.loadingLat, longitude: trip.loadingLng }
        : null,
      liveState: liveState ? {
        source: liveState.source,
        observedAt: liveState.receivedAt,
        latitude: liveState.latitude,
        longitude: liveState.longitude,
        speedKph: liveState.speedKph,
      } : null,
      routeHistory,
      queue: queue ? {
        joinedAt: queue.joinedAt,
        estimatedWaitMinutes: queue.estimatedWait,
        historicalP90Minutes: percentile90(
          queueHistory.map((entry) => entry.actualWait).filter((value): value is number => value != null),
        ),
        detentionFreeMinutes: queue.detentionFreeMinutes,
      } : null,
      weight: effectiveWeight ? {
        grossKg: effectiveWeight.grossWeightKg,
        tareKg: effectiveWeight.tareWeightKg,
        observedAt: effectiveWeight.recordedAt,
      } : null,
      fuel: null,
      manualOdometerKm: trip.startMileage ?? trip.truck.currentMileage,
      documents,
      activeComplianceHold: trip.status === 'exception_hold',
      blockingComplianceRules: complianceCheck?.blocking.length ?? 0,
      warningComplianceRules: complianceCheck?.warnings.length ?? 0,
    }
  }
}
