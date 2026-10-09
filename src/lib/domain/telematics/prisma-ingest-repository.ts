import { db } from '@/lib/db'
import { TripStatus } from '@/generated/enums'
import { processLocationRoutingIntelligence } from '@/lib/domain/routing/intelligence'
import { PrismaRoutingIntelligenceRepository } from '@/lib/domain/routing/prisma-routing-repository'

import type { LocationEventInput, NormalizedEventBase } from './events'
import {
  createTelematicsIdempotencyKey,
  type DuplicateTelematicsEvent,
  type IngestDevice,
  type IngestInstallation,
  type PersistTelematicsInput,
  type PersistTelematicsResult,
  type TelematicsIngestRepository,
  type TelematicsRawEnvelope,
} from './ingest'

const TERMINAL_TRIP_STATUSES = [TripStatus.completed, TripStatus.cancelled]

function eventFields(event: PersistTelematicsInput['event']) {
  return {
    latitude: event.kind === 'location' ? event.latitude : null,
    longitude: event.kind === 'location' ? event.longitude : null,
    speedKph: event.kind === 'location' ? event.speedKph : null,
    headingDeg: event.kind === 'location' ? event.headingDeg : null,
    accuracyMeters: event.kind === 'location' ? event.accuracyMeters : null,
    ignitionOn: event.kind === 'ignition' ? event.ignitionOn : null,
    sensorType: event.kind === 'sensor' ? event.sensorType : null,
    sensorValue: event.kind === 'sensor' ? JSON.stringify(event.value) : null,
    sensorUnit: event.kind === 'sensor' ? event.unit : null,
    alarmType: event.kind === 'alarm' ? event.alarmType : null,
    severity: event.kind === 'alarm' ? event.severity : null,
    message: event.kind === 'alarm' ? event.message : null,
  }
}

function normalizedPayload(event: NormalizedEventBase): string {
  return JSON.stringify({
    ...event,
    deviceTimestamp: event.deviceTimestamp.toISOString(),
    receivedAt: event.receivedAt.toISOString(),
  })
}

function idempotencyKey(raw: TelematicsRawEnvelope, event: PersistTelematicsInput['event']): string {
  return createTelematicsIdempotencyKey(event.provider, event.deviceId, event.providerEventId, raw.payloadHash)
}

export class PrismaTelematicsIngestRepository implements TelematicsIngestRepository {
  async findDevice(deviceId: string): Promise<IngestDevice | null> {
    return db.telematicsDevice.findUnique({
      where: { id: deviceId },
      select: { id: true, provider: true, status: true },
    })
  }

  async resolveInstallation(deviceId: string, at: Date): Promise<IngestInstallation | null> {
    return db.deviceInstallationHistory.findFirst({
      where: {
        deviceId,
        installedAt: { lte: at },
        OR: [{ uninstalledAt: null }, { uninstalledAt: { gt: at } }],
      },
      orderBy: { installedAt: 'desc' },
      select: {
        id: true,
        deviceId: true,
        assetType: true,
        assetId: true,
        installedAt: true,
        uninstalledAt: true,
      },
    }) as Promise<IngestInstallation | null>
  }

  async resolveTrip(assetType: 'tractor' | 'trailer', assetId: string, at: Date): Promise<string | null> {
    const trip = await db.trip.findFirst({
      where: {
        ...(assetType === 'tractor' ? { truckId: assetId } : { trailerId: assetId }),
        status: { notIn: TERMINAL_TRIP_STATUSES },
        createdAt: { lte: at },
      },
      orderBy: [{ departureTime: 'desc' }, { updatedAt: 'desc' }],
      select: { id: true },
    })
    return trip?.id ?? null
  }

  async findDuplicate(raw: TelematicsRawEnvelope, event: LocationEventInput): Promise<DuplicateTelematicsEvent | null> {
    const existing = await db.telematicsEvent.findUnique({
      where: { idempotencyKey: idempotencyKey(raw, event) },
      select: { id: true, rawEventRef: true },
    })
    return existing ? { eventId: existing.id, rawEventRef: existing.rawEventRef } : null
  }

  async getLiveStateTimestamp(assetType: 'tractor' | 'trailer', assetId: string): Promise<Date | null> {
    const state = await db.vehicleLiveState.findUnique({
      where: { assetType_assetId: { assetType, assetId } },
      select: { deviceTimestamp: true },
    })
    return state?.deviceTimestamp ?? null
  }

  async persist(input: PersistTelematicsInput): Promise<PersistTelematicsResult> {
    const key = idempotencyKey(input.raw, input.event)

    return db.$transaction(async (tx) => {
      const rawPacket = await tx.rawTelematicsPacket.create({
        data: {
          id: input.raw.rawEventRef,
          provider: input.raw.provider,
          deviceId: input.raw.deviceId,
          providerEventId: input.raw.providerEventId,
          idempotencyKey: key,
          payloadHash: input.raw.payloadHash,
          payload: input.raw.payload,
          receivedAt: input.raw.receivedAt,
        },
      })

      const event = await tx.telematicsEvent.create({
        data: {
          eventType: input.event.kind,
          deviceId: input.event.deviceId,
          provider: input.event.provider,
          providerEventId: input.event.providerEventId,
          idempotencyKey: key,
          assetType: input.assetType,
          assetId: input.assetId,
          tripId: input.tripId,
          deviceTimestamp: input.event.deviceTimestamp,
          receivedAt: input.event.receivedAt,
          source: input.event.source,
          trust: input.event.trust,
          rawEventRef: rawPacket.id,
          normalizedPayload: normalizedPayload(input.event),
          ...eventFields(input.event),
        },
      })

      let legacyLocationId: string | null = null
      if (input.event.kind === 'location' && input.assetType === 'tractor') {
        const legacy = await tx.truckLocation.create({
          data: {
            truckId: input.assetId,
            tripId: input.tripId,
            latitude: input.event.latitude,
            longitude: input.event.longitude,
            speed: input.event.speedKph,
            heading: input.event.headingDeg,
            accuracy: input.event.accuracyMeters,
            source: input.event.source,
            timestamp: input.event.deviceTimestamp,
          },
          select: { id: true },
        })
        legacyLocationId = legacy.id
      }

      let liveStateUpdated = false
      if (input.updateLiveState) {
        const current = await tx.vehicleLiveState.findUnique({
          where: { assetType_assetId: { assetType: input.assetType, assetId: input.assetId } },
          select: { deviceTimestamp: true },
        })

        if (!current || input.event.deviceTimestamp.getTime() > current.deviceTimestamp.getTime()) {
          const liveData = {
            latestEventId: event.id,
            deviceId: input.event.deviceId,
            tripId: input.tripId,
            provider: input.event.provider,
            latitude: input.event.kind === 'location' ? input.event.latitude : null,
            longitude: input.event.kind === 'location' ? input.event.longitude : null,
            speedKph: input.event.kind === 'location' ? input.event.speedKph : null,
            headingDeg: input.event.kind === 'location' ? input.event.headingDeg : null,
            accuracyMeters: input.event.kind === 'location' ? input.event.accuracyMeters : null,
            ignitionOn: input.event.kind === 'ignition' ? input.event.ignitionOn : null,
            source: input.event.source,
            trust: input.event.trust,
            deviceTimestamp: input.event.deviceTimestamp,
            receivedAt: input.event.receivedAt,
          }

          await tx.vehicleLiveState.upsert({
            where: { assetType_assetId: { assetType: input.assetType, assetId: input.assetId } },
            update: liveData,
            create: { assetType: input.assetType, assetId: input.assetId, ...liveData },
          })
          liveStateUpdated = true
        }
      }

      if (input.event.deviceId) {
        await tx.telematicsDevice.update({
          where: { id: input.event.deviceId },
          data: { lastSeenAt: input.event.receivedAt },
        })
      }

      if (input.event.kind === 'location' && liveStateUpdated) {
        await processLocationRoutingIntelligence({
          eventId: event.id,
          assetType: input.assetType,
          assetId: input.assetId,
          tripId: input.tripId,
          point: { latitude: input.event.latitude, longitude: input.event.longitude },
          occurredAt: input.event.deviceTimestamp,
        }, new PrismaRoutingIntelligenceRepository(tx))
      }

      return {
        eventId: event.id,
        rawEventRef: rawPacket.id,
        liveStateUpdated,
        legacyLocationId,
      }
    }, { isolationLevel: 'Serializable' })
  }
}
