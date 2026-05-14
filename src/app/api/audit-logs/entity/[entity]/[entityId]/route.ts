import { NextRequest, NextResponse } from 'next/server'
import { requireAuth } from '@/lib/auth-server'
import { db } from '@/lib/db'

// ============ Entity Label Resolution ============

async function resolveEntityLabel(entity: string, entityId: string): Promise<string> {
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
        return `Fuel Entry ${entityId.slice(0, 8)}`
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

// ============ Value Label Resolution ============

async function resolveValueLabel(field: string, value: string | null | undefined): Promise<string> {
  if (value === null || value === undefined) return '(empty)'
  if (value === '') return '(empty)'

  // Resolve foreign key references to human-readable labels
  const driverIdFields = ['driverId', 'assignedDriver']
  const truckIdFields = ['truckId']
  const userIdFields = ['userId', 'createdBy', 'updatedBy', 'approvedBy', 'verifiedBy']
  const clientIdFields = ['clientId', 'customerId']

  if (driverIdFields.includes(field) && value) {
    const driver = await db.driver.findUnique({
      where: { id: value },
      select: { firstName: true, lastName: true },
    })
    return driver ? `${driver.firstName} ${driver.lastName}` : value
  }

  if (truckIdFields.includes(field) && value) {
    const truck = await db.truck.findUnique({
      where: { id: value },
      select: { plateNumber: true, make: true, model: true },
    })
    return truck ? `${truck.plateNumber} (${truck.make} ${truck.model})` : value
  }

  if (userIdFields.includes(field) && value) {
    const user = await db.user.findUnique({
      where: { id: value },
      select: { name: true },
    })
    return user ? user.name : value
  }

  if (clientIdFields.includes(field) && value) {
    const client = await db.client.findUnique({
      where: { id: value },
      select: { companyName: true },
    })
    return client ? client.companyName : value
  }

  return value
}

// ============ GET Handler ============

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ entity: string; entityId: string }> }
) {
  const auth = requireAuth(request)
  if (auth instanceof NextResponse) return auth

  const { entity, entityId } = await params

  // Validate entity name (basic safety check)
  const validEntities = [
    'Truck', 'Driver', 'Trip', 'Expense', 'FuelLog', 'MaintenanceRecord',
    'Tyre', 'Insurance', 'Payroll', 'DriverSettlement', 'Client', 'Pricing',
    'User', 'Document', 'Invoice', 'DeliveryStop', 'FuelBudget',
    'DvlaRegistration', 'RoadworthyInspection', 'GeofenceZone',
    'TrackingConfig', 'ReportHistory', 'Role', 'SystemSettings',
  ]
  if (!validEntities.includes(entity)) {
    return NextResponse.json({ error: `Invalid entity type: ${entity}` }, { status: 400 })
  }

  // Fetch ALL audit logs for this entity
  const logs = await db.auditLog.findMany({
    where: {
      entity,
      entityId,
    },
    include: {
      user: {
        select: { id: true, name: true, email: true },
      },
    },
    orderBy: { createdAt: 'asc' }, // Chronological for timeline
  })

  // Resolve entity label
  const entityLabel = await resolveEntityLabel(entity, entityId)

  // Process logs into timeline format
  const processedLogs = await Promise.all(
    logs.map(async (log) => {
      let details: Record<string, unknown> = {}
      try {
        details = log.details ? JSON.parse(log.details) : {}
      } catch {
        details = {}
      }

      // Extract changes
      const rawChanges = (details.changes as Record<string, { old?: string | null; new?: string | null }>) || {}
      const changes = await Promise.all(
        Object.entries(rawChanges).map(async ([field, vals]) => ({
          field,
          oldValue: await resolveValueLabel(field, vals.old ?? null),
          newValue: await resolveValueLabel(field, vals.new ?? null),
        }))
      )

      // Extract metadata (everything except 'changes')
      const metadata: Record<string, unknown> = {}
      for (const [key, value] of Object.entries(details)) {
        if (key !== 'changes') {
          metadata[key] = value
        }
      }

      return {
        id: log.id,
        timestamp: log.createdAt.toISOString(),
        action: log.action,
        user: {
          id: log.user?.id || log.userId,
          name: log.user?.name || 'Unknown User',
          email: log.user?.email || '',
        },
        changes,
        metadata,
        ipAddress: log.ipAddress,
      }
    })
  )

  // Build statistics
  const modifiedBy = [...new Set(processedLogs.map((l) => l.user.name))]
  const fieldChangeCount: Record<string, number> = {}
  for (const log of processedLogs) {
    for (const change of log.changes) {
      fieldChangeCount[change.field] = (fieldChangeCount[change.field] || 0) + 1
    }
  }

  // Sort field change count descending
  const sortedFieldChangeCount: Record<string, number> = {}
  Object.entries(fieldChangeCount)
    .sort(([, a], [, b]) => b - a)
    .forEach(([k, v]) => { sortedFieldChangeCount[k] = v })

  const statistics = {
    totalChanges: logs.length,
    lastModified: logs.length > 0 ? logs[logs.length - 1].createdAt.toISOString() : null,
    modifiedBy,
    fieldChangeCount: sortedFieldChangeCount,
  }

  return NextResponse.json({
    entity,
    entityId,
    entityLabel,
    logs: processedLogs,
    statistics,
  })
}
