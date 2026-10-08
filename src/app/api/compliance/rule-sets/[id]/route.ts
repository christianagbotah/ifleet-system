import { NextRequest, NextResponse } from 'next/server'

import { createAuditLog, getClientIp } from '@/lib/audit'
import { requireAuth, requireWriteAccess } from '@/lib/auth-server'
import { db } from '@/lib/db'
import {
  normalizeComplianceRuleInput,
  parseComplianceDate,
  parseOptionalComplianceDate,
  parseStoredComplianceJson,
  parseComplianceScope,
  storedComplianceRuleToDomain,
  toComplianceRuleCreateData,
} from '@/lib/domain/compliance/rule-set-input'
import { findAmbiguousRuleOverlaps } from '@/lib/domain/compliance/rule-validation'

export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const auth = requireAuth(request)
    if (auth instanceof NextResponse) return auth

    const { id } = await params
    const ruleSet = await db.complianceRuleSet.findUnique({
      where: { id },
      include: { rules: { orderBy: [{ type: 'asc' }, { priority: 'desc' }] } },
    })
    if (!ruleSet) return NextResponse.json({ error: 'Compliance rule set not found' }, { status: 404 })
    return NextResponse.json(ruleSet)
  } catch (error) {
    console.error('Compliance rule-set detail error:', error)
    return NextResponse.json({ error: 'Failed to fetch compliance rule set' }, { status: 500 })
  }
}

export async function PUT(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const auth = requireAuth(request)
    if (auth instanceof NextResponse) return auth
    const writeGuard = requireWriteAccess(auth)
    if (writeGuard instanceof NextResponse) return writeGuard

    const { id } = await params
    const current = await db.complianceRuleSet.findUnique({
      where: { id },
      include: { rules: true },
    })
    if (!current) return NextResponse.json({ error: 'Compliance rule set not found' }, { status: 404 })
    if (!current.isCurrent) {
      return NextResponse.json({ error: 'Only the current rule-set version can be revised' }, { status: 409 })
    }

    const body = await request.json().catch(() => ({})) as Record<string, unknown>
    const name = body.name == null ? current.name : String(body.name).trim()
    if (!name) return NextResponse.json({ error: 'name is required' }, { status: 400 })

    const effectiveFrom = body.effectiveFrom === undefined
      ? current.effectiveFrom
      : parseComplianceDate(body.effectiveFrom, 'effectiveFrom')
    const effectiveTo = body.effectiveTo === undefined
      ? current.effectiveTo
      : parseOptionalComplianceDate(body.effectiveTo, 'effectiveTo')
    if (effectiveTo && effectiveTo < effectiveFrom) {
      return NextResponse.json({ error: 'effectiveTo cannot precede effectiveFrom' }, { status: 400 })
    }

    const rawRules = Array.isArray(body.rules)
      ? body.rules
      : current.rules.map((rule) => ({
          type: rule.type,
          metric: rule.metric,
          scope: parseComplianceScope(rule.scope, 'stored scope'),
          operator: rule.operator,
          value: parseStoredComplianceJson(rule.value),
          unit: rule.unit,
          severity: rule.severity,
          priority: rule.priority,
          effectiveFrom: rule.effectiveFrom,
          effectiveTo: rule.effectiveTo,
          isActive: rule.isActive,
          description: rule.description,
        }))
    if (rawRules.length === 0) {
      return NextResponse.json({ error: 'At least one compliance rule is required' }, { status: 400 })
    }

    const proposedRules = rawRules.map((item, index) => {
      if (!item || typeof item !== 'object' || Array.isArray(item)) {
        throw new Error(`rules[${index}] must be an object`)
      }
      return normalizeComplianceRuleInput(item as Record<string, unknown>, index, effectiveFrom, effectiveTo)
    })

    const otherStoredRules = await db.complianceRule.findMany({
      where: { isActive: true, ruleSet: { isActive: true, isCurrent: true } },
      include: { ruleSet: { select: { code: true } } },
    })
    const otherRules = otherStoredRules
      .filter((rule) => rule.ruleSet.code !== current.code)
      .map(storedComplianceRuleToDomain)
    const conflicts = findAmbiguousRuleOverlaps([...otherRules, ...proposedRules])
      .filter((conflict) => conflict.ruleIds.some((ruleId) => ruleId.startsWith('candidate-')))
    if (conflicts.length > 0) {
      return NextResponse.json({ error: 'Ambiguous overlapping compliance rules', conflicts }, { status: 409 })
    }

    const revised = await db.$transaction(async (tx) => {
      const live = await tx.complianceRuleSet.findUnique({ where: { id }, select: { id: true, code: true, isCurrent: true } })
      if (!live || !live.isCurrent || live.code !== current.code) {
        throw new Error('Rule-set version changed; reload before retrying')
      }

      const maximum = await tx.complianceRuleSet.aggregate({
        where: { code: current.code },
        _max: { version: true },
      })
      const nextVersion = (maximum._max.version ?? current.version) + 1

      await tx.complianceRuleSet.updateMany({
        where: { code: current.code, isCurrent: true },
        data: { isCurrent: false },
      })

      return tx.complianceRuleSet.create({
        data: {
          code: current.code,
          name,
          version: nextVersion,
          country: body.country === undefined
            ? current.country
            : body.country == null ? null : String(body.country).trim().toUpperCase() || null,
          description: body.description === undefined
            ? current.description
            : body.description == null ? null : String(body.description).trim() || null,
          effectiveFrom,
          effectiveTo,
          isCurrent: true,
          isActive: body.isActive === undefined ? current.isActive : body.isActive !== false,
          createdBy: auth.userId,
          rules: { create: proposedRules.map(toComplianceRuleCreateData) },
        },
        include: { rules: true },
      })
    }, { isolationLevel: 'Serializable' })

    createAuditLog({
      userId: auth.userId,
      action: 'revise',
      entity: 'ComplianceRuleSet',
      entityId: revised.id,
      details: { code: revised.code, previousId: current.id, fromVersion: current.version, version: revised.version },
      ipAddress: getClientIp(request),
    }).catch(() => {})

    return NextResponse.json(revised)
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to revise compliance rule set'
    console.error('Compliance rule-set revision error:', error)
    return NextResponse.json({ error: message }, { status: message.includes('reload') ? 409 : 400 })
  }
}

export async function DELETE(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const auth = requireAuth(request)
    if (auth instanceof NextResponse) return auth
    const writeGuard = requireWriteAccess(auth)
    if (writeGuard instanceof NextResponse) return writeGuard

    const { id } = await params
    const existing = await db.complianceRuleSet.findUnique({
      where: { id },
      include: { rules: true },
    })
    if (!existing) return NextResponse.json({ error: 'Compliance rule set not found' }, { status: 404 })
    if (!existing.isCurrent) {
      return NextResponse.json({ error: 'Only the current rule-set version can be archived' }, { status: 409 })
    }

    const archived = await db.$transaction(async (tx) => {
      const live = await tx.complianceRuleSet.findUnique({
        where: { id },
        select: { id: true, code: true, isCurrent: true },
      })
      if (!live || !live.isCurrent || live.code !== existing.code) {
        throw new Error('Rule-set version changed; reload before retrying')
      }

      const maximum = await tx.complianceRuleSet.aggregate({
        where: { code: existing.code },
        _max: { version: true },
      })
      const nextVersion = (maximum._max.version ?? existing.version) + 1

      await tx.complianceRuleSet.updateMany({
        where: { code: existing.code, isCurrent: true },
        data: { isCurrent: false },
      })

      return tx.complianceRuleSet.create({
        data: {
          code: existing.code,
          name: existing.name,
          version: nextVersion,
          country: existing.country,
          description: existing.description,
          effectiveFrom: existing.effectiveFrom,
          effectiveTo: existing.effectiveTo,
          isActive: false,
          isCurrent: true,
          createdBy: auth.userId,
          rules: {
            create: existing.rules.map((rule) => ({
              type: rule.type,
              metric: rule.metric,
              scope: rule.scope,
              operator: rule.operator,
              value: rule.value,
              unit: rule.unit,
              severity: rule.severity,
              priority: rule.priority,
              effectiveFrom: rule.effectiveFrom,
              effectiveTo: rule.effectiveTo,
              isActive: rule.isActive,
              description: rule.description,
            })),
          },
        },
        include: { rules: true },
      })
    }, { isolationLevel: 'Serializable' })

    createAuditLog({
      userId: auth.userId,
      action: 'archive',
      entity: 'ComplianceRuleSet',
      entityId: archived.id,
      details: {
        code: archived.code,
        previousId: existing.id,
        fromVersion: existing.version,
        version: archived.version,
      },
      ipAddress: getClientIp(request),
    }).catch(() => {})

    return NextResponse.json(archived)
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to archive compliance rule set'
    console.error('Compliance rule-set archive error:', error)
    return NextResponse.json({ error: message }, { status: message.includes('reload') ? 409 : 500 })
  }
}
