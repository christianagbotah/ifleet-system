import { NextRequest, NextResponse } from 'next/server'
import { requireAuth } from '@/lib/auth-server'
import { db } from '@/lib/db'

// ============ Types ============

interface ActivityItem {
  id: string
  type: 'audit' | 'trip_event' | 'notification'
  title: string
  description: string
  timestamp: string
  userName?: string
  action?: string
  entity?: string
  entityType?: string
  entityId?: string
  link?: string
  details?: string
  ipAddress?: string
}

// ============ In-memory Cache (30 seconds) ============

let cachedActivities: ActivityItem[] | null = null
let cachedAt = 0
const CACHE_TTL = 30_000 // 30 seconds

// ============ Action Label Mapping ============

function actionLabel(action: string): string {
  switch (action) {
    case 'create': return 'Created'
    case 'update': return 'Updated'
    case 'delete': return 'Deleted'
    case 'login': return 'Logged In'
    default: return action.charAt(0).toUpperCase() + action.slice(1)
  }
}

// ============ Entity Label Resolution ============

async function resolveEntityLabel(entity: string, entityId: string | null | undefined): Promise<string> {
  if (!entityId) return entity
  try {
    switch (entity) {
      case 'Truck': {
        const truck = await db.truck.findUnique({
          where: { id: entityId },
          select: { plateNumber: true, make: true, model: true },
        })
        return truck ? `${truck.plateNumber} (${truck.make} ${truck.model})` : entityId.slice(0, 8)
      }
      case 'Driver': {
        const driver = await db.driver.findUnique({
          where: { id: entityId },
          select: { firstName: true, lastName: true },
        })
        return driver ? `${driver.firstName} ${driver.lastName}` : entityId.slice(0, 8)
      }
      case 'Trip': {
        const trip = await db.trip.findUnique({
          where: { id: entityId },
          select: { tripNumber: true },
        })
        return trip ? trip.tripNumber : entityId.slice(0, 8)
      }
      case 'Expense': {
        const expense = await db.expense.findUnique({
          where: { id: entityId },
          select: { description: true, category: true },
        })
        return expense ? `${expense.category}: ${expense.description}` : entityId.slice(0, 8)
      }
      case 'FuelLog': {
        return `Fuel Entry ${entityId.slice(0, 8)}`
      }
      case 'MaintenanceRecord': {
        const record = await db.maintenanceRecord.findUnique({
          where: { id: entityId },
          select: { title: true, type: true },
        })
        return record ? `${record.type}: ${record.title}` : entityId.slice(0, 8)
      }
      case 'Tyre': {
        const tyre = await db.tyre.findUnique({
          where: { id: entityId },
          select: { serialNumber: true, brand: true },
        })
        return tyre ? `${tyre.brand} (${tyre.serialNumber})` : entityId.slice(0, 8)
      }
      case 'Insurance': {
        const insurance = await db.insurance.findUnique({
          where: { id: entityId },
          select: { policyNumber: true, provider: true },
        })
        return insurance ? `${insurance.provider} - ${insurance.policyNumber}` : entityId.slice(0, 8)
      }
      case 'Payroll': {
        const payroll = await db.payroll.findUnique({
          where: { id: entityId },
          select: { month: true, year: true },
        })
        return payroll ? `Payroll ${payroll.year}-${String(payroll.month).padStart(2, '0')}` : entityId.slice(0, 8)
      }
      case 'Client': {
        const client = await db.client.findUnique({
          where: { id: entityId },
          select: { companyName: true },
        })
        return client ? client.companyName : entityId.slice(0, 8)
      }
      case 'User': {
        const user = await db.user.findUnique({
          where: { id: entityId },
          select: { name: true },
        })
        return user ? user.name : entityId.slice(0, 8)
      }
      default:
        return `${entity} ${entityId.slice(0, 8)}`
    }
  } catch {
    return `${entity} ${entityId.slice(0, 8)}`
  }
}

// ============ Human-readable status names ============

function formatTripStatus(status: string): string {
  return status
    .replace(/_/g, ' ')
    .replace(/\b\w/g, c => c.toUpperCase())
}

// ============ GET Handler ============

export async function GET(request: NextRequest) {
  const auth = requireAuth(request)
  if (auth instanceof NextResponse) return auth

  // Check cache
  const now = Date.now()
  if (cachedActivities && now - cachedAt < CACHE_TTL) {
    return NextResponse.json(cachedActivities)
  }

  try {
    // Fetch from all three sources in parallel
    const [auditLogs, tripEvents, notifications] = await Promise.all([
      // Source 1: AuditLog entries (last 20, excluding login events)
      db.auditLog.findMany({
        where: {
          action: { not: 'login' },
        },
        include: {
          user: {
            select: { id: true, name: true, avatar: true },
          },
        },
        orderBy: { createdAt: 'desc' },
        take: 20,
      }),

      // Source 2: TripEvent entries (last 10) with user name
      db.tripEvent.findMany({
        include: {
          trip: {
            select: { id: true, tripNumber: true },
          },
        },
        orderBy: { createdAt: 'desc' },
        take: 10,
      }),

      // Source 3: Notification entries (last 10, unread first)
      db.notification.findMany({
        where: {
          userId: auth.userId,
        },
        include: {
          user: {
            select: { id: true, name: true, avatar: true },
          },
        },
        orderBy: [
          { isRead: 'asc' },
          { createdAt: 'desc' },
        ],
        take: 10,
      }),
    ])

    // Resolve user names for trip events in bulk
    const tripEventUserIds = [...new Set(tripEvents.map(e => e.userId).filter(Boolean))] as string[]
    const tripEventUsers = tripEventUserIds.length > 0
      ? await db.user.findMany({
          where: { id: { in: tripEventUserIds } },
          select: { id: true, name: true },
        })
      : []
    const userMap = new Map(tripEventUsers.map(u => [u.id, u.name]))

    // Build activity items from audit logs
    const auditActivities: ActivityItem[] = await Promise.all(
      auditLogs.map(async (log) => {
        const entityLabel = await resolveEntityLabel(log.entity, log.entityId)
        const actionVerb = actionLabel(log.action)
        const title = `${actionVerb} ${log.entity}`
        const description = `${entityLabel !== log.entity ? entityLabel : ''}`.trim()

        return {
          id: `audit-${log.id}`,
          type: 'audit' as const,
          title,
          description: description || `${log.user?.name || 'Unknown'} ${actionVerb.toLowerCase()} ${log.entity}`,
          action: log.action,
          entity: log.entity,
          entityType: log.entity.toLowerCase(),
          entityId: log.entityId ?? undefined,
          userName: log.user?.name || 'Unknown User',
          timestamp: log.createdAt.toISOString(),
          details: log.details ?? undefined,
          ipAddress: log.ipAddress ?? undefined,
        }
      })
    )

    // Build activity items from trip events
    const tripEventActivities: ActivityItem[] = tripEvents.map((event) => {
      const userName = event.userId ? (userMap.get(event.userId) || 'System') : 'System'
      const tripNumber = event.trip?.tripNumber || event.tripId.slice(0, 8)
      const toStatusFormatted = formatTripStatus(event.toStatus)

      return {
        id: `trip-event-${event.id}`,
        type: 'trip_event' as const,
        title: `Trip ${tripNumber}: ${toStatusFormatted}`,
        description: event.notes || `Status changed from ${event.fromStatus ? formatTripStatus(event.fromStatus) : 'unknown'}`,
        action: `trip_${event.toStatus}`,
        entity: 'Trip',
        entityType: 'trip',
        entityId: event.tripId,
        userName,
        timestamp: event.createdAt.toISOString(),
        link: 'trips',
      }
    })

    // Build activity items from notifications
    const notificationActivities: ActivityItem[] = notifications.map((notification) => {
      const messagePreview = notification.message.length > 80
        ? notification.message.slice(0, 80) + '...'
        : notification.message

      return {
        id: `notification-${notification.id}`,
        type: 'notification' as const,
        title: notification.title,
        description: messagePreview,
        entity: 'Notification',
        entityType: 'notification',
        entityId: notification.id,
        userName: notification.user?.name,
        timestamp: notification.createdAt.toISOString(),
        link: notification.link || undefined,
      }
    })

    // Merge all activities
    const allActivities: ActivityItem[] = [
      ...auditActivities,
      ...tripEventActivities,
      ...notificationActivities,
    ]

    // Sort by timestamp descending
    allActivities.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime())

    // Take top 25
    const activities = allActivities.slice(0, 25)

    // Update cache
    cachedActivities = activities
    cachedAt = Date.now()

    return NextResponse.json(activities)
  } catch (error) {
    console.error('[Activity Feed] Error fetching activities:', error)
    return NextResponse.json(
      { error: 'Failed to fetch activity feed' },
      { status: 500 }
    )
  }
}
