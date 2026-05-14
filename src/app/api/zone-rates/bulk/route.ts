import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { requireAuth, requireWriteAccess } from '@/lib/auth-server'
import { createAuditLog, getClientIp } from '@/lib/audit'

const VALID_ACTIONS = ['create', 'update', 'delete'] as const

export async function POST(request: NextRequest) {
  try {
    const auth = requireAuth(request)
    if (auth instanceof NextResponse) return auth
    const writeGuard = requireWriteAccess(auth)
    if (writeGuard instanceof NextResponse) return writeGuard

    const body = await request.json()
    const { action, items, ids } = body as {
      action?: string
      items?: Array<Record<string, unknown>>
      ids?: string[]
    }

    if (!VALID_ACTIONS.includes(action as typeof VALID_ACTIONS[number])) {
      return NextResponse.json(
        { error: `Invalid action. Must be one of: ${VALID_ACTIONS.join(', ')}` },
        { status: 400 }
      )
    }

    // ── BULK CREATE ──
    if (action === 'create') {
      if (!Array.isArray(items) || items.length === 0) {
        return NextResponse.json({ error: 'items must be a non-empty array' }, { status: 400 })
      }
      if (items.length > 100) {
        return NextResponse.json({ error: 'Cannot create more than 100 rates at once' }, { status: 400 })
      }

      let success = 0
      let failed = 0
      const errors: { index: number; message: string }[] = []

      for (let i = 0; i < items.length; i++) {
        const item = items[i]
        const destinationZoneId = typeof item.destinationZoneId === 'string' ? item.destinationZoneId : ''
        const rateAmount = item.rateAmount !== undefined && item.rateAmount !== null ? parseFloat(String(item.rateAmount)) : NaN

        if (!destinationZoneId) {
          failed++
          errors.push({ index: i, message: 'Destination zone ID is required' })
          continue
        }
        if (isNaN(rateAmount) || rateAmount < 0) {
          failed++
          errors.push({ index: i, message: 'Valid rate amount is required' })
          continue
        }

        const zone = await db.destinationZone.findUnique({ where: { id: destinationZoneId } })
        if (!zone) {
          failed++
          errors.push({ index: i, message: `Zone "${destinationZoneId}" not found` })
          continue
        }

        try {
          await db.zoneRate.create({
            data: {
              destinationZoneId,
              rateAmount,
              minMileage: item.minMileage != null ? parseFloat(String(item.minMileage)) : null,
              maxMileage: item.maxMileage != null ? parseFloat(String(item.maxMileage)) : null,
              expectedFuelConsumption: item.expectedFuelConsumption != null ? parseFloat(String(item.expectedFuelConsumption)) : null,
              effectiveDate: item.effectiveDate ? new Date(String(item.effectiveDate)) : new Date(),
              isActive: item.isActive !== false,
            },
          })
          success++

          createAuditLog({
            userId: auth.userId,
            action: 'create',
            entity: 'ZoneRate',
            details: { rateAmount, destinationZoneId, zoneName: zone.name, bulk: true },
            ipAddress: getClientIp(request),
          }).catch(() => {})
        } catch {
          failed++
          errors.push({ index: i, message: `Failed to create rate for zone "${zone.name}"` })
        }
      }

      return NextResponse.json({ success, failed, errors })
    }

    // ── BULK UPDATE ──
    if (action === 'update') {
      if (!Array.isArray(items) || items.length === 0) {
        return NextResponse.json({ error: 'items must be a non-empty array' }, { status: 400 })
      }
      if (items.length > 100) {
        return NextResponse.json({ error: 'Cannot update more than 100 rates at once' }, { status: 400 })
      }

      let success = 0
      let failed = 0
      const errors: { index: number; message: string }[] = []

      for (let i = 0; i < items.length; i++) {
        const item = items[i]
        const id = typeof item.id === 'string' ? item.id : ''

        if (!id) {
          failed++
          errors.push({ index: i, message: 'Rate ID is required' })
          continue
        }

        const existing = await db.zoneRate.findUnique({ where: { id } })
        if (!existing) {
          failed++
          errors.push({ index: i, message: `Rate "${id}" not found` })
          continue
        }

        const data: Record<string, unknown> = {}
        const changes: Record<string, unknown> = {}

        if (item.rateAmount !== undefined && item.rateAmount !== null) {
          const parsed = parseFloat(String(item.rateAmount))
          if (!isNaN(parsed) && parsed >= 0 && parsed !== existing.rateAmount) {
            data.rateAmount = parsed
            changes.rateAmount = { from: existing.rateAmount, to: parsed }
          }
        }

        if (item.minMileage !== undefined) {
          const parsed = item.minMileage !== null ? parseFloat(String(item.minMileage)) : null
          if (parsed !== existing.minMileage) {
            data.minMileage = parsed
            changes.minMileage = { from: existing.minMileage, to: parsed }
          }
        }

        if (item.maxMileage !== undefined) {
          const parsed = item.maxMileage !== null ? parseFloat(String(item.maxMileage)) : null
          if (parsed !== existing.maxMileage) {
            data.maxMileage = parsed
            changes.maxMileage = { from: existing.maxMileage, to: parsed }
          }
        }

        if (item.expectedFuelConsumption !== undefined) {
          const parsed = item.expectedFuelConsumption !== null ? parseFloat(String(item.expectedFuelConsumption)) : null
          if (parsed !== existing.expectedFuelConsumption) {
            data.expectedFuelConsumption = parsed
            changes.expectedFuelConsumption = { from: existing.expectedFuelConsumption, to: parsed }
          }
        }

        if (item.effectiveDate !== undefined) {
          const newVal = item.effectiveDate ? new Date(String(item.effectiveDate)) : new Date()
          data.effectiveDate = newVal
          changes.effectiveDate = { from: existing.effectiveDate, to: item.effectiveDate || 'today' }
        }

        if (typeof item.isActive === 'boolean' && item.isActive !== existing.isActive) {
          data.isActive = item.isActive
          changes.isActive = { from: existing.isActive, to: item.isActive }
        }

        if (Object.keys(data).length === 0) {
          failed++
          errors.push({ index: i, message: 'No changes to apply' })
          continue
        }

        try {
          await db.zoneRate.update({ where: { id }, data })
          success++

          createAuditLog({
            userId: auth.userId,
            action: 'update',
            entity: 'ZoneRate',
            entityId: id,
            details: { ...changes, bulk: true },
            ipAddress: getClientIp(request),
          }).catch(() => {})
        } catch {
          failed++
          errors.push({ index: i, message: `Failed to update rate "${id}"` })
        }
      }

      return NextResponse.json({ success, failed, errors })
    }

    // ── BULK DELETE (hard) ──
    if (action === 'delete') {
      if (!Array.isArray(ids) || ids.length === 0) {
        return NextResponse.json({ error: 'ids must be a non-empty array' }, { status: 400 })
      }
      if (ids.length > 100) {
        return NextResponse.json({ error: 'Cannot delete more than 100 rates at once' }, { status: 400 })
      }

      const rates = await db.zoneRate.findMany({
        where: { id: { in: ids } },
        select: { id: true, rateAmount: true, destinationZoneId: true },
      })

      let success = 0
      let failed = 0
      const errors: { id: string; message: string }[] = []

      for (const id of ids) {
        const rate = rates.find(r => r.id === id)
        if (!rate) {
          failed++
          errors.push({ id, message: 'Rate not found' })
          continue
        }

        try {
          await db.zoneRate.delete({ where: { id } })
          success++

          createAuditLog({
            userId: auth.userId,
            action: 'delete',
            entity: 'ZoneRate',
            entityId: id,
            details: { rateAmount: rate.rateAmount, destinationZoneId: rate.destinationZoneId, bulk: true },
            ipAddress: getClientIp(request),
          }).catch(() => {})
        } catch {
          failed++
          errors.push({ id, message: 'Failed to delete rate' })
        }
      }

      return NextResponse.json({ success, failed, errors })
    }

    return NextResponse.json({ error: 'Invalid action' }, { status: 400 })
  } catch (error) {
    console.error('Bulk zone rates error:', error)
    return NextResponse.json({ error: 'Failed to perform bulk action on zone rates' }, { status: 500 })
  }
}
