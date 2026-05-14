/**
 * Structured logger — gates debug output behind NODE_ENV.
 *
 * Usage:
 *   import { logger } from '@/lib/logger'
 *   logger.info('Trip created', { tripId: '123' })
 *   logger.error('Failed to save', err)
 *
 * In production, only `error` and `warn` are emitted.
 * `debug` / `info` are silently dropped.
 */

type LogPayload = Record<string, unknown> | unknown[] | string | number | null | undefined

const isDev = process.env.NODE_ENV !== 'production'

function formatMessage(msg: string, payload?: LogPayload): string {
  if (payload === undefined) return msg
  try {
    return `${msg} ${JSON.stringify(payload)}`
  } catch {
    return `${msg} [unserializable payload]`
  }
}

export const logger = {
  debug(msg: string, payload?: LogPayload) {
    if (isDev) console.debug(`[DEBUG] ${formatMessage(msg, payload)}`)
  },
  info(msg: string, payload?: LogPayload) {
    if (isDev) console.info(`[INFO] ${formatMessage(msg, payload)}`)
  },
  warn(msg: string, payload?: LogPayload) {
    console.warn(`[WARN] ${formatMessage(msg, payload)}`)
  },
  error(msg: string, payload?: LogPayload) {
    console.error(`[ERROR] ${formatMessage(msg, payload)}`)
  },
}
