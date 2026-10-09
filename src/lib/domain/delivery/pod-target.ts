export type PodTargetKind = 'destination' | 'delivery_stop' | 'trip'

export function buildPodTargetKey(tripId: string, kind: PodTargetKind, targetId: string | null): string {
  const trip = tripId.trim()
  if (!trip) throw new Error('POD_TARGET_TRIP_REQUIRED')
  if (kind === 'trip') return `${trip}:trip`
  const target = targetId?.trim()
  if (!target) throw new Error('POD_TARGET_ID_REQUIRED')
  return `${trip}:${kind}:${target}`
}

export function ensurePodTargetOpen(existing: { id: string } | null): void {
  if (existing) throw new Error('POD_TARGET_ALREADY_COMPLETED')
}
