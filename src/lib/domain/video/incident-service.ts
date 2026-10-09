import type { NormalizedVideoAlarm } from './alarm-normalizer'

export interface ExistingVideoIncident {
  alarmEventId: string
  incidentId: string
}

export interface VideoIncidentRepository {
  findByDedupeKey(dedupeKey: string): Promise<ExistingVideoIncident | null>
  persist(alarm: NormalizedVideoAlarm): Promise<ExistingVideoIncident>
}

export interface VideoAlarmIngestResult extends ExistingVideoIncident {
  duplicate: boolean
}

export async function ingestVideoAlarm(
  alarm: NormalizedVideoAlarm,
  repository: VideoIncidentRepository,
): Promise<VideoAlarmIngestResult> {
  const existing = await repository.findByDedupeKey(alarm.dedupeKey)
  if (existing) return { ...existing, duplicate: true }

  const created = await repository.persist(alarm)
  return { ...created, duplicate: false }
}
