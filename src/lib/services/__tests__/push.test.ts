import { describe, expect, it } from 'vitest'
import { createPushEvent, emitPush, registerPushListener } from '@/lib/services/push'

describe('SSE push delivery evidence', () => {
  it('reports zero deliveries when the target user has no active listener', () => {
    const count = emitPush('no-listener-user', createPushEvent({
      type: 'trip_departed',
      title: 'Trip departed',
      message: 'Trip departed',
    }))

    expect(count).toBe(0)
  })

  it('counts only callbacks that successfully receive the event', () => {
    const received: string[] = []
    const unsubscribeGood = registerPushListener('listener-user', (event) => received.push(event.type))
    const unsubscribeBad = registerPushListener('listener-user', () => { throw new Error('client disconnected') })

    try {
      const count = emitPush('listener-user', createPushEvent({
        type: 'trip_departed',
        title: 'Trip departed',
        message: 'Trip departed',
      }))

      expect(count).toBe(1)
      expect(received).toEqual(['trip_departed'])
    } finally {
      unsubscribeGood()
      unsubscribeBad()
    }
  })
})
