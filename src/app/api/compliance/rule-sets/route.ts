import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { requireAuth, requireWriteAccess } from '@/lib/auth-server'
import { createAuditLog, getClientIp } from '@/lib/audit'
import { findAmbiguousRuleOverlaps } from '@/lib/domain/compliance/rule-validation'
import type {
  ComplianceOperator,
  ComplianceRule,
  ComplianceScope,
  ComplianceSeverity,
} from '@/lib/domain/compliance/types'

const OPERATORS = new Set<ComplianceOperator>(['lt', 'lte', 'gt', 'gte', 'eq', 'neq', 'in', 'not_in', 'required'])
const SEVERITIES = new Set<ComplianceSeverity>(['blocking', 'warning'])

function parseDate(value: unknown, field: string): Date {
  const date = new Date(String(value ?? ''))
  if (!Number.isFinite(date.getTime())) throw new Error(`${field} must be a valid date`)
  return date
}

function parseOptionalDate(value: unknown, field: string): Date | null {
  if (value == null || value === '') return null
  return parseDate(value, field)
}

function parseJsonObject(value: unknown, field: string): ComplianceScope {
  if (value == null) return {}
  if (typeof value === 'object' && !Array.isArray(value)) return value as ComplianceScope
  if (typeof value === 'string') {
    try {
      const parsed = JSON.parse(value)
      if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) return parsed as ComplianceScope
    } catch {
      // handled below
    }
  }
  throw new Error(`${field} must be an object`)
}

function parseStoredJson(value: string): unknown {
  try {
    return JSON.parse(value)
  } catch {
    return value
  }
}

function serializeJson(value: unknown): string {
  return JSON.stringify(value ?? null)
}

function normalizeRuleInput(
  input: Record<string, unknown>,
  index: number,
  defaultEffectiveFrom: Date,
  defaultEffectiveTo: Date | null,
): ComplianceRule & { metric?: string | null; description?: string | null } {
  const type = String(input.type ?? '').trim()
  const operator = String(input.operator ?? '') as ComplianceOperator
  const severity = String(input.severity ?? '') as ComplianceSeverity
  if (!type) throw new Error(`rules[${index}].type is required`)
  if (!OPERATORS.has(operator)) throw new Error(`rules[${index}].operator is invalid`)
  if (!SEVERITIES.has(severity)) throw new Error(`rules[${index}].severity is invalid`)
  if (input.value === undefined && operator !== 'required') throw new Error(`rules[${index}].value is required`)

  const effectiveFrom = input.effectiveFrom
    ? parseDate(input.effectiveFrom, `rules[${index}].effectiveFrom`)
    : defaultEffectiveFrom
  const effectiveTo = input.effectiveTo !== undefined
    ? parseOptionalDate(input.effectiveTo, `rules[${index}].effectiveTo`)
    : defaultEffectiveTo
  if (effectiveTo && effectiveTo < effectiveFrom) {
    throw new Error(`rules[${index}].effectiveTo cannot precede effectiveFrom`)
  }

  const priority = Number(input.priority ?? 0)
  if (!Number.isInteger(priority)) throw new Error(`rules[${index}].priority must be an integer`)

  return {
    id: `candidate-${index}`,
    ruleSetId: 'candidate-rule-set',
    type,
    scope: parseJsonObject(input.scope, `rules[${index}].scope`),
    operator,
    value: input.value ?? true,
    unit: input.unit == null ? null : String(input.unit).trim() || null,
    severity,
    priority,
    effectiveFrom,
    effectiveTo,
    isActive: input.isActive !== false,
    metric: input.metric == null ? null : String(input.metric).trim() || null,
    description: input.description == null ? null : String(input.description).trim() || null,
  }
}

function storedRuleToDomain(rule: {
  id: string
  ruleSetId: string
  type: string
  scope: string
  operator: string
  value: string
  unit: string | null
  severity: string
  priority: number
  effectiveFrom: Date
  effectiveTo: Date | null
  isActive: boolean
}): ComplianceRule {
  return {
    id: rule.id,
    ruleSetId: rule.ruleSetId,
    type: rule.type,
    scope: parseJsonObject(rule.scope, 'stored scope'),
    operator: rule.operator as ComplianceOperator,
    value: parseStoredJson(rule.value),
    unit: rule.unit,
    severity: rule.severity as ComplianceSeverity,
    priority: rule.priority,
    effectiveFrom: rule.effectiveFrom,
    effectiveTo: rule.effectiveTo,
    isActive: rule.isActive,
  }
}

export async function GET(request: NextRequest) {
  try {
    const auth = requireAuth(request)
    if (auth instanceof NextResponse) return auth

    const { searchParams } = new URL(request.url)
    const activeOnly = searchParams.get('active') === 'true'
    const country = searchParams.get('country')

    const ruleSets = await db.complianceRuleSet.findMany({
      where: {
        ...(activeOnly ? { isActive: true } : {}),
        ...(country ? { country } : {}),
      },
      include: { rules: { orderBy: [{ type: 'asc' }, { priority: 'desc' }] } },
      orderBy: [{ effectiveFrom: 'desc' }, { createdAt: 'desc' }],
    })

    return NextResponse.json({ data: ruleSets })
  } catch (error) {
    console.error('Compliance rule-set list error:', error)
    return NextResponse.json({ error: 'Failed to fetch compliance rule sets' }, { status: 500 })
  }
}

export async function POST(request: NextRequest) {
  try {
    const auth = requireAuth(request)
    if (auth instanceof NextResponse) return auth
    const writeGuard = requireWriteAccess(auth)
    if (writeGuard instanceof NextResponse) return writeGuard

    const body = await request.json() as Record<string, unknown>
    const name = String(body.name ?? '').trim()
    const version = String(body.version ?? '').trim()
    if (!name || !version) {
      return NextResponse.json({ error: 'name and version are required' }, { status: 400 })
    }

    const effectiveFrom = parseDate(body.effectiveFrom, 'effectiveFrom')
    const effectiveTo = parseOptionalDate(body.effectiveTo, 'effectiveTo')
    if (effectiveTo && effectiveTo < effectiveFrom) {
      return NextResponse.json({ error: 'effectiveTo cannot precede effectiveFrom' }, { status: 400 })
    }

    const rawRules = Array.isArray(body.rules) ? body.rules : []
    if (rawRules.length === 0) {
      return NextResponse.json({ error: 'At least one compliance rule is required' }, { status: 400 })
    }

    const proposedRules = rawRules.map((item, index) => {
      if (!item || typeof item !== 'object' || Array.isArray(item)) {
        throw new Error(`rules[${index}] must be an object`)
      }
      return normalizeRuleInput(item as Record<string, unknown>, index, effectiveFrom, effectiveTo)
    })

    const existing = await db.complianceRule.findMany({
      where: { isActive: true, ruleSet: { isActive: true } },
    })
    const existingRules = existing.map(storedRuleToDomain)
    const conflicts = findAmbiguousRuleOverlaps([...existingRules, ...proposedRules])
      .filter((conflict) => conflict.ruleIds.some((id) => id.startsWith('candidate-')))

    if (conflicts.length > 0) {
      return NextResponse.json({ error: 'Ambiguous overlapping compliance rules', conflicts }, { status: 409 })
    }

    const ruleSet = await db.complianceRuleSet.create({
      data: {
        name,
        version,
        country: body.country == null ? null : String(body.country).trim().toUpperCase() || null,
        description: body.description == null ? null : String(body.description).trim() || null,
        effectiveFrom,
        effectiveTo,
        isActive: body.isActive !== false,
        createdBy: auth.userId,
        rules: {
          create: proposedRules.map((rule) => ({
            type: rule.type,
            metric: rule.metric ?? null,
            scope: serializeJson(rule.scope),
            operator: rule.operator,
            value: serializeJson(rule.value),
            unit: rule.unit ?? null,
            severity: rule.severity,
            priority: rule.priority,
            effectiveFrom: new Date(rule.effectiveFrom),
            effectiveTo: rule.effectiveTo ? new Date(rule.effectiveTo) : null,
            isActive: rule.isActive,
            description: rule.description ?? null,
          })),
        },
      },
      include: { rules: true },
    })

    createAuditLog({
      userId: auth.userId,
      action: 'create',
      entity: 'ComplianceRuleSet',
      entityId: ruleSet.id,
      details: { name, version, ruleCount: ruleSet.rules.length },
      ipAddress: getClientIp(request),
    }).catch(() => {})

    return NextResponse.json(ruleSet, { status: 201 })
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to create compliance rule set'
    console.error('Compliance rule-set create error:', error)
    return NextResponse.json({ error: message }, { status: 400 })
  }
}
