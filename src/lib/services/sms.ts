// ════════════════════════════════════════════════════════════════════
// ${APP_NAME} — SMS Service (Hubtel API Integration)
// ════════════════════════════════════════════════════════════════════
//
// Hubtel REST API:
//   Endpoint: POST https://api.hubtel.com/v1/messages/send
//   Auth: Basic base64(clientId:clientSecret)
//   Body: { From, To, Content }
//
// Environment Variables:
//   HUBTEL_CLIENT_ID   — Hubtel API client ID
//   HUBTEL_API_SECRET  — Hubtel API client secret
// ────────────────────────────────────────────────────────────────────

import { APP_SMS_SENDER } from '@/lib/constants'

const HUBTEL_ENDPOINT = 'https://api.hubtel.com/v1/messages/send'
const SENDER_NAME = APP_SMS_SENDER

interface SMSResult {
  success: boolean
  messageId?: string
  error?: string
}

interface TripSMSParams {
  to: string
  tripNumber: string
  status: string
  message: string
  driverName?: string
  tripId?: string
}

/**
 * Format a Ghana phone number to E.164 format (+233XXXXXXXXX).
 * Accepts formats like: 0245678901, 233245678901, +233245678901, +233 24 567 8901
 */
export function formatGhanaPhone(phone: string): string {
  // Remove all whitespace and non-digit characters except leading +
  let cleaned = phone.trim().replace(/[\s()-]/g, '')

  // If starts with +233, strip the + for normalization
  if (cleaned.startsWith('+233')) {
    cleaned = cleaned.slice(1) // Remove +, keep 233...
  }
  // If starts with 233 (without +)
  else if (cleaned.startsWith('233') && cleaned.length >= 12) {
    // Already in international format without +, keep as is
  }
  // If starts with 0 (local Ghana format like 024...)
  else if (cleaned.startsWith('0')) {
    cleaned = '233' + cleaned.slice(1) // Replace 0 with 233
  }

  // Ensure it starts with +233
  if (!cleaned.startsWith('+233')) {
    cleaned = '+233' + cleaned
  }

  // Validate: should be +233 followed by 9-10 digits
  const digitCount = cleaned.replace('+', '').length
  if (digitCount < 12 || digitCount > 13) {
    console.warn(`[SMS] Invalid Ghana phone number format: ${phone} → formatted as ${cleaned}`)
  }

  return cleaned
}

/**
 * Send an SMS via the Hubtel API.
 * Returns success/failure without throwing.
 */
export async function sendSMS(params: {
  to: string
  message: string
  tripId?: string
}): Promise<SMSResult> {
  const clientId = process.env.HUBTEL_CLIENT_ID
  const apiSecret = process.env.HUBTEL_API_SECRET

  if (!clientId || !apiSecret) {
    console.warn(
      '[SMS] Hubtel credentials not configured (HUBTEL_CLIENT_ID / HUBTEL_API_SECRET). ' +
      'SMS sending is disabled. Set environment variables to enable.'
    )
    return { success: false, error: 'SMS credentials not configured' }
  }

  const formattedTo = formatGhanaPhone(params.to)

  // Validate message length (SMS limit is 160 chars for standard, 70 for Unicode)
  if (params.message.length > 1600) {
    console.warn(`[SMS] Message is very long (${params.message.length} chars). May be split into multiple parts.`)
  }

  try {
    // Build Basic Auth header
    const credentials = Buffer.from(`${clientId}:${apiSecret}`).toString('base64')

    console.log(`[SMS] Sending SMS to ${formattedTo}${params.tripId ? ` for trip ${params.tripId}` : ''}`)
    console.log(`[SMS] Message: ${params.message.substring(0, 100)}${params.message.length > 100 ? '...' : ''}`)

    const response = await fetch(HUBTEL_ENDPOINT, {
      method: 'POST',
      headers: {
        'Authorization': `Basic ${credentials}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        From: SENDER_NAME,
        To: formattedTo,
        Content: params.message,
      }),
    })

    if (!response.ok) {
      const errorBody = await response.text()
      console.error(`[SMS] Hubtel API error (${response.status}): ${errorBody}`)
      return { success: false, error: `API error ${response.status}: ${errorBody}` }
    }

    const result = await response.json()

    // Hubtel returns { status, messageId, ... } on success
    if (result.status === 0 || result.messageId) {
      console.log(`[SMS] SMS sent successfully. MessageId: ${result.messageId || 'N/A'}`)
      return { success: true, messageId: result.messageId }
    }

    // Hubtel may return a non-zero status for failures
    console.error(`[SMS] Hubtel returned non-success status: ${JSON.stringify(result)}`)
    return { success: false, error: `Hubtel status: ${result.status || 'unknown'}` }
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error'
    console.error(`[SMS] Failed to send SMS: ${errorMessage}`)
    return { success: false, error: errorMessage }
  }
}

/**
 * Convenience function for trip-related SMS messages.
 * Builds an SMS-friendly message with trip context and sends it.
 */
export async function sendTripSMS(params: TripSMSParams): Promise<SMSResult> {
  // Build SMS-friendly short message (under 160 chars when possible)
  const prefix = params.driverName ? `Hi ${params.driverName}, ` : ''
  let smsMessage: string

  // Try to keep it under 160 characters for single-part SMS
  const shortMessage = `${prefix}${params.message}`
  if (shortMessage.length <= 160) {
    smsMessage = shortMessage
  } else {
    // For longer messages, include trip number for reference
    smsMessage = `${prefix}${params.message} [${params.tripNumber}]`
  }

  return sendSMS({
    to: params.to,
    message: smsMessage,
    tripId: params.tripId,
  })
}
