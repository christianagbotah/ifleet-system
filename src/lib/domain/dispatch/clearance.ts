export type DispatchClearanceCheckKey = 'assignment' | 'gate' | 'weighing' | 'documents' | 'seal' | 'compliance'
export type DispatchClearanceStatus = 'pass' | 'warning' | 'block' | 'overridden'

export interface DispatchClearanceCheck {
  key: DispatchClearanceCheckKey
  label: string
  status: DispatchClearanceStatus
  blocking: string[]
  warnings: string[]
  evidenceId?: string | null
  overrideable: boolean
}

export interface DispatchClearanceInput {
  assignment: {
    passed: boolean
    blocking?: string[]
    warnings?: string[]
  }
  gate: {
    gateInRecorded: boolean
    queueCompleted: boolean
    gateEventId?: string | null
    queueEntryId?: string | null
  }
  weighing: {
    passed: boolean
    eventId?: string | null
    correctedFromEventId?: string | null
    blocking?: string[]
    warnings?: string[]
  }
  documents: {
    waybillRequired: boolean
    waybillFinalized: boolean
    waybillId?: string | null
    missingRequired: string[]
    warnings?: string[]
  }
  seal: {
    required: boolean
    present: boolean
    sealNumber?: string | null
  }
  compliance: {
    passed: boolean
    blocking?: string[]
    warnings?: string[]
  }
  override?: {
    authorized: boolean
    actorRole: string
    actorId: string
    reason: string
    checks: DispatchClearanceCheckKey[]
  } | null
}

export interface DispatchClearanceResult {
  passed: boolean
  checks: DispatchClearanceCheck[]
  blocking: string[]
  warnings: string[]
  overriddenChecks: DispatchClearanceCheckKey[]
  override?: {
    actorId: string
    actorRole: string
    reason: string
  } | null
}

const PRIVILEGED_OVERRIDE_ROLES = new Set(['Admin', 'Manager'])

function unique(values: string[]): string[] {
  return [...new Set(values.map((value) => value.trim()).filter(Boolean))]
}

function statusFor(blocking: string[], warnings: string[]): DispatchClearanceStatus {
  if (blocking.length) return 'block'
  if (warnings.length) return 'warning'
  return 'pass'
}

function makeCheck(
  key: DispatchClearanceCheckKey,
  label: string,
  blocking: string[],
  warnings: string[],
  overrideable: boolean,
  evidenceId?: string | null,
): DispatchClearanceCheck {
  const cleanBlocking = unique(blocking)
  const cleanWarnings = unique(warnings)
  return {
    key,
    label,
    status: statusFor(cleanBlocking, cleanWarnings),
    blocking: cleanBlocking,
    warnings: cleanWarnings,
    evidenceId: evidenceId ?? null,
    overrideable,
  }
}

export function evaluateDispatchClearance(input: DispatchClearanceInput): DispatchClearanceResult {
  const assignmentBlocking = input.assignment.passed
    ? []
    : input.assignment.blocking?.length ? input.assignment.blocking : ['Assignment eligibility failed']
  const gateBlocking: string[] = []
  if (!input.gate.gateInRecorded) gateBlocking.push('Gate-in must be recorded before dispatch')
  if (!input.gate.queueCompleted) gateBlocking.push('Factory queue/loading process must be completed before dispatch')

  const weighingBlocking = input.weighing.passed
    ? []
    : input.weighing.blocking?.length ? input.weighing.blocking : ['Weight clearance failed']

  const documentBlocking: string[] = []
  if (input.documents.waybillRequired && !input.documents.waybillFinalized) {
    documentBlocking.push('Finalized waybill is required before dispatch')
  }
  for (const document of input.documents.missingRequired) {
    documentBlocking.push(`Missing required document: ${document}`)
  }

  const sealBlocking = input.seal.required && !input.seal.present
    ? ['Required cargo seal is missing']
    : []

  const complianceBlocking = input.compliance.passed
    ? []
    : input.compliance.blocking?.length ? input.compliance.blocking : ['Blocking compliance rule failed']

  const checks: DispatchClearanceCheck[] = [
    makeCheck('assignment', 'Assignment eligibility', assignmentBlocking, input.assignment.warnings ?? [], true),
    makeCheck('gate', 'Gate and queue operations', gateBlocking, [], true, input.gate.gateEventId ?? input.gate.queueEntryId ?? null),
    makeCheck('weighing', 'Weight and axle clearance', weighingBlocking, input.weighing.warnings ?? [], false, input.weighing.eventId ?? null),
    makeCheck('documents', 'Shipment documents', documentBlocking, input.documents.warnings ?? [], true, input.documents.waybillId ?? null),
    makeCheck('seal', 'Cargo seal', sealBlocking, [], true, input.seal.sealNumber ?? null),
    makeCheck('compliance', 'Transport compliance', complianceBlocking, input.compliance.warnings ?? [], false),
  ]

  const override = input.override
  const overrideIsPrivileged = Boolean(
    override?.authorized &&
    PRIVILEGED_OVERRIDE_ROLES.has(override.actorRole) &&
    override.reason.trim().length >= 8,
  )
  const requestedOverrides = new Set(override?.checks ?? [])
  const overriddenChecks: DispatchClearanceCheckKey[] = []

  if (overrideIsPrivileged) {
    for (const check of checks) {
      if (check.status !== 'block' || !check.overrideable || !requestedOverrides.has(check.key)) continue
      check.status = 'overridden'
      overriddenChecks.push(check.key)
    }
  }

  const blocking = unique(
    checks
      .filter((check) => check.status === 'block')
      .flatMap((check) => check.blocking),
  )
  const warnings = unique([
    ...checks.flatMap((check) => check.warnings),
    ...checks
      .filter((check) => check.status === 'overridden')
      .flatMap((check) => check.blocking.map((message) => `Overridden: ${message}`)),
  ])

  return {
    passed: blocking.length === 0,
    checks,
    blocking,
    warnings,
    overriddenChecks,
    override: overrideIsPrivileged && override ? {
      actorId: override.actorId,
      actorRole: override.actorRole,
      reason: override.reason.trim(),
    } : null,
  }
}
