import { NextRequest, NextResponse } from 'next/server'
import { requireAuth } from '@/lib/auth-server'
import { db } from '@/lib/db'
import { Prisma } from '@/generated/client'

// ============ Entity Label Resolution ============

async function resolveEntityLabel(entity: string, entityId: string | null): Promise<string> {
  if (!entityId) return entity

  try {
    switch (entity) {
      case 'Truck': {
        const truck = await db.truck.findUnique({
          where: { id: entityId },
          select: { plateNumber: true, make: true, model: true },
        })
        return truck ? `${truck.plateNumber} (${truck.make} ${truck.model})` : entityId
      }
      case 'Driver': {
        const driver = await db.driver.findUnique({
          where: { id: entityId },
          select: { firstName: true, lastName: true },
        })
        return driver ? `${driver.firstName} ${driver.lastName}` : entityId
      }
      case 'Trip': {
        const trip = await db.trip.findUnique({
          where: { id: entityId },
          select: { tripNumber: true },
        })
        return trip ? trip.tripNumber : entityId
      }
      case 'Expense': {
        const expense = await db.expense.findUnique({
          where: { id: entityId },
          select: { description: true, category: true },
        })
        return expense ? `${expense.category}: ${expense.description}` : entityId
      }
      case 'FuelLog': {
        const fuelLog = await db.fuelLog.findUnique({
          where: { id: entityId },
          select: { id: true },
        })
        return fuelLog ? `Fuel Entry ${entityId.slice(0, 8)}` : entityId
      }
      case 'MaintenanceRecord': {
        const record = await db.maintenanceRecord.findUnique({
          where: { id: entityId },
          select: { title: true, type: true },
        })
        return record ? `${record.type}: ${record.title}` : entityId
      }
      case 'Tyre': {
        const tyre = await db.tyre.findUnique({
          where: { id: entityId },
          select: { serialNumber: true, brand: true },
        })
        return tyre ? `${tyre.brand} (${tyre.serialNumber})` : entityId
      }
      case 'Insurance': {
        const insurance = await db.insurance.findUnique({
          where: { id: entityId },
          select: { policyNumber: true, provider: true },
        })
        return insurance ? `${insurance.provider} - ${insurance.policyNumber}` : entityId
      }
      case 'Payroll': {
        const payroll = await db.payroll.findUnique({
          where: { id: entityId },
          select: { month: true, year: true },
        })
        return payroll ? `Payroll ${payroll.year}-${String(payroll.month).padStart(2, '0')}` : entityId
      }
      case 'DriverSettlement': {
        const settlement = await db.driverSettlement.findUnique({
          where: { id: entityId },
          select: { period: true },
        })
        return settlement ? `Settlement ${settlement.period}` : entityId
      }
      case 'Client': {
        const client = await db.client.findUnique({
          where: { id: entityId },
          select: { companyName: true },
        })
        return client ? client.companyName : entityId
      }
      case 'Pricing': {
        const pricing = await db.pricing.findUnique({
          where: { id: entityId },
          select: { itemName: true, destination: true },
        })
        return pricing ? `${pricing.itemName} → ${pricing.destination}` : entityId
      }
      case 'User': {
        const user = await db.user.findUnique({
          where: { id: entityId },
          select: { name: true },
        })
        return user ? user.name : entityId
      }
      case 'Document': {
        const doc = await db.document.findUnique({
          where: { id: entityId },
          select: { title: true },
        })
        return doc ? doc.title : entityId
      }
      case 'Invoice': {
        const invoice = await db.invoice.findUnique({
          where: { id: entityId },
          select: { invoiceNumber: true },
        })
        return invoice ? invoice.invoiceNumber : entityId
      }
      case 'DeliveryStop': {
        return `Delivery Stop ${entityId.slice(0, 8)}`
      }
      case 'FuelBudget': {
        return `Fuel Budget ${entityId.slice(0, 8)}`
      }
      case 'DvlaRegistration': {
        const dvla = await db.dvlaRegistration.findUnique({
          where: { id: entityId },
          select: { registrationNumber: true },
        })
        return dvla ? `DVLA ${dvla.registrationNumber}` : entityId
      }
      case 'RoadworthyInspection': {
        const rw = await db.roadworthyInspection.findUnique({
          where: { id: entityId },
          select: { certificateNumber: true },
        })
        return rw ? `Roadworthy ${rw.certificateNumber}` : entityId
      }
      default:
        return `${entity} ${entityId.slice(0, 8)}`
    }
  } catch {
    return `${entity} ${entityId.slice(0, 8)}`
  }
}

// ============ GET Handler ============

export async function GET(request: NextRequest) {
  const auth = requireAuth(request)
  if (auth instanceof NextResponse) return auth

  const { searchParams } = new URL(request.url)

  // Parse filters
  const entity = searchParams.get('entity') || undefined
  const entityId = searchParams.get('entityId') || undefined
  const userId = searchParams.get('userId') || undefined
  const action = searchParams.get('action') || undefined
  const dateFrom = searchParams.get('dateFrom') || undefined
  const dateTo = searchParams.get('dateTo') || undefined
  const page = Math.max(1, parseInt(searchParams.get('page') || '1', 10))
  const limit = Math.min(100, Math.max(1, parseInt(searchParams.get('limit') || '20', 10)))

  // Build where clause
  const where: Prisma.AuditLogWhereInput = {}
  if (entity) where.entity = entity
  if (entityId) where.entityId = entityId
  if (userId) where.userId = userId
  if (action) where.action = action
  if (dateFrom || dateTo) {
    where.createdAt = {}
    if (dateFrom) where.createdAt.gte = new Date(dateFrom)
    if (dateTo) where.createdAt.lte = new Date(dateTo)
  }

  // Fetch total count
  const total = await db.auditLog.count({ where })

  // Fetch paginated results
  const logs = await db.auditLog.findMany({
    where,
    include: {
      user: {
        select: { id: true, name: true, email: true },
      },
    },
    orderBy: { createdAt: 'desc' },
    skip: (page - 1) * limit,
    take: limit,
  })

  // Resolve entity labels for all logs
  const data = await Promise.all(
    logs.map(async (log) => {
      let details: Record<string, unknown> = {}
      try {
        details = log.details ? JSON.parse(log.details) : {}
      } catch {
        details = {}
      }

      const entityLabel = await resolveEntityLabel(log.entity, log.entityId)

      return {
        id: log.id,
        userId: log.userId,
        userName: log.user?.name || 'Unknown User',
        userEmail: log.user?.email || '',
        action: log.action,
        entity: log.entity,
        entityId: log.entityId,
        entityLabel,
        details,
        ipAddress: log.ipAddress,
        createdAt: log.createdAt.toISOString(),
      }
    })
  )

  // Build summary stats
  const [byEntity, byAction, todayCount, allLogsForUsers] = await Promise.all([
    // Count by entity
    db.auditLog.groupBy({
      by: ['entity'],
      where: dateFrom || dateTo
        ? {
            createdAt: {
              ...(dateFrom ? { gte: new Date(dateFrom) } : {}),
              ...(dateTo ? { lte: new Date(dateTo) } : {}),
            },
          }
        : undefined,
      _count: { id: true },
      orderBy: { _count: { id: 'desc' } },
    }),
    // Count by action
    db.auditLog.groupBy({
      by: ['action'],
      where: dateFrom || dateTo
        ? {
            createdAt: {
              ...(dateFrom ? { gte: new Date(dateFrom) } : {}),
              ...(dateTo ? { lte: new Date(dateTo) } : {}),
            },
          }
        : undefined,
      _count: { id: true },
      orderBy: { _count: { id: 'desc' } },
    }),
    // Count today
    db.auditLog.count({
      where: {
        createdAt: {
          gte: new Date(new Date().setHours(0, 0, 0, 0)),
        },
      },
    }),
    // Get most active user in the period
    db.auditLog.groupBy({
      by: ['userId'],
      where: dateFrom || dateTo
        ? {
            createdAt: {
              ...(dateFrom ? { gte: new Date(dateFrom) } : {}),
              ...(dateTo ? { lte: new Date(dateTo) } : {}),
            },
          }
        : undefined,
      _count: { id: true },
      orderBy: { _count: { id: 'desc' } },
      take: 1,
    }),
  ])

  // Resolve most active user name
  let mostActiveUser = ''
  if (allLogsForUsers.length > 0) {
    const topUser = await db.user.findUnique({
      where: { id: allLogsForUsers[0].userId },
      select: { name: true },
    })
    mostActiveUser = topUser?.name || 'Unknown'
  }

  // Find most active entity
  const mostActiveEntity = byEntity.length > 0 ? byEntity[0].entity : 'N/A'

  const summary = {
    byEntity: Object.fromEntries(byEntity.map((e) => [e.entity, e._count.id])),
    byAction: Object.fromEntries(byAction.map((a) => [a.action, a._count.id])),
    todayCount,
    mostActiveUser,
    mostActiveEntity,
  }

  return NextResponse.json({
    data,
    total,
    page,
    limit,
    summary,
  })
}
