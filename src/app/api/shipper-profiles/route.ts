import { NextRequest, NextResponse } from 'next/server'

import { createAuditLog, getClientIp } from '@/lib/audit'
import { requireAuth, requireWriteAccess } from '@/lib/auth-server'
import { db } from '@/lib/db'

function text(value: unknown): string | null {
  return typeof value === 'string' && value.trim() ? value.trim() : null
}

function jsonText(value: unknown): string | null {
  if (value == null || value === '') return null
  if (typeof value === 'string') {
    const parts = value.split(',').map((part) => part.trim()).filter(Boolean)
    return parts.length ? JSON.stringify(parts) : null
  }
  if (Array.isArray(value) || typeof value === 'object') return JSON.stringify(value)
  return null
}

function profileData(body: Record<string, unknown>) {
  return {
    code: String(body.code || '').trim().toUpperCase(),
    name: String(body.name || '').trim(),
    clientId: text(body.clientId),
    profileType: text(body.profileType) || 'general',
    requiredDocuments: jsonText(body.requiredDocuments),
    allowedVehicleTypes: jsonText(body.allowedVehicleTypes),
    allowedTrailerTypes: jsonText(body.allowedTrailerTypes),
    waybillFields: jsonText(body.waybillFields),
    weighingStages: jsonText(body.weighingStages),
    sealRequired: body.sealRequired === true,
    queueProcess: text(body.queueProcess),
    loadingCapacity: body.loadingCapacity == null || body.loadingCapacity === '' ? null : Number(body.loadingCapacity),
    loadingCapacityUnit: text(body.loadingCapacityUnit),
    gateOpenTime: text(body.gateOpenTime),
    gateCloseTime: text(body.gateCloseTime),
    podRequirements: jsonText(body.podRequirements),
    acceptedQuantityVariance: body.acceptedQuantityVariance == null || body.acceptedQuantityVariance === '' ? 0 : Number(body.acceptedQuantityVariance),
    permittedRoutes: jsonText(body.permittedRoutes),
    speedRules: jsonText(body.speedRules),
    detentionFreeMinutes: body.detentionFreeMinutes == null || body.detentionFreeMinutes === '' ? null : Number(body.detentionFreeMinutes),
    detentionRules: jsonText(body.detentionRules),
    integrationMode: text(body.integrationMode) || 'manual',
    extensibleSettings: body.extensibleSettings ? JSON.stringify(body.extensibleSettings) : null,
    isActive: body.isActive !== false,
  }
}

function siteRuleData(rule: Record<string, unknown>, shipperProfileId: string) {
  return {
    shipperProfileId,
    loadingPointId: String(rule.loadingPointId || '').trim(),
    requiredDocuments: jsonText(rule.requiredDocuments),
    allowedVehicleTypes: jsonText(rule.allowedVehicleTypes),
    allowedTrailerTypes: jsonText(rule.allowedTrailerTypes),
    weighingStages: jsonText(rule.weighingStages),
    sealRequired: typeof rule.sealRequired === 'boolean' ? rule.sealRequired : null,
    queueProcess: text(rule.queueProcess),
    loadingCapacity: rule.loadingCapacity == null || rule.loadingCapacity === '' ? null : Number(rule.loadingCapacity),
    loadingCapacityUnit: text(rule.loadingCapacityUnit),
    gateOpenTime: text(rule.gateOpenTime),
    gateCloseTime: text(rule.gateCloseTime),
    podRequirements: jsonText(rule.podRequirements),
    acceptedQuantityVariance: rule.acceptedQuantityVariance == null || rule.acceptedQuantityVariance === '' ? null : Number(rule.acceptedQuantityVariance),
    permittedRoutes: jsonText(rule.permittedRoutes),
    speedRules: jsonText(rule.speedRules),
    isActive: rule.isActive !== false,
  }
}

const include = {
  client: { select: { id: true, companyName: true } },
  ShipperSiteRule: {
    include: { loadingPoint: { select: { id: true, name: true, loadingCity: { select: { name: true } } } } },
    orderBy: { createdAt: 'asc' as const },
  },
  _count: { select: { LoadOrder: true, TransportContract: true, TransportRateCard: true } },
} as const

export async function GET(request: NextRequest) {
  try {
    const auth = requireAuth(request)
    if (auth instanceof NextResponse) return auth
    const { searchParams } = new URL(request.url)
    const search = searchParams.get('search')?.trim()
    const active = searchParams.get('active')
    const where = {
      ...(active === 'true' ? { isActive: true } : active === 'false' ? { isActive: false } : {}),
      ...(search ? { OR: [{ code: { contains: search } }, { name: { contains: search } }, { profileType: { contains: search } }] } : {}),
    }
    const data = await db.shipperProfile.findMany({ where, include, orderBy: [{ isActive: 'desc' }, { name: 'asc' }] })
    return NextResponse.json({ data })
  } catch (error) {
    console.error('Shipper profile list error:', error)
    return NextResponse.json({ error: 'Failed to fetch shipper profiles' }, { status: 500 })
  }
}

export async function POST(request: NextRequest) {
  try {
    const auth = requireAuth(request)
    if (auth instanceof NextResponse) return auth
    const writeGuard = requireWriteAccess(auth)
    if (writeGuard instanceof NextResponse) return writeGuard

    const body = await request.json() as Record<string, unknown>
    const data = profileData(body)
    if (!data.code || !data.name) return NextResponse.json({ error: 'code and name are required' }, { status: 400 })
    if (!Number.isFinite(data.acceptedQuantityVariance) || data.acceptedQuantityVariance < 0) return NextResponse.json({ error: 'acceptedQuantityVariance must be zero or positive' }, { status: 400 })

    const duplicate = await db.shipperProfile.findUnique({ where: { code: data.code }, select: { id: true } })
    if (duplicate) return NextResponse.json({ error: 'Shipper profile code already exists' }, { status: 409 })

    const rules = Array.isArray(body.siteRules) ? body.siteRules as Record<string, unknown>[] : []
    if (rules.some((rule) => !String(rule.loadingPointId || '').trim())) return NextResponse.json({ error: 'Every site rule requires a loadingPointId' }, { status: 400 })
    if (new Set(rules.map((rule) => String(rule.loadingPointId))).size !== rules.length) return NextResponse.json({ error: 'A loading point can only have one rule per shipper profile' }, { status: 409 })

    const profile = await db.$transaction(async (tx) => {
      const created = await tx.shipperProfile.create({ data })
      if (rules.length) await tx.shipperSiteRule.createMany({ data: rules.map((rule) => siteRuleData(rule, created.id)) })
      return tx.shipperProfile.findUniqueOrThrow({ where: { id: created.id }, include })
    })

    createAuditLog({ userId: auth.userId, action: 'create', entity: 'ShipperProfile', entityId: profile.id, details: { code: profile.code, name: profile.name, siteRules: rules.length }, ipAddress: getClientIp(request) }).catch(() => {})
    return NextResponse.json(profile, { status: 201 })
  } catch (error) {
    console.error('Shipper profile create error:', error)
    return NextResponse.json({ error: 'Failed to create shipper profile' }, { status: 500 })
  }
}

export async function PATCH(request: NextRequest) {
  try {
    const auth = requireAuth(request)
    if (auth instanceof NextResponse) return auth
    const writeGuard = requireWriteAccess(auth)
    if (writeGuard instanceof NextResponse) return writeGuard

    const body = await request.json() as Record<string, unknown>
    const id = String(body.id || '').trim()
    if (!id) return NextResponse.json({ error: 'id is required' }, { status: 400 })
    const existing = await db.shipperProfile.findUnique({ where: { id } })
    if (!existing) return NextResponse.json({ error: 'Shipper profile not found' }, { status: 404 })

    const data = profileData({ ...existing, ...body })
    if (data.code !== existing.code) {
      const duplicate = await db.shipperProfile.findUnique({ where: { code: data.code }, select: { id: true } })
      if (duplicate && duplicate.id !== id) return NextResponse.json({ error: 'Shipper profile code already exists' }, { status: 409 })
    }
    const rules = Array.isArray(body.siteRules) ? body.siteRules as Record<string, unknown>[] : null
    if (rules && new Set(rules.map((rule) => String(rule.loadingPointId))).size !== rules.length) return NextResponse.json({ error: 'A loading point can only have one rule per shipper profile' }, { status: 409 })

    const profile = await db.$transaction(async (tx) => {
      await tx.shipperProfile.update({ where: { id }, data })
      if (rules) {
        await tx.shipperSiteRule.deleteMany({ where: { shipperProfileId: id } })
        if (rules.length) await tx.shipperSiteRule.createMany({ data: rules.map((rule) => siteRuleData(rule, id)) })
      }
      return tx.shipperProfile.findUniqueOrThrow({ where: { id }, include })
    })

    createAuditLog({ userId: auth.userId, action: 'update', entity: 'ShipperProfile', entityId: id, details: { code: profile.code, siteRulesReplaced: rules ? rules.length : undefined }, ipAddress: getClientIp(request) }).catch(() => {})
    return NextResponse.json(profile)
  } catch (error) {
    console.error('Shipper profile update error:', error)
    return NextResponse.json({ error: 'Failed to update shipper profile' }, { status: 500 })
  }
}
