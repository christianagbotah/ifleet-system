import { db } from '@/lib/db'

import type { VideoAlarmEvent } from './alarm-normalizer'
import type { PersistedVideoIncident, VideoIncidentRepository } from './incident-service'

function incidentTitle(event: VideoAlarmEvent): string {
  const label = event.alarmType
    .split('-')
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ')
  return `Video safety alert · ${label}`
}

export class PrismaVideoIncidentRepository implements VideoIncidentRepository {
  async findByDedupeKey(dedupeKey: string): Promise<PersistedVideoIncident | null> {
    const existing = await db.videoAlarmEvent.findUnique({
      where: { dedupeKey },
      select: {
        id: true,
        incident: { select: { id: true } },
      },
    })

    if (!existing?.incident) return null
    return { alarmEventId: existing.id, incidentId: existing.incident.id }
  }

  async create(input: VideoAlarmEvent): Promise<PersistedVideoIncident> {
    return db.$transaction(async (tx) => {
      const alarmEvent = await tx.videoAlarmEvent.create({
        data: {
          dedupeKey: input.dedupeKey,
          provider: input.provider,
          deviceId: input.deviceId,
          providerEventId: input.providerEventId,
          providerAlarmCode: input.providerAlarmCode,
          alarmType: input.alarmType,
          severity: input.severity,
          message: input.message,
          channelKey: input.channelKey,
          assetType: input.assetType,
          assetId: input.assetId,
          tripId: input.tripId,
          latitude: input.latitude,
          longitude: input.longitude,
          occurredAt: input.occurredAt,
          receivedAt: input.receivedAt,
        },
        select: { id: true },
      })

      const incident = await tx.videoIncident.create({
        data: {
          alarmEventId: alarmEvent.id,
          deviceId: input.deviceId,
          tripId: input.tripId,
          assetType: input.assetType,
          assetId: input.assetId,
          incidentType: input.alarmType,
          severity: input.severity,
          title: incidentTitle(input),
          message: input.message,
          latitude: input.latitude,
          longitude: input.longitude,
          occurredAt: input.occurredAt,
        },
        select: { id: true },
      })

      await tx.telematicsDevice.update({
        where: { id: input.deviceId },
        data: { lastSeenAt: input.receivedAt },
      })

      return { alarmEventId: alarmEvent.id, incidentId: incident.id }
    }, { isolationLevel: 'Serializable' })
  }
}
