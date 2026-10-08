export type TrailerOperationalStatus =
  | 'active'
  | 'inactive'
  | 'maintenance'
  | 'out_of_service'
  | 'retired'
  | 'decommissioned'

export interface CouplingTrailer {
  id: string
  status: TrailerOperationalStatus
}

export interface CouplingInput {
  tractorId: string
  trailer: CouplingTrailer | null
  requiresTrailer: boolean
}

export interface CouplingRecord {
  id: string
  tractorId: string
  trailerId: string
  coupledAt: Date
  decoupledAt: Date | null
}

export interface CouplingValidationResult {
  valid: boolean
  blocking: string[]
}

export function validateCoupling(
  input: CouplingInput,
  couplings: CouplingRecord[]
): CouplingValidationResult {
  const blocking: string[] = []

  if (!input.trailer) {
    if (input.requiresTrailer) blocking.push('trailer_required')
    return { valid: blocking.length === 0, blocking }
  }

  if (input.trailer.status !== 'active') {
    blocking.push('trailer_unavailable')
  }

  for (const coupling of couplings) {
    if (coupling.decoupledAt) continue

    if (
      coupling.trailerId === input.trailer.id &&
      coupling.tractorId !== input.tractorId &&
      !blocking.includes('trailer_already_coupled')
    ) {
      blocking.push('trailer_already_coupled')
    }

    if (
      coupling.tractorId === input.tractorId &&
      coupling.trailerId !== input.trailer.id &&
      !blocking.includes('tractor_already_coupled')
    ) {
      blocking.push('tractor_already_coupled')
    }
  }

  return { valid: blocking.length === 0, blocking }
}
