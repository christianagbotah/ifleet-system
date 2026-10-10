import { db } from '@/lib/db'

const DRIVER_EVIDENCE_REF_PATTERN = /^\/uploads\/images\/driver-evidence-([A-Za-z0-9-]{8,191})-\d+\.(?:jpg|png|webp)$/

type DriverEvidenceMetadata = {
  tripId?: string | null
  driverId?: string | null
}

function parseMetadata(value: string | null): DriverEvidenceMetadata {
  if (!value) return {}
  try {
    const parsed = JSON.parse(value)
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed)
      ? parsed as DriverEvidenceMetadata
      : {}
  } catch {
    return {}
  }
}

function parseEvidenceRefs(value: string | null): string[] {
  if (!value) return []
  try {
    const parsed = JSON.parse(value)
    return Array.isArray(parsed) ? parsed.filter((item): item is string => typeof item === 'string') : []
  } catch {
    return []
  }
}

export async function validateDriverEvidenceRefs(
  auth: { userId: string; driverId: string },
  tripId: string | null,
  evidenceRefs: string[],
): Promise<boolean> {
  const refsByMutation = new Map<string, string[]>()
  for (const ref of evidenceRefs) {
    const match = DRIVER_EVIDENCE_REF_PATTERN.exec(ref)
    if (!match) return false
    const evidenceMutationId = match[1]
    const refs = refsByMutation.get(evidenceMutationId) ?? []
    refs.push(ref)
    refsByMutation.set(evidenceMutationId, refs)
  }

  for (const [evidenceMutationId, refs] of refsByMutation) {
    const event = await db.operationalEvent.findUnique({
      where: { idempotencyKey: `driver-evidence-upload:${evidenceMutationId}` },
    })
    if (!event || event.actorId !== auth.userId || event.entityType !== 'driver_evidence_upload') return false
    const metadata = parseMetadata(event.metadata)
    if (metadata.driverId !== auth.driverId || (metadata.tripId ?? null) !== tripId) return false
    const eventRefs = new Set(parseEvidenceRefs(event.evidenceRefs))
    if (refs.some((ref) => !eventRefs.has(ref))) return false
  }

  return true
}
