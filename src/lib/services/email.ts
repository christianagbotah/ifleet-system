// ════════════════════════════════════════════════════════════════════
// iFleetPro — Email Service (Nodemailer)
// ════════════════════════════════════════════════════════════════════
//
// Environment Variables:
//   SMTP_HOST   — SMTP server hostname (e.g., smtp.gmail.com)
//   SMTP_PORT   — SMTP server port (e.g., 587)
//   SMTP_USER   — SMTP authentication username
//   SMTP_PASS   — SMTP authentication password
//   SMTP_FROM   — Sender email address (e.g., noreply@fleetpro.com.gh)
// ────────────────────────────────────────────────────────────────────

import nodemailer from 'nodemailer'
import { APP_NAME, APP_COMPANY, APP_TAGLINE } from '@/lib/constants'

interface EmailResult {
  success: boolean
  messageId?: string
  error?: string
}

interface TripDetails {
  tripNumber: string
  driverName: string
  truckPlate: string
  loadingLocation: string
  destination: string
  itemName: string
  quantity: number
  unit: string
  departureTime: string
  status: string
  customerName?: string | null
}

interface TripEmailParams {
  to: string
  subject: string
  title: string
  message: string
  tripDetails: TripDetails
  actionLabel?: string
  actionUrl?: string
  tripId?: string
}

// ── Lazy-initialized transporter ──
let transporter: nodemailer.Transporter | null = null

function getTransporter(): nodemailer.Transporter | null {
  if (transporter) return transporter

  const host = process.env.SMTP_HOST
  const port = process.env.SMTP_PORT
  const user = process.env.SMTP_USER
  const pass = process.env.SMTP_PASS

  if (!host || !port || !user || !pass) {
    console.warn(
      '[Email] SMTP not fully configured (need SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASS). ' +
      'Email sending is disabled. Set environment variables to enable.'
    )
    return null
  }

  const portNum = parseInt(port, 10)
  const isSecure = portNum === 465

  transporter = nodemailer.createTransport({
    host,
    port: portNum,
    secure: isSecure,
    auth: { user, pass },
    // Connection timeout for slow servers
    connectionTimeout: 10000,
    greetingTimeout: 5000,
    socketTimeout: 15000,
  })

  return transporter
}

// ════════════════════════════════════════════════════════════════════
// HTML EMAIL TEMPLATES
// ════════════════════════════════════════════════════════════════════

/**
 * Generate a professional HTML email with ${APP_NAME} branding.
 * Uses amber/orange theme colors consistent with the brand.
 */
function buildHtmlEmail(params: {
  title: string
  messageHtml: string
  tripDetailsHtml?: string
  actionLabel?: string
  actionUrl?: string
}): string {
  const { title, messageHtml, tripDetailsHtml, actionLabel, actionUrl } = params

  const now = new Date().toLocaleDateString('en-GH', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
    timeZone: 'Africa/Accra',
  })

  const actionBlock = actionLabel && actionUrl ? `
    <tr>
      <td style="padding: 24px 0 8px 0; text-align: center;">
        <a href="${actionUrl}"
           style="display: inline-block; background-color: #d97706; color: #ffffff; padding: 12px 32px;
                  border-radius: 8px; text-decoration: none; font-weight: 600; font-size: 14px;
                  letter-spacing: 0.025em;">
          ${actionLabel}
        </a>
      </td>
    </tr>
  ` : ''

  const tripBlock = tripDetailsHtml ? `
    <tr>
      <td style="padding: 16px 0 0 0;">
        ${tripDetailsHtml}
      </td>
    </tr>
  ` : ''

  return `<!DOCTYPE html>
<html lang="en" xmlns="http://www.w3.org/1999/xhtml">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>${title}</title>
  <!--[if mso]>
  <noscript>
    <xml>
      <o:OfficeDocumentSettings>
        <o:PixelsPerInch>96</o:PixelsPerInch>
      </o:OfficeDocumentSettings>
    </xml>
  </noscript>
  <![endif]-->
</head>
<body style="margin: 0; padding: 0; background-color: #f3f4f6; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif;">
  <!-- Preheader (hidden text for email clients) -->
  <div style="display: none; max-height: 0; overflow: hidden; mso-hide: all;">
    ${title} - ${APP_NAME} ${APP_TAGLINE}
  </div>

  <!-- Outer wrapper -->
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background-color: #f3f4f6; padding: 20px 0;">
    <tr>
      <td align="center" style="padding: 20px 16px;">

        <!-- Inner container -->
        <table role="presentation" width="600" cellpadding="0" cellspacing="0" style="background-color: #ffffff; border-radius: 12px; overflow: hidden; box-shadow: 0 1px 3px rgba(0,0,0,0.1); max-width: 600px; width: 100%;">

          <!-- Amber header bar -->
          <tr>
            <td style="background: linear-gradient(135deg, #d97706, #b45309); padding: 28px 32px; text-align: center;">
              <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
                <tr>
                  <td>
                    <h1 style="margin: 0; font-size: 24px; font-weight: 700; color: #ffffff; letter-spacing: -0.025em;">
                      ${APP_NAME}
                    </h1>
                    <p style="margin: 4px 0 0 0; font-size: 13px; color: rgba(255,255,255,0.85); font-weight: 400;">
                      ${APP_TAGLINE}
                    </p>
                  </td>
                </tr>
              </table>
            </td>
          </tr>

          <!-- Title section -->
          <tr>
            <td style="padding: 28px 32px 8px 32px;">
              <h2 style="margin: 0; font-size: 20px; font-weight: 600; color: #111827;">
                ${title}
              </h2>
              <p style="margin: 4px 0 0 0; font-size: 13px; color: #9ca3af;">
                ${now}
              </p>
            </td>
          </tr>

          <!-- Divider -->
          <tr>
            <td style="padding: 0 32px;">
              <hr style="border: none; border-top: 1px solid #e5e7eb; margin: 16px 0;" />
            </td>
          </tr>

          <!-- Message body -->
          <tr>
            <td style="padding: 0 32px;">
              <p style="margin: 0; font-size: 15px; line-height: 1.6; color: #374151;">
                ${messageHtml}
              </p>
            </td>
          </tr>

          <!-- Trip details card (if provided) -->
          ${tripBlock}

          <!-- Action button (if provided) -->
          ${actionBlock}

          <!-- Spacer -->
          <tr>
            <td style="padding: 24px 0 0 0;"></td>
          </tr>

          <!-- Footer -->
          <tr>
            <td style="background-color: #f9fafb; padding: 20px 32px; border-top: 1px solid #e5e7eb;">
              <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
                <tr>
                  <td style="text-align: center;">
                    <p style="margin: 0 0 4px 0; font-size: 13px; font-weight: 600; color: #374151;">
                      ${APP_COMPANY}
                    </p>
                    <p style="margin: 0 0 2px 0; font-size: 12px; color: #6b7280;">
                      37 Ring Road Central, Accra, Ghana
                    </p>
                    <p style="margin: 0 0 2px 0; font-size: 12px; color: #6b7280;">
                      +233 30 277 8899 &nbsp;|&nbsp; info@fleetpro.com.gh
                    </p>
                    <p style="margin: 8px 0 0 0; font-size: 11px; color: #9ca3af;">
                      This is an automated message from ${APP_NAME}. Please do not reply directly to this email.
                    </p>
                  </td>
                </tr>
              </table>
            </td>
          </tr>

        </table>
        <!-- /Inner container -->

      </td>
    </tr>
  </table>
</body>
</html>`
}

/**
 * Build an HTML card showing trip details.
 */
function buildTripDetailsCard(trip: TripDetails): string {
  const statusColors: Record<string, string> = {
    scheduled: '#0ea5e9',
    loading: '#f59e0b',
    loaded: '#eab308',
    waiting_at_depot: '#f97316',
    departed_depot: '#84cc16',
    in_transit: '#10b981',
    arrived_destination: '#14b8a6',
    waiting_to_offload: '#f97316',
    offloading: '#8b5cf6',
    offloaded: '#6366f1',
    return_journey: '#f43f5e',
    arrived_depot: '#06b6d4',
    completed: '#6b7280',
  }

  const statusColor = statusColors[trip.status] || '#6b7280'
  const formattedDate = new Date(trip.departureTime).toLocaleDateString('en-GH', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    timeZone: 'Africa/Accra',
  })

  return `
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0"
         style="background-color: #fffbeb; border: 1px solid #fde68a; border-radius: 8px; margin-top: 20px; overflow: hidden;">
    <tr>
      <td style="padding: 16px 20px; background-color: #fef3c7; border-bottom: 1px solid #fde68a;">
        <p style="margin: 0; font-size: 13px; font-weight: 600; color: #92400e;">
          Trip Details
        </p>
      </td>
    </tr>
    <tr>
      <td style="padding: 16px 20px;">
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
          <tr>
            <td style="padding: 4px 0; font-size: 13px; color: #6b7280; width: 40%; vertical-align: top;">Trip Number</td>
            <td style="padding: 4px 0; font-size: 13px; color: #111827; font-weight: 600; vertical-align: top;">${trip.tripNumber}</td>
          </tr>
          <tr>
            <td style="padding: 4px 0; font-size: 13px; color: #6b7280; vertical-align: top;">Status</td>
            <td style="padding: 4px 0; font-size: 13px; font-weight: 600; vertical-align: top;">
              <span style="display: inline-block; background-color: ${statusColor}; color: #ffffff; padding: 2px 10px; border-radius: 12px; font-size: 11px; text-transform: uppercase; letter-spacing: 0.05em;">
                ${trip.status.replace(/_/g, ' ')}
              </span>
            </td>
          </tr>
          <tr>
            <td style="padding: 4px 0; font-size: 13px; color: #6b7280; vertical-align: top;">Driver</td>
            <td style="padding: 4px 0; font-size: 13px; color: #111827; vertical-align: top;">${trip.driverName}</td>
          </tr>
          <tr>
            <td style="padding: 4px 0; font-size: 13px; color: #6b7280; vertical-align: top;">Truck</td>
            <td style="padding: 4px 0; font-size: 13px; color: #111827; vertical-align: top;">${trip.truckPlate}</td>
          </tr>
          <tr>
            <td style="padding: 4px 0; font-size: 13px; color: #6b7280; vertical-align: top;">Route</td>
            <td style="padding: 4px 0; font-size: 13px; color: #111827; vertical-align: top;">${trip.loadingLocation} → ${trip.destination}</td>
          </tr>
          <tr>
            <td style="padding: 4px 0; font-size: 13px; color: #6b7280; vertical-align: top;">Cargo</td>
            <td style="padding: 4px 0; font-size: 13px; color: #111827; vertical-align: top;">${trip.itemName} (${trip.quantity.toLocaleString()} ${trip.unit})</td>
          </tr>
          <tr>
            <td style="padding: 4px 0; font-size: 13px; color: #6b7280; vertical-align: top;">Departure</td>
            <td style="padding: 4px 0; font-size: 13px; color: #111827; vertical-align: top;">${formattedDate}</td>
          </tr>
          ${trip.customerName ? `
          <tr>
            <td style="padding: 4px 0; font-size: 13px; color: #6b7280; vertical-align: top;">Customer</td>
            <td style="padding: 4px 0; font-size: 13px; color: #111827; vertical-align: top;">${trip.customerName}</td>
          </tr>
          ` : ''}
        </table>
      </td>
    </tr>
  </table>`
}

/**
 * Strip HTML tags to produce a plain-text fallback.
 */
function stripHtml(html: string): string {
  return html
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/p>/gi, '\n')
    .replace(/<\/tr>/gi, '\n')
    .replace(/<\/td>/gi, ' ')
    .replace(/<[^>]+>/g, '')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/\n{3,}/g, '\n\n')
    .trim()
}

// ════════════════════════════════════════════════════════════════════
// PUBLIC API
// ════════════════════════════════════════════════════════════════════

/**
 * Send an email using nodemailer.
 * Returns success/failure without throwing.
 */
export async function sendEmail(params: {
  to: string
  subject: string
  html: string
  text?: string
}): Promise<EmailResult> {
  const tp = getTransporter()
  if (!tp) {
    return { success: false, error: 'SMTP not configured' }
  }

  const from = process.env.SMTP_FROM || 'noreply@fleetpro.com.gh'

  try {
    console.log(`[Email] Sending email to ${params.to}: "${params.subject}"`)

    const info = await tp.sendMail({
      from: `"${APP_NAME}" <${from}>`,
      to: params.to,
      subject: params.subject,
      html: params.html,
      text: params.text || stripHtml(params.html),
      headers: {
        'X-iFleetPro-Notification': 'true',
        'X-Priority': '3', // Normal priority
      },
    })

    console.log(`[Email] Email sent successfully. MessageId: ${info.messageId}`)
    return { success: true, messageId: info.messageId }
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error'
    console.error(`[Email] Failed to send email: ${errorMessage}`)
    return { success: false, error: errorMessage }
  }
}

/**
 * Convenience function for trip-related emails.
 * Uses the ${APP_NAME} branded HTML template with trip details card.
 */
export async function sendTripEmail(params: TripEmailParams): Promise<EmailResult> {
  const tripDetailsHtml = buildTripDetailsCard(params.tripDetails)

  const html = buildHtmlEmail({
    title: params.title,
    messageHtml: params.message,
    tripDetailsHtml,
    actionLabel: params.actionLabel,
    actionUrl: params.actionUrl,
  })

  const plainText = [
    params.title,
    '─'.repeat(40),
    params.message.replace(/<[^>]+>/g, ''),
    '',
    'TRIP DETAILS',
    '─'.repeat(40),
    `Trip: ${params.tripDetails.tripNumber}`,
    `Driver: ${params.tripDetails.driverName}`,
    `Truck: ${params.tripDetails.truckPlate}`,
    `Route: ${params.tripDetails.loadingLocation} → ${params.tripDetails.destination}`,
    `Cargo: ${params.tripDetails.itemName} (${params.tripDetails.quantity.toLocaleString()} ${params.tripDetails.unit})`,
    '',
    '─'.repeat(40),
    APP_COMPANY,
    '37 Ring Road Central, Accra, Ghana',
    '+233 30 277 8899 | info@fleetpro.com.gh',
  ].join('\n')

  return sendEmail({
    to: params.to,
    subject: params.subject,
    html,
    text: plainText,
  })
}
