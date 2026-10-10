import { createAuditLog } from '@/lib/audit'

import type { VideoAccessAudit, VideoAccessAuditEvent } from './access'

export function createVideoAccessAudit(
  userId: string,
  ipAddress: string | null,
): VideoAccessAudit {
  return async (event: VideoAccessAuditEvent) => {
    await createAuditLog({
      userId,
      action: 'access',
      entity: 'VideoAccess',
      entityId: event.deviceId,
      details: {
        action: event.action,
        channelKey: event.channelKey,
        outcome: event.outcome,
        reason: event.reason ?? null,
      },
      ipAddress,
    })
  }
}
