import { db } from '@/lib/db'
import { NextRequest } from 'next/server'

export interface AuditParams {
  userId: string
  action:
    | 'create'
    | 'update'
    | 'delete'
    | 'login'
    | 'logout'
    | 'status_change'
    | 'password_change'
    | 'role_change'
    | 'export'
    | 'settings_change'
    | 'approval'
    | 'rejection'
  entity: string // 'Truck', 'Driver', 'Trip', etc.
  entityId?: string | null
  details?: Record<string, unknown> | null
  ipAddress?: string | null
}

/**
 * Create an audit log entry.
 * Designed to be called fire-and-forget (without await) so it never blocks the main flow.
 */
export async function createAuditLog(params: AuditParams) {
  try {
    await db.auditLog.create({
      data: {
        userId: params.userId,
        action: params.action,
        entity: params.entity,
        entityId: params.entityId || null,
        details: params.details ? JSON.stringify(params.details) : null,
        ipAddress: params.ipAddress || null,
      },
    })
  } catch (error) {
    // Audit log should never break the main flow
    console.error('[AUDIT] Failed to write audit log:', error)
  }
}

/**
 * Extract the client IP address from request headers.
 */
export function getClientIp(request: NextRequest): string {
  return (
    request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ||
    request.headers.get('x-real-ip') ||
    'unknown'
  )
}
