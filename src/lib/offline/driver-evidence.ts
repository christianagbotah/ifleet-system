export const DRIVER_EVIDENCE_ALLOWED_MIME_TYPES = [
  'image/jpeg',
  'image/png',
  'image/webp',
] as const

const MIME_EXTENSIONS: Record<(typeof DRIVER_EVIDENCE_ALLOWED_MIME_TYPES)[number], string> = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
}

const MUTATION_ID_PATTERN = /^[A-Za-z0-9-]{8,191}$/

export function isValidDriverEvidenceMutationId(value: string): boolean {
  return MUTATION_ID_PATTERN.test(value.trim())
}

export function driverEvidenceExtension(mimeType: string): string | null {
  return MIME_EXTENSIONS[mimeType as keyof typeof MIME_EXTENSIONS] ?? null
}

export function driverEvidenceFilename(mutationId: string, index: number, mimeType: string): string {
  const normalizedId = mutationId.trim()
  if (!isValidDriverEvidenceMutationId(normalizedId)) throw new Error('Invalid evidence mutation id')
  if (!Number.isInteger(index) || index < 0 || index > 99) throw new Error('Invalid evidence file index')
  const extension = driverEvidenceExtension(mimeType)
  if (!extension) throw new Error('Unsupported evidence file type')
  return `driver-evidence-${normalizedId}-${index}.${extension}`
}

export function driverEvidenceUrl(mutationId: string, index: number, mimeType: string): string {
  return `/uploads/images/${driverEvidenceFilename(mutationId, index, mimeType)}`
}
