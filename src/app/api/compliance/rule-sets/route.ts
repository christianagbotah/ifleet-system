import { NextRequest, NextResponse } from 'next/server'

import { createAuditLog, getClientIp } from '@/lib/audit'
import { requireAuth, requireWriteAccess } from '@/lib/auth-server'
import { db } from '@/lib/db'
import {
  normalizeComplianceRuleInput,
  normalizeRuleSetCode,
  parseComplianceDate,
  parseOptionalComplianceDate,
  storedComplianceRuleToDomain,
  toComplianceRuleCreateData,
} from '@/lib/domain/compliance/rule-set-input'
import { findAmbiguousRuleOverlaps } from '@/lib/domain/compliance/rule-validation'

export async function GET(request: NextRequest) {
  try {
    const auth = requireAuth(request)
    if (auth instanceof NextResponse) return auth

    const { searchParams } = new URL(request.url)
    const activeOnly = searchParams.get('active') === 'true'
    const allVersions = searchParams.get('allVersions') === 'true'
    const country = searchParams.get('country')

    const ruleSets = await db.complianceRuleSet.findMany({
      where: {
        ...(!allVersions ? { isCurrent: true } : {}),
        ...(activeOnly ? { isActive: true } : {}),
        ...(country ? { country: country.trim().toUpperCase() } : {}),
      },
      include: { rules: { orderBy: [{ type: 'asc' }, { priority: 'desc' }] } },
      orderBy: [{ code: 'asc' }, { version: 'desc' }],
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
    if (!name) return NextResponse.json({ error: 'name is required' }, { status: 400 })

    const code = normalizeRuleSetCode(body.code, name)
    if (!code) return NextResponse.json({ error: 'code is required' }, { status: 400 })

    const familyExists = await db.complianceRuleSet.findFirst({
      where: { code },
      select: { id: true },
    })
    if (familyExists) {
      return NextResponse.json(
        { error: 'A rule-set family with this code already exists. Revise its current version instead.' },
        { status: 409 }
      )
    }

    const effectiveFrom = parseComplianceDate(body.effectiveFrom, 'effectiveFrom')
    const effectiveTo = parseOptionalComplianceDate(body.effectiveTo, 'effectiveTo')
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
      return normalizeComplianceRuleInput(item as Record<string, unknown>, index, effectiveFrom, effectiveTo)
    })

    const existing = await db.complianceRule.findMany({
      where: { isActive: true, ruleSet: { isActive: true, isCurrent: true } },
    })
    const existingRules = existing.map(storedComplianceRuleToDomain)
    const conflicts = findAmbiguousRuleOverlaps([...existingRules, ...proposedRules])
      .filter((conflict) => conflict.ruleIds.some((id) => id.startsWith('candidate-')))

    if (conflicts.length > 0) {
      return NextResponse.json({ error: 'Ambiguous overlapping compliance rules', conflicts }, { status: 409 })
    }

    const ruleSet = await db.complianceRuleSet.create({
      data: {
        code,
        name,
        version: 1,
        country: body.country == null ? null : String(body.country).trim().toUpperCase() || null,
        description: body.description == null ? null : String(body.description).trim() || null,
        effectiveFrom,
        effectiveTo,
        isCurrent: true,
        isActive: body.isActive !== false,
        createdBy: auth.userId,
        rules: { create: proposedRules.map(toComplianceRuleCreateData) },
      },
      include: { rules: true },
    })

    createAuditLog({
      userId: auth.userId,
      action: 'create',
      entity: 'ComplianceRuleSet',
      entityId: ruleSet.id,
      details: { code, name, version: 1, ruleCount: ruleSet.rules.length },
      ipAddress: getClientIp(request),
    }).catch(() => {})

    return NextResponse.json(ruleSet, { status: 201 })
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to create compliance rule set'
    console.error('Compliance rule-set create error:', error)
    return NextResponse.json({ error: message }, { status: 400 })
  }
}
