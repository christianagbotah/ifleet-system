import { NextRequest, NextResponse } from 'next/server'

import { ROLES, requireRole } from '@/lib/auth-server'
import { db } from '@/lib/db'
import { computeDeviceHealth } from '@/lib/domain/telematics/device-health'

export async function GET(request: NextRequest) {
  const auth = requireRole(request, [ROLES.ADMIN, ROLES.MANAGER])
  if (auth instanceof NextResponse) return auth

  try {
    const devices = await db.telematicsDevice.findMany({
      orderBy: [{ status: 'asc' }, { name: 'asc' }],
      select: {
        id: true,
        name: true,
        provider: true,
        deviceType: true,
        status: true,
        lastSeenAt: true,
      },
    })

    const now = new Date()
    const data = await Promise.all(
      devices.map(async (device) => {
        const latestEvents = await db.telematicsEvent.findMany({
          where: { deviceId: device.id },
          orderBy: { receivedAt: 'desc' },
          take: 5,
          select: {
            eventType: true,
            receivedAt: true,
            alarmType: true,
          },
        })

        const health = computeDeviceHealth({
          status: device.status,
          lastSeenAt: device.lastSeenAt,
          latestEvents: latestEvents.map((event) => ({
            eventType: event.eventType,
            occurredAt: event.receivedAt,
            alarmType: event.alarmType,
          })),
        }, now)

        return {
          ...device,
          health,
        }
      }),
    )

    return NextResponse.json({ data, generatedAt: now.toISOString() })
  } catch (error) {
    console.error('[Telematics Health] Failed to load device health:', error)
    return NextResponse.json({ error: 'Failed to load telematics device health' }, { status: 500 })
  }
}
