import type { VideoAlarmEvent } from './alarm-normalizer'

export interface PersistedVideoIncident {
  alarmEventId: string
  incidentId: string
}

export interface VideoIncidentRepository {
  findByDedupeKey(dedupeKey: string): Promise<PersistedVideoIncident | null>
  create(input: VideoAlarmEvent): Promise<PersistedVideoIncident>
}

export interface PersistVideoIncidentResult extends PersistedVideoIncident {
  duplicate: boolean
}

export async function persistVideoIncident(
  event: VideoAlarmEvent,
  repository: VideoIncidentRepository,
): Promise<PersistVideoIncidentResult> {
  const existing = await repository.findByDedupeKey(event.dedupeKey)
  if (existing) return { duplicate: true, ...existing }
  const created = await repository.create(event)
  return { duplicate: false, ...created }
}
