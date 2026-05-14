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
        return NextResponse.json({ error: 'Cannot create more than 100 zones at once' }, { status: 400 })
      }

      let success = 0
      let failed = 0
      const errors: { index: number; message: string }[] = []

      for (let i = 0; i < items.length; i++) {
        const item = items[i]
        const name = typeof item.name === 'string' ? item.name.trim() : ''
        const destinationCityId = typeof item.destinationCityId === 'string' ? item.destinationCityId : ''

        if (!name) {
          failed++
          errors.push({ index: i, message: 'Zone name is required' })
          continue
        }
        if (!destinationCityId) {
          failed++
          errors.push({ index: i, message: 'Destination city ID is required' })
          continue
        }

        // Validate city exists
        const city = await db.destinationCity.findUnique({ where: { id: destinationCityId } })
        if (!city) {
          failed++
          errors.push({ index: i, message: `City "${destinationCityId}" not found` })
          continue
        }

        // Check uniqueness
        const existing = await db.destinationZone.findUnique({
          where: { name_destinationCityId: { name, destinationCityId } },
        })
        if (existing) {
          failed++
          errors.push({ index: i, message: `Zone "${name}" already exists in ${city.name}` })
          continue
        }

        try {
          await db.destinationZone.create({
            data: {
              name,
              destinationCityId,
              isActive: item.isActive !== false,
            },
          })
          success++

          createAuditLog({
            userId: auth.userId,
            action: 'create',
            entity: 'DestinationZone',
            details: { name, destinationCityId, cityName: city.name, bulk: true },
            ipAddress: getClientIp(request),
          }).catch(() => {})
        } catch {
          failed++
          errors.push({ index: i, message: `Failed to create zone "${name}"` })
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
        return NextResponse.json({ error: 'Cannot update more than 100 zones at once' }, { status: 400 })
      }

      let success = 0
      let failed = 0
      const errors: { index: number; message: string }[] = []

      for (let i = 0; i < items.length; i++) {
        const item = items[i]
        const id = typeof item.id === 'string' ? item.id : ''

        if (!id) {
          failed++
          errors.push({ index: i, message: 'Zone ID is required' })
          continue
        }

        const existing = await db.destinationZone.findUnique({ where: { id } })
        if (!existing) {
          failed++
          errors.push({ index: i, message: `Zone "${id}" not found` })
          continue
        }

        const data: Record<string, unknown> = {}
        const changes: Record<string, unknown> = {}

        if (typeof item.name === 'string' && item.name.trim() && item.name.trim() !== existing.name) {
          // Check uniqueness if name changed
          const checkCityId = (typeof item.destinationCityId === 'string' && item.destinationCityId) || existing.destinationCityId
          const duplicate = await db.destinationZone.findUnique({
            where: { name_destinationCityId: { name: item.name.trim(), destinationCityId: checkCityId } },
          })
          if (duplicate) {
            failed++
            errors.push({ index: i, message: `Zone "${item.name.trim()}" already exists in this city` })
            continue
          }
          data.name = item.name.trim()
          changes.name = { from: existing.name, to: item.name.trim() }
        }

        if (typeof item.destinationCityId === 'string' && item.destinationCityId && item.destinationCityId !== existing.destinationCityId) {
          const city = await db.destinationCity.findUnique({ where: { id: item.destinationCityId } })
          if (!city) {
            failed++
            errors.push({ index: i, message: `City "${item.destinationCityId}" not found` })
            continue
          }
          data.destinationCityId = item.destinationCityId
          changes.destinationCityId = { from: existing.destinationCityId, to: item.destinationCityId }
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
          await db.destinationZone.update({ where: { id }, data })
          success++

          createAuditLog({
            userId: auth.userId,
            action: 'update',
            entity: 'DestinationZone',
            entityId: id,
            details: { ...changes, bulk: true },
            ipAddress: getClientIp(request),
          }).catch(() => {})
        } catch {
          failed++
          errors.push({ index: i, message: `Failed to update zone "${existing.name}"` })
        }
      }

      return NextResponse.json({ success, failed, errors })
    }

    // ── BULK DELETE (soft) ──
    if (action === 'delete') {
      if (!Array.isArray(ids) || ids.length === 0) {
        return NextResponse.json({ error: 'ids must be a non-empty array' }, { status: 400 })
      }
      if (ids.length > 100) {
        return NextResponse.json({ error: 'Cannot delete more than 100 zones at once' }, { status: 400 })
      }

      const zones = await db.destinationZone.findMany({
        where: { id: { in: ids } },
        select: { id: true, name: true, isActive: true },
      })

      let success = 0
      let failed = 0
      const errors: { id: string; message: string }[] = []

      for (const id of ids) {
        const zone = zones.find(z => z.id === id)
        if (!zone) {
          failed++
          errors.push({ id, message: 'Zone not found' })
          continue
        }
        if (!zone.isActive) {
          failed++
          errors.push({ id, message: `"${zone.name}" is already inactive` })
          continue
        }

        try {
          await db.destinationZone.update({
            where: { id },
            data: { isActive: false },
          })
          success++

          createAuditLog({
            userId: auth.userId,
            action: 'delete',
            entity: 'DestinationZone',
            entityId: id,
            details: { name: zone.name, softDeleted: true, bulk: true },
            ipAddress: getClientIp(request),
          }).catch(() => {})
        } catch {
          failed++
          errors.push({ id, message: `Failed to delete zone "${zone.name}"` })
        }
      }

      return NextResponse.json({ success, failed, errors })
    }

    return NextResponse.json({ error: 'Invalid action' }, { status: 400 })
  } catch (error) {
    console.error('Bulk destination zones error:', error)
    return NextResponse.json({ error: 'Failed to perform bulk action on destination zones' }, { status: 500 })
  }
}
