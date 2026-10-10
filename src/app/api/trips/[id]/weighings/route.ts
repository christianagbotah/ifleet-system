import { NextRequest, NextResponse } from 'next/server'

import { createAuditLog, getClientIp } from '@/lib/audit'
import { requireAuth, requireWriteAccess } from '@/lib/auth-server'
import { db } from '@/lib/db'
import { appendOperationalEvent } from '@/lib/domain/events/operational-event'
import { storedComplianceRuleToDomain } from '@/lib/domain/compliance/rule-set-input'
import { calculateWeightMetrics, selectEffectiveWeighing, type WeighingSnapshot, type WeighingStage } from '@/lib/domain/weighing/calculations'
import { evaluateWeightClearance, type AxleReadingInput, type WeightClearanceRule } from '@/lib/domain/weighing/clearance'

const STAGES = new Set<WeighingStage>(['TARE', 'GROSS', 'AXLE', 'DESTINATION', 'ROAD_CHECK'])
const SOURCES = new Set(['MANUAL', 'WEIGHBRIDGE_API', 'DOCUMENT_SCAN'])

function parseDate(value: unknown, fallback: Date): Date {
  if (value == null || value === '') return fallback
  const date = new Date(String(value))
  if (!Number.isFinite(date.getTime())) throw new Error('recordedAt must be a valid date')
  return date
}

function parseOptionalNumber(value: unknown, field: string): number | null {
  if (value == null || value === '') return null
  const number = Number(value)
  if (!Number.isFinite(number)) throw new Error(`${field} must be a valid number`)
  return number
}

function parseAxles(value: unknown): AxleReadingInput[] {
  if (value == null) return []
  if (!Array.isArray(value)) throw new Error('axleReadings must be an array')

  const seen = new Set<number>()
  return value.map((item, index) => {
    if (!item || typeof item !== 'object' || Array.isArray(item)) {
      throw new Error(`axleReadings[${index}] must be an object`)
    }
    const source = item as Record<string, unknown>
    const axleNumber = Number(source.axleNumber)
    const weightKg = Number(source.weightKg)
    if (!Number.isInteger(axleNumber) || axleNumber <= 0) {
      throw new Error(`axleReadings[${index}].axleNumber must be a positive integer`)
    }
    if (!Number.isFinite(weightKg) || weightKg < 0) {
      throw new Error(`axleReadings[${index}].weightKg must be a non-negative number`)
    }
    if (seen.has(axleNumber)) throw new Error(`Duplicate axle number ${axleNumber}`)
    seen.add(axleNumber)
    return {
      axleNumber,
      weightKg,
      group: source.group == null ? null : String(source.group).trim() || null,
    }
  })
}

function effectiveSnapshots(events: Array<{
  id: string
  stage: string
  recordedAt: Date
  grossWeightKg: number | null
  tareWeightKg: number | null
  netWeightKg: number | null
  supersedesEventId: string | null
}>): WeighingSnapshot[] {
  return events
    .filter((event): event is typeof event & { stage: WeighingStage } => STAGES.has(event.stage as WeighingStage))
    .map((event) => ({
      id: event.id,
      stage: event.stage,
      recordedAt: event.recordedAt,
      grossWeightKg: event.grossWeightKg,
      tareWeightKg: event.tareWeightKg,
      netWeightKg: event.netWeightKg,
      supersedesEventId: event.supersedesEventId,
    }))
}

function chooseRuleSets<T extends {
  code: string
  version: number
  effectiveFrom: Date
  effectiveTo: Date | null
  createdAt: Date
  isActive: boolean
}>(ruleSets: T[], occurredAt: Date): T[] {
  const byCode = new Map<string, T[]>()
  for (const ruleSet of ruleSets) {
    if (ruleSet.effectiveFrom.getTime() > occurredAt.getTime()) continue
    if (ruleSet.effectiveTo && ruleSet.effectiveTo.getTime() < occurredAt.getTime()) continue
    const bucket = byCode.get(ruleSet.code) ?? []
    bucket.push(ruleSet)
    byCode.set(ruleSet.code, bucket)
  }

  const selected: T[] = []
  for (const bucket of byCode.values()) {
    const knownAtTime = bucket.filter((ruleSet) => ruleSet.createdAt.getTime() <= occurredAt.getTime())
    const candidates = knownAtTime.length ? knownAtTime : bucket
    const winner = [...candidates].sort((a, b) => b.version - a.version)[0]
    if (winner?.isActive) selected.push(winner)
  }
  return selected
}

export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const auth = requireAuth(request)
    if (auth instanceof NextResponse) return auth

    const { id } = await params
    const trip = await db.trip.findUnique({ where: { id }, select: { id: true, tripNumber: true } })
    if (!trip) return NextResponse.json({ error: 'Trip not found' }, { status: 404 })

    const events = await db.weighingEvent.findMany({
      where: { tripId: id },
      include: { axleReadings: { orderBy: { axleNumber: 'asc' } } },
      orderBy: [{ recordedAt: 'desc' }, { createdAt: 'desc' }],
    })
    const snapshots = effectiveSnapshots(events)

    return NextResponse.json({
      trip,
      data: events,
      effective: {
        tare: selectEffectiveWeighing(snapshots, 'TARE'),
        gross: selectEffectiveWeighing(snapshots, 'GROSS'),
        axle: selectEffectiveWeighing(snapshots, 'AXLE'),
      },
    })
  } catch (error) {
    console.error('Trip weighings GET error:', error)
    return NextResponse.json({ error: 'Failed to fetch trip weighings' }, { status: 500 })
  }
}

export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const auth = requireAuth(request)
    if (auth instanceof NextResponse) return auth
    const writeGuard = requireWriteAccess(auth)
    if (writeGuard instanceof NextResponse) return writeGuard

    const { id } = await params
    const body = await request.json().catch(() => ({})) as Record<string, unknown>
    const stage = String(body.stage ?? '').toUpperCase() as WeighingStage
    const source = String(body.source ?? 'MANUAL').toUpperCase()
    if (!STAGES.has(stage)) return NextResponse.json({ error: 'Invalid weighing stage' }, { status: 400 })
    if (!SOURCES.has(source)) return NextResponse.json({ error: 'Invalid weighing source' }, { status: 400 })

    const recordedAt = parseDate(body.recordedAt, new Date())
    const inputTare = parseOptionalNumber(body.tareWeightKg, 'tareWeightKg')
    const inputGross = parseOptionalNumber(body.grossWeightKg, 'grossWeightKg')
    const tolerancePercent = Math.max(0, parseOptionalNumber(body.tolerancePercent, 'tolerancePercent') ?? 0)
    const axleReadings = parseAxles(body.axleReadings)

    const trip = await db.trip.findUnique({
      where: { id },
      include: {
        trailer: { select: { id: true, trailerType: true, axleCount: true } },
        truck: { select: { id: true } },
        driver: { select: { id: true } },
        loadOrder: { select: { shipperProfileId: true } },
      },
    })
    if (!trip) return NextResponse.json({ error: 'Trip not found' }, { status: 404 })

    const history = await db.weighingEvent.findMany({
      where: { tripId: id },
      select: {
        id: true,
        stage: true,
        recordedAt: true,
        grossWeightKg: true,
        tareWeightKg: true,
        netWeightKg: true,
        supersedesEventId: true,
      },
      orderBy: { recordedAt: 'asc' },
    })
    const snapshots = effectiveSnapshots(history)
    const latestTare = selectEffectiveWeighing(snapshots, 'TARE')
    const latestGross = selectEffectiveWeighing(snapshots, 'GROSS')

    const tareWeightKg = inputTare ?? latestTare?.tareWeightKg ?? latestGross?.tareWeightKg ?? null
    const grossWeightKg = inputGross ?? latestGross?.grossWeightKg ?? null

    if (stage === 'TARE' && tareWeightKg == null) {
      return NextResponse.json({ error: 'tareWeightKg is required for TARE weighing' }, { status: 400 })
    }
    if (['GROSS', 'AXLE', 'DESTINATION', 'ROAD_CHECK'].includes(stage) && grossWeightKg == null) {
      return NextResponse.json({ error: 'grossWeightKg or a prior GROSS weighing is required' }, { status: 400 })
    }

    const supersedesEventId = typeof body.supersedesEventId === 'string' && body.supersedesEventId.trim()
      ? body.supersedesEventId.trim()
      : null
    if (supersedesEventId) {
      const superseded = await db.weighingEvent.findFirst({ where: { id: supersedesEventId, tripId: id } })
      if (!superseded) return NextResponse.json({ error: 'Superseded weighing was not found for this trip' }, { status: 409 })
      if (superseded.stage !== stage) {
        return NextResponse.json({ error: 'A correction must supersede a weighing from the same stage' }, { status: 409 })
      }
    }

    const metrics = calculateWeightMetrics({ tareWeightKg, grossWeightKg })
    if (!metrics.valid) return NextResponse.json({ error: metrics.errors.join('; ') }, { status: 400 })

    const requiredAxleCountRaw = parseOptionalNumber(body.requiredAxleCount, 'requiredAxleCount')
    const requiredAxleCount = requiredAxleCountRaw == null
      ? Math.max(0, trip.trailer?.axleCount ?? 0)
      : Math.max(0, Math.trunc(requiredAxleCountRaw))

    const allRuleSets = await db.complianceRuleSet.findMany({
      include: { rules: true },
      orderBy: [{ code: 'asc' }, { version: 'desc' }],
    })
    const selectedRuleSets = chooseRuleSets(allRuleSets, recordedAt)
    const clearanceRules: WeightClearanceRule[] = selectedRuleSets
      .flatMap((ruleSet) => ruleSet.rules)
      .map((rule) => storedComplianceRuleToDomain(rule) as WeightClearanceRule)

    const canEvaluate = metrics.grossWeightKg != null && metrics.tareWeightKg != null
    const clearance = canEvaluate
      ? evaluateWeightClearance({
          occurredAt: recordedAt,
          grossWeightKg: metrics.grossWeightKg!,
          tareWeightKg: metrics.tareWeightKg!,
          axleReadings,
          requiredAxleCount: stage === 'TARE' ? 0 : requiredAxleCount,
          tolerancePercent,
          country: 'GH',
          shipperId: trip.loadOrder?.shipperProfileId ?? null,
          vehicleType: 'tractor',
          trailerType: trip.trailer?.trailerType ?? null,
          commodityId: trip.itemId ?? trip.itemName,
          rules: clearanceRules,
        })
      : null

    const ruleSetSnapshot = selectedRuleSets.map((ruleSet) => ({
      id: ruleSet.id,
      code: ruleSet.code,
      version: ruleSet.version,
      effectiveFrom: ruleSet.effectiveFrom,
      effectiveTo: ruleSet.effectiveTo,
    }))

    const directRuleByAxle = new Map<number, { expected: unknown; passed: boolean }>()
    const groupRule = new Map<string, { expected: unknown; passed: boolean }>()
    for (const applied of clearance?.appliedRules ?? []) {
      if (applied.type.startsWith('axle:')) {
        const axleNumber = Number(applied.type.slice('axle:'.length))
        if (Number.isInteger(axleNumber)) directRuleByAxle.set(axleNumber, applied)
      }
      if (applied.type.startsWith('axle_group:')) {
        groupRule.set(applied.type.slice('axle_group:'.length), applied)
      }
    }

    const created = await db.$transaction(async (tx) => {
      const event = await tx.weighingEvent.create({
        data: {
          tripId: id,
          tractorId: trip.truckId,
          trailerId: trip.trailerId,
          driverId: trip.driverId,
          legacyWeightVerificationId: typeof body.legacyWeightVerificationId === 'string' ? body.legacyWeightVerificationId.trim() || null : null,
          stage,
          source,
          status: clearance == null ? 'recorded' : clearance.passed ? 'passed' : 'failed',
          grossWeightKg: metrics.grossWeightKg,
          tareWeightKg: metrics.tareWeightKg,
          netWeightKg: metrics.netWeightKg,
          requiredAxleCount,
          tolerancePercent,
          ruleSetSnapshot: JSON.stringify(ruleSetSnapshot),
          clearancePassed: clearance?.passed ?? null,
          clearanceDetails: clearance ? JSON.stringify(clearance) : null,
          weighbridgeName: typeof body.weighbridgeName === 'string' ? body.weighbridgeName.trim() || null : null,
          location: typeof body.location === 'string' ? body.location.trim() || null : null,
          latitude: parseOptionalNumber(body.latitude, 'latitude'),
          longitude: parseOptionalNumber(body.longitude, 'longitude'),
          ticketNumber: typeof body.ticketNumber === 'string' ? body.ticketNumber.trim() || null : null,
          certificateNumber: typeof body.certificateNumber === 'string' ? body.certificateNumber.trim() || null : null,
          evidenceUrl: typeof body.evidenceUrl === 'string' ? body.evidenceUrl.trim() || null : null,
          operatorId: auth.userId,
          operatorName: auth.email,
          recordedAt,
          supersedesEventId,
          notes: typeof body.notes === 'string' ? body.notes.trim() || null : null,
          axleReadings: {
            create: axleReadings.map((reading) => {
              const direct = directRuleByAxle.get(reading.axleNumber)
              const grouped = reading.group ? groupRule.get(reading.group) : undefined
              const applied = direct ?? grouped
              const limit = typeof applied?.expected === 'number' ? applied.expected : Number(applied?.expected)
              return {
                axleNumber: reading.axleNumber,
                axleGroup: reading.group ?? null,
                weightKg: reading.weightKg,
                legalLimitKg: Number.isFinite(limit) ? limit : null,
                toleranceKg: Number.isFinite(limit) ? limit * (tolerancePercent / 100) : null,
                exceeded: applied ? !applied.passed : false,
              }
            }),
          },
        },
        include: { axleReadings: { orderBy: { axleNumber: 'asc' } } },
      })

      if (clearance && !clearance.passed && ['GROSS', 'AXLE', 'ROAD_CHECK'].includes(stage)) {
        await tx.trip.update({
          where: { id },
          data: {
            status: 'exception_hold',
            waitingReason: `Weight clearance failed at ${stage.toLowerCase()} stage`,
            waitingSince: new Date(),
          },
        })
      }

      return event
    }, { isolationLevel: 'Serializable' })

    createAuditLog({
      userId: auth.userId,
      action: supersedesEventId ? 'correct' : 'create',
      entity: 'WeighingEvent',
      entityId: created.id,
      details: {
        tripId: id,
        stage,
        source,
        clearancePassed: clearance?.passed ?? null,
        supersedesEventId,
      },
      ipAddress: getClientIp(request),
    }).catch(() => {})
    await appendOperationalEvent({
      idempotencyKey: `weighing-event:${created.id}`,
      eventKey: `weighing.${stage.toLowerCase()}`,
      type: supersedesEventId ? 'weighing.corrected' : 'weighing.recorded',
      entityType: 'WeighingEvent',
      entityId: created.id,
      tripId: id,
      actorType: 'user',
      actorId: auth.userId,
      occurredAt: created.recordedAt,
      latitude: created.latitude,
      longitude: created.longitude,
      evidenceRefs: created.evidenceUrl ? [created.evidenceUrl] : [],
      source: `weighing:${source.toLowerCase()}`,
      metadata: { stage, clearancePassed: clearance?.passed ?? null, grossWeightKg: created.grossWeightKg, tareWeightKg: created.tareWeightKg, netWeightKg: created.netWeightKg, supersedesWeighingEventId: supersedesEventId },
    })

    return NextResponse.json({ data: created, clearance, ruleSets: ruleSetSnapshot }, { status: 201 })
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to record weighing'
    console.error('Trip weighings POST error:', error)
    return NextResponse.json({ error: message }, { status: 400 })
  }
}
