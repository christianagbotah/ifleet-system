import type { VideoRetentionKind } from './retention'

export const DEFAULT_VIDEO_ALLOWED_ROLES = ['Admin', 'Manager'] as const
const DAY_MS = 24 * 60 * 60 * 1000

export function parsePolicyList(value: string | null | undefined): string[] | null {
  if (!value) return null
  try {
    const parsed = JSON.parse(value)
    if (!Array.isArray(parsed)) return null
    const values = [...new Set(parsed.filter((item): item is string => typeof item === 'string').map((item) => item.trim()).filter(Boolean))]
    return values
  } catch {
    return null
  }
}

export function serializePolicyList(values: unknown, fallback: string[] | null = null): string | null {
  if (!Array.isArray(values)) return fallback ? JSON.stringify(fallback) : null
  const normalized = [...new Set(values.filter((item): item is string => typeof item === 'string').map((item) => item.trim()).filter(Boolean))]
  return JSON.stringify(normalized)
}

export function normalizeRetentionDays(value: unknown, fallback: number): number {
  if (value === undefined) return fallback
  const number = Number(value)
  if (!Number.isInteger(number) || number < 1 || number > 3650) {
    throw new Error('Retention days must be an integer between 1 and 3650')
  }
  return number
}

export function retainUntilFor(recordedAt: Date, kind: VideoRetentionKind, routineDays: number, incidentDays: number): Date {
  const days = kind === 'incident' ? incidentDays : routineDays
  return new Date(recordedAt.getTime() + days * DAY_MS)
}
